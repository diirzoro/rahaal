'use client'
import { useEffect, useMemo, useState, useCallback, useRef, createContext, useContext } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import {
  Plane, FileBadge2, LayoutDashboard, Users, Building2, ReceiptText, Wallet,
  ArrowDownLeft, ArrowUpRight, BookOpenText, BarChart3, PieChart as PieIcon,
  Plus, Search, Calendar, TrendingUp, DollarSign, Sparkles, LogOut,
  Filter, ChevronLeft, Activity, Banknote, Loader2, Landmark, ShieldCheck,
  Building, Settings, Upload, FileSpreadsheet, CheckCircle2, XCircle,
  AlertTriangle, Trash2, Power, User, Image as ImageIcon, Printer, Key,
  ArrowLeftRight,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'

// ================================================================
// UTILS + AUTH
// ================================================================
const CUR_SYMBOL = { USD: '$', SAR: 'ر.س', YER: 'ر.ي' }
const CUR_NAME = { USD: 'دولار أمريكي', SAR: 'ريال سعودي', YER: 'ريال يمني' }
const CURRENCIES = ['USD', 'SAR', 'YER']

const fmt = (n, c = 'USD') => `${CUR_SYMBOL[c] || ''} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
const fmtTime = (d) => d ? new Date(d).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—'
const todayISO = () => new Date().toISOString().slice(0, 10)

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'خطأ في الاتصال')
  return data
}

const AuthCtx = createContext(null)
const useAuth = () => useContext(AuthCtx)

// ================================================================
// LOGIN
// ================================================================
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e?.preventDefault()
    if (!email || !password) return toast.error('أدخل البريد وكلمة المرور')
    try {
      setLoading(true)
      const r = await api('/auth/login', { method: 'POST', body: { email, password } })
      onLogin(r)
      toast.success('مرحباً بك في رحّـــال')
    } catch (e) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-4">
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(59,130,246,0.3), transparent 40%), radial-gradient(circle at 80% 80%, rgba(16,185,129,0.2), transparent 40%)' }} />
      <div className="relative w-full max-w-md animate-fade-in">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl grad-brand flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-blue-500/40">
            <Plane className="w-8 h-8 text-white -rotate-45" />
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight">رحّـــال</h1>
          <p className="text-slate-400 text-sm mt-1">نظام محاسبة مكاتب السفريات السحابي</p>
        </div>

        <Card className="border-slate-700 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
          <CardHeader>
            <CardTitle className="text-white">تسجيل الدخول</CardTitle>
            <CardDescription className="text-slate-400">أدخل بيانات حسابك للوصول للنظام</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-300">البريد الإلكتروني</Label>
                <Input dir="ltr" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" className="bg-slate-800 border-slate-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">كلمة المرور</Label>
                <Input dir="ltr" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="bg-slate-800 border-slate-700 text-white" />
              </div>
              <Button type="submit" disabled={loading} className="w-full grad-brand text-white h-11 font-bold">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'دخول'}
              </Button>
            </form>
            <div className="mt-6 p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-xs text-slate-400 space-y-1">
              <div className="font-bold text-slate-300 mb-1">حسابات تجريبية:</div>
              <div><ShieldCheck className="inline w-3 h-3 ml-1" /> <span className="text-amber-400">Super Admin:</span> <code dir="ltr">admin@targetmedia.com / Target@2025</code></div>
              <div><Building className="inline w-3 h-3 ml-1" /> <span className="text-emerald-400">مالك مكتب:</span> <code dir="ltr">owner@demo.com / Demo@2025</code></div>
            </div>
          </CardContent>
        </Card>
        <div className="text-center text-xs text-slate-500 mt-4">Powered by <span className="text-amber-400 font-bold">Target Media</span> © 2025</div>
      </div>
    </div>
  )
}

// ================================================================
// SUPER ADMIN PANEL
// ================================================================
function SuperAdminPanel() {
  const { user, logout } = useAuth()
  const [data, setData] = useState(null)
  const [openNew, setOpenNew] = useState(false)
  const [editing, setEditing] = useState(null)
  const load = async () => { try { setData(await api('/admin/tenants')) } catch (e) { toast.error(e.message) } }
  useEffect(() => { load() }, [])

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="grad-slate text-white p-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl grad-gold flex items-center justify-center shadow-lg">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-2xl font-extrabold">لوحة الإدارة العامة</div>
              <div className="text-sm text-slate-300">Target Media Super Admin</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-left">
              <div className="text-sm font-semibold">{user.name}</div>
              <div className="text-xs text-slate-300">{user.email}</div>
            </div>
            <Button variant="ghost" onClick={logout} className="text-white hover:bg-white/10 gap-2"><LogOut className="w-4 h-4" /> خروج</Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard icon={Building2} label="المكاتب" value={data?.global_stats?.tenants ?? '—'} grad="grad-brand" />
          <StatCard icon={Plane} label="إجمالي التذاكر" value={data?.global_stats?.tickets ?? '—'} grad="grad-green" />
          <StatCard icon={FileBadge2} label="إجمالي التأشيرات" value={data?.global_stats?.visas ?? '—'} grad="grad-gold" />
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-blue-600" /> إدارة المكاتب (Tenants)</CardTitle>
            <Button onClick={() => setOpenNew(true)} className="grad-brand text-white gap-2"><Plus className="w-4 h-4" /> إنشاء مكتب جديد</Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>اسم المكتب</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الاشتراك</TableHead>
                  <TableHead className="text-center">المستخدمون</TableHead>
                  <TableHead className="text-center">حصة القيود</TableHead>
                  <TableHead>تاريخ الإنشاء</TableHead>
                  <TableHead className="text-left">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.tenants || []).map(t => {
                  const q = t.journal_quota || { used: 0, limit: 500 }
                  const pct = q.limit ? (q.used / q.limit) * 100 : 0
                  return (
                    <TableRow key={t.id}>
                      <TableCell><div className="font-semibold">{t.name}</div><div className="text-xs text-slate-500 font-mono">{t.slug}</div></TableCell>
                      <TableCell><Badge className={t.status === 'active' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : 'bg-amber-100 text-amber-700 hover:bg-amber-100'}>{t.status === 'active' ? 'نشط' : 'موقوف'}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{t.subscription || 'trial'}</Badge></TableCell>
                      <TableCell className="text-center">{t.users_count}/{t.max_users}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <div className={`text-xs font-bold ${pct >= 100 ? 'text-rose-600' : pct >= 90 ? 'text-amber-600' : 'text-slate-700'}`}>{q.used} / {q.limit}</div>
                          <div className="w-20 h-1.5 rounded-full bg-slate-200 overflow-hidden"><div className={`h-full ${pct >= 100 ? 'bg-rose-500' : pct >= 90 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{fmtDate(t.created_at)}</TableCell>
                      <TableCell className="text-left">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" className="text-emerald-600" onClick={async () => {
                            const amt = prompt(`إضافة رصيد قيود للمكتب "${t.name}" (عدد القيود):`, '500')
                            if (!amt) return
                            const n = Number(amt); if (!n || n < 1) return
                            await api(`/admin/tenants/${t.id}`, { method: 'PATCH', body: { top_up_amount: n } })
                            toast.success(`تم إضافة ${n} قيد`); load()
                          }}><Plus className="w-3 h-3" /> رصيد</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditing(t)}><Settings className="w-3 h-3" /></Button>
                          <Button size="sm" variant="outline" className={t.status === 'active' ? 'text-amber-600' : 'text-emerald-600'}
                            onClick={async () => {
                              const newStatus = t.status === 'active' ? 'suspended' : 'active'
                              await api(`/admin/tenants/${t.id}`, { method: 'PATCH', body: { status: newStatus } })
                              toast.success(newStatus === 'active' ? 'تم التفعيل' : 'تم الإيقاف'); load()
                            }}><Power className="w-3 h-3" /></Button>
                          <Button size="sm" variant="outline" className="text-rose-600"
                            onClick={async () => {
                              if (!confirm(`حذف المكتب "${t.name}" وجميع بياناته نهائياً؟`)) return
                              await api(`/admin/tenants/${t.id}`, { method: 'DELETE' })
                              toast.success('تم الحذف'); load()
                            }}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {(!data?.tenants || data.tenants.length === 0) && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400">لا توجد مكاتب. أنشئ المكتب الأول من الأعلى.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <NewTenantDialog open={openNew} onOpenChange={setOpenNew} onSaved={() => { load(); setOpenNew(false) }} />
      <EditTenantDialog tenant={editing} onOpenChange={() => setEditing(null)} onSaved={() => { load(); setEditing(null) }} />
    </div>
  )
}

function StatCard({ icon: Icon, label, value, grad }) {
  return (
    <Card className="overflow-hidden">
      <div className={`h-1 ${grad}`} />
      <CardContent className="p-5 flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500">{label}</div>
          <div className="text-3xl font-extrabold text-slate-800 mt-1">{value}</div>
        </div>
        <div className={`w-14 h-14 rounded-xl ${grad} flex items-center justify-center shadow-lg`}><Icon className="w-6 h-6 text-white" /></div>
      </CardContent>
    </Card>
  )
}

