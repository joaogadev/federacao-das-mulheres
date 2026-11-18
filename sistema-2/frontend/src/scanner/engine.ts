import type { Aspect, Quad } from './geometry';

export type ScanMode = 'auto' | 'original' | 'gray' | 'bw';
export type Rotation = 0 | 90 | 180 | 270;
export type Detection = {
  corners: Quad;
  detected: boolean;
  confidence: number;
  message: string;
};
type Pending = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  progress?: (message: string) => void;
};

async function imagePixels(file: File) {
  let source: ImageBitmap | HTMLImageElement;
  let sourceUrl = '';
  try {
    if ('createImageBitmap' in window)
      source = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      });
    else {
      sourceUrl = URL.createObjectURL(file);
      source = new Image();
      source.src = sourceUrl;
      await source.decode();
    }
    const naturalWidth =
      'naturalWidth' in source ? source.naturalWidth : source.width;
    const naturalHeight =
      'naturalHeight' in source ? source.naturalHeight : source.height;
    const scale = Math.min(1, 2000 / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('O navegador não disponibilizou o Canvas.');
    context.drawImage(source, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    canvas.width = canvas.height = 0;
    return { pixels, width, height };
  } finally {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (typeof ImageBitmap !== 'undefined' && source! instanceof ImageBitmap)
      source.close();
  }
}

export function canvasBlob(
  canvas: HTMLCanvasElement,
  type: 'image/png' | 'image/jpeg',
  quality = 0.9,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('Não foi possível gerar a imagem.')),
      type,
      quality,
    ),
  );
}

export class ScannerEngine {
  private worker = new Worker(new URL('./scan.worker.ts', import.meta.url));
  private sequence = 0;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker.onmessage = (
      event: MessageEvent<{
        id: number;
        type: string;
        result?: any;
        message?: string;
      }>,
    ) => {
      const { id, type, result, message } = event.data;
      const pending = this.pending.get(id);
      if (!pending) return;
      if (type === 'progress') {
        pending.progress?.(message || 'Processando…');
        return;
      }
      this.pending.delete(id);
      if (type === 'error')
        pending.reject(new Error(message || 'Falha no processamento.'));
      else pending.resolve(result);
    };
    this.worker.onerror = () => {
      for (const pending of this.pending.values())
        pending.reject(
          new Error('Falha ao carregar o motor de digitalização.'),
        );
      this.pending.clear();
    };
  }

  private request<T>(
    payload: Record<string, unknown>,
    pixels: Uint8ClampedArray,
    progress?: (message: string) => void,
  ): Promise<T> {
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, progress });
      this.worker.postMessage({ id, ...payload, pixels }, [pixels.buffer]);
    });
  }

  async detect(
    file: File,
    progress?: (message: string) => void,
  ): Promise<Detection> {
    const image = await imagePixels(file);
    return this.request<Detection>(
      { task: 'detect', width: image.width, height: image.height },
      image.pixels,
      progress,
    );
  }

  async render(
    file: File,
    corners: Quad,
    aspect: Aspect,
    mode: ScanMode,
    rotation: Rotation,
    progress?: (message: string) => void,
  ) {
    const image = await imagePixels(file);
    const result = await this.request<{
      pixels: Uint8ClampedArray;
      width: number;
      height: number;
    }>(
      {
        task: 'render',
        width: image.width,
        height: image.height,
        corners,
        aspect,
        mode,
        rotation,
      },
      image.pixels,
      progress,
    );
    const canvas = document.createElement('canvas');
    canvas.width = result.width;
    canvas.height = result.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('O navegador não disponibilizou o Canvas.');
    context.putImageData(
      new ImageData(
        new Uint8ClampedArray(result.pixels),
        result.width,
        result.height,
      ),
      0,
      0,
    );
    const blob = await canvasBlob(canvas, 'image/png');
    canvas.width = canvas.height = 0;
    return { blob, width: result.width, height: result.height };
  }

  terminate() {
    this.worker.terminate();
    for (const pending of this.pending.values())
      pending.reject(new Error('Processamento cancelado.'));
    this.pending.clear();
  }
}
