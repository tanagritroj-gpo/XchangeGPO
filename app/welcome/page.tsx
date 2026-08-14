'use client'

import { useEffect, useState } from 'react';
import { getCustomerSession } from '@/app/actions/auth-actions';
import Link from 'next/link';
import type { CustomerSessionInfo } from '@/lib/types';
import { AnalogClock } from '@/components/AnalogClock';
import { FileEdit, Radar, Search, ClipboardList, BookOpen, ShieldCheck, User, Building2, PenLine, Lock } from 'lucide-react';

export default function WelcomePage() {
  const [customer, setCustomer] = useState<CustomerSessionInfo | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [today, setToday] = useState('');

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

  // วันที่ในข้อความต้อนรับ — pattern เดียวกับหน้าหลักฝั่ง staff (CSR/manager/sale) ทุกประการ
  // คำนวณตอน mount ฝั่ง client เท่านั้น กัน SSR/CSR ได้ค่าวันที่ไม่ตรงกัน (hydration mismatch)
  useEffect(() => {
    setToday(new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }));
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
    // ★ เดิม min-h-screen บังคับความสูงเต็มจอเสมอ พอเนื้อหาไม่พอเต็มจอ (เช่นจอสูงๆ) footer เลย
    // ถูกดันลงไปสุดขอบจอ ทิ้งช่องว่างเปล่าๆ ไว้กลางหน้า — เอาออก ให้ footer ตามเนื้อหาไปเลย
    // (parent อยู่แล้วคือ app/welcome/layout.tsx ซึ่งจัดการ scroll/ความสูงเต็มจอเองอยู่แล้ว)
    <div className="flex flex-col bg-gradient-to-b from-teal-50/60 via-background to-background">

      <main className="max-w-6xl mx-auto w-full px-6 py-8 space-y-7">
        
        {/* ── Welcome Header + สถานะบัญชี — วางเรียงกันบนมือถือ, จัดคู่กันบนจอ desktop (การ์ด
             hero ลดขนาดลง md:flex-1 แบ่งพื้นที่กับการ์ดสถานะบัญชี md:w-80 แทนที่จะกินเต็มแถว) ── */}
        <div className="flex flex-col md:flex-row gap-5 md:items-stretch">
          <div className="relative overflow-hidden rounded-3xl p-8 md:p-6 text-white shadow-xl md:flex-1" style={{ background: 'linear-gradient(135deg, #0a3d22 0%, #1a7a45 55%, #1a8a6a 100%)' }}>
            <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-10 bg-white" />
            <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full opacity-10 bg-white" />
            <div className="absolute top-1/2 right-24 w-20 h-20 rounded-full opacity-[0.07] bg-white hidden md:block" />

            <div className="relative">
              <p className="text-teal-300 text-xs font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-300 animate-pulse" /> ยินดีต้อนรับ
              </p>
              <h1 className="text-2xl md:text-3xl font-black leading-tight flex items-center gap-2">
                สวัสดีคุณ {customer.contact_name} <User className="w-6 h-6 opacity-80" />
              </h1>
              <p className="text-teal-200 mt-1.5 flex items-center gap-1.5 text-sm">
                <Building2 className="w-4 h-4" /> {customer.hospital_name}
              </p>
              {/* วันที่ — pattern เดียวกับหน้าหลักฝั่ง staff (ขึ้นเปล่าๆ จนกว่า client จะคำนวณเสร็จ
                  กัน layout กระตุกตอน today ยังว่างอยู่ตอน SSR) */}
              <p className="text-teal-200/90 mt-3 text-sm leading-relaxed">
                ขอให้เป็นวันที่ดีนะครับ{today && <> · {today}</>}
              </p>
            </div>
          </div>

          {/* สถานะบัญชี — แยกเป็นการ์ดของตัวเอง พร้อมนาฬิกา (รูปแบบเดียวกับหน้า CSR/manager)
              ★ ตรากลาง "GPO Xchange / Portal" ย้ายมาจากแถวลอยเดิมเหนือ hero การ์ด (แยกออกไป
              เอง ไม่ผูกกับข้อมูลอะไรในหน้านี้เลย) มาไว้ในช่องว่างกลางการ์ดนี้แทน ระหว่างสถานะ
              บัญชีกับนาฬิกา — ที่ว่างนี้มีอยู่แล้วจาก justify-between เดิม ไม่ต้องขยายการ์ด
              มาก แค่ md:w-72 → md:w-80 ให้หายใจง่ายขึ้นเล็กน้อย เปลี่ยนไอคอนจาก emoji 🔐 เป็น
              lucide ให้ตรงกับภาษาไอคอนที่เหลือทั้งหน้า (การ์ดด้านล่างใช้ lucide ทั้งหมดอยู่แล้ว) */}
          <div className="rounded-3xl bg-white/80 backdrop-blur-xl border border-border shadow-sm p-5 flex items-center justify-between gap-3 md:w-80 md:shrink-0">
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

            <div className="flex flex-col items-center gap-1 shrink-0 px-3 border-x border-border/70">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm bg-gradient-to-tr from-[#0f5132] to-[#1a7a45] text-white">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <p className="text-[10px] font-black text-foreground leading-tight whitespace-nowrap">GPO Xchange</p>
              <p className="text-[9px] text-muted-foreground leading-tight">Portal</p>
            </div>

            <AnalogClock now={now} />
          </div>
        </div>

        {/* ── Action Grid — เพิ่มสีสันด้วยพื้นการ์ดไล่เฉดอ่อนๆ ต่อใบ + ไอคอน lucide แทน emoji ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Card: แบบฟอร์ม — โทนส้มทั้งใบ (ไอคอน + wash พื้นหลัง + border) ให้เข้าชุดกับปุ่ม
              CTA ด้านล่าง แทนโทนเขียวเดิมที่ซ้ำกับสีหลักของหน้าอยู่แล้วหลายจุด */}
          <div className="group rounded-3xl border border-orange-100 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden bg-gradient-to-br from-orange-50 via-white to-white">
            <div className="p-7">
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center text-white"
                  style={{
                    background: 'linear-gradient(135deg, #c2410c 0%, #ea580c 55%, #fb923c 100%)',
                    boxShadow: '0 6px 14px -6px rgba(234,88,12,0.55)',
                  }}
                >
                  <FileEdit className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-foreground">แบบฟอร์มรับคืนหรือแลกเปลี่ยนสินค้า</h2>
                  <p className="text-xs text-muted-foreground">กรอกแบบฟอร์มได้ที่นี่ ...</p>
                </div>
              </div>
              {/* ★ โทนส้ม แยกออกจากเขียวที่เหลือทั้งหน้าโดยตั้งใจ ให้เป็นปุ่ม CTA ที่เด่นสุด
                  ของการ์ดนี้ — ใส่มิติด้วย gradient เฉียง + shadow 2 ชั้น (เงาลอยสีส้มด้านล่าง
                  + inset highlight บางๆ ด้านบนให้ดูนูน/glossy) แทนพื้นสีเรียบเดิม */}
              <Link
                href="/form"
                className="w-full py-3.5 rounded-2xl font-bold text-white text-sm hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, #c2410c 0%, #ea580c 55%, #fb923c 100%)',
                  boxShadow: '0 10px 25px -8px rgba(234,88,12,0.55), 0 4px 10px -4px rgba(194,65,12,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
                }}
              >
                <PenLine className="w-4 h-4" /> เริ่มทำรายการใหม่
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
        <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5 flex-wrap">
          © 2026 <span className="font-bold text-teal-600">GPO Xchange Portal</span> • องค์การเภสัชกรรม สาขาภาคใต้
          <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /> PDPA Compliant</span>
        </p>
      </footer>
    </div>
  );
}