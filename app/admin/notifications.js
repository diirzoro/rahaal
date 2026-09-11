'use client'
// ============================================================================
// v3.95 — ADMIN NOTIFICATIONS CENTER (Batch 3) — In-App only.
// Stored notifications (emitted by Batch-3 flows) + a DERIVED live feed
// computed from real operational data. Per-user read/archive. Settings with
// an honest wired/unwired flag per type. SMS/Push/Email: not implemented.
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
import { RefreshCw, Bell, Settings, Check, Archive, ArchiveRestore, CheckCheck, Lock, Zap } from 'lucide-react'
import { api } from '../shared'

const dtt = (v) => (v ? new Date(v).toLocaleString('ar-EG') : '—')
const PRI = { info: ['معلوماتي', 'bg-blue-100 text-blue-700'], action: ['إجراء مطلوب', 'bg-amber-100 text-amber-800'], warning: ['تحذير', 'bg-orange-100 text-orange-700'], critical: ['حرج', 'bg-rose-100 text-rose-700'] }
const PB = ({ p }) => { const [l, c] = PRI[p] || [p || '—', 'bg-slate-100 text-slate-600']; return <Badge className={c}>{l}</Badge> }
const MYST = { new: ['جديد', 'bg-blue-100 text-blue-700'], read: ['مقروء', 'bg-slate-100 text-slate-500'], archived: ['مؤرشف', 'bg-slate-200 text-slate-600'], handled: ['تمت معالجته', 'bg-emerald-100 text-emerald-700'] }

const SettingDialog = ({ s, onClose, onSaved }) => {
  const [v, setV] = useState({ enabled: s.enabled, default_priority: s.default_priority, needs_action: s.needs_action, retention_days: s.retention_days, dedupe: s.dedupe, reason: '' })
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader><DialogTitle>⚙️ إعداد: {s.label}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-[11px] text-slate-500 bg-slate-50 border rounded-md p-2">المصدر: {s.source} {s.wired === false && <b className="text-rose-600">— غير مربوط بعد</b>}</div>
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={v.enabled} onChange={e => setV({ ...v, enabled: e.target.checked })} className="accent-blue-600" /> مفعّل</label>
          <div><div className="text-xs font-bold text-slate-500 mb-1">الأولوية الافتراضية</div>
            <Select value={v.default_priority} onValueChange={x => setV({ ...v, default_priority: x })}>
              <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PRI).map(([k, [l]]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={v.needs_action} onChange={e => setV({ ...v, needs_action: e.target.checked })} className="accent-amber-600" /> يحتاج إجراء</label>
            <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={v.dedupe} onChange={e => setV({ ...v, dedupe: e.target.checked })} className="accent-blue-600" /> منع التكرار</label>
          </div>
          <div><div className="text-xs font-bold text-slate-500 mb-1">مدة الاحتفاظ (أيام)</div><Input type="number" min="1" value={v.retention_days} onChange={e => setV({ ...v, retention_days: e.target.value })} /></div>
          <div><div className="text-xs font-bold text-rose-600 mb-1">السبب * (Audit)</div><Textarea value={v.reason} onChange={e => setV({ ...v, reason: e.target.value })} rows={2} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button disabled={busy || !v.reason.trim()} className="bg-blue-600 hover:bg-blue-700" onClick={async () => { setBusy(true); try { await api(`/admin/notify/settings/${s.type}`, { method: 'PUT', body: v }); toast.success('حُفظ الإعداد'); onSaved(); onClose() } catch (e) { toast.error(e.message) } setBusy(false) }}>حفظ</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const AdminNotifyCenter = ({ onNavigate }) => {
  const [tab, setTab] = useState('inbox')
  const [feed, setFeed] = useState(null)
  const [settings, setSettings] = useState(null)
  const [catalogNote, setCatalogNote] = useState('')
  const [f, setF] = useState({ type: '', priority: '', q: '', status: '' })
  const [dlg, setDlg] = useState(null)

  const load = () => {
    const o = { ...f }
    if (tab === 'unread') o.status = 'unread'
    else if (tab === 'action') o.needs_action = '1'
    else if (tab === 'critical') o.priority = 'critical'
    else if (tab === 'archived') o.status = 'archived'
    else if (tab === 'failed') o.status = 'failed'
    const qs = Object.entries(o).filter(([, v]) => v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    api(`/admin/notify/feed${qs ? `?${qs}` : ''}`).then(setFeed).catch(e => toast.error(e.message))
  }
  const loadSettings = () => api('/admin/notify/settings').then(d => { setSettings(d.settings || []); setCatalogNote(d.catalog_note || '') }).catch(() => {})
  useEffect(() => { if (tab === 'settings') loadSettings(); else load() }, [tab])

  const act = async (id, action) => { try { await api(`/admin/notify/${id}/${action}`, { method: 'POST', body: {} }); load() } catch (e) { toast.error(e.message) } }
  const goLink = (n) => { if (n.link?.section && onNavigate) onNavigate(n.link.section) }

  const c = feed?.counts || {}
  const TABS = [
    ['inbox', `📥 الوارد`], ['unread', `🔵 غير المقروء (${c.unread ?? 0})`], ['action', `⚠️ يحتاج إجراء (${c.needs_action ?? 0})`],
    ['critical', `🔴 الحرج (${c.critical ?? 0})`], ['archived', `🗃️ المؤرشف (${c.archived ?? 0})`], ['failed', `❌ فشل الإرسال (${c.failed ?? 0})`], ['settings', '⚙️ الإعدادات'],
  ]

  const NotifRow = ({ n, derived = false }) => (
    <div className={`border rounded-lg p-3 bg-white flex items-start gap-3 ${n.my_status === 'new' && !derived ? 'border-blue-300 bg-blue-50/30' : ''} ${derived ? 'border-dashed border-indigo-300' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm">{n.title}</span>
          <PB p={n.priority} />
          {derived ? <Badge variant="outline" className="text-indigo-600 border-indigo-300 gap-1 text-[10px]"><Zap className="w-3 h-3" /> لحظي — محسوب من البيانات</Badge> : <Badge className={(MYST[n.my_status] || [])[1] || ''}>{(MYST[n.my_status] || [n.my_status])[0]}</Badge>}
          {n.is_failed && <Badge className="bg-rose-100 text-rose-700">فشل الحفظ: {n.delivery_error || ''}</Badge>}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">{n.body}</div>
        <div className="text-[10px] text-slate-400 mt-1">
          {n.type_label || n.type} · {dtt(n.created_at)}{n.read_at ? ` · قرئته: ${dtt(n.read_at)}` : ''}{n.handled_by ? ` · عالجه: ${n.handled_by}` : ''}{n.ref_id ? ` · مرجع: ${String(n.ref_id).slice(0, 8)}` : ''}
        </div>
      </div>
      <div className="flex gap-1 shrink-0 flex-wrap justify-end">
        {n.link?.section && <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => goLink(n)}>فتح السجل ←</Button>}
        {!derived && n.my_status === 'new' && <Button size="sm" variant="outline" className="h-7 px-2" title="تعليم كمقروء" onClick={() => act(n.id, 'read')}><Check className="w-3 h-3" /></Button>}
        {!derived && n.needs_action && !n.handled_at && <Button size="sm" variant="outline" className="h-7 px-2 text-emerald-700" title="تمت المعالجة" onClick={() => act(n.id, 'handled')}><CheckCheck className="w-3 h-3" /></Button>}
        {!derived && n.my_status !== 'archived' && <Button size="sm" variant="outline" className="h-7 px-2" title="أرشفة (لا تحذف السجل الأصلي)" onClick={() => act(n.id, 'archive')}><Archive className="w-3 h-3" /></Button>}
        {!derived && n.my_status === 'archived' && <Button size="sm" variant="outline" className="h-7 px-2" title="إلغاء الأرشفة" onClick={() => act(n.id, 'unarchive')}><ArchiveRestore className="w-3 h-3" /></Button>}
      </div>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${tab === k ? 'bg-blue-600 text-white shadow' : 'bg-white border text-slate-600'}`}>{l}</button>
        ))}
        <div className="mr-auto flex gap-2 items-center">
          <Badge variant="outline" className="gap-1 text-[10px]"><Lock className="w-3 h-3" /> القناة: In-App فقط — SMS/Push/Email غير منفذة</Badge>
          {tab !== 'settings' && <Button size="sm" variant="outline" onClick={load} className="gap-1 h-8"><RefreshCw className="w-3 h-3" /></Button>}
          {['inbox', 'unread'].includes(tab) && (c.unread || 0) > 0 && <Button size="sm" variant="outline" className="gap-1 h-8 text-[11px]" onClick={async () => { await api('/admin/notify/read-all', { method: 'POST', body: {} }); load() }}><CheckCheck className="w-3 h-3" /> قراءة الكل</Button>}
        </div>
      </div>

      {tab !== 'settings' && (
        <>
          {/* filters */}
          <Card><CardContent className="pt-4 flex flex-wrap items-center gap-2">
            <Select value={f.priority || 'all'} onValueChange={x => { const nf = { ...f, priority: x === 'all' ? '' : x }; setF(nf) }}>
              <SelectTrigger className="w-36 bg-white h-9 text-xs"><SelectValue placeholder="الأولوية" /></SelectTrigger>
              <SelectContent><SelectItem value="all">الأولوية — الكل</SelectItem>{Object.entries(PRI).map(([k, [l]]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} onKeyDown={e => e.key === 'Enter' && load()} placeholder="بحث بالعنوان/النص..." className="w-52 h-9 bg-white text-xs" />
            <Button size="sm" onClick={load} className="bg-blue-600 hover:bg-blue-700 gap-1"><RefreshCw className="w-3.5 h-3.5" /> تطبيق</Button>
          </CardContent></Card>
          {/* derived live feed */}
          {feed && tab === 'inbox' && feed.derived.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-extrabold text-indigo-700">⚡ تنبيهات لحظية (محسوبة من البيانات الحقيقية — تختفي عند المعالجة)</div>
              {feed.derived.map((n, i) => <NotifRow key={`d${i}`} n={n} derived />)}
            </div>
          )}
          {/* stored */}
          <div className="space-y-1.5">
            {feed === null ? <div className="py-10 text-center text-slate-400">جارِ التحميل...</div>
              : feed.stored.length === 0 ? <Card><CardContent className="py-10 text-center text-slate-400 text-sm"><Bell className="w-8 h-8 mx-auto mb-2 opacity-40" /> لا إشعارات مخزنة في هذا المجلد</CardContent></Card>
                : feed.stored.map(n => <NotifRow key={n.id} n={n} />)}
          </div>
        </>
      )}

      {tab === 'settings' && (
        <Card><CardContent className="pt-4 space-y-3">
          <div className="text-[11px] text-blue-900 bg-blue-50 border border-blue-200 rounded-md p-2">ℹ️ {catalogNote}</div>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-slate-50">
                <TableHead className="text-right">النوع</TableHead><TableHead className="text-right">المصدر / الربط</TableHead>
                <TableHead className="text-right">مفعّل</TableHead><TableHead className="text-right">الأولوية</TableHead>
                <TableHead className="text-right">يحتاج إجراء</TableHead><TableHead className="text-right">الاحتفاظ</TableHead>
                <TableHead className="text-right">منع التكرار</TableHead><TableHead className="text-right">المستلمون</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {settings === null ? <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-400">جارِ التحميل...</TableCell></TableRow>
                  : settings.map(s => (
                    <TableRow key={s.type} className={s.enabled ? '' : 'opacity-50'}>
                      <TableCell><div className="text-xs font-bold">{s.label}</div><div className="text-[9px] text-slate-400 font-mono">{s.type}</div></TableCell>
                      <TableCell><div className="text-[10px] text-slate-500 max-w-[200px]">{s.source}</div>{s.wired === true ? <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">مربوط (يُخزّن)</Badge> : s.wired === 'derived' ? <Badge className="bg-indigo-100 text-indigo-700 text-[9px]">لحظي (محسوب)</Badge> : <Badge className="bg-rose-100 text-rose-700 text-[9px]">غير مربوط — قرار</Badge>}</TableCell>
                      <TableCell>{s.enabled ? '✅' : '—'}</TableCell>
                      <TableCell><PB p={s.default_priority} /></TableCell>
                      <TableCell>{s.needs_action ? '⚠️ نعم' : '—'}</TableCell>
                      <TableCell className="text-xs">{s.retention_days} يوم</TableCell>
                      <TableCell>{s.dedupe ? '✅' : '—'}</TableCell>
                      <TableCell className="text-[10px]">السوبر أدمن</TableCell>
                      <TableCell><Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => setDlg(s)}><Settings className="w-3 h-3" /> تعديل</Button></TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent></Card>
      )}

      {dlg && <SettingDialog s={dlg} onClose={() => setDlg(null)} onSaved={loadSettings} />}
    </div>
  )
}

export default AdminNotifyCenter
