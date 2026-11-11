# O que falta antes de vender

Esta entrega não é uma certificação de segurança, conformidade ou prontidão de produção. Há código implementado e validado localmente, mas faltam entradas reais e ensaios externos. A pré-visualização local é exclusivamente demonstrativa. Esta auditoria não publicou o projeto.

## Dados e serviços que não foram fornecidos

- Empresa, NIF, sede, registo, contactos e respetiva indicação de custo, entidade RAL competente e registo no Livro de Reclamações.
- Produtos comerciais, variantes, preços, stock, imagens finais, dimensões, composição, instruções e ficheiros GLB/GLTF reais.
- Credenciais e projetos Cloudflare/R2, Supabase, Stripe/Stripe Tax, Upstash, Resend e OpenAI.
- Registos fiscais, tratamento de regiões especiais, países efetivamente servidos e prazos/custos de transportadoras.

## Extensões necessárias para operação completa

- Faturação fiscal, reembolsos totais/parciais, disputas, devoluções físicas, notas de crédito e respetivos eventos. O CSV OSS é um auxiliar; não reconcilia reembolsos, ajustes nem substitui declaração fiscal.
- Rever e aprovar a versão dos termos. A aceitação e a versão já são persistidas na encomenda; ativar LEGAL_APPROVED_VERSION apenas após aprovação.
- Validar em sandbox os meios assíncronos: as referências Multibanco já respeitam a validade devolvida pela Stripe, com margem de dez minutos. Intents em processamento são reconciliados sem libertar stock prematuramente.
- Substituir os oito produtos conceptuais por produtos reais. O backoffice permite carregar uma fotografia por produto no R2; galerias de múltiplas imagens e imagens específicas por variante são uma extensão futura.
- Completar edição de conteúdo/variantes e campanhas no backoffice, devoluções, recuperação de conta e ferramentas de pedidos RGPD. O CRUD entregue cobre criação de produto com primeira variante, publicação/arquivo, preço, stock, GLB e expedição.
- Planear ciclos de promoções (início/fim e reposição de preço) e política para produtos novos. O histórico e a referência legal estão implementados; não inventar preços anteriores para ativar promoções.
- Newsletter: rever confirmação, lista de supressão, cancelamento de subscrição e política de retenção antes de enviar campanhas. Esta entrega inclui captação, confirmação explícita e cancelamento por link. O link de cancelamento é válido durante um ano; um futuro emissor de campanhas deve emitir links renovados e manter a lista de supressão. Não é uma plataforma completa de email marketing.
- Backups, restauração, retenção/apagamento RGPD, monitorização, recuperação de incidentes, rotação de chaves e controlo de acessos administrativos. Auditoria append-only por trigger não é imutabilidade contra o proprietário da base de dados; considerar exportação para armazenamento WORM.
- Revisão jurídica/fiscal das minutas e da implementação nacional da função de livre resolução aplicável em 2026. Os documentos incluem as fontes oficiais consultadas.

## Ensaios a executar com as contas reais

1. Aplicar as duas migrações, por ordem, num projeto Supabase de teste e validar RLS com anon, authenticated e cada papel administrativo.
2. Verificar TOTP, passkeys em dispositivos suportados, expiração/logout, revogação de acesso e cookies HTTPS.
3. Realizar compras de teste em todos os métodos ativados; testar webhooks duplicados/atrasados, falhas, cancelamentos e reconciliação.
4. Validar o preço por variante, o imposto por destino e região especial e a política de entrega real.
5. Validar entrega e conteúdo de emails, formulário de resolução e suporte duradouro.
6. Rever acessibilidade com teclado/leitor de ecrã, desempenho real, dispositivos móveis e modelos 3D reais.
7. Fazer revisão de segurança independente e teste de recuperação de backup.

Não foram realizados pagamentos reais, migrados dados de produção ou enviados emails a clientes durante a criação desta entrega.
