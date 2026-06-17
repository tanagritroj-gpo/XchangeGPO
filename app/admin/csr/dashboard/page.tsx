'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCSRDashboardData, approveClient, updateRequestStatus } from '@/app/actions/csr-actions';

export default function CSRDashboard() {
  const router = useRouter();
  const [clients, setClients] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ดึงข้อมูลทั้งหมด
  const fetchData = async () => {
    setIsLoading(true);
    const data = await getCSRDashboardData();
    if (data.success) {
      setClients(data.clients || []);
      setRequests(data.requests || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ฟังก์ชันย้อนกลับอัจฉริยะ
  const handleBack = () => {
    router.replace('/');
  };

  const handleApproveClient = async (id: string) => {
    const res = await approveClient(id);
    if (res.success) {
      alert("อนุมัติลูกค้าเรียบร้อย");
      fetchData(); 
    } else {
      alert("Error: " + res.error);
    }
  };

  const handleUpdateStatus = async (id: number, newStatus: string) => {
    const remark = prompt("ระบุหมายเหตุ:");
    if (remark === null) return;

    const res = await updateRequestStatus(id, newStatus, remark || "");
    if (res.success) {
      alert("อัปเดตสถานะเรียบร้อย");
      fetchData(); 
    } else {
      alert("Error: " + res.error);
    }
  };

  if (isLoading) return <div className="p-10 text-center">กำลังโหลดข้อมูล...</div>;

  return (
    <div className="p-10 bg-slate-50 min-h-screen">
      {/* ปุ่มย้อนกลับ */}
      <button 
        onClick={handleBack} 
        className="mb-6 flex items-center text-slate-500 hover:text-slate-800 transition font-bold"
      >
        <span className="mr-2">←</span> ย้อนกลับ
      </button>

      <h1 className="text-3xl font-black mb-8 text-slate-800">CSR Command Center</h1>
      
      {/* ส่วนที่ 1: อนุมัติลูกค้า */}
      <section className="mb-12 bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold mb-6 text-orange-600">ลูกค้าที่รออนุมัติ ({clients.length})</h2>
        <table className="w-full">
          <tbody>
            {clients.map(client => (
              <tr key={client.id} className="border-b last:border-0">
                <td className="py-4 font-medium">{client.hospital_name}</td>
                <td className="text-right">
                  <button 
                    onClick={() => handleApproveClient(client.id)}
                    className="bg-emerald-600 text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-emerald-700"
                  >
                    อนุมัติ
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ส่วนที่ 2: จัดการ Workflow */}
      <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold mb-6 text-blue-600">จัดการใบงาน (Workflow)</h2>
        <table className="w-full">
          <thead>
            <tr className="text-left text-slate-400 text-xs uppercase">
              <th className="pb-4">Ref ID</th>
              <th className="pb-4">Status</th>
              <th className="pb-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {requests.map(req => (
              <tr key={req.id} className="border-b last:border-0">
                <td className="py-4 font-bold">{req.ref_id}</td>
                <td className="py-4"><span className="bg-slate-100 px-3 py-1 rounded-full text-xs font-bold">{req.current_status}</span></td>
                <td className="py-4 text-right">
                  {req.current_status === 'pending_review' && (
                    <button onClick={() => handleUpdateStatus(req.id, 'approved')} className="text-blue-600 font-bold text-sm">Approve</button>
                  )}
                  {req.current_status === 'receiving' && (
                    <button onClick={() => handleUpdateStatus(req.id, 'exchanging')} className="text-orange-600 font-bold text-sm">Start Exchange</button>
                  )}
                  {req.current_status === 'exchanging' && (
                    <button onClick={() => handleUpdateStatus(req.id, 'completed')} className="text-emerald-600 font-bold text-sm">Complete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}