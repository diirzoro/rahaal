'use client'
// v3.87.5 — Shared primitives extracted VERBATIM from app/page.js.
// Pure structural move (zero logic changes) so page.js stays under the 1MB
// GitHub Contents API limit that silently blocked Save-to-GitHub pushes.
import { createContext, useContext, useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const CUR_SYMBOL = { USD: '$', SAR: 'ر.س', YER: 'ر.ي' }
const CUR_NAME = { USD: 'دولار أمريكي', SAR: 'ريال سعودي', YER: 'ريال يمني' }
const CURRENCIES = ['USD', 'SAR', 'YER']

const fmt = (n, c = 'USD') => `${CUR_SYMBOL[c] || ''} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const readFileB64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(file) })

const DOC_OK_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const DOC_MAX_MB = 10
const DOC_MAX_FILE_BYTES = DOC_MAX_MB * 1024 * 1024
const DOC_BATCH_MAX_MB = 20
const DOC_BATCH_MAX_BYTES = DOC_BATCH_MAX_MB * 1024 * 1024

const validateDocBatch = (fileList) => {
  const files = Array.from(fileList || [])
  const valid = []

  for (const f of files) {
    if (!DOC_OK_TYPES.includes(f.type)) {
      toast.error(`${f.name}: المسموح PDF / JPG / PNG / WEBP فقط`)
      continue
    }

    if (f.size > DOC_MAX_FILE_BYTES) {
      toast.error(`${f.name}: الحد الأقصى ${DOC_MAX_MB}MB لكل ملف`)
      continue
    }

    valid.push(f)
  }

  if (valid.reduce((sum, f) => sum + f.size, 0) > DOC_BATCH_MAX_BYTES) {
    toast.error(`إجمالي حجم الملفات يجب ألا يتجاوز ${DOC_BATCH_MAX_MB}MB`)
    return []
  }

  return valid
}


const todayISO = () => new Date().toISOString().slice(0, 10)

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

function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-slate-600">{label} {required && <span className="text-rose-500">*</span>}</Label>
      {children}
    </div>
  )
}

function TopBar({ title, subtitle, right }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-6 animate-fade-in">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 tracking-tight break-words">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 max-w-full">{right}</div>
    </div>
  )
}

// v3.41 — Professional ERP confirmation dialog (replaces all browser confirm()/prompt() for package actions)
// ctrl: { title, desc, icon, variant: 'danger'|'primary', irreversible, confirmLabel, input: {label, placeholder, required, textarea}, onConfirm(inputValue) }
function ConfirmDialog({ ctrl, onClose }) {
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setVal(ctrl?.inputDefault || ''); setBusy(false) }, [ctrl])
  if (!ctrl) return null
  const danger = ctrl.variant === 'danger'
  const run = async () => {
    if (ctrl.input?.required && !val.trim()) return toast.error(`${ctrl.input.label} مطلوب`)
    setBusy(true)
    try { await ctrl.onConfirm(val.trim()); onClose(true) }
    catch (e) { toast.error(e.message); setBusy(false) }
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose() }}>
      <DialogContent className="max-w-md" disableDirtyGuard>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-base">
            <span className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-xl ${danger ? 'bg-rose-100' : 'bg-teal-100'}`}>{ctrl.icon || (danger ? '⚠️' : '❓')}</span>
            <span>{ctrl.title}</span>
          </DialogTitle>
        </DialogHeader>
        {ctrl.desc && <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{ctrl.desc}</div>}
        {ctrl.irreversible && (
          <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
            ⚠️ تنبيه: هذا إجراء حساس وقد لا يمكن التراجع عنه — تأكد قبل المتابعة.
          </div>
        )}
        {ctrl.input && (
          <Field label={ctrl.input.label} required={!!ctrl.input.required}>
            {ctrl.input.textarea
              ? <Textarea value={val} onChange={e => setVal(e.target.value)} placeholder={ctrl.input.placeholder || ''} rows={3} />
              : <Input value={val} onChange={e => setVal(e.target.value)} placeholder={ctrl.input.placeholder || ''} />}
          </Field>
        )}
        <div className="flex gap-2 pt-1">
          <Button onClick={run} disabled={busy} className={`${danger ? 'bg-rose-600 hover:bg-rose-700' : 'grad-brand'} text-white min-w-28`}>
            {busy ? '⏳ جارِ التنفيذ...' : (ctrl.confirmLabel || 'تأكيد')}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={busy}>إلغاء</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// v3.41 — Global promise-based confirm/prompt host (replaces window.confirm()/prompt() everywhere)
