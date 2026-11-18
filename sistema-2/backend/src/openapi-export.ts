import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { bootstrap } from './main';

async function main() {
  const {app,doc}=await bootstrap(false);
  await writeFile(resolve(process.cwd(),'openapi.json'),JSON.stringify(doc,null,2));
  await app.close();
}
void main();
