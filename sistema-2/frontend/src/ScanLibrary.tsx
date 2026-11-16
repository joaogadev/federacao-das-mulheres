import { useEffect, useState } from 'react';
import { api, scanPdf, type Page } from './api';

type SavedScan = {
  id: string;
  title: string;
  pageCount: number;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: { email: string };
};
type Detail = SavedScan & { ocrText: string | null; sha256: string };

export function ScanLibrary({
  refresh,
  openId,
}: {
  refresh: number;
  openId: string;
}) {
  const [items, setItems] = useState<Page<SavedScan> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Detail | null>(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api<Page<SavedScan>>(
      `/scans?page=${page}&search=${encodeURIComponent(query)}`,
    )
      .then((value) => {
        if (active) setItems(value);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, query, refresh]);

  useEffect(() => {
    if (openId) void open(openId);
  }, [openId]);
  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );

  async function open(id: string) {
    setLoading(true);
    setError('');
    try {
      const [detail, pdf] = await Promise.all([
        api<Detail>(`/scans/${encodeURIComponent(id)}`),
        scanPdf(id),
      ]);
      setSelected(detail);
      setPdfUrl(URL.createObjectURL(pdf));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível abrir a digitalização.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="scan-library">
      <h2>Digitalizações salvas no Sistema 2</h2>
      <p>
        Documentos desta biblioteca ficam no banco PostgreSQL e podem ser
        abertos novamente por usuários autorizados.
      </p>
      <form
        className="scan-library-search"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setQuery(search);
        }}
      >
        <label>
          Buscar pelo título
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nome do documento"
          />
        </label>
        <button>Buscar</button>
      </form>
      {loading && <p role="status">Carregando biblioteca…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {items && (
        <>
          {items.items.length ? (
            <ul className="scan-library-list">
              {items.items.map((item) => (
                <li key={item.id}>
                  <button onClick={() => void open(item.id)}>
                    {item.title}
                  </button>
                  <span>
                    {item.pageCount}{' '}
                    {item.pageCount === 1 ? 'página' : 'páginas'} ·{' '}
                    {new Date(item.createdAt).toLocaleString('pt-BR')} ·{' '}
                    {item.uploadedBy.email}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              Nenhuma digitalização salva{query ? ' para esta busca' : ' ainda'}
              .
            </p>
          )}
          {items.total > items.limit && (
            <div className="pager">
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Anterior
              </button>
              <span>
                Página {page} · {items.total} documentos
              </span>
              <button
                disabled={page * items.limit >= items.total}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
      {selected && pdfUrl && (
        <div className="scan-library-preview">
          <h3>{selected.title}</h3>
          <p>
            {selected.pageCount}{' '}
            {selected.pageCount === 1 ? 'página' : 'páginas'} · Salvo por{' '}
            {selected.uploadedBy.email}
          </p>
          <div>
            <a href={pdfUrl} target="_blank" rel="noreferrer">
              Abrir PDF
            </a>
            <a href={pdfUrl} download={`digitalizacao-${selected.id}.pdf`}>
              Baixar PDF
            </a>
            <button
              onClick={() => {
                setSelected(null);
                setPdfUrl('');
              }}
            >
              Fechar
            </button>
          </div>
          <iframe title={`Visualização de ${selected.title}`} src={pdfUrl} />
          {selected.ocrText && (
            <details>
              <summary>Texto OCR salvo</summary>
              <pre>{selected.ocrText}</pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
