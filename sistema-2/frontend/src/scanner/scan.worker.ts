/// <reference lib="webworker" />
import type { Aspect, Point, Quad } from './geometry';
importScripts('/scanner-geometry.js');
const { fullFrame, isUsableQuad, orderQuad, outputSize } = (self as any)
  .ScannerGeometry as typeof import('./geometry');

type DetectRequest = {
  id: number;
  task: 'detect';
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
};
type RenderRequest = {
  id: number;
  task: 'render';
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  corners: Quad;
  aspect: Aspect;
  mode: 'auto' | 'original' | 'gray' | 'bw';
  rotation: 0 | 90 | 180 | 270;
};
type Request = DetectRequest | RenderRequest;
type Cv = typeof import('@techstark/opencv-js') & Record<string, any>;
let cvPromise: Promise<{ value: Cv }> | undefined;

function loadCv(): Promise<{ value: Cv }> {
  return (cvPromise ??= (async () => {
    importScripts('/opencv.js');
    const candidate = (self as any).cv;
    if (!candidate) throw new Error('Arquivo local do OpenCV não carregou.');
    const cv =
      typeof candidate.then === 'function'
        ? (
            await new Promise<{ value: Cv }>((resolve, reject) =>
              candidate.then((value: Cv) => resolve({ value }), reject),
            )
          ).value
        : candidate;
    if (cv.Mat) return { value: cv as Cv };
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('OpenCV não iniciou.')),
        30000,
      );
      cv.onRuntimeInitialized = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    return { value: cv as Cv };
  })());
}

function sourceMat(cv: Cv, request: Request) {
  const mat = new cv.Mat(request.height, request.width, cv.CV_8UC4);
  mat.data.set(request.pixels);
  return mat;
}

function detect(cv: Cv, request: DetectRequest) {
  const mats: Array<{ delete(): void }> = [];
  const track = <T extends { delete(): void }>(mat: T): T => {
    mats.push(mat);
    return mat;
  };
  try {
    const source = track(sourceMat(cv, request));
    const gray = track(new cv.Mat());
    const blur = track(new cv.Mat());
    const edges = track(new cv.Mat());
    const dilated = track(new cv.Mat());
    const contours = track(new cv.MatVector());
    const hierarchy = track(new cv.Mat());
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 55, 150);
    cv.dilate(
      edges,
      dilated,
      track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))),
    );
    cv.findContours(
      dilated,
      contours,
      hierarchy,
      cv.RETR_LIST,
      cv.CHAIN_APPROX_SIMPLE,
    );
    let best: { corners: Quad; score: number } | null = null;
    const imageArea = request.width * request.height;
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      try {
        const area = cv.contourArea(contour);
        if (area < imageArea * 0.16 || area > imageArea * 0.98) continue;
        const perimeter = cv.arcLength(contour, true);
        const approx = new cv.Mat();
        try {
          cv.approxPolyDP(contour, approx, 0.025 * perimeter, true);
          if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue;
          const raw: Point[] = [];
          for (let j = 0; j < 4; j++)
            raw.push({
              x: approx.data32S[j * 2] / request.width,
              y: approx.data32S[j * 2 + 1] / request.height,
            });
          const corners = orderQuad(raw);
          if (!isUsableQuad(corners)) continue;
          const ratio = area / imageArea;
          const score = ratio - (ratio > 0.92 ? 0.1 : 0);
          if (!best || score > best.score) best = { corners, score };
        } finally {
          approx.delete();
        }
      } finally {
        contour.delete();
      }
    }
    return best
      ? {
          corners: best.corners,
          detected: true,
          confidence: Math.min(1, best.score / 0.65),
          message:
            best.score < 0.28
              ? 'Bordas pouco confiáveis. Ajuste os cantos antes de baixar.'
              : 'Bordas detectadas. Confira se todo o documento está dentro do recorte.',
        }
      : {
          corners: fullFrame(),
          detected: false,
          confidence: 0,
          message:
            'Não encontrei quatro bordas confiáveis. Ajuste os cantos manualmente; a imagem inteira foi preservada.',
        };
  } finally {
    for (const mat of mats.reverse()) mat.delete();
  }
}

