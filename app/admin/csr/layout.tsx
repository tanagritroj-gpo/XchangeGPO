import { getStaffSession } from '@/app/actions/auth-staff';
import { redirect } from 'next/navigation';
import { StaffChatWidget } from '@/components/StaffChatWidget';
import { ChatWidgetErrorBoundary } from '@/components/ChatWidgetErrorBoundary';

export default async function CsrLayout({ children }: { children: React.ReactNode }) {
  const session = await getStaffSession();

  // ตัดข้อยกเว้น manager ออก — CSR section แยกจาก manager dashboard โดยเด็ดขาด
  // manager มี dashboard ของตัวเองอยู่แล้ว ไม่ต้องเข้ามาปนกับ CSR ตรงนี้
  if (!session || session.department !== 'csr') {
    redirect('/');
  }

  return (
    <>
      {children}

      {/* ปุ่มแชทลอยสำหรับ CSR — mount ที่ layout นี้จุดเดียว ครอบคลุมทั้ง
          CsrHubPage และ CSRDashboard ไม่ต้องแปะซ้ำทีละหน้า ห่อด้วย error
          boundary กัน bug ในแชทไม่ให้ทำหน้า CSR อื่นพังไปด้วย (เหมือนที่ทำ
          ไว้กับฝั่ง manager) */}
      <ChatWidgetErrorBoundary>
        <StaffChatWidget />
      </ChatWidgetErrorBoundary>
    </>
  );
}