'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, Gift, Heart, Images, LockKeyhole, ShieldCheck } from 'lucide-react'
import { AdminApp } from '@/components/admin-app'
import { GIFT_DESCRIPTIONS, giftLevel } from '@/lib/micaela-gifts'

type Props = {
  title: string
  subtitle: string
  banner: string
  upper: string[]
  lower: string[]
  initialRegion: 'BR' | 'EU' | 'auto'
}
type PixResult = { reference: string; qrCodeImage: string | null; qrCode: string | null }
type StripeResult = { reference: string; clientSecret: string; publishableKey: string }
type StripeCheckoutHandle = { mount: (target: HTMLElement) => void; destroy: () => void }
type StripeInstance = { initEmbeddedCheckout: (options: { clientSecret: string }) => Promise<StripeCheckoutHandle> }
type StripeWindow = Window & { Stripe?: (key: string) => StripeInstance }

function PhotoCarousel({ items, label }: { items: string[]; label: string }) {
  const container = useRef<HTMLDivElement>(null)
  const slides = items.length ? items : ['', '', '']
  const scroll = (direction: number) => container.current?.scrollBy({ left: direction * 310, behavior: 'smooth' })
  return <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
    <div className="mb-5 flex items-center justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-[.23em] text-rose-700">Micaela & Elisa</p>
        <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-900 sm:text-3xl">{label}</h2></div>
      <div className="flex gap-2">
        <button aria-label="Fotografias anteriores" onClick={() => scroll(-1)} className="rounded-full border border-stone-300 bg-white p-2.5 hover:bg-stone-100"><ArrowLeft size={18}/></button>
        <button aria-label="Fotografias seguintes" onClick={() => scroll(1)} className="rounded-full border border-stone-300 bg-white p-2.5 hover:bg-stone-100"><ArrowRight size={18}/></button>
      </div>
    </div>
    <div ref={container} className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [scrollbar-width:thin]">
      {slides.map((url, index) => <div key={index} className="relative aspect-[9/16] w-[63vw] max-w-[270px] shrink-0 snap-start overflow-hidden rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-100 via-orange-50 to-stone-200">
        {url ? <img src={url} alt={'Fotografia da campanha ' + (index + 1)} loading="lazy" className="h-full w-full object-cover" /> :
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-rose-700/70">
            <Images size={38} strokeWidth={1.4}/><span className="text-xs font-semibold uppercase tracking-[.15em]">Fotografia {index + 1}</span>
          </div>}
      </div>)}
    </div>
  </section>
}

function StripeEmbedded({ payment }: { payment: StripeResult }) {
  const target = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    let checkout: StripeCheckoutHandle | null = null
    const mount = async () => {
      try {
        if (!(window as StripeWindow).Stripe) {
          await new Promise<void>((resolve, reject) => {
            const existing = document.querySelector('script[data-stripe-js]') as HTMLScriptElement | null
            if (existing && (window as StripeWindow).Stripe) return resolve()
            const script = existing ?? document.createElement('script')
            if (!existing) {
              script.src = 'https://js.stripe.com/v3/'
              script.async = true
              script.dataset.stripeJs = '1'
              document.head.appendChild(script)
            }
            script.addEventListener('load', () => resolve(), { once: true })
            script.addEventListener('error', () => reject(new Error('Não foi possível carregar o Stripe.')), { once: true })
          })
        }
        const createStripe = (window as StripeWindow).Stripe
        if (!createStripe) throw new Error('Stripe.js indisponível.')
        const instance = createStripe(payment.publishableKey)
        const embedded = await instance.initEmbeddedCheckout({ clientSecret: payment.clientSecret })
        if (cancelled) return embedded.destroy()
        checkout = embedded
        if (target.current) embedded.mount(target.current)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro no checkout.')
      }
    }
    void mount()
    return () => { cancelled = true; checkout?.destroy() }
  }, [payment.clientSecret, payment.publishableKey])
  return <div>
    <p className="mb-4 text-sm text-stone-600">Pagamento seguro processado pela Stripe, sem sair desta página.</p>
    {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : <div ref={target} className="min-h-[380px] w-full"/>}
    <p className="mt-3 break-all text-xs text-stone-500">Referência: {payment.reference}</p>
  </div>
}