function NewTenantDialog({ open, onOpenChange, onSaved }) {
  const [f, setF] = useState({ name: '', owner_name: '', owner_email: '', owner_password: '', max_users: 2, max_branches: 1, subscription: 'trial' })
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (!f.name || !f.owner_email || !f.owner_password) return toast.error('املأ جميع الحقول المطلوبة')
    try { setSaving(true); await api('/admin/tenants', { method: 'POST', body: f }); toast.success('تم إنشاء المكتب'); onSaved(); setF({ name: '', owner_name: '', owner_email: '', owner_password: '', max_users: 2, max_branches: 1, subscription: 'trial' }) }
    catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader><DialogTitle>إنشاء مكتب سفريات جديد</DialogTitle><DialogDescription>سيتم إنشاء مكتب معزول تماماً مع حساب مالك وبيانات محاسبية افتراضية</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label="اسم المكتب" required><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="مكتب الأنوار للسفريات" /></Field>
          <Field label="نوع الاشتراك">
            <Select value={f.subscription} onValueChange={v => setF({ ...f, subscription: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="trial">تجريبي</SelectItem><SelectItem value="basic">أساسي</SelectItem><SelectItem value="pro">احترافي</SelectItem><SelectItem value="enterprise">مؤسسي</SelectItem></SelectContent>
            </Select>
          </Field>
          <Field label="اسم المالك"><Input value={f.owner_name} onChange={e => setF({ ...f, owner_name: e.target.value })} placeholder="أحمد محمد" /></Field>
          <Field label="بريد المالك" required><Input dir="ltr" type="email" value={f.owner_email} onChange={e => setF({ ...f, owner_email: e.target.value })} placeholder="owner@office.com" /></Field>
          <Field label="كلمة المرور" required><Input dir="ltr" type="text" value={f.owner_password} onChange={e => setF({ ...f, owner_password: e.target.value })} placeholder="اختر كلمة مرور قوية" /></Field>
          <Field label="حد المستخدمين"><Input type="number" min={1} value={f.max_users} onChange={e => setF({ ...f, max_users: e.target.value })} /></Field>
          <Field label="عدد الفروع"><Input type="number" min={1} value={f.max_branches} onChange={e => setF({ ...f, max_branches: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="grad-brand text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إنشاء المكتب'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditTenantDialog({ tenant, onOpenChange, onSaved }) {
  const [f, setF] = useState({})
  useEffect(() => { if (tenant) setF({ name: tenant.name, max_users: tenant.max_users, max_branches: tenant.max_branches, status: tenant.status }) }, [tenant])
  if (!tenant) return null
  const submit = async () => {
    try { await api(`/admin/tenants/${tenant.id}`, { method: 'PATCH', body: f }); toast.success('تم التحديث'); onSaved() }
    catch (e) { toast.error(e.message) }
  }
  return (
    <Dialog open={!!tenant} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>تعديل المكتب: {tenant.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label="اسم المكتب"><Input value={f.name || ''} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="الحالة">
            <Select value={f.status} onValueChange={v => setF({ ...f, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="active">نشط</SelectItem><SelectItem value="suspended">موقوف</SelectItem></SelectContent>
            </Select>
          </Field>
          <Field label="حد المستخدمين"><Input type="number" value={f.max_users || 1} onChange={e => setF({ ...f, max_users: Number(e.target.value) })} /></Field>
          <Field label="عدد الفروع"><Input type="number" value={f.max_branches || 1} onChange={e => setF({ ...f, max_branches: Number(e.target.value) })} /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button><Button onClick={submit} className="grad-brand text-white">حفظ</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================================================================
// COMMON FIELD COMPONENT
// ================================================================
function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-slate-600">{label} {required && <span className="text-rose-500">*</span>}</Label>
      {children}
    </div>
  )
}

// ================================================================
// TENANT SIDEBAR & TOP BAR
// ================================================================
const NAV = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, color: 'from-blue-600 to-cyan-500' },
  { id: 'tickets',   label: 'حجز التذاكر', icon: Plane, color: 'from-sky-600 to-blue-500' },
  { id: 'visas',     label: 'التأشيرات والخدمات', icon: FileBadge2, color: 'from-emerald-600 to-teal-500' },
  { id: 'fx',        label: 'صرافة العملات', icon: ArrowLeftRight, color: 'from-fuchsia-600 to-purple-500' },
  { id: 'receipt',   label: 'سند قبض', icon: ArrowDownLeft, color: 'from-green-600 to-emerald-500' },
  { id: 'payment',   label: 'سند صرف', icon: ArrowUpRight, color: 'from-rose-600 to-pink-500' },
  { id: 'clients',   label: 'العملاء', icon: Users, color: 'from-indigo-600 to-violet-500' },
  { id: 'suppliers', label: 'الموردون والوكلاء', icon: Building2, color: 'from-amber-600 to-orange-500' },
  { id: 'boxes',     label: 'الصناديق والبنوك', icon: Wallet, color: 'from-yellow-600 to-amber-500' },
  { id: 'chart',     label: 'الدليل المحاسبي', icon: BookOpenText, color: 'from-purple-600 to-fuchsia-500' },
  { id: 'journal',   label: 'قيود اليومية', icon: ReceiptText, color: 'from-slate-700 to-slate-500' },
  { id: 'reports',   label: 'التقارير المالية', icon: BarChart3, color: 'from-cyan-600 to-blue-500' },
  { id: 'settings',  label: 'إعدادات المكتب', icon: Settings, color: 'from-slate-800 to-slate-600' },
]

function Sidebar({ current, onChange }) {
  const { tenant, settings, user } = useAuth()
  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 bg-gradient-to-b from-slate-900 via-slate-900 to-blue-950 text-slate-100 flex flex-col border-l border-slate-800">
      <div className="p-5 border-b border-slate-800/70">
        <div className="flex items-center gap-3">
          {settings?.logo_base64 ? (
            <img src={settings.logo_base64} alt="logo" className="w-11 h-11 rounded-xl object-cover bg-white" />
          ) : (
            <div className="w-11 h-11 rounded-xl grad-brand flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Plane className="w-6 h-6 text-white -rotate-45" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-lg font-extrabold tracking-tight truncate">{settings?.agency_name || tenant?.name || 'رحّـــال'}</div>
            <div className="text-[11px] text-slate-400">نظام محاسبة السفريات</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV.filter(n => n.id !== 'settings' || user.role === 'owner').map(item => {
          const Icon = item.icon
          const active = current === item.id
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active ? 'bg-white/10 text-white shadow-inner' : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className={`w-8 h-8 rounded-md flex items-center justify-center bg-gradient-to-br ${item.color} ${active ? 'shadow-lg' : 'opacity-80'}`}>
                <Icon className="w-4 h-4 text-white" />
              </span>
              <span className="flex-1 text-right">{item.label}</span>
              {active && <ChevronLeft className="w-4 h-4 text-slate-400" />}
            </button>
          )
        })}
      </nav>
      <div className="p-3 border-t border-slate-800/70">
        <div className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
          <div className="w-9 h-9 rounded-full grad-brand flex items-center justify-center"><User className="w-4 h-4 text-white" /></div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold truncate">{user.name}</div>
            <div className="text-[10px] text-slate-400 truncate">{user.role === 'owner' ? 'مالك المكتب' : 'موظف'}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function TopBar({ title, subtitle, right }) {
  return (
    <div className="flex items-center justify-between mb-6 animate-fade-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  )
}

// ================================================================
// DASHBOARD (same as v1 but tenant-aware)
// ================================================================
function Dashboard({ setTab }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    try { setLoading(true); const d = await api('/dashboard'); setData(d) }
    catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, [load])
  const pieColors = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ef4444', '#64748b']

  return (
    <div className="space-y-6">
      <TopBar title="لوحة التحكم" subtitle="نظرة سريعة على أداء المكتب اليوم"
        right={<Button variant="outline" onClick={load} className="gap-2"><Activity className="w-4 h-4" /> تحديث</Button>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickAction icon={Plane} label="حجز تذكرة" grad="grad-brand" onClick={() => setTab('tickets')} />
        <QuickAction icon={FileBadge2} label="تأشيرة/خدمة" grad="grad-green" onClick={() => setTab('visas')} />
        <QuickAction icon={ArrowDownLeft} label="سند قبض" grad="grad-gold" onClick={() => setTab('receipt')} />
        <QuickAction icon={ArrowUpRight} label="سند صرف" grad="grad-rose" onClick={() => setTab('payment')} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="مبيعات اليوم" icon={DollarSign} grad="grad-brand"
          values={CURRENCIES.map(c => ({ label: c, value: fmt(data?.kpi?.sales_today?.[c] || 0, c) }))} loading={loading} />
        <KpiCard title="أرباح اليوم" icon={TrendingUp} grad="grad-green"
          values={CURRENCIES.map(c => ({ label: c, value: fmt(data?.kpi?.profit_today?.[c] || 0, c) }))} loading={loading} />
        <KpiCard title="عدد الحركات اليوم" icon={Activity} grad="grad-purple" bigValue={data?.kpi?.count_today || 0}
          details={[{ label: 'تذاكر', value: data?.kpi?.tickets_today || 0 }, { label: 'تأشيرات', value: data?.kpi?.visas_today || 0 }]} loading={loading} />
        <KpiCard title="تاريخ اليوم" icon={Calendar} grad="grad-slate"
          bigValue={new Date().toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}
          details={[{ label: '', value: new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric' }) }]} loading={loading} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-slate-200">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-slate-800"><TrendingUp className="w-5 h-5 text-blue-600" /> حركة المبيعات والأرباح — آخر 30 يوم (بمعادل الدولار)</CardTitle></CardHeader>
          <CardContent className="h-72">
            {data?.line?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.line}>
                  <defs>
                    <linearGradient id="gs" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} /></linearGradient>
                    <linearGradient id="gp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.5} /><stop offset="100%" stopColor="#10b981" stopOpacity={0.02} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <RTip contentStyle={{ direction: 'rtl', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                  <Area type="monotone" dataKey="sales" name="مبيعات" stroke="#3b82f6" fillOpacity={1} fill="url(#gs)" strokeWidth={2} />
                  <Area type="monotone" dataKey="profit" name="أرباح" stroke="#10b981" fillOpacity={1} fill="url(#gp)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-slate-800"><PieIcon className="w-5 h-5 text-purple-600" /> توزيع الإيرادات</CardTitle></CardHeader>
          <CardContent className="h-72">
            {data?.pie?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.pie} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={80} innerRadius={45} paddingAngle={2}>
                    {data.pie.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <RTip contentStyle={{ direction: 'rtl', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </CardContent>
        </Card>
      </div>
      <Card className="border-slate-200">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-slate-800"><Activity className="w-5 h-5 text-amber-500" /> شريط الحركة المباشر</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            <AnimatePresence>
              {(data?.activity || []).map((a) => (
                <motion.div key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <ActivityIcon kind={a.kind} />
                  <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-slate-800 truncate">{a.title}</div><div className="text-xs text-slate-500">{a.subtitle}</div></div>
                  <div className="text-left"><div className="text-sm font-bold text-slate-700">{fmt(a.amount, a.currency)}</div><div className="text-[11px] text-slate-400">{fmtTime(a.when)}</div></div>
                </motion.div>
              ))}
              {(!data?.activity || data.activity.length === 0) && (
                <div className="text-center text-sm text-slate-400 py-10">لا توجد حركات بعد — ابدأ بتسجيل أول تذكرة أو تأشيرة</div>
              )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function QuickAction({ icon: Icon, label, grad, onClick }) {
  return (
    <button onClick={onClick} className={`${grad} text-white rounded-xl p-4 flex items-center gap-3 shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5`}>
      <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm"><Icon className="w-5 h-5" /></div>
      <div className="text-right"><div className="font-bold">{label}</div><div className="text-xs opacity-90">إضافة سريعة</div></div>
    </button>
  )
}
function KpiCard({ title, icon: Icon, grad, values, bigValue, details, loading }) {
  return (
    <Card className="overflow-hidden border-slate-200 relative">
      <div className={`absolute inset-x-0 top-0 h-1 ${grad}`} />
      <CardHeader className="pb-2"><div className="flex items-center justify-between"><CardDescription className="text-slate-500 text-xs">{title}</CardDescription><div className={`w-9 h-9 rounded-lg ${grad} flex items-center justify-center`}><Icon className="w-4 h-4 text-white" /></div></div></CardHeader>
      <CardContent className="pt-0">
        {loading ? <div className="h-16 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div> :
          bigValue !== undefined ? (
            <><div className="text-2xl font-extrabold text-slate-800">{bigValue}</div>{details?.map((d, i) => <div key={i} className="text-xs text-slate-500 mt-1">{d.label} <span className="font-semibold text-slate-700">{d.value}</span></div>)}</>
          ) : (
            <div className="space-y-1">{values.map(v => (<div key={v.label} className="flex items-center justify-between text-sm"><span className="text-xs text-slate-500">{v.label}</span><span className="font-bold text-slate-800">{v.value}</span></div>))}</div>
          )}
      </CardContent>
    </Card>
  )
}
function ActivityIcon({ kind }) {
  const map = {
    ticket:  { i: Plane, c: 'from-sky-500 to-blue-600' },
    visa:    { i: FileBadge2, c: 'from-emerald-500 to-teal-600' },
    receipt: { i: ArrowDownLeft, c: 'from-green-500 to-emerald-600' },
    payment: { i: ArrowUpRight, c: 'from-rose-500 to-pink-600' },
  }
  const { i: Icon, c } = map[kind] || map.ticket
  return <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${c} flex items-center justify-center shrink-0`}><Icon className="w-4 h-4 text-white" /></div>
}
const EmptyChart = () => <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm gap-2"><BarChart3 className="w-8 h-8 opacity-40" /><div>لا توجد بيانات بعد</div></div>

// ================================================================
// TICKETS SCREEN with Manual + Bulk import
// ================================================================
function TicketsScreen() {
  const [tickets, setTickets] = useState([])
  const [clients, setClients] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [openManual, setOpenManual] = useState(false)
  const [openBulk, setOpenBulk] = useState(false)
  const [openSearch, setOpenSearch] = useState(false)
  const [filter, setFilter] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [rates, setRates] = useState(null)
  const load = async () => {
    try {
      const [t, c, s, r] = await Promise.all([api('/tickets'), api('/clients'), api('/suppliers'), api('/rates')])
      setTickets(t); setClients(c); setSuppliers(s); setRates(r.rates)
    } catch (e) { toast.error(e.message) }
  }
  useEffect(() => { load() }, [])
  const filtered = applyFilter(tickets, filter)
  const handleDelete = async () => {
    if (!selectedId) return
    if (!confirm('حذف هذه التذكرة وعكس القيد المحاسبي؟')) return
    try { await api(`/tickets/${selectedId}`, { method: 'DELETE' }); toast.success('تم الحذف'); setSelectedId(null); load() }
    catch (e) { toast.error(e.message) }
  }

  return (
    <div className="space-y-4">
      <TopBar
        title="حجز التذاكر"
        subtitle="شاشة مدمجة للشراء والبيع وحساب العمولة تلقائياً"
        right={
          <Button variant="outline" onClick={() => setOpenBulk(true)} className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"><FileSpreadsheet className="w-4 h-4" /> رفع Excel/CSV</Button>
        }
      />
      <ActionToolbar
        addLabel="تذكرة جديدة"
        onAdd={() => setOpenManual(true)}
        onRefresh={load}
        onSearch={() => setOpenSearch(true)}
        onDelete={handleDelete}
        onPrint={() => { window.print() }}
        selectedId={selectedId}
        count={filtered.length}
      />
      {filter && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs">
          <Filter className="w-4 h-4 text-blue-600" /> فلتر نشط: <b>{filter.field}</b> {filter.condition === 'equals' ? 'يساوي' : 'يحتوي على'} "<b>{filter.term}</b>"
          <Button size="sm" variant="ghost" onClick={() => setFilter(null)} className="mr-auto text-rose-600">مسح</Button>
        </div>
      )}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Plane className="w-5 h-5 text-sky-600" /> سجل التذاكر ({filtered.length}{filter ? ` من ${tickets.length}` : ''})</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>التاريخ</TableHead><TableHead>PNR</TableHead><TableHead>خط السير</TableHead>
                <TableHead>المسافر</TableHead><TableHead>العميل</TableHead><TableHead>المورد</TableHead>
                <TableHead>الدفع</TableHead><TableHead>العملة</TableHead>
                <TableHead className="text-left">تكلفة</TableHead><TableHead className="text-left">بيع</TableHead>
                <TableHead className="text-left text-emerald-600">عمولة</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 && <TableRow><TableCell colSpan={12} className="text-center text-slate-400 py-8">{filter ? 'لا نتائج للفلتر' : 'لا توجد تذاكر'}</TableCell></TableRow>}
                {filtered.map(t => (
                  <TableRow key={t.id} className={selectedId === t.id ? 'bg-blue-50' : 'cursor-pointer hover:bg-slate-50'} onClick={() => setSelectedId(t.id === selectedId ? null : t.id)}>
                    <TableCell><input type="radio" checked={selectedId === t.id} onChange={() => setSelectedId(t.id)} /></TableCell>
                    <TableCell className="text-xs">{fmtDate(t.date)}</TableCell>
                    <TableCell className="font-mono text-xs">{t.pnr || '—'}</TableCell>
                    <TableCell className="text-xs">{t.route || '—'}</TableCell>
                    <TableCell className="text-xs">{t.passenger_name || '—'}</TableCell>
                    <TableCell>{t.client_name}</TableCell>
                    <TableCell>{t.supplier_name}</TableCell>
                    <TableCell>{t.payment_method === 'cash' ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">💵 نقد</Badge> : <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">🕓 آجل</Badge>}</TableCell>
                    <TableCell><Badge variant="outline">{t.currency}</Badge></TableCell>
                    <TableCell className="text-left font-semibold">{fmt(t.cost, t.currency)}</TableCell>
                    <TableCell className="text-left font-semibold">{fmt(t.sale_price, t.currency)}</TableCell>
                    <TableCell className="text-left font-bold text-emerald-600">{fmt(t.commission, t.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <TicketDialog open={openManual} onOpenChange={setOpenManual} clients={clients} suppliers={suppliers} rates={rates}
        onSaved={() => { load(); toast.success('تم حفظ التذكرة وإنشاء القيد المحاسبي تلقائياً') }} />
      <BulkImportDialog open={openBulk} onOpenChange={setOpenBulk} kind="tickets" onDone={() => { load(); setOpenBulk(false) }} />
      <UniversalSearchModal open={openSearch} onOpenChange={setOpenSearch}
        fields={[
          { key: 'pnr', label: 'رقم التذكرة (PNR)' },
          { key: 'passenger_name', label: 'اسم المسافر' },
          { key: 'client_name', label: 'اسم العميل' },
          { key: 'supplier_name', label: 'اسم المورد' },
          { key: 'route', label: 'خط السير' },
          { key: 'sale_price', label: 'سعر البيع' },
          { key: 'currency', label: 'العملة' },
        ]}
        onApply={setFilter}
        onClear={() => setFilter(null)}
      />
    </div>
  )
}

function TicketDialog({ open, onOpenChange, clients, suppliers, rates, onSaved }) {
  const [form, setForm] = useState({ date: todayISO(), currency: 'USD', exchange_rate: 1, client_id: '', supplier_id: '', pnr: '', route: '', passenger_name: '', passport_no: '', travel_date: '', cost: '', sale_price: '', payment_method: 'credit', box_id: '' })
  const [boxes, setBoxes] = useState([])
  const [saving, setSaving] = useState(false)
  const [quickC, setQuickC] = useState(false); const [quickS, setQuickS] = useState(false)
  useEffect(() => { if (rates && form.currency) setForm(f => ({ ...f, exchange_rate: rates[f.currency] || 1 })) }, [rates, form.currency])
  useEffect(() => { if (open) api('/boxes').then(setBoxes).catch(()=>{}) }, [open])
  useEffect(() => { if (form.payment_method === 'cash' && boxes[0] && !form.box_id) setForm(f => ({ ...f, box_id: boxes[0].id })) }, [form.payment_method, boxes])
  const commission = useMemo(() => (Number(form.sale_price) || 0) - (Number(form.cost) || 0), [form.sale_price, form.cost])
  const submit = async () => {
    if (!form.client_id || !form.supplier_id) return toast.error('اختر العميل والمورد')
    if (!form.cost || !form.sale_price) return toast.error('أدخل التكلفة وسعر البيع')
    if (form.payment_method === 'cash' && !form.box_id) return toast.error('اختر الصندوق للدفع النقدي')
    try { setSaving(true); await api('/tickets', { method: 'POST', body: form }); onOpenChange(false); setForm({ date: todayISO(), currency: 'USD', exchange_rate: 1, client_id: '', supplier_id: '', pnr: '', route: '', passenger_name: '', passport_no: '', travel_date: '', cost: '', sale_price: '', payment_method: 'credit', box_id: '' }); onSaved() }
    catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-xl"><div className="w-9 h-9 rounded-lg grad-brand flex items-center justify-center"><Plane className="w-4 h-4 text-white -rotate-45" /></div>حجز تذكرة جديدة</DialogTitle><DialogDescription>سيتم إنشاء قيد يومية تلقائي — نقد (خصم من الصندوق) أو آجل (على حساب العميل)</DialogDescription></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
            <Field label="تاريخ الحركة"><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="نوع العملة"><Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c} — {CUR_NAME[c]}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="سعر الصرف"><Input type="number" step="0.0001" value={form.exchange_rate} onChange={e => setForm({ ...form, exchange_rate: e.target.value })} /></Field>
            <Field label="اسم العميل" required>
              <SmartAutocomplete kind="client" items={clients} value={form.client_id}
                onChange={(id) => setForm({ ...form, client_id: id })}
                onCreated={() => onSaved && onSaved()} />
            </Field>
            <Field label="اسم المورد" required>
              <SmartAutocomplete kind="supplier" items={suppliers} value={form.supplier_id}
                onChange={(id) => setForm({ ...form, supplier_id: id })}
                onCreated={() => onSaved && onSaved()} />
            </Field>
            <Field label="رقم التذكرة / PNR"><Input value={form.pnr} onChange={e => setForm({ ...form, pnr: e.target.value })} /></Field>
            <Field label="خط السير"><Input value={form.route} onChange={e => setForm({ ...form, route: e.target.value })} placeholder="RUH - CAI" /></Field>
            <Field label="اسم المسافر"><Input value={form.passenger_name} onChange={e => setForm({ ...form, passenger_name: e.target.value })} /></Field>
            <Field label="رقم الجواز"><Input value={form.passport_no} onChange={e => setForm({ ...form, passport_no: e.target.value })} /></Field>
            <Field label="تاريخ السفر"><Input type="date" value={form.travel_date} onChange={e => setForm({ ...form, travel_date: e.target.value })} /></Field>
          </div>

          {/* Payment method selector */}
          <div className="bg-slate-50 border rounded-xl p-3 mt-2 flex items-center gap-4">
            <div className="text-sm font-bold text-slate-700">طريقة الدفع:</div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm({ ...form, payment_method: 'credit' })} className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${form.payment_method === 'credit' ? 'bg-amber-500 text-white border-amber-600 shadow' : 'bg-white text-slate-600 border-slate-300 hover:border-amber-400'}`}>🕓 آجل (على حساب العميل)</button>
              <button type="button" onClick={() => setForm({ ...form, payment_method: 'cash' })} className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${form.payment_method === 'cash' ? 'bg-emerald-500 text-white border-emerald-600 shadow' : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-400'}`}>💵 نقد (صندوق/بنك)</button>
            </div>
            {form.payment_method === 'cash' && (
              <div className="flex-1">
                <Select value={form.box_id} onValueChange={v => setForm({ ...form, box_id: v })}>
                  <SelectTrigger><SelectValue placeholder="اختر الصندوق/البنك" /></SelectTrigger>
                  <SelectContent>{boxes.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar} ({b.type === 'cash' ? 'صندوق' : 'بنك'})</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="bg-gradient-to-l from-blue-50 to-emerald-50 border rounded-xl p-4 mt-2">
            <div className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Banknote className="w-4 h-4 text-blue-600" /> الجانب المالي</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label={`سعر التكلفة (${form.currency})`} required><Input type="number" step="0.01" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} className="text-lg font-bold" /></Field>
              <Field label={`سعر البيع (${form.currency})`} required><Input type="number" step="0.01" value={form.sale_price} onChange={e => setForm({ ...form, sale_price: e.target.value })} className="text-lg font-bold" /></Field>
              <Field label={`العمولة (${form.currency})`}>
                <div className={`px-3 py-2 rounded-md border text-lg font-extrabold ${commission >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>{fmt(commission, form.currency)}</div>
              </Field>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button><Button onClick={submit} disabled={saving} className="grad-brand text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ + إنشاء قيد'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <QuickAddDialog open={quickC} onOpenChange={setQuickC} kind="client" onSaved={onSaved} />
      <QuickAddDialog open={quickS} onOpenChange={setQuickS} kind="supplier" onSaved={onSaved} />
    </>
  )
}

function QuickAddDialog({ open, onOpenChange, kind, onSaved, initialName }) {
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [address, setAddress] = useState(''); const [serviceType, setServiceType] = useState('')
  useEffect(() => { if (open && initialName) setName(initialName) }, [open, initialName])
  const save = async () => {
    if (!name) return toast.error('الاسم مطلوب')
    try {
      const body = { name, phone, notes: [address, serviceType].filter(Boolean).join(' • ') }
      const created = await api(`/${kind === 'client' ? 'clients' : 'suppliers'}`, { method: 'POST', body })
      toast.success('تمت الإضافة'); onOpenChange(false); setName(''); setPhone(''); setAddress(''); setServiceType('')
      onSaved && onSaved(created)
    } catch (e) { toast.error(e.message) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader><DialogTitle>إضافة {kind === 'client' ? 'عميل' : 'مورد'} سريع</DialogTitle><DialogDescription>سيُضاف مباشرةً للدليل المحاسبي وتُختار في الحقل الحالي</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Field label="الاسم" required><Input value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="الجوال"><Input value={phone} onChange={e => setPhone(e.target.value)} /></Field>
          <Field label="العنوان"><Input value={address} onChange={e => setAddress(e.target.value)} /></Field>
          {kind === 'supplier' && <Field label="نوع الخدمة"><Input value={serviceType} onChange={e => setServiceType(e.target.value)} placeholder="تذاكر / تأشيرات / فنادق" /></Field>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button><Button onClick={save} className="grad-brand text-white">حفظ</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================================================================
// SMART AUTOCOMPLETE (typeahead + inline create)
// ================================================================
function SmartAutocomplete({ kind, items, value, onChange, placeholder, onCreated }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const ref = useRef(null)

  const selected = items.find(i => i.id === value)
  const displayText = selected?.name || ''

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const filtered = query.trim()
    ? items.filter(i => i.name.toLowerCase().includes(query.toLowerCase().trim())).slice(0, 8)
    : items.slice(0, 8)
  const exactMatch = items.find(i => i.name.trim() === query.trim())

  return (
    <div className="relative" ref={ref}>
      <Input
        value={open ? query : displayText}
        onFocus={() => { setQuery(displayText); setOpen(true) }}
        onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange('') }}
        placeholder={placeholder || (kind === 'client' ? 'اكتب اسم العميل أو اختر' : 'اكتب اسم المورد أو اختر')}
      />
      {open && (
        <div className="absolute z-50 top-full right-0 left-0 mt-1 bg-white border rounded-lg shadow-2xl max-h-72 overflow-y-auto">
          {filtered.length === 0 && query.trim() && !exactMatch && (
            <button type="button" onClick={() => { setShowCreate(true); setOpen(false) }}
              className="w-full text-right p-3 hover:bg-emerald-50 border-b border-slate-100 flex items-center gap-2 text-emerald-700 font-semibold">
              <Plus className="w-4 h-4" /> إنشاء {kind === 'client' ? 'عميل' : 'مورد'} جديد: "{query}"
            </button>
          )}
          {filtered.map(i => (
            <button key={i.id} type="button" onClick={() => { onChange(i.id); setOpen(false); setQuery('') }}
              className={`w-full text-right p-2.5 hover:bg-blue-50 border-b border-slate-100 text-sm ${i.id === value ? 'bg-blue-100 font-bold' : ''}`}>
              <div className="flex items-center justify-between">
                <span>{i.name}</span>
                {i.phone && <span className="text-xs text-slate-500">{i.phone}</span>}
              </div>
            </button>
          ))}
          {filtered.length === 0 && !query.trim() && <div className="p-3 text-sm text-slate-400 text-center">اكتب للبحث أو أضف جديد</div>}
        </div>
      )}
      <QuickAddDialog open={showCreate} onOpenChange={setShowCreate} kind={kind} initialName={query}
        onSaved={(created) => { onCreated && onCreated(created); onChange(created.id); setQuery(''); }} />
    </div>
  )
}

// ================================================================
// ACTION TOOLBAR (unified across screens)
// ================================================================
function ActionToolbar({ onAdd, onRefresh, onDelete, onSearch, onPrint, onExit, selectedId, count, addLabel }) {
  const btn = (icon, label, cb, cls = '', disabled = false) => (
    <Button size="sm" variant="outline" onClick={cb} disabled={disabled}
      className={`gap-2 ${cls}`}>{icon}<span className="hidden md:inline">{label}</span></Button>
  )
  return (
    <div className="flex flex-wrap items-center gap-2 p-2 bg-white border rounded-lg shadow-sm mb-4">
      {onAdd && <Button onClick={onAdd} size="sm" className="grad-brand text-white gap-2"><Plus className="w-4 h-4" /> {addLabel || 'إضافة'}</Button>}
      {onRefresh && btn(<Activity className="w-4 h-4" />, 'تحديث', onRefresh)}
      {onSearch && btn(<Search className="w-4 h-4" />, 'بحث', onSearch)}
      {onDelete && btn(<Trash2 className="w-4 h-4" />, 'حذف', onDelete, 'text-rose-600 hover:bg-rose-50', !selectedId)}
      {onPrint && btn(<Printer className="w-4 h-4" />, 'طباعة', onPrint, 'text-blue-600 hover:bg-blue-50', !selectedId)}
      <div className="flex-1" />
      {count !== undefined && <Badge variant="secondary">{count} سجل</Badge>}
      {onExit && btn(<LogOut className="w-4 h-4" />, 'خروج', onExit, 'text-slate-500')}
    </div>
  )
}

// ================================================================
// UNIVERSAL SEARCH MODAL
// ================================================================
function UniversalSearchModal({ open, onOpenChange, fields, onApply, onClear }) {
  const [field, setField] = useState(fields[0]?.key || '')
  const [condition, setCondition] = useState('contains')
  const [term, setTerm] = useState('')
  useEffect(() => { if (open) { setField(fields[0]?.key || ''); setTerm('') } }, [open])
  const apply = () => { onApply({ field, condition, term }); onOpenChange(false) }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Search className="w-5 h-5 text-blue-600" /> بحث متقدم</DialogTitle><DialogDescription>اختر الحقل والشرط ثم أدخل قيمة البحث</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Field label="حقل البحث">
            <Select value={field} onValueChange={setField}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{fields.map(f => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="الشرط">
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contains">يحتوي على</SelectItem>
                <SelectItem value="equals">يساوي بالضبط</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="قيمة البحث"><Input value={term} onChange={e => setTerm(e.target.value)} placeholder="اكتب هنا..." autoFocus /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { onClear(); onOpenChange(false) }} className="text-slate-500">مسح الفلتر</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={apply} className="grad-brand text-white gap-2"><Search className="w-4 h-4" /> بحث</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function applyFilter(data, filter) {
  if (!filter || !filter.term) return data
  const t = String(filter.term).toLowerCase().trim()
  return data.filter(row => {
    const v = row[filter.field]
    if (v === undefined || v === null) return false
    const vs = String(v).toLowerCase()
    if (filter.condition === 'equals') return vs === t
    return vs.includes(t)
  })
}

// ================================================================
// QUOTA BANNER
// ================================================================
function QuotaBanner({ quota }) {
  if (!quota) return null
  const pct = quota.limit ? (quota.used / quota.limit) * 100 : 0
  if (pct < 90) return null
  const isMax = quota.used >= quota.limit
  return (
    <div className={`mb-4 p-4 rounded-xl border-2 flex items-center gap-3 ${isMax ? 'bg-rose-50 border-rose-300' : 'bg-amber-50 border-amber-300'}`}>
      <AlertTriangle className={`w-6 h-6 ${isMax ? 'text-rose-600' : 'text-amber-600'} shrink-0`} />
      <div className="flex-1">
        <div className={`font-bold ${isMax ? 'text-rose-800' : 'text-amber-800'}`}>
          {isMax ? '🚫 انتهت حصة قيود اليومية — النظام في وضع القراءة فقط' : `⚠️ تحذير: اقتربت من نهاية حصة قيود اليومية`}
        </div>
        <div className="text-sm text-slate-600 mt-1">تم استخدام <b>{quota.used}</b> من أصل <b>{quota.limit}</b> قيد ({pct.toFixed(0)}%). {isMax ? 'تواصل مع Target Media لتجديد الاشتراك.' : 'يُنصح بالتجديد قريباً لتجنب إيقاف الإدخال.'}</div>
      </div>
      <div className={`w-24 h-3 rounded-full bg-slate-200 overflow-hidden shrink-0`}>
        <div className={`h-full ${isMax ? 'bg-rose-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  )
}

// ================================================================
// BULK IMPORT DIALOG (Excel/CSV -> Mapping -> Preview -> Confirm)
// ================================================================
const TICKET_FIELDS = [
  { key: 'date', label: 'التاريخ', aliases: ['date', 'التاريخ', 'تاريخ الحركة'] },
  { key: 'currency', label: 'العملة', aliases: ['currency', 'العملة'] },
  { key: 'pnr', label: 'رقم التذكرة / PNR', aliases: ['pnr', 'ticket', 'ticket no', 'رقم التذكرة', 'رقم الحجز'] },
  { key: 'route', label: 'خط السير', aliases: ['route', 'itinerary', 'خط السير', 'المسار'] },
  { key: 'passenger_name', label: 'اسم المسافر', aliases: ['passenger', 'name', 'اسم المسافر', 'الاسم'] },
  { key: 'passport_no', label: 'رقم الجواز', aliases: ['passport', 'passport no', 'رقم الجواز'] },
  { key: 'travel_date', label: 'تاريخ السفر', aliases: ['travel date', 'departure', 'تاريخ السفر'] },
  { key: 'client_name', label: 'اسم العميل', aliases: ['client', 'customer', 'العميل', 'اسم العميل'] },
  { key: 'supplier_name', label: 'اسم المورد', aliases: ['supplier', 'vendor', 'agent', 'المورد', 'الوكيل', 'اسم المورد'] },
  { key: 'cost', label: 'التكلفة', aliases: ['cost', 'buy', 'purchase', 'التكلفة', 'الشراء'] },
  { key: 'sale_price', label: 'سعر البيع', aliases: ['sale', 'sell', 'price', 'sale price', 'البيع', 'سعر البيع'] },
]
const VISA_FIELDS = [
  { key: 'date', label: 'التاريخ', aliases: ['date', 'التاريخ'] },
  { key: 'service_type', label: 'نوع الخدمة', aliases: ['service', 'type', 'نوع الخدمة', 'النوع'] },
  { key: 'currency', label: 'العملة', aliases: ['currency', 'العملة'] },
  { key: 'passenger_name', label: 'اسم المسافر/المعتمر', aliases: ['name', 'pilgrim', 'الاسم', 'اسم المعتمر'] },
  { key: 'passport_no', label: 'رقم الجواز', aliases: ['passport', 'رقم الجواز'] },
  { key: 'nationality', label: 'الجنسية', aliases: ['nationality', 'الجنسية'] },
  { key: 'client_name', label: 'اسم العميل', aliases: ['client', 'customer', 'العميل'] },
  { key: 'supplier_name', label: 'اسم المورد', aliases: ['supplier', 'agent', 'المورد', 'الوكيل'] },
  { key: 'cost', label: 'التكلفة', aliases: ['cost', 'التكلفة'] },
  { key: 'sale_price', label: 'سعر البيع', aliases: ['sale', 'price', 'البيع', 'سعر البيع'] },
]

function autoMap(headers, fields) {
  const m = {}
  for (const f of fields) {
    const hit = headers.find(h => f.aliases.some(a => h.toString().toLowerCase().trim() === a.toLowerCase().trim()))
    if (hit) m[f.key] = hit
  }
  return m
}

function BulkImportDialog({ open, onOpenChange, kind, onDone }) {
  const fields = kind === 'tickets' ? TICKET_FIELDS : VISA_FIELDS
  const [step, setStep] = useState(1)  // 1=upload, 2=mapping, 3=preview, 4=result
  const [file, setFile] = useState(null)
  const [rawRows, setRawRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({})
  const [defaultCurrency, setDefaultCurrency] = useState('SAR')
  const [preview, setPreview] = useState(null)
  const [skipDup, setSkipDup] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

  const reset = () => { setStep(1); setFile(null); setRawRows([]); setHeaders([]); setMapping({}); setPreview(null); setResult(null) }
  useEffect(() => { if (!open) reset() }, [open])

  const handleFile = async (f) => {
    if (!f) return
    setFile(f)
    setLoading(true)
    try {
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
      if (rows.length === 0) { toast.error('الملف فارغ'); setLoading(false); return }
      const hd = Object.keys(rows[0])
      setHeaders(hd); setRawRows(rows)
      setMapping(autoMap(hd, fields))
      setStep(2)
    } catch (e) { toast.error('خطأ في قراءة الملف: ' + e.message) }
    finally { setLoading(false) }
  }

  const buildNormalized = () => {
    return rawRows.map(r => {
      const out = {}
      for (const f of fields) {
        const col = mapping[f.key]
        let val = col ? r[col] : ''
        if (val instanceof Date) val = val.toISOString().slice(0, 10)
        out[f.key] = val === undefined ? '' : val
      }
      if (!out.currency) out.currency = defaultCurrency
      else if (typeof out.currency === 'string') out.currency = out.currency.toUpperCase().trim()
      out.cost = Number(out.cost) || 0
      out.sale_price = Number(out.sale_price) || 0
      return out
    })
  }

  const doPreview = async () => {
    if (!mapping.client_name || !mapping.supplier_name || !mapping.cost || !mapping.sale_price) return toast.error('يجب تعيين حقول: العميل، المورد، التكلفة، البيع')
    try {
      setLoading(true)
      const rows = buildNormalized()
      const r = await api(`/import/${kind}/preview`, { method: 'POST', body: { rows } })
      setPreview(r); setStep(3)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }

  const doImport = async () => {
    try {
      setLoading(true)
      const r = await api(`/import/${kind}`, { method: 'POST', body: { rows: preview.rows, skip_duplicates: skipDup } })
      setResult(r); setStep(4)
      toast.success(`تم إنشاء ${r.created} • تخطي ${r.skipped} • فشل ${r.failed}`)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="w-9 h-9 rounded-lg grad-green flex items-center justify-center"><FileSpreadsheet className="w-4 h-4 text-white" /></div>
            استيراد جماعي — {kind === 'tickets' ? 'التذاكر' : 'التأشيرات والخدمات'}
          </DialogTitle>
          <DialogDescription>ارفع ملف Excel/CSV، عيّن الأعمدة، ثم راجع البيانات قبل الحفظ</DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2 my-2">
          {['رفع الملف', 'ربط الأعمدة', 'المعاينة', 'النتيجة'].map((s, i) => (
            <div key={i} className={`flex-1 flex items-center gap-2 ${step > i + 1 ? 'text-emerald-600' : step === i + 1 ? 'text-blue-600' : 'text-slate-400'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step > i + 1 ? 'bg-emerald-100 border-2 border-emerald-500' : step === i + 1 ? 'bg-blue-100 border-2 border-blue-500' : 'bg-slate-100 border-2 border-slate-300'}`}>
                {step > i + 1 ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              <span className="text-xs font-semibold">{s}</span>
              {i < 3 && <div className="flex-1 h-px bg-slate-200" />}
            </div>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50">
              <FileSpreadsheet className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
              <div className="font-bold text-slate-700 mb-1">اسحب ملف Excel/CSV هنا أو اضغط للاختيار</div>
              <div className="text-xs text-slate-500 mb-4">يدعم .xlsx, .xls, .csv (حد أقصى: 5000 صف)</div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => handleFile(e.target.files?.[0])} />
              <Button onClick={() => fileRef.current?.click()} disabled={loading} className="grad-green text-white gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} اختر الملف
              </Button>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-slate-700">
              <div className="font-bold mb-1">💡 نصيحة:</div>
              <div>يجب أن يحتوي الملف على صف رأس (headers). الأعمدة الأساسية المتوقعة:</div>
              <div className="mt-1 font-mono text-[11px]">{fields.map(f => f.label).join(' • ')}</div>
            </div>
          </div>
        )}

        {/* Step 2: Mapping */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Badge variant="outline">{file?.name}</Badge>
              <span>•</span>
              <span>{rawRows.length} صف</span>
            </div>
            <Field label="العملة الافتراضية (إذا لم توجد بالملف)">
              <Select value={defaultCurrency} onValueChange={setDefaultCurrency}>
                <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c} — {CUR_NAME[c]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {fields.map(f => (
                <div key={f.key} className="flex items-center gap-2 p-2 rounded-md bg-slate-50 border">
                  <div className="w-40 text-sm font-semibold text-slate-700 shrink-0">{f.label}</div>
                  <Select value={mapping[f.key] || '__none'} onValueChange={v => setMapping(m => ({ ...m, [f.key]: v === '__none' ? '' : v }))}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— بدون —</SelectItem>
                      {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>عودة</Button>
              <Button onClick={doPreview} disabled={loading} className="grad-brand text-white">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'التالي — معاينة'}</Button>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 3 && preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <StatMini label="إجمالي الصفوف" value={preview.rows.length} color="bg-slate-100 text-slate-700" />
              <StatMini label="صفوف صالحة" value={preview.valid_count} color="bg-emerald-100 text-emerald-700" />
              <StatMini label="مكررة" value={preview.rows.filter(r => r.__dup).length} color="bg-amber-100 text-amber-700" />
              <StatMini label="بها أخطاء" value={preview.rows.filter(r => r.__errors.length).length} color="bg-rose-100 text-rose-700" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(preview.totals).map(([c, t]) => (
                <Card key={c}><CardContent className="p-3">
                  <div className="text-xs text-slate-500">{c} — {t.count} صف</div>
                  <div className="text-xs">تكلفة: <span className="font-bold">{fmt(t.cost, c)}</span></div>
                  <div className="text-xs">بيع: <span className="font-bold">{fmt(t.sale, c)}</span></div>
                  <div className="text-xs">ربح: <span className="font-bold text-emerald-600">{fmt(t.profit, c)}</span></div>
                </CardContent></Card>
              ))}
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <Switch checked={skipDup} onCheckedChange={setSkipDup} />
              <div className="text-sm">تخطي الصفوف المكررة (بناءً على {kind === 'tickets' ? 'رقم PNR' : 'رقم الجواز'})</div>
            </div>
            <div className="border rounded-lg overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10">
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>الحالة</TableHead>
                    {kind === 'tickets' ? <TableHead>PNR</TableHead> : <TableHead>الجواز</TableHead>}
                    <TableHead>المسافر</TableHead><TableHead>العميل</TableHead><TableHead>المورد</TableHead>
                    <TableHead>عملة</TableHead><TableHead className="text-left">تكلفة</TableHead>
                    <TableHead className="text-left">بيع</TableHead><TableHead className="text-left">عمولة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map(r => (
                    <TableRow key={r.__row} className={r.__errors.length ? 'bg-rose-50' : r.__dup ? 'bg-amber-50' : ''}>
                      <TableCell className="text-xs">{r.__row}</TableCell>
                      <TableCell>
                        {r.__errors.length ? <Badge className="bg-rose-100 text-rose-700 gap-1"><XCircle className="w-3 h-3" /> خطأ</Badge>
                          : r.__dup ? <Badge className="bg-amber-100 text-amber-700 gap-1"><AlertTriangle className="w-3 h-3" /> مكرر</Badge>
                          : <Badge className="bg-emerald-100 text-emerald-700 gap-1"><CheckCircle2 className="w-3 h-3" /> صالح</Badge>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{kind === 'tickets' ? r.pnr : r.passport_no}</TableCell>
                      <TableCell className="text-xs">{r.passenger_name || '—'}</TableCell>
                      <TableCell className="text-xs">{r.client_name || '—'}</TableCell>
                      <TableCell className="text-xs">{r.supplier_name || '—'}</TableCell>
                      <TableCell><Badge variant="outline">{r.currency}</Badge></TableCell>
                      <TableCell className="text-left">{fmt(r.cost, r.currency)}</TableCell>
                      <TableCell className="text-left">{fmt(r.sale_price, r.currency)}</TableCell>
                      <TableCell className={`text-left font-bold ${r.__commission >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(r.__commission, r.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>عودة للربط</Button>
              <Button onClick={doImport} disabled={loading || preview.valid_count === 0} className="grad-green text-white gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} تأكيد الاستيراد ({preview.valid_count} صف)
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Result */}
        {step === 4 && result && (
          <div className="space-y-4 text-center py-6">
            <div className="w-20 h-20 rounded-full grad-green mx-auto flex items-center justify-center shadow-xl">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <div className="text-2xl font-extrabold text-slate-800">اكتمل الاستيراد!</div>
            <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
              <StatMini label="تم إنشاؤها" value={result.created} color="bg-emerald-100 text-emerald-700" />
              <StatMini label="تخطي" value={result.skipped} color="bg-amber-100 text-amber-700" />
              <StatMini label="فشل" value={result.failed} color="bg-rose-100 text-rose-700" />
            </div>
            <div className="text-sm text-slate-500">تم إنشاء القيود المحاسبية تلقائياً لجميع الصفوف الناجحة</div>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={() => { reset(); }}>استيراد ملف آخر</Button>
              <Button onClick={onDone} className="grad-brand text-white">إغلاق</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function StatMini({ label, value, color }) {
  return <div className={`rounded-lg p-3 ${color}`}><div className="text-xs">{label}</div><div className="text-xl font-extrabold">{value}</div></div>
}

// ================================================================
// VISAS SCREEN with Manual + Bulk import
// ================================================================
const VISA_TYPES = ['تأشيرة عمرة', 'موافقة أمنية', 'فيزا سياحية', 'فيزا عمل', 'حجز فندق', 'خدمات أخرى']

function VisasScreen() {
  const [visas, setVisas] = useState([])
  const [clients, setClients] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [openManual, setOpenManual] = useState(false)
  const [openBulk, setOpenBulk] = useState(false)
  const [rates, setRates] = useState(null)
  const load = async () => {
    try {
      const [v, c, s, r] = await Promise.all([api('/visas'), api('/clients'), api('/suppliers'), api('/rates')])
      setVisas(v); setClients(c); setSuppliers(s); setRates(r.rates)
    } catch (e) { toast.error(e.message) }
  }
  useEffect(() => { load() }, [])
  return (
    <div className="space-y-6">
      <TopBar
        title="التأشيرات والخدمات"
        subtitle="تأشيرات عمرة، موافقات أمنية، فيز، حجز فنادق — إدخال يدوي أو استيراد Excel"
        right={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpenBulk(true)} className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"><FileSpreadsheet className="w-4 h-4" /> رفع Excel/CSV</Button>
            <Button onClick={() => setOpenManual(true)} className="gap-2 grad-green text-white shadow-lg"><Plus className="w-4 h-4" /> خدمة جديدة</Button>
          </div>
        }
      />
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileBadge2 className="w-5 h-5 text-emerald-600" /> سجل التأشيرات ({visas.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead><TableHead>النوع</TableHead><TableHead>المسافر</TableHead>
                  <TableHead>الجواز</TableHead><TableHead>الجنسية</TableHead><TableHead>العميل</TableHead>
                  <TableHead>المورد</TableHead><TableHead>العملة</TableHead>
                  <TableHead className="text-left">تكلفة</TableHead><TableHead className="text-left">بيع</TableHead>
                  <TableHead className="text-left text-emerald-600">عمولة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visas.length === 0 && <TableRow><TableCell colSpan={11} className="text-center text-slate-400 py-8">لا توجد خدمات</TableCell></TableRow>}
                {visas.map(v => (
                  <TableRow key={v.id}>
                    <TableCell className="text-xs">{fmtDate(v.date)}</TableCell>
                    <TableCell><Badge variant="secondary">{v.service_type}</Badge></TableCell>
                    <TableCell>{v.passenger_name || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{v.passport_no || '—'}</TableCell>
                    <TableCell className="text-xs">{v.nationality || '—'}</TableCell>
                    <TableCell>{v.client_name}</TableCell>
                    <TableCell>{v.supplier_name}</TableCell>
                    <TableCell><Badge variant="outline">{v.currency}</Badge></TableCell>
                    <TableCell className="text-left font-semibold">{fmt(v.cost, v.currency)}</TableCell>
                    <TableCell className="text-left font-semibold">{fmt(v.sale_price, v.currency)}</TableCell>
                    <TableCell className="text-left font-bold text-emerald-600">{fmt(v.commission, v.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <VisaDialog open={openManual} onOpenChange={setOpenManual} clients={clients} suppliers={suppliers} rates={rates}
        onSaved={() => { load(); toast.success('تم حفظ الخدمة') }} />
      <BulkImportDialog open={openBulk} onOpenChange={setOpenBulk} kind="visas" onDone={() => { load(); setOpenBulk(false) }} />
    </div>
  )
}

function VisaDialog({ open, onOpenChange, clients, suppliers, rates, onSaved }) {
  const [form, setForm] = useState({ date: todayISO(), service_type: 'تأشيرة عمرة', currency: 'SAR', exchange_rate: 0.267, client_id: '', supplier_id: '', passenger_name: '', passport_no: '', nationality: '', cost: '', sale_price: '', payment_method: 'credit', box_id: '' })
  const [boxes, setBoxes] = useState([])
  const [saving, setSaving] = useState(false)
  const [qc, setQc] = useState(false); const [qs, setQs] = useState(false)
  useEffect(() => { if (rates) setForm(f => ({ ...f, exchange_rate: rates[f.currency] || 1 })) }, [rates, form.currency])
  useEffect(() => { if (open) api('/boxes').then(setBoxes).catch(()=>{}) }, [open])
  useEffect(() => { if (form.payment_method === 'cash' && boxes[0] && !form.box_id) setForm(f => ({ ...f, box_id: boxes[0].id })) }, [form.payment_method, boxes])
  const commission = (Number(form.sale_price) || 0) - (Number(form.cost) || 0)
  const submit = async () => {
    if (!form.client_id || !form.supplier_id) return toast.error('اختر العميل والمورد')
    if (!form.cost || !form.sale_price) return toast.error('أدخل التكلفة وسعر البيع')
    if (form.payment_method === 'cash' && !form.box_id) return toast.error('اختر الصندوق للدفع النقدي')
    try { setSaving(true); await api('/visas', { method: 'POST', body: form }); onOpenChange(false); onSaved(); setForm({ date: todayISO(), service_type: 'تأشيرة عمرة', currency: 'SAR', exchange_rate: 0.267, client_id: '', supplier_id: '', passenger_name: '', passport_no: '', nationality: '', cost: '', sale_price: '', payment_method: 'credit', box_id: '' }) }
    catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-xl"><div className="w-9 h-9 rounded-lg grad-green flex items-center justify-center"><FileBadge2 className="w-4 h-4 text-white" /></div>خدمة / تأشيرة جديدة</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="التاريخ"><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="نوع الخدمة"><Select value={form.service_type} onValueChange={v => setForm({ ...form, service_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{VISA_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="العملة"><Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c} — {CUR_NAME[c]}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="العميل" required><SmartAutocomplete kind="client" items={clients} value={form.client_id} onChange={id => setForm({ ...form, client_id: id })} onCreated={() => onSaved && onSaved()} /></Field>
            <Field label="المورد" required><SmartAutocomplete kind="supplier" items={suppliers} value={form.supplier_id} onChange={id => setForm({ ...form, supplier_id: id })} onCreated={() => onSaved && onSaved()} /></Field>
            <Field label="سعر الصرف"><Input type="number" step="0.0001" value={form.exchange_rate} onChange={e => setForm({ ...form, exchange_rate: e.target.value })} /></Field>
            <Field label="اسم صاحب التأشيرة"><Input value={form.passenger_name} onChange={e => setForm({ ...form, passenger_name: e.target.value })} /></Field>
            <Field label="رقم الجواز"><Input value={form.passport_no} onChange={e => setForm({ ...form, passport_no: e.target.value })} /></Field>
            <Field label="الجنسية"><Input value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })} /></Field>
          </div>
          <div className="bg-slate-50 border rounded-xl p-3 mt-2 flex items-center gap-4">
            <div className="text-sm font-bold text-slate-700">طريقة الدفع:</div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm({ ...form, payment_method: 'credit' })} className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${form.payment_method === 'credit' ? 'bg-amber-500 text-white border-amber-600 shadow' : 'bg-white text-slate-600 border-slate-300 hover:border-amber-400'}`}>🕓 آجل</button>
              <button type="button" onClick={() => setForm({ ...form, payment_method: 'cash' })} className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${form.payment_method === 'cash' ? 'bg-emerald-500 text-white border-emerald-600 shadow' : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-400'}`}>💵 نقد</button>
            </div>
            {form.payment_method === 'cash' && (
              <div className="flex-1"><Select value={form.box_id} onValueChange={v => setForm({ ...form, box_id: v })}><SelectTrigger><SelectValue placeholder="اختر الصندوق/البنك" /></SelectTrigger><SelectContent>{boxes.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar}</SelectItem>)}</SelectContent></Select></div>
            )}
          </div>
          <div className="bg-gradient-to-l from-emerald-50 to-blue-50 border rounded-xl p-4 mt-2">
            <div className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Banknote className="w-4 h-4 text-emerald-600" /> الجانب المالي</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label={`التكلفة (${form.currency})`} required><Input type="number" step="0.01" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} className="text-lg font-bold" /></Field>
              <Field label={`سعر البيع (${form.currency})`} required><Input type="number" step="0.01" value={form.sale_price} onChange={e => setForm({ ...form, sale_price: e.target.value })} className="text-lg font-bold" /></Field>
              <Field label={`العمولة (${form.currency})`}><div className={`px-3 py-2 rounded-md border text-lg font-extrabold ${commission >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>{fmt(commission, form.currency)}</div></Field>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button><Button onClick={submit} disabled={saving} className="grad-green text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ + قيد'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <QuickAddDialog open={qc} onOpenChange={setQc} kind="client" onSaved={onSaved} />
      <QuickAddDialog open={qs} onOpenChange={setQs} kind="supplier" onSaved={onSaved} />
    </>
  )
}

// ================================================================
// VOUCHER + PARTIES + BOXES + CHART + JOURNAL + REPORTS (same as v1)
// ================================================================
function VoucherScreen({ mode }) {
  const cfg = mode === 'receipt'
    ? { title: 'سند قبض', subtitle: 'المستلم من العميل / المورد', icon: ArrowDownLeft, grad: 'grad-green', partyLabel: 'المستلم من', defaultParty: 'client' }
    : { title: 'سند صرف', subtitle: 'المدفوع إلى المورد / مصروفات', icon: ArrowUpRight, grad: 'grad-rose', partyLabel: 'المدفوع إلى', defaultParty: 'supplier' }
  const [vouchers, setVouchers] = useState([])
  const [clients, setClients] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [boxes, setBoxes] = useState([])
  const [open, setOpen] = useState(false)
  const load = async () => {
    try {
      const [v, c, s, b] = await Promise.all([api(`/vouchers?type=${mode}`), api('/clients'), api('/suppliers'), api('/boxes')])
      setVouchers(v); setClients(c); setSuppliers(s); setBoxes(b)
    } catch (e) { toast.error(e.message) }
  }
  useEffect(() => { load() }, [mode])
  return (
    <div className="space-y-6">
      <TopBar title={cfg.title} subtitle={cfg.subtitle}
        right={<Button onClick={() => setOpen(true)} className={`gap-2 ${cfg.grad} text-white shadow-lg`}><Plus className="w-4 h-4" /> {cfg.title} جديد</Button>} />
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><cfg.icon className="w-5 h-5" /> سجل السندات ({vouchers.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>{cfg.partyLabel}</TableHead><TableHead>البيان</TableHead><TableHead>الطريقة</TableHead><TableHead>الصندوق</TableHead><TableHead>العملة</TableHead><TableHead className="text-left">المبلغ</TableHead></TableRow></TableHeader>
            <TableBody>
              {vouchers.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">لا توجد سندات</TableCell></TableRow>}
              {vouchers.map(v => (
                <TableRow key={v.id}>
                  <TableCell className="text-xs">{fmtDate(v.date)}</TableCell>
                  <TableCell className="font-semibold">{v.party_name}</TableCell>
                  <TableCell className="text-xs">{v.description || '—'}</TableCell>
                  <TableCell><Badge variant="secondary">{v.method}</Badge></TableCell>
                  <TableCell>{v.box_name}</TableCell>
                  <TableCell><Badge variant="outline">{v.currency}</Badge></TableCell>
                  <TableCell className={`text-left font-bold ${mode === 'receipt' ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(v.amount, v.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <VoucherDialog open={open} onOpenChange={setOpen} mode={mode} clients={clients} suppliers={suppliers} boxes={boxes} onSaved={() => { load(); toast.success('تم حفظ السند') }} />
    </div>
  )
}

function VoucherDialog({ open, onOpenChange, mode, clients, suppliers, boxes, onSaved }) {
  const defaultParty = mode === 'receipt' ? 'client' : 'supplier'
  const [form, setForm] = useState({ date: todayISO(), currency: 'USD', amount: '', party_type: defaultParty, party_id: '', party_name: '', box_id: '', method: '', description: '' })
  const [saving, setSaving] = useState(false)
  useEffect(() => { setForm(f => ({ ...f, party_type: defaultParty, party_id: '', party_name: '' })) }, [mode, defaultParty])
  useEffect(() => { if (boxes[0] && !form.box_id) setForm(f => ({ ...f, box_id: boxes[0].id })) }, [boxes])
  const list = form.party_type === 'client' ? clients : form.party_type === 'supplier' ? suppliers : []
  const submit = async () => {
    if (!form.amount) return toast.error('أدخل المبلغ')
    if (form.party_type !== 'expense' && !form.party_id) return toast.error('اختر الطرف')
    if (!form.box_id) return toast.error('اختر الصندوق')
    try { setSaving(true); await api('/vouchers', { method: 'POST', body: { type: mode, ...form } }); onOpenChange(false); setForm({ date: todayISO(), currency: 'USD', amount: '', party_type: defaultParty, party_id: '', party_name: '', box_id: boxes[0]?.id || '', method: '', description: '' }); onSaved() }
    catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader><DialogTitle>{mode === 'receipt' ? 'سند قبض جديد' : 'سند صرف جديد'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="التاريخ"><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="نوع الطرف"><Select value={form.party_type} onValueChange={v => setForm({ ...form, party_type: v, party_id: '' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="client">عميل</SelectItem><SelectItem value="supplier">مورد</SelectItem>{mode === 'payment' && <SelectItem value="expense">مصروف</SelectItem>}</SelectContent></Select></Field>
          {form.party_type === 'expense' ? (
            <Field label="بيان المصروف" required><Input value={form.party_name} onChange={e => setForm({ ...form, party_name: e.target.value })} placeholder="إيجار / كهرباء" /></Field>
          ) : (
            <Field label={mode === 'receipt' ? 'المستلم من' : 'المدفوع إلى'} required><Select value={form.party_id} onValueChange={v => setForm({ ...form, party_id: v })}><SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger><SelectContent>{list.map(x => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></Field>
          )}
          <Field label="الصندوق/البنك" required><Select value={form.box_id} onValueChange={v => setForm({ ...form, box_id: v })}><SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger><SelectContent>{boxes.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar} ({b.type === 'cash' ? 'صندوق' : 'بنك'})</SelectItem>)}</SelectContent></Select></Field>
          <Field label="العملة"><Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="المبلغ" required><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="text-lg font-bold" /></Field>
          <Field label="طريقة الدفع"><Input value={form.method} onChange={e => setForm({ ...form, method: e.target.value })} placeholder="نقدي / حوالة" /></Field>
          <div className="md:col-span-2"><Field label="البيان"><Textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button><Button onClick={submit} disabled={saving} className={mode === 'receipt' ? 'grad-green text-white' : 'grad-rose text-white'}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PartiesScreen({ kind }) {
  const cfg = kind === 'clients' ? { title: 'العملاء', icon: Users, grad: 'grad-purple' } : { title: 'الموردون والوكلاء', icon: Building2, grad: 'grad-gold' }
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [notes, setNotes] = useState(''); const [q, setQ] = useState('')
  const load = async () => { try { setRows(await api(`/${kind}`)) } catch (e) { toast.error(e.message) } }
  useEffect(() => { load() }, [kind])
  const save = async () => { if (!name) return toast.error('الاسم مطلوب'); try { await api(`/${kind}`, { method: 'POST', body: { name, phone, notes } }); setName(''); setPhone(''); setNotes(''); setOpen(false); load(); toast.success('تمت الإضافة') } catch (e) { toast.error(e.message) } }
  const filtered = rows.filter(r => !q || r.name.includes(q) || (r.phone || '').includes(q))
  return (
    <div className="space-y-6">
      <TopBar title={cfg.title} subtitle={`إجمالي: ${rows.length}`}
        right={<div className="flex items-center gap-2"><div className="relative"><Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input placeholder="بحث..." value={q} onChange={e => setQ(e.target.value)} className="pr-9 w-64" /></div><Button onClick={() => setOpen(true)} className={`gap-2 ${cfg.grad} text-white`}><Plus className="w-4 h-4" /> إضافة</Button></div>} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(r => (
          <Card key={r.id} className="overflow-hidden hover:shadow-md transition-shadow">
            <div className={`h-1 ${cfg.grad}`} />
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div><div className="font-bold text-slate-800">{r.name}</div><div className="text-xs text-slate-500">{r.phone || '—'}</div></div>
                <div className={`w-10 h-10 rounded-lg ${cfg.grad} flex items-center justify-center`}><cfg.icon className="w-5 h-5 text-white" /></div>
              </div>
              <Separator className="my-3" />
              <div className="space-y-1">{CURRENCIES.map(c => { const bal = r.balances?.[c] || 0; return <div key={c} className="flex items-center justify-between text-sm"><span className="text-xs text-slate-500">{c}</span><span className={`font-bold ${bal > 0 ? 'text-emerald-600' : bal < 0 ? 'text-rose-600' : 'text-slate-400'}`}>{fmt(bal, c)}</span></div> })}</div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <div className="col-span-full text-center text-slate-400 py-10">لا توجد بيانات</div>}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إضافة {kind === 'clients' ? 'عميل' : 'مورد'}</DialogTitle></DialogHeader>
          <div className="space-y-3"><Field label="الاسم" required><Input value={name} onChange={e => setName(e.target.value)} /></Field><Field label="الجوال"><Input value={phone} onChange={e => setPhone(e.target.value)} /></Field><Field label="ملاحظات"><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></Field></div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={save} className={`${cfg.grad} text-white`}>حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BoxesScreen() {
  const [rows, setRows] = useState([]); const [open, setOpen] = useState(false)
  const [name, setName] = useState(''); const [type, setType] = useState('cash')
  const load = async () => { try { setRows(await api('/boxes')) } catch (e) { toast.error(e.message) } }
  useEffect(() => { load() }, [])
  const save = async () => { if (!name) return toast.error('الاسم مطلوب'); try { await api('/boxes', { method: 'POST', body: { name_ar: name, type } }); setName(''); setOpen(false); load() } catch (e) { toast.error(e.message) } }
  return (
    <div className="space-y-6">
      <TopBar title="الصناديق والبنوك" subtitle="أرصدة الصناديق النقدية والحسابات البنكية"
        right={<Button onClick={() => setOpen(true)} className="gap-2 grad-gold text-white"><Plus className="w-4 h-4" /> إضافة</Button>} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map(b => (
          <Card key={b.id} className="overflow-hidden"><div className={`h-1 ${b.type === 'cash' ? 'grad-gold' : 'grad-brand'}`} />
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${b.type === 'cash' ? 'grad-gold' : 'grad-brand'}`}>{b.type === 'cash' ? <Wallet className="w-5 h-5 text-white" /> : <Landmark className="w-5 h-5 text-white" />}</div>
                <div><div className="font-bold text-slate-800">{b.name_ar}</div><div className="text-xs text-slate-500">{b.type === 'cash' ? 'صندوق نقدي' : 'حساب بنكي'}</div></div>
              </div>
              <Separator className="my-2" />
              <div className="space-y-1">{CURRENCIES.map(c => (<div key={c} className="flex items-center justify-between text-sm"><span className="text-xs text-slate-500">{c}</span><span className={`font-bold ${(b.balances?.[c] || 0) >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>{fmt(b.balances?.[c] || 0, c)}</span></div>))}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إضافة صندوق / بنك</DialogTitle></DialogHeader>
          <div className="space-y-3"><Field label="الاسم" required><Input value={name} onChange={e => setName(e.target.value)} /></Field><Field label="النوع"><Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">صندوق نقدي</SelectItem><SelectItem value="bank">بنك</SelectItem></SelectContent></Select></Field></div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={save} className="grad-gold text-white">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ChartScreen() {
  const [rows, setRows] = useState([])
  useEffect(() => { api('/accounts').then(setRows).catch(e => toast.error(e.message)) }, [])
  const byType = { asset: rows.filter(r => r.type === 'asset'), liability: rows.filter(r => r.type === 'liability'), revenue: rows.filter(r => r.type === 'revenue'), expense: rows.filter(r => r.type === 'expense') }
  const typeLabel = { asset: 'الأصول', liability: 'الخصوم', revenue: 'الإيرادات', expense: 'المصروفات' }
  const typeGrad = { asset: 'grad-brand', liability: 'grad-rose', revenue: 'grad-green', expense: 'grad-gold' }
  return (
    <div className="space-y-6">
      <TopBar title="الدليل المحاسبي" subtitle="شجرة الحسابات الرئيسية والفرعية" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(byType).map(([t, list]) => (
          <Card key={t}><CardHeader><CardTitle className="flex items-center gap-2"><div className={`w-8 h-8 rounded-md ${typeGrad[t]}`} /> {typeLabel[t]}</CardTitle></CardHeader>
            <CardContent><div className="space-y-1">{list.map(a => (<div key={a.id} className={`flex items-center justify-between p-2 rounded-md ${a.is_group ? 'bg-slate-50 font-semibold' : 'pr-4'}`}><div className="flex items-center gap-2"><span className="font-mono text-xs text-slate-500">{a.code}</span><span className="text-sm">{a.name_ar}</span></div>{a.currency && <Badge variant="outline">{a.currency}</Badge>}</div>))}</div></CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function JournalScreen() {
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const load = () => api('/journal-entries').then(setRows).catch(e => toast.error(e.message))
  useEffect(() => { load() }, [])
  return (
    <div className="space-y-6">
      <TopBar title="قيود اليومية" subtitle="جميع القيود المحاسبية التلقائية واليدوية"
        right={<Button onClick={() => setOpen(true)} className="gap-2 grad-slate text-white shadow-lg"><Plus className="w-4 h-4" /> إضافة قيد يومي</Button>} />
      <div className="space-y-3">
        {rows.map(je => {
          const totalDebit = (je.lines || []).reduce((s, l) => s + (l.debit || 0), 0)
          const isMulti = je.currency === 'MULTI'
          return (
            <Card key={je.id} className="overflow-hidden">
              <CardHeader className="pb-2 bg-slate-50">
                <div className="flex items-center justify-between">
                  <div><div className="text-sm font-bold text-slate-800">{je.description}</div><div className="text-xs text-slate-500">{fmtDate(je.date)} • {je.ref_type} • {isMulti ? 'متعدد العملات' : je.currency}</div></div>
                  {!isMulti && <Badge variant="secondary" className="text-sm font-bold">{fmt(totalDebit, je.currency)}</Badge>}
                  {isMulti && <Badge className="bg-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-100">قيد متعدد العملات</Badge>}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>الحساب</TableHead><TableHead>الطرف</TableHead>{isMulti && <TableHead>العملة</TableHead>}<TableHead className="text-left">مدين</TableHead><TableHead className="text-left">دائن</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(je.lines || []).map((l, i) => {
                      const cur = l.currency || je.currency
                      return (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{l.account_code} — {l.account_name}</TableCell>
                          <TableCell className="text-xs">{l.party_name}</TableCell>
                          {isMulti && <TableCell><Badge variant="outline">{cur}</Badge></TableCell>}
                          <TableCell className="text-left font-semibold text-blue-700">{l.debit ? fmt(l.debit, cur) : '—'}</TableCell>
                          <TableCell className="text-left font-semibold text-rose-700">{l.credit ? fmt(l.credit, cur) : '—'}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )
        })}
        {rows.length === 0 && <div className="text-center text-slate-400 py-10">لا توجد قيود</div>}
      </div>
      <ManualJournalDialog open={open} onOpenChange={setOpen} onSaved={load} />
    </div>
  )
}

function ReportsScreen() {
  return (
    <div className="space-y-6">
      <TopBar title="التقارير المالية" subtitle="الأرباح، كشوف الحسابات، ميزان المراجعة، قائمة الدخل" />
      <Tabs defaultValue="profits">
        <TabsList className="w-full justify-start bg-slate-100"><TabsTrigger value="profits">الأرباح</TabsTrigger><TabsTrigger value="statement">كشف حساب</TabsTrigger><TabsTrigger value="trial">ميزان المراجعة</TabsTrigger><TabsTrigger value="income">قائمة الدخل</TabsTrigger></TabsList>
        <TabsContent value="profits" className="mt-4"><ProfitsReport /></TabsContent>
        <TabsContent value="statement" className="mt-4"><StatementReport /></TabsContent>
        <TabsContent value="trial" className="mt-4"><TrialBalanceReport /></TabsContent>
        <TabsContent value="income" className="mt-4"><IncomeStatement /></TabsContent>
      </Tabs>
    </div>
  )
}

function DateRange({ from, setFrom, to, setTo }) {
  return <div className="flex items-end gap-2 mb-4"><Field label="من"><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field><Field label="إلى"><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field></div>
}

function ProfitsReport() {
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
  const [to, setTo] = useState(todayISO()); const [data, setData] = useState(null)
  const load = async () => { try { setData(await api(`/reports/profits?from=${from}&to=${to}`)) } catch (e) { toast.error(e.message) } }
  useEffect(() => { load() }, [from, to])
  return (
    <Card><CardContent className="p-4">
      <DateRange from={from} setFrom={setFrom} to={to} setTo={setTo} />
      {data && (<>
        <div className="grid grid-cols-3 gap-3 mb-4">{CURRENCIES.map(c => (<Card key={c}><CardContent className="p-3"><div className="text-xs text-slate-500">إجمالي الأرباح — {c}</div><div className="text-lg font-extrabold text-emerald-600">{fmt(data.totals_profit[c], c)}</div><div className="text-xs text-slate-500 mt-1">مبيعات: {fmt(data.totals_sales[c], c)}</div></CardContent></Card>))}</div>
        <Table><TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>النوع</TableHead><TableHead>مرجع</TableHead><TableHead>العميل</TableHead><TableHead>المورد</TableHead><TableHead>عملة</TableHead><TableHead className="text-left">تكلفة</TableHead><TableHead className="text-left">بيع</TableHead><TableHead className="text-left">ربح</TableHead></TableRow></TableHeader>
          <TableBody>{data.rows.map(r => (<TableRow key={r.id}><TableCell className="text-xs">{fmtDate(r.date)}</TableCell><TableCell><Badge variant="outline">{r.kind}</Badge></TableCell><TableCell className="font-mono text-xs">{r.ref || '—'}</TableCell><TableCell>{r.client}</TableCell><TableCell>{r.supplier}</TableCell><TableCell>{r.currency}</TableCell><TableCell className="text-left">{fmt(r.cost, r.currency)}</TableCell><TableCell className="text-left">{fmt(r.sale, r.currency)}</TableCell><TableCell className="text-left font-bold text-emerald-600">{fmt(r.profit, r.currency)}</TableCell></TableRow>))}</TableBody>
        </Table>
      </>)}
    </CardContent></Card>
  )
}

function StatementReport() {
  const [type, setType] = useState('client'); const [id, setId] = useState('')
  const [clients, setClients] = useState([]); const [suppliers, setSuppliers] = useState([]); const [data, setData] = useState(null)
  useEffect(() => { api('/clients').then(setClients); api('/suppliers').then(setSuppliers) }, [])
  const list = type === 'client' ? clients : suppliers
  const load = async () => { if (!id) return; try { setData(await api(`/reports/statement?party_type=${type}&party_id=${id}`)) } catch (e) { toast.error(e.message) } }
  useEffect(() => { load() }, [type, id])
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-end gap-2 mb-4">
        <Field label="النوع"><Select value={type} onValueChange={v => { setType(v); setId(''); setData(null) }}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="client">عميل</SelectItem><SelectItem value="supplier">مورد</SelectItem></SelectContent></Select></Field>
        <Field label={type === 'client' ? 'العميل' : 'المورد'}><Select value={id} onValueChange={setId}><SelectTrigger className="w-64"><SelectValue placeholder="اختر" /></SelectTrigger><SelectContent>{list.map(x => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></Field>
      </div>
      {data?.party && <div className="mb-3 p-3 rounded-lg bg-slate-50 border"><div className="text-sm font-bold">{data.party.name}</div><div className="flex gap-4 text-xs mt-1">{CURRENCIES.map(c => <div key={c}>{c}: <span className="font-bold">{fmt(data.party.balances?.[c] || 0, c)}</span></div>)}</div></div>}
      {data && (
        <Table><TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>البيان</TableHead><TableHead>عملة</TableHead><TableHead className="text-left">مدين</TableHead><TableHead className="text-left">دائن</TableHead><TableHead className="text-left">الرصيد</TableHead></TableRow></TableHeader>
          <TableBody>{data.rows.map((r, i) => (<TableRow key={i}><TableCell className="text-xs">{fmtDate(r.date)}</TableCell><TableCell className="text-xs">{r.description}</TableCell><TableCell>{r.currency}</TableCell><TableCell className="text-left text-blue-700">{r.debit ? fmt(r.debit, r.currency) : '—'}</TableCell><TableCell className="text-left text-rose-700">{r.credit ? fmt(r.credit, r.currency) : '—'}</TableCell><TableCell className="text-left font-bold">{fmt(r.balance, r.currency)}</TableCell></TableRow>))}{data.rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-6">لا توجد حركات</TableCell></TableRow>}</TableBody>
        </Table>
      )}
    </CardContent></Card>
  )
}

function TrialBalanceReport() {
  const [data, setData] = useState(null)
  useEffect(() => { api('/reports/trial-balance').then(setData).catch(e => toast.error(e.message)) }, [])
  return (
    <Card><CardContent className="p-4">
      {data && (<>
        <div className="grid grid-cols-3 gap-3 mb-4">{CURRENCIES.map(c => (<Card key={c}><CardContent className="p-3"><div className="text-xs text-slate-500">{c}</div><div className="flex justify-between text-sm mt-1"><span>مدين:</span><span className="font-bold text-blue-700">{fmt(data.totals[c].d, c)}</span></div><div className="flex justify-between text-sm"><span>دائن:</span><span className="font-bold text-rose-700">{fmt(data.totals[c].c, c)}</span></div><div className="flex justify-between text-sm mt-1 pt-1 border-t"><span>الفرق:</span><span className={`font-bold ${Math.abs(data.totals[c].d - data.totals[c].c) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>{fmt(data.totals[c].d - data.totals[c].c, c)}</span></div></CardContent></Card>))}</div>
        <Table><TableHeader><TableRow><TableHead>الكود</TableHead><TableHead>الحساب</TableHead><TableHead>الطرف</TableHead><TableHead>عملة</TableHead><TableHead className="text-left">مدين</TableHead><TableHead className="text-left">دائن</TableHead><TableHead className="text-left">الرصيد</TableHead></TableRow></TableHeader>
          <TableBody>{data.rows.map((r, i) => (<TableRow key={i}><TableCell className="font-mono text-xs">{r.code}</TableCell><TableCell>{r.name}</TableCell><TableCell className="text-xs">{r.party_name || '—'}</TableCell><TableCell>{r.currency}</TableCell><TableCell className="text-left text-blue-700">{fmt(r.debit, r.currency)}</TableCell><TableCell className="text-left text-rose-700">{fmt(r.credit, r.currency)}</TableCell><TableCell className={`text-left font-bold ${r.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(r.balance, r.currency)}</TableCell></TableRow>))}</TableBody>
        </Table>
      </>)}
    </CardContent></Card>
  )
}

function IncomeStatement() {
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
  const [to, setTo] = useState(todayISO()); const [data, setData] = useState(null)
  const load = async () => { try { setData(await api(`/reports/income-statement?from=${from}&to=${to}`)) } catch (e) { toast.error(e.message) } }
  useEffect(() => { load() }, [from, to])
  return (
    <Card><CardContent className="p-4">
      <DateRange from={from} setFrom={setFrom} to={to} setTo={setTo} />
      {data && (
        <div className="space-y-4">
          <div><div className="text-sm font-bold text-slate-700 mb-2">الإيرادات</div>
            <div className="grid grid-cols-3 gap-2">{['tickets', 'visas', 'other'].map(k => (<Card key={k}><CardContent className="p-3"><div className="text-xs text-slate-500">{k === 'tickets' ? 'عمولات تذاكر' : k === 'visas' ? 'عمولات تأشيرات' : 'أخرى'}</div>{CURRENCIES.map(c => <div key={c} className="text-xs flex justify-between"><span>{c}</span><span className="font-bold text-emerald-600">{fmt(data.revenue[k][c], c)}</span></div>)}</CardContent></Card>))}</div>
          </div>
          {data.fx_gain_usd !== undefined && (
            <Card className={`border-2 ${data.fx_gain_usd >= 0 ? 'border-emerald-200 bg-emerald-50/50' : 'border-rose-200 bg-rose-50/50'}`}>
              <CardContent className="p-4 flex items-center justify-between">
                <div><div className="text-sm font-bold text-slate-700">{data.fx_gain_usd >= 0 ? 'أرباح' : 'خسائر'} فروق العملات (المصارفة) — حساب 4104</div><div className="text-xs text-slate-500">بمعادل الدولار</div></div>
                <div className={`text-2xl font-extrabold ${data.fx_gain_usd >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(data.fx_gain_usd, 'USD')}</div>
              </CardContent>
            </Card>
          )}
          <div><div className="text-sm font-bold text-slate-700 mb-2">المصروفات</div>
            <Card><CardContent className="p-3">{CURRENCIES.map(c => <div key={c} className="text-sm flex justify-between"><span>{c}</span><span className="font-bold text-rose-600">{fmt(data.expenses[c], c)}</span></div>)}</CardContent></Card>
          </div>
          <Card className="grad-brand text-white"><CardContent className="p-4"><div className="text-xs opacity-80">صافي الربح (بمعادل الدولار)</div><div className="text-3xl font-extrabold">{fmt(data.net_profit_usd, 'USD')}</div><div className="text-xs opacity-80 mt-2 grid grid-cols-2 gap-2"><div>إيرادات: {fmt(data.total_revenue_usd, 'USD')}</div><div>مصروفات: {fmt(data.total_expenses_usd, 'USD')}</div></div></CardContent></Card>
        </div>
      )}
    </CardContent></Card>
  )
}

// ================================================================
// OFFICE SETTINGS (White-Labeling)
// ================================================================
function OfficeSettings() {
  const { settings, refreshMe, user, tenant } = useAuth()
  const [f, setF] = useState({
    agency_name: '', logo_base64: '', header: '', footer: '', tax_id: '', commercial_id: '',
    phone: '', address: '', email: '', primary_color: '#1e3a8a', rates: { USD: 1, SAR: 0.267, YER: 0.0038 },
  })
  const [saving, setSaving] = useState(false)
  const [users, setUsers] = useState([])
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'staff' })
  const [addingUser, setAddingUser] = useState(false)
  const logoRef = useRef(null)

  useEffect(() => {
    if (settings) setF(prev => ({ ...prev, ...settings }))
    if (user.role === 'owner') api('/tenant/users').then(setUsers).catch(() => {})
  }, [settings])

  const save = async () => {
    try {
      setSaving(true)
      await api('/tenant/settings', { method: 'PUT', body: f })
      toast.success('تم حفظ الإعدادات')
      refreshMe()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const handleLogo = async (file) => {
    if (!file) return
    if (file.size > 700 * 1024) return toast.error('الحد الأقصى للشعار 700KB')
    const reader = new FileReader()
    reader.onload = () => setF({ ...f, logo_base64: reader.result })
    reader.readAsDataURL(file)
  }

  const addUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) return toast.error('املأ الحقول')
    try {
      setAddingUser(true)
      await api('/tenant/users', { method: 'POST', body: newUser })
      const list = await api('/tenant/users'); setUsers(list)
      setNewUser({ name: '', email: '', password: '', role: 'staff' }); toast.success('تمت الإضافة')
    } catch (e) { toast.error(e.message) } finally { setAddingUser(false) }
  }

  const toggleUser = async (u) => {
    try { await api(`/tenant/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }); setUsers(await api('/tenant/users')) }
    catch (e) { toast.error(e.message) }
  }

  return (
    <div className="space-y-6">
      <TopBar title="إعدادات المكتب" subtitle="خصص هوية مكتبك وإدارة الحسابات" />

      <Tabs defaultValue="brand">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="brand"><ImageIcon className="w-4 h-4 ml-1" /> الهوية والعلامة</TabsTrigger>
          <TabsTrigger value="users"><Users className="w-4 h-4 ml-1" /> المستخدمون</TabsTrigger>
          <TabsTrigger value="rates"><ArrowUpRight className="w-4 h-4 ml-1" /> أسعار الصرف</TabsTrigger>
          <TabsTrigger value="print"><Printer className="w-4 h-4 ml-1" /> معاينة الطباعة</TabsTrigger>
        </TabsList>

        <TabsContent value="brand" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-1">
              <CardHeader><CardTitle className="text-base">شعار المكتب</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed rounded-xl p-4 text-center bg-slate-50">
                  {f.logo_base64 ? (
                    <img src={f.logo_base64} alt="logo" className="w-32 h-32 object-contain mx-auto rounded-lg bg-white shadow" />
                  ) : (
                    <div className="w-32 h-32 mx-auto rounded-lg bg-slate-200 flex items-center justify-center"><ImageIcon className="w-10 h-10 text-slate-400" /></div>
                  )}
                  <input ref={logoRef} type="file" accept="image/*" hidden onChange={e => handleLogo(e.target.files?.[0])} />
                  <Button onClick={() => logoRef.current?.click()} variant="outline" className="mt-3 gap-2"><Upload className="w-4 h-4" /> اختر صورة</Button>
                  {f.logo_base64 && <Button onClick={() => setF({ ...f, logo_base64: '' })} variant="ghost" className="mt-2 text-rose-600 text-xs">حذف</Button>}
                  <div className="text-[11px] text-slate-400 mt-2">PNG/JPG بحد أقصى 700KB</div>
                </div>
                <Field label="اللون الرئيسي"><div className="flex gap-2 items-center"><input type="color" value={f.primary_color} onChange={e => setF({ ...f, primary_color: e.target.value })} className="w-12 h-10 rounded border cursor-pointer" /><Input value={f.primary_color} onChange={e => setF({ ...f, primary_color: e.target.value })} className="flex-1" dir="ltr" /></div></Field>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">بيانات المكتب</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="اسم المكتب التجاري"><Input value={f.agency_name} onChange={e => setF({ ...f, agency_name: e.target.value })} placeholder={tenant?.name} /></Field>
                <Field label="البريد الإلكتروني"><Input dir="ltr" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
                <Field label="الهاتف"><Input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
                <Field label="السجل التجاري"><Input value={f.commercial_id} onChange={e => setF({ ...f, commercial_id: e.target.value })} /></Field>
                <Field label="الرقم الضريبي"><Input value={f.tax_id} onChange={e => setF({ ...f, tax_id: e.target.value })} /></Field>
                <div className="md:col-span-2"><Field label="العنوان"><Input value={f.address} onChange={e => setF({ ...f, address: e.target.value })} /></Field></div>
                <div className="md:col-span-2"><Field label="نص رأس الفواتير"><Textarea rows={2} value={f.header} onChange={e => setF({ ...f, header: e.target.value })} placeholder="بسم الله الرحمن الرحيم / شعار / وصف قصير" /></Field></div>
                <div className="md:col-span-2"><Field label="نص تذييل الفواتير"><Textarea rows={2} value={f.footer} onChange={e => setF({ ...f, footer: e.target.value })} placeholder="شكراً لتعاملكم معنا" /></Field></div>
              </CardContent>
            </Card>
          </div>
          <div className="flex justify-end mt-4"><Button onClick={save} disabled={saving} className="grad-brand text-white gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ الإعدادات'}</Button></div>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between"><CardTitle>المستخدمون ({users.length}/{tenant?.max_users || 2})</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end mb-4 p-3 bg-slate-50 rounded-lg">
                <Field label="الاسم"><Input value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} /></Field>
                <Field label="البريد"><Input dir="ltr" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} /></Field>
                <Field label="كلمة المرور"><Input dir="ltr" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} /></Field>
                <Button onClick={addUser} disabled={addingUser} className="grad-brand text-white gap-2">{addingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} إضافة موظف</Button>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>الاسم</TableHead><TableHead>البريد</TableHead><TableHead>الدور</TableHead><TableHead>الحالة</TableHead><TableHead className="text-left">إجراء</TableHead></TableRow></TableHeader>
                <TableBody>
                  {users.map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="font-semibold">{u.name}</TableCell>
                      <TableCell dir="ltr" className="text-xs">{u.email}</TableCell>
                      <TableCell><Badge variant={u.role === 'owner' ? 'default' : 'outline'}>{u.role === 'owner' ? 'مالك' : 'موظف'}</Badge></TableCell>
                      <TableCell><Badge className={u.active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : 'bg-rose-100 text-rose-700 hover:bg-rose-100'}>{u.active ? 'نشط' : 'موقوف'}</Badge></TableCell>
                      <TableCell className="text-left">{u.role !== 'owner' && <Button size="sm" variant="outline" onClick={() => toggleUser(u)}><Power className="w-3 h-3" /></Button>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rates" className="mt-4">
          <Card>
            <CardHeader><CardTitle>أسعار الصرف مقابل الدولار</CardTitle><CardDescription>تُستخدم لتوحيد المؤشرات في لوحة التحكم وقائمة الدخل</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              {CURRENCIES.map(c => (
                <Field key={c} label={`${c} = ؟ USD`}>
                  <Input type="number" step="0.0001" value={f.rates?.[c] || 1} onChange={e => setF({ ...f, rates: { ...f.rates, [c]: Number(e.target.value) } })} />
                </Field>
              ))}
            </CardContent>
            <div className="p-4"><Button onClick={save} disabled={saving} className="grad-brand text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ الأسعار'}</Button></div>
          </Card>
        </TabsContent>

        <TabsContent value="print" className="mt-4">
          <Card>
            <CardHeader><CardTitle>معاينة قالب الطباعة</CardTitle><CardDescription>هكذا ستظهر فواتيرك وسنداتك</CardDescription></CardHeader>
            <CardContent>
              <div className="border rounded-xl p-8 bg-white max-w-3xl mx-auto shadow-sm" style={{ borderTop: `4px solid ${f.primary_color}` }}>
                <div className="flex items-center justify-between mb-4">
                  {f.logo_base64 ? <img src={f.logo_base64} className="h-16 object-contain" alt="logo" /> : <div className="w-16 h-16 bg-slate-100 rounded flex items-center justify-center"><ImageIcon className="w-8 h-8 text-slate-400" /></div>}
                  <div className="text-left">
                    <div className="text-2xl font-extrabold" style={{ color: f.primary_color }}>{f.agency_name || tenant?.name}</div>
                    <div className="text-xs text-slate-500">{f.phone} • {f.email}</div>
                    <div className="text-xs text-slate-500">{f.address}</div>
                    {f.tax_id && <div className="text-xs">الرقم الضريبي: {f.tax_id}</div>}
                  </div>
                </div>
                {f.header && <div className="text-center text-sm my-3 p-2 bg-slate-50 rounded">{f.header}</div>}
                <div className="border-t border-b py-3 my-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-slate-500">رقم السند:</span> <b>PRINT-DEMO-001</b></div>
                    <div><span className="text-slate-500">التاريخ:</span> {fmtDate(new Date())}</div>
                    <div><span className="text-slate-500">العميل:</span> عميل تجريبي</div>
                    <div><span className="text-slate-500">العملة:</span> SAR</div>
                  </div>
                </div>
                <Table>
                  <TableHeader><TableRow style={{ background: f.primary_color + '15' }}><TableHead>الوصف</TableHead><TableHead className="text-left">المبلغ</TableHead></TableRow></TableHeader>
                  <TableBody>
                    <TableRow><TableCell>تذكرة طيران — RUH/CAI</TableCell><TableCell className="text-left font-bold">1,500.00</TableCell></TableRow>
                    <TableRow><TableCell>تأشيرة عمرة</TableCell><TableCell className="text-left font-bold">300.00</TableCell></TableRow>
                    <TableRow style={{ background: f.primary_color + '10' }}><TableCell className="font-bold">الإجمالي</TableCell><TableCell className="text-left font-extrabold" style={{ color: f.primary_color }}>1,800.00 SAR</TableCell></TableRow>
                  </TableBody>
                </Table>
                {f.footer && <div className="text-center text-xs text-slate-500 mt-6 pt-3 border-t">{f.footer}</div>}
              </div>
              <div className="text-center mt-4"><Button onClick={() => window.print()} variant="outline" className="gap-2"><Printer className="w-4 h-4" /> طباعة تجريبية</Button></div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ================================================================
// TENANT APP
// ================================================================
function TenantApp() {
  const [tab, setTab] = useState('dashboard')
  const { user, tenant, logout } = useAuth()
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar current={tab} onChange={setTab} />
      <main className="flex-1 p-6 md:p-8 max-w-[1600px]">
        <div className="flex justify-end mb-2">
          <Button variant="ghost" onClick={logout} className="gap-2 text-slate-500 hover:text-rose-600"><LogOut className="w-4 h-4" /> خروج</Button>
        </div>
        <QuotaBanner quota={tenant?.journal_quota} />
        {tab === 'dashboard' && <Dashboard setTab={setTab} />}
        {tab === 'tickets' && <TicketsScreen />}
        {tab === 'visas' && <VisasScreen />}
        {tab === 'fx' && <FxScreen />}
        {tab === 'receipt' && <VoucherScreen mode="receipt" />}
        {tab === 'payment' && <VoucherScreen mode="payment" />}
        {tab === 'clients' && <PartiesScreen kind="clients" />}
        {tab === 'suppliers' && <PartiesScreen kind="suppliers" />}
        {tab === 'boxes' && <BoxesScreen />}
        {tab === 'chart' && <ChartScreen />}
        {tab === 'journal' && <JournalScreen />}
        {tab === 'reports' && <ReportsScreen />}
        {tab === 'settings' && user.role === 'owner' && <OfficeSettings />}
      </main>
    </div>
  )
}

// ================================================================
// CURRENCY EXCHANGE SCREEN (Buy / Sell)
// ================================================================
function FxScreen() {
  const [txs, setTxs] = useState([])
  const [boxes, setBoxes] = useState([])
  const [openBuy, setOpenBuy] = useState(false)
  const [openSell, setOpenSell] = useState(false)
  const load = async () => {
    try {
      const [t, b] = await Promise.all([api('/fx'), api('/boxes')])
      setTxs(t); setBoxes(b)
    } catch (e) { toast.error(e.message) }
  }
  useEffect(() => { load() }, [])
  const totalGain = txs.reduce((s, t) => s + (t.fx_gain_usd || 0), 0)
  return (
    <div className="space-y-6">
      <TopBar
        title="صرافة العملات"
        subtitle="شراء وبيع العملات مع حساب فروق الصرف تلقائياً في قائمة الدخل"
        right={
          <div className="flex gap-2">
            <Button onClick={() => setOpenBuy(true)} className="gap-2 grad-green text-white shadow-lg"><ArrowDownLeft className="w-4 h-4" /> شراء عملة</Button>
            <Button onClick={() => setOpenSell(true)} className="gap-2 grad-rose text-white shadow-lg"><ArrowUpRight className="w-4 h-4" /> بيع عملة</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={ArrowLeftRight} label="إجمالي عمليات الصرافة" value={txs.length} grad="grad-purple" />
        <StatCard icon={TrendingUp} label={totalGain >= 0 ? 'إجمالي أرباح فروق العملات' : 'إجمالي خسائر فروق العملات'} value={fmt(totalGain, 'USD')} grad={totalGain >= 0 ? 'grad-green' : 'grad-rose'} />
        <StatCard icon={Sparkles} label="آخر عملية" value={txs[0] ? fmtDate(txs[0].date) : '—'} grad="grad-brand" />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ArrowLeftRight className="w-5 h-5 text-fuchsia-600" /> سجل عمليات الصرافة</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>التاريخ</TableHead><TableHead>النوع</TableHead>
                <TableHead>المبلغ</TableHead><TableHead>السعر</TableHead>
                <TableHead>القيمة</TableHead><TableHead>العميل</TableHead>
                <TableHead>الغرض</TableHead>
                <TableHead className="text-left">فرق الصرف (USD)</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {txs.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-8">لا توجد عمليات صرافة</TableCell></TableRow>}
                {txs.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs">{fmtDate(t.date)}</TableCell>
                    <TableCell><Badge className={t.type === 'buy' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : 'bg-rose-100 text-rose-700 hover:bg-rose-100'}>{t.type === 'buy' ? 'شراء' : 'بيع'}</Badge></TableCell>
                    <TableCell className="font-bold">{fmt(t.amount, t.currency)}</TableCell>
                    <TableCell className="font-mono text-xs">{t.exchange_rate}</TableCell>
                    <TableCell className="font-bold">{fmt(t.counter_amount, t.counter_currency)}</TableCell>
                    <TableCell>{t.customer_name || '—'}</TableCell>
                    <TableCell className="text-xs">{t.purpose || '—'}</TableCell>
                    <TableCell className={`text-left font-bold ${(t.fx_gain_usd || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(t.fx_gain_usd, 'USD')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <FxDialog open={openBuy} onOpenChange={setOpenBuy} type="buy" boxes={boxes} onSaved={() => { load(); toast.success('تم تسجيل عملية الشراء + قيد محاسبي') }} />
      <FxDialog open={openSell} onOpenChange={setOpenSell} type="sell" boxes={boxes} onSaved={() => { load(); toast.success('تم تسجيل عملية البيع + قيد محاسبي') }} />
    </div>
  )
}

function FxDialog({ open, onOpenChange, type, boxes, onSaved }) {
  const cfg = type === 'buy'
    ? { title: 'شراء عملات', color: 'grad-green', desc: 'يشتري المكتب عملة من الزبون ويدفع مقابلها بعملة أخرى' }
    : { title: 'بيع عملات', color: 'grad-rose', desc: 'يبيع المكتب عملة للزبون ويستلم مقابلها بعملة أخرى' }
  const [form, setForm] = useState({
    date: todayISO(), currency: 'USD', amount: '', exchange_rate: '',
    counter_currency: 'SAR', payment_method: 'cash',
    box_currency_id: '', box_counter_id: '',
    customer_name: '', customer_phone: '', id_type: 'هوية وطنية', id_number: '',
    source_of_funds: '', purpose: '', remarks: '',
  })
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (boxes.length && !form.box_currency_id) {
      setForm(f => ({ ...f, box_currency_id: boxes[0].id, box_counter_id: boxes[1]?.id || boxes[0].id }))
    }
  }, [boxes])
  const counter_amount = (Number(form.amount) || 0) * (Number(form.exchange_rate) || 0)
  const submit = async () => {
    if (!form.amount || !form.exchange_rate) return toast.error('أدخل المبلغ وسعر الصرف')
    if (form.currency === form.counter_currency) return toast.error('اختر عملتين مختلفتين')
    if (!form.box_currency_id || !form.box_counter_id) return toast.error('اختر الصناديق')
    try { setSaving(true); await api('/fx', { method: 'POST', body: { type, ...form } }); onOpenChange(false); onSaved(); setForm(f => ({ ...f, amount: '', exchange_rate: '', customer_name: '', customer_phone: '', id_number: '', source_of_funds: '', purpose: '', remarks: '' })) }
    catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className={`w-9 h-9 rounded-lg ${cfg.color} flex items-center justify-center`}><ArrowLeftRight className="w-4 h-4 text-white" /></div>
            {cfg.title}
          </DialogTitle>
          <DialogDescription>{cfg.desc}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-2">
          <Field label="التاريخ"><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="العملة" required><Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="المبلغ" required><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="text-lg font-bold" /></Field>
          <Field label="سعر الصرف" required><Input type="number" step="0.0001" value={form.exchange_rate} onChange={e => setForm({ ...form, exchange_rate: e.target.value })} className="text-lg font-bold" /></Field>

          <Field label="المقابل بعملة" required><Select value={form.counter_currency} onValueChange={v => setForm({ ...form, counter_currency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="القيمة الإجمالية">
            <div className={`px-3 py-2 rounded-md border text-lg font-extrabold bg-blue-50 border-blue-200 text-blue-700`}>
              {fmt(counter_amount, form.counter_currency)}
            </div>
          </Field>
          <Field label={`صندوق ${form.currency}`} required><Select value={form.box_currency_id} onValueChange={v => setForm({ ...form, box_currency_id: v })}><SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger><SelectContent>{boxes.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar}</SelectItem>)}</SelectContent></Select></Field>
          <Field label={`صندوق ${form.counter_currency}`} required><Select value={form.box_counter_id} onValueChange={v => setForm({ ...form, box_counter_id: v })}><SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger><SelectContent>{boxes.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar}</SelectItem>)}</SelectContent></Select></Field>
        </div>

        <Separator className="my-2" />
        <div className="text-sm font-bold text-slate-700">بيانات الزبون</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="اسم الزبون"><Input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} /></Field>
          <Field label="هاتف الزبون"><Input value={form.customer_phone} onChange={e => setForm({ ...form, customer_phone: e.target.value })} /></Field>
          <Field label="نوع الهوية"><Select value={form.id_type} onValueChange={v => setForm({ ...form, id_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="هوية وطنية">هوية وطنية</SelectItem><SelectItem value="جواز سفر">جواز سفر</SelectItem><SelectItem value="إقامة">إقامة</SelectItem><SelectItem value="أخرى">أخرى</SelectItem></SelectContent></Select></Field>
          <Field label="رقم الهوية"><Input value={form.id_number} onChange={e => setForm({ ...form, id_number: e.target.value })} /></Field>
          <Field label="مصدر الأموال"><Input value={form.source_of_funds} onChange={e => setForm({ ...form, source_of_funds: e.target.value })} placeholder="راتب / تجارة / تحويلات" /></Field>
          <Field label="الغرض من المعاملة"><Input value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} placeholder="سياحة / علاج / تحويل" /></Field>
          <div className="md:col-span-3"><Field label="ملاحظات"><Textarea rows={2} value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} /></Field></div>
        </div>

        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> سيتم حساب فرق الصرف (ربح/خسارة) تلقائياً بمقارنة سعر الصرف المُدخل مع أسعار الصرف المرجعية للمكتب، وترحيله للحساب 4104
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className={`${cfg.color} text-white`}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ + إنشاء قيد'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================================================================
// MANUAL JOURNAL VOUCHER DIALOG (Single & Dual)
// ================================================================
function ManualJournalDialog({ open, onOpenChange, onSaved }) {
  const [mode, setMode] = useState('single')  // 'single' | 'dual'
  const [singleForm, setSingleForm] = useState({
    date: todayISO(), currency: 'USD', description: '',
    lines: [
      { account_code: '', account_name: '', debit: '', credit: '' },
      { account_code: '', account_name: '', debit: '', credit: '' },
    ],
  })
  const [dualForm, setDualForm] = useState({
    date: todayISO(), description: '',
    debit_account_code: '', debit_account_name: '', debit_currency: 'USD', debit_amount: '',
    credit_account_code: '', credit_account_name: '', credit_currency: 'SAR', credit_amount: '',
  })
  const [saving, setSaving] = useState(false)

  const totalD = singleForm.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
  const totalC = singleForm.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
  const balanced = Math.abs(totalD - totalC) < 0.01 && totalD > 0

  const addLine = () => setSingleForm(f => ({ ...f, lines: [...f.lines, { account_code: '', account_name: '', debit: '', credit: '' }] }))
  const removeLine = (i) => setSingleForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }))
  const updateLine = (i, k, v) => setSingleForm(f => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? { ...l, [k]: v } : l) }))

  const submit = async () => {
    try {
      setSaving(true)
      if (mode === 'single') {
        if (!balanced) return toast.error('القيد غير متوازن — يجب أن يتساوى مجموع المدين والدائن')
        await api('/journal-entries', { method: 'POST', body: singleForm })
      } else {
        if (!dualForm.debit_amount || !dualForm.credit_amount) return toast.error('أدخل المبالغ')
        await api('/journal-entries', { method: 'POST', body: { dual: true, ...dualForm } })
      }
      toast.success('تم حفظ القيد اليدوي')
      onOpenChange(false); onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="w-9 h-9 rounded-lg grad-slate flex items-center justify-center"><ReceiptText className="w-4 h-4 text-white" /></div>
            سند قيد يومي (يدوي)
          </DialogTitle>
          <DialogDescription>لتسجيل التسويات المحاسبية أو القيود بين حسابات بعملات مختلفة</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-2">
          <button onClick={() => setMode('single')} className={`px-4 py-2 rounded-lg text-sm font-bold border ${mode === 'single' ? 'bg-blue-500 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300'}`}>قيد عادي (عملة واحدة)</button>
          <button onClick={() => setMode('dual')} className={`px-4 py-2 rounded-lg text-sm font-bold border ${mode === 'dual' ? 'bg-fuchsia-500 text-white border-fuchsia-600' : 'bg-white text-slate-600 border-slate-300'}`}>قيد ثنائي (عملتين مختلفتين)</button>
        </div>

        {mode === 'single' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Field label="التاريخ"><Input type="date" value={singleForm.date} onChange={e => setSingleForm({ ...singleForm, date: e.target.value })} /></Field>
              <Field label="العملة"><Select value={singleForm.currency} onValueChange={v => setSingleForm({ ...singleForm, currency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="البيان"><Input value={singleForm.description} onChange={e => setSingleForm({ ...singleForm, description: e.target.value })} placeholder="سبب القيد" /></Field>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>الحساب</TableHead><TableHead>الوصف / الطرف</TableHead><TableHead className="text-left">مدين</TableHead><TableHead className="text-left">دائن</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {singleForm.lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell><Input value={l.account_code} onChange={e => updateLine(i, 'account_code', e.target.value)} placeholder="1301" className="text-xs w-24" /></TableCell>
                    <TableCell><Input value={l.account_name} onChange={e => updateLine(i, 'account_name', e.target.value)} placeholder="اسم الحساب" /></TableCell>
                    <TableCell><Input type="number" step="0.01" value={l.debit} onChange={e => updateLine(i, 'debit', e.target.value)} className="text-left w-32" /></TableCell>
                    <TableCell><Input type="number" step="0.01" value={l.credit} onChange={e => updateLine(i, 'credit', e.target.value)} className="text-left w-32" /></TableCell>
                    <TableCell>{singleForm.lines.length > 2 && <Button size="icon" variant="ghost" onClick={() => removeLine(i)}><Trash2 className="w-3 h-3 text-rose-500" /></Button>}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold bg-slate-50"><TableCell colSpan={2} className="text-left">الإجمالي</TableCell><TableCell className="text-left text-blue-700">{fmt(totalD, singleForm.currency)}</TableCell><TableCell className="text-left text-rose-700">{fmt(totalC, singleForm.currency)}</TableCell><TableCell>{balanced ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-amber-500" />}</TableCell></TableRow>
              </TableBody>
            </Table>
            <Button variant="outline" onClick={addLine} className="gap-2"><Plus className="w-4 h-4" /> إضافة سطر</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="التاريخ"><Input type="date" value={dualForm.date} onChange={e => setDualForm({ ...dualForm, date: e.target.value })} /></Field>
              <Field label="البيان"><Input value={dualForm.description} onChange={e => setDualForm({ ...dualForm, description: e.target.value })} placeholder="مصارفة / تسوية" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="border-2 border-blue-200 rounded-lg p-4 bg-blue-50/40">
                <div className="text-sm font-bold text-blue-700 mb-3">الطرف المدين (Debit)</div>
                <div className="space-y-3">
                  <Field label="كود الحساب"><Input value={dualForm.debit_account_code} onChange={e => setDualForm({ ...dualForm, debit_account_code: e.target.value })} placeholder="1101" /></Field>
                  <Field label="اسم الحساب"><Input value={dualForm.debit_account_name} onChange={e => setDualForm({ ...dualForm, debit_account_name: e.target.value })} placeholder="صندوق دولار" /></Field>
                  <Field label="العملة"><Select value={dualForm.debit_currency} onValueChange={v => setDualForm({ ...dualForm, debit_currency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
                  <Field label="المبلغ" required><Input type="number" step="0.01" value={dualForm.debit_amount} onChange={e => setDualForm({ ...dualForm, debit_amount: e.target.value })} className="text-lg font-bold text-blue-700" /></Field>
                </div>
              </div>
              <div className="border-2 border-rose-200 rounded-lg p-4 bg-rose-50/40">
                <div className="text-sm font-bold text-rose-700 mb-3">الطرف الدائن (Credit)</div>
                <div className="space-y-3">
                  <Field label="كود الحساب"><Input value={dualForm.credit_account_code} onChange={e => setDualForm({ ...dualForm, credit_account_code: e.target.value })} placeholder="1102" /></Field>
                  <Field label="اسم الحساب"><Input value={dualForm.credit_account_name} onChange={e => setDualForm({ ...dualForm, credit_account_name: e.target.value })} placeholder="صندوق سعودي" /></Field>
                  <Field label="العملة"><Select value={dualForm.credit_currency} onValueChange={v => setDualForm({ ...dualForm, credit_currency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
                  <Field label="المبلغ" required><Input type="number" step="0.01" value={dualForm.credit_amount} onChange={e => setDualForm({ ...dualForm, credit_amount: e.target.value })} className="text-lg font-bold text-rose-700" /></Field>
                </div>
              </div>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> سيتم موازنة القيد تلقائياً بإضافة سطر فرق العملة (حساب 4104) بالفرق بين مقابلَي المبلغين بمعادل الدولار
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="grad-slate text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ القيد'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================================================================
// ROOT APP
// ================================================================
function App() {
  const [auth, setAuth] = useState({ loading: true, user: null, tenant: null, settings: null })

  const refreshMe = useCallback(async () => {
    try {
      const r = await api('/auth/me')
      setAuth({ loading: false, user: r.user, tenant: r.tenant, settings: r.settings })
    } catch { setAuth({ loading: false, user: null, tenant: null, settings: null }) }
  }, [])

  useEffect(() => { refreshMe() }, [refreshMe])

  const onLogin = async (r) => {
    // Re-fetch to get settings
    await refreshMe()
  }
  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST' }) } catch {}
    setAuth({ loading: false, user: null, tenant: null, settings: null })
    toast.success('تم تسجيل الخروج')
  }

  if (auth.loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex items-center gap-3 text-slate-500"><Loader2 className="w-6 h-6 animate-spin" /> جارٍ التحميل...</div>
    </div>
  )

  if (!auth.user) return <LoginPage onLogin={onLogin} />

  return (
    <AuthCtx.Provider value={{ ...auth, refreshMe, logout }}>
      {auth.user.role === 'super_admin' ? <SuperAdminPanel /> : <TenantApp />}
    </AuthCtx.Provider>
  )
}

export default App
