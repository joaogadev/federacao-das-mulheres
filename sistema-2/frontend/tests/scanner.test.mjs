import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const geometryBuilt = await build({
  entryPoints: ['src/scanner/geometry.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'ScannerGeometry',
  write: false,
});
const ScannerGeometry = new Function(
  `${geometryBuilt.outputFiles[0].text}; return ScannerGeometry`,
)();
const built = await build({
  entryPoints: ['src/scanner/scan.worker.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  external: ['@techstark/opencv-js'],
});
const module = { exports: {} };
const self = { ScannerGeometry, postMessage() {} };
const { detect, render } = new Function(
  'require',
  'module',
  'exports',
  'self',
  'importScripts',
  `${built.outputFiles[0].text}; return {detect, render}`,
)(require, module, module.exports, self, () => {});
const cv = (
  await new Promise((resolve, reject) =>
    require('@techstark/opencv-js').then((value) => resolve({ value }), reject),
  )
).value;

function image(variant) {
  const width = 800,
    height = 1000;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const background =
        variant === 'borderless'
          ? 250
          : variant === 'complex' && y % 29 < 3
            ? 156
            : 85;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = background;
      pixels[offset + 3] = 255;
    }
  const polygon = cv.matFromArray(
    4,
    1,
    cv.CV_32SC2,
    [150, 80, 690, 150, 630, 890, 100, 820],
  );
  const mat = new cv.Mat(height, width, cv.CV_8UC4);
  mat.data.set(pixels);
  if (variant !== 'borderless')
    cv.fillConvexPoly(mat, polygon, new cv.Scalar(246, 245, 239, 255));
  cv.putText(
    mat,
    'FEDERACAO',
    new cv.Point(180, 300),
    cv.FONT_HERSHEY_SIMPLEX,
    1.6,
    new cv.Scalar(30, 30, 30, 255),
    3,
  );
  if (variant === 'details') {
    cv.rectangle(
      mat,
      new cv.Point(190, 420),
      new cv.Point(570, 570),
      new cv.Scalar(35, 35, 35, 255),
      2,
    );
    cv.line(
      mat,
      new cv.Point(190, 495),
      new cv.Point(570, 495),
      new cv.Scalar(35, 35, 35, 255),
      2,
    );
    cv.circle(
      mat,
      new cv.Point(490, 700),
      35,
      new cv.Scalar(180, 40, 40, 255),
      3,
    );
  }
  if (variant === 'lighting' || variant === 'shadow')
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const shade =
          variant === 'shadow'
            ? Math.round(
                80 * Math.max(0, 1 - x / 500) * Math.max(0, 1 - y / 900),
              )
            : Math.round(55 * (1 - y / height));
        const index = (y * width + x) * 4;
        for (let channel = 0; channel < 3; channel++)
          mat.data[index + channel] = Math.max(
            0,
            mat.data[index + channel] - shade,
          );
      }
  const copy = new Uint8ClampedArray(mat.data);
  mat.delete();
  polygon.delete();
  return { width, height, pixels: copy };
}

for (const [variant, name] of [
  ['inclined', 'folha A4 inclinada'],
  ['lighting', 'iluminação irregular'],
  ['shadow', 'sombras moderadas'],
  ['complex', 'fundo complexo'],
  ['details', 'tabelas e carimbo'],
  ['borderless', 'sem bordas detectáveis'],
])
  test(name, () => {
    const source = image(variant);
    const found = detect(cv, { ...source, id: 1, task: 'detect' });
    assert.equal(found.detected, variant !== 'borderless', found.message);
    const result = render(cv, {
      ...source,
      id: 1,
      task: 'render',
      corners: found.corners,
      aspect: 'auto',
      mode: 'auto',
      rotation: 0,
    });
    assert.ok(result.width > 200 && result.height > 200);
    assert.equal(result.pixels.length, result.width * result.height * 4);
    if (variant !== 'borderless')
      assert.ok(result.width < source.width, 'Recorte deve excluir fundo');
  });

test('recorte manual e rotação preservam pixels', () => {
  const source = image('borderless');
  const corners = [
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.1 },
    { x: 0.9, y: 0.9 },
    { x: 0.1, y: 0.9 },
  ];
  const result = render(cv, {
    ...source,
    id: 1,
    task: 'render',
    corners,
    aspect: 'a4-portrait',
    mode: 'original',
    rotation: 90,
  });
  assert.ok(result.width > result.height);
});
