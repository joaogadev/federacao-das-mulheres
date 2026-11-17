import { PDFDocument } from 'pdf-lib';

export type PdfImagePage = { jpeg: Uint8Array; width: number; height: number };

export async function pdfFromJpegs(pages: PdfImagePage[]): Promise<Uint8Array> {
  if (!pages.length)
    throw new Error('Digitalize ao menos uma página antes de gerar o PDF.');
  const pdf = await PDFDocument.create();
  for (const page of pages) {
    const embedded = await pdf.embedJpg(page.jpeg);
    const ratio = page.width / page.height;
    const width = ratio > 1 ? 842 : 595;
    const height = width / ratio;
    const pdfPage = pdf.addPage([width, height]);
    pdfPage.drawImage(embedded, { x: 0, y: 0, width, height });
  }
  return pdf.save();
}