let __confirmSetterRef = null
function ConfirmHost() {
  const [ctrl, setCtrl] = useState(null)
  useEffect(() => {
    __confirmSetterRef = setCtrl
    // v3.44 — global "discard typed data?" confirmation used by DialogContent's X/Esc dirty guard
    globalThis.__rahaalConfirmDiscard = () => askConfirm({ title: 'إغلاق النافذة؟', desc: 'لديك بيانات مُدخلة لم تُحفظ — سيتم تجاهلها عند الإغلاق.', icon: '⚠️', variant: 'danger', confirmLabel: 'إغلاق وتجاهل البيانات' })
    return () => { __confirmSetterRef = null; delete globalThis.__rahaalConfirmDiscard }
  }, [])
  return <ConfirmDialog ctrl={ctrl} onClose={(confirmed) => { if (!confirmed && ctrl?.__cancel) ctrl.__cancel(); setCtrl(null) }} />
}
// askConfirm(opts) → Promise<boolean> — or Promise<string|null> when opts.input is provided (prompt mode)
// opts: { title, desc, icon, variant: 'danger'|undefined, irreversible, confirmLabel, input: {label, placeholder, required, textarea}, inputDefault }
function askConfirm(opts) {
  return new Promise((resolve) => {
    if (!__confirmSetterRef) { resolve(typeof window !== 'undefined' ? window.confirm(opts.desc || opts.title) : false); return }
    __confirmSetterRef({
      ...opts,
      onConfirm: (val) => { resolve(opts.input ? val : true) },
      __cancel: () => { resolve(opts.input ? null : false) },
    })
  })
}


// ================================================================
// v5.7 — SHARED LIST CONTROLS (unified across ALL Rahaal screens)
// One state bundle per screen: unified date filter + server-side pagination.
// The SAME query-string contract is served by the shared backend helpers
// (periodFilterExpr + respondList) — logic is never re-implemented per screen.
function useListQuery() {
  const [period, setPeriod] = useState('all')
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSizeRaw] = useState(() => {
    try { const v = parseInt(localStorage.getItem('rahaal_ps')); return [20, 50, 100, 200, 1000].includes(v) ? v : 50 } catch { return 50 }
  })
  const [total, setTotal] = useState(0)
  const [stamp, setStamp] = useState(0)
  const setPageSize = (n) => { setPageSizeRaw(n); setPage(1); try { localStorage.setItem('rahaal_ps', String(n)) } catch { } }
  const applyPeriod = (p) => { setPeriod(p); setPage(1); if (p !== 'range') setStamp(s => s + 1) }
  const applyRange = () => { if (!rangeFrom && !rangeTo) { toast.error('حدد تاريخ البداية أو النهاية'); return } setPage(1); setStamp(s => s + 1) }
  const reload = () => setStamp(s => s + 1) // manual refresh / external triggers
  const qs = (extra = '') => {
    const parts = [`page=${page}`, `page_size=${pageSize}`]
    if (period !== 'all') {
      parts.push(`period=${period}`)
      if (period === 'range') { if (rangeFrom) parts.push(`from=${rangeFrom}`); if (rangeTo) parts.push(`to=${rangeTo}`) }
    }
    if (extra) parts.push(extra)
    return parts.join('&')
  }
  // absorbs BOTH shapes: legacy array or { rows, total } paged object
  const absorb = (r, setRows) => { if (Array.isArray(r)) { setRows(r); setTotal(r.length) } else { setRows(r?.rows || []); setTotal(r?.total || 0) } }
  const dep = `${page}|${pageSize}|${stamp}`
  return { period, setPeriod, rangeFrom, setRangeFrom, rangeTo, setRangeTo, page, setPage, pageSize, setPageSize, total, setTotal, stamp, dep, qs, absorb, applyPeriod, applyRange, reload }
}

