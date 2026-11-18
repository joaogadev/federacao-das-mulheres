export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point];
export type Aspect = 'auto' | 'a4-portrait' | 'a4-landscape';

export const fullFrame = (): Quad => [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

export function orderQuad(points: Point[]): Quad {
  if (points.length !== 4) throw new Error('São necessários quatro cantos.');
  const center = {
    x: points.reduce((s, p) => s + p.x, 0) / 4,
    y: points.reduce((s, p) => s + p.y, 0) / 4,
  };
  const ordered = [...points].sort(
    (a, b) =>
      Math.atan2(a.y - center.y, a.x - center.x) -
      Math.atan2(b.y - center.y, b.x - center.x),
  );
  const topLeft = ordered.reduce(
    (best, point, index) =>
      point.x + point.y < ordered[best].x + ordered[best].y ? index : best,
    0,
  );
  return [...ordered.slice(topLeft), ...ordered.slice(0, topLeft)] as Quad;
}

export function quadArea(quad: Quad): number {
  let twice = 0;
  for (let i = 0; i < 4; i++) {
    const next = quad[(i + 1) % 4];
    twice += quad[i].x * next.y - next.x * quad[i].y;
  }
  return Math.abs(twice) / 2;
}

const length = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function outputSize(
  quad: Quad,
  sourceWidth: number,
  sourceHeight: number,
  aspect: Aspect,
) {
  const p = quad.map((point) => ({
    x: point.x * sourceWidth,
    y: point.y * sourceHeight,
  })) as Quad;
  let width = (length(p[0], p[1]) + length(p[3], p[2])) / 2;
  let height = (length(p[0], p[3]) + length(p[1], p[2])) / 2;
  if (aspect !== 'auto') {
    const ratio = aspect === 'a4-portrait' ? 1 / Math.SQRT2 : Math.SQRT2;
    const area = width * height;
    width = Math.sqrt(area * ratio);
    height = width / ratio;
  }
  const scale = Math.min(1, 2400 / Math.max(width, height));
  return {
    width: Math.max(64, Math.round(width * scale)),
    height: Math.max(64, Math.round(height * scale)),
  };
}

export function isUsableQuad(quad: Quad): boolean {
  if (
    quad.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.x > 1 ||
        p.y < 0 ||
        p.y > 1,
    )
  )
    return false;
  if (quadArea(quad) < 0.08) return false;
  const sign = Math.sign(
    (quad[1].x - quad[0].x) * (quad[2].y - quad[1].y) -
      (quad[1].y - quad[0].y) * (quad[2].x - quad[1].x),
  );
  for (let i = 1; i < 4; i++) {
    const a = quad[i],
      b = quad[(i + 1) % 4],
      c = quad[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.sign(cross) !== sign) return false;
  }
  return true;
}
