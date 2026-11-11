# FLAYR — auditoria e preparação de lançamento

Data: 21 de outubro de 2026. Trabalho realizado no projeto local `outputs/flayr`.

**Resultado:** correções de código e novas funcionalidades implementadas; a ativação comercial continua dependente de credenciais, dados comerciais aprovados e testes nas contas reais. Não foram efetuados pagamentos, enviados emails a clientes, aplicadas migrações remotas ou publicados ficheiros nesta auditoria.

## 1. Checkout e pagamentos

Problemas corrigidos:

- O comando de desenvolvimento iniciava apenas a interface. Agora `npm run dev` inicia Vite e o Worker, com a origem local correta e encaminhamento `/api`.
- O checkout dependia de uma chave Stripe inserida durante o build. Agora recebe apenas a chave publicável através de `/api/config`, com verificação de modo teste/live e disponibilidade.
- A procura por produto+tamanho era ambígua quando existiam várias cores. A seleção guarda `variantId`, cor e preço da variante; o servidor valida a combinação exata e usa os preços da base de dados. A venda complementar passa pela escolha do produto/variante.
- A chave de idempotência mantinha-se mesmo com alterações no formulário. Agora só é reutilizada para o mesmo conteúdo; o servidor continua a ligá-la ao navegador e à impressão digital do pedido.
- O estado de pagamento era consultado uma única vez. Agora há consultas limitadas e confirmação pelo servidor. Apenas as quantidades compradas são removidas do saco, uma vez por compra; voltar a uma encomenda antiga preserva os novos artigos. O segredo do pagamento é removido da URL e nunca guardado no armazenamento do navegador.
- As reservas Multibanco respeitam a expiração fornecida pela Stripe, com margem de dez minutos; pagamentos `processing` não libertam stock. A reconciliação recupera pagamentos concluídos cujo webhook se atrasou. Falhas de pagamento permitem nova tentativa, sem reverter encomendas já pagas.
- Corrigido o overflow do formulário em telemóvel.

O Payment Element continua a apresentar meios elegíveis ativados na conta: cartões, MB WAY, Multibanco e outros meios suportados pela configuração Stripe. A disponibilidade de cada método e das wallets exige verificação real da conta, país, moeda e domínio. Não foi feita essa verificação sem credenciais. A contagem de stock e a confirmação da encomenda continuam no servidor.

Ficheiros: `src/checkout.tsx`, `src/main.tsx`, `src/cart.ts`, `src/catalog.ts`, `src/api.ts`, `server/index.ts`, `server/config.ts`, `server/jobs.tsx`, `server/payment-policy.ts`, `db/002_launch_audit.sql`, `scripts/dev.mjs`, `wrangler.jsonc`.

## 2. Privacidade do proprietário

`server/config.ts` usa uma lista explícita de campos públicos. Não envia chaves, dados de autenticação, a caixa privada de apoio ou dados da conta Stripe. `CONTACT_TO` é privado; `PUBLIC_SUPPORT_EMAIL` é um alias público da marca. Os campos `LEGAL_ENTITY_*` só são expostos quando `PUBLIC_BUSINESS_DETAILS_APPROVED=true`. Não foram preenchidos com dados pessoais inventados.

A privacidade não pode ser garantida escondendo a identificação que a lei exige ao vendedor. Preencher os campos legais com a entidade comercial e contactos profissionais verdadeiros. Se o vendedor for uma pessoa singular, validar quais os dados que têm de ser divulgados e a solução empresarial adequada antes de vender.