export function MicaelaSimpleLanding(props: Props) {
  const [currency, setCurrency] = useState<'BRL' | 'EUR'>(props.initialRegion === 'BR' ? 'BRL' : 'EUR')
  const [amount, setAmount] = useState('50')
  const [name, setName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState('')
  const [wantGift, setWantGift] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pix, setPix] = useState<PixResult | null>(null)
  const [stripe, setStripe] = useState<StripeResult | null>(null)
  const [status, setStatus] = useState<'pending' | 'paid' | 'failed' | 'refunded'>('pending')
  const [adminOpen, setAdminOpen] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)
  const amountValue = Number(amount.replace(',', '.'))
  const gift = GIFT_DESCRIPTIONS[giftLevel(Number.isFinite(amountValue) ? amountValue : 0, currency) - 1]

  useEffect(() => {
    if (props.initialRegion !== 'auto') return
    const locale = navigator.language.toLowerCase()
    if (locale.endsWith('-br')) setCurrency('BRL')
  }, [props.initialRegion])

  useEffect(() => {
    const ref = pix?.reference || stripe?.reference
    if (!ref || status === 'paid' || status === 'refunded') return
    let active = true
    const check = async () => {
      try {
        const response = await fetch('/api/public/payment-status?ref=' + encodeURIComponent(ref), { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json()
        if (active && ['pending','paid','failed','refunded'].includes(data.status)) setStatus(data.status)
      } catch { /* keep pending until verified */ }
    }
    void check()
    const interval = window.setInterval(check, 9000)
    return () => { active = false; window.clearInterval(interval) }
  }, [pix?.reference, stripe?.reference, status])

  const switchCurrency = (next: 'BRL' | 'EUR') => {
    if (pix || stripe) return
    setCurrency(next)
    setAmount(next === 'BRL' ? '50' : '20')
    setError('')
  }
  const contribute = async (event: React.FormEvent) => {
    event.preventDefault()
    if (pix || stripe || loading) return
    setError('')
    if (!name.trim() || whatsapp.replace(/\D/g, '').length < 8) {
      return setError('Indique o nome e o número WhatsApp com indicativo.')
    }
    if (!Number.isFinite(amountValue) || amountValue < 1 || amountValue > (currency === 'BRL' ? 50000 : 10000)) {
      return setError('Escolha um valor válido (mínimo 1).')
    }
    if (currency === 'BRL' && ![11, 14].includes(cpf.replace(/\D/g, '').length)) {
      return setError('Para gerar o PIX, indique um CPF (11 dígitos) ou CNPJ (14 dígitos).')
    }
    setLoading(true)
    try {
      const method = currency === 'BRL' ? 'pix_automatic' : 'mbway'
      const intentResponse = await fetch('/api/public/donation-intent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: 'micaela', currency, amountMinor: Math.round(amountValue * 100),
          donorName: name.trim(), donorEmail: email.trim() || undefined,
          donorWhatsapp: whatsapp.trim(), donorCountry: currency === 'BRL' ? 'BR' : 'PT',
          paymentMethod: method, wantPackMedia: wantGift, consentChannels: [],
        }),
      })
      const intent = await intentResponse.json()
      if (!intentResponse.ok) throw new Error(intent.error || 'Não foi possível registar o donativo.')
      const checkoutResponse = await fetch(currency === 'BRL' ? '/api/payments/misticpay/create' : '/api/payments/stripe/create-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: 'micaela', donationIntentId: intent.id,
          amount: amountValue, currency, customerName: name.trim(),
          customerWhatsapp: whatsapp.trim(), customerEmail: email.trim() || undefined,
          ...(currency === 'BRL' ? { customerCpf: cpf.replace(/\D/g, '') } : { embedded: true }),
        }),
      })
      const payment = await checkoutResponse.json()
      if (!checkoutResponse.ok) throw new Error(payment.error || 'Pagamento indisponível.')
      if (currency === 'BRL') {
        if (!payment.reference || (!payment.qrCodeImage && !payment.qrCode)) throw new Error('O fornecedor não disponibilizou o PIX. Contacte-nos antes de tentar novamente.')
        setPix({ reference: payment.reference, qrCodeImage: payment.qrCodeImage, qrCode: payment.qrCode })
      } else {
        if (!payment.reference) throw new Error('Não foi possível registar a sessão Stripe.')
        if (payment.mode === 'hosted' && payment.checkoutUrl) {
          const url = new URL(payment.checkoutUrl)
          if (url.protocol !== 'https:' || (url.hostname !== 'checkout.stripe.com' && !url.hostname.endsWith('.stripe.com'))) {
            throw new Error('A Stripe devolveu um endereço não reconhecido. Não efetue o pagamento.')
          }
          window.location.assign(url.toString())
          return
        }
        if (!payment.clientSecret || !payment.publishableKey) {
          throw new Error('Stripe não devolveu credenciais suficientes para apresentar o checkout.')
        }
        setStripe({ reference: payment.reference, clientSecret: payment.clientSecret, publishableKey: payment.publishableKey })
      }
      setStatus('pending')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível iniciar o pagamento.')
    } finally { setLoading(false) }
  }
  const copyPix = async () => {
    if (!pix?.qrCode) return
    try { await navigator.clipboard.writeText(pix.qrCode) } catch { setError('Não foi possível copiar. Selecione o código manualmente.') }
  }

  const hasCheckout = Boolean(pix || stripe)
  return <main className="min-h-screen bg-[#fffaf7] text-stone-900">
    <header className="border-b border-rose-100 bg-white/90">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2 font-serif text-lg font-bold tracking-tight text-rose-800"><Heart size={21} fill="currentColor"/> Micaela & Elisa</div>
        <a href="#contribuir" className="rounded-full bg-rose-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-800">Quero contribuir</a>
      </div>
    </header>
    <section className="relative isolate min-h-[340px] overflow-hidden bg-gradient-to-br from-rose-950 via-rose-800 to-orange-800 text-white sm:min-h-[480px]">
      {props.banner ? <img src={props.banner} alt="Micaela e Elisa" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-55"/> :
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_70%_25%,rgba(251,191,193,.28),transparent_45%)]" />}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-rose-950/90 via-rose-950/50 to-transparent"/>
      <div className="mx-auto flex min-h-[340px] max-w-6xl flex-col justify-center px-5 py-14 sm:min-h-[480px] sm:px-6">
        <p className="mb-5 max-w-max rounded-full border border-white/30 px-4 py-1.5 text-xs font-semibold uppercase tracking-[.24em]">Uma história de amizade e apoio</p>
        <h1 className="max-w-3xl font-serif text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">{props.title}</h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-white/90 sm:text-lg">{props.subtitle}</p>
        <a href="#contribuir" className="mt-8 w-fit rounded-full bg-white px-7 py-3 font-semibold text-rose-800 shadow-lg hover:bg-rose-50">Apoiar este projeto</a>
      </div>
    </section>

    <PhotoCarousel items={props.upper} label="Momentos de uma amizade" />

    <section ref={sectionRef} id="contribuir" className="border-y border-rose-100 bg-white">
      <div className="mx-auto grid max-w-6xl gap-9 px-4 py-12 sm:px-6 md:grid-cols-[.85fr_1.15fr] md:py-16">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.22em] text-rose-700">Faça parte desta história</p>
          <h2 className="mt-3 font-serif text-4xl font-semibold leading-tight">Um gesto seu pode fazer a diferença.</h2>
          <p className="mt-5 text-stone-600">Esta é uma campanha pessoal de angariação de fundos para um projeto da Micaela e da Elisa. O contributo é inteiramente voluntário e pode escolher o valor com que se sente confortável.</p>
          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-rose-50 p-5 text-sm text-rose-950">
            <Gift className="mt-1 shrink-0" size={22}/>
            <p><strong>Uma lembrança das duas amigas.</strong> Se desejar, poderá receber uma seleção digital de fotografias e vídeos como forma de agradecimento, de acordo com o lote disponível para o seu apoio.</p>
          </div>
          <p className="mt-5 flex items-center gap-2 text-sm text-stone-500"><ShieldCheck size={17}/> O pagamento só é confirmado após validação do fornecedor.</p>
        </div>
        <div className="rounded-3xl border border-rose-100 bg-[#fffaf8] p-5 shadow-xl shadow-rose-950/5 sm:p-8">
          {status === 'paid' ? <div className="py-10 text-center">
            <CheckCircle2 className="mx-auto text-emerald-600" size={62}/>
            <h3 className="mt-5 font-serif text-3xl font-bold">Contribuição confirmada!</h3>
            <p className="mt-3 text-stone-600">Obrigado por apoiar a Micaela e a Elisa. A confirmação foi validada pelo fornecedor.</p>
            <p className="mt-4 text-sm text-stone-500">{wantGift ? 'Se indicou e-mail, receberá o link da lembrança quando os materiais estiverem disponíveis. Caso contrário, a equipa poderá contactar pelo WhatsApp informado.' : 'Obrigado pelo seu gesto.'}</p>
          </div> : pix ? <div>
            <h3 className="font-serif text-2xl font-semibold">PIX para apoiar</h3>
            <p className="mt-2 text-sm text-stone-600">Faça o pagamento no seu banco. A confirmação será atualizada automaticamente.</p>
            {pix.qrCodeImage && <img src={pix.qrCodeImage} alt="QR Code PIX da cobrança" className="mx-auto my-5 h-64 w-64 rounded-xl bg-white object-contain p-2"/>}
            {pix.qrCode && <div className="mt-4 flex gap-2"><input aria-label="Código PIX Copia e Cola" readOnly value={pix.qrCode} className="min-w-0 flex-1 rounded-lg border bg-white p-3 text-xs"/><button onClick={copyPix} aria-label="Copiar PIX" className="rounded-lg bg-rose-700 px-4 text-white"><Copy size={18}/></button></div>}
            <p className="mt-4 text-xs text-stone-600">Estado: {status === 'pending' ? 'Aguardando confirmação' : status === 'failed' ? 'Falhou — verifique o banco antes de repetir' : 'Devolvido'}. Referência: <code>{pix.reference}</code>.</p>
          </div> : stripe ? <div><h3 className="mb-4 font-serif text-2xl font-semibold">Checkout seguro · EUR</h3><StripeEmbedded payment={stripe}/></div> : <form onSubmit={contribute} className="space-y-4">
            <h3 className="font-serif text-2xl font-semibold">Escolha o seu apoio</h3>
            <div className="grid grid-cols-2 gap-2" aria-label="Local de pagamento">
              <button type="button" onClick={() => switchCurrency('BRL')} aria-pressed={currency === 'BRL'} className={'rounded-xl border p-3 text-sm font-bold ' + (currency === 'BRL' ? 'border-rose-700 bg-rose-700 text-white' : 'bg-white text-stone-600')}>🇧🇷 Brasil · PIX</button>
              <button type="button" onClick={() => switchCurrency('EUR')} aria-pressed={currency === 'EUR'} className={'rounded-xl border p-3 text-sm font-bold ' + (currency === 'EUR' ? 'border-rose-700 bg-rose-700 text-white' : 'bg-white text-stone-600')}>🇪🇺 Europa · Stripe</button>
            </div>
            <div>
              <label htmlFor="contrib-amount" className="mb-2 block text-sm font-semibold">Valor voluntário ({currency})</label>
              <div className="grid grid-cols-4 gap-2">
                {(currency === 'BRL' ? [20, 50, 100, 500] : [5, 10, 20, 100]).map(a => <button key={a} type="button" onClick={() => setAmount(String(a))} className={'rounded-lg border py-2 text-sm font-semibold ' + (Number(amount) === a ? 'border-rose-700 bg-rose-100 text-rose-900' : 'bg-white')}>{a}</button>)}
              </div>
              <input id="contrib-amount" type="number" min="1" step=".01" required value={amount} onChange={e => setAmount(e.target.value)} className="mt-2 w-full rounded-xl border border-stone-300 bg-white p-3"/>
            </div>
            <div><label htmlFor="contrib-name" className="mb-1 block text-sm font-semibold">Nome</label><input id="contrib-name" required maxLength={120} value={name} onChange={e => setName(e.target.value)} className="w-full rounded-xl border border-stone-300 bg-white p-3" placeholder="O seu nome"/></div>
            <div><label htmlFor="contrib-wa" className="mb-1 block text-sm font-semibold">WhatsApp (com indicativo)</label><input id="contrib-wa" required maxLength={40} type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className="w-full rounded-xl border border-stone-300 bg-white p-3" placeholder={currency === 'BRL' ? '+55 11 99999-9999' : '+351 912 345 678'}/></div>
            <div><label htmlFor="contrib-email" className="mb-1 block text-sm font-semibold">E-mail (opcional)</label><input id="contrib-email" type="email" maxLength={160} value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-xl border border-stone-300 bg-white p-3" placeholder="O seu e-mail"/></div>
            {currency === 'BRL' && <div><label htmlFor="contrib-cpf" className="mb-1 block text-sm font-semibold">CPF ou CNPJ (necessário para gerar PIX)</label><input id="contrib-cpf" required inputMode="numeric" maxLength={18} value={cpf} onChange={e => setCpf(e.target.value)} className="w-full rounded-xl border border-stone-300 bg-white p-3" placeholder="Documento solicitado pela MisticPay"/><p className="mt-1 text-xs text-stone-500">Enviado apenas ao fornecedor de pagamentos, não armazenado na nossa base.</p></div>}
            <label className="flex cursor-pointer gap-3 rounded-xl border border-rose-200 bg-white p-4">
              <input type="checkbox" checked={wantGift} onChange={e => setWantGift(e.target.checked)} className="mt-1 h-4 w-4 accent-rose-700"/>
              <span className="text-sm"><strong>Quero receber uma lembrança digital das amigas</strong><span className="mt-1 block text-xs text-stone-600">{gift}. Os materiais são enviados apenas após confirmação; disponibilidade e seleção comunicadas pela equipa. A lembrança é opcional e não altera o valor da contribuição.</span></span>
            </label>
            {wantGift && !email.trim() && <p className="text-xs text-amber-800">Sem e-mail, a entrega será coordenada manualmente através do WhatsApp indicado.</p>}
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-rose-700 p-4 font-bold text-white shadow-md hover:bg-rose-800 disabled:opacity-60">{loading ? 'A preparar pagamento…' : currency === 'BRL' ? 'Gerar PIX seguro' : 'Abrir checkout Stripe nesta página'}</button>
            <p className="flex items-center justify-center gap-1 text-xs text-stone-500"><LockKeyhole size={13}/> Pagamento seguro · Sem subscrição · Apoio voluntário</p>
          </form>}
        </div>
      </div>
    </section>

    <PhotoCarousel items={props.lower} label="Mais momentos para partilhar" />
    <footer className="border-t border-rose-100 bg-stone-950 px-4 py-10 text-center text-sm text-white/70">
      <p className="font-serif text-xl font-semibold text-white">Micaela & Elisa</p>
      <p className="mt-2">Obrigado por conhecerem e apoiarem este projeto pessoal.</p>
      <p className="mt-2">A contribuição é voluntária. O comprovativo de pagamento não constitui automaticamente recibo fiscal.</p>
      <button onClick={() => setAdminOpen(true)} className="mt-7 text-xs underline underline-offset-4 hover:text-white">Administração</button>
    </footer>
    {adminOpen && <AdminApp onClose={() => setAdminOpen(false)}/>}
  </main>
}
