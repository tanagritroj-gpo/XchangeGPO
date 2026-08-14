'use client';
import { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Eraser, Check } from 'lucide-react';

export function SignaturePad({
  onSave,
  onClear,
  onEmpty,
}: {
  onSave: (data: string) => void,
  onClear?: () => void,
  onEmpty?: () => void,
}) {
  const sigPad = useRef<SignatureCanvas>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const clear = () => {
    sigPad.current?.clear();
    setIsEmpty(true);
    if (onClear) onClear();
  };

  const save = () => {
    if (sigPad.current?.isEmpty()) {
      if (onEmpty) onEmpty();
      return;
    }
    const data = sigPad.current?.toDataURL();
    if (data) onSave(data);
  };

  return (
    <div className="border border-slate-200 rounded-xl p-2 bg-slate-50">
      {/* ไม่กำหนด width/height ตายตัวใน canvasProps โดยตั้งใจ — react-signature-canvas จะปรับ
          ความละเอียดจริงของ canvas ให้ตรงกับขนาดที่แสดงผลบนจอเองอัตโนมัติ (คูณ devicePixelRatio
          ด้วยเพื่อความคมชัด) เฉพาะตอนที่ไม่ได้ตั้ง width/height มาตายตัวเท่านั้น (ดู _resizeCanvas
          ใน react-signature-canvas source) เดิมตั้ง 400x150 ไว้แล้วให้ CSS (w-full h-auto) ยืด/หด
          ทับอีกที ทำให้พิกัดที่วาดจริงในกระดาษ canvas ไม่ตรงกับตำแหน่งเคอร์เซอร์เม้าส์บนจอ
          (ยิ่งลากห่างจากมุมซ้ายบนยิ่งเพี้ยนมาก เพราะสัดส่วนความละเอียด canvas กับขนาดแสดงผลไม่เท่ากัน) */}
      <div className="w-full h-[160px]">
        <SignatureCanvas
          ref={sigPad}
          penColor='black'
          onEnd={() => setIsEmpty(false)}
          canvasProps={{
            className: 'sigCanvas w-full h-full'
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t border-slate-200">
        <button
          type="button"
          onClick={clear}
          disabled={isEmpty}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-rose-500 disabled:opacity-40 disabled:hover:text-slate-500 transition-colors"
        >
          <Eraser className="w-3.5 h-3.5" />
          ล้าง
        </button>
        <button
          type="button"
          onClick={save}
          disabled={isEmpty}
          className="flex items-center gap-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed px-4 py-2 rounded-lg shadow-sm transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          ยืนยันลายเซ็นต์
        </button>
      </div>
    </div>
  );
}
