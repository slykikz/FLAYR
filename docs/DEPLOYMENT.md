# Instalação e operação

A lista completa de variáveis e o procedimento atualizado de ativação estão em [ACTIVATION.md](ACTIVATION.md).

## 1. Base de dados e autenticação

Cria um projeto Supabase numa região adequada ao tratamento de dados. Executa `db/001_initial.sql` e depois `db/002_launch_audit.sql` no editor SQL de um projeto novo. Se a primeira migração já foi aplicada, executa apenas a segunda após backup. Não apliques esta migração sobre tabelas de produção existentes. Faz backup e usa migrações incrementais para alterações futuras.

`schema.ts` é o espelho Drizzle para desenvolvimento; o SQL é a referência de instalação porque contém RLS, grants, triggers e funções que não são produzidos automaticamente pelo gerador Drizzle. Não uses `drizzle-kit push` para substituir as políticas de segurança.

Cria o utilizador administrativo no Supabase Auth, confirma o email e atribui o UUID real:

```sql
insert into public.admin_roles(user_id, role)
values ('UUID_REAL_DO_UTILIZADOR', 'owner');
```

Só um operador de base de dados autorizado deve atribuir funções. Não uses `user_metadata` como autorização. `owner` e `manager` podem gerir catálogo; `support` pode consultar encomendas e adicionar seguimento. O servidor exige nível `aal2` para todos estes acessos.

Configura TOTP e passkeys no Supabase. As passkeys do SDK utilizado ainda são experimentais: define RP ID estável, origens HTTPS exatas e testa os dispositivos suportados antes de lançamento. No primeiro login, o utilizador pode inscrever TOTP; o acesso ao backoffice só é concedido após verificação e confirmação da função na base de dados.

## 2. Segredos e domínio

Preenche `.dev.vars` localmente ou usa `wrangler secret put NOME` no ambiente de produção. Nunca comites esse ficheiro, a chave service role, segredos Stripe ou a chave AES. Apenas `VITE_PUBLIC_ORIGIN` pertence ao build público. A chave `STRIPE_PUBLISHABLE_KEY` é servida pela API de configuração; o prefixo antigo `VITE_STRIPE_PUBLISHABLE_KEY` deixou de ser utilizado. Não publiques os restantes valores com prefixo `VITE_`.

Gera `PII_KEY_V1` como 32 bytes aleatórios codificados em Base64 num gestor de segredos. A versão 1 usa AES-256-GCM, nonce aleatório de 96 bits e AAD que liga a cifra ao ID da encomenda/sessão. Guarda a chave fora da base de dados e mantém cópia de recuperação protegida. Uma rotação exige migração explícita para nova versão; alterar a chave sem migrar os dados torna-os ilegíveis.

