import { createWorker, type Word } from 'tesseract.js';

export type OcrWord = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};
export type OcrResult = { text: string; confidence: number; words: OcrWord[] };

export async function recognizePortuguese(
  image: Blob,
  progress: (message: string) => void,
): Promise<OcrResult> {
  progress('Carregando OCR em português…');
  const worker = await createWorker('por', 1, {
    workerPath: `${window.location.origin}/ocr/worker.min.js`,
    corePath: `${window.location.origin}/ocr/core`,
    langPath: `${window.location.origin}/ocr/`,
    logger: (event) => {
      if (typeof event.progress === 'number')
        progress(`OCR: ${Math.round(event.progress * 100)}%`);
    },
  });
  try {
    const { data } = await worker.recognize(
      image,
      {},
      { text: true, blocks: true },
    );
    const words: OcrWord[] = (data.blocks || [])
      .flatMap((block) =>
        block.paragraphs.flatMap((paragraph) =>
          paragraph.lines.flatMap((line) => line.words),
        ),
      )
      .filter((word: Word) => word.text.trim())
      .map((word: Word) => ({
        text: word.text,
        confidence: word.confidence,
        bbox: word.bbox,
      }));
    return { text: data.text || '', confidence: data.confidence, words };
  } finally {
    await worker.terminate();
  }
}
