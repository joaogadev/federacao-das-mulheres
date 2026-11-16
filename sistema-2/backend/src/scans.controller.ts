import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth';
import { DocumentUploadGuard } from './documents.controller';
import { Database } from './prisma.service';

const idSchema = z.string().uuid();
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(100).default(''),
});
const createSchema = z.object({
  title: z.string().trim().max(160).optional(),
  pageCount: z.coerce.number().int().min(1).max(12),
  ocrText: z.string().max(200_000).optional(),
});

@ApiTags('scans')
@ApiCookieAuth()
@Controller('scans')
export class ScansController {
  constructor(
    private readonly db: Database,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lista digitalizações salvas sem transferir os PDFs',
  })
  async list(@Req() req: Request, @Query() query: unknown) {
    await this.auth.require(req);
    const parsed = querySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Filtros inválidos');
    const { page, limit, search } = parsed.data;
    const where = search
      ? { title: { contains: search, mode: 'insensitive' as const } }
      : {};
    const [total, items] = await this.db.$transaction([
      this.db.scannedDocument.count({ where }),
      this.db.scannedDocument.findMany({
        where,
        select: {
          id: true,
          title: true,
          pageCount: true,
          sizeBytes: true,
          createdAt: true,
          uploadedBy: { select: { email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { items, total, page, limit };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Metadados e texto OCR da digitalização' })
  async detail(@Req() req: Request, @Param('id') id: string) {
    await this.auth.require(req);
    if (!idSchema.safeParse(id).success)
      throw new BadRequestException('ID inválido');
    const record = await this.db.scannedDocument.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        pageCount: true,
        sizeBytes: true,
        sha256: true,
        ocrText: true,
        createdAt: true,
        uploadedBy: { select: { email: true } },
      },
    });
    if (!record) throw new NotFoundException('Digitalização não encontrada');
    return record;
  }

  @Get(':id/file')
  @ApiOperation({ summary: 'PDF privado da digitalização; exige sessão' })
  async file(
    @Req() req: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.require(req);
    if (!idSchema.safeParse(id).success)
      throw new BadRequestException('ID inválido');
    const record = await this.db.scannedDocument.findUnique({
      where: { id },
      select: { content: true },
    });
    if (!record) throw new NotFoundException('Digitalização não encontrada');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="digitalizacao-${id}.pdf"`,
    );
    return new StreamableFile(Buffer.from(record.content), {
      type: 'application/pdf',
    });
  }

  @Post()
  @UseGuards(DocumentUploadGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 30 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiOperation({ summary: 'Salva PDF digitalizado sem formulário pessoal' })
  @ApiConsumes('multipart/form-data')
  @ApiHeader({ name: 'X-CSRF-Token' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'pageCount'],
      properties: {
        file: { type: 'string', format: 'binary' },
        pageCount: { type: 'integer' },
        title: { type: 'string' },
        ocrText: { type: 'string' },
      },
    },
  })
  async create(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const session = await this.auth.require(req, 'ADMIN', true);
    const parsed = createSchema.safeParse(body || {});
    if (!parsed.success)
      throw new BadRequestException('Dados da digitalização inválidos');
    if (
      !file?.buffer?.length ||
      file.buffer.length > 30 * 1024 * 1024 ||
      file.buffer.subarray(0, 5).toString() !== '%PDF-' ||
      !file.buffer.subarray(-2048).includes(Buffer.from('%%EOF'))
    ) {
      throw new BadRequestException('Envie um PDF válido de até 30 MB');
    }
    const title =
      parsed.data.title ||
      `Digitalização de ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Maceio' })}`;
    const record = await this.db.$transaction(async (tx) => {
      const created = await tx.scannedDocument.create({
        data: {
          title,
          pageCount: parsed.data.pageCount,
          sizeBytes: file.buffer.length,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          content: Uint8Array.from(file.buffer),
          ocrText: parsed.data.ocrText || null,
          uploadedById: session.userId,
        },
        select: { id: true, title: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'SCAN_CREATED',
          entityType: 'ScannedDocument',
          entityId: created.id,
        },
      });
      return created;
    });
    return record;
  }
}
