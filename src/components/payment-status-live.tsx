'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Status = 'pending' | 'paid' | 'failed' | 'refunded'

export function PaymentStatusLive({ reference, initialStatus }: {
  reference: string
  initialStatus: string
}) {
  const [status, setStatus] = useState<Status>(
    ['paid','failed','refunded'].includes(initialStatus) ? initialStatus as Status : 'pending',
  )
  useEffect(() => {
    let enabled = true
    const refresh = async () => {
      try {
        const resp = await fetch('/api/public/payment-status?ref=' + encodeURIComponent(reference), {
          cache: 'no-store',
        })
        if (!resp.ok) return
        const data = await resp.json() as { status?: Status }
        if (enabled && data.status && ['pending','paid','failed','refunded'].includes(data.status)) {
          setStatus(data.status)
        }
      } catch { /* preserve state on network errors */ }
    }
    void refresh()
    const timer = window.setInterval(refresh, 10000)
    return () => { enabled = false; window.clearInterval(timer) }
  }, [reference])
  const isPaid = status === 'paid'
  const failed = status === 'failed' || status === 'refunded'
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          {isPaid ? <CheckCircle2 className="h-8 w-8 text-emerald-600" /> :
            failed ? <AlertCircle className="h-8 w-8 text-rose-600" /> :
              <Clock className="h-8 w-8 text-amber-600" />}
        </div>
        <CardTitle className="text-xl">
          {isPaid ? 'Pagamento confirmado' :
            failed ? 'Pagamento não concluído' : 'Pagamento em processamento'}
        </CardTitle>
        <CardDescription>
          {isPaid
            ? 'Recebemos a confirmação do fornecedor. O agradecimento e o Pack Media, caso tenha sido selecionado, serão enviados para o e-mail indicado.'
            : failed ? 'Este pagamento não foi confirmado. Consulte o seu banco antes de tentar novamente.'
              : 'Aguardamos confirmação do banco e do fornecedor. Esta página atualiza-se automaticamente; não efetue novo pagamento.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="rounded-md bg-muted p-3">
          <p className="text-muted-foreground">Referência</p>
          <p className="break-all font-mono text-xs">{reference}</p>
          <p className="mt-3 font-medium">Estado: {status === 'paid' ? 'Confirmado' :
            status === 'failed' ? 'Falhado' : status === 'refunded' ? 'Reembolsado' : 'Pendente'}</p>
        </div>
        <Button asChild className="w-full"><Link href="/">Voltar à campanha</Link></Button>
      </CardContent>
    </Card>
  )
}
