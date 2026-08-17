'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createReturnRequest } from '@/app/actions/form-actions';
import FormStepper from '@/components/FormStepper';
import Step1Info from './components/Step1Info';
import Step2Items from './components/Step2Items';
import Step3Reason from './components/Step3Reason';
import Step4Sign from './components/Step4Sign';
import ReviewPage from './components/ReviewPage';
import type { CustomerSessionInfo, ReturnFormData } from './form-types';

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

export default function FormWizardPage({ session }: { session?: CustomerSessionInfo }) {
  const searchParams = useSearchParams();
  const initialRequestType = REQUEST_TYPE_MAP[searchParams.get('type') || ''] || '';

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<ReturnFormData>({
    sender: session || {},
    items: [],
    reason: '',
    signature: null,
    totalValue: 0,
  });
  const topRef = useRef<HTMLDivElement>(null);

  // สลับ step แล้วตำแหน่ง scroll เดิมจากขั้นก่อนหน้าค้างอยู่ (ไม่รีเซ็ตเอง) ทำให้
  // ผู้ใช้บนมือถือมาโผล่กลางหน้าขั้นใหม่ พลาดหัวข้อ/ฟิลด์แรกไป — scrollIntoView หา
  // container ที่ scroll ได้จริงเอง ใช้ได้ทั้ง main.overflow-y-auto (ลูกค้า) และ
  // window scroll ปกติ (ไม่ต้องรู้ว่าใครเป็นคน scroll)
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: 'start' });
  }, [step]);

  const nextStep = () => setStep((prev) => Math.min(prev + 1, 5));
  const prevStep = () => setStep((prev) => Math.max(prev - 1, 1));

  const handleSubmit = async () => {
    try {
      const cleanData = {
        ...formData,
        // ★ deliveryNotePhotoUrls เป็น field ระดับคำร้อง (ไม่ใช่ต่อรายการยาแล้ว) ผ่าน allowlist
        // นี้มาอัตโนมัติจาก ...formData ด้านบนอยู่แล้ว ไม่ต้องเพิ่มในนี้ — จุดที่เคยพลาดตกหล่น
        // (ตอนยังเป็น field ต่อรายการยา) คือ allowlist ของ items ด้านล่างนี้เท่านั้น
        items: formData.items.map((item) => ({
          drugName:  item.drugName,
          qty:       item.qty,
          unit:      item.unit,
          lot:       item.lot,
          exp:       item.exp,
          unitPrice: item.unitPrice,
          val:       item.val,
          inv:       item.inv,
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

      <div ref={topRef} className="mb-6 px-1">
        <h1 className="text-xl md:text-2xl font-black text-slate-800">แบบขอคืน / แลกเปลี่ยนยา</h1>
        <p className="text-sm font-bold text-teal-700">องค์การเภสัชกรรม สาขาภาคใต้</p>
      </div>

      <FormStepper steps={STEPS} currentStep={step} />

      {step === 1 && (
        <Step1Info next={nextStep} updateData={setFormData} initialRequestType={initialRequestType} />
      )}
      {step === 2 && <Step2Items next={nextStep} back={prevStep} updateData={setFormData} formData={formData} allowDeliveryPhoto />}
      {step === 3 && <Step3Reason next={nextStep} back={prevStep} updateData={setFormData} formData={formData} />}
      {step === 4 && <Step4Sign next={nextStep} back={prevStep} updateData={setFormData} formData={formData} />}
      {step === 5 && <ReviewPage back={prevStep} formData={formData} onSubmit={handleSubmit} />}
    </div>
  );
}