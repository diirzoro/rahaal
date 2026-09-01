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


export { CUR_SYMBOL, CUR_NAME, CURRENCIES, fmt, readFileB64, DOC_OK_TYPES, DOC_MAX_MB, DOC_MAX_FILE_BYTES, DOC_BATCH_MAX_MB, DOC_BATCH_MAX_BYTES, validateDocBatch, todayISO, api, AuthCtx, useAuth, Field, TopBar, ConfirmDialog, ConfirmHost, askConfirm }
