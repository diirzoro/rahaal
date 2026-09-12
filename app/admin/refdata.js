'use client'
// ============================================================================
// v3.97 — UNIFIED REFERENCE DATA UI (Batch 5). Registry of ALL admin lists:
// managed (edited here — single admin_ref_lists source), external (linked to
// their dedicated manager — never duplicated), locked (code constants with the
// reason shown). Add button only for permitted users; server enforces anyway.
// ============================================================================
import React, { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { RefreshCw, Plus, Pencil, Power, ListChecks, Lock, ExternalLink, ArrowRight } from 'lucide-react'
import { api } from '../shared'

const fld = (l, node) => <div><div className="text-xs font-bold text-slate-500 mb-1">{l}</div>{node}</div>

const ItemDialog = ({ listKey, item, onClose, onDone }) => {
  const [v, setV] = useState({ label: item?.label || '', label_en: item?.label_en || '', sort_order: item?.sort_order ?? 0, notes: item?.notes || '', reason: '' })
  const save = async () => {
    if (!v.label.trim()) return toast.error('الاسم إلزامي')
    try {
      if (item) await api(`/admin/refdata/lists/${listKey}/items/${item.key}`, { method: 'PUT', body: v })
      else await api(`/admin/refdata/lists/${listKey}/items`, { method: 'POST', body: v })
      toast.success('تم'); onDone()
    } catch (e) { toast.error(e.message) }
  }
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-md" dir="rtl">
      <DialogHeader><DialogTitle>{item ? `✏️ ${item.label}` : '➕ إضافة عنصر'}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        {fld('الاسم *', <Input value={v.label} onChange={e => setV({ ...v, label: e.target.value })} />)}
        {fld('الاسم الإنجليزي', <Input dir="ltr" value={v.label_en} onChange={e => setV({ ...v, label_en: e.target.value })} />)}
        <div className="grid grid-cols-2 gap-2">
          {fld('ترتيب العرض', <Input type="number" value={v.sort_order} onChange={e => setV({ ...v, sort_order: e.target.value })} />)}
          {fld('ملاحظات', <Input value={v.notes} onChange={e => setV({ ...v, notes: e.target.value })} />)}
        </div>
        {fld('السبب (Audit)', <Input value={v.reason} onChange={e => setV({ ...v, reason: e.target.value })} />)}
        <Button onClick={save} className="w-full">حفظ</Button>
      </div>
    </DialogContent></Dialog>
  )
}

