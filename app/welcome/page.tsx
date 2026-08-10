'use client'

import { useEffect, useState } from 'react';
import { getCustomerSession } from '@/app/actions/auth-actions';
import Link from 'next/link';
import type { CustomerSessionInfo } from '@/lib/types';
import { AnalogClock } from '@/components/AnalogClock';
import { FileEdit, Radar, Search, ClipboardList, BookOpen } from 'lucide-react';

export default function WelcomePage() {
  const [customer, setCustomer] = useState<CustomerSessionInfo | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    async function loadCustomer() {
      const session = await getCustomerSession();
      setCustomer(session);
    }
    loadCustomer();
  }, []);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
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
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-teal-50/60 via-background to-background">

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 space-y-7">
        
        {/* ── LOGO & BRAND IDENTITY ── */}
        <div className="flex items-center gap-3 px-2 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-sm bg-gradient-to-tr from-[#0f5132] to-[#1a7a45] text-white">🔐</div>
          <div>
            <p className="text-sm font-black text-foreground leading-tight">GPO Xchange</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Portal</p>
          </div>
        </div>

        {/* ── Welcome Header + สถานะบัญชี — วางเรียงกันบนมือถือ, จัดคู่กันบนจอ desktop (การ์ด
             hero ลดขนาดลง md:flex-1 แบ่งพื้นที่กับการ์ดสถานะบัญชี md:w-72 แทนที่จะกินเต็มแถว) ── */}
        <div className="flex flex-col md:flex-row gap-5 md:items-stretch">
          <div className="relative overflow-hidden rounded-3xl p-8 md:p-6 text-white shadow-xl md:flex-1" style={{ background: 'linear-gradient(135deg, #0a3d22 0%, #1a7a45 55%, #1a8a6a 100%)' }}>
            <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-10 bg-white" />
            <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full opacity-10 bg-white" />
            <div className="absolute top-1/2 right-24 w-20 h-20 rounded-full opacity-[0.07] bg-white hidden md:block" />

            <div className="relative">
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
          </div>

          {/* สถานะบัญชี — แยกเป็นการ์ดของตัวเอง พร้อมนาฬิกา (รูปแบบเดียวกับหน้า CSR/manager) */}
          <div className="rounded-3xl bg-white/80 backdrop-blur-xl border border-border shadow-sm p-5 flex items-center justify-between gap-4 md:w-72 md:shrink-0">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">สถานะบัญชี</p>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <span className="text-foreground font-black text-lg">Active</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5 font-mono tabular-nums">
                {now ? now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '--:--:--'} น.
              </p>
            </div>
            <AnalogClock now={now} />
          </div>
        </div>

        {/* ── Action Grid — เพิ่มสีสันด้วยพื้นการ์ดไล่เฉดอ่อนๆ ต่อใบ + ไอคอน lucide แทน emoji ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Card: แบบฟอร์ม */}
          <div className="group rounded-3xl border border-emerald-100 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-white">
            <div className="p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm bg-gradient-to-br from-emerald-400 to-emerald-600 text-white">
                  <FileEdit className="w-5 h-5" />
                </div>
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
            <div className="rounded-3xl border border-blue-100 shadow-sm hover:shadow-lg hover:border-blue-200 transition-all duration-300 overflow-hidden transform hover:-translate-y-1 bg-gradient-to-br from-blue-50 via-white to-white">
              <div className="p-7">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm bg-gradient-to-br from-blue-400 to-blue-600 text-white">
                    <Radar className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-foreground">ติดตามสถานะงาน</h2>
                    <p className="text-xs text-muted-foreground">Track & Trace คำร้องของท่าน</p>
                  </div>
                </div>
                <div className="h-20 flex flex-col items-center justify-center border-2 border-dashed border-blue-200 rounded-2xl text-sm text-blue-600 bg-blue-50/60 gap-1.5 group-hover:bg-blue-50 group-hover:border-blue-300 transition-colors">
                  <Search className="w-5 h-5 opacity-70" />
                  <span className="font-bold text-xs">คลิกเพื่อค้นหาและติดตามสถานะ</span>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* ── Info Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <a href="/return-policy" className="group block rounded-3xl border border-amber-100 shadow-sm p-7 hover:shadow-xl hover:border-amber-200 transition-all duration-300 transform hover:-translate-y-1 bg-gradient-to-br from-amber-50 via-white to-white">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-amber-100 text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-black text-foreground">หลักเกณฑ์การรับคืนแลกเปลี่ยนสินค้า</h3>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">ศึกษารายละเอียดเงื่อนไขการรับคืนสินค้า ตามประกาศขององค์การเภสัชกรรมฉบับล่าสุด</p>
            <div className="text-amber-600 font-bold text-xs bg-amber-100 w-fit px-3 py-1.5 rounded-lg group-hover:bg-amber-500 group-hover:text-white transition-colors">อ่านรายละเอียดเพิ่มเติม</div>
          </a>

          {/* Card: คู่มือการใช้งาน — ชี้ไปคู่มือเวอร์ชัน authenticated (ปุ่มกลับหน้าหลักไป /welcome ไม่ใช่ /) */}
          <a href="/customer/manual" className="group block rounded-3xl border border-violet-100 shadow-sm p-7 hover:shadow-xl hover:border-violet-200 transition-all duration-300 transform hover:-translate-y-1 bg-gradient-to-br from-violet-50 via-white to-white">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-violet-100 text-violet-600 group-hover:bg-violet-500 group-hover:text-white transition-colors">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-black text-foreground">คู่มือการใช้งานระบบ (Manual)</h3>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">อ่านคู่มือการใช้งานฉบับสมบูรณ์ สำหรับโรงพยาบาลและหน่วยงานที่ใช้บริการ</p>
            <div className="text-violet-600 font-bold text-xs bg-violet-100 w-fit px-3 py-1.5 rounded-lg group-hover:bg-violet-500 group-hover:text-white transition-colors">เปิดอ่านคู่มือ</div>
          </a>
        </div>
      </main>

      <footer className="mt-4 py-5 px-6 text-center border-t border-teal-50">
        <p className="text-[11px] text-muted-foreground">© 2026 <span className="font-bold text-teal-600">GPO Xchange Portal</span> • องค์การเภสัชกรรม สาขาภาคใต้ &nbsp;|&nbsp; 🔒 PDPA Compliant</p>
      </footer>
    </div>
  );
}