export function getCanonicalAppBaseUrl(value: string | undefined = process.env.APP_BASE_URL): string {
  if (!value) throw new Error('APP_BASE_URL não configurado no servidor.')
  let url: URL
  try { url = new URL(value) }
  catch { throw new Error('APP_BASE_URL inválido.') }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('APP_BASE_URL deve ser a origem HTTPS, sem caminho, query nem credenciais.')
  }
  return url.origin
}
