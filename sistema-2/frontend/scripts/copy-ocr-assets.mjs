import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'public/ocr');
await mkdir(target, { recursive: true });
await copyFile(
  resolve(root, 'node_modules/tesseract.js/dist/worker.min.js'),
  resolve(target, 'worker.min.js'),
);
await copyFile(
  resolve(root, 'node_modules/@techstark/opencv-js/dist/opencv.js'),
  resolve(root, 'public/opencv.js'),
);
await build({
  entryPoints: [resolve(root, 'src/scanner/geometry.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'ScannerGeometry',
  outfile: resolve(root, 'public/scanner-geometry.js'),
});
await copyFile(
  resolve(
    root,
    'node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz',
  ),
  resolve(target, 'por.traineddata.gz'),
);
const sourceCore = resolve(root, 'node_modules/tesseract.js-core');
const targetCore = resolve(target, 'core');
await mkdir(targetCore, { recursive: true });
for (const name of await readdir(sourceCore)) {
  if (
    name.startsWith('tesseract-core-') &&
    (name.endsWith('.js') || name.endsWith('.wasm'))
  ) {
    await copyFile(resolve(sourceCore, name), resolve(targetCore, name));
  }
}
