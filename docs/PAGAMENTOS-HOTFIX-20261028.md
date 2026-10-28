# Micaela & Elisa — diagnóstico rápido dos pagamentos

Este hotfix evita gerar cobranças com um ambiente incompleto e apresenta os motivos verificáveis sem expor segredos.

## Ler primeiro, sem efetuar pagamentos

Depois de integrado em `Job-Brasil/main` e publicado na Vercel, abrir:

`https://www.ajudar.charity/api/public/checkout-readiness`

O JSON retorna `database`, `campaign`, `baseUrl`, `pix.ready/reason` e `stripe.ready/reason`. A consulta **não cria pagamentos** e não mostra credenciais.

- `database:false`: verificar `DATABASE_URL`, conectividade e as migrações versionadas de `campaign`, `donation_intent`, `payment_order`, `payment_event`. Fazer backup antes de migrar. Não aplicar `prisma db push` de forma cega.
- `campaign:false`: garantir que a linha `campaign.id='micaela'` existe e está `published`.
- `baseUrl:false`: corrigir `APP_BASE_URL` para origem HTTPS, por exemplo `https://ajudar.charity` sem `/micaela`.
- `pix.ready:false`: verificar novas chaves `pk_…/sk_…` com `TRANSACTION_CREATE` e `TRANSACTION_READ`. Pode reutilizar nomes `MISTICPAY_CLIENT_ID` e `MISTICPAY_CLIENT_SECRET` ou usar `MISTICPAY_ACCESS_KEY_ID`, `MISTICPAY_ACCESS_KEY_SECRET`. Não expor valores. A documentação da MisticPay informa que ci_/cs_ deixaram de funcionar em 30/09/2026.
- `stripe.ready:false`: validar `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`. Para embutir a Stripe, usar `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (ou `STRIPE_PUBLISHABLE_KEY`), de modo compatível com test/live da chave secreta. Sem publicável, o checkout abrirá na página alojada pela Stripe em vez de ficar bloqueado.

**Importante:** `ready:true` verifica configurações e esquema, **não testa se credenciais foram revogadas ou se os fornecedores processam transações**. Para homologação final, consultar logs da Vercel e painéis MisticPay/Stripe e fazer testes autorizados.

## Pagamento anterior
Não repetir a cobrança `PAY-mvp9cb9k-dnj`. Validar no dashboard MisticPay e, caso conste na base, usar a reconciliação do painel administrativo.

## Vercel
A ligação ChatGPT disponível não possui acesso à equipa `xp-ayments`. A atualização do repositório por PR não comprova que o deployment do domínio tenha ocorrido. Verificar no Vercel o commit da produção, estado do deployment e logs de API. Não enviar segredos pelo chat.
