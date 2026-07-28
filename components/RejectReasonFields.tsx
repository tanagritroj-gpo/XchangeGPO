'use client';

import { REJECTION_REASONS } from '@/lib/rejection-reasons';

/** Dropdown เลือกเหตุผลปฏิเสธ + ช่องกรอกเพิ่มเติมที่โผล่เฉพาะตอนเลือก "อื่นๆ"
 *  ใช้ร่วมกันทั้ง WH / Logistics / CSR (ทั้งระดับรายการยาและระดับใบงาน) เพื่อให้
 *  สถิติ "เหตุผลปฏิเสธยอดนิยม" ใน manager-stats.ts group ตาม code ได้จริง แทนที่จะ
 *  กระจายกันเพราะพนักงานพิมพ์ข้อความอิสระไม่ตรงกัน */
export default function RejectReasonFields({
  code,
  detail,
  onCodeChange,
  onDetailChange,
}: {
  code: string;
  detail: string;
  onCodeChange: (code: string) => void;
  onDetailChange: (detail: string) => void;
}) {
  return (
    <div className="mb-6 space-y-3">
      <div>
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
          เหตุผลที่ปฏิเสธ <span className="text-rose-500">*จำเป็น</span>
        </label>
        <select
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-4 focus:ring-teal-50 focus:border-teal-400 transition-all duration-200"
        >
          <option value="" disabled>
            เลือกเหตุผล...
          </option>
          {REJECTION_REASONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {code === 'other' && (
        <div>
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
            ระบุเพิ่มเติม <span className="text-rose-500">*จำเป็น</span>
          </label>
          <textarea
            rows={2}
            value={detail}
            onChange={(e) => onDetailChange(e.target.value)}
            placeholder="ระบุเหตุผลที่ปฏิเสธ..."
            maxLength={500}
            className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-4 focus:ring-teal-50 focus:border-teal-400 transition-all duration-200 resize-none placeholder:text-slate-300"
          />
        </div>
      )}
    </div>
  );
}
