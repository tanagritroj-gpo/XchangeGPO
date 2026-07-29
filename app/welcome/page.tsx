'use client'

import { useEffect, useState } from 'react';
import { getCustomerSession } from '@/app/actions/auth-actions';
import Link from 'next/link';

export default function WelcomePage() {
  const [customer, setCustomer] = useState<any>(null);

  useEffect(() => {
    async function loadCustomer() {
      const session = await getCustomerSession();
      setCustomer(session);
    }
    loadCustomer();
  }, []);

  if (!customer) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-teal-600 font-medium">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 space-y-7">
        
        {/* ── LOGO & BRAND IDENTITY ── */}
        <div className="flex items-center gap-3 px-2 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-sm bg-gradient-to-tr from-[#0f5132] to-[#1a7a45] text-white">🔐</div>
          <div>
            <p className="text-sm font-black text-foreground leading-tight">GPO Xchange</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Portal</p>
          </div>
        </div>

        {/* ── Welcome Header ── */}
        <div className="relative overflow-hidden rounded-3xl p-8 text-white shadow-xl" style={{ background: 'linear-gradient(135deg, #0a3d22 0%, #1a7a45 55%, #1a8a6a 100%)' }}>
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-10 bg-white" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full opacity-10 bg-white" />
          <div className="absolute top-1/2 right-24 w-20 h-20 rounded-full opacity-[0.07] bg-white hidden md:block" />

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-teal-300 text-xs font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-300 animate-pulse" /> ยินดีต้อนรับ
              </p>
              <h1 className="text-2xl md:text-3xl font-black leading-tight">
                สวัสดีคุณ {customer.contact_name} 👤
              </h1>
              <p className="text-teal-200 mt-1.5 flex items-center gap-1.5 text-sm">
                👋 {customer.hospital_name}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl px-5 py-4 text-center hidden md:block">
              <p className="text-teal-200 text-[11px] font-semibold uppercase tracking-wide mb-1">สถานะบัญชี</p>
              <div className="flex items-center gap-1.5 justify-center">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-white font-bold text-sm">Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Action Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Card: แบบฟอร์ม */}
          <div className="group bg-white rounded-3xl border border-border shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden">
            <div className="p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl shadow-sm" style={{ background: 'linear-gradient(135deg,#d1fae5,#6ee7b7)' }}>📝</div>
                <div>
                  <h2 className="text-sm font-black text-foreground">แบบฟอร์มรับคืนหรือแลกเปลี่ยนสินค้า</h2>
                  <p className="text-xs text-muted-foreground">กรอกแบบฟอร์มได้ที่นี่ ...</p> 
                </div>
              </div>
              <Link href="/form" className="w-full py-3.5 rounded-2xl font-bold text-white text-sm shadow-md shadow-teal-100 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 block text-center" style={{ background: 'linear-gradient(135deg,#0f5132,#1a7a45)' }}>
                ✏️ เริ่มทำรายการใหม่
              </Link>
            </div>
          </div>

          {/* Card: Track & Trace (ปรับเป็น Link เรียบร้อย) */}
          <Link href="/customer/tracking" className="group block">
            <div className="bg-white rounded-3xl border border-border shadow-sm hover:shadow-lg hover:border-teal-200 transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
              <div className="p-7">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl shadow-sm" style={{ background: 'linear-gradient(135deg,#dbeafe,#93c5fd)' }}>📡</div>
                  <div>
                    <h2 className="text-sm font-black text-foreground">ติดตามสถานะงาน</h2>
                    <p className="text-xs text-muted-foreground">Track & Trace คำร้องของท่าน</p>
                  </div>
                </div>
                <div className="h-20 flex flex-col items-center justify-center border-2 border-dashed border-teal-100 rounded-2xl text-sm text-teal-600 bg-teal-50/40 gap-1.5 group-hover:bg-teal-50 group-hover:border-teal-300 transition-colors">
                  <span className="text-2xl opacity-60">🔎</span>
                  <span className="font-bold text-xs">คลิกเพื่อค้นหาและติดตามสถานะ</span>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* ── Info Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <a href="/return-policy" className="group block bg-white rounded-3xl border border-border shadow-sm p-7 hover:shadow-xl hover:border-teal-200 transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-teal-50 text-xl group-hover:bg-teal-600 group-hover:text-white transition-colors">📋</div>
                <h3 className="text-sm font-black text-foreground">หลักเกณฑ์การรับคืนแลกเปลี่ยนสินค้า</h3>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">ศึกษารายละเอียดเงื่อนไขการรับคืนสินค้า ตามประกาศขององค์การเภสัชกรรมฉบับล่าสุด</p>
            <div className="text-teal-600 font-bold text-xs bg-teal-50 w-fit px-3 py-1.5 rounded-lg group-hover:bg-teal-600 group-hover:text-white transition-colors">อ่านรายละเอียดเพิ่มเติม</div>
          </a>

          {/* Card: คู่มือการใช้งาน — ชี้ไปคู่มือเวอร์ชัน authenticated (ปุ่มกลับหน้าหลักไป /welcome ไม่ใช่ /) */}
          <a href="/customer/manual" className="group block bg-white rounded-3xl border border-border shadow-sm p-7 hover:shadow-xl hover:border-teal-200 transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-teal-50 text-xl group-hover:bg-teal-600 group-hover:text-white transition-colors">📖</div>
                <h3 className="text-sm font-black text-foreground">คู่มือการใช้งานระบบ (Manual)</h3>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">อ่านคู่มือการใช้งานฉบับสมบูรณ์ สำหรับโรงพยาบาลและหน่วยงานที่ใช้บริการ</p>
            <div className="text-teal-600 font-bold text-xs bg-teal-50 w-fit px-3 py-1.5 rounded-lg group-hover:bg-teal-600 group-hover:text-white transition-colors">เปิดอ่านคู่มือ</div>
          </a>
        </div>
      </main>

      <footer className="mt-4 py-5 px-6 text-center border-t border-teal-50">
        <p className="text-[11px] text-muted-foreground">© 2026 <span className="font-bold text-teal-600">GPO Xchange Portal</span> • องค์การเภสัชกรรม สาขาภาคใต้ &nbsp;|&nbsp; 🔒 PDPA Compliant</p>
      </footer>
    </div>
  );
}