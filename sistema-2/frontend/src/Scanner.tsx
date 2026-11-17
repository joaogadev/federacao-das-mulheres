import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent,
} from 'react';
import {
  ScannerEngine,
  type Detection,
  type Rotation,
  type ScanMode,
} from './scanner/engine';
import {
  fullFrame,
  isUsableQuad,
  type Aspect,
  type Quad,
} from './scanner/geometry';
import type { OcrResult } from './scanner/ocr';
import { saveScan, type User } from './api';
import { ScanLibrary } from './ScanLibrary';

type ScanPage = {
  id: string;
  file: File;
  originalUrl: string;
  corners: Quad;
  detection: Detection | null;
  mode: ScanMode;
  aspect: Aspect;
  rotation: Rotation;
  scanBlob: Blob | null;
  scanUrl: string;
  width: number;
  height: number;
  ocr: OcrResult | null;
  correctedText: string;
  busy: boolean;
  progress: string;
  error: string;
};

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
const modes: { value: ScanMode; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'original', label: 'Original corrigido' },
  { value: 'gray', label: 'Tons de cinza' },
  { value: 'bw', label: 'Preto e branco' },
];
const cornerNames = [
  'superior esquerdo',
  'superior direito',
  'inferior direito',
  'inferior esquerdo',
];

