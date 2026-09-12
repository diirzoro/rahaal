'use client'
// ============================================================================
// v3.96 — ADMIN CURRENCIES & LOCAL FX UI (Batch 4).
// Reuses THE existing sources: the CURRENCIES code constant (operational) and
// tenant_settings.rates (the live FX source consumed by the app). Every rate
// change: mandatory reason + written confirmation + versioned history + audit.
// New rates apply from NOW only — historical operations keep their snapshots.
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
import { RefreshCw, Plus, Pencil, Lock, Coins, History, Globe } from 'lucide-react'
import { api } from '../shared'

const dtt = (v) => (v ? new Date(v).toLocaleString('ar-EG') : '—')
const fld = (l, node) => <div><div className="text-xs font-bold text-slate-500 mb-1">{l}</div>{node}</div>
const RATE_FIELDS = [['min', 'الحد الأدنى'], ['buy', 'الشراء'], ['transfer', 'التحويل'], ['sell', 'البيع'], ['max', 'الحد الأعلى']]
const fmtRate = (r) => !r ? '—' : typeof r === 'object' ? RATE_FIELDS.filter(([k]) => r[k]).map(([k, l]) => `${l}: ${r[k]}`).join(' · ') || '—' : String(r)

// ---------- currency add/edit ----------
const CurrencyDialog = ({ mode, cur, onClose, onDone }) => {
  const [v, setV] = useState({ code: cur?.code || '', name_ar: cur?.name_ar || '', symbol: cur?.symbol || '', decimals: cur?.decimals ?? 2, active: cur?.active !== false, reason: '' })
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader><DialogTitle>{mode === 'add' ? '➕ إضافة عملة' : `✏️ تعديل: ${cur.code}`}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {mode === 'add' && fld('الكود الدولي (ISO — 3 أحرف) *', <Input dir="ltr" value={v.code} onChange={e => setV({ ...v, code: e.target.value.toUpperCase() })} maxLength={3} className="font-mono" placeholder="AED" />)}
          {fld('الاسم *', <Input value={v.name_ar} onChange={e => setV({ ...v, name_ar: e.target.value })} />)}
          <div className="grid grid-cols-2 gap-2">
            {fld('الرمز', <Input value={v.symbol} onChange={e => setV({ ...v, symbol: e.target.value })} />)}
            {fld('المنازل العشرية', <Input type="number" min="0" max="6" value={v.decimals} onChange={e => setV({ ...v, decimals: e.target.value })} />)}
          </div>
          <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={v.active} onChange={e => setV({ ...v, active: e.target.checked })} className="accent-emerald-600" /> مفعّلة (التعطيل يمنع الاستخدام الجديد فقط — تبقى في السجلات القديمة)</label>
          {fld('السبب * (Audit)', <Textarea value={v.reason} onChange={e => setV({ ...v, reason: e.target.value })} rows={2} />)}
          {mode === 'add' && <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">⚠️ الإضافة إدارية — محرك العمليات يقبل USD/SAR/YER حصراً، وتفعيل عملة جديدة تشغيلياً نقطة قرار</div>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button disabled={busy || !v.reason.trim()} className="bg-blue-600 hover:bg-blue-700" onClick={async () => {
              setBusy(true)
              try {
                if (mode === 'add') await api('/admin/currency/currencies', { method: 'POST', body: v })
                else await api(`/admin/currency/currencies/${cur.code}`, { method: 'PUT', body: v })
                toast.success('تم'); onDone(); onClose()
              } catch (e) { toast.error(e.message) }
              setBusy(false)
            }}>حفظ</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------- rates editor ----------
