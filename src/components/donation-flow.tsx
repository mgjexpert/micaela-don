'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import {
  Heart,
  Check,
  ShieldCheck,
  Loader2,
  Landmark,
  QrCode,
  CreditCard,
  Copy,
  Package,
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'

type PaymentMethodsResponse = {
  methods: {
    mbway: { available: boolean; currencies: string[]; reason?: string | null }
    pix_automatic: { available: boolean; currencies: string[]; reason?: string | null }
    pix_manual: { available: boolean; currencies: string[]; beneficiaryName?: string | null }
    bank_transfer: {
      available: boolean
      currencies: string[]
      holder?: string | null
      bank?: string | null
      iban?: string | null
      bic?: string | null
    }
  }
  suggestedAmounts: Record<string, number[]>
  limits: Record<string, { minMinor: number; maxMinor: number }>
}

type Step = 1 | 2 | 3 | 4 | 5

const COUNTRY_LABELS: Record<string, string> = {
  PT: 'Portugal',
  BR: 'Brasil',
  ES: 'Espanha',
  FR: 'França',
  DE: 'Alemanha',
  GB: 'Reino Unido',
  US: 'Estados Unidos',
  OUTRO: 'Outro país',
}

const METHOD_LABELS: Record<string, { label: string; icon: typeof Landmark; desc: string }> = {
  mbway: { label: 'MB WAY', icon: CreditCard, desc: 'Pagamento instantâneo via Stripe' },
  pix_automatic: { label: 'PIX Automático', icon: QrCode, desc: 'QR Code gerado automaticamente' },
  pix_manual: { label: 'PIX Manual', icon: QrCode, desc: 'QR Code e código Copia e Cola' },
  bank_transfer: { label: 'Transferência Bancária', icon: Landmark, desc: 'IBAN (SEPA)' },
}

