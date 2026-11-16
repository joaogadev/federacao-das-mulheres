import { canvasBlob } from './engine';
import { pdfFromJpegs } from './pdf';

export type ExportPage = {
  blob: Blob;
  width: number;
  height: number;
  text?: string;
};

async function asJpeg(page: ExportPage, quality: number) {
  const bitmap = await createImageBitmap(page.blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = page.width;
    canvas.height = page.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas indisponível para exportação.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    const blob = await canvasBlob(canvas, 'image/jpeg', quality);
    canvas.width = canvas.height = 0;
    return blob;
  } finally {
    bitmap.close();
  }
}

export async function visualPdf(
  pages: ExportPage[],
  quality: number,
): Promise<Blob> {
  const images = [];
  for (const page of pages) {
    const jpeg = await asJpeg(page, quality);
    images.push({
      jpeg: new Uint8Array(await jpeg.arrayBuffer()),
      width: page.width,
      height: page.height,
    });
  }
  const bytes = await pdfFromJpegs(images);
  return new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' });
}

export async function imageExport(
  page: ExportPage,
  format: 'png' | 'jpg',
  quality: number,
) {
  return format === 'png' ? page.blob : asJpeg(page, quality);
}

export function textExport(pages: ExportPage[]) {
  const content = pages
    .map(
      (page, index) =>
        `Página ${index + 1}\n${page.text ?? '[OCR não executado nesta página]'}`,
    )
    .join('\n\n---\n\n');
  return new Blob([content], { type: 'text/plain;charset=utf-8' });
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
