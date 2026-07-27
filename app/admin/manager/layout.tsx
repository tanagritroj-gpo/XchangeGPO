import { getStaffSession } from '@/app/actions/auth-staff';
import { redirect } from 'next/navigation';
import { StaffChatWidget } from '@/components/StaffChatWidget';
import { ChatWidgetErrorBoundary } from '@/components/ChatWidgetErrorBoundary';

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const session = await getStaffSession();

  if (!session || session.role !== 'manager') {
    redirect('/');
  }

  return (
    <>
      {children}

      {/* ปุ่มแชทลอยสำหรับ Manager — mount ที่ layout นี้จุดเดียว ครอบคลุม
          ทุกหน้าในโซน /admin/manager/* ไม่ต้องแปะซ้ำทีละหน้า ห่อด้วย
          error boundary กัน bug ในแชทไม่ให้ทำหน้า manager อื่นพังไปด้วย
          (บทเรียนจากตอนที่ ChatWidget ของลูกค้าเคยทำหน้าประวัติล่มมาก่อน) */}
      <ChatWidgetErrorBoundary>
        <StaffChatWidget />
      </ChatWidgetErrorBoundary>
    </>
  );
}