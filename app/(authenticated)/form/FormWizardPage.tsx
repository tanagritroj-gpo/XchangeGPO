'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReturnRepository } from '../../repositories/ReturnRepository';
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

export default function FormWizardPage(props: any) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({ 
    sender: {}, 
    items: [], 
    reason: '', 
    signature: null,
    totalValue: 0 // เพิ่มเผื่อไว้ให้ ReviewPage
  });

  const nextStep = () => setStep((prev) => Math.min(prev + 1, 5));
  const prevStep = () => setStep((prev) => Math.max(prev - 1, 1));

  const handleSubmit = async () => {
    try {
      // เรียกใช้งาน Repository ที่กิตออกแบบไว้
      const result = await ReturnRepository.createReturnRequest(formData);
      
      alert(`บันทึกข้อมูลสำเร็จ! เลขที่ใบคำขอ: ${result.refId}`);
      
      // หลังจากบันทึกเสร็จ วิ่งไปหน้าหลักหรือประวัติ
      router.push('/welcome'); 
    } catch (error) {
      console.error("Submission Error:", error);
      alert('บันทึกข้อมูลไม่สำเร็จ กิตลองตรวจสอบข้อมูลใหม่อีกครั้งนะครับ');
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      
      {/* ส่วนหัวของฟอร์ม */}
      <div className="mb-8">
        <h1 className="text-2xl font-black text-slate-800">แบบขอคืน / แลกเปลี่ยนยา</h1>
        <p className="text-sm font-bold text-teal-700">องค์การเภสัชกรรม สาขาภาคใต้</p>
      </div>

      {/* Stepper Bar */}
      <div className="flex justify-between mb-10 px-4">
        {STEPS.map((s) => (
          <div key={s.id} className="flex flex-col items-center gap-2">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black transition-all ${
              step >= s.id ? 'bg-teal-600 text-white shadow-lg shadow-teal-200' : 'bg-slate-100 text-slate-400'
            }`}>
              {s.id}
            </div>
            <span className={`text-[10px] font-black uppercase ${step >= s.id ? 'text-teal-700' : 'text-slate-400'}`}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 min-h-[500px]">
        {step === 1 && <Step1Info next={nextStep} updateData={setFormData} />}
        {step === 2 && <Step2Items next={nextStep} back={prevStep} updateData={setFormData} formData={formData} />}
        {step === 3 && <Step3Reason next={nextStep} back={prevStep} updateData={setFormData} formData={formData} />}
        {step === 4 && <Step4Sign next={nextStep} back={prevStep} updateData={setFormData} formData={formData} />}
        {step === 5 && <ReviewPage back={prevStep} formData={formData} onSubmit={handleSubmit} />}
      </div>
    </div>
  );
}