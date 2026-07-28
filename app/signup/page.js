'use client'
import React, { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast, Toaster } from 'sonner'
import { Loader2, Gift, Plane, CheckCircle2 } from 'lucide-react'

async function apiPost(path, body) {
  const res = await fetch(`/api${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'include', body: JSON.stringify(body),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(j.error || 'حدث خطأ')
  return j
}

export default function SignupPage() {
  const params = useSearchParams()
  const router = useRouter()
  const [ref, setRef] = useState('')
  const [form, setForm] = useState({ name: '', owner_name: '', owner_email: '', owner_password: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const r = params.get('ref')
    if (r) setRef(r.toUpperCase())
  }, [params])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name || !form.owner_email || !form.owner_password || !form.owner_name) {
      return toast.error('الرجاء إكمال جميع الحقول')
    }
    if (form.owner_password.length < 6) return toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
    try {
      setSaving(true)
      const body = { ...form, referral_code: ref || undefined }
      const r = await apiPost('/public/signup', body)
      toast.success('🎉 تم إنشاء حسابك بنجاح!' + (r.referral_applied ? ' • تم منح المُحيل +15 قيد مجاني' : ''))
      // Use hard navigation to ensure the auth cookie is applied on server-rendered request
      setTimeout(() => { window.location.href = '/' }, 1200)
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-bl from-emerald-50 via-blue-50 to-white flex items-center justify-center p-4" dir="rtl">
      <Toaster position="top-center" richColors />
      <div className="max-w-4xl w-full grid md:grid-cols-2 gap-6">
        {/* Left: benefits */}
        <div className="p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-l from-emerald-500 to-blue-500 flex items-center justify-center shadow-xl">
              <Plane className="w-7 h-7 text-white -rotate-45" />
            </div>
            <div>
              <div className="text-3xl font-extrabold text-slate-800">رحّال</div>
              <div className="text-sm text-slate-500">نظام إدارة مكاتب السفريات — Rahaal ERP</div>
            </div>
          </div>
          <div className="text-slate-600 text-sm">
            نظام محاسبي متكامل مصمم خصيصاً لمكاتب السياحة والسفريات في الجزيرة العربية.
          </div>
          {ref && (
            <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-300">
              <div className="flex items-center gap-2 text-amber-800 font-bold mb-1">
                <Gift className="w-5 h-5" /> تمّت دعوتك عبر رمز إحالة: <code className="font-mono text-amber-700 mx-1">{ref}</code>
              </div>
              <div className="text-xs text-amber-700">ستحصل على 500 قيد يومية مجانية، وسيحصل صاحب رابط الدعوة على +15 قيد إضافي عند إتمام تسجيلك.</div>
            </div>
          )}
          <div className="space-y-2">
            {[
              '500 قيد يومي مجاناً في الفترة التجريبية',
              'محاسبة متعددة العملات (YER / USD / SAR)',
              'إدارة تذاكر الطيران والتأشيرات',
              'صرافة العملات مع حساب فروق الصرف تلقائياً',
              'تقارير مالية شاملة + طباعة سندات باسم مكتبك',
              'استيراد Excel جماعي مع كشف الأخطاء وإصلاح تلقائي',
            ].map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: form */}
        <Card className="shadow-2xl">
          <CardHeader>
            <CardTitle className="text-2xl">إنشاء حساب مكتبك</CardTitle>
            <CardDescription>ابدأ فترة تجريبية مجانية الآن — لا يتطلب بطاقة ائتمان</CardDescription>
            {ref && <Badge className="w-fit bg-emerald-100 text-emerald-700 hover:bg-emerald-100">🎁 مكافأة إحالة نشطة: {ref}</Badge>}
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="text-xs text-slate-600 mb-1 block">اسم المكتب التجاري *</label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مكتب النور للسفريات" />
              </div>
              <div>
                <label className="text-xs text-slate-600 mb-1 block">اسم المالك الكامل *</label>
                <Input value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} placeholder="أحمد محمد الأنور" />
              </div>
              <div>
                <label className="text-xs text-slate-600 mb-1 block">البريد الإلكتروني *</label>
                <Input dir="ltr" type="email" value={form.owner_email} onChange={e => setForm({ ...form, owner_email: e.target.value })} placeholder="you@office.com" />
              </div>
              <div>
                <label className="text-xs text-slate-600 mb-1 block">كلمة المرور * (6 أحرف فأكثر)</label>
                <Input dir="ltr" type="password" value={form.owner_password} onChange={e => setForm({ ...form, owner_password: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-600 mb-1 block">رمز الإحالة (اختياري)</label>
                <Input dir="ltr" value={ref} onChange={e => setRef(e.target.value.toUpperCase())} placeholder="ABCD1234" />
              </div>
              <Button type="submit" disabled={saving} className="w-full grad-brand text-white gap-2 text-lg py-5">
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <>🚀 ابدأ الآن مجاناً</>}
              </Button>
              <div className="text-center text-xs text-slate-500">لديك حساب بالفعل؟ <a href="/" className="text-blue-600 font-bold">سجّل الدخول</a></div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
