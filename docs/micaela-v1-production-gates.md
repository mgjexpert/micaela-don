# Micaela DON V1 — passagem a produção (27-10-2026)

## Alcance da V1
Uma só campanha, `micaela`, em `https://www.ajudar.charity/micaela`. O modelo `Campaign` é conservado para expansão futura, sem ativar gestão multitenant nem criar outras campanhas.

Repositório de produção: `Job-Brasil/micaela-don`. Repositório de desenvolvimento: `mgjexpert/micaela-don`. Projeto Vercel: `xp-ayments/micaela-don`.

## P0: gates de produção — nenhum merge sem as verificações
- [ ] Identificar o deployment ativo do domínio `www.ajudar.charity`, seu commit e a branch de produção na Vercel; guardar link do rollback.
- [ ] Confirmar que `APP_BASE_URL=https://ajudar.charity` é a origem HTTPS canónica e que o callback MisticPay `/api/webhook/misticpay` recebe POST sem bloqueio Cloudflare.
- [ ] **Backup comprovado** da base PostgreSQL real antes de executar migrações.
- [ ] Verificar nas tabelas reais `campaign`, `donation_intent`, `payment_order`, `payment_event`, `delivery_link`, `outbound_message` e colunas `campaign_id`, `amount_minor`, `want_pack_media`; aplicar as migrações versionadas **uma única vez**, de forma auditada. Não executar `prisma db push` cegamente em produção.
- [ ] Verificar se `/api/health` responde `ready`, e se a campanha pública apresenta imagens e métodos corretos.
- [ ] Conferir permissões MisticPay `TRANSACTION_READ` e `TRANSACTION_CREATE` e credenciais atuais **sem revelar valores**.
- [ ] Conferir Stripe e subscrição de webhooks; não prometer MB WAY se a conta não estiver elegível.
- [ ] Confirmar Resend e remetente verificado; confirmar comunicação transacional separada de marketing.

## Reconciliação do pagamento já realizado
**Referência:** `PAY-mvp9cb9k-dnj`. NÃO criar uma nova cobrança.

1. Consultar `/api/admin/payments?reference=PAY-mvp9cb9k-dnj` com sessão admin e localizar `PaymentOrder`.
2. No painel MisticPay, verificar identificador externo, método PIX, valor BRL e estado; registar o resultado administrativo sem dados bancários sensíveis.
3. No separador `Pagamentos`, usar `Verificar MisticPay`. O endpoint de recuperação chama o fornecedor com credenciais do servidor e só confirma com identidade, tipo, moeda e valor coincidentes.
4. Verificar `PaymentOrder.status`, `DonationIntent.confirmed`, `deliveryStatus` e registo `OutboundMessage`; se o pagamento estiver confirmado e o doador tiver aderido, recuperar o Pack Media via painel, sem novo pagamento.
5. Guardar evidência dos resultados e da comunicação enviada.

## Homologação funcional
- [ ] Fluxo PIX: QR e Copia e Cola correspondem ao mesmo pagamento; o ecrã muda para confirmado quando o fornecedor confirma; não há duplicação por webhook/polling.
- [ ] PIX pendente/falhado/devolvido não dispara envio nem desbloqueia materiais.
- [ ] Checkout Stripe EUR abre em domínio oficial e só confirma após webhook verificado.
- [ ] Painel de pagamentos pesquisa por referência, mostra montante e estados de entrega, e reconcilia sem manipulação manual do campo `paid`.
- [ ] E-mail de agradecimento chega; falhas são identificadas, sem reverter uma doação paga; Pack Media só abre para pagamento confirmado e consentimento explícito.
- [ ] Mobile/desktop, conteúdos e imagens aprovados, contacto, privacidade, acessibilidade e ligações.
- [ ] Smoke tests em preview/staging ligado a uma base isolada; só depois produção.

## Limites conhecidos e pós-V1
- A `main` do fork e o GitHub de produção não acionam o mesmo deployment.
- A API de pagamentos mostra 100 ordens recentes; a procura por referência é exata, com consulta à base.
- O Pack Media é um MVP técnico (cartão SVG/texto mais materiais aprovados), não um pack editorial premium.
- A estrutura multicampanha necessita de melhorias antes de poder alojar campanhas independentes (chaves compostas, gestão por campanha, isolamento de administradores e configuração de pagamentos).
- Não declarar a campanha operacional apenas porque o CI compilou: precisa de prova do ciclo completo e de reconciliação de uma transação real.
