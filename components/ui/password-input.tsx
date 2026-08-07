'use client';
import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

// ช่องกรอกรหัสผ่านมาตรฐานเดียวกันทั้งแอป (ลูกค้า+พนักงาน, login/สมัคร/ลืมรหัสผ่าน) — ปุ่มตา
// ขวาสุดสลับ type ระหว่าง password/text ให้ผู้ใช้เห็นสิ่งที่พิมพ์ก่อนกดส่ง กัน typo ตอนตั้ง
// รหัสผ่านใหม่ ใช้ cn() (twMerge) ผสาน className ของแต่ละหน้าเข้ากับ pr-11 ที่กันพื้นที่ปุ่มตา
// ไม่ว่าหน้านั้นจะประกาศ padding ด้วย px-* หรือ pr-* ของตัวเองมาก่อนก็ตาม
export const PasswordInput = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    return (
      <div className="relative">
        <input
          {...props}
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn(className, 'pr-11')}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
        >
          {visible ? <EyeOff size={18} strokeWidth={2.25} /> : <Eye size={18} strokeWidth={2.25} />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';
