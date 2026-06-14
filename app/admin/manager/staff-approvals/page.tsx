'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getPendingStaff, approveStaff } from '@/app/actions/auth-staff';

export default function StaffApprovalPage() {
  const router = useRouter();
  const [pendingStaff, setPendingStaff] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const result = await getPendingStaff();
    if (result.success) {
      setPendingStaff(result.data || []);
    } else {
      console.error("Error fetching staff:", result.error);
    }
    setIsLoading(false);
  };

  const handleApprove = async (id: string) => {
    const confirmed = confirm("ยืนยันการอนุมัติพนักงานท่านนี้?");
    if (!confirmed) return;

    // เราส่งแค่ ID ไป เพราะฝั่ง Server Action ตรวจสอบ Cookie Session ให้กิตเองอัตโนมัติแล้วครับ
    const res = await approveStaff(id);
    
    if (res.success) {
      alert("อนุมัติเรียบร้อยแล้ว");
      fetchData(); 
    } else {
      alert("เกิดข้อผิดพลาด: " + res.error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-900 text-white p-6">
        <h2 className="text-xl font-black text-orange-500">GPO XCHANGE</h2>
        <p className="text-[10px] text-slate-400 uppercase tracking-widest">Manager Portal</p>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-10">
        {/* ปุ่มย้อนกลับ */}
        <button 
          onClick={() => router.back()} 
          className="mb-6 flex items-center text-slate-500 hover:text-slate-800 transition font-bold"
        >
          <span className="mr-2">←</span> ย้อนกลับ
        </button>

        <div className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-black text-slate-800">จัดการสิทธิ์พนักงาน</h1>
          </div>
          <div className="bg-orange-100 px-6 py-3 rounded-2xl border border-orange-200">
            <p className="text-xs font-bold text-orange-600 uppercase">รออนุมัติ</p>
            <p className="text-2xl font-black text-orange-700">{pendingStaff.length}</p>
          </div>
        </div>

        {/* Table Area */}
        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden">
          {isLoading ? (
            <div className="p-20 text-center text-slate-400">กำลังโหลดข้อมูล...</div>
          ) : pendingStaff.length === 0 ? (
            <div className="p-20 text-center text-slate-400">ไม่มีรายการรออนุมัติ</div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-5 text-xs font-bold text-slate-400 uppercase">พนักงาน</th>
                  <th className="px-6 py-5 text-xs font-bold text-slate-400 uppercase">แผนก</th>
                  <th className="px-6 py-5 text-xs font-bold text-slate-400 uppercase text-center">การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {pendingStaff.map((staff) => (
                  <tr key={staff.id} className="border-b border-slate-50">
                    <td className="px-6 py-5 font-bold">
                      {staff.full_name}
                      <p className="text-xs text-slate-400 font-mono">{staff.employee_id}</p>
                    </td>
                    <td className="px-6 py-5 uppercase text-sm font-bold text-slate-600">{staff.department}</td>
                    <td className="px-6 py-5 text-center">
                      <button 
                        onClick={() => handleApprove(staff.id)}
                        className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 transition"
                      >
                        อนุมัติ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}