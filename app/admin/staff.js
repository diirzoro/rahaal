'use client'
// ============================================================================
// v3.97 — RAHAAL ADMIN STAFF & ROLES UI (Batch 5). Management of the top-
// management realm: admin staff accounts (role=admin_staff, NO tenant),
// admin roles (built-in templates immutable + custom roles), per-user
// overrides, effective permissions preview, activate/disable (disable
// terminates sessions), full audit trail. NO real user is created here
// automatically — this is the management FUNCTION only.
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
import { RefreshCw, Plus, Pencil, Power, ShieldCheck, Eye, UserCog, Crown } from 'lucide-react'
import { api } from '../shared'

const dtt = (v) => (v ? new Date(v).toLocaleString('ar-EG') : '—')
const fld = (l, node) => <div><div className="text-xs font-bold text-slate-500 mb-1">{l}</div>{node}</div>
const ACT_LABELS = { view: 'عرض', create: 'إنشاء', edit: 'تعديل', approve: 'اعتماد', reject: 'رفض', activate: 'تفعيل', disable: 'تعطيل', export: 'تصدير', download: 'تنزيل', manage: 'إدارة', move: 'نقل' }

// perms matrix editor: value = {section: [actions]}
const PermsMatrix = ({ sections, value, onChange, readOnly = false }) => (
  <div className="max-h-72 overflow-y-auto border rounded-lg">
    <table className="w-full text-xs">
      <tbody>{sections.map(s => (
        <tr key={s.key} className="border-b">
          <td className="p-2 font-bold whitespace-nowrap">{s.label}</td>
          <td className="p-2"><div className="flex gap-2 flex-wrap">
            {s.actions.map(a => {
              const on = (value[s.key] || []).includes(a)
              return <label key={a} className={`flex items-center gap-1 ${readOnly ? '' : 'cursor-pointer'}`}>
                <input type="checkbox" disabled={readOnly} checked={on} onChange={e => {
                  const cur = value[s.key] || []
                  onChange({ ...value, [s.key]: e.target.checked ? [...cur, a] : cur.filter(x => x !== a) })
                }} />{ACT_LABELS[a] || a}</label>
            })}
          </div></td>
        </tr>
      ))}</tbody>
    </table>
  </div>
)

const RoleDialog = ({ sections, role, onClose, onDone }) => {
  const [v, setV] = useState({ label: role?.label || '', desc: role?.desc || '', reason: '' })
  const [perms, setPerms] = useState(role?.perms || {})
  const save = async () => {
    if (!v.label.trim() || !v.reason.trim()) return toast.error('الاسم والسبب إلزاميان')
    try {
      if (role) await api(`/admin/staff/roles/${role.key}`, { method: 'PUT', body: { ...v, perms } })
      else await api('/admin/staff/roles', { method: 'POST', body: { ...v, perms } })
      toast.success('تم'); onDone()
    } catch (e) { toast.error(e.message) }
  }
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
      <DialogHeader><DialogTitle>{role ? `✏️ ${role.label}` : '➕ دور إداري مخصص'}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {fld('اسم الدور *', <Input value={v.label} onChange={e => setV({ ...v, label: e.target.value })} />)}
          {fld('الوصف', <Input value={v.desc} onChange={e => setV({ ...v, desc: e.target.value })} />)}
        </div>
        {fld('الأقسام والإجراءات (لا تعطِ صلاحية شاملة لمهمة تحتاج عرضاً فقط)', <PermsMatrix sections={sections} value={perms} onChange={setPerms} />)}
        {fld('السبب * (Audit)', <Textarea rows={2} value={v.reason} onChange={e => setV({ ...v, reason: e.target.value })} />)}
        <Button onClick={save} className="w-full">حفظ</Button>
      </div>
    </DialogContent></Dialog>
  )
}

const StaffDialog = ({ roles, onClose, onDone }) => {
  const [v, setV] = useState({ name: '', email: '', password: '', admin_role_key: '', reason: '' })
  const save = async () => {
    if (!v.name || !v.email || !v.password || !v.reason) return toast.error('كل الحقول والسبب إلزامية')
    try { await api('/admin/staff/users', { method: 'POST', body: v }); toast.success('أُضيف المدير'); onDone() } catch (e) { toast.error(e.message) }
  }
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-md" dir="rtl">
      <DialogHeader><DialogTitle>➕ إضافة مدير / موظف إدارة رحّال</DialogTitle></DialogHeader>
      <div className="space-y-3">
        {fld('الاسم *', <Input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} />)}
        {fld('البريد *', <Input dir="ltr" value={v.email} onChange={e => setV({ ...v, email: e.target.value })} />)}
        {fld('كلمة المرور * (6+ أحرف)', <Input dir="ltr" type="password" value={v.password} onChange={e => setV({ ...v, password: e.target.value })} />)}
        {fld('الدور الإداري', <Select value={v.admin_role_key} onValueChange={c => setV({ ...v, admin_role_key: c })}><SelectTrigger><SelectValue placeholder="بلا دور (يحدد لاحقاً)" /></SelectTrigger><SelectContent>{roles.filter(r => r.active !== false).map(r => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}</SelectContent></Select>)}
        {fld('السبب * (Audit)', <Input value={v.reason} onChange={e => setV({ ...v, reason: e.target.value })} />)}
        <div className="text-[11px] text-slate-500">الحساب يُنشأ في نطاق الإدارة العليا فقط (بلا مكتب) — لا يستطيع مستخدم مكتب منح هذا الدور. لا يحصل الموظف على كل الصلاحيات تلقائياً</div>
        <Button onClick={save} className="w-full">إضافة</Button>
      </div>
    </DialogContent></Dialog>
  )
}

const OverridesDialog = ({ sections, user, onClose, onDone }) => {
  const [ov, setOv] = useState({ ...(user.admin_overrides || {}) })
  const [reason, setReason] = useState('')
  const save = async () => {
    if (!reason.trim()) return toast.error('السبب إلزامي')
    try { await api(`/admin/staff/users/${user.id}`, { method: 'PATCH', body: { action: 'overrides', overrides: ov, reason } }); toast.success('تم'); onDone() } catch (e) { toast.error(e.message) }
  }
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
      <DialogHeader><DialogTitle>⚙️ Overrides — {user.name}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="text-[11px] text-slate-500">منح (✓) أو منع (✗) إجراء بعينه فوق الدور المسند — اترك بلا تحديد للوراثة من الدور</div>
        <div className="max-h-72 overflow-y-auto border rounded-lg"><table className="w-full text-xs"><tbody>
          {sections.map(s => (
            <tr key={s.key} className="border-b"><td className="p-2 font-bold whitespace-nowrap">{s.label}</td>
              <td className="p-2"><div className="flex gap-2 flex-wrap">{s.actions.map(a => {
                const k = `${s.key}.${a}`
                const state = ov[k] === true ? 'allow' : ov[k] === false ? 'deny' : 'inherit'
                return <button key={a} onClick={() => setOv(o => { const n = { ...o }; if (state === 'inherit') n[k] = true; else if (state === 'allow') n[k] = false; else delete n[k]; return n })}
                  className={`px-2 py-0.5 rounded border text-[11px] ${state === 'allow' ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : state === 'deny' ? 'bg-red-100 border-red-300 text-red-700' : 'bg-white text-slate-500'}`}>
                  {ACT_LABELS[a] || a} {state === 'allow' ? '✓' : state === 'deny' ? '✗' : ''}</button>
              })}</div></td></tr>
          ))}
        </tbody></table></div>
        {fld('السبب * (Audit)', <Input value={reason} onChange={e => setReason(e.target.value)} />)}
        <Button onClick={save} className="w-full">حفظ الـOverrides</Button>
      </div>
    </DialogContent></Dialog>
  )
}

const AdminStaffCenter = () => {
  const [perms, setPerms] = useState(null)
  const [tab, setTab] = useState('users')
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [sections, setSections] = useState([])
  const [audit, setAudit] = useState([])
  const [dlg, setDlg] = useState(null)
  const [preview, setPreview] = useState(null)
  const can = (a) => perms?.all || (perms?.perms?.staff || []).includes(a)

  const load = () => {
    api('/admin/staff/users').then(r => setUsers(r.users || [])).catch(e => toast.error(e.message))
    api('/admin/staff/roles').then(r => setRoles(r.roles || [])).catch(() => {})
    api('/admin/staff/catalog').then(r => setSections(r.sections || [])).catch(() => {})
  }
  useEffect(() => { api('/admin/staff/me').then(setPerms).catch(() => setPerms({ all: true })); load() }, [])
  useEffect(() => { if (tab === 'audit') api('/admin/staff/audit').then(r => setAudit(r.rows || [])).catch(() => {}) }, [tab])

  const patch = async (u, action, extra = {}) => {
    const reason = prompt('السبب (إلزامي):')
    if (!reason) return
    try { const r = await api(`/admin/staff/users/${u.id}`, { method: 'PATCH', body: { action, reason, ...extra } }); toast.success(action === 'disable' ? `عُطل — أُنهيت ${r.sessions_terminated} جلسة` : 'تم'); load() } catch (e) { toast.error(e.message) }
  }
  const showPreview = async (u) => { try { setPreview(await api(`/admin/staff/users/${u.id}/preview`)) } catch (e) { toast.error(e.message) } }

  const TABS = [['users', '👥 المديرون'], ['roles', '🎭 الأدوار الإدارية'], ['audit', '📜 التدقيق']]
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-lg text-sm font-bold border ${tab === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>{l}</button>)}</div>
        <div className="flex gap-2"><Button size="sm" variant="outline" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          {tab === 'users' && can('create') && <Button size="sm" onClick={() => setDlg({ type: 'staff' })}><Plus className="w-4 h-4 ml-1" />إضافة مدير</Button>}
          {tab === 'roles' && can('manage') && <Button size="sm" onClick={() => setDlg({ type: 'role' })}><Plus className="w-4 h-4 ml-1" />دور مخصص</Button>}</div>
      </div>
      <div className="text-[11px] text-slate-600 bg-blue-50 border border-blue-100 rounded-lg p-2"><ShieldCheck className="w-3.5 h-3.5 inline ml-1" />هذه اللوحة لنطاق الإدارة العليا حصراً — مستخدمو المكاتب والعملاء والموردون مرفوضون من الخادم (403) حتى مع رابط مباشر أو استدعاء API. كل مدير يرى فقط الأقسام والإجراءات الموكلة إليه</div>

      {tab === 'users' && <Card><CardContent className="p-4">
        <Table><TableHeader><TableRow><TableHead className="text-right">المدير</TableHead><TableHead className="text-right">النوع</TableHead><TableHead className="text-right">الدور</TableHead><TableHead className="text-right">Overrides</TableHead><TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">أضافه</TableHead><TableHead className="text-right">إجراءات</TableHead></TableRow></TableHeader>
          <TableBody>{users.map(u => (
            <TableRow key={u.id} className={u.active ? '' : 'opacity-50'}>
              <TableCell className="font-bold">{u.name}<div className="text-[10px] text-slate-500" dir="ltr">{u.email}</div></TableCell>
              <TableCell>{u.is_main ? <Badge className="bg-amber-100 text-amber-800"><Crown className="w-3 h-3 ml-1" />المشرف الرئيسي</Badge> : <Badge variant="outline"><UserCog className="w-3 h-3 ml-1" />موظف إدارة</Badge>}</TableCell>
              <TableCell className="text-xs">{u.is_main ? 'كل الصلاحيات (بالتصميم)' : roles.find(r => r.key === u.admin_role_key)?.label || <span className="text-slate-400">بلا دور</span>}</TableCell>
              <TableCell>{Object.keys(u.admin_overrides || {}).length || '—'}</TableCell>
              <TableCell><Badge className={u.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>{u.active ? 'نشط' : 'معطل'}</Badge></TableCell>
              <TableCell className="text-[10px]">{u.created_by || '—'}</TableCell>
              <TableCell><div className="flex gap-1">
                <Button size="sm" variant="ghost" title="معاينة الصلاحيات الفعالة" onClick={() => showPreview(u)}><Eye className="w-3.5 h-3.5" /></Button>
                {!u.is_main && can('edit') && <Button size="sm" variant="ghost" title="إسناد دور" onClick={() => { const rk = prompt(`مفتاح الدور (${roles.map(r => r.key).join(' / ')}):`, u.admin_role_key || ''); if (rk === null) return; patch(u, 'assign_role', { admin_role_key: rk || null }) }}><Pencil className="w-3.5 h-3.5" /></Button>}
                {!u.is_main && can('manage') && <Button size="sm" variant="ghost" title="Overrides" onClick={() => setDlg({ type: 'overrides', user: u })}><ShieldCheck className="w-3.5 h-3.5" /></Button>}
                {!u.is_main && (can('activate') || can('disable')) && <Button size="sm" variant="ghost" title={u.active ? 'تعطيل (ينهي الجلسات)' : 'تفعيل'} onClick={() => patch(u, u.active ? 'disable' : 'activate')}><Power className="w-3.5 h-3.5" /></Button>}
              </div></TableCell>
            </TableRow>))}
            {!users.length && <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">لا مستخدمين في نطاق الإدارة</TableCell></TableRow>}
          </TableBody></Table>
        <div className="text-[11px] text-slate-500 border-t pt-2 mt-2">تعطيل الحساب يُنهي جلساته فوراً (مدعوم) · كل التغييرات بسبب إلزامي وتسجل في Audit · لا يُضاف أي مستخدم تلقائياً — الإضافة قرار بشري من هنا فقط</div>
      </CardContent></Card>}

      {tab === 'roles' && <Card><CardContent className="p-4">
        <Table><TableHeader><TableRow><TableHead className="text-right">الدور</TableHead><TableHead className="text-right">النوع</TableHead><TableHead className="text-right">الأقسام</TableHead><TableHead className="text-right">مسند إلى</TableHead><TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">—</TableHead></TableRow></TableHeader>
          <TableBody>{roles.map(r => (
            <TableRow key={r.key}>
              <TableCell className="font-bold">{r.label}<div className="text-[10px] text-slate-500">{r.desc}</div></TableCell>
              <TableCell>{r.built_in ? <Badge variant="outline">مدمج — غير قابل للتعديل</Badge> : <Badge className="bg-blue-100 text-blue-700">مخصص</Badge>}</TableCell>
              <TableCell className="text-xs">{Object.keys(r.perms || {}).length} قسم</TableCell>
              <TableCell><Badge variant="outline">{r.assigned_count}</Badge></TableCell>
              <TableCell><Badge className={r.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200'}>{r.active !== false ? 'نشط' : 'معطل'}</Badge></TableCell>
              <TableCell>{!r.built_in && can('manage') && <Button size="sm" variant="ghost" onClick={() => setDlg({ type: 'role', role: r })}><Pencil className="w-3.5 h-3.5" /></Button>}</TableCell>
            </TableRow>))}
          </TableBody></Table>
      </CardContent></Card>}

      {tab === 'audit' && <Card><CardContent className="p-4">
        <Table><TableHeader><TableRow><TableHead className="text-right">الوقت</TableHead><TableHead className="text-right">المنفذ</TableHead><TableHead className="text-right">الإجراء</TableHead><TableHead className="text-right">الهدف</TableHead><TableHead className="text-right">السبب</TableHead></TableRow></TableHeader>
          <TableBody>{audit.map(a => (
            <TableRow key={a.id}><TableCell className="text-xs">{dtt(a.at)}</TableCell><TableCell className="text-xs" dir="ltr">{a.actor_email}</TableCell>
              <TableCell><Badge variant="outline">{a.action}</Badge></TableCell><TableCell className="text-xs">{a.target?.email || a.target?.label || a.target?.key || '—'}</TableCell>
              <TableCell className="text-xs">{a.reason || '—'}</TableCell></TableRow>))}
            {!audit.length && <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-6">لا سجلات بعد</TableCell></TableRow>}
          </TableBody></Table>
      </CardContent></Card>}

      {dlg?.type === 'staff' && <StaffDialog roles={roles} onClose={() => setDlg(null)} onDone={() => { setDlg(null); load() }} />}
      {dlg?.type === 'role' && <RoleDialog sections={sections} role={dlg.role} onClose={() => setDlg(null)} onDone={() => { setDlg(null); load() }} />}
      {dlg?.type === 'overrides' && <OverridesDialog sections={sections} user={dlg.user} onClose={() => setDlg(null)} onDone={() => { setDlg(null); load() }} />}
      {preview && (
        <Dialog open onOpenChange={() => setPreview(null)}><DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>👁️ الصلاحيات الفعالة — {preview.user?.name}</DialogTitle></DialogHeader>
          {preview.effective?.all ? <div className="text-sm bg-amber-50 rounded p-3">المشرف الرئيسي — كل الصلاحيات بالتصميم</div>
            : <PermsMatrix sections={preview.sections || []} value={preview.effective?.perms || {}} onChange={() => {}} readOnly />}
          <div className="text-[11px] text-slate-500">المصدر: الدور المسند ({preview.effective?.role_label || 'بلا'}) + الـOverrides الفردية</div>
        </DialogContent></Dialog>
      )}
    </div>
  )
}

export default AdminStaffCenter
