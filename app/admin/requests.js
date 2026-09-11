'use client'
// ============================================================================
// v3.94 — ADMIN REQUESTS CENTER (Batch 2) — STRICTLY READ-ONLY UI.
// REUSES: /api/admin/requests/* (lib/adminRequests.js) — a unified window over
// the REAL workflows (Meraaj B2B, password resets, affiliate cashouts,
// executed refunds, office verifications). Native statuses are shown as-is;
// the unified status is display-only. NO approve/reject/write actions here —
// existing action APIs stay in their original flows (documented per request).
// ============================================================================
import React, { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { RefreshCw, Lock, Eye, ChevronRight, ChevronLeft, AlertTriangle, Clock } from 'lucide-react'
import { api } from '../shared'

const n2 = (v) => (typeof v === 'number' ? v.toLocaleString('en-US') : v ?? '—')
const dtt = (v) => (v ? new Date(v).toLocaleString('ar-EG') : '—')
const AGE = (h) => (h == null ? '—' : h < 24 ? `${h} ساعة` : `${Math.floor(h / 24)} يوم`)

const TYPES = {
  meraaj: '🕋 حجز معراج B2B', password_reset: '🔑 استعادة كلمة مرور', cashout: '💸 سحب عمولة',
  refund: '↩️ استرداد (منفذ)', verification: '🏢 توثيق مكتب',
}
const USTAT = {
  new: ['جديد', 'bg-blue-100 text-blue-700'], needs_action: ['يحتاج إجراء', 'bg-amber-100 text-amber-800'],
  in_review: ['قيد المراجعة', 'bg-indigo-100 text-indigo-700'], approved: ['معتمد', 'bg-emerald-100 text-emerald-700'],
  rejected: ['مرفوض', 'bg-rose-100 text-rose-700'], executed: ['منفذ', 'bg-emerald-100 text-emerald-700'],
  completed: ['مكتمل', 'bg-emerald-100 text-emerald-700'], cancelled: ['ملغى', 'bg-slate-200 text-slate-600'],
  refunded: ['مسترد', 'bg-orange-100 text-orange-700'],
}
const UBadge = ({ r }) => {
  const [l, c] = USTAT[r.status_unified] || [r.status_unified || '—', 'bg-slate-100 text-slate-600']
  return <Badge className={c}>{r.status_label || l}</Badge>
}

const DetailDialog = ({ q, onClose }) => {
  const [d, setD] = useState(null)
  useEffect(() => { api(`/admin/requests/detail?type=${q.type}&id=${q.id}`).then(setD).catch(e => { toast.error(e.message); onClose() }) }, [])
  const row = d?.row || {}
  const SKIP_KEYS = ['history', 'registrants', '_id']
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle>🔎 تفاصيل الطلب — {TYPES[q.type]}</DialogTitle></DialogHeader>
        {!d ? <div className="py-10 text-center text-slate-400">جارِ التحميل...</div> : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">🏢 {row.tenant_name}</Badge>
              <Badge variant="outline" className="font-mono">📎 {row.ref}</Badge>
              <UBadge r={row} />
              {row.late && <Badge className="bg-rose-100 text-rose-700 gap-1"><Clock className="w-3 h-3" /> متأخر ({AGE(row.age_hours)})</Badge>}
              <Badge className="bg-amber-100 text-amber-700 gap-1"><Lock className="w-3 h-3" /> قراءة فقط</Badge>
            </div>
            {d.actions_note && <div className="bg-blue-50/70 border border-blue-200 rounded-md p-2 text-[11px] text-blue-900">ℹ️ {d.actions_note}</div>}
            {/* key data */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              {[['المبلغ', row.amount != null ? `${n2(row.amount)} ${row.currency || ''}` : null], ['طريقة الدفع', row.payment_method], ['المنشئ/المصدر', row.created_by], ['الطرف/المستفيد', row.party || row.traveler], ['عدد المسافرين', row.pax], ['المسؤول', row.responsible], ['مدة بالحالة الحالية', AGE(row.age_hours)], ['السبب/ملاحظة', row.note]]
                .filter(([, v]) => v !== null && v !== undefined && v !== '—')
                .map(([l, v]) => (
                  <div key={l} className="border rounded-lg p-2 bg-slate-50"><div className="text-[10px] text-slate-500">{l}</div><div className="font-bold text-xs break-words">{v}</div></div>
                ))}
            </div>
            {/* timeline */}
            <div className="border rounded-lg p-3">
              <div className="text-xs font-extrabold text-slate-600 mb-2">📜 التسلسل الزمني الكامل</div>
              {(d.timeline || []).length === 0 ? <div className="text-xs text-slate-400">لا أحداث مسجلة</div> : (
                <div className="space-y-1.5">
                  {d.timeline.map((t, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-slate-400 whitespace-nowrap">{dtt(t.at)}</span>
                      <span className="font-semibold">{t.ev}</span>
                      {t.by && <span className="text-slate-500" dir="ltr">({t.by})</span>}
                      {t.note && <span className="text-slate-400">— {t.note}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* linked records */}
            {(d.linked_booking || d.journal_entries?.length > 0 || d.original_op || d.refund_je || d.documents?.length > 0 || d.tenant_affiliate) && (
              <div className="border rounded-lg p-3 text-xs space-y-1">
                <div className="font-extrabold text-slate-600">🔗 السجلات المرتبطة</div>
                {d.linked_booking && <div>حجز الباكج (بعد الاعتماد): <span className="font-mono">{d.linked_booking.id}</span> — {d.linked_booking.pilgrim_name || ''} · {n2(d.linked_booking.total_sale)} {d.linked_booking.currency}</div>}
                {d.original_op && <div>العملية الأصلية ({d.doc?.ref_type}): <span className="font-mono">{d.original_op.id}</span> — {d.original_op.passenger_name || d.original_op.beneficiary_name || ''} · بيع {n2(d.original_op.sale_price)} {d.original_op.currency}</div>}
                {d.refund_je && <div>قيد الاسترداد: <span className="font-mono">{d.refund_je.id}</span> — {d.refund_je.description}</div>}
                {(d.journal_entries || []).map(j => <div key={j.id}>قيد يومية: <span className="font-mono">{j.id}</span> — {j.description}</div>)}
                {(d.documents || []).map(doc => <div key={doc.id}>📄 مستند: {doc.label || doc.doc_type} — {doc.filename} ({Math.round((doc.size || 0) / 1024)}KB)</div>)}
                {d.tenant_affiliate && <div>رصيد أفلييت المكتب: {n2(d.tenant_affiliate.balance_usd)} USD · محجوز: {n2(d.tenant_affiliate.reserved_usd || 0)} USD</div>}
                {d.links?.commission && <div>💠 عمولة مرتبطة: راجعها في «مركز العمولات → معراج B2B»</div>}
              </div>
            )}
            {/* refund financial breakdown */}
            {q.type === 'refund' && d.doc && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                {[['البيع الأصلي', d.doc.original_sale], ['التكلفة الأصلية', d.doc.original_cost], ['غرامة المورد', d.doc.supplier_penalty], ['رسوم المكتب', d.doc.office_fee], ['المسترد للعميل', d.doc.refund_to_client]].map(([l, v]) => (
                  <div key={l} className="border rounded-lg p-2 bg-orange-50/50"><div className="text-[10px] text-slate-500">{l}</div><div className="font-extrabold text-xs">{n2(v)} {d.doc.currency}</div></div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

const AdminRequestsCenter = () => {
  const [tenants, setTenants] = useState([])
  const [ov, setOv] = useState(null)
  const [f, setF] = useState({ type: 'all', tenant: '', status: '', q: '', from: '', to: '', needs_action: false, late: false })
  const [rows, setRows] = useState(null)
  const [total, setTotal] = useState(0)
  const [skip, setSkip] = useState(0)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)

  const loadOv = () => api('/admin/requests/overview').then(setOv).catch(() => {})
  useEffect(() => { loadOv(); api('/admin/tenants').then(d => setTenants(d?.tenants || [])).catch(() => {}) }, [])

  const load = async (over = {}) => {
    setLoading(true)
    try {
      const o = { ...f, ...over, skip: over.skip ?? skip, limit: 50 }
      const qs = Object.entries(o).filter(([, v]) => v !== '' && v !== false && v !== undefined && v !== 'all').map(([k, v]) => `${k}=${encodeURIComponent(v === true ? '1' : v)}`).join('&')
      const r = await api(`/admin/requests/list?${qs}${o.type === 'all' ? '&type=all' : ''}`)
      setRows(r.rows || []); setTotal(r.total_matched || 0)
    } catch (e) { toast.error(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [skip])

  const applyQueue = (patch) => { const nf = { ...f, status: '', needs_action: false, late: false, ...patch }; setF(nf); setSkip(0); load({ ...patch, status: patch.status || '', skip: 0 }) }

  const QUEUES = ov ? [
    ['الكل', ov.total, {}, 'bg-slate-700'],
    ['جديدة', ov.queues.new, { status: 'new' }, 'bg-blue-600'],
    ['تحتاج إجراء', ov.queues.needs_action, { needs_action: true }, 'bg-amber-600'],
    ['متأخرة +48س', ov.queues.late, { late: true }, 'bg-rose-600'],
    ['قيد المراجعة', ov.queues.in_review, { status: 'in_review' }, 'bg-indigo-600'],
    ['معتمدة', ov.queues.approved, { status: 'approved' }, 'bg-emerald-600'],
    ['مرفوضة', ov.queues.rejected, { status: 'rejected' }, 'bg-rose-500'],
    ['منفذة/مكتملة', (ov.queues.executed || 0) + (ov.queues.completed || 0), { status: 'executed' }, 'bg-emerald-700'],
    ['ملغاة', ov.queues.cancelled, { status: 'cancelled' }, 'bg-slate-500'],
    ['مستردة', ov.queues.refunded, { status: 'refunded' }, 'bg-orange-600'],
  ] : []

  const Sel = ({ v, set, items, ph, w = 'w-36' }) => (
    <Select value={v || 'all'} onValueChange={x => set(x === 'all' ? '' : x)}>
      <SelectTrigger className={`${w} bg-white h-9 text-xs`}><SelectValue placeholder={ph} /></SelectTrigger>
      <SelectContent><SelectItem value="all">{ph} — الكل</SelectItem>{items.map(i => <SelectItem key={i.v} value={i.v}>{i.l}</SelectItem>)}</SelectContent>
    </Select>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-sm font-extrabold text-slate-700">📥 متابعة موحدة لجميع طلبات النظام</div>
        <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50 mr-auto"><Lock className="w-3 h-3" /> قراءة فقط — دورات العمل الأصلية لا تُمس، والإجراءات تبقى في مساراتها القائمة</Badge>
      </div>

      {/* queues */}
      <div className="flex gap-1.5 flex-wrap">
        {QUEUES.map(([l, n, patch, color]) => (
          <button key={l} onClick={() => applyQueue(patch)} className={`${color} text-white rounded-lg px-3 py-1.5 text-xs font-bold hover:opacity-90 flex items-center gap-1.5`}>
            {l} <span className="bg-white/25 rounded px-1.5">{n ?? 0}</span>
          </button>
        ))}
        {ov && <Button size="sm" variant="outline" onClick={loadOv} className="gap-1 h-8"><RefreshCw className="w-3 h-3" /></Button>}
      </div>

      {/* per-type summary */}
      {ov && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {Object.entries(ov.by_type).map(([t, v]) => (
            <button key={t} onClick={() => { setF({ ...f, type: t }); setSkip(0); load({ type: t, skip: 0 }) }} className={`border rounded-lg p-2 text-right bg-white hover:bg-slate-50 ${f.type === t ? 'ring-2 ring-blue-500' : ''}`}>
              <div className="text-[11px] font-bold text-slate-600 truncate">{TYPES[t] || v.label}</div>
              <div className="text-lg font-extrabold">{v.total}</div>
              <div className="text-[10px] text-slate-500">{v.needs_action > 0 ? <span className="text-amber-600 font-bold">⚠️ {v.needs_action} يحتاج إجراء</span> : 'لا إجراءات معلقة'}{v.late > 0 ? <span className="text-rose-600 font-bold"> · {v.late} متأخر</span> : ''}</div>
            </button>
          ))}
        </div>
      )}

      {/* filters */}
      <Card><CardContent className="pt-4 flex flex-wrap items-center gap-2">
        <Sel v={f.type === 'all' ? '' : f.type} set={x => setF({ ...f, type: x || 'all' })} items={Object.entries(TYPES).map(([v, l]) => ({ v, l }))} ph="النوع" w="w-44" />
        <Sel v={f.tenant} set={x => setF({ ...f, tenant: x })} items={tenants.map(t => ({ v: t.id, l: t.name }))} ph="المكتب" w="w-40" />
        <Sel v={f.status} set={x => setF({ ...f, status: x })} items={Object.entries(USTAT).map(([v, [l]]) => ({ v, l }))} ph="الحالة" w="w-36" />
        <Input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} className="w-36 h-9 bg-white text-xs" />
        <Input type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} className="w-36 h-9 bg-white text-xs" />
        <Input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} onKeyDown={e => e.key === 'Enter' && (setSkip(0), load({ skip: 0 }))} placeholder="بحث: مرجع/اسم/إيميل/باكج..." className="w-52 h-9 bg-white text-xs" />
        <label className="flex items-center gap-1.5 text-xs font-bold text-amber-700"><input type="checkbox" checked={f.needs_action} onChange={e => setF({ ...f, needs_action: e.target.checked })} className="accent-amber-600" /> يحتاج إجراء</label>
        <label className="flex items-center gap-1.5 text-xs font-bold text-rose-700"><input type="checkbox" checked={f.late} onChange={e => setF({ ...f, late: e.target.checked })} className="accent-rose-600" /> متأخر</label>
        <Button size="sm" onClick={() => { setSkip(0); load({ skip: 0 }) }} disabled={loading} className="bg-blue-600 hover:bg-blue-700 gap-1"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> تطبيق</Button>
      </CardContent></Card>

      {/* table */}
      <Card><CardContent className="pt-3">
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="bg-slate-50">
              <TableHead className="text-right">المرجع / النوع</TableHead><TableHead className="text-right">المصدر</TableHead>
              <TableHead className="text-right">المكتب</TableHead><TableHead className="text-right">المنشئ</TableHead>
              <TableHead className="text-right">الطرف</TableHead><TableHead className="text-right">المبلغ</TableHead>
              <TableHead className="text-right">الإنشاء</TableHead><TableHead className="text-right">بالحالة منذ</TableHead>
              <TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">المسؤول</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows === null ? <TableRow><TableCell colSpan={11} className="text-center py-8 text-slate-400">جارِ التحميل...</TableCell></TableRow>
                : rows.length === 0 ? <TableRow><TableCell colSpan={11} className="text-center py-8 text-slate-400">لا نتائج</TableCell></TableRow>
                  : rows.map(r => (
                    <TableRow key={`${r.type}-${r.id}`} className={r.late ? 'bg-rose-50/40' : r.needs_action ? 'bg-amber-50/40' : ''}>
                      <TableCell><div className="text-xs font-bold">{TYPES[r.type]}</div><div className="text-[10px] text-slate-400 font-mono">{String(r.ref || '').slice(0, 16)}</div></TableCell>
                      <TableCell className="text-xs">{r.source}</TableCell>
                      <TableCell className="text-xs">{r.tenant_name}</TableCell>
                      <TableCell className="text-[10px]" dir="ltr">{r.created_by || '—'}</TableCell>
                      <TableCell className="text-xs">{r.party || '—'}{r.pax ? <span className="text-slate-400"> ({r.pax} مسافر)</span> : null}</TableCell>
                      <TableCell className="text-xs font-bold">{r.amount != null ? `${n2(r.amount)} ${r.currency || ''}` : '—'}</TableCell>
                      <TableCell className="text-[10px]">{dtt(r.created_at)}</TableCell>
                      <TableCell className="text-[10px]">{AGE(r.age_hours)}{r.late && <AlertTriangle className="w-3 h-3 text-rose-500 inline mr-1" />}</TableCell>
                      <TableCell><UBadge r={r} /></TableCell>
                      <TableCell className="text-[10px]">{r.responsible || '—'}</TableCell>
                      <TableCell><Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setDetail({ type: r.type, id: r.id })}><Eye className="w-3 h-3" /></Button></TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
          <Button size="sm" variant="outline" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - 50))} className="gap-1"><ChevronRight className="w-3.5 h-3.5" /> السابق</Button>
          <span>{total ? `${skip + 1}–${Math.min(skip + 50, total)} من ${total}` : ''}</span>
          <Button size="sm" variant="outline" disabled={skip + 50 >= total} onClick={() => setSkip(skip + 50)} className="gap-1">التالي <ChevronLeft className="w-3.5 h-3.5" /></Button>
        </div>
      </CardContent></Card>

      {detail && <DetailDialog q={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

export default AdminRequestsCenter
