import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPackDelivery } from '@/lib/notifications/delivery'
import { getCanonicalAppBaseUrl } from '@/lib/payments/urls'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'O seu Pack Media | Um Gesto de Apoio',
  robots: { index: false, follow: false, noarchive: true },
}
type PageProps = { params: Promise<{ token: string }> }

export default async function PackPage({ params }: PageProps) {
  const { token } = await params
  const pack = await getPackDelivery(token)
  if (!pack) notFound()
  const expires = new Intl.DateTimeFormat('pt-PT', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(pack.expiresAt)
  // Share the public campaign link, never the private delivery token.
  const publicCampaign = getCanonicalAppBaseUrl() + '/' + encodeURIComponent(pack.campaignSlug)
  return (
    <main className="min-h-screen bg-rose-50/40 px-4 py-10 text-stone-900 sm:py-16">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-rose-100 bg-white shadow-xl">
        <div className="bg-gradient-to-br from-rose-800 to-rose-600 px-8 py-12 text-white">
          <p className="text-xs font-bold uppercase tracking-[.23em] text-rose-100">Um Gesto de Apoio</p>
          <h1 className="mt-4 font-serif text-4xl font-bold sm:text-5xl">O seu Pack Media</h1>
          <p className="mt-3 text-rose-50">Obrigado por fazer parte da história de {pack.campaignName}.</p>
          <p className="mt-4 text-xs text-rose-100">Acesso privado disponível até {expires}.</p>
        </div>
        <div className="space-y-8 p-6 sm:p-9">
          <section>
            <h2 className="font-serif text-2xl font-semibold">Materiais para descarregar</h2>
            <p className="mt-2 text-sm text-stone-600">Preparámos um cartão de agradecimento e uma mensagem de partilha.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <a href={'/api/pack/' + token + '/card'} download="cartao-de-agradecimento.svg"
                className="rounded-xl border border-rose-200 bg-rose-50 p-5 transition-colors hover:bg-rose-100">
                <div className="text-3xl" aria-hidden="true">💗</div>
                <h3 className="mt-2 font-semibold">Cartão de agradecimento</h3>
                <p className="mt-1 text-sm text-stone-600">Imagem SVG de alta qualidade, pronta a guardar ou partilhar.</p>
                <span className="mt-4 inline-block text-sm font-semibold text-rose-800">Descarregar imagem</span>
              </a>
              <a href={'/api/pack/' + token + '/share'} download="mensagem-de-partilha.txt"
                className="rounded-xl border border-rose-200 bg-rose-50 p-5 transition-colors hover:bg-rose-100">
                <div className="text-3xl" aria-hidden="true">📣</div>
                <h3 className="mt-2 font-semibold">Mensagem de partilha</h3>
                <p className="mt-1 text-sm text-stone-600">Texto pronto a copiar e publicar nas redes sociais.</p>
                <span className="mt-4 inline-block text-sm font-semibold text-rose-800">Descarregar texto</span>
              </a>
            </div>
          </section>
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
            <h2 className="font-serif text-2xl font-semibold">A sua lembrança das duas amigas</h2>
            <p className="mt-2 text-sm text-stone-700">{pack.giftDescription}.</p>
            {pack.giftUrl ? (
              <a href={pack.giftUrl} target="_blank" rel="noopener noreferrer"
                className="mt-4 inline-flex rounded-xl bg-rose-700 px-5 py-3 font-semibold text-white hover:bg-rose-800">
                Abrir pasta privada da lembrança
              </a>
            ) : (
              <p className="mt-3 text-sm text-stone-600">A equipa está a organizar esta seleção. O acesso ao conteúdo será disponibilizado após a configuração da pasta correspondente.</p>
            )}
            <p className="mt-3 text-xs text-stone-600">Não partilhe esta ligação com terceiros. Os ficheiros externos seguem as permissões da pasta do Google Drive.</p>
          </section>
          {pack.materials.length > 0 && (
            <section>
              <h2 className="font-serif text-2xl font-semibold">Conteúdos da campanha</h2>
              <p className="mt-2 text-sm text-stone-600">Materiais digitais aprovados pela equipa responsável.</p>
              <ul className="mt-4 space-y-3">
                {pack.materials.map(material => (
                  <li key={material.id} className="rounded-xl border border-stone-200 p-4">
                    <a href={material.url} target="_blank" rel="noopener noreferrer"
                      className="font-semibold text-rose-800 underline underline-offset-2">
                      {material.name} — abrir conteúdo
                    </a>
                    <p className="mt-1 text-xs uppercase tracking-wide text-stone-500">{material.category}</p>
                    {material.description && <p className="mt-2 text-sm text-stone-600">{material.description}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="border-t border-stone-100 pt-6 text-sm text-stone-600">
            Quer conhecer a história ou partilhar a campanha?
            {' '}<a href={publicCampaign} className="font-semibold text-rose-800 underline">Abrir a campanha</a>.
          </p>
          <p className="text-xs text-stone-500">
            Este acesso é pessoal: não partilhe o URL do Pack Media. Partilhe apenas o endereço público da campanha.
          </p>
        </div>
      </div>
    </main>
  )
}
