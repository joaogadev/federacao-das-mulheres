import assert from 'node:assert/strict';
import test from 'node:test';
import { databaseUrl } from '../scripts/database-url.mjs';

test('monta URL do PostgreSQL sem duplicar a senha no .env', () => {
  const url = new URL(databaseUrl({
    POSTGRES_USER: 'federacao',
    POSTGRES_PASSWORD: 'senha@# com espaço',
    POSTGRES_DB: 'federacao',
    POSTGRES_PORT: '5433',
  }));
  assert.equal(url.port, '5433');
  assert.equal(decodeURIComponent(url.password), 'senha@# com espaço');
  assert.equal(url.searchParams.get('schema'), 'public');
});

test('permite DATABASE_URL explícita em outros ambientes', () => {
  const explicit = 'postgresql://user:pass@db:5439/app?schema=private';
  assert.equal(databaseUrl({ DATABASE_URL: explicit }), explicit);
});

test('recusa configuração sem senha ou com porta inválida', () => {
  assert.throws(() => databaseUrl({ POSTGRES_USER: 'u', POSTGRES_DB: 'd' }), /POSTGRES_PASSWORD/);
  assert.throws(() => databaseUrl({ POSTGRES_USER: 'u', POSTGRES_PASSWORD: 'p', POSTGRES_DB: 'd', POSTGRES_PORT: 'abc' }), /POSTGRES_PORT/);
});
