'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createStaffReturnRequest, generateStaffPdfAction, sendStaffPdfEmailAction } from '@/app/actions/staff-form-actions';
import Step1InfoStaff from './components/Step1InfoStaff';
import Step2Items from '../../../(authenticated)/form/components/Step2Items';
import Step3Reason from '../../../(authenticated)/form/components/Step3Reason';
import ReviewPage from '../../../(authenticated)/form/components/ReviewPage';

const STEPS = [
  { id: 1, label: 'ลูกค้า/ข้อมูล' },
  { id: 2, label: 'รายการยา' },
  { id: 3, label: 'เหตุผล' },
  { id: 4, label: 'ตรวจสอบ' },
];

export default function FormWizardPageStaff() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    sender: {},
    items: [],
    reason: '',
    totalValue: 0,
  });

  const nextStep = () => setStep((prev) => Math.min(prev + 1, 4));
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
      const result = await createStaffReturnRequest(cleanData);
      return result;
    } catch (error) {
      console.error('Staff Submission Error:', error);
      throw error;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ══ Top Bar — สไตล์เดียวกับ CSR Dashboard ══ */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center gap-3">
          <button
            onClick={() => router.push('/admin/csr')}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-all group shrink-0"
          >
            <ArrowLeft size={15} strokeWidth={2.5} className="group-hover:-translate-x-0.5 transition-transform" />
            <span className="hidden sm:inline">ย้อนกลับ</span>
          </button>
          <div className="w-px h-5 bg-slate-200 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm md:text-base font-bold text-slate-900 leading-tight truncate">สร้างคำร้องแทนลูกค้า</h1>
            <p className="text-[10px] md:text-[11px] text-slate-400 hidden sm:block">GPO Xchange Portal · CSR</p>
          </div>
        </div>
      </div>

      {/* ══ Content ══ */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">

        {/* Stepper — เหลือ 4 ขั้น ไม่มีขั้นลงนาม */}
        <div className="mb-6 md:mb-10 overflow-x-auto max-w-3xl mx-auto">
          <div className="flex justify-between min-w-[220px] px-2">
            {STEPS.map((s) => (
              <div key={s.id} className="flex flex-col items-center gap-1.5">
                <div className={`w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl flex items-center justify-center font-black text-sm md:text-base transition-all ${
                  step >= s.id
                    ? 'bg-teal-600 text-white shadow-lg shadow-teal-200'
                    : 'bg-slate-100 text-slate-400'
                }`}>
                  {s.id}
                </div>
                <span className={`text-[9px] md:text-[10px] font-black uppercase ${
                  step >= s.id ? 'text-teal-700' : 'text-slate-400'
                }`}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        {step === 1 && <Step1InfoStaff next={nextStep} updateData={setFormData} />}
        {step === 2 && <Step2Items next={nextStep} back={prevStep} updateData={setFormData} formData={formData} />}
        {step === 3 && <Step3Reason next={nextStep} back={prevStep} updateData={setFormData} formData={formData} />}
        {step === 4 && (
          <ReviewPage
            back={prevStep}
            formData={formData}
            onSubmit={handleSubmit}
            stepNumber={4}
            allowEmail={true}
            showTrackingLink={false}
            homeHref="/admin/csr/dashboard"
            generatePdfActionFn={generateStaffPdfAction}
            sendEmailActionFn={sendStaffPdfEmailAction}
          />
        )}
      </div>
    </div>
  );
}