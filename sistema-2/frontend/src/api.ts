export type Role = 'ADMIN' | 'CONSULTA';
export type User = { id: string; email: string; role: Role };
export type Person = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};
export type Payment = {
  id: string;
  status: string;
  dueDate: string | null;
  amountCents: number;
  billingType: string;
  receivedAt: string | null;
};
export type Subscription = {
  id: string;
  status: string;
  cycle: string;
  amountCents: number;
  payments: Payment[];
};
export type Membership = {
  id: string;
  status: string;
  createdAt: string;
  person: Person;
  subscriptions: Subscription[];
  history?: {
    id: string;
    action: string;
    createdAt: string;
    details: unknown;
    actor: { email: string } | null;
  }[];
};
export type Donation = {
  id: string;
  createdAt: string;
  person: Person;
  payment: Payment | null;
};
export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};
export type DonationPage = Page<Donation> & { receivedTotalCents: number };
export type Summary = {
  memberships: number;
  donations: number;
  monthlyReceivedCents: number;
  donationReceivedCents: number;
  monthlyOverdue: number;
  lastSync: {
    startedAt: string;
    finishedAt: string | null;
    result: string | null;
    error: string | null;
  } | null;
};
export type Event = {
  id: string;
  type: string;
  state: string;
  attempts: number;
  receivedAt: string;
  lastError: string | null;
};
const configuredBase = new URL(
  import.meta.env.VITE_API_URL || 'http://localhost:3001',
);
if (
  import.meta.env.DEV &&
  ['localhost', '127.0.0.1'].includes(configuredBase.hostname) &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname)
) {
  configuredBase.hostname = window.location.hostname;
}
const base = configuredBase.href.replace(/\/$/, '');
let csrfToken = '';
export function setCsrf(token: string) {
  csrfToken = token;
}
export async function api<T>(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
): Promise<T> {
  const response = await fetch(base + path, {
    method,
    credentials: 'include',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(method === 'POST' ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? 'Sessão expirada ou credenciais inválidas'
        : response.status === 403
          ? 'Acesso negado ou CSRF inválido'
          : value.message || `Falha HTTP ${response.status}`,
    );
  return value as T;
}
export async function login(email: string, password: string) {
  const value = await api<{ user: User; csrfToken: string }>(
    '/auth/login',
    'POST',
    { email, password },
  );
  setCsrf(value.csrfToken);
  return value.user;
}
export async function session() {
  const value = await api<{ user: User; csrfToken: string }>('/auth/me');
  setCsrf(value.csrfToken);
  return value.user;
}
export async function logout() {
  await api('/auth/logout', 'POST');
  setCsrf('');
}

export async function saveScan(
  form: FormData,
): Promise<{ id: string; title: string; createdAt: string }> {
  const response = await fetch(base + '/scans', {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrfToken },
    body: form,
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      Array.isArray(value.message)
        ? value.message.join(', ')
        : value.message || `Falha ao salvar (${response.status})`,
    );
  return value;
}

export async function scanPdf(id: string): Promise<Blob> {
  const response = await fetch(base + `/scans/${encodeURIComponent(id)}/file`, {
    credentials: 'include',
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? 'Entre novamente para abrir o documento.'
        : `Falha ao abrir PDF (${response.status})`,
    );
  return response.blob();
}
