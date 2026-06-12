'use client';
import { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';

export function SignaturePad({ onSave }: { onSave: (data: string) => void }) {
  const sigPad = useRef<any>(null);

  const clear = () => sigPad.current.clear();
  const save = () => {
    const data = sigPad.current.toDataURL();
    onSave(data);
  };

  return (
    <div className="border border-slate-200 rounded-xl p-2 bg-slate-50">
      <SignatureCanvas 
        ref={sigPad}
        penColor='black'
        canvasProps={{ width: 400, height: 150, className: 'sigCanvas' }} 
      />
      <div className="flex gap-2 mt-2">
        <button type="button" onClick={clear} className="text-sm text-slate-500">ล้าง</button>
        <button type="button" onClick={save} className="text-sm text-teal-700 font-semibold">ยืนยันลายเซ็นต์</button>
      </div>
    </div>
  );
}