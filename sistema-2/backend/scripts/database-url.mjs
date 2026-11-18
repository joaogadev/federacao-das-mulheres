export function databaseUrl(env) {
  if (env.DATABASE_URL) return env.DATABASE_URL;

  const required = ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB'];
  for (const key of required) {
    if (!env[key]) throw new Error(`Configure ${key} no .env do backend.`);
  }

  const port = Number(env.POSTGRES_PORT || '5433');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('POSTGRES_PORT deve ser uma porta TCP válida.');
  }

  const url = new URL('postgresql://127.0.0.1');
  url.hostname = env.POSTGRES_HOST || '127.0.0.1';
  url.port = String(port);
  url.username = env.POSTGRES_USER;
  url.password = env.POSTGRES_PASSWORD;
  url.pathname = `/${encodeURIComponent(env.POSTGRES_DB)}`;
  url.searchParams.set('schema', 'public');
  return url.toString();
}