const AdminRefDataCenter = ({ onNavigate }) => {
  const [perms, setPerms] = useState(null)
  const [reg, setReg] = useState(null)
  const [sel, setSel] = useState(null) // managed list key
  const [data, setData] = useState(null)
  const [q, setQ] = useState('')
  const [dlg, setDlg] = useState(null)
  const can = (a) => perms?.all || (perms?.perms?.refdata || []).includes(a)

  const loadReg = () => api('/admin/refdata/registry').then(setReg).catch(e => toast.error(e.message))
  const loadList = (k = sel) => k && api(`/admin/refdata/lists/${k}${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setData).catch(e => toast.error(e.message))
  useEffect(() => { api('/admin/staff/me').then(setPerms).catch(() => setPerms({ all: true })); loadReg() }, []) // eslint-disable-line
  useEffect(() => { loadList() }, [sel, q]) // eslint-disable-line

  const toggle = async (it) => {
    const reason = prompt(`سبب ${it.active ? 'تعطيل' : 'تفعيل'} «${it.label}» (إلزامي):`)
    if (!reason) return
    try { const r = await api(`/admin/refdata/lists/${sel}/items/${it.key}/toggle`, { method: 'POST', body: { reason } }); toast.success(r.note || 'تم'); loadList(); loadReg() } catch (e) { toast.error(e.message) }
  }

  if (sel && data) {
    return (
      <Card><CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setSel(null); setData(null); loadReg() }}><ArrowRight className="w-4 h-4" /></Button>
            <b>{data.list?.label}</b><Badge variant="outline" className="text-[10px]">مصدر موحد: admin_ref_lists</Badge>
          </div>
          <div className="flex gap-2">
            <Input placeholder="بحث..." className="w-40" value={q} onChange={e => setQ(e.target.value)} />
            <Button size="sm" variant="outline" onClick={() => loadList()}><RefreshCw className="w-4 h-4" /></Button>
            {can('create') && <Button size="sm" onClick={() => setDlg({})}><Plus className="w-4 h-4 ml-1" />إضافة</Button>}
          </div>
        </div>
        <div className="text-[11px] text-slate-500">{data.list?.desc}</div>
        <Table><TableHeader><TableRow><TableHead className="text-right">الاسم</TableHead><TableHead className="text-right">EN</TableHead><TableHead className="text-right">ترتيب</TableHead><TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">—</TableHead></TableRow></TableHeader>
          <TableBody>{(data.items || []).map(it => (
            <TableRow key={it.key} className={it.active ? '' : 'opacity-50'}>
              <TableCell className="font-bold">{it.label}<div className="text-[10px] text-slate-500">{it.notes || ''}</div></TableCell>
              <TableCell className="text-xs" dir="ltr">{it.label_en || '—'}</TableCell>
              <TableCell>{it.sort_order}</TableCell>
              <TableCell><Badge className={it.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}>{it.active ? 'نشط' : 'معطل'}</Badge></TableCell>
              <TableCell><div className="flex gap-1">
                {can('edit') && <Button size="sm" variant="ghost" onClick={() => setDlg({ item: it })}><Pencil className="w-3.5 h-3.5" /></Button>}
                {(can('activate') || can('disable')) && <Button size="sm" variant="ghost" onClick={() => toggle(it)}><Power className="w-3.5 h-3.5" /></Button>}
              </div></TableCell>
            </TableRow>))}
            {!(data.items || []).length && <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-8">لا عناصر بعد{can('create') ? ' — أضف أول عنصر من زر الإضافة' : ' — لا تملك صلاحية الإضافة'}</TableCell></TableRow>}
          </TableBody></Table>
        <div className="text-[11px] text-slate-500 border-t pt-2">{data.usage_note} · لا حذف — تعطيل فقط، والمعطل يبقى في السجلات القديمة ويختفي من الاختيارات الجديدة</div>
        {dlg && <ItemDialog listKey={sel} item={dlg.item} onClose={() => setDlg(null)} onDone={() => { setDlg(null); loadList(); loadReg() }} />}
      </CardContent></Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><ListChecks className="w-5 h-5 text-blue-600" /><b>الإدارة الموحدة للقوائم المرجعية</b></div>
          <Button size="sm" variant="outline" onClick={loadReg}><RefreshCw className="w-4 h-4" /></Button>
        </div>
        {reg?.policy && <div className="text-[11px] text-slate-500 bg-slate-50 rounded p-2">{reg.policy}</div>}

        <div className="font-bold text-sm mt-2">📝 قوائم مُدارة من هنا</div>
        <div className="grid md:grid-cols-2 gap-2">
          {(reg?.managed || []).map(l => (
            <button key={l.key} onClick={() => setSel(l.key)} className="border rounded-xl p-3 text-right hover:bg-blue-50 transition">
              <div className="flex items-center justify-between"><b>{l.label}</b><Badge variant="outline">{l.counts.active}/{l.counts.total}</Badge></div>
              <div className="text-[11px] text-slate-500 mt-1">{l.desc}</div>
            </button>
          ))}
        </div>

        <div className="font-bold text-sm mt-3">🔗 قوائم لها مركز إدارة مخصص (مصدر واحد — لا تكرار)</div>
        <div className="grid md:grid-cols-2 gap-2">
          {(reg?.external || []).map(l => (
            <div key={l.key} className="border rounded-xl p-3">
              <div className="flex items-center justify-between"><b>{l.label}</b>
                {l.manage_section && onNavigate && <Button size="sm" variant="ghost" className="text-blue-600" onClick={() => onNavigate(l.manage_section)}><ExternalLink className="w-3.5 h-3.5 ml-1" />فتح</Button>}</div>
              <div className="text-[11px] text-slate-500 mt-1">المصدر: {l.source}</div>
              <div className="text-[10px] text-blue-700 mt-0.5">{l.manage_hint}</div>
            </div>
          ))}
        </div>

        <div className="font-bold text-sm mt-3">🔒 ثوابت مقفلة بالكود (بالتصميم — ليست قوائم حرة)</div>
        <div className="grid md:grid-cols-2 gap-2">
          {(reg?.locked || []).map(l => (
            <div key={l.key} className="border border-dashed rounded-xl p-3 bg-slate-50">
              <div className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-slate-400" /><b className="text-slate-600">{l.label}</b></div>
              <div className="text-[11px] text-slate-500 mt-1">{l.reason}</div>
            </div>
          ))}
        </div>
      </CardContent></Card>
    </div>
  )
}

export default AdminRefDataCenter