function clamp(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function render(cv: Cv, request: RenderRequest) {
  if (!isUsableQuad(request.corners))
    throw new Error('Os quatro cantos precisam formar uma área válida.');
  const mats: Array<{ delete(): void }> = [];
  const track = <T extends { delete(): void }>(mat: T): T => {
    mats.push(mat);
    return mat;
  };
  try {
    const source = track(sourceMat(cv, request));
    const size = outputSize(
      request.corners,
      request.width,
      request.height,
      request.aspect,
    );
    const srcPoints = track(
      cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        request.corners.flatMap((point) => [
          point.x * request.width,
          point.y * request.height,
        ]),
      ),
    );
    const dstPoints = track(
      cv.matFromArray(4, 1, cv.CV_32FC2, [
        0,
        0,
        size.width - 1,
        0,
        size.width - 1,
        size.height - 1,
        0,
        size.height - 1,
      ]),
    );
    const transform = track(cv.getPerspectiveTransform(srcPoints, dstPoints));
    const warped = track(new cv.Mat());
    cv.warpPerspective(
      source,
      warped,
      transform,
      new cv.Size(size.width, size.height),
      cv.INTER_LINEAR,
      cv.BORDER_REPLICATE,
    );
    let result = warped;
    if (request.mode === 'gray' || request.mode === 'bw') {
      const gray = track(new cv.Mat());
      cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY);
      const output = track(new cv.Mat());
      if (request.mode === 'bw') {
        const thresholded = track(new cv.Mat());
        cv.adaptiveThreshold(
          gray,
          thresholded,
          255,
          cv.ADAPTIVE_THRESH_GAUSSIAN_C,
          cv.THRESH_BINARY,
          31,
          8,
        );
        const softened = track(new cv.Mat());
        cv.addWeighted(thresholded, 0.85, gray, 0.15, 0, softened);
        cv.cvtColor(softened, output, cv.COLOR_GRAY2RGBA);
      } else cv.cvtColor(gray, output, cv.COLOR_GRAY2RGBA);
      result = output;
    } else if (request.mode === 'auto') {
      const gray = track(new cv.Mat());
      const background = track(new cv.Mat());
      cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, background, new cv.Size(31, 31), 0);
      const adjusted = track(warped.clone());
      for (let i = 0, p = 0; i < adjusted.data.length; i += 4, p++) {
        const correction = (128 - background.data[p]) * 0.18;
        for (let channel = 0; channel < 3; channel++)
          adjusted.data[i + channel] = clamp(
            (adjusted.data[i + channel] - 128) * 1.04 + 128 + correction,
          );
      }
      const blur = track(new cv.Mat());
      const sharp = track(new cv.Mat());
      cv.GaussianBlur(adjusted, blur, new cv.Size(3, 3), 0);
      cv.addWeighted(adjusted, 1.12, blur, -0.12, 0, sharp);
      result = sharp;
    }
    if (request.rotation) {
      const rotated = track(new cv.Mat());
      const code =
        request.rotation === 90
          ? cv.ROTATE_90_CLOCKWISE
          : request.rotation === 180
            ? cv.ROTATE_180
            : cv.ROTATE_90_COUNTERCLOCKWISE;
      cv.rotate(result, rotated, code);
      result = rotated;
    }
    const pixels = new Uint8ClampedArray(result.data);
    return { pixels, width: result.cols, height: result.rows };
  } finally {
    for (const mat of mats.reverse()) mat.delete();
  }
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    self.postMessage({
      id: request.id,
      type: 'progress',
      message: 'Carregando motor de digitalização…',
    });
    const { value: cv } = await loadCv();
    self.postMessage({
      id: request.id,
      type: 'progress',
      message:
        request.task === 'detect'
          ? 'Detectando bordas…'
          : 'Corrigindo perspectiva e imagem…',
    });
    if (request.task === 'detect')
      self.postMessage({
        id: request.id,
        type: 'result',
        result: detect(cv, request),
      });
    else {
      const result = render(cv, request);
      self.postMessage({ id: request.id, type: 'result', result }, [
        result.pixels.buffer,
      ]);
    }
  } catch (error) {
    self.postMessage({
      id: request.id,
      type: 'error',
      message:
        error instanceof Error ? error.message : 'Falha ao processar a imagem.',
    });
  }
};
