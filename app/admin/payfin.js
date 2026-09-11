'use client'
// ============================================================================
// v3.97 — ADMIN PAYMENTS & FINANCIAL ENTITIES UI (Batch 5).
// Tabs: payment methods / entities directory (+receiving accounts) / manual
// payment orders (invoice / transfer request + proofs + enforced status
// machine) / overview & filters (the reports the user asked for).
// Financial safety banners everywhere: proof ≠ confirmation, confirmation
// records pending_execution (NO balance change — standard voucher path).
// Account numbers arrive MASKED unless the user holds payments.manage.
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
import { RefreshCw, Plus, Pencil, Power, Copy, Landmark, CreditCard, ReceiptText, Upload, Eye, ShieldAlert } from 'lucide-react'
import { api } from '../shared'

const dtt = (v) => (v ? new Date(v).toLocaleString('ar-EG') : '—')
const fld = (l, node) => <div><div className="text-xs font-bold text-slate-500 mb-1">{l}</div>{node}</div>
const CURS = ['USD', 'SAR', 'YER']
const ST_COLORS = { draft: 'bg-slate-200 text-slate-700', awaiting_transfer: 'bg-amber-100 text-amber-700', proof_uploaded: 'bg-blue-100 text-blue-700', under_review: 'bg-violet-100 text-violet-700', confirmed: 'bg-emerald-100 text-emerald-700', rejected: 'bg-red-100 text-red-700', cancelled: 'bg-slate-300 text-slate-600', partially_refunded: 'bg-orange-100 text-orange-700', refunded: 'bg-orange-200 text-orange-800' }
const CurrPick = ({ v, set }) => (
  <div className="flex gap-2">{CURS.map(c => <label key={c} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={v.includes(c)} onChange={e => set(e.target.checked ? [...v, c] : v.filter(x => x !== c))} />{c}</label>)}</div>
)

