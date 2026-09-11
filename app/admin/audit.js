'use client'
// ============================================================================
// v3.95 — ADMIN CENTRAL AUDIT LOG (Batch 3) — STRICTLY READ-ONLY.
// Sources: audit_logs (admin ops with before/after+reason), je_audit (journal
// deletions per office), document_audit (office documents). Gaps are shown
// honestly (no IP/UA/success recorded, historical admin ops not audited).
// Audit records can never be edited or deleted — no write endpoints exist.
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
import { RefreshCw, Lock, Eye, ChevronRight, ChevronLeft, FileSearch } from 'lucide-react'
import { api } from '../shared'

const dtt = (v) => (v ? new Date(v).toLocaleString('ar-EG') : '—')
const CATC = { permissions: 'bg-indigo-100 text-indigo-700', announcements: 'bg-blue-100 text-blue-700', backup: 'bg-emerald-100 text-emerald-700', restore: 'bg-amber-100 text-amber-800', maintenance: 'bg-orange-100 text-orange-700', notifications: 'bg-cyan-100 text-cyan-700', journal_delete: 'bg-rose-100 text-rose-700', documents: 'bg-slate-200 text-slate-700' }

const DetailDialog = ({ q, onClose }) => {
  const [d, setD] = useState(null)
  useEffect(() => { api(`/admin/audit/detail?src=${q.src}&id=${q.id}`).then(setD).catch(e => { toast.error(e.message); onClose() }) }, [])
  const J = ({ v }) => <pre className="text-[10px] bg-slate-50 border rounded-md p-2 overflow-x-auto max-h-56 whitespace-pre-wrap" dir="ltr">{JSON.stringify(v, null, 2)}</pre>
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle>🔎 تفاصيل سجل التدقيق</DialogTitle></DialogHeader>
        {!d ? <div className="py-10 text-center text-slate-400">جارِ التحميل...</div> : (
          <div className="space-y-3">
            <div className="bg-slate-100 border rounded-md p-2 text-[11px] text-slate-600 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> {d.immutable_note} · الحقول الحساسة (كلمات مرور/مفاتيح) مخفية تلقائياً</div>
            {d.doc.before != null || d.doc.after != null ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div><div className="text-xs font-extrabold text-rose-600 mb-1">قبل (Before)</div><J v={d.doc.before ?? '— غير مسجل'} /></div>
                <div><div className="text-xs font-extrabold text-emerald-600 mb-1">بعد (After)</div><J v={d.doc.after ?? '— غير مسجل'} /></div>
              </div>
            ) : null}
            <div><div className="text-xs font-extrabold text-slate-600 mb-1">السجل الكامل</div><J v={d.doc} /></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

const AdminAuditCenter = () => {
  const [cats, setCats] = useState([])
  const [tenants, setTenants] = useState([])
  const [f, setF] = useState({ category: '', actor: '', tenant: '', q: '', from: '', to: '' })
  const [rows, setRows] = useState(null)
  const [total, setTotal] = useState(0)
  const [gaps, setGaps] = useState([])
  const [skip, setSkip] = useState(0)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api('/admin/audit/categories').then(d => setCats(d.categories || [])).catch(() => {})
    api('/admin/tenants').then(d => setTenants(d?.tenants || [])).catch(() => {})
  }, [])

  const load = async (over = {}) => {
    setLoading(true)
    try {
      const o = { ...f, ...over, skip: over.skip ?? skip, limit: 50 }
      const qs = Object.entries(o).filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
      const r = await api(`/admin/audit/list?${qs}`)
      setRows(r.rows || []); setTotal(r.total_matched || 0); setGaps(r.gaps || [])
    } catch (e) { toast.error(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [skip])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-sm font-extrabold text-slate-700 flex items-center gap-1.5"><FileSearch className="w-4 h-4" /> سجل التدقيق المركزي</div>
        <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50 mr-auto"><Lock className="w-3 h-3" /> قراءة فقط — لا تعديل ولا حذف لأي سجل، ومشاهدة سجل لا تُنشئ سجلاً جديداً</Badge>
      </div>

      {gaps.length > 0 && (
        <Card className="border-dashed"><CardContent className="py-2.5 text-[11px] text-slate-500 space-y-0.5">
          <div className="font-extrabold text-slate-600">📝 فجوات موثقة (لا بيانات تقديرية):</div>
          {gaps.map((g, i) => <div key={i}>• {g}</div>)}
        </CardContent></Card>
      )}

      <Card><CardContent className="pt-4 flex flex-wrap items-center gap-2">
        <Select value={f.category || 'all'} onValueChange={x => setF({ ...f, category: x === 'all' ? '' : x })}>
          <SelectTrigger className="w-44 bg-white h-9 text-xs"><SelectValue placeholder="الفئة" /></SelectTrigger>
          <SelectContent><SelectItem value="all">الفئة — الكل</SelectItem>{cats.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={f.tenant || 'all'} onValueChange={x => setF({ ...f, tenant: x === 'all' ? '' : x })}>
          <SelectTrigger className="w-40 bg-white h-9 text-xs"><SelectValue placeholder="المكتب" /></SelectTrigger>
          <SelectContent><SelectItem value="all">المكتب — الكل</SelectItem>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
        <Input value={f.actor} onChange={e => setF({ ...f, actor: e.target.value })} placeholder="المنفذ (إيميل)..." className="w-44 h-9 bg-white text-xs" />
        <Input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} onKeyDown={e => e.key === 'Enter' && (setSkip(0), load({ skip: 0 }))} placeholder="بحث: إجراء/هدف/سبب..." className="w-48 h-9 bg-white text-xs" />
        <Input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} className="w-36 h-9 bg-white text-xs" />
        <Input type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} className="w-36 h-9 bg-white text-xs" />
        <Button size="sm" onClick={() => { setSkip(0); load({ skip: 0 }) }} disabled={loading} className="bg-blue-600 hover:bg-blue-700 gap-1"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> تطبيق</Button>
      </CardContent></Card>

      <Card><CardContent className="pt-3">
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="bg-slate-50">
              <TableHead className="text-right">التاريخ</TableHead><TableHead className="text-right">المنفذ / الدور</TableHead>
              <TableHead className="text-right">المكتب</TableHead><TableHead className="text-right">الفئة</TableHead>
              <TableHead className="text-right">الإجراء</TableHead><TableHead className="text-right">الهدف</TableHead>
              <TableHead className="text-right">قبل/بعد</TableHead><TableHead className="text-right">السبب</TableHead>
              <TableHead className="text-right">IP / UA / نتيجة</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows === null ? <TableRow><TableCell colSpan={10} className="text-center py-8 text-slate-400">جارِ التحميل...</TableCell></TableRow>
                : rows.length === 0 ? <TableRow><TableCell colSpan={10} className="text-center py-8 text-slate-400">لا سجلات مطابقة</TableCell></TableRow>
                  : rows.map(r => (
                    <TableRow key={`${r.src}-${r.id}`}>
                      <TableCell className="text-[10px] whitespace-nowrap">{dtt(r.at)}</TableCell>
                      <TableCell><div className="text-[10px]" dir="ltr">{r.actor || '—'}</div><div className="text-[9px] text-slate-400">{r.role === 'super_admin' ? 'سوبر أدمن' : 'مكتب'}</div></TableCell>
                      <TableCell className="text-xs">{r.tenant_name}</TableCell>
                      <TableCell><Badge className={CATC[r.category] || 'bg-slate-100 text-slate-600'}>{r.category_label}</Badge></TableCell>
                      <TableCell className="text-xs font-mono">{r.action}</TableCell>
                      <TableCell className="text-[10px] font-mono">{String(r.target || '—').slice(0, 14)}</TableCell>
                      <TableCell className="text-xs">{r.has_before_after ? '✅' : '—'}</TableCell>
                      <TableCell className="text-[10px] text-slate-500 max-w-[160px] truncate" title={r.reason || ''}>{r.reason || '—'}</TableCell>
                      <TableCell className="text-[9px] text-slate-400">غير مسجل (فجوة)</TableCell>
                      <TableCell><Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setDetail({ src: r.src, id: r.id })}><Eye className="w-3 h-3" /></Button></TableCell>
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

export default AdminAuditCenter
