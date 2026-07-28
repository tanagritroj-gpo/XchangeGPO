'use client';

/** Dropdown เลือกเหตุผล/หมายเหตุจาก preset + ช่องกรอกเพิ่มเติมที่โผล่เฉพาะตอนเลือก
 *  ตัวเลือกสุดท้าย (ปกติคือ "อื่นๆ") ใช้ร่วมกันได้ทั้งฝั่ง reject (เหตุผลปฏิเสธ) และ
 *  ฝั่ง approve/accept (หมายเหตุการตรวจรับ/จัดเก็บ) ของ WH, Logistics, CSR — ผู้เรียก
 *  กำหนด options + label เอง ตัวคอมโพเนนต์ไม่รู้จักความหมายของ code ใดๆ ทั้งสิ้น */
export default function ReasonSelectFields({
  label,
  options,
  code,
  detail,
  onCodeChange,
  onDetailChange,
  otherCode = 'other',
}: {
  label: string;
  options: readonly { code: string; label: string }[];
  code: string;
  detail: string;
  onCodeChange: (code: string) => void;
  onDetailChange: (detail: string) => void;
  otherCode?: string;
}) {
  return (
    <div className="mb-6 space-y-3">
      <div>
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
          {label} <span className="text-rose-500">*จำเป็น</span>
        </label>
        <select
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-4 focus:ring-teal-50 focus:border-teal-400 transition-all duration-200"
        >
          <option value="" disabled>
            เลือกรายการ...
          </option>
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {code === otherCode && (
        <div>
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
            ระบุเพิ่มเติม <span className="text-rose-500">*จำเป็น</span>
          </label>
          <textarea
            rows={2}
            value={detail}
            onChange={(e) => onDetailChange(e.target.value)}
            placeholder="ระบุรายละเอียดเพิ่มเติม..."
            maxLength={500}
            className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-4 focus:ring-teal-50 focus:border-teal-400 transition-all duration-200 resize-none placeholder:text-slate-300"
          />
        </div>
      )}
    </div>
  );
}
