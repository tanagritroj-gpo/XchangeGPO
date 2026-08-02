'use client';
import { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';

// เพิ่ม onClear เข้าไปใน Type ของ props
export function SignaturePad({ 
  onSave, 
  onClear 
}: { 
  onSave: (data: string) => void, 
  onClear?: () => void // เป็น Optional เพราะเราอาจจะไม่ได้ใช้ทุกที่
}) {
  const sigPad = useRef<SignatureCanvas>(null);

  const clear = () => {
    sigPad.current?.clear();
    // ถ้ามีการส่ง onClear เข้ามา ให้สั่งรันฟังก์ชันนั้นด้วย
    if (onClear) onClear();
  };

  const save = () => {
    const data = sigPad.current?.toDataURL();
    if (data) onSave(data);
  };

  return (
    <div className="border border-slate-200 rounded-xl p-2 bg-slate-50">
      <SignatureCanvas 
        ref={sigPad}
        penColor='black'
        canvasProps={{ 
          width: 400, 
          height: 150, 
          className: 'sigCanvas w-full h-auto' // ปรับให้ responsive นิดหน่อยครับ
        }} 
      />
      <div className="flex gap-4 mt-2">
        <button 
          type="button" 
          onClick={clear} 
          className="text-sm text-slate-500 hover:text-rose-500 transition-colors"
        >
          ล้าง
        </button>
        <button 
          type="button" 
          onClick={save} 
          className="text-sm text-teal-700 font-semibold hover:text-teal-900 transition-colors"
        >
          ยืนยันลายเซ็นต์
        </button>
      </div>
    </div>
  );
}