Define `APP_ORIGIN` como origem HTTPS exata. As sessões de administração e de checkout usam cookies `__Host-`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`. Pedidos de escrita exigem origem exata; webhooks usam assinatura Stripe em vez de origem do navegador. Após redirecionamento de pagamento, a confirmação usa um pedido API da mesma origem.

## 3. Cloudflare, R2 e tarefas

`wrangler.jsonc` publica um Worker com assets estáticos. Este é o destino self-hosted pretendido. A configuração `.openai/hosting.json` serve apenas a pré-visualização privada no Sites, sem API de pagamentos.

Cria um bucket R2 e acrescenta à configuração Wrangler:

```json
"r2_buckets": [{"binding":"MEDIA","bucket_name":"NOME_REAL_DO_BUCKET"}]
```

O cron de cinco minutos já está configurado; não duplicar a propriedade `triggers`. O carregamento administrativo aceita GLB 2.0 até 8 MB, servido pela mesma origem. O visualizador também aceita GLTF quando o caminho do modelo é configurado e todos os recursos associados são alojados de forma compatível. Modelos reais têm de ser otimizados, verificados e dimensionados antes da publicação.

A tarefa agendada cancela intents abandonados antes de libertar stock e processa a caixa de saída de emails. Ativa monitorização para falhas, atrasos e encomendas em `review`. Intents em `processing` não são libertados automaticamente. Confirma o tratamento e prazo de cada meio assíncrono antes de ativá-lo.

Configura o Upstash Redis REST e os limites do plano. A indisponibilidade do rate limiter bloqueia escritas. Os tokens Supabase ficam cifrados no Redis e nunca são enviados ao JavaScript do navegador. As sessões opacas expiram em uma hora; não há login social nem recuperação de palavra-passe implementados nesta versão.

## 4. Stripe e impostos

Usa primeiro chaves de teste. Ativa os meios de pagamento pretendidos no dashboard; valida disponibilidade atual para uma conta portuguesa e EUR. O Payment Element mostra os métodos elegíveis automaticamente; Apple Pay e Google Pay exigem domínio/dispositivo/configuração adequados. Não significa que todos os métodos apareçam ao mesmo comprador.

Configura Stripe Tax, códigos fiscais reais dos produtos, registos de IVA/OSS e países servidos. Os preços apresentados são montantes brutos; a API calcula o imposto com destino de entrega e inclui o custo de envio. Um número VIES válido não concede isenção automática: a API de validação existe, mas uma venda B2B com tratamento especial requer regras fiscais e documentação próprias. Não uses taxa zero por defeito quando o VIES falhar.

Configura o webhook em `https://TEU_DOMINIO/api/stripe/webhook` para `payment_intent.succeeded`, `payment_intent.processing`, `payment_intent.canceled` e `payment_intent.payment_failed`. Guarda o signing secret correto. O handler usa o corpo bruto, valida assinatura, moeda, montante e associação à encomenda. O SQL trata idempotência e impede que eventos atrasados anulem uma encomenda paga. O estado `payment_failed` deixa a encomenda pendente para nova tentativa até reconciliação.

Testa duplicação, eventos fora de ordem, timeout entre reserva e criação de intent, esgotamento de stock, pagamento recusado, autenticação 3DS, redirecionamento, métodos assíncronos e falhas de email. Só ativa live mode depois de passar os cenários. Reembolsos, disputas e reconciliação fiscal completa ainda necessitam de extensão específica (ver LAUNCH-GAPS).

## 5. Emails, conteúdo e lançamento

Verifica o domínio de envio na Resend e define remetente válido. React Email gera mensagens transacionais e a caixa de saída usa leases, idempotência e novas tentativas limitadas. Monitoriza mensagens não entregues; ver limites e recuperação em `ACTIVATION.md`. A confirmação de pagamento não é uma fatura fiscal. Liga um sistema de faturação conforme as obrigações reais da empresa.

Preenche as minutas em `content/*.mdx`, os campos `LEGAL_ENTITY_*`, política de portes, materiais, tamanhos e catálogo real. Os avisos de minuta devem ser removidos apenas após revisão. A versão dos termos e o momento da aceitação são persistidos por encomenda. Após a revisão, define LEGAL_APPROVED_VERSION com o valor de TERMS_VERSION em shared/commerce.ts; sem essa correspondência o checkout permanece bloqueado.

Para SEO do domínio próprio, define `VITE_PUBLIC_ORIGIN` durante o build e a mesma origem em `APP_ORIGIN` no Worker. As páginas de blog e legais são pré-renderizadas; o endpoint `/api/blog/og?title=...` gera imagens com `@vercel/og`. MDX é código de confiança do repositório; nunca compiles MDX enviado por visitantes.

Depois das validações e verificações em LAUNCH-GAPS, configura `COMMERCE_ENABLED=true`. Este interruptor, por si só, não garante prontidão operacional.

## Custos

Os planos gratuitos são pontos de partida, não garantia de custo zero. Cloudflare Workers tem limites de pedidos/CPU, R2 limita armazenamento e operações, Supabase limita recursos e pode suspender projetos inativos, Upstash e Resend têm quotas. Stripe e Stripe Tax podem cobrar taxas; o domínio e faturação também podem ter custo. Não existe promessa de tráfego ilimitado ou ausência de faturação inesperada. Configura limites, alertas e acompanha os planos atuais.

Fontes: [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Supabase passkeys](https://supabase.com/docs/guides/auth/passkeys), [Supabase server auth](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [Stripe payment method support](https://docs.stripe.com/payments/payment-methods/payment-method-support).
