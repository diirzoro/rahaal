'use client'
// =============================================================================
// v6.1 — «قاري رحّال» (Rahaal Smart Reader) — Frontend components
// - Single mode: upload one PDF/JPG/PNG → server extraction → prefill the
//   EXISTING Ticket/Visa form (no auto-save, no financial effect).
// - Bulk mode (v6.1): select MANY files at once → each read is an independent
//   Smart Read (own read_id, own charge) → review table → bulk-apply
//   supplier/customer/box/cost/partner to selected rows → per-row save through
//   the EXISTING POST /tickets|/visas engine (no new financial logic).
// - Charge happens server-side ONLY on a usable read; retries reuse the same
//   read_id so refresh/double-click/retry can never double-charge.
// - SmartReaderAdminPanel: Super Admin credit management + audit + economics.
// =============================================================================
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sparkles, Upload, Loader2, FileText, AlertTriangle, History, Settings2, RefreshCw, RotateCcw, CheckCircle2, XCircle, Pencil } from 'lucide-react'
import { api, Field, todayISO, XScroll, askConfirm } from './shared'

const SR_CURRENCIES = ['USD', 'SAR', 'YER']
const MAX_BULK_FILES = 20
const newReadId = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `sr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
const rateOf = (rates, cur) => { const rv = rates?.[cur]; return typeof rv === 'number' ? (rv || 1) : (Number(rv?.transfer) || 1) }

// ------------------------------------------------------- extraction → form ---
// Sale Price = final total from the document. Cost is NEVER guessed (stays empty).
export function mapTicketToForm(f) {
  const out = {}
  if (f.passenger_name) out.passenger_name = f.passenger_name
  if (f.mobile) { out.passenger_phone = f.mobile; out.passenger_whatsapp = f.mobile }
  if (f.ticket_number) out.ticket_number = f.ticket_number
  if (f.pnr) out.pnr = f.pnr
  else if (f.ticket_number) out.pnr = f.ticket_number
  if (f.carrier_name) out.carrier_name = f.carrier_name
  if (f.travel_mode === 'air' || f.travel_mode === 'land') out.travel_mode = f.travel_mode
  if (f.flight_number) out.flight_number = f.flight_number
  if (f.route) out.route = f.route
  else if (f.origin && f.destination) out.route = `${f.origin} - ${f.destination}`
  if (f.travel_date) out.travel_date = f.travel_date
  if (f.departure_time) out.departure_time = f.departure_time
  if (f.arrival_time) out.arrival_time = f.arrival_time
  if (f.issue_date && f.issue_date <= todayISO()) out.date = f.issue_date
  if (f.passport_no) { out.passport_no = f.passport_no; out.id_type = 'جواز سفر' }
  if (f.passenger_age) out.passenger_age = f.passenger_age
  if (f.currency && SR_CURRENCIES.includes(f.currency)) out.currency = f.currency
  if (f.total_amount !== null && f.total_amount !== undefined) out.sale_price = f.total_amount
  return out
}
const VISA_TYPE_MAP = [
  [/umrah|عمرة/i, 'تأشيرة عمرة'], [/visit|زيارة/i, 'تأشيرة زيارة'],
  [/tourist|سياح/i, 'فيزا سياحية'], [/work|عمل/i, 'فيزا عمل'],
]
export function mapVisaToForm(f) {
  const out = {}
  if (f.beneficiary_name) out.passenger_name = f.beneficiary_name
  if (f.mobile) { out.passenger_phone = f.mobile; out.passenger_whatsapp = f.mobile }
  if (f.passport_no) out.passport_no = f.passport_no
  if (f.nationality) out.nationality = f.nationality
  if (f.visa_type) { const m = VISA_TYPE_MAP.find(([re]) => re.test(f.visa_type)); if (m) out.service_type = m[1] }
  if (f.issue_date && f.issue_date <= todayISO()) out.date = f.issue_date
  if (f.entry_date) out.entry_date = f.entry_date
  if (f.expiry_date) out.expected_exit_date = f.expiry_date
  if (f.currency && SR_CURRENCIES.includes(f.currency)) out.currency = f.currency
  if (f.sale_total !== null && f.sale_total !== undefined) out.sale_price = f.sale_total
  return out
}

const TICKET_LABELS = {
  passenger_name: 'اسم المسافر', mobile: 'رقم الجوال', ticket_number: 'رقم التذكرة', pnr: 'PNR',
  carrier_name: 'الشركة الناقلة', travel_mode: 'وسيلة الرحلة', flight_number: 'رقم الرحلة',
  origin: 'من', destination: 'إلى', route: 'خط السير', travel_date: 'تاريخ السفر',
  departure_time: 'وقت الانطلاق', arrival_time: 'وقت الوصول', issue_date: 'تاريخ الإصدار',
  passport_no: 'رقم الجواز', passenger_age: 'العمر', currency: 'العملة',
  fare: 'السعر الأساسي', taxes: 'الضرائب', total_amount: 'الإجمالي النهائي (سعر البيع)',
}
const VISA_LABELS = {
  beneficiary_name: 'اسم المستفيد', mobile: 'رقم الجوال', passport_no: 'رقم الجواز',
  nationality: 'الجنسية', visa_number: 'رقم التأشيرة', visa_type: 'نوع التأشيرة',
  issue_date: 'تاريخ الإصدار', expiry_date: 'تاريخ الانتهاء', entry_date: 'تاريخ الدخول',
  duration_days: 'مدة الإقامة (يوم)', currency: 'العملة', sale_total: 'السعر (سعر البيع)',
}

function CreditsBanner({ credits, loading, needed }) {
  if (loading) return <div className="text-xs text-slate-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> جارِ جلب الرصيد...</div>
  if (!credits) return null
  const total = credits.total ?? 0
  if (credits.enabled === false) return <div className="bg-slate-100 border rounded-lg p-3 text-sm text-slate-600">⏸️ خدمة قاري رحّال غير مفعّلة لهذا المكتب — تواصل مع إدارة رحّال للتفعيل.</div>
  if (total <= 0) return (
    <div className="bg-rose-50 border-2 border-rose-300 rounded-lg p-3 text-sm">
      <div className="font-bold text-rose-800">انتهى رصيد قاري رحّال</div>
      <div className="text-rose-700 text-xs mt-1">يرجى شحن رصيد للاستمرار — تواصل مع إدارة رحّال لطلب باقة قراءات جديدة. الإدخال اليدوي واستيراد Excel يعملان كالمعتاد.</div>
    </div>
  )
  return (
    <div className={`flex items-center justify-between rounded-lg p-2.5 border ${total <= 3 ? 'bg-amber-50 border-amber-300' : 'bg-violet-50 border-violet-200'}`}>
      <div className="flex items-center gap-2 text-sm font-bold text-violet-900"><Sparkles className="w-4 h-4 text-violet-600" /> قاري رحّال</div>
      <div className="text-sm">
        <span className={`font-black ${total <= 3 ? 'text-amber-700' : 'text-violet-700'}`}>{total}</span>
        <span className="text-xs text-slate-500 mr-1">قراءة متبقية</span>
        {needed > 0 && needed > total && <span className="text-[10px] text-rose-600 mr-2 font-bold">⚠️ الملفات المحددة ({needed}) أكثر من الرصيد</span>}
        {total <= 3 && <span className="text-[10px] text-amber-700 mr-2">⚠️ الرصيد منخفض</span>}
      </div>
    </div>
  )
}

// small searchable picker (native-feel, robust for long lists)
// v6.2: dropdown renders via portal (position:fixed) so it is NEVER clipped by
// the review table's overflow container — enables per-row inline editing.
function MiniPick({ options, value, onChange, placeholder, compact, disabled }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState(null)
  const inputRef = useRef(null)
  const sel = options.find(o => o.id === value)
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    const list = qq ? options.filter(o => (o.name || '').toLowerCase().includes(qq)) : options
    return list.slice(0, 8)
  }, [q, options])
  const openList = () => {
    if (disabled) return
    const r = inputRef.current?.getBoundingClientRect()
    if (r) {
      const width = Math.max(r.width, 210)
      const left = Math.max(8, Math.min(r.left, (typeof window !== 'undefined' ? window.innerWidth : 1200) - width - 8))
      setRect({ top: r.bottom + 4, left, width })
    }
    setOpen(true); setQ('')
  }
  return (
    <div className="relative">
      <Input
        ref={inputRef}
        disabled={disabled}
        value={open ? q : (sel?.name || '')}
        placeholder={placeholder}
        className={compact ? 'h-7 text-[11px] min-w-[110px]' : 'h-8 text-xs'}
        onFocus={openList}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onChange={(e) => setQ(e.target.value)}
      />
      {open && rect && typeof document !== 'undefined' && createPortal(
        <div dir="rtl" className="fixed bg-white border rounded-lg shadow-xl max-h-52 overflow-y-auto z-[300]"
          style={{ top: rect.top, left: rect.left, width: rect.width, pointerEvents: 'auto' /* Radix modal sets body pointer-events:none — re-enable for the portal */ }}>
          {value && <button type="button" className="w-full text-right px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 border-b" onMouseDown={() => { onChange(null); setOpen(false) }}>✖ مسح الاختيار</button>}
          {filtered.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">لا نتائج</div>}
          {filtered.map(o => (
            <button key={o.id} type="button" className="w-full text-right px-3 py-1.5 text-xs hover:bg-violet-50" onMouseDown={() => { onChange(o); setOpen(false) }}>
              {o.name} {o.code ? <span className="text-slate-400 font-mono text-[10px]">({o.code})</span> : null}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

// ---------------------------------------------------------------- statuses ---
const ST = {
  pending: { label: 'بانتظار القراءة', cls: 'bg-slate-100 text-slate-600' },
  reading: { label: 'جارِ القراءة...', cls: 'bg-blue-100 text-blue-700' },
  ready: { label: 'جاهزة ✓', cls: 'bg-emerald-100 text-emerald-700' },
  needs_review: { label: 'تحتاج مراجعة', cls: 'bg-amber-100 text-amber-700' },
  failed: { label: 'فشلت', cls: 'bg-rose-100 text-rose-700' },
  saved: { label: 'محفوظة ✓', cls: 'bg-emerald-600 text-white' },
  save_error: { label: 'خطأ حفظ', cls: 'bg-rose-100 text-rose-700' },
}

async function readOneFile({ file, readId, kind }) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('doc_kind', kind)
  fd.append('read_id', readId)
  const res = await fetch('/api/smart-reader/read', { method: 'POST', body: fd, credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'فشل الاتصال بقاري رحّال')
  return data
}

// ------------------------------------------------------------ main dialog ---
export function SmartReaderDialog({ open, onOpenChange, kind, onLoaded, onBulkSaved }) {
  const [credits, setCredits] = useState(null)
  const [loadingCredits, setLoadingCredits] = useState(false)
  const [rows, setRows] = useState([]) // [{ file, readId, status, fields, form, message, saveError }]
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState('pick') // pick | reading | review
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  // reference lists for review completion
  const [clients, setClients] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [boxes, setBoxes] = useState([])
  const [rates, setRates] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [expanded, setExpanded] = useState(null) // v6.2: index of row with open partner/commission inline editor
  const [apply, setApply] = useState({ payment_method: '', client_id: '', client_name: '', box_id: '', supplier_id: '', supplier_name: '', cost: '', partner_kind: '', partner_id: '', partner_name: '', share_mode: 'amount', share_value: '' })
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef(null)
  const labels = kind === 'visa' ? VISA_LABELS : TICKET_LABELS

  const fetchCredits = useCallback(async () => {
    setLoadingCredits(true)
    try { setCredits(await api('/smart-reader/credits')) } catch { setCredits(null) } finally { setLoadingCredits(false) }
  }, [])
  useEffect(() => {
    if (open) {
      fetchCredits(); setRows([]); setPhase('pick'); setSelected(new Set()); setExpanded(null); setProgress({ done: 0, total: 0 })
      setApply({ payment_method: '', client_id: '', client_name: '', box_id: '', supplier_id: '', supplier_name: '', cost: '', partner_kind: '', partner_id: '', partner_name: '', share_mode: 'amount', share_value: '' })
    }
  }, [open, fetchCredits])

  const pickFiles = (list) => {
    const files = Array.from(list || [])
    if (!files.length) return
    if (files.length > MAX_BULK_FILES) return toast.error(`الحد الأقصى ${MAX_BULK_FILES} ملفًا في الدفعة الواحدة`)
    const valid = []
    for (const f of files) {
      const okType = /\.(pdf|jpe?g|png)$/i.test(f.name) || ['application/pdf', 'image/jpeg', 'image/png'].includes(f.type)
      if (!okType) { toast.error(`«${f.name}»: صيغة غير مدعومة — PDF / JPG / PNG`); continue }
      if (f.size > 8 * 1024 * 1024) { toast.error(`«${f.name}»: يتجاوز 8MB`); continue }
      valid.push({ file: f, readId: newReadId(), status: 'pending', fields: null, form: {}, message: null, saveError: null })
    }
    if (!valid.length) return
    setRows(valid); setPhase('pick')
  }

  // ---- run batch (also used for a single file in bulk of 1? no — single keeps auto-prefill) ----
  const startRead = async () => {
    if (!rows.length || busy) return
    const total = credits?.total ?? 0
    if (rows.length > total) return toast.error(`الرصيد المتاح ${total} قراءة وعدد الملفات ${rows.length} — قلّل الملفات أو اشحن الرصيد قبل بدء المجموعة`)
    setBusy(true)
    // SINGLE FILE → original fast path: read → prefill existing form → close
    if (rows.length === 1) {
      const r = rows[0]
      setRows([{ ...r, status: 'reading' }])
      try {
        const data = await readOneFile({ file: r.file, readId: r.readId, kind })
        if (data.charged && data.fields) {
          const mapped = kind === 'visa' ? mapVisaToForm(data.fields) : mapTicketToForm(data.fields)
          toast.success(`✨ تمت القراءة بنجاح — المتبقي ${data.remaining} قراءة${data.duplicate ? ' (نتيجة محفوظة — لم يُخصم رصيد إضافي)' : ''}`)
          if (data.low_balance) toast.warning('⚠️ رصيد قاري رحّال منخفض — تواصل مع إدارة رحّال للشحن')
          onLoaded(mapped, data.fields)
          onOpenChange(false)
        } else {
          setRows([{ ...r, status: 'needs_review', fields: data.fields || null, message: data.message || 'لم يتمكن قاري رحّال من قراءة هذا المستند' }])
          fetchCredits()
        }
      } catch (e) {
        setRows([{ ...r, status: 'failed', message: e.message }])
        toast.error(e.message); fetchCredits()
      } finally { setBusy(false) }
      return
    }
    // BULK → sequential reads, independent charges, partial failures allowed
    setPhase('reading')
    setProgress({ done: 0, total: rows.length })
    const next = [...rows]
    for (let i = 0; i < next.length; i++) {
      next[i] = { ...next[i], status: 'reading' }
      setRows([...next])
      try {
        const data = await readOneFile({ file: next[i].file, readId: next[i].readId, kind })
        if (data.charged && data.fields) {
          const mapped = kind === 'visa' ? mapVisaToForm(data.fields) : mapTicketToForm(data.fields)
          next[i] = { ...next[i], status: 'ready', fields: data.fields, form: mapped }
        } else {
          next[i] = { ...next[i], status: 'needs_review', fields: data.fields || null, form: data.fields ? (kind === 'visa' ? mapVisaToForm(data.fields) : mapTicketToForm(data.fields)) : {}, message: data.message || 'قراءة غير قابلة للاستخدام — لم يُخصم رصيد' }
        }
      } catch (e) {
        next[i] = { ...next[i], status: 'failed', message: e.message }
      }
      setProgress({ done: i + 1, total: next.length })
      setRows([...next])
    }
    // load completion lists once
    try {
      const [c, s, b, r] = await Promise.all([api('/clients').catch(() => []), api('/suppliers').catch(() => []), api('/boxes').catch(() => []), api('/rates').catch(() => null)])
      setClients(c || []); setSuppliers(s || []); setBoxes(b || []); setRates(r?.rates || null)
    } catch { }
    const ok = next.filter(x => x.status === 'ready').length
    const rev = next.filter(x => x.status === 'needs_review').length
    const bad = next.filter(x => x.status === 'failed').length
    toast[ok ? 'success' : 'warning'](`اكتملت القراءة: ${ok} جاهزة · ${rev} تحتاج مراجعة · ${bad} فشلت — خُصمت ${ok} قراءة فقط`)
    setSelected(new Set(next.map((x, idx) => x.status === 'ready' ? idx : null).filter(v => v !== null)))
    setPhase('review')
    setBusy(false)
    fetchCredits()
  }

  const retryRow = async (idx) => {
    const r = rows[idx]
    if (!r || busy) return
    const next = [...rows]
    next[idx] = { ...r, status: 'reading', message: null }
    setRows([...next])
    try {
      const data = await readOneFile({ file: r.file, readId: r.readId, kind }) // SAME read_id → never double-charged
      if (data.charged && data.fields) {
        const mapped = kind === 'visa' ? mapVisaToForm(data.fields) : mapTicketToForm(data.fields)
        next[idx] = { ...r, status: 'ready', fields: data.fields, form: { ...mapped, ...r.form } }
      } else {
        next[idx] = { ...r, status: 'needs_review', fields: data.fields || null, message: data.message || 'قراءة غير قابلة للاستخدام — لم يُخصم رصيد' }
      }
    } catch (e) { next[idx] = { ...r, status: 'failed', message: e.message } }
    setRows([...next]); fetchCredits()
  }

  const setRowForm = (idx, patch) => setRows(rs => rs.map((r, i) => i === idx ? { ...r, form: { ...r.form, ...patch } } : r))
  const toggleRow = (idx) => setSelected(s => { const n = new Set(s); if (n.has(idx)) n.delete(idx); else n.add(idx); return n })
  const editableIdx = rows.map((r, i) => (r.status === 'ready' || r.status === 'needs_review' || r.status === 'save_error') ? i : null).filter(v => v !== null)
  const allSel = editableIdx.length > 0 && editableIdx.every(i => selected.has(i))

  const applyToSelected = () => {
    if (!selected.size) return toast.error('حدد صفًا واحدًا على الأقل')
    setRows(rs => rs.map((r, i) => {
      if (!selected.has(i) || r.status === 'saved') return r
      const patch = {}
      if (apply.payment_method) patch.payment_method = apply.payment_method
      if (apply.supplier_id) { patch.supplier_id = apply.supplier_id; patch.supplier_name = apply.supplier_name }
      if (apply.client_id) { patch.client_id = apply.client_id; patch.client_name = apply.client_name }
      if (apply.box_id) patch.box_id = apply.box_id
      if (apply.cost !== '' && apply.cost !== null) patch.cost = apply.cost
      if (apply.partner_id) {
        patch.commission_partner_type = apply.partner_kind
        patch.commission_partner_id = apply.partner_id
        patch.commission_partner_name = apply.partner_name
        patch.commission_share_mode = apply.share_mode
        patch.commission_share_value = apply.share_value
      }
      return { ...r, form: { ...r.form, ...patch } }
    }))
    toast.success(`تم تطبيق الحقول على ${selected.size} صفًا — يمكنك تعديل أي صف منفردًا`)
  }

  const validateRow = (r) => {
    const f = r.form || {}
    const errs = []
    if (!String(f.passenger_name || '').trim()) errs.push('الاسم')
    if (!String(f.passenger_phone || f.passenger_whatsapp || '').trim()) errs.push('الجوال')
    if (kind === 'ticket' && !f.travel_date) errs.push('تاريخ السفر')
    if (!f.supplier_id) errs.push('المورد')
    const pm = f.payment_method || 'credit'
    if (pm === 'credit' && !f.client_id) errs.push('العميل (آجل)')
    if (pm === 'cash' && !f.box_id) errs.push('الصندوق (نقد)')
    if (f.cost === '' || f.cost === undefined || f.cost === null || isNaN(Number(f.cost))) errs.push('التكلفة')
    if (f.sale_price === '' || f.sale_price === undefined || f.sale_price === null || isNaN(Number(f.sale_price))) errs.push('سعر البيع')
    return errs
  }

  const saveSelected = async () => {
    const idxs = [...selected].filter(i => rows[i] && rows[i].status !== 'saved' && rows[i].status !== 'failed')
    if (!idxs.length) return toast.error('حدد صفوفًا قابلة للحفظ')
    // pre-validate all
    const invalid = idxs.filter(i => validateRow(rows[i]).length > 0)
    if (invalid.length) return toast.error(`أكمل الحقول الناقصة في ${invalid.length} صف (الصفوف المعلمة بالأحمر) قبل الحفظ`)
    setSaving(true)
    let okCount = 0
    const next = [...rows]
    for (const i of idxs) {
      const f = next[i].form
      const cur = SR_CURRENCIES.includes(f.currency) ? f.currency : 'USD'
      const base = {
        date: f.date || todayISO(), currency: cur, exchange_rate: rateOf(rates, cur),
        client_id: (f.payment_method || 'credit') === 'credit' ? f.client_id : '',
        supplier_id: f.supplier_id,
        passenger_name: f.passenger_name, passport_no: f.passport_no || '',
        passenger_phone: f.passenger_phone || f.passenger_whatsapp || '',
        passenger_whatsapp: f.passenger_whatsapp || f.passenger_phone || '',
        cost: f.cost, sale_price: f.sale_price,
        payment_method: f.payment_method || 'credit', box_id: (f.payment_method === 'cash') ? f.box_id : '',
        commission_partner_type: f.commission_partner_type || '', commission_partner_id: f.commission_partner_id || '',
        commission_partner_name: f.commission_partner_name || '', commission_share_mode: f.commission_share_mode || 'amount',
        commission_share_value: f.commission_share_value || '',
      }
      const body = kind === 'visa'
        ? {
          ...base, service_type: f.service_type || 'تأشيرة عمرة', nationality: f.nationality || '',
          entry_date: f.entry_date || '', expected_exit_date: f.expected_exit_date || '',
          // v3.89 compatibility bridge — backend validates beneficiary_* fields
          beneficiary_name: f.passenger_name, beneficiary_phone: base.passenger_phone, beneficiary_whatsapp: base.passenger_whatsapp,
        }
        : {
          ...base, pnr: f.pnr || '', route: f.route || '', travel_date: f.travel_date,
          carrier_name: f.carrier_name || '', travel_mode: f.travel_mode || 'air',
          ticket_number: f.ticket_number || f.pnr || '', flight_number: f.flight_number || '',
          departure_time: f.departure_time || '', arrival_time: f.arrival_time || '',
          passenger_age: f.passenger_age || '', id_type: f.id_type || 'هوية شخصية',
        }
      try {
        await api(kind === 'visa' ? '/visas' : '/tickets', { method: 'POST', body })
        next[i] = { ...next[i], status: 'saved', saveError: null }
        okCount++
      } catch (e) {
        next[i] = { ...next[i], status: 'save_error', saveError: e.message }
      }
      setRows([...next])
    }
    setSaving(false)
    const failed = idxs.length - okCount
    if (okCount) { toast.success(`✅ تم حفظ ${okCount} عملية عبر المحرك المحاسبي الحالي${failed ? ` — فشل ${failed} (راجع سبب الخطأ في الصف)` : ''}`); onBulkSaved && onBulkSaved() }
    else toast.error('لم يُحفظ أي صف — راجع أسباب الخطأ في الصفوف')
    setSelected(new Set(next.map((x, idx2) => (idxs.includes(idx2) && x.status !== 'saved') ? idx2 : null).filter(v => v !== null)))
  }

  const blocked = !credits || credits.enabled === false || (credits.total ?? 0) <= 0
  const isBulkReview = phase === 'review' || (phase === 'reading' && rows.length > 1)
  const singleUnusable = rows.length === 1 && (rows[0].status === 'needs_review' || rows[0].status === 'failed')

  // v6.3 SAVE-STATE GUARD: charged reads live only in this dialog's state — closing
  // during review with unsaved rows would silently lose them (credits not refunded).
  // Ask for explicit confirmation before discarding unsaved review results.
  const requestClose = async (v) => {
    if (busy || saving) return
    if (!v && phase === 'review' && rows.some(r => r.status === 'ready' || r.status === 'needs_review' || r.status === 'save_error')) {
      const ok = await askConfirm({
        title: 'إغلاق شاشة المراجعة؟',
        desc: 'لديك قراءات غير محفوظة — الإغلاق سيتجاهل نتائجها (الرصيد المخصوم للقراءات الناجحة لا يُعاد). الصفوف المحفوظة ✓ تم ترحيلها ولن تتأثر.',
        icon: '⚠️', variant: 'danger', confirmLabel: 'إغلاق وتجاهل غير المحفوظ',
      })
      if (!ok) return
    }
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent className={`${isBulkReview ? 'max-w-[96vw] xl:max-w-7xl' : 'max-w-lg'} max-h-[92vh] overflow-y-auto`} dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-500 flex items-center justify-center"><Sparkles className="w-4 h-4 text-white" /></div>
            قاري رحّال — {kind === 'visa' ? 'قراءة تأشيرات' : 'قراءة تذاكر'}{rows.length > 1 ? ` (${rows.length} ملفات)` : ''}
          </DialogTitle>
          <DialogDescription>
            {isBulkReview
              ? 'كل مستند قراءة مستقلة — طبّق الحسابات المشتركة جماعيًا من الأعلى، وعدّل أي صف مختلف من داخل الجدول مباشرة، ثم احفظ. الحفظ يمر بالمحرك المحاسبي الحالي لكل عملية.'
              : 'ارفع مستندًا واحدًا أو عدة مستندات (PDF / JPG / PNG) وسيقرأها قاري رحّال. المراجعة والحفظ يبقيان بيدك — لا ترحيل محاسبي تلقائي.'}
          </DialogDescription>
        </DialogHeader>
        {/* v6.3 min-w-0 — DialogContent is a CSS grid: without min-w-0 the wide review
            table blows the implicit track past the viewport (grid min-content blowout)
            and the XScroll horizontal scrollbar never engages. */}
        <div className="space-y-3 min-w-0 max-w-full">
          <CreditsBanner credits={credits} loading={loadingCredits} needed={rows.length} />

          {/* ---------- PICK PHASE ---------- */}
          {!blocked && phase === 'pick' && (
            <>
              <div
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${rows.length ? 'border-violet-400 bg-violet-50/50' : 'border-slate-300 hover:border-violet-400 hover:bg-violet-50/30'}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); pickFiles(e.dataTransfer.files) }}
              >
                <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => pickFiles(e.target.files)} />
                {rows.length ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-center gap-2 text-sm font-bold text-violet-800"><FileText className="w-5 h-5" /> {rows.length === 1 ? rows[0].file.name : `${rows.length} ملفات محددة`}</div>
                    {rows.length > 1 && <div className="text-[10px] text-slate-500 max-h-16 overflow-y-auto">{rows.map(r => r.file.name).join(' · ')}</div>}
                    <div className="text-[10px] text-slate-400">اضغط لتغيير الاختيار</div>
                  </div>
                ) : (
                  <div className="text-slate-500 text-sm flex flex-col items-center gap-1.5"><Upload className="w-7 h-7 text-slate-300" /> اضغط لاختيار ملف أو عدة ملفات، أو اسحبها هنا<div className="text-[10px] text-slate-400">PDF · JPG · PNG — حتى 8MB للملف · حتى {MAX_BULK_FILES} ملفًا · المستندات لا تُخزّن بعد القراءة</div></div>
                )}
              </div>
              {singleUnusable && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3 text-xs space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-amber-800"><AlertTriangle className="w-4 h-4" /> {rows[0].status === 'failed' ? 'فشلت القراءة — لم يُخصم أي رصيد' : 'القراءة غير مكتملة — لم يُخصم أي رصيد'}</div>
                  <div className="text-amber-700">{rows[0].message}</div>
                  {rows[0].fields && Object.entries(rows[0].fields).filter(([k, v]) => labels[k] && v !== null && v !== '').length > 0 && (
                    <div className="bg-white/70 rounded p-2">
                      <div className="font-bold text-slate-600 mb-1">ما تمكنا من قراءته (للاطلاع فقط):</div>
                      {Object.entries(rows[0].fields).filter(([k, v]) => labels[k] && v !== null && v !== '').map(([k, v]) => (
                        <div key={k} className="flex justify-between py-0.5 border-b border-slate-100 last:border-0"><span className="text-slate-500">{labels[k]}</span><span className="font-mono font-bold">{String(v)}</span></div>
                      ))}
                    </div>
                  )}
                  <div className="text-[10px] text-amber-600">جرّب مستندًا أوضح، أو أدخل البيانات يدويًا / عبر Excel كالمعتاد.</div>
                </div>
              )}
              <Button onClick={startRead} disabled={!rows.length || busy} className="w-full bg-gradient-to-l from-violet-600 to-fuchsia-500 hover:from-violet-700 hover:to-fuchsia-600 text-white font-bold gap-2">
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> جارِ قراءة المستند... (قد تستغرق حتى 30 ثانية)</> : <><Sparkles className="w-4 h-4" /> {rows.length > 1 ? `قراءة ${rows.length} مستندات` : 'قراءة المستند وتعبئة النموذج'}</>}
              </Button>
              <div className="text-[10px] text-slate-400 text-center">تُخصم قراءة واحدة فقط لكل مستند نجحت قراءته — الفشل أو المستند غير الواضح لا يُخصم. إعادة المحاولة لنفس الملف لا تُخصم مرتين.</div>
            </>
          )}

          {/* ---------- BULK READING PROGRESS ---------- */}
          {phase === 'reading' && rows.length > 1 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm font-bold text-violet-800">
                <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> جارِ قراءة المستندات...</span>
                <span>{progress.done} / {progress.total}</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-l from-violet-600 to-fuchsia-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {rows.map((r, i) => (
                  <div key={r.readId} className="flex items-center justify-between text-xs bg-slate-50 rounded px-2 py-1.5">
                    <span className="truncate max-w-[50%]">{r.file.name}</span>
                    <Badge className={`text-[10px] ${ST[r.status].cls}`}>{ST[r.status].label}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---------- REVIEW PHASE (BULK) ---------- */}
          {phase === 'review' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <Badge className="bg-emerald-100 text-emerald-700">جاهزة: {rows.filter(r => r.status === 'ready' || r.status === 'saved').length}</Badge>
                <Badge className="bg-amber-100 text-amber-700">تحتاج مراجعة: {rows.filter(r => r.status === 'needs_review').length}</Badge>
                <Badge className="bg-rose-100 text-rose-700">فشلت: {rows.filter(r => r.status === 'failed' || r.status === 'save_error').length}</Badge>
                <span className="text-slate-400">— خُصم رصيد للقراءات الناجحة فقط · لا أثر مالي قبل الحفظ</span>
              </div>

              {/* Bulk apply panel */}
              <div className="bg-violet-50/60 border border-violet-200 rounded-xl p-3 space-y-2">
                <div className="text-xs font-bold text-violet-900">⚡ تطبيق جماعي على الصفوف المحددة ({selected.size}) — وبعده يمكن تعديل حسابات أي صف منفردًا من داخل الجدول (الدفع/العميل/الصندوق/المورد/الشريك)</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Field label="طريقة الدفع">
                    <Select value={apply.payment_method || undefined} onValueChange={(v) => setApply(a => ({ ...a, payment_method: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="— بدون تغيير —" /></SelectTrigger>
                      <SelectContent><SelectItem value="credit">🕓 آجل (على حساب عميل)</SelectItem><SelectItem value="cash">💵 نقد (صندوق/بنك)</SelectItem></SelectContent>
                    </Select>
                  </Field>
                  <Field label="المورد / الوكيل"><MiniPick options={suppliers} value={apply.supplier_id} onChange={(o) => setApply(a => ({ ...a, supplier_id: o?.id || '', supplier_name: o?.name || '' }))} placeholder="ابحث عن المورد..." /></Field>
                  <Field label="العميل (للآجل)"><MiniPick options={clients} value={apply.client_id} onChange={(o) => setApply(a => ({ ...a, client_id: o?.id || '', client_name: o?.name || '' }))} placeholder="ابحث عن العميل..." /></Field>
                  <Field label="الصندوق/البنك (للنقد)"><MiniPick options={boxes.map(b => ({ id: b.id, name: b.name_ar || b.name }))} value={apply.box_id} onChange={(o) => setApply(a => ({ ...a, box_id: o?.id || '' }))} placeholder="ابحث عن الصندوق..." /></Field>
                  <Field label="التكلفة (لكل صف محدد)"><Input type="number" min="0" dir="ltr" className="h-8 text-xs" value={apply.cost} onChange={(e) => setApply(a => ({ ...a, cost: e.target.value }))} placeholder="مثال: 250" /></Field>
                  <Field label="شريك العمولة (اختياري)"><MiniPick options={[...clients.map(c => ({ id: `client:${c.id}`, name: `👤 ${c.name}` })), ...suppliers.map(s2 => ({ id: `supplier:${s2.id}`, name: `🏢 ${s2.name}` }))]} value={apply.partner_kind && apply.partner_id ? `${apply.partner_kind}:${apply.partner_id}` : ''} onChange={(o) => { if (!o) return setApply(a => ({ ...a, partner_kind: '', partner_id: '', partner_name: '' })); const [k, id] = o.id.split(':'); setApply(a => ({ ...a, partner_kind: k, partner_id: id, partner_name: o.name.replace(/^..\s/, '') })) }} placeholder="عميل أو مورد..." /></Field>
                  <Field label="صيغة الحصة">
                    <Select value={apply.share_mode} onValueChange={(v) => setApply(a => ({ ...a, share_mode: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="amount">مبلغ ثابت</SelectItem><SelectItem value="percent">نسبة ٪ من العمولة</SelectItem></SelectContent>
                    </Select>
                  </Field>
                  <Field label="قيمة الحصة"><Input type="number" min="0" dir="ltr" className="h-8 text-xs" value={apply.share_value} onChange={(e) => setApply(a => ({ ...a, share_value: e.target.value }))} placeholder="0" /></Field>
                </div>
                <Button size="sm" onClick={applyToSelected} className="bg-violet-600 hover:bg-violet-700 text-white text-xs gap-1"><CheckCircle2 className="w-3 h-3" /> تطبيق على المحدد ({selected.size})</Button>
              </div>

              {/* Review table — v6.3: uses the SHARED XScroll sticky-scroll solution (v5.7)
                  so the horizontal scrollbar is always reachable at the visible bottom
                  of the table area (same behavior as all other wide tables in Rahaal). */}
              <div className="border rounded-xl">
                <XScroll maxH="55vh">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="w-8"><input type="checkbox" checked={allSel} onChange={() => setSelected(allSel ? new Set() : new Set(editableIdx))} /></TableHead>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>الملف / الحالة</TableHead>
                    <TableHead>{kind === 'visa' ? 'اسم المستفيد' : 'اسم المسافر'} *</TableHead>
                    <TableHead>الجوال *</TableHead>
                    {kind === 'ticket' && <TableHead>تذكرة/PNR</TableHead>}
                    {kind === 'ticket' && <TableHead>الناقل</TableHead>}
                    {kind === 'ticket' && <TableHead>خط السير</TableHead>}
                    {kind === 'ticket' && <TableHead>تاريخ السفر *</TableHead>}
                    {kind === 'visa' && <TableHead>الجواز</TableHead>}
                    {kind === 'visa' && <TableHead>الجنسية</TableHead>}
                    {kind === 'visa' && <TableHead>انتهاء التأشيرة</TableHead>}
                    <TableHead>العملة</TableHead>
                    <TableHead>البيع *</TableHead>
                    <TableHead>التكلفة *</TableHead>
                    <TableHead>الدفع</TableHead>
                    <TableHead>حساب القبض</TableHead>
                    <TableHead>المورد *</TableHead>
                    <TableHead>شريك</TableHead>
                    <TableHead className="w-14">إجراء</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {rows.map((r, i) => {
                      const f = r.form || {}
                      const errs = (r.status === 'ready' || r.status === 'needs_review' || r.status === 'save_error') ? validateRow(r) : []
                      const locked = r.status === 'saved' || r.status === 'failed' || r.status === 'reading'
                      const cellCls = 'p-1'
                      const inCls = 'h-7 text-[11px] min-w-[90px]'
                      return (
                        <React.Fragment key={r.readId}>
                        <TableRow className={r.status === 'saved' ? 'bg-emerald-50/60' : errs.length && selected.has(i) ? 'bg-rose-50/40' : ''}>
                          <TableCell className={cellCls}><input type="checkbox" disabled={locked} checked={selected.has(i)} onChange={() => toggleRow(i)} /></TableCell>
                          <TableCell className={`${cellCls} text-[10px] text-slate-400`}>{i + 1}</TableCell>
                          <TableCell className={cellCls}>
                            <div className="text-[10px] font-bold truncate max-w-[110px]" title={r.file.name}>{r.file.name}</div>
                            <Badge className={`text-[9px] ${ST[r.status].cls}`}>{ST[r.status].label}</Badge>
                            {(r.message || r.saveError) && <div className="text-[9px] text-rose-600 max-w-[130px]" title={r.saveError || r.message}>{(r.saveError || r.message || '').slice(0, 60)}</div>}
                            {errs.length > 0 && !locked && <div className="text-[9px] text-rose-500">ناقص: {errs.join('، ')}</div>}
                          </TableCell>
                          <TableCell className={cellCls}><Input disabled={locked} className={inCls} value={f.passenger_name || ''} onChange={(e) => setRowForm(i, { passenger_name: e.target.value })} /></TableCell>
                          <TableCell className={cellCls}><Input disabled={locked} dir="ltr" className={inCls} value={f.passenger_phone || ''} onChange={(e) => setRowForm(i, { passenger_phone: e.target.value, passenger_whatsapp: e.target.value })} /></TableCell>
                          {kind === 'ticket' && <TableCell className={cellCls}><Input disabled={locked} dir="ltr" className={inCls} value={f.pnr || ''} onChange={(e) => setRowForm(i, { pnr: e.target.value })} /></TableCell>}
                          {kind === 'ticket' && <TableCell className={cellCls}><Input disabled={locked} className={inCls} value={f.carrier_name || ''} onChange={(e) => setRowForm(i, { carrier_name: e.target.value })} /></TableCell>}
                          {kind === 'ticket' && <TableCell className={cellCls}><Input disabled={locked} dir="ltr" className={inCls} value={f.route || ''} onChange={(e) => setRowForm(i, { route: e.target.value })} /></TableCell>}
                          {kind === 'ticket' && <TableCell className={cellCls}><Input disabled={locked} type="date" className={inCls} value={f.travel_date || ''} onChange={(e) => setRowForm(i, { travel_date: e.target.value })} /></TableCell>}
                          {kind === 'visa' && <TableCell className={cellCls}><Input disabled={locked} dir="ltr" className={inCls} value={f.passport_no || ''} onChange={(e) => setRowForm(i, { passport_no: e.target.value })} /></TableCell>}
                          {kind === 'visa' && <TableCell className={cellCls}><Input disabled={locked} className={inCls} value={f.nationality || ''} onChange={(e) => setRowForm(i, { nationality: e.target.value })} /></TableCell>}
                          {kind === 'visa' && <TableCell className={cellCls}><Input disabled={locked} type="date" className={inCls} value={f.expected_exit_date || ''} onChange={(e) => setRowForm(i, { expected_exit_date: e.target.value })} /></TableCell>}
                          <TableCell className={cellCls}>
                            <Select disabled={locked} value={SR_CURRENCIES.includes(f.currency) ? f.currency : 'USD'} onValueChange={(v) => setRowForm(i, { currency: v })}>
                              <SelectTrigger className="h-7 text-[11px] w-[70px]"><SelectValue /></SelectTrigger>
                              <SelectContent>{SR_CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className={cellCls}><Input disabled={locked} type="number" min="0" dir="ltr" className={`${inCls} min-w-[70px]`} value={f.sale_price ?? ''} onChange={(e) => setRowForm(i, { sale_price: e.target.value })} /></TableCell>
                          <TableCell className={cellCls}><Input disabled={locked} type="number" min="0" dir="ltr" className={`${inCls} min-w-[70px]`} value={f.cost ?? ''} onChange={(e) => setRowForm(i, { cost: e.target.value })} placeholder="تكلفة المكتب" /></TableCell>
                          {/* v6.2 per-row accounting edit: الدفع */}
                          <TableCell className={cellCls}>
                            <Select disabled={locked} value={f.payment_method || 'credit'} onValueChange={(v) => setRowForm(i, { payment_method: v })}>
                              <SelectTrigger className="h-7 text-[10px] w-[82px]"><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="credit">🕓 آجل</SelectItem><SelectItem value="cash">💵 نقد</SelectItem></SelectContent>
                            </Select>
                          </TableCell>
                          {/* v6.2 per-row accounting edit: حساب القبض (عميل للآجل / صندوق للنقد) */}
                          <TableCell className={cellCls}>
                            {(f.payment_method || 'credit') === 'cash'
                              ? <MiniPick compact disabled={locked} options={boxes.map(b => ({ id: b.id, name: b.name_ar || b.name }))} value={f.box_id || ''} onChange={(o) => setRowForm(i, { box_id: o?.id || '' })} placeholder="الصندوق/البنك..." />
                              : <MiniPick compact disabled={locked} options={clients} value={f.client_id || ''} onChange={(o) => setRowForm(i, { client_id: o?.id || '', client_name: o?.name || '' })} placeholder="العميل..." />}
                          </TableCell>
                          {/* v6.2 per-row accounting edit: المورد */}
                          <TableCell className={cellCls}>
                            <MiniPick compact disabled={locked} options={suppliers} value={f.supplier_id || ''} onChange={(o) => setRowForm(i, { supplier_id: o?.id || '', supplier_name: o?.name || '' })} placeholder="المورد/الوكيل..." />
                          </TableCell>
                          {/* v6.2 per-row accounting edit: الشريك (سطر موسّع) */}
                          <TableCell className={cellCls}>
                            <button type="button" disabled={locked} onClick={() => setExpanded(expanded === i ? null : i)}
                              className={`flex items-center gap-1 text-[10px] max-w-[120px] rounded px-1.5 py-1 border transition ${expanded === i ? 'border-violet-400 bg-violet-100 text-violet-800' : 'border-slate-200 hover:border-violet-300 hover:bg-violet-50/60'} ${locked ? 'opacity-40 cursor-not-allowed' : ''}`}
                              title="تعديل شريك العمولة لهذا الصف فقط">
                              <Pencil className="w-3 h-3 shrink-0 text-violet-500" />
                              <span className="truncate">{f.commission_partner_name ? `${f.commission_partner_name} (${f.commission_share_mode === 'percent' ? `${f.commission_share_value}٪` : f.commission_share_value})` : 'شريك: —'}</span>
                            </button>
                          </TableCell>
                          <TableCell className={cellCls}>
                            {(r.status === 'failed' || r.status === 'needs_review') && <Button size="sm" variant="outline" className="h-6 text-[9px] px-1.5 gap-0.5" onClick={() => retryRow(i)} title="إعادة محاولة القراءة — لا تُخصم مرتين"><RotateCcw className="w-3 h-3" /> إعادة</Button>}
                            {r.status === 'saved' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                            {r.status === 'save_error' && <XCircle className="w-4 h-4 text-rose-500" />}
                          </TableCell>
                        </TableRow>
                        </React.Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
                </XScroll>
              </div>

              {/* v6.3 partner/commission editor — rendered BELOW the table (inside the dialog,
                  outside the horizontal scroll area) so it is ALWAYS visible regardless of
                  the table's scroll position. Edits apply to the chosen row ONLY. */}
              {expanded !== null && rows[expanded] && !(rows[expanded].status === 'saved' || rows[expanded].status === 'failed' || rows[expanded].status === 'reading') && (() => {
                const i = expanded
                const f = rows[i].form || {}
                return (
                  <div className="bg-violet-50/70 border-2 border-violet-300 rounded-xl p-3">
                    <div className="flex items-end gap-2 flex-wrap">
                      <div className="text-[11px] font-bold text-violet-900 pb-2">✎ شريك عمولة الصف {i + 1} فقط — لا يؤثر على بقية الصفوف:</div>
                      <div className="w-56"><Field label="الشريك (عميل أو مورد)"><MiniPick options={[...clients.map(c => ({ id: `client:${c.id}`, name: `👤 ${c.name}` })), ...suppliers.map(s2 => ({ id: `supplier:${s2.id}`, name: `🏢 ${s2.name}` }))]} value={f.commission_partner_type && f.commission_partner_id ? `${f.commission_partner_type}:${f.commission_partner_id}` : ''} onChange={(o) => { if (!o) return setRowForm(i, { commission_partner_type: '', commission_partner_id: '', commission_partner_name: '', commission_share_value: '' }); const [k, id] = o.id.split(':'); setRowForm(i, { commission_partner_type: k, commission_partner_id: id, commission_partner_name: o.name.replace(/^..\s/, '') }) }} placeholder="بدون شريك..." /></Field></div>
                      <div className="w-36"><Field label="صيغة الحصة"><Select value={f.commission_share_mode || 'amount'} onValueChange={(v) => setRowForm(i, { commission_share_mode: v })}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="amount">مبلغ ثابت</SelectItem><SelectItem value="percent">نسبة ٪ من العمولة</SelectItem></SelectContent></Select></Field></div>
                      <div className="w-28"><Field label="قيمة الحصة"><Input type="number" min="0" dir="ltr" className="h-8 text-xs" value={f.commission_share_value ?? ''} onChange={(e) => setRowForm(i, { commission_share_value: e.target.value })} placeholder="0" /></Field></div>
                      <Button size="sm" variant="outline" className="h-8 text-xs border-violet-300 text-violet-700" onClick={() => setExpanded(null)}>تم ✓</Button>
                    </div>
                  </div>
                )
              })()}

              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-[10px] text-slate-400">التدفق: قراءة ← مراجعة ← استكمال الحسابات ← حفظ — الحفظ فقط ينشئ الأثر المالي عبر المحرك الحالي لكل عملية</div>
                <Button onClick={saveSelected} disabled={saving || !selected.size} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2">
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> جارِ الحفظ...</> : <>💾 حفظ الصفوف المحددة ({selected.size})</>}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------ entry button ---
export function SmartReaderButton({ kind, onLoaded, onBulkSaved }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2 border-violet-300 text-violet-700 hover:bg-violet-50 font-bold">
        <Sparkles className="w-4 h-4" /> قاري رحّال
      </Button>
      <SmartReaderDialog open={open} onOpenChange={setOpen} kind={kind} onLoaded={onLoaded} onBulkSaved={onBulkSaved} />
    </>
  )
}

// =============================================================================
// SUPER ADMIN — قاري رحّال management panel
// =============================================================================
function AdjustDialog({ target, onClose, onDone }) {
  const [freeDelta, setFreeDelta] = useState('')
  const [paidDelta, setPaidDelta] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setFreeDelta(''); setPaidDelta(''); setReason('') }, [target])
  if (!target) return null
  const submit = async () => {
    const df = Number(freeDelta) || 0, dp = Number(paidDelta) || 0
    if (!reason.trim()) return toast.error('السبب إلزامي لأي تعديل رصيد')
    if (df === 0 && dp === 0) return toast.error('أدخل قيمة تعديل واحدة على الأقل')
    try {
      setSaving(true)
      const r = await api('/admin/smart-reader/adjust', { method: 'POST', body: { tenant_id: target.tenant_id, free_delta: df, paid_delta: dp, reason } })
      toast.success(`✅ تم التعديل — الرصيد الحالي: ${r.total} قراءة`)
      onDone(); onClose()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Dialog open={!!target} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>💳 تعديل رصيد قاري رحّال — {target.name}</DialogTitle>
          <DialogDescription>الرصيد الحالي: مجاني {target.free_credits ?? 0} · مدفوع {target.paid_credits ?? 0}. القيم السالبة تخصم (لا يُسمح برصيد سالب). كل تعديل يُسجّل في سجل التدقيق.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="تعديل الرصيد المجاني (±)"><Input type="number" dir="ltr" value={freeDelta} onChange={(e) => setFreeDelta(e.target.value)} placeholder="0" /></Field>
          <Field label="تعديل الرصيد المدفوع (±)"><Input type="number" dir="ltr" value={paidDelta} onChange={(e) => setPaidDelta(e.target.value)} placeholder="0" /></Field>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[100, 500, 1000].map(n => <Button key={n} size="sm" variant="outline" className="text-xs" onClick={() => setPaidDelta(String(n))}>+{n} مدفوع</Button>)}
          <Button size="sm" variant="outline" className="text-xs" onClick={() => setFreeDelta('10')}>+10 مجاني (Trial)</Button>
        </div>
        <Field label="السبب (إلزامي)" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: شحن باقة 1000 قراءة — فاتورة #123 / منحة ترويجية..." rows={2} /></Field>
        <DialogFooter>
          <Button onClick={submit} disabled={saving} className="gap-1">{saving && <Loader2 className="w-3 h-3 animate-spin" />} تنفيذ التعديل</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HistoryDialog({ target, onClose }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!target) { setData(null); return }
    api(`/admin/smart-reader/history?tenant_id=${target.tenant_id}`).then(setData).catch(e => toast.error(e.message))
  }, [target])
  if (!target) return null
  const stBadge = (s) => s === 'charged' ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">مخصومة</Badge>
    : s === 'processing' ? <Badge className="bg-blue-100 text-blue-700 text-[10px]">معالجة</Badge>
      : <Badge className="bg-slate-100 text-slate-600 text-[10px]">بدون خصم</Badge>
  const ftLabel = { text_pdf: 'PDF نصي', scanned_pdf: 'PDF ممسوح', image: 'صورة' }
  return (
    <Dialog open={!!target} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle>📜 سجل قاري رحّال — {target.name}</DialogTitle></DialogHeader>
        {!data ? <div className="p-6 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div> : (
          <Tabs defaultValue="usage" dir="rtl">
            <TabsList className="w-full"><TabsTrigger value="usage" className="flex-1">📖 الاستخدام ({data.usage?.length || 0})</TabsTrigger><TabsTrigger value="adj" className="flex-1">💳 تعديلات الرصيد ({data.adjustments?.length || 0})</TabsTrigger></TabsList>
            <TabsContent value="usage">
              <Table>
                <TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>النوع</TableHead><TableHead>الملف</TableHead><TableHead>الحالة</TableHead><TableHead>المستخدم</TableHead><TableHead className="text-left">تكلفة AI تقديرية</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(data.usage || []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-6">لا يوجد استخدام بعد</TableCell></TableRow>}
                  {(data.usage || []).map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="text-xs">{u.created_at ? new Date(u.created_at).toLocaleString('en-GB') : '—'}</TableCell>
                      <TableCell className="text-xs">{u.doc_kind === 'visa' ? '🛂 تأشيرة' : '🎫 تذكرة'}</TableCell>
                      <TableCell className="text-xs">{ftLabel[u.file_type] || u.file_type || '—'}</TableCell>
                      <TableCell>{stBadge(u.status)}</TableCell>
                      <TableCell className="text-[10px]">{u.user_email || '—'}</TableCell>
                      <TableCell className="text-left font-mono text-[10px]">{u.est_cost_usd != null ? `$${Number(u.est_cost_usd).toFixed(5)}` : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="adj">
              <Table>
                <TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>النوع</TableHead><TableHead>قبل</TableHead><TableHead>التغيير</TableHead><TableHead>بعد</TableHead><TableHead>السبب</TableHead><TableHead>بواسطة</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(data.adjustments || []).length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-6">لا توجد تعديلات</TableCell></TableRow>}
                  {(data.adjustments || []).map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs">{a.created_at ? new Date(a.created_at).toLocaleString('en-GB') : '—'}</TableCell>
                      <TableCell className="text-xs">{a.type === 'toggle' ? 'تفعيل/إيقاف' : 'تعديل رصيد'}</TableCell>
                      <TableCell className="text-[10px] font-mono">{a.type === 'toggle' ? (a.before?.enabled ? 'مفعّل' : 'موقوف') : `${a.before?.free ?? 0}+${a.before?.paid ?? 0}`}</TableCell>
                      <TableCell className="text-[10px] font-mono text-blue-700">{a.type === 'toggle' ? '—' : `${a.change?.free >= 0 ? '+' : ''}${a.change?.free ?? 0} / ${a.change?.paid >= 0 ? '+' : ''}${a.change?.paid ?? 0}`}</TableCell>
                      <TableCell className="text-[10px] font-mono">{a.type === 'toggle' ? (a.after?.enabled ? 'مفعّل' : 'موقوف') : `${a.after?.free ?? 0}+${a.after?.paid ?? 0}`}</TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate" title={a.reason}>{a.reason}</TableCell>
                      <TableCell className="text-[10px]">{a.admin_email}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function SmartReaderAdminPanel() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [adjustTarget, setAdjustTarget] = useState(null)
  const [historyTarget, setHistoryTarget] = useState(null)
  const [trial, setTrial] = useState('')
  const [savingCfg, setSavingCfg] = useState(false)
  const load = useCallback(async () => {
    try {
      setLoading(true)
      const d = await api('/admin/smart-reader/overview')
      setData(d); setTrial(String(d.config?.trial_credits ?? 10))
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  const saveCfg = async () => {
    try {
      setSavingCfg(true)
      await api('/admin/smart-reader/config', { method: 'PUT', body: { trial_credits: Number(trial), enabled_default: data?.config?.enabled_default !== false } })
      toast.success('✅ تم حفظ إعدادات قاري رحّال'); load()
    } catch (e) { toast.error(e.message) } finally { setSavingCfg(false) }
  }
  const toggle = async (row, enabled) => {
    try {
      await api('/admin/smart-reader/toggle', { method: 'POST', body: { tenant_id: row.tenant_id, enabled } })
      toast.success(enabled ? `✅ تم تفعيل قاري رحّال لـ ${row.name}` : `⏸️ تم إيقاف قاري رحّال لـ ${row.name}`)
      load()
    } catch (e) { toast.error(e.message) }
  }
  if (loading && !data) return <div className="p-10 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> جارِ التحميل...</div>
  const rows = data?.rows || []
  const eco = data?.economics || {}
  const totalConsumed = rows.reduce((s, r) => s + (r.consumed_total || 0), 0)
  const totalRemaining = rows.reduce((s, r) => s + (r.total || 0), 0)
  const totalCost = rows.reduce((s, r) => s + (r.est_ai_cost_usd || 0), 0)
  const ftLabel = { text_pdf: 'PDF نصي', scanned_pdf: 'PDF ممسوح', image: 'صورة' }
  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-black text-slate-800 flex items-center gap-2"><Sparkles className="w-5 h-5 text-violet-600" /> إدارة قاري رحّال — Smart Reader</h3>
          <div className="text-xs text-slate-500">رصيد القراءات الذكية للمكاتب · المحرك: {data?.provider}/{data?.model}</div>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1"><RefreshCw className="w-3 h-3" /> تحديث</Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-[11px] text-slate-500">إجمالي القراءات المستهلكة</div><div className="text-2xl font-black text-violet-700">{totalConsumed}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-[11px] text-slate-500">إجمالي الرصيد المتبقي</div><div className="text-2xl font-black text-emerald-700">{totalRemaining}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-[11px] text-slate-500">تكلفة AI تقديرية إجمالية</div><div className="text-2xl font-black text-slate-700">${totalCost.toFixed(4)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-[11px] text-slate-500">متوسط التكلفة/قراءة</div><div className="text-2xl font-black text-slate-700">${totalConsumed ? (totalCost / totalConsumed).toFixed(5) : '0'}</div></CardContent></Card>
      </div>
      {Object.keys(eco).length > 0 && (
        <Card className="border-violet-200 bg-violet-50/40">
          <CardContent className="p-4">
            <div className="text-xs font-bold text-violet-900 mb-2">📊 اقتصاديات القراءة حسب نوع الملف (تقديرية — لتسعير الباقات)</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {Object.entries(eco).map(([ft, v]) => (
                <div key={ft} className="bg-white rounded-lg border p-2.5 text-xs flex justify-between">
                  <span className="font-bold">{ftLabel[ft] || ft}</span>
                  <span className="font-mono text-slate-600">{v.reads} قراءة · ${v.avg_est_cost_usd}/قراءة</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Settings2 className="w-4 h-4" /> الإعدادات العامة</CardTitle></CardHeader>
        <CardContent className="flex items-end gap-3 flex-wrap">
          <Field label="الرصيد التجريبي للمكاتب الجديدة (Trial)"><Input type="number" dir="ltr" className="w-36" value={trial} onChange={(e) => setTrial(e.target.value)} min="0" /></Field>
          <Button onClick={saveCfg} disabled={savingCfg} size="sm" className="gap-1">{savingCfg && <Loader2 className="w-3 h-3 animate-spin" />} حفظ</Button>
          <div className="text-[10px] text-slate-400">يُمنح تلقائيًا عند أول استخدام لكل مكتب — التغيير لا يؤثر على المكاتب المهيأة سابقًا</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>المكتب</TableHead><TableHead>الباقة</TableHead><TableHead>الحالة</TableHead>
              <TableHead className="text-center">مفعّل</TableHead>
              <TableHead className="text-center">مجاني</TableHead><TableHead className="text-center">مدفوع</TableHead>
              <TableHead className="text-center">الإجمالي</TableHead><TableHead className="text-center">المستهلك</TableHead>
              <TableHead>آخر استخدام</TableHead><TableHead className="text-left">تكلفة AI</TableHead><TableHead>إجراءات</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={11} className="text-center text-slate-400 py-8">لا توجد مكاتب</TableCell></TableRow>}
              {rows.map(r => (
                <TableRow key={r.tenant_id}>
                  <TableCell className="font-bold text-xs">{r.name}</TableCell>
                  <TableCell className="text-xs">{r.plan_tier}</TableCell>
                  <TableCell><Badge className={`text-[10px] ${r.status === 'suspended' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{r.status === 'suspended' ? 'موقوف' : 'نشط'}</Badge></TableCell>
                  <TableCell className="text-center"><Switch checked={r.enabled} onCheckedChange={(v) => toggle(r, v)} /></TableCell>
                  <TableCell className="text-center font-mono text-xs">{r.initialized ? r.free_credits : <span className="text-slate-300" title="سيُمنح Trial عند أول استخدام">—</span>}</TableCell>
                  <TableCell className="text-center font-mono text-xs">{r.initialized ? r.paid_credits : <span className="text-slate-300">—</span>}</TableCell>
                  <TableCell className="text-center font-black text-violet-700">{r.initialized ? r.total : '—'}</TableCell>
                  <TableCell className="text-center font-mono text-xs">{r.consumed_total}</TableCell>
                  <TableCell className="text-[10px]">{r.last_usage_at ? new Date(r.last_usage_at).toLocaleString('en-GB') : '—'}</TableCell>
                  <TableCell className="text-left font-mono text-[10px]">${(r.est_ai_cost_usd || 0).toFixed(4)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="text-[10px] h-7" onClick={() => setAdjustTarget(r)}>💳 شحن/تعديل</Button>
                      <Button size="sm" variant="outline" className="text-[10px] h-7" onClick={() => setHistoryTarget(r)}><History className="w-3 h-3" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <AdjustDialog target={adjustTarget} onClose={() => setAdjustTarget(null)} onDone={load} />
      <HistoryDialog target={historyTarget} onClose={() => setHistoryTarget(null)} />
    </div>
  )
}
