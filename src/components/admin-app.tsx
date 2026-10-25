'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  X,
  LogOut,
  LayoutDashboard,
  Landmark,
  QrCode,
  FolderKanban,
  HandCoins,
  MessageSquareHeart,
  Mail,
  ScrollText,
  Upload,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Pencil,
  ImageIcon,
  ExternalLink,
  Copy,
  Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { apiFetch } from '@/lib/admin-client'

type Tab = 'site' | 'payment' | 'pix' | 'materials' | 'donations' | 'templates' | 'channels' | 'audit'

export function AdminApp({ onClose }: { onClose: () => void }) {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [tab, setTab] = useState<Tab>('site')

  useEffect(() => {
    let active = true
    apiFetch<{ authenticated: boolean }>('/api/admin/session')
      .then((r) => active && setAuthed(r.authenticated))
      .catch(() => active && setAuthed(false))
    return () => {
      active = false
    }
  }, [])

  const logout = async () => {
    try {
      await apiFetch('/api/admin/logout', { method: 'POST' })
    } catch {
      /* ignore */
    }
    setAuthed(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-rose-600" />
          <span className="text-sm font-semibold">Painel de Administração</span>
        </div>
        <div className="flex items-center gap-2">
          {authed && (
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="mr-1 h-3.5 w-3.5" /> Sair
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {authed === null ? (
          <div className="flex h-full items-center justify-center p-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> A verificar sessão…
          </div>
        ) : !authed ? (
          <LoginView onLoggedIn={() => setAuthed(true)} />
        ) : (
          <div className="mx-auto max-w-5xl p-4 sm:p-6">
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="w-full">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
                <TabsTrigger value="site" className="gap-1"><LayoutDashboard className="h-3.5 w-3.5" /> Site</TabsTrigger>
                <TabsTrigger value="payment" className="gap-1"><Landmark className="h-3.5 w-3.5" /> EUR</TabsTrigger>
                <TabsTrigger value="pix" className="gap-1"><QrCode className="h-3.5 w-3.5" /> PIX</TabsTrigger>
                <TabsTrigger value="materials" className="gap-1"><FolderKanban className="h-3.5 w-3.5" /> Materiais</TabsTrigger>
                <TabsTrigger value="donations" className="gap-1"><HandCoins className="h-3.5 w-3.5" /> Donativos</TabsTrigger>
                <TabsTrigger value="templates" className="gap-1"><MessageSquareHeart className="h-3.5 w-3.5" /> Modelos</TabsTrigger>
                <TabsTrigger value="channels" className="gap-1"><Mail className="h-3.5 w-3.5" /> Canais</TabsTrigger>
                <TabsTrigger value="audit" className="gap-1"><ScrollText className="h-3.5 w-3.5" /> Auditoria</TabsTrigger>
              </TabsList>

              <TabsContent value="site" className="mt-6"><SiteTab /></TabsContent>
              <TabsContent value="payment" className="mt-6"><PaymentTab /></TabsContent>
              <TabsContent value="pix" className="mt-6"><PixTab /></TabsContent>
              <TabsContent value="materials" className="mt-6"><MaterialsTab /></TabsContent>
              <TabsContent value="donations" className="mt-6"><DonationsTab /></TabsContent>
              <TabsContent value="templates" className="mt-6"><TemplatesTab /></TabsContent>
              <TabsContent value="channels" className="mt-6"><ChannelsTab /></TabsContent>
              <TabsContent value="audit" className="mt-6"><AuditTab /></TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Login (preserved)
// ============================================================
function LoginView({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await apiFetch('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      toast.success('Sessão iniciada')
      onLoggedIn()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Credenciais inválidas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldAlert className="h-5 w-5 text-rose-600" /> Acesso restrito
          </CardTitle>
          <CardDescription>Área exclusiva para administradores autorizados.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="adm-email">E-mail</Label>
              <Input id="adm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="adm-pass">Password</Label>
              <Input id="adm-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> A entrar…</> : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// Reusable bits
// ============================================================
function useAdmin<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await apiFetch<T>(url)
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => {
    reload()
  }, [reload])

  return { data, loading, error, reload }
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 p-10 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
    </div>
  )
}

function FieldLabel({ htmlFor, label, description }: { htmlFor?: string; label: string; description?: string }) {
  return (
    <div className="grid gap-0.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  )
}

function ToggleLine({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  )
}

function StatusRow({ approved, published }: { approved: boolean; published: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant={approved ? 'default' : 'secondary'}>
        {approved ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <Clock className="mr-1 h-3 w-3" />}
        {approved ? 'Aprovado' : 'Por aprovar'}
      </Badge>
      <Badge variant={published ? 'default' : 'secondary'}>
        {published ? <ShieldCheck className="mr-1 h-3 w-3" /> : <Clock className="mr-1 h-3 w-3" />}
        {published ? 'Publicado' : 'Não publicado'}
      </Badge>
    </div>
  )
}

function SaveButton({ saving, label = 'Guardar', savingLabel = 'A guardar…', onClick, className }: { saving: boolean; label?: string; savingLabel?: string; onClick: () => void; className?: string }) {
  return (
    <Button onClick={onClick} disabled={saving} className={className}>
      {saving ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> {savingLabel}</> : <><Save className="mr-1 h-4 w-4" /> {label}</>}
    </Button>
  )
}

// ============================================================
// Image uploader (reusable)
// ============================================================
function assetPreviewUrl(value: string): string | null {
  if (!value) return null
  if (value.startsWith('asset:')) {
    const id = value.slice('asset:'.length)
    if (!id) return null
    return `/api/admin/assets/${encodeURIComponent(id)}/preview`
  }
  if (/^https?:\/\//i.test(value)) return value
  return null
}

function ImageUploader({
  value,
  onChange,
  accept = 'image/*',
  label,
  description,
  assetName = 'Imagem do site',
  className,
}: {
  value: string
  onChange: (v: string) => void
  accept?: string
  label?: string
  description?: string
  assetName?: string
  className?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const previewUrl = assetPreviewUrl(value)

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result as string)
        r.onerror = reject
        r.readAsDataURL(file)
      })
      const res = await apiFetch<{ id: string; previewUrl: string }>('/api/admin/assets', {
        method: 'POST',
        body: JSON.stringify({ name: file.name || assetName, mime: file.type, data: dataUrl, published: true }),
      })
      onChange(`asset:${res.id}`)
      toast.success('Imagem carregada')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro no carregamento da imagem')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={`grid gap-2 ${className ?? ''}`}>
      {label && <FieldLabel label={label} description={description} />}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="grid min-w-[180px] flex-1 gap-2">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Cole um URL ou carregue uma imagem"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> A carregar…</> : <><Upload className="mr-1 h-3.5 w-3.5" /> Carregar imagem</>}
            </Button>
            {value && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover
              </Button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) upload(f)
              e.target.value = ''
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Site tab — V2 with hero config + sections
// ============================================================
const HERO_LAYOUTS: { value: string; label: string; description: string }[] = [
  { value: 'none', label: 'Sem imagem', description: 'Apenas texto no topo.' },
  { value: 'banner', label: 'Banner horizontal', description: 'Imagem larga por baixo do título.' },
  { value: 'portrait', label: 'Retato vertical', description: 'Imagem de retrato ao lado do texto.' },
  { value: 'story-inline', label: 'Imagem junto à história', description: 'Imagem aparece na secção da história.' },
]

function SiteTab() {
  const { data, loading } = useAdmin<{ settings: Record<string, string> }>('/api/admin/site')
  const [vals, setVals] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data?.settings) setVals(data.settings)
  }, [data])

  const set = (k: string) => (v: string) => setVals((prev) => ({ ...prev, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/admin/site', {
        method: 'PUT',
        body: JSON.stringify({ settings: vals }),
      })
      toast.success('Conteúdo guardado', { description: 'As alterações estão visíveis na página pública.' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível guardar.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingRow />

  return (
    <div className="grid gap-4">
      {/* Página inicial */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Página inicial</CardTitle>
          <CardDescription>Os textos que aparecem no topo da página pública.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <FieldLabel htmlFor="s-hero.eyebrow" label="Texto de destaque (acima do título)" description="Frase curta que aparece acima do título, em maiúsculas." />
            <Input id="s-hero.eyebrow" value={vals['hero.eyebrow'] ?? ''} onChange={(e) => set('hero.eyebrow')(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="s-hero.title" label="Título principal da página" description="O título grande do topo." />
            <Input id="s-hero.title" value={vals['hero.title'] ?? ''} onChange={(e) => set('hero.title')(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="s-hero.subtitle" label="Subtítulo principal" description="Frase de apoio abaixo do título." />
            <Textarea id="s-hero.subtitle" value={vals['hero.subtitle'] ?? ''} onChange={(e) => set('hero.subtitle')(e.target.value)} rows={2} />
          </div>
        </CardContent>
      </Card>

      {/* Composição visual */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Composição visual</CardTitle>
          <CardDescription>Escolha o tipo de composição e carregue as imagens correspondentes.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <FieldLabel label="Composição do hero" description="Determina onde e como as imagens aparecem no topo." />
            <Select value={vals['hero.layout'] ?? 'none'} onValueChange={(v) => set('hero.layout')(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {HERO_LAYOUTS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    <div className="grid">
                      <span>{l.label}</span>
                      <span className="text-xs text-muted-foreground">{l.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="grid gap-3">
            <ImageUploader
              label="Imagem do banner (horizontal)"
              description="Imagem larga usada quando a composição é 'Banner horizontal'."
              assetName="Banner do hero"
              value={vals['hero.bannerImage'] ?? ''}
              onChange={set('hero.bannerImage')}
            />
            <div className="grid gap-2">
              <FieldLabel htmlFor="s-hero.bannerAlt" label="Texto alternativo do banner" description="Descrição da imagem para leitores de ecrã e SEO." />
              <Input id="s-hero.bannerAlt" value={vals['hero.bannerAlt'] ?? ''} onChange={(e) => set('hero.bannerAlt')(e.target.value)} />
            </div>
          </div>

          <Separator />

          <div className="grid gap-3">
            <ImageUploader
              label="Imagem de retrato (vertical)"
              description="Imagem vertical usada na composição de retrato."
              assetName="Retrato do hero"
              value={vals['hero.portraitImage'] ?? ''}
              onChange={set('hero.portraitImage')}
            />
            <div className="grid gap-2">
              <FieldLabel htmlFor="s-hero.portraitAlt" label="Texto alternativo do retrato" description="Descrição para leitores de ecrã." />
              <Input id="s-hero.portraitAlt" value={vals['hero.portraitAlt'] ?? ''} onChange={(e) => set('hero.portraitAlt')(e.target.value)} />
            </div>
          </div>

          <Separator />

          <div className="grid gap-3">
            <ImageUploader
              label="Imagem junto à história"
              description="Imagem apresentada na secção da história."
              assetName="Imagem da história"
              value={vals['hero.storyImage'] ?? ''}
              onChange={set('hero.storyImage')}
            />
            <div className="grid gap-2">
              <FieldLabel htmlFor="s-hero.storyAlt" label="Texto alternativo da imagem da história" description="Descrição para leitores de ecrã." />
              <Input id="s-hero.storyAlt" value={vals['hero.storyAlt'] ?? ''} onChange={(e) => set('hero.storyAlt')(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* História */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">História</CardTitle>
          <CardDescription>A secção que conta a história da Micaela.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <FieldLabel htmlFor="s-story.title" label="Título da história" />
            <Input id="s-story.title" value={vals['story.title'] ?? ''} onChange={(e) => set('story.title')(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="s-story.body" label="Texto da história" description="Texto longo. Pode usar parágrafos separados por linha em branco." />
            <Textarea id="s-story.body" value={vals['story.body'] ?? ''} onChange={(e) => set('story.body')(e.target.value)} rows={5} />
          </div>
        </CardContent>
      </Card>

      {/* Secções */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Outras secções</CardTitle>
          <CardDescription>Títulos e notas das restantes secções da página.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <FieldLabel htmlFor="s-donate.title" label="Título da secção de apoio" />
            <Input id="s-donate.title" value={vals['donate.title'] ?? ''} onChange={(e) => set('donate.title')(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="s-donate.note" label="Nota sobre confirmação de donativos" description="Aviso apresentado abaixo do formulário." />
            <Textarea id="s-donate.note" value={vals['donate.note'] ?? ''} onChange={(e) => set('donate.note')(e.target.value)} rows={2} />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="s-materials.title" label="Título da secção de materiais" />
            <Input id="s-materials.title" value={vals['materials.title'] ?? ''} onChange={(e) => set('materials.title')(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="s-footer.note" label="Texto do rodapé" />
            <Input id="s-footer.note" value={vals['footer.note'] ?? ''} onChange={(e) => set('footer.note')(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <SaveButton saving={saving} onClick={save} />
      </div>
    </div>
  )
}

// ============================================================
// Payment (EUR) tab — preserved
// ============================================================
type PaymentCfg = {
  id: string
  holder: string
  bank: string
  iban: string
  bic: string | null
  method: string
  currency: string
  published: boolean
  approved: boolean
  notes: string | null
}

function PaymentTab() {
  const { data, loading, reload } = useAdmin<{ config: PaymentCfg | null }>('/api/admin/payment-config')
  const cfg = data?.config ?? null
  const [form, setForm] = useState<Partial<PaymentCfg>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (cfg) setForm(cfg)
  }, [cfg])

  const save = async (patch: Partial<PaymentCfg> = {}) => {
    setSaving(true)
    try {
      const body = { ...form, ...patch }
      await apiFetch('/api/admin/payment-config', { method: 'PUT', body: JSON.stringify(body) })
      toast.success('Configuração guardada', { description: 'Dados bancários atualizados.' })
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível guardar.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingRow />
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Landmark className="h-5 w-5" /> Pagamento EUR (transferência)
        </CardTitle>
        <CardDescription>
          Dados privados. Só são visíveis na página pública quando verificados e publicados.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2"><Label>Titular</Label><Input value={form.holder ?? ''} onChange={(e) => setForm((f) => ({ ...f, holder: e.target.value }))} /></div>
          <div className="grid gap-2"><Label>Banco</Label><Input value={form.bank ?? ''} onChange={(e) => setForm((f) => ({ ...f, bank: e.target.value }))} /></div>
          <div className="grid gap-2"><Label>IBAN</Label><Input value={form.iban ?? ''} onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))} className="font-mono" /></div>
          <div className="grid gap-2"><Label>BIC/SWIFT</Label><Input value={form.bic ?? ''} onChange={(e) => setForm((f) => ({ ...f, bic: e.target.value }))} className="font-mono" /></div>
          <div className="grid gap-2"><Label>Método</Label><Input value={form.method ?? ''} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))} /></div>
          <div className="grid gap-2"><Label>Moeda</Label><Input value={form.currency ?? 'EUR'} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} /></div>
        </div>
        <div className="grid gap-2">
          <Label>Notas internas</Label>
          <Textarea value={form.notes ?? ''} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
        </div>
        <Separator />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <ToggleLine label="Verificado (aprovado)" checked={!!form.approved} onChange={(v) => save({ approved: v })} />
            <ToggleLine label="Publicado na página pública" checked={!!form.published} onChange={(v) => save({ published: v })} />
          </div>
          <SaveButton saving={saving} onClick={() => save()} label="Guardar dados" />
        </div>
        <StatusRow approved={!!cfg?.approved} published={!!cfg?.published} />
      </CardContent>
    </Card>
  )
}

// ============================================================
// PIX tab — preserved
// ============================================================
type PixCfg = {
  id?: string
  qrPresent: boolean
  qrImageMime?: string | null
  beneficiaryName?: string | null
  approved: boolean
  published: boolean
  notes?: string | null
}

function PixTab() {
  const { data, loading, reload } = useAdmin<{ config: PixCfg | null }>('/api/admin/pix')
  const cfg = data?.config ?? null
  const [beneficiary, setBeneficiary] = useState('')
  const [notes, setNotes] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setBeneficiary(cfg?.beneficiaryName ?? '')
    setNotes(cfg?.notes ?? '')
  }, [cfg])

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result as string)
        r.onerror = reject
        r.readAsDataURL(file)
      })
      await apiFetch('/api/admin/pix', {
        method: 'POST',
        body: JSON.stringify({ qrImage: dataUrl, beneficiaryName: beneficiary, notes }),
      })
      toast.success('QR carregado', { description: 'Pendente de verificação.' })
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro no carregamento')
    } finally {
      setUploading(false)
    }
  }

  const save = async (patch: Partial<PixCfg>) => {
    setSaving(true)
    try {
      await apiFetch('/api/admin/pix', {
        method: 'PUT',
        body: JSON.stringify({ beneficiaryName: beneficiary, notes, ...patch }),
      })
      toast.success('PIX atualizado')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível guardar.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingRow />
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <QrCode className="h-5 w-5" /> PIX (BRL)
        </CardTitle>
        <CardDescription>
          O QR carregado fica privado até ser verificado (legível e correspondente ao destinatário)
          e publicado. Não inventar nem gerar um QR fictício.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2"><Label>Beneficiário</Label><Input value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} /></div>
        </div>
        <div className="grid gap-2"><Label>Notas internas</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> A carregar…</> : <><Upload className="mr-1 h-4 w-4" /> Carregar QR Code</>}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) upload(f)
              e.target.value = ''
            }}
          />
          {cfg?.qrPresent && (
            <img src="/api/admin/pix/preview" alt="Pré-visualização do QR" className="h-24 w-24 rounded border bg-white p-1" />
          )}
        </div>

        {cfg?.qrPresent && (
          <>
            <Separator />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <ToggleLine label="Verificado (aprovado)" checked={cfg.approved} onChange={(v) => save({ approved: v })} />
                <ToggleLine label="Publicado" checked={cfg.published} onChange={(v) => save({ published: v })} />
              </div>
            </div>
            <StatusRow approved={cfg.approved} published={cfg.published} />
          </>
        )}
        {!cfg?.qrPresent && (
          <p className="text-sm text-muted-foreground">Nenhum QR carregado. Carregue a imagem fornecida pelo destinatário.</p>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// Materials tab — V2 with covers + edit dialog
// ============================================================
type Material = {
  id: string
  name: string
  category: string
  type: string
  url: string
  source: string
  coverImageRef: string | null
  coverAlt: string | null
  description: string | null
  approved: boolean
  published: boolean
}

const MATERIAL_CATEGORIES: { value: string; label: string }[] = [
  { value: 'foto', label: 'Foto' },
  { value: 'video', label: 'Vídeo' },
  { value: 'documento', label: 'Documento' },
  { value: 'logo', label: 'Logótipo' },
  { value: 'audio', label: 'Áudio' },
  { value: 'outro', label: 'Outro' },
]

function categoryLabel(v: string) {
  return MATERIAL_CATEGORIES.find((c) => c.value === v)?.label ?? v
}

function MaterialCover({ material, className }: { material: Pick<Material, 'coverImageRef' | 'coverAlt' | 'category'>; className?: string }) {
  const url = material.coverImageRef ? assetPreviewUrl(material.coverImageRef) : null
  return (
    <div className={`overflow-hidden rounded-md border bg-muted/40 ${className ?? ''}`}>
      {url ? (
        <img src={url} alt={material.coverAlt ?? ''} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

function MaterialsTab() {
  const { data, loading, reload } = useAdmin<{ materials: Material[] }>('/api/admin/materials')
  const [form, setForm] = useState({
    name: '',
    category: 'foto',
    type: '',
    url: '',
    coverImageRef: '',
    coverAlt: '',
    description: '',
  })
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      await apiFetch('/api/admin/materials', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          type: form.type,
          url: form.url,
          coverImageRef: form.coverImageRef || null,
          coverAlt: form.coverAlt || null,
          description: form.description || null,
        }),
      })
      toast.success('Material adicionado', { description: 'Pendente de aprovação.' })
      setForm({ name: '', category: 'foto', type: '', url: '', coverImageRef: '', coverAlt: '', description: '' })
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível adicionar.')
    } finally {
      setCreating(false)
    }
  }

  const patch = async (m: Material, patch: Partial<Material>) => {
    try {
      await apiFetch(`/api/admin/materials/${m.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      toast.success('Atualizado')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível atualizar.')
    }
  }

  const remove = async (m: Material) => {
    if (!confirm(`Eliminar "${m.name}"?`)) return
    try {
      await apiFetch(`/api/admin/materials/${m.id}`, { method: 'DELETE' })
      toast.success('Eliminado')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível eliminar.')
    }
  }

  if (loading) return <LoadingRow />
  const list = data?.materials ?? []
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Adicionar material</CardTitle>
          <CardDescription>Catálogo da pasta da campanha. Criado como pendente de aprovação.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <FieldLabel htmlFor="m-name" label="Nome" description="Título do material apresentado ao visitante." />
                <Input id="m-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="grid gap-2">
                <FieldLabel label="Categoria" />
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MATERIAL_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor="m-type" label="Tipo de ficheiro" description="MIME ou extensão, ex.: image/png, video/mp4." />
                <Input id="m-type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} placeholder="image/png" required />
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor="m-url" label="URL do material" description="Endereço público do ficheiro (Google Drive, etc.)." />
                <Input id="m-url" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://…" required />
              </div>
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="m-desc" label="Descrição" description="Texto curto apresentado por baixo do nome (opcional)." />
              <Textarea id="m-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <ImageUploader
              label="Imagem de capa"
              description="Capa do material. Pode carregar uma imagem ou colar um URL."
              assetName="Capa de material"
              value={form.coverImageRef}
              onChange={(v) => setForm((f) => ({ ...f, coverImageRef: v }))}
            />
            <div className="grid gap-2">
              <FieldLabel htmlFor="m-alt" label="Texto alternativo da capa" description="Descrição para leitores de ecrã." />
              <Input id="m-alt" value={form.coverAlt} onChange={(e) => setForm((f) => ({ ...f, coverAlt: e.target.value }))} />
            </div>
            <div>
              <Button type="submit" disabled={creating}>
                {creating ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> A adicionar…</> : 'Adicionar material'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Materiais ({list.length})</CardTitle>
          <CardDescription>Capa, descrição e estado de cada material.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[28rem] overflow-y-auto">
            {list.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Sem materiais. Adicione o primeiro acima.</div>
            ) : (
              <ul className="divide-y">
                {list.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
                    <MaterialCover material={m} className="h-14 w-14 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{m.name}</span>
                        <Badge variant="secondary">{categoryLabel(m.category)}</Badge>
                      </div>
                      {m.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{m.description}</p>}
                      <a href={m.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-rose-700 hover:underline dark:text-rose-400">
                        <ExternalLink className="h-3 w-3" /> Abrir ficheiro
                      </a>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <StatusRow approved={m.approved} published={m.published} />
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setEditing(m)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => patch(m, { approved: !m.approved })}
                          title={m.approved ? 'Desaprovar' : 'Aprovar'}
                        >
                          {m.approved ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => patch(m, { published: !m.published })}
                          disabled={!m.approved && !m.published}
                        >
                          {m.published ? 'Ocultar' : 'Publicar'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(m)} title="Eliminar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {editing && (
        <MaterialEditDialog
          material={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
    </div>
  )
}

function MaterialEditDialog({ material, onClose, onSaved }: { material: Material; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: material.name,
    category: material.category,
    type: material.type,
    url: material.url,
    coverImageRef: material.coverImageRef ?? '',
    coverAlt: material.coverAlt ?? '',
    description: material.description ?? '',
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await apiFetch(`/api/admin/materials/${material.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          type: form.type,
          url: form.url,
          coverImageRef: form.coverImageRef || null,
          coverAlt: form.coverAlt || null,
          description: form.description || null,
        }),
      })
      toast.success('Material atualizado')
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar material</DialogTitle>
          <DialogDescription>Atualize os detalhes do material. As alterações de capa e descrição são aplicadas imediatamente.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <FieldLabel htmlFor="e-name" label="Nome" />
              <Input id="e-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <FieldLabel label="Categoria" />
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MATERIAL_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="e-type" label="Tipo de ficheiro" />
              <Input id="e-type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="e-url" label="URL do material" />
              <Input id="e-url" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
            </div>
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="e-desc" label="Descrição" />
            <Textarea id="e-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
          </div>
          <ImageUploader
            label="Imagem de capa"
            description="Carregue uma imagem ou cole um URL."
            assetName="Capa de material"
            value={form.coverImageRef}
            onChange={(v) => setForm((f) => ({ ...f, coverImageRef: v }))}
          />
          <div className="grid gap-2">
            <FieldLabel htmlFor="e-alt" label="Texto alternativo da capa" />
            <Input id="e-alt" value={form.coverAlt} onChange={(e) => setForm((f) => ({ ...f, coverAlt: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <SaveButton saving={saving} onClick={save} label="Guardar alterações" />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Donations tab — preserved
// ============================================================
type Donation = {
  id: string
  wantPackMedia: boolean
  paymentMethod: string | null
  currency: string
  amount: number | null
  donorName: string | null
  donorEmail: string | null
  message: string | null
  status: string
  confirmed: boolean
  createdAt: string
}

function DonationsTab() {
  const { data, loading, reload } = useAdmin<{ donations: Donation[] }>('/api/admin/donations')
  if (loading) return <LoadingRow />
  const list = data?.donations ?? []
  const patch = async (d: Donation, body: object) => {
    try {
      await apiFetch(`/api/admin/donations/${d.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      toast.success('Donativo atualizado')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível atualizar.')
    }
  }
  const copyPack = async (d: Donation) => {
    try {
      const data = await apiFetch<{ url: string }>(`/api/admin/donations/${d.id}/pack`)
      await navigator.clipboard.writeText(data.url)
      toast.success('Ligação privada do Pack Media copiada', {
        description: 'Envie apenas ao próprio doador, por um canal seguro.',
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível obter o Pack Media.')
    }
  }
  const sendThanks = async (d: Donation) => {
    try {
      await apiFetch(`/api/admin/donations/${d.id}/thankyou`, { method: 'POST', body: JSON.stringify({ channel: 'email' }) })
      toast.success('Agradecimento em fila', { description: 'Envio futuro.' })
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível enviar.')
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Intenções de donativo ({list.length})</CardTitle>
        <CardDescription>Confirmação administrativa. BRL e EUR separados. Submeter o formulário não comprova pagamento.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-96 overflow-y-auto">
          {list.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Sem intenções registadas.</div>
          ) : (
            <ul className="divide-y">
              {list.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{d.currency}</Badge>
                      <span className="font-medium">{d.amount ?? '—'}</span>
                      <Badge variant={d.confirmed ? 'default' : 'secondary'}>{d.status}</Badge>
                    </div>
                    <div className="mt-1 text-sm">
                      <div className="font-medium">{d.donorName ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{d.donorEmail ?? ''}</div>
                      {d.message && <p className="mt-1 text-xs text-muted-foreground">{d.message}</p>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleString('pt')}</div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {(d.paymentMethod === 'bank_transfer' || !d.paymentMethod) && !d.confirmed && (
                      <Button size="sm" variant="outline"
                        onClick={() => patch(d, { confirmed: true, status: 'confirmed' })}>
                        Confirmar
                      </Button>
                    )}
                    {d.wantPackMedia && d.confirmed && (
                      <Button size="sm" variant="outline" onClick={() => copyPack(d)}
                        title="Copiar link privado do Pack Media">
                        <Copy className="mr-1 h-3.5 w-3.5" /> Pack Media
                      </Button>
                    )}
                    {!d.confirmed && (
                      <Button size="sm" variant="outline"
                        onClick={() => patch(d, { confirmed: false, status: 'rejected' })}>
                        Rejeitar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => sendThanks(d)} title="Enviar agradecimento (requer consentimento)">Agradecer</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Templates tab — preserved
// ============================================================
type Template = {
  id: string
  channel: string
  language: string
  subject: string | null
  body: string
  active: boolean
}

function TemplatesTab() {
  const { data, loading, reload } = useAdmin<{ templates: Template[] }>('/api/admin/templates')
  const [form, setForm] = useState({ channel: 'email', subject: '', body: '' })
  const [creating, setCreating] = useState(false)

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      await apiFetch('/api/admin/templates', { method: 'POST', body: JSON.stringify(form) })
      toast.success('Modelo criado')
      setForm({ channel: 'email', subject: '', body: '' })
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível criar.')
    } finally {
      setCreating(false)
    }
  }
  const remove = async (t: Template) => {
    if (!confirm('Eliminar modelo?')) return
    try {
      await apiFetch(`/api/admin/templates/${t.id}`, { method: 'DELETE' })
      toast.success('Eliminado')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível eliminar.')
    }
  }

  if (loading) return <LoadingRow />
  const list = data?.templates ?? []
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader><CardTitle className="text-lg">Novo modelo de agradecimento</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2"><Label>Canal</Label>
                <Select value={form.channel} onValueChange={(v) => setForm((f) => ({ ...f, channel: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="email">E-mail</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>Assunto (e-mail)</Label><Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} /></div>
            </div>
            <div className="grid gap-2"><Label>Texto</Label><Textarea rows={3} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} required /></div>
            <Button type="submit" disabled={creating} className="w-full sm:w-auto">
              {creating ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> A criar…</> : 'Criar modelo'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-lg">Modelos ({list.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {list.map((t) => (
            <div key={t.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary">{t.channel}</Badge>
                <Button size="sm" variant="ghost" onClick={() => remove(t)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
              {t.subject && <div className="mt-1 text-sm font-medium">{t.subject}</div>}
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{t.body}</p>
            </div>
          ))}
          {list.length === 0 && <p className="text-sm text-muted-foreground">Sem modelos.</p>}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// Channels tab — preserved
// ============================================================
type Channel = {
  id: string
  type: string
  label: string
  value: string
  enabled: boolean
  published: boolean
}

function ChannelsTab() {
  const { data, loading, reload } = useAdmin<{ channels: Channel[] }>('/api/admin/contact-channels')
  if (loading) return <LoadingRow />
  const list = data?.channels ?? []
  const patch = async (c: Channel, body: Partial<Channel>) => {
    try {
      await apiFetch(`/api/admin/contact-channels/${c.id}`, { method: 'PUT', body: JSON.stringify(body) })
      toast.success('Canal atualizado')
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível atualizar.')
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Canais de contacto</CardTitle>
        <CardDescription>WhatsApp desativado por defeito. Só aparece na página pública quando ativado e publicado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.map((c) => (
          <div key={c.id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><Badge variant="secondary">{c.type}</Badge><span className="font-medium">{c.label}</span></div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{c.value}</div>
              </div>
              <div className="flex items-center gap-3">
                <ToggleLine label="Ativo" checked={c.enabled} onChange={(v) => patch(c, { enabled: v })} />
                <ToggleLine label="Publicado" checked={c.published} onChange={(v) => patch(c, { published: v })} />
              </div>
            </div>
            <div className="mt-2"><StatusRow approved={c.enabled} published={c.published} /></div>
          </div>
        ))}
        {list.length === 0 && <p className="text-sm text-muted-foreground">Sem canais.</p>}
      </CardContent>
    </Card>
  )
}

// ============================================================
// Audit tab — preserved
// ============================================================
type Log = { id: string; actor: string; action: string; entity: string | null; entityId: string | null; detail: string | null; createdAt: string }
function AuditTab() {
  const { data, loading } = useAdmin<{ logs: Log[] }>('/api/admin/audit')
  if (loading) return <LoadingRow />
  const list = data?.logs ?? []
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Registo de auditoria</CardTitle>
        <CardDescription>Últimas 200 ações sensíveis (apenas leitura).</CardDescription></CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[28rem] overflow-y-auto">
          {list.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Sem registos.</div>
          ) : (
            <ul className="divide-y">
              {list.map((l) => (
                <li key={l.id} className="grid gap-1 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{l.action}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleString('pt')}</span>
                  </div>
                  <div className="text-sm">{l.detail ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">por {l.actor}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