export function DonationFlow({ campaignId, campaignName }: { campaignId: string; campaignName: string }) {
  const [step, setStep] = useState<Step>(1)
  const [methods, setMethods] = useState<PaymentMethodsResponse | null>(null)
  const [loadingMethods, setLoadingMethods] = useState(true)

  // Form state
  const [currency, setCurrency] = useState<'EUR' | 'BRL'>('EUR')
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [cpf, setCpf] = useState('')
  const [country, setCountry] = useState('PT')
  const [paymentMethod, setPaymentMethod] = useState<string>('')
  const [wantPackMedia, setWantPackMedia] = useState(false)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ id: string; paymentMethod: string; qrCodeImage?: string; qrCode?: string } | null>(null)
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null)
  const [stripeLoading, setStripeLoading] = useState(false)
  const checkoutRef = useRef<{ destroy: () => void } | null>(null)

  useEffect(() => {
    fetch(`/api/public/payment-methods?campaignId=${encodeURIComponent(campaignId)}`)
      .then((r) => r.json())
      .then((d) => setMethods(d))
      .catch(() => {})
      .finally(() => setLoadingMethods(false))
  }, [campaignId])

  // Cleanup: destroy Stripe embedded checkout when component unmounts
  useEffect(() => {
    return () => {
      if (checkoutRef.current) {
        checkoutRef.current.destroy()
        checkoutRef.current = null
      }
    }
  }, [])

  // Mount embedded Checkout only after React has rendered its container.
  useEffect(() => {
    if (!stripeClientSecret) return
    let cancelled = false
    setStripeLoading(true)
    const mount = async () => {
      try {
        const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
        if (!key) throw new Error('Stripe não configurado no frontend.')
        const stripe = await loadStripeScript(key)
        if (!stripe) throw new Error('Falha a carregar Stripe.js.')
        if (cancelled) return
        const checkout = await stripe.initEmbeddedCheckout({ clientSecret: stripeClientSecret })
        if (cancelled) { checkout.destroy(); return }
        checkout.mount('#stripe-checkout-container')
        checkoutRef.current = checkout
      } catch {
        if (!cancelled) toast.error('Não foi possível apresentar o pagamento. Tente novamente.')
      } finally {
        if (!cancelled) setStripeLoading(false)
      }
    }
    void mount()
    return () => {
      cancelled = true
      checkoutRef.current?.destroy()
      checkoutRef.current = null
    }
  }, [stripeClientSecret])

  // Auto-suggest country from Accept-Language (no geolocation)
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const lang = navigator.language || navigator.languages?.[0] || ''
      if (lang.toLowerCase().startsWith('pt')) {
        // Distinguish pt-PT vs pt-BR
        if (lang.toLowerCase().includes('br')) setCountry('BR')
        else setCountry('PT')
      }
    }
  }, [])

  const amountMinor = useMemo(() => {
    if (customAmount) return Math.round(Number(customAmount) * 100)
    if (selectedAmount) return Math.round(selectedAmount * 100)
    return 0
  }, [selectedAmount, customAmount])

  const amountMajor = amountMinor / 100
  const formattedAmount = useMemo(() => {
    return new Intl.NumberFormat(currency === 'BRL' ? 'pt-BR' : 'pt-PT', {
      style: 'currency',
      currency,
    }).format(amountMajor)
  }, [amountMajor, currency])

  const limits = methods?.limits?.[currency] ?? { minMinor: 100, maxMinor: 1000000 }
  const suggested = methods?.suggestedAmounts?.[currency] ?? (currency === 'BRL' ? [20, 50, 100, 200] : [5, 10, 20, 50])

  // Available methods for this currency
  const availableMethods = useMemo(() => {
    if (!methods) return []
    return Object.entries(methods.methods)
      .filter(([, info]) => info.available && info.currencies.includes(currency))
      .map(([key, info]) => ({ key, ...info }))
  }, [methods, currency])

  // Auto-select currency based on country
  const handleCountryChange = (c: string) => {
    setCountry(c)
    if (c === 'BR') setCurrency('BRL')
    else setCurrency('EUR')
    setPaymentMethod('')
    setSelectedAmount(null)
    setCustomAmount('')
  }

  const canProceedStep1 = amountMinor >= limits.minMinor && amountMinor <= limits.maxMinor
  const canProceedStep2 = name.trim().length >= 2 && /\S+@\S+\.\S+/.test(email) && (!whatsapp || /^\+?\d{8,15}$/.test(whatsapp.replace(/[\s\-()]/g, '')))
  const canProceedStep3 = availableMethods.some((method) => method.key === paymentMethod) && (paymentMethod !== 'pix_automatic' || /^\d{11}$|^\d{14}$/.test(cpf.replace(/\D/g, '')))

  const submit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/public/donation-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          currency,
          amountMinor,
          donorName: name.trim(),
          donorEmail: email.trim(),
          donorWhatsapp: whatsapp.trim() || undefined,
          donorCountry: country,
          paymentMethod,
          wantPackMedia,
          message: message.trim() || undefined,
          consentChannels: [], // transaction receipts do not require marketing opt-in
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Erro')

      // If Stripe MB WAY, create embedded checkout session
      if (paymentMethod === 'mbway') {
        const stripeRes = await fetch('/api/payments/stripe/create-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaignId,
            donationIntentId: data.id,
            amount: amountMajor,
            currency,
            customerEmail: email.trim(),
            customerName: name.trim(),
          }),
        })
        const stripeData = await stripeRes.json()
        if (!stripeRes.ok || !stripeData.clientSecret) {
          throw new Error(stripeData?.error ?? 'Não foi possível iniciar o checkout Stripe.')
        }
        setStripeClientSecret(stripeData.clientSecret)
        return
      }

      // If PixGo PIX automatic, create charge and show QR inline
      if (paymentMethod === 'pix_automatic') {
        // Determine provider: MisticPay (preferred) or PixGo (fallback)
        const pixgoRes = await fetch('/api/public/payment-methods?campaignId=' + encodeURIComponent(campaignId))
        const pixgoMethods = await pixgoRes.json()
        const pixProvider = pixgoMethods?.methods?.pix_automatic?.provider ?? 'misticpay'

        const createUrl = pixProvider === 'misticpay'
          ? '/api/payments/misticpay/create'
          : '/api/payments/pixgo/create'

        const pixgoRes2 = await fetch(createUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaignId,
            donationIntentId: data.id,
            amount: amountMajor,
            currency: 'BRL',
            customerEmail: email.trim(),
            customerName: name.trim(),
            customerCpf: cpf.trim(),
            description: `Apoio — ${campaignName}`,
          }),
        })
        const pixgoData = await pixgoRes2.json()
        if (!pixgoRes2.ok) {
          toast.error('Erro ao gerar PIX automático', {
            description: 'Não foi possível criar a cobrança PIX. Tente o PIX Manual ou outro método.',
          })
          return
        }
        if (!pixgoData.qrCodeImage && !pixgoData.qrCode) throw new Error('O fornecedor não devolveu um QR Code PIX.')
        setResult({
          id: pixgoData.reference ?? data.id,
          paymentMethod: 'pix_automatic',
          qrCodeImage: pixgoData.qrCodeImage ?? undefined,
          qrCode: pixgoData.qrCode ?? undefined,
        })
        return
      }

      // Create a manual PIX order so administrators can verify and confirm it.
      if (paymentMethod === 'pix_manual') {
        const manualResponse = await fetch('/api/payments/manual-pix/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaignId, donationIntentId: data.id, amount: amountMajor, currency: 'BRL',
            customerName: name.trim(), customerEmail: email.trim(),
            customerWhatsapp: whatsapp.trim() || undefined, message: message.trim() || undefined,
          }),
        })
        const manualData = await manualResponse.json()
        if (!manualResponse.ok) throw new Error(manualData?.error ?? 'Erro ao criar PIX manual.')
        setResult({ id: manualData.reference ?? data.id, paymentMethod: 'pix_manual' })
        return
      }

      setResult({ id: data.id, paymentMethod: data.paymentMethod })
      // For manual methods, show confirmation
      toast.success('Intenção registada', {
        description: 'Aguarde confirmação. Este formulário não comprova pagamento.',
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao submeter')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingMethods) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> A preparar métodos de pagamento…
      </div>
    )
  }

  // Stripe embedded checkout — show inline iframe
  if (stripeClientSecret) {
    return (
      <Card className="overflow-hidden border-stone-200/70 shadow-sm dark:border-stone-800/70">
        <CardHeader className="border-b bg-gradient-to-r from-rose-50 to-amber-50/50 pb-4 dark:from-rose-950/20 dark:to-amber-950/10">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CreditCard className="h-5 w-5 text-rose-600" />
            Pagamento MB WAY
          </CardTitle>
          <CardDescription>Complete o pagamento na janela abaixo. O apoio só é confirmado após validação.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {stripeLoading && (
            <div className="flex items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> A carregar o checkout seguro…
            </div>
          )}
          <div id="stripe-checkout-container" className="min-h-[400px]" />
        </CardContent>
      </Card>
    )
  }

  // PixGo PIX automatic — show QR inline
  if (result && result.paymentMethod === 'pix_automatic') {
    return <PixGoPaymentResult result={result} campaignName={campaignName} />
  }

  if (result && (result.paymentMethod === 'pix_manual' || result.paymentMethod === 'bank_transfer')) {
    return <ManualPaymentResult result={result} methods={methods} paymentMethod={result.paymentMethod} campaignName={campaignName} campaignId={campaignId} />
  }

  return (
    <Card className="overflow-hidden border-stone-200/70 shadow-sm dark:border-stone-800/70">
      <CardHeader className="border-b bg-gradient-to-r from-rose-50 to-amber-50/50 pb-4 dark:from-rose-950/20 dark:to-amber-950/10">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Heart className="h-5 w-5 text-rose-600" />
              Apoiar esta campanha
            </CardTitle>
            <CardDescription className="mt-1">{campaignName}</CardDescription>
          </div>
          <StepIndicator step={step} />
        </div>
      </CardHeader>

      <CardContent className="p-6">
        {step === 1 && (
          <Step1Value
            currency={currency}
            setCurrency={setCurrency}
            selectedAmount={selectedAmount}
            setSelectedAmount={setSelectedAmount}
            customAmount={customAmount}
            setCustomAmount={setCustomAmount}
            suggested={suggested}
            limits={limits}
            formattedAmount={formattedAmount}
            canProceed={canProceedStep1}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <Step2Donor
            name={name} setName={setName}
            email={email} setEmail={setEmail}
            whatsapp={whatsapp} setWhatsapp={setWhatsapp}
            country={country} setCountry={handleCountryChange}
            message={message} setMessage={setMessage}
            canProceed={canProceedStep2}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <Step3Method
            currency={currency}
            availableMethods={availableMethods}
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            canProceed={canProceedStep3}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
            cpf={cpf} setCpf={setCpf}
          />
        )}

        {step === 4 && (
          <Step4PackMedia
            wantPackMedia={wantPackMedia}
            setWantPackMedia={setWantPackMedia}
            hasMaterials={false}
            onBack={() => setStep(3)}
            onNext={() => setStep(5)}
          />
        )}

        {step === 5 && (
          <Step5Summary
            campaignName={campaignName}
            formattedAmount={formattedAmount}
            currency={currency}
            paymentMethod={paymentMethod}
            name={name}
            email={email}
            wantPackMedia={wantPackMedia}
            submitting={submitting}
            onBack={() => setStep(4)}
            onSubmit={submit}
          />
        )}
      </CardContent>
    </Card>
  )
}

