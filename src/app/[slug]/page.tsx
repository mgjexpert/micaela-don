import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { MicaelaSimpleLanding } from '@/components/micaela-simple-landing'
import { micaelaLandingConfig } from '@/lib/micaela-landing-config'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Micaela & Elisa | Uma história de amizade e apoio',
  description: 'Contribua voluntariamente para o projeto pessoal da Micaela e da Elisa. PIX no Brasil e pagamentos seguros em euros na Europa.',
  alternates: { canonical: '/micaela' },
}

const EUROPE = new Set(['PT','ES','FR','DE','IT','GB','IE','NL','BE','LU','AT','CH','NO','SE','DK','FI','GR','PL','CZ','RO','HU','HR','SI','SK','EE','LV','LT','MT','CY','BG','IS'])

export default async function CampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (slug !== 'micaela') notFound()
  const country = (await headers()).get('x-vercel-ip-country')?.toUpperCase() ?? ''
  const initialRegion: 'BR' | 'EU' | 'auto' = country === 'BR' ? 'BR' : EUROPE.has(country) ? 'EU' : 'auto'
  return <MicaelaSimpleLanding {...micaelaLandingConfig()} initialRegion={initialRegion} />
}