const RatesDialog = ({ row, currencies, base, onClose, onDone }) => {
  const init = {}
  for (const c of currencies.filter(c => c !== base)) {
    const r = row.rates?.[c]
    init[c] = typeof r === 'object' ? { ...r } : r ? { transfer: r } : {}
  }
  const [v, setV] = useState(init)
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle>💱 تعديل أسعار الصرف — {row.tenant_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-[10px] text-slate-500">مقابل العملة الأساسية ({base}) — نفس قيود المكتب: أدنى ≤ شراء ≤ تحويل ≤ بيع ≤ أعلى (يتحقق الخادم)</div>
          {currencies.filter(c => c !== base).map(c => (
            <div key={c} className="border rounded-lg p-3">
              <div className="text-xs font-extrabold text-slate-700 mb-2">{c} ← {base}</div>
              <div className="grid grid-cols-5 gap-2">
                {RATE_FIELDS.map(([k, l]) => (
                  <div key={k}><div className="text-[10px] text-slate-500 mb-0.5">{l}</div><Input type="number" step="any" value={v[c]?.[k] ?? ''} onChange={e => setV({ ...v, [c]: { ...v[c], [k]: e.target.value === '' ? undefined : Number(e.target.value) } })} className="h-8 text-xs bg-white" /></div>
                ))}
              </div>
            </div>
          ))}
          {fld('سبب التعديل * (Audit)', <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} />)}
          {fld('اكتب حرفياً: «أؤكد تعديل الأسعار» *', <Input value={confirm} onChange={e => setConfirm(e.target.value)} />)}
          <div className="text-[10px] text-blue-900 bg-blue-50 border border-blue-200 rounded-md p-2">ℹ️ يسري السعر الجديد من لحظة الحفظ فقط ويُنشأ إصدار تاريخي — العمليات السابقة تحتفظ بأسعارها المثبتة ولا يُعاد احتسابها</div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button disabled={busy} className="bg-blue-600 hover:bg-blue-700" onClick={async () => {
              setBusy(true)
              try {
                const rates = Object.fromEntries(Object.entries(v).map(([c, r]) => [c, Object.fromEntries(Object.entries(r).filter(([, x]) => x !== undefined && x !== ''))]))
                await api('/admin/currency/rates', { method: 'PUT', body: { tenant_id: row.tenant_id, rates, reason, confirm_text: confirm } })
                toast.success('حُفظت الأسعار + إصدار تاريخي'); onDone(); onClose()
              } catch (e) { toast.error(e.message) }
              setBusy(false)
            }}>حفظ الأسعار</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const AdminCurrencyCenter = () => {
  const [tab, setTab] = useState('currencies')
  const [curs, setCurs] = useState(null)
  const [rates, setRates] = useState(null)
  const [hist, setHist] = useState(null)
  const [histTenant, setHistTenant] = useState('')
  const [dlg, setDlg] = useState(null)
  const [q, setQ] = useState('')

  const loadCurs = () => api('/admin/currency/currencies').then(setCurs).catch(e => toast.error(e.message))
  const loadRates = () => api('/admin/currency/rates').then(setRates).catch(e => toast.error(e.message))
  const loadHist = (t = histTenant) => api(`/admin/currency/rates/history${t ? `?tenant=${t}` : ''}`).then(d => setHist(d)).catch(() => {})
  useEffect(() => { loadCurs() }, [])
  useEffect(() => { if (tab === 'rates') loadRates(); if (tab === 'history') loadHist() }, [tab])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {[['currencies', '🪙 العملات', Coins], ['rates', '💱 أسعار الصرف (المصدر الحي)', Globe], ['history', '📜 سجل الأسعار', History]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-lg text-sm font-bold ${tab === k ? 'bg-blue-600 text-white shadow' : 'bg-white border text-slate-600'}`}>{l}</button>
        ))}
        <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50 mr-auto"><Lock className="w-3 h-3" /> لا حذف لعملات مستخدمة — ولا أثر رجعي لأي سعر جديد</Badge>
      </div>

      {tab === 'currencies' && (
        <Card><CardContent className="pt-4 space-y-3">
          {curs && <div className="text-[11px] text-blue-900 bg-blue-50 border border-blue-200 rounded-md p-2">ℹ️ {curs.source_note}<br />🔒 {curs.base_change_note}</div>}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث..." className="w-44 h-9 bg-white text-xs" />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={loadCurs} className="gap-1"><RefreshCw className="w-3.5 h-3.5" /></Button>
              <Button size="sm" onClick={() => setDlg({ t: 'add' })} className="bg-blue-600 hover:bg-blue-700 gap-1"><Plus className="w-4 h-4" /> إضافة عملة</Button>
            </div>
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-slate-50">
                <TableHead className="text-right">العملة</TableHead><TableHead className="text-right">الرمز</TableHead>
                <TableHead className="text-right">المنازل</TableHead><TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">مكاتب تستخدمها</TableHead>
                <TableHead className="text-right">عمليات</TableHead><TableHead className="text-right">آخر تعديل</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {!curs ? <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-400">جارِ التحميل...</TableCell></TableRow>
                  : curs.rows.filter(r => !q || r.code.includes(q.toUpperCase()) || (r.name_ar || '').includes(q)).map(r => (
                    <TableRow key={r.code} className={r.active === false ? 'opacity-50' : ''}>
                      <TableCell><div className="font-extrabold text-sm font-mono">{r.code}</div><div className="text-[10px] text-slate-400">{r.name_ar}</div></TableCell>
                      <TableCell className="text-sm font-bold">{r.symbol}</TableCell>
                      <TableCell className="text-xs">{r.decimals}</TableCell>
                      <TableCell>
                        {r.is_base ? <Badge className="bg-blue-600 text-white">أساسية</Badge>
                          : r.system ? <Badge className="bg-emerald-100 text-emerald-700">تشغيلية</Badge>
                            : <Badge className="bg-slate-200 text-slate-600" title={r.operational_note}>إدارية — غير تشغيلية</Badge>}
                      </TableCell>
                      <TableCell>{r.active !== false ? <Badge className="bg-emerald-100 text-emerald-700">مفعّلة</Badge> : <Badge className="bg-rose-100 text-rose-700" title={r.deactivation_note || ''}>معطلة</Badge>}</TableCell>
                      <TableCell className="text-xs font-bold">{r.offices_using}</TableCell>
                      <TableCell className="text-xs font-bold">{(r.operations_count || 0).toLocaleString('en-US')}</TableCell>
                      <TableCell className="text-[10px]">{r.updated_at ? `${dtt(r.updated_at)}` : '—'}{r.updated_by ? <div className="text-slate-400" dir="ltr">{r.updated_by}</div> : null}</TableCell>
                      <TableCell><Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => setDlg({ t: 'edit', cur: r })}><Pencil className="w-3 h-3" /> تعديل</Button></TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent></Card>
      )}

      {tab === 'rates' && (
        <Card><CardContent className="pt-4 space-y-3">
          {rates && <div className="text-[11px] text-blue-900 bg-blue-50 border border-blue-200 rounded-md p-2">ℹ️ {rates.source_note}</div>}
          {rates && (
            <div className="flex flex-wrap gap-2 text-[11px]">
              <Badge variant="outline">الأساس: {rates.base_currency}</Badge>
              <Badge variant="outline">افتراضي النظام: {Object.entries(rates.defaults || {}).map(([c, v]) => `${c}=${v}`).join(' · ')}</Badge>
            </div>
          )}
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-slate-50">
                <TableHead className="text-right">المكتب</TableHead>
                <TableHead className="text-right">USD</TableHead><TableHead className="text-right">SAR</TableHead>
                <TableHead className="text-right">آخر تحديث</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {!rates ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-400">جارِ التحميل...</TableCell></TableRow>
                  : rates.rows.map(r => (
                    <TableRow key={r.tenant_id}>
                      <TableCell><div className="text-xs font-bold">{r.tenant_name}</div>{r.using_defaults && <Badge variant="outline" className="text-[9px] text-amber-700">يستخدم افتراضي النظام</Badge>}</TableCell>
                      <TableCell className="text-[10px] max-w-[220px]">{fmtRate(r.rates?.USD)}</TableCell>
                      <TableCell className="text-[10px] max-w-[220px]">{fmtRate(r.rates?.SAR)}</TableCell>
                      <TableCell className="text-[10px]">{dtt(r.updated_at)}</TableCell>
                      <TableCell><Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => setDlg({ t: 'rates', row: r })}><Pencil className="w-3 h-3" /> تعديل الأسعار</Button></TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
          <div className="text-[10px] text-slate-400">تعميم أسعار موحدة على جميع المكاتب متاح عبر API بمسار Maker–Checker ثنائي الخطوات (/admin/currency/rates/apply-global) — لم يُفعّل زر مباشر له في الواجهة حمايةً من التعميم غير المقصود (نقطة قرار)</div>
        </CardContent></Card>
      )}

      {tab === 'history' && (
        <Card><CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Select value={histTenant || 'all'} onValueChange={x => { const t = x === 'all' ? '' : x; setHistTenant(t); loadHist(t) }}>
              <SelectTrigger className="w-48 bg-white h-9 text-xs"><SelectValue placeholder="المكتب" /></SelectTrigger>
              <SelectContent><SelectItem value="all">كل المكاتب</SelectItem>{(rates?.rows || []).map(t => <SelectItem key={t.tenant_id} value={t.tenant_id}>{t.tenant_name}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => loadHist()} className="gap-1"><RefreshCw className="w-3.5 h-3.5" /></Button>
            {hist?.note && <span className="text-[10px] text-slate-500">{hist.note}</span>}
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-slate-50">
                <TableHead className="text-right">السريان من</TableHead><TableHead className="text-right">إلى</TableHead>
                <TableHead className="text-right">المكتب</TableHead><TableHead className="text-right">النطاق</TableHead>
                <TableHead className="text-right">الأسعار الجديدة</TableHead><TableHead className="text-right">المنشئ / السبب</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {!hist ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">جارِ التحميل...</TableCell></TableRow>
                  : hist.rows.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">لا إصدارات بعد — يبدأ السجل مع أول تعديل من هذا المركز (التعديلات السابقة من داخل المكاتب لم تكن تُؤرشف — فجوة موثقة)</TableCell></TableRow>
                    : hist.rows.map(h => (
                      <TableRow key={h.id}>
                        <TableCell className="text-[10px] whitespace-nowrap">{dtt(h.effective_from)}</TableCell>
                        <TableCell className="text-[10px] whitespace-nowrap">{h.effective_to ? dtt(h.effective_to) : <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">سارٍ الآن</Badge>}</TableCell>
                        <TableCell className="text-xs">{h.tenant_name}</TableCell>
                        <TableCell className="text-[10px]">{h.scope === 'global' ? '🌐 تعميم' : 'مكتب'} · {h.source}</TableCell>
                        <TableCell className="text-[10px] max-w-[260px]">{Object.entries(h.rates_after || {}).map(([c, r]) => `${c}: ${fmtRate(r)}`).join(' | ')}</TableCell>
                        <TableCell className="text-[10px]"><span dir="ltr">{h.created_by}</span><div className="text-slate-400 max-w-[160px] truncate" title={h.reason}>{h.reason}</div></TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>
        </CardContent></Card>
      )}

      {dlg?.t === 'add' && <CurrencyDialog mode="add" onClose={() => setDlg(null)} onDone={loadCurs} />}
      {dlg?.t === 'edit' && <CurrencyDialog mode="edit" cur={dlg.cur} onClose={() => setDlg(null)} onDone={loadCurs} />}
      {dlg?.t === 'rates' && <RatesDialog row={dlg.row} currencies={rates?.currencies || ['USD', 'SAR', 'YER']} base={rates?.base_currency || 'YER'} onClose={() => setDlg(null)} onDone={loadRates} />}
    </div>
  )
}

export default AdminCurrencyCenter
