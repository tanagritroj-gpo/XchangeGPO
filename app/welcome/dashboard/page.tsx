import { getCustomerSession } from '@/app/actions/auth-actions';

export default async function CustomerDashboard() {
  // ไม่ต้องเช็ค/redirect ซ้ำ เพราะ (authenticated)/layout.tsx กันไว้แล้วก่อนถึงตรงนี้
  const customer = await getCustomerSession();

  return (
    <div className="min-h-screen bg-background p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        <header className="bg-white p-8 rounded-3xl shadow-sm border border-border mb-8">
          <p className="text-muted-foreground font-medium">สวัสดีครับ/ค่ะ</p>
          <h1 className="text-3xl font-black text-foreground">
            ยินดีต้อนรับ คุณ {customer?.contact_name}
          </h1>
          <p className="text-lg text-blue-600 font-bold mt-1">
            โรงพยาบาล: {customer?.hospital_name}
          </p>
        </header>

        {/* ส่วนเมนูเหมือนเดิม */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* รายการเมนู 4 รายการ */}
        </div>
      </div>
    </div>
  );
}