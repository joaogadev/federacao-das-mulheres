import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  api,
  login,
  logout,
  session,
  type User,
  type Membership,
  type DonationPage,
  type Page,
  type Summary,
  type Event,
} from './api';
import { Scanner } from './Scanner';
import './style.css';

const money = (c: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    c / 100,
  );
const date = (s: string | null | undefined) =>
  s
    ? new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Fortaleza',
      }).format(new Date(s))
    : '—';
type Tab = 'inicio' | 'afiliadas' | 'doacoes' | 'documentos' | 'eventos';
function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [tab, setTab] = useState<Tab>('inicio');
  useEffect(() => {
    session()
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (loading)
    return (
      <main className="center">
        <p>Carregando sessão…</p>
      </main>
    );
  if (!user) return <Login onLogin={setUser} />;
  return (
    <div className="shell">
      <header>
        <div>
          <strong>Federação das Mulheres</strong>
          <span>Painel administrativo</span>
        </div>
        <div>
          {user.email} · {user.role}{' '}
          <button
            onClick={() =>
              logout()
                .then(() => setUser(null))
                .catch((e) => setError(e.message))
            }
          >
            Sair
          </button>
        </div>
      </header>
      <nav aria-label="Seções do painel">
        {(
          [
            ['inicio', 'Visão geral'],
            ['afiliadas', 'Afiliadas'],
            ['doacoes', 'Doações'],
            ['documentos', 'Digitalizar'],
            ['eventos', 'Eventos legados'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? 'active' : ''}
            onClick={() => {
              setTab(key);
              setError('');
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <main>
        <h1>
          {
            {
              inicio: 'Visão geral',
              afiliadas: 'Afiliadas',
              doacoes: 'Doações',
              documentos: 'Digitalizar documentos',
              eventos: 'Eventos Asaas legados',
            }[tab]
          }
        </h1>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {tab === 'inicio' && <Overview />}
        {tab === 'afiliadas' && <Members user={user} />}
        {tab === 'doacoes' && <Donations />}
        {tab === 'documentos' && <Scanner user={user} />}
        {tab === 'eventos' && <Events user={user} />}
      </main>
    </div>
  );
}
function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <main className="login">
      <h1>Painel administrativo</h1>
      <p>Entre com seu acesso individual.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          login(email, password)
            .then(onLogin)
            .catch((err) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      >
        <label>
          E-mail
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </main>
  );
}
function useLoad<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    api<T>(path)
      .then((v) => {
        if (alive) setData(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, ...deps]);
  return {
    data,
    error,
    loading,
    reload: () => {
      setData(null);
      setLoading(true);
      api<T>(path)
        .then(setData)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    },
  };
}
function State({ loading, error }: { loading: boolean; error: string }) {
  return loading ? (
    <p role="status">Carregando…</p>
  ) : error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}
function Overview() {
  const { data, error, loading } = useLoad<Summary>('/reports/summary');
  return (
    <>
      <State loading={loading} error={error} />
      {data && (
        <>
          <div className="cards">
            <article>
              <h2>Filiações</h2>
              <strong>{data.memberships}</strong>
            </article>
            <article>
              <h2>Mensalidades recebidas</h2>
              <strong>{money(data.monthlyReceivedCents)}</strong>
            </article>
            <article>
              <h2>Mensalidades vencidas</h2>
              <strong>{data.monthlyOverdue}</strong>
            </article>
            <article>
              <h2>Doações recebidas</h2>
              <strong>{money(data.donationReceivedCents)}</strong>
              <small>{data.donations} registros</small>
            </article>
          </div>
          <p>
            Última conciliação:{' '}
            {data.lastSync
              ? `${date(data.lastSync.finishedAt || data.lastSync.startedAt)} · ${data.lastSync.error || data.lastSync.result || 'em andamento'}`
              : 'Ainda não executada'}
          </p>
          <p>
            Os totais somam pagamentos confirmados por plataforma e conferências manuais;
            não representam saldo bancário. Confira a origem no detalhe de cada afiliada.
          </p>
        </>
      )}
    </>
  );
}
function Members({ user }: { user: User }) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState(''),
    [financial, setFinancial] = useState(''),
    [query, setQuery] = useState(''),
    [selected, setSelected] = useState(''),
    [manualName, setManualName] = useState(''),
    [manualCpf, setManualCpf] = useState(''),
    [manualPhone, setManualPhone] = useState(''),
    [manualError, setManualError] = useState('');
  const path = `/memberships?page=${page}&search=${encodeURIComponent(query)}${filter ? `&status=${filter}` : ''}${financial ? `&financial=${financial}` : ''}`;
  const { data, error, loading, reload } = useLoad<Page<Membership>>(path);
  async function registerManual(e: React.FormEvent) {
    e.preventDefault(); setManualError('');
    try {
      await api('/memberships/manual','POST',{name:manualName,cpf:manualCpf,phone:manualPhone});
      setManualName(''); setManualCpf(''); setManualPhone(''); reload();
    } catch (cause) { setManualError((cause as Error).message); }
  }
  return (
    <>
      {user.role === 'ADMIN' && <form className="filters" onSubmit={registerManual}>
        <h2>Cadastrar afiliada anterior à Cakto</h2>
        <label>Nome<input required value={manualName} onChange={e=>setManualName(e.target.value)} /></label>
        <label>CPF<input required inputMode="numeric" value={manualCpf} onChange={e=>setManualCpf(e.target.value)} /></label>
        <label>Telefone<input required inputMode="tel" value={manualPhone} onChange={e=>setManualPhone(e.target.value)} /></label>
        <button>Cadastrar</button>
        {manualError && <p className="error" role="alert">{manualError}</p>}
      </form>}
      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(search);
        }}
      >
        <label>
          Buscar nome, e-mail ou CPF
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          Situação institucional
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            <option>PENDENTE</option>
            <option>APROVADA</option>
            <option>REPROVADA</option>
          </select>
        </label>
        <label>
          Situação financeira
          <select
            value={financial}
            onChange={(e) => {
              setFinancial(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            <option value="overdue">Vencida</option>
            <option value="received">Recebida</option>
            <option value="pending">Pendente</option>
            <option value="refunded">Estornada</option>
          </select>
        </label>
        <button>Buscar</button>
      </form>
      <State loading={loading} error={error} />
      {data &&
        (data.items.length ? (
          <>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Institucional</th>
                    <th>Financeira</th>
                    <th>Cadastro</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((m) => (
                    <tr key={m.id}>
                      <td>{m.person.name}</td>
                      <td>{m.status}</td>
                      <td>
                        {m.caktoOrders?.some(p=>p.status==='paid') || m.manualMonths?.some(p=>p.paid)
                          ? 'Recebida'
                          : m.subscriptions
                          .flatMap((s) => s.payments)
                          .some((p) => p.status === 'OVERDUE')
                          ? 'Vencida'
                          : m.subscriptions
                                .flatMap((s) => s.payments)
                                .some((p) => p.status === 'RECEIVED')
                            ? 'Recebida'
                            : 'Sem recebimento'}
                      </td>
                      <td>{date(m.createdAt)}</td>
                      <td>
                        <button onClick={() => setSelected(m.id)}>
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={page}
              total={data.total}
              limit={data.limit}
              setPage={setPage}
            />
          </>
        ) : (
          <p>Nenhuma afiliada encontrada.</p>
        ))}
      {selected && (
        <MemberDetail
          id={selected}
          user={user}
          close={() => {
            setSelected('');
            reload();
          }}
        />
      )}
    </>
  );
}
function MemberDetail({
  id,
  user,
  close,
}: {
  id: string;
  user: User;
  close: () => void;
}) {
  const { data, error, loading, reload } = useLoad<Membership>(
    `/memberships/${id}`,
  );
  const [reason, setReason] = useState(''),
    [actionError, setActionError] = useState(''),
    [busy, setBusy] = useState(false);
  async function decide(status: 'APROVADA' | 'REPROVADA') {
    setBusy(true);
    setActionError('');
    try {
      await api(`/memberships/${id}/decision`, 'POST', { status, reason });
      setReason('');
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="detail">
      <button onClick={close}>Fechar detalhes</button>
      <h2>Detalhe da filiação</h2>
      <State loading={loading} error={error} />
      {data && (
        <>
          <p>
            <strong>{data.person.name}</strong> ·{' '}
            {data.person.email || 'Sem e-mail'} ·{' '}
            {data.person.phone || 'Sem telefone'}
          </p>
          <p>Origem: <strong>{data.source}</strong> · Assinatura Cakto: <strong>{data.caktoSubscriptionStatus || '—'}</strong></p>
          <p>
            Decisão institucional: <strong>{data.status}</strong>
          </p>
          {user.role === 'ADMIN' && (
            <div className="decision">
              <label>
                Motivo da decisão
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  minLength={3}
                  maxLength={500}
                />
              </label>
              <div>
                <button
                  disabled={busy || reason.trim().length < 3}
                  onClick={() => decide('APROVADA')}
                >
                  Aprovar
                </button>
                <button
                  disabled={busy || reason.trim().length < 3}
                  onClick={() => decide('REPROVADA')}
                >
                  Reprovar
                </button>
              </div>
              {actionError && (
                <p className="error" role="alert">
                  {actionError}
                </p>
              )}
            </div>
          )}
          {data.subscriptions.map((s) => (
            <article key={s.id}>
              <h3>Assinatura {s.status}</h3>
              <p>
                Periodicidade: {s.cycle} · Valor: {money(s.amountCents)}
              </p>
              <ul>
                {s.payments.map((p) => (
                  <li key={p.id}>
                    Vencimento {date(p.dueDate)} · {money(p.amountCents)} ·{' '}
                    {p.status}
                  </li>
                ))}
              </ul>
            </article>
          ))}
          {data.caktoOrders?.length > 0 && <section><h3>Pagamentos Cakto</h3><ul>{data.caktoOrders.map(o=><li key={o.id}>{o.competence || date(o.paidAt)} · {money(o.amountCents)} · {o.status} · {o.paymentMethod}</li>)}</ul></section>}
          {['MANUAL','MISTA'].includes(data.source) && <ManualMonths id={id} months={data.manualMonths || []} editable={user.role==='ADMIN'} onSaved={reload} />}
          <h3>Histórico institucional</h3>
          {data.history?.length ? (
            <ul>
              {data.history.map((h) => (
                <li key={h.id}>
                  {date(h.createdAt)} · {h.action} · {JSON.stringify(h.details)}
                </li>
              ))}
            </ul>
          ) : (
            <p>Sem decisões registradas.</p>
          )}
        </>
      )}
    </section>
  );
}
function ManualMonths({id,months,editable,onSaved}:{id:string;months:Membership['manualMonths'];editable:boolean;onSaved:()=>void}) {
  const [competence,setCompetence]=useState(new Date().toISOString().slice(0,7));
  const [paid,setPaid]=useState(false);
  const [amount,setAmount]=useState('30');
  const [paidAt,setPaidAt]=useState(new Date().toISOString().slice(0,10));
  const [note,setNote]=useState('');
  const [error,setError]=useState('');
  async function save(e:React.FormEvent) {
    e.preventDefault();setError('');
    try {
      await api(`/memberships/${id}/manual-month`,'POST',{competence,paid,amountCents:paid?Math.round(Number(amount.replace(',','.'))*100):null,paidAt:paid?paidAt:null,note});
      onSaved();
    } catch(cause) {setError((cause as Error).message);}
  }
  return <section><h3>Mensalidades conferidas pela Federação</h3>
    {editable && <form className="filters" onSubmit={save}>
      <label>Mês<input type="month" required value={competence} onChange={e=>setCompetence(e.target.value)} /></label>
      <label>Situação<select value={paid?'paid':'unpaid'} onChange={e=>setPaid(e.target.value==='paid')}><option value="unpaid">Não confirmado</option><option value="paid">Pagamento conferido</option></select></label>
      {paid && <><label>Valor (R$)<input inputMode="decimal" required value={amount} onChange={e=>setAmount(e.target.value)} /></label><label>Data do pagamento<input type="date" required value={paidAt} onChange={e=>setPaidAt(e.target.value)} /></label></>}
      <label>Observação<input value={note} onChange={e=>setNote(e.target.value)} /></label><button>Salvar conferência</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>}
    {months.length ? <ul>{months.map(m=><li key={m.id}>{m.competence} · {m.paid?'Pagamento conferido':'Não confirmado'}{m.paid && m.amountCents!=null?` · ${money(m.amountCents)}`:''} · {m.verifiedBy?.email || 'Responsável registrada'} · {date(m.verifiedAt)}</li>)}</ul> : <p>Nenhum mês conferido.</p>}
  </section>;
}
function Donations() {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [financial, setFinancial] = useState('');
  const { data, error, loading } = useLoad<DonationPage>(
    `/donations?page=${page}&search=${encodeURIComponent(query)}${financial ? `&financial=${financial}` : ''}`,
  );
  return (
    <>
      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(search);
        }}
      >
        <label>
          Buscar doadora
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          Situação financeira
          <select
            value={financial}
            onChange={(e) => {
              setFinancial(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            <option value="received">Recebida</option>
            <option value="pending">Pendente</option>
            <option value="overdue">Vencida</option>
            <option value="refunded">Estornada</option>
          </select>
        </label>
        <button>Buscar</button>
      </form>
      <State loading={loading} error={error} />
      {data && (
        <p>
          <strong>Total recebido:</strong> {money(data.receivedTotalCents)}{' '}
          {query && '(da busca atual)'}
        </p>
      )}
      {data &&
        (data.items.length ? (
          <>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Valor bruto</th>
                    <th>Estado</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((d) => (
                    <tr key={d.id}>
                      <td>{d.person.name}</td>
                      <td>{d.payment ? money(d.payment.amountCents) : '—'}</td>
                      <td>{d.payment?.status || 'Pendente'}</td>
                      <td>{date(d.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={page}
              total={data.total}
              limit={data.limit}
              setPage={setPage}
            />
          </>
        ) : (
          <p>Nenhuma doação encontrada.</p>
        ))}
    </>
  );
}
function Events({ user }: { user: User }) {
  const { data, error, loading, reload } = useLoad<Event[]>('/events');
  const [actionError, setActionError] = useState(''),
    [busy, setBusy] = useState(false);
  async function act(path: string) {
    setBusy(true);
    setActionError('');
    try {
      await api(path, 'POST');
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <State loading={loading} error={error} />
      {actionError && (
        <p className="error" role="alert">
          {actionError}
        </p>
      )}
      {data &&
        (data.length ? (
          <ul className="events">
            {data.map((e) => (
              <li key={e.id}>
                <strong>{e.type}</strong> · {e.state} · {date(e.receivedAt)} ·{' '}
                {e.lastError || 'Sem detalhe'}{' '}
                {user.role === 'ADMIN' && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      act(`/events/${encodeURIComponent(e.id)}/retry`)
                    }
                  >
                    Reprocessar
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>Não há eventos com falha ou origem pendente.</p>
        ))}
    </>
  );
}
function Pager({
  page,
  total,
  limit,
  setPage,
}: {
  page: number;
  total: number;
  limit: number;
  setPage: (n: number) => void;
}) {
  return (
    <div className="pager">
      <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
        Anterior
      </button>
      <span>
        Página {page} · {total} registros
      </span>
      <button
        disabled={page * limit >= total}
        onClick={() => setPage(page + 1)}
      >
        Próxima
      </button>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
