'use client'
import React, { useEffect, useState, Suspense } from 'react'
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

// v3.9.12 — Wrap in Suspense for Next.js 15 requirement with useSearchParams
export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-emerald-50"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>}>
      <SignupPageInner />
    </Suspense>
  )
}

function SignupPageInner() {
  const params = useSearchParams()
  const router = useRouter()
  const [ref, setRef] = useState('')
  const [form, setForm] = useState({ name: '', owner_name: '', owner_email: '', owner_phone: '', owner_password: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const r = params.get('ref')
    if (r) setRef(r.toUpperCase())
  }, [params])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name || !form.owner_email || !form.owner_password || !form.owner_name || !form.owner_phone) {
      return toast.error('الرجاء إكمال جميع الحقول (بما فيها رقم الهاتف)')
    }
    // v3.9.18 — Phone must be international format with 7-15 digits
    const cleanPhone = form.owner_phone.replace(/[\s-]/g, '')
    if (!/^\+?[0-9]{7,15}$/.test(cleanPhone)) return toast.error('رقم الهاتف غير صالح — أدخل رمز الدولة والرقم (مثال: +967771234567)')
    if (form.owner_password.length < 6) return toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
    try {
      setSaving(true)
      const body = { ...form, owner_phone: cleanPhone, referral_code: ref || undefined }
      const r = await apiPost('/public/signup', body)
      toast.success('🎉 تم إنشاء حسابك بنجاح!' + (r.referral_applied ? ' • تم منح المُحيل +15 قيد مجاني' : ''))
      setTimeout(() => { window.location.href = '/' }, 1200)
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-bl from-[#0f1e4d] via-blue-50 to-orange-50 flex flex-col items-center justify-center p-4" dir="rtl">
      <Toaster position="top-center" richColors />
      <div className="max-w-4xl w-full grid md:grid-cols-2 gap-6">
        {/* Left: benefits */}
        <div className="p-8 space-y-6 bg-white/70 backdrop-blur rounded-2xl border border-blue-100">
          <div className="flex items-center gap-3">
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1e3a8a] via-[#1e40af] to-[#0f1e4d] flex items-center justify-center shadow-2xl border border-orange-400/40">
              <svg viewBox="0 0 64 64" fill="none" className="w-10 h-10">
                <path d="M8 40 L28 36 L40 20 L50 20 L44 34 L54 32 L58 40 L44 42 L38 50 L30 50 L34 42 L14 44 Z" fill="#f97316" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round"/>
                <circle cx="52" cy="16" r="3" fill="#f97316" />
              </svg>
              <div className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-[#f97316] border-2 border-white shadow" />
            </div>
            <div>
              <div className="text-3xl font-extrabold text-[#1e3a8a]">رحّـــال</div>
              <div className="text-sm font-black text-[#f97316] tracking-widest" style={{ letterSpacing: '0.15em' }}>RAHAL ERP</div>
              <div className="text-[11px] text-slate-500 mt-0.5">نظام إدارة مكاتب السفريات</div>
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
              <div className="text-xs text-amber-700">ستحصل على 30 قيد يومية مجانية، وسيحصل صاحب رابط الدعوة على +50 قيد إضافي عند إتمام تسجيلك.</div>
            </div>
          )}
          <div className="space-y-2">
            {[
              '30 قيد عند التسجيل + 50 قيد إضافي عند دعوة أي مكتب آخر',
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
                <label className="text-xs text-slate-600 mb-1 block">📱 رقم الهاتف / الواتساب <span className="text-rose-600">*</span> <span className="text-slate-400">(مع رمز الدولة)</span></label>
                <Input dir="ltr" type="tel" value={form.owner_phone} onChange={e => setForm({ ...form, owner_phone: e.target.value })} placeholder="+967771234567" required />
                <div className="text-[10px] text-slate-500 mt-1">أدخل رمز الدولة والرقم (بدون مسافات). سيُستخدم للتواصل والدعم عبر الواتساب.</div>
              </div>
              <div>
                <label className="text-xs text-slate-600 mb-1 block">كلمة المرور * (6 أحرف فأكثر)</label>
                <Input dir="ltr" type="password" value={form.owner_password} onChange={e => setForm({ ...form, owner_password: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-600 mb-1 block">رمز الإحالة (اختياري)</label>
                <Input dir="ltr" value={ref} onChange={e => setRef(e.target.value.toUpperCase())} placeholder="ABCD1234" />
              </div>
              <Button type="submit" disabled={saving} className="w-full bg-gradient-to-l from-[#1e3a8a] to-[#f97316] hover:opacity-90 text-white gap-2 text-lg py-5 shadow-lg">
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <>🚀 ابدأ الآن مجاناً</>}
              </Button>
              <div className="text-center text-xs text-slate-500">لديك حساب بالفعل؟ <a href="/" className="text-[#1e3a8a] font-bold hover:text-[#f97316]">سجّل الدخول</a></div>
            </form>
          </CardContent>
        </Card>
      </div>
      {/* Footer with contact info + Target Media badge */}
      <div className="mt-6 text-center text-xs text-slate-600 space-y-2 max-w-4xl">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span>📍 اليمن - عدن - الشيخ عثمان - بجانب بنك التضامن</span>
          <span className="text-slate-300">·</span>
          <span dir="ltr">📞 +967 781 115 482</span>
          <span className="text-slate-300">·</span>
          <span dir="ltr">📞 +967 781 455 584</span>
        </div>
        <div className="flex items-center justify-center gap-2 pt-2">
          <span className="text-[11px] text-slate-500">Powered by</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#1e3a8a" strokeWidth="2.5" />
            <circle cx="12" cy="12" r="5" fill="#f97316" />
            <circle cx="12" cy="12" r="1.5" fill="#fff" />
          </svg>
          <span className="text-xs font-black text-[#1e3a8a]">Target Media</span>
          <span className="text-[10px] text-slate-500">· تارجت ميديا</span>
          <span className="text-slate-500">© 2025</span>
        </div>
      </div>
    </div>
  )
}
