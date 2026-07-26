'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Plane, FileBadge2, LayoutDashboard, Users, Building2, ReceiptText, Wallet,
  ArrowDownLeft, ArrowUpRight, BookOpenText, BarChart3, PieChart as PieIcon,
  Plus, Search, Calendar, TrendingUp, TrendingDown, DollarSign, Sparkles,
  ArrowLeftRight, Filter, ChevronLeft, Activity, Banknote, Loader2, Landmark,
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

// ================================================================
// UTILS
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
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'خطأ في الاتصال')
  return data
}

// ================================================================
// NAVIGATION
// ================================================================
const NAV = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, color: 'from-blue-600 to-cyan-500' },
  { id: 'tickets',   label: 'حجز التذاكر', icon: Plane, color: 'from-sky-600 to-blue-500' },
  { id: 'visas',     label: 'التأشيرات والخدمات', icon: FileBadge2, color: 'from-emerald-600 to-teal-500' },
  { id: 'receipt',   label: 'سند قبض', icon: ArrowDownLeft, color: 'from-green-600 to-emerald-500' },
  { id: 'payment',   label: 'سند صرف', icon: ArrowUpRight, color: 'from-rose-600 to-pink-500' },
  { id: 'clients',   label: 'العملاء', icon: Users, color: 'from-indigo-600 to-violet-500' },
  { id: 'suppliers', label: 'الموردون والوكلاء', icon: Building2, color: 'from-amber-600 to-orange-500' },
  { id: 'boxes',     label: 'الصناديق والبنوك', icon: Wallet, color: 'from-yellow-600 to-amber-500' },
  { id: 'chart',     label: 'الدليل المحاسبي', icon: BookOpenText, color: 'from-purple-600 to-fuchsia-500' },
  { id: 'journal',   label: 'قيود اليومية', icon: ReceiptText, color: 'from-slate-700 to-slate-500' },
  { id: 'reports',   label: 'التقارير المالية', icon: BarChart3, color: 'from-cyan-600 to-blue-500' },
]

