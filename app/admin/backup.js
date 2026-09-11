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
import { api } from '../shared'

const dtt = (v) => (v ? new Date(v).toLocaleString('ar-EG') : '—')
const kb = (b) => (b == null ? '—' : b > 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`)
const BST = { completed: ['مكتملة', 'bg-emerald-100 text-emerald-700'], running: ['قيد التنفيذ', 'bg-blue-100 text-blue-700'], failed: ['فشلت', 'bg-rose-100 text-rose-700'], queued: ['بالطابور', 'bg-slate-100 text-slate-600'] }
const RST = { validated: ['تم التحقق', 'bg-blue-100 text-blue-700'], previewed: ['تمت المعاينة', 'bg-indigo-100 text-indigo-700'], approved: ['معتمد (التنفيذ معطل)', 'bg-amber-100 text-amber-800'], rejected: ['مرفوض', 'bg-rose-100 text-rose-700'], executed: ['منفذ', 'bg-emerald-100 text-emerald-700'] }
const TYPE_L = { tenant_export: '💼 نسخة مكتب (Tenant)', system_settings: '⚙️ إعدادات المنظومة' }
const SB = ({ map, s }) => { const [l, c] = map[s] || [s || '—', 'bg-slate-100 text-slate-600']; return <Badge className={c}>{l}</Badge> }

const CreateDialog = ({ tenants, onClose, onDone }) => {
  const [v, setV] = useState({ type: 'tenant_export', tenant_id: '', reason: '', protect: false, confirm: false })
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (!v.reason.trim()) return toast.error('السبب مطلوب')
    if (!v.confirm) return toast.error('أكد البيئة والنطاق أولاً')
    setBusy(true)
    try {
      const r = await api('/admin/system/backups/create', { method: 'POST', body: v })
      toast.success(`اكتملت النسخة — ${kb(r.size_bytes)}${r.download_available ? '' : ' (بلا تخزين للحجم)'}`)
      onDone(); onClose()
    } catch (e) { toast.error(e.message) }
    setBusy(false)
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader><DialogTitle>➕ إنشاء نسخة احتياطية</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><div className="text-xs font-bold text-slate-500 mb-1">النوع</div>
            <Select value={v.type} onValueChange={x => setV({ ...v, type: x })}>
              <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(TYPE_L).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {v.type === 'tenant_export' && (
            <div><div className="text-xs font-bold text-slate-500 mb-1">المكتب *</div>
              <Select value={v.tenant_id || 'none'} onValueChange={x => setV({ ...v, tenant_id: x === 'none' ? '' : x })}>
                <SelectTrigger className="bg-white"><SelectValue placeholder="اختر المكتب" /></SelectTrigger>
                <SelectContent><SelectItem value="none">— اختر —</SelectItem>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div><div className="text-xs font-bold text-slate-500 mb-1">سبب الإنشاء * (Audit)</div><Textarea value={v.reason} onChange={e => setV({ ...v, reason: e.target.value })} rows={2} /></div>
          <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={v.protect} onChange={e => setV({ ...v, protect: e.target.checked })} className="accent-blue-600" /> 🛡️ نسخة محمية من الحذف التلقائي (مهمة)</label>
          <label className="flex items-center gap-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2"><input type="checkbox" checked={v.confirm} onChange={e => setV({ ...v, confirm: e.target.checked })} className="accent-amber-600" /> أؤكد البيئة والنطاق: {v.type === 'tenant_export' ? `مكتب ${tenants.find(t => t.id === v.tenant_id)?.name || '—'}` : 'إعدادات المنظومة كاملة'}</label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button onClick={run} disabled={busy} className="bg-blue-600 hover:bg-blue-700 gap-1"><DatabaseBackup className="w-4 h-4" /> {busy ? 'جارِ الإنشاء...' : 'إنشاء النسخة'}</Button>
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
          <div className="text-[11px] bg-rose-50 border border-rose-200 rounded-md p-2 text-rose-800">⚠️ النسخة تُستعاد حصراً لنفس مكتبها — الاستعادة لمكتب آخر ممنوعة من الخادم. التنفيذ الفعلي معطل في هذه المرحلة.</div>
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
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader><DialogTitle>✅ اعتماد طلب الاستعادة (Maker–Checker)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-slate-600">النطاق: <b>{req.tenant_name || 'إعدادات المنظومة'}</b> · البيئة: <b>{req.environment}</b></div>
          <div><div className="text-xs font-bold text-rose-600 mb-1">اكتب حرفياً: «أؤكد الاستعادة»</div><Input value={v.confirm_text} onChange={e => setV({ ...v, confirm_text: e.target.value })} /></div>
          <div><div className="text-xs font-bold text-slate-500 mb-1">سبب الاعتماد * (Audit)</div><Textarea value={v.reason} onChange={e => setV({ ...v, reason: e.target.value })} rows={2} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>تراجع</Button>
            <Button disabled={busy} className="bg-emerald-600 hover:bg-emerald-700" onClick={async () => { setBusy(true); try { const r = await api(`/admin/system/restores/${req.id}/approve`, { method: 'POST', body: v }); toast.success(r.note || 'تم الاعتماد'); onDone(); onClose() } catch (e) { toast.error(e.message) } setBusy(false) }}>اعتماد</Button>
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
  const [retForm, setRetForm] = useState({ keep_count: '', keep_days: '', scope: 'all', protect_manual: true, reason: '' })

  const load = () => api('/admin/system/backups').then(setData).catch(e => toast.error(e.message))
  const loadRestores = () => api('/admin/system/restores').then(setRestores).catch(e => toast.error(e.message))
  const loadRet = () => api('/admin/system/retention').then(d => { setRet(d); const r = d.retention || {}; setRetForm(f => ({ ...f, keep_count: r.keep_count ?? '', keep_days: r.keep_days ?? '', scope: r.scope || 'all', protect_manual: r.protect_manual !== false })) }).catch(() => {})
  useEffect(() => { load(); api('/admin/tenants').then(d => setTenants(d?.tenants || [])).catch(() => {}) }, [])
  useEffect(() => { if (tab === 'restore') loadRestores(); if (tab === 'retention') loadRet() }, [tab])

  const download = async (id) => {
    try {
      const r = await api(`/admin/system/backups/download?id=${id}`)
      const blob = new Blob([r.payload], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = r.filename; a.click(); URL.revokeObjectURL(url)
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
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-lg text-sm font-bold ${tab === k ? 'bg-blue-600 text-white shadow' : 'bg-white border text-slate-600'}`}>{l}</button>
        ))}
        <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50 mr-auto"><Lock className="w-3 h-3" /> تنفيذ الاستعادة والتنظيف التلقائي معطلان بالتصميم في هذه المرحلة</Badge>
      </div>

      {tab === 'backups' && (
        <div className="space-y-3">
          {/* capabilities — honest */}
          {data && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {Object.entries(data.capabilities).map(([k, v]) => (
                <div key={k} className={`border rounded-lg p-2 text-xs ${v.available ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50 border-dashed'}`}>
                  <div className="font-bold">{k === 'tenant_export' ? '💼 نسخة مكتب' : k === 'system_settings' ? '⚙️ إعدادات المنظومة' : k === 'full_system' ? '🗄️ Full System' : '💽 Database'} {v.available ? <Badge className="bg-emerald-100 text-emerald-700 mr-1">متاح</Badge> : <Badge className="bg-rose-100 text-rose-700 mr-1">غير متاح — قرار</Badge>}</div>
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
                          <TableCell className="text-[10px] text-slate-500 max-w-[140px] truncate" title={r.reason}>{r.reason}</TableCell>
                          <TableCell>{r.download_available ? <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => download(r.id)}><Download className="w-3 h-3" /> تنزيل</Button> : <span className="text-[9px] text-slate-400" title={r.storage_note || ''}>غير مخزنة</span>}</TableCell>
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
          <div className="bg-rose-50 border border-rose-200 rounded-md p-2 text-[11px] text-rose-800 flex items-center gap-2"><ShieldAlert className="w-4 h-4 shrink-0" /> {restores?.execution_note || 'التنفيذ الفعلي معطل بالتصميم — المسار الآمن (تحقق ← معاينة ← تأكيد ← اعتماد) مبني كاملاً'}</div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-extrabold text-slate-700">طلبات الاستعادة</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={loadRestores} className="gap-1"><RefreshCw className="w-3.5 h-3.5" /></Button>
              <Button size="sm" onClick={() => setDlg({ t: 'restore' })} className="bg-blue-600 hover:bg-blue-700 gap-1"><RotateCcw className="w-4 h-4" /> طلب استعادة</Button>
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
                            {['validated', 'previewed', 'approved'].includes(r.status) && <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-rose-600" onClick={async () => { const reason = window.prompt('سبب الرفض (إلزامي — Audit):'); if (!reason) return; try { await api(`/admin/system/restores/${r.id}/reject`, { method: 'POST', body: { reason } }); toast.success('تم الرفض'); loadRestores() } catch (e) { toast.error(e.message) } }}><XCircle className="w-3 h-3" /> رفض</Button>}
                            {r.status === 'approved' && <Button size="sm" disabled className="h-7 px-2 gap-1 opacity-60" title="التنفيذ الفعلي معطل بالتصميم — نقطة قرار"><Lock className="w-3 h-3" /> التنفيذ معطل</Button>}
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
                <SelectContent><SelectItem value="all">الكل</SelectItem><SelectItem value="tenant">نسخ المكاتب فقط</SelectItem><SelectItem value="system">نسخ المنظومة فقط</SelectItem></SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold mt-5"><input type="checkbox" checked={retForm.protect_manual} onChange={e => setRetForm({ ...retForm, protect_manual: e.target.checked })} className="accent-blue-600" /> 🛡️ حماية النسخ اليدوية المهمة من الحذف التلقائي</label>
          </div>
          <div><div className="text-xs font-bold text-rose-600 mb-1">سبب التعديل * (Audit)</div><Textarea value={retForm.reason} onChange={e => setRetForm({ ...retForm, reason: e.target.value })} rows={2} /></div>
          <Button disabled={!retForm.reason.trim()} className="bg-blue-600 hover:bg-blue-700" onClick={async () => { try { await api('/admin/system/retention', { method: 'PUT', body: { ...retForm, keep_count: retForm.keep_count || null, keep_days: retForm.keep_days || null } }); toast.success('حُفظت السياسة — التنظيف التلقائي يبقى معطلاً (نقطة قرار)'); setRetForm(f => ({ ...f, reason: '' })); loadRet() } catch (e) { toast.error(e.message) } }}>حفظ السياسة</Button>
        </CardContent></Card>
      )}

      {dlg?.t === 'create' && <CreateDialog tenants={tenants} onClose={() => setDlg(null)} onDone={load} />}
      {dlg?.t === 'restore' && <RestoreDialog backups={data?.rows || []} onClose={() => setDlg(null)} onDone={loadRestores} />}
      {dlg?.t === 'approve' && <ApproveDialog req={dlg.req} onClose={() => setDlg(null)} onDone={loadRestores} />}
    </div>
  )
}

export default AdminBackupCenter
