import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { PaymentStatusLive } from '@/components/payment-status-live'

export const dynamic = 'force-dynamic'

/** The redirect is not proof of payment; confirmation only follows a signed webhook. */
export default async function PagamentoSucesso({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>
}) {
  const { ref } = await searchParams
  if (!ref || !/^PAY-[A-Za-z0-9_-]{8,128}$/.test(ref)) notFound()

  const order = await db.paymentOrder.findUnique({
    where: { internalReference: ref },
    select: { status: true },
  })
  if (!order) notFound()
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <PaymentStatusLive reference={ref} initialStatus={order.status} />
    </main>
  )
}