// ================================================================
// SIDEBAR
// ================================================================
function Sidebar({ current, onChange }) {
  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 bg-gradient-to-b from-slate-900 via-slate-900 to-blue-950 text-slate-100 flex flex-col border-l border-slate-800">
      <div className="p-5 border-b border-slate-800/70">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl grad-brand flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Plane className="w-6 h-6 text-white -rotate-45" />
          </div>
          <div>
            <div className="text-xl font-extrabold tracking-tight">رحّـــال</div>
            <div className="text-[11px] text-slate-400">نظام محاسبة مكاتب السفريات</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV.map(item => {
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
      <div className="p-4 border-t border-slate-800/70 text-[11px] text-slate-500">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>إصدار Rahaal v1.0 — MVP</span>
        </div>
      </div>
    </aside>
  )
}

// ================================================================
// TOP BAR
// ================================================================
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
// DASHBOARD
// ================================================================
function Dashboard({ setTab }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try { setLoading(true); const d = await api('/dashboard'); setData(d) }
    catch (e) { toast.error(e.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, [load])

  const pieColors = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ef4444', '#64748b']

  return (
    <div className="space-y-6">
      <TopBar
        title="لوحة التحكم"
        subtitle="نظرة سريعة على أداء المكتب اليوم"
        right={<Button variant="outline" onClick={load} className="gap-2"><Activity className="w-4 h-4" /> تحديث</Button>}
      />

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickAction icon={Plane} label="حجز تذكرة" grad="grad-brand" onClick={() => setTab('tickets')} />
        <QuickAction icon={FileBadge2} label="تأشيرة/خدمة" grad="grad-green" onClick={() => setTab('visas')} />
        <QuickAction icon={ArrowDownLeft} label="سند قبض" grad="grad-gold" onClick={() => setTab('receipt')} />
        <QuickAction icon={ArrowUpRight} label="سند صرف" grad="grad-rose" onClick={() => setTab('payment')} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="مبيعات اليوم" icon={DollarSign} grad="grad-brand"
          values={CURRENCIES.map(c => ({ label: c, value: fmt(data?.kpi?.sales_today?.[c] || 0, c) }))}
          loading={loading} />
        <KpiCard title="أرباح اليوم" icon={TrendingUp} grad="grad-green"
          values={CURRENCIES.map(c => ({ label: c, value: fmt(data?.kpi?.profit_today?.[c] || 0, c) }))}
          loading={loading} />
        <KpiCard title="عدد الحركات اليوم" icon={Activity} grad="grad-purple"
          bigValue={data?.kpi?.count_today || 0}
          details={[
            { label: 'تذاكر', value: data?.kpi?.tickets_today || 0 },
            { label: 'تأشيرات', value: data?.kpi?.visas_today || 0 },
          ]}
          loading={loading} />
        <KpiCard title="تاريخ اليوم" icon={Calendar} grad="grad-slate"
          bigValue={new Date().toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}
          details={[{ label: '', value: new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric' }) }]}
          loading={loading} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-slate-800"><TrendingUp className="w-5 h-5 text-blue-600" /> حركة المبيعات والأرباح — آخر 30 يوم (بمعادل الدولار)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {data?.line && data.line.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.line}>
                  <defs>
                    <linearGradient id="gs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
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
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-slate-800"><PieIcon className="w-5 h-5 text-purple-600" /> توزيع الإيرادات</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {data?.pie && data.pie.length ? (
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

      {/* Activity Feed */}
      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-slate-800"><Activity className="w-5 h-5 text-amber-500" /> شريط الحركة المباشر</CardTitle>
          <CardDescription>آخر المعاملات والسندات</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <AnimatePresence>
              {(data?.activity || []).map((a) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100"
                >
                  <ActivityIcon kind={a.kind} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{a.title}</div>
                    <div className="text-xs text-slate-500">{a.subtitle}</div>
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold text-slate-700">{fmt(a.amount, a.currency)}</div>
                    <div className="text-[11px] text-slate-400">{fmtTime(a.when)}</div>
                  </div>
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
      <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm">
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-right">
        <div className="font-bold">{label}</div>
        <div className="text-xs opacity-90">إضافة سريعة</div>
      </div>
    </button>
  )
}

function KpiCard({ title, icon: Icon, grad, values, bigValue, details, loading }) {
  return (
    <Card className={`overflow-hidden border-slate-200 relative`}>
      <div className={`absolute inset-x-0 top-0 h-1 ${grad}`} />
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription className="text-slate-500 text-xs">{title}</CardDescription>
          <div className={`w-9 h-9 rounded-lg ${grad} flex items-center justify-center`}><Icon className="w-4 h-4 text-white" /></div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? <div className="h-16 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div> :
          bigValue !== undefined ? (
            <>
              <div className="text-2xl font-extrabold text-slate-800">{bigValue}</div>
              {details?.map((d, i) => <div key={i} className="text-xs text-slate-500 mt-1">{d.label} <span className="font-semibold text-slate-700">{d.value}</span></div>)}
            </>
          ) : (
            <div className="space-y-1">
              {values.map(v => (
                <div key={v.label} className="flex items-center justify-between text-sm">
                  <span className="text-xs text-slate-500">{v.label}</span>
                  <span className="font-bold text-slate-800">{v.value}</span>
                </div>
              ))}
            </div>
          )
        }
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
  return (
    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${c} flex items-center justify-center shrink-0`}>
      <Icon className="w-4 h-4 text-white" />
    </div>
  )
}

const EmptyChart = () => (
  <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
    <BarChart3 className="w-8 h-8 opacity-40" />
    <div>لا توجد بيانات بعد</div>
  </div>
)

// ================================================================
// TICKETS SCREEN
// ================================================================
function TicketsScreen() {
  const [tickets, setTickets] = useState([])
  const [clients, setClients] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rates, setRates] = useState(null)

  const load = async () => {
    try {
      const [t, c, s, r] = await Promise.all([
        api('/tickets'), api('/clients'), api('/suppliers'), api('/rates'),
      ])
      setTickets(t); setClients(c); setSuppliers(s); setRates(r.rates)
    } catch (e) { toast.error(e.message) }
  }
  useEffect(() => { load() }, [])

  return (
    <div className="space-y-6">
      <TopBar
        title="حجز التذاكر"
        subtitle="شاشة مدمجة للشراء والبيع وحساب العمولة تلقائياً"
        right={
          <Button onClick={() => setOpen(true)} className="gap-2 grad-brand text-white shadow-lg shadow-blue-500/30">
            <Plus className="w-4 h-4" /> تذكرة جديدة
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plane className="w-5 h-5 text-sky-600" /> سجل التذاكر ({tickets.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>PNR</TableHead>
                  <TableHead>خط السير</TableHead>
                  <TableHead>المسافر</TableHead>
                  <TableHead>العميل</TableHead>
                  <TableHead>المورد</TableHead>
                  <TableHead>العملة</TableHead>
                  <TableHead className="text-left">تكلفة</TableHead>
                  <TableHead className="text-left">بيع</TableHead>
                  <TableHead className="text-left text-emerald-600">عمولة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center text-slate-400 py-8">لا توجد تذاكر مسجلة بعد</TableCell></TableRow>
                )}
                {tickets.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs">{fmtDate(t.date)}</TableCell>
                    <TableCell className="font-mono text-xs">{t.pnr || '—'}</TableCell>
                    <TableCell className="text-xs">{t.route || '—'}</TableCell>
                    <TableCell className="text-xs">{t.passenger_name || '—'}</TableCell>
                    <TableCell>{t.client_name}</TableCell>
                    <TableCell>{t.supplier_name}</TableCell>
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

      <TicketDialog
        open={open} onOpenChange={setOpen}
        clients={clients} suppliers={suppliers} rates={rates}
        onSaved={() => { load(); toast.success('تم حفظ التذكرة وإنشاء القيد المحاسبي تلقائياً') }}
        onQuickAdd={(kind) => {
          // reopen after quick add resolved by dialog itself; just refresh lists
          load()
        }}
      />
    </div>
  )
}

function TicketDialog({ open, onOpenChange, clients, suppliers, rates, onSaved, onQuickAdd }) {
  const [form, setForm] = useState({
    date: todayISO(), currency: 'USD', exchange_rate: 1,
    client_id: '', supplier_id: '', pnr: '', route: '',
    passenger_name: '', passport_no: '', travel_date: '',
    cost: '', sale_price: '',
  })
  const [saving, setSaving] = useState(false)
  const [quickClient, setQuickClient] = useState(false)
  const [quickSupplier, setQuickSupplier] = useState(false)

  useEffect(() => {
    if (rates && form.currency) setForm(f => ({ ...f, exchange_rate: rates[f.currency] || 1 }))
  }, [rates, form.currency])

  const commission = useMemo(() => (Number(form.sale_price) || 0) - (Number(form.cost) || 0), [form.sale_price, form.cost])

  const submit = async () => {
    if (!form.client_id || !form.supplier_id) return toast.error('اختر العميل والمورد')
    if (!form.cost || !form.sale_price) return toast.error('أدخل التكلفة وسعر البيع')
    try {
      setSaving(true)
      await api('/tickets', { method: 'POST', body: form })
      onOpenChange(false)
      setForm({ date: todayISO(), currency: 'USD', exchange_rate: 1, client_id: '', supplier_id: '', pnr: '', route: '', passenger_name: '', passport_no: '', travel_date: '', cost: '', sale_price: '' })
      onSaved()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <div className="w-9 h-9 rounded-lg grad-brand flex items-center justify-center"><Plane className="w-4 h-4 text-white -rotate-45" /></div>
              حجز تذكرة جديدة
            </DialogTitle>
            <DialogDescription>سيتم إنشاء قيد يومية تلقائي: العميل مدين، المورد دائن، العمولة إيراد</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
            <Field label="تاريخ الحركة"><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="نوع العملة">
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c} — {CUR_NAME[c]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="سعر الصرف (مقابل الدولار)">
              <Input type="number" step="0.0001" value={form.exchange_rate} onChange={e => setForm({ ...form, exchange_rate: e.target.value })} />
            </Field>

            <Field label="اسم العميل" required>
              <div className="flex gap-2">
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                  <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
                <Button type="button" size="icon" variant="outline" onClick={() => setQuickClient(true)}><Plus className="w-4 h-4" /></Button>
              </div>
            </Field>

            <Field label="اسم المورد / الوكيل" required>
              <div className="flex gap-2">
                <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                  <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
                <Button type="button" size="icon" variant="outline" onClick={() => setQuickSupplier(true)}><Plus className="w-4 h-4" /></Button>
              </div>
            </Field>

            <Field label="رقم التذكرة / PNR"><Input value={form.pnr} onChange={e => setForm({ ...form, pnr: e.target.value })} placeholder="PNR..." /></Field>
            <Field label="خط السير (من - إلى)"><Input value={form.route} onChange={e => setForm({ ...form, route: e.target.value })} placeholder="RUH - CAI - RUH" /></Field>
            <Field label="اسم المسافر"><Input value={form.passenger_name} onChange={e => setForm({ ...form, passenger_name: e.target.value })} /></Field>
            <Field label="رقم الجواز"><Input value={form.passport_no} onChange={e => setForm({ ...form, passport_no: e.target.value })} /></Field>
            <Field label="تاريخ السفر"><Input type="date" value={form.travel_date} onChange={e => setForm({ ...form, travel_date: e.target.value })} /></Field>
          </div>

          <Separator className="my-2" />

          <div className="bg-gradient-to-l from-blue-50 to-emerald-50 border border-slate-200 rounded-xl p-4">
            <div className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Banknote className="w-4 h-4 text-blue-600" /> الجانب المالي</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label={`سعر التكلفة (${form.currency})`} required>
                <Input type="number" step="0.01" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} className="text-lg font-bold" />
              </Field>
              <Field label={`سعر البيع (${form.currency})`} required>
                <Input type="number" step="0.01" value={form.sale_price} onChange={e => setForm({ ...form, sale_price: e.target.value })} className="text-lg font-bold" />
              </Field>
              <Field label={`العمولة / الربح (${form.currency})`}>
                <div className={`px-3 py-2 rounded-md border text-lg font-extrabold ${commission >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                  {fmt(commission, form.currency)}
                </div>
              </Field>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button onClick={submit} disabled={saving} className="grad-brand text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ التذكرة + إنشاء القيد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuickAddDialog open={quickClient} onOpenChange={setQuickClient} kind="client" onSaved={onQuickAdd} />
      <QuickAddDialog open={quickSupplier} onOpenChange={setQuickSupplier} kind="supplier" onSaved={onQuickAdd} />
    </>
  )
}

function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-slate-600">{label} {required && <span className="text-rose-500">*</span>}</Label>
      {children}
    </div>
  )
}

function QuickAddDialog({ open, onOpenChange, kind, onSaved }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const save = async () => {
    if (!name) return toast.error('الاسم مطلوب')
    try {
      await api(`/${kind === 'client' ? 'clients' : 'suppliers'}`, { method: 'POST', body: { name, phone } })
      toast.success('تمت الإضافة')
      onOpenChange(false); setName(''); setPhone(''); onSaved && onSaved(kind)
    } catch (e) { toast.error(e.message) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>إضافة {kind === 'client' ? 'عميل' : 'مورد'} سريع</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="الاسم" required><Input value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="الجوال"><Input value={phone} onChange={e => setPhone(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} className="grad-brand text-white">حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================================================================
// VISAS SCREEN
// ================================================================
const VISA_TYPES = ['تأشيرة عمرة', 'موافقة أمنية', 'فيزا سياحية', 'فيزا عمل', 'حجز فندق', 'خدمات أخرى']

function VisasScreen() {
  const [visas, setVisas] = useState([])
  const [clients, setClients] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [open, setOpen] = useState(false)
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
        subtitle="تأشيرات عمرة، موافقات أمنية، فيز، حجز فنادق"
        right={<Button onClick={() => setOpen(true)} className="gap-2 grad-green text-white shadow-lg shadow-emerald-500/30"><Plus className="w-4 h-4" /> خدمة جديدة</Button>}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileBadge2 className="w-5 h-5 text-emerald-600" /> سجل التأشيرات والخدمات ({visas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>اسم المسافر</TableHead>
                  <TableHead>رقم الجواز</TableHead>
                  <TableHead>الجنسية</TableHead>
                  <TableHead>العميل</TableHead>
                  <TableHead>المورد</TableHead>
                  <TableHead>العملة</TableHead>
                  <TableHead className="text-left">التكلفة</TableHead>
                  <TableHead className="text-left">البيع</TableHead>
                  <TableHead className="text-left text-emerald-600">العمولة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visas.length === 0 && <TableRow><TableCell colSpan={11} className="text-center text-slate-400 py-8">لا توجد خدمات مسجلة بعد</TableCell></TableRow>}
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

      <VisaDialog open={open} onOpenChange={setOpen} clients={clients} suppliers={suppliers} rates={rates}
        onSaved={() => { load(); toast.success('تم حفظ الخدمة وإنشاء القيد المحاسبي') }} />
    </div>
  )
}

function VisaDialog({ open, onOpenChange, clients, suppliers, rates, onSaved }) {
  const [form, setForm] = useState({
    date: todayISO(), service_type: 'تأشيرة عمرة', currency: 'SAR', exchange_rate: 0.267,
    client_id: '', supplier_id: '', passenger_name: '', passport_no: '', nationality: '',
    cost: '', sale_price: '',
  })
  const [saving, setSaving] = useState(false)
  const [qc, setQc] = useState(false); const [qs, setQs] = useState(false)
  useEffect(() => { if (rates) setForm(f => ({ ...f, exchange_rate: rates[f.currency] || 1 })) }, [rates, form.currency])
  const commission = (Number(form.sale_price) || 0) - (Number(form.cost) || 0)

  const submit = async () => {
    if (!form.client_id || !form.supplier_id) return toast.error('اختر العميل والمورد')
    if (!form.cost || !form.sale_price) return toast.error('أدخل التكلفة وسعر البيع')
    try {
      setSaving(true)
      await api('/visas', { method: 'POST', body: form })
      onOpenChange(false); onSaved()
      setForm({ date: todayISO(), service_type: 'تأشيرة عمرة', currency: 'SAR', exchange_rate: 0.267, client_id: '', supplier_id: '', passenger_name: '', passport_no: '', nationality: '', cost: '', sale_price: '' })
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <div className="w-9 h-9 rounded-lg grad-green flex items-center justify-center"><FileBadge2 className="w-4 h-4 text-white" /></div>
              خدمة / تأشيرة جديدة
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="التاريخ"><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="نوع الخدمة">
              <Select value={form.service_type} onValueChange={v => setForm({ ...form, service_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{VISA_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="العملة">
              <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c} — {CUR_NAME[c]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>

            <Field label="العميل" required>
              <div className="flex gap-2">
                <Select value={form.client_id} onValueChange={v => setForm({ ...form, client_id: v })}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="icon" variant="outline" onClick={() => setQc(true)}><Plus className="w-4 h-4" /></Button>
              </div>
            </Field>
            <Field label="المورد / الجهة" required>
              <div className="flex gap-2">
                <Select value={form.supplier_id} onValueChange={v => setForm({ ...form, supplier_id: v })}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="icon" variant="outline" onClick={() => setQs(true)}><Plus className="w-4 h-4" /></Button>
              </div>
            </Field>
            <Field label="سعر الصرف"><Input type="number" step="0.0001" value={form.exchange_rate} onChange={e => setForm({ ...form, exchange_rate: e.target.value })} /></Field>

            <Field label="اسم صاحب التأشيرة"><Input value={form.passenger_name} onChange={e => setForm({ ...form, passenger_name: e.target.value })} /></Field>
            <Field label="رقم الجواز"><Input value={form.passport_no} onChange={e => setForm({ ...form, passport_no: e.target.value })} /></Field>
            <Field label="الجنسية"><Input value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })} /></Field>
          </div>

          <div className="bg-gradient-to-l from-emerald-50 to-blue-50 border rounded-xl p-4 mt-2">
            <div className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Banknote className="w-4 h-4 text-emerald-600" /> الجانب المالي</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label={`التكلفة (${form.currency})`} required><Input type="number" step="0.01" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} className="text-lg font-bold" /></Field>
              <Field label={`سعر البيع (${form.currency})`} required><Input type="number" step="0.01" value={form.sale_price} onChange={e => setForm({ ...form, sale_price: e.target.value })} className="text-lg font-bold" /></Field>
              <Field label={`العمولة (${form.currency})`}>
                <div className={`px-3 py-2 rounded-md border text-lg font-extrabold ${commission >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                  {fmt(commission, form.currency)}
                </div>
              </Field>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button onClick={submit} disabled={saving} className="grad-green text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ + قيد محاسبي'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <QuickAddDialog open={qc} onOpenChange={setQc} kind="client" onSaved={onSaved} />
      <QuickAddDialog open={qs} onOpenChange={setQs} kind="supplier" onSaved={onSaved} />
    </>
  )
}

// ================================================================
// VOUCHER SCREEN (Receipt / Payment)
// ================================================================
function VoucherScreen({ mode }) {
  // mode: 'receipt' or 'payment'
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
      <TopBar
        title={cfg.title}
        subtitle={cfg.subtitle}
        right={<Button onClick={() => setOpen(true)} className={`gap-2 ${cfg.grad} text-white shadow-lg`}><Plus className="w-4 h-4" /> {cfg.title} جديد</Button>}
      />
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><cfg.icon className="w-5 h-5" /> سجل السندات ({vouchers.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>التاريخ</TableHead>
                <TableHead>{cfg.partyLabel}</TableHead>
                <TableHead>البيان</TableHead>
                <TableHead>الطريقة</TableHead>
                <TableHead>الصندوق/البنك</TableHead>
                <TableHead>العملة</TableHead>
                <TableHead className="text-left">المبلغ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchers.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">لا توجد سندات بعد</TableCell></TableRow>}
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

      <VoucherDialog open={open} onOpenChange={setOpen} mode={mode} clients={clients} suppliers={suppliers} boxes={boxes}
        onSaved={() => { load(); toast.success('تم حفظ السند وإنشاء القيد') }} />
    </div>
  )
}

function VoucherDialog({ open, onOpenChange, mode, clients, suppliers, boxes, onSaved }) {
  const defaultParty = mode === 'receipt' ? 'client' : 'supplier'
  const [form, setForm] = useState({
    date: todayISO(), currency: 'USD', amount: '', party_type: defaultParty, party_id: '',
    party_name: '', box_id: '', method: '', description: '',
  })
  const [saving, setSaving] = useState(false)
  useEffect(() => { setForm(f => ({ ...f, party_type: defaultParty, party_id: '', party_name: '' })) }, [mode, defaultParty])
  useEffect(() => { if (boxes[0] && !form.box_id) setForm(f => ({ ...f, box_id: boxes[0].id })) }, [boxes])

  const list = form.party_type === 'client' ? clients : form.party_type === 'supplier' ? suppliers : []
  const submit = async () => {
    if (!form.amount) return toast.error('أدخل المبلغ')
    if (form.party_type !== 'expense' && !form.party_id) return toast.error('اختر الطرف')
    if (!form.box_id) return toast.error('اختر الصندوق/البنك')
    try {
      setSaving(true)
      await api('/vouchers', { method: 'POST', body: { type: mode, ...form } })
      onOpenChange(false)
      setForm({ date: todayISO(), currency: 'USD', amount: '', party_type: defaultParty, party_id: '', party_name: '', box_id: boxes[0]?.id || '', method: '', description: '' })
      onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>{mode === 'receipt' ? 'سند قبض جديد' : 'سند صرف جديد'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="التاريخ"><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="نوع الطرف">
            <Select value={form.party_type} onValueChange={v => setForm({ ...form, party_type: v, party_id: '' })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="client">عميل</SelectItem>
                <SelectItem value="supplier">مورد / وكيل</SelectItem>
                {mode === 'payment' && <SelectItem value="expense">مصروف تشغيلي</SelectItem>}
              </SelectContent>
            </Select>
          </Field>

          {form.party_type === 'expense' ? (
            <Field label="بيان المصروف" required><Input value={form.party_name} onChange={e => setForm({ ...form, party_name: e.target.value })} placeholder="مثل: إيجار / كهرباء" /></Field>
          ) : (
            <Field label={mode === 'receipt' ? 'المستلم من' : 'المدفوع إلى'} required>
              <Select value={form.party_id} onValueChange={v => setForm({ ...form, party_id: v })}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>{list.map(x => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}

          <Field label="الصندوق / البنك" required>
            <Select value={form.box_id} onValueChange={v => setForm({ ...form, box_id: v })}>
              <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>{boxes.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar} ({b.type === 'cash' ? 'صندوق' : 'بنك'})</SelectItem>)}</SelectContent>
            </Select>
          </Field>

          <Field label="العملة">
            <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c} — {CUR_NAME[c]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="المبلغ" required><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="text-lg font-bold" /></Field>
          <Field label="طريقة الدفع"><Input value={form.method} onChange={e => setForm({ ...form, method: e.target.value })} placeholder="نقدي / حوالة / تحويل" /></Field>
          <div className="md:col-span-2"><Field label="البيان"><Textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className={mode === 'receipt' ? 'grad-green text-white' : 'grad-rose text-white'}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ السند'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================================================================
// PARTIES (Clients & Suppliers)
// ================================================================
function PartiesScreen({ kind }) {
  const cfg = kind === 'clients'
    ? { title: 'العملاء', icon: Users, grad: 'grad-purple' }
    : { title: 'الموردون والوكلاء', icon: Building2, grad: 'grad-gold' }
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [notes, setNotes] = useState('')
  const [q, setQ] = useState('')
  const load = async () => { try { setRows(await api(`/${kind}`)) } catch (e) { toast.error(e.message) } }
  useEffect(() => { load() }, [kind])
  const save = async () => {
    if (!name) return toast.error('الاسم مطلوب')
    try { await api(`/${kind}`, { method: 'POST', body: { name, phone, notes } }); setName(''); setPhone(''); setNotes(''); setOpen(false); load(); toast.success('تمت الإضافة') } catch (e) { toast.error(e.message) }
  }
  const filtered = rows.filter(r => !q || r.name.includes(q) || (r.phone || '').includes(q))

  return (
    <div className="space-y-6">
      <TopBar
        title={cfg.title}
        subtitle={`إجمالي: ${rows.length}`}
        right={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input placeholder="بحث..." value={q} onChange={e => setQ(e.target.value)} className="pr-9 w-64" />
            </div>
            <Button onClick={() => setOpen(true)} className={`gap-2 ${cfg.grad} text-white shadow-lg`}><Plus className="w-4 h-4" /> إضافة</Button>
          </div>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(r => (
          <Card key={r.id} className="overflow-hidden hover:shadow-md transition-shadow">
            <div className={`h-1 ${cfg.grad}`} />
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-slate-800">{r.name}</div>
                  <div className="text-xs text-slate-500">{r.phone || '—'}</div>
                </div>
                <div className={`w-10 h-10 rounded-lg ${cfg.grad} flex items-center justify-center`}><cfg.icon className="w-5 h-5 text-white" /></div>
              </div>
              <Separator className="my-3" />
              <div className="space-y-1">
                {CURRENCIES.map(c => {
                  const bal = r.balances?.[c] || 0
                  return (
                    <div key={c} className="flex items-center justify-between text-sm">
                      <span className="text-xs text-slate-500">{c}</span>
                      <span className={`font-bold ${bal > 0 ? 'text-emerald-600' : bal < 0 ? 'text-rose-600' : 'text-slate-400'}`}>{fmt(bal, c)}</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <div className="col-span-full text-center text-slate-400 py-10">لا توجد بيانات</div>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إضافة {kind === 'clients' ? 'عميل' : 'مورد'} جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="الاسم" required><Input value={name} onChange={e => setName(e.target.value)} /></Field>
            <Field label="الجوال"><Input value={phone} onChange={e => setPhone(e.target.value)} /></Field>
            <Field label="ملاحظات"><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={save} className={`${cfg.grad} text-white`}>حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ================================================================
// BOXES SCREEN
// ================================================================
function BoxesScreen() {
  const [rows, setRows] = useState([]); const [open, setOpen] = useState(false)
  const [name, setName] = useState(''); const [type, setType] = useState('cash')
  const load = async () => { try { setRows(await api('/boxes')) } catch (e) { toast.error(e.message) } }
  useEffect(() => { load() }, [])
  const save = async () => { if (!name) return toast.error('الاسم مطلوب'); try { await api('/boxes', { method: 'POST', body: { name_ar: name, type } }); setName(''); setOpen(false); load() } catch (e) { toast.error(e.message) } }

  return (
    <div className="space-y-6">
      <TopBar title="الصناديق والبنوك" subtitle="أرصدة الصناديق النقدية والحسابات البنكية بالعملات المتعددة"
        right={<Button onClick={() => setOpen(true)} className="gap-2 grad-gold text-white"><Plus className="w-4 h-4" /> إضافة</Button>} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map(b => (
          <Card key={b.id} className="overflow-hidden">
            <div className={`h-1 ${b.type === 'cash' ? 'grad-gold' : 'grad-brand'}`} />
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${b.type === 'cash' ? 'grad-gold' : 'grad-brand'}`}>
                  {b.type === 'cash' ? <Wallet className="w-5 h-5 text-white" /> : <Landmark className="w-5 h-5 text-white" />}
                </div>
                <div>
                  <div className="font-bold text-slate-800">{b.name_ar}</div>
                  <div className="text-xs text-slate-500">{b.type === 'cash' ? 'صندوق نقدي' : 'حساب بنكي / محفظة'}</div>
                </div>
              </div>
              <Separator className="my-2" />
              <div className="space-y-1">
                {CURRENCIES.map(c => (
                  <div key={c} className="flex items-center justify-between text-sm">
                    <span className="text-xs text-slate-500">{c}</span>
                    <span className={`font-bold ${(b.balances?.[c] || 0) >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>{fmt(b.balances?.[c] || 0, c)}</span>
                  </div>
                ))}
              </div>
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
                <SelectContent><SelectItem value="cash">صندوق نقدي</SelectItem><SelectItem value="bank">بنك / محفظة</SelectItem></SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={save} className="grad-gold text-white">حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ================================================================
// CHART OF ACCOUNTS
// ================================================================
function ChartScreen() {
  const [rows, setRows] = useState([])
  useEffect(() => { api('/accounts').then(setRows).catch(e => toast.error(e.message)) }, [])
  const byType = {
    asset: rows.filter(r => r.type === 'asset'),
    liability: rows.filter(r => r.type === 'liability'),
    revenue: rows.filter(r => r.type === 'revenue'),
    expense: rows.filter(r => r.type === 'expense'),
  }
  const typeLabel = { asset: 'الأصول', liability: 'الخصوم', revenue: 'الإيرادات', expense: 'المصروفات' }
  const typeGrad = { asset: 'grad-brand', liability: 'grad-rose', revenue: 'grad-green', expense: 'grad-gold' }

  return (
    <div className="space-y-6">
      <TopBar title="الدليل المحاسبي" subtitle="شجرة الحسابات الرئيسية والفرعية" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(byType).map(([t, list]) => (
          <Card key={t}>
            <CardHeader><CardTitle className="flex items-center gap-2"><div className={`w-8 h-8 rounded-md ${typeGrad[t]}`} /> {typeLabel[t]}</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1">
                {list.map(a => (
                  <div key={a.id} className={`flex items-center justify-between p-2 rounded-md ${a.is_group ? 'bg-slate-50 font-semibold' : 'pr-4'}`}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-500">{a.code}</span>
                      <span className="text-sm">{a.name_ar}</span>
                    </div>
                    {a.currency && <Badge variant="outline">{a.currency}</Badge>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ================================================================
// JOURNAL ENTRIES
// ================================================================
function JournalScreen() {
  const [rows, setRows] = useState([])
  useEffect(() => { api('/journal-entries').then(setRows).catch(e => toast.error(e.message)) }, [])
  return (
    <div className="space-y-6">
      <TopBar title="قيود اليومية" subtitle="جميع القيود المحاسبية التلقائية والمدخلة يدوياً" />
      <div className="space-y-3">
        {rows.map(je => {
          const totalDebit = (je.lines || []).reduce((s, l) => s + (l.debit || 0), 0)
          return (
            <Card key={je.id} className="overflow-hidden">
              <CardHeader className="pb-2 bg-slate-50">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-slate-800">{je.description}</div>
                    <div className="text-xs text-slate-500">{fmtDate(je.date)} • {je.ref_type} • {je.currency}</div>
                  </div>
                  <Badge variant="secondary" className="text-sm font-bold">{fmt(totalDebit, je.currency)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>الحساب</TableHead><TableHead>الطرف</TableHead><TableHead className="text-left">مدين</TableHead><TableHead className="text-left">دائن</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(je.lines || []).map((l, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{l.account_code} — {l.account_name}</TableCell>
                        <TableCell className="text-xs">{l.party_name}</TableCell>
                        <TableCell className="text-left font-semibold text-blue-700">{l.debit ? fmt(l.debit, je.currency) : '—'}</TableCell>
                        <TableCell className="text-left font-semibold text-rose-700">{l.credit ? fmt(l.credit, je.currency) : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )
        })}
        {rows.length === 0 && <div className="text-center text-slate-400 py-10">لا توجد قيود بعد</div>}
      </div>
    </div>
  )
}

// ================================================================
// REPORTS
// ================================================================
function ReportsScreen() {
  return (
    <div className="space-y-6">
      <TopBar title="التقارير المالية والإدارية" subtitle="تقارير الأرباح، كشوف الحسابات، ميزان المراجعة، قائمة الدخل" />
      <Tabs defaultValue="profits">
        <TabsList className="w-full justify-start bg-slate-100">
          <TabsTrigger value="profits">الأرباح والعمولات</TabsTrigger>
          <TabsTrigger value="statement">كشف حساب</TabsTrigger>
          <TabsTrigger value="trial">ميزان المراجعة</TabsTrigger>
          <TabsTrigger value="income">قائمة الدخل</TabsTrigger>
        </TabsList>
        <TabsContent value="profits" className="mt-4"><ProfitsReport /></TabsContent>
        <TabsContent value="statement" className="mt-4"><StatementReport /></TabsContent>
        <TabsContent value="trial" className="mt-4"><TrialBalanceReport /></TabsContent>
        <TabsContent value="income" className="mt-4"><IncomeStatement /></TabsContent>
      </Tabs>
    </div>
  )
}

function DateRange({ from, setFrom, to, setTo }) {
  return (
    <div className="flex items-end gap-2 mb-4">
      <Field label="من"><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
      <Field label="إلى"><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
    </div>
  )
}

function ProfitsReport() {
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
  const [to, setTo] = useState(todayISO())
  const [data, setData] = useState(null)
  const load = async () => { try { setData(await api(`/reports/profits?from=${from}&to=${to}`)) } catch (e) { toast.error(e.message) } }
  useEffect(() => { load() }, [from, to])
  return (
    <Card>
      <CardContent className="p-4">
        <DateRange from={from} setFrom={setFrom} to={to} setTo={setTo} />
        {data && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {CURRENCIES.map(c => (
                <Card key={c}>
                  <CardContent className="p-3">
                    <div className="text-xs text-slate-500">إجمالي الأرباح — {c}</div>
                    <div className="text-lg font-extrabold text-emerald-600">{fmt(data.totals_profit[c], c)}</div>
                    <div className="text-xs text-slate-500 mt-1">مبيعات: {fmt(data.totals_sales[c], c)}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>النوع</TableHead><TableHead>المرجع</TableHead><TableHead>العميل</TableHead><TableHead>المورد</TableHead><TableHead>العملة</TableHead><TableHead className="text-left">تكلفة</TableHead><TableHead className="text-left">بيع</TableHead><TableHead className="text-left">ربح</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{fmtDate(r.date)}</TableCell>
                    <TableCell><Badge variant="outline">{r.kind}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{r.ref || '—'}</TableCell>
                    <TableCell>{r.client}</TableCell>
                    <TableCell>{r.supplier}</TableCell>
                    <TableCell>{r.currency}</TableCell>
                    <TableCell className="text-left">{fmt(r.cost, r.currency)}</TableCell>
                    <TableCell className="text-left">{fmt(r.sale, r.currency)}</TableCell>
                    <TableCell className="text-left font-bold text-emerald-600">{fmt(r.profit, r.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function StatementReport() {
  const [type, setType] = useState('client'); const [id, setId] = useState('')
  const [clients, setClients] = useState([]); const [suppliers, setSuppliers] = useState([])
  const [data, setData] = useState(null)
  useEffect(() => { api('/clients').then(setClients); api('/suppliers').then(setSuppliers) }, [])
  const list = type === 'client' ? clients : suppliers
  const load = async () => { if (!id) return; try { setData(await api(`/reports/statement?party_type=${type}&party_id=${id}`)) } catch (e) { toast.error(e.message) } }
  useEffect(() => { load() }, [type, id])
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-end gap-2 mb-4">
          <Field label="النوع">
            <Select value={type} onValueChange={v => { setType(v); setId(''); setData(null) }}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="client">عميل</SelectItem><SelectItem value="supplier">مورد</SelectItem></SelectContent>
            </Select>
          </Field>
          <Field label={type === 'client' ? 'العميل' : 'المورد'}>
            <Select value={id} onValueChange={setId}>
              <SelectTrigger className="w-64"><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>{list.map(x => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        {data?.party && (
          <div className="mb-3 p-3 rounded-lg bg-slate-50 border">
            <div className="text-sm font-bold">{data.party.name}</div>
            <div className="flex gap-4 text-xs mt-1">
              {CURRENCIES.map(c => <div key={c}>{c}: <span className="font-bold">{fmt(data.party.balances?.[c] || 0, c)}</span></div>)}
            </div>
          </div>
        )}
        {data && (
          <Table>
            <TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>البيان</TableHead><TableHead>عملة</TableHead><TableHead className="text-left">مدين</TableHead><TableHead className="text-left">دائن</TableHead><TableHead className="text-left">الرصيد</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs">{fmtDate(r.date)}</TableCell>
                  <TableCell className="text-xs">{r.description}</TableCell>
                  <TableCell>{r.currency}</TableCell>
                  <TableCell className="text-left text-blue-700">{r.debit ? fmt(r.debit, r.currency) : '—'}</TableCell>
                  <TableCell className="text-left text-rose-700">{r.credit ? fmt(r.credit, r.currency) : '—'}</TableCell>
                  <TableCell className="text-left font-bold">{fmt(r.balance, r.currency)}</TableCell>
                </TableRow>
              ))}
              {data.rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-6">لا توجد حركات</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function TrialBalanceReport() {
  const [data, setData] = useState(null)
  useEffect(() => { api('/reports/trial-balance').then(setData).catch(e => toast.error(e.message)) }, [])
  return (
    <Card>
      <CardContent className="p-4">
        {data && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {CURRENCIES.map(c => (
                <Card key={c}>
                  <CardContent className="p-3">
                    <div className="text-xs text-slate-500">{c}</div>
                    <div className="flex justify-between text-sm mt-1"><span>مدين:</span><span className="font-bold text-blue-700">{fmt(data.totals[c].d, c)}</span></div>
                    <div className="flex justify-between text-sm"><span>دائن:</span><span className="font-bold text-rose-700">{fmt(data.totals[c].c, c)}</span></div>
                    <div className="flex justify-between text-sm mt-1 pt-1 border-t"><span>الفرق:</span><span className={`font-bold ${Math.abs(data.totals[c].d - data.totals[c].c) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>{fmt(data.totals[c].d - data.totals[c].c, c)}</span></div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>الكود</TableHead><TableHead>الحساب</TableHead><TableHead>الطرف</TableHead><TableHead>عملة</TableHead><TableHead className="text-left">مدين</TableHead><TableHead className="text-left">دائن</TableHead><TableHead className="text-left">الرصيد</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-xs">{r.party_name || '—'}</TableCell>
                    <TableCell>{r.currency}</TableCell>
                    <TableCell className="text-left text-blue-700">{fmt(r.debit, r.currency)}</TableCell>
                    <TableCell className="text-left text-rose-700">{fmt(r.credit, r.currency)}</TableCell>
                    <TableCell className={`text-left font-bold ${r.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(r.balance, r.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function IncomeStatement() {
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
  const [to, setTo] = useState(todayISO()); const [data, setData] = useState(null)
  const load = async () => { try { setData(await api(`/reports/income-statement?from=${from}&to=${to}`)) } catch (e) { toast.error(e.message) } }
  useEffect(() => { load() }, [from, to])
  return (
    <Card>
      <CardContent className="p-4">
        <DateRange from={from} setFrom={setFrom} to={to} setTo={setTo} />
        {data && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-bold text-slate-700 mb-2">الإيرادات</div>
              <div className="grid grid-cols-3 gap-2">
                {['tickets', 'visas', 'other'].map(k => (
                  <Card key={k}>
                    <CardContent className="p-3">
                      <div className="text-xs text-slate-500">{k === 'tickets' ? 'عمولات تذاكر' : k === 'visas' ? 'عمولات تأشيرات' : 'أخرى'}</div>
                      {CURRENCIES.map(c => <div key={c} className="text-xs flex justify-between"><span>{c}</span><span className="font-bold text-emerald-600">{fmt(data.revenue[k][c], c)}</span></div>)}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm font-bold text-slate-700 mb-2">المصروفات</div>
              <Card><CardContent className="p-3">
                {CURRENCIES.map(c => <div key={c} className="text-sm flex justify-between"><span>{c}</span><span className="font-bold text-rose-600">{fmt(data.expenses[c], c)}</span></div>)}
              </CardContent></Card>
            </div>
            <Card className="grad-brand text-white">
              <CardContent className="p-4">
                <div className="text-xs opacity-80">صافي الربح (بمعادل الدولار)</div>
                <div className="text-3xl font-extrabold">{fmt(data.net_profit_usd, 'USD')}</div>
                <div className="text-xs opacity-80 mt-2 grid grid-cols-2 gap-2">
                  <div>إيرادات: {fmt(data.total_revenue_usd, 'USD')}</div>
                  <div>مصروفات: {fmt(data.total_expenses_usd, 'USD')}</div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ================================================================
// APP
// ================================================================
function App() {
  const [tab, setTab] = useState('dashboard')
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar current={tab} onChange={setTab} />
      <main className="flex-1 p-6 md:p-8 max-w-[1600px]">
        {tab === 'dashboard' && <Dashboard setTab={setTab} />}
        {tab === 'tickets' && <TicketsScreen />}
        {tab === 'visas' && <VisasScreen />}
        {tab === 'receipt' && <VoucherScreen mode="receipt" />}
        {tab === 'payment' && <VoucherScreen mode="payment" />}
        {tab === 'clients' && <PartiesScreen kind="clients" />}
        {tab === 'suppliers' && <PartiesScreen kind="suppliers" />}
        {tab === 'boxes' && <BoxesScreen />}
        {tab === 'chart' && <ChartScreen />}
        {tab === 'journal' && <JournalScreen />}
        {tab === 'reports' && <ReportsScreen />}
      </main>
    </div>
  )
}

export default App
