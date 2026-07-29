'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createReturnRequest } from '@/app/actions/form-actions';
import Step1Info from './components/Step1Info';
import Step2Items from './components/Step2Items';
import Step3Reason from './components/Step3Reason';
import Step4Sign from './components/Step4Sign';
import ReviewPage from './components/ReviewPage';

const STEPS = [
  { id: 1, label: 'ข้อมูล' },
  { id: 2, label: 'รายการยา' },
  { id: 3, label: 'เหตุผล' },
  { id: 4, label: 'ลงนาม' },
  { id: 5, label: 'ตรวจสอบ' },
];

// map ค่าจาก query param → label ที่ Step1Info ใช้จริงใน TYPES
// ต้อง whitelist แบบนี้เท่านั้น ห้าม trust ค่าจาก URL ตรงๆ
const REQUEST_TYPE_MAP: Record<string, string> = {
  exchange: 'รับคืนแลกเปลี่ยน',
  'debt-reduction': 'รับคืนลดหนี้',
};

export default function FormWizardPage({ session }: { session?: any }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRequestType = REQUEST_TYPE_MAP[searchParams.get('type') || ''] || '';

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    sender: session || {},
    items: [],
    reason: '',
    signature: null,
    totalValue: 0,
  });

  const nextStep = () => setStep((prev) => Math.min(prev + 1, 5));
  const prevStep = () => setStep((prev) => Math.max(prev - 1, 1));

  const handleSubmit = async () => {
    try {
      const cleanData = {
        ...formData,
        items: formData.items.map((item: any) => ({
          drugName: item.drugName,
          qty:      item.qty,
          unit:     item.unit,
          lot:      item.lot,
          exp:      item.exp,
          val:      item.val,
          inv:      item.inv,
        })),
      };
      const result = await createReturnRequest(cleanData);
      return result;
    } catch (error) {
      console.error('Submission Error:', error);
      throw error;
    }
  };

  return (
    <div className="py-4 md:py-8">

      <div className="mb-6 px-1">
        <h1 className="text-xl md:text-2xl font-black text-slate-800">แบบขอคืน / แลกเปลี่ยนยา</h1>
        <p className="text-sm font-bold text-teal-700">องค์การเภสัชกรรม สาขาภาคใต้</p>
      </div>

      <div className="mb-6 md:mb-10 overflow-x-auto">
        <div className="flex justify-between min-w-[280px] px-2">
          {STEPS.map((s) => (
            <div key={s.id} className="flex flex-col items-center gap-1.5">
              <div className={`w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl flex items-center justify-center font-black text-sm md:text-base transition-all ${
                step >= s.id
                  ? 'bg-teal-600 text-white shadow-lg shadow-teal-200'
                  : 'bg-slate-100 text-muted-foreground'
              }`}>
                {s.id}
              </div>
              <span className={`text-[9px] md:text-[10px] font-black uppercase ${
                step >= s.id ? 'text-teal-700' : 'text-muted-foreground'
              }`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {step === 1 && (
        <Step1Info next={nextStep} updateData={setFormData} initialRequestType={initialRequestType} />
      )}
      {step === 2 && <Step2Items next={nextStep} back={prevStep} updateData={setFormData} formData={formData} />}
      {step === 3 && <Step3Reason next={nextStep} back={prevStep} updateData={setFormData} formData={formData} />}
      {step === 4 && <Step4Sign next={nextStep} back={prevStep} updateData={setFormData} formData={formData} />}
      {step === 5 && <ReviewPage back={prevStep} formData={formData} onSubmit={handleSubmit} />}
    </div>
  );
}