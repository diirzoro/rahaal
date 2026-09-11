'use client'
// ============================================================================
// v3.95 — ADMIN SYSTEM HEALTH (Batch 3) — READ-ONLY, real sources only.
// «غير معروف» means no metric source exists — never shown as healthy.
// Display only: no health tests or failure scenarios are executed.
// ============================================================================
import React, { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { RefreshCw, Activity, AlertTriangle, ShieldAlert } from 'lucide-react'
import { api } from '../shared'

const dtt = (v) => (v ? new Date(v).toLocaleString('ar-EG') : '—')
const STC = {
  ok: ['سليم', 'bg-emerald-100 text-emerald-700', 'border-emerald-200'],
  warn: ['تحذير', 'bg-amber-100 text-amber-800', 'border-amber-300'],
  critical: ['حرج', 'bg-rose-100 text-rose-700', 'border-rose-300'],
  unknown: ['غير معروف', 'bg-slate-100 text-slate-500', 'border-slate-200'],
}

const AdminHealthCenter = () => {
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(false)
  const load = async () => {
    setLoading(true)
    try { setD(await api('/admin/audit/health')) } catch (e) { toast.error(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const [ol, oc] = STC[d?.overall] || STC.unknown
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-sm font-extrabold text-slate-700 flex items-center gap-1.5"><Activity className="w-4 h-4" /> صحة النظام</div>
        {d && <Badge className={oc}>الحالة العامة: {ol}</Badge>}
        {d && <span className="text-[10px] text-slate-400">آخر تحديث: {dtt(d.generated_at)} · البيئة: {d.environment}</span>}
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1 mr-auto"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> تحديث</Button>
      </div>

      {!d ? <div className="py-10 text-center text-slate-400">جارِ الفحص...</div> : (
        <>
          {/* alerts */}
          {d.alerts.length > 0 && (
            <Card className="border-rose-200"><CardContent className="pt-4 space-y-1.5">
              <div className="text-sm font-extrabold text-rose-700 flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" /> التنبيهات الصحية ({d.alerts.length})</div>
              {d.alerts.map((a, i) => (
                <div key={i} className={`flex items-start gap-2 text-xs rounded-md p-2 ${a.level === 'critical' ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {a.msg}
                </div>
              ))}
            </CardContent></Card>
          )}
          {/* checks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {d.checks.map(c => {
              const [l, badge, border] = STC[c.status] || STC.unknown
              return (
                <div key={c.key} className={`border rounded-lg p-3 bg-white ${border}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-extrabold text-slate-700">{c.label}</div>
                    <Badge className={badge}>{l}</Badge>
                  </div>
                  <div className="text-[11px] text-slate-500">{c.detail}</div>
                </div>
              )
            })}
          </div>
          <div className="text-[11px] text-slate-500 bg-slate-50 border rounded-md p-2">ℹ️ {d.note}</div>
        </>
      )}
    </div>
  )
}

export default AdminHealthCenter
