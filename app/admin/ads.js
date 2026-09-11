'use client'
// ============================================================================
// v3.94 — ADS & ANNOUNCEMENTS CENTER (Batch 2) — develops the EXISTING
// announcements module (same API /admin/announcements — extended in
// lib/adminAds.js). New: types (offer/maintenance/notice), scheduling,
// priority, placement, CTA, backend-enforced audience targeting, lifecycle
// (draft/scheduled/live/paused/expired/cancelled), duplicate, preview,
// publish-protection (no deletion of published items) and audit log.
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
import { RefreshCw, Plus, Pencil, Copy, Pause, Play, Ban, Trash2, Eye, Megaphone, Lock, FileSearch } from 'lucide-react'
import { api } from '../shared'

const dtt = (v) => (v ? new Date(v).toLocaleString('ar-EG') : '—')
const toLocal = (v) => { if (!v) return ''; const d = new Date(v); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }

const TYPES = { popup: '🪟 Popup', banner: '📢 Banner', offer: '🎁 عرض', maintenance: '🛠️ إشعار صيانة', notice: 'ℹ️ تنبيه عام' }
const DSTAT = {
  live: ['نشط الآن', 'bg-emerald-100 text-emerald-700'], scheduled: ['مجدول', 'bg-blue-100 text-blue-700'],
  expired: ['منتهي', 'bg-slate-200 text-slate-600'], paused: ['متوقف مؤقتاً', 'bg-amber-100 text-amber-700'],
  draft: ['مسودة', 'bg-slate-100 text-slate-500'], cancelled: ['ملغى', 'bg-rose-100 text-rose-700'],
}
const AUD = { all: 'جميع المكاتب', tenants: 'مكاتب محددة', plan: 'باقة اشتراك', sub_status: 'حالة الاشتراك' }
const IMPACT = { low: 'منخفض', medium: 'متوسط', high: 'مرتفع' }
const audLabel = (a, tenants) => {
  const au = a.audience
  if (!au || au.mode === 'all' || !au.mode) return 'الكل'
  if (au.mode === 'tenants') return `${(au.tenant_ids || []).length} مكتب`
  if (au.mode === 'plan') return `باقة: ${au.plan || '—'}`
  if (au.mode === 'sub_status') return au.sub_status === 'activated' ? 'مفعّلون' : 'غير مفعّلين'
  return '—'
}
const SBadge = ({ s }) => { const [l, c] = DSTAT[s] || [s || '—', 'bg-slate-100 text-slate-600']; return <Badge className={c}>{l}</Badge> }

