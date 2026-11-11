# Ativar as integrações da FLAYR

Não colocar segredos no chat, no Git ou em variáveis `VITE_*`. Nenhuma credencial foi criada ou configurada nesta entrega.

## Ficheiros de configuração

1. Copiar `.env.example` para `.env`. Contém apenas `VITE_PUBLIC_ORIGIN`, a origem HTTPS final sem barra final. Deixar vazio durante a pré-visualização local.
2. Copiar `.dev.vars.example` para `.dev.vars` e preencher os valores de servidor. O ficheiro é ignorado pelo Git. O exemplo está completo e não contém chaves reais.
3. Em Cloudflare, configurar os segredos no Worker através de **Settings → Variables and Secrets** ou `wrangler secret put NOME`. Configurar os valores públicos não secretos e as flags em `wrangler.jsonc`/settings. Não deixar `APP_ORIGIN` com o endereço local na produção.

| Variável                                             | Conteúdo exato esperado                                                  | Visibilidade                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------- |
| `VITE_PUBLIC_ORIGIN`                                 | `https://` seguido do domínio final, sem caminho/barra final             | Pública, build                            |
| `APP_ORIGIN`                                         | Origem exata do navegador; local `http://127.0.0.1:5173`, produção HTTPS | Servidor                                  |
| `SUPABASE_URL`                                       | URL do projeto Supabase                                                  | Servidor                                  |
| `SUPABASE_PUBLISHABLE_KEY`                           | Chave publicável do mesmo projeto, usada pelo BFF de autenticação        | Servidor                                  |
| `SUPABASE_SERVICE_ROLE_KEY`                          | Chave administrativa do projeto                                          | Segredo                                   |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Endpoint REST e token da mesma base Redis                                | Servidor / segredo                        |
| `PII_KEY_V1`                                         | 32 bytes aleatórios, codificados em base64                               | Segredo; fazer cópia segura               |
| `STRIPE_PUBLISHABLE_KEY`                             | `pk_test_…` inicialmente; depois `pk_live_…`                             | Pública via `/api/config`                 |
| `STRIPE_SECRET_KEY`                                  | `sk_test_…` ou `sk_live_…`, da mesma conta e modo                        | Segredo                                   |
| `STRIPE_WEBHOOK_SECRET`                              | `whsec_…` do endpoint/Stripe CLI correspondente                          | Segredo                                   |
| `RESEND_API_KEY`                                     | Chave Resend com permissão de envio                                      | Segredo                                   |
| `EMAIL_FROM`                                         | `FLAYR <email@dominio-verificado>`                                       | Remetente visível nos emails              |
| `CONTACT_TO`                                         | Email real da caixa que recebe os pedidos de apoio                       | Privado, nunca na API pública             |
| `PUBLIC_SUPPORT_EMAIL`                               | Alias profissional que pode ser mostrado aos clientes                    | Deliberadamente público                   |
| `OPENAI_API_KEY`                                     | Chave do projeto OpenAI com orçamento/limites definidos                  | Segredo                                   |
| `OPENAI_MODEL`                                       | ID exato de um modelo disponível no projeto e compatível com Responses   | Servidor; sem modelo fictício predefinido |
| `STORE_SHIPPING_INFO`                                | Texto aprovado com destinos, transportadoras e prazos reais              | Informação pública usada pelo assistente  |
| `LEGAL_ENTITY_NAME`                                  | Denominação legal da entidade que vende                                  | Público apenas após aprovação             |
| `LEGAL_ENTITY_VAT`                                   | Identificação fiscal comercial                                           | Idem                                      |
| `LEGAL_ENTITY_ADDRESS`                               | Morada comercial legalmente válida                                       | Idem                                      |
| `LEGAL_ENTITY_EMAIL`                                 | Email profissional para contactos legais                                 | Idem                                      |
| `LEGAL_ENTITY_PHONE`                                 | Telefone profissional                                                    | Idem                                      |
| `LEGAL_ENTITY_PHONE_COST`                            | Indicação de custo da chamada aplicável à linha                          | Idem                                      |
| `LEGAL_ENTITY_ADR`                                   | Entidade RAL competente, morada/website e informação validada            | Idem                                      |
| `PUBLIC_BUSINESS_DETAILS_APPROVED`                   | `true` apenas depois de verificar os campos anteriores                   | Flag de aprovação                         |
| `LEGAL_APPROVED_VERSION`                             | `2026-10-21-v2` após completar/aprovar os textos legais PT/EN            | Flag de versão                            |
| `COMMERCE_ENABLED`                                   | `true` para ativar catálogo real e checkout após configuração            | Flag de operação                          |

`VITE_STRIPE_PUBLISHABLE_KEY` deixou de ser usado. A chave publicável Stripe é agora lida do servidor; nenhuma chave secreta é incluída no build. Uma chave com formato errado ou modos diferentes bloqueia o checkout.

