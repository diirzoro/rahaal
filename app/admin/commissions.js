'use client'
// ============================================================================
// v3.94 — ADMIN COMMISSIONS CENTER (Batch 2) — STRICTLY READ-ONLY UI.
// REUSES: /api/admin/commissions/* (lib/adminCommissions.js) — the stored
// commission values written by the EXISTING engines (no second engine).
// No payment actions, no status changes, no balance edits from these screens.
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
import { RefreshCw, Lock, Eye, ChevronRight, ChevronLeft, BadgePercent } from 'lucide-react'
import { api } from '../shared'

const n2 = (v) => (typeof v === 'number' ? v.toLocaleString('en-US') : v ?? '—')
const dt = (v) => (v ? new Date(v).toLocaleDateString('ar-EG') : '—')
const dtt = (v) => (v ? new Date(v).toLocaleString('ar-EG') : '—')
const CURS = ['YER', 'SAR', 'USD']
const KINDS = { tickets: '🎫 تذكرة', visas: '🛂 تأشيرة', services: '🧰 خدمة', bookings: '📦 حجز باكج' }

const ST = {
  posted: ['مقيدة على رصيد الشريك', 'bg-emerald-100 text-emerald-700'],
  reversed: ['معكوسة (استرداد)', 'bg-rose-100 text-rose-700'],
  pending: ['معلقة (بانتظار الاعتماد)', 'bg-amber-100 text-amber-700'],
  approved: ['معتمدة', 'bg-emerald-100 text-emerald-700'],
  cancelled: ['ملغاة', 'bg-rose-100 text-rose-700'],
  paid: ['مدفوعة', 'bg-emerald-100 text-emerald-700'],
  processing: ['قيد المعالجة', 'bg-blue-100 text-blue-700'],
  rejected: ['مرفوضة', 'bg-rose-100 text-rose-700'],
  applied_to_subscription: ['حُوّلت للاشتراك', 'bg-indigo-100 text-indigo-700'],
}
const StBadge = ({ s }) => { const [l, c] = ST[s] || [s || '—', 'bg-slate-100 text-slate-600']; return <Badge className={c}>{l}</Badge> }

const CurTable = ({ data, cols }) => (
  <Table>
    <TableHeader><TableRow className="bg-slate-50"><TableHead className="text-right">العملة</TableHead>{cols.map(c => <TableHead key={c[0]} className="text-right">{c[1]}</TableHead>)}</TableRow></TableHeader>
    <TableBody>
      {Object.keys(data || {}).length === 0 ? <TableRow><TableCell colSpan={cols.length + 1} className="text-center text-slate-400 py-4">لا بيانات</TableCell></TableRow>
        : Object.entries(data).map(([cur, v]) => (
          <TableRow key={cur}><TableCell className="font-extrabold">{cur}</TableCell>{cols.map(c => <TableCell key={c[0]} className="text-xs">{c[2](v)}</TableCell>)}</TableRow>
        ))}
    </TableBody>
  </Table>
)

