'use client';

import { Check } from 'lucide-react';

export interface FormStepperStep {
  id: number;
  label: string;
}

/** stepper ของฟอร์มยื่นคำร้อง — ใช้ร่วมกันทั้งฟอร์มลูกค้า (FormWizardPage) และฟอร์ม
 *  ที่ CSR กรอกแทน (FormWizardPageStaff) เดิมสองที่นี้ copy JSX เดียวกันเป๊ะๆ ไว้คนละไฟล์
 *  แยกออกมาที่เดียวกันเทียบ id ปัจจุบันกับ id ของแต่ละขั้นเพื่อรู้ 3 สถานะ:
 *  เสร็จแล้ว (ติ๊กถูก) / กำลังทำอยู่ (เลขเน้นด้วย ring) / ยังไม่ถึง (จาง) พร้อมเส้นเชื่อม
 *  ระหว่างแต่ละจุดให้เห็น flow ต่อเนื่องชัดเจนขึ้นกว่าเดิมที่มีแค่จุด+ตัวเลขลอยๆ */
export default function FormStepper({ steps, currentStep }: { steps: FormStepperStep[]; currentStep: number }) {
  // เดิมใช้ overflow-x-auto + min-w-[320px] แต่ label 5 ขั้น (ฝั่งลูกค้า) รวมความกว้าง
  // ที่ต้องการจริงเกิน 320px ทำให้จอมือถือแคบๆ (320px, iPhone SE) โดนตัดขอบขวาไปเงียบๆ
  // โดยไม่มีอะไรบอกว่า scroll ได้ — เปลี่ยนมาปล่อยให้ label ตัดขึ้นบรรทัดใหม่ได้แทน
  // (เอา whitespace-nowrap ออก) เพื่อให้แถบนี้บีบตัวพอดีกับทุกความกว้างจอโดยไม่ต้อง scroll เลย
  return (
    <div className="mb-6 md:mb-10">
      <div className="flex items-center px-2">
        {steps.map((s, i) => {
          const isCompleted = currentStep > s.id;
          const isCurrent = currentStep === s.id;
          return (
            <div key={s.id} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl flex items-center justify-center font-black text-sm md:text-base transition-all duration-300 ${
                    isCompleted
                      ? 'bg-teal-600 text-white'
                      : isCurrent
                      ? 'bg-teal-600 text-white shadow-lg shadow-teal-200 ring-4 ring-teal-100'
                      : 'bg-slate-100 text-muted-foreground'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4 md:w-[18px] md:h-[18px]" strokeWidth={3} /> : s.id}
                </div>
                <span
                  className={`text-[11px] md:text-xs font-black uppercase mt-1.5 text-center leading-tight ${
                    isCompleted || isCurrent ? 'text-teal-700' : 'text-muted-foreground'
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`h-0.5 flex-1 -mt-5 md:-mt-6 rounded-full transition-colors duration-300 ${
                    isCompleted ? 'bg-teal-500' : 'bg-slate-200'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
