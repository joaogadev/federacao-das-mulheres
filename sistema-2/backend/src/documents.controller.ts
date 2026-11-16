import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
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
import { basename } from 'node:path';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Database } from './prisma.service';
import { AuthService } from './auth';

const uuid = z.string().uuid();
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(100).default(''),
  status: z.enum(['PENDENTE', 'CONFERIDO', 'DIVERGENTE']).optional(),
});
const createSchema = z.object({
  title: z.string().trim().min(3).max(160),
  kind: z.string().trim().min(2).max(80),
  subjectName: z.string().trim().min(2).max(160),
  subjectIdentifier: z.string().trim().max(80).optional(),
  issueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  notes: z.string().trim().max(2000).optional(),
});
const reviewSchema = z
  .object({
    status: z.enum(['CONFERIDO', 'DIVERGENTE']),
    note: z.string().trim().max(2000).default(''),
  })
  .refine((v) => v.status !== 'DIVERGENTE' || v.note.length >= 3, {
    message: 'Explique a divergência em pelo menos três caracteres.',
  });

function detectMime(buffer: Buffer): string | null {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return 'image/jpeg';
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (
    buffer.subarray(0, 4).toString() === 'RIFF' &&
    buffer.subarray(8, 12).toString() === 'WEBP'
  )
    return 'image/webp';
  if (buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  return null;
}

@Injectable()
export class DocumentUploadGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    await this.auth.require(
      context.switchToHttp().getRequest<Request>(),
      'ADMIN',
      true,
    );
    return true;
  }
}

@ApiTags('documents')
@ApiCookieAuth()
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly db: Database,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista documentos privados sem retornar o arquivo' })
  async list(@Req() req: Request, @Query() query: unknown) {
    await this.auth.require(req);
    const parsed = listSchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Filtros inválidos');
    const { page, limit, search, status } = parsed.data;
    const where = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' as const } },
              {
                subjectName: { contains: search, mode: 'insensitive' as const },
              },
              {
                subjectIdentifier: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
    const [total, items] = await this.db.$transaction([
      this.db.documentRecord.count({ where }),
      this.db.documentRecord.findMany({
        where,
        select: {
          id: true,
          title: true,
          kind: true,
          subjectName: true,
          subjectIdentifier: true,
          mimeType: true,
          sizeBytes: true,
          status: true,
          createdAt: true,
          reviewedAt: true,
          uploadedBy: { select: { email: true } },
          reviewedBy: { select: { email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { items, total, page, limit };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Metadados e conferência de um documento privado' })
  async detail(@Req() req: Request, @Param('id') id: string) {
    await this.auth.require(req);
    if (!uuid.safeParse(id).success)
      throw new BadRequestException('ID inválido');
    const record = await this.db.documentRecord.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        kind: true,
        subjectName: true,
        subjectIdentifier: true,
        issueDate: true,
        notes: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        sha256: true,
        status: true,
        reviewNote: true,
        createdAt: true,
        reviewedAt: true,
        uploadedBy: { select: { email: true } },
        reviewedBy: { select: { email: true } },
      },
    });
    if (!record) throw new NotFoundException('Documento não encontrado');
    return record;
  }

  @Get(':id/file')
  @ApiOperation({ summary: 'Arquivo privado; exige sessão' })
  async file(
    @Req() req: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.require(req);
    if (!uuid.safeParse(id).success)
      throw new BadRequestException('ID inválido');
    const record = await this.db.documentRecord.findUnique({
      where: { id },
      select: { content: true, mimeType: true },
    });
    if (!record) throw new NotFoundException('Documento não encontrado');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', record.mimeType);
    res.setHeader(
      'Content-Disposition',
      record.mimeType === 'application/pdf'
        ? 'attachment; filename="documento.pdf"'
        : 'inline',
    );
    return new StreamableFile(Buffer.from(record.content), {
      type: record.mimeType,
    });
  }

  @Post()
  @UseGuards(DocumentUploadGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiOperation({
    summary:
      'Digitaliza foto ou anexa imagem/PDF com formulário de conferência',
  })
  @ApiConsumes('multipart/form-data')
  @ApiHeader({ name: 'X-CSRF-Token' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'title', 'kind', 'subjectName'],
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        kind: { type: 'string' },
        subjectName: { type: 'string' },
        subjectIdentifier: { type: 'string' },
        issueDate: { type: 'string', format: 'date' },
        notes: { type: 'string' },
      },
    },
  })
  async create(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const session = await this.auth.require(req, 'ADMIN', true);
    const normalized = Object.fromEntries(
      Object.entries(body || {}).map(([key, value]) => [
        key,
        value === '' ? undefined : value,
      ]),
    );
    const parsed = createSchema.safeParse(normalized);
    if (!parsed.success)
      throw new BadRequestException('Revise os campos do formulário');
    if (!file?.buffer?.length)
      throw new BadRequestException('Selecione uma foto, imagem ou PDF');
    const mimeType = detectMime(file.buffer);
    if (!mimeType)
      throw new BadRequestException(
        'Formato inválido. Use JPEG, PNG, WebP ou PDF',
      );
    const issueDate = parsed.data.issueDate
      ? new Date(`${parsed.data.issueDate}T12:00:00.000Z`)
      : undefined;
    if (
      issueDate &&
      issueDate.toISOString().slice(0, 10) !== parsed.data.issueDate
    )
      throw new BadRequestException('Data do documento inválida');
    const originalName =
      basename(file.originalname.replaceAll('\\', '/')).slice(0, 180) ||
      'documento';
    const record = await this.db.$transaction(async (tx) => {
      const created = await tx.documentRecord.create({
        data: {
          ...parsed.data,
          issueDate,
          originalName,
          mimeType,
          sizeBytes: file.buffer.length,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          content: Uint8Array.from(file.buffer),
          uploadedById: session.userId,
        },
        select: { id: true, status: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'DOCUMENT_CREATED',
          entityType: 'DocumentRecord',
          entityId: created.id,
        },
      });
      return created;
    });
    return record;
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'Registra conferência manual; exige ADMIN e CSRF' })
  @ApiHeader({ name: 'X-CSRF-Token' })
  async review(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const session = await this.auth.require(req, 'ADMIN', true);
    const parsed = reviewSchema.safeParse(body);
    if (!uuid.safeParse(id).success || !parsed.success)
      throw new BadRequestException('Conferência inválida');
    const result = await this.db.$transaction(async (tx) => {
      const updated = await tx.documentRecord.updateMany({
        where: { id, status: 'PENDENTE' },
        data: {
          status: parsed.data.status,
          reviewNote: parsed.data.note || null,
          reviewedById: session.userId,
          reviewedAt: new Date(),
        },
      });
      if (!updated.count)
        throw new BadRequestException('Documento inexistente ou já conferido');
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'DOCUMENT_REVIEWED',
          entityType: 'DocumentRecord',
          entityId: id,
          details: { status: parsed.data.status, note: parsed.data.note },
        },
      });
      return { ok: true };
    });
    return result;
  }
}
