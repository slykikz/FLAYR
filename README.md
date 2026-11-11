# FLAYR Commerce

Loja com identidade própria: imagens originais, carvão/lima, composição assimétrica, animações com respeito por movimento reduzido e experiência em português e inglês.

A auditoria de 21/10/2026 corrigiu o checkout, criou Contactos e o assistente IA, reviu o blog/SEO, acrescentou traduções e reforçou a privacidade e a entrega de emails. O código está validado localmente; os serviços externos precisam de credenciais e ensaios de integração. A loja permanece em demonstração e não recebe pagamentos.

## Começar

Node.js 22.12+ e npm:

```sh
npm ci
npm run dev
```

Este comando inicia a interface em `http://127.0.0.1:5173` e a API em `http://127.0.0.1:8787`. Não é necessário um segundo terminal. O catálogo conceptual funciona sem credenciais.

Copiar `.env.example` para `.env` (apenas configuração pública) e `.dev.vars.example` para `.dev.vars` (servidor). Preencher os valores conforme [ACTIVATION.md](docs/ACTIVATION.md). Nunca colocar segredos em variáveis `VITE_*`. Testar os cookies seguros num ambiente HTTPS antes de produção.

```sh
npm test
npm run build
npm run check:worker
npm run check:config
```

`check:config` identifica valores em falta sem imprimir segredos; falha enquanto a configuração estiver incompleta. `check:worker` empacota localmente, sem publicar. Com o servidor de demonstração ligado, `npm run check:routes` verifica páginas PT/EN, metadados, respostas 404 e regras de indexação.

## Ficheiros principais

| Ficheiro/pasta                                       | Responsabilidade                                               |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `src/main.tsx`, `catalog.ts`, `cart.ts`              | Navegação, produtos/variantes, saco e confirmação de pagamento |
| `src/checkout.tsx`                                   | Stripe Payment Element, validação e novas tentativas           |
| `src/styles.css`, `motion.tsx`                       | Identidade, responsive, ticker e microinterações               |
| `src/contact.tsx`, `assistant.tsx`                   | Formulário de apoio e chat com streaming                       |
| `src/i18n.ts`, `i18n-runtime/`, `locales/en.json`    | Idiomas, URLs e traduções da interface                         |
| `src/journal-page.tsx`, `seo.tsx`, `content/`        | Journal, metadados e conteúdo PT/EN                            |
| `src/admin.tsx`, `viewer.tsx`, `conversion.tsx`      | Administração, visualizador 3D e marketing consentido          |
| `server/index.ts`, `config.ts`                       | API, checkout, webhooks e configuração pública controlada      |
| `server/support.ts`, `jobs.tsx`, `payment-policy.ts` | Contactos/IA, Resend e reservas assíncronas                    |
| `server/seo.ts`                                      | HTML inicial, sitemap, robots, canonical e 404                 |
| `server/security.ts`, `auth-routes.ts`               | Cifragem, limites, sessões, TOTP, passkeys e permissões        |
| `db/001_initial.sql`, `002_launch_audit.sql`         | Migrações sequenciais, RLS, stock e fila de emails             |
| `scripts/`, `tests/`                                 | Desenvolvimento, build e verificações                          |
| `public/images/`                                     | Quatro imagens originais e versões WebP                        |

## Validação e ativação

Os testes cobrem preços por variante, stock, idempotência, webhooks, privacidade, autorização de encomendas, streaming, Resend simulado, cifragem, RLS e fila de emails. As migrações são executadas num PostgreSQL local em memória. Não são provas de funcionamento numa conta Stripe, Resend, OpenAI ou Supabase real.

O visualizador sem um modelo real continua identificado como conceptual. Métodos de pagamento automáticos dependem da elegibilidade/configuração Stripe. As minutas legais devem ser completadas e aprovadas antes de ativar a venda. Faturação fiscal, reembolsos e disputas exigem trabalho operacional adicional.

- [Relatório da auditoria e mapa de alterações](docs/PRE-LAUNCH-AUDIT.md)
- [Variáveis e ativação passo a passo](docs/ACTIVATION.md)
- [Instalação e operação](docs/DEPLOYMENT.md)
- [Pendências antes de vender](docs/LAUNCH-GAPS.md)
- [Minutas e fontes jurídicas](docs/LEGAL-TEMPLATES.md)

Esta auditoria não publicou o projeto, não migrou uma base de produção, não realizou pagamentos nem enviou emails a clientes.