// ---------- detail dialog ----------
const DetailDialog = ({ q, onClose }) => {
  const [d, setD] = useState(null)
  useEffect(() => {
    api(`/admin/commissions/detail?src=${q.src}&id=${q.id}${q.kind ? `&kind=${q.kind}` : ''}`).then(setD).catch(e => { toast.error(e.message); onClose() })
  }, [])
  const row = d?.row || {}
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle>🔎 تفاصيل العمولة {row.kind_label ? `— ${row.kind_label}` : ''}</DialogTitle></DialogHeader>
        {!d ? <div className="py-10 text-center text-slate-400">جارِ التحميل...</div> : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">🏢 {row.tenant_name || d.tenant?.name || '—'}</Badge>
              {row.beneficiary && <Badge className="bg-indigo-100 text-indigo-700">المستفيد: {row.beneficiary}</Badge>}
              <StBadge s={row.status || d.doc?.status} />
              <Badge className="bg-amber-100 text-amber-700 gap-1"><Lock className="w-3 h-3" /> قراءة فقط</Badge>
            </div>
            {/* rule basis */}
            {d.rule && (
              <div className="bg-blue-50/60 border border-blue-200 rounded-md p-2 text-[11px] text-blue-900 space-y-0.5">
                <div><b>أساس الاحتساب:</b> {d.rule.basis}</div>
                <div><b>القاعدة:</b> {d.rule.mode === 'percent' ? `نسبة ${d.rule.value ?? ''}%` : d.rule.mode === 'amount' ? `مبلغ ثابت${d.rule.value != null ? ` (${n2(d.rule.value)})` : ''}` : 'مصفوفة تسعير السوق (غرفة × فئة عمرية)'}</div>
                {d.rule.engine && <div><b>المحرك:</b> {d.rule.engine}</div>}
              </div>
            )}
            {/* numbers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              {[['قيمة البيع', row.sale], ['التكلفة', row.cost], ['قيمة العمولة', row.commission ?? d.doc?.amount_usd], ['الربح قبل العمولة', row.profit_before], ['الربح الصافي بعدها', row.profit_net], ['صافي للبائع (معراج)', row.net_to_seller], ['سعر الصرف المثبت', row.exchange_rate], ['العملة', row.currency || (q.src === 'affiliate' ? 'USD' : null)]]
                .filter(([, v]) => v !== undefined && v !== null)
                .map(([l, v]) => (
                  <div key={l} className="border rounded-lg p-2 bg-slate-50">
                    <div className="text-[10px] text-slate-500">{l}</div>
                    <div className="font-extrabold text-sm">{n2(v)}</div>
                  </div>
                ))}
            </div>
            {/* affiliate specifics */}
            {q.src === 'affiliate' && d.doc && (
              <div className="border rounded-lg p-3 text-xs space-y-1">
                <div className="font-bold text-slate-700">بيانات السحب</div>
                <div>طريقة السحب: {d.doc.payout_method_snapshot?.method_type || '—'} — {d.doc.payout_method_snapshot?.provider || '—'} — {d.doc.payout_method_snapshot?.account_name || '—'}</div>
                <div>طالب السحب: <span dir="ltr">{d.doc.requested_by || '—'}</span> · ملاحظات: {d.doc.notes || '—'}</div>
                {d.tenant?.affiliate && <div className="text-slate-500">رصيد أفلييت المكتب: {n2(d.tenant.affiliate.balance_usd)} USD · إجمالي مكتسب: {n2(d.tenant.affiliate.total_earned_usd)} USD</div>}
              </div>
            )}
            {/* timeline */}
            <div className="border rounded-lg p-3">
              <div className="text-xs font-extrabold text-slate-600 mb-2">📜 التسلسل الزمني (Audit Timeline)</div>
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
            {(d.journal_entries?.length > 0 || d.vouchers?.length > 0 || d.linked_booking || d.partner) && (
              <div className="border rounded-lg p-3 text-xs space-y-1">
                <div className="font-extrabold text-slate-600">🔗 السجلات المرتبطة</div>
                {d.partner && <div>حساب الشريك: <b>{d.partner.name}</b> {d.partner.account_code ? <span className="font-mono text-slate-500">({d.partner.account_code})</span> : null}</div>}
                {d.linked_booking && <div>حجز الباكج المرتبط: <span className="font-mono">{d.linked_booking.id}</span> — {d.linked_booking.pilgrim_name || ''}</div>}
                {(d.journal_entries || []).map(j => <div key={j.id}>قيد يومية: <span className="font-mono">{j.id}</span> — {j.description}</div>)}
                {(d.vouchers || []).map(v => <div key={v.id}>سند: <span className="font-mono">{v.id}</span> — {v.type === 'receipt' ? 'قبض' : 'صرف'} {n2(v.amount)} {v.currency}</div>)}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------- main ----------
const AdminCommissionsCenter = () => {
  const [tab, setTab] = useState('overview')
  const [tenants, setTenants] = useState([])
  const [ov, setOv] = useState(null)
  const [ovTenant, setOvTenant] = useState('')
  const [src, setSrc] = useState('partner')
  const [f, setF] = useState({ tenant: '', currency: '', status: '', kind: 'all', q: '', from: '', to: '' })
  const [rows, setRows] = useState(null)
  const [skip, setSkip] = useState(0)
  const [rules, setRules] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { api('/admin/tenants').then(d => setTenants(d?.tenants || [])).catch(() => {}) }, [])
  useEffect(() => { if (tab === 'overview') api(`/admin/commissions/overview${ovTenant ? `?tenant=${ovTenant}` : ''}`).then(setOv).catch(e => toast.error(e.message)) }, [tab, ovTenant])
  useEffect(() => { if (tab === 'rules' && !rules) api('/admin/commissions/rules').then(setRules).catch(e => toast.error(e.message)) }, [tab])

  const load = async () => {
    setLoading(true)
    try {
      const o = { src, ...f, skip, limit: 50 }
      if (src !== 'partner') delete o.kind
      const qs = Object.entries(o).filter(([, v]) => v !== '' && v !== undefined && v !== 'all').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
      const r = await api(`/admin/commissions/list?${qs}${o.kind === 'all' && src === 'partner' ? '&kind=all' : ''}`)
      setRows(r.rows || [])
    } catch (e) { toast.error(e.message) }
    setLoading(false)
  }
  useEffect(() => { if (tab === 'list') load() }, [tab, src, skip])

  const Sel = ({ v, set, items, ph, w = 'w-32' }) => (
    <Select value={v || 'all'} onValueChange={x => set(x === 'all' ? '' : x)}>
      <SelectTrigger className={`${w} bg-white h-9 text-xs`}><SelectValue placeholder={ph} /></SelectTrigger>
      <SelectContent><SelectItem value="all">{ph} — الكل</SelectItem>{items.map(i => <SelectItem key={i.v} value={i.v}>{i.l}</SelectItem>)}</SelectContent>
    </Select>
  )

  const STATUS_ITEMS = src === 'partner'
    ? [{ v: 'posted', l: 'مقيدة' }, { v: 'reversed', l: 'معكوسة (استرداد)' }]
    : src === 'meraaj'
      ? [{ v: 'pending', l: 'معلقة' }, { v: 'approved', l: 'معتمدة' }, { v: 'cancelled', l: 'ملغاة' }]
      : [{ v: 'pending', l: 'معلقة' }, { v: 'processing', l: 'قيد المعالجة' }, { v: 'paid', l: 'مدفوعة' }, { v: 'rejected', l: 'مرفوضة' }, { v: 'applied_to_subscription', l: 'حُوّلت للاشتراك' }]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {[['overview', '📊 نظرة عامة'], ['list', '💠 سجل العمولات'], ['rules', '⚙️ قواعد العمولات']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-lg text-sm font-bold ${tab === k ? 'bg-blue-600 text-white shadow' : 'bg-white border text-slate-600'}`}>{l}</button>
        ))}
        <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50 mr-auto"><Lock className="w-3 h-3" /> قراءة فقط — القيم المخزنة وقت العملية، بلا إعادة احتساب ولا دفع من هنا</Badge>
      </div>

      {/* ============ OVERVIEW ============ */}
      {tab === 'overview' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sel v={ovTenant} set={setOvTenant} items={tenants.map(t => ({ v: t.id, l: t.name }))} ph="المكتب" w="w-44" />
            <Button size="sm" variant="outline" onClick={() => api(`/admin/commissions/overview${ovTenant ? `?tenant=${ovTenant}` : ''}`).then(setOv)} className="gap-1"><RefreshCw className="w-3.5 h-3.5" /> تحديث</Button>
          </div>
          {!ov ? <div className="py-10 text-center text-slate-400">جارِ التحميل...</div> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Card><CardContent className="pt-4 space-y-2">
                <div className="text-sm font-extrabold text-slate-700">🤝 عمولات الشركاء (مكاتب/وكلاء/موردون) — لكل عملة</div>
                <CurTable data={ov.partner_shares} cols={[
                  ['p', 'مقيدة (فعالة)', v => <span className="text-emerald-700 font-bold">{n2(v.posted.total)} <span className="text-slate-400">({v.posted.count})</span></span>],
                  ['r', 'معكوسة (استرداد)', v => <span className="text-rose-700 font-bold">{n2(v.reversed.total)} <span className="text-slate-400">({v.reversed.count})</span></span>],
                ]} />
                <div className="text-[10px] text-slate-500">المصدر: حقول commission_share المخزنة على التذاكر/التأشيرات/الخدمات/حجوزات الباكجات</div>
              </CardContent></Card>
              <Card><CardContent className="pt-4 space-y-2">
                <div className="text-sm font-extrabold text-slate-700">🕋 عمولات وكلاء معراج (B2B) — لكل عملة وحالة</div>
                <CurTable data={ov.meraaj_commissions} cols={[
                  ['pe', 'معلقة', v => v.pending ? `${n2(v.pending.total)} (${v.pending.count})` : '—'],
                  ['ap', 'معتمدة', v => v.approved ? <span className="text-emerald-700 font-bold">{n2(v.approved.total)} ({v.approved.count})</span> : '—'],
                  ['ca', 'ملغاة', v => v.cancelled ? <span className="text-rose-700">{n2(v.cancelled.total)} ({v.cancelled.count})</span> : '—'],
                ]} />
                <div className="text-[10px] text-slate-500">المصدر: agent_commission_total المثبت على كل حجز وارد وقت إنشائه (Snapshot)</div>
              </CardContent></Card>
              <Card><CardContent className="pt-4 space-y-2">
                <div className="text-sm font-extrabold text-slate-700">🎯 عمولات الأفلييت (USD حصراً)</div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                  {[['إجمالي مكتسب', ov.affiliate_usd.total_earned], ['الرصيد الحالي', ov.affiliate_usd.balance], ['مسحوب', ov.affiliate_usd.withdrawn], ['محجوز (طلبات)', ov.affiliate_usd.reserved], ['حُوّل للاشتراك', ov.affiliate_usd.applied_to_subscription]].map(([l, v]) => (
                    <div key={l} className="border rounded-lg p-2 bg-slate-50"><div className="text-[10px] text-slate-500">{l}</div><div className="font-extrabold text-sm">{n2(v)}</div></div>
                  ))}
                </div>
                <div className="text-[10px] text-slate-500">النسبة: {(ov.affiliate_usd.commission_rate * 100)}% · طلبات السحب: {Object.entries(ov.affiliate_usd.cashouts_by_status || {}).map(([s, v]) => `${ST[s]?.[0] || s}: ${v.count}`).join(' · ') || '—'}</div>
              </CardContent></Card>
              <Card className="border-dashed"><CardContent className="pt-4 text-xs text-slate-500 space-y-1">
                <div className="font-extrabold text-slate-600">👤 عمولات الموظفين</div>
                <div>غير موجودة في النظام حالياً — لا يوجد أي حقل أو محرك لعمولات الموظفين في وحدات البيع، لذا تُعرض «—» ولا تُنشأ بيانات تقديرية.</div>
                <div className="text-blue-800 bg-blue-50 border border-blue-200 rounded p-1.5">ℹ️ {ov.note}</div>
              </CardContent></Card>
            </div>
          )}
        </div>
      )}

      {/* ============ LIST ============ */}
      {tab === 'list' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {[['partner', '🤝 الشركاء'], ['meraaj', '🕋 معراج B2B'], ['affiliate', '🎯 الأفلييت']].map(([k, l]) => (
              <button key={k} onClick={() => { setSrc(k); setSkip(0); setRows(null); setF({ ...f, status: '', currency: '' }) }} className={`px-3 py-1 rounded-lg text-xs font-bold ${src === k ? 'bg-slate-800 text-white' : 'bg-white border text-slate-600'}`}>{l}</button>
            ))}
          </div>
          <Card><CardContent className="pt-4 flex flex-wrap items-center gap-2">
            <Sel v={f.tenant} set={x => setF({ ...f, tenant: x })} items={tenants.map(t => ({ v: t.id, l: t.name }))} ph="المكتب" w="w-40" />
            {src === 'partner' && <Sel v={f.kind === 'all' ? '' : f.kind} set={x => setF({ ...f, kind: x || 'all' })} items={Object.entries(KINDS).map(([v, l]) => ({ v, l }))} ph="نوع الخدمة" />}
            <Sel v={f.status} set={x => setF({ ...f, status: x })} items={STATUS_ITEMS} ph="الحالة" w="w-36" />
            {src !== 'affiliate' && <Sel v={f.currency} set={x => setF({ ...f, currency: x })} items={CURS.map(c => ({ v: c, l: c }))} ph="العملة" w="w-28" />}
            <Input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} className="w-36 h-9 bg-white text-xs" />
            <Input type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} className="w-36 h-9 bg-white text-xs" />
            <Input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} onKeyDown={e => e.key === 'Enter' && (setSkip(0), load())} placeholder="بحث: مستفيد/عميل/مورد/مرجع..." className="w-52 h-9 bg-white text-xs" />
            <Button size="sm" onClick={() => { setSkip(0); load() }} disabled={loading} className="bg-blue-600 hover:bg-blue-700 gap-1"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> تطبيق</Button>
          </CardContent></Card>
          <Card><CardContent className="pt-3">
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-slate-50">
                  <TableHead className="text-right">العملية</TableHead><TableHead className="text-right">المكتب</TableHead>
                  <TableHead className="text-right">المستفيد</TableHead>
                  <TableHead className="text-right">البيع</TableHead><TableHead className="text-right">العمولة</TableHead>
                  <TableHead className="text-right">القاعدة</TableHead>
                  <TableHead className="text-right">الربح قبل/بعد</TableHead>
                  <TableHead className="text-right">العملة</TableHead><TableHead className="text-right">الاستحقاق</TableHead>
                  <TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">قيد/سند</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows === null ? <TableRow><TableCell colSpan={12} className="text-center py-8 text-slate-400">جارِ التحميل...</TableCell></TableRow>
                    : rows.length === 0 ? <TableRow><TableCell colSpan={12} className="text-center py-8 text-slate-400">لا نتائج</TableCell></TableRow>
                      : rows.map(r => (
                        <TableRow key={`${r.src}-${r.id}`}>
                          <TableCell><div className="text-xs font-bold">{r.kind_label}</div><div className="text-[10px] text-slate-400 font-mono">{(r.booking_ref || r.id || '').slice(0, 14)}</div></TableCell>
                          <TableCell className="text-xs">{r.tenant_name}</TableCell>
                          <TableCell><div className="text-xs font-semibold">{r.beneficiary || '—'}</div><div className="text-[10px] text-slate-400">{r.beneficiary_type === 'supplier' ? 'مورد' : r.beneficiary_type === 'client' ? 'عميل/وكيل' : r.beneficiary_type === 'buyer_office' ? 'مكتب مشترٍ' : r.beneficiary_type === 'affiliate' ? 'أفلييت' : ''}</div></TableCell>
                          <TableCell className="text-xs">{n2(r.sale)}</TableCell>
                          <TableCell className="text-xs font-extrabold text-blue-700">{n2(r.commission)}</TableCell>
                          <TableCell className="text-[10px]">{r.rule_mode === 'percent' ? `${r.rule_value ?? ''}%` : r.rule_mode === 'amount' ? 'ثابتة' : r.rule_mode === 'market_pricing' ? 'مصفوفة السوق' : r.rule_mode || '—'}</TableCell>
                          <TableCell className="text-[10px]">{n2(r.profit_before)} / {n2(r.profit_net)}</TableCell>
                          <TableCell className="text-xs font-bold">{r.currency || '—'}</TableCell>
                          <TableCell className="text-[10px]">{dt(r.accrued_at)}{r.paid_at ? <div className="text-emerald-600">دفع: {dt(r.paid_at)}</div> : null}</TableCell>
                          <TableCell><StBadge s={r.status} />{r.op_status === 'refunded' && r.src === 'partner' ? <div className="text-[9px] text-rose-500 mt-0.5">العملية الأصلية مستردة</div> : null}</TableCell>
                          <TableCell className="text-[10px]">{r.has_je !== undefined ? `${r.has_je ? '✅ قيد' : '⚠️ لا قيد'}${r.has_voucher ? ' · سند' : ''}` : '—'}</TableCell>
                          <TableCell><Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setDetail({ src: r.src, kind: r.kind, id: r.id })}><Eye className="w-3 h-3" /></Button></TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
              <Button size="sm" variant="outline" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - 50))} className="gap-1"><ChevronRight className="w-3.5 h-3.5" /> السابق</Button>
              <span>عرض من {skip + 1}</span>
              <Button size="sm" variant="outline" disabled={(rows?.length || 0) < 50} onClick={() => setSkip(skip + 50)} className="gap-1">التالي <ChevronLeft className="w-3.5 h-3.5" /></Button>
            </div>
          </CardContent></Card>
        </div>
      )}

      {/* ============ RULES (READ-ONLY view of existing sources) ============ */}
      {tab === 'rules' && (
        !rules ? <div className="py-10 text-center text-slate-400">جارِ التحميل...</div> : (
          <div className="space-y-3">
            <Card><CardContent className="pt-4 space-y-2 text-xs">
              <div className="text-sm font-extrabold text-slate-700">🤝 قواعد عمولات الشركاء</div>
              <div className="bg-amber-50 border border-amber-200 rounded-md p-2 text-amber-900">{rules.partner.note}</div>
              <div>الاستخدام الفعلي: {Object.entries(rules.partner.usage_by_mode || {}).map(([m, n]) => `${m === 'percent' ? 'نسبة' : 'ثابتة'}: ${n} عملية`).join(' · ') || 'لا عمولات شركاء بعد'}</div>
              <div className="bg-rose-50 border border-rose-200 rounded-md p-2 text-rose-800">🔖 نقطة تحتاج قراراً: {rules.partner.decision_needed}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 space-y-2">
              <div className="text-sm font-extrabold text-slate-700">🕋 قواعد عمولة وكلاء معراج (لكل باكج مشارك)</div>
              <div className="text-[11px] text-blue-900 bg-blue-50 border border-blue-200 rounded-md p-2">{rules.meraaj_note}</div>
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader><TableRow className="bg-slate-50">
                    <TableHead className="text-right">الباكج</TableHead><TableHead className="text-right">المكتب البائع</TableHead>
                    <TableHead className="text-right">النوع</TableHead><TableHead className="text-right">القيمة (بالغ/طفل/رضيع)</TableHead>
                    <TableHead className="text-right">الاتجاه</TableHead><TableHead className="text-right">المقاعد</TableHead><TableHead className="text-right">العملة</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {rules.meraaj_packages.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-6 text-slate-400">لا باكجات مشاركة في معراج حالياً</TableCell></TableRow>
                      : rules.meraaj_packages.map(pk => (
                        <TableRow key={pk.package_id}>
                          <TableCell className="text-xs font-bold">{pk.name}</TableCell>
                          <TableCell className="text-xs">{pk.tenant_name}</TableCell>
                          <TableCell className="text-xs">{pk.mode === 'percent' ? 'نسبة %' : 'مبلغ ثابت'}</TableCell>
                          <TableCell className="text-xs">{n2(pk.value)}{pk.child_value != null ? ` / ${n2(pk.child_value)}` : ' / —'}{pk.infant_value != null ? ` / ${n2(pk.infant_value)}` : ' / —'}</TableCell>
                          <TableCell className="text-xs">{pk.direction === 'added' ? 'تضاف فوق السعر' : 'تخصم من السعر'}</TableCell>
                          <TableCell className="text-xs font-mono">{pk.seats}</TableCell>
                          <TableCell className="text-xs">{pk.currency}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 space-y-1 text-xs">
              <div className="text-sm font-extrabold text-slate-700">🎯 قاعدة الأفلييت</div>
              <div>النسبة: <b>{rules.affiliate.commission_rate * 100}%</b> · حد السحب الأدنى: أفراد <b>{rules.affiliate.min_cashout_individual_usd}$</b> / مكاتب <b>{rules.affiliate.min_cashout_office_usd}$</b> · حسابات أفراد: <b>{rules.affiliate.individual_accounts}</b></div>
              <div className="text-slate-500">{rules.affiliate.note}</div>
            </CardContent></Card>
          </div>
        )
      )}

      {detail && <DetailDialog q={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

export default AdminCommissionsCenter