// ---------------- payment method dialog ----------------
const MethodDialog = ({ row, types, onClose, onDone }) => {
  const [v, setV] = useState({ name: row?.name || '', type: row?.type || 'bank_transfer', description: row?.description || '', instructions: row?.instructions || '', currencies: row?.currencies || [], requires_proof: row?.requires_proof ?? true, requires_ref: row?.requires_ref ?? false, requires_review: row?.requires_review ?? true, partial_allowed: row?.partial_allowed ?? false, refundable: row?.refundable ?? false, fee_type: row?.fee_type || 'none', fee_value: row?.fee_value ?? 0, fee_bearer: row?.fee_bearer || 'payer', sort_order: row?.sort_order ?? 0, reason: '' })
  const save = async () => {
    if (!v.name.trim()) return toast.error('الاسم إلزامي')
    const body = { ...v, fee_type: v.fee_type === 'none' ? null : v.fee_type }
    try {
      if (row) await api(`/admin/payfin/methods/${row.id}`, { method: 'PUT', body })
      else await api('/admin/payfin/methods', { method: 'POST', body })
      toast.success('تم الحفظ'); onDone()
    } catch (e) { toast.error(e.message) }
  }
  const flags = [['requires_proof', 'تحتاج إثبات تحويل'], ['requires_ref', 'تحتاج رقم مرجع'], ['requires_review', 'تحتاج مراجعة يدوية'], ['partial_allowed', 'تدعم دفعاً جزئياً'], ['refundable', 'تدعم الاسترداد']]
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
      <DialogHeader><DialogTitle>{row ? `✏️ ${row.name}` : '➕ إضافة طريقة دفع'}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {fld('الاسم *', <Input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} />)}
          {fld('النوع *', <Select value={v.type} onValueChange={t => setV({ ...v, type: t })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{types.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent></Select>)}
        </div>
        {fld('الوصف', <Input value={v.description} onChange={e => setV({ ...v, description: e.target.value })} />)}
        {fld('التعليمات', <Textarea rows={2} value={v.instructions} onChange={e => setV({ ...v, instructions: e.target.value })} />)}
        {fld('العملات المدعومة', <CurrPick v={v.currencies} set={c => setV({ ...v, currencies: c })} />)}
        <div className="grid grid-cols-2 gap-1">{flags.map(([k, l]) => <label key={k} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={!!v[k]} onChange={e => setV({ ...v, [k]: e.target.checked })} />{l}</label>)}</div>
        <div className="grid grid-cols-3 gap-2">
          {fld('نوع الرسوم', <Select value={v.fee_type} onValueChange={t => setV({ ...v, fee_type: t })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">بلا</SelectItem><SelectItem value="fixed">ثابتة</SelectItem><SelectItem value="percent">نسبة %</SelectItem></SelectContent></Select>)}
          {fld('قيمة الرسوم', <Input type="number" value={v.fee_value} onChange={e => setV({ ...v, fee_value: e.target.value })} />)}
          {fld('يتحملها', <Select value={v.fee_bearer} onValueChange={t => setV({ ...v, fee_bearer: t })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="payer">الدافع</SelectItem><SelectItem value="office">المكتب</SelectItem><SelectItem value="platform">المنصة</SelectItem></SelectContent></Select>)}
        </div>
        {fld('ترتيب العرض', <Input type="number" value={v.sort_order} onChange={e => setV({ ...v, sort_order: e.target.value })} />)}
        {fld('السبب (Audit)', <Input value={v.reason} onChange={e => setV({ ...v, reason: e.target.value })} />)}
        <Button onClick={save} className="w-full">حفظ</Button>
      </div>
    </DialogContent></Dialog>
  )
}

// ---------------- entity dialog (create/edit/request) ----------------
const EntityDialog = ({ row, types, asRequest, onClose, onDone }) => {
  const [v, setV] = useState({ name_ar: row?.name_ar || '', name_en: row?.name_en || '', type: row?.type || 'bank', address: row?.address || '', website: row?.website || '', branches: (row?.branches || []).join('، '), phones: (row?.phones || []).join('، '), currencies: row?.currencies || [], instructions: row?.instructions || '', fees: row?.fees || '', notes: row?.notes || '', reason: '' })
  const [geo, setGeo] = useState({ country_id: row?.geo?.country_id || '', governorate_id: row?.geo?.governorate_id || '', district_id: row?.geo?.district_id || '' })
  const [opts, setOpts] = useState({ country: [], governorate: [], district: [] })
  useEffect(() => { api('/admin/geo/list?level=country&active_only=1').then(r => setOpts(o => ({ ...o, country: r.rows || [] }))).catch(() => {}) }, [])
  const pickGeo = async (lvl, id) => {
    const ng = { ...geo, [`${lvl}_id`]: id }
    if (lvl === 'country') { ng.governorate_id = ''; ng.district_id = '' }
    if (lvl === 'governorate') ng.district_id = ''
    setGeo(ng)
    const child = lvl === 'country' ? 'governorate' : lvl === 'governorate' ? 'district' : null
    if (child) { const r = await api(`/admin/geo/list?level=${child}&parent_id=${id}&active_only=1`).catch(() => ({ rows: [] })); setOpts(o => ({ ...o, [child]: r.rows || [] })) }
  }
  const save = async () => {
    if (!v.name_ar.trim()) return toast.error('الاسم العربي إلزامي')
    const body = { ...v, branches: v.branches.split(/[،,]/).map(s => s.trim()).filter(Boolean), phones: v.phones.split(/[،,]/).map(s => s.trim()).filter(Boolean), geo: geo.country_id ? geo : null }
    try {
      if (row) await api(`/admin/payfin/entities/${row.id}`, { method: 'PUT', body })
      else { const r = await api(asRequest ? '/admin/payfin/entities/request' : '/admin/payfin/entities', { method: 'POST', body }); if (r.note) toast.info(r.note) }
      toast.success('تم الحفظ'); onDone()
    } catch (e) { toast.error(e.message) }
  }
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
      <DialogHeader><DialogTitle>{row ? `✏️ ${row.name_ar}` : asRequest ? '📨 طلب إضافة جهة جديدة (تتاح بعد الاعتماد)' : '➕ إضافة جهة مالية'}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {fld('الاسم العربي *', <Input value={v.name_ar} onChange={e => setV({ ...v, name_ar: e.target.value })} />)}
          {fld('الاسم الإنجليزي', <Input dir="ltr" value={v.name_en} onChange={e => setV({ ...v, name_en: e.target.value })} />)}
        </div>
        {!row && fld('النوع *', <Select value={v.type} onValueChange={t => setV({ ...v, type: t })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{types.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent></Select>)}
        <div className="grid grid-cols-3 gap-2">
          {fld('الدولة', <Select value={geo.country_id} onValueChange={id => pickGeo('country', id)}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{opts.country.map(o => <SelectItem key={o.id} value={o.id}>{o.name_ar}</SelectItem>)}</SelectContent></Select>)}
          {fld('المحافظة', <Select value={geo.governorate_id} onValueChange={id => pickGeo('governorate', id)} disabled={!geo.country_id}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{opts.governorate.map(o => <SelectItem key={o.id} value={o.id}>{o.name_ar}</SelectItem>)}</SelectContent></Select>)}
          {fld('المديرية', <Select value={geo.district_id} onValueChange={id => pickGeo('district', id)} disabled={!geo.governorate_id}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{opts.district.map(o => <SelectItem key={o.id} value={o.id}>{o.name_ar}</SelectItem>)}</SelectContent></Select>)}
        </div>
        {fld('العنوان', <Input value={v.address} onChange={e => setV({ ...v, address: e.target.value })} />)}
        <div className="grid grid-cols-2 gap-2">
          {fld('الفروع (افصل بفاصلة)', <Input value={v.branches} onChange={e => setV({ ...v, branches: e.target.value })} />)}
          {fld('أرقام التواصل (افصل بفاصلة)', <Input dir="ltr" value={v.phones} onChange={e => setV({ ...v, phones: e.target.value })} />)}
        </div>
        {fld('الموقع الإلكتروني', <Input dir="ltr" value={v.website} onChange={e => setV({ ...v, website: e.target.value })} />)}
        {fld('العملات المدعومة', <CurrPick v={v.currencies} set={c => setV({ ...v, currencies: c })} />)}
        {fld('التعليمات', <Textarea rows={2} value={v.instructions} onChange={e => setV({ ...v, instructions: e.target.value })} />)}
        <div className="grid grid-cols-2 gap-2">
          {fld('الرسوم', <Input value={v.fees} onChange={e => setV({ ...v, fees: e.target.value })} />)}
          {fld('ملاحظات', <Input value={v.notes} onChange={e => setV({ ...v, notes: e.target.value })} />)}
        </div>
        {fld('السبب (Audit)', <Input value={v.reason} onChange={e => setV({ ...v, reason: e.target.value })} />)}
        <Button onClick={save} className="w-full">{asRequest ? 'إرسال طلب الإضافة' : 'حفظ'}</Button>
      </div>
    </DialogContent></Dialog>
  )
}

// ---------------- entity detail (accounts) ----------------
const EntityDetail = ({ id, can, tenants, onClose, onChanged }) => {
  const [d, setD] = useState(null)
  const [accForm, setAccForm] = useState(null)
  const load = () => api(`/admin/payfin/entities/${id}`).then(setD).catch(e => toast.error(e.message))
  useEffect(() => { load() }, [id]) // eslint-disable-line
  if (!d) return null
  const e = d.entity
  const saveAcc = async () => {
    if (!accForm.account_name?.trim() || !accForm.currency) return toast.error('اسم الحساب والعملة إلزامية')
    try {
      if (accForm.id) await api(`/admin/payfin/accounts/${accForm.id}`, { method: 'PUT', body: accForm })
      else await api(`/admin/payfin/entities/${id}/accounts`, { method: 'POST', body: accForm })
      toast.success('تم'); setAccForm(null); load(); onChanged?.()
    } catch (er) { toast.error(er.message) }
  }
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
      <DialogHeader><DialogTitle><Landmark className="w-4 h-4 inline ml-1" /> {e.name_ar} <Badge variant="outline" className="mr-2">{e.type}</Badge>{e.approval_status === 'pending' && <Badge className="bg-amber-100 text-amber-700 mr-1">بانتظار الاعتماد</Badge>}</DialogTitle></DialogHeader>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 rounded p-2">
          <div>📍 {[e.geo?.country_name, e.geo?.governorate_name, e.geo?.district_name].filter(Boolean).join(' / ') || 'موقع غير محدد'}</div>
          <div>☎️ {(e.phones || []).join(' · ') || '—'}</div>
          <div>🏢 فروع: {(e.branches || []).join('، ') || '—'}</div>
          <div>💱 {(e.currencies || []).join(' · ') || '—'}</div>
        </div>
        {e.instructions && <div className="text-xs bg-blue-50 rounded p-2">📋 {e.instructions}</div>}
        <div className="flex items-center justify-between">
          <b>حسابات الاستلام {d.masked && <Badge variant="outline" className="text-[10px]"><ShieldAlert className="w-3 h-3 ml-1" />أرقام مقنّعة — العرض الكامل يحتاج صلاحية Manage</Badge>}</b>
          {can('create') && <Button size="sm" variant="outline" onClick={() => setAccForm({ account_name: '', account_number: '', iban: '', wallet_number: '', currency: 'USD', branch: '', beneficiary_tenant_id: '', is_default: false, instructions: '' })}><Plus className="w-3.5 h-3.5 ml-1" />حساب</Button>}
        </div>
        <Table><TableHeader><TableRow><TableHead className="text-right">المستفيد</TableHead><TableHead className="text-right">رقم/IBAN/محفظة</TableHead><TableHead className="text-right">عملة</TableHead><TableHead className="text-right">افتراضي</TableHead><TableHead className="text-right">حالة</TableHead><TableHead className="text-right">—</TableHead></TableRow></TableHeader>
          <TableBody>{(d.accounts || []).map(a => (
            <TableRow key={a.id} className={a.active === false ? 'opacity-50' : ''}>
              <TableCell>{a.account_name}<div className="text-[10px] text-slate-500">{a.branch || ''}</div></TableCell>
              <TableCell className="text-xs" dir="ltr">{[a.account_number, a.iban, a.wallet_number].filter(Boolean).join(' / ') || '—'}</TableCell>
              <TableCell>{a.currency}</TableCell><TableCell>{a.is_default ? '⭐' : '—'}</TableCell>
              <TableCell><Badge className={a.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200'}>{a.active !== false ? 'نشط' : 'معطل'}</Badge></TableCell>
              <TableCell><div className="flex gap-1">
                {can('edit') && <Button size="sm" variant="ghost" onClick={() => setAccForm({ ...a })}><Pencil className="w-3 h-3" /></Button>}
                {(can('activate') || can('disable')) && <Button size="sm" variant="ghost" onClick={async () => { const reason = prompt('السبب (إلزامي):'); if (!reason) return; try { await api(`/admin/payfin/accounts/${a.id}/toggle`, { method: 'POST', body: { reason } }); load() } catch (er) { toast.error(er.message) } }}><Power className="w-3 h-3" /></Button>}
              </div></TableCell>
            </TableRow>))}
            {!(d.accounts || []).length && <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-4">لا حسابات</TableCell></TableRow>}
          </TableBody></Table>
        <div className="text-[11px] text-slate-500">🔒 لا تُخزن أرقام بطاقات كاملة أو CVV أو كلمات مرور بنكية — مرفوضة من الخادم</div>
        {accForm && (
          <div className="border rounded-lg p-3 space-y-2 bg-slate-50">
            <b className="text-xs">{accForm.id ? 'تعديل حساب' : 'حساب استلام جديد'}</b>
            <div className="grid grid-cols-2 gap-2">
              {fld('اسم الحساب/المستفيد *', <Input value={accForm.account_name} onChange={ev => setAccForm({ ...accForm, account_name: ev.target.value })} />)}
              {fld('رقم الحساب', <Input dir="ltr" value={accForm.account_number || ''} onChange={ev => setAccForm({ ...accForm, account_number: ev.target.value })} />)}
              {fld('IBAN', <Input dir="ltr" value={accForm.iban || ''} onChange={ev => setAccForm({ ...accForm, iban: ev.target.value })} />)}
              {fld('رقم المحفظة/الاستلام', <Input dir="ltr" value={accForm.wallet_number || ''} onChange={ev => setAccForm({ ...accForm, wallet_number: ev.target.value })} />)}
              {!accForm.id && fld('العملة *', <Select value={accForm.currency} onValueChange={c => setAccForm({ ...accForm, currency: c })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>)}
              {fld('الفرع', <Input value={accForm.branch || ''} onChange={ev => setAccForm({ ...accForm, branch: ev.target.value })} />)}
              {fld('المكتب المستفيد', <Select value={accForm.beneficiary_tenant_id || 'none'} onValueChange={c => setAccForm({ ...accForm, beneficiary_tenant_id: c === 'none' ? '' : c })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>)}
              {fld('تعليمات التحويل', <Input value={accForm.instructions || ''} onChange={ev => setAccForm({ ...accForm, instructions: ev.target.value })} />)}
            </div>
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={!!accForm.is_default} onChange={ev => setAccForm({ ...accForm, is_default: ev.target.checked })} />الحساب الافتراضي لهذه العملة</label>
            <div className="flex gap-2"><Button size="sm" onClick={saveAcc}>حفظ</Button><Button size="sm" variant="outline" onClick={() => setAccForm(null)}>إلغاء</Button></div>
          </div>
        )}
      </div>
    </DialogContent></Dialog>
  )
}

// ---------------- order detail ----------------
const OrderDetail = ({ id, can, onClose, onChanged }) => {
  const [d, setD] = useState(null)
  const [proof, setProof] = useState(null)
  const load = () => api(`/admin/payfin/orders/${id}`).then(setD).catch(e => toast.error(e.message))
  useEffect(() => { load() }, [id]) // eslint-disable-line
  if (!d) return null
  const o = d.order
  const move = async (to) => {
    const reason = prompt(`سبب الانتقال إلى «${d.statuses[to]}» (إلزامي):`)
    if (!reason) return
    try { const r = await api(`/admin/payfin/orders/${o.id}/status`, { method: 'POST', body: { to, reason } }); toast.success(r.note || 'تم'); load(); onChanged?.() } catch (e) { toast.error(e.message) }
  }
  const uploadProof = async () => {
    if (!proof?.file) return toast.error('اختر صورة الإيصال')
    const rd = new FileReader()
    rd.onload = async () => {
      try {
        await api(`/admin/payfin/orders/${o.id}/proofs`, { method: 'POST', body: { ...proof, file: undefined, filename: proof.file.name, mime: proof.file.type, data_base64: String(rd.result).split(',')[1] } })
        toast.success('رُفع الإيصال — لا يعني تأكيد الدفع'); setProof(null); load(); onChanged?.()
      } catch (e) { toast.error(e.message) }
    }
    rd.readAsDataURL(proof.file)
  }
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
      <DialogHeader><DialogTitle><ReceiptText className="w-4 h-4 inline ml-1" /> {o.ref_no} <Badge className={`mr-2 ${ST_COLORS[o.status]}`}>{d.statuses[o.status]}</Badge></DialogTitle></DialogHeader>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs bg-slate-50 rounded p-2">
          <div>🏢 {o.tenant_name}</div><div>👤 {o.payer_name || '—'}</div>
          <div>💰 <b>{o.amount?.toLocaleString()} {o.currency}</b></div>
          <div>💱 سعر مثبت: {o.fx_snapshot ? (typeof o.fx_snapshot === 'object' ? o.fx_snapshot.transfer || o.fx_snapshot.sell || '—' : o.fx_snapshot) : '—'}</div>
          <div>🏦 {o.entity_name || '—'}</div><div>💳 {o.method_name || '—'}</div>
          <div>📅 إنشاء: {dtt(o.created_at)}</div><div>⏰ استحقاق: {o.due_date || '—'}</div>
          <div>رسوم: {o.fee_amount || 0} ({o.fee_bearer === 'payer' ? 'الدافع' : o.fee_bearer === 'office' ? 'المكتب' : 'المنصة'}) — منفصلة عن الأصل</div>
        </div>
        {o.financial_execution === 'pending_execution' && <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-800">⚠️ مؤكد إدارياً و<b>بانتظار التنفيذ المالي</b> — لا رصيد أُضيف: التنفيذ عبر مسار السند/القيد القياسي (نقطة قرار)</div>}
        <div className="text-[11px] text-slate-500 bg-slate-50 rounded p-2">{d.financial_note}</div>
        <div><b>الإثباتات ({(d.proofs || []).length})</b>
          <Table><TableHeader><TableRow><TableHead className="text-right">حوالة/مرجع</TableHead><TableHead className="text-right">المرسل</TableHead><TableHead className="text-right">مبلغ</TableHead><TableHead className="text-right">تاريخ التحويل</TableHead><TableHead className="text-right">رفعه</TableHead></TableRow></TableHeader>
            <TableBody>{(d.proofs || []).map(pr => (
              <TableRow key={pr.id}><TableCell className="text-xs" dir="ltr">{[pr.transfer_no, pr.ref_no].filter(Boolean).join(' / ') || '—'}</TableCell>
                <TableCell className="text-xs">{pr.sender_name || '—'}<div className="text-[10px] text-slate-500">{pr.sender_entity || ''}</div></TableCell>
                <TableCell>{pr.amount ? `${pr.amount} ${pr.currency}` : '—'}</TableCell><TableCell className="text-xs">{pr.transfer_date || '—'}</TableCell>
                <TableCell className="text-[10px]">{pr.uploaded_by}<div>{dtt(pr.uploaded_at)}</div></TableCell></TableRow>))}
              {!(d.proofs || []).length && <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-3">لا إثباتات — رفع الإيصال لا يعني تأكيد الدفع</TableCell></TableRow>}
            </TableBody></Table>
        </div>
        {(can('edit') || can('create')) && !['confirmed', 'refunded', 'cancelled'].includes(o.status) && (
          proof ? (
            <div className="border rounded-lg p-3 space-y-2 bg-slate-50">
              <div className="grid grid-cols-2 gap-2">
                {fld('رقم الحوالة', <Input dir="ltr" value={proof.transfer_no || ''} onChange={e => setProof({ ...proof, transfer_no: e.target.value })} />)}
                {fld('رقم المرجع', <Input dir="ltr" value={proof.ref_no || ''} onChange={e => setProof({ ...proof, ref_no: e.target.value })} />)}
                {fld('اسم المرسل', <Input value={proof.sender_name || ''} onChange={e => setProof({ ...proof, sender_name: e.target.value })} />)}
                {fld('جهة الإرسال', <Input value={proof.sender_entity || ''} onChange={e => setProof({ ...proof, sender_entity: e.target.value })} />)}
                {fld('المبلغ', <Input type="number" value={proof.amount || ''} onChange={e => setProof({ ...proof, amount: e.target.value })} />)}
                {fld('تاريخ التحويل', <Input type="date" value={proof.transfer_date || ''} onChange={e => setProof({ ...proof, transfer_date: e.target.value })} />)}
              </div>
              {fld('صورة الإيصال * (PNG/JPG/PDF ≤ 2MB)', <Input type="file" accept="image/png,image/jpeg,application/pdf" onChange={e => setProof({ ...proof, file: e.target.files?.[0] })} />)}
              {fld('ملاحظات', <Input value={proof.notes || ''} onChange={e => setProof({ ...proof, notes: e.target.value })} />)}
              <div className="flex gap-2"><Button size="sm" onClick={uploadProof}><Upload className="w-3.5 h-3.5 ml-1" />رفع الإثبات</Button><Button size="sm" variant="outline" onClick={() => setProof(null)}>إلغاء</Button></div>
            </div>
          ) : <Button size="sm" variant="outline" onClick={() => setProof({})}><Upload className="w-3.5 h-3.5 ml-1" />رفع إثبات تحويل</Button>
        )}
        <div className="flex gap-2 flex-wrap border-t pt-3">
          {(d.transitions || []).map(t => {
            const needsApprove = ['confirmed', 'rejected', 'partially_refunded', 'refunded'].includes(t)
            if (needsApprove && !can('approve')) return null
            if (!needsApprove && !can('edit') && !can('create')) return null
            return <Button key={t} size="sm" variant={t === 'confirmed' ? 'default' : 'outline'} onClick={() => move(t)}>{d.statuses[t]}</Button>
          })}
        </div>
        <div><b className="text-xs">سجل الحالات</b>
          {(o.status_history || []).slice().reverse().map((h, i) => <div key={i} className="text-[11px] text-slate-500 border-b py-1">{d.statuses[h.to] || h.to} — {h.by} — {dtt(h.at)} {h.reason ? `— ${h.reason}` : ''}</div>)}
        </div>
      </div>
    </DialogContent></Dialog>
  )
}

// ---------------- main ----------------
const AdminPayFinCenter = () => {
  const [perms, setPerms] = useState(null)
  const [tab, setTab] = useState('methods')
  const [methods, setMethods] = useState({ rows: [], types: [] })
  const [entities, setEntities] = useState({ rows: [], types: [] })
  const [orders, setOrders] = useState({ rows: [], statuses: {} })
  const [overview, setOverview] = useState(null)
  const [tenants, setTenants] = useState([])
  const [ef, setEf] = useState({ type: 'all', status: 'all', q: '' })
  const [of, setOf] = useState({ status: 'all', currency: 'all', tenant: 'all', has_proof: 'all', needs_review: false, from: '', to: '', q: '' })
  const [dlg, setDlg] = useState(null)
  const can = (a) => perms?.all || (perms?.perms?.payments || []).includes(a)

  useEffect(() => {
    api('/admin/staff/me').then(setPerms).catch(() => setPerms({ all: true }))
    api('/admin/tenants').then(r => setTenants(Array.isArray(r) ? r : r.rows || [])).catch(() => {})
  }, [])
  const loadMethods = () => api('/admin/payfin/methods').then(setMethods).catch(e => toast.error(e.message))
  const loadEntities = () => {
    const qs = new URLSearchParams()
    if (ef.type !== 'all') qs.set('type', ef.type); if (ef.status !== 'all') qs.set('status', ef.status); if (ef.q) qs.set('q', ef.q)
    api(`/admin/payfin/entities?${qs}`).then(setEntities).catch(e => toast.error(e.message))
  }
  const loadOrders = () => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(of)) { if (k === 'needs_review') { if (v) qs.set('needs_review', '1') } else if (v && v !== 'all') qs.set(k === 'has_proof' ? 'has_proof' : k, v) }
    api(`/admin/payfin/orders?${qs}`).then(setOrders).catch(e => toast.error(e.message))
  }
  const loadOverview = () => api('/admin/payfin/overview').then(setOverview).catch(e => toast.error(e.message))
  useEffect(() => { if (tab === 'methods') loadMethods(); if (tab === 'entities') loadEntities(); if (tab === 'orders') loadOrders(); if (tab === 'overview') loadOverview() }, [tab, ef, of]) // eslint-disable-line

  const TABS = [['methods', '💳 طرق الدفع'], ['entities', '🏦 البنوك والصرافون وشركات التحويل'], ['orders', '🧾 أوامر وفواتير الدفع'], ['overview', '📊 نظرة عامة']]
  const toggleItem = async (url) => { const reason = prompt('السبب (إلزامي):'); if (!reason) return; try { await api(url, { method: 'POST', body: { reason } }); toast.success('تم'); tab === 'methods' ? loadMethods() : loadEntities() } catch (e) { toast.error(e.message) } }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 flex-wrap">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-lg text-sm font-bold border ${tab === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>{l}</button>)}</div>

      {tab === 'methods' && <Card><CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center"><b><CreditCard className="w-4 h-4 inline ml-1" />طرق الدفع</b>
          <div className="flex gap-2"><Button size="sm" variant="outline" onClick={loadMethods}><RefreshCw className="w-4 h-4" /></Button>
            {can('create') && <Button size="sm" onClick={() => setDlg({ type: 'method' })}><Plus className="w-4 h-4 ml-1" />إضافة طريقة</Button>}</div></div>
        <Table><TableHeader><TableRow><TableHead className="text-right">الاسم</TableHead><TableHead className="text-right">النوع</TableHead><TableHead className="text-right">عملات</TableHead><TableHead className="text-right">متطلبات</TableHead><TableHead className="text-right">رسوم</TableHead><TableHead className="text-right">حالة</TableHead><TableHead className="text-right">—</TableHead></TableRow></TableHeader>
          <TableBody>{methods.rows.map(m => (
            <TableRow key={m.id} className={m.active === false ? 'opacity-50' : ''}>
              <TableCell className="font-bold">{m.name}<div className="text-[10px] text-slate-500">{m.description || ''}</div></TableCell>
              <TableCell><Badge variant="outline">{methods.types.find(t => t.key === m.type)?.label || m.type}</Badge></TableCell>
              <TableCell className="text-xs">{(m.currencies || []).join(' · ') || '—'}</TableCell>
              <TableCell className="text-[10px]">{[m.requires_proof && 'إثبات', m.requires_ref && 'مرجع', m.requires_review && 'مراجعة', m.partial_allowed && 'جزئي', m.refundable && 'استرداد'].filter(Boolean).join(' · ') || '—'}</TableCell>
              <TableCell className="text-xs">{m.fee_type ? `${m.fee_value}${m.fee_type === 'percent' ? '%' : ''} (${m.fee_bearer === 'payer' ? 'الدافع' : m.fee_bearer === 'office' ? 'المكتب' : 'المنصة'})` : '—'}</TableCell>
              <TableCell><Badge className={m.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200'}>{m.active !== false ? 'نشط' : 'معطل'}</Badge></TableCell>
              <TableCell><div className="flex gap-1">
                {can('edit') && <Button size="sm" variant="ghost" onClick={() => setDlg({ type: 'method', row: m })}><Pencil className="w-3.5 h-3.5" /></Button>}
                {(can('activate') || can('disable')) && <Button size="sm" variant="ghost" onClick={() => toggleItem(`/admin/payfin/methods/${m.id}/toggle`)}><Power className="w-3.5 h-3.5" /></Button>}
                {can('create') && <Button size="sm" variant="ghost" title="نسخ الإعدادات" onClick={async () => { try { await api(`/admin/payfin/methods/${m.id}/clone`, { method: 'POST', body: {} }); toast.success('نُسخت (معطلة) — راجعها ثم فعّلها'); loadMethods() } catch (e) { toast.error(e.message) } }}><Copy className="w-3.5 h-3.5" /></Button>}
              </div></TableCell>
            </TableRow>))}
            {!methods.rows.length && <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">لا طرق دفع بعد {can('create') ? '— أضف أول طريقة' : ''}</TableCell></TableRow>}
          </TableBody></Table>
        <div className="text-[11px] text-slate-500 border-t pt-2">{methods.legacy_note} · الحذف ممنوع — تعطيل فقط</div>
      </CardContent></Card>}

      {tab === 'entities' && <Card><CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center flex-wrap gap-2"><b><Landmark className="w-4 h-4 inline ml-1" />دليل الجهات المالية المحلية</b>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={loadEntities}><RefreshCw className="w-4 h-4" /></Button>
            {can('create') ? <Button size="sm" onClick={() => setDlg({ type: 'entity' })}><Plus className="w-4 h-4 ml-1" />إضافة جهة</Button>
              : <Button size="sm" variant="outline" onClick={() => setDlg({ type: 'entity', asRequest: true })}>📨 طلب إضافة جهة</Button>}
          </div></div>
        <div className="flex gap-2 flex-wrap">
          <Select value={ef.type} onValueChange={v => setEf({ ...ef, type: v })}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل الأنواع</SelectItem>{entities.types.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent></Select>
          <Select value={ef.status} onValueChange={v => setEf({ ...ef, status: v })}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل الحالات</SelectItem><SelectItem value="active">نشط ومعتمد</SelectItem><SelectItem value="inactive">معطل</SelectItem><SelectItem value="pending">بانتظار الاعتماد</SelectItem></SelectContent></Select>
          <Input placeholder="بحث..." className="max-w-xs" value={ef.q} onChange={e => setEf({ ...ef, q: e.target.value })} />
        </div>
        <Table><TableHeader><TableRow><TableHead className="text-right">الجهة</TableHead><TableHead className="text-right">النوع</TableHead><TableHead className="text-right">الموقع</TableHead><TableHead className="text-right">حسابات</TableHead><TableHead className="text-right">حالة</TableHead><TableHead className="text-right">—</TableHead></TableRow></TableHeader>
          <TableBody>{entities.rows.map(en => (
            <TableRow key={en.id} className={en.active === false ? 'opacity-50' : ''}>
              <TableCell className="font-bold">{en.name_ar}<div className="text-[10px] text-slate-500" dir="ltr">{en.name_en || ''}</div></TableCell>
              <TableCell><Badge variant="outline">{entities.types.find(t => t.key === en.type)?.label || en.type}</Badge></TableCell>
              <TableCell className="text-xs">{[en.geo?.country_name, en.geo?.governorate_name].filter(Boolean).join(' / ') || '—'}</TableCell>
              <TableCell><Badge variant="outline">{en.accounts_count}</Badge></TableCell>
              <TableCell>{en.approval_status === 'pending' ? <Badge className="bg-amber-100 text-amber-700">بانتظار الاعتماد</Badge> : <Badge className={en.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200'}>{en.active !== false ? 'نشط' : 'معطل'}</Badge>}</TableCell>
              <TableCell><div className="flex gap-1">
                <Button size="sm" variant="ghost" title="التفاصيل والحسابات" onClick={() => setDlg({ type: 'entityDetail', id: en.id })}><Eye className="w-3.5 h-3.5" /></Button>
                {can('edit') && <Button size="sm" variant="ghost" onClick={() => setDlg({ type: 'entity', row: en })}><Pencil className="w-3.5 h-3.5" /></Button>}
                {en.approval_status === 'pending' && can('approve') && <Button size="sm" variant="outline" className="text-emerald-700" onClick={async () => { try { await api(`/admin/payfin/entities/${en.id}/approve`, { method: 'POST', body: { decision: 'approve' } }); toast.success('اعتُمدت'); loadEntities() } catch (e) { toast.error(e.message) } }}>اعتماد</Button>}
                {(can('activate') || can('disable')) && en.approval_status !== 'pending' && <Button size="sm" variant="ghost" onClick={() => toggleItem(`/admin/payfin/entities/${en.id}/toggle`)}><Power className="w-3.5 h-3.5" /></Button>}
              </div></TableCell>
            </TableRow>))}
            {!entities.rows.length && <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-8">لا جهات — {can('create') ? 'أضف أول جهة' : 'أرسل طلب إضافة وسيراجعه المخول'}</TableCell></TableRow>}
          </TableBody></Table>
      </CardContent></Card>}

      {tab === 'orders' && <Card><CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center"><b><ReceiptText className="w-4 h-4 inline ml-1" />أوامر الدفع / فواتير التحويل اليدوية</b>
          <div className="flex gap-2"><Button size="sm" variant="outline" onClick={loadOrders}><RefreshCw className="w-4 h-4" /></Button>
            {can('create') && <Button size="sm" onClick={() => setDlg({ type: 'order' })}><Plus className="w-4 h-4 ml-1" />أمر دفع</Button>}</div></div>
        <div className="flex gap-2 flex-wrap text-xs">
          <Select value={of.status} onValueChange={v => setOf({ ...of, status: v })}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل الحالات</SelectItem>{Object.entries(orders.statuses || {}).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
          <Select value={of.currency} onValueChange={v => setOf({ ...of, currency: v })}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل العملات</SelectItem>{CURS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
          <Select value={of.tenant} onValueChange={v => setOf({ ...of, tenant: v })}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل المكاتب</SelectItem>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
          <Select value={of.has_proof} onValueChange={v => setOf({ ...of, has_proof: v })}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">الإثبات: الكل</SelectItem><SelectItem value="1">مع إثبات</SelectItem><SelectItem value="0">بلا إثبات</SelectItem></SelectContent></Select>
          <Input type="date" className="w-36" value={of.from} onChange={e => setOf({ ...of, from: e.target.value })} />
          <Input type="date" className="w-36" value={of.to} onChange={e => setOf({ ...of, to: e.target.value })} />
          <Input placeholder="مرجع/دافع..." className="w-36" value={of.q} onChange={e => setOf({ ...of, q: e.target.value })} />
          <label className="flex items-center gap-1"><input type="checkbox" checked={of.needs_review} onChange={e => setOf({ ...of, needs_review: e.target.checked })} />تنتظر المراجعة</label>
        </div>
        <Table><TableHeader><TableRow><TableHead className="text-right">المرجع</TableHead><TableHead className="text-right">المكتب / الدافع</TableHead><TableHead className="text-right">المبلغ</TableHead><TableHead className="text-right">الطريقة / الجهة</TableHead><TableHead className="text-right">إثباتات</TableHead><TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">أنشئ</TableHead></TableRow></TableHeader>
          <TableBody>{orders.rows.map(o => (
            <TableRow key={o.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setDlg({ type: 'orderDetail', id: o.id })}>
              <TableCell className="font-bold text-blue-700" dir="ltr">{o.ref_no}</TableCell>
              <TableCell className="text-xs">{o.tenant_name}<div className="text-[10px] text-slate-500">{o.payer_name || ''}</div></TableCell>
              <TableCell><b>{o.amount?.toLocaleString()}</b> {o.currency}</TableCell>
              <TableCell className="text-xs">{[o.method_name, o.entity_name].filter(Boolean).join(' / ') || '—'}</TableCell>
              <TableCell><Badge variant="outline">{o.proofs_count || 0}</Badge></TableCell>
              <TableCell><Badge className={ST_COLORS[o.status]}>{orders.statuses[o.status]}</Badge></TableCell>
              <TableCell className="text-[10px]">{o.created_by}<div>{dtt(o.created_at)}</div></TableCell>
            </TableRow>))}
            {!orders.rows.length && <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">لا أوامر دفع مطابقة</TableCell></TableRow>}
          </TableBody></Table>
        <div className="text-[11px] text-slate-500 border-t pt-2">🔒 لا يُضاف رصيد برفع إيصال · التأكيد بصلاحية Approve + Maker–Checker · التأكيد يسجل «بانتظار التنفيذ المالي» — الحركة عبر مسار السند/القيد القائم · الدفع الجزئي/الزائد نقطة قرار (تسجيل للمراجعة فقط) · لا تكامل بطاقات خارجي بهذه الدفعة</div>
      </CardContent></Card>}

      {tab === 'overview' && overview && <Card><CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center"><b>📊 نظرة عامة</b><Badge className="bg-violet-100 text-violet-700">تنتظر المراجعة: {overview.needs_review}</Badge></div>
        <Table><TableHeader><TableRow><TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">العملة</TableHead><TableHead className="text-right">عدد</TableHead><TableHead className="text-right">إجمالي</TableHead></TableRow></TableHeader>
          <TableBody>{(overview.by_status || []).map((r, i) => <TableRow key={i}><TableCell><Badge className={ST_COLORS[r.status]}>{overview.statuses[r.status]}</Badge></TableCell><TableCell>{r.currency}</TableCell><TableCell>{r.count}</TableCell><TableCell className="font-bold">{r.total?.toLocaleString()}</TableCell></TableRow>)}
            {!(overview.by_status || []).length && <TableRow><TableCell colSpan={4} className="text-center text-slate-400 py-6">لا بيانات بعد — كل عملة تُعرض منفصلة (لا دمج)</TableCell></TableRow>}
          </TableBody></Table>
      </CardContent></Card>}

      {dlg?.type === 'method' && <MethodDialog row={dlg.row} types={methods.types.length ? methods.types : [{ key: 'bank_transfer', label: 'تحويل بنكي' }]} onClose={() => setDlg(null)} onDone={() => { setDlg(null); loadMethods() }} />}
      {dlg?.type === 'entity' && <EntityDialog row={dlg.row} asRequest={dlg.asRequest} types={entities.types.length ? entities.types : [{ key: 'bank', label: 'بنك' }]} onClose={() => setDlg(null)} onDone={() => { setDlg(null); loadEntities() }} />}
      {dlg?.type === 'entityDetail' && <EntityDetail id={dlg.id} can={can} tenants={tenants} onClose={() => setDlg(null)} onChanged={loadEntities} />}
      {dlg?.type === 'orderDetail' && <OrderDetail id={dlg.id} can={can} onClose={() => setDlg(null)} onChanged={loadOrders} />}
      {dlg?.type === 'order' && <OrderDialog tenants={tenants} onClose={() => setDlg(null)} onDone={() => { setDlg(null); loadOrders() }} />}
    </div>
  )
}

// ---------------- new order dialog ----------------
const OrderDialog = ({ tenants, onClose, onDone }) => {
  const [v, setV] = useState({ tenant_id: '', payer_name: '', amount: '', currency: 'USD', fee_amount: '', fee_bearer: 'payer', method_id: '', entity_id: '', account_id: '', due_date: '', instructions: '', linked_kind: '', linked_id: '' })
  const [methods, setMethods] = useState([])
  const [entities, setEntities] = useState([])
  const [accounts, setAccounts] = useState([])
  useEffect(() => {
    api('/admin/payfin/methods?status=active').then(r => setMethods(r.rows || [])).catch(() => {})
    api('/admin/payfin/entities?active_only=1').then(r => setEntities(r.rows || [])).catch(() => {})
  }, [])
  useEffect(() => { if (v.entity_id) api(`/admin/payfin/entities/${v.entity_id}`).then(r => setAccounts((r.accounts || []).filter(a => a.active !== false))).catch(() => setAccounts([])) }, [v.entity_id])
  const save = async () => {
    if (!v.tenant_id || !v.amount || !v.currency) return toast.error('المكتب والمبلغ والعملة إلزامية')
    const body = { ...v, amount: Number(v.amount), fee_amount: Number(v.fee_amount) || 0, linked_ref: v.linked_kind && v.linked_id ? { kind: v.linked_kind, id: v.linked_id } : null }
    try { await api('/admin/payfin/orders', { method: 'POST', body }); toast.success('أُنشئ أمر الدفع (مسودة) — سعر الصرف ثُبت من مصدر المكتب الحي'); onDone() } catch (e) { toast.error(e.message) }
  }
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
      <DialogHeader><DialogTitle>➕ أمر دفع / فاتورة تحويل</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {fld('المكتب *', <Select value={v.tenant_id} onValueChange={t => setV({ ...v, tenant_id: t })}><SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger><SelectContent>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>)}
          {fld('العميل / الجهة الدافعة', <Input value={v.payer_name} onChange={e => setV({ ...v, payer_name: e.target.value })} />)}
          {fld('المبلغ *', <Input type="number" value={v.amount} onChange={e => setV({ ...v, amount: e.target.value })} />)}
          {fld('العملة *', <Select value={v.currency} onValueChange={c => setV({ ...v, currency: c })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>)}
          {fld('رسوم (منفصلة عن الأصل)', <Input type="number" value={v.fee_amount} onChange={e => setV({ ...v, fee_amount: e.target.value })} />)}
          {fld('يتحمل الرسوم', <Select value={v.fee_bearer} onValueChange={c => setV({ ...v, fee_bearer: c })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="payer">الدافع</SelectItem><SelectItem value="office">المكتب</SelectItem><SelectItem value="platform">المنصة</SelectItem></SelectContent></Select>)}
          {fld('طريقة الدفع', <Select value={v.method_id} onValueChange={c => setV({ ...v, method_id: c })}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{methods.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select>)}
          {fld('الجهة المستفيدة', <Select value={v.entity_id} onValueChange={c => setV({ ...v, entity_id: c, account_id: '' })}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{entities.map(en => <SelectItem key={en.id} value={en.id}>{en.name_ar}</SelectItem>)}</SelectContent></Select>)}
          {fld('حساب الاستلام', <Select value={v.account_id} onValueChange={c => setV({ ...v, account_id: c })} disabled={!v.entity_id}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.account_name} ({a.currency})</SelectItem>)}</SelectContent></Select>)}
          {fld('تاريخ الاستحقاق', <Input type="date" value={v.due_date} onChange={e => setV({ ...v, due_date: e.target.value })} />)}
          {fld('نوع المرتبط (عملية/طلب)', <Input placeholder="ticket / meraaj ..." value={v.linked_kind} onChange={e => setV({ ...v, linked_kind: e.target.value })} />)}
          {fld('معرف المرتبط', <Input dir="ltr" value={v.linked_id} onChange={e => setV({ ...v, linked_id: e.target.value })} />)}
        </div>
        {fld('تعليمات التحويل', <Textarea rows={2} value={v.instructions} onChange={e => setV({ ...v, instructions: e.target.value })} />)}
        <Button onClick={save} className="w-full">إنشاء (مسودة)</Button>
      </div>
    </DialogContent></Dialog>
  )
}

export default AdminPayFinCenter
