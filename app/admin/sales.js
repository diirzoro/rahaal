'use client'
// v3.93 — ADMIN SALES & VOUCHERS CENTER (Batch 1) — READ-ONLY.
// REUSES: /api/admin/center/sales, /sales-detail, /vouchers (lib/adminCenter.js)
// and /api/admin/tenants for the office filter. No writes, no recomputation.
import React, { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { RefreshCw, Lock, Eye, ChevronRight, ChevronLeft } from 'lucide-react'
import { api } from '../shared'

const n2 = (v) => (typeof v === 'number' ? v.toLocaleString('en-US') : v ?? '—')
const dt = (v) => (v ? new Date(v).toLocaleDateString('ar-EG') : '—')
const dtt = (v) => (v ? new Date(v).toLocaleString('ar-EG') : '—')
const KIND_L = { tickets: '🎫 تذكرة', visas: '🛂 تأشيرة', services: '🧰 خدمة', bookings: '📦 حجز باكج' }
const ST = { active: ['نشطة', 'bg-emerald-100 text-emerald-700'], refunded: ['مستردة/ملغاة', 'bg-rose-100 text-rose-700'], cancelled: ['ملغاة', 'bg-rose-100 text-rose-700'], reversed: ['معكوس', 'bg-orange-100 text-orange-700'] }
const StBadge = ({ s }) => { const [l, c] = ST[s] || [s || '—', 'bg-slate-100 text-slate-600']; return <Badge className={c}>{l}</Badge> }

const FILTER_CURRENCIES = ['YER', 'SAR', 'USD']

const AdminSalesCenter = ({ initialTab = 'sales' }) => {
  const [tab, setTab] = useState(initialTab)
  const [tenants, setTenants] = useState([])
  const [f, setF] = useState({ type: 'all', tenant: '', q: '', status: '', currency: '', payment: '', from: '', to: '', missing_je: false, vtype: '' })
  const [rows, setRows] = useState(null)
  const [skip, setSkip] = useState(0)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { api('/admin/tenants').then(d => setTenants(d?.tenants || [])).catch(() => {}) }, [])

  const qs = (extra = {}) => {
    const o = { ...f, ...extra, skip, limit: 50 }
    return Object.entries(o).filter(([, v]) => v !== '' && v !== false && v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(v === true ? '1' : v)}`).join('&')
  }
  const load = async () => {
    setLoading(true)
    try {
      const r = tab === 'sales' ? await api(`/admin/center/sales?${qs()}`) : await api(`/admin/center/vouchers?${qs()}`)
      setRows(r.rows || [])
    } catch (e) { toast.error(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [tab, skip])

  const openDetail = async (r) => {
    try { setDetail({ loading: true }); setDetail(await api(`/admin/center/sales-detail?kind=${r.kind}&id=${r.id}`)) } catch (e) { toast.error(e.message); setDetail(null) }
  }

  const Sel = ({ v, set, items, ph, w = 'w-32' }) => (
    <Select value={v || 'all'} onValueChange={x => set(x === 'all' ? '' : x)}>
      <SelectTrigger className={`${w} bg-white h-9 text-xs`}><SelectValue placeholder={ph} /></SelectTrigger>
      <SelectContent><SelectItem value="all">{ph} — الكل</SelectItem>{items.map(i => <SelectItem key={i.v} value={i.v}>{i.l}</SelectItem>)}</SelectContent>
    </Select>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {[['sales', '💰 المبيعات'], ['vouchers', '🧾 السندات']].map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setSkip(0); setRows(null) }} className={`px-4 py-1.5 rounded-lg text-sm font-bold ${tab === k ? 'bg-blue-600 text-white shadow' : 'bg-white border text-slate-600'}`}>{l}</button>
        ))}
        <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50 mr-auto"><Lock className="w-3 h-3" /> قراءة فقط — لا تعديل سندات/أرصدة من هنا</Badge>
      </div>

      {/* Filters */}
      <Card><CardContent className="pt-4 flex flex-wrap items-center gap-2">
        {tab === 'sales'
          ? <Sel v={f.type === 'all' ? '' : f.type} set={x => setF({ ...f, type: x || 'all' })} items={Object.entries(KIND_L).map(([v, l]) => ({ v, l }))} ph="النوع" />
          : <Sel v={f.vtype} set={x => setF({ ...f, vtype: x })} items={[{ v: 'receipt', l: '⬇️ قبض' }, { v: 'payment', l: '⬆️ صرف' }]} ph="نوع السند" />}
        <Sel v={f.tenant} set={x => setF({ ...f, tenant: x })} items={tenants.map(t => ({ v: t.id, l: t.name }))} ph="المكتب" w="w-40" />
        {tab === 'sales' && <Sel v={f.status} set={x => setF({ ...f, status: x })} items={[{ v: 'active', l: 'نشطة' }, { v: 'refunded', l: 'مستردة/ملغاة' }]} ph="الحالة" />}
        <Sel v={f.currency} set={x => setF({ ...f, currency: x })} items={FILTER_CURRENCIES.map(c => ({ v: c, l: c }))} ph="العملة" w="w-28" />
        {tab === 'sales' && <Sel v={f.payment} set={x => setF({ ...f, payment: x })} items={[{ v: 'cash', l: 'نقد' }, { v: 'credit', l: 'آجل' }]} ph="الدفع" />}
        <Input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} className="w-36 h-9 bg-white text-xs" />
        <Input type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} className="w-36 h-9 bg-white text-xs" />
        <Input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} placeholder="🔍 رقم/اسم/مستخدم…" className="w-44 h-9 bg-white text-xs" />
        {tab === 'sales' && (
          <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={f.missing_je} onChange={e => setF({ ...f, missing_je: e.target.checked })} /> بلا قيد مطابق</label>
        )}
        <Button size="sm" onClick={() => { setSkip(0); load() }} className="h-9 bg-blue-600 text-white gap-1"><RefreshCw className="w-3.5 h-3.5" /> تطبيق</Button>
      </CardContent></Card>

      {/* Table */}
      <Card><CardContent className="pt-4 overflow-x-auto">
        {tab === 'sales' ? (
          <Table>
            <TableHeader><TableRow>
              <TableHead>النوع</TableHead><TableHead>المكتب</TableHead><TableHead>الطرف/المستفيد</TableHead>
              <TableHead>العميل</TableHead><TableHead>المورد</TableHead>
              <TableHead className="text-center">بيع</TableHead><TableHead className="text-center">تكلفة</TableHead><TableHead className="text-center">ربح مخزن</TableHead>
              <TableHead className="text-center">عملة</TableHead><TableHead className="text-center">دفع</TableHead>
              <TableHead className="text-center">الحالة</TableHead><TableHead className="text-center">قيد/سند</TableHead>
              <TableHead className="text-center">المصدر</TableHead><TableHead>أنشأها</TableHead><TableHead>التاريخ</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={16} className="text-center py-8 text-slate-400">جارِ التحميل…</TableCell></TableRow>}
              {!loading && (rows || []).map(r => (
                <TableRow key={`${r.kind}:${r.id}`} className="hover:bg-slate-50">
                  <TableCell className="text-xs whitespace-nowrap">{KIND_L[r.kind]}</TableCell>
                  <TableCell className="text-xs font-semibold">{r.tenant_name}</TableCell>
                  <TableCell className="text-xs">{r.party || '—'}</TableCell>
                  <TableCell className="text-xs">{r.client_name || '—'}</TableCell>
                  <TableCell className="text-xs">{r.supplier_name || '—'}</TableCell>
                  <TableCell className="text-center text-xs font-mono">{n2(r.sale)}</TableCell>
                  <TableCell className="text-center text-xs font-mono">{n2(r.cost)}</TableCell>
                  <TableCell className="text-center text-xs font-mono">{n2(r.profit)}</TableCell>
                  <TableCell className="text-center text-xs">{r.currency || '—'}</TableCell>
                  <TableCell className="text-center text-xs">{r.payment_method || '—'}</TableCell>
                  <TableCell className="text-center"><StBadge s={r.status} /></TableCell>
                  <TableCell className="text-center text-xs">{r.has_je ? '📒' : <span className="text-rose-600 font-bold">✗ قيد</span>}{r.has_voucher ? ' 🧾' : ''}</TableCell>
                  <TableCell className="text-center text-xs">{r.source}</TableCell>
                  <TableCell className="text-[10px] text-slate-500" dir="ltr">{r.created_by || '—'}</TableCell>
                  <TableCell className="text-[10px] text-slate-500">{dt(r.date || r.created_at)}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openDetail(r)}><Eye className="w-3.5 h-3.5" /></Button></TableCell>
                </TableRow>
              ))}
              {!loading && rows?.length === 0 && <TableRow><TableCell colSpan={16} className="text-center py-8 text-slate-400">لا نتائج</TableCell></TableRow>}
            </TableBody>
          </Table>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>رقم</TableHead><TableHead>النوع</TableHead><TableHead>المكتب</TableHead><TableHead>الطرف/الحساب</TableHead>
              <TableHead className="text-center">المبلغ</TableHead><TableHead className="text-center">طريقة الدفع</TableHead>
              <TableHead>العملية الأصل</TableHead><TableHead>القيد</TableHead><TableHead className="text-center">الحالة</TableHead>
              <TableHead>أنشأه</TableHead><TableHead>التاريخ</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={11} className="text-center py-8 text-slate-400">جارِ التحميل…</TableCell></TableRow>}
              {!loading && (rows || []).map(r => (
                <TableRow key={r.id} className="hover:bg-slate-50">
                  <TableCell className="text-[10px] font-mono" dir="ltr">{r.voucher_no || r.id?.slice(0, 8)}</TableCell>
                  <TableCell className="text-xs">{r.type === 'receipt' ? '⬇️ قبض' : r.type === 'payment' ? '⬆️ صرف' : r.type}</TableCell>
                  <TableCell className="text-xs font-semibold">{r.tenant_name}</TableCell>
                  <TableCell className="text-xs">{r.party_name || r.coa_account_code || '—'}</TableCell>
                  <TableCell className="text-center text-xs font-mono" dir="ltr">{n2(r.amount)} {r.currency}</TableCell>
                  <TableCell className="text-center text-xs">{r.method || r.payment_method || '—'}</TableCell>
                  <TableCell className="text-[10px] font-mono" dir="ltr">{r.ref_type ? `${r.ref_type}:${(r.ref_id || '').slice(0, 8)}` : '—'}</TableCell>
                  <TableCell className="text-[10px] font-mono" dir="ltr">{r.je_id ? r.je_id.slice(0, 8) : <span className="text-rose-600 font-bold">✗</span>}</TableCell>
                  <TableCell className="text-center"><StBadge s={r.status} /></TableCell>
                  <TableCell className="text-[10px] text-slate-500" dir="ltr">{r.created_by || '—'}</TableCell>
                  <TableCell className="text-[10px] text-slate-500">{dt(r.date || r.created_at)}</TableCell>
                </TableRow>
              ))}
              {!loading && rows?.length === 0 && <TableRow><TableCell colSpan={11} className="text-center py-8 text-slate-400">لا نتائج</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
        <div className="flex items-center justify-between mt-3">
          <Button size="sm" variant="outline" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - 50))} className="gap-1"><ChevronRight className="w-4 h-4" /> السابق</Button>
          <span className="text-xs text-slate-400">عرض {skip + 1} — {skip + (rows?.length || 0)}</span>
          <Button size="sm" variant="outline" disabled={(rows?.length || 0) < 50} onClick={() => setSkip(skip + 50)} className="gap-1">التالي <ChevronLeft className="w-4 h-4" /></Button>
        </div>
      </CardContent></Card>

      {/* Detail dialog — READ ONLY */}
      <Dialog open={!!detail} onOpenChange={v => !v && setDetail(null)}>
        <DialogContent dir="rtl" className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>تفاصيل العملية (قراءة فقط)</DialogTitle></DialogHeader>
          {detail?.loading && <div className="text-center py-8 text-slate-400">جارِ التحميل…</div>}
          {detail?.doc && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                {[['النوع', KIND_L[detail.kind]], ['رقم العملية', detail.doc.id], ['التاريخ', dt(detail.doc.date || detail.doc.created_at)],
                  ['المستفيد/المسافر', detail.doc.passenger_name || detail.doc.beneficiary_name || detail.doc.pilgrim_name],
                  ['البيع', `${n2(detail.doc.sale_price ?? detail.doc.total_sale)} ${detail.doc.currency || ''}`],
                  ['التكلفة', `${n2(detail.doc.cost ?? detail.doc.total_cost)} ${detail.doc.currency || ''}`],
                  ['الربح/العمولة المخزنة', n2(detail.doc.profit ?? detail.doc.commission)],
                  ['طريقة الدفع', detail.doc.payment_method], ['الحالة', detail.doc.is_refunded ? 'مستردة' : (detail.doc.status || 'نشطة')],
                  ['أنشأها', detail.doc.created_by], ['ملفات/مرفقات', Array.isArray(detail.doc.documents) ? `${detail.doc.documents.length} ملف` : '—'],
                ].map(([l, v]) => <div key={l} className="p-2 bg-slate-50 rounded"><div className="text-slate-400 text-[10px]">{l}</div><div className="font-semibold break-all">{v ?? '—'}</div></div>)}
              </div>
              <div className="grid md:grid-cols-2 gap-2 text-xs">
                <div className="p-2 border rounded"><b>👤 العميل:</b> {detail.client ? `${detail.client.name} (${detail.client.account_code || '—'})` : '—'}</div>
                <div className="p-2 border rounded"><b>🏭 المورد:</b> {detail.supplier ? `${detail.supplier.name} (${detail.supplier.account_code || '—'})` : '—'}</div>
              </div>
              {detail.timeline?.length > 0 && (
                <div className="border rounded p-2"><b className="text-xs">⏱️ Timeline</b>
                  {detail.timeline.map((t, i) => <div key={i} className="text-xs text-slate-600 flex gap-2 mt-1"><span>{dtt(t.at)}</span><Badge variant="outline" className="text-[9px]">{t.ev}</Badge><span dir="ltr">{t.by || ''}</span></div>)}
                </div>
              )}
              <div className="border rounded p-2">
                <b className="text-xs">🧾 السندات المرتبطة ({detail.vouchers?.length || 0})</b>
                {(detail.vouchers || []).map(v => <div key={v.id} className="text-xs text-slate-600 mt-1" dir="ltr">{v.type} · {n2(v.amount)} {v.currency} · {v.id.slice(0, 8)}</div>)}
                {!detail.vouchers?.length && <div className="text-xs text-slate-400 mt-1">لا سندات مرتبطة بمرجع العملية</div>}
              </div>
              <div className="border rounded p-2">
                <b className="text-xs">📒 القيود المحاسبية ({detail.journal_entries?.length || 0})</b>
                {(detail.journal_entries || []).map(j => (
                  <div key={j.id} className="mt-2 p-2 bg-slate-50 rounded text-xs">
                    <div className="flex justify-between"><span className="font-mono" dir="ltr">{j.id.slice(0, 8)}</span><span>{dt(j.date)} · {j.currency}</span></div>
                    <div className="text-slate-500">{j.description}</div>
                    {(j.lines || []).map((l, i) => <div key={i} className="flex justify-between font-mono" dir="ltr"><span>{l.account_code} {l.party_name ? `· ${l.party_name}` : ''}</span><span>D {n2(l.debit)} / C {n2(l.credit)}</span></div>)}
                  </div>
                ))}
                {!detail.journal_entries?.length && <div className="text-xs text-rose-600 mt-1 font-bold">⚠️ لا يوجد قيد مطابق لهذه العملية</div>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default AdminSalesCenter
