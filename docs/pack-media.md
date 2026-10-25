# Pack Media — implementação funcional

A versão candidata inclui um Pack Media digital **sem migrações novas**. Após um donativo pago e com seleção explícita pelo doador, o servidor cria uma ligação privada válida durante sete dias. A ligação chega no e-mail transacional de agradecimento e abre \`/pack/<token>\`.

## Conteúdo incluído
1. Cartão de agradecimento SVG em 1200 × 630, gerado para o nome da campanha e descarregável.
2. Texto de partilha TXT que aponta apenas para a campanha pública, nunca para o token de entrega.
3. Todos os materiais **aprovados e publicados** nessa campanha, cujos links sejam HTTPS e sejam válidos.

Os itens 1 e 2 funcionam mesmo que o catálogo de materiais da campanha ainda esteja vazio. O catálogo adicional é atualizado através do painel de administração, usando "Materiais" e a aprovação/publicação já existentes.

## Segurança
- Token aleatório (24 bytes / 192 bits) registado em \`delivery_link\`, válido durante sete dias.
- O acesso exige uma \`PaymentOrder\` **paid**, \`DonationIntent.wantPackMedia=true\`, campanha correspondente e token válido.
- O token não é consumido por bots de pré-visualização de e-mail; funciona durante todo o prazo.
- Sem enumeração de conteúdo por referências previsíveis; página noindex e descargas no-store.
- Links externos apenas HTTPS, com \`noopener noreferrer\`. Conteúdo não publicado ou não aprovado não aparece.
- Um reembolso torna o link inválido imediatamente.
- A disponibilização só é feita após webhook validado ou confirmação administrativa; não é ativada ao submeter um formulário.
- Reutiliza \`DeliveryLink\` e \`OutboundMessage\`, sem alterar schema.

## Configuração de envio
- Configure \`APP_BASE_URL\` para a origem HTTPS real do deploy e \`RESEND_API_KEY\` / \`EMAIL_FROM\` no Vercel.
- \`getCanonicalAppBaseUrl()\` valida a origem; nenhuma callback ou URL de entrega vem do browser.
- Testar recebimento por e-mail, clique do token, descarga dos 2 ficheiros, material adicional aprovado, expiração e reembolso.

## Limitações explícitas
- Os materiais externos dependem dos acessos e permissões do Google Drive/YouTube/origem; links privados mal configurados podem exigir login.
- Este pack contém os dois materiais gerados e os recursos aprovados; **não é ainda um ZIP multimédia nem um sistema de armazenamento privado de vídeos/PDFs**.
- Pagamentos e e-mail reais exigem as credenciais e a base de dados da instalação existente.
