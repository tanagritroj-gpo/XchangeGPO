'use client';

// นาฬิกาเข็มเล็กๆ ใช้ร่วมกันระหว่าง CSR hub (app/admin/csr/page.tsx) และ Manager hub
// (app/admin/manager/page.tsx) ในการ์ด "สถานะบัญชี" — แยกออกมาเป็น component กลางเพราะ
// ใช้ซ้ำ 2 จุดแล้ว (เดิมอยู่ในไฟล์ CSR ไฟล์เดียว) คำนวณมุมเข็มจาก Date จริงตรงๆ (ไม่ผ่าน
// string format) เข็มวินาทีกระตุกทีละ 6° ทุกวินาทีแบบนาฬิกาควอตซ์จริง ไม่ใส่ transition ให้
// เนียนเพราะจะดูเหมือนเข็มไหลลื่นผิดธรรมชาติ — now เป็น null ตอนยังไม่ mount (กัน hydration
// mismatch จาก Date.now() ต่างกันระหว่าง server/client) แสดงเป็นเข็ม 12:00 นิ่งๆ ระหว่างนั้น
export function AnalogClock({ now }: { now: Date | null }) {
  const hours = now ? now.getHours() % 12 : 0;
  const minutes = now ? now.getMinutes() : 0;
  const seconds = now ? now.getSeconds() : 0;
  const hourAngle = (hours + minutes / 60) * 30;
  const minuteAngle = (minutes + seconds / 60) * 6;
  const secondAngle = seconds * 6;

  return (
    <svg viewBox="0 0 100 100" className="w-16 h-16 md:w-[72px] md:h-[72px] shrink-0" aria-hidden="true">
      <circle cx="50" cy="50" r="47" fill="white" stroke="#EADFAF" strokeWidth="2" />
      {Array.from({ length: 12 }).map((_, i) => (
        <line
          key={i}
          x1="50" y1={i % 3 === 0 ? '8' : '10'} x2="50" y2="14"
          stroke="#A7A2C4" strokeWidth={i % 3 === 0 ? 2 : 1} strokeLinecap="round"
          transform={`rotate(${i * 30} 50 50)`}
        />
      ))}
      <line x1="50" y1="50" x2="50" y2="28" stroke="#241F5E" strokeWidth="4.5" strokeLinecap="round" transform={`rotate(${hourAngle} 50 50)`} />
      <line x1="50" y1="50" x2="50" y2="17" stroke="#241F5E" strokeWidth="3" strokeLinecap="round" transform={`rotate(${minuteAngle} 50 50)`} />
      <line x1="50" y1="50" x2="50" y2="14" stroke="#E1592A" strokeWidth="1.5" strokeLinecap="round" transform={`rotate(${secondAngle} 50 50)`} />
      <circle cx="50" cy="50" r="3.5" fill="#241F5E" />
    </svg>
  );
}

export default AnalogClock;
