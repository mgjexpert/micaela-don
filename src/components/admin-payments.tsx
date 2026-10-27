'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Loader2, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { apiFetch } from '@/lib/admin-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type Payment = {
  id: string
  internalReference: string
  provider: string
  method: string
  currency: string
  amount: string | number
  status: string
  deliveryStatus: string
  customerName: string | null
  customerEmail: string | null
  createdAt: string
  confirmedAt: string | null
}

const statusLabel: Record<string, string> = {
  paid: 'Confirmado', pending: 'Pendente', processing: 'Em processamento',
  failed: 'Falhou', expired: 'Expirado', refunded: 'Devolvido',
  requires_manual_review: 'Revisão manual', cancelled: 'Cancelado',
}
function money(amount: string | number, currency: string): string {
  const value = Number(amount)
  if (!Number.isFinite(value)) return String(amount) + ' ' + currency
  try {
    return new Intl.NumberFormat(currency === 'BRL' ? 'pt-BR' : 'pt-PT', {
      style: 'currency', currency,
    }).format(value)
  } catch { return String(amount) + ' ' + currency }
}
function formatDate(value: string): string {
  return new Date(value).toLocaleString('pt-PT')
}

export function AdminPayments() {
  const [reference, setReference] = useState('')
  const [activeReference, setActiveReference] = useState('')
  const [orders, setOrders] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = activeReference ? '?reference=' + encodeURIComponent(activeReference) : ''
      const data = await apiFetch<{ orders: Payment[] }>('/api/admin/payments' + params)
      setOrders(data.orders)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível consultar os pagamentos.')
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [activeReference])

  useEffect(() => { void load() }, [load])

  const reconcile = async (order: Payment) => {
    if (acting) return
    setActing(order.id)
    try {
      const result = await apiFetch<{ providerState: string; status: string }>(
        '/api/admin/payments/' + encodeURIComponent(order.id) + '/reconcile',
        { method: 'POST' },
      )
      if (result.status === 'paid') {
        toast.success('Pagamento confirmado pelo fornecedor', {
          description: 'Verifique também o estado da entrega.',
        })
      } else {
        toast.info('Consulta concluída', {
          description: 'MisticPay: ' + result.providerState + ' · Aplicação: ' + result.status,
        })
      }
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha na verificação.')
    } finally {
      setActing(null)
    }
  }

  const copyPack = async (order: Payment) => {
    if (acting) return
    setActing(order.id)
    try {
      const data = await apiFetch<{ url: string }>(
        '/api/admin/payments/' + encodeURIComponent(order.id) + '/pack',
      )
      await navigator.clipboard.writeText(data.url)
      toast.success('Link privado copiado', {
        description: 'Partilhe apenas com o doador autorizado, em canal seguro.',
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Pack Media indisponível.')
    } finally {
      setActing(null)
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div>
          <CardTitle className="text-lg">Pagamentos e entregas</CardTitle>
          <CardDescription>
            Ordens efetivas por fornecedor. Um registo de intenção não é prova de pagamento.
            Para verificar PIX antigos, procure a referência PAY- e consulte o fornecedor.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label="Referência exata do pagamento"
            placeholder="Referência exata: PAY-..."
            value={reference}
            onChange={e => setReference(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') setActiveReference(reference.trim()) }}
            className="min-w-48 flex-1 font-mono"
          />
          <Button variant="outline" onClick={() => setActiveReference(reference.trim())}>
            <Search className="mr-1.5 h-4 w-4" /> Procurar
          </Button>
          <Button variant="outline" onClick={() => {
            setReference('')
            setActiveReference('')
            if (!activeReference) void load()
          }}>Limpar</Button>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Atualizar
          </Button>
        </div>
        {activeReference && (
          <p className="text-xs text-muted-foreground">
            Pesquisa exata: <code>{activeReference}</code>
          </p>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> A consultar registos…
          </p>
        ) : error ? (
          <p role="alert" className="py-5 text-sm text-red-700">{error}</p>
        ) : orders.length === 0 ? (
          <p className="py-8 text-sm text-muted-foreground">
            Nenhuma ordem encontrada. Confirme a referência e a base de dados ligada à produção.
          </p>
        ) : (
          <div className="space-y-3">
            {!activeReference && (
              <p className="text-xs text-muted-foreground">100 ordens mais recentes; utilize a pesquisa exata para outras referências.</p>
            )}
            {orders.map(order => (
              <div key={order.id} className="rounded-xl border p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <code className="break-all text-xs font-semibold">{order.internalReference}</code>
                  <Badge variant={order.status === 'paid' ? 'default' : 'secondary'}>
                    {statusLabel[order.status] ?? order.status}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <span className="font-semibold">{money(order.amount, order.currency)}</span>
                  <span>{order.provider.toUpperCase()}</span>
                  <span>{order.customerName ?? 'Sem nome'}</span>
                  <span className="break-all text-muted-foreground">{order.customerEmail ?? ''}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <span>Criado: {formatDate(order.createdAt)}</span>
                  <span>Confirmado: {order.confirmedAt ? formatDate(order.confirmedAt) : '—'}</span>
                  <span>Entrega: {order.deliveryStatus}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {order.provider === 'misticpay' && order.status !== 'refunded' && (
                    <Button size="sm" variant="outline" disabled={Boolean(acting)}
                      onClick={() => void reconcile(order)}>
                      <ShieldCheck className="mr-1.5 h-4 w-4" />
                      {acting === order.id ? 'A consultar…' : 'Verificar MisticPay'}
                    </Button>
                  )}
                  {order.status === 'paid' && (
                    <Button size="sm" variant="outline" disabled={Boolean(acting)}
                      onClick={() => void copyPack(order)}>
                      <Copy className="mr-1.5 h-4 w-4" /> Copiar Pack Media
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
