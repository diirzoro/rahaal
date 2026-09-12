'use client'
// ============================================================================
// v3.96 — ADMIN DISPUTES CENTER UI (Batch 4).
// Full lifecycle over /api/admin/disputes* with a server-enforced status
// machine, reason-gated actions, Maker–Checker financial decisions (recorded
// as pending_execution — NO balance is ever touched from here), attachments
// (PNG/JPG/PDF ≤ 2MB, evidence protected after a final decision) and managed
// lists (types/reasons/reject reasons/priorities+SLA).
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
import { RefreshCw, Plus, Eye, Lock, Scale, Paperclip, Download, Trash2, Settings } from 'lucide-react'
import { api } from '../shared'

const dtt = (v) => (v ? new Date(v).toLocaleString('ar-EG') : '—')
const n2 = (v) => (typeof v === 'number' ? v.toLocaleString('en-US') : v ?? '—')
const ST = {
  open: ['مفتوح', 'bg-blue-100 text-blue-700'], in_review: ['قيد المراجعة', 'bg-indigo-100 text-indigo-700'],
  awaiting_docs: ['بانتظار مستندات', 'bg-amber-100 text-amber-800'], awaiting_party: ['بانتظار رد طرف', 'bg-amber-100 text-amber-800'],
  escalated: ['مصعّد', 'bg-orange-100 text-orange-700'], resolved: ['محلول', 'bg-emerald-100 text-emerald-700'],
  rejected: ['مرفوض', 'bg-rose-100 text-rose-700'], closed: ['مغلق', 'bg-slate-200 text-slate-600'], reopened: ['أُعيد فتحه', 'bg-cyan-100 text-cyan-700'],
}
const PR = { low: ['منخفضة', 'bg-slate-100 text-slate-600'], normal: ['عادية', 'bg-blue-100 text-blue-700'], high: ['عالية', 'bg-orange-100 text-orange-700'], critical: ['حرجة', 'bg-rose-100 text-rose-700'] }
const SB = ({ m, s }) => { const [l, c] = m[s] || [s || '—', 'bg-slate-100 text-slate-600']; return <Badge className={c}>{l}</Badge> }
const OUTCOMES = { in_favor_complainant: 'لصالح مقدم النزاع', in_favor_counterparty: 'لصالح الطرف الآخر', partial: 'حل جزئي', no_fault: 'لا خطأ', rejected: 'رفض النزاع' }

const fld = (l, node) => <div><div className="text-xs font-bold text-slate-500 mb-1">{l}</div>{node}</div>

