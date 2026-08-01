'use client'
import { useEffect, useMemo, useState, useCallback, useRef, createContext, useContext } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import {
  Plane, FileBadge2, LayoutDashboard, Users, Building2, ReceiptText, Wallet,
  ArrowDownLeft, ArrowUpRight, ArrowRight, BookOpenText, BarChart3, PieChart as PieIcon,
  Plus, Search, Calendar, TrendingUp, DollarSign, Sparkles, LogOut,
  Filter, ChevronLeft, Activity, Banknote, Loader2, Landmark, ShieldCheck,
  Building, Settings, Upload, FileSpreadsheet, CheckCircle2, XCircle,
  AlertTriangle, Trash2, Power, User, Image as ImageIcon, Printer, Key, Pencil,
  ArrowLeftRight, Briefcase, CalendarClock, LogIn, Package,
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

// v3.2 — WhatsApp helpers
// Normalizes a phone: keeps digits only. If starts with 0, replaces with default country code (967 Yemen).
// If no country code present (< 12 chars) and starts with 5/7 (SA/YE mobile), prefixes 966/967.
function normalizeWaPhone(raw) {
  if (!raw) return ''
  let d = String(raw).replace(/[^\d]/g, '')
  if (!d) return ''
  if (d.startsWith('00')) d = d.slice(2)
  // Local mobile heuristic: leading 0 → drop, then prefix best-guess (default 967 Yemen)
  if (d.startsWith('0')) d = '967' + d.slice(1)
  // If it's short (like 7xxxxxxx, 9 digits) prefix 967
  if (d.length === 9 && d.startsWith('7')) d = '967' + d
  if (d.length === 9 && d.startsWith('5')) d = '966' + d
  return d
}
function waLink(phone, message = '') {
  const p = normalizeWaPhone(phone)
  if (!p) return ''
  const q = message ? `?text=${encodeURIComponent(message)}` : ''
  return `https://wa.me/${p}${q}`
}
function openWhatsApp(phone, message = '') {
  const url = waLink(phone, message)
  if (!url) return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}
// Smart templates for tickets / visas / services
function tplTicket(t) {
  const name = t.passenger_name || t.client_name || 'العميل'
  const date = t.travel_date ? new Date(t.travel_date).toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' }) : ''
  const time = t.departure_time || ''
  if (t.travel_mode === 'land') {
    return `عزيزي العميل ${name}،\nنود إشعارك بأن موعد انطلاق رحلتك البرية غداً ${date}${time ? ` في تمام الساعة ${time}` : ''}.\n⚠️ نرجو التواجد في محطة النقل قبل موعد الرحلة بـ ساعة واحدة.\nرافقتكم السلامة! 🚌`
  }
  return `عزيزي العميل ${name}،\nنود إشعارك بأن موعد إقلاع رحلتك الجوية غداً ${date}${time ? ` في تمام الساعة ${time}` : ''}.\n⚠️ نرجو التواجد في المطار قبل موعد الرحلة بـ 4 ساعات لإتمام إجراءات السفر.\nرافقتكم السلامة! ✈️`
}
function tplVisaExpiry(v) {
  const name = v.passenger_name || v.client_name || 'العميل'
  const date = v.expected_exit_date ? new Date(v.expected_exit_date).toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' }) : ''
  return `عزيزي العميل ${name}،\nنود تذكيرك بأن صلاحية تأشيرتك تنتهي بتاريخ ${date}.\nيرجى استكمال إجراءات المغادرة/التجديد تجنباً لأي غرامات. 🛂`
}
function tplService(s) {
  const name = s.beneficiary_name || s.client_name || 'العميل'
  const ref = s.reference_no ? ` — رقم مرجعي ${s.reference_no}` : ''
  return `عزيزي العميل ${name}،\nخدمة ${s.service_type || ''}${ref} — للاستفسار أو التأكيد، تواصل معنا مباشرة.`
}


async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // v2.8 — trigger out-of-quota modal automatically if backend flags quota_exceeded
    if (data.quota_exceeded && typeof window !== 'undefined' && window.__rahaalOnQuotaExceeded) {
      try { window.__rahaalOnQuotaExceeded() } catch {}
    }
    throw new Error(data.error || 'خطأ في الاتصال')
  }
  return data
}

const AuthCtx = createContext(null)
const useAuth = () => useContext(AuthCtx)

// ================================================================
// LOGIN
// ================================================================
// ============ v2.8.1 — Brand Components (Target Media theme: royal blue + orange) ============
function RahaalLogo({ size = 'md', variant = 'dark' }) {
  const sizeMap = { sm: { box: 40, text: 'text-lg', ar: 'text-xl' }, md: { box: 56, text: 'text-2xl', ar: 'text-3xl' }, lg: { box: 76, text: 'text-4xl', ar: 'text-5xl' } }
  const s = sizeMap[size] || sizeMap.md
  const arColor = variant === 'light' ? 'text-white' : 'text-[#1e3a8a]'
  const enColor = variant === 'light' ? 'text-orange-400' : 'text-[#f97316]'
  return (
    <div className="inline-flex items-center gap-3">
      <div className="relative" style={{ width: s.box, height: s.box }}>
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#1e3a8a] via-[#1e40af] to-[#0f1e4d] shadow-xl shadow-blue-900/40 flex items-center justify-center">
          <svg viewBox="0 0 64 64" fill="none" style={{ width: s.box * 0.6, height: s.box * 0.6 }} xmlns="http://www.w3.org/2000/svg">
            <path d="M8 40 L28 36 L40 20 L50 20 L44 34 L54 32 L58 40 L44 42 L38 50 L30 50 L34 42 L14 44 Z" fill="#f97316" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round"/>
            <circle cx="52" cy="16" r="3" fill="#f97316" />
          </svg>
        </div>
        <div className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-[#f97316] border-2 border-white shadow" />
      </div>
      <div className="text-right leading-none">
        <div className={`font-extrabold tracking-tight ${s.ar} ${arColor}`}>رحّـــال</div>
        <div className={`font-black tracking-widest ${s.text} ${enColor}`} style={{ letterSpacing: '0.15em' }}>RAHAL</div>
      </div>
    </div>
  )
}

function TargetMediaBadge({ dark = false }) {
  const textCol = dark ? 'text-slate-300' : 'text-slate-600'
  const tmBlue = dark ? 'text-blue-300' : 'text-[#1e3a8a]'
  return (
    <div className="inline-flex items-center gap-2">
      <div className={`text-[11px] ${textCol}`}>Powered by</div>
      <div className="inline-flex items-center gap-1.5">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="#1e3a8a" strokeWidth="2.5" />
          <circle cx="12" cy="12" r="5" fill="#f97316" />
          <circle cx="12" cy="12" r="1.5" fill="#fff" />
        </svg>
        <div className={`text-xs font-black ${tmBlue}`}>Target Media</div>
        <span className={`text-[10px] ${textCol}`}>· تارجت ميديا</span>
      </div>
    </div>
  )
}

function RahaalFooter({ dark = false }) {
  const textCol = dark ? 'text-slate-400' : 'text-slate-600'
  return (
    <div className={`mt-6 text-center text-xs ${textCol} space-y-2`}>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <span>📍 اليمن - عدن - الشيخ عثمان - بجانب بنك التضامن</span>
        <span>·</span>
        <span dir="ltr">📞 +967 781 115 482</span>
        <span>·</span>
        <span dir="ltr">📞 +967 781 455 584</span>
      </div>
      <div className="flex items-center justify-center gap-3 pt-2 border-t border-slate-700/30">
        <TargetMediaBadge dark={dark} />
        <span className={textCol}>© 2025</span>
      </div>
    </div>
  )
}

function LoginPage({ onLogin, onBack, initialSignup }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // If user came here from "اشترك الآن", redirect to /signup route (which exists)
  useEffect(() => {
    if (initialSignup && typeof window !== 'undefined') {
      window.location.href = '/signup'
    }
  }, [initialSignup])

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f1e4d] via-[#1e3a8a] to-[#0f1e4d] p-4">
      <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(249,115,22,0.35), transparent 45%), radial-gradient(circle at 80% 80%, rgba(30,64,175,0.4), transparent 45%)' }} />
      <div className="relative w-full max-w-md animate-fade-in">
        {onBack && (
          <button onClick={onBack} className="mb-4 text-slate-300 hover:text-white text-sm font-semibold flex items-center gap-2">
            <ArrowRight className="w-4 h-4" /> الصفحة الرئيسية
          </button>
        )}
        <div className="text-center mb-6">
          <RahaalLogo size="lg" variant="light" />
          <p className="text-slate-300 text-sm mt-2">نظام محاسبة مكاتب السفريات السحابي</p>
        </div>

        <Card className="border-blue-900/60 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
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
            <div className="text-center mt-3">
              <a href="/signup" className="text-xs text-orange-300 hover:text-orange-200 font-bold">🎁 ليس لديك حساب؟ احصل على 30 قيد عند التسجيل، و+50 قيد إضافي عند دعوة أي مكتب آخر</a>
            </div>
          </CardContent>
        </Card>
        <RahaalFooter dark />
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
                  <TableHead>الإحالة</TableHead>
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
                      <TableCell>
                        {t.status === 'suspended'
                          ? <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">⏸️ معلّق</Badge>
                          : <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">✅ نشط</Badge>}
                      </TableCell>
                      <TableCell><Badge variant="outline">{t.subscription || 'trial'} • {t.plan_tier || 'standard'}</Badge></TableCell>
                      <TableCell className="text-xs">
                        <div className="font-mono text-emerald-700 font-bold">{t.referral_code || '—'}</div>
                        {t.referred_by && <div className="text-[10px] text-slate-500 mt-0.5">مُحال بواسطة: <span className="font-mono">{t.referred_by_name || t.referred_by.slice(0,8)}...</span></div>}
                        {t.activation_confirmed && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px] mt-1">✅ دفع مؤكد</Badge>}
                      </TableCell>
                      <TableCell className="text-center">{t.users_count}/{t.max_users}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <div className={`text-xs font-bold ${pct >= 100 ? 'text-rose-600' : pct >= 90 ? 'text-amber-600' : 'text-slate-700'}`}>{q.used} / {q.limit}</div>
                          <div className="w-20 h-1.5 rounded-full bg-slate-200 overflow-hidden"><div className={`h-full ${pct >= 100 ? 'bg-rose-500' : pct >= 90 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{fmtDate(t.created_at)}</TableCell>
                      <TableCell className="text-left">
                        <div className="flex gap-1 justify-end flex-wrap">
                          <Button size="sm" variant={t.status === 'suspended' ? 'default' : 'outline'} className={t.status === 'suspended' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'text-amber-600 border-amber-300'} onClick={async () => {
                            const action = t.status === 'suspended' ? 'تفعيل' : 'تعليق'
                            if (!confirm(`${action} المكتب "${t.name}"؟`)) return
                            try { const r = await api(`/admin/tenants/${t.id}/toggle-status`, { method: 'POST' }); toast.success(`تم — الحالة الآن: ${r.status === 'active' ? 'نشط' : 'معلّق'}`); load() }
                            catch (e) { toast.error(e.message) }
                          }}>{t.status === 'suspended' ? '▶️ تفعيل' : '⏸️ تعليق'}</Button>
                          <Button size="sm" variant="outline" className="text-purple-600 border-purple-300" onClick={async () => {
                            if (!confirm(`الدخول كمالك المكتب "${t.name}"؟\n\nستُفتح جلسة مؤقتة (30 دقيقة) في تاب جديد. سيظهر شريط أحمر أعلى الشاشة يذكّرك بحالة الجلسة.`)) return
                            try {
                              const r = await api(`/admin/tenants/${t.id}/impersonate`, { method: 'POST' })
                              // Open new tab with the session cookie
                              // The cookie is set by the backend already; open a new tab
                              window.open('/', '_blank')
                              toast.success(`🎭 جلسة "دخول كـ ${r.tenant.name}" فُتحت في تاب جديد`)
                            } catch (e) { toast.error(e.message) }
                          }}>🎭 دخول كـ</Button>
                          {!t.activation_confirmed && (
                            <Button size="sm" variant="outline" className="text-blue-600 border-blue-300" onClick={async () => {
                              if (!confirm(`تأكيد أن المكتب "${t.name}" قد دفع القسط الأول؟`)) return
                              try {
                                const r = await api(`/admin/tenants/${t.id}/confirm-payment`, { method: 'POST' })
                                toast.success(r.referrer_bonus ? `✅ تم التأكيد + منح +${r.referrer_bonus.bonus_added} قيد إلى "${r.referrer_bonus.referrer_name}"` : '✅ تم تأكيد الدفع')
                                load()
                              } catch (e) { toast.error(e.message) }
                            }}>💳 تأكيد دفع</Button>
                          )}
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
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400">لا توجد مكاتب. أنشئ المكتب الأول من الأعلى.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* v2.8 — Announcements Management */}
        <AnnouncementsManager />
      </div>

      <NewTenantDialog open={openNew} onOpenChange={setOpenNew} onSaved={() => { load(); setOpenNew(false) }} />
      <EditTenantDialog tenant={editing} onOpenChange={() => setEditing(null)} onSaved={() => { load(); setEditing(null) }} />
    </div>
  )
}

function AnnouncementsManager() {
  const [list, setList] = useState([])
  const [openNew, setOpenNew] = useState(false)
  const [form, setForm] = useState({ type: 'popup', title: '', body: '', image_url: '', link_url: '', active: true })
  const load = () => api('/admin/announcements').then(setList).catch(e => toast.error(e.message))
  useEffect(() => { load() }, [])
  const submit = async () => {
    if (!form.title || !form.body) return toast.error('العنوان والنص مطلوبان')
    try { await api('/admin/announcements', { method: 'POST', body: form }); toast.success('✅ تم النشر'); setForm({ type: 'popup', title: '', body: '', image_url: '', link_url: '', active: true }); setOpenNew(false); load() }
    catch (e) { toast.error(e.message) }
  }
  const toggleActive = async (a) => {
    try { await api(`/admin/announcements/${a.id}`, { method: 'PUT', body: { active: !a.active } }); toast.success(a.active ? 'أُوقف الإعلان' : '🚀 تم التفعيل'); load() }
    catch (e) { toast.error(e.message) }
  }
  const del = async (a) => {
    if (!confirm(`حذف الإعلان "${a.title}"؟`)) return
    try { await api(`/admin/announcements/${a.id}`, { method: 'DELETE' }); toast.success('حُذف'); load() }
    catch (e) { toast.error(e.message) }
  }
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">📢 إدارة الإعلانات والإشعارات</CardTitle>
        <Button onClick={() => setOpenNew(true)} className="grad-gold text-white gap-2"><Plus className="w-4 h-4" /> إعلان جديد</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>النوع</TableHead>
            <TableHead>العنوان</TableHead>
            <TableHead>النص</TableHead>
            <TableHead>الحالة</TableHead>
            <TableHead>الفترة</TableHead>
            <TableHead className="text-left">إجراءات</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {list.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">لا توجد إعلانات. أنشئ الأول من الأعلى.</TableCell></TableRow>}
            {list.map(a => (
              <TableRow key={a.id}>
                <TableCell><Badge variant={a.type === 'popup' ? 'default' : 'secondary'}>{a.type === 'popup' ? '💬 نافذة' : '📢 شريط'}</Badge></TableCell>
                <TableCell className="font-bold">{a.title}</TableCell>
                <TableCell className="text-xs max-w-[300px] truncate">{a.body}</TableCell>
                <TableCell>{a.active ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">🟢 نشط</Badge> : <Badge className="bg-slate-200 text-slate-600 hover:bg-slate-200">⏸️ متوقف</Badge>}</TableCell>
                <TableCell className="text-xs">{a.starts_at ? fmtDate(a.starts_at) : 'الآن'} → {a.ends_at ? fmtDate(a.ends_at) : 'دائم'}</TableCell>
                <TableCell className="text-left">
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="outline" onClick={() => toggleActive(a)}>{a.active ? '⏸️ إيقاف' : '▶️ تفعيل'}</Button>
                    <Button size="sm" variant="outline" className="text-rose-600 border-rose-300" onClick={() => del(a)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader><DialogTitle>إنشاء إعلان جديد</DialogTitle><DialogDescription>سيظهر لجميع المكاتب حال تسجيل دخولهم أو في أعلى لوحتهم</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <Field label="النوع">
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="popup">💬 نافذة منبثقة (تظهر عند تسجيل الدخول)</SelectItem>
                  <SelectItem value="banner">📢 شريط علوي (يظهر باستمرار أعلى الشاشة)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="العنوان" required><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="عرض ترحيبي" /></Field>
            <Field label="النص" required><Textarea rows={4} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="محتوى الإعلان..." /></Field>
            <Field label="رابط الصورة (اختياري)"><Input dir="ltr" value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." /></Field>
            <Field label="رابط المزيد (اختياري)"><Input dir="ltr" value={form.link_url} onChange={e => setForm({ ...form, link_url: e.target.value })} placeholder="https://..." /></Field>
            <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} /><span className="text-sm">تفعيل فوري</span></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpenNew(false)}>إلغاء</Button><Button onClick={submit} className="grad-gold text-white">🚀 نشر</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
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
  const [f, setF] = useState({ name: '', owner_name: '', owner_email: '', owner_password: '', max_users: 2, max_branches: 1, subscription: 'trial', referral_code: '' })
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (!f.name || !f.owner_email || !f.owner_password) return toast.error('املأ جميع الحقول المطلوبة')
    try { setSaving(true); await api('/admin/tenants', { method: 'POST', body: f }); toast.success('تم إنشاء المكتب' + (f.referral_code ? ' + منح +15 قيد للمُحيل' : '')); onSaved(); setF({ name: '', owner_name: '', owner_email: '', owner_password: '', max_users: 2, max_branches: 1, subscription: 'trial', referral_code: '' }) }
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
          <Field label="🎁 رمز الإحالة (اختياري)"><Input dir="ltr" value={f.referral_code} onChange={e => setF({ ...f, referral_code: e.target.value.toUpperCase() })} placeholder="مثال: ABCD1234" /></Field>
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
// v3.2 — Reusable WhatsApp button. Grays out if phone is empty.
function WaBtn({ phone, message = '', size = 'sm', label, iconOnly = false }) {
  const normalized = normalizeWaPhone(phone)
  const disabled = !normalized
  const cls = `inline-flex items-center gap-1 rounded-md font-semibold transition-all ${
    disabled
      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
      : 'bg-[#25D366] hover:bg-[#128C7E] text-white shadow-sm hover:shadow'
  } ${size === 'xs' ? 'text-xs h-6 px-2' : size === 'md' ? 'text-sm h-8 px-3' : 'text-xs h-7 px-2'}`
  const handleClick = (e) => {
    e.stopPropagation()
    if (disabled) return toast.error('لا يوجد رقم هاتف مسجل — أضف الرقم أولاً')
    openWhatsApp(phone, message)
  }
  return (
    <button type="button" onClick={handleClick} className={cls} title={disabled ? 'لا يوجد رقم هاتف' : `إرسال واتساب إلى ${phone}`}>
      <svg viewBox="0 0 32 32" width={size === 'xs' ? 12 : 14} height={size === 'xs' ? 12 : 14} fill="currentColor" className="shrink-0">
        <path d="M16.001 3.2C9.075 3.2 3.401 8.874 3.401 15.8c0 2.196.578 4.348 1.677 6.246l-1.876 6.85 7.048-1.848a12.578 12.578 0 0 0 5.751 1.398c6.926 0 12.6-5.674 12.6-12.6S22.927 3.2 16.001 3.2Zm0 22.968a10.36 10.36 0 0 1-5.286-1.446l-.379-.225-4.185 1.098 1.116-4.078-.247-.394A10.4 10.4 0 1 1 16 26.168Zm5.706-7.784c-.312-.156-1.848-.913-2.135-1.017-.286-.104-.494-.156-.703.156s-.807 1.017-.989 1.226c-.182.208-.364.234-.676.078-.312-.156-1.319-.486-2.512-1.551-.929-.828-1.555-1.851-1.737-2.163-.182-.312-.019-.481.137-.636.14-.14.312-.364.468-.546.156-.182.208-.312.312-.52.104-.208.052-.39-.026-.546-.078-.156-.703-1.694-.963-2.32-.254-.61-.512-.527-.703-.537-.182-.008-.39-.01-.598-.01-.208 0-.546.078-.833.39-.286.312-1.093 1.068-1.093 2.606s1.119 3.023 1.275 3.231c.156.208 2.203 3.362 5.336 4.712.746.322 1.328.514 1.782.658.749.238 1.43.204 1.968.124.601-.09 1.848-.755 2.109-1.484.26-.729.26-1.354.182-1.484-.078-.13-.286-.208-.598-.364Z"/>
      </svg>
      {!iconOnly && (label || 'واتساب')}
    </button>
  )
}

const NAV = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, color: 'from-blue-600 to-cyan-500' },
  { id: 'tickets',   label: 'حجز التذاكر', icon: Plane, color: 'from-sky-600 to-blue-500' },
  { id: 'visas',     label: 'التأشيرات', icon: FileBadge2, color: 'from-emerald-600 to-teal-500' },
  { id: 'services',  label: 'الخدمات', icon: Briefcase, color: 'from-orange-600 to-amber-500' },
  { id: 'packages',  label: 'الباكجات والبرامج', icon: FileBadge2, color: 'from-teal-600 to-emerald-500' },
  { id: 'fx',        label: 'صرافة العملات', icon: ArrowLeftRight, color: 'from-fuchsia-600 to-purple-500' },
  { id: 'receipt',   label: 'سند قبض', icon: ArrowDownLeft, color: 'from-green-600 to-emerald-500' },
  { id: 'payment',   label: 'سند صرف', icon: ArrowUpRight, color: 'from-rose-600 to-pink-500' },
  { id: 'clients',   label: 'العملاء', icon: Users, color: 'from-indigo-600 to-violet-500' },
  { id: 'suppliers', label: 'الموردون والوكلاء', icon: Building2, color: 'from-amber-600 to-orange-500' },
  { id: 'boxes',     label: 'الصناديق والبنوك', icon: Wallet, color: 'from-yellow-600 to-amber-500' },
  { id: 'chart',     label: 'الدليل المحاسبي', icon: BookOpenText, color: 'from-purple-600 to-fuchsia-500' },
  { id: 'journal',   label: 'قيود اليومية', icon: ReceiptText, color: 'from-slate-700 to-slate-500' },
  { id: 'reports',   label: 'التقارير المالية', icon: BarChart3, color: 'from-cyan-600 to-blue-500' },
  { id: 'affiliate', label: 'التسويق بالعمولة', icon: User, color: 'from-emerald-600 to-teal-500' },
  { id: 'settings',  label: 'إعدادات المكتب', icon: Settings, color: 'from-slate-800 to-slate-600' },
]

function Sidebar({ current, onChange }) {
  const { tenant, settings, user } = useAuth()
  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 bg-gradient-to-b from-[#0f1e4d] via-[#1e3a8a] to-[#0a1544] text-slate-100 flex flex-col border-l border-blue-900/60">
      <div className="p-5 border-b border-blue-900/50">
        <div className="flex items-center gap-3">
          {settings?.logo_base64 ? (
            <img src={settings.logo_base64} alt="logo" className="w-11 h-11 rounded-xl object-cover bg-white" />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#1e40af] to-[#0f1e4d] flex items-center justify-center shadow-lg shadow-orange-500/20 border border-orange-400/40">
              <svg viewBox="0 0 64 64" fill="none" className="w-7 h-7">
                <path d="M8 40 L28 36 L40 20 L50 20 L44 34 L54 32 L58 40 L44 42 L38 50 L30 50 L34 42 L14 44 Z" fill="#f97316" />
                <circle cx="52" cy="16" r="3" fill="#f97316" />
              </svg>
            </div>
          )}
          <div className="min-w-0">
            <div className="text-lg font-extrabold tracking-tight truncate">{settings?.agency_name || tenant?.name || 'رحّـــال'}</div>
            <div className="text-[10px] text-orange-300 font-black tracking-widest" style={{ letterSpacing: '0.15em' }}>RAHAL ERP</div>
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
  const [tomorrow, setTomorrow] = useState([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [d, tw] = await Promise.all([api('/dashboard'), api('/dashboard/tomorrow-travelers').catch(() => [])])
      setData(d); setTomorrow(tw || [])
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, [load])
  const pieColors = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ef4444', '#64748b']

  const sendWhatsApp = (r) => {
    // v3.2 — Uses smart air/land template based on travel_mode
    const msg = tplTicket(r)
    const phone = r.passenger_whatsapp || r.passenger_phone || r.client_whatsapp || r.client_phone
    openWhatsApp(phone, msg)
  }

  return (
    <div className="space-y-6">
      <TopBar title="لوحة التحكم" subtitle="نظرة سريعة على أداء المكتب اليوم"
        right={<Button variant="outline" onClick={load} className="gap-2"><Activity className="w-4 h-4" /> تحديث</Button>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickAction icon={Plane} label="حجز تذكرة" grad="grad-brand" onClick={() => setTab('tickets')} />
        <QuickAction icon={FileBadge2} label="تأشيرة" grad="grad-green" onClick={() => setTab('visas')} />
        <QuickAction icon={Package} label="الباكج" grad="grad-teal" onClick={() => setTab('packages')} />
        <QuickAction icon={Briefcase} label="خدمة" grad="grad-gold" onClick={() => setTab('services')} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="مبيعات اليوم" icon={DollarSign} grad="grad-brand"
          values={CURRENCIES.map(c => ({ label: c, value: fmt(data?.kpi?.sales_today?.[c] || 0, c) }))} loading={loading} />
        <KpiCard title="أرباح اليوم" icon={TrendingUp} grad="grad-green"
          values={CURRENCIES.map(c => ({ label: c, value: fmt(data?.kpi?.profit_today?.[c] || 0, c) }))} loading={loading} />
        <KpiCard title="عدد الحركات اليوم" icon={Activity} grad="grad-purple" bigValue={data?.kpi?.count_today || 0}
          details={[{ label: 'تذاكر', value: data?.kpi?.tickets_today || 0 }, { label: 'تأشيرات', value: data?.kpi?.visas_today || 0 }, { label: 'خدمات', value: data?.kpi?.services_today || 0 }]} loading={loading} />
        <KpiCard title="تاريخ اليوم" icon={Calendar} grad="grad-slate"
          bigValue={new Date().toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}
          details={[{ label: '', value: new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric' }) }]} loading={loading} />
      </div>

      {/* v3.0 — Visa Expiration Alerts Widget (10 days ahead + overdue) */}
      {data?.visa_alerts && data.visa_alerts.length > 0 && (
        <Card className="border-amber-300 bg-gradient-to-l from-amber-50 to-orange-50 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <AlertTriangle className="w-5 h-5 text-amber-600" /> تنبيهات انتهاء التأشيرات ({data.visa_alerts.length})
              <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 mr-2 border border-amber-300">
                خلال 10 أيام + متأخرة
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>صاحب التأشيرة</TableHead>
                  <TableHead>نوع التأشيرة</TableHead>
                  <TableHead>الجواز</TableHead>
                  <TableHead>الجنسية</TableHead>
                  <TableHead>حساب القبض</TableHead>
                  <TableHead>تاريخ الدخول</TableHead>
                  <TableHead>تاريخ الخروج المتوقع</TableHead>
                  <TableHead className="text-center">الحالة</TableHead>
                  <TableHead className="text-center">إجراء</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.visa_alerts.map(v => (
                    <TableRow key={v.id} className={v.overdue ? 'bg-rose-50/50' : v.days_left <= 3 ? 'bg-amber-50/40' : ''}>
                      <TableCell className="font-semibold">{v.passenger_name}</TableCell>
                      <TableCell className="text-xs">{v.service_type}</TableCell>
                      <TableCell className="font-mono text-xs">{v.passport_no || '—'}</TableCell>
                      <TableCell className="text-xs">{v.nationality || '—'}</TableCell>
                      <TableCell className="text-xs">{v.client_name}</TableCell>
                      <TableCell className="text-xs">{v.entry_date ? new Date(v.entry_date).toLocaleDateString('ar-EG') : '—'}</TableCell>
                      <TableCell className="text-xs font-bold">{v.expected_exit_date ? new Date(v.expected_exit_date).toLocaleDateString('ar-EG') : '—'}</TableCell>
                      <TableCell className="text-center">
                        {v.overdue ? (
                          <Badge className="bg-rose-500 text-white hover:bg-rose-600">متأخر {Math.abs(v.days_left)} يوم</Badge>
                        ) : v.days_left === 0 ? (
                          <Badge className="bg-orange-500 text-white hover:bg-orange-600">اليوم</Badge>
                        ) : (
                          <Badge className={v.days_left <= 3 ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-yellow-400 text-amber-900 hover:bg-yellow-400'}>باقٍ {v.days_left} يوم</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center gap-1 justify-center">
                          <WaBtn phone={v.passenger_whatsapp || v.passenger_phone} message={tplVisaExpiry(v)} size="xs" label="تنبيه" iconOnly={false} />
                          <Button size="sm" onClick={async () => {
                            try { await api(`/visas/${v.id}/mark-exited`, { method: 'POST' }); toast.success('تم تسجيل الخروج'); load() }
                            catch (e) { toast.error(e.message) }
                          }} className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1 h-7 px-2 text-xs">
                            <LogIn className="w-3 h-3 rotate-180" /> تم الخروج
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tomorrow's Travelers Widget */}
      {tomorrow.length > 0 && (
        <Card className="border-emerald-200 bg-gradient-to-l from-emerald-50 to-white">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-emerald-800">
              <Plane className="w-5 h-5 -rotate-45" /> رحلات الغد ({tomorrow.length} مسافر)
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 mr-2">اضغط 📲 لإرسال تذكير عبر الواتساب</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>المسافر</TableHead>
                  <TableHead>الوسيلة</TableHead>
                  <TableHead>PNR</TableHead>
                  <TableHead>المسار</TableHead>
                  <TableHead>الجواز</TableHead>
                  <TableHead>حساب القبض / الهاتف</TableHead>
                  <TableHead>موعد السفر</TableHead>
                  <TableHead className="text-center">إجراء</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {tomorrow.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-semibold">{r.passenger_name || '—'}</TableCell>
                      <TableCell>
                        {r.travel_mode === 'land'
                          ? <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border border-orange-200">🚌 برية</Badge>
                          : <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-100 border border-sky-200">✈️ جوية</Badge>}
                      </TableCell>
                      <TableCell className="font-mono text-xs"><Badge variant="outline">{r.pnr || '—'}</Badge></TableCell>
                      <TableCell className="text-xs">{r.route || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{r.passport_no || '—'}</TableCell>
                      <TableCell className="text-xs">{r.client_name}<br /><span className="text-slate-500">{r.passenger_phone || r.client_phone || 'لا يوجد رقم'}</span></TableCell>
                      <TableCell className="text-xs">
                        <div>{new Date(r.travel_date).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                        {r.departure_time && <div className="font-bold text-blue-700">🕐 {r.departure_time}</div>}
                      </TableCell>
                      <TableCell className="text-center">
                        <WaBtn phone={r.passenger_whatsapp || r.passenger_phone || r.client_whatsapp || r.client_phone} message={tplTicket(r)} size="md" label="واتساب" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
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
  const { settings, tenant } = useAuth()
  const [tickets, setTickets] = useState([])
  const [clients, setClients] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [openManual, setOpenManual] = useState(false)
  const [openBulk, setOpenBulk] = useState(false)
  const [openSearch, setOpenSearch] = useState(false)
  const [filter, setFilter] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [editing, setEditing] = useState(null)
  const [refundTarget, setRefundTarget] = useState(null)
  const [rates, setRates] = useState(null)
  const load = async () => {
    try {
      const [t, c, s, r] = await Promise.all([api('/tickets'), api('/clients'), api('/suppliers'), api('/rates')])
      setTickets(t); setClients(c); setSuppliers(s); setRates(r.rates)
    } catch (e) { toast.error(e.message) }
  }
  useEffect(() => { load() }, [])
  const filtered = applyFilter(tickets, filter)
  const selected = filtered.find(t => t.id === selectedId)
  const handleDelete = async () => {
    if (!selectedId) return
    if (!confirm('حذف هذه التذكرة وعكس القيد المحاسبي؟')) return
    try { await api(`/tickets/${selectedId}`, { method: 'DELETE' }); toast.success('تم الحذف'); setSelectedId(null); load() }
    catch (e) { toast.error(e.message) }
  }
  const handleEdit = () => {
    if (!selected) return toast.error('اختر تذكرة أولاً')
    setEditing(selected); setOpenManual(true)
  }
  const handleAdd = () => { setEditing(null); setOpenManual(true) }
  const handlePrintVoucher = () => {
    if (!selected) return toast.error('اختر تذكرة أولاً')
    printVoucher({ kind: 'ticket', record: selected, settings, tenant })
  }
  const handlePrintTable = () => {
    const totals = { cost: 0, sale_price: 0, commission: 0 }
    for (const r of filtered) { totals.cost += r.cost; totals.sale_price += r.sale_price; totals.commission += r.commission }
    printTable({
      title: 'كشف التذاكر', settings, tenant, rows: filtered,
      columns: [
        { key: 'date', label: 'التاريخ', render: r => fmtDate(r.date) },
        { key: 'pnr', label: 'PNR' },
        { key: 'route', label: 'خط السير' },
        { key: 'passenger_name', label: 'المسافر' },
        { key: 'client_name', label: 'حساب القبض' },
        { key: 'supplier_name', label: 'المورد' },
        { key: 'currency', label: 'عملة' },
        { key: 'cost', label: 'تكلفة', align: 'left', render: r => fmt(r.cost, r.currency) },
        { key: 'sale_price', label: 'بيع', align: 'left', render: r => fmt(r.sale_price, r.currency) },
        { key: 'commission', label: 'عمولة', align: 'left', render: r => fmt(r.commission, r.currency) },
      ],
      totals: { cost: totals.cost.toFixed(2), sale_price: totals.sale_price.toFixed(2), commission: totals.commission.toFixed(2) },
    })
  }

  return (
    <div className="space-y-4">
      <TopBar
        title="حجز التذاكر"
        subtitle="شاشة مدمجة للشراء والبيع وحساب العمولة تلقائياً"
        right={<Button variant="outline" onClick={() => setOpenBulk(true)} className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"><FileSpreadsheet className="w-4 h-4" /> رفع Excel/CSV</Button>}
      />
      <ActionToolbar
        addLabel="تذكرة جديدة" onAdd={handleAdd} onRefresh={load} onSearch={() => setOpenSearch(true)}
        onEdit={handleEdit} onDelete={handleDelete} onRefund={() => { if (!selected) return toast.error('اختر تذكرة أولاً'); if (selected.is_refunded) return toast.error('التذكرة مستردة مسبقاً'); setRefundTarget(selected) }} onPrintVoucher={handlePrintVoucher} onPrintTable={handlePrintTable}
        selectedId={selectedId} count={filtered.length}
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
                <TableHead className="w-8"></TableHead><TableHead>التاريخ</TableHead><TableHead>PNR</TableHead>
                <TableHead>خط السير</TableHead><TableHead>المسافر</TableHead>
                <TableHead>🚌 الشركة الناقلة</TableHead>
                <TableHead>حساب القبض</TableHead>
                <TableHead>المورد</TableHead><TableHead>الدفع</TableHead><TableHead>العملة</TableHead>
                <TableHead className="text-left">تكلفة</TableHead><TableHead className="text-left">بيع</TableHead>
                <TableHead className="text-left text-emerald-600">عمولة</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 && <TableRow><TableCell colSpan={13} className="text-center text-slate-400 py-8">{filter ? 'لا نتائج للفلتر' : 'لا توجد تذاكر'}</TableCell></TableRow>}
                {filtered.map(t => (
                  <TableRow key={t.id} className={selectedId === t.id ? 'bg-blue-50' : 'cursor-pointer hover:bg-slate-50'} onClick={() => setSelectedId(t.id === selectedId ? null : t.id)}>
                    <TableCell><input type="radio" checked={selectedId === t.id} onChange={() => setSelectedId(t.id)} /></TableCell>
                    <TableCell className="text-xs">{fmtDate(t.date)}</TableCell>
                    <TableCell className="font-mono text-xs">{t.pnr || '—'}</TableCell>
                    <TableCell className="text-xs">{t.route || '—'}</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-2">
                        <span>{t.passenger_name || '—'}</span>
                        {(t.passenger_whatsapp || t.passenger_phone) && (
                          <WaBtn phone={t.passenger_whatsapp || t.passenger_phone} message={tplTicket(t)} size="xs" iconOnly={true} />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{t.carrier_name ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-semibold">🚌 {t.carrier_name}</span> : <span className="text-slate-300">—</span>}</TableCell>
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
      <TicketDialog open={openManual} onOpenChange={(v) => { setOpenManual(v); if (!v) setEditing(null) }} clients={clients} suppliers={suppliers} rates={rates} record={editing}
        onSaved={() => { load(); setEditing(null); toast.success(editing ? '✅ تم تعديل التذكرة وعكس القيد السابق تلقائياً' : 'تم حفظ التذكرة وإنشاء القيد المحاسبي تلقائياً') }} />
      <RefundDialog open={!!refundTarget} onOpenChange={v => !v && setRefundTarget(null)} record={refundTarget} refType="ticket" onSaved={() => { setRefundTarget(null); load() }} />
      <BulkImportDialog open={openBulk} onOpenChange={setOpenBulk} kind="tickets" onDone={() => { load(); setOpenBulk(false) }} />
      <UniversalSearchModal open={openSearch} onOpenChange={setOpenSearch}
        fields={[
          { key: 'pnr', label: 'رقم التذكرة (PNR)' }, { key: 'passenger_name', label: 'اسم المسافر' },
          { key: 'client_name', label: 'حساب القبض' }, { key: 'supplier_name', label: 'اسم المورد' },
          { key: 'route', label: 'خط السير' }, { key: 'sale_price', label: 'سعر البيع' }, { key: 'currency', label: 'العملة' },
        ]}
        onApply={setFilter} onClear={() => setFilter(null)}
      />
    </div>
  )
}

function TicketDialog({ open, onOpenChange, clients, suppliers, rates, onSaved, record }) {
  const isEdit = !!record
  const emptyForm = {
    date: todayISO(), currency: 'USD', exchange_rate: 1, client_id: '', supplier_id: '',
    pnr: '', route: '', passenger_name: '', passport_no: '', travel_date: '',
    cost: '', sale_price: '', payment_method: 'credit', box_id: '',
    // v2.7 non-financial fields
    carrier_name: '', passenger_phone: '', passenger_age: '', id_type: 'هوية شخصية',
    id_issue_place: '', id_issue_date: '', ticket_number: '', flight_number: '',
    ticket_type: 'عادي', arrival_time: '', departure_time: '', boarding_point: '', sale_point: '',
    // v3.2 — Travel mode + WhatsApp
    travel_mode: 'air', passenger_whatsapp: '',
  }
  const [form, setForm] = useState(emptyForm)
  const [boxes, setBoxes] = useState([])
  const [saving, setSaving] = useState(false)
  const [quickC, setQuickC] = useState(false); const [quickS, setQuickS] = useState(false)
  useEffect(() => {
    if (!open) return
    if (record) {
      setForm({
        date: record.date ? new Date(record.date).toISOString().slice(0,10) : todayISO(),
        currency: record.currency || 'USD',
        exchange_rate: record.exchange_rate || 1,
        client_id: record.client_id || '', supplier_id: record.supplier_id || '',
        pnr: record.pnr || '', route: record.route || '',
        passenger_name: record.passenger_name || '', passport_no: record.passport_no || '',
        travel_date: record.travel_date ? new Date(record.travel_date).toISOString().slice(0,10) : '',
        cost: record.cost ?? '', sale_price: record.sale_price ?? '',
        payment_method: record.payment_method || 'credit', box_id: record.box_id || '',
        carrier_name: record.carrier_name || '', passenger_phone: record.passenger_phone || '',
        passenger_age: record.passenger_age || '', id_type: record.id_type || 'هوية شخصية',
        id_issue_place: record.id_issue_place || '',
        id_issue_date: record.id_issue_date ? String(record.id_issue_date).slice(0,10) : '',
        ticket_number: record.ticket_number || record.pnr || '',
        flight_number: record.flight_number || '',
        ticket_type: record.ticket_type || 'عادي',
        arrival_time: record.arrival_time || '',
        departure_time: record.departure_time || '',
        boarding_point: record.boarding_point || '',
        sale_point: record.sale_point || '',
        travel_mode: record.travel_mode === 'land' ? 'land' : 'air',
        passenger_whatsapp: record.passenger_whatsapp || record.passenger_phone || '',
      })
    } else {
      setForm(emptyForm)
    }
  }, [open, record])
  useEffect(() => { if (rates && form.currency && !isEdit) setForm(f => ({ ...f, exchange_rate: rates[f.currency] || 1 })) }, [rates, form.currency])
  useEffect(() => { if (open) api('/boxes').then(setBoxes).catch(()=>{}) }, [open])
  useEffect(() => { if (form.payment_method === 'cash' && boxes[0] && !form.box_id) setForm(f => ({ ...f, box_id: boxes[0].id })) }, [form.payment_method, boxes])
  const commission = useMemo(() => (Number(form.sale_price) || 0) - (Number(form.cost) || 0), [form.sale_price, form.cost])
  const submit = async () => {
    if (!form.client_id || !form.supplier_id) return toast.error('اختر حساب القبض والمورد')
    if (!form.cost || !form.sale_price) return toast.error('أدخل التكلفة وسعر البيع')
    if (form.payment_method === 'cash' && !form.box_id) return toast.error('اختر الصندوق للدفع النقدي')
    try {
      setSaving(true)
      if (isEdit) {
        await api(`/tickets/${record.id}`, { method: 'PUT', body: form })
      } else {
        await api('/tickets', { method: 'POST', body: form })
      }
      onOpenChange(false); setForm(emptyForm); onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-xl"><div className="w-9 h-9 rounded-lg grad-brand flex items-center justify-center"><Plane className="w-4 h-4 text-white -rotate-45" /></div>{isEdit ? '✏️ تعديل تذكرة' : 'حجز تذكرة جديدة'}</DialogTitle><DialogDescription>{isEdit ? 'سيتم عكس القيد المحاسبي القديم وإعادة الترحيل بالقيم الجديدة تلقائياً — دون خصم من حصة القيود' : 'سيتم إنشاء قيد يومية تلقائي — نقد (خصم من الصندوق) أو آجل (على حساب القبض)'}</DialogDescription></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
            <Field label="تاريخ الحركة"><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="نوع العملة"><Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c} — {CUR_NAME[c]}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="سعر الصرف"><Input type="number" step="0.0001" value={form.exchange_rate} onChange={e => setForm({ ...form, exchange_rate: e.target.value })} /></Field>
            <Field label="حساب القبض" required>
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

          {/* v3.2 — Travel mode + carrier + smart WhatsApp phone */}
          <div className="bg-gradient-to-l from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl p-4 mt-2">
            <div className="text-sm font-bold text-amber-900 mb-2 flex items-center gap-2">
              🚌 <span>نوع الرحلة والشركة الناقلة (يُطبع على التذكرة + يُستخدم في قوالب الواتساب الذكية)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="وسيلة الرحلة" required>
                <Select value={form.travel_mode} onValueChange={v => setForm({ ...form, travel_mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="air">✈️ رحلة جوية (طيران)</SelectItem>
                    <SelectItem value="land">🚌 رحلة برية (حافلة / نقل بري)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={form.travel_mode === 'land' ? 'شركة النقل البري' : 'شركة الطيران'}>
                <Input value={form.carrier_name} onChange={e => setForm({ ...form, carrier_name: e.target.value })}
                  placeholder={form.travel_mode === 'land' ? 'مثال: البركة، الرويشان' : 'مثال: الخطوط السعودية، فلاي دبي'}
                  className="bg-white border-amber-300" />
              </Field>
              <Field label="⏰ موعد الإقلاع/الانطلاق">
                <Input type="time" value={form.departure_time} onChange={e => setForm({ ...form, departure_time: e.target.value })} className="bg-white border-amber-300 font-bold text-base" />
              </Field>
            </div>
          </div>

          {/* v3.2 — Contact panel (Phone + WhatsApp for smart templates) */}
          <div className="bg-gradient-to-l from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4 mt-2">
            <div className="text-sm font-bold text-emerald-900 mb-2 flex items-center gap-2">
              📱 <span>بيانات التواصل — لتفعيل زر إرسال الواتساب مباشرة إلى المسافر</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="رقم هاتف المسافر"><Input dir="ltr" value={form.passenger_phone} onChange={e => {
                const v = e.target.value; setForm(f => ({ ...f, passenger_phone: v, passenger_whatsapp: f.passenger_whatsapp || v }))
              }} placeholder="777xxxxxxx أو 5xxxxxxxx" className="bg-white" /></Field>
              <Field label="رقم واتساب (إن اختلف عن الهاتف)"><Input dir="ltr" value={form.passenger_whatsapp} onChange={e => setForm({ ...form, passenger_whatsapp: e.target.value })} placeholder="اختياري — يستخدم رقم الهاتف افتراضياً" className="bg-white" /></Field>
            </div>
          </div>

          <div className="bg-slate-50 border rounded-xl p-4 mt-2">
            <div className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">👤 بيانات المسافر الإضافية (للطباعة)</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="العمر"><Input value={form.passenger_age} onChange={e => setForm({ ...form, passenger_age: e.target.value })} placeholder="30" /></Field>
              <Field label="نوع الهوية">
                <Select value={form.id_type} onValueChange={v => setForm({ ...form, id_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="هوية شخصية">هوية شخصية</SelectItem>
                    <SelectItem value="جواز سفر">جواز سفر</SelectItem>
                    <SelectItem value="بطاقة عائلية">بطاقة عائلية</SelectItem>
                    <SelectItem value="رخصة قيادة">رخصة قيادة</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="جهة إصدار الهوية"><Input value={form.id_issue_place} onChange={e => setForm({ ...form, id_issue_place: e.target.value })} placeholder="عدن، صنعاء..." /></Field>
              <Field label="تاريخ إصدار الهوية"><Input type="date" value={form.id_issue_date} onChange={e => setForm({ ...form, id_issue_date: e.target.value })} /></Field>
            </div>
          </div>

          <div className="bg-slate-50 border rounded-xl p-4 mt-2">
            <div className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">🎫 بيانات الرحلة الإضافية (للطباعة)</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="رقم التذكرة (المُسلسل)"><Input value={form.ticket_number} onChange={e => setForm({ ...form, ticket_number: e.target.value })} placeholder="262054673" /></Field>
              <Field label="رقم الرحلة"><Input value={form.flight_number} onChange={e => setForm({ ...form, flight_number: e.target.value })} placeholder="26205054" /></Field>
              <Field label="نوع التذكرة">
                <Select value={form.ticket_type} onValueChange={v => setForm({ ...form, ticket_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="عادي">عادي</SelectItem>
                    <SelectItem value="VIP">VIP</SelectItem>
                    <SelectItem value="سياحية">سياحية</SelectItem>
                    <SelectItem value="أعمال">أعمال</SelectItem>
                    <SelectItem value="ذهاب">ذهاب</SelectItem>
                    <SelectItem value="ذهاب وعودة">ذهاب وعودة</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="وقت الحضور"><Input value={form.arrival_time} onChange={e => setForm({ ...form, arrival_time: e.target.value })} placeholder="07:30 ص" /></Field>
              <Field label="وقت الانطلاق"><Input value={form.departure_time} onChange={e => setForm({ ...form, departure_time: e.target.value })} placeholder="08:00 ص" /></Field>
              <Field label="نقطة الصعود"><Input value={form.boarding_point} onChange={e => setForm({ ...form, boarding_point: e.target.value })} placeholder="محطة عدن الرئيسية" /></Field>
              <div className="md:col-span-3">
                <Field label="نقطة البيع / الفرع"><Input value={form.sale_point} onChange={e => setForm({ ...form, sale_point: e.target.value })} placeholder="مكتب الرحّال — الفرع الرئيسي" /></Field>
              </div>
            </div>
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
          <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button><Button onClick={submit} disabled={saving} className="grad-brand text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEdit ? '💾 حفظ التعديل + عكس القيد' : 'حفظ + إنشاء قيد')}</Button></DialogFooter>
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
// PRINT ENGINE (Voucher + Table with tenant branding)
// ================================================================
function escHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])) }

function buildPrintHead(settings, tenant, title) {
  const color = settings?.primary_color || '#1e3a8a'
  const logo = settings?.logo_base64 ? `<img src="${settings.logo_base64}" style="height:64px;object-fit:contain;" />` : `<div style="width:64px;height:64px;background:${color};border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:22px;">${(settings?.agency_name || tenant?.name || 'R')[0]}</div>`
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${escHtml(title)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
*{box-sizing:border-box;font-family:'Cairo',sans-serif}
body{margin:0;padding:24px;color:#0f172a;background:#fff}
.brand{border-bottom:4px solid ${color};padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.brand .r{text-align:left}
.brand h1{color:${color};font-size:24px;margin:0 0 4px}
.meta{font-size:11px;color:#64748b;line-height:1.6}
.title{background:${color}15;border-right:4px solid ${color};padding:10px 14px;margin:16px 0;font-weight:800;font-size:16px}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
th{background:${color}10;color:${color};padding:8px 10px;text-align:right;border-bottom:2px solid ${color}55;font-weight:700}
td{padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right}
.total-row{background:${color}08;font-weight:800}
.total-row td{border-top:2px solid ${color};border-bottom:none;color:${color}}
.info-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 24px;font-size:13px;margin:12px 0;padding:12px;background:#f8fafc;border-radius:8px}
.info-grid div{padding:4px 0;border-bottom:1px dashed #e2e8f0}
.info-grid b{color:${color}}
.big{font-size:22px;font-weight:800;color:${color};text-align:left;padding:12px;background:${color}10;border-radius:8px;margin-top:12px}
.sig{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:40px;font-size:12px;text-align:center;color:#64748b}
.sig div{border-top:1px solid #94a3b8;padding-top:6px}
.footer{margin-top:24px;padding-top:12px;border-top:1px dashed #cbd5e1;text-align:center;font-size:10px;color:#94a3b8}
.badge{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700}
.badge-cash{background:#d1fae5;color:#065f46}
.badge-credit{background:#fef3c7;color:#92400e}
@media print{body{padding:12px}@page{margin:12mm}}
</style></head><body>
<div class="brand">
  <div style="display:flex;gap:14px;align-items:center">
    ${logo}
    <div>
      <h1>${escHtml(settings?.agency_name || tenant?.name || 'مكتب السفريات')}</h1>
      <div class="meta">
        ${settings?.address ? `📍 ${escHtml(settings.address)}<br/>` : ''}
        ${settings?.phone ? `📞 ${escHtml(settings.phone)}` : ''}
        ${settings?.email ? ` • ✉ ${escHtml(settings.email)}` : ''}
        ${settings?.tax_id ? `<br/>الرقم الضريبي: ${escHtml(settings.tax_id)}` : ''}
        ${settings?.commercial_id ? ` • س.ت: ${escHtml(settings.commercial_id)}` : ''}
      </div>
    </div>
  </div>
  <div class="r">
    <div style="font-size:13px;color:#64748b">${escHtml(title)}</div>
    <div style="font-weight:800;font-size:14px;color:${color}">${fmtDate(new Date())}</div>
  </div>
</div>
${settings?.header ? `<div style="text-align:center;padding:8px;background:#f1f5f9;border-radius:6px;margin-bottom:12px;font-size:13px">${escHtml(settings.header)}</div>` : ''}
`
}
function buildPrintFoot(settings, extra = '') {
  return `${extra}
${settings?.footer ? `<div style="text-align:center;font-size:12px;color:#64748b;margin-top:24px;padding-top:12px;border-top:1px dashed #cbd5e1">${escHtml(settings.footer)}</div>` : ''}
<div class="footer">Powered by <b>Target Media ERP</b> • Rahaal SaaS © 2025</div>
</body></html>`
}
function openPrint(html) {
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) return toast.error('السماح للنوافذ المنبثقة مطلوب للطباعة')
  w.document.write(html); w.document.close()
  setTimeout(() => { w.focus(); w.print() }, 400)
}

function printVoucher({ kind, record, settings, tenant }) {
  const titleMap = {
    ticket: 'سند/فاتورة حجز تذكرة',
    visa: 'سند/فاتورة تأشيرة/خدمة',
    receipt: 'سند قبض',
    payment: 'سند صرف',
    fx: 'سند صرافة عملات',
  }
  const title = titleMap[kind] || 'سند'
  let content = ''
  if (kind === 'ticket') {
    // v3.2 — Three-coupon ticket layout with travel_mode-aware header + prominent departure time
    const travelMode = record.travel_mode === 'land' ? 'land' : 'air'
    const modeIcon = travelMode === 'land' ? '🚌' : '✈️'
    const modeLabel = travelMode === 'land' ? 'قسيمة تذكرة نقل بري' : 'قسيمة تذكرة سفر جوي'
    const modeCopyLabel = travelMode === 'land' ? 'نسخة الراكب — Land Trip' : 'نسخة الراكب — Air Trip'
    const carrierIcon = travelMode === 'land' ? '🚌' : '✈️'
    const carrierLabel = travelMode === 'land' ? 'شركة النقل' : 'شركة الطيران'
    const modeHeaderGrad = travelMode === 'land' ? 'linear-gradient(90deg,#f97316,#ea580c)' : 'linear-gradient(90deg,#1e40af,#0ea5e9)'
    const modeBorder = travelMode === 'land' ? '#c2410c' : '#1e40af'
    const modeBg = travelMode === 'land' ? '#fff7ed' : '#eff6ff'
    const carrier = escHtml(record.carrier_name || 'غير محددة')
    const tktNum = escHtml(record.ticket_number || record.pnr || '—')
    const flightNo = escHtml(record.flight_number || record.pnr || '—')
    const tktType = escHtml(record.ticket_type || 'عادي')
    const passName = escHtml(record.passenger_name || '—')
    const passPhone = escHtml(record.passenger_phone || '—')
    const passAge = escHtml(record.passenger_age || '—')
    const idType = escHtml(record.id_type || 'هوية')
    const idNo = escHtml(record.passport_no || '—')
    const idPlace = escHtml(record.id_issue_place || '—')
    const idDate = record.id_issue_date ? fmtDate(record.id_issue_date) : '—'
    const route = escHtml(record.route || '—')
    const bookDate = fmtDate(record.date)
    const travelDate = record.travel_date ? fmtDate(record.travel_date) : '—'
    const arrTime = escHtml(record.arrival_time || '—')
    const depTime = escHtml(record.departure_time || '—')
    const boarding = escHtml(record.boarding_point || '—')
    const salePoint = escHtml(record.sale_point || (tenant?.name || '—'))
    const priceStr = fmt(record.sale_price, record.currency)
    // v3.2 — Prominent yellow departure-time badge next to travel date
    const depTimeBadge = record.departure_time
      ? `<div style="background: #fde047; border: 2px solid #ca8a04; border-radius: 10px; padding: 8px 14px; font-size: 18px; font-weight: 900; color: #713f12; text-align:center; box-shadow: 0 2px 4px rgba(0,0,0,0.08); letter-spacing: 1px;">⏰ ${depTime}</div>`
      : ''
    const dateTimeBlock = `
      <div style="display:flex; gap:10px; align-items:center; justify-content:center; padding:10px; background:linear-gradient(135deg,#f0f9ff,#e0f2fe); border:2px solid #0284c7; border-radius:12px; margin-bottom:10px;">
        <div style="flex:1;">
          <div style="font-size:11px; color:#075985; font-weight:700;">📅 موعد ${travelMode === 'land' ? 'الانطلاق' : 'الإقلاع'}</div>
          <div style="font-size:16px; font-weight:900; color:#0c4a6e;">${travelDate}</div>
        </div>
        ${depTimeBadge}
      </div>
    `

    const carrierBanner = `<div style="border:2px solid ${modeBorder}; background: ${modeHeaderGrad}; padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; text-align:center; font-size: 16px; font-weight: 900; color: #ffffff; letter-spacing: 0.5px;">${carrierIcon} ${carrierLabel}: ${carrier}</div>`

    const infoRow = (label, val) => `<div style="display:flex; gap:6px; padding: 4px 6px; border-bottom:1px dotted #cbd5e1; font-size: 12px;"><span style="font-weight:700; color:#475569;">${label}:</span><span style="color:#0f172a;">${val}</span></div>`

    const passengerCopy = `
      <div style="border: 3px solid ${modeBorder}; border-radius: 12px; padding: 14px; margin-bottom: 14px; background: #ffffff;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="font-size: 18px; font-weight: 900; color: ${modeBorder};">${modeIcon} ${modeLabel} — ${modeCopyLabel}</div>
          <div style="font-size: 13px; padding: 4px 10px; background:${modeBg}; border-radius: 6px; color:${modeBorder}; font-weight:700; border:1px solid ${modeBorder};">نوع التذكرة: ${tktType}</div>
        </div>
        ${carrierBanner}
        ${dateTimeBlock}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
          <div style="padding:8px; background:#f0f9ff; border-radius:8px; border:1px solid #bae6fd;">
            <div style="font-weight:900; color:#0369a1; margin-bottom:4px; font-size:13px;">👤 بيانات المسافر</div>
            ${infoRow('الاسم', passName)}
            ${infoRow('رقم الهاتف', passPhone)}
            ${infoRow('العمر', passAge)}
            ${infoRow('نوع الهوية', idType)}
            ${infoRow('رقم الهوية/الجواز', idNo)}
            ${infoRow('جهة الإصدار', idPlace)}
            ${infoRow('تاريخ الإصدار', idDate)}
          </div>
          <div style="padding:8px; background:#f0fdf4; border-radius:8px; border:1px solid #bbf7d0;">
            <div style="font-weight:900; color:#047857; margin-bottom:4px; font-size:13px;">${modeIcon} تفاصيل الرحلة</div>
            ${infoRow('رقم التذكرة', tktNum)}
            ${infoRow(travelMode === 'land' ? 'رقم الحافلة/الرحلة' : 'رقم الرحلة', flightNo)}
            ${infoRow('المسار', route)}
            ${infoRow('تاريخ الحجز', bookDate)}
            ${infoRow(travelMode === 'land' ? 'تاريخ السفر' : 'تاريخ الرحلة', travelDate)}
            ${infoRow('وقت الحضور', arrTime)}
            ${infoRow(travelMode === 'land' ? 'وقت الانطلاق' : 'وقت الإقلاع', depTime)}
            ${infoRow(travelMode === 'land' ? 'محطة الانطلاق' : 'نقطة الصعود', boarding)}
            ${infoRow('نقطة البيع', salePoint)}
          </div>
        </div>
        <div style="padding:10px; background:#fef2f2; border:1px dashed #fecaca; border-radius:8px; font-size:11px; color:#7f1d1d;">
          <div style="font-weight:900; margin-bottom:4px;">⚠️ ملاحظات وشروط الحجز:</div>
          <ul style="margin:0; padding-right:18px; line-height:1.6;">
            ${travelMode === 'land'
              ? `<li><b>الحضور في محطة النقل قبل موعد الانطلاق بساعة واحدة على الأقل.</b></li>`
              : `<li><b>الحضور في المطار قبل موعد الإقلاع بـ 4 ساعات لإتمام إجراءات السفر.</b></li>`}
            <li>غرامة التأجيل: 10% من قيمة التذكرة إن كان قبل الرحلة بأقل من 24 ساعة.</li>
            <li>الإلغاء: يخضع لسياسة الشركة الناقلة، تُخصم رسوم إدارية 5% مع استرداد الباقي.</li>
            <li>على الراكب حمل بطاقته الأصلية وعرضها عند ${travelMode === 'land' ? 'محطة الانطلاق' : 'نقطة الصعود'}.</li>
            <li>غير قابلة للتحويل لشخص آخر بدون إشعار مسبق.</li>
          </ul>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; padding:8px 12px; background:${modeHeaderGrad}; border-radius:8px; color:white;">
          <div style="font-size:13px;">إجمالي القيمة المدفوعة</div>
          <div style="font-size:22px; font-weight:900;">${priceStr}</div>
        </div>
      </div>
    `

    const stubCopy = (label, color, bgColor) => `
      <div style="border: 2px dashed ${color}; border-radius: 10px; padding: 10px; margin-bottom: 10px; background: ${bgColor};">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div style="font-size: 14px; font-weight: 900; color: ${color};">${modeIcon} ${label}</div>
          <div style="font-size: 11px; color:#64748b;">قصّ عند النقاط</div>
        </div>
        <div style="border:1px solid ${color}; background:#fff; border-radius:6px; padding:6px; font-size: 11px; margin-bottom:6px; text-align:center; font-weight: 800; color: ${color};">${carrierIcon} ${carrier}</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; font-size:11px;">
          <div><b>المسافر:</b> ${passName}</div>
          <div><b>رقم التذكرة:</b> ${tktNum}</div>
          <div><b>${travelMode === 'land' ? 'الحافلة' : 'الرحلة'}:</b> ${flightNo}</div>
          <div><b>المسار:</b> ${route}</div>
          <div><b>التاريخ:</b> ${travelDate}</div>
          <div style="background:#fef3c7; padding:2px 4px; border-radius:4px; font-weight:900;"><b>⏰ الوقت:</b> ${depTime}</div>
          <div><b>الهوية:</b> ${idNo}</div>
          <div><b>${travelMode === 'land' ? 'المحطة' : 'نقطة الصعود'}:</b> ${boarding}</div>
          <div style="font-weight:900; color:${color};">السعر: ${priceStr}</div>
        </div>
      </div>
    `

    const dispatchLabel = travelMode === 'land' ? 'نسخة المحطة — Dispatch Copy' : 'نسخة الترحيل — Dispatch Copy'
    content = `<div style="max-width: 100%;">
      ${passengerCopy}
      ${stubCopy(dispatchLabel, '#065f46', '#ecfdf5')}
      ${stubCopy('نسخة الفرع — Branch Copy', '#7c3aed', '#faf5ff')}
    </div>`
  } else if (kind === 'visa') {
    content = `<div class="title">${title} — ${escHtml(record.service_type)}</div>
      <div class="info-grid">
        <div><b>التاريخ:</b> ${fmtDate(record.date)}</div><div><b>نوع الخدمة:</b> ${escHtml(record.service_type)}</div>
        <div><b>اسم المسافر:</b> ${escHtml(record.passenger_name || '—')}</div><div><b>رقم الجواز:</b> ${escHtml(record.passport_no || '—')}</div>
        <div><b>الجنسية:</b> ${escHtml(record.nationality || '—')}</div><div><b>العميل:</b> ${escHtml(record.client_name)}</div>
        <div><b>المورد:</b> ${escHtml(record.supplier_name)}</div>
        <div><b>طريقة الدفع:</b> <span class="badge ${record.payment_method === 'cash' ? 'badge-cash' : 'badge-credit'}">${record.payment_method === 'cash' ? 'نقد' : 'آجل'}</span></div>
      </div>
      <table><thead><tr><th>الوصف</th><th style="text-align:left">التكلفة</th><th style="text-align:left">البيع</th><th style="text-align:left">العمولة</th></tr></thead>
      <tbody><tr><td>${escHtml(record.service_type)}</td><td style="text-align:left">${fmt(record.cost, record.currency)}</td><td style="text-align:left">${fmt(record.sale_price, record.currency)}</td><td style="text-align:left"><b>${fmt(record.commission, record.currency)}</b></td></tr></tbody></table>
      <div class="big">المبلغ المستحق: ${fmt(record.sale_price, record.currency)}</div>`
  } else if (kind === 'receipt' || kind === 'payment') {
    content = `<div class="title">${title} — ${escHtml(record.party_name)}</div>
      <div class="info-grid">
        <div><b>التاريخ:</b> ${fmtDate(record.date)}</div>
        <div><b>${kind === 'receipt' ? 'المستلم من' : 'المدفوع إلى'}:</b> ${escHtml(record.party_name)}</div>
        <div><b>الطريقة:</b> ${escHtml(record.method)}</div>
        <div><b>الصندوق/البنك:</b> ${escHtml(record.box_name)}</div>
      </div>
      ${record.description ? `<p style="padding:12px;background:#f8fafc;border-radius:6px"><b>البيان:</b> ${escHtml(record.description)}</p>` : ''}
      <div class="big">${kind === 'receipt' ? 'مبلغ القبض' : 'مبلغ الصرف'}: ${fmt(record.amount, record.currency)}</div>`
  } else if (kind === 'fx') {
    content = `<div class="title">${title} — ${record.type === 'buy' ? 'شراء عملة' : 'بيع عملة'}</div>
      <div class="info-grid">
        <div><b>التاريخ:</b> ${fmtDate(record.date)}</div><div><b>النوع:</b> ${record.type === 'buy' ? 'شراء' : 'بيع'}</div>
        <div><b>الزبون:</b> ${escHtml(record.customer_name || '—')}</div><div><b>الهاتف:</b> ${escHtml(record.customer_phone || '—')}</div>
        <div><b>نوع الهوية:</b> ${escHtml(record.id_type || '—')}</div><div><b>رقم الهوية:</b> ${escHtml(record.id_number || '—')}</div>
        <div><b>مصدر الأموال:</b> ${escHtml(record.source_of_funds || '—')}</div><div><b>الغرض:</b> ${escHtml(record.purpose || '—')}</div>
      </div>
      <table><thead><tr><th>الوصف</th><th style="text-align:left">المبلغ</th><th style="text-align:left">السعر</th><th style="text-align:left">القيمة</th></tr></thead>
      <tbody><tr><td>${record.type === 'buy' ? 'شراء' : 'بيع'} ${escHtml(record.currency)}</td><td style="text-align:left"><b>${fmt(record.amount, record.currency)}</b></td><td style="text-align:left">${record.exchange_rate}</td><td style="text-align:left"><b>${fmt(record.counter_amount, record.counter_currency)}</b></td></tr></tbody></table>
      ${record.remarks ? `<p style="padding:10px;background:#f8fafc;border-radius:6px"><b>ملاحظات:</b> ${escHtml(record.remarks)}</p>` : ''}`
  }
  const sig = `<div class="sig"><div>المحاسب</div><div>أمين الصندوق</div><div>توقيع العميل</div></div>`
  openPrint(buildPrintHead(settings, tenant, title) + content + buildPrintFoot(settings, sig))
}

function printTable({ title, columns, rows, totals, settings, tenant }) {
  const head = `<div class="title">${escHtml(title)} — إجمالي ${rows.length} سجل</div>
  <table><thead><tr>${columns.map(c => `<th${c.align === 'left' ? ' style="text-align:left"' : ''}>${escHtml(c.label)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(r => `<tr>${columns.map(c => `<td${c.align === 'left' ? ' style="text-align:left"' : ''}>${escHtml(c.render ? c.render(r) : (r[c.key] ?? '—'))}</td>`).join('')}</tr>`).join('')}
  ${totals ? `<tr class="total-row">${columns.map((c, i) => `<td${c.align === 'left' ? ' style="text-align:left"' : ''}>${i === 0 ? 'الإجمالي' : (totals[c.key] !== undefined ? escHtml(totals[c.key]) : '')}</td>`).join('')}</tr>` : ''}
  </tbody></table>`
  openPrint(buildPrintHead(settings, tenant, title) + head + buildPrintFoot(settings))
}


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
// ================================================================
// v3.5 — REFUND DIALOG + BULK STATEMENT MODAL
// ================================================================
function RefundDialog({ open, onOpenChange, record, refType, onSaved }) {
  const { tenant } = useAuth()
  const [f, setF] = useState({ supplier_penalty: '', office_fee: '', reason: '', notes: '' })
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) setF({ supplier_penalty: '', office_fee: '', reason: '', notes: '' }) }, [open, record])
  if (!record) return null
  const sale = Number(record.sale_price) || 0
  const cost = Number(record.cost) || 0
  const sp = Number(f.supplier_penalty) || 0
  const of = Number(f.office_fee) || 0
  const refundToClient = +(sale - sp - of).toFixed(2)
  const totalFees = +(sp + of).toFixed(2)
  const invalid = refundToClient < 0
  const submit = async () => {
    if (invalid) return toast.error('مجموع الرسوم أكبر من قيمة البيع')
    try {
      setSaving(true)
      const doc = await api('/refunds', { method: 'POST', body: {
        ref_type: refType, ref_id: record.id,
        supplier_penalty: sp, office_fee: of, reason: f.reason, notes: f.notes,
      } })
      toast.success('✅ تم إنشاء سند الاسترداد وعكس القيد')
      onSaved && onSaved(doc)
      onOpenChange(false)
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  const printCredit = () => {
    const passenger = record.passenger_name || record.beneficiary_name || record.client_name || '—'
    const dateStr = new Date().toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' })
    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>سند استرداد</title>
<style>body{font-family:'Tahoma',sans-serif;background:#f8fafc;padding:24px;color:#0f172a}
.doc{max-width:700px;margin:auto;background:#fff;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.06);overflow:hidden}
.hdr{background:linear-gradient(135deg,#dc2626,#f97316);color:#fff;padding:22px 28px;display:flex;justify-content:space-between;align-items:center}
.hdr h1{margin:0;font-size:22px;font-weight:900}
.sec{padding:18px 28px;border-bottom:1px solid #e2e8f0}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.row{padding:6px 10px;background:#f8fafc;border-radius:6px;font-size:12px;display:flex;justify-content:space-between}
.big{background:#fef2f2;border:2px solid #fecaca;border-radius:10px;padding:14px;text-align:center;margin:10px 0}
.big .n{font-size:32px;font-weight:900;color:#dc2626}
.foot{padding:16px 28px;background:#f8fafc;font-size:11px;color:#64748b;text-align:center}
@media print{.actions{display:none}}
</style></head><body><div class="doc">
<div class="hdr"><h1>🔄 سند استرداد (Credit Note)</h1><div style="text-align:left"><div style="font-size:14px;font-weight:800">${escHtml(tenant?.name || 'مكتب رحّال')}</div><div style="font-size:11px;opacity:.9">${dateStr}</div></div></div>
<div class="sec"><div class="grid">
<div class="row"><b>العميل:</b><span>${escHtml(record.client_name)}</span></div>
<div class="row"><b>المسافر/المستفيد:</b><span>${escHtml(passenger)}</span></div>
<div class="row"><b>${refType === 'ticket' ? 'PNR' : refType === 'visa' ? 'الجواز' : 'المرجع'}:</b><span>${escHtml(record.pnr || record.passport_no || record.reference_no || '—')}</span></div>
<div class="row"><b>العملة:</b><span>${escHtml(record.currency)}</span></div>
<div class="row"><b>قيمة البيع الأصلية:</b><span>${fmt(sale, record.currency)}</span></div>
<div class="row"><b>غرامة المورد:</b><span style="color:#dc2626">-${fmt(sp, record.currency)}</span></div>
<div class="row"><b>رسوم خدمة المكتب:</b><span style="color:#dc2626">-${fmt(of, record.currency)}</span></div>
<div class="row"><b>سبب الإلغاء:</b><span>${escHtml(f.reason || '—')}</span></div>
</div>
<div class="big"><div style="font-size:12px;color:#7f1d1d;font-weight:700;margin-bottom:6px">صافي المبلغ المسترد للعميل</div><div class="n">${fmt(refundToClient, record.currency)}</div></div>
</div>
<div class="foot">صادر إلكترونياً من نظام رحّال — Rahaal ERP • ${dateStr}</div>
</div><div class="actions" style="text-align:center;margin-top:16px"><button onclick="window.print()" style="background:#dc2626;color:#fff;border:0;padding:10px 20px;border-radius:8px;font-weight:800;cursor:pointer">🖨️ طباعة</button></div>
</body></html>`
    const w = window.open('', '_blank', 'width=800,height=900')
    if (!w) return toast.error('السماح بالنوافذ المنبثقة مطلوب')
    w.document.open(); w.document.write(html); w.document.close(); w.focus()
  }
  const shareWA = () => {
    const passenger = record.passenger_name || record.beneficiary_name || record.client_name
    const msg = `عزيزنا العميل ${record.client_name}،\n\n🔄 سند استرداد\n📋 ${refType === 'ticket' ? 'تذكرة' : refType === 'visa' ? 'تأشيرة' : 'خدمة'} ${passenger}\n💰 قيمة البيع: ${fmt(sale, record.currency)}\n➖ غرامة المورد: ${fmt(sp, record.currency)}\n➖ رسوم المكتب: ${fmt(of, record.currency)}\n\n✅ *صافي المبلغ المسترد: ${fmt(refundToClient, record.currency)}*\n\n${f.reason ? `السبب: ${f.reason}\n\n` : ''}شكراً لتعاملكم — ${tenant?.name || 'مكتب رحّال'}`
    const phone = record.passenger_whatsapp || record.passenger_phone || record.beneficiary_whatsapp || record.beneficiary_phone
    openWhatsApp(phone, msg)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ArrowLeftRight className="w-5 h-5 text-orange-600" /> استرداد/إلغاء {refType === 'ticket' ? 'تذكرة' : refType === 'visa' ? 'تأشيرة' : 'خدمة'}</DialogTitle>
          <DialogDescription>سيتم عكس القيد الأصلي، وإنشاء قيد جديد يخصم الرسوم ويعيد الرصيد للعميل</DialogDescription>
        </DialogHeader>
        <div className="bg-slate-50 border rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-slate-500">العميل:</span><span className="font-semibold">{record.client_name}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">المسافر/المستفيد:</span><span>{record.passenger_name || record.beneficiary_name || '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">قيمة البيع الأصلية:</span><span className="font-bold text-blue-600">{fmt(sale, record.currency)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">التكلفة الأصلية:</span><span>{fmt(cost, record.currency)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">طريقة الدفع الأصلية:</span><span>{record.payment_method === 'cash' ? '💵 نقد' : '🕓 آجل'}</span></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="غرامة المورد/الشركة"><Input type="number" step="0.01" value={f.supplier_penalty} onChange={e => setF({ ...f, supplier_penalty: e.target.value })} placeholder="0" /></Field>
          <Field label="رسوم خدمة المكتب"><Input type="number" step="0.01" value={f.office_fee} onChange={e => setF({ ...f, office_fee: e.target.value })} placeholder="0" /></Field>
          <div className="md:col-span-2"><Field label="سبب الإلغاء"><Input value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} placeholder="طلب العميل / تعذر السفر / تأجيل ..." /></Field></div>
          <div className="md:col-span-2"><Field label="ملاحظات"><Textarea rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field></div>
        </div>
        <div className={`rounded-xl p-4 border-2 ${invalid ? 'border-rose-300 bg-rose-50' : 'border-emerald-300 bg-emerald-50'}`}>
          <div className="text-xs text-slate-600 mb-1">صافي المبلغ الذي سيُعاد للعميل</div>
          <div className={`text-3xl font-extrabold ${invalid ? 'text-rose-600' : 'text-emerald-700'}`}>{fmt(refundToClient, record.currency)}</div>
          <div className="text-[10px] text-slate-500 mt-1">= قيمة البيع ({fmt(sale, record.currency)}) − إجمالي الرسوم ({fmt(totalFees, record.currency)})</div>
          {invalid && <div className="text-xs text-rose-700 mt-2 font-semibold">⚠️ مجموع الرسوم أكبر من قيمة البيع</div>}
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={printCredit} variant="outline" className="gap-1"><Printer className="w-4 h-4" /> طباعة سند الاسترداد</Button>
          <WaBtn phone={record.passenger_whatsapp || record.passenger_phone || record.beneficiary_whatsapp || record.beneficiary_phone} message={`سيتم إرسال تفاصيل الاسترداد على واتساب`} size="md" label="مشاركة على واتساب" />
          <Button onClick={submit} disabled={saving || invalid} className="bg-orange-600 hover:bg-orange-700 text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '💾 تنفيذ الاسترداد + قيد عكسي'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BulkStatementDialog({ open, onOpenChange }) {
  const [kind, setKind] = useState('clients')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const generate = async () => {
    try {
      setLoading(true)
      const r = await api('/bulk-statement/generate', { method: 'POST', body: { kind, period: 'month' } })
      setResults(r); toast.success(`تم توليد ${r.count} كشف`)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }
  const openAll = () => {
    if (!results?.items) return
    if (!confirm(`سيتم فتح ${results.items.length} نافذة واتساب — تأكد من السماح بالنوافذ المنبثقة. متابعة؟`)) return
    results.items.forEach((it, i) => setTimeout(() => window.open(it.wa_link, '_blank', 'noopener'), i * 300))
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">📢 إرسال جماعي لكشوفات الحسابات</DialogTitle>
          <DialogDescription>يولّد رسائل واتساب جاهزة لجميع {kind === 'clients' ? 'العملاء' : 'الموردين'} الذين لديهم رصيد + رقم هاتف</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 mb-3">
          <button onClick={() => setKind('clients')} className={`flex-1 px-4 py-2 rounded-lg font-bold border-2 ${kind === 'clients' ? 'bg-blue-500 text-white border-blue-600' : 'bg-white border-slate-300'}`}>العملاء</button>
          <button onClick={() => setKind('suppliers')} className={`flex-1 px-4 py-2 rounded-lg font-bold border-2 ${kind === 'suppliers' ? 'bg-orange-500 text-white border-orange-600' : 'bg-white border-slate-300'}`}>الموردون</button>
          <Button onClick={generate} disabled={loading} className="grad-brand text-white gap-2">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '🔄 توليد'}</Button>
        </div>
        {results && (
          <div className="space-y-2">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
              <div><b>{results.count}</b> كشف جاهز للإرسال</div>
              <Button onClick={openAll} className="bg-[#25D366] hover:bg-[#128C7E] text-white gap-2">📤 فتح الكل على واتساب</Button>
            </div>
            <div className="max-h-80 overflow-y-auto border rounded-lg divide-y">
              {results.items.map(it => (
                <div key={it.id} className="flex items-center justify-between p-2 hover:bg-slate-50">
                  <div>
                    <div className="font-semibold">{it.name}</div>
                    <div className="text-xs text-slate-500" dir="ltr">📞 {it.phone || 'لا يوجد'}</div>
                  </div>
                  <div className="flex gap-1">
                    <div className="text-xs text-slate-600 self-center ml-2">
                      {['USD', 'SAR', 'YER'].filter(c => Math.abs(it.balances[c] || 0) > 0.01).map(c => `${c}: ${(it.balances[c] || 0).toFixed(0)}`).join(' • ')}
                    </div>
                    <a href={it.wa_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-[#25D366] hover:bg-[#128C7E] text-white text-xs font-semibold">
                      💬 إرسال
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ActionToolbar({ onAdd, onRefresh, onDelete, onSearch, onPrint, onPrintVoucher, onPrintTable, onEdit, onExit, onRefund, selectedId, count, addLabel }) {
  const btn = (icon, label, cb, cls = '', disabled = false) => (
    <Button size="sm" variant="outline" onClick={cb} disabled={disabled}
      className={`gap-2 ${cls}`}>{icon}<span className="hidden md:inline">{label}</span></Button>
  )
  return (
    <div className="flex flex-wrap items-center gap-2 p-2 bg-white border rounded-lg shadow-sm mb-4">
      {onAdd && <Button onClick={onAdd} size="sm" className="grad-brand text-white gap-2"><Plus className="w-4 h-4" /> {addLabel || 'إضافة'}</Button>}
      {onEdit && btn(<Key className="w-4 h-4" />, 'تعديل', onEdit, 'text-amber-600 hover:bg-amber-50', !selectedId)}
      {onRefund && btn(<ArrowLeftRight className="w-4 h-4" />, 'استرداد/إلغاء', onRefund, 'text-orange-600 hover:bg-orange-50', !selectedId)}
      {onDelete && btn(<Trash2 className="w-4 h-4" />, 'حذف', onDelete, 'text-rose-600 hover:bg-rose-50', !selectedId)}
      {onRefresh && btn(<Activity className="w-4 h-4" />, 'تحديث', onRefresh)}
      {onSearch && btn(<Search className="w-4 h-4" />, 'بحث', onSearch)}
      {onPrintVoucher && btn(<Printer className="w-4 h-4" />, 'طباعة السند', onPrintVoucher, 'text-blue-600 hover:bg-blue-50', !selectedId)}
      {onPrintTable && btn(<FileSpreadsheet className="w-4 h-4" />, 'طباعة الجدول', onPrintTable, 'text-emerald-600 hover:bg-emerald-50')}
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
  { key: 'client_name', label: 'حساب القبض', aliases: ['client', 'customer', 'العميل', 'اسم العميل', 'حساب القبض'] },
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
  { key: 'client_name', label: 'حساب القبض', aliases: ['client', 'customer', 'العميل', 'اسم العميل', 'حساب القبض'] },
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

  const buildNormalized = (autoFix = false) => {
    return rawRows.map(r => {
      const out = {}
      for (const f of fields) {
        const col = mapping[f.key]
        let val = col ? r[col] : ''
        if (val instanceof Date) val = val.toISOString().slice(0, 10)
        // Auto-fix: trim whitespace on strings
        if (autoFix && typeof val === 'string') val = val.trim().replace(/\s+/g, ' ')
        out[f.key] = val === undefined ? '' : val
      }
      if (!out.currency) out.currency = defaultCurrency
      else if (typeof out.currency === 'string') out.currency = out.currency.toUpperCase().trim()
      // Auto-fix: default missing date to today
      if (autoFix && (!out.date || out.date === '')) out.date = todayISO()
      if (autoFix && (!out.travel_date || out.travel_date === '')) out.travel_date = todayISO()
      out.cost = Number(out.cost) || 0
      out.sale_price = Number(out.sale_price) || 0
      return out
    }).filter(r => {
      // Auto-fix: skip completely blank rows (all string fields empty AND cost=0 AND sale=0)
      if (!autoFix) return true
      const hasAny = r.client_name || r.supplier_name || r.passenger_name || r.pnr || r.passport_no || r.cost || r.sale_price
      return !!hasAny
    })
  }

  const doPreview = async (autoFix = false) => {
    if (!mapping.client_name || !mapping.supplier_name || !mapping.cost || !mapping.sale_price) return toast.error('يجب تعيين حقول: العميل، المورد، التكلفة، البيع')
    try {
      setLoading(true)
      const rows = buildNormalized(autoFix)
      const r = await api(`/import/${kind}/preview`, { method: 'POST', body: { rows } })
      setPreview(r); setStep(3)
      if (autoFix) toast.success('🔧 تم تطبيق الإصلاح التلقائي على الصفوف')
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }
  const doAutoFix = () => doPreview(true)

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
              {(preview.rows.filter(r => r.__errors.length).length > 0 || preview.rows.filter(r => !r.date).length > 0) && (
                <Button size="sm" variant="outline" onClick={doAutoFix} disabled={loading} className="mr-auto gap-1 border-amber-400 text-amber-700 hover:bg-amber-100">
                  🔧 إصلاح تلقائي
                </Button>
              )}
            </div>

            {/* Error breakdown */}
            {preview.rows.filter(r => r.__errors.length).length > 0 && (
              <details className="rounded-lg bg-rose-50 border border-rose-200" open>
                <summary className="cursor-pointer p-3 font-bold text-rose-700 flex items-center gap-2">
                  <XCircle className="w-4 h-4" /> تفاصيل الأخطاء ({preview.rows.filter(r => r.__errors.length).length} صف)
                  <span className="text-xs font-normal text-rose-600 mr-2">— انقر للطي / التوسيع</span>
                </summary>
                <div className="p-3 pt-0 max-h-56 overflow-y-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="w-16">#الصف</TableHead>
                      <TableHead>سبب الرفض</TableHead>
                      <TableHead>بيانات الصف</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {preview.rows.filter(r => r.__errors.length).map(r => (
                        <TableRow key={r.__row}>
                          <TableCell className="font-mono text-rose-700 font-bold">صف {r.__row}</TableCell>
                          <TableCell className="text-xs">
                            {r.__errors.map((e, i) => <div key={i} className="flex items-center gap-1"><XCircle className="w-3 h-3 text-rose-500" />{e}</div>)}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {kind === 'tickets' ? `PNR: ${r.pnr || '—'} | ` : `جواز: ${r.passport_no || '—'} | `}
                            عميل: {r.client_name || '—'} | مورد: {r.supplier_name || '—'} | تكلفة: {r.cost || '—'} | بيع: {r.sale_price || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </details>
            )}

            <div className="border rounded-lg overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10">
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>الحالة</TableHead>
                    {kind === 'tickets' ? <TableHead>PNR</TableHead> : <TableHead>الجواز</TableHead>}
                    <TableHead>المسافر</TableHead><TableHead>حساب القبض</TableHead><TableHead>المورد</TableHead>
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
  const { settings, tenant } = useAuth()
  const [visas, setVisas] = useState([])
  const [clients, setClients] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [openManual, setOpenManual] = useState(false)
  const [openBulk, setOpenBulk] = useState(false)
  const [openSearch, setOpenSearch] = useState(false)
  const [filter, setFilter] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [editing, setEditing] = useState(null)
  const [refundTarget, setRefundTarget] = useState(null)
  const [rates, setRates] = useState(null)
  const load = async () => {
    try {
      const [v, c, s, r] = await Promise.all([api('/visas'), api('/clients'), api('/suppliers'), api('/rates')])
      setVisas(v); setClients(c); setSuppliers(s); setRates(r.rates)
    } catch (e) { toast.error(e.message) }
  }
  useEffect(() => { load() }, [])
  const filtered = applyFilter(visas, filter)
  const selected = filtered.find(v => v.id === selectedId)
  const handleAdd = () => { setEditing(null); setOpenManual(true) }
  const handleEdit = () => { if (!selected) return toast.error('اختر خدمة أولاً'); setEditing(selected); setOpenManual(true) }
  const handleDelete = async () => {
    if (!selectedId) return
    if (!confirm('حذف هذه الخدمة/التأشيرة وعكس القيد المحاسبي؟')) return
    try { await api(`/visas/${selectedId}`, { method: 'DELETE' }); toast.success('تم الحذف'); setSelectedId(null); load() }
    catch (e) { toast.error(e.message) }
  }
  const handlePrintVoucher = () => {
    if (!selected) return toast.error('اختر سجلاً أولاً')
    printVoucher({ kind: 'visa', record: selected, settings, tenant })
  }
  const handlePrintTable = () => {
    const totals = { cost: 0, sale_price: 0, commission: 0 }
    for (const r of filtered) { totals.cost += r.cost; totals.sale_price += r.sale_price; totals.commission += r.commission }
    printTable({
      title: 'كشف التأشيرات والخدمات', settings, tenant, rows: filtered,
      columns: [
        { key: 'date', label: 'التاريخ', render: r => fmtDate(r.date) },
        { key: 'service_type', label: 'الخدمة' },
        { key: 'passenger_name', label: 'المسافر' },
        { key: 'passport_no', label: 'الجواز' },
        { key: 'client_name', label: 'حساب القبض' },
        { key: 'supplier_name', label: 'المورد' },
        { key: 'currency', label: 'العملة' },
        { key: 'cost', label: 'تكلفة', align: 'left', render: r => fmt(r.cost, r.currency) },
        { key: 'sale_price', label: 'بيع', align: 'left', render: r => fmt(r.sale_price, r.currency) },
        { key: 'commission', label: 'عمولة', align: 'left', render: r => fmt(r.commission, r.currency) },
      ],
      totals: { cost: totals.cost.toFixed(2), sale_price: totals.sale_price.toFixed(2), commission: totals.commission.toFixed(2) },
    })
  }
  return (
    <div className="space-y-4">
      <TopBar
        title="التأشيرات والخدمات"
        subtitle="تأشيرات عمرة، موافقات أمنية، فيز، حجز فنادق — إدخال يدوي أو استيراد Excel"
        right={<Button variant="outline" onClick={() => setOpenBulk(true)} className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"><FileSpreadsheet className="w-4 h-4" /> رفع Excel/CSV</Button>}
      />
      <ActionToolbar
        addLabel="خدمة جديدة" onAdd={handleAdd} onRefresh={load} onSearch={() => setOpenSearch(true)}
        onEdit={handleEdit} onDelete={handleDelete} onRefund={() => { if (!selected) return toast.error('اختر تأشيرة أولاً'); if (selected.is_refunded) return toast.error('التأشيرة مستردة مسبقاً'); setRefundTarget(selected) }} onPrintVoucher={handlePrintVoucher} onPrintTable={handlePrintTable}
        selectedId={selectedId} count={filtered.length}
      />
      {filter && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs">
          <Filter className="w-4 h-4 text-blue-600" /> فلتر نشط: <b>{filter.field}</b> {filter.condition === 'equals' ? 'يساوي' : 'يحتوي على'} "<b>{filter.term}</b>"
          <Button size="sm" variant="ghost" onClick={() => setFilter(null)} className="mr-auto text-rose-600">مسح</Button>
        </div>
      )}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileBadge2 className="w-5 h-5 text-emerald-600" /> سجل التأشيرات ({filtered.length}{filter ? ` من ${visas.length}` : ''})</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>التاريخ</TableHead><TableHead>النوع</TableHead><TableHead>المسافر</TableHead>
                  <TableHead>الجواز</TableHead><TableHead>الجنسية</TableHead><TableHead>حساب القبض</TableHead>
                  <TableHead>المورد</TableHead><TableHead>الدفع</TableHead><TableHead>العملة</TableHead>
                  <TableHead className="text-left">تكلفة</TableHead><TableHead className="text-left">بيع</TableHead>
                  <TableHead className="text-left text-emerald-600">عمولة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && <TableRow><TableCell colSpan={13} className="text-center text-slate-400 py-8">{filter ? 'لا نتائج للفلتر' : 'لا توجد خدمات'}</TableCell></TableRow>}
                {filtered.map(v => (
                  <TableRow key={v.id} className={selectedId === v.id ? 'bg-blue-50' : 'cursor-pointer hover:bg-slate-50'} onClick={() => setSelectedId(v.id === selectedId ? null : v.id)}>
                    <TableCell><input type="radio" checked={selectedId === v.id} onChange={() => setSelectedId(v.id)} /></TableCell>
                    <TableCell className="text-xs">{fmtDate(v.date)}</TableCell>
                    <TableCell><Badge variant="secondary">{v.service_type}</Badge></TableCell>
                    <TableCell>{v.passenger_name || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{v.passport_no || '—'}</TableCell>
                    <TableCell className="text-xs">{v.nationality || '—'}</TableCell>
                    <TableCell>{v.client_name}</TableCell>
                    <TableCell>{v.supplier_name}</TableCell>
                    <TableCell>{v.payment_method === 'cash' ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">💵 نقد</Badge> : <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">🕓 آجل</Badge>}</TableCell>
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
      <VisaDialog open={openManual} onOpenChange={(v) => { setOpenManual(v); if (!v) setEditing(null) }} clients={clients} suppliers={suppliers} rates={rates} record={editing}
        onSaved={() => { load(); setEditing(null); toast.success(editing ? '✅ تم تعديل الخدمة وعكس القيد السابق تلقائياً' : 'تم حفظ الخدمة') }} />
      <RefundDialog open={!!refundTarget} onOpenChange={v => !v && setRefundTarget(null)} record={refundTarget} refType="visa" onSaved={() => { setRefundTarget(null); load() }} />
      <BulkImportDialog open={openBulk} onOpenChange={setOpenBulk} kind="visas" onDone={() => { load(); setOpenBulk(false) }} />
      <UniversalSearchModal open={openSearch} onOpenChange={setOpenSearch}
        fields={[
          { key: 'passenger_name', label: 'اسم المسافر' }, { key: 'passport_no', label: 'رقم الجواز' },
          { key: 'client_name', label: 'حساب القبض' }, { key: 'supplier_name', label: 'اسم المورد' },
          { key: 'service_type', label: 'نوع الخدمة' }, { key: 'nationality', label: 'الجنسية' },
          { key: 'sale_price', label: 'سعر البيع' }, { key: 'currency', label: 'العملة' },
        ]}
        onApply={setFilter} onClear={() => setFilter(null)}
      />
    </div>
  )
}

function VisaDialog({ open, onOpenChange, clients, suppliers, rates, onSaved, record }) {
  const isEdit = !!record
  const emptyForm = { date: todayISO(), service_type: 'تأشيرة عمرة', currency: 'SAR', exchange_rate: 0.267, client_id: '', supplier_id: '', passenger_name: '', passport_no: '', nationality: '', entry_date: '', expected_exit_date: '', passenger_phone: '', passenger_whatsapp: '', cost: '', sale_price: '', payment_method: 'credit', box_id: '' }
  const [form, setForm] = useState(emptyForm)
  const [boxes, setBoxes] = useState([])
  const [saving, setSaving] = useState(false)
  const [qc, setQc] = useState(false); const [qs, setQs] = useState(false)
  useEffect(() => {
    if (!open) return
    if (record) {
      setForm({
        date: record.date ? new Date(record.date).toISOString().slice(0,10) : todayISO(),
        service_type: record.service_type || 'تأشيرة عمرة',
        currency: record.currency || 'SAR', exchange_rate: record.exchange_rate || 1,
        client_id: record.client_id || '', supplier_id: record.supplier_id || '',
        passenger_name: record.passenger_name || '', passport_no: record.passport_no || '',
        nationality: record.nationality || '',
        entry_date: record.entry_date ? new Date(record.entry_date).toISOString().slice(0,10) : '',
        expected_exit_date: record.expected_exit_date ? new Date(record.expected_exit_date).toISOString().slice(0,10) : '',
        passenger_phone: record.passenger_phone || '',
        passenger_whatsapp: record.passenger_whatsapp || record.passenger_phone || '',
        cost: record.cost ?? '', sale_price: record.sale_price ?? '',
        payment_method: record.payment_method || 'credit', box_id: record.box_id || '',
      })
    } else { setForm(emptyForm) }
  }, [open, record])
  useEffect(() => { if (rates && !isEdit) setForm(f => ({ ...f, exchange_rate: rates[f.currency] || 1 })) }, [rates, form.currency])
  useEffect(() => { if (open) api('/boxes').then(setBoxes).catch(()=>{}) }, [open])
  useEffect(() => { if (form.payment_method === 'cash' && boxes[0] && !form.box_id) setForm(f => ({ ...f, box_id: boxes[0].id })) }, [form.payment_method, boxes])
  const commission = (Number(form.sale_price) || 0) - (Number(form.cost) || 0)
  const submit = async () => {
    if (!form.client_id || !form.supplier_id) return toast.error('اختر حساب القبض والمورد')
    if (!form.cost || !form.sale_price) return toast.error('أدخل التكلفة وسعر البيع')
    if (form.payment_method === 'cash' && !form.box_id) return toast.error('اختر الصندوق للدفع النقدي')
    try {
      setSaving(true)
      if (isEdit) await api(`/visas/${record.id}`, { method: 'PUT', body: form })
      else await api('/visas', { method: 'POST', body: form })
      onOpenChange(false); onSaved(); setForm(emptyForm)
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-xl"><div className="w-9 h-9 rounded-lg grad-green flex items-center justify-center"><FileBadge2 className="w-4 h-4 text-white" /></div>{isEdit ? '✏️ تعديل خدمة / تأشيرة' : 'خدمة / تأشيرة جديدة'}</DialogTitle>{isEdit && <DialogDescription>سيتم عكس القيد المحاسبي القديم وإعادة الترحيل تلقائياً — دون خصم من الحصة</DialogDescription>}</DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="التاريخ"><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="نوع الخدمة"><Select value={form.service_type} onValueChange={v => setForm({ ...form, service_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{VISA_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="العملة"><Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c} — {CUR_NAME[c]}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="حساب القبض" required><SmartAutocomplete kind="client" items={clients} value={form.client_id} onChange={id => setForm({ ...form, client_id: id })} onCreated={() => onSaved && onSaved()} /></Field>
            <Field label="المورد" required><SmartAutocomplete kind="supplier" items={suppliers} value={form.supplier_id} onChange={id => setForm({ ...form, supplier_id: id })} onCreated={() => onSaved && onSaved()} /></Field>
            <Field label="سعر الصرف"><Input type="number" step="0.0001" value={form.exchange_rate} onChange={e => setForm({ ...form, exchange_rate: e.target.value })} /></Field>
            <Field label="اسم صاحب التأشيرة"><Input value={form.passenger_name} onChange={e => setForm({ ...form, passenger_name: e.target.value })} /></Field>
            <Field label="رقم الجواز"><Input value={form.passport_no} onChange={e => setForm({ ...form, passport_no: e.target.value })} /></Field>
            <Field label="الجنسية"><Input value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })} /></Field>
          </div>
          {/* v3.0 — Entry / Expected Exit tracking for expiration alerts */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-2">
            <div className="text-sm font-bold text-amber-900 mb-2 flex items-center gap-2">
              <CalendarClock className="w-4 h-4" /> تتبع الدخول والخروج (اختياري — لتفعيل تنبيه لوحة التحكم قبل 10 أيام)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="تاريخ الدخول"><Input type="date" value={form.entry_date} onChange={e => setForm({ ...form, entry_date: e.target.value })} /></Field>
              <Field label="تاريخ الخروج المتوقع"><Input type="date" value={form.expected_exit_date} onChange={e => setForm({ ...form, expected_exit_date: e.target.value })} /></Field>
            </div>
          </div>

          {/* v3.2 — Contact for smart WhatsApp expiration alerts */}
          <div className="bg-gradient-to-l from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-3 mt-2">
            <div className="text-sm font-bold text-emerald-900 mb-2 flex items-center gap-2">
              📱 <span>بيانات التواصل — لإرسال تنبيه واتساب قبل انتهاء التأشيرة</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="رقم هاتف المسافر"><Input dir="ltr" value={form.passenger_phone} onChange={e => {
                const v = e.target.value; setForm(f => ({ ...f, passenger_phone: v, passenger_whatsapp: f.passenger_whatsapp || v }))
              }} placeholder="777xxxxxxx" className="bg-white" /></Field>
              <Field label="رقم واتساب (إن اختلف)"><Input dir="ltr" value={form.passenger_whatsapp} onChange={e => setForm({ ...form, passenger_whatsapp: e.target.value })} placeholder="اختياري" className="bg-white" /></Field>
            </div>
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
          <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button><Button onClick={submit} disabled={saving} className="grad-green text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEdit ? '💾 حفظ التعديل + عكس القيد' : 'حفظ + قيد')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <QuickAddDialog open={qc} onOpenChange={setQc} kind="client" onSaved={onSaved} />
      <QuickAddDialog open={qs} onOpenChange={setQs} kind="supplier" onSaved={onSaved} />
    </>
  )
}

// ================================================================
// SERVICES SCREEN (v3.0) — Dedicated dynamic-catalog services module
// Label: "حساب القبض" (Receivable Account) instead of "اسم العميل"
// ================================================================
function ServicesScreen() {
  const { settings, tenant } = useAuth()
  const [services, setServices] = useState([])
  const [serviceTypes, setServiceTypes] = useState([])
  const [clients, setClients] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [openManual, setOpenManual] = useState(false)
  const [openTypes, setOpenTypes] = useState(false)
  const [openSearch, setOpenSearch] = useState(false)
  const [filter, setFilter] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [editing, setEditing] = useState(null)
  const [refundTarget, setRefundTarget] = useState(null)
  const [rates, setRates] = useState(null)
  const load = async () => {
    try {
      const [sv, st, c, s, r] = await Promise.all([
        api('/services'), api('/service-types'), api('/clients'), api('/suppliers'), api('/rates')
      ])
      setServices(sv); setServiceTypes(st); setClients(c); setSuppliers(s); setRates(r.rates)
    } catch (e) { toast.error(e.message) }
  }
  useEffect(() => { load() }, [])
  const filtered = applyFilter(services, filter)
  const selected = filtered.find(v => v.id === selectedId)
  const handleAdd = () => { setEditing(null); setOpenManual(true) }
  const handleEdit = () => { if (!selected) return toast.error('اختر خدمة أولاً'); setEditing(selected); setOpenManual(true) }
  const handleDelete = async () => {
    if (!selectedId) return
    if (!confirm('حذف هذه الخدمة وعكس القيد المحاسبي؟')) return
    try { await api(`/services/${selectedId}`, { method: 'DELETE' }); toast.success('تم الحذف'); setSelectedId(null); load() }
    catch (e) { toast.error(e.message) }
  }
  const handlePrintTable = () => {
    const totals = { cost: 0, sale_price: 0, commission: 0 }
    for (const r of filtered) { totals.cost += r.cost; totals.sale_price += r.sale_price; totals.commission += r.commission }
    printTable({
      title: 'كشف الخدمات', settings, tenant, rows: filtered,
      columns: [
        { key: 'date', label: 'التاريخ', render: r => fmtDate(r.date) },
        { key: 'service_type', label: 'الخدمة' },
        { key: 'beneficiary_name', label: 'المستفيد' },
        { key: 'reference_no', label: 'الرقم المرجعي' },
        { key: 'client_name', label: 'حساب القبض' },
        { key: 'supplier_name', label: 'المورد / المزود' },
        { key: 'currency', label: 'العملة' },
        { key: 'cost', label: 'تكلفة', align: 'left', render: r => fmt(r.cost, r.currency) },
        { key: 'sale_price', label: 'بيع', align: 'left', render: r => fmt(r.sale_price, r.currency) },
        { key: 'commission', label: 'عمولة', align: 'left', render: r => fmt(r.commission, r.currency) },
      ],
      totals: { cost: totals.cost.toFixed(2), sale_price: totals.sale_price.toFixed(2), commission: totals.commission.toFixed(2) },
    })
  }
  return (
    <div className="space-y-4">
      <TopBar
        title="الخدمات"
        subtitle="حجز فنادق، تصديق شهادات، خدمات نقل، وأي خدمة إضافية — كتالوج ديناميكي مع قيود محاسبية تلقائية"
        right={
          <Button variant="outline" onClick={() => setOpenTypes(true)} className="gap-2 border-orange-200 text-orange-700 hover:bg-orange-50">
            <Settings className="w-4 h-4" /> إدارة أنواع الخدمات ({serviceTypes.length})
          </Button>
        }
      />
      <ActionToolbar
        addLabel="خدمة جديدة" onAdd={handleAdd} onRefresh={load} onSearch={() => setOpenSearch(true)}
        onEdit={handleEdit} onDelete={handleDelete} onRefund={() => { if (!selected) return toast.error('اختر خدمة أولاً'); if (selected.is_refunded) return toast.error('الخدمة مستردة مسبقاً'); setRefundTarget(selected) }} onPrintTable={handlePrintTable}
        selectedId={selectedId} count={filtered.length}
      />
      {filter && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs">
          <Filter className="w-4 h-4 text-blue-600" /> فلتر نشط: <b>{filter.field}</b> {filter.condition === 'equals' ? 'يساوي' : 'يحتوي على'} "<b>{filter.term}</b>"
          <Button size="sm" variant="ghost" onClick={() => setFilter(null)} className="mr-auto text-rose-600">مسح</Button>
        </div>
      )}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Briefcase className="w-5 h-5 text-orange-600" /> سجل الخدمات ({filtered.length}{filter ? ` من ${services.length}` : ''})</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>التاريخ</TableHead><TableHead>نوع الخدمة</TableHead>
                  <TableHead>المستفيد</TableHead><TableHead>الرقم المرجعي</TableHead>
                  <TableHead>حساب القبض</TableHead><TableHead>المورد / المزود</TableHead>
                  <TableHead>الدفع</TableHead><TableHead>العملة</TableHead>
                  <TableHead className="text-left">تكلفة</TableHead><TableHead className="text-left">بيع</TableHead>
                  <TableHead className="text-left text-emerald-600">عمولة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && <TableRow><TableCell colSpan={12} className="text-center text-slate-400 py-8">{filter ? 'لا نتائج للفلتر' : 'لا توجد خدمات — أضف خدمة جديدة من الأعلى'}</TableCell></TableRow>}
                {filtered.map(v => (
                  <TableRow key={v.id} className={selectedId === v.id ? 'bg-blue-50' : 'cursor-pointer hover:bg-slate-50'} onClick={() => setSelectedId(v.id === selectedId ? null : v.id)}>
                    <TableCell><input type="radio" checked={selectedId === v.id} onChange={() => setSelectedId(v.id)} /></TableCell>
                    <TableCell className="text-xs">{fmtDate(v.date)}</TableCell>
                    <TableCell><Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100 border border-orange-200">{v.service_type}</Badge></TableCell>
                    <TableCell>{v.beneficiary_name || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{v.reference_no || '—'}</TableCell>
                    <TableCell>{v.client_name}</TableCell>
                    <TableCell>{v.supplier_name}</TableCell>
                    <TableCell>{v.payment_method === 'cash' ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">💵 نقد</Badge> : <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">🕓 آجل</Badge>}</TableCell>
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
      <ServiceDialog open={openManual} onOpenChange={(v) => { setOpenManual(v); if (!v) setEditing(null) }}
        clients={clients} suppliers={suppliers} rates={rates} serviceTypes={serviceTypes} record={editing}
        onSaved={() => { load(); setEditing(null); toast.success(editing ? '✅ تم تعديل الخدمة وعكس القيد السابق' : 'تم حفظ الخدمة') }} />
      <ServiceTypesDialog open={openTypes} onOpenChange={setOpenTypes} onChanged={load} />
      <RefundDialog open={!!refundTarget} onOpenChange={v => !v && setRefundTarget(null)} record={refundTarget} refType="service" onSaved={() => { setRefundTarget(null); load() }} />
      <UniversalSearchModal open={openSearch} onOpenChange={setOpenSearch}
        fields={[
          { key: 'service_type', label: 'نوع الخدمة' }, { key: 'beneficiary_name', label: 'المستفيد' },
          { key: 'reference_no', label: 'الرقم المرجعي' }, { key: 'client_name', label: 'حساب القبض' },
          { key: 'supplier_name', label: 'المورد' }, { key: 'sale_price', label: 'سعر البيع' },
          { key: 'currency', label: 'العملة' },
        ]}
        onApply={setFilter} onClear={() => setFilter(null)}
      />
    </div>
  )
}

function ServiceDialog({ open, onOpenChange, clients, suppliers, rates, serviceTypes, onSaved, record }) {
  const isEdit = !!record
  const activeTypes = (serviceTypes || []).filter(t => t.active !== false)
  const emptyForm = {
    date: todayISO(), service_type: activeTypes[0]?.name || 'خدمات متنوعة',
    currency: 'SAR', exchange_rate: 0.267,
    client_id: '', supplier_id: '', beneficiary_name: '', reference_no: '', description: '',
    beneficiary_phone: '', beneficiary_whatsapp: '',
    cost: '', sale_price: '', payment_method: 'credit', box_id: '', notes: '',
  }
  const [form, setForm] = useState(emptyForm)
  const [boxes, setBoxes] = useState([])
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    if (record) {
      setForm({
        date: record.date ? new Date(record.date).toISOString().slice(0,10) : todayISO(),
        service_type: record.service_type || 'خدمات متنوعة',
        currency: record.currency || 'SAR', exchange_rate: record.exchange_rate || 1,
        client_id: record.client_id || '', supplier_id: record.supplier_id || '',
        beneficiary_name: record.beneficiary_name || '', reference_no: record.reference_no || '',
        description: record.description || '', notes: record.notes || '',
        beneficiary_phone: record.beneficiary_phone || '',
        beneficiary_whatsapp: record.beneficiary_whatsapp || record.beneficiary_phone || '',
        cost: record.cost ?? '', sale_price: record.sale_price ?? '',
        payment_method: record.payment_method || 'credit', box_id: record.box_id || '',
      })
    } else { setForm({ ...emptyForm, service_type: activeTypes[0]?.name || 'خدمات متنوعة' }) }
  }, [open, record])
  useEffect(() => { if (rates && !isEdit) setForm(f => ({ ...f, exchange_rate: rates[f.currency] || 1 })) }, [rates, form.currency])
  useEffect(() => { if (open) api('/boxes').then(setBoxes).catch(()=>{}) }, [open])
  useEffect(() => { if (form.payment_method === 'cash' && boxes[0] && !form.box_id) setForm(f => ({ ...f, box_id: boxes[0].id })) }, [form.payment_method, boxes])
  const commission = (Number(form.sale_price) || 0) - (Number(form.cost) || 0)
  const submit = async () => {
    if (!form.client_id) return toast.error('اختر حساب القبض')
    if (!form.supplier_id) return toast.error('اختر المورد / المزود')
    if (!form.cost || !form.sale_price) return toast.error('أدخل التكلفة وسعر البيع')
    if (form.payment_method === 'cash' && !form.box_id) return toast.error('اختر الصندوق للدفع النقدي')
    try {
      setSaving(true)
      if (isEdit) await api(`/services/${record.id}`, { method: 'PUT', body: form })
      else await api('/services', { method: 'POST', body: form })
      onOpenChange(false); onSaved(); setForm(emptyForm)
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="w-9 h-9 rounded-lg grad-gold flex items-center justify-center"><Briefcase className="w-4 h-4 text-white" /></div>
            {isEdit ? '✏️ تعديل خدمة' : 'خدمة جديدة'}
          </DialogTitle>
          {isEdit && <DialogDescription>سيتم عكس القيد المحاسبي القديم وإعادة الترحيل تلقائياً — دون خصم من الحصة</DialogDescription>}
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="التاريخ"><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="نوع الخدمة">
            <Select value={form.service_type} onValueChange={v => setForm({ ...form, service_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{activeTypes.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="العملة"><Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c} — {CUR_NAME[c]}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="حساب القبض" required><SmartAutocomplete kind="client" items={clients} value={form.client_id} onChange={id => setForm({ ...form, client_id: id })} onCreated={() => onSaved && onSaved()} /></Field>
          <Field label="المورد / المزود" required><SmartAutocomplete kind="supplier" items={suppliers} value={form.supplier_id} onChange={id => setForm({ ...form, supplier_id: id })} onCreated={() => onSaved && onSaved()} /></Field>
          <Field label="سعر الصرف"><Input type="number" step="0.0001" value={form.exchange_rate} onChange={e => setForm({ ...form, exchange_rate: e.target.value })} /></Field>
          <Field label="اسم المستفيد"><Input value={form.beneficiary_name} onChange={e => setForm({ ...form, beneficiary_name: e.target.value })} placeholder="مثال: أحمد محمد" /></Field>
          <Field label="الرقم المرجعي"><Input value={form.reference_no} onChange={e => setForm({ ...form, reference_no: e.target.value })} placeholder="مثال: HTL-2025-001" /></Field>
          <Field label="وصف مختصر"><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="مثال: 3 ليالٍ فندق البلد" /></Field>
        </div>
        {/* v3.2 — Contact panel */}
        <div className="bg-gradient-to-l from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-3 mt-2">
          <div className="text-sm font-bold text-emerald-900 mb-2 flex items-center gap-2">
            📱 <span>بيانات التواصل — لإرسال تفاصيل الخدمة أو تنبيهات عبر الواتساب</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="رقم هاتف المستفيد"><Input dir="ltr" value={form.beneficiary_phone} onChange={e => {
              const v = e.target.value; setForm(f => ({ ...f, beneficiary_phone: v, beneficiary_whatsapp: f.beneficiary_whatsapp || v }))
            }} placeholder="777xxxxxxx" className="bg-white" /></Field>
            <Field label="رقم واتساب (اختياري)"><Input dir="ltr" value={form.beneficiary_whatsapp} onChange={e => setForm({ ...form, beneficiary_whatsapp: e.target.value })} className="bg-white" /></Field>
          </div>
        </div>
        <div className="bg-slate-50 border rounded-xl p-3 mt-2 flex items-center gap-4">
          <div className="text-sm font-bold text-slate-700">طريقة الدفع:</div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setForm({ ...form, payment_method: 'credit' })} className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${form.payment_method === 'credit' ? 'bg-amber-500 text-white border-amber-600 shadow' : 'bg-white text-slate-600 border-slate-300 hover:border-amber-400'}`}>🕓 آجل (على حساب القبض)</button>
            <button type="button" onClick={() => setForm({ ...form, payment_method: 'cash' })} className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${form.payment_method === 'cash' ? 'bg-emerald-500 text-white border-emerald-600 shadow' : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-400'}`}>💵 نقد</button>
          </div>
          {form.payment_method === 'cash' && (
            <div className="flex-1"><Select value={form.box_id} onValueChange={v => setForm({ ...form, box_id: v })}><SelectTrigger><SelectValue placeholder="اختر الصندوق/البنك" /></SelectTrigger><SelectContent>{boxes.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar}</SelectItem>)}</SelectContent></Select></div>
          )}
        </div>
        <div className="bg-gradient-to-l from-orange-50 to-amber-50 border rounded-xl p-4 mt-2">
          <div className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Banknote className="w-4 h-4 text-orange-600" /> الجانب المالي</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label={`التكلفة (${form.currency})`} required><Input type="number" step="0.01" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} className="text-lg font-bold" /></Field>
            <Field label={`سعر البيع (${form.currency})`} required><Input type="number" step="0.01" value={form.sale_price} onChange={e => setForm({ ...form, sale_price: e.target.value })} className="text-lg font-bold" /></Field>
            <Field label={`العمولة (${form.currency})`}><div className={`px-3 py-2 rounded-md border text-lg font-extrabold ${commission >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>{fmt(commission, form.currency)}</div></Field>
          </div>
        </div>
        <Field label="ملاحظات (اختياري)">
          <Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="grad-gold text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEdit ? '💾 حفظ التعديل + عكس القيد' : 'حفظ + قيد')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ServiceTypesDialog({ open, onOpenChange, onChanged }) {
  const [types, setTypes] = useState([])
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const load = async () => { try { setTypes(await api('/service-types')) } catch (e) { toast.error(e.message) } }
  useEffect(() => { if (open) load() }, [open])
  const add = async () => {
    const n = name.trim()
    if (!n) return toast.error('أدخل اسم نوع الخدمة')
    try {
      setSaving(true)
      await api('/service-types', { method: 'POST', body: { name: n } })
      setName(''); await load(); onChanged && onChanged()
      toast.success('تمت الإضافة')
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  const del = async (id) => {
    if (!confirm('حذف نوع الخدمة؟')) return
    try { await api(`/service-types/${id}`, { method: 'DELETE' }); await load(); onChanged && onChanged(); toast.success('تم الحذف') }
    catch (e) { toast.error(e.message) }
  }
  const toggle = async (t) => {
    try { await api(`/service-types/${t.id}`, { method: 'PATCH', body: { active: !t.active } }); await load(); onChanged && onChanged() }
    catch (e) { toast.error(e.message) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Briefcase className="w-5 h-5 text-orange-600" /> إدارة أنواع الخدمات</DialogTitle>
          <DialogDescription>أضف/أخفِ أنواع الخدمات التي يقدمها مكتبك (فنادق، تصديقات، خدمات نقل، ...)</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="اسم نوع الخدمة الجديد" onKeyDown={e => e.key === 'Enter' && add()} />
          <Button onClick={add} disabled={saving} className="grad-gold text-white gap-1"><Plus className="w-4 h-4" /> إضافة</Button>
        </div>
        <div className="mt-3 max-h-72 overflow-y-auto border rounded-lg divide-y">
          {types.length === 0 && <div className="p-4 text-center text-slate-400 text-sm">لا توجد أنواع بعد</div>}
          {types.map(t => (
            <div key={t.id} className={`flex items-center justify-between p-2 ${t.active === false ? 'bg-slate-50 opacity-60' : ''}`}>
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-orange-500" />
                <span className="font-semibold">{t.name}</span>
                {t.active === false && <Badge variant="outline" className="text-xs">مخفي</Badge>}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => toggle(t)} className="text-xs">{t.active === false ? 'إظهار' : 'إخفاء'}</Button>
                <Button size="sm" variant="ghost" onClick={() => del(t.id)} className="text-rose-600"><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================================================================
// VOUCHER + PARTIES + BOXES + CHART + JOURNAL + REPORTS (same as v1)
// ================================================================
function VoucherScreen({ mode }) {
  const { settings, tenant } = useAuth()
  const cfg = mode === 'receipt'
    ? { title: 'سند قبض', subtitle: 'المستلم من العميل / المورد', icon: ArrowDownLeft, grad: 'grad-green', partyLabel: 'المستلم من', defaultParty: 'client' }
    : { title: 'سند صرف', subtitle: 'المدفوع إلى المورد / مصروفات', icon: ArrowUpRight, grad: 'grad-rose', partyLabel: 'المدفوع إلى', defaultParty: 'supplier' }
  const [vouchers, setVouchers] = useState([])
  const [clients, setClients] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [boxes, setBoxes] = useState([])
  const [open, setOpen] = useState(false)
  const [openSearch, setOpenSearch] = useState(false)
  const [filter, setFilter] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [editing, setEditing] = useState(null)
  const load = async () => {
    try {
      const [v, c, s, b] = await Promise.all([api(`/vouchers?type=${mode}`), api('/clients'), api('/suppliers'), api('/boxes')])
      setVouchers(v); setClients(c); setSuppliers(s); setBoxes(b)
    } catch (e) { toast.error(e.message) }
  }
  useEffect(() => { load(); setSelectedId(null); setFilter(null) }, [mode])
  const filtered = applyFilter(vouchers, filter)
  const selected = filtered.find(v => v.id === selectedId)
  const handleAdd = () => { setEditing(null); setOpen(true) }
  const handleEdit = () => { if (!selected) return toast.error('اختر سنداً أولاً'); setEditing(selected); setOpen(true) }
  const handleDelete = async () => {
    if (!selectedId) return
    if (!confirm('حذف هذا السند وعكس القيد المحاسبي؟')) return
    try { await api(`/vouchers/${selectedId}`, { method: 'DELETE' }); toast.success('تم الحذف'); setSelectedId(null); load() }
    catch (e) { toast.error(e.message) }
  }
  const handlePrintVoucher = () => {
    if (!selected) return toast.error('اختر سنداً أولاً')
    printVoucher({ kind: mode, record: selected, settings, tenant })
  }
  const handlePrintTable = () => {
    const totals = { amount: 0 }
    for (const r of filtered) { totals.amount += r.amount }
    printTable({
      title: `كشف ${cfg.title}`, settings, tenant, rows: filtered,
      columns: [
        { key: 'date', label: 'التاريخ', render: r => fmtDate(r.date) },
        { key: 'party_name', label: cfg.partyLabel },
        { key: 'description', label: 'البيان' },
        { key: 'method', label: 'الطريقة' },
        { key: 'box_name', label: 'الصندوق' },
        { key: 'currency', label: 'العملة' },
        { key: 'amount', label: 'المبلغ', align: 'left', render: r => fmt(r.amount, r.currency) },
      ],
      totals: { amount: totals.amount.toFixed(2) },
    })
  }
  return (
    <div className="space-y-4">
      <TopBar title={cfg.title} subtitle={cfg.subtitle} />
      <ActionToolbar
        addLabel={`${cfg.title} جديد`} onAdd={handleAdd} onRefresh={load} onSearch={() => setOpenSearch(true)}
        onEdit={handleEdit} onDelete={handleDelete} onPrintVoucher={handlePrintVoucher} onPrintTable={handlePrintTable}
        selectedId={selectedId} count={filtered.length}
      />
      {filter && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs">
          <Filter className="w-4 h-4 text-blue-600" /> فلتر: <b>{filter.field}</b> "<b>{filter.term}</b>"
          <Button size="sm" variant="ghost" onClick={() => setFilter(null)} className="mr-auto text-rose-600">مسح</Button>
        </div>
      )}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><cfg.icon className="w-5 h-5" /> سجل السندات ({filtered.length}{filter ? ` من ${vouchers.length}` : ''})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead className="w-8"></TableHead><TableHead>التاريخ</TableHead><TableHead>{cfg.partyLabel}</TableHead><TableHead>البيان</TableHead><TableHead>الطريقة</TableHead><TableHead>الصندوق</TableHead><TableHead>العملة</TableHead><TableHead className="text-left">المبلغ</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-8">لا توجد سندات</TableCell></TableRow>}
              {filtered.map(v => (
                <TableRow key={v.id} className={selectedId === v.id ? 'bg-blue-50' : 'cursor-pointer hover:bg-slate-50'} onClick={() => setSelectedId(v.id === selectedId ? null : v.id)}>
                  <TableCell><input type="radio" checked={selectedId === v.id} onChange={() => setSelectedId(v.id)} /></TableCell>
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
      <VoucherDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null) }} mode={mode} clients={clients} suppliers={suppliers} boxes={boxes} record={editing}
        onSaved={() => { load(); setEditing(null); toast.success(editing ? '✅ تم تعديل السند وعكس القيد تلقائياً' : 'تم حفظ السند') }} />
      <UniversalSearchModal open={openSearch} onOpenChange={setOpenSearch}
        fields={[
          { key: 'party_name', label: 'اسم الطرف' }, { key: 'description', label: 'البيان' },
          { key: 'amount', label: 'المبلغ' }, { key: 'currency', label: 'العملة' },
          { key: 'method', label: 'طريقة الدفع' },
        ]}
        onApply={setFilter} onClear={() => setFilter(null)}
      />
    </div>
  )
}

function VoucherDialog({ open, onOpenChange, mode, clients, suppliers, boxes, onSaved, record }) {
  const isEdit = !!record
  const defaultParty = mode === 'receipt' ? 'client' : 'supplier'
  const emptyForm = { date: todayISO(), currency: 'USD', amount: '', party_type: defaultParty, party_id: '', party_name: '', box_id: '', method: '', description: '' }
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    if (record) {
      setForm({
        date: record.date ? new Date(record.date).toISOString().slice(0,10) : todayISO(),
        currency: record.currency || 'USD',
        amount: record.amount ?? '',
        party_type: record.party_type || defaultParty,
        party_id: record.party_id || '', party_name: record.party_name || '',
        box_id: record.box_id || '', method: record.method || '', description: record.description || '',
      })
    } else {
      setForm({ ...emptyForm, party_type: defaultParty })
    }
  }, [open, record, mode])
  useEffect(() => { if (!isEdit) setForm(f => ({ ...f, party_type: defaultParty, party_id: '', party_name: '' })) }, [mode, defaultParty])
  useEffect(() => { if (boxes[0] && !form.box_id) setForm(f => ({ ...f, box_id: boxes[0].id })) }, [boxes])
  const list = form.party_type === 'client' ? clients : form.party_type === 'supplier' ? suppliers : []
  const submit = async () => {
    if (!form.amount) return toast.error('أدخل المبلغ')
    if (form.party_type !== 'expense' && !form.party_id) return toast.error('اختر الطرف')
    if (!form.box_id) return toast.error('اختر الصندوق')
    try {
      setSaving(true)
      if (isEdit) await api(`/vouchers/${record.id}`, { method: 'PUT', body: { type: mode, ...form } })
      else await api('/vouchers', { method: 'POST', body: { type: mode, ...form } })
      onOpenChange(false); setForm({ ...emptyForm, party_type: defaultParty, box_id: boxes[0]?.id || '' }); onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader><DialogTitle>{isEdit ? `✏️ تعديل ${mode === 'receipt' ? 'سند قبض' : 'سند صرف'}` : (mode === 'receipt' ? 'سند قبض جديد' : 'سند صرف جديد')}</DialogTitle>{isEdit && <DialogDescription>سيتم عكس القيد المحاسبي القديم وإعادة الترحيل بالقيم الجديدة تلقائياً</DialogDescription>}</DialogHeader>
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
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button><Button onClick={submit} disabled={saving} className={mode === 'receipt' ? 'grad-green text-white' : 'grad-rose text-white'}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEdit ? '💾 حفظ التعديل' : 'حفظ')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PartiesScreen({ kind }) {
  const cfg = kind === 'clients' ? { title: 'العملاء', icon: Users, grad: 'grad-purple' } : { title: 'الموردون والوكلاء', icon: Building2, grad: 'grad-gold' }
  const defaultParent = kind === 'clients' ? '1301' : '2101'
  const parentType = kind === 'clients' ? 'asset' : 'liability'
  const [rows, setRows] = useState([])
  const [accounts, setAccounts] = useState([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [q, setQ] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', whatsapp: '', address: '', email: '', notes: '', parent_code: defaultParent })
  const load = async () => { try { setRows(await api(`/${kind}`)) } catch (e) { toast.error(e.message) } }
  const loadAccounts = async () => { try { setAccounts(await api('/accounts')) } catch (_) {} }
  useEffect(() => { load(); loadAccounts() }, [kind])
  useEffect(() => {
    if (!open) return
    if (editing) setForm({ name: editing.name || '', phone: editing.phone || '', whatsapp: editing.whatsapp || editing.phone || '', address: editing.address || '', email: editing.email || '', notes: editing.notes || '', parent_code: editing.parent_code || defaultParent })
    else setForm({ name: '', phone: '', whatsapp: '', address: '', email: '', notes: '', parent_code: defaultParent })
  }, [open, editing])
  const save = async () => {
    if (!form.name) return toast.error('الاسم مطلوب')
    try {
      if (editing) await api(`/${kind}/${editing.id}`, { method: 'PUT', body: form })
      else await api(`/${kind}`, { method: 'POST', body: form })
      setOpen(false); setEditing(null); load(); toast.success(editing ? 'تم التعديل' : 'تمت الإضافة')
    } catch (e) { toast.error(e.message) }
  }
  const del = async (r) => {
    if (!confirm(`حذف ${r.name}؟`)) return
    try { await api(`/${kind}/${r.id}`, { method: 'DELETE' }); load(); toast.success('تم الحذف') }
    catch (e) { toast.error(e.message) }
  }
  const filtered = rows.filter(r => !q || r.name.includes(q) || (r.phone || '').includes(q))
  // Eligible parents: accounts of matching type (asset for clients, liability for suppliers) that are groups
  const parentOptions = accounts.filter(a => a.type === parentType && a.is_group)
  return (
    <div className="space-y-6">
      <TopBar title={cfg.title} subtitle={`إجمالي: ${rows.length}`}
        right={<div className="flex items-center gap-2"><div className="relative"><Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input placeholder="بحث..." value={q} onChange={e => setQ(e.target.value)} className="pr-9 w-64" /></div><Button onClick={() => { setEditing(null); setOpen(true) }} className={`gap-2 ${cfg.grad} text-white`}><Plus className="w-4 h-4" /> إضافة</Button></div>} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(r => (
          <Card key={r.id} className="overflow-hidden hover:shadow-md transition-shadow">
            <div className={`h-1 ${cfg.grad}`} />
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-bold text-slate-800">{r.name}</div>
                  {r.phone && <div className="text-xs text-slate-500 flex items-center gap-1" dir="ltr">📞 {r.phone}</div>}
                  {r.address && <div className="text-xs text-slate-500 truncate">📍 {r.address}</div>}
                  {r.email && <div className="text-xs text-slate-500 truncate" dir="ltr">✉️ {r.email}</div>}
                </div>
                <div className={`w-10 h-10 rounded-lg ${cfg.grad} flex items-center justify-center`}><cfg.icon className="w-5 h-5 text-white" /></div>
              </div>
              <div className="flex items-center gap-1 mt-2 flex-wrap">
                <WaBtn phone={r.whatsapp || r.phone} message={`السلام عليكم ${r.name}،`} size="xs" iconOnly={false} label="واتساب" />
                <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setOpen(true) }} className="h-6 px-2 text-xs gap-1"><Pencil className="w-3 h-3" /> تعديل</Button>
                <Button size="sm" variant="ghost" onClick={() => del(r)} className="h-6 px-2 text-xs text-rose-600 gap-1"><Trash2 className="w-3 h-3" /> حذف</Button>
              </div>
              <Separator className="my-3" />
              <div className="space-y-1">{CURRENCIES.map(c => { const bal = r.balances?.[c] || 0; return <div key={c} className="flex items-center justify-between text-sm"><span className="text-xs text-slate-500">{c}</span><span className={`font-bold ${bal > 0 ? 'text-emerald-600' : bal < 0 ? 'text-rose-600' : 'text-slate-400'}`}>{fmt(bal, c)}</span></div> })}</div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <div className="col-span-full text-center text-slate-400 py-10">لا توجد بيانات</div>}
      </div>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null) }}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? `تعديل ${kind === 'clients' ? 'عميل' : 'مورد'}` : `إضافة ${kind === 'clients' ? 'عميل' : 'مورد'}`}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2"><Field label="الاسم" required><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field></div>
            <Field label="📞 رقم الهاتف"><Input dir="ltr" value={form.phone} onChange={e => {
              const v = e.target.value; setForm(f => ({ ...f, phone: v, whatsapp: f.whatsapp || v }))
            }} placeholder="777xxxxxxx" /></Field>
            <Field label="📱 رقم واتساب"><Input dir="ltr" value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} placeholder="اختياري — يستخدم الهاتف افتراضياً" /></Field>
            <div className="md:col-span-2"><Field label="📍 العنوان"><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="المدينة، الحي، الشارع..." /></Field></div>
            <div className="md:col-span-2"><Field label="✉️ البريد الإلكتروني"><Input dir="ltr" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field></div>
            <div className="md:col-span-2">
              <Field label={`🌲 الحساب الأب (شجرة الحسابات)`}>
                <Select value={form.parent_code} onValueChange={(v) => setForm({ ...form, parent_code: v })}>
                  <SelectTrigger><SelectValue placeholder="اختر الحساب الأب" /></SelectTrigger>
                  <SelectContent>
                    {parentOptions.map(a => (
                      <SelectItem key={a.code} value={a.code}>
                        {a.code} — {a.name_ar}{a.code === defaultParent ? ' ⭐ افتراضي' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="text-xs text-slate-500 mt-1">سيندرج {kind === 'clients' ? 'العميل' : 'المورد'} كحساب فرعي تحت هذا الأب في شجرة الحسابات.</div>
            </div>
            <div className="md:col-span-2"><Field label="ملاحظات"><Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={save} className={`${cfg.grad} text-white`}>{editing ? '💾 حفظ التعديل' : 'حفظ'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BoxesScreen() {
  const [rows, setRows] = useState([]); const [accounts, setAccounts] = useState([]); const [open, setOpen] = useState(false)
  const [name, setName] = useState(''); const [type, setType] = useState('cash')
  const [parentCode, setParentCode] = useState('1101')
  const load = async () => { try { setRows(await api('/boxes')) } catch (e) { toast.error(e.message) } }
  const loadAccounts = async () => { try { setAccounts(await api('/accounts')) } catch (_) {} }
  useEffect(() => { load(); loadAccounts() }, [])
  // Update default parent when type changes
  useEffect(() => { setParentCode(type === 'cash' ? '1101' : '1201') }, [type])
  const save = async () => { if (!name) return toast.error('الاسم مطلوب'); try { await api('/boxes', { method: 'POST', body: { name_ar: name, type, parent_code: parentCode } }); setName(''); setOpen(false); load() } catch (e) { toast.error(e.message) } }
  const defaultParent = type === 'cash' ? '1101' : '1201'
  // Eligible parents for boxes/banks: asset accounts that are groups
  const parentOptions = accounts.filter(a => a.type === 'asset' && a.is_group)
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
                <div><div className="font-bold text-slate-800">{b.name_ar}</div><div className="text-xs text-slate-500">{b.type === 'cash' ? 'صندوق نقدي' : 'حساب بنكي'} {b.parent_code && <span className="ml-1 font-mono text-[10px] text-slate-400">· {b.parent_code}</span>}</div></div>
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
          <div className="space-y-3">
            <Field label="الاسم" required><Input value={name} onChange={e => setName(e.target.value)} /></Field>
            <Field label="النوع">
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">صندوق نقدي</SelectItem>
                  <SelectItem value="bank">بنك</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="🌲 الحساب الأب (شجرة الحسابات)">
              <Select value={parentCode} onValueChange={setParentCode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {parentOptions.map(a => (
                    <SelectItem key={a.code} value={a.code}>
                      {a.code} — {a.name_ar}{a.code === defaultParent ? ' ⭐ افتراضي' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-slate-500 mt-1">افتراضي: {type === 'cash' ? 'الصناديق (1101)' : 'الحسابات البنكية (1201)'} — يمكن تغييره.</div>
            </Field>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={save} className="grad-gold text-white">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ChartScreen() {
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ code: '', name_ar: '', type: 'asset', parent: '', is_group: false, notes: '' })
  const load = () => api('/accounts').then(setRows).catch(e => toast.error(e.message))
  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!open) return
    if (editing) setForm({ code: editing.code || '', name_ar: editing.name_ar || '', type: editing.type || 'asset', parent: editing.parent || '', is_group: !!editing.is_group, notes: editing.notes || '' })
    else setForm({ code: '', name_ar: '', type: 'asset', parent: '', is_group: false, notes: '' })
  }, [open, editing])
  const save = async () => {
    if (!form.code || !form.name_ar) return toast.error('الرمز والاسم مطلوبان')
    try {
      if (editing) await api(`/accounts/${editing.id}`, { method: 'PUT', body: { name_ar: form.name_ar, type: form.type, parent: form.parent || null, is_group: form.is_group, notes: form.notes } })
      else await api('/accounts', { method: 'POST', body: form })
      setOpen(false); setEditing(null); load(); toast.success(editing ? 'تم التعديل' : 'تمت الإضافة')
    } catch (e) { toast.error(e.message) }
  }
  const del = async (a) => {
    if (!confirm(`حذف الحساب ${a.code} — ${a.name_ar}؟`)) return
    try { await api(`/accounts/${a.id}`, { method: 'DELETE' }); load(); toast.success('تم الحذف') }
    catch (e) { toast.error(e.message) }
  }
  const byType = { asset: rows.filter(r => r.type === 'asset'), liability: rows.filter(r => r.type === 'liability'), revenue: rows.filter(r => r.type === 'revenue'), expense: rows.filter(r => r.type === 'expense') }
  const typeLabel = { asset: 'الأصول', liability: 'الخصوم', revenue: 'الإيرادات', expense: 'المصروفات' }
  const typeGrad = { asset: 'grad-brand', liability: 'grad-rose', revenue: 'grad-green', expense: 'grad-gold' }
  // Build a tree: group by parent code
  const eligibleParents = rows.filter(r => r.type === form.type)
  const buildTree = (list) => {
    const map = new Map(); list.forEach(a => map.set(a.code, { ...a, children: [] }))
    const roots = []
    for (const a of list) {
      if (a.parent && map.has(a.parent)) map.get(a.parent).children.push(map.get(a.code))
      else roots.push(map.get(a.code))
    }
    return roots
  }
  const renderNode = (node, depth = 0) => (
    <div key={node.id}>
      <div className={`flex items-center justify-between p-2 rounded-md ${node.is_group ? 'bg-slate-50 font-semibold' : ''}`} style={{ paddingRight: `${8 + depth * 20}px` }}>
        <div className="flex items-center gap-2">
          {depth > 0 && <span className="text-slate-300">↳</span>}
          <span className="font-mono text-xs text-slate-500">{node.code}</span>
          <span className="text-sm">{node.name_ar}</span>
          {node.is_group && <Badge variant="outline" className="text-xs">مجموعة</Badge>}
        </div>
        <div className="flex items-center gap-1 opacity-60 hover:opacity-100">
          <Button size="sm" variant="ghost" onClick={() => { setEditing(node); setOpen(true) }} className="h-6 w-6 p-0"><Pencil className="w-3 h-3" /></Button>
          <Button size="sm" variant="ghost" onClick={() => del(node)} className="h-6 w-6 p-0 text-rose-600"><Trash2 className="w-3 h-3" /></Button>
        </div>
      </div>
      {node.children?.map(c => renderNode(c, depth + 1))}
    </div>
  )
  return (
    <div className="space-y-6">
      <TopBar title="الدليل المحاسبي" subtitle="شجرة الحسابات الرئيسية والفرعية — يدعم الحسابات المجمعة (parent/child)"
        right={<Button onClick={() => { setEditing(null); setOpen(true) }} className="gap-2 grad-brand text-white"><Plus className="w-4 h-4" /> حساب جديد</Button>} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(byType).map(([t, list]) => (
          <Card key={t}>
            <CardHeader><CardTitle className="flex items-center gap-2"><div className={`w-8 h-8 rounded-md ${typeGrad[t]}`} /> {typeLabel[t]} <Badge variant="outline">{list.length}</Badge></CardTitle></CardHeader>
            <CardContent><div className="space-y-1">
              {list.length === 0 && <div className="text-xs text-slate-400 text-center py-4">لا توجد حسابات — أضف حساباً جديداً</div>}
              {buildTree(list).map(n => renderNode(n))}
            </div></CardContent>
          </Card>
        ))}
      </div>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null) }}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `تعديل حساب: ${editing.code}` : 'إضافة حساب جديد إلى الدليل المحاسبي'}</DialogTitle>
            <DialogDescription>اختر النوع أولاً، ثم اختر الحساب الأب لبناء التسلسل الهرمي</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="نوع الحساب" required>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v, parent: '' })} disabled={!!editing}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="asset">الأصول (Assets)</SelectItem>
                  <SelectItem value="liability">الخصوم (Liabilities)</SelectItem>
                  <SelectItem value="revenue">الإيرادات (Revenue)</SelectItem>
                  <SelectItem value="expense">المصروفات (Expenses)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="رمز الحساب" required>
              <Input dir="ltr" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.replace(/[^0-9]/g,'') })} disabled={!!editing} placeholder="مثال: 1102" />
            </Field>
            <div className="md:col-span-2"><Field label="اسم الحساب (عربي)" required>
              <Input value={form.name_ar} onChange={e => setForm({ ...form, name_ar: e.target.value })} placeholder="مثال: صندوق فرع عدن" />
            </Field></div>
            <div className="md:col-span-2"><Field label="الحساب الأب (اختياري)">
              <Select value={form.parent || 'none'} onValueChange={v => setForm({ ...form, parent: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="بدون (حساب رئيسي)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— لا يوجد أب (حساب رئيسي) —</SelectItem>
                  {eligibleParents.map(p => (
                    <SelectItem key={p.id} value={p.code}>
                      {'   '.repeat(Math.max(0, (p.code?.length || 1) - 1))} {p.code} — {p.name_ar}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field></div>
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer p-2 bg-slate-50 rounded-md border">
                <input type="checkbox" checked={form.is_group} onChange={e => setForm({ ...form, is_group: e.target.checked })} />
                <span className="text-sm font-semibold">حساب مجموعة (Group) — لا يُقيَّد عليه مباشرة، فقط يجمع الحسابات الفرعية</span>
              </label>
            </div>
            <div className="md:col-span-2"><Field label="ملاحظات"><Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={save} className="grad-brand text-white">{editing ? '💾 حفظ التعديل' : 'إضافة'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function JournalScreen() {
  const { settings, tenant } = useAuth()
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [editing, setEditing] = useState(null)
  const load = () => api('/journal-entries').then(setRows).catch(e => toast.error(e.message))
  useEffect(() => { load() }, [])
  const selected = rows.find(je => je.id === selectedId)
  const isEditableJe = selected && (selected.ref_type === 'manual' || selected.ref_type === 'manual_dual')
  const handleAdd = () => { setEditing(null); setOpen(true) }
  const handleEdit = () => {
    if (!selected) return toast.error('اختر قيداً أولاً')
    if (!isEditableJe) return toast.error('لا يمكن تعديل قيود المعاملات مباشرةً — عدّل السجل الأصلي (تذكرة/تأشيرة/سند...)')
    setEditing(selected); setOpen(true)
  }
  const handleDelete = async () => {
    if (!selected) return
    if (!isEditableJe) return toast.error('لا يمكن حذف قيد معاملة مباشرةً — احذف السجل الأصلي')
    if (!confirm('حذف هذا القيد اليدوي؟')) return
    try {
      // Reverse effects then delete via generic route (backend keeps this clean for manual JEs only)
      // Simplest: We call DELETE on /journal-entries/:id (needs backend support) — for now, disallow via toast
      toast.error('حذف القيود اليدوية غير مدعوم بعد — عدّل بدلاً من ذلك')
    } catch (e) { toast.error(e.message) }
  }
  const handlePrintTable = () => {
    // Flatten JE lines for printing
    const flat = []
    for (const je of rows) {
      for (const l of je.lines || []) {
        flat.push({
          date: je.date, description: je.description, ref_type: je.ref_type,
          account: `${l.account_code} — ${l.account_name}`,
          party: l.party_name || '—',
          currency: l.currency || je.currency,
          debit: l.debit || 0, credit: l.credit || 0,
        })
      }
    }
    const totals = flat.reduce((a, r) => ({ debit: a.debit + r.debit, credit: a.credit + r.credit }), { debit: 0, credit: 0 })
    printTable({
      title: 'كشف قيود اليومية', settings, tenant, rows: flat,
      columns: [
        { key: 'date', label: 'التاريخ', render: r => fmtDate(r.date) },
        { key: 'ref_type', label: 'النوع' },
        { key: 'description', label: 'البيان' },
        { key: 'account', label: 'الحساب' },
        { key: 'party', label: 'الطرف' },
        { key: 'currency', label: 'العملة' },
        { key: 'debit', label: 'مدين', align: 'left', render: r => r.debit ? fmt(r.debit, r.currency) : '—' },
        { key: 'credit', label: 'دائن', align: 'left', render: r => r.credit ? fmt(r.credit, r.currency) : '—' },
      ],
      totals: { debit: totals.debit.toFixed(2), credit: totals.credit.toFixed(2) },
    })
  }
  return (
    <div className="space-y-4">
      <TopBar title="قيود اليومية" subtitle="جميع القيود المحاسبية التلقائية واليدوية" />
      <ActionToolbar
        addLabel="إضافة قيد يومي" onAdd={handleAdd} onRefresh={load}
        onEdit={handleEdit} onDelete={handleDelete} onPrintTable={handlePrintTable}
        selectedId={selectedId} count={rows.length}
      />
      <div className="space-y-3">
        {rows.map(je => {
          const totalDebit = (je.lines || []).reduce((s, l) => s + (l.debit || 0), 0)
          const isMulti = je.currency === 'MULTI'
          const isSelected = selectedId === je.id
          const editable = je.ref_type === 'manual' || je.ref_type === 'manual_dual'
          return (
            <Card key={je.id} className={`overflow-hidden cursor-pointer ${isSelected ? 'ring-2 ring-blue-500' : ''}`} onClick={() => setSelectedId(je.id === selectedId ? null : je.id)}>
              <CardHeader className="pb-2 bg-slate-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input type="radio" checked={isSelected} onChange={() => setSelectedId(je.id)} onClick={e => e.stopPropagation()} />
                    <div>
                      <div className="text-sm font-bold text-slate-800">{je.description}</div>
                      <div className="text-xs text-slate-500">{fmtDate(je.date)} • {je.ref_type} • {isMulti ? 'متعدد العملات' : je.currency}{editable && <Badge variant="outline" className="mr-2 text-emerald-600 border-emerald-300">قابل للتعديل</Badge>}</div>
                    </div>
                  </div>
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
      <ManualJournalDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null) }} record={editing} onSaved={() => { load(); setEditing(null) }} />
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
        <Table><TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>النوع</TableHead><TableHead>مرجع</TableHead><TableHead>حساب القبض</TableHead><TableHead>المورد</TableHead><TableHead>عملة</TableHead><TableHead className="text-left">تكلفة</TableHead><TableHead className="text-left">بيع</TableHead><TableHead className="text-left">ربح</TableHead></TableRow></TableHeader>
          <TableBody>{data.rows.map(r => (<TableRow key={r.id}><TableCell className="text-xs">{fmtDate(r.date)}</TableCell><TableCell><Badge variant="outline">{r.kind}</Badge></TableCell><TableCell className="font-mono text-xs">{r.ref || '—'}</TableCell><TableCell>{r.client}</TableCell><TableCell>{r.supplier}</TableCell><TableCell>{r.currency}</TableCell><TableCell className="text-left">{fmt(r.cost, r.currency)}</TableCell><TableCell className="text-left">{fmt(r.sale, r.currency)}</TableCell><TableCell className="text-left font-bold text-emerald-600">{fmt(r.profit, r.currency)}</TableCell></TableRow>))}</TableBody>
        </Table>
      </>)}
    </CardContent></Card>
  )
}

function StatementReport() {
  const { tenant, settings } = useAuth()
  const [bulkOpen, setBulkOpen] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [id, setId] = useState('')
  const [data, setData] = useState(null)
  const [q, setQ] = useState('')
  const [currencyMode, setCurrencyMode] = useState('all_detail')
  const [period, setPeriod] = useState('all')
  const [day, setDay] = useState(todayISO())
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
  const [to, setTo] = useState(todayISO())
  useEffect(() => { api('/accounts/all').then(setAccounts).catch(() => {}) }, [])
  const selected = accounts.find(a => a.id === id)
  const list = accounts.filter(x => !q || x.name.includes(q) || (x.code || '').includes(q))
  const load = async () => {
    if (!selected) return
    const p = new URLSearchParams({ party_type: selected.kind, party_id: selected.id, currency_mode: currencyMode, period })
    if (period === 'day') p.set('day', day)
    if (period === 'month') p.set('month', month)
    if (period === 'range' || period === 'up_to_date') { p.set('from', from); p.set('to', to) }
    try { setData(await api(`/reports/statement?${p}`)) } catch (e) { toast.error(e.message) }
  }
  useEffect(() => { load() }, [id, currencyMode, period, day, month, from, to])

  // v3.3 — Human-readable period text
  const periodLabel = () => {
    if (period === 'all') return 'كل الفترات (منذ البداية)'
    if (period === 'day') return `يوم ${fmtDate(day)}`
    if (period === 'month') return `شهر ${month}`
    if (period === 'range') return `من ${fmtDate(from)} إلى ${fmtDate(to)}`
    if (period === 'up_to_date') return `حتى ${fmtDate(to)}`
    return ''
  }

  // v3.3 — Print a professional statement of account
  const handlePrint = () => {
    if (!data || !data.party) return toast.error('اختر حساباً وحمّل الكشف أولاً')
    const p = data.party
    const rowsHtml = (data.rows || []).map(r => `
      <tr>
        <td>${fmtDate(r.date)}</td>
        <td style="font-size:11px;">${escHtml(r.description)}</td>
        <td><span style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:10px;">${escHtml(r.ref_type || '')}</span></td>
        <td><b>${r.currency}</b></td>
        <td style="text-align:left; color:#1e40af; font-weight:600;">${r.debit ? fmt(r.debit, r.currency) : '—'}</td>
        <td style="text-align:left; color:#b91c1c; font-weight:600;">${r.credit ? fmt(r.credit, r.currency) : '—'}</td>
        <td style="text-align:left; font-weight:800; color:${r.balance >= 0 ? '#059669' : '#dc2626'};">${fmt(r.balance, r.currency)}</td>
      </tr>
    `).join('')
    const summaryHtml = (data.summary && data.summary.length > 0) ? data.summary.map(s => `
      <tr>
        <td><b>${s.currency}</b></td>
        <td style="text-align:left; color:#1e40af;">${fmt(s.total_debit, s.currency)}</td>
        <td style="text-align:left; color:#b91c1c;">${fmt(s.total_credit, s.currency)}</td>
        <td style="text-align:left; font-weight:900; color:${s.balance >= 0 ? '#059669' : '#dc2626'}; font-size:14px;">${fmt(s.balance, s.currency)}</td>
      </tr>
    `).join('') : CURRENCIES.map(c => {
      const bal = p.balances?.[c] || 0
      return `<tr><td><b>${c}</b></td><td>—</td><td>—</td><td style="text-align:left; font-weight:900; color:${bal >= 0 ? '#059669' : '#dc2626'};">${fmt(bal, c)}</td></tr>`
    }).join('')

    const off = tenant?.name || 'مكتب رحّال'
    const offPhone = tenant?.phone || settings?.phone || ''
    const offAddr = settings?.address || ''
    const partyPhone = p.phone || ''
    const partyAddr = p.address || ''

    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>كشف حساب — ${escHtml(p.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Tahoma','Segoe UI',sans-serif; background:#f8fafc; margin:0; padding:24px; color:#0f172a; }
  .doc { max-width: 820px; margin: 0 auto; background:#fff; border-radius:14px; box-shadow: 0 10px 30px rgba(0,0,0,0.06); padding:0; overflow:hidden; }
  .hdr { background: linear-gradient(135deg,#1e3a8a 0%,#3b82f6 60%,#f97316 100%); color:#fff; padding:22px 28px; display:flex; justify-content:space-between; align-items:center; }
  .hdr h1 { margin:0; font-size:22px; font-weight:900; letter-spacing:0.5px; }
  .hdr .off { text-align:left; }
  .hdr .off .n { font-size:16px; font-weight:800; }
  .hdr .off .p { font-size:12px; opacity:0.92; margin-top:2px; }
  .band { background: #eff6ff; border-bottom:2px solid #dbeafe; padding:14px 28px; display:flex; justify-content:space-between; align-items:center; font-size:12px; }
  .band .k { color:#475569; }
  .band .v { color:#0f172a; font-weight:800; }
  .party { padding:18px 28px; background:#fff; border-bottom:1px solid #e2e8f0; }
  .party h2 { margin:0 0 6px 0; font-size:18px; color:#1e3a8a; }
  .party .meta { display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:#475569; margin-top:6px; }
  .party .meta span { padding:4px 10px; background:#f1f5f9; border-radius:8px; }
  .sec { padding:14px 28px; }
  .sec h3 { margin:0 0 10px 0; font-size:14px; color:#1e3a8a; border-right:4px solid #f97316; padding-right:8px; }
  table { width:100%; border-collapse: collapse; font-size:12px; }
  thead th { background:#1e3a8a; color:#fff; padding:8px 6px; text-align:right; font-weight:700; font-size:11px; }
  tbody td { padding:6px 6px; border-bottom:1px solid #e2e8f0; }
  tbody tr:nth-child(even) { background:#fafafa; }
  .totals { margin-top:10px; }
  .totals table thead th { background:#1e40af; }
  .totals table tbody td { padding:10px 8px; font-size:13px; background:#f8fafc; border-bottom:2px solid #e2e8f0; }
  .foot { padding:16px 28px 24px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:end; font-size:11px; color:#64748b; }
  .sig { text-align:center; }
  .sig .l { border-top: 1px dashed #94a3b8; padding-top:4px; width:180px; margin-top:24px; }
  .actions { text-align:center; margin-top: 16px; padding-bottom:10px; }
  .actions button { border:none; padding: 10px 18px; margin: 0 4px; border-radius:8px; font-weight:800; cursor:pointer; font-size:12px; }
  .actions .prn { background:#1e3a8a; color:#fff; }
  .actions .cls { background:#e2e8f0; color:#475569; }
  @media print { body { background:#fff; padding:0; } .doc { box-shadow:none; border-radius:0; } .actions { display:none; } }
</style>
</head><body>
<div class="doc">
  <div class="hdr">
    <h1>📊 كشف حساب</h1>
    <div class="off"><div class="n">${escHtml(off)}</div><div class="p">${escHtml(offPhone)}${offAddr ? ' • ' + escHtml(offAddr) : ''}</div></div>
  </div>
  <div class="band">
    <div><span class="k">الفترة:</span> <span class="v">${escHtml(periodLabel())}</span></div>
    <div><span class="k">تاريخ الطباعة:</span> <span class="v">${fmtDate(new Date())}</span></div>
    <div><span class="k">عدد الحركات:</span> <span class="v">${(data.rows || []).length}</span></div>
  </div>
  <div class="party">
    <h2>${escHtml(p.name)}</h2>
    <div class="meta">
      ${partyPhone ? `<span>📞 ${escHtml(partyPhone)}</span>` : ''}
      ${partyAddr ? `<span>📍 ${escHtml(partyAddr)}</span>` : ''}
      <span>نوع الحساب: <b>${escHtml({client:'عميل', supplier:'مورد', box:'صندوق/بنك', account:'حساب دفتري'}[selected?.kind] || '—')}</b></span>
    </div>
  </div>
  <div class="sec">
    <h3>💼 ملخص الأرصدة النهائية بحسب العملة</h3>
    <div class="totals">
      <table>
        <thead><tr><th>العملة</th><th style="text-align:left;">إجمالي مدين</th><th style="text-align:left;">إجمالي دائن</th><th style="text-align:left;">الرصيد النهائي</th></tr></thead>
        <tbody>${summaryHtml}</tbody>
      </table>
    </div>
  </div>
  <div class="sec">
    <h3>📋 تفصيل الحركات (الرصيد التراكمي بجانب كل حركة)</h3>
    <table>
      <thead><tr><th>التاريخ</th><th>البيان</th><th>المرجع</th><th>العملة</th><th style="text-align:left;">مدين</th><th style="text-align:left;">دائن</th><th style="text-align:left;">الرصيد التراكمي</th></tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:20px;">لا توجد حركات في هذه الفترة</td></tr>'}</tbody>
    </table>
  </div>
  <div class="foot">
    <div>
      <div>هذا الكشف صادر إلكترونياً من نظام رحّال — Rahaal ERP</div>
      <div style="margin-top:2px;">يعتمد الرصيد النهائي على القيود المحاسبية المرحّلة حتى تاريخ الطباعة.</div>
    </div>
    <div class="sig">توقيع المحاسب <div class="l"></div></div>
  </div>
</div>
<div class="actions">
  <button class="prn" onclick="window.print()">🖨️ طباعة</button>
  <button class="cls" onclick="window.close()">إغلاق</button>
</div>
</body></html>`
    const w = window.open('', '_blank', 'width=900,height=1000')
    if (!w) return toast.error('السماح بالنوافذ المنبثقة مطلوب للطباعة')
    w.document.open(); w.document.write(html); w.document.close(); w.focus()
    setTimeout(() => { try { w.print() } catch(e){} }, 400)
  }

  // v3.3 — Share statement summary via WhatsApp (formatted text)
  const handleWhatsAppShare = () => {
    if (!data || !data.party) return toast.error('اختر حساباً وحمّل الكشف أولاً')
    const p = data.party
    if (!p.phone && !p.whatsapp) return toast.error('العميل لا يمتلك رقم هاتف مسجل — أضف الرقم أولاً في شاشة العملاء')
    const off = tenant?.name || 'مكتب رحّال'
    const balances = (data.summary && data.summary.length > 0)
      ? data.summary.map(s => `• ${s.currency}: ${fmt(s.balance, s.currency)} ${s.balance >= 0 ? '(لكم)' : '(علينا)'}`).join('\n')
      : CURRENCIES.map(c => { const b = p.balances?.[c] || 0; return b !== 0 ? `• ${c}: ${fmt(b, c)} ${b >= 0 ? '(لكم)' : '(علينا)'}` : null }).filter(Boolean).join('\n') || '• لا توجد أرصدة'
    const lastRows = (data.rows || []).slice(-5).reverse()
    const lastText = lastRows.length > 0
      ? '\n\n📋 آخر ' + Math.min(5, lastRows.length) + ' حركات:\n' + lastRows.map(r => {
          const dc = r.debit > 0 ? `مدين ${fmt(r.debit, r.currency)}` : `دائن ${fmt(r.credit, r.currency)}`
          return `• ${fmtDate(r.date)} — ${r.description?.slice(0,40) || ''} (${dc})`
        }).join('\n')
      : ''
    const msg = `عزيزنا العميل ${p.name}،\n\n📊 هذا ملخص كشف حسابكم لدى ${off}\n📅 الفترة: ${periodLabel()}\n\n💰 الأرصدة الحالية:\n${balances}${lastText}\n\n📞 للاستفسار عن أي حركة تواصل معنا مباشرة.\nشكراً لثقتكم بنا 🌹`
    openWhatsApp(p.whatsapp || p.phone, msg)
  }

  return (
    <Card><CardContent className="p-4 space-y-4">
      <div className="flex items-center gap-2 mb-2 p-2 bg-gradient-to-l from-emerald-50 to-blue-50 border border-emerald-200 rounded-lg">
        <span className="text-sm font-bold text-emerald-800">📢 v3.5 جديد:</span>
        <span className="text-xs text-slate-600">أرسل ملخص كشف الحساب لجميع العملاء ذوي الأرصدة بضغطة واحدة</span>
        <Button size="sm" onClick={() => setBulkOpen(true)} className="mr-auto bg-[#25D366] hover:bg-[#128C7E] text-white gap-1 h-8">
          <span>📤</span> إرسال جماعي عبر واتساب
        </Button>
      </div>
      <BulkStatementDialog open={bulkOpen} onOpenChange={setBulkOpen} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg">
        <Field label="بحث بالاسم / الرمز"><Input value={q} onChange={e => setQ(e.target.value)} placeholder="اكتب اسم أو رمز الحساب..." /></Field>
        <div className="md:col-span-2">
          <Field label="اختر الحساب (كافة أنواع الحسابات)">
            <Select value={id} onValueChange={setId}>
              <SelectTrigger><SelectValue placeholder={`— اختر من ${accounts.length} حساب —`} /></SelectTrigger>
              <SelectContent>
                {list.map(x => (
                  <SelectItem key={`${x.kind}-${x.id}`} value={x.id}>
                    <span className="inline-flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{x.group}</Badge>
                      <span className="font-mono text-xs text-slate-500">{x.code}</span>
                      <span>{x.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card><CardContent className="p-3">
          <div className="text-xs font-bold text-slate-600 mb-2">عرض العملات</div>
          <div className="flex flex-wrap gap-1">
            {[{v:'all_summary',l:'كافة العملات (إجمالي)'},{v:'all_detail',l:'كافة العملات (تفصيلي)'},{v:'YER',l:'ريال يمني'},{v:'SAR',l:'ريال سعودي'},{v:'USD',l:'دولار'}].map(o => (
              <button key={o.v} onClick={() => setCurrencyMode(o.v)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${currencyMode === o.v ? 'bg-blue-500 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'}`}>{o.l}</button>
            ))}
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-xs font-bold text-slate-600 mb-2">النطاق الزمني</div>
          <div className="flex flex-wrap gap-1 mb-2">
            {[{v:'all',l:'كل الفترات'},{v:'up_to_date',l:'حتى تاريخ'},{v:'day',l:'خلال يوم'},{v:'month',l:'خلال شهر'},{v:'range',l:'من — إلى'}].map(o => (
              <button key={o.v} onClick={() => setPeriod(o.v)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${period === o.v ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-400'}`}>{o.l}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {period === 'day' && <Input type="date" value={day} onChange={e => setDay(e.target.value)} />}
            {period === 'month' && <Input type="month" value={month} onChange={e => setMonth(e.target.value)} />}
            {period === 'range' && <><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></>}
            {period === 'up_to_date' && <Input type="date" value={to} onChange={e => setTo(e.target.value)} />}
          </div>
        </CardContent></Card>
      </div>

      {data?.party && (
        <div className="p-3 rounded-lg bg-gradient-to-l from-blue-50 to-slate-50 border border-blue-100">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-lg font-bold text-slate-800">{data.party.name}</div>
              {data.party.phone && <div className="text-xs text-slate-500" dir="ltr">📞 {data.party.phone}</div>}
              {data.party.address && <div className="text-xs text-slate-500">📍 {data.party.address}</div>}
            </div>
            <div className="flex gap-2">
              {CURRENCIES.map(c => (
                <div key={c} className="text-center px-3 py-1.5 rounded-lg bg-white border">
                  <div className="text-[10px] text-slate-500">{c}</div>
                  <div className={`text-sm font-bold ${(data.party.balances?.[c] || 0) > 0 ? 'text-emerald-600' : (data.party.balances?.[c] || 0) < 0 ? 'text-rose-600' : 'text-slate-400'}`}>{fmt(data.party.balances?.[c] || 0, c)}</div>
                </div>
              ))}
            </div>
          </div>
          {/* v3.3 — Print + WhatsApp Share buttons */}
          <div className="flex gap-2 mt-3 pt-3 border-t border-blue-200">
            <Button onClick={handlePrint} className="grad-brand text-white gap-2 h-9">
              <Printer className="w-4 h-4" /> طباعة كشف الحساب
            </Button>
            {(selected?.kind === 'client' || selected?.kind === 'supplier') && (
              <WaBtn phone={data.party.whatsapp || data.party.phone} message={''} size="md" label="مشاركة الكشف عبر واتساب" />
            )}
            {(selected?.kind === 'client' || selected?.kind === 'supplier') && (
              <Button onClick={handleWhatsAppShare} className="bg-[#25D366] hover:bg-[#128C7E] text-white gap-2 h-9" title="إرسال ملخص كشف الحساب">
                📊 ملخص الرصيد + آخر 5 حركات
              </Button>
            )}
          </div>
        </div>
      )}

      {data && data.currency_mode === 'all_summary' && (
        <div>
          <div className="text-sm font-bold text-slate-700 mb-2">إجمالي كل العملات في الفترة المحددة</div>
          <Table>
            <TableHeader><TableRow><TableHead>العملة</TableHead><TableHead className="text-left">إجمالي مدين</TableHead><TableHead className="text-left">إجمالي دائن</TableHead><TableHead className="text-left">الرصيد</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data.summary || []).map(s => (
                <TableRow key={s.currency}>
                  <TableCell><Badge variant="outline" className="font-bold">{s.currency}</Badge></TableCell>
                  <TableCell className="text-left text-blue-700 font-bold">{fmt(s.total_debit, s.currency)}</TableCell>
                  <TableCell className="text-left text-rose-700 font-bold">{fmt(s.total_credit, s.currency)}</TableCell>
                  <TableCell className={`text-left font-extrabold ${s.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(s.balance, s.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data && data.currency_mode !== 'all_summary' && (
        <Table>
          <TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>البيان</TableHead><TableHead>مرجع</TableHead><TableHead>عملة</TableHead><TableHead className="text-left">مدين</TableHead><TableHead className="text-left">دائن</TableHead><TableHead className="text-left">الرصيد</TableHead></TableRow></TableHeader>
          <TableBody>
            {(data.rows || []).map((r, i) => (
              <TableRow key={i}>
                <TableCell className="text-xs">{fmtDate(r.date)}</TableCell>
                <TableCell className="text-xs">{r.description}</TableCell>
                <TableCell className="text-xs"><Badge variant="outline">{r.ref_type}</Badge></TableCell>
                <TableCell><Badge variant="secondary">{r.currency}</Badge></TableCell>
                <TableCell className="text-left text-blue-700">{r.debit ? fmt(r.debit, r.currency) : '—'}</TableCell>
                <TableCell className="text-left text-rose-700">{r.credit ? fmt(r.credit, r.currency) : '—'}</TableCell>
                <TableCell className={`text-left font-bold ${r.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(r.balance, r.currency)}</TableCell>
              </TableRow>
            ))}
            {(!data.rows || data.rows.length === 0) && <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-6">لا توجد حركات في هذا النطاق</TableCell></TableRow>}
          </TableBody>
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
          {(data.fx_gain_base ?? data.fx_gain_usd) !== undefined && (
            <Card className={`border-2 ${(data.fx_gain_base ?? data.fx_gain_usd) >= 0 ? 'border-emerald-200 bg-emerald-50/50' : 'border-rose-200 bg-rose-50/50'}`}>
              <CardContent className="p-4 flex items-center justify-between">
                <div><div className="text-sm font-bold text-slate-700">{(data.fx_gain_base ?? data.fx_gain_usd) >= 0 ? 'أرباح' : 'خسائر'} فروق العملات (المصارفة) — حساب 4104</div><div className="text-xs text-slate-500">بالريال اليمني</div></div>
                <div className={`text-2xl font-extrabold ${(data.fx_gain_base ?? data.fx_gain_usd) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(data.fx_gain_base ?? data.fx_gain_usd, 'YER')}</div>
              </CardContent>
            </Card>
          )}
          <div><div className="text-sm font-bold text-slate-700 mb-2">المصروفات</div>
            <Card><CardContent className="p-3">{CURRENCIES.map(c => <div key={c} className="text-sm flex justify-between"><span>{c}</span><span className="font-bold text-rose-600">{fmt(data.expenses[c], c)}</span></div>)}</CardContent></Card>
          </div>
          <Card className="grad-brand text-white"><CardContent className="p-4"><div className="text-xs opacity-80">صافي الربح (بالريال اليمني - العملة الأساسية)</div><div className="text-3xl font-extrabold">{fmt(data.net_profit_base ?? data.net_profit_usd, 'YER')}</div><div className="text-xs opacity-80 mt-2 grid grid-cols-2 gap-2"><div>إيرادات: {fmt(data.total_revenue_base ?? data.total_revenue_usd, 'YER')}</div><div>مصروفات: {fmt(data.total_expenses_base ?? data.total_expenses_usd, 'YER')}</div></div></CardContent></Card>
        </div>
      )}
    </CardContent></Card>
  )
}

// ================================================================
// OFFICE SETTINGS (White-Labeling)
// ================================================================
// v3.8 — Chrome Extension management tab (Personal Access Tokens + download)
function ExtensionTab() {
  const [tokens, setTokens] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newToken, setNewToken] = useState(null)
  const [creating, setCreating] = useState(false)
  const publicBase = typeof window !== 'undefined' ? window.location.origin : ''
  const load = () => api('/pats').then(setTokens).catch(e => toast.error(e.message)).finally(() => setLoading(false))
  useEffect(() => { load() }, [])
  const createToken = async () => {
    try {
      setCreating(true)
      const r = await api('/pats', { method: 'POST', body: { name: newName || 'إضافة المتصفح' } })
      setNewToken(r); setNewName(''); load()
    } catch (e) { toast.error(e.message) } finally { setCreating(false) }
  }
  const revokeToken = async (id) => {
    if (!confirm('إلغاء هذا الرمز نهائياً؟ الإضافة المرتبطة به لن تعمل بعد ذلك.')) return
    try { await api(`/pats/${id}`, { method: 'DELETE' }); toast.success('تم الإلغاء'); load() }
    catch (e) { toast.error(e.message) }
  }
  const copy = (text) => { navigator.clipboard.writeText(text); toast.success('📋 تم النسخ') }
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-0 shadow-md bg-gradient-to-l from-indigo-600 via-blue-600 to-cyan-600 text-white">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-white/15 flex items-center justify-center text-3xl">🕋</div>
              <div>
                <div className="text-xs uppercase tracking-wider opacity-90">Rahaal Scraper Extension</div>
                <div className="text-lg font-extrabold">قارئ رحّال الآلي للمتصفح</div>
                <div className="text-xs opacity-90 mt-1">يسحب بيانات التذاكر والتأشيرات تلقائياً من صفحات شركات الطيران والتأشيرات إلى نظام رحّال ERP بضغطة زر واحدة.</div>
              </div>
            </div>
            <a href="/rahal-extension.zip" download className="bg-white text-blue-700 hover:bg-blue-50 font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2 shrink-0">
              <Upload className="w-4 h-4 rotate-180" /> تحميل الإضافة (.zip)
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Key className="w-4 h-4" /> رموز الوصول (Personal Access Tokens)</CardTitle>
            <CardDescription className="mt-1">أنشئ رمزاً واحداً لكل جهاز/مستعرض تستخدم عليه الإضافة. الحد الأقصى: 5 رموز نشطة.</CardDescription>
          </div>
          <Button onClick={() => { setShowNew(true); setNewToken(null); setNewName('') }} className="grad-brand text-white gap-2 shrink-0"><Plus className="w-4 h-4" /> إنشاء رمز جديد</Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : tokens.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">لا توجد رموز — اضغط "إنشاء رمز جديد" للبدء</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>البادئة</TableHead>
                  <TableHead>تاريخ الإنشاء</TableHead>
                  <TableHead>آخر استخدام</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-left">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-semibold">{t.name}</TableCell>
                    <TableCell dir="ltr" className="font-mono text-xs">{t.prefix}…</TableCell>
                    <TableCell className="text-xs text-slate-500">{fmtDate(t.created_at)}</TableCell>
                    <TableCell className="text-xs text-slate-500">{t.last_used_at ? fmtDate(t.last_used_at) : '—'}</TableCell>
                    <TableCell>
                      {t.revoked_at ? (
                        <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">ملغى</Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">نشط</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-left">
                      {!t.revoked_at && (
                        <Button size="sm" variant="outline" onClick={() => revokeToken(t.id)} className="text-rose-600 border-rose-200 hover:bg-rose-50"><Trash2 className="w-3 h-3" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2">📖 دليل التثبيت السريع</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal pr-5 space-y-2 text-slate-700 leading-7">
            <li>حمّل الإضافة من الزر أعلاه <b>(rahal-extension.zip)</b> وفك الضغط في مجلد ثابت مثل <code className="bg-slate-100 px-1 rounded" dir="ltr">~/rahal-extension/</code>.</li>
            <li>افتح Chrome واذهب إلى <code className="bg-slate-100 px-1 rounded" dir="ltr">chrome://extensions/</code> ثم فعّل <b>Developer mode</b> أعلى اليمين.</li>
            <li>اضغط <b>Load unpacked</b> واختر المجلد المفكوك — ستظهر أيقونة الإضافة 🕋 في شريط الأدوات.</li>
            <li>هنا في رحّال: اضغط <b>"إنشاء رمز جديد"</b> أعلاه، انسخ الـ Token فوراً (لن يظهر مرة أخرى).</li>
            <li>افتح الإضافة والصق:
              <ul className="list-disc pr-5 mt-1 text-slate-600">
                <li>عنوان الخادم: <code className="bg-slate-100 px-1 rounded" dir="ltr">{publicBase}</code> <button onClick={() => copy(publicBase)} className="text-blue-600 text-xs mr-1">نسخ</button></li>
                <li>الرمز الشخصي: <code className="bg-slate-100 px-1 rounded" dir="ltr">rhl_pat_...</code></li>
              </ul>
            </li>
            <li>افتح صفحة تذكرة (يمنية / Fly Aden) أو تأشيرة (KSA e-Visa) → افتح الإضافة → <b>قراءة المستند من الصفحة</b> → <b>سحب إلى رحّال 🚀</b>.</li>
          </ol>
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900">
            💡 <b>الجديد v1.2:</b> الإضافة الآن تدعم قراءة ملفات PDF ومعاينة الطباعة! يكفي فتح صفحة الـ PDF والضغط "قراءة PDF". البوابات المدعومة: Yemenia · Fly Aden · KSA e-Visa (عمرة/زيارة/عمل) · البركة للنقل · الموافقات الأمنية (Ethiopia/Egypt).
          </div>
        </CardContent>
      </Card>

      {/* Create Token Dialog */}
      <Dialog open={showNew} onOpenChange={(v) => { setShowNew(v); if (!v) { setNewToken(null); setNewName('') } }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Key className="w-5 h-5 text-blue-600" /> {newToken ? 'الرمز الجديد' : 'إنشاء رمز شخصي جديد'}</DialogTitle>
          </DialogHeader>
          {!newToken ? (
            <>
              <div className="space-y-3">
                <Field label="اسم الرمز (لتذكر مكان استخدامه)">
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="لابتوب المكتب — Chrome" />
                </Field>
                <div className="text-xs text-slate-500">سيُعرض الرمز الكامل مرة واحدة فقط — انسخه فوراً.</div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setShowNew(false)}>إلغاء</Button>
                <Button onClick={createToken} disabled={creating} className="grad-brand text-white gap-2">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} إنشاء الرمز
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-900">
                  ✅ تم إنشاء الرمز بنجاح باسم <b>{newToken.name}</b>
                </div>
                <div className="bg-slate-900 text-white rounded-lg p-3 font-mono text-xs break-all" dir="ltr">
                  {newToken.token}
                </div>
                <Button onClick={() => copy(newToken.token)} className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                  📋 نسخ الرمز إلى الحافظة
                </Button>
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                  ⚠️ <b>تنبيه:</b> {newToken.warning || 'انسخ الرمز الآن — لن يظهر مرة أخرى.'}
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => { setShowNew(false); setNewToken(null) }} className="grad-brand text-white">تم — إغلاق</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ReferralsTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api('/referrals').then(setData).catch(e => toast.error(e.message)).finally(() => setLoading(false))
  }, [])
  if (loading) return <div className="text-center py-10 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /> جاري التحميل...</div>
  if (!data) return null
  const publicBase = typeof window !== 'undefined' ? window.location.origin : ''
  const fullLink = `${publicBase}/signup?ref=${data.code}`
  const copy = (text) => { navigator.clipboard.writeText(text); toast.success('📋 تم النسخ') }
  const shareWhatsApp = () => {
    const msg = `🎁 انضم إلى منصة رحّال (Rahaal ERP) للمكاتب السياحية!\nسجّل الآن بحسابك التجريبي المجاني عبر رابط الإحالة الخاص بي:\n${fullLink}\n\n✅ 500 قيد يومي مجاناً في التسجيل\n✅ محاسبة متعددة العملات (YER / USD / SAR)\n✅ إدارة تذاكر / تأشيرات / صرافة`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }
  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-l from-emerald-50 to-blue-50 border-emerald-200">
        <CardHeader><CardTitle className="flex items-center gap-2">🎁 برنامج الإحالة والمكافآت</CardTitle><CardDescription>ادعُ مكاتب سياحية أخرى وأكسب قيوداً مجانية عند تسجيلهم وعند دفعهم</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatCard icon={Users} label="مكاتب مسجّلة عبرك" value={data.stats.signups} grad="grad-brand" />
            <StatCard icon={CheckCircle2} label="مكاتب فعّلت الاشتراك" value={data.stats.activations} grad="grad-green" />
            <StatCard icon={Sparkles} label="قيود مجانية اكتسبتها" value={data.stats.bonus_earned} grad="grad-gold" />
          </div>
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="text-sm font-bold text-slate-700">رمز الإحالة الخاص بك</div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-white border-2 border-emerald-300">
                <code className="text-2xl font-extrabold text-emerald-700 tracking-wider">{data.code}</code>
                <Button size="sm" variant="outline" onClick={() => copy(data.code)} className="mr-auto">📋 نسخ الرمز</Button>
              </div>
              <div className="text-sm font-bold text-slate-700 mt-3">رابط التسجيل بالإحالة</div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-white border" dir="ltr">
                <code className="text-sm text-blue-700 flex-1 truncate">{fullLink}</code>
                <Button size="sm" variant="outline" onClick={() => copy(fullLink)}>📋 نسخ</Button>
                <Button size="sm" onClick={shareWhatsApp} className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1">📲 مشاركة</Button>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <div className="font-bold mb-1">💡 كيف تعمل المكافآت؟</div>
                <ul className="list-disc list-inside space-y-1">
                  <li>عند تسجيل مكتب جديد عبر رابطك → <b>+50 قيد مجاني</b> يُضاف إلى حصتك فوراً وتلقائياً.</li>
                  <li>لا حدود لعدد الإحالات — كل مكتب جديد يعني +50 قيد إضافي لك!</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="w-5 h-5 text-blue-600" /> المكاتب المسجّلة عبر إحالتك ({data.invitees.length})</CardTitle></CardHeader>
        <CardContent>
          {data.invitees.length === 0 ? (
            <div className="text-center py-8 text-slate-400">لم يسجّل أي مكتب عبر رابطك بعد — شارك الرابط الآن!</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>اسم المكتب</TableHead>
                <TableHead>تاريخ التسجيل</TableHead>
                <TableHead>الاشتراك</TableHead>
                <TableHead>حالة المكافأة</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.invitees.map(v => (
                  <TableRow key={v.id}>
                    <TableCell className="font-semibold">{v.name}</TableCell>
                    <TableCell className="text-xs">{fmtDate(v.created_at)}</TableCell>
                    <TableCell><Badge variant={v.subscription === 'paid' ? 'default' : 'secondary'}>{v.subscription === 'paid' ? 'مدفوع' : 'تجريبي'}</Badge></TableCell>
                    <TableCell>
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">✅ تم منح +50 قيد مكافأة</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ================================================================
// v3.4 — Permissions Dialog + Affiliate Screen
// ================================================================
const PERMISSION_GROUPS = [
  {
    title: '🎫 التذاكر', keys: [
      { k: 'tickets_view', l: 'عرض التذاكر' },
      { k: 'tickets_add',  l: 'إضافة تذكرة' },
      { k: 'tickets_edit', l: 'تعديل تذكرة' },
      { k: 'tickets_delete', l: 'حذف تذكرة' },
    ]
  },
  {
    title: '🛂 التأشيرات', keys: [
      { k: 'visas_view', l: 'عرض التأشيرات' },
      { k: 'visas_add', l: 'إضافة تأشيرة' },
      { k: 'visas_edit', l: 'تعديل تأشيرة' },
      { k: 'visas_delete', l: 'حذف تأشيرة' },
    ]
  },
  {
    title: '🛎️ الخدمات', keys: [
      { k: 'services_view', l: 'عرض الخدمات' },
      { k: 'services_add', l: 'إضافة خدمة' },
      { k: 'services_edit', l: 'تعديل خدمة' },
      { k: 'services_delete', l: 'حذف خدمة' },
    ]
  },
  {
    title: '📊 التقارير والأرباح', keys: [
      { k: 'reports_view', l: 'الوصول إلى التقارير المالية' },
      { k: 'show_profit', l: 'إظهار عمود الربح والعمولة' },
    ]
  },
  {
    title: '💳 السندات والدليل المحاسبي', keys: [
      { k: 'vouchers_manage', l: 'إدارة سندات القبض/الصرف' },
      { k: 'accounts_manage', l: 'إدارة الدليل المحاسبي (شجرة الحسابات)' },
    ]
  },
  {
    title: '💰 الأسعار والخصومات', keys: [
      { k: 'edit_price', l: 'تعديل السعر المعتمد للتذكرة/الخدمة' },
      { k: 'apply_discount', l: 'منح خصومات للعميل' },
    ]
  },
]

function PermissionsDialog({ target, onClose, onSaved }) {
  const [perms, setPerms] = useState({})
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (target) setPerms(target.permissions || {})
  }, [target])
  const setKey = (k, v) => setPerms(p => ({ ...p, [k]: v }))
  const setAll = (val) => {
    const next = {}
    PERMISSION_GROUPS.forEach(g => g.keys.forEach(({ k }) => next[k] = val))
    setPerms(next)
  }
  const save = async () => {
    try {
      setSaving(true)
      await api(`/tenant/users/${target.id}`, { method: 'PATCH', body: { permissions: perms } })
      onSaved && onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  const allTrue = PERMISSION_GROUPS.every(g => g.keys.every(({ k }) => perms[k]))
  return (
    <Dialog open={!!target} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Key className="w-5 h-5 text-blue-600" /> صلاحيات {target?.name || ''}
          </DialogTitle>
          <DialogDescription>حدد بالضبط ما يستطيع هذا الموظف فعله. المالك دائماً لديه صلاحيات كاملة (لا يحتاج ضبط).</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 mb-2 pb-2 border-b">
          <Button size="sm" variant="outline" onClick={() => setAll(true)} className="text-xs gap-1"><Power className="w-3 h-3 text-emerald-600" /> منح جميع الصلاحيات</Button>
          <Button size="sm" variant="outline" onClick={() => setAll(false)} className="text-xs gap-1"><Power className="w-3 h-3 text-rose-600" /> إلغاء جميع الصلاحيات</Button>
          {allTrue && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">الصلاحيات كاملة</Badge>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PERMISSION_GROUPS.map(g => (
            <div key={g.title} className="border rounded-lg p-3 bg-slate-50">
              <div className="font-bold text-sm text-slate-800 mb-2">{g.title}</div>
              <div className="space-y-1">
                {g.keys.map(({ k, l }) => (
                  <label key={k} className="flex items-center gap-2 p-1.5 rounded hover:bg-white cursor-pointer text-sm">
                    <input type="checkbox" checked={!!perms[k]} onChange={e => setKey(k, e.target.checked)} className="w-4 h-4 accent-blue-600" />
                    <span className={perms[k] ? 'font-semibold text-slate-800' : 'text-slate-500'}>{l}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving} className="grad-brand text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '💾 حفظ الصلاحيات'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AffiliateScreen() {
  const [data, setData] = useState(null)
  const [pmOpen, setPmOpen] = useState(false)
  const [editingPm, setEditingPm] = useState(null)
  const [cashoutOpen, setCashoutOpen] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const load = () => api('/affiliate').then(setData).catch(e => toast.error(e.message))
  useEffect(() => { load() }, [])
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(data.link); toast.success('تم نسخ الرابط') } catch (e) { toast.error('تعذّر النسخ') }
  }
  const shareBanner = (b) => {
    const msg = `${b.headline}\n\n${b.body}\n\n${b.cta}: ${data.link}`
    openWhatsApp('', msg)  // Opens WA share with pre-filled text (no specific number)
  }
  const copyBanner = async (b) => {
    const msg = `${b.headline}\n\n${b.body}\n\n${b.cta}: ${data.link}`
    try { await navigator.clipboard.writeText(msg); toast.success('تم نسخ نص البانر') } catch (e) { toast.error('تعذّر النسخ') }
  }
  if (!data) return <div className="p-8 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
  const pct = Math.round((data.commission_rate || 0.1) * 100)
  const target = data.is_individual ? 'أفراد' : 'مكتب'
  return (
    <div className="space-y-6">
      <TopBar
        title="التسويق بالعمولة (Affiliate)"
        subtitle={`اربح ${pct}% من قيمة اشتراك كل مكتب تدعوه عبر رابطك — سواء اشترك شهرياً أو سنوياً`}
        right={<Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border border-blue-200">حسابك: {target}</Badge>}
      />

      {/* Balance + KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="grad-brand text-white border-0 shadow-lg">
          <CardContent className="p-4">
            <div className="text-xs opacity-90">الرصيد الحالي</div>
            <div className="text-3xl font-extrabold">${data.balance_usd.toFixed(2)}</div>
            <div className="text-[10px] opacity-80 mt-1">قابل للسحب أو التحويل للاشتراك</div>
          </CardContent>
        </Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-slate-500">إجمالي ما اكتسبته</div>
          <div className="text-2xl font-bold text-emerald-600">${data.total_earned_usd.toFixed(2)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-slate-500">مكاتب أحلتها</div>
          <div className="text-2xl font-bold text-slate-800">{data.referred_offices}</div>
          <div className="text-[10px] text-emerald-600 mt-1">{data.activated_offices} نشط • {data.pending_offices} قيد التفعيل</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-slate-500">الحد الأدنى للسحب</div>
          <div className="text-2xl font-bold text-orange-600">${data.min_cashout_usd}</div>
        </CardContent></Card>
      </div>

      {/* Referral link */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><User className="w-5 h-5 text-blue-600" /> رابط الإحالة الخاص بك</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 p-3 bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg font-mono text-xs" dir="ltr">{data.link}</div>
            <Button onClick={copyLink} className="gap-2"><span>📋</span> نسخ</Button>
            <WaBtn phone="" message={`جرّب برنامج رحّال لمحاسبة مكاتب السفريات 🚀\nسجّل مجاناً عبر رابطي:\n${data.link}`} size="md" label="مشاركة" />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="font-bold">🔑 كودك:</span>
            <Badge className="font-mono">{data.code}</Badge>
            <span>• كل من يسجّل عبر رابطك تكسب <b>{pct}%</b> من قيمة اشتراكه في رصيدك.</span>
          </div>
        </CardContent>
      </Card>

      {/* Marketing banners */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ImageIcon className="w-5 h-5 text-orange-600" /> بانرات ونصوص تسويقية جاهزة</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.banners.map(b => (
            <div key={b.id} className="border-2 border-blue-100 rounded-xl overflow-hidden">
              <div className="grad-brand p-4 text-white">
                <div className="text-lg font-extrabold">{b.headline}</div>
              </div>
              <div className="p-3 space-y-2 bg-white">
                <div className="text-xs text-slate-500 font-semibold">{b.title}</div>
                <div className="text-sm text-slate-700 leading-relaxed">{b.body}</div>
                <div className="text-sm font-bold text-orange-600">{b.cta} → {data.link}</div>
                <div className="flex gap-2 pt-2 border-t">
                  <Button size="sm" onClick={() => copyBanner(b)} variant="outline" className="gap-1 text-xs h-8"><span>📋</span> نسخ النص</Button>
                  <button onClick={() => shareBanner(b)} className="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-[#25D366] hover:bg-[#128C7E] text-white text-xs font-semibold">
                    <svg viewBox="0 0 32 32" width={12} height={12} fill="currentColor"><path d="M16.001 3.2C9.075 3.2 3.401 8.874 3.401 15.8c0 2.196.578 4.348 1.677 6.246l-1.876 6.85 7.048-1.848a12.578 12.578 0 0 0 5.751 1.398c6.926 0 12.6-5.674 12.6-12.6S22.927 3.2 16.001 3.2Z"/></svg>
                    مشاركة على واتساب
                  </button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Payout methods */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Wallet className="w-5 h-5 text-emerald-600" /> طرق السحب المحفوظة ({data.payout_methods.length})</CardTitle>
          <Button onClick={() => { setEditingPm(null); setPmOpen(true) }} className="gap-2 grad-gold text-white"><Plus className="w-4 h-4" /> إضافة طريقة سحب</Button>
        </CardHeader>
        <CardContent>
          {data.payout_methods.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm">لا توجد طرق سحب محفوظة. أضف طريقة قبل طلب السحب.</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.payout_methods.map(m => (
              <div key={m.id} className={`border-2 rounded-lg p-3 ${m.is_default ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-slate-800">
                    {m.method_type === 'bank' ? '🏦 تحويل بنكي' : m.method_type === 'wallet' ? '📱 محفظة رقمية' : '📮 حوالة محلية'}
                  </div>
                  {m.is_default && <Badge className="bg-emerald-500 text-white hover:bg-emerald-600">الافتراضية</Badge>}
                </div>
                <div className="text-xs space-y-1 text-slate-600">
                  {m.provider && <div><b>الجهة:</b> {m.provider}</div>}
                  <div><b>الاسم:</b> {m.account_name}</div>
                  {m.account_number && <div dir="ltr"><b>الرقم:</b> {m.account_number}</div>}
                  {m.phone && <div dir="ltr"><b>الهاتف:</b> {m.phone}</div>}
                  {m.city && <div><b>المدينة:</b> {m.city}</div>}
                </div>
                <div className="flex gap-1 mt-3 pt-2 border-t">
                  <Button size="sm" variant="ghost" onClick={() => { setEditingPm(m); setPmOpen(true) }} className="h-7 px-2 text-xs gap-1"><Pencil className="w-3 h-3" /> تعديل</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { if (confirm('حذف طريقة السحب؟')) { await api(`/affiliate/payout-methods/${m.id}`, { method: 'DELETE' }); load(); toast.success('تم الحذف') } }} className="h-7 px-2 text-xs text-rose-600 gap-1"><Trash2 className="w-3 h-3" /> حذف</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="border-2 border-emerald-200">
          <CardContent className="p-5">
            <div className="text-lg font-bold text-emerald-700 mb-2">💵 طلب سحب نقدي (Cash Out)</div>
            <div className="text-xs text-slate-600 mb-3">اسحب رصيدك المكتسب — الحد الأدنى ${data.min_cashout_usd} — عبر إحدى طرق السحب المحفوظة.</div>
            <Button onClick={() => setCashoutOpen(true)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2" disabled={data.balance_usd < data.min_cashout_usd || data.payout_methods.length === 0}>
              <span>💸</span> طلب سحب رصيدي
            </Button>
            {data.payout_methods.length === 0 && <div className="text-[10px] text-rose-600 mt-1 text-center">أضف طريقة سحب أولاً</div>}
          </CardContent>
        </Card>
        <Card className="border-2 border-blue-200">
          <CardContent className="p-5">
            <div className="text-lg font-bold text-blue-700 mb-2">🔄 تحويل الرصيد لتغطية الاشتراك</div>
            <div className="text-xs text-slate-600 mb-3">استخدم رصيد الأفلييت لتغطية اشتراكك الشهري/السنوي أو رسوم الصيانة السنوية بدلاً من الدفع نقداً.</div>
            <Button onClick={() => setApplyOpen(true)} className="w-full grad-brand text-white gap-2" disabled={data.balance_usd <= 0}>
              <span>🎫</span> تحويل الرصيد للاشتراك
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Withdrawal history */}
      {data.withdrawals.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="w-5 h-5 text-slate-600" /> سجل عمليات السحب والتحويل</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>المبلغ</TableHead><TableHead>الطريقة</TableHead><TableHead>الحالة</TableHead><TableHead>ملاحظات</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.withdrawals.map(w => (
                  <TableRow key={w.id}>
                    <TableCell className="text-xs">{fmtDate(w.created_at)}</TableCell>
                    <TableCell className="font-bold">${(w.amount_usd || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-xs">{w.payout_method_snapshot?.method_type === 'subscription' ? 'اشتراك (رصيد داخلي)' : (w.payout_method_snapshot?.provider || w.payout_method_snapshot?.method_type || '—')}</TableCell>
                    <TableCell>
                      {w.status === 'pending' && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">قيد المراجعة</Badge>}
                      {w.status === 'processing' && <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">جاري التنفيذ</Badge>}
                      {w.status === 'paid' && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">تم الدفع</Badge>}
                      {w.status === 'rejected' && <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">مرفوض</Badge>}
                      {w.status === 'applied_to_subscription' && <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">تم التحويل للاشتراك</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{w.notes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <PayoutMethodDialog open={pmOpen} onOpenChange={setPmOpen} editing={editingPm} onSaved={() => { setPmOpen(false); setEditingPm(null); load() }} />
      <CashoutDialog open={cashoutOpen} onOpenChange={setCashoutOpen} data={data} onSaved={() => { setCashoutOpen(false); load() }} />
      <ApplyToSubscriptionDialog open={applyOpen} onOpenChange={setApplyOpen} data={data} onSaved={() => { setApplyOpen(false); load() }} />
    </div>
  )
}

function PayoutMethodDialog({ open, onOpenChange, editing, onSaved }) {
  const [f, setF] = useState({ method_type: 'wallet', provider: '', account_name: '', account_number: '', phone: '', city: '', is_default: false, notes: '' })
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    if (editing) setF({
      method_type: editing.method_type, provider: editing.provider || '',
      account_name: editing.account_name, account_number: editing.account_number || '',
      phone: editing.phone || '', city: editing.city || '', is_default: !!editing.is_default, notes: editing.notes || '',
    })
    else setF({ method_type: 'wallet', provider: '', account_name: '', account_number: '', phone: '', city: '', is_default: false, notes: '' })
  }, [open, editing])
  const save = async () => {
    if (!f.account_name) return toast.error('اسم صاحب الحساب مطلوب')
    try {
      setSaving(true)
      if (editing) await api(`/affiliate/payout-methods/${editing.id}`, { method: 'PUT', body: f })
      else await api('/affiliate/payout-methods', { method: 'POST', body: f })
      toast.success(editing ? 'تم التحديث' : 'تمت الإضافة')
      onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  const typeLabel = { bank: '🏦 تحويل بنكي', wallet: '📱 محفظة رقمية', local_remittance: '📮 حوالة محلية' }
  const providerPlaceholder = f.method_type === 'bank' ? 'اسم البنك (البنك اليمني، بنك الكريمي...)' : f.method_type === 'wallet' ? 'اسم المحفظة (كريمي، جوالي، فلوسي، الكيبل...)' : 'اسم شبكة الحوالة (النجم، الإمتياز، بن دوّل...)'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="w-5 h-5 text-emerald-600" /> {editing ? 'تعديل طريقة سحب' : 'إضافة طريقة سحب جديدة'}</DialogTitle>
          <DialogDescription>احفظ بيانات السحب لمرة واحدة، وستُستخدم تلقائياً عند طلب السحب في المرات القادمة.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2"><Field label="نوع طريقة السحب" required>
            <Select value={f.method_type} onValueChange={v => setF({ ...f, method_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank">🏦 تحويل بنكي (IBAN)</SelectItem>
                <SelectItem value="wallet">📱 محفظة رقمية (Creami, Jawali, Floosak...)</SelectItem>
                <SelectItem value="local_remittance">📮 حوالة محلية (النجم، الإمتياز، بن دوّل...)</SelectItem>
              </SelectContent>
            </Select>
          </Field></div>
          <div className="md:col-span-2"><Field label="الجهة/المُقدّم"><Input value={f.provider} onChange={e => setF({ ...f, provider: e.target.value })} placeholder={providerPlaceholder} /></Field></div>
          <Field label="اسم صاحب الحساب" required><Input value={f.account_name} onChange={e => setF({ ...f, account_name: e.target.value })} /></Field>
          <Field label={f.method_type === 'bank' ? 'رقم الحساب / IBAN' : 'رقم الهاتف / المرجع'}><Input dir="ltr" value={f.account_number} onChange={e => setF({ ...f, account_number: e.target.value })} /></Field>
          <Field label="رقم الهاتف (للتواصل عند الحوالة)"><Input dir="ltr" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="المدينة"><Input value={f.city} onChange={e => setF({ ...f, city: e.target.value })} /></Field>
          <div className="md:col-span-2"><Field label="ملاحظات"><Input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="أي تعليمات إضافية لتنفيذ الحوالة" /></Field></div>
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 cursor-pointer p-2 bg-emerald-50 rounded-md border border-emerald-200">
              <input type="checkbox" checked={f.is_default} onChange={e => setF({ ...f, is_default: e.target.checked })} className="w-4 h-4 accent-emerald-600" />
              <span className="text-sm font-semibold">اجعل هذه الطريقة الافتراضية</span>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving} className="grad-gold text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editing ? '💾 حفظ التعديل' : 'إضافة')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CashoutDialog({ open, onOpenChange, data, onSaved }) {
  const [amount, setAmount] = useState('')
  const [pmId, setPmId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    setAmount(''); setNotes('')
    const def = data.payout_methods?.find(m => m.is_default) || data.payout_methods?.[0]
    setPmId(def?.id || '')
  }, [open, data])
  const submit = async () => {
    const amt = Number(amount) || 0
    if (amt < data.min_cashout_usd) return toast.error(`الحد الأدنى ${data.min_cashout_usd} USD`)
    if (amt > data.balance_usd) return toast.error('المبلغ يتجاوز رصيدك')
    if (!pmId) return toast.error('اختر طريقة السحب')
    try {
      setSaving(true)
      await api('/affiliate/cashout', { method: 'POST', body: { amount_usd: amt, payout_method_id: pmId, notes } })
      toast.success('✅ تم إرسال طلب السحب — قيد المراجعة')
      onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>💸 طلب سحب رصيد الأفلييت</DialogTitle>
          <DialogDescription>الرصيد المتاح: <b>${data.balance_usd.toFixed(2)}</b> • الحد الأدنى: <b>${data.min_cashout_usd}</b></DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="المبلغ المطلوب (USD)" required>
            <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="text-xl font-bold" />
          </Field>
          <Field label="طريقة السحب" required>
            <Select value={pmId} onValueChange={setPmId}>
              <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
              <SelectContent>
                {(data.payout_methods || []).map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.method_type === 'bank' ? '🏦' : m.method_type === 'wallet' ? '📱' : '📮'} {m.provider || m.method_type} — {m.account_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="ملاحظات (اختياري)"><Input value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '💵 إرسال طلب السحب'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ApplyToSubscriptionDialog({ open, onOpenChange, data, onSaved }) {
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) setAmount(data.balance_usd.toFixed(2)) }, [open, data])
  const submit = async () => {
    const amt = Number(amount) || 0
    if (amt <= 0) return toast.error('أدخل مبلغاً صالحاً')
    if (amt > data.balance_usd) return toast.error('المبلغ يتجاوز رصيدك')
    try {
      setSaving(true)
      await api('/affiliate/apply-to-subscription', { method: 'POST', body: { amount_usd: amt } })
      toast.success('✅ تم تحويل الرصيد لتغطية الاشتراك')
      onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>🔄 تحويل الرصيد لتغطية الاشتراك</DialogTitle>
          <DialogDescription>سيتم خصم المبلغ من رصيد الأفلييت وإضافته كرصيد اشتراك يُستخدم تلقائياً عند التجديد.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            💰 رصيد الأفلييت الحالي: <b className="text-emerald-700">${data.balance_usd.toFixed(2)}</b>
          </div>
          <Field label="المبلغ (USD)" required>
            <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="text-xl font-bold" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="grad-brand text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '🎫 تحويل الآن'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================================================================
// v3.6 — PACKAGES & TOURS SCREEN
// ================================================================
const PACKAGE_TYPES = [
  { v: 'umrah', l: '🕋 عمرة' },
  { v: 'hajj', l: '🕋 حج' },
  { v: 'tourism', l: '🌍 سياحة خارجية' },
  { v: 'group', l: '👥 قروبات' },
]
const COMPONENT_TYPES = [
  { v: 'visa', l: 'تأشيرة' }, { v: 'ticket', l: 'تذكرة' }, { v: 'hotel', l: 'فندق' },
  { v: 'transport', l: 'نقل/مواصلات' }, { v: 'other', l: 'أخرى' },
]

function PackagesScreen() {
  const [packages, setPackages] = useState([])
  const [leaderboard, setLeaderboard] = useState(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [detailsPkg, setDetailsPkg] = useState(null)
  const [reportPkg, setReportPkg] = useState(null)
  const [comparePeriod, setComparePeriod] = useState(null) // null | 'all' | 'month' | 'year'
  const [extendPkg, setExtendPkg] = useState(null)
  const load = () => {
    api('/packages').then(setPackages).catch(e => toast.error(e.message))
    api('/packages/comparison?period=month').then(setLeaderboard).catch(() => {})
  }
  useEffect(() => { load() }, [])
  const closePkg = async (p) => {
    if (!confirm(`إغلاق الباكج "${p.name}"؟ (لن يمكن إضافة تسجيلات جديدة)`)) return
    try { await api(`/packages/${p.id}`, { method: 'PATCH', body: { status: 'closed' } }); toast.success('تم إغلاق الباكج'); load() }
    catch (e) { toast.error(e.message) }
  }
  const reopenPkg = async (p) => {
    try { await api(`/packages/${p.id}`, { method: 'PATCH', body: { status: 'open' } }); toast.success('تم إعادة فتح الباكج'); load() }
    catch (e) { toast.error(e.message) }
  }
  const delPkg = async (p) => {
    if (!confirm(`حذف الباكج "${p.name}"؟`)) return
    try { await api(`/packages/${p.id}`, { method: 'DELETE' }); toast.success('تم الحذف'); load() }
    catch (e) { toast.error(e.message) }
  }
  const openPackages = packages.filter(p => p.status !== 'closed')
  const closedPackages = packages.filter(p => p.status === 'closed')
  const top = leaderboard?.top
  return (
    <div className="space-y-4">
      <TopBar title="الباكجات والبرامج السياحية" subtitle={`${openPackages.length} باكج نشط • ${closedPackages.length} أرشيف`}
        right={<div className="flex gap-2">
          <Button variant="outline" onClick={() => setComparePeriod('all')} className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"><BarChart3 className="w-4 h-4" /> مقارنة الربحية</Button>
          <Button onClick={() => { setEditing(null); setOpen(true) }} className="grad-brand text-white gap-2"><Plus className="w-4 h-4" /> باكج جديد</Button>
        </div>} />
      {/* v3.7 — Top Profitable Package KPI (current month) */}
      {top && top.bookings > 0 && (
        <Card className="overflow-hidden border-0 shadow-md bg-gradient-to-l from-emerald-500 via-teal-500 to-cyan-500 text-white">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-2xl">🏆</div>
                <div>
                  <div className="text-xs uppercase tracking-wider opacity-90">الباكج الأكثر ربحية هذا الشهر</div>
                  <div className="text-lg font-extrabold">{top.name}</div>
                  <div className="text-xs opacity-90">👥 {top.pax} مسافر • 🧾 {top.bookings} حجز • {PACKAGE_TYPES.find(t => t.v === top.package_type)?.l || top.package_type}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-[10px] opacity-90">صافي الربح</div>
                  <div className="text-xl font-black">{top.profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div className="text-[10px] opacity-90">{top.currency}</div>
                </div>
                <div>
                  <div className="text-[10px] opacity-90">الإيرادات</div>
                  <div className="text-xl font-black">{top.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div className="text-[10px] opacity-90">{top.currency}</div>
                </div>
                <div>
                  <div className="text-[10px] opacity-90">هامش الربح</div>
                  <div className="text-xl font-black">{top.margin_pct}%</div>
                  <div className="text-[10px] opacity-90">Margin</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <div>
        <div className="text-sm font-bold text-slate-700 mb-2">🟢 الباكجات المفتوحة</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {openPackages.map(p => <PkgCard key={p.id} p={p} onOpen={() => setDetailsPkg(p)} onClose={() => closePkg(p)} onEdit={() => { setEditing(p); setOpen(true) }} onDelete={() => delPkg(p)} onReport={() => setReportPkg(p)} onExtend={() => setExtendPkg(p)} />)}
          {openPackages.length === 0 && <div className="col-span-full text-center text-slate-400 py-8 text-sm">لا توجد باكجات مفتوحة — أنشئ باكج جديد</div>}
        </div>
      </div>
      {closedPackages.length > 0 && <div>
        <div className="text-sm font-bold text-slate-500 mt-6 mb-2">🗄️ أرشيف الباكجات المغلقة</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {closedPackages.map(p => <PkgCard key={p.id} p={p} closed onOpen={() => setDetailsPkg(p)} onReopen={() => reopenPkg(p)} onReport={() => setReportPkg(p)} />)}
        </div>
      </div>}
      <PackageDialog open={open} onOpenChange={v => { setOpen(v); if (!v) setEditing(null) }} record={editing} onSaved={load} />
      {detailsPkg && <PackageDetailsDialog pkg={detailsPkg} onClose={() => setDetailsPkg(null)} onChanged={load} />}
      {reportPkg && <PackageReportDialog pkg={reportPkg} onClose={() => setReportPkg(null)} />}
      {comparePeriod && <PackageCompareDialog initialPeriod={comparePeriod} onClose={() => setComparePeriod(null)} />}
      {extendPkg && <ExtendPackageDateDialog pkg={extendPkg} onClose={() => setExtendPkg(null)} onSaved={load} />}
    </div>
  )
}

// v3.7 — Extend Package End-Date (quick dialog)
function ExtendPackageDateDialog({ pkg, onClose, onSaved }) {
  const currentEnd = pkg.end_date ? new Date(pkg.end_date).toISOString().slice(0, 10) : ''
  const [newDate, setNewDate] = useState(currentEnd)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!newDate) return toast.error('اختر تاريخاً جديداً')
    if (pkg.end_date && new Date(newDate) <= new Date(pkg.end_date)) {
      if (!confirm('التاريخ الجديد ليس بعد التاريخ الحالي — هل تريد المتابعة؟')) return
    }
    try {
      setSaving(true)
      await api(`/packages/${pkg.id}`, { method: 'PATCH', body: { end_date: newDate } })
      toast.success('✅ تم تمديد تاريخ نهاية الباكج')
      onSaved(); onClose()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Calendar className="w-5 h-5 text-teal-600" /> تمديد تاريخ نهاية الباكج</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <div className="font-bold text-slate-700">{pkg.name}</div>
            <div className="text-xs text-slate-500 mt-1">{PACKAGE_TYPES.find(t => t.v === pkg.package_type)?.l}</div>
            <div className="text-xs text-slate-600 mt-2">التاريخ الحالي: <span className="font-mono">{currentEnd || '—'}</span></div>
          </div>
          <Field label="تاريخ النهاية الجديد" required>
            <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
          </Field>
          <div className="text-xs text-amber-700 bg-amber-50 rounded p-2 flex gap-2">
            <span>💡</span>
            <span>مدّد التاريخ لتسجيل معتمرين أو مسافرين متأخرين دون الحاجة لإغلاق الباكج وإعادة فتحه.</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white gap-2"><Calendar className="w-4 h-4" /> {saving ? 'جارٍ الحفظ...' : 'تمديد التاريخ'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// v3.7 — Packages Profitability Comparison Report
function PackageCompareDialog({ initialPeriod = 'all', onClose }) {
  const [period, setPeriod] = useState(initialPeriod)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const load = () => {
    setLoading(true)
    api(`/packages/comparison?period=${period}`).then(d => { setData(d); setLoading(false) }).catch(e => { toast.error(e.message); setLoading(false) })
  }
  useEffect(() => { load() }, [period])
  const rows = data?.rows || []
  const totals = data?.totals || { revenue: 0, cost: 0, profit: 0, margin_pct: 0, bookings: 0, pax: 0 }
  const periodLabel = { all: 'كل الفترات', month: 'الشهر الحالي', year: 'السنة الحالية' }[period]
  const printReport = () => window.print()
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-600" /> تقرير مقارنة ربحية الباكجات</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <div className="flex gap-1">
              {['all', 'month', 'year'].map(p => (
                <Button key={p} size="sm" variant={period === p ? 'default' : 'outline'} onClick={() => setPeriod(p)} className={period === p ? 'bg-blue-600 text-white' : ''}>
                  {p === 'all' ? 'الكل' : p === 'month' ? 'هذا الشهر' : 'هذه السنة'}
                </Button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={printReport} className="gap-1"><ReceiptText className="w-3 h-3" /> طباعة</Button>
          </div>
          <div className="text-xs text-slate-500">الفترة: <b className="text-slate-700">{periodLabel}</b> • {rows.filter(r => r.bookings > 0).length} باكج نشط من أصل {rows.length}</div>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded-lg border p-2 bg-white">
              <div className="text-[10px] text-slate-500">إجمالي الإيرادات</div>
              <div className="text-lg font-black text-emerald-600">{totals.revenue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
            </div>
            <div className="rounded-lg border p-2 bg-white">
              <div className="text-[10px] text-slate-500">إجمالي التكاليف</div>
              <div className="text-lg font-black text-orange-600">{totals.cost.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
            </div>
            <div className="rounded-lg border p-2 bg-white">
              <div className="text-[10px] text-slate-500">صافي الربح</div>
              <div className="text-lg font-black text-blue-600">{totals.profit.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
            </div>
            <div className="rounded-lg border p-2 bg-white">
              <div className="text-[10px] text-slate-500">متوسط الهامش</div>
              <div className="text-lg font-black text-fuchsia-600">{totals.margin_pct}%</div>
            </div>
          </div>
          {/* Comparison table */}
          {loading ? (
            <div className="text-center py-8 text-sm text-slate-400">جارٍ التحميل...</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-400">لا توجد باكجات</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-xs">
                  <tr>
                    <th className="p-2 text-right">#</th>
                    <th className="p-2 text-right">الباكج</th>
                    <th className="p-2 text-right">النوع</th>
                    <th className="p-2 text-center">الحالة</th>
                    <th className="p-2 text-center">الحجوزات</th>
                    <th className="p-2 text-center">المسافرون</th>
                    <th className="p-2 text-left">الإيرادات</th>
                    <th className="p-2 text-left">التكاليف</th>
                    <th className="p-2 text-left">صافي الربح</th>
                    <th className="p-2 text-center">الهامش %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={r.package_id} className={`border-t hover:bg-slate-50 ${idx === 0 && r.bookings > 0 ? 'bg-emerald-50/70 font-semibold' : ''}`}>
                      <td className="p-2 text-slate-400">{idx === 0 && r.bookings > 0 ? '🏆' : idx + 1}</td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2 text-xs text-slate-500">{PACKAGE_TYPES.find(t => t.v === r.package_type)?.l || r.package_type}</td>
                      <td className="p-2 text-center">
                        <Badge className={r.status === 'closed' ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'}>{r.status === 'closed' ? 'مغلق' : 'مفتوح'}</Badge>
                      </td>
                      <td className="p-2 text-center">{r.bookings}</td>
                      <td className="p-2 text-center">{r.pax}</td>
                      <td className="p-2 text-left font-mono text-emerald-700">{r.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="p-2 text-left font-mono text-orange-700">{r.cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className={`p-2 text-left font-mono font-bold ${r.profit >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>{r.profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="p-2 text-center font-mono">
                        <span className={`px-2 py-0.5 rounded ${r.margin_pct >= 20 ? 'bg-emerald-100 text-emerald-700' : r.margin_pct >= 10 ? 'bg-amber-100 text-amber-700' : r.margin_pct > 0 ? 'bg-slate-100 text-slate-600' : 'bg-rose-100 text-rose-600'}`}>{r.margin_pct}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-bold text-xs">
                  <tr>
                    <td colSpan={4} className="p-2 text-left">الإجمالي</td>
                    <td className="p-2 text-center">{totals.bookings}</td>
                    <td className="p-2 text-center">{totals.pax}</td>
                    <td className="p-2 text-left font-mono">{totals.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="p-2 text-left font-mono">{totals.cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="p-2 text-left font-mono">{totals.profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="p-2 text-center font-mono">{totals.margin_pct}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
        <DialogFooter className="print:hidden"><Button variant="ghost" onClick={onClose}>إغلاق</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PkgCard({ p, onOpen, onClose, onEdit, onDelete, onReopen, onReport, onExtend, closed }) {
  const typeL = PACKAGE_TYPES.find(t => t.v === p.package_type)?.l || p.package_type
  return (
    <Card className={`overflow-hidden hover:shadow-md transition ${closed ? 'opacity-70' : ''}`}>
      <div className={closed ? 'h-1 bg-slate-400' : 'h-1 grad-brand'} />
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-bold text-slate-800">{p.name}</div>
            <div className="text-xs text-slate-500">{typeL}</div>
          </div>
          <Badge className={closed ? 'bg-slate-200 text-slate-600 hover:bg-slate-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'}>{closed ? 'مغلق' : 'مفتوح'}</Badge>
        </div>
        <div className="text-xs text-slate-500 space-y-0.5">
          {p.start_date && <div>📅 من {fmtDate(p.start_date)} {p.end_date && `→ ${fmtDate(p.end_date)}`}</div>}
          <div>🧩 {p.components_count || 0} مكوّن • 👥 {p.bookings_count || 0} مسجل</div>
        </div>
        <div className="flex flex-wrap gap-1 pt-2 border-t">
          <Button size="sm" variant="outline" onClick={onOpen} className="h-7 px-2 text-xs gap-1"><FileBadge2 className="w-3 h-3" /> المكونات والتسجيل</Button>
          <Button size="sm" variant="outline" onClick={onReport} className="h-7 px-2 text-xs gap-1 text-blue-600"><ReceiptText className="w-3 h-3" /> التقرير</Button>
          {!closed && onExtend && <Button size="sm" variant="outline" onClick={onExtend} className="h-7 px-2 text-xs gap-1 text-teal-600 border-teal-200 hover:bg-teal-50"><Calendar className="w-3 h-3" /> تمديد التاريخ</Button>}
          {!closed && onEdit && <Button size="sm" variant="ghost" onClick={onEdit} className="h-7 px-2 text-xs"><Pencil className="w-3 h-3" /></Button>}
          {!closed && onClose && <Button size="sm" variant="ghost" onClick={onClose} className="h-7 px-2 text-xs text-orange-600">إغلاق</Button>}
          {closed && onReopen && <Button size="sm" variant="ghost" onClick={onReopen} className="h-7 px-2 text-xs text-emerald-600">فتح</Button>}
          {!closed && onDelete && p.bookings_count === 0 && <Button size="sm" variant="ghost" onClick={onDelete} className="h-7 px-2 text-xs text-rose-600"><Trash2 className="w-3 h-3" /></Button>}
        </div>
      </CardContent>
    </Card>
  )
}

function PackageDialog({ open, onOpenChange, record, onSaved }) {
  const [f, setF] = useState({ name: '', package_type: 'umrah', currency: 'SAR', start_date: '', end_date: '', notes: '' })
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    if (record) setF({ name: record.name, package_type: record.package_type, currency: record.currency, start_date: record.start_date ? new Date(record.start_date).toISOString().slice(0,10) : '', end_date: record.end_date ? new Date(record.end_date).toISOString().slice(0,10) : '', notes: record.notes || '' })
    else setF({ name: '', package_type: 'umrah', currency: 'SAR', start_date: todayISO(), end_date: '', notes: '' })
  }, [open, record])
  const save = async () => {
    if (!f.name) return toast.error('اسم الباكج مطلوب')
    try {
      setSaving(true)
      if (record) await api(`/packages/${record.id}`, { method: 'PATCH', body: { name: f.name, package_type: f.package_type, end_date: f.end_date || null, notes: f.notes } })
      else await api('/packages', { method: 'POST', body: f })
      toast.success(record ? 'تم التحديث' : 'تم إنشاء الباكج')
      onSaved(); onOpenChange(false)
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader><DialogTitle>{record ? 'تعديل الباكج' : 'باكج جديد'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2"><Field label="اسم الباكج" required><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="عمرة رجب 2026" /></Field></div>
          <Field label="النوع"><Select value={f.package_type} onValueChange={v => setF({ ...f, package_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PACKAGE_TYPES.map(t => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="العملة"><Select value={f.currency} onValueChange={v => setF({ ...f, currency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="تاريخ البداية"><Input type="date" value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} disabled={!!record} /></Field>
          <Field label="تاريخ النهاية"><Input type="date" value={f.end_date} onChange={e => setF({ ...f, end_date: e.target.value })} /></Field>
          <div className="md:col-span-2"><Field label="ملاحظات"><Textarea rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving} className="grad-brand text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PackageDetailsDialog({ pkg, onClose, onChanged }) {
  const [tab, setTab] = useState('components')
  const [comps, setComps] = useState([])
  const [bookings, setBookings] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [clients, setClients] = useState([])
  const [boxes, setBoxes] = useState([])
  const [newComp, setNewComp] = useState({ name: '', component_type: 'ticket', supplier_id: '', cost_per_pax: '', sale_per_pax: '', notes: '' })
  const [newBooking, setNewBooking] = useState({ client_id: '', pilgrim_name: '', passport_no: '', pax_count: 1, payment_method: 'credit', box_id: '', notes: '' })
  const load = () => Promise.all([
    api(`/packages/${pkg.id}/components`).then(setComps),
    api(`/packages/${pkg.id}/bookings`).then(setBookings),
    api('/suppliers').then(setSuppliers), api('/clients').then(setClients), api('/boxes').then(setBoxes),
  ]).catch(e => toast.error(e.message))
  useEffect(() => { load() }, [pkg.id])
  const addComp = async () => {
    if (!newComp.name || !newComp.supplier_id) return toast.error('اسم المكوّن والمورد مطلوبان')
    try { await api(`/packages/${pkg.id}/components`, { method: 'POST', body: newComp }); toast.success('تمت الإضافة'); setNewComp({ name: '', component_type: 'ticket', supplier_id: '', cost_per_pax: '', sale_per_pax: '', notes: '' }); load(); onChanged && onChanged() }
    catch (e) { toast.error(e.message) }
  }
  const delComp = async (id) => { if (!confirm('حذف المكوّن؟')) return; try { await api(`/packages/${pkg.id}/components/${id}`, { method: 'DELETE' }); load(); onChanged && onChanged() } catch (e) { toast.error(e.message) } }
  const addBooking = async () => {
    if (!newBooking.client_id) return toast.error('اختر حساب القبض')
    if (comps.length === 0) return toast.error('أضف مكونات الباكج أولاً')
    try { await api(`/packages/${pkg.id}/bookings`, { method: 'POST', body: newBooking }); toast.success('✅ تم التسجيل + قيد محاسبي'); setNewBooking({ client_id: '', pilgrim_name: '', passport_no: '', pax_count: 1, payment_method: 'credit', box_id: '', notes: '' }); load(); onChanged && onChanged() }
    catch (e) { toast.error(e.message) }
  }
  const totalCost = comps.reduce((s, c) => s + (c.cost_per_pax || 0), 0)
  const totalSale = comps.reduce((s, c) => s + (c.sale_per_pax || 0), 0)
  const profit = totalSale - totalCost
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pkg.name} — {PACKAGE_TYPES.find(t => t.v === pkg.package_type)?.l}</DialogTitle>
          <DialogDescription>سعر الفرد الواحد: تكلفة <b>{fmt(totalCost, pkg.currency)}</b> • بيع <b>{fmt(totalSale, pkg.currency)}</b> • ربح <b className="text-emerald-600">{fmt(profit, pkg.currency)}</b></DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 mb-3 border-b">
          <button onClick={() => setTab('components')} className={`px-4 py-2 text-sm font-bold border-b-2 ${tab === 'components' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'}`}>🧩 المكونات ({comps.length})</button>
          <button onClick={() => setTab('bookings')} className={`px-4 py-2 text-sm font-bold border-b-2 ${tab === 'bookings' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500'}`}>👥 المسجلون ({bookings.length})</button>
        </div>
        {tab === 'components' && (
          <div className="space-y-3">
            {pkg.status !== 'closed' && (
              <div className="grid grid-cols-1 md:grid-cols-6 gap-2 p-3 bg-slate-50 rounded-lg">
                <Field label="نوع"><Select value={newComp.component_type} onValueChange={v => setNewComp({ ...newComp, component_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{COMPONENT_TYPES.map(t => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="الاسم"><Input value={newComp.name} onChange={e => setNewComp({ ...newComp, name: e.target.value })} placeholder="فندق البلد" /></Field>
                <Field label="المورد"><Select value={newComp.supplier_id} onValueChange={v => setNewComp({ ...newComp, supplier_id: v })}><SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger><SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></Field>
                <Field label={`تكلفة/فرد (${pkg.currency})`}><Input type="number" value={newComp.cost_per_pax} onChange={e => setNewComp({ ...newComp, cost_per_pax: e.target.value })} /></Field>
                <Field label={`بيع/فرد (${pkg.currency})`}><Input type="number" value={newComp.sale_per_pax} onChange={e => setNewComp({ ...newComp, sale_per_pax: e.target.value })} /></Field>
                <div className="flex items-end"><Button onClick={addComp} className="w-full grad-brand text-white gap-1"><Plus className="w-4 h-4" /> إضافة</Button></div>
              </div>
            )}
            <Table>
              <TableHeader><TableRow><TableHead>النوع</TableHead><TableHead>الاسم</TableHead><TableHead>المورد</TableHead><TableHead className="text-left">تكلفة/فرد</TableHead><TableHead className="text-left">بيع/فرد</TableHead><TableHead className="text-left text-emerald-600">ربح/فرد</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {comps.map(c => (
                  <TableRow key={c.id}>
                    <TableCell><Badge variant="outline">{COMPONENT_TYPES.find(t => t.v === c.component_type)?.l || c.component_type}</Badge></TableCell>
                    <TableCell className="font-semibold">{c.name}</TableCell>
                    <TableCell className="text-xs">{c.supplier_name}</TableCell>
                    <TableCell className="text-left">{fmt(c.cost_per_pax, pkg.currency)}</TableCell>
                    <TableCell className="text-left">{fmt(c.sale_per_pax, pkg.currency)}</TableCell>
                    <TableCell className="text-left text-emerald-600 font-bold">{fmt(c.sale_per_pax - c.cost_per_pax, pkg.currency)}</TableCell>
                    <TableCell>{pkg.status !== 'closed' && <Button size="sm" variant="ghost" onClick={() => delComp(c.id)} className="text-rose-600 h-6 w-6 p-0"><Trash2 className="w-3 h-3" /></Button>}</TableCell>
                  </TableRow>
                ))}
                {comps.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-6">لا توجد مكونات — أضف تأشيرة، تذكرة، فندق، نقل...</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}
        {tab === 'bookings' && (
          <div className="space-y-3">
            {pkg.status !== 'closed' && (
              <div className="grid grid-cols-1 md:grid-cols-6 gap-2 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <Field label="حساب القبض"><Select value={newBooking.client_id} onValueChange={v => setNewBooking({ ...newBooking, client_id: v })}><SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger><SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="اسم المعتمر/المسافر"><Input value={newBooking.pilgrim_name} onChange={e => setNewBooking({ ...newBooking, pilgrim_name: e.target.value })} /></Field>
                <Field label="رقم الجواز"><Input value={newBooking.passport_no} onChange={e => setNewBooking({ ...newBooking, passport_no: e.target.value })} /></Field>
                <Field label="عدد الأفراد"><Input type="number" min="1" value={newBooking.pax_count} onChange={e => setNewBooking({ ...newBooking, pax_count: e.target.value })} /></Field>
                <Field label="الدفع"><Select value={newBooking.payment_method} onValueChange={v => setNewBooking({ ...newBooking, payment_method: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="credit">🕓 آجل</SelectItem><SelectItem value="cash">💵 نقد</SelectItem></SelectContent></Select></Field>
                <div className="flex items-end"><Button onClick={addBooking} className="w-full bg-emerald-600 text-white gap-1"><Plus className="w-4 h-4" /> تسجيل + قيد</Button></div>
                {newBooking.payment_method === 'cash' && <div className="md:col-span-6"><Field label="الصندوق"><Select value={newBooking.box_id} onValueChange={v => setNewBooking({ ...newBooking, box_id: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{boxes.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar}</SelectItem>)}</SelectContent></Select></Field></div>}
              </div>
            )}
            <Table>
              <TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>المعتمر/المسافر</TableHead><TableHead>حساب القبض</TableHead><TableHead>الجواز</TableHead><TableHead className="text-center">أفراد</TableHead><TableHead>الدفع</TableHead><TableHead className="text-left">تكلفة</TableHead><TableHead className="text-left">بيع</TableHead><TableHead className="text-left text-emerald-600">ربح</TableHead></TableRow></TableHeader>
              <TableBody>
                {bookings.map(b => (
                  <TableRow key={b.id}>
                    <TableCell className="text-xs">{fmtDate(b.created_at)}</TableCell>
                    <TableCell className="font-semibold">{b.pilgrim_name}</TableCell>
                    <TableCell className="text-xs">{b.client_name}</TableCell>
                    <TableCell className="font-mono text-xs">{b.passport_no || '—'}</TableCell>
                    <TableCell className="text-center">{b.pax_count}</TableCell>
                    <TableCell>{b.payment_method === 'cash' ? '💵' : '🕓'}</TableCell>
                    <TableCell className="text-left">{fmt(b.total_cost, b.currency)}</TableCell>
                    <TableCell className="text-left">{fmt(b.total_sale, b.currency)}</TableCell>
                    <TableCell className="text-left text-emerald-600 font-bold">{fmt(b.commission, b.currency)}</TableCell>
                  </TableRow>
                ))}
                {bookings.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-6">لا يوجد مسجلون بعد</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>إغلاق</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PackageReportDialog({ pkg, onClose }) {
  const [data, setData] = useState(null)
  useEffect(() => { api(`/packages/${pkg.id}/report`).then(setData).catch(e => toast.error(e.message)) }, [pkg.id])
  if (!data) return <Dialog open={true} onOpenChange={onClose}><DialogContent dir="rtl"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></DialogContent></Dialog>
  const cur = pkg.currency
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>📊 تقرير مالي — {pkg.name}</DialogTitle>
          <DialogDescription>ملخص كامل لأداء الباكج (المبيعات، التكاليف، صافي الربح)</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-3"><div className="text-xs text-slate-500">المسجلون</div><div className="text-2xl font-bold">{data.totals.bookings}</div><div className="text-[10px] text-slate-400">{data.totals.pax} فرد</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-slate-500">الإيرادات</div><div className="text-xl font-bold text-blue-600">{fmt(data.totals.revenue, cur)}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-slate-500">التكاليف للموردين</div><div className="text-xl font-bold text-rose-600">{fmt(data.totals.cost, cur)}</div></CardContent></Card>
          <Card className="grad-brand text-white border-0"><CardContent className="p-3"><div className="text-xs opacity-90">صافي الربح</div><div className="text-2xl font-extrabold">{fmt(data.totals.profit, cur)}</div><div className="text-[10px] opacity-80">هامش {data.margin_pct}%</div></CardContent></Card>
        </div>
        <div>
          <div className="font-bold text-sm mb-2">💰 توزيع التكاليف على الموردين</div>
          <Table><TableHeader><TableRow><TableHead>المورد</TableHead><TableHead className="text-left">إجمالي التكلفة ({cur})</TableHead></TableRow></TableHeader><TableBody>
            {data.supplier_breakdown.map((s, i) => <TableRow key={i}><TableCell>{s.name}</TableCell><TableCell className="text-left font-bold text-rose-600">{fmt(s.cost, cur)}</TableCell></TableRow>)}
            {data.supplier_breakdown.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-slate-400 py-4">لا توجد بيانات</TableCell></TableRow>}
          </TableBody></Table>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>إغلاق</Button><Button onClick={() => window.print()} className="grad-brand text-white gap-2"><Printer className="w-4 h-4" /> طباعة</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
  const [permTarget, setPermTarget] = useState(null)
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
  const deleteUser = async (u) => {
    if (!confirm(`حذف الموظف ${u.name} (${u.email})؟`)) return
    try { await api(`/tenant/users/${u.id}`, { method: 'DELETE' }); setUsers(await api('/tenant/users')); toast.success('تم الحذف') }
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
          <TabsTrigger value="referrals">🎁 نظام الإحالة</TabsTrigger>
          <TabsTrigger value="extension">🕋 إضافة المتصفح</TabsTrigger>
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
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-900">
                <b>ℹ️ تنويه:</b> المالك (Owner) يحصل تلقائياً على كافة الصلاحيات. الموظف الجديد يبدأ بصلاحيات محدودة (عرض وإضافة التذاكر/التأشيرات/الخدمات فقط). اضغط على <b>"تعديل الصلاحيات"</b> بجانب اسم الموظف لضبط ما يستطيع فعله.
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>الاسم</TableHead><TableHead>البريد</TableHead><TableHead>الدور</TableHead><TableHead>الحالة</TableHead><TableHead className="text-center">الصلاحيات</TableHead><TableHead className="text-left">إجراء</TableHead></TableRow></TableHeader>
                <TableBody>
                  {users.map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="font-semibold">{u.name}</TableCell>
                      <TableCell dir="ltr" className="text-xs">{u.email}</TableCell>
                      <TableCell><Badge variant={u.role === 'owner' ? 'default' : 'outline'}>{u.role === 'owner' ? 'مالك' : 'موظف'}</Badge></TableCell>
                      <TableCell><Badge className={u.active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : 'bg-rose-100 text-rose-700 hover:bg-rose-100'}>{u.active ? 'نشط' : 'موقوف'}</Badge></TableCell>
                      <TableCell className="text-center">
                        {u.role === 'owner' ? (
                          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">كاملة</Badge>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setPermTarget(u)} className="gap-1 h-7 text-xs">
                            <Key className="w-3 h-3" /> تعديل الصلاحيات
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="text-left">
                        {u.role !== 'owner' && (
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="outline" onClick={() => toggleUser(u)} title={u.active ? 'إيقاف' : 'تفعيل'}><Power className="w-3 h-3" /></Button>
                            <Button size="sm" variant="outline" onClick={() => deleteUser(u)} className="text-rose-600" title="حذف"><Trash2 className="w-3 h-3" /></Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <PermissionsDialog target={permTarget} onClose={() => setPermTarget(null)} onSaved={() => { setPermTarget(null); api('/tenant/users').then(setUsers).catch(() => {}); toast.success('تم حفظ الصلاحيات') }} />
        </TabsContent>

        <TabsContent value="rates" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ArrowLeftRight className="w-5 h-5 text-fuchsia-600" /> دليل أسعار العملات</CardTitle>
              <CardDescription>العملة الأساسية للنظام هي <b>الريال اليمني (YER)</b>. الأسعار تمثل: 1 وحدة من العملة = كم ريال يمني</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>العملة</TableHead>
                    <TableHead>تحويل إلى</TableHead>
                    <TableHead className="text-left">سعر التحويل</TableHead>
                    <TableHead className="text-left">سعر الشراء</TableHead>
                    <TableHead className="text-left">سعر البيع</TableHead>
                    <TableHead className="text-left">الحد الأدنى</TableHead>
                    <TableHead className="text-left">الحد الأعلى</TableHead>
                    <TableHead>ملاحظات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {CURRENCIES.map(c => {
                    const r = f.rates?.[c] || {}
                    const rObj = typeof r === 'object' ? r : { transfer: r, buy: r, sell: r, min: r, max: r, remarks: '' }
                    const upd = (k, v) => setF({ ...f, rates: { ...f.rates, [c]: { ...rObj, [k]: v === '' ? '' : Number(v) } } })
                    return (
                      <TableRow key={c}>
                        <TableCell><Badge className="text-sm font-bold" variant="outline">{c}</Badge> <span className="text-xs text-slate-500">{CUR_NAME[c]}</span></TableCell>
                        <TableCell><Badge variant="secondary">YER</Badge></TableCell>
                        <TableCell><Input type="number" step="0.0001" value={rObj.transfer || ''} onChange={e => upd('transfer', e.target.value)} className="w-28 text-left font-bold" disabled={c === 'YER'} /></TableCell>
                        <TableCell><Input type="number" step="0.0001" value={rObj.buy || ''} onChange={e => upd('buy', e.target.value)} className="w-28 text-left" disabled={c === 'YER'} /></TableCell>
                        <TableCell><Input type="number" step="0.0001" value={rObj.sell || ''} onChange={e => upd('sell', e.target.value)} className="w-28 text-left" disabled={c === 'YER'} /></TableCell>
                        <TableCell><Input type="number" step="0.0001" value={rObj.min || ''} onChange={e => upd('min', e.target.value)} className="w-28 text-left" disabled={c === 'YER'} /></TableCell>
                        <TableCell><Input type="number" step="0.0001" value={rObj.max || ''} onChange={e => upd('max', e.target.value)} className="w-28 text-left" disabled={c === 'YER'} /></TableCell>
                        <TableCell><Input value={rObj.remarks || ''} onChange={e => setF({ ...f, rates: { ...f.rates, [c]: { ...rObj, remarks: e.target.value } } })} className="w-40" placeholder="ملاحظة" disabled={c === 'YER'} /></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {/* Direct USD/SAR Cross-Rate */}
              <div className="mt-4 p-3 border-2 border-fuchsia-200 rounded-lg bg-fuchsia-50/50">
                <div className="text-sm font-bold text-fuchsia-800 mb-2 flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4" /> سعر التحويل المباشر بين الدولار والريال السعودي (USD ↔ SAR)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Field label="سعر التحويل المباشر">
                    <Input type="number" step="0.0001" value={f.pair_usd_sar?.transfer ?? 3.75}
                      onChange={e => setF({ ...f, pair_usd_sar: { ...(f.pair_usd_sar || {}), transfer: Number(e.target.value) } })} className="text-lg font-bold" />
                  </Field>
                  <Field label="سعر شراء الدولار (SAR)">
                    <Input type="number" step="0.0001" value={f.pair_usd_sar?.buy ?? 3.74}
                      onChange={e => setF({ ...f, pair_usd_sar: { ...(f.pair_usd_sar || {}), buy: Number(e.target.value) } })} />
                  </Field>
                  <Field label="سعر بيع الدولار (SAR)">
                    <Input type="number" step="0.0001" value={f.pair_usd_sar?.sell ?? 3.76}
                      onChange={e => setF({ ...f, pair_usd_sar: { ...(f.pair_usd_sar || {}), sell: Number(e.target.value) } })} />
                  </Field>
                  <Field label="ملاحظات">
                    <Input value={f.pair_usd_sar?.remarks || ''}
                      onChange={e => setF({ ...f, pair_usd_sar: { ...(f.pair_usd_sar || {}), remarks: e.target.value } })} placeholder="سعر السوق اليومي" />
                  </Field>
                </div>
                <div className="text-xs text-slate-500 mt-2">💡 يُستخدم هذا السعر مباشرة عند التحويل بين $/SAR دون المرور بالريال اليمني — مثلاً: 1 USD = 3.75 SAR</div>
              </div>
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-slate-600 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" /> <span>الأسعار الافتراضية: <b>1 USD = 1,554 YER</b> | <b>1 SAR = 410 YER</b> — يمكنك تعديلها لتناسب معدلات السوق اليومية</span>
              </div>
            </CardContent>
            <div className="p-4"><Button onClick={save} disabled={saving} className="grad-brand text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ أسعار العملات'}</Button></div>
          </Card>
        </TabsContent>

        <TabsContent value="referrals" className="mt-4">
          <ReferralsTab />
        </TabsContent>

        <TabsContent value="extension" className="mt-4">
          <ExtensionTab />
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
  const [announcements, setAnnouncements] = useState([])
  const [popupShown, setPopupShown] = useState(false)
  const [popupAnn, setPopupAnn] = useState(null)
  const [isImpersonating, setIsImpersonating] = useState(false)
  const [quotaModalOpen, setQuotaModalOpen] = useState(false)

  useEffect(() => {
    // Load announcements
    api('/announcements/active').then(list => {
      setAnnouncements(list || [])
      const popup = (list || []).find(a => a.type === 'popup')
      if (popup && !sessionStorage.getItem(`rahaal_popup_${popup.id}_seen`)) {
        setPopupAnn(popup); setPopupShown(true)
      }
    }).catch(() => {})
    // Detect impersonation via /auth/me flag
    api('/auth/me').then(me => { if (me?.impersonation) setIsImpersonating(true) }).catch(() => {})
    // Register global quota-exceeded listener
    window.__rahaalOnQuotaExceeded = () => setQuotaModalOpen(true)
    return () => { delete window.__rahaalOnQuotaExceeded }
  }, [])

  const banner = announcements.find(a => a.type === 'banner')

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar current={tab} onChange={setTab} />
      <main className="flex-1 p-6 md:p-8 max-w-[1600px]">
        {isImpersonating && (
          <div className="mb-3 px-4 py-2 rounded-lg bg-gradient-to-l from-red-600 to-rose-600 text-white flex items-center gap-2 shadow-lg animate-pulse">
            <span className="text-xl">👁️</span>
            <div className="font-bold text-sm">أنت متصفّح كـ Super Admin — جلسة مؤقتة</div>
            <Button size="sm" variant="secondary" className="mr-auto h-7" onClick={logout}>إنهاء الجلسة</Button>
          </div>
        )}
        {banner && (
          <div className="mb-3 px-4 py-2 rounded-lg bg-gradient-to-l from-amber-500 to-orange-500 text-white flex items-center gap-2 shadow-md">
            <span className="text-xl">📢</span>
            <div className="flex-1"><b className="text-sm">{banner.title}:</b> <span className="text-sm">{banner.body}</span></div>
            {banner.link_url && <a href={banner.link_url} target="_blank" rel="noopener" className="text-xs underline">تفاصيل</a>}
          </div>
        )}
        <div className="flex justify-end mb-2">
          <Button variant="ghost" onClick={logout} className="gap-2 text-slate-500 hover:text-rose-600"><LogOut className="w-4 h-4" /> خروج</Button>
        </div>
        <QuotaBanner quota={tenant?.journal_quota} />
        {tab === 'dashboard' && <Dashboard setTab={setTab} />}
        {tab === 'tickets' && <TicketsScreen />}
        {tab === 'visas' && <VisasScreen />}
        {tab === 'services' && <ServicesScreen />}
        {tab === 'packages' && <PackagesScreen />}
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
        {tab === 'affiliate' && <AffiliateScreen />}

        {/* v2.8.1 — Global footer with contact + Target Media badge */}
        <div className="mt-8 pt-4 border-t border-slate-200 text-center text-xs text-slate-500 space-y-2">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <span>📍 اليمن - عدن - الشيخ عثمان - بجانب بنك التضامن</span>
            <span className="text-slate-300">·</span>
            <span dir="ltr">📞 +967 781 115 482</span>
            <span className="text-slate-300">·</span>
            <span dir="ltr">📞 +967 781 455 584</span>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            <span className="text-[11px]">Powered by</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#1e3a8a" strokeWidth="2.5" />
              <circle cx="12" cy="12" r="5" fill="#f97316" />
              <circle cx="12" cy="12" r="1.5" fill="#fff" />
            </svg>
            <span className="text-xs font-black text-[#1e3a8a]">Target Media</span>
            <span className="text-[10px]">· تارجت ميديا</span>
            <span>© 2025</span>
          </div>
        </div>
      </main>

      {/* Popup Announcement */}
      {popupShown && popupAnn && (
        <Dialog open={popupShown} onOpenChange={(v) => { setPopupShown(v); if (!v) sessionStorage.setItem(`rahaal_popup_${popupAnn.id}_seen`, '1') }}>
          <DialogContent className="max-w-lg" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">📢 {popupAnn.title}</DialogTitle>
            </DialogHeader>
            {popupAnn.image_url && <img src={popupAnn.image_url} alt="" className="w-full rounded-lg" />}
            <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{popupAnn.body}</div>
            {popupAnn.link_url && <a href={popupAnn.link_url} target="_blank" rel="noopener" className="text-blue-600 font-bold text-sm">🔗 المزيد</a>}
            <DialogFooter>
              <Button onClick={() => { setPopupShown(false); sessionStorage.setItem(`rahaal_popup_${popupAnn.id}_seen`, '1') }} className="grad-brand text-white">فهمت — إغلاق</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Out-of-Quota Modal */}
      <OutOfQuotaModal open={quotaModalOpen} onOpenChange={setQuotaModalOpen} tenant={tenant} />
    </div>
  )
}

function OutOfQuotaModal({ open, onOpenChange, tenant }) {
  const [plans, setPlans] = useState([])
  const [refCode, setRefCode] = useState('')
  useEffect(() => {
    if (!open) return
    api('/plans').then(setPlans).catch(() => {})
    api('/referrals').then(r => setRefCode(r.code)).catch(() => {})
  }, [open])
  const publicBase = typeof window !== 'undefined' ? window.location.origin : ''
  const inviteLink = `${publicBase}/signup?ref=${refCode}`
  const shareWA = () => {
    const msg = `🎁 انضم إلى منصة رحّال (Rahaal ERP)!\nاحصل على 30 قيد تجريبي مجاناً + أكسب +50 قيد إضافي عبر رابط الإحالة:\n${inviteLink}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }
  const copy = (t) => { navigator.clipboard.writeText(t); toast.success('📋 تم النسخ') }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-rose-700">⚠️ انتهت حصّة القيود</DialogTitle>
          <DialogDescription>لقد استنفدت جميع القيود المتاحة في باقتك. اختر إحدى الطريقتين لمواصلة العمل:</DialogDescription>
        </DialogHeader>
        <div className="grid md:grid-cols-2 gap-3">
          <Card className="border-emerald-300 bg-emerald-50">
            <CardHeader className="pb-2"><CardTitle className="text-emerald-800">🎁 ادعُ مكتباً</CardTitle><CardDescription>احصل على +50 قيد فوراً</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              <div className="text-xs text-emerald-800">ادعُ مكتب سفريات آخر عبر رابطك الخاص، وستحصل على <b>+50 قيد إضافي فوراً</b> عند تسجيله. لا حدود لعدد الإحالات!</div>
              <div className="p-2 bg-white rounded border text-xs" dir="ltr">{inviteLink}</div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => copy(inviteLink)} className="flex-1">📋 نسخ الرابط</Button>
                <Button size="sm" onClick={shareWA} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white">📲 مشاركة واتساب</Button>
              </div>
            </CardContent>
          </Card>
          <Card className="border-blue-300 bg-blue-50">
            <CardHeader className="pb-2"><CardTitle className="text-blue-800">💳 حاسِب وسدّد</CardTitle><CardDescription>باقات متنوعة قابلة للترقية</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {plans.length === 0 ? <div className="text-xs text-slate-400">لا توجد باقات متاحة</div> : plans.map(p => (
                <div key={p.id} className="p-2 bg-white rounded border flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-slate-800">{p.name}</div>
                    <div className="text-[11px] text-slate-500">{p.description}</div>
                  </div>
                  <Badge className="bg-blue-600 text-white hover:bg-blue-600 text-sm">${p.price_usd}</Badge>
                </div>
              ))}
              <div className="text-[11px] text-blue-800 mt-2">💬 للسداد والاشتراك، تواصل مع الإدارة العامة عبر واتساب أو البريد.</div>
              <Button size="sm" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent('أرغب في ترقية باقة رحّال ERP لمكتب: ' + (tenant?.name || ''))}`, '_blank')} className="w-full bg-blue-600 hover:bg-blue-700 text-white">📲 تواصل مع الإدارة</Button>
            </CardContent>
          </Card>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================================================================
// CURRENCY EXCHANGE SCREEN (Buy / Sell)
// ================================================================
function FxScreen() {
  const { settings, tenant } = useAuth()
  const [txs, setTxs] = useState([])
  const [boxes, setBoxes] = useState([])
  const [openBuy, setOpenBuy] = useState(false)
  const [openSell, setOpenSell] = useState(false)
  const [openSearch, setOpenSearch] = useState(false)
  const [filter, setFilter] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [editing, setEditing] = useState(null)
  const load = async () => {
    try {
      const [t, b] = await Promise.all([api('/fx'), api('/boxes')])
      setTxs(t); setBoxes(b)
    } catch (e) { toast.error(e.message) }
  }
  useEffect(() => { load() }, [])
  const filtered = applyFilter(txs, filter)
  const selected = filtered.find(t => t.id === selectedId)
  const totalGain = filtered.reduce((s, t) => s + (t.fx_gain_usd || t.fx_gain_base || 0), 0)
  const handleEdit = () => {
    if (!selected) return toast.error('اختر عملية أولاً')
    setEditing(selected)
    if (selected.type === 'buy') setOpenBuy(true); else setOpenSell(true)
  }
  const handleDelete = async () => {
    if (!selectedId) return
    if (!confirm('حذف هذه العملية وعكس القيد المحاسبي؟')) return
    try { await api(`/fx/${selectedId}`, { method: 'DELETE' }); toast.success('تم الحذف'); setSelectedId(null); load() }
    catch (e) { toast.error(e.message) }
  }
  const handlePrintVoucher = () => {
    if (!selected) return toast.error('اختر عملية أولاً')
    printVoucher({ kind: 'fx', record: selected, settings, tenant })
  }
  const handlePrintTable = () => {
    const totals = { amount: 0, counter_amount: 0, fx_gain: 0 }
    for (const r of filtered) { totals.amount += r.amount; totals.counter_amount += r.counter_amount; totals.fx_gain += (r.fx_gain_usd || r.fx_gain_base || 0) }
    printTable({
      title: 'كشف عمليات الصرافة', settings, tenant, rows: filtered,
      columns: [
        { key: 'date', label: 'التاريخ', render: r => fmtDate(r.date) },
        { key: 'type', label: 'النوع', render: r => r.type === 'buy' ? 'شراء' : 'بيع' },
        { key: 'currency', label: 'العملة' },
        { key: 'amount', label: 'المبلغ', align: 'left', render: r => fmt(r.amount, r.currency) },
        { key: 'exchange_rate', label: 'السعر', render: r => String(r.exchange_rate) },
        { key: 'counter_currency', label: 'مقابل' },
        { key: 'counter_amount', label: 'القيمة', align: 'left', render: r => fmt(r.counter_amount, r.counter_currency) },
        { key: 'customer_name', label: 'الزبون' },
        { key: 'fx_gain_usd', label: 'فرق الصرف', align: 'left', render: r => fmt(r.fx_gain_usd || r.fx_gain_base || 0, 'YER') },
      ],
      totals: { amount: totals.amount.toFixed(2), counter_amount: totals.counter_amount.toFixed(2), fx_gain_usd: totals.fx_gain.toFixed(2) },
    })
  }
  return (
    <div className="space-y-4">
      <TopBar
        title="صرافة العملات"
        subtitle="شراء وبيع العملات مع حساب فروق الصرف تلقائياً في قائمة الدخل"
        right={
          <div className="flex gap-2">
            <Button onClick={() => { setEditing(null); setOpenBuy(true) }} className="gap-2 grad-green text-white shadow-lg"><ArrowDownLeft className="w-4 h-4" /> شراء عملة</Button>
            <Button onClick={() => { setEditing(null); setOpenSell(true) }} className="gap-2 grad-rose text-white shadow-lg"><ArrowUpRight className="w-4 h-4" /> بيع عملة</Button>
          </div>
        }
      />

      <ActionToolbar
        onRefresh={load} onSearch={() => setOpenSearch(true)}
        onEdit={handleEdit} onDelete={handleDelete} onPrintVoucher={handlePrintVoucher} onPrintTable={handlePrintTable}
        selectedId={selectedId} count={filtered.length}
      />

      {filter && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs">
          <Filter className="w-4 h-4 text-blue-600" /> فلتر: <b>{filter.field}</b> "<b>{filter.term}</b>"
          <Button size="sm" variant="ghost" onClick={() => setFilter(null)} className="mr-auto text-rose-600">مسح</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={ArrowLeftRight} label="إجمالي عمليات الصرافة" value={filtered.length} grad="grad-purple" />
        <StatCard icon={TrendingUp} label={totalGain >= 0 ? 'إجمالي أرباح فروق العملات' : 'إجمالي خسائر فروق العملات'} value={fmt(totalGain, 'YER')} grad={totalGain >= 0 ? 'grad-green' : 'grad-rose'} />
        <StatCard icon={Sparkles} label="آخر عملية" value={filtered[0] ? fmtDate(filtered[0].date) : '—'} grad="grad-brand" />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ArrowLeftRight className="w-5 h-5 text-fuchsia-600" /> سجل عمليات الصرافة</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>التاريخ</TableHead><TableHead>النوع</TableHead>
                <TableHead>المبلغ</TableHead><TableHead>السعر</TableHead>
                <TableHead>القيمة</TableHead><TableHead>العميل</TableHead>
                <TableHead>الغرض</TableHead>
                <TableHead className="text-left">فرق الصرف</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8">لا توجد عمليات صرافة</TableCell></TableRow>}
                {filtered.map(t => {
                  const gain = t.fx_gain_usd || t.fx_gain_base || 0
                  return (
                    <TableRow key={t.id} className={selectedId === t.id ? 'bg-blue-50' : 'cursor-pointer hover:bg-slate-50'} onClick={() => setSelectedId(t.id === selectedId ? null : t.id)}>
                      <TableCell><input type="radio" checked={selectedId === t.id} onChange={() => setSelectedId(t.id)} /></TableCell>
                      <TableCell className="text-xs">{fmtDate(t.date)}</TableCell>
                      <TableCell><Badge className={t.type === 'buy' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : 'bg-rose-100 text-rose-700 hover:bg-rose-100'}>{t.type === 'buy' ? 'شراء' : 'بيع'}</Badge></TableCell>
                      <TableCell className="font-bold">{fmt(t.amount, t.currency)}</TableCell>
                      <TableCell className="font-mono text-xs">{t.exchange_rate}</TableCell>
                      <TableCell className="font-bold">{fmt(t.counter_amount, t.counter_currency)}</TableCell>
                      <TableCell>{t.customer_name || '—'}</TableCell>
                      <TableCell className="text-xs">{t.purpose || '—'}</TableCell>
                      <TableCell className={`text-left font-bold ${gain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(gain, 'YER')}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <FxDialog open={openBuy} onOpenChange={(v) => { setOpenBuy(v); if (!v) setEditing(null) }} type="buy" boxes={boxes} record={editing?.type === 'buy' ? editing : null} onSaved={() => { load(); setEditing(null); toast.success(editing ? '✅ تم تعديل العملية وعكس القيد تلقائياً' : 'تم تسجيل عملية الشراء + قيد محاسبي') }} />
      <FxDialog open={openSell} onOpenChange={(v) => { setOpenSell(v); if (!v) setEditing(null) }} type="sell" boxes={boxes} record={editing?.type === 'sell' ? editing : null} onSaved={() => { load(); setEditing(null); toast.success(editing ? '✅ تم تعديل العملية وعكس القيد تلقائياً' : 'تم تسجيل عملية البيع + قيد محاسبي') }} />
      <UniversalSearchModal open={openSearch} onOpenChange={setOpenSearch}
        fields={[
          { key: 'customer_name', label: 'اسم الزبون' }, { key: 'currency', label: 'العملة' },
          { key: 'counter_currency', label: 'العملة المقابلة' }, { key: 'purpose', label: 'الغرض' },
          { key: 'id_number', label: 'رقم الهوية' }, { key: 'amount', label: 'المبلغ' },
        ]}
        onApply={setFilter} onClear={() => setFilter(null)}
      />
    </div>
  )
}

function FxDialog({ open, onOpenChange, type, boxes, onSaved, record }) {
  const isEdit = !!record
  const cfg = type === 'buy'
    ? { title: 'شراء عملات', color: 'grad-green', desc: 'يشتري المكتب عملة من الزبون ويدفع مقابلها بعملة أخرى' }
    : { title: 'بيع عملات', color: 'grad-rose', desc: 'يبيع المكتب عملة للزبون ويستلم مقابلها بعملة أخرى' }
  const emptyForm = {
    date: todayISO(), currency: 'USD', amount: '', exchange_rate: '',
    counter_currency: 'SAR', payment_method: 'cash',
    box_currency_id: '', box_counter_id: '',
    account_currency_id: '', account_counter_id: '',  // For 'account' mode; encoded as `${kind}:${id}`
    customer_name: '', customer_phone: '', id_type: 'هوية وطنية', id_number: '',
    source_of_funds: '', purpose: '', remarks: '',
  }
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [allAccounts, setAllAccounts] = useState([])
  useEffect(() => {
    if (!open) return
    if (record) {
      setForm({
        date: record.date ? new Date(record.date).toISOString().slice(0,10) : todayISO(),
        currency: record.currency || 'USD', amount: record.amount ?? '',
        exchange_rate: record.exchange_rate ?? '',
        counter_currency: record.counter_currency || 'SAR',
        payment_method: record.payment_method || 'cash',
        box_currency_id: record.box_currency_id || '',
        box_counter_id: record.box_counter_id || '',
        account_currency_id: record.currency_ref ? `${record.currency_ref.kind}:${record.currency_ref.id}` : '',
        account_counter_id: record.counter_ref ? `${record.counter_ref.kind}:${record.counter_ref.id}` : '',
        customer_name: record.customer_name || '', customer_phone: record.customer_phone || '',
        id_type: record.id_type || 'هوية وطنية', id_number: record.id_number || '',
        source_of_funds: record.source_of_funds || '', purpose: record.purpose || '',
        remarks: record.remarks || '',
      })
    } else {
      setForm(emptyForm)
    }
  }, [open, record])
  useEffect(() => {
    if (boxes.length && !form.box_currency_id) {
      setForm(f => ({ ...f, box_currency_id: boxes[0].id, box_counter_id: boxes[1]?.id || boxes[0].id }))
    }
  }, [boxes])
  // Load full chart of accounts when switching to 'account' mode
  useEffect(() => {
    if (open && form.payment_method === 'account' && allAccounts.length === 0) {
      api('/accounts/all').then(setAllAccounts).catch(() => {})
    }
  }, [open, form.payment_method])
  const counter_amount = (Number(form.amount) || 0) * (Number(form.exchange_rate) || 0)
  const parseRef = (v) => { if (!v) return null; const [kind, id] = v.split(':'); return { kind, id } }
  const submit = async () => {
    if (!form.amount || !form.exchange_rate) return toast.error('أدخل المبلغ وسعر الصرف')
    if (form.currency === form.counter_currency) return toast.error('اختر عملتين مختلفتين')
    const body = { type, ...form }
    if (form.payment_method === 'account') {
      if (!form.account_currency_id || !form.account_counter_id) return toast.error('اختر الحسابين للطرفين')
      body.currency_ref = parseRef(form.account_currency_id)
      body.counter_ref = parseRef(form.account_counter_id)
    } else {
      if (!form.box_currency_id || !form.box_counter_id) return toast.error('اختر الصناديق')
    }
    try {
      setSaving(true)
      if (isEdit) await api(`/fx/${record.id}`, { method: 'PUT', body })
      else await api('/fx', { method: 'POST', body })
      onOpenChange(false); onSaved(); setForm(f => ({ ...f, amount: '', exchange_rate: '', customer_name: '', customer_phone: '', id_number: '', source_of_funds: '', purpose: '', remarks: '' }))
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  const isCash = form.payment_method === 'cash'
  // For "cash" mode: only cash boxes and banks (kind='box') from allAccounts, or fallback to boxes prop
  const cashOptions = boxes  // already only boxes
  const accountOptions = allAccounts  // full COA
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className={`w-9 h-9 rounded-lg ${cfg.color} flex items-center justify-center`}><ArrowLeftRight className="w-4 h-4 text-white" /></div>
            {isEdit ? `✏️ تعديل ${cfg.title}` : cfg.title}
          </DialogTitle>
          <DialogDescription>{isEdit ? 'سيتم عكس القيد المحاسبي القديم وإعادة الترحيل بالقيم الجديدة تلقائياً' : cfg.desc}</DialogDescription>
        </DialogHeader>

        {/* Payment method selector */}
        <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
          <div className="text-xs font-bold text-slate-600 mb-2">طريقة الدفع / التسوية</div>
          <div className="flex gap-2">
            <button onClick={() => setForm({ ...form, payment_method: 'cash' })} className={`px-4 py-2 rounded-lg text-sm font-bold border transition ${isCash ? 'bg-emerald-500 text-white border-emerald-600 shadow' : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-400'}`}>💵 نقد (صناديق / بنوك)</button>
            <button onClick={() => setForm({ ...form, payment_method: 'account' })} className={`px-4 py-2 rounded-lg text-sm font-bold border transition ${!isCash ? 'bg-blue-500 text-white border-blue-600 shadow' : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'}`}>📒 حساب (الدليل المحاسبي كامل)</button>
          </div>
          {!isCash && (
            <div className="text-[11px] text-blue-700 mt-2">✨ يتم تسوية العملية على حسابات من الدليل المحاسبي (عملاء، موردين، مصروفات، إيرادات، أصول، خصوم...) دون تحريك نقدي</div>
          )}
        </div>

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
          {isCash ? (
            <>
              <Field label={`صندوق ${form.currency}`} required><Select value={form.box_currency_id} onValueChange={v => setForm({ ...form, box_currency_id: v })}><SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger><SelectContent>{cashOptions.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar}</SelectItem>)}</SelectContent></Select></Field>
              <Field label={`صندوق ${form.counter_currency}`} required><Select value={form.box_counter_id} onValueChange={v => setForm({ ...form, box_counter_id: v })}><SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger><SelectContent>{cashOptions.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar}</SelectItem>)}</SelectContent></Select></Field>
            </>
          ) : (
            <>
              <Field label={`حساب ${form.currency}`} required>
                <Select value={form.account_currency_id} onValueChange={v => setForm({ ...form, account_currency_id: v })}>
                  <SelectTrigger><SelectValue placeholder={`اختر من ${accountOptions.length}`} /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {accountOptions.map(a => (
                      <SelectItem key={`${a.kind}:${a.id}`} value={`${a.kind}:${a.id}`}>
                        <span className="inline-flex items-center gap-2"><Badge variant="outline" className="text-[10px] px-1 py-0">{a.group}</Badge><span>{a.name}</span></span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={`حساب ${form.counter_currency}`} required>
                <Select value={form.account_counter_id} onValueChange={v => setForm({ ...form, account_counter_id: v })}>
                  <SelectTrigger><SelectValue placeholder={`اختر من ${accountOptions.length}`} /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {accountOptions.map(a => (
                      <SelectItem key={`${a.kind}:${a.id}`} value={`${a.kind}:${a.id}`}>
                        <span className="inline-flex items-center gap-2"><Badge variant="outline" className="text-[10px] px-1 py-0">{a.group}</Badge><span>{a.name}</span></span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </>
          )}
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
          <Button onClick={submit} disabled={saving} className={`${cfg.color} text-white`}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEdit ? '💾 حفظ التعديل + عكس القيد' : 'حفظ + إنشاء قيد')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================================================================
// MANUAL JOURNAL VOUCHER DIALOG (Single & Dual)
// ================================================================
function ManualJournalDialog({ open, onOpenChange, onSaved, record }) {
  const isEdit = !!record
  const initialMode = record?.ref_type === 'manual_dual' ? 'dual' : 'single'
  const [mode, setMode] = useState(initialMode)
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

  useEffect(() => {
    if (!open) return
    if (record) {
      const dateStr = record.date ? new Date(record.date).toISOString().slice(0,10) : todayISO()
      if (record.ref_type === 'manual_dual') {
        setMode('dual')
        const debitLine = (record.lines || []).find(l => (l.debit || 0) > 0) || {}
        const creditLine = (record.lines || []).find(l => (l.credit || 0) > 0 && l.account_code !== '4104') || {}
        setDualForm({
          date: dateStr, description: record.description || '',
          debit_account_code: debitLine.account_code || '', debit_account_name: debitLine.account_name || '',
          debit_currency: debitLine.currency || 'USD', debit_amount: debitLine.debit || '',
          credit_account_code: creditLine.account_code || '', credit_account_name: creditLine.account_name || '',
          credit_currency: creditLine.currency || 'SAR', credit_amount: creditLine.credit || '',
        })
      } else {
        setMode('single')
        setSingleForm({
          date: dateStr, currency: record.currency || 'USD', description: record.description || '',
          lines: (record.lines || []).map(l => ({
            account_code: l.account_code || '', account_name: l.account_name || '',
            party_type: l.party_type, party_id: l.party_id, party_name: l.party_name,
            debit: l.debit || '', credit: l.credit || '',
          })),
        })
      }
    }
  }, [open, record])

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
        if (isEdit) await api(`/journal-entries/${record.id}`, { method: 'PUT', body: singleForm })
        else await api('/journal-entries', { method: 'POST', body: singleForm })
      } else {
        if (!dualForm.debit_amount || !dualForm.credit_amount) return toast.error('أدخل المبالغ')
        if (isEdit) await api(`/journal-entries/${record.id}`, { method: 'PUT', body: { dual: true, ...dualForm } })
        else await api('/journal-entries', { method: 'POST', body: { dual: true, ...dualForm } })
      }
      toast.success(isEdit ? '✅ تم تعديل القيد اليدوي وعكس الأثر السابق تلقائياً' : 'تم حفظ القيد اليدوي')
      onOpenChange(false); onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="w-9 h-9 rounded-lg grad-slate flex items-center justify-center"><ReceiptText className="w-4 h-4 text-white" /></div>
            {isEdit ? '✏️ تعديل قيد يومي (يدوي)' : 'سند قيد يومي (يدوي)'}
          </DialogTitle>
          <DialogDescription>{isEdit ? 'سيتم عكس الأثر المحاسبي للقيد السابق تلقائياً' : 'لتسجيل التسويات المحاسبية أو القيود بين حسابات بعملات مختلفة'}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-2">
          <button onClick={() => setMode('single')} disabled={isEdit} className={`px-4 py-2 rounded-lg text-sm font-bold border ${mode === 'single' ? 'bg-blue-500 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300'} ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}>قيد عادي (عملة واحدة)</button>
          <button onClick={() => setMode('dual')} disabled={isEdit} className={`px-4 py-2 rounded-lg text-sm font-bold border ${mode === 'dual' ? 'bg-fuchsia-500 text-white border-fuchsia-600' : 'bg-white text-slate-600 border-slate-300'} ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}>قيد ثنائي (عملتين مختلفتين)</button>
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
          <Button onClick={submit} disabled={saving} className="grad-slate text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEdit ? '💾 حفظ التعديل + عكس القيد' : 'حفظ القيد')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================================================================
// v3.9 — TARGET MEDIA / RAHAAL PUBLIC LANDING PAGE
// ================================================================
function LandingPage({ onLoginClick, onSignupClick }) {
  const [openMobile, setOpenMobile] = useState(false)
  const features = [
    { icon: '💱', title: 'محاسبة متعدّدة العملات', desc: 'قيد مزدوج آلي بـ USD / SAR / YER مع أسعار صرف يومية وتقارير موحّدة.', color: 'from-blue-500 to-cyan-500' },
    { icon: '✈️', title: 'إدارة التذاكر والحجوزات', desc: 'إصدار تذاكر جوي وبري، طباعة احترافية، ومطابقة مع الموردين لحظياً.', color: 'from-orange-500 to-red-500' },
    { icon: '🛂', title: 'تأشيرات وموافقات', desc: 'إدارة تأشيرات العمرة والزيارة والعمل والموافقات الأمنية مع تنبيهات الصلاحية.', color: 'from-emerald-500 to-teal-500' },
    { icon: '🕋', title: 'الباكجات والبرامج السياحية', desc: 'إنشاء باكجات كاملة مع تكاليف المكونات وتقارير ربحية لحظية عند إغلاق الباكج.', color: 'from-fuchsia-500 to-pink-500' },
    { icon: '📊', title: 'تقارير مالية ذكية', desc: 'ميزانية عمومية، أرباح وخسائر، كشف حساب تفاعلي، ومقارنة ربحية الباكجات.', color: 'from-indigo-500 to-blue-500' },
    { icon: '📱', title: 'تكامل واتساب ذكي', desc: 'إرسال كشوف الحسابات والتذاكر عبر واتساب بقالب ديناميكي حسب نوع الرحلة.', color: 'from-green-500 to-emerald-500' },
    { icon: '💸', title: 'الإحالة والإحصائيات', desc: 'نظام إحالة يمنحك 50 قيد مجاني مكافأة عن كل مكتب مشترك يدفع فعلياً.', color: 'from-amber-500 to-orange-500' },
    { icon: '👥', title: 'صلاحيات ومستخدمون', desc: 'دور المالك والموظفين مع صلاحيات دقيقة على كل شاشة وعملية.', color: 'from-slate-500 to-slate-700' },
  ]
  const pricing = [
    {
      tier: 'Silver', old_price: '500$', price: '250$', period: 'سنوياً', tag: 'للبدء', color: 'from-slate-400 to-slate-600',
      bullets: ['فرع واحد + مستخدم واحد', 'جميع الوحدات الأساسية', 'محاسبة + تذاكر + تأشيرات + باكجات', 'بدون إضافة المتصفح', 'دعم عبر واتساب'],
    },
    {
      tier: 'Gold', old_price: '1,000$', price: '500$', period: 'سنوياً', tag: 'الأكثر مبيعاً 🔥', color: 'from-amber-500 to-orange-600', highlight: true,
      bullets: ['فرع واحد + 8 مستخدمين', 'قيود غير محدودة', 'كل مزايا الفضية', 'إضافة المتصفح باشتراك مستقل', 'دعم فوري متقدم'],
    },
    {
      tier: 'Enterprise', old_price: '2,000$', price: '1,000$', period: 'سنوياً', tag: '💎 الأفضل قيمة', color: 'from-purple-500 to-fuchsia-600',
      bullets: ['فروع لا محدودة + مستخدمين بلا حدود', 'قيود غير محدودة', '🕋 إضافة المتصفح مجاناً وبلا حدود', 'أولوية الميزات الجديدة', 'دعم VIP على مدار 24/7'],
    },
  ]
  // v3.9.1 — WhatsApp CTA (single source of truth)
  const WA_LINK = 'https://wa.me/967781115482?text=' + encodeURIComponent('أهلاً بكم، أرغب في الاستفسار عن اشتراك منظومة رحّال')
  const heroImg = 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80'
  const extImg = 'https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?w=1200&q=80'
  const dashImg = 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80'

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans" dir="rtl">
      {/* ===== NAVBAR ===== */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl grad-brand flex items-center justify-center text-white text-xl font-black shadow">ر</div>
            <div>
              <div className="font-extrabold text-slate-900">Rahaal <span className="text-blue-700">رحّال</span></div>
              <div className="text-[10px] text-slate-500 -mt-0.5">by Target Media</div>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-700">
            <a href="#features" className="hover:text-blue-700">المزايا</a>
            <a href="#extension" className="hover:text-blue-700">إضافة المتصفح</a>
            <a href="#pricing" className="hover:text-blue-700">الأسعار</a>
            <a href="#contact" className="hover:text-blue-700">تواصل</a>
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={onLoginClick} className="hidden sm:inline-flex px-4 py-2 rounded-lg font-semibold text-blue-700 hover:bg-blue-50 text-sm">تسجيل الدخول</button>
            <button onClick={onSignupClick} className="grad-brand text-white px-4 py-2 rounded-lg font-bold text-sm shadow-md hover:shadow-lg transition">اشترك الآن</button>
            <button className="md:hidden p-2 rounded hover:bg-slate-100" onClick={() => setOpenMobile(!openMobile)}>☰</button>
          </div>
        </div>
        {openMobile && (
          <div className="md:hidden bg-white border-t border-slate-200 px-4 py-3 space-y-2 text-sm">
            <a href="#features" onClick={() => setOpenMobile(false)} className="block py-2 border-b">المزايا</a>
            <a href="#extension" onClick={() => setOpenMobile(false)} className="block py-2 border-b">إضافة المتصفح</a>
            <a href="#pricing" onClick={() => setOpenMobile(false)} className="block py-2 border-b">الأسعار</a>
            <a href="#contact" onClick={() => setOpenMobile(false)} className="block py-2">تواصل</a>
            <button onClick={onLoginClick} className="block w-full text-right py-2 text-blue-700 font-semibold">تسجيل الدخول</button>
          </div>
        )}
      </header>

      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-orange-50 pt-16 pb-24">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(30,64,175,0.15) 0, transparent 50%), radial-gradient(circle at 80% 70%, rgba(249,115,22,0.15) 0, transparent 50%)' }} />
        <div className="relative max-w-7xl mx-auto px-4 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-white border border-blue-200 text-blue-700 px-3 py-1 rounded-full text-xs font-bold mb-4 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> v3.8 مُتاح الآن مع إضافة المتصفح
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black leading-tight text-slate-900">
              نظام <span className="bg-gradient-to-l from-blue-700 to-orange-500 bg-clip-text text-transparent">رحّال</span> ERP<br />
              <span className="text-slate-700 text-3xl md:text-4xl lg:text-5xl">للمكاتب السياحية الحديثة</span>
            </h1>
            <p className="mt-5 text-lg text-slate-600 leading-8 max-w-xl">
              منظومة محاسبية متكاملة للمكاتب السياحية بعملات متعدّدة — تذاكر وتأشيرات وباكجات وتقارير مالية ذكية،
              مع <b>إضافة كروم</b> تسحب بيانات التذاكر تلقائياً بضغطة زر.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={onSignupClick} className="grad-brand text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:shadow-xl transition text-base flex items-center gap-2">
                🚀 ابدأ تجربتك المجانية
              </button>
              <button onClick={onLoginClick} className="bg-white text-slate-800 border-2 border-slate-200 px-6 py-3 rounded-xl font-bold hover:border-blue-500 hover:text-blue-700 transition">
                تسجيل الدخول
              </button>
            </div>
            <div className="mt-8 grid grid-cols-3 gap-4 max-w-md">
              <div><div className="text-2xl font-black text-blue-700">3+</div><div className="text-xs text-slate-500">عملات</div></div>
              <div><div className="text-2xl font-black text-orange-600">9</div><div className="text-xs text-slate-500">Parsers</div></div>
              <div><div className="text-2xl font-black text-emerald-600">24/7</div><div className="text-xs text-slate-500">دعم</div></div>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-l from-blue-600/20 to-orange-500/20 rounded-3xl blur-3xl" />
            <img src={heroImg} alt="Rahaal Dashboard" className="relative rounded-2xl shadow-2xl border-4 border-white w-full" />
            <div className="absolute -bottom-6 -left-6 bg-white rounded-xl shadow-xl border p-4 flex items-center gap-3 hidden sm:flex">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-xl">✅</div>
              <div>
                <div className="text-xs font-bold text-slate-900">قيد محاسبي جديد</div>
                <div className="text-[10px] text-slate-500">تذكرة IY123 · تم القيد تلقائياً</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="text-sm font-bold text-blue-700 uppercase tracking-wider mb-2">المزايا الأساسية</div>
            <h2 className="text-3xl md:text-4xl font-black text-slate-900">كل ما يحتاجه مكتبك السياحي — في نظام واحد</h2>
            <p className="mt-3 text-slate-600 text-lg">من إصدار التذكرة، إلى القيد المحاسبي، إلى تقرير الأرباح — كل شيء يعمل بسلاسة.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((f, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-xl hover:border-blue-300 hover:-translate-y-1 transition-all group">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition`}>{f.icon}</div>
                <h3 className="font-bold text-slate-900 mb-1">{f.title}</h3>
                <p className="text-sm text-slate-600 leading-6">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CHROME EXTENSION SHOWCASE ===== */}
      <section id="extension" className="py-24 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 30% 20%, rgba(249,115,22,0.3), transparent 40%), radial-gradient(circle at 70% 80%, rgba(30,64,175,0.4), transparent 40%)' }} />
        <div className="relative max-w-7xl mx-auto px-4 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-orange-500/20 text-orange-300 border border-orange-500/40 px-3 py-1 rounded-full text-xs font-bold mb-4">🆕 جديد v3.8</div>
            <h2 className="text-4xl md:text-5xl font-black mb-5 leading-tight">
              🕋 <span className="bg-gradient-to-l from-orange-400 to-red-400 bg-clip-text text-transparent">قارئ رحّال الآلي</span><br />
              للمتصفح
            </h2>
            <p className="text-lg text-slate-300 leading-8 mb-6">
              إضافة كروم ذكية تسحب بيانات التذاكر والتأشيرات تلقائياً من صفحات <b className="text-white">اليمنية، Fly Aden، KSA e-Visa، البركة للنقل، والموافقات الأمنية</b> — وتُنشئ القيد المحاسبي وسند القبض بضغطة زر واحدة.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 text-sm">
              {['9 نماذج مستندات مدعومة', 'سحب آمن عبر PAT شخصي', 'يعمل مع بوابات الطيران والتأشيرات', 'قيد محاسبي فوري + سند قبض'].map((x, i) => (
                <div key={i} className="flex items-center gap-2 text-slate-200"><span className="text-emerald-400">✓</span> {x}</div>
              ))}
            </div>
            <button onClick={onSignupClick} className="bg-white text-blue-950 px-6 py-3 rounded-xl font-black hover:bg-orange-100 transition shadow-lg">
              اشترك واستفد من الإضافة →
            </button>
          </div>
          <div className="relative">
            <div className="absolute -inset-6 bg-gradient-to-l from-orange-500/30 to-blue-500/30 rounded-3xl blur-3xl" />
            <img src={extImg} alt="Chrome Extension" className="relative rounded-2xl shadow-2xl border-4 border-white/10 w-full" />
          </div>
        </div>
      </section>

      {/* ===== SCREENSHOTS STRIP ===== */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-black text-slate-900">لوحات وشاشات مدروسة</h2>
            <p className="text-slate-600 mt-2">تجربة استخدام سلسة بواجهة عربية RTL كاملة</p>
          </div>
          <div className="relative rounded-2xl overflow-hidden shadow-2xl border-8 border-white bg-white">
            <img src={dashImg} alt="Dashboard preview" className="w-full" />
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section id="pricing" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="text-sm font-bold text-orange-600 uppercase tracking-wider mb-2">خطط الاشتراك</div>
            <h2 className="text-3xl md:text-4xl font-black text-slate-900">خطط تناسب مكتبك — ابدأ مجاناً</h2>
            <p className="mt-3 text-slate-600 text-lg">جرّب النظام مجاناً لمدة 30 قيد محاسبي، ثم اختر خطة تناسبك.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {pricing.map((p, i) => (
              <div key={i} className={`relative rounded-2xl p-6 border-2 ${p.highlight ? 'border-orange-500 bg-gradient-to-br from-orange-50 to-white shadow-2xl scale-105' : 'border-slate-200 bg-white hover:shadow-xl'} transition`}>
                {p.highlight && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-l from-orange-500 to-red-500 text-white text-xs font-black px-3 py-1 rounded-full shadow">{p.tag}</div>}
                <div className="flex items-center justify-between mb-3">
                  <div className={`inline-block bg-gradient-to-br ${p.color} text-white px-3 py-1 rounded-lg text-xs font-bold`}>{p.tier}</div>
                  <div className="bg-rose-100 text-rose-700 text-[10px] font-black px-2 py-0.5 rounded-full">خصم 50% لفترة محدودة</div>
                </div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-4xl font-black text-slate-900">{p.price}</span>
                  {p.old_price && <span className="text-lg text-slate-400 line-through font-semibold">{p.old_price}</span>}
                </div>
                <div className="text-sm text-slate-500 mb-5">{p.period}</div>
                <ul className="space-y-2 mb-6 text-sm">
                  {p.bullets.map((b, j) => (<li key={j} className="flex items-start gap-2"><span className="text-emerald-500 font-bold">✓</span><span className="text-slate-700">{b}</span></li>))}
                </ul>
                <button onClick={onSignupClick} className={`w-full py-3 rounded-xl font-bold transition ${p.highlight ? 'grad-brand text-white shadow-md hover:shadow-lg' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                  اختر هذه الخطة
                </button>
              </div>
            ))}
          </div>
          <div className="text-center mt-8 text-sm text-slate-500">🎁 نظام إحالة: احصل على 50 قيد مجاني عن كل مكتب تدعوه ويشترك فعلياً</div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section id="contact" className="py-24 bg-gradient-to-l from-blue-700 via-blue-600 to-orange-500 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, white, transparent 60%)' }} />
        <div className="relative max-w-4xl mx-auto px-4 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-black mb-4">جاهز لتحويل مكتبك رقمياً؟</h2>
          <p className="text-lg text-blue-100 mb-8 max-w-2xl mx-auto">
            انضم إلى المكاتب السياحية التي تدير أعمالها اليومية بذكاء عبر رحّال — بضغطة زر واحدة.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={onSignupClick} className="bg-white text-blue-900 px-8 py-4 rounded-xl font-black text-lg shadow-2xl hover:scale-105 transition">
              🚀 اشترك الآن — مجاناً
            </button>
            <a href={WA_LINK} target="_blank" rel="noopener noreferrer" className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-4 rounded-xl font-black text-lg shadow-2xl hover:scale-105 transition flex items-center gap-2">
              💬 تواصل عبر واتساب
            </a>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="bg-slate-950 text-slate-400 py-12">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
          <div className="col-span-2">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl grad-brand flex items-center justify-center text-white font-black">ر</div>
              <div>
                <div className="text-white font-extrabold">Rahaal ERP</div>
                <div className="text-xs">by Target Media</div>
              </div>
            </div>
            <p className="text-sm leading-7">
              منظومة محاسبية متكاملة للمكاتب السياحية — تذاكر، تأشيرات، باكجات، تقارير مالية، وإضافة متصفح ذكية.
            </p>
          </div>
          <div>
            <div className="text-white font-bold mb-3">النظام</div>
            <ul className="space-y-2">
              <li><a href="#features" className="hover:text-white">المزايا</a></li>
              <li><a href="#extension" className="hover:text-white">إضافة المتصفح</a></li>
              <li><a href="#pricing" className="hover:text-white">الأسعار</a></li>
            </ul>
          </div>
          <div>
            <div className="text-white font-bold mb-3">تواصل</div>
            <ul className="space-y-2">
              <li><a href={WA_LINK} target="_blank" rel="noopener noreferrer" className="hover:text-white">📱 واتساب: 967781115482</a></li>
              <li><button onClick={onLoginClick} className="hover:text-white">🔐 تسجيل الدخول</button></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 lg:px-8 mt-8 pt-6 border-t border-slate-800 flex flex-wrap justify-between text-xs">
          <div>© {new Date().getFullYear()} Target Media. جميع الحقوق محفوظة.</div>
          <div>Rahaal ERP v3.9 · صُنع بحب للمكاتب السياحية 🕋</div>
        </div>
      </footer>
    </div>
  )
}

// ================================================================
// ROOT APP
// ================================================================
function App() {
  const [auth, setAuth] = useState({ loading: true, user: null, tenant: null, settings: null })
  // v3.9 — When not authenticated, show LandingPage by default; user can toggle to LoginPage or Signup
  const [publicView, setPublicView] = useState('landing') // 'landing' | 'login' | 'signup'

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
    setPublicView('landing')
    toast.success('تم تسجيل الخروج')
  }

  if (auth.loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex items-center gap-3 text-slate-500"><Loader2 className="w-6 h-6 animate-spin" /> جارٍ التحميل...</div>
    </div>
  )

  if (!auth.user) {
    if (publicView === 'login' || publicView === 'signup') {
      return <LoginPage onLogin={onLogin} initialSignup={publicView === 'signup'} onBack={() => setPublicView('landing')} />
    }
    return <LandingPage onLoginClick={() => setPublicView('login')} onSignupClick={() => setPublicView('signup')} />
  }

  return (
    <AuthCtx.Provider value={{ ...auth, refreshMe, logout }}>
      {auth.user.role === 'super_admin' ? <SuperAdminPanel /> : <TenantApp />}
    </AuthCtx.Provider>
  )
}

export default App
