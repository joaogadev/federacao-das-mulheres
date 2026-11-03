import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';

test('painel compilado conserva rotas reais da API e entrada acessível',async()=>{
  const html=await readFile('dist/index.html','utf8');
  assert.match(html,/lang="pt-BR"/);
  assert.match(html,/id="root"/);
  const js=(await readdir('dist/assets')).find(f=>f.endsWith('.js'));
  assert.ok(js);
  const bundle=await readFile(`dist/assets/${js}`,'utf8');
  for(const route of ['/auth/login','/auth/me','/memberships','/donations','/reports/summary','/events','/sync/reconcile']) assert.ok(bundle.includes(route),`Rota ausente: ${route}`);
  assert.ok(bundle.includes('include'),'Cliente precisa enviar cookie de sessão');
});
