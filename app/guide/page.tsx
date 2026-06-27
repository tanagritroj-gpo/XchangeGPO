'use client';
import React, { useState } from 'react';
import { Mail, BarChart3, FileText, HelpCircle, ChevronDown, AlertTriangle, Phone, Clock, Monitor, CheckCircle, ArrowLeft } from 'lucide-react';

export default function XchangeGuide() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    // เพิ่ม font-sans ให้แน่ใจว่าเป็น sans-serif
    <main className="w-full max-w-4xl mx-auto p-4 md:p-6 bg-slate-50 space-y-8 font-sans text-slate-900">
      
      {/* Hero & Back Button Section */}
      <section className="bg-blue-900 p-6 md:p-8 rounded-2xl text-white shadow-lg">
        <button 
          onClick={() => window.location.href = '/'}
          className="mb-6 flex items-center gap-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg shadow transition-all duration-200"
        >
          <ArrowLeft size={16} /> กลับหน้าหลัก
        </button>

        <div className="inline-block bg-blue-800 text-[11px] px-3 py-1 rounded-full mb-3 tracking-wide">คู่มือการใช้งาน · สำหรับลูกค้า GPO สาขาภาคใต้</div>
        <h1 className="text-3xl md:text-4xl font-bold leading-tight">ระบบ Xchange Portal</h1>
        <p className="text-blue-100 mt-3 text-sm md:text-base leading-relaxed">ยกระดับการแลกเปลี่ยนสินค้าสู่ระบบดิจิทัลที่แม่นยำและตรวจสอบได้ตลอด 24 ชั่วโมง</p>
        <div className="flex gap-2 mt-6 flex-wrap">
          {['Email อัตโนมัติ 3 ช่วง', 'Tracking 7 ระดับ', 'PDF อัตโนมัติ < 5 นาที', 'PDPA-Ready'].map(t => (
            <span key={t} className="px-3 py-1.5 bg-white/10 rounded-lg text-xs font-medium">{t}</span>
          ))}
        </div>
      </section>

      {/* Part 1: Email Flow */}
      <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h2 className="font-bold text-lg mb-6 flex items-center gap-2 text-slate-800"><Mail className="text-blue-600" size={20}/> ส่วนที่ 1 — ระบบ Email แจ้งเตือนอัตโนมัติ 3 ช่วง</h2>
        <div className="space-y-5">
          {[
            { n: 1, title: "ส่งแบบฟอร์มสำเร็จ · Email ยืนยันทันที", desc: "รับรหัสอ้างอิงสำหรับติดตามสถานะ", code: "REF-XXXXXXX", tag: "Auto · ทันที" },
            { n: 2, title: "ภายใน 5 นาที · PDF FM-AJJ0-008 อัตโนมัติ", desc: "ระบบสร้างและส่งไฟล์ PDF ที่กรอกข้อมูลครบถ้วน พร้อมพิมพ์แนบสินค้าได้ทันที", tag: "PDF Auto · < 5 นาที" },
            { n: 3, title: "ดำเนินการเสร็จสิ้น · Email แจ้งปิดงาน", desc: "รับ Email ยืนยัน 'แลกเปลี่ยนสำเร็จ' เป็นหลักฐานปิดรายการอย่างเป็นทางการ", tag: "ปิดงาน · สมบูรณ์" }
          ].map((item) => (
            <div key={item.n} className="flex gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100 items-start">
              <div className="w-10 h-10 bg-blue-700 text-white rounded-full flex items-center justify-center shrink-0 font-bold text-sm">{item.n}</div>
              <div>
                <h3 className="font-semibold text-sm md:text-base text-slate-800">{item.title}</h3>
                <p className="text-xs md:text-sm text-slate-600 mt-1 mb-2 leading-relaxed">{item.desc}</p>
                {item.code && <div className="text-xs font-mono bg-blue-100 px-2 py-1 mb-2 rounded inline-block text-blue-900">{item.code}</div>}
                <div className="text-[11px] font-medium bg-white border border-slate-200 px-2 py-1 rounded inline-block text-slate-700">{item.tag}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 p-4 bg-amber-50 text-amber-900 text-xs md:text-sm rounded-lg border border-amber-200 flex items-start gap-3 leading-relaxed">
          <AlertTriangle size={18} className="shrink-0 mt-0.5"/> กรุณาตรวจสอบ Email ในโฟลเดอร์ Spam/Junk หากไม่พบ Email ภายใน 5 นาที กรุณาติดต่อเจ้าหน้าที่พร้อมแจ้งรหัสอ้างอิง
        </div>
      </section>

      {/* Part 2: Tracking */}
      <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800"><BarChart3 className="text-green-600" size={20}/> ส่วนที่ 2 — ติดตามสถานะ 7 ระดับ (Real-time)</h2>
        <div className="p-4 bg-blue-50 text-blue-900 text-xs md:text-sm rounded-lg mb-6">นำ <strong>รหัสอ้างอิง REF-XXXXXXX</strong> ไปกรอกที่เมนู "ตรวจสอบสถานะ" เพื่อดูความคืบหน้า</div>
        <div className="space-y-4">
          {[
            { id: 1, title: "รอตรวจสอบหลักเกณฑ์", desc: "เจ้าหน้าที่ CSR พิจารณาความสอดคล้องกับนโยบายการรับคืนสินค้า", who: "CSR" },
            { id: 2, title: "อนุมัติให้แลกเปลี่ยนได้", desc: "ผ่านการตรวจสอบเบื้องต้น ระบบพร้อมรับสินค้าคืนตามรายการ", who: "CSR" },
            { id: 3, title: "รถขนส่งกำลังไปรับคืน", desc: "เจ้าหน้าที่กำลังเดินทางไปรับสินค้า ณ จุดนัดหมายที่ระบุ", who: "ขนส่ง" },
            { id: 4, title: "สินค้ากลับคืนคลังแล้ว", desc: "สินค้าส่งถึงคลัง GPO สาขาภาคใต้เรียบร้อย รอตรวจสอบ", who: "ขนส่ง" },
            { id: 5, title: "ตรวจสอบสินค้ารับคืน", desc: "เจ้าหน้าที่คลังตรวจสภาพ จำนวน และความถูกต้องกับเอกสาร", who: "คลัง" },
            { id: 6, title: "อยู่ในขั้นตอนแลกเปลี่ยน", desc: "ระบบเบิกจ่ายสินค้าใหม่เพื่อแลกเปลี่ยนตามรายการที่อนุมัติ", who: "คลัง" },
            { id: 7, title: "แลกเปลี่ยนสำเร็จ ✓", desc: "สินค้าใหม่ถูกส่งมอบเรียบร้อย รายการนี้ปิดสมบูรณ์ — ระบบส่ง Email ยืนยัน", who: "Auto Email" }
          ].map((s) => (
            <div key={s.id} className="flex gap-4 border-b border-slate-100 pb-4 last:border-0 last:pb-0">
              <div className="w-7 h-7 bg-slate-800 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">{s.id}</div>
              <div>
                <h4 className="text-sm md:text-base font-semibold text-slate-800">{s.title}</h4>
                <p className="text-xs md:text-sm text-slate-600 mt-0.5 leading-relaxed">{s.desc}</p>
                <span className="text-[10px] md:text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-medium mt-1 inline-block">{s.who}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Part 3: Form Steps & Receive */}
      <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h2 className="font-bold text-lg mb-6 flex items-center gap-2 text-slate-800"><FileText className="text-amber-600" size={20}/> ส่วนที่ 3 — วิธีกรอกแบบฟอร์ม 4 ขั้นตอน</h2>
        <div className="grid md:grid-cols-2 gap-6 text-sm leading-relaxed text-slate-700">
          <div className="space-y-3">
            <p><strong>Step 1: ข้อมูลเบื้องต้น</strong><br/>ประเภทรายการ, ชื่อ รพ./ร้านยา, จังหวัด, เบอร์โทร, Email (สำคัญ!)</p>
            <p><strong>Step 2: รายการยาและเวชภัณฑ์</strong><br/>ชื่อยา, Lot No., วันหมดอายุ, จำนวน, มูลค่า</p>
            <p><strong>Step 3: เหตุผลและวิธีส่งคืน</strong><br/>เหตุผล, สินค้าที่แลก, วิธีส่งคืน (ขนส่ง/ผู้แทน)</p>
            <p><strong>Step 4: ลงนามดิจิทัล</strong><br/>เซ็นผ่านจอ, ชื่อ-สกุล ผู้ลงนาม, ตำแหน่ง</p>
            <div className="p-3 bg-red-50 border border-red-200 text-red-900 rounded-lg text-xs font-bold mt-4">⚠️ Final Review: ตรวจสอบก่อนกดยืนยัน (ยินยอม PDPA) — แก้ไขไม่ได้หลังส่ง!</div>
          </div>
          
          <div className="bg-slate-50 p-5 rounded-xl border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-3">สิ่งที่จะได้รับ</h3>
            <ul className="space-y-2 text-slate-600 text-xs md:text-sm">
              <li><CheckCircle size={16} className="inline text-green-600 mr-2"/> ทันที: Email ยืนยัน + รหัสอ้างอิง</li>
              <li><CheckCircle size={16} className="inline text-green-600 mr-2"/> 5 นาที: PDF FM-AJJ0-008 อัตโนมัติ</li>
              <li><CheckCircle size={16} className="inline text-green-600 mr-2"/> ตลอดกระบวนการ: Tracking 7 ระดับ Real-time</li>
              <li><CheckCircle size={16} className="inline text-green-600 mr-2"/> เสร็จสิ้น: Email ปิดงาน "แลกเปลี่ยนสำเร็จ"</li>
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ & Contact */}
      <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h2 className="font-bold text-lg mb-4 text-slate-800">คำถามที่พบบ่อย</h2>
        {[
          { q: "ไม่ได้รับ Email ภายใน 5 นาที?", a: "ตรวจสอบ Spam หรือติดต่อเจ้าหน้าที่" },
          { q: "ยื่นมากกว่า 5 รายการต่อครั้งได้ไหม?", a: "แบบฟอร์ม 1 ฉบับรับ 5 รายการ หากเกินให้ยื่นหลายฟอร์ม" },
          { q: "ลายมือชื่อดิจิทัลมีผลทางกฎหมายไหม?", a: "มีผลตาม พ.ร.บ. ว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์" },
          { q: "แก้ไขข้อมูลหลังส่งได้ไหม?", a: "ไม่ได้ กรุณาตรวจสอบให้ดีก่อนกดส่ง" },
          { q: "ข้อมูลส่วนบุคคลถูกจัดเก็บอย่างไร?", a: "รองรับ PDPA ข้อมูลเข้ารหัสและจัดเก็บตามกำหนด" }
        ].map((f, i) => (
          <div key={i} className="border-b border-slate-100 py-3">
            <button className="flex w-full justify-between items-center font-bold text-sm text-slate-700" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
              {f.q} <ChevronDown size={18} className="text-slate-400"/></button>
            {openFaq === i && <p className="mt-2 text-slate-600 text-xs md:text-sm leading-relaxed">{f.a}</p>}
          </div>
        ))}
      </section>

      {/* Footer Contact */}
      <div className="grid grid-cols-3 gap-3 text-[11px] md:text-xs text-center p-4 bg-slate-200/50 rounded-xl font-medium text-slate-700">
        <div className="flex flex-col items-center gap-1"><Phone size={18}/> GPO สาขาภาคใต้</div>
        <div className="flex flex-col items-center gap-1"><Clock size={18}/> จ–ศ 8:00–16:00 น.</div>
        <div className="flex flex-col items-center gap-1"><Monitor size={18}/> ออนไลน์ 24 ชม.</div>
      </div>
    </main>
  );
}