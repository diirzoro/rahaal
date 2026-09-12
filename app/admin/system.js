'use client'
// ============================================================================
// v3.95 — ADMIN SYSTEM MANAGEMENT (Batch 3): System Status, Environment &
// Version, Integrations, Maintenance-Mode config. Honest by design: unknown
// metrics show «غير معروف», secrets are shown as present/absent only,
// maintenance enforcement is NOT wired (decision point) — config + audit only.
// ============================================================================
import React, { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { RefreshCw, Settings2, Server, Globe, Plug, Hammer, ShieldAlert } from 'lucide-react'
import { api } from '../shared'

const dtt = (v) => (v ? new Date(v).toLocaleString('ar-EG') : '—')
const STC = { ok: ['سليم', 'bg-emerald-100 text-emerald-700'], warn: ['تحذير', 'bg-amber-100 text-amber-800'], critical: ['حرج', 'bg-rose-100 text-rose-700'], unknown: ['غير معروف', 'bg-slate-100 text-slate-500'] }
const SB = ({ s }) => { const [l, c] = STC[s] || [s || '—', 'bg-slate-100 text-slate-600']; return <Badge className={c}>{l}</Badge> }
const toLocal = (v) => { if (!v) return ''; const d = new Date(v); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }

const AdminSystemCenter = () => {
  const [tab, setTab] = useState('status')
  const [st, setSt] = useState(null)
  const [env, setEnv] = useState(null)
  const [integ, setInteg] = useState(null)
  const [maint, setMaint] = useState(null)
  const [mf, setMf] = useState({ enabled: false, message: '', reason_text: '', starts_at: '', ends_at: '', affected: '', reason: '', confirm_text: '' })

  const loadStatus = () => api('/admin/system/status').then(setSt).catch(e => toast.error(e.message))
  useEffect(() => { loadStatus() }, [])
  useEffect(() => {
    if (tab === 'env' && !env) api('/admin/system/environment').then(setEnv).catch(() => {})
    if (tab === 'integrations' && !integ) api('/admin/system/integrations').then(setInteg).catch(() => {})
    if (tab === 'maintenance') api('/admin/system/maintenance').then(d => { setMaint(d); const c = d.config || {}; setMf(f => ({ ...f, enabled: !!c.enabled, message: c.message || '', reason_text: c.reason_text || '', starts_at: toLocal(c.starts_at), ends_at: toLocal(c.ends_at), affected: c.affected || '' })) }).catch(() => {})
  }, [tab])

  const saveMaint = async (enable) => {
    if (!mf.reason.trim()) return toast.error('السبب إلزامي (Audit)')
    if (enable && mf.confirm_text.trim() !== 'تفعيل الصيانة') return toast.error('اكتب «تفعيل الصيانة» حرفياً للتأكيد')
    try {
      const r = await api('/admin/system/maintenance', { method: 'PUT', body: { ...mf, enabled: enable, starts_at: mf.starts_at ? new Date(mf.starts_at).toISOString() : null, ends_at: mf.ends_at ? new Date(mf.ends_at).toISOString() : null } })
      toast.success(r.pending ? r.note : (enable ? 'حُفظ الإعداد مُفعّلاً (الإنفاذ غير موصول — نقطة قرار)' : 'أُوقف إعداد الصيانة'))
      setTab('maintenance'); api('/admin/system/maintenance').then(setMaint)
      setMf(f => ({ ...f, reason: '', confirm_text: '' }))
    } catch (e) { toast.error(e.message) }
  }

  const SCard = ({ title, s, children }) => (
    <div className="border rounded-lg p-3 bg-white">
      <div className="flex items-center justify-between mb-1"><div className="text-xs font-extrabold text-slate-600">{title}</div><SB s={s} /></div>
      <div className="text-[11px] text-slate-500">{children}</div>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {[['status', '🖥️ حالة النظام', Server], ['env', '🌐 البيئة والإصدار', Globe], ['integrations', '🔌 التكاملات', Plug], ['maintenance', '🛠️ وضع الصيانة', Hammer]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-lg text-sm font-bold ${tab === k ? 'bg-blue-600 text-white shadow' : 'bg-white border text-slate-600'}`}>{l}</button>
        ))}
        {st && st.env === 'Live' && <Badge className="bg-rose-600 text-white mr-auto animate-pulse">⚠️ بيئة LIVE — تعامل بحذر</Badge>}
        {st && st.env !== 'Live' && <Badge variant="outline" className="mr-auto">البيئة: {st.env}</Badge>}
      </div>

      {tab === 'status' && (
        !st ? <div className="py-10 text-center text-slate-400">جارِ التحميل...</div> : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500">آخر تحديث: {dtt(st.checked_at)}</div>
              <Button size="sm" variant="outline" onClick={loadStatus} className="gap-1"><RefreshCw className="w-3.5 h-3.5" /> تحديث</Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <SCard title="قاعدة البيانات" s={st.database.status === 'ok' ? 'ok' : 'critical'}>{st.database.status === 'ok' ? `متصلة — ping ${st.database.ping_ms}ms` : st.database.error}</SCard>
              <SCard title="Backend" s="ok">{st.backend.note} · uptime {Math.floor(st.backend.uptime_sec / 60)} دقيقة</SCard>
              <SCard title="التخزين" s={st.storage.status}>{st.storage.status === 'ok' ? `بيانات ${st.storage.data_mb}MB · تخزين ${st.storage.storage_mb}MB · ${st.storage.objects} مستند · ${st.storage.collections} مجموعة` : st.storage.note}</SCard>
              <SCard title="آخر نسخة احتياطية" s={st.backup.status}>{st.backup.last_backup ? `${dtt(st.backup.last_backup.created_at)} — ${st.backup.last_backup.tenant_name || 'إعدادات'}` : st.backup.note}{st.backup.failed_count > 0 && <span className="text-rose-600 font-bold"> · {st.backup.failed_count} فشل</span>}</SCard>
              <SCard title="Jobs / Queue" s="unknown">{st.jobs.note}</SCard>
              <SCard title="وضع الصيانة (إعداد)" s={st.maintenance.enabled ? 'warn' : 'ok'}>{st.maintenance.enabled ? 'مُفعّل — الإنفاذ غير موصول (نقطة قرار)' : 'متوقف'}</SCard>
            </div>
          </div>
        )
      )}

      {tab === 'env' && (
        !env ? <div className="py-10 text-center text-slate-400">جارِ التحميل...</div> : (
          <div className="space-y-3 max-w-3xl">
            {env.is_live && <div className="bg-rose-600 text-white rounded-lg p-3 text-sm font-extrabold flex items-center gap-2"><ShieldAlert className="w-5 h-5" /> أنت على بيئة LIVE — أي إجراء حساس يمس بيانات حقيقية. تأكد قبل أي عملية تخص Test.</div>}
            <Card><CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div><div className="text-slate-400">البيئة</div><div className="font-extrabold text-lg">{env.env_name}</div><div className="text-[10px] text-slate-400">{env.env_source}</div></div>
              <div><div className="text-slate-400">النطاق</div><div className="font-bold font-mono" dir="ltr">{env.base_host || '—'}</div></div>
              <div><div className="text-slate-400">قاعدة البيانات (اسم فقط)</div><div className="font-bold font-mono" dir="ltr">{env.database.name}</div><div className="text-[10px] text-slate-400">{env.database.note}</div></div>
              <div><div className="text-slate-400">Build / Commit</div><div className="font-bold">{env.build.commit || '—'}</div><div className="text-[10px] text-slate-400">{env.build.note}</div></div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 space-y-2">
              <div className="text-sm font-extrabold text-slate-700">إصدارات النظام (كما هي في الكود)</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {Object.entries(env.versions).map(([k, v]) => (
                  <div key={k} className="border rounded-lg p-2 bg-slate-50"><div className="text-[10px] text-slate-500 font-mono">{k}</div><div className="font-extrabold">{v}</div></div>
                ))}
              </div>
              <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">{env.version_note}</div>
            </CardContent></Card>
          </div>
        )
      )}

      {tab === 'integrations' && (
        !integ ? <div className="py-10 text-center text-slate-400">جارِ التحميل...</div> : (
          <div className="space-y-3">
            {integ.rows.map((r, i) => (
              <Card key={i}><CardContent className="pt-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="font-extrabold text-sm">{r.name}</div>
                    <div className="text-[11px] text-slate-500">{r.kind} · النطاق: {r.scope === 'system' ? 'المنظومة' : 'لكل مكتب'} · البيئة: {r.environment}</div>
                  </div>
                  <SB s={r.status} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-[11px]">
                  <div className="border rounded-md p-2 bg-slate-50"><div className="text-slate-400">آخر اتصال ناجح</div><div className="font-bold">{dtt(r.last_ok_at)}</div></div>
                  <div className="border rounded-md p-2 bg-slate-50"><div className="text-slate-400">آخر خطأ</div><div className="font-bold">{r.last_error ? `${dtt(r.last_error.at)} — ${r.last_error.reason || ''}` : '—'}</div></div>
                  {r.errors_24h !== undefined && <div className="border rounded-md p-2 bg-slate-50"><div className="text-slate-400">أخطاء 24 ساعة</div><div className={`font-bold ${r.errors_24h > 5 ? 'text-rose-600' : ''}`}>{r.errors_24h}</div></div>}
                  {r.endpoint_safe && <div className="border rounded-md p-2 bg-slate-50"><div className="text-slate-400">Endpoint (آمن)</div><div className="font-bold font-mono" dir="ltr">{r.endpoint_safe}</div></div>}
                </div>
                {Object.keys(r.keys || {}).length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {Object.entries(r.keys).map(([k, present]) => (
                      <Badge key={k} variant="outline" className={`text-[10px] font-mono ${present ? 'text-emerald-700 border-emerald-300' : 'text-rose-700 border-rose-300'}`}>{k}: {present ? '✓ موجود' : '✗ غير مضبوط'}</Badge>
                    ))}
                  </div>
                )}
              </CardContent></Card>
            ))}
            <div className="text-[11px] text-slate-500 bg-slate-50 border rounded-md p-2">ℹ️ {integ.note}</div>
          </div>
        )
      )}

      {tab === 'maintenance' && (
        <Card><CardContent className="pt-4 space-y-3 max-w-2xl">
          <div className="flex items-center justify-between">
            <div className="text-sm font-extrabold text-slate-700">🛠️ وضع الصيانة (منفصل عن إشعار الصيانة في الإعلانات)</div>
            <Badge className={maint?.config?.enabled ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}>{maint?.config?.enabled ? 'الإعداد مُفعّل' : 'متوقف'}</Badge>
          </div>
          {maint?.enforcement_note && <div className="bg-amber-50 border border-amber-200 rounded-md p-2 text-[11px] text-amber-800">{maint.enforcement_note}</div>}
          {maint?.config?.enabled && (
            <div className="border rounded-lg p-3 text-xs space-y-1 bg-slate-50">
              <div>فُعّل بواسطة: <b dir="ltr">{maint.config.changed_by}</b> في {dtt(maint.config.changed_at)}</div>
              <div>الفترة: {dtt(maint.config.starts_at)} ← {dtt(maint.config.ends_at)} · المتأثر: {maint.config.affected || '—'}</div>
              <div>الرسالة: {maint.config.message || '—'}</div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="sm:col-span-2"><div className="text-xs font-bold text-slate-500 mb-1">الرسالة التي ستظهر للمستخدمين</div><Textarea value={mf.message} onChange={e => setMf({ ...mf, message: e.target.value })} rows={2} className="bg-white" /></div>
            <div><div className="text-xs font-bold text-slate-500 mb-1">سبب التفعيل (يُعرض)</div><Input value={mf.reason_text} onChange={e => setMf({ ...mf, reason_text: e.target.value })} className="bg-white" /></div>
            <div><div className="text-xs font-bold text-slate-500 mb-1">الجهات/الوحدات المتأثرة</div><Input value={mf.affected} onChange={e => setMf({ ...mf, affected: e.target.value })} className="bg-white" /></div>
            <div><div className="text-xs font-bold text-slate-500 mb-1">البداية</div><Input type="datetime-local" value={mf.starts_at} onChange={e => setMf({ ...mf, starts_at: e.target.value })} className="bg-white" /></div>
            <div><div className="text-xs font-bold text-slate-500 mb-1">النهاية</div><Input type="datetime-local" value={mf.ends_at} onChange={e => setMf({ ...mf, ends_at: e.target.value })} className="bg-white" /></div>
          </div>
          <div><div className="text-xs font-bold text-rose-600 mb-1">سبب التغيير * (Audit — إلزامي)</div><Textarea value={mf.reason} onChange={e => setMf({ ...mf, reason: e.target.value })} rows={2} className="bg-white" /></div>
          <div><div className="text-xs font-bold text-rose-600 mb-1">للتفعيل: اكتب «تفعيل الصيانة» حرفياً</div><Input value={mf.confirm_text} onChange={e => setMf({ ...mf, confirm_text: e.target.value })} className="bg-white w-56" /></div>
          <div className="flex gap-2">
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => saveMaint(true)}>🛠️ حفظ وتفعيل الإعداد</Button>
            <Button variant="outline" onClick={() => saveMaint(false)}>إيقاف / حفظ متوقفاً</Button>
          </div>
          <div className="text-[10px] text-slate-400">Maker–Checker: على بيئة Live وبوجود أكثر من سوبر أدمن، التفعيل يتطلب تأكيد أدمن آخر (مطبق من الخادم)</div>
        </CardContent></Card>
      )}
    </div>
  )
}

export default AdminSystemCenter
