# 08 — Digitalizador de documentos no Sistema 2

O menu **Digitalizar** do painel React recebe JPG, JPEG, PNG e WebP (até 25 MB por imagem e 12 páginas). No celular, **Tirar foto** abre a câmera disponibilizada pelo navegador. Não há campos obrigatórios de nome, CPF, datas ou cadastro: a própria imagem é a fonte. O processamento acontece no navegador. Uma conta ADMIN pode salvar o PDF resultante no Sistema 2; ADMIN e CONSULTA podem abri-lo posteriormente na biblioteca.

## Uso

1. Abra `http://localhost:5173`, entre no painel e selecione **Digitalizar**.
2. Toque em **Tirar foto** ou **Enviar documento**; selecione várias imagens se quiser um PDF multipágina.
3. Aguarde a detecção das bordas e confira a foto original ao lado do resultado. O contorno amarelo mostra os quatro cantos usados.
4. Se o recorte estiver errado, arraste os cantos ou use **Marcar quatro cantos** e toque em cada um na ordem indicada. Clique em **Aplicar recorte**. Se a folha não tiver bordas distinguíveis, a imagem inteira é preservada e uma mensagem pede ajuste manual.
5. Escolha **Automático**, **Original corrigido**, **Tons de cinza** ou **Preto e branco**. É possível girar, definir proporção A4, ampliar e reorganizar páginas sem reenviar os arquivos.
6. Na conta ADMIN, clique em **Salvar** para gravar o PDF no PostgreSQL. O título é opcional; se vazio, a API gera um título com data e hora. O limite do PDF salvo é 30 MB. O documento aparece na **biblioteca** abaixo do editor e continua disponível após atualizar a página ou entrar novamente. ADMIN e CONSULTA podem buscá-lo, visualizá-lo e baixá-lo.
7. Também é possível baixar o PDF visual ou PNG/JPG da página selecionada. OCR e revisão textual são opcionais em **Revisar texto**. Quando executado antes de salvar, o texto corrigido é armazenado separadamente e pode ser consultado na biblioteca. A imagem original e a digitalizada não são alteradas por essas correções.

O PDF gerado contém a imagem de cada página. **Ele não possui camada de texto pesquisável**; baixe o texto OCR separadamente quando precisar copiar ou pesquisar. A proporção automática usa as bordas detectadas; escolha A4 apenas se souber que o papel tem essa proporção. O modo preto e branco combina limiar adaptativo com a imagem em cinza para reduzir perdas, mas assinaturas e carimbos devem ser conferidos visualmente.

## Processamento e privacidade

`Scanner.tsx` controla as páginas e a interface. `scanner/engine.ts` reduz cada imagem para até 2.000 pixels no maior lado, corrige a orientação EXIF quando o navegador a fornece e envia pixels a um Web Worker. `scanner/scan.worker.ts` usa OpenCV.js para encontrar contornos quadriláteros, ajustar perspectiva, aplicar melhorias visuais e girar. Quando não há contorno confiável, usa os quatro limites da imagem; nunca descarta o conteúdo automaticamente sem aviso. O original permanece em memória até a página ser removida ou o painel ser fechado. O worker libera as matrizes OpenCV após cada operação.

O OCR usa Tesseract.js com o modelo português, acionado somente pelo usuário. Worker, núcleo WebAssembly e modelo são copiados de pacotes npm para `public/` durante `predev` e `prebuild`, portanto o processamento não depende de serviço externo de OCR. O worker Tesseract é encerrado após o reconhecimento. O PDF usa `pdf-lib`. Ao salvar, o painel envia o PDF visual e o texto OCR opcional à API com sessão e token CSRF. O Prisma grava os bytes em `ScannedDocument.content` no PostgreSQL, junto do título, número de páginas, autoria, data, tamanho e hash SHA-256. As fotos originais permanecem apenas na sessão do navegador; o arquivo persistente é o PDF corrigido. A API de arquivamento documental antiga usa `DocumentRecord` separadamente.

As rotas `GET /scans`, `GET /scans/:id` e `GET /scans/:id/file` exigem sessão ADMIN ou CONSULTA. `POST /scans` exige ADMIN e CSRF. O PDF é servido sem cache público. Não exponha a porta do PostgreSQL à internet; inclua `ScannedDocument` no plano de backup e restauração.

## Executar e testar

Na raiz do repositório, prepare e execute o Sistema 2 conforme [execução local](02-execucao-local.md). Para o frontend:

```bash
npm --prefix sistema-2/backend run db:generate
npm --prefix sistema-2/backend run db:migrate
npm --prefix sistema-2/frontend ci
npm --prefix sistema-2/frontend run dev
```

`npm --prefix sistema-2/frontend run build` compila o painel e copia os recursos locais de OpenCV/OCR. `npm --prefix sistema-2/frontend test` executa testes de geometria, seis cenários sintéticos de detecção e perspectiva, OCR com acentos e revisão textual, além de PDF visual com duas páginas sem OCR. Com o Vite aberto, `/scanner-test.html` executa esses cenários no navegador e exibe **PASSOU/FALHOU** para cada caso. O teste de navegador usa imagens sintéticas; fotos reais de aparelhos e navegadores diferentes ainda precisam de conferência visual.

Para abrir a câmera no celular, sirva o painel em HTTPS e acesse pelo telefone. O atributo `capture="environment"` solicita a câmera traseira quando o navegador oferece essa função. Em desenvolvimento por IP local, o seletor pode variar conforme o navegador e suas regras de contexto seguro.

## Limites atuais

- Não há importação direta de PDF como entrada, PDF pesquisável, detecção de fraude ou verificação de autenticidade oficial.
- A orientação EXIF e o botão **Girar 90°** cobrem fotos rotacionadas; não há classificação automática confiável da orientação do texto.
- O limite de 2.000 pixels reduz consumo de memória, mas pode limitar a nitidez de fotos muito grandes. O primeiro carregamento local de OpenCV/OCR pode demorar em aparelhos modestos.
- Bordas muito fracas ou fundo semelhante ao papel exigem ajuste manual. O resultado deve sempre ser conferido antes de ser compartilhado.
