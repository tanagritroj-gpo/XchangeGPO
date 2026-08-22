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
    <div className="min-h-screen bg-background">
      <SkeletonTopBar />
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <SkeletonSimpleRows rows={4} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* ══ Top Bar ══ */}
      <div className="relative z-30 sticky top-0 bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button
              onClick={() => router.replace('/admin/csr')}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-secondary px-3 py-2 rounded-md transition-colors group shrink-0"
            >
              <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">ย้อนกลับ</span>
            </button>
            <div className="w-px h-5 bg-border shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-base font-bold text-foreground leading-tight truncate">คำถามที่บอทตอบไม่ได้</h1>
              <p className="text-[11px] text-muted-foreground hidden sm:block">GPO Xchange Portal</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3.5 py-1.5 rounded-full border bg-accent border-transparent text-accent-foreground text-[11px] md:text-xs font-semibold shrink-0">
            <ShieldCheck size={13} strokeWidth={2.5} />
            <span>CSR</span>
          </span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <div className="flex items-center gap-2.5 mb-3 px-1">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <HelpCircle size={16} className="text-accent-foreground" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">คำถามที่บอทตอบไม่ได้</h2>
            <p className="text-[11px] text-muted-foreground">
              {questions.length} คำถามล่าสุดที่บอทลูกค้าตอบว่า &quot;ไม่แน่ใจ&quot; — ถ้าเจอคำถามซ้ำๆ ควรเพิ่มเข้า FAQ ใน lib/chatbot-knowledge.ts
            </p>
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border overflow-hidden">
          {questions.length === 0 ? (
            <div className="py-12 text-center">
              <HelpCircle className="w-9 h-9 text-muted-foreground/40 mx-auto mb-2.5" strokeWidth={1.75} />
              <p className="text-sm text-muted-foreground font-medium">ยังไม่มีคำถามที่บอทตอบไม่ได้</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {questions.map((q) => (
                <div key={q.id} className="px-4 md:px-6 py-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">{q.question}</p>
                    <span className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap">
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
