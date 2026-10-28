# Micaela & Elisa — publicação da página simples

## Página
`https://www.ajudar.charity/micaela` é a única página pública ativa. A raiz redireciona para `/micaela`.

## Imagens e conteúdo — configure no painel da Vercel
Vercel → **xp-ayments / micaela-don** → Settings → Environment Variables → **Production**:

| Variável | Valor |
|---|---|
| `APP_BASE_URL` | `https://ajudar.charity` (sem barra final) |
| `MICAELA_TITLE` | título da campanha |
| `MICAELA_SUBTITLE` | descrição curta do projeto |
| `MICAELA_BANNER_URL` | link público da fotografia de capa |
| `MICAELA_GALLERY_TOP` | URLs de 3–4 imagens separadas por vírgula ou nova linha |
| `MICAELA_GALLERY_BOTTOM` | URLs das restantes fotografias, separadas da mesma forma |
| `MICAELA_GIFT_DRIVE_1` | pasta presente 1: 30 fotografias / 5 vídeos |
| `MICAELA_GIFT_DRIVE_2` | pasta presente 2: 50 fotografias / 10 vídeos |
| `MICAELA_GIFT_DRIVE_3` | pasta presente 3: 100 fotografias / 20 vídeos |
| `MICAELA_GIFT_DRIVE_4` | pasta presente 4: até 500 fotografias / 20 vídeos |

As imagens do Google Drive devem ter a partilha **Qualquer pessoa com o link pode ver**. Use links de **ficheiros individuais** para banner/carrosséis. O código converte `https://drive.google.com/file/d/FILE_ID/view` para URLs de thumbnail. Não cole links de pastas no banner/carrossel. Se ainda não houver fotos configuradas, são apresentados espaços visuais de reserva.

As pastas de prenda são abertas **apenas depois** de um pagamento confirmado e da aceitação explícita do presente. Atenção: a restrição protege o acesso à página do presente; um link de pasta Google Drive partilhado posteriormente pode ser reenviado. Não coloque ali media privada sem autorizações.

## Pagamentos
As variáveis já utilizadas continuam necessárias: `DATABASE_URL`, `DIRECT_DATABASE_URL`, `MISTICPAY_CLIENT_ID`, `MISTICPAY_CLIENT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`.

Adicionalmente, para **Stripe embebido**: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (chave `pk_...`, publicável). Para testes usar todas as chaves da modalidade de teste, sem misturar chaves live/test.

- Brasil: PIX automático pela MisticPay, com CPF/CNPJ exigido pelo fornecedor. QR e código Copia e Cola; espera-se confirmação autenticada.
- Europa: Stripe Embedded Checkout, com recolha de dados de pagamento pela própria Stripe e confirmação somente por webhook. A Stripe pode solicitar e-mail dentro do checkout, mesmo quando opcional no formulário da campanha.
- E-mail do doador na página: opcional. Se a Stripe fornecer e-mail no Checkout autenticado, será registado na ordem. O envio automático via Resend só é possível quando existe e-mail.
- WhatsApp: número recolhido no checkout; no painel administrativo → **Pagamentos**, o operador pode copiar uma mensagem com o link privado, **apenas após confirmar o donativo**. O envio por WhatsApp é **manual**, não foi ligada qualquer automação de mensagens.
- A opção presente é voluntária. Escalões sugeridos BRL: 20/50/100/500; EUR: 5/10/20/100. Os presentes não são pagamento por produtos nem garantias de conteúdo; devem ser disponibilizados pela equipa conforme indicado.
- Ao não haver `MICAELA_GIFT_DRIVE_N`, a página protegida indica que a seleção está em preparação; não entrega ficheiros inexistentes.

## Verificação pré-produção
1. GitHub `mgjexpert/micaela-don` → comparar com `Job-Brasil/micaela-don` → integrar Pull Request na conta **Job-Brasil**, que alimenta a Vercel.
2. Confirmar que as migrações Supabase existentes foram realmente aplicadas e que há backup da BD. Não recriar o banco.
3. Verificar o dashboard MisticPay e a referência `PAY-mvp9cb9k-dnj` antes de efetuar outro teste pago. **Não repetir uma cobrança para recuperar a antiga.**
4. Confirmar que os endpoints recebem callbacks: `/api/webhook/misticpay` e `/api/webhooks/stripe`.
5. Testar em preview com envs isolados, depois promover/publicar e confirmar a rota `/micaela`.
6. Se o deploy automático falhar, reverter para o deployment anterior na Vercel.

**Não publicar nomes/dados pessoais adicionais ou fotos/vídeos de terceiros sem autorização.**
