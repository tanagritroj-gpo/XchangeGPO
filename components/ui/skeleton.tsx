import { cn } from '@/lib/utils';

// Base pulse block — ทุก skeleton composite ในโปรเจกต์ประกอบจาก primitive นี้ตัวเดียว
// เพื่อให้จังหวะ animate-pulse (และสีพื้น) เหมือนกันทั้งระบบ ไม่ต่างกันหน้าต่อหน้า
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-slate-200/80', className)}
      aria-hidden="true"
      {...props}
    />
  );
}