// ---------------- create dialog ----------------
const CreateDialog = ({ cfg, tenants, onClose, onDone }) => {
  const [v, setV] = useState({ type: '', reason_key: '', desc: '', priority: 'normal', ref_id: '', tenant_id: '', counterparty: '', amount: '', currency: '' })
  const [busy, setBusy] = useState(false)
  const needsRef = v.type && v.type !== 'general'
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle>➕ فتح نزاع جديد</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {fld('النوع *', (
              <Select value={v.type || 'none'} onValueChange={x => setV({ ...v, type: x === 'none' ? '' : x })}>
                <SelectTrigger className="bg-white"><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent><SelectItem value="none">—</SelectItem>{(cfg?.types || []).filter(t => t.active).map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            ))}
            {fld('السبب *', (
              <Select value={v.reason_key || 'none'} onValueChange={x => setV({ ...v, reason_key: x === 'none' ? '' : x })}>
                <SelectTrigger className="bg-white"><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent><SelectItem value="none">—</SelectItem>{(cfg?.reasons || []).filter(r => r.active).map(r => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            ))}
            {fld('الأولوية', (
              <Select value={v.priority} onValueChange={x => setV({ ...v, priority: x })}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{(cfg?.priorities || []).filter(x => x.active).map(x => <SelectItem key={x.key} value={x.key}>{x.label} (SLA {x.sla_hours}س)</SelectItem>)}</SelectContent>
              </Select>
            ))}
          </div>
          {needsRef && fld('معرف السجل الأصلي (ID) * — يتحقق الخادم من وجوده', <Input dir="ltr" value={v.ref_id} onChange={e => setV({ ...v, ref_id: e.target.value })} className="bg-white font-mono" placeholder="UUID للعملية/الطرف" />)}
          {v.type === 'general' && fld('المكتب المعني (اختياري)', (
            <Select value={v.tenant_id || 'none'} onValueChange={x => setV({ ...v, tenant_id: x === 'none' ? '' : x })}>
              <SelectTrigger className="bg-white"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent><SelectItem value="none">—</SelectItem>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          ))}
          {fld('وصف النزاع *', <Textarea value={v.desc} onChange={e => setV({ ...v, desc: e.target.value })} rows={3} className="bg-white" />)}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {fld('الطرف الآخر', <Input value={v.counterparty} onChange={e => setV({ ...v, counterparty: e.target.value })} className="bg-white" />)}
            {fld('المبلغ المتنازع عليه', <Input type="number" value={v.amount} onChange={e => setV({ ...v, amount: e.target.value })} className="bg-white" />)}
            {fld('العملة', (
              <Select value={v.currency || 'none'} onValueChange={x => setV({ ...v, currency: x === 'none' ? '' : x })}>
                <SelectTrigger className="bg-white"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent><SelectItem value="none">—</SelectItem>{['USD', 'SAR', 'YER'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            ))}
          </div>
          <div className="text-[10px] text-slate-500">عند تحديد عملة يُثبّت الخادم سعر صرف المكتب الحالي كـSnapshot على النزاع</div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button disabled={busy} className="bg-blue-600 hover:bg-blue-700" onClick={async () => {
              setBusy(true)
              try { await api('/admin/disputes/create', { method: 'POST', body: { ...v, amount: v.amount ? Number(v.amount) : null } }); toast.success('فُتح النزاع'); onDone(); onClose() } catch (e) { toast.error(e.message) }
              setBusy(false)
            }}>فتح النزاع</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- detail dialog ----------------
const DetailDialog = ({ id, cfg, onClose, onChanged }) => {
  const [d, setD] = useState(null)
  const [note, setNote] = useState('')
  const [act, setAct] = useState(null) // {t:'status'|'assign'|'decision'|'close'|'reopen', ...}
  const load = () => api(`/admin/disputes/${id}`).then(setD).catch(e => { toast.error(e.message); onClose() })
  useEffect(() => { load() }, [id])
  const disp = d?.dispute

  const upload = async (file) => {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return toast.error('الحد 2MB')
    const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(file) })
    try { await api(`/admin/disputes/${id}/attachments`, { method: 'POST', body: { filename: file.name, mime: file.type, data_base64: b64 } }); toast.success('رُفع المرفق'); load() } catch (e) { toast.error(e.message) }
  }
  const download = async (attId) => {
    try {
      const r = await api(`/admin/disputes/attachments/download?id=${attId}`)
      const a = document.createElement('a'); a.href = `data:${r.mime};base64,${r.data_base64}`; a.download = r.filename; a.click()
    } catch (e) { toast.error(e.message) }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle>⚖️ نزاع — {disp ? (cfg?.types || []).find(t => t.key === disp.type)?.label || disp.type : ''}</DialogTitle></DialogHeader>
        {!d ? <div className="py-10 text-center text-slate-400">جارِ التحميل...</div> : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="font-mono">{disp.id.slice(0, 8)}</Badge>
              <Badge variant="outline">🏢 {disp.tenant_name}</Badge>
              <SB m={ST} s={disp.status} /><SB m={PR} s={disp.priority} />
              {disp.overdue && <Badge className="bg-rose-600 text-white">⏰ تجاوز SLA</Badge>}
              {disp.financial_status === 'pending_execution' && <Badge className="bg-amber-100 text-amber-800">💰 أثر مالي بانتظار التنفيذ</Badge>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              {[['مقدم النزاع', disp.complainant], ['الطرف الآخر', disp.counterparty], ['المبلغ', disp.amount != null ? `${n2(disp.amount)} ${disp.currency || ''}` : null], ['سعر الصرف المثبت', disp.rate_snapshot ? `${disp.rate_snapshot.rate} (${disp.rate_snapshot.source})` : null], ['المسؤول', disp.assignee], ['SLA', disp.sla_due ? dtt(disp.sla_due) : null], ['الإنشاء', dtt(disp.created_at)], ['الحل/الإغلاق', disp.resolved_at ? dtt(disp.resolved_at) : null]]
                .filter(([, v]) => v).map(([l, v]) => <div key={l} className="border rounded-lg p-2 bg-slate-50"><div className="text-[10px] text-slate-500">{l}</div><div className="font-bold text-xs break-words">{v}</div></div>)}
            </div>
            <div className="text-xs bg-white border rounded-md p-2"><b>الوصف:</b> {disp.desc}</div>
            {disp.decision && (
              <div className="border-2 border-emerald-200 bg-emerald-50/50 rounded-lg p-3 text-xs space-y-1">
                <div className="font-extrabold text-emerald-800">📜 القرار النهائي: {OUTCOMES[disp.decision.outcome] || disp.decision.outcome}</div>
                <div>{disp.decision.text}</div>
                {disp.decision.financial_impact && <div className="font-bold text-amber-800">الأثر المالي: {n2(disp.decision.financial_impact.amount)} {disp.decision.financial_impact.currency} ({disp.decision.financial_impact.direction === 'refund' ? 'استرداد' : 'تحميل'}) — التنفيذ عبر المسار المالي القياسي (بانتظار التنفيذ — نقطة قرار)</div>}
                <div className="text-[10px] text-slate-500">أصدره {disp.decision.decided_by} في {dtt(disp.decision.decided_at)}</div>
              </div>
            )}
            {d.financial_note && <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">🔒 {d.financial_note}</div>}

            {/* actions */}
            <div className="flex flex-wrap gap-1.5 border rounded-lg p-2 bg-slate-50">
              {(d.transitions || []).filter(t => !['resolved', 'rejected'].includes(t)).map(t => (
                <Button key={t} size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setAct({ t: 'status', to: t })}>{(ST[t] || [t])[0]} ←</Button>
              ))}
              {['in_review', 'escalated'].includes(disp.status) && !disp.decision && <Button size="sm" className="h-7 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700" onClick={() => setAct({ t: 'decision' })}>⚖️ إصدار القرار</Button>}
              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setAct({ t: 'assign' })}>👤 تعيين مسؤول</Button>
            </div>

            {/* attachments */}
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-extrabold text-slate-600 flex items-center gap-1"><Paperclip className="w-3.5 h-3.5" /> المرفقات والأدلة (PNG/JPG/PDF ≤ 2MB)</div>
                <label className="text-[11px] font-bold text-blue-600 cursor-pointer hover:underline">+ رفع مرفق<input type="file" accept=".png,.jpg,.jpeg,.pdf" className="hidden" onChange={e => upload(e.target.files?.[0])} /></label>
              </div>
              {(disp.attachments || []).length === 0 ? <div className="text-[11px] text-slate-400">لا مرفقات</div> : (disp.attachments || []).map(a => (
                <div key={a.id} className="flex items-center gap-2 text-[11px] border rounded-md p-1.5 bg-white">
                  <span className="font-bold">{a.filename}</span><span className="text-slate-400">({Math.round(a.size / 1024)}KB · {a.uploaded_by})</span>
                  <div className="mr-auto flex gap-1">
                    <Button size="sm" variant="outline" className="h-6 px-1.5" onClick={() => download(a.id)}><Download className="w-3 h-3" /></Button>
                    {!disp.decision && !['resolved', 'rejected', 'closed'].includes(disp.status) && (
                      <Button size="sm" variant="outline" className="h-6 px-1.5 text-rose-600" onClick={async () => { const reason = window.prompt('سبب حذف المرفق (Audit):'); if (!reason) return; try { await api(`/admin/disputes/${id}/attachments`, { method: 'DELETE', body: { attachment_id: a.id, reason } }); toast.success('حُذف'); load() } catch (e) { toast.error(e.message) } }}><Trash2 className="w-3 h-3" /></Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* linked records */}
            {(d.links?.original || d.links?.journal_entries?.length > 0) && (
              <div className="border rounded-lg p-3 text-xs space-y-1">
                <div className="font-extrabold text-slate-600">🔗 السجلات المرتبطة</div>
                {d.links.original && <div>العملية الأصلية: <span className="font-mono">{d.links.original.id}</span> — {d.links.original.client_name || d.links.original.pilgrim_name || d.links.original.name || ''} {d.links.original.sale_price ? `· بيع ${n2(d.links.original.sale_price)} ${d.links.original.currency}` : ''}</div>}
                {(d.links.journal_entries || []).map(j => <div key={j.id}>قيد: <span className="font-mono">{j.id}</span> — {j.description}</div>)}
                {(d.links.vouchers || []).map(vch => <div key={vch.id}>سند {vch.type === 'receipt' ? 'قبض' : 'صرف'}: {n2(vch.amount)} {vch.currency}</div>)}
              </div>
            )}

            {/* timeline + reply */}
            <div className="border rounded-lg p-3 space-y-2">
              <div className="text-xs font-extrabold text-slate-600">📜 Timeline كامل</div>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {(disp.timeline || []).slice().reverse().map((t, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px]">
                    <span className="text-slate-400 whitespace-nowrap">{dtt(t.at)}</span>
                    <Badge variant="outline" className="text-[9px]">{t.ev}</Badge>
                    <span>{t.note}</span><span className="text-slate-400" dir="ltr">({t.by})</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={note} onChange={e => setNote(e.target.value)} placeholder="إضافة رد / ملاحظة..." className="h-8 text-xs bg-white" />
                <Button size="sm" className="h-8" disabled={!note.trim()} onClick={async () => { try { await api(`/admin/disputes/${id}/reply`, { method: 'POST', body: { note } }); setNote(''); load() } catch (e) { toast.error(e.message) } }}>إضافة</Button>
              </div>
            </div>
          </div>
        )}

        {/* action sub-dialogs */}
        {act && <ActionDialog act={act} id={id} disp={disp} cfg={cfg} onClose={() => setAct(null)} onDone={() => { load(); onChanged() }} />}
      </DialogContent>
    </Dialog>
  )
}

const ActionDialog = ({ act, id, disp, cfg, onClose, onDone }) => {
  const [v, setV] = useState({ reason: '', assignee: '', outcome: 'in_favor_complainant', decision_text: '', reject_reason: '', fin_on: false, fin_amount: disp?.amount || '', fin_currency: disp?.currency || 'USD', fin_direction: 'refund', confirm_text: '' })
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try {
      if (act.t === 'status') await api(`/admin/disputes/${id}/status`, { method: 'POST', body: { to: act.to, reason: v.reason } })
      else if (act.t === 'assign') await api(`/admin/disputes/${id}/assign`, { method: 'POST', body: { assignee: v.assignee, reason: v.reason } })
      else if (act.t === 'decision') await api(`/admin/disputes/${id}/decision`, { method: 'POST', body: { outcome: v.outcome, decision_text: v.decision_text, reject_reason: v.reject_reason || undefined, reason: v.reason, confirm_text: v.confirm_text, financial_impact: v.fin_on ? { amount: Number(v.fin_amount), currency: v.fin_currency, direction: v.fin_direction } : null } })
      toast.success('تم'); onDone(); onClose()
    } catch (e) { toast.error(e.message) }
    setBusy(false)
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle>{act.t === 'status' ? `تغيير الحالة ← ${(ST[act.to] || [act.to])[0]}` : act.t === 'assign' ? 'تعيين المسؤول' : '⚖️ إصدار القرار النهائي'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {act.t === 'assign' && fld('المسؤول (إيميل/اسم) *', <Input value={v.assignee} onChange={e => setV({ ...v, assignee: e.target.value })} />)}
          {act.t === 'decision' && (
            <>
              {fld('النتيجة *', (
                <Select value={v.outcome} onValueChange={x => setV({ ...v, outcome: x })}>
                  <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(OUTCOMES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              ))}
              {v.outcome === 'rejected' && fld('سبب الرفض (من القائمة) *', (
                <Select value={v.reject_reason || 'none'} onValueChange={x => setV({ ...v, reject_reason: x === 'none' ? '' : x })}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">—</SelectItem>{(cfg?.reject_reasons || []).filter(r => r.active).map(r => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              ))}
              {fld('نص القرار *', <Textarea value={v.decision_text} onChange={e => setV({ ...v, decision_text: e.target.value })} rows={3} />)}
              <label className="flex items-center gap-2 text-xs font-bold text-amber-800"><input type="checkbox" checked={v.fin_on} onChange={e => setV({ ...v, fin_on: e.target.checked })} className="accent-amber-600" /> 💰 القرار له أثر مالي (يُسجل «بانتظار التنفيذ» — لا يلمس الأرصدة)</label>
              {v.fin_on && (
                <div className="grid grid-cols-3 gap-2 bg-amber-50 border border-amber-200 rounded-md p-2">
                  {fld('المبلغ *', <Input type="number" value={v.fin_amount} onChange={e => setV({ ...v, fin_amount: e.target.value })} className="bg-white" />)}
                  {fld('العملة', (
                    <Select value={v.fin_currency} onValueChange={x => setV({ ...v, fin_currency: x })}>
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>{['USD', 'SAR', 'YER'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  ))}
                  {fld('الاتجاه', (
                    <Select value={v.fin_direction} onValueChange={x => setV({ ...v, fin_direction: x })}>
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="refund">استرداد</SelectItem><SelectItem value="charge">تحميل</SelectItem></SelectContent>
                    </Select>
                  ))}
                  <div className="col-span-3">{fld('اكتب حرفياً: «أؤكد القرار المالي» *', <Input value={v.confirm_text} onChange={e => setV({ ...v, confirm_text: e.target.value })} className="bg-white" />)}</div>
                </div>
              )}
            </>
          )}
          {fld('السبب * (Audit)', <Textarea value={v.reason} onChange={e => setV({ ...v, reason: e.target.value })} rows={2} />)}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button disabled={busy || !v.reason.trim()} className="bg-blue-600 hover:bg-blue-700" onClick={go}>تأكيد</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- config manager ----------------
const ConfigTab = ({ cfg, onSaved }) => {
  const [v, setV] = useState(null)
  const [reason, setReason] = useState('')
  useEffect(() => { if (cfg) setV(JSON.parse(JSON.stringify(cfg))) }, [cfg])
  if (!v) return <div className="py-10 text-center text-slate-400">جارِ التحميل...</div>
  const List = ({ lk, label, sla }) => (
    <Card><CardContent className="pt-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-extrabold text-slate-600">{label}</div>
        <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => setV({ ...v, [lk]: [...v[lk], { key: `custom_${Date.now()}`, label: 'عنصر جديد', active: true, ...(sla ? { sla_hours: 72 } : {}) }] })}>+ إضافة</Button>
      </div>
      {v[lk].map((it, i) => (
        <div key={it.key} className="flex items-center gap-2">
          <Input value={it.label} onChange={e => { const arr = [...v[lk]]; arr[i] = { ...it, label: e.target.value }; setV({ ...v, [lk]: arr }) }} className="h-7 text-xs bg-white" />
          {sla && <Input type="number" title="SLA ساعات" value={it.sla_hours} onChange={e => { const arr = [...v[lk]]; arr[i] = { ...it, sla_hours: e.target.value }; setV({ ...v, [lk]: arr }) }} className="h-7 text-xs bg-white w-20" />}
          <label className="flex items-center gap-1 text-[10px] font-bold whitespace-nowrap"><input type="checkbox" checked={it.active !== false} onChange={e => { const arr = [...v[lk]]; arr[i] = { ...it, active: e.target.checked }; setV({ ...v, [lk]: arr }) }} className="accent-emerald-600" /> مفعّل</label>
        </div>
      ))}
    </CardContent></Card>
  )
  return (
    <div className="space-y-3">
      <div className="text-[11px] text-blue-900 bg-blue-50 border border-blue-200 rounded-md p-2">ℹ️ الحذف ممنوع لأي عنصر مستخدم تاريخياً (الخادم يرفضه) — استخدم التعطيل</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <List lk="types" label="أنواع النزاعات" /><List lk="reasons" label="أسباب النزاع" />
        <List lk="reject_reasons" label="أسباب الرفض" /><List lk="priorities" label="الأولويات + SLA (ساعات)" sla />
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1">{fld('سبب التعديل * (Audit)', <Input value={reason} onChange={e => setReason(e.target.value)} className="bg-white" />)}</div>
        <Button disabled={!reason.trim()} className="bg-blue-600 hover:bg-blue-700" onClick={async () => { try { await api('/admin/disputes/config', { method: 'PUT', body: { ...v, reason } }); toast.success('حُفظت القوائم'); setReason(''); onSaved() } catch (e) { toast.error(e.message) } }}>حفظ القوائم</Button>
      </div>
    </div>
  )
}

// ---------------- main ----------------
const AdminDisputesCenter = () => {
  const [tab, setTab] = useState('list')
  const [cfg, setCfg] = useState(null)
  const [tenants, setTenants] = useState([])
  const [data, setData] = useState(null)
  const [f, setF] = useState({ tenant: '', status: '', priority: '', type: '', q: '', overdue: false })
  const [dlg, setDlg] = useState(null)

  const loadCfg = () => api('/admin/disputes/config').then(d => setCfg(d.config)).catch(() => {})
  const load = (over = {}) => {
    const o = { ...f, ...over }
    const qs = Object.entries(o).filter(([, v]) => v !== '' && v !== false).map(([k, v]) => `${k}=${encodeURIComponent(v === true ? '1' : v)}`).join('&')
    api(`/admin/disputes${qs ? `?${qs}` : ''}`).then(setData).catch(e => toast.error(e.message))
  }
  useEffect(() => { loadCfg(); load(); api('/admin/tenants').then(d => setTenants(d?.tenants || [])).catch(() => {}) }, [])

  const q = data?.queues || {}
  const QUEUES = [['مفتوحة', q.open, { status: 'open' }, 'bg-blue-600'], ['تحتاج إجراء', q.needs_action, {}, 'bg-amber-600'], ['متأخرة SLA', q.overdue, { overdue: true }, 'bg-rose-600'], ['حرجة', q.critical, { priority: 'critical' }, 'bg-rose-700'], ['بانتظار مستندات', q.awaiting_docs, { status: 'awaiting_docs' }, 'bg-amber-500'], ['بانتظار طرف', q.awaiting_party, { status: 'awaiting_party' }, 'bg-amber-500'], ['مصعّدة', q.escalated, { status: 'escalated' }, 'bg-orange-600'], ['محلولة/مغلقة', q.resolved_closed, { status: 'resolved' }, 'bg-emerald-600']]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {[['list', '⚖️ النزاعات'], ['config', '⚙️ القوائم وSLA']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-lg text-sm font-bold ${tab === k ? 'bg-blue-600 text-white shadow' : 'bg-white border text-slate-600'}`}>{l}</button>
        ))}
        <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50 mr-auto"><Lock className="w-3 h-3" /> لا تعديل أرصدة من هنا — الأثر المالي يمر عبر المسار المالي القياسي</Badge>
      </div>

      {tab === 'config' && <ConfigTab cfg={cfg} onSaved={loadCfg} />}

      {tab === 'list' && (
        <>
          <div className="flex gap-1.5 flex-wrap">
            {QUEUES.map(([l, n, patch, color]) => (
              <button key={l} onClick={() => { const nf = { ...f, status: '', priority: '', overdue: false, ...patch }; setF(nf); load({ status: '', priority: '', overdue: false, ...patch }) }} className={`${color} text-white rounded-lg px-3 py-1.5 text-xs font-bold hover:opacity-90 flex items-center gap-1.5`}>{l} <span className="bg-white/25 rounded px-1.5">{n ?? 0}</span></button>
            ))}
          </div>
          <Card><CardContent className="pt-4 flex flex-wrap items-center gap-2">
            <Select value={f.tenant || 'all'} onValueChange={x => setF({ ...f, tenant: x === 'all' ? '' : x })}>
              <SelectTrigger className="w-40 bg-white h-9 text-xs"><SelectValue placeholder="المكتب" /></SelectTrigger>
              <SelectContent><SelectItem value="all">المكتب — الكل</SelectItem>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={f.type || 'all'} onValueChange={x => setF({ ...f, type: x === 'all' ? '' : x })}>
              <SelectTrigger className="w-40 bg-white h-9 text-xs"><SelectValue placeholder="النوع" /></SelectTrigger>
              <SelectContent><SelectItem value="all">النوع — الكل</SelectItem>{(cfg?.types || []).map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={f.status || 'all'} onValueChange={x => setF({ ...f, status: x === 'all' ? '' : x })}>
              <SelectTrigger className="w-36 bg-white h-9 text-xs"><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent><SelectItem value="all">الحالة — الكل</SelectItem>{Object.entries(ST).map(([k, [l]]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} onKeyDown={e => e.key === 'Enter' && load()} placeholder="بحث: رقم/طرف/وصف..." className="w-48 h-9 bg-white text-xs" />
            <Button size="sm" onClick={() => load()} className="bg-blue-600 hover:bg-blue-700 gap-1"><RefreshCw className="w-3.5 h-3.5" /> تطبيق</Button>
            <Button size="sm" onClick={() => setDlg({ t: 'create' })} className="bg-emerald-600 hover:bg-emerald-700 gap-1 mr-auto"><Plus className="w-4 h-4" /> نزاع جديد</Button>
          </CardContent></Card>
          <Card><CardContent className="pt-3">
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-slate-50">
                  <TableHead className="text-right">النزاع</TableHead><TableHead className="text-right">المكتب</TableHead>
                  <TableHead className="text-right">الطرف/المرجع</TableHead><TableHead className="text-right">المبلغ</TableHead>
                  <TableHead className="text-right">الأولوية</TableHead><TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">SLA</TableHead><TableHead className="text-right">المسؤول</TableHead>
                  <TableHead className="text-right">الإنشاء</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {!data ? <TableRow><TableCell colSpan={10} className="text-center py-8 text-slate-400">جارِ التحميل...</TableCell></TableRow>
                    : data.rows.length === 0 ? <TableRow><TableCell colSpan={10} className="text-center py-8 text-slate-400">لا نزاعات مطابقة</TableCell></TableRow>
                      : data.rows.map(r => (
                        <TableRow key={r.id} className={r.overdue ? 'bg-rose-50/40' : ''}>
                          <TableCell><div className="text-xs font-bold">{(cfg?.types || []).find(t => t.key === r.type)?.label || r.type}</div><div className="text-[10px] text-slate-400 font-mono">{r.id.slice(0, 8)}</div></TableCell>
                          <TableCell className="text-xs">{r.tenant_name}</TableCell>
                          <TableCell className="text-xs">{r.party || r.counterparty || '—'}{r.ref_id ? <div className="text-[9px] text-slate-400 font-mono">{r.ref_id.slice(0, 8)}</div> : null}</TableCell>
                          <TableCell className="text-xs font-bold">{r.amount != null ? `${n2(r.amount)} ${r.currency || ''}` : '—'}</TableCell>
                          <TableCell><SB m={PR} s={r.priority} /></TableCell>
                          <TableCell><SB m={ST} s={r.status} />{r.financial_status === 'pending_execution' && <div className="text-[9px] text-amber-600">أثر مالي معلق</div>}</TableCell>
                          <TableCell className="text-[10px]">{r.sla_due ? dtt(r.sla_due) : '—'}{r.overdue && <div className="text-rose-600 font-bold">متجاوز</div>}</TableCell>
                          <TableCell className="text-[10px]">{r.assignee || '—'}</TableCell>
                          <TableCell className="text-[10px]">{dtt(r.created_at)}</TableCell>
                          <TableCell><Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setDlg({ t: 'detail', id: r.id })}><Eye className="w-3 h-3" /></Button></TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
        </>
      )}

      {dlg?.t === 'create' && <CreateDialog cfg={cfg} tenants={tenants} onClose={() => setDlg(null)} onDone={() => load()} />}
      {dlg?.t === 'detail' && <DetailDialog id={dlg.id} cfg={cfg} onClose={() => setDlg(null)} onChanged={() => load()} />}
    </div>
  )
}

export default AdminDisputesCenter