// v5.7 — unified date filter bar (same design/behavior first shipped in Journal v5.6)
function PeriodFilterBar({ lq, compact = false }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? '' : 'p-3 rounded-lg border border-slate-200 bg-white'}`}>
      <span className="text-xs font-black text-slate-600 shrink-0">📅 الفترة:</span>
      {[['today', 'اليوم'], ['week', 'هذا الأسبوع'], ['month', 'هذا الشهر'], ['all', 'كل الفترات'], ['range', 'فترة مخصصة']].map(([k, lbl]) => (
        <button key={k} onClick={() => lq.applyPeriod(k)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${lq.period === k ? 'bg-blue-600 text-white border-blue-700 shadow' : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'}`}>{lbl}</button>
      ))}
      {lq.period === 'range' && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Input type="date" value={lq.rangeFrom} onChange={e => lq.setRangeFrom(e.target.value)} className="h-8 w-36 text-xs" />
          <span className="text-xs text-slate-400">→</span>
          <Input type="date" value={lq.rangeTo} onChange={e => lq.setRangeTo(e.target.value)} className="h-8 w-36 text-xs" />
          <Button size="sm" className="h-8 text-xs" onClick={lq.applyRange}>تطبيق</Button>
        </div>
      )}
    </div>
  )
}

// v5.7 — unified pagination bar: page-size select (persisted) + prev/next + counts
function PaginationBar({ lq }) {
  const pages = Math.max(1, Math.ceil((lq.total || 0) / lq.pageSize))
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-slate-500">سجلات/صفحة:</span>
        <select value={lq.pageSize} onChange={e => lq.setPageSize(parseInt(e.target.value))} className="h-7 text-xs border rounded-md px-1.5 bg-white font-bold">
          {[20, 50, 100, 200, 1000].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <span className="text-[11px] text-slate-400">الإجمالي: {Number(lq.total || 0).toLocaleString('en-US')}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={lq.page <= 1} onClick={() => lq.setPage(p => Math.max(1, p - 1))}>‹ السابق</Button>
        <span className="text-[11px] font-bold text-slate-600">صفحة {lq.page} من {pages}</span>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={lq.page >= pages} onClick={() => lq.setPage(p => Math.min(pages, p + 1))}>التالي ›</Button>
      </div>
    </div>
  )
}

// v5.7 — shared sticky-scroll table wrapper: the container owns BOTH scroll axes with a
// capped height, so the horizontal scrollbar is ALWAYS reachable at the visible bottom of
// the table area (no need to scroll past 200 rows first). Native overflow = RTL-safe,
// no synchronized/dual scrollbar hacks. Sticky header keeps context while scrolling.
function XScroll({ children, maxH = '72vh' }) {
  return <div className="rahaal-xscroll" style={{ maxHeight: maxH }}>{children}</div>
}

export { CUR_SYMBOL, CUR_NAME, CURRENCIES, fmt, readFileB64, DOC_OK_TYPES, DOC_MAX_MB, DOC_MAX_FILE_BYTES, DOC_BATCH_MAX_MB, DOC_BATCH_MAX_BYTES, validateDocBatch, todayISO, api, AuthCtx, useAuth, Field, TopBar, ConfirmDialog, ConfirmHost, askConfirm, useListQuery, PeriodFilterBar, PaginationBar, XScroll }
