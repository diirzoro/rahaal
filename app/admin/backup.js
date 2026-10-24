'use client'
// ============================================================================
// v3.95 — ADMIN BACKUP & RESTORE CENTER (Batch 3).
// REUSES /api/admin/system/* (lib/adminSystem.js — tenant export = same logic
// as the legacy /api/backup/export). Restore EXECUTION is disabled by design;
// the safe path (validate → preview → confirm → approve) is fully built.
// Unavailable capabilities (Full/DB backup) are shown honestly as decisions.
// ============================================================================
import React, { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { RefreshCw, Plus, Download, DatabaseBackup, RotateCcw, Lock, Eye, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react'
import { api, useClientPager, PaginationBar } from '../shared'

const dtt = (v) => (v ? new Date(v).toLocaleString('ar-EG') : '—')
const kb = (b) => (b == null ? '—' : b > 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`)
const BST = { completed: ['مكتملة', 'bg-emerald-100 text-emerald-700'], running: ['قيد التنفيذ', 'bg-blue-100 text-blue-700'], failed: ['فشلت', 'bg-rose-100 text-rose-700'], queued: ['بالطابور', 'bg-slate-100 text-slate-600'] }
const RST = { validated: ['تم التحقق', 'bg-blue-100 text-blue-700'], previewed: ['تمت المعاينة', 'bg-indigo-100 text-indigo-700'], approved: ['معتمد — جاهز للتنفيذ', 'bg-amber-100 text-amber-800'], rejected: ['مرفوض', 'bg-rose-100 text-rose-700'], executed: ['✅ منفذ', 'bg-emerald-100 text-emerald-700'], failed: ['فشل التنفيذ', 'bg-rose-100 text-rose-700'] }
const TYPE_L = {
  office_config: '🏢 نسخة إعدادات المكتب',
  office_data: '📊 نسخة بيانات/عمليات المكتب',
  full_office: '📦 نسخة المكتب الكاملة',
  full_system: '🗄️ نسخة النظام الكاملة',
  tenant_export: '💼 نسخة مكتب (قديم)',
  system_settings: '⚙️ إعدادات المنظومة (قديم)',
}
const SB = ({ map, s }) => { const [l, c] = map[s] || [s || '—', 'bg-slate-100 text-slate-600']; return <Badge className={c}>{l}</Badge> }
// base64 → Blob (for ZIP downloads)
const b64ToBlob = (b64, type = 'application/zip') => {
  const bin = atob(b64); const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}
const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}

// v8.0 — Create Backup: the user FIRST picks one of 4 selectable option cards, then continues
const SA_BACKUP_OPTIONS = [
  { type: 'office_config', icon: '🏢', title: 'نسخة إعدادات المكتب', desc: 'إعدادات وهيكل مكتب محدد: المستخدمون والأدوار والصلاحيات، الفروع، شجرة الحسابات، العملاء، الموردون، الصناديق والبنوك، العملات وإعدادات المكتب', needsTenant: true },
  { type: 'office_data', icon: '📊', title: 'نسخة قاعدة بيانات / عمليات المكتب', desc: 'البيانات التشغيلية والمحاسبية لمكتب محدد: القيود، السندات، الحركات المالية، التذاكر، التأشيرات، الخدمات، الباقات، العمليات اليومية — معزولة بمعرّف المكتب', needsTenant: true },
  { type: 'full_system', icon: '🗄️', title: 'نسخة النظام الكاملة', desc: 'نسخة شاملة فعلية لكامل منصة رحّال (كل المجموعات عدا الأسرار) — متاحة للمشرف العام الرئيسي فقط', needsTenant: false, saOnly: true },
  { type: 'full_office', icon: '📦', title: 'نسخة شاملة — الكل معاً', desc: 'حزمة واحدة كاملة قابلة للاستعادة تجمع إعدادات المكتب + بياناته وعملياته معاً', needsTenant: true },
]

const CreateDialog = ({ tenants, isMainSA, onClose, onDone }) => {
  const [v, setV] = useState({ type: '', tenant_id: '', reason: '', protect: false, confirm: false })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const options = SA_BACKUP_OPTIONS.filter(o => !o.saOnly || isMainSA)
  const sel = SA_BACKUP_OPTIONS.find(o => o.type === v.type)
  const run = async () => {
    if (!v.type) { setErr('⚠️ اختر نوع النسخة أولاً'); return }
    if (sel?.needsTenant && !v.tenant_id) { setErr('⚠️ اختر المكتب'); return }
    if (!v.reason.trim()) { setErr('⚠️ سبب الإنشاء مطلوب (Audit)'); return }
    if (!v.confirm) { setErr('⚠️ أكد النطاق أولاً'); return }
    setErr(''); setBusy(true)
    try {
      const r = await api('/admin/system/backups/create', { method: 'POST', body: v })
      toast.success(`✅ اكتملت النسخة — ${kb(r.size_bytes)} · checksum ${String(r.manifest?.checksum || '').slice(0, 10)}…`)
      onDone(); onClose()
    } catch (e) { setErr(e.message); toast.error(e.message) }
    setBusy(false)
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[calc(100vw-1.5rem)] max-h-[88dvh] overflow-y-auto overscroll-contain" dir="rtl">
        <DialogHeader><DialogTitle>➕ إنشاء نسخة احتياطية — اختر النوع أولاً</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {options.map(o => (
              <button key={o.type} type="button" onClick={() => setV({ ...v, type: o.type, tenant_id: o.needsTenant ? v.tenant_id : '' })}
                className={`text-right p-3 rounded-xl border-2 transition touch-manipulation ${v.type === o.type ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{o.icon}</span>
                  <span className="font-bold text-sm flex-1">{o.title}</span>
                  {o.saOnly && <Badge className="bg-amber-100 text-amber-800 text-[9px]">Super Admin فقط</Badge>}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">{o.desc}</div>
              </button>
            ))}
          </div>
          {sel?.needsTenant && (
            <div><div className="text-xs font-bold text-slate-500 mb-1">المكتب *</div>
              <Select value={v.tenant_id || 'none'} onValueChange={x => setV({ ...v, tenant_id: x === 'none' ? '' : x })}>
                <SelectTrigger className="bg-white"><SelectValue placeholder="اختر المكتب" /></SelectTrigger>
                <SelectContent><SelectItem value="none">— اختر —</SelectItem>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div><div className="text-xs font-bold text-slate-500 mb-1">سبب الإنشاء * (Audit)</div><Textarea value={v.reason} onChange={e => { setV({ ...v, reason: e.target.value }); if (err) setErr('') }} rows={2} /></div>
          <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={v.protect} onChange={e => setV({ ...v, protect: e.target.checked })} className="accent-blue-600 w-4 h-4" /> 🛡️ نسخة محمية من الحذف التلقائي (مهمة)</label>
          <label className="flex items-center gap-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2"><input type="checkbox" checked={v.confirm} onChange={e => setV({ ...v, confirm: e.target.checked })} className="accent-amber-600 w-4 h-4" /> أؤكد النطاق: {sel ? (sel.needsTenant ? `${sel.title} — ${tenants.find(t => t.id === v.tenant_id)?.name || 'اختر المكتب'}` : sel.title) : 'اختر النوع'}</label>
          {err && <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{err}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} className="min-h-[44px]">إلغاء</Button>
            <Button onClick={run} disabled={busy} className="bg-blue-600 hover:bg-blue-700 gap-1 min-h-[44px]"><DatabaseBackup className="w-4 h-4" /> {busy ? 'جارِ الإنشاء...' : 'إنشاء النسخة'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const RestoreDialog = ({ backups, onClose, onDone }) => {
  const [v, setV] = useState({ backup_id: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const eligible = backups.filter(b => b.status === 'completed' && b.download_available)
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader><DialogTitle>🔁 طلب استعادة جديد (الخطوة 1: التحقق)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><div className="text-xs font-bold text-slate-500 mb-1">النسخة (مكتملة ومخزنة فقط)</div>
            <Select value={v.backup_id || 'none'} onValueChange={x => setV({ ...v, backup_id: x === 'none' ? '' : x })}>
              <SelectTrigger className="bg-white"><SelectValue placeholder="اختر النسخة" /></SelectTrigger>
              <SelectContent><SelectItem value="none">— اختر —</SelectItem>{eligible.map(b => <SelectItem key={b.id} value={b.id}>{TYPE_L[b.type]} — {b.tenant_name || 'المنظومة'} — {dtt(b.created_at)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><div className="text-xs font-bold text-slate-500 mb-1">سبب الاستعادة * (Audit)</div><Textarea value={v.reason} onChange={e => setV({ ...v, reason: e.target.value })} rows={2} /></div>
          <div className="text-[11px] bg-rose-50 border border-rose-200 rounded-md p-2 text-rose-800">⚠️ النسخة تُستعاد حصراً لنفس مكتبها — الاستعادة لمكتب آخر ممنوعة من الخادم. المسار: تحقق ← معاينة ← اعتماد ← تنفيذ.</div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button disabled={busy || !v.backup_id || !v.reason.trim()} className="bg-blue-600 hover:bg-blue-700" onClick={async () => { setBusy(true); try { await api('/admin/system/restores/create', { method: 'POST', body: v }); toast.success('تم التحقق وإنشاء الطلب — تابع المعاينة'); onDone(); onClose() } catch (e) { toast.error(e.message) } setBusy(false) }}>تحقق وأنشئ الطلب</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const ApproveDialog = ({ req, onClose, onDone }) => {
  const [v, setV] = useState({ confirm_text: '', reason: '' })
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md w-[calc(100vw-1.5rem)]" dir="rtl">
        <DialogHeader><DialogTitle>✅ اعتماد طلب الاستعادة (Maker–Checker)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-slate-600">النطاق: <b>{req.tenant_name || 'النظام'}</b> · البيئة: <b>{req.environment || '—'}</b></div>
          <div><div className="text-xs font-bold text-rose-600 mb-1">اكتب حرفياً: «أؤكد الاستعادة»</div><Input value={v.confirm_text} onChange={e => setV({ ...v, confirm_text: e.target.value })} /></div>
          <div><div className="text-xs font-bold text-slate-500 mb-1">سبب الاعتماد * (Audit)</div><Textarea value={v.reason} onChange={e => setV({ ...v, reason: e.target.value })} rows={2} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} className="min-h-[44px]">تراجع</Button>
            <Button disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px]" onClick={async () => { setBusy(true); try { const r = await api(`/admin/system/restores/${req.id}/approve`, { method: 'POST', body: v }); toast.success(r.note || 'تم الاعتماد'); onDone(); onClose() } catch (e) { toast.error(e.message) } setBusy(false) }}>اعتماد</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// v8.0 — Upload a Rahaal backup file from device (validate-first, never auto-restore)
const UploadRestoreDialog = ({ onClose, onDone }) => {
  const [file, setFile] = useState(null)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (!file) { setErr('⚠️ اختر ملف نسخة رحّال (.json)'); return }
    if (!reason.trim()) { setErr('⚠️ سبب الاستعادة مطلوب (Audit)'); return }
    setErr(''); setBusy(true)
    try {
      const text = await file.text()
      let pkg
      try { pkg = JSON.parse(text) } catch { setErr('الملف ليس JSON صالحاً'); setBusy(false); return }
      const r = await api('/admin/system/restores/upload', { method: 'POST', body: { package: pkg, reason } })
      toast.success('✅ تم التحقق من الملف وإنشاء طلب الاستعادة — تابع المعاينة ثم الاعتماد')
      if (r.warnings?.length) r.warnings.forEach(w => toast.warning(w))
      onDone(); onClose()
    } catch (e) { setErr(e.message); toast.error(e.message) }
    setBusy(false)
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md w-[calc(100vw-1.5rem)] max-h-[88dvh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle>📤 استعادة من ملف مرفوع</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-[11px] text-slate-600 bg-blue-50 border border-blue-100 rounded-lg p-2.5">يُقبل ملف نسخة رحّال (JSON يحتوي manifest). قبل أي استعادة: يُتحقق من نوع النسخة، توافق الإصدار، سلامة checksum، ومطابقة المكتب — ثم معاينة واعتماد وتنفيذ. <b>لا تبدأ الاستعادة فور اختيار الملف.</b></div>
          <input type="file" accept=".json,application/json" onChange={e => { setFile(e.target.files?.[0] || null); if (err) setErr('') }}
            className="block w-full text-xs file:ml-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:font-bold file:cursor-pointer border rounded-lg p-1.5" />
          {file && <div className="text-[11px] text-slate-500">📄 {file.name} — {kb(file.size)}</div>}
          <div><div className="text-xs font-bold text-slate-500 mb-1">سبب الاستعادة * (Audit)</div><Textarea value={reason} onChange={e => { setReason(e.target.value); if (err) setErr('') }} rows={2} /></div>
          {err && <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{err}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} className="min-h-[44px]">إلغاء</Button>
            <Button onClick={run} disabled={busy} className="bg-blue-600 hover:bg-blue-700 min-h-[44px]">{busy ? 'جارِ التحقق...' : 'تحقق وأنشئ الطلب'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// v8.0 — REAL execution (approved requests only) — smart restore, no duplicate financial effect
const ExecuteDialog = ({ req, onClose, onDone }) => {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState(null)
  const run = async () => {
    if (!reason.trim()) { setErr('⚠️ سبب التنفيذ مطلوب (Audit)'); return }
    setErr(''); setBusy(true)
    try {
      const r = await api(`/admin/system/restores/${req.id}/execute`, { method: 'POST', body: { reason } })
      setSummary(r.summary || {})
      toast.success('✅ نُفذت الاستعادة بنجاح')
    } catch (e) { setErr(e.message); toast.error(e.message) }
    setBusy(false)
  }
  return (
    <Dialog open onOpenChange={() => { if (summary) onDone(); onClose() }}>
      <DialogContent className="max-w-lg w-[calc(100vw-1.5rem)] max-h-[88dvh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle>🚀 تنفيذ الاستعادة — {req.tenant_name || 'النظام'}</DialogTitle></DialogHeader>
        {summary ? (
          <div className="space-y-3">
            <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">✅ اكتمل التنفيذ — استعادة ذكية بلا تكرار مالي (الموجود لم يُمس)</div>
            <div className="max-h-64 overflow-y-auto border rounded-lg">
              <table className="w-full text-[11px]"><thead><tr className="bg-slate-50 font-bold"><td className="p-1.5">المجموعة</td><td className="p-1.5">أُدرج</td><td className="p-1.5">حُدّث</td><td className="p-1.5">تُخطي</td><td className="p-1.5">رُفض</td></tr></thead>
                <tbody>{Object.entries(summary).map(([c, s]) => (
                  <tr key={c} className="border-t"><td className="p-1.5 font-mono font-bold">{c}</td><td className="p-1.5 text-emerald-700">{s.inserted}</td><td className="p-1.5 text-blue-700">{s.updated}</td><td className="p-1.5 text-slate-500">{s.skipped}</td><td className="p-1.5 text-rose-600">{s.rejected}</td></tr>
                ))}</tbody></table>
            </div>
            <Button className="w-full min-h-[44px]" onClick={() => { onDone(); onClose() }}>إغلاق</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 leading-relaxed">
              ⚠️ سيُنفذ الآن طلب الاستعادة المعتمد ({TYPE_L[req.backup_type] || req.backup_type}).<br />
              • المجموعات المالية (قيود/سندات/حركات): <b>إضافة الناقص فقط</b> — لا قيود مكررة ولا أرصدة مزدوجة.<br />
              • مجموعات الإعدادات: تحديث/إدراج بالمطابقة على المعرّف.
            </div>
            <div><div className="text-xs font-bold text-slate-500 mb-1">سبب التنفيذ * (Audit)</div><Textarea value={reason} onChange={e => { setReason(e.target.value); if (err) setErr('') }} rows={2} /></div>
            {err && <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{err}</div>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} className="min-h-[44px]">تراجع</Button>
              <Button onClick={run} disabled={busy} className="bg-rose-600 hover:bg-rose-700 text-white min-h-[44px]">{busy ? 'جارِ التنفيذ...' : '🚀 تنفيذ الاستعادة الآن'}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// v8.0 — reject with a modal (no window.prompt)
const RejectDialog = ({ req, onClose, onDone }) => {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (!reason.trim()) { setErr('⚠️ سبب الرفض إلزامي (Audit)'); return }
    setErr(''); setBusy(true)
    try { await api(`/admin/system/restores/${req.id}/reject`, { method: 'POST', body: { reason } }); toast.success('تم الرفض'); onDone(); onClose() } catch (e) { setErr(e.message); toast.error(e.message) }
    setBusy(false)
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm w-[calc(100vw-1.5rem)]" dir="rtl">
        <DialogHeader><DialogTitle>❌ رفض طلب الاستعادة</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-slate-600">الطلب: <b>{TYPE_L[req.backup_type] || req.backup_type}</b> — {req.tenant_name || 'النظام'}</div>
          <div><div className="text-xs font-bold text-slate-500 mb-1">سبب الرفض * (Audit)</div><Textarea value={reason} onChange={e => { setReason(e.target.value); if (err) setErr('') }} rows={2} /></div>
          {err && <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{err}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} className="min-h-[44px]">تراجع</Button>
            <Button onClick={run} disabled={busy} className="bg-rose-600 hover:bg-rose-700 text-white min-h-[44px]">رفض الطلب</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const AdminBackupCenter = () => {
  const [tab, setTab] = useState('backups')
  const [data, setData] = useState(null)
  const [tenants, setTenants] = useState([])
  const [restores, setRestores] = useState(null)
  const [preview, setPreview] = useState(null)
  const [dlg, setDlg] = useState(null)
  const [ret, setRet] = useState(null)
  const [isMainSA, setIsMainSA] = useState(false)
  const [retForm, setRetForm] = useState({ keep_count: '', keep_days: '', scope: 'all', protect_manual: true, reason: '' })

  const load = () => api('/admin/system/backups').then(setData).catch(e => toast.error(e.message))
  const loadRestores = () => api('/admin/system/restores').then(setRestores).catch(e => toast.error(e.message))
  const loadRet = () => api('/admin/system/retention').then(d => { setRet(d); const r = d.retention || {}; setRetForm(f => ({ ...f, keep_count: r.keep_count ?? '', keep_days: r.keep_days ?? '', scope: r.scope || 'all', protect_manual: r.protect_manual !== false })) }).catch(() => {})
  useEffect(() => {
    load()
    api('/admin/tenants/lookup').then(d => setTenants(d?.tenants || [])).catch(() => {})
    api('/admin/staff/me').then(d => setIsMainSA(d?.all === true)).catch(() => {})
  }, [])
  useEffect(() => { if (tab === 'restore') loadRestores(); if (tab === 'retention') loadRet() }, [tab])

  const download = async (id, format = 'json') => {
    try {
      const r = await api(`/admin/system/backups/download?id=${id}${format === 'zip' ? '&format=zip' : ''}`)
      if (r.zip_base64) saveBlob(b64ToBlob(r.zip_base64), r.filename)
      else saveBlob(new Blob([r.payload], { type: 'application/json' }), r.filename)
      toast.success('بدأ التنزيل')
    } catch (e) { toast.error(e.message) }
  }
  const doPreview = async (id) => {
    try { const r = await api(`/admin/system/restores/${id}/preview`, { method: 'POST', body: {} }); setPreview({ id, rows: r.preview, warning: r.warning }); loadRestores() } catch (e) { toast.error(e.message) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {[['backups', '💾 النسخ الاحتياطية'], ['restore', '🔁 الاستعادة'], ['retention', '⏳ سياسة الاحتفاظ']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 min-h-[42px] rounded-lg text-sm font-bold touch-manipulation ${tab === k ? 'bg-blue-600 text-white shadow' : 'bg-white border text-slate-600'}`}>{l}</button>
        ))}
        <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-300 bg-emerald-50 mr-auto">✅ v8.0 — نسخ قابلة للاستعادة فعلياً (manifest + checksum) والتنفيذ مفعّل بالمسار الآمن</Badge>
      </div>

      {tab === 'backups' && (
        <div className="space-y-3">
          {/* capabilities — honest */}
          {data && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.entries(data.capabilities).map(([k, v]) => (
                <div key={k} className={`border rounded-lg p-2 text-xs ${v.available ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50 border-dashed'}`}>
                  <div className="font-bold">{TYPE_L[k] || k} {v.available ? <Badge className="bg-emerald-100 text-emerald-700 mr-1">متاح</Badge> : <Badge className="bg-rose-100 text-rose-700 mr-1">غير متاح</Badge>}</div>
                  <div className="text-[10px] text-slate-500 mt-1">{v.note}</div>
                </div>
              ))}
            </div>
          )}
          <Card><CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm font-extrabold text-slate-700">سجل النسخ ({data?.rows?.length ?? '—'})</div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={load} className="gap-1"><RefreshCw className="w-3.5 h-3.5" /> تحديث</Button>
                <Button size="sm" onClick={() => setDlg({ t: 'create' })} className="bg-blue-600 hover:bg-blue-700 gap-1"><Plus className="w-4 h-4" /> نسخة جديدة</Button>
              </div>
            </div>
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-slate-50">
                  <TableHead className="text-right">الرقم / النوع</TableHead><TableHead className="text-right">النطاق</TableHead>
                  <TableHead className="text-right">البيئة</TableHead><TableHead className="text-right">الإنشاء</TableHead>
                  <TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">الحجم</TableHead>
                  <TableHead className="text-right">الانتهاء</TableHead><TableHead className="text-right">السبب</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {!data ? <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-400">جارِ التحميل...</TableCell></TableRow>
                    : data.rows.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-400">لا نسخ مسجلة بعد — {data.read_only_note}</TableCell></TableRow>
                      : data.rows.map(r => (
                        <TableRow key={r.id}>
                          <TableCell><div className="text-xs font-bold">{TYPE_L[r.type] || r.type}</div><div className="text-[10px] text-slate-400 font-mono">{r.id.slice(0, 8)}</div></TableCell>
                          <TableCell className="text-xs">{r.scope === 'tenant' ? `🏢 ${r.tenant_name}` : '🌐 المنظومة'}</TableCell>
                          <TableCell className="text-xs">{r.environment}</TableCell>
                          <TableCell className="text-[10px]">{dtt(r.created_at)}<div className="text-slate-400" dir="ltr">{r.created_by}</div></TableCell>
                          <TableCell><SB map={BST} s={r.status} />{r.error_message && <div className="text-[9px] text-rose-500 max-w-[140px] truncate" title={r.error_message}>{r.error_message}</div>}</TableCell>
                          <TableCell className="text-xs">{kb(r.size_bytes)}{r.protected && <div className="text-[9px] text-blue-600">🛡️ محمية</div>}</TableCell>
                          <TableCell className="text-[10px]">{r.expires_at ? dtt(r.expires_at) : '—'}</TableCell>
                          <TableCell className="text-[10px] text-slate-500 max-w-[140px] truncate" title={r.reason}>{r.reason}{r.source === 'upload' && <div className="text-[9px] text-indigo-600">📤 ملف مرفوع</div>}</TableCell>
                          <TableCell>{r.download_available ? (
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => download(r.id)}><Download className="w-3 h-3" /> JSON</Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => download(r.id, 'zip')}>🗜️ ZIP</Button>
                            </div>
                          ) : <span className="text-[9px] text-slate-400" title={r.storage_note || ''}>غير مخزنة</span>}</TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
        </div>
      )}

      {tab === 'restore' && (
        <Card><CardContent className="pt-4 space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-md p-2 text-[11px] text-blue-900 flex items-center gap-2"><ShieldAlert className="w-4 h-4 shrink-0" /> {restores?.execution_note || 'المسار الآمن: تحقق ← معاينة ← اعتماد ← تنفيذ — الاستعادة ذكية بلا تكرار مالي'}</div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm font-extrabold text-slate-700">طلبات الاستعادة</div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={loadRestores} className="gap-1"><RefreshCw className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="outline" onClick={() => setDlg({ t: 'upload' })} className="gap-1 text-indigo-700 border-indigo-300">📤 استعادة من ملف مرفوع</Button>
              <Button size="sm" onClick={() => setDlg({ t: 'restore' })} className="bg-blue-600 hover:bg-blue-700 gap-1"><RotateCcw className="w-4 h-4" /> من نسخة محفوظة</Button>
            </div>
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-slate-50">
                <TableHead className="text-right">الطلب</TableHead><TableHead className="text-right">النطاق</TableHead>
                <TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">المنشئ</TableHead>
                <TableHead className="text-right">السبب</TableHead><TableHead className="text-right">خطوات المسار</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {restores === null ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">جارِ التحميل...</TableCell></TableRow>
                  : restores.rows.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">لا طلبات استعادة</TableCell></TableRow>
                    : restores.rows.map(r => (
                      <TableRow key={r.id}>
                        <TableCell><div className="text-xs font-bold">{TYPE_L[r.backup_type]}</div><div className="text-[10px] text-slate-400">{dtt(r.created_at)}</div></TableCell>
                        <TableCell className="text-xs">{r.tenant_name || '🌐 المنظومة'} · {r.environment}</TableCell>
                        <TableCell><SB map={RST} s={r.status} />{r.self_approved && <div className="text-[9px] text-amber-600">اعتماد ذاتي (أدمن وحيد)</div>}</TableCell>
                        <TableCell className="text-[10px]" dir="ltr">{r.created_by}</TableCell>
                        <TableCell className="text-[10px] text-slate-500 max-w-[140px] truncate" title={r.reason}>{r.reason}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {['validated', 'previewed'].includes(r.status) && <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => doPreview(r.id)}><Eye className="w-3 h-3" /> معاينة الأثر</Button>}
                            {r.status === 'previewed' && <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-emerald-700" onClick={() => setDlg({ t: 'approve', req: r })}><CheckCircle2 className="w-3 h-3" /> اعتماد</Button>}
                            {['validated', 'previewed', 'approved'].includes(r.status) && <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-rose-600" onClick={() => setDlg({ t: 'reject', req: r })}><XCircle className="w-3 h-3" /> رفض</Button>}
                            {/* v8.0 — real execution (approved only, server re-validates checksum + authority) */}
                            {r.status === 'approved' && <Button size="sm" className="h-7 px-2 gap-1 bg-rose-600 hover:bg-rose-700 text-white" onClick={() => setDlg({ t: 'execute', req: r })}>🚀 تنفيذ</Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>
          {preview && (
            <div className="border rounded-lg p-3 space-y-2">
              <div className="text-xs font-extrabold text-slate-600">🔎 معاينة الأثر — ما الذي سيتأثر؟ <span className="text-amber-600 font-normal">({preview.warning})</span></div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                {preview.rows.map(p => (
                  <div key={p.collection} className="border rounded-md p-1.5 text-[10px] bg-slate-50">
                    <div className="font-bold font-mono">{p.collection}</div>
                    <div>في النسخة: <b>{p.in_backup}</b> · حالياً بالقاعدة: <b className="text-rose-600">{p.currently_in_db ?? '—'}</b></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent></Card>
      )}

      {tab === 'retention' && (
        <Card><CardContent className="pt-4 space-y-3 max-w-2xl">
          <div className="text-sm font-extrabold text-slate-700">⏳ سياسة الاحتفاظ بالنسخ</div>
          {ret?.cleanup_note && <div className="bg-blue-50 border border-blue-200 rounded-md p-2 text-[11px] text-blue-900">ℹ️ {ret.cleanup_note}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div><div className="text-xs font-bold text-slate-500 mb-1">عدد النسخ المحتفظ بها</div><Input type="number" min="1" value={retForm.keep_count} onChange={e => setRetForm({ ...retForm, keep_count: e.target.value })} className="bg-white" placeholder="مثال: 20" /></div>
            <div><div className="text-xs font-bold text-slate-500 mb-1">مدة الاحتفاظ (أيام)</div><Input type="number" min="1" value={retForm.keep_days} onChange={e => setRetForm({ ...retForm, keep_days: e.target.value })} className="bg-white" placeholder="مثال: 90" /></div>
            <div><div className="text-xs font-bold text-slate-500 mb-1">النطاق</div>
              <Select value={retForm.scope} onValueChange={x => setRetForm({ ...retForm, scope: x })}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="tenant">نسخ المكاتب فقط (كل الأنواع)</SelectItem>
                  <SelectItem value="system">نسخ المنظومة فقط</SelectItem>
                  {/* v8.0 — the SAME single policy understands the new backup types */}
                  <SelectItem value="office_config">نسخ إعدادات المكاتب فقط</SelectItem>
                  <SelectItem value="office_data">نسخ بيانات المكاتب فقط</SelectItem>
                  <SelectItem value="full_office">نسخ المكاتب الكاملة فقط</SelectItem>
                  <SelectItem value="full_system">نسخ النظام الكاملة فقط</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold mt-5"><input type="checkbox" checked={retForm.protect_manual} onChange={e => setRetForm({ ...retForm, protect_manual: e.target.checked })} className="accent-blue-600" /> 🛡️ حماية النسخ اليدوية المهمة من الحذف التلقائي</label>
          </div>
          <div><div className="text-xs font-bold text-rose-600 mb-1">سبب التعديل * (Audit)</div><Textarea value={retForm.reason} onChange={e => setRetForm({ ...retForm, reason: e.target.value })} rows={2} /></div>
          <Button disabled={!retForm.reason.trim()} className="bg-blue-600 hover:bg-blue-700" onClick={async () => { try { await api('/admin/system/retention', { method: 'PUT', body: { ...retForm, keep_count: retForm.keep_count || null, keep_days: retForm.keep_days || null } }); toast.success('حُفظت السياسة — التنظيف التلقائي يبقى معطلاً (نقطة قرار)'); setRetForm(f => ({ ...f, reason: '' })); loadRet() } catch (e) { toast.error(e.message) } }}>حفظ السياسة</Button>
        </CardContent></Card>
      )}

      {dlg?.t === 'create' && <CreateDialog tenants={tenants} isMainSA={isMainSA} onClose={() => setDlg(null)} onDone={load} />}
      {dlg?.t === 'restore' && <RestoreDialog backups={data?.rows || []} onClose={() => setDlg(null)} onDone={loadRestores} />}
      {dlg?.t === 'approve' && <ApproveDialog req={dlg.req} onClose={() => setDlg(null)} onDone={loadRestores} />}
      {/* v8.0 — upload / execute / reject modals (no browser prompts) */}
      {dlg?.t === 'upload' && <UploadRestoreDialog onClose={() => setDlg(null)} onDone={loadRestores} />}
      {dlg?.t === 'execute' && <ExecuteDialog req={dlg.req} onClose={() => setDlg(null)} onDone={loadRestores} />}
      {dlg?.t === 'reject' && <RejectDialog req={dlg.req} onClose={() => setDlg(null)} onDone={loadRestores} />}
    </div>
  )
}

export default AdminBackupCenter
