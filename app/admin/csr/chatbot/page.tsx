'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, HelpCircle, ShieldCheck } from 'lucide-react';
import { getUnansweredChatbotQuestions } from '@/app/actions/manager-actions';
import { SkeletonTopBar, SkeletonSimpleRows } from '@/components/skeletons/DashboardSkeleton';
import type { UnansweredQuestionRow } from '@/lib/types';

// หน้า "คำถามที่บอทตอบไม่ได้" ของ CSR — ย้ายมาจาก manager hub ทั้งเนื้อหาและ logic
// (getUnansweredChatbotQuestions ใน manager-actions.ts ตัวเดิม เปลี่ยนแค่เกตสิทธิ์เป็น
// getManagerOrCsrSession ให้ CSR เรียกได้) ดีไซน์ตรงกับ tab เดิมที่เคยอยู่ใน
// staff-approvals?tab=chatbot ทุกจุด แค่ยกออกมาเป็นหน้าเดี่ยวพร้อม chrome แบบเดียวกับ
// Track & Trace ของ manager (app/admin/manager/tracking/page.tsx)
export default function CsrChatbotPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<UnansweredQuestionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const result = await getUnansweredChatbotQuestions();
      if (result.success) setQuestions(result.data || []);
      setIsLoading(false);
    }
    load();
  }, []);

  if (isLoading) return (
    <div className="min-h-screen bg-gradient-to-b from-[#FBF6E8] via-[#F8F2DF] to-[#F1E7C8]">
      <SkeletonTopBar />
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <SkeletonSimpleRows rows={4} />
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#FBF6E8] via-[#F8F2DF] to-[#F1E7C8]">
      {/* ── พื้นหลังลูกเล่น — ตรงกับหน้า hub (app/admin/csr/page.tsx) ── */}
      <div className="pointer-events-none fixed inset-0 -z-0">
        <div className="absolute -top-16 -right-14 w-56 h-56 md:-top-20 md:-right-20 md:w-[380px] md:h-[380px] rounded-full bg-[radial-gradient(circle,_#EAD94C_0%,_transparent_72%)] opacity-40 blur-2xl" />
        <div className="absolute top-[42%] -left-14 w-48 h-48 md:top-[45%] md:-left-28 md:w-[340px] md:h-[340px] rounded-full bg-[radial-gradient(circle,_#E1592A_0%,_transparent_72%)] opacity-[0.14] blur-3xl" />
        <div className="absolute -bottom-16 right-[8%] w-56 h-56 md:-bottom-28 md:w-[400px] md:h-[400px] rounded-full bg-[radial-gradient(circle,_#2E2B7A_0%,_transparent_72%)] opacity-[0.10] blur-3xl" />
      </div>

      {/* ══ Top Bar — เข้าชุดกับหน้า Track & Trace ของ manager ══ */}
      <div className="relative z-30 sticky top-0 bg-white/70 backdrop-blur-xl border-b border-white/50">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button
              onClick={() => router.replace('/admin/csr')}
              className="flex items-center gap-1.5 text-sm font-semibold text-[#6B6698] hover:text-[#241F5E] bg-white/60 hover:bg-white/90 px-3 py-2 rounded-xl transition-all group shrink-0"
            >
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-[#EADFAF] shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-bold text-[#241F5E] leading-tight truncate">คำถามที่บอทตอบไม่ได้</h1>
              <p className="text-[10px] md:text-[11px] text-[#6B6698] hidden sm:block">GPO Xchange Portal</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3.5 py-1.5 rounded-full border bg-[#ECEAF6] border-[#D8D5E8] text-[#2E2B7A] text-[11px] md:text-xs font-semibold shrink-0">
            <ShieldCheck size={13} strokeWidth={2.5} />
            <span>CSR</span>
          </span>
        </div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <div className="flex items-center gap-2.5 mb-3 px-1">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <HelpCircle size={16} className="text-slate-600" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">คำถามที่บอทตอบไม่ได้</h2>
            <p className="text-[11px] text-muted-foreground">
              {questions.length} คำถามล่าสุดที่บอทลูกค้าตอบว่า &quot;ไม่แน่ใจ&quot; — ถ้าเจอคำถามซ้ำๆ ควรเพิ่มเข้า FAQ ใน lib/chatbot-knowledge.ts
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          {questions.length === 0 ? (
            <div className="py-12 text-center">
              <HelpCircle className="w-9 h-9 text-slate-300 mx-auto mb-2.5" strokeWidth={1.75} />
              <p className="text-sm text-muted-foreground font-medium">ยังไม่มีคำถามที่บอทตอบไม่ได้</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {questions.map((q) => (
                <div key={q.id} className="px-4 md:px-6 py-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">{q.question}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                      {new Date(q.created_at).toLocaleDateString('th-TH', { dateStyle: 'medium' })}
                    </span>
                  </div>
                  {q.answer && (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{q.answer}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