Para gerar a chave de cifragem numa consola local: `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Guardar o resultado diretamente no gestor de segredos. Não substituir a chave de uma base com dados cifrados sem um plano de rotação/migração.

## Base de dados e ficheiros

Num projeto novo, executar `db/001_initial.sql` e depois `db/002_launch_audit.sql`. Numa instalação que já recebeu a primeira migração, aplicar **apenas** a segunda, após backup. A segunda adiciona traduções, gestão segura da fila de emails, atualização de produtos auditada e tratamento de falhas de pagamento. Foi validada em PostgreSQL local; não foi aplicada à tua conta.

Provisionar o administrador e o papel em `admin_roles`, TOTP e passkeys conforme `DEPLOYMENT.md`. Inserir/publicar produtos reais e variantes com preços/stock. As descrições inglesas podem ser guardadas no separador de tradução de cada produto.

Para uploads, criar um bucket R2 e adicionar `r2_buckets: [{"binding":"MEDIA","bucket_name":"NOME_REAL"}]` ao Wrangler. Não é necessário para as quatro imagens estáticas já incluídas. O cron `*/5 * * * *` já está configurado; não duplicar a propriedade.

## Stripe e privacidade pública

Usar uma sandbox e chaves de teste antes de live. Configurar Stripe Tax, códigos fiscais, registos e territórios reais. Ativar apenas métodos elegíveis que vão ser testados. Configurar o webhook `/api/stripe/webhook` para:

- `payment_intent.succeeded`
- `payment_intent.processing`
- `payment_intent.canceled`
- `payment_intent.payment_failed`

Para desenvolvimento, encaminhar eventos com a Stripe CLI para `http://127.0.0.1:8787/api/stripe/webhook` e usar o signing secret emitido por essa sessão. Validar cookies e redirecionamentos num ambiente HTTPS de teste antes de live; manter `Secure`, `HttpOnly` e `SameSite=Strict`.

Rever **Public details** e o descritor no painel Stripe. Usar identidade e contactos profissionais legítimos; os dados públicos de recibos/extratos não são controlados apenas pelo frontend. A Stripe precisa dos dados reais de verificação do titular, que não devem ser copiados para o site. [Configuração e dados públicos](https://docs.stripe.com/get-started/account/set-up).

Testar sucesso, recusa, 3DS, repetição do mesmo pedido, stock esgotado, atualização de preço, regresso do prestador, Multibanco ainda válido, falha assíncrona e webhook repetido. Usar exclusivamente os valores da [documentação de testes Stripe](https://docs.stripe.com/testing) em sandbox. Confirmar uma única encomenda, uma única reserva e um único email de confirmação.

## Resend

Verificar um domínio próprio e configurar os registos DNS indicados pela Resend, incluindo autenticação do domínio. Definir `EMAIL_FROM`, `CONTACT_TO` e o alias público. [Domínios Resend](https://resend.com/docs/dashboard/domains/introduction).

Enviar um pedido de teste pelo formulário; confirmar o registo, executar/aguardar a tarefa agendada e verificar entrega no painel e na caixa de apoio. Responder à mensagem deve dirigir a resposta ao cliente, nunca alterar o remetente verificado. Testar uma falha temporária e a nova tentativa com a mesma idempotency key.

Monitorizar `email_outbox` onde `sent_at is null`, especialmente `attempts >= 8` ou `first_attempt_at < now() - interval '23 hours'`. Confirmar no painel do prestador se houve entrega antes de reabrir manualmente uma tentativa antiga, para evitar duplicação. Criar alertas de bounce/falha na operação real.

## Assistente

Configurar `OPENAI_API_KEY` e `OPENAI_MODEL` com um modelo Responses disponível na conta, além do Redis. Definir orçamento e alertas no projeto. Preencher `STORE_SHIPPING_INFO` com informação aprovada, sem dados privados. A API não usa ferramentas de escrita nem pesquisa de encomendas por email.

Testar perguntas PT/EN, recomendações limitadas ao catálogo, falta de stock, prazos, instruções maliciosas, encomenda própria e tentativa de consulta de outra encomenda. Verificar streaming, interrupção e falha do prestador. Não partilhar cartões, palavras-passe ou moradas no chat; a filtragem de texto não garante anonimização completa. [Responses streaming](https://developers.openai.com/api/docs/guides/streaming-responses), [controlos de dados](https://developers.openai.com/api/docs/guides/your-data).

## Comandos e decisão de lançamento

```sh
npm ci
npm run check:config
npm test
npm run build
npm run check:worker
npm run dev
```

Com o Worker de demonstração a correr: `npm run check:routes`. `check:config` devolve código 1 enquanto faltarem valores; não é uma falha inesperada. `check:worker` é apenas compilação local, sem publicação. O cron não corre automaticamente em desenvolvimento; usar o mecanismo local de tarefas do Wrangler para testar a fila.

Só avançar para produção depois dos ensaios externos, da revisão legal/fiscal e dos pontos de `LAUNCH-GAPS.md`. A auditoria atual não publicou o projeto. Para produção, alinhar `APP_ORIGIN` e `VITE_PUBLIC_ORIGIN`, completar o conteúdo e definir as flags. A indexação é controlada pelo Worker; uma cópia estática de demonstração continua `noindex`.