// ---------- create / edit form ----------
const AdForm = ({ mode, ad, tenants, onClose, onSaved }) => {
  const [v, setV] = useState({
    type: ad?.type || 'popup', title: ad?.title || '', body: ad?.body || '',
    image_url: ad?.image_url || '', link_url: ad?.link_url || '', cta_text: ad?.cta_text || '',
    placement: ad?.placement || 'dashboard', priority: ad?.priority ?? 0,
    status: ad?.status || (ad ? (ad.active === false ? 'paused' : 'active') : 'draft'),
    starts_at: toLocal(ad?.starts_at), ends_at: toLocal(ad?.ends_at),
    aud_mode: ad?.audience?.mode || 'all', aud_tenants: ad?.audience?.tenant_ids || [], aud_plan: ad?.audience?.plan || '', aud_sub: ad?.audience?.sub_status || 'activated',
    m_start: toLocal(ad?.maintenance?.expected_start), m_end: toLocal(ad?.maintenance?.expected_end),
    m_affected: ad?.maintenance?.affected || '', m_impact: ad?.maintenance?.impact_level || 'low', m_info: ad?.maintenance?.info_url || '',
    reason: '',
  })
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const published = !!ad?.published_at

  const save = async () => {
    if (!v.title.trim()) return toast.error('العنوان مطلوب')
    if (mode === 'edit' && published && !v.reason.trim()) return toast.error('السبب مطلوب لتعديل إعلان سبق نشره (Audit)')
    const body = {
      type: v.type, title: v.title, body: v.body, image_url: v.image_url, link_url: v.link_url,
      cta_text: v.cta_text, placement: v.placement, priority: Number(v.priority) || 0, status: v.status,
      starts_at: v.starts_at ? new Date(v.starts_at).toISOString() : null,
      ends_at: v.ends_at ? new Date(v.ends_at).toISOString() : null,
      audience: v.aud_mode === 'tenants' ? { mode: 'tenants', tenant_ids: v.aud_tenants }
        : v.aud_mode === 'plan' ? { mode: 'plan', plan: v.aud_plan }
          : v.aud_mode === 'sub_status' ? { mode: 'sub_status', sub_status: v.aud_sub } : { mode: 'all' },
      maintenance: v.type === 'maintenance' ? { expected_start: v.m_start ? new Date(v.m_start).toISOString() : null, expected_end: v.m_end ? new Date(v.m_end).toISOString() : null, affected: v.m_affected, impact_level: v.m_impact, info_url: v.m_info } : undefined,
      reason: v.reason || undefined,
    }
    setSaving(true)
    try {
      if (mode === 'create') await api('/admin/announcements', { method: 'POST', body })
      else await api(`/admin/announcements/${ad.id}`, { method: 'PUT', body })
      toast.success(mode === 'create' ? 'تم إنشاء الإعلان' : 'تم حفظ التعديلات')
      onSaved(); onClose()
    } catch (e) { toast.error(e.message) }
    setSaving(false)
  }
  const F = ({ l, children, w = '' }) => <div className={w}><div className="text-xs font-bold text-slate-500 mb-1">{l}</div>{children}</div>

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle>{mode === 'create' ? '➕ إعلان / عرض جديد' : `✏️ تعديل: ${ad?.title}`}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <F l="النوع *">
              <Select value={v.type} onValueChange={x => setV({ ...v, type: x })}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TYPES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <F l="الحالة">
              <Select value={v.status} onValueChange={x => setV({ ...v, status: x })}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">مسودة</SelectItem><SelectItem value="active">مفعّل (حسب الجدولة)</SelectItem><SelectItem value="paused">متوقف مؤقتاً</SelectItem>
                </SelectContent>
              </Select>
            </F>
            <F l="الأولوية (الأعلى يظهر أولاً)"><Input type="number" min="0" max="999" value={v.priority} onChange={e => setV({ ...v, priority: e.target.value })} className="bg-white" /></F>
          </div>
          <F l="العنوان *"><Input value={v.title} onChange={e => setV({ ...v, title: e.target.value })} className="bg-white" /></F>
          <F l="النص / الوصف"><Textarea value={v.body} onChange={e => setV({ ...v, body: e.target.value })} rows={3} className="bg-white" /></F>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <F l="رابط الصورة (http/https)"><Input dir="ltr" value={v.image_url} onChange={e => setV({ ...v, image_url: e.target.value })} className="bg-white" placeholder="https://..." /></F>
            <F l="الرابط عند النقر"><Input dir="ltr" value={v.link_url} onChange={e => setV({ ...v, link_url: e.target.value })} className="bg-white" placeholder="https://..." /></F>
            <F l="نص زر الإجراء (CTA)"><Input value={v.cta_text} onChange={e => setV({ ...v, cta_text: e.target.value })} className="bg-white" placeholder="مثال: اطلع على العرض" /></F>
            <F l="مكان الظهور">
              <Select value={v.placement} onValueChange={x => setV({ ...v, placement: x })}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="dashboard">لوحة تحكم المكاتب</SelectItem><SelectItem value="everywhere">كل الشاشات</SelectItem></SelectContent>
              </Select>
            </F>
            <F l="بداية الظهور"><Input type="datetime-local" value={v.starts_at} onChange={e => setV({ ...v, starts_at: e.target.value })} className="bg-white" /></F>
            <F l="نهاية الظهور"><Input type="datetime-local" value={v.ends_at} onChange={e => setV({ ...v, ends_at: e.target.value })} className="bg-white" /></F>
          </div>

          {/* audience targeting (backend-enforced) */}
          <div className="border rounded-lg p-3 space-y-2">
            <div className="text-xs font-extrabold text-slate-600">🎯 الجمهور المستهدف (يُطبق من الخادم وليس إخفاءً في الواجهة)</div>
            <div className="flex flex-wrap gap-2 items-center">
              {Object.entries(AUD).map(([k, l]) => (
                <label key={k} className={`px-3 py-1 rounded-lg border text-xs font-bold cursor-pointer ${v.aud_mode === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600'}`}>
                  <input type="radio" className="hidden" checked={v.aud_mode === k} onChange={() => setV({ ...v, aud_mode: k })} />{l}
                </label>
              ))}
            </div>
            {v.aud_mode === 'tenants' && (
              <div className="max-h-36 overflow-y-auto border rounded-md p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                {tenants.map(t => (
                  <label key={t.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={v.aud_tenants.includes(t.id)} onChange={e => setV({ ...v, aud_tenants: e.target.checked ? [...v.aud_tenants, t.id] : v.aud_tenants.filter(x => x !== t.id) })} className="accent-blue-600" />
                    <span className="truncate">{t.name}</span>
                  </label>
                ))}
              </div>
            )}
            {v.aud_mode === 'plan' && <F l="اسم الباقة (كما في اشتراك المكتب)"><Input value={v.aud_plan} onChange={e => setV({ ...v, aud_plan: e.target.value })} className="bg-white w-56" placeholder="مثال: trial" /></F>}
            {v.aud_mode === 'sub_status' && (
              <Select value={v.aud_sub} onValueChange={x => setV({ ...v, aud_sub: x })}>
                <SelectTrigger className="bg-white w-56"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="activated">مكاتب مفعّلة (دفع مؤكد)</SelectItem><SelectItem value="not_activated">مكاتب غير مفعّلة</SelectItem></SelectContent>
              </Select>
            )}
            <div className="text-[10px] text-slate-400">الاستهداف بالدولة/الموقع غير متاح — بيانات الدولة غير مسجلة على المكاتب حالياً (فجوة موثقة)</div>
          </div>

          {/* maintenance notice fields */}
          {v.type === 'maintenance' && (
            <div className="border border-orange-200 bg-orange-50/50 rounded-lg p-3 space-y-2">
              <div className="text-xs font-extrabold text-orange-800">🛠️ بيانات إشعار الصيانة (إشعار فقط — لا يشغّل وضع الصيانة الفعلي)</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <F l="البداية المتوقعة"><Input type="datetime-local" value={v.m_start} onChange={e => setV({ ...v, m_start: e.target.value })} className="bg-white" /></F>
                <F l="النهاية المتوقعة"><Input type="datetime-local" value={v.m_end} onChange={e => setV({ ...v, m_end: e.target.value })} className="bg-white" /></F>
                <F l="الجهات/الوحدات المتأثرة"><Input value={v.m_affected} onChange={e => setV({ ...v, m_affected: e.target.value })} className="bg-white" placeholder="مثال: السندات والتقارير" /></F>
                <F l="مستوى التأثير">
                  <Select value={v.m_impact} onValueChange={x => setV({ ...v, m_impact: x })}>
                    <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(IMPACT).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F l="رابط معلومات إضافية" w="sm:col-span-2"><Input dir="ltr" value={v.m_info} onChange={e => setV({ ...v, m_info: e.target.value })} className="bg-white" placeholder="https://..." /></F>
              </div>
            </div>
          )}

          {mode === 'edit' && published && (
            <F l="سبب التعديل * (الإعلان سبق نشره — يُسجل في التدقيق)"><Textarea value={v.reason} onChange={e => setV({ ...v, reason: e.target.value })} rows={2} className="bg-white border-rose-200" /></F>
          )}

          {/* preview */}
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setPreview(!preview)} className="gap-1"><Eye className="w-3.5 h-3.5" /> {preview ? 'إخفاء المعاينة' : 'معاينة قبل الحفظ'}</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>إلغاء</Button>
              <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700">{saving ? '...' : 'حفظ'}</Button>
            </div>
          </div>
          {preview && (
            <div className="border-2 border-dashed rounded-xl p-4 bg-slate-50">
              <div className="text-[10px] text-slate-400 mb-2">معاينة تقريبية — {TYPES[v.type]}</div>
              <div className="bg-white rounded-xl shadow-lg p-4 max-w-md mx-auto space-y-2">
                {v.image_url && /^https?:\/\//.test(v.image_url) && <img src={v.image_url} alt="" className="w-full h-36 object-cover rounded-lg" onError={(e) => { e.target.style.display = 'none' }} />}
                <div className="font-extrabold text-slate-800">{v.title || '(العنوان)'}</div>
                <div className="text-sm text-slate-600 whitespace-pre-wrap">{v.body || '(النص)'}</div>
                {v.type === 'maintenance' && <div className="text-xs bg-orange-50 border border-orange-200 rounded p-2 text-orange-800">🛠️ صيانة متوقعة: {v.m_start ? dtt(v.m_start) : '—'} → {v.m_end ? dtt(v.m_end) : '—'} · التأثير: {IMPACT[v.m_impact]}{v.m_affected ? ` · يشمل: ${v.m_affected}` : ''}</div>}
                {(v.link_url || v.cta_text) && <button className="bg-blue-600 text-white text-sm font-bold rounded-lg px-4 py-2">{v.cta_text || 'المزيد'}</button>}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------- reason dialog (cancel) ----------
const ReasonDialog = ({ title, onClose, onConfirm }) => {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><div className="text-xs font-bold text-slate-500 mb-1">السبب * (يُسجل في التدقيق)</div><Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>تراجع</Button>
            <Button disabled={busy || !reason.trim()} className="bg-rose-600 hover:bg-rose-700" onClick={async () => { setBusy(true); try { await onConfirm(reason); onClose() } catch (e) { toast.error(e.message) } setBusy(false) }}>تأكيد</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------- main ----------
const AdminAdsCenter = () => {
  const [rows, setRows] = useState(null)
  const [counts, setCounts] = useState({})
  const [tenants, setTenants] = useState([])
  const [f, setF] = useState({ type: '', status: '', q: '' })
  const [dlg, setDlg] = useState(null)
  const [tab, setTab] = useState('list')
  const [audit, setAudit] = useState(null)

  const load = () => {
    const qs = Object.entries({ ...f, extended: 1 }).filter(([, v]) => v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    api(`/admin/announcements?${qs}`).then(d => { setRows(d.rows || []); setCounts(d.counts || {}) }).catch(e => toast.error(e.message))
  }
  useEffect(() => { load(); api('/admin/tenants').then(d => setTenants(d?.tenants || [])).catch(() => {}) }, [f.type, f.status])
  useEffect(() => { if (tab === 'audit') api('/admin/announcements/audit').then(d => setAudit(d.rows || [])).catch(() => {}) }, [tab])

  const act = async (ad, patch, okMsg, reason) => {
    try { await api(`/admin/announcements/${ad.id}`, { method: 'PUT', body: { ...patch, reason } }); toast.success(okMsg); load() } catch (e) { toast.error(e.message) }
  }
  const filtered = (rows || []).filter(r => !f.q || (r.title || '').toLowerCase().includes(f.q.toLowerCase()))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {[['list', '📢 الإعلانات والعروض', Megaphone], ['audit', '📜 سجل التدقيق', FileSearch]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-lg text-sm font-bold ${tab === k ? 'bg-blue-600 text-white shadow' : 'bg-white border text-slate-600'}`}>{l}</button>
        ))}
        <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50 mr-auto"><Lock className="w-3 h-3" /> الإعلان المنشور لا يُحذف — يُلغى أو يُعطّل مع بقاء السجل</Badge>
      </div>

      {tab === 'list' && (
        <>
          {/* KPI chips */}
          <div className="flex gap-1.5 flex-wrap">
            {Object.entries(DSTAT).map(([k, [l]]) => (
              <button key={k} onClick={() => setF({ ...f, status: f.status === k ? '' : k })} className={`rounded-lg px-3 py-1.5 text-xs font-bold border ${f.status === k ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}>
                {l} <span className="opacity-60">({counts[k] || 0})</span>
              </button>
            ))}
          </div>
          {/* filters + create */}
          <Card><CardContent className="pt-4 flex flex-wrap items-center gap-2">
            <Select value={f.type || 'all'} onValueChange={x => setF({ ...f, type: x === 'all' ? '' : x })}>
              <SelectTrigger className="w-40 bg-white h-9 text-xs"><SelectValue placeholder="النوع" /></SelectTrigger>
              <SelectContent><SelectItem value="all">النوع — الكل</SelectItem>{Object.entries(TYPES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} placeholder="بحث بالعنوان..." className="w-52 h-9 bg-white text-xs" />
            <Button size="sm" variant="outline" onClick={load} className="gap-1"><RefreshCw className="w-3.5 h-3.5" /> تحديث</Button>
            <Button size="sm" onClick={() => setDlg({ type: 'create' })} className="bg-blue-600 hover:bg-blue-700 gap-1 mr-auto"><Plus className="w-4 h-4" /> إعلان / عرض جديد</Button>
          </CardContent></Card>
          {/* table */}
          <Card><CardContent className="pt-3">
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-slate-50">
                  <TableHead className="text-right">الإعلان</TableHead><TableHead className="text-right">النوع</TableHead>
                  <TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">الأولوية</TableHead>
                  <TableHead className="text-right">الجمهور</TableHead><TableHead className="text-right">الجدولة</TableHead>
                  <TableHead className="text-right">المنشئ</TableHead><TableHead className="text-right">إجراءات</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows === null ? <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400">جارِ التحميل...</TableCell></TableRow>
                    : filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400">لا إعلانات</TableCell></TableRow>
                      : filtered.map(r => (
                        <TableRow key={r.id} className={r.display_status === 'cancelled' ? 'opacity-50' : ''}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {r.image_url ? <img src={r.image_url} alt="" className="w-9 h-9 rounded object-cover border" onError={(e) => { e.target.style.display = 'none' }} /> : null}
                              <div><div className="font-bold text-xs">{r.title}</div><div className="text-[10px] text-slate-400 truncate max-w-[220px]">{r.body}</div></div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{TYPES[r.type] || r.type}</TableCell>
                          <TableCell><SBadge s={r.display_status} /></TableCell>
                          <TableCell className="text-xs font-bold">{r.priority || 0}</TableCell>
                          <TableCell className="text-xs">{audLabel(r, tenants)}</TableCell>
                          <TableCell className="text-[10px]">{r.starts_at ? dtt(r.starts_at) : '—'}<br />{r.ends_at ? `→ ${dtt(r.ends_at)}` : ''}</TableCell>
                          <TableCell className="text-[10px]" dir="ltr">{r.created_by || '—'}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {r.display_status !== 'cancelled' && <Button size="sm" variant="outline" className="h-7 px-2" title="تعديل" onClick={() => setDlg({ type: 'edit', ad: r })}><Pencil className="w-3 h-3" /></Button>}
                              <Button size="sm" variant="outline" className="h-7 px-2" title="نسخ كإعلان جديد" onClick={async () => { try { await api(`/admin/announcements/${r.id}/duplicate`, { method: 'POST', body: {} }); toast.success('تم النسخ كمسودة'); load() } catch (e) { toast.error(e.message) } }}><Copy className="w-3 h-3" /></Button>
                              {['live', 'scheduled'].includes(r.display_status) && <Button size="sm" variant="outline" className="h-7 px-2 text-amber-600" title="إيقاف مؤقت" onClick={() => act(r, { status: 'paused' }, 'تم الإيقاف مؤقتاً')}><Pause className="w-3 h-3" /></Button>}
                              {['paused', 'draft'].includes(r.display_status) && <Button size="sm" variant="outline" className="h-7 px-2 text-emerald-600" title="تفعيل" onClick={() => act(r, { status: 'active' }, 'تم التفعيل')}><Play className="w-3 h-3" /></Button>}
                              {r.display_status !== 'cancelled' && <Button size="sm" variant="outline" className="h-7 px-2 text-rose-600" title="إلغاء نهائي" onClick={() => setDlg({ type: 'cancel', ad: r })}><Ban className="w-3 h-3" /></Button>}
                              {r.display_status === 'draft' && !r.published_at && <Button size="sm" variant="outline" className="h-7 px-2 text-rose-600 border-rose-200" title="حذف المسودة (لم تُنشر)" onClick={async () => { try { await api(`/admin/announcements/${r.id}`, { method: 'DELETE', body: {} }); toast.success('حُذفت المسودة'); load() } catch (e) { toast.error(e.message) } }}><Trash2 className="w-3 h-3" /></Button>}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </div>
            <div className="text-[10px] text-slate-400 mt-2">ℹ️ واجهة المكاتب الحالية تعرض Popup وBanner — الأنواع الجديدة (عرض/صيانة/تنبيه) تُسلَّم عبر نفس API وسيتم عرضها في واجهة المكاتب ضمن مرحلة لاحقة (موثق).</div>
          </CardContent></Card>
        </>
      )}

      {tab === 'audit' && (
        <Card><CardContent className="pt-4">
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-slate-50">
                <TableHead className="text-right">التاريخ</TableHead><TableHead className="text-right">المنفّذ</TableHead>
                <TableHead className="text-right">الإجراء</TableHead><TableHead className="text-right">الهدف</TableHead><TableHead className="text-right">السبب</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {audit === null ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-400">جارِ التحميل...</TableCell></TableRow>
                  : audit.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-400">لا سجلات بعد</TableCell></TableRow>
                    : audit.map((a, i) => (
                      <TableRow key={a.id || i}>
                        <TableCell className="text-xs whitespace-nowrap">{dtt(a.at)}</TableCell>
                        <TableCell className="text-xs" dir="ltr">{a.actor_email || '—'}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{a.action}</Badge></TableCell>
                        <TableCell className="text-xs font-mono">{String(a.target || '').slice(0, 12)}</TableCell>
                        <TableCell className="text-xs text-slate-500 max-w-[240px] truncate" title={a.reason || ''}>{a.reason || '—'}</TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>
        </CardContent></Card>
      )}

      {dlg?.type === 'create' && <AdForm mode="create" tenants={tenants} onClose={() => setDlg(null)} onSaved={load} />}
      {dlg?.type === 'edit' && <AdForm mode="edit" ad={dlg.ad} tenants={tenants} onClose={() => setDlg(null)} onSaved={load} />}
      {dlg?.type === 'cancel' && (
        <ReasonDialog title={`⚠️ إلغاء نهائي: ${dlg.ad.title}`} onClose={() => setDlg(null)}
          onConfirm={async (reason) => { await api(`/admin/announcements/${dlg.ad.id}`, { method: 'PUT', body: { status: 'cancelled', reason } }); toast.success('تم الإلغاء — السجل محفوظ'); load() }} />
      )}
    </div>
  )
}

export default AdminAdsCenter
