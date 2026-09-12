'use client'
// ============================================================================
// v3.97 — ADMIN GEO LOCATIONS UI (Batch 5). Five cascading tabs:
// country → governorate → district → neighborhood → street. Children only
// shown for the CURRENT selection. Ids never change on rename. Disable
// instead of delete. Move = reason + geo.move permission. Merge = decision
// point (hard-disabled). Buttons are permission-gated AND the server enforces.
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
import { RefreshCw, Plus, Pencil, MapPin, MoveRight, Info, Power } from 'lucide-react'
import { api } from '../shared'

const LEVELS = [
  { key: 'country', label: 'الدولة' }, { key: 'governorate', label: 'المحافظة' },
  { key: 'district', label: 'المديرية' }, { key: 'neighborhood', label: 'الحي' }, { key: 'street', label: 'الشارع' },
]
const fld = (l, node) => <div><div className="text-xs font-bold text-slate-500 mb-1">{l}</div>{node}</div>

const EditDialog = ({ level, parent, row, onClose, onDone }) => {
  const isC = level === 'country'
  const [v, setV] = useState({ name_ar: row?.name_ar || '', name_en: row?.name_en || '', code: row?.code || '', dial_code: row?.dial_code || '', currency: row?.currency || '', sort_order: row?.sort_order ?? 0, notes: row?.notes || '', reason: '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!v.name_ar.trim()) return toast.error('الاسم العربي إلزامي')
    setBusy(true)
    try {
      if (row) await api(`/admin/geo/${row.id}`, { method: 'PUT', body: v })
      else await api('/admin/geo/create', { method: 'POST', body: { ...v, level, parent_id: parent?.id || null } })
      toast.success('تم الحفظ'); onDone()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader><DialogTitle>{row ? `✏️ تعديل: ${row.name_ar}` : `➕ إضافة ${LEVELS.find(l => l.key === level)?.label}`}{parent ? ` — تحت «${parent.name_ar}»` : ''}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {fld('الاسم العربي *', <Input value={v.name_ar} onChange={e => setV({ ...v, name_ar: e.target.value })} />)}
          {fld('الاسم الإنجليزي', <Input dir="ltr" value={v.name_en} onChange={e => setV({ ...v, name_en: e.target.value })} />)}
          <div className="grid grid-cols-2 gap-2">
            {fld('الرمز', <Input dir="ltr" value={v.code} onChange={e => setV({ ...v, code: e.target.value })} />)}
            {fld('ترتيب العرض', <Input type="number" value={v.sort_order} onChange={e => setV({ ...v, sort_order: e.target.value })} />)}
          </div>
          {isC && (
            <div className="grid grid-cols-2 gap-2">
              {fld('رمز الاتصال', <Input dir="ltr" placeholder="+967" value={v.dial_code} onChange={e => setV({ ...v, dial_code: e.target.value })} />)}
              {fld('العملة الافتراضية', <Input dir="ltr" placeholder="YER" value={v.currency} onChange={e => setV({ ...v, currency: e.target.value })} />)}
            </div>
          )}
          {level === 'street' && fld('ملاحظات', <Textarea rows={2} value={v.notes} onChange={e => setV({ ...v, notes: e.target.value })} />)}
          {row && fld('سبب التعديل (Audit)', <Input value={v.reason} onChange={e => setV({ ...v, reason: e.target.value })} />)}
          {row && <div className="text-[11px] text-slate-500">المعرف الداخلي يبقى ثابتاً عند تعديل الأسماء — السجلات المرتبطة لا تنكسر</div>}
          <Button onClick={save} disabled={busy} className="w-full">{busy ? '...' : 'حفظ'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const MoveDialog = ({ row, onClose, onDone }) => {
  // cascade down to the required parent level
  const parentLevel = LEVELS[LEVELS.findIndex(l => l.key === row.level) - 1]?.key
  const [sel, setSel] = useState({}) // level → id
  const [opts, setOpts] = useState({})
  const [reason, setReason] = useState('')
  const chain = LEVELS.slice(0, LEVELS.findIndex(l => l.key === row.level)) // levels to pick down to parent
  useEffect(() => { api('/admin/geo/list?level=country&active_only=1').then(r => setOpts(o => ({ ...o, country: r.rows || [] }))).catch(e => toast.error(e.message)) }, [])
  const pick = async (lvlKey, id, idx) => {
    const next = { ...sel, [lvlKey]: id }
    chain.slice(idx + 1).forEach(l => delete next[l.key])
    setSel(next)
    const nl = chain[idx + 1]
    if (nl) {
      const r = await api(`/admin/geo/list?level=${nl.key}&parent_id=${id}&active_only=1`).catch(() => ({ rows: [] }))
      setOpts(o => ({ ...o, [nl.key]: r.rows || [] }))
    }
  }
  const doMove = async () => {
    const newParent = sel[parentLevel]
    if (!newParent) return toast.error(`اختر ${LEVELS.find(l => l.key === parentLevel)?.label} الجديدة`)
    if (!reason.trim()) return toast.error('السبب إلزامي للنقل')
    try { const r = await api(`/admin/geo/${row.id}/move`, { method: 'POST', body: { new_parent_id: newParent, reason } }); toast.success(`تم النقل — حُدّث ${r.descendants_updated} عنصراً تابعاً`); onDone() } catch (e) { toast.error(e.message) }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader><DialogTitle>🚚 نقل «{row.name_ar}» إلى أب آخر</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-800">عملية حساسة: سبب إلزامي + صلاحية Move + تسجيل Audit. تُرفض إذا كسرت التسلسل أو كررت الاسم تحت الأب الجديد. العناوين القديمة النصية لا تُعدل</div>
          {chain.map((l, idx) => (
            <div key={l.key}>{fld(l.label, (
              <Select value={sel[l.key] || ''} onValueChange={val => pick(l.key, val, idx)} disabled={idx > 0 && !sel[chain[idx - 1].key]}>
                <SelectTrigger><SelectValue placeholder={`اختر ${l.label}`} /></SelectTrigger>
                <SelectContent>{(opts[l.key] || []).map(o => <SelectItem key={o.id} value={o.id}>{o.name_ar}</SelectItem>)}</SelectContent>
              </Select>
            ))}</div>
          ))}
          {fld('السبب * (Audit)', <Textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} />)}
          <Button onClick={doMove} className="w-full">تنفيذ النقل</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const AdminGeoCenter = () => {
  const [perms, setPerms] = useState(null)
  const [level, setLevel] = useState('country')
  const [path, setPath] = useState({}) // levelKey → {id,name_ar}
  const [rows, setRows] = useState([])
  const [note, setNote] = useState(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [dlg, setDlg] = useState(null) // {type:'edit'|'add'|'move'|'usage', row?}
  const [usage, setUsage] = useState(null)
  const can = (a) => perms?.all || (perms?.perms?.geo || []).includes(a)

  useEffect(() => { api('/admin/staff/me').then(setPerms).catch(() => setPerms({ all: true })) }, [])
  const parentOf = (lvl) => { const i = LEVELS.findIndex(l => l.key === lvl); return i > 0 ? path[LEVELS[i - 1].key] : null }
  const load = async (lvl = level) => {
    const parent = parentOf(lvl)
    if (lvl !== 'country' && !parent) { setRows([]); setNote(`اختر ${LEVELS[LEVELS.findIndex(l => l.key === lvl) - 1].label} أولاً من التبويب السابق`); return }
    try {
      const qs = new URLSearchParams({ level: lvl, ...(parent ? { parent_id: parent.id } : {}), ...(q ? { q } : {}), ...(status !== 'all' ? { status } : {}) })
      const r = await api(`/admin/geo/list?${qs}`)
      setRows(r.rows || []); setNote(r.note || null)
    } catch (e) { toast.error(e.message) }
  }
  useEffect(() => { load() }, [level, q, status, path]) // eslint-disable-line

  const drill = (row) => {
    const idx = LEVELS.findIndex(l => l.key === row.level)
    if (idx >= LEVELS.length - 1) return
    const np = { ...path, [row.level]: { id: row.id, name_ar: row.name_ar } }
    LEVELS.slice(idx + 2).forEach(l => delete np[l.key])
    setPath(np); setLevel(LEVELS[idx + 1].key)
  }
  const toggle = async (row) => {
    const reason = prompt(`سبب ${row.active ? 'تعطيل' : 'تفعيل'} «${row.name_ar}» (إلزامي):`)
    if (!reason) return
    try { const r = await api(`/admin/geo/${row.id}/toggle`, { method: 'POST', body: { reason } }); toast.success(r.note || 'تم'); load() } catch (e) { toast.error(e.message) }
  }
  const showUsage = async (row) => { try { setUsage(await api(`/admin/geo/${row.id}/usage`)); setDlg({ type: 'usage' }) } catch (e) { toast.error(e.message) } }

  const parent = parentOf(level)
  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2"><MapPin className="w-5 h-5 text-blue-600" /><b>المواقع الجغرافية</b>
            <Badge variant="outline" className="text-[10px]">دولة ← محافظة ← مديرية ← حي ← شارع</Badge></div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => load()}><RefreshCw className="w-4 h-4" /></Button>
            {can('create') && <Button size="sm" onClick={() => setDlg({ type: 'add' })} disabled={level !== 'country' && !parent}><Plus className="w-4 h-4 ml-1" /> إضافة {LEVELS.find(l => l.key === level)?.label}</Button>}
          </div>
        </div>
        {/* breadcrumb */}
        <div className="text-xs text-slate-600 flex items-center gap-1 flex-wrap">
          {LEVELS.map((l, i) => path[l.key] ? <span key={l.key} className="flex items-center gap-1"><button className="text-blue-600 underline" onClick={() => { setLevel(l.key) }}>{path[l.key].name_ar}</button>{i < 4 && '←'}</span> : null)}
          {!Object.keys(path).length && <span className="text-slate-400">لم يُختر مسار بعد — ابدأ باختيار دولة</span>}
        </div>
        {/* tabs */}
        <div className="flex gap-1 flex-wrap">
          {LEVELS.map((l, i) => {
            const enabled = i === 0 || !!path[LEVELS[i - 1].key]
            return <button key={l.key} disabled={!enabled} onClick={() => setLevel(l.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold border ${level === l.key ? 'bg-blue-600 text-white border-blue-600' : enabled ? 'bg-white text-slate-700 hover:bg-slate-50' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>{l.label}</button>
          })}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Input placeholder="بحث بالاسم/الرمز..." value={q} onChange={e => setQ(e.target.value)} className="max-w-xs" />
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">الكل</SelectItem><SelectItem value="active">نشط</SelectItem><SelectItem value="inactive">معطل</SelectItem></SelectContent></Select>
        </div>
        {note && <div className="text-xs bg-slate-50 border rounded p-2 text-slate-600">{note}</div>}
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-right">الاسم</TableHead><TableHead className="text-right">EN / الرمز</TableHead>
            {level === 'country' && <TableHead className="text-right">اتصال / عملة</TableHead>}
            <TableHead className="text-right">التوابع</TableHead><TableHead className="text-right">ترتيب</TableHead>
            <TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">إجراءات</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id} className={r.active ? '' : 'opacity-50'}>
                <TableCell className="font-bold">{level !== 'street' ? <button className="text-blue-700 hover:underline" onClick={() => drill(r)}>{r.name_ar}</button> : r.name_ar}</TableCell>
                <TableCell className="text-xs" dir="ltr">{[r.name_en, r.code].filter(Boolean).join(' · ') || '—'}</TableCell>
                {level === 'country' && <TableCell className="text-xs" dir="ltr">{[r.dial_code, r.currency].filter(Boolean).join(' · ') || '—'}</TableCell>}
                <TableCell>{level !== 'street' ? <Badge variant="outline">{r.children_count}</Badge> : '—'}</TableCell>
                <TableCell>{r.sort_order}</TableCell>
                <TableCell><Badge className={r.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}>{r.active ? 'نشط' : 'معطل'}</Badge></TableCell>
                <TableCell><div className="flex gap-1">
                  {can('edit') && <Button size="sm" variant="ghost" title="تعديل" onClick={() => setDlg({ type: 'edit', row: r })}><Pencil className="w-3.5 h-3.5" /></Button>}
                  {(can('activate') || can('disable')) && <Button size="sm" variant="ghost" title={r.active ? 'تعطيل' : 'تفعيل'} onClick={() => toggle(r)}><Power className="w-3.5 h-3.5" /></Button>}
                  {can('move') && level !== 'country' && <Button size="sm" variant="ghost" title="نقل" onClick={() => setDlg({ type: 'move', row: r })}><MoveRight className="w-3.5 h-3.5" /></Button>}
                  <Button size="sm" variant="ghost" title="أين استُخدم" onClick={() => showUsage(r)}><Info className="w-3.5 h-3.5" /></Button>
                </div></TableCell>
              </TableRow>
            ))}
            {!rows.length && <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">لا عناصر — {can('create') ? 'أضف أول عنصر من زر الإضافة' : 'لا تملك صلاحية الإضافة'}</TableCell></TableRow>}
          </TableBody>
        </Table>
        <div className="text-[11px] text-slate-500 border-t pt-2">الحذف غير متاح بالتصميم — التعطيل يبقي الموقع في البيانات التاريخية ويخفيه من الاختيارات الجديدة · دمج المواقع غير متاح (يتطلب Migration — نقطة قرار) · العناوين القديمة نصوص حرة غير مربوطة (لا Backfill)</div>
      </CardContent></Card>

      {(dlg?.type === 'add' || dlg?.type === 'edit') && <EditDialog level={level} parent={parent} row={dlg.row} onClose={() => setDlg(null)} onDone={() => { setDlg(null); load() }} />}
      {dlg?.type === 'move' && <MoveDialog row={dlg.row} onClose={() => setDlg(null)} onDone={() => { setDlg(null); load() }} />}
      {dlg?.type === 'usage' && usage && (
        <Dialog open onOpenChange={() => setDlg(null)}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader><DialogTitle>📍 استخدام «{usage.location?.name_ar}»</DialogTitle></DialogHeader>
            <div className="space-y-2 text-sm">
              <div>عناصر تابعة مباشرة: <b>{usage.children_count}</b></div>
              {usage.usage?.length ? usage.usage.map(u => <div key={u.collection} className="flex justify-between border-b py-1"><span>{u.label}</span><Badge>{u.count}</Badge></div>) : <div className="text-slate-500">لا سجلات مرتبطة بالمعرفات الجديدة</div>}
              <div className="text-[11px] text-slate-500 bg-slate-50 rounded p-2">{usage.legacy_note}</div>
              <div className="text-[11px] text-amber-700 bg-amber-50 rounded p-2">{usage.delete_policy}</div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

export default AdminGeoCenter
