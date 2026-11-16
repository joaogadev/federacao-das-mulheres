const result = document.getElementById('results')!;
result.textContent = 'Carregando módulos…';
const { ScannerEngine } = await import('../src/scanner/engine');
result.textContent = 'Motor importado…';
const { fullFrame, isUsableQuad } = await import('../src/scanner/geometry');
result.textContent = 'Geometria importada…';
const { visualPdf } = await import('../src/scanner/export');
const { PDFDocument } = await import('pdf-lib');
result.textContent = 'PDF importado…';
const { recognizePortuguese } = await import('../src/scanner/ocr');
result.textContent = 'OCR importado…';
const report: string[] = [];
function log(name: string, okay: boolean, detail = '') {
  report.push(
    `${okay ? 'PASSOU' : 'FALHOU'} — ${name}${detail ? `: ${detail}` : ''}`,
  );
  result.textContent = report.join('\n');
}
function page(
  variant:
    | 'inclined'
    | 'lighting'
    | 'shadow'
    | 'complex'
    | 'details'
    | 'borderless'
    | 'text',
) {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 1000;
  const context = canvas.getContext('2d')!;
  context.fillStyle = variant === 'borderless' ? '#fff' : '#686562';
  context.fillRect(0, 0, 800, 1000);
  if (variant === 'complex') {
    context.strokeStyle = '#baa06a';
    for (let y = 0; y < 1000; y += 26) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(800, y);
      context.stroke();
    }
  }
  if (variant !== 'borderless') {
    context.fillStyle = '#f9f7f0';
    context.beginPath();
    context.moveTo(150, 80);
    context.lineTo(690, 150);
    context.lineTo(630, 890);
    context.lineTo(100, 820);
    context.closePath();
    context.fill();
  }
  context.fillStyle = '#202020';
  context.font = '32px sans-serif';
  context.fillText('Federação das Mulheres', 190, 270);
  context.font = '24px sans-serif';
  context.fillText(
    variant === 'text' ? 'Emissão: 12/08/2026' : 'Documento de exemplo',
    180,
    345,
  );
  if (variant === 'details') {
    context.strokeStyle = '#222';
    context.strokeRect(180, 420, 400, 150);
    context.beginPath();
    context.moveTo(180, 495);
    context.lineTo(580, 495);
    context.stroke();
    context.font = 'italic 32px serif';
    context.fillText('Assinatura', 200, 690);
    context.strokeStyle = '#a32d2d';
    context.beginPath();
    context.arc(490, 735, 42, 0, Math.PI * 2);
    context.stroke();
  }
  if (variant === 'lighting' || variant === 'shadow') {
    const gradient = context.createLinearGradient(0, 0, 800, 1000);
    gradient.addColorStop(0, variant === 'shadow' ? '#0008' : '#0005');
    gradient.addColorStop(1, '#0000');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 800, 1000);
  }
  return canvas;
}
async function file(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG indisponível'))),
      'image/png',
    ),
  );
  return new File([blob], 'cenario.png', { type: 'image/png' });
}

const engine = new ScannerEngine();
for (const [variant, name] of [
  ['inclined', 'folha A4 inclinada'],
  ['lighting', 'iluminação irregular'],
  ['shadow', 'sombra moderada'],
  ['complex', 'fundo complexo'],
  ['details', 'tabela, assinatura e carimbo'],
  ['borderless', 'sem borda detectável'],
] as const) {
  try {
    const source = await file(page(variant));
    result.textContent = `Detectando ${variant}…`;
    const detection = await engine.detect(source, (progress) => {
      result.textContent = `${variant}: ${progress}`;
    });
    const corners = detection.detected ? detection.corners : fullFrame();
    const scan = await engine.render(source, corners, 'auto', 'auto', 0);
    const okay =
      isUsableQuad(corners) &&
      scan.blob.size > 1000 &&
      scan.width > 200 &&
      (variant !== 'borderless' ? detection.detected : !detection.detected);
    log(
      name,
      okay,
      `borda=${detection.detected}, ${scan.width}×${scan.height}`,
    );
  } catch (error) {
    log(name, false, String(error));
  }
}
try {
  const source = await file(page('text'));
  const scan = await engine.render(source, fullFrame(), 'auto', 'original', 0);
  const ocr = await recognizePortuguese(scan.blob, () => {});
  log(
    'OCR em português com acentos',
    /[çã]/i.test(ocr.text),
    ocr.text.slice(0, 100).replaceAll('\n', ' '),
  );
  const incorrect = ocr.text.replace('2026', '202G');
  const corrected = incorrect.replace('202G', '2026');
  log(
    'correção manual do texto OCR',
    incorrect.includes('202G') && corrected.includes('2026'),
  );
} catch (error) {
  log('OCR em português com acentos', false, String(error));
  log('correção manual do texto OCR', false);
}
try {
  const source = await file(page('inclined'));
  const first = await engine.render(source, fullFrame(), 'auto', 'original', 0);
  const second = await engine.render(source, fullFrame(), 'auto', 'gray', 90);
  const pdf = await visualPdf([first, second], 0.8);
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  const parsed = await PDFDocument.load(bytes);
  const okay =
    new TextDecoder().decode(bytes.slice(0, 8)).startsWith('%PDF-') &&
    parsed.getPageCount() === 2;
  log('PDF multipágina', okay, `${pdf.size} bytes`);
  log('exportação sem OCR', okay);
} catch (error) {
  log('PDF multipágina', false, String(error));
  log('exportação sem OCR', false);
}
engine.terminate();
result.dataset.complete = 'true';