function StepIndicator({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Etapa ${step} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <div
          key={n}
          className={`h-2 w-2 rounded-full transition-colors ${
            n <= step ? 'bg-rose-600' : 'bg-muted-foreground/30'
          }`}
        />
      ))}
    </div>
  )
}

function StepHeader({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="mb-6">
      <Badge variant="secondary" className="mb-2 gap-1">
        Etapa {n}
      </Badge>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  )
}

function Step1Value({
  currency, setCurrency, selectedAmount, setSelectedAmount, customAmount, setCustomAmount,
  suggested, limits, formattedAmount, canProceed, onNext,
}: {
  currency: string
  setCurrency: (c: 'EUR' | 'BRL') => void
  selectedAmount: number | null
  setSelectedAmount: (n: number | null) => void
  customAmount: string
  setCustomAmount: (s: string) => void
  suggested: number[]
  limits: { minMinor: number; maxMinor: number }
  formattedAmount: string
  canProceed: boolean
  onNext: () => void
}) {
  const symbol = currency === 'BRL' ? 'R$' : '€'
  return (
    <div>
      <StepHeader n={1} title="Escolha o valor" desc="Selecione um valor sugerido ou introduza um valor personalizado." />
      <div className="mb-4">
        <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">Moeda</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={currency === 'EUR' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setCurrency('EUR'); setSelectedAmount(null); setCustomAmount('') }}
          >
            € EUR
          </Button>
          <Button
            type="button"
            variant={currency === 'BRL' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setCurrency('BRL'); setSelectedAmount(null); setCustomAmount('') }}
          >
            R$ BRL
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {suggested.map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => { setSelectedAmount(amt); setCustomAmount('') }}
            className={`relative rounded-xl border-2 p-4 text-center transition-all hover:border-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-950/10 ${
              selectedAmount === amt && !customAmount
                ? 'border-rose-600 bg-rose-50 dark:bg-rose-950/20'
                : 'border-stone-200 dark:border-stone-800'
            }`}
          >
            {selectedAmount === amt && !customAmount && (
              <Check className="absolute right-2 top-2 h-4 w-4 text-rose-600" />
            )}
            <div className="text-lg font-bold">{symbol} {amt}</div>
          </button>
        ))}
      </div>

      <div className="mt-4">
        <Label htmlFor="custom-amount" className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
          Outro valor
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{symbol}</span>
          <Input
            id="custom-amount"
            type="number"
            min={(limits.minMinor / 100).toFixed(2)}
            max={(limits.maxMinor / 100).toFixed(2)}
            step="0.01"
            value={customAmount}
            onChange={(e) => { setCustomAmount(e.target.value); setSelectedAmount(null) }}
            placeholder="0.00"
            className="pl-8"
          />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Mínimo {symbol} {(limits.minMinor / 100).toFixed(2)} · Máximo {symbol} {(limits.maxMinor / 100).toFixed(2)}
        </p>
      </div>

      {canProceed && (
        <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
          <span className="text-sm text-muted-foreground">Valor selecionado</span>
          <span className="text-lg font-bold text-rose-700 dark:text-rose-400">{formattedAmount}</span>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button onClick={onNext} disabled={!canProceed} className="gap-1">
          Continuar <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function Step2Donor({
  name, setName, email, setEmail, whatsapp, setWhatsapp, country, setCountry,
  message, setMessage, canProceed, onBack, onNext,
}: {
  name: string; setName: (s: string) => void
  email: string; setEmail: (s: string) => void
  whatsapp: string; setWhatsapp: (s: string) => void
  country: string; setCountry: (c: string) => void
  message: string; setMessage: (s: string) => void
  canProceed: boolean
  onBack: () => void; onNext: () => void
}) {
  return (
    <div>
      <StepHeader n={2} title="Os seus dados" desc="Precisamos do seu nome e email para enviar a confirmação." />
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="d-name">Nome *</Label>
          <Input id="d-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="O seu nome" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="d-email">Email *</Label>
          <Input id="d-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={160} placeholder="email@exemplo.com" required />
          <p className="text-xs text-muted-foreground">Necessário para enviar a confirmação e o agradecimento.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="d-whats">WhatsApp (opcional)</Label>
            <Input id="d-whats" type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} maxLength={40} placeholder="+351 912 345 678" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="d-country">País / Região</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger id="d-country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(COUNTRY_LABELS).map(([code, label]) => (
                  <SelectItem key={code} value={code}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="d-msg">Mensagem (opcional)</Label>
          <Textarea id="d-msg" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={2} placeholder="Palavra de apoio (opcional)" />
        </div>
      </div>

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Button>
        <Button onClick={onNext} disabled={!canProceed} className="gap-1">
          Continuar <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function Step3Method({
  currency, availableMethods, paymentMethod, setPaymentMethod, canProceed, onBack, onNext,
  cpf, setCpf,
}: {
  currency: string
  availableMethods: Array<{ key: string; available: boolean; currencies: string[]; [k: string]: unknown }>
  paymentMethod: string
  setPaymentMethod: (m: string) => void
  canProceed: boolean
  onBack: () => void; onNext: () => void
  cpf: string; setCpf: (s: string) => void
}) {
  const cpfRequired = paymentMethod === 'pix_automatic'
  const cpfValid = !cpfRequired || /^\d{11}$|^\d{14}$/.test(cpf.replace(/\D/g, ''))

  return (
    <div>
      <StepHeader n={3} title="Método de pagamento" desc={`Métodos disponíveis para ${currency}.`} />
      {availableMethods.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Nenhum método de pagamento automático disponível para esta moeda.</p>
            <p className="mt-1">Pode ainda registar uma intenção de pagamento manual. A confirmação será administrativa.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {availableMethods.map((m) => {
            const info = METHOD_LABELS[m.key]
            if (!info) return null
            const Icon = info.icon
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setPaymentMethod(m.key)}
                className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all hover:border-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-950/10 ${
                  paymentMethod === m.key
                    ? 'border-rose-600 bg-rose-50 dark:bg-rose-950/20'
                    : 'border-stone-200 dark:border-stone-800'
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  paymentMethod === m.key ? 'bg-rose-600 text-white' : 'bg-muted text-muted-foreground'
                }`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{info.label}</span>
                    {m.key === 'pix_manual' && <Badge variant="secondary" className="text-xs">Manual</Badge>}
                    {m.key === 'bank_transfer' && <Badge variant="secondary" className="text-xs">SEPA</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{info.desc}</p>
                </div>
                {paymentMethod === m.key && <Check className="h-5 w-5 text-rose-600" />}
              </button>
            )
          })}
        </div>
      )}

      {/* CPF field — appears when PIX Automático is selected */}
      {cpfRequired && (
        <div className="mt-4 max-w-md rounded-xl border-2 border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
          <Label htmlFor="d-cpf" className="mb-1.5 block">CPF/CNPJ *</Label>
          <Input
            id="d-cpf"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            maxLength={18}
            placeholder="000.000.000-00"
            className={cpfValid ? '' : 'border-red-400'}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Necessário para gerar o PIX automático. Será enviado ao fornecedor e não armazenado.
          </p>
          {!cpfValid && cpf && (
            <p className="mt-1 text-xs text-red-600">CPF deve ter 11 ou 14 dígitos.</p>
          )}
        </div>
      )}

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Button>
        <Button onClick={onNext} disabled={!canProceed || (cpfRequired && !cpfValid)} className="gap-1">
          Continuar <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function Step4PackMedia({
  wantPackMedia, setWantPackMedia, hasMaterials, onBack, onNext,
}: {
  wantPackMedia: boolean
  setWantPackMedia: (v: boolean) => void
  hasMaterials: boolean
  onBack: () => void; onNext: () => void
}) {
  return (
    <div>
      <StepHeader n={4} title="Pack Media de agradecimento" desc="Receba os materiais digitais de agradecimento da campanha." />
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-all hover:border-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-950/10">
        <Checkbox
          checked={wantPackMedia && hasMaterials}
          disabled={!hasMaterials}
          onCheckedChange={(v) => setWantPackMedia(hasMaterials && v === true)}
          className="mt-0.5"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-rose-600" />
            <span className="font-semibold">Quero receber o Pack Media de agradecimento pelo meu apoio.</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            O pack contém os materiais digitais de agradecimento disponibilizados pela campanha.
            Será entregue por email após confirmação do pagamento.
          </p>
          {!hasMaterials && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              O Pack Media será disponibilizado após publicação dos materiais e validação da entrega digital.
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Esta opção não constitui consentimento para comunicações promocionais.
          </p>
        </div>
      </label>

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Button>
        <Button onClick={onNext} className="gap-1">
          Continuar <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function Step5Summary({
  campaignName, formattedAmount, currency, paymentMethod, name, email, wantPackMedia,
  submitting, onBack, onSubmit,
}: {
  campaignName: string
  formattedAmount: string
  currency: string
  paymentMethod: string
  name: string
  email: string
  wantPackMedia: boolean
  submitting: boolean
  onBack: () => void
  onSubmit: () => void
}) {
  const methodInfo = METHOD_LABELS[paymentMethod]
  return (
    <div>
      <StepHeader n={5} title="Resumo" desc="Confirme os dados antes de avançar para o pagamento." />
      <div className="space-y-3 rounded-xl border bg-muted/30 p-5">
        <SummaryRow label="Campanha" value={campaignName} />
        <SummaryRow label="Valor" value={formattedAmount} />
        <SummaryRow label="Moeda" value={currency} />
        <SummaryRow label="Método" value={methodInfo?.label ?? paymentMethod} />
        <SummaryRow label="Nome" value={name} />
        <SummaryRow label="Email" value={email} />
        <SummaryRow label="Pack Media" value={wantPackMedia ? 'Sim' : 'Não'} />
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>O apoio só será marcado como confirmado após validação do pagamento por notificação do fornecedor ou confirmação administrativa.</span>
      </div>

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-1" disabled={submitting}>
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Button>
        <Button onClick={onSubmit} disabled={submitting} className="gap-2">
          {submitting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> A processar…</>
          ) : (
            <>Confirmar e pagar <ArrowRight className="h-4 w-4" /></>
          )}
        </Button>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

function ManualPaymentResult({
  result, methods, paymentMethod, campaignName, campaignId,
}: {
  result: { id: string; paymentMethod: string }
  methods: PaymentMethodsResponse | null
  paymentMethod: string
  campaignName: string
  campaignId: string
}) {
  const [copied, setCopied] = useState(false)
  const bank = methods?.methods.bank_transfer
  const pix = methods?.methods.pix_manual

  const copyIban = async () => {
    if (bank?.iban) {
      try {
        await navigator.clipboard.writeText(bank.iban)
        setCopied(true)
        toast.success('IBAN copiado')
        setTimeout(() => setCopied(false), 1500)
      } catch {
        toast.error('Não foi possível copiar')
      }
    }
  }

  return (
    <Card className="border-emerald-200 dark:border-emerald-900">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
          <Check className="h-8 w-8 text-emerald-600" />
        </div>
        <CardTitle className="text-xl">Intenção registada</CardTitle>
        <CardDescription>
          Recebemos a sua intenção de apoio a <strong>{campaignName}</strong>.
          A confirmação é administrativa — este registo não comprova pagamento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {paymentMethod === 'pix_manual' && pix?.available && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Pagamento via PIX:</p>
            {pix.beneficiaryName && <p className="text-sm text-muted-foreground">Beneficiário: {pix.beneficiaryName}</p>}
            <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-4">
              <img src={`/api/public/pix-qr?campaignId=${encodeURIComponent(campaignId)}`} alt="QR Code PIX" className="h-48 w-48 rounded-lg border bg-white p-2" />
              <p className="text-xs text-muted-foreground">Leia o QR Code com a sua app de banco para pagar.</p>
            </div>
          </div>
        )}
        {paymentMethod === 'bank_transfer' && bank?.available && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Dados para transferência (IBAN):</p>
            {bank.holder && <CopyRow label="Titular" value={bank.holder} />}
            {bank.bank && <CopyRow label="Banco" value={bank.bank} />}
            {bank.iban && <CopyRow label="IBAN" value={bank.iban} mono onCopy={copyIban} copied={copied} />}
            {bank.bic && <CopyRow label="BIC/SWIFT" value={bank.bic} mono />}
          </div>
        )}
        <Separator />
        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <p>Referência: <code className="font-mono">{result.id.slice(0, 12)}</code></p>
          <p className="mt-1">Após efetuar o pagamento, a confirmação será feita administrativamente. Obrigado pelo seu apoio.</p>
        </div>
      </CardContent>
    </Card>
  )
}

function CopyRow({ label, value, mono, onCopy, copied }: { label: string; value: string; mono?: boolean; onCopy?: () => void; copied?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`truncate text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</div>
      </div>
      {onCopy && (
        <Button variant="outline" size="sm" onClick={onCopy} className="shrink-0">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      )}
    </div>
  )
}

function PixGoPaymentResult({ result, campaignName }: { result: { id: string; paymentMethod: string; qrCodeImage?: string; qrCode?: string }; campaignName: string }) {
  const [copied, setCopied] = useState(false)
  const image = result.qrCodeImage?.startsWith('/9j/')
    ? `data:image/jpeg;base64,${result.qrCodeImage}` : result.qrCodeImage
  const code = result.qrCode

  const copy = async () => {
    if (code) {
      try {
        await navigator.clipboard.writeText(code)
        setCopied(true)
        toast.success('Código PIX copiado')
        setTimeout(() => setCopied(false), 1500)
      } catch {
        toast.error('Não foi possível copiar')
      }
    }
  }

  return (
    <Card className="border-emerald-200 dark:border-emerald-900">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
          <QrCode className="h-8 w-8 text-emerald-600" />
        </div>
        <CardTitle className="text-xl">PIX Automático</CardTitle>
        <CardDescription>
          {campaignName} — Pague com o seu app de banco
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {image && (
          <div className="flex flex-col items-center gap-3">
            <img
              src={image}
              alt="QR Code PIX"
              className="h-64 w-64 rounded-lg border bg-white p-3"
            />
            <p className="text-xs text-muted-foreground">Leia o QR Code com a sua app de banco para pagar.</p>
          </div>
        )}
        {code && (
          <div className="space-y-2">
            <Label>PIX Copia e Cola</Label>
            <div className="flex items-center gap-2">
              <Input value={code} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="sm" onClick={copy} className="shrink-0">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        )}
        <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertCircle className="mb-1 h-3.5 w-3.5" /> O pagamento aguarda confirmação automática.
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <p>Referência: <code className="font-mono">{result.id.slice(0, 16)}</code></p>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Loads Stripe.js dynamically via script tag (official approach, no npm dependency).
 * Returns the Stripe object or null on failure.
 */
type StripeInstance = {
  initEmbeddedCheckout: (opts: { clientSecret: string }) => Promise<{
    mount: (selector: string) => void
    destroy: () => void
  }>
}

function loadStripeScript(publishableKey: string): Promise<StripeInstance | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null)
      return
    }
    const w = window as unknown as { Stripe?: (pk: string) => unknown }
    // If already loaded, return existing instance
    if (w.Stripe) {
      resolve(w.Stripe(publishableKey) as unknown as StripeInstance)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://js.stripe.com/v3/'
    script.async = true
    script.onload = () => {
      if (w.Stripe) {
        resolve(w.Stripe(publishableKey) as unknown as StripeInstance)
      } else {
        resolve(null)
      }
    }
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })
}