export function Scanner({ user }: { user: User }) {
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [message, setMessage] = useState('');
  const [marking, setMarking] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [quality, setQuality] = useState(0.85);
  const [exporting, setExporting] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [savedRefresh, setSavedRefresh] = useState(0);
  const [savedId, setSavedId] = useState('');
  const engine = useRef<ScannerEngine | null>(null);
  const adding = useRef(false);
  const pagesRef = useRef<ScanPage[]>([]);
  const drag = useRef<number | null>(null);
  pagesRef.current = pages;
  const selected = pages.find((page) => page.id === selectedId);

  useEffect(
    () => () => {
      engine.current?.terminate();
      for (const page of pagesRef.current) {
        URL.revokeObjectURL(page.originalUrl);
        if (page.scanUrl) URL.revokeObjectURL(page.scanUrl);
      }
    },
    [],
  );

  function getEngine() {
    return (engine.current ??= new ScannerEngine());
  }
  function update(id: string, values: Partial<ScanPage>) {
    setPages((current) =>
      current.map((page) => (page.id === id ? { ...page, ...values } : page)),
    );
  }

  async function process(page: ScanPage, redetect: boolean) {
    update(page.id, {
      busy: true,
      error: '',
      progress: redetect
        ? 'Procurando as bordas…'
        : 'Atualizando digitalização…',
    });
    try {
      const detector = getEngine();
      const detection = redetect
        ? await detector.detect(page.file, (progress) =>
            update(page.id, { progress }),
          )
        : page.detection;
      const corners = redetect ? detection!.corners : page.corners;
      if (!isUsableQuad(corners))
        throw new Error(
          'Os cantos não formam um recorte válido. Ajuste os quatro pontos.',
        );
      const result = await detector.render(
        page.file,
        corners,
        page.aspect,
        page.mode,
        page.rotation,
        (progress) => update(page.id, { progress }),
      );
      const scanUrl = URL.createObjectURL(result.blob);
      setPages((current) =>
        current.map((item) =>
          item.id === page.id
            ? {
                ...item,
                corners,
                detection,
                scanBlob: result.blob,
                scanUrl,
                width: result.width,
                height: result.height,
                ocr: null,
                correctedText: '',
                busy: false,
                progress: '',
                error: '',
              }
            : item,
        ),
      );
      if (page.scanUrl) URL.revokeObjectURL(page.scanUrl);
    } catch (error) {
      update(page.id, {
        busy: false,
        progress: '',
        error:
          error instanceof Error
            ? error.message
            : 'Falha ao processar a página.',
      });
    }
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    if (adding.current) {
      setMessage('Aguarde as páginas atuais terminarem de processar.');
      return;
    }
    setMessage('');
    const incoming = Array.from(files);
    if (pagesRef.current.length + incoming.length > 12) {
      setMessage('Use até 12 páginas por digitalização.');
      return;
    }
    if (incoming.some((file) => !allowed.has(file.type))) {
      setMessage('Use apenas JPG, JPEG, PNG ou WebP.');
      return;
    }
    if (incoming.some((file) => file.size > 25 * 1024 * 1024)) {
      setMessage('Cada foto deve ter no máximo 25 MB.');
      return;
    }
    adding.current = true;
    const added = incoming.map((file) => ({
      id: crypto.randomUUID(),
      file,
      originalUrl: URL.createObjectURL(file),
      corners: fullFrame(),
      detection: null,
      mode: 'auto' as ScanMode,
      aspect: 'auto' as Aspect,
      rotation: 0 as Rotation,
      scanBlob: null,
      scanUrl: '',
      width: 0,
      height: 0,
      ocr: null,
      correctedText: '',
      busy: false,
      progress: '',
      error: '',
    }));
    setPages((current) => [...current, ...added]);
    setSelectedId((current) => current || added[0].id);
    try {
      for (const page of added) await process(page, true);
    } finally {
      adding.current = false;
    }
  }

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    void addFiles(event.target.files);
    event.target.value = '';
  }

  function removePage(page: ScanPage) {
    URL.revokeObjectURL(page.originalUrl);
    if (page.scanUrl) URL.revokeObjectURL(page.scanUrl);
    const remaining = pages.filter((item) => item.id !== page.id);
    setPages(remaining);
    if (selectedId === page.id) setSelectedId(remaining[0]?.id || '');
    setMarking(null);
  }

  function movePage(index: number, direction: -1 | 1) {
    const next = [...pages];
    const other = index + direction;
    if (other < 0 || other >= next.length) return;
    [next[index], next[other]] = [next[other], next[index]];
    setPages(next);
  }

  function changeCorner(index: number, event: PointerEvent<SVGElement>) {
    if (!selected) return;
    const element = event.currentTarget;
    const bounds = (
      element instanceof SVGSVGElement ? element : element.ownerSVGElement!
    ).getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(1, (event.clientX - bounds.left) / bounds.width),
    );
    const y = Math.max(
      0,
      Math.min(1, (event.clientY - bounds.top) / bounds.height),
    );
    const corners = [...selected.corners] as Quad;
    corners[index] = { x, y };
    update(selected.id, { corners });
  }

  function adjust(
    patch: Partial<Pick<ScanPage, 'mode' | 'aspect' | 'rotation' | 'corners'>>,
  ) {
    if (!selected || selected.busy) return;
    const updated = { ...selected, ...patch };
    update(selected.id, patch);
    void process(updated, false);
  }

  async function runOcr(page: ScanPage) {
    if (!page.scanBlob || page.busy) return;
    update(page.id, { busy: true, error: '', progress: 'Carregando OCR…' });
    try {
      const { recognizePortuguese } = await import('./scanner/ocr');
      const result = await recognizePortuguese(page.scanBlob, (progress) =>
        update(page.id, { progress }),
      );
      update(page.id, {
        ocr: result,
        correctedText: result.text,
        busy: false,
        progress: '',
      });
    } catch (error) {
      update(page.id, {
        busy: false,
        progress: '',
        error:
          error instanceof Error
            ? error.message
            : 'OCR indisponível. A digitalização continua pronta.',
      });
    }
  }

  async function exportPdf() {
    if (!pages.length || pages.some((page) => !page.scanBlob || page.busy)) {
      setMessage(
        'Aguarde todas as páginas terminarem ou corrija as páginas com erro.',
      );
      return;
    }
    setExporting(true);
    setMessage('Gerando PDF visual…');
    try {
      const { visualPdf, download } = await import('./scanner/export');
      const blob = await visualPdf(
        pages.map((page) => ({
          blob: page.scanBlob!,
          width: page.width,
          height: page.height,
        })),
        quality,
      );
      download(blob, 'documento-digitalizado.pdf');
      setMessage(
        'PDF visual pronto. O texto OCR pode ser baixado separadamente.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Falha ao gerar PDF.',
      );
    } finally {
      setExporting(false);
    }
  }

  async function saveToSystem() {
    if (!pages.length || pages.some((page) => !page.scanBlob || page.busy)) {
      setMessage('Aguarde todas as páginas terminarem antes de salvar.');
      return;
    }
    setExporting(true);
    setMessage('Salvando digitalização no Sistema 2…');
    try {
      const { visualPdf } = await import('./scanner/export');
      const pdf = await visualPdf(
        pages.map((page) => ({
          blob: page.scanBlob!,
          width: page.width,
          height: page.height,
        })),
        quality,
      );
      if (pdf.size > 30 * 1024 * 1024)
        throw new Error(
          'O PDF excedeu 30 MB. Reduza a qualidade ou o número de páginas.',
        );
      const form = new FormData();
      form.append('file', pdf, 'digitalizacao.pdf');
      form.append('pageCount', String(pages.length));
      if (saveTitle.trim()) form.append('title', saveTitle.trim());
      const text = pages
        .map((page, index) =>
          page.ocr ? `Página ${index + 1}\n${page.correctedText}` : '',
        )
        .filter(Boolean)
        .join('\n\n---\n\n');
      if (text) form.append('ocrText', text);
      const saved = await saveScan(form);
      setMessage(
        `“${saved.title}” foi salvo e está disponível na biblioteca abaixo.`,
      );
      setSavedId(saved.id);
      setSavedRefresh((current) => current + 1);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar a digitalização.',
      );
    } finally {
      setExporting(false);
    }
  }

  async function exportPage(format: 'png' | 'jpg') {
    if (!selected?.scanBlob) return;
    setExporting(true);
    try {
      const { imageExport, download } = await import('./scanner/export');
      const blob = await imageExport(
        {
          blob: selected.scanBlob,
          width: selected.width,
          height: selected.height,
        },
        format,
        quality,
      );
      download(blob, `pagina-${pages.indexOf(selected) + 1}.${format}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Falha ao exportar imagem.',
      );
    } finally {
      setExporting(false);
    }
  }

  async function exportText() {
    const { download, textExport } = await import('./scanner/export');
    download(
      textExport(
        pages.map((page) => ({
          blob: page.scanBlob!,
          width: page.width,
          height: page.height,
          text: page.ocr ? page.correctedText : undefined,
        })),
      ),
      'texto-reconhecido.txt',
    );
  }

  return (
    <section className="scanner">
      <p>
        A digitalização ocorre no navegador. Ao escolher “Salvar”, o PDF e o
        texto OCR revisado são guardados no banco para acesso posterior.
      </p>
      <div className="scan-actions">
        <label className="scan-file-button">
          Tirar foto
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={selectFiles}
          />
        </label>
        <label className="scan-file-button">
          Enviar documento
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={selectFiles}
          />
        </label>
        {pages.length > 0 && (
          <span>Adicione mais páginas pelos mesmos botões.</span>
        )}
      </div>
      {message && (
        <p role="status" className="scan-message">
          {message}
        </p>
      )}
      {!pages.length && (
        <div className="scan-empty">
          <h2>
            Enviar imagem → Digitalizar → Conferir →{' '}
            {user.role === 'ADMIN' ? 'Salvar' : 'Baixar PDF'}
          </h2>
          <p>
            Selecione uma ou várias fotos. O recorte automático pode ser
            reajustado antes de salvar ou baixar.
          </p>
        </div>
      )}
      {pages.length > 0 && (
        <div className="scan-workspace">
          <aside className="scan-pages" aria-label="Páginas do documento">
            <h2>Páginas ({pages.length})</h2>
            {pages.map((page, index) => (
              <div
                className={`scan-page-row ${page.id === selectedId ? 'selected' : ''}`}
                key={page.id}
              >
                <button
                  className="scan-page-select"
                  onClick={() => {
                    setSelectedId(page.id);
                    setMarking(null);
                  }}
                >
                  <img src={page.scanUrl || page.originalUrl} alt="" />
                  <span>
                    Página {index + 1}
                    {page.busy ? ' · processando' : page.error ? ' · erro' : ''}
                  </span>
                </button>
                <div>
                  <button
                    aria-label={`Subir página ${index + 1}`}
                    disabled={index === 0}
                    onClick={() => movePage(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`Descer página ${index + 1}`}
                    disabled={index === pages.length - 1}
                    onClick={() => movePage(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    aria-label={`Remover página ${index + 1}`}
                    disabled={page.busy}
                    onClick={() => removePage(page)}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </aside>
          {selected && (
            <div className="scan-editor">
              <h2>Página {pages.indexOf(selected) + 1}</h2>
              {selected.busy && (
                <p role="status">{selected.progress || 'Processando…'}</p>
              )}
              {selected.error && (
                <p className="error" role="alert">
                  {selected.error}
                </p>
              )}
              {selected.detection && (
                <p
                  className={
                    selected.detection.detected ? 'scan-note' : 'scan-warning'
                  }
                >
                  {selected.detection.message}
                </p>
              )}
              <div className="scan-controls">
                <label>
                  Modo
                  <select
                    value={selected.mode}
                    disabled={selected.busy}
                    onChange={(e) =>
                      adjust({ mode: e.target.value as ScanMode })
                    }
                  >
                    {modes.map((mode) => (
                      <option key={mode.value} value={mode.value}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Proporção
                  <select
                    value={selected.aspect}
                    disabled={selected.busy}
                    onChange={(e) =>
                      adjust({ aspect: e.target.value as Aspect })
                    }
                  >
                    <option value="auto">Automática</option>
                    <option value="a4-portrait">A4 retrato</option>
                    <option value="a4-landscape">A4 paisagem</option>
                  </select>
                </label>
                <button
                  disabled={selected.busy}
                  onClick={() =>
                    adjust({
                      rotation: ((selected.rotation + 90) % 360) as Rotation,
                    })
                  }
                >
                  Girar 90°
                </button>
                <button
                  disabled={selected.busy}
                  onClick={() => void process(selected, true)}
                >
                  Redetectar
                </button>
                <button
                  disabled={selected.busy}
                  onClick={() => {
                    setMarking(null);
                    adjust({ corners: fullFrame() });
                  }}
                >
                  Usar imagem inteira
                </button>
                <button disabled={selected.busy} onClick={() => setMarking(0)}>
                  Marcar quatro cantos
                </button>
              </div>
              {marking !== null && (
                <p role="status">
                  Toque o canto {cornerNames[marking]} na imagem original.{' '}
                  {marking + 1} de 4.
                </p>
              )}
              <label className="scan-zoom">
                Zoom{' '}
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
                <span>{Math.round(zoom * 100)}%</span>
              </label>
              <div className="scan-compare">
                <div>
                  <h3>Original · ajuste os cantos</h3>
                  <div className="scan-image-scroll">
                    <div
                      className="scan-image-inner"
                      style={{ width: `${zoom * 100}%` }}
                    >
                      <img
                        src={selected.originalUrl}
                        alt={`Foto original da página ${pages.indexOf(selected) + 1}`}
                      />
                      <svg
                        className="scan-overlay"
                        viewBox="0 0 1000 1000"
                        preserveAspectRatio="none"
                        onPointerDown={(event) => {
                          if (
                            marking === null ||
                            event.target !== event.currentTarget
                          )
                            return;
                          changeCorner(marking, event);
                          setMarking(marking === 3 ? null : marking + 1);
                        }}
                      >
                        <polygon
                          points={selected.corners
                            .map(
                              (point) => `${point.x * 1000},${point.y * 1000}`,
                            )
                            .join(' ')}
                          fill="rgba(91,45,70,.13)"
                          stroke="#edc94f"
                          strokeWidth="5"
                          pointerEvents="none"
                        />
                        {selected.corners.map((point, index) => (
                          <circle
                            key={index}
                            cx={point.x * 1000}
                            cy={point.y * 1000}
                            r="19"
                            fill="#fff"
                            stroke="#6b304e"
                            strokeWidth="7"
                            style={{ touchAction: 'none', cursor: 'grab' }}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              drag.current = index;
                              event.currentTarget.setPointerCapture(
                                event.pointerId,
                              );
                            }}
                            onPointerMove={(event) => {
                              if (drag.current === index)
                                changeCorner(index, event);
                            }}
                            onPointerUp={(event) => {
                              drag.current = null;
                              event.currentTarget.releasePointerCapture(
                                event.pointerId,
                              );
                            }}
                          />
                        ))}
                      </svg>
                    </div>
                  </div>
                  <button
                    disabled={selected.busy || !isUsableQuad(selected.corners)}
                    onClick={() => void process(selected, false)}
                  >
                    Aplicar recorte
                  </button>
                </div>
                <div>
                  <h3>Digitalizado</h3>
                  <div className="scan-image-scroll">
                    {selected.scanUrl ? (
                      <img
                        className="scan-result"
                        style={{ width: `${zoom * 100}%` }}
                        src={selected.scanUrl}
                        alt={`Página ${pages.indexOf(selected) + 1} digitalizada`}
                      />
                    ) : (
                      <p>Aguardando processamento…</p>
                    )}
                  </div>
                </div>
              </div>
              <details className="scan-ocr">
                <summary>Revisar texto (OCR opcional)</summary>
                <p>
                  Reconhece português na imagem digitalizada. O texto pode ser
                  corrigido sem alterar os pixels do documento.
                </p>
                <button
                  disabled={selected.busy || !selected.scanBlob}
                  onClick={() => void runOcr(selected)}
                >
                  {selected.ocr ? 'Executar OCR novamente' : 'Reconhecer texto'}
                </button>
                {selected.ocr && (
                  <>
                    <p>
                      Confiança média: {Math.round(selected.ocr.confidence)}%.{' '}
                      {
                        selected.ocr.words.filter(
                          (word) => word.confidence < 65,
                        ).length
                      }{' '}
                      palavras com confiança baixa.
                    </p>
                    {selected.ocr.words.some(
                      (word) => word.confidence < 65,
                    ) && (
                      <details>
                        <summary>Palavras a revisar e posições</summary>
                        <ul>
                          {selected.ocr.words
                            .filter((word) => word.confidence < 65)
                            .slice(0, 30)
                            .map((word, index) => (
                              <li key={index}>
                                {word.text} · {Math.round(word.confidence)}% ·
                                x:{word.bbox.x0}, y:{word.bbox.y0}
                              </li>
                            ))}
                        </ul>
                      </details>
                    )}
                    <label>
                      Texto reconhecido e corrigível
                      <textarea
                        value={selected.correctedText}
                        onChange={(e) =>
                          update(selected.id, { correctedText: e.target.value })
                        }
                        rows={12}
                      />
                    </label>
                  </>
                )}
              </details>
              <div className="scan-export">
                <h3>Salvar e baixar resultado</h3>
                <label>
                  Qualidade do JPG/PDF{' '}
                  <input
                    type="range"
                    min="0.6"
                    max="0.95"
                    step="0.05"
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                  />
                  <span>{Math.round(quality * 100)}%</span>
                </label>
                {user.role === 'ADMIN' && (
                  <div className="scan-save">
                    <label>
                      Título para localizar depois (opcional)
                      <input
                        value={saveTitle}
                        maxLength={160}
                        onChange={(e) => setSaveTitle(e.target.value)}
                        placeholder="Ex.: Ata da reunião"
                      />
                    </label>
                    <button
                      disabled={
                        exporting ||
                        pages.some((page) => page.busy || !page.scanBlob)
                      }
                      onClick={() => void saveToSystem()}
                    >
                      {exporting ? 'Aguarde…' : 'Salvar'}
                    </button>
                  </div>
                )}
                <div>
                  <button
                    disabled={
                      exporting ||
                      pages.some((page) => page.busy || !page.scanBlob)
                    }
                    onClick={() => void exportPdf()}
                  >
                    {exporting
                      ? 'Gerando…'
                      : `Baixar PDF ${pages.length > 1 ? 'multipágina' : ''}`}
                  </button>
                  <button
                    disabled={exporting || !selected.scanBlob}
                    onClick={() => void exportPage('png')}
                  >
                    Baixar PNG desta página
                  </button>
                  <button
                    disabled={exporting || !selected.scanBlob}
                    onClick={() => void exportPage('jpg')}
                  >
                    Baixar JPG desta página
                  </button>
                  {pages.some((page) => page.ocr) && (
                    <button
                      disabled={exporting}
                      onClick={() => void exportText()}
                    >
                      Baixar texto OCR
                    </button>
                  )}
                </div>
                <p>
                  O PDF é visual. O texto OCR é guardado separadamente quando
                  executado; o PDF não é pesquisável.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      <ScanLibrary refresh={savedRefresh} openId={savedId} />
    </section>
  );
}