Na Stripe, os dados públicos da empresa são independentes das chaves do site: nome comercial, apoio, morada, website e descritor podem aparecer em recibos ou extratos. Rever em **Settings → Public details**, usar os contactos profissionais da FLAYR e inspecionar um recibo e um pagamento de teste. Não usar informação fictícia nem remover dados obrigatórios. Não alterámos a tua conta Stripe. [Documentação Stripe](https://docs.stripe.com/get-started/account/set-up), [descritores](https://docs.stripe.com/get-started/account/statement-descriptors).

## 3. Identidade e movimento

Mantidas as imagens originais criadas para a FLAYR; sem fotografias ou logótipos Nike. A apresentação usa carvão/lima, grelha deslocada, área de campanha com moldura assimétrica e composição própria. Foram adicionadas revelações ao entrar no ecrã, estados de interação e ticker contínuo. A barra desaparece ao descer e reaparece ao subir. Pode ser pausada e respeita `prefers-reduced-motion`; o conteúdo continua acessível sem animação.

Ficheiros: `src/motion.tsx`, `src/styles.css`, `src/main.tsx`.

## 4. Blog e SEO

Artigos em PT/EN, links reais entre índice e artigos, página inexistente com HTTP 404 no Worker, título/descrição/OG/Twitter/canonical por rota e alternativos `hreflang`. As 50 rotas de conteúdo e experiência são pré-renderizadas. O Worker gera sitemap de rotas públicas e produtos ativos, aplica metadados aos produtos reais e serve conteúdo inicial do catálogo. Páginas administrativas, checkout, favoritos, estado de pagamento e newsletter ficam fora da indexação. A demonstração inteira mantém `noindex` e robots bloqueado; só a loja comercial configurada abre a indexação.

Corrigido um ciclo de redirecionamento entre diretórios pré-renderizados e URLs sem barra final. O tratamento de URLs está explícito em `assets.html_handling`. As fontes foram reduzidas aos caracteres latinos necessários para PT/EN; o visualizador 3D e páginas secundárias continuam a carregar sob pedido.

Ficheiros: `shared/seo.ts`, `src/seo.tsx`, `src/journal.tsx`, `src/journal-page.tsx`, `content/en/`, `server/seo.ts`, `scripts/build-pages.mjs`, `scripts/prerender.mjs`, `vite.config.ts`, `public/_redirects`, `wrangler.jsonc`.

## 5. Contacto e Resend

Nova página `/contact` e `/en/contact`, com validação, consentimento, campo antispam, erros acessíveis e referência de receção. `POST /api/contact` regista um pedido cifrado na fila; repetir o mesmo identificador não duplica mensagens. A confirmação significa **registado**, não garante entrega na caixa de correio.

A tarefa agendada reclama mensagens com bloqueio temporário, recua entre tentativas e reutiliza a chave de idempotência Resend. O remetente é sempre o domínio verificado; o visitante vai em `reply_to`. A fila não tenta automaticamente por mais de 23 horas ou oito tentativas, para evitar reenviar indefinidamente além da janela de idempotência do prestador. É necessário monitorizar os pedidos não enviados. A aceitação da API não prova entrega na inbox; verificar os estados de entrega/bounce no painel Resend. [Envio de email](https://resend.com/docs/api-reference/emails/send-email), [domínio verificado](https://resend.com/docs/dashboard/domains/introduction), [idempotência](https://resend.com/changelog/idempotency-keys).

A newsletter também passou a exigir confirmação explícita por POST; leitores automáticos de links já não subscrevem alguém. O email de confirmação inclui cancelamento de subscrição. Antes de enviar campanhas, integrar a lista de supressão e renovar links de cancelamento (os atuais têm validade de um ano); o envio de campanhas não faz parte do motor transacional.

Ficheiros: `src/contact.tsx`, `src/newsletter.tsx`, `server/support.ts`, `server/jobs.tsx`, `server/index.ts`, `db/schema.ts`, `db/002_launch_audit.sql`.

## 6. Idiomas

Português de Portugal e inglês, com seletor acessível na navegação, rota inglesa `/en`, conservação da página, parâmetros, favoritos e saco ao mudar idioma. Formatação monetária e nomes dos países acompanham o idioma. Textos da loja, checkout, apoio, administração e páginas legais usam o dicionário e conteúdo MDX localizado.

O runtime JSX traduz apenas texto e atributos de apresentação de elementos HTML; não modifica IDs, valores de formulários, filtros ou credenciais. Novos textos devem ser acrescentados a `src/locales/en.json` ou usar `t()`. Para produtos reais, a descrição e o destaque ingleses são guardados em `products.translations.en`; o backoffice inclui edição desses campos. Se a tradução de um produto novo estiver vazia, é apresentado o conteúdo original. A revisão editorial das duas línguas continua necessária para conteúdo comercial futuro.

Ficheiros: `src/i18n.ts`, `src/i18n-runtime/`, `src/locales/en.json`, `content/en/`, `src/legal.tsx`, `src/admin.tsx`, `src/catalog.ts`, `tsconfig.json`, `vite.config.ts`.

## 7. Assistente de IA

Widget de apoio com respostas em streaming via OpenAI Responses API, configurável por `OPENAI_MODEL`. Usa catálogo ativo, informação de envio aprovada e estado de encomenda verificado pelo cookie do checkout. Não disponibiliza pesquisa de encomendas por email/número público nem altera encomendas, pagamentos ou reembolsos. As credenciais ficam no Worker. Pedidos limitados a seis por minuto por IP, histórico limitado, timeout e limite de resposta.

O frontend informa que é IA e disponibiliza contacto humano. Sem chave/modelo configurados, mostra indisponibilidade explicitamente. A redação básica de emails/números não elimina toda a PII possível em texto livre. `store:false` evita o armazenamento de resposta dessa funcionalidade, mas não equivale a uma garantia de retenção zero por parte do prestador; rever controlos, contrato e política de privacidade antes da ativação. [Streaming oficial](https://developers.openai.com/api/docs/guides/streaming-responses), [controlos de dados](https://developers.openai.com/api/docs/guides/your-data).

Ficheiros: `src/assistant.tsx`, `server/support.ts`, `shared/stream.ts`, `server/types.ts`, `content/privacidade.mdx`, `content/en/privacidade.mdx`.

## Validação e limites

- TypeScript e build finais concluídos, com 50 rotas pré-renderizadas. O Worker final respondeu às verificações HTTP locais. Um dry-run anterior passou; a repetição final do empacotamento e da consulta de vulnerabilidades npm não foi executada porque a revisão automática de permissões atingiu o limite de utilização. Não foi uma classificação da ação como insegura.
- 33 testes automáticos passaram em cinco ficheiros de `tests/`: cifragem, origem, RLS, permissões, stock, idempotência, eventos fora de ordem, preços históricos, privacidade de configuração, validação de contacto, fila, Resend simulado, streaming, idiomas, checkout simulado, Multibanco e preservação dos novos artigos no saco.
- `npm run check:routes`: 43 verificações HTTP de rotas, metadados e 404, mais configuração, sitemap e robots, contra o Worker local.
- Navegador: Home, troca PT/EN, menu móvel, journal e artigo, contacto, assistente indisponível, produto → tamanho → saco → checkout, e largura móvel de 390 px sem overflow. Barra verificada a desaparecer ao descer e regressar ao subir. Sem erros/avisos no registo da sessão final da versão compilada.
- `npm run check:config` identifica os nomes das variáveis em falta sem imprimir valores secretos. Neste projeto ainda não existe configuração real.

Nenhum destes testes substitui a compra em sandbox Stripe com 3DS e cada método pretendido, entrega real Resend, autenticação Supabase provisionada, aplicação das migrações remotas ou resposta de um modelo OpenAI contratado. A ativação exige os passos de `ACTIVATION.md`. Faturação fiscal, reembolsos/disputas e processos operacionais restantes estão descritos em `LAUNCH-GAPS.md`.
