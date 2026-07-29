"use client";

import { useState, Fragment } from "react";
import {
  FileText,
  Mail,
  PenTool,
  MapPin,
  History,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  ChevronDown,
  UserPlus,
  ClipboardList,
  ListChecks,
  Signature,
  PackageCheck,
  Search,
  Phone,
  Clock,
  Monitor,
  ArrowRight,
  ClipboardCheck,
  Truck,
  Warehouse,
  Lock,
  Unlock,
  MessageCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// ข้อมูลเนื้อหา (แยกจาก UI เพื่อแก้ไขง่ายในอนาคต)
// ---------------------------------------------------------------------------

const WHY_POINTS = [
  {
    title: "ลดเวลาดำเนินการจากหลักวันเหลือหลักนาที",
    desc: "จากเดิมที่ต้องกรอกฟอร์มกระดาษ ส่งไปรษณีย์/แฟกซ์ และรอการติดต่อกลับ ระบบช่วยให้ยื่นคำร้องคืนสินค้าและได้รับเอกสารยืนยันภายในไม่กี่นาที",
  },
  {
    title: "ตรวจสอบสถานะได้เองตลอดเวลา",
    desc: "ไม่ต้องโทรถามเจ้าหน้าที่ว่าคำร้องไปถึงไหนแล้ว เช็คสถานะได้เองทุกที่ทุกเวลาผ่านรหัสอ้างอิง",
  },
  {
    title: "เอกสารถูกต้อง ครบถ้วน ทุกครั้ง",
    desc: "ระบบสร้างเอกสารตามแบบฟอร์มมาตรฐาน FM-AJJ0-008 ให้อัตโนมัติ ลดความผิดพลาดจากการกรอกมือ",
  },
  {
    title: "ตรวจสอบย้อนหลังได้ ข้อมูลไม่หาย",
    desc: "ทุกคำร้องถูกบันทึกเป็นประวัติดิจิทัล ค้นหาย้อนหลังได้ทันที ไม่ต้องเก็บเอกสารกระดาษเอง",
  },
];

const STEPS = [
  {
    icon: UserPlus,
    title: "1. สมัครสมาชิก / เข้าสู่ระบบ",
    desc: "สมัครด้วยอีเมลหน่วยงาน หรือเข้าสู่ระบบด้วยบัญชี Google ได้ทันที ใช้เวลาไม่ถึง 2 นาที",
  },
  {
    icon: ClipboardList,
    title: "2. กรอกข้อมูลหน่วยงาน",
    desc: "กรอกข้อมูลผู้ยื่นคำร้องและหน่วยงาน ระบบจะจดจำไว้ใช้ในครั้งถัดไป",
  },
  {
    icon: ListChecks,
    title: "3. เลือกรายการสินค้า/ยาที่ต้องการคืน",
    desc: "ระบุรายการ จำนวน และเหตุผลการคืนแต่ละรายการ พร้อมระบบตรวจสอบข้อมูลเบื้องต้นให้อัตโนมัติ",
  },
  {
    icon: Signature,
    title: "4. เซ็นชื่อยืนยันและยินยอม PDPA",
    desc: "เซ็นชื่อผ่านหน้าจอ (มือถือ/คอมพิวเตอร์) และกดยอมรับเงื่อนไขความยินยอมข้อมูลส่วนบุคคล",
  },
  {
    icon: PackageCheck,
    title: "5. รับเอกสารยืนยันอัตโนมัติ",
    desc: "รับรหัสอ้างอิงทันทีในหน้าเว็บ พร้อมอีเมลแนบไฟล์ PDF ส่งเข้ากล่องจดหมายภายในไม่กี่นาที",
  },
  {
    icon: Search,
    title: "6. ติดตามสถานะจนเสร็จสิ้น",
    desc: "ใช้รหัสอ้างอิงเช็คสถานะได้ทันทีไม่ต้องล็อกอิน หรือล็อกอินเพื่อดูรายละเอียดเชิงลึกกว่า",
  },
];

const FEATURES = [
  {
    icon: FileText,
    title: "ระบบสร้างเอกสาร PDF อัตโนมัติ",
    tag: "PDF Auto-Generate",
    benefit:
      "ทุกคำร้องจะถูกแปลงเป็นเอกสารทางการ (แบบฟอร์ม FM-AJJ0-008) โดยอัตโนมัติ พร้อมข้อมูลครบถ้วนถูกต้อง รองรับภาษาไทยเต็มรูปแบบ ไม่ต้องพิมพ์เอกสารเองอีกต่อไป ใช้เป็นหลักฐานยื่นหน่วยงาน/ตรวจสอบภายในได้ทันที",
  },
  {
    icon: Mail,
    title: "แจ้งเตือนทางอีเมลอัตโนมัติ",
    tag: "Email Notification",
    benefit:
      "ทันทีที่ยื่นคำร้องสำเร็จ ระบบจะส่งอีเมลแนบไฟล์ PDF ให้ทันที และจะแจ้งเตือนอีกครั้งเมื่อสถานะคำร้องเปลี่ยนแปลง ทำให้ไม่พลาดความเคลื่อนไหวของคำร้องแม้ไม่ได้เปิดเว็บไซต์ค้างไว้",
  },
  {
    icon: PenTool,
    title: "เซ็นเอกสารผ่านหน้าจอได้ทันที",
    tag: "Digital Signature",
    benefit:
      "ไม่ต้องพิมพ์เอกสารเพื่อเซ็นด้วยปากกาอีกต่อไป เซ็นชื่อได้ทั้งจากคอมพิวเตอร์และมือถือ ลายเซ็นถูกจัดเก็บอย่างปลอดภัยและแนบไปกับเอกสารโดยอัตโนมัติ",
  },
  {
    icon: MapPin,
    title: "ติดตามสถานะได้ 2 ระดับ",
    tag: "Real-time Tracking",
    benefit:
      "ติดตามแบบสาธารณะด้วยรหัสอ้างอิงโดยไม่ต้องล็อกอิน เหมาะสำหรับเช็คด่วน หรือล็อกอินเพื่อดูรายละเอียดเชิงลึก เช่น หมายเหตุจากเจ้าหน้าที่ผู้ดูแลคำร้อง",
  },
  {
    icon: History,
    title: "ประวัติการคืนสินค้าครบถ้วน",
    tag: "Request History",
    benefit:
      "ดูย้อนหลังคำร้องทั้งหมดที่เคยยื่นได้ทุกเมื่อ ไม่ต้องเก็บเอกสารกระดาษเอง สะดวกเวลาต้องอ้างอิงหรือสรุปรายงานภายในหน่วยงาน",
  },
  {
    icon: Smartphone,
    title: "ใช้งานได้ดีบนมือถือ",
    tag: "Mobile Friendly",
    benefit:
      "ออกแบบมาให้ใช้งานสะดวกทั้งบนคอมพิวเตอร์และมือถือ มีเมนูนำทางด้านล่างจอ (Bottom Navigation) กดใช้งานง่ายด้วยนิ้วเดียว",
  },
];

const FAQS = [
  {
    q: "หากลืมรหัสผ่านต้องทำอย่างไร?",
    a: "กดลิงก์ 'ลืมรหัสผ่าน' ที่หน้าล็อกอิน ระบบจะส่งอีเมล/OTP ให้ตั้งรหัสผ่านใหม่ด้วยตัวเองได้ทันที ไม่ต้องติดต่อเจ้าหน้าที่",
  },
  {
    q: "ต้องล็อกอินทุกครั้งเพื่อดูสถานะคำร้องหรือไม่?",
    a: "ไม่จำเป็น สามารถใช้รหัสอ้างอิงที่ได้รับตอนยื่นคำร้องเช็คสถานะได้ทันทีที่หน้า 'ติดตามสถานะ' โดยไม่ต้องล็อกอิน แต่หากล็อกอินจะเห็นรายละเอียดเพิ่มเติม",
  },
  {
    q: "เอกสาร PDF ที่ได้รับใช้แทนเอกสารตัวจริงได้หรือไม่?",
    a: "เอกสารที่ระบบสร้างให้เป็นไปตามแบบฟอร์มมาตรฐาน FM-AJJ0-008 สามารถใช้เป็นหลักฐานอ้างอิงได้ กรณีต้องการเอกสารต้นฉบับลงนามเพิ่มเติมให้ตรวจสอบเงื่อนไขกับเจ้าหน้าที่ผู้ดูแล",
  },
  {
    q: "หากกรอกข้อมูลผิดหลังส่งคำร้องแล้วแก้ไขเองได้หรือไม่?",
    a: "ไม่สามารถแก้ไขข้อมูลที่ยื่นแล้วได้ด้วยตนเอง กรุณาติดต่อเจ้าหน้าที่ CSR ผ่านช่องทางที่ระบุในอีเมลยืนยัน พร้อมแจ้งรหัสอ้างอิงของคำร้อง",
  },
];

// flow สถานะของคำร้อง ที่ลูกค้าจะเห็นในหน้า "ติดตามสถานะ"
const STATUS_FLOW = [
  {
    icon: ClipboardList,
    title: "ส่งคำร้องสำเร็จ",
    desc: "ได้รับรหัสอ้างอิงทันที ใช้เช็คสถานะได้จากจุดนี้เป็นต้นไป",
  },
  {
    icon: ClipboardCheck,
    title: "รอตรวจสอบ (CSR)",
    desc: "เจ้าหน้าที่ตรวจสอบความถูกต้องของคำร้องและอนุมัติเบื้องต้น",
  },
  {
    icon: Truck,
    title: "อยู่ระหว่างขนส่ง",
    desc: "ทีมขนส่งดำเนินการรับ/ส่งสินค้าตามที่แจ้งไว้ในคำร้อง",
  },
  {
    icon: Warehouse,
    title: "ตรวจรับที่คลังสินค้า",
    desc: "ฝ่ายคลังตรวจสอบสภาพสินค้าจริงเทียบกับข้อมูลที่แจ้ง",
  },
  {
    icon: CheckCircle2,
    title: "ดำเนินการเสร็จสิ้น",
    desc: "คำร้องเสร็จสมบูรณ์ ระบบแจ้งผลให้ทราบทันที",
  },
];

// เปรียบเทียบการติดตามสถานะแบบสาธารณะ vs แบบล็อกอิน
const TRACKING_COMPARE = [
  {
    label: "วิธีเข้าถึง",
    isPublic: "กรอกรหัสอ้างอิง",
    isPrivate: "ล็อกอินด้วยบัญชีของคุณ",
  },
  {
    label: "เห็นสถานะปัจจุบัน",
    isPublic: true,
    isPrivate: true,
  },
  {
    label: "เห็นหมายเหตุจากเจ้าหน้าที่",
    isPublic: false,
    isPrivate: true,
  },
  {
    label: "เห็นประวัติคำร้องทั้งหมด",
    isPublic: false,
    isPrivate: true,
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0E7C6B]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#0E7C6B]" />
      {children}
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold text-foreground">{q}</span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-[#0E7C6B] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="border-t border-border px-5 py-4 text-sm leading-relaxed text-slate-600">
          {a}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function CustomerGuidePage() {
  return (
    <main className="min-h-screen bg-background font-sans text-foreground">
      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden bg-[#0E1622] px-6 py-10 text-white sm:py-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle, #ffffff 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        <div className="relative mx-auto max-w-3xl text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5FD1B4]">
            <ShieldCheck className="h-3.5 w-3.5" />
            GPO Xchange Portal
          </div>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
            คู่มือการใช้งานระบบ
            <span className="text-[#5FD1B4]">สำหรับลูกค้า</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
            ระบบยื่นคำร้องคืนสินค้า/ยาแบบครบวงจร ยื่นเรื่อง เซ็นชื่อ รับเอกสาร
            และติดตามสถานะได้ด้วยตัวเอง ไม่ต้องเดินทางหรือรอสายโทรศัพท์อีกต่อไป
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a
              href="/form"
              className="rounded-lg bg-[#0E7C6B] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-black/20 transition hover:bg-[#0c6a5c]"
            >
              เริ่มยื่นคำร้องคืนสินค้า
            </a>
            <a
              href="/tracking"
              className="rounded-lg border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              ติดตามสถานะคำร้อง
            </a>
          </div>
        </div>
      </section>

      {/* ================= ทำไมต้องมีระบบนี้ ================= */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <SectionEyebrow>เหตุผลความจำเป็น</SectionEyebrow>
        <h2 className="mb-3 text-2xl font-bold text-foreground sm:text-3xl">
          ทำไม GPO Xchange Portal ถึงจำเป็นสำหรับคุณ
        </h2>
        <p className="mb-10 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
          กระบวนการคืนสินค้า/ยาแบบเดิมใช้เอกสารกระดาษ ส่งทางไปรษณีย์หรือแฟกซ์
          ทำให้ใช้เวลานาน ตรวจสอบสถานะไม่ได้ และเสี่ยงเอกสารสูญหาย ระบบนี้ถูกสร้างขึ้นเพื่อแก้ปัญหาดังกล่าวโดยตรง
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          {WHY_POINTS.map((item) => (
            <div
              key={item.title}
              className="flex gap-4 rounded-2xl border border-border bg-white p-5"
            >
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#0E7C6B]" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ================= ขั้นตอนการใช้งาน ================= */}
      <section className="bg-white px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <SectionEyebrow>ขั้นตอนการใช้งาน</SectionEyebrow>
          <h2 className="mb-10 text-2xl font-bold text-foreground sm:text-3xl">
            เริ่มต้นใช้งานใน 6 ขั้นตอนง่ายๆ
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="relative rounded-2xl border border-border bg-background/60 p-5"
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#0E7C6B]/10">
                    <Icon className="h-5 w-5 text-[#0E7C6B]" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                    {step.desc}
                  </p>
                  {i < STEPS.length - 1 && (
                    <div className="mt-4 h-px w-full bg-slate-200 sm:hidden" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= สิ่งที่ลูกค้าจะได้รับ ================= */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <SectionEyebrow>สิ่งที่คุณจะได้รับ</SectionEyebrow>
        <h2 className="mb-10 text-2xl font-bold text-foreground sm:text-3xl">
          ฟีเจอร์และประโยชน์ในแต่ละส่วนของระบบ
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="rounded-2xl border border-border bg-white p-6"
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0E7C6B] text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="inline-block rounded-full bg-[#E1F1EC] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0E7C6B]">
                      {f.tag}
                    </span>
                    <h3 className="mt-1 text-sm font-semibold text-foreground">
                      {f.title}
                    </h3>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-slate-600">
                  {f.benefit}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ================= FLOW ระบบติดตามสถานะ ================= */}
      <section className="bg-white px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <SectionEyebrow>ทำความเข้าใจระบบติดตาม</SectionEyebrow>
          <h2 className="mb-3 text-2xl font-bold text-foreground sm:text-3xl">
            คำร้องของคุณเดินทางผ่านขั้นตอนอะไรบ้าง
          </h2>
          <p className="mb-10 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
            ทุกคำร้องที่ยื่นเข้ามาจะถูกติดตามเป็นสถานะแบบเรียลไทม์ 5 ขั้นตอน
            ตั้งแต่ยื่นคำร้องจนถึงเสร็จสิ้น คุณสามารถเช็คได้เองว่าตอนนี้คำร้องอยู่ขั้นตอนไหนแล้ว
          </p>

          {/* Flow แนวนอน (จอใหญ่) / แนวตั้ง (มือถือ) */}
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-2">
            {STATUS_FLOW.map((step, i) => {
              const Icon = step.icon;
              return (
                <Fragment key={step.title}>
                  <div className="flex flex-1 flex-col items-center gap-2 text-center">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-2 border-[#0E7C6B] bg-[#E1F1EC]">
                      <Icon className="h-5 w-5 text-[#0E7C6B]" />
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                      ขั้นตอนที่ {i + 1}
                    </span>
                    <h3 className="text-sm font-semibold text-foreground">
                      {step.title}
                    </h3>
                    <p className="max-w-[11rem] text-xs leading-relaxed text-slate-600">
                      {step.desc}
                    </p>
                  </div>
                  {i < STATUS_FLOW.length - 1 && (
                    <div className="flex items-center justify-center py-1 sm:pt-5">
                      <ArrowRight className="hidden h-4 w-4 flex-shrink-0 text-slate-300 sm:block" />
                      <div className="h-6 w-px bg-slate-200 sm:hidden" />
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>

          {/* เปรียบเทียบ Public vs Private Tracking */}
          <div className="mt-14 grid gap-5 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background/60 p-5">
              <div className="mb-3 flex items-center gap-2">
                <Unlock className="h-4 w-4 text-[#0E7C6B]" />
                <h3 className="text-sm font-semibold text-foreground">
                  ติดตามแบบสาธารณะ (ไม่ต้องล็อกอิน)
                </h3>
              </div>
              <p className="text-xs leading-relaxed text-slate-600">
                กรอกรหัสอ้างอิงที่หน้า{" "}
                <span className="font-semibold text-[#0E7C6B]">
                  /tracking
                </span>{" "}
                เพื่อเช็คสถานะได้ทันที เหมาะสำหรับเช็คด่วนโดยไม่ต้องเสียเวลาล็อกอิน
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background/60 p-5">
              <div className="mb-3 flex items-center gap-2">
                <Lock className="h-4 w-4 text-[#0E7C6B]" />
                <h3 className="text-sm font-semibold text-foreground">
                  ติดตามแบบล็อกอิน (ดูรายละเอียดเต็ม)
                </h3>
              </div>
              <p className="text-xs leading-relaxed text-slate-600">
                ล็อกอินเข้าบัญชีของคุณเพื่อดูรายละเอียดเชิงลึก เช่น หมายเหตุจากเจ้าหน้าที่
                และประวัติคำร้องทั้งหมดของหน่วยงานคุณ
              </p>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-border">
            <table className="w-full border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="bg-[#0E1622] text-white">
                  <th className="px-4 py-3 font-semibold">รายการ</th>
                  <th className="px-4 py-3 font-semibold">
                    ติดตามแบบสาธารณะ
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    ติดตามแบบล็อกอิน
                  </th>
                </tr>
              </thead>
              <tbody>
                {TRACKING_COMPARE.map((row, i) => (
                  <tr
                    key={row.label}
                    className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}
                  >
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {row.label}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {typeof row.isPublic === "boolean" ? (
                        row.isPublic ? (
                          <CheckCircle2 className="h-4 w-4 text-[#0E7C6B]" />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )
                      ) : (
                        row.isPublic
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {typeof row.isPrivate === "boolean" ? (
                        row.isPrivate ? (
                          <CheckCircle2 className="h-4 w-4 text-[#0E7C6B]" />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )
                      ) : (
                        row.isPrivate
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-center">
            <a
              href="/tracking"
              className="inline-flex items-center gap-2 rounded-lg bg-[#0E7C6B] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-black/10 transition hover:bg-[#0c6a5c]"
            >
              <Search className="h-4 w-4" />
              ไปที่หน้าติดตามสถานะ
            </a>
          </div>
        </div>
      </section>

      {/* ================= FAQ ================= */}
      <section className="bg-white px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <SectionEyebrow>คำถามที่พบบ่อย</SectionEyebrow>
          <h2 className="mb-8 text-2xl font-bold text-foreground sm:text-3xl">
            ยังมีข้อสงสัยอยู่ใช่ไหม?
          </h2>
          <div className="flex flex-col gap-3">
            {FAQS.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ================= CTA / ช่องทางการติดต่อ ปิดท้าย ================= */}
      <section className="px-6 py-10">
        <div className="mx-auto max-w-4xl rounded-2xl bg-[#0E1622] px-6 py-8 text-center text-white">
          <h2 className="text-xl font-bold sm:text-2xl">
            📞 ช่องทางการติดต่อ
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-white/70 sm:text-sm">
            หากพบปัญหาการใช้งานหรือมีข้อสงสัยเพิ่มเติม ติดต่อทีมงาน GPO Xchange
            Portal ได้ตามช่องทางด้านล่างนี้
          </p>

          {/* ข้อมูลช่องทางการติดต่อ — แสดงตรงนี้เลย ไม่ต้องคลิกเข้าไปดู */}
          <div className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-3 text-center text-xs font-medium text-white/90 sm:grid-cols-3">
            <a
              href="tel:074230547"
              className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-3.5 transition hover:border-[#5FD1B4]/50 hover:bg-white/10"
            >
              <Phone size={17} className="text-[#5FD1B4]" />
              <span>โทรศัพท์</span>
              <span className="font-mono text-[13px] font-semibold text-white">
                074-230547
              </span>
            </a>
            <a
              href="mailto:gposouthhdy@gmail.com"
              className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-3.5 transition hover:border-[#5FD1B4]/50 hover:bg-white/10"
            >
              <Mail size={17} className="text-[#5FD1B4]" />
              <span>อีเมล</span>
              <span className="break-all text-[13px] font-semibold text-white">
                gposouthhdy@gmail.com
              </span>
            </a>
            <a
              href="https://line.me/R/ti/p/@gpoofficial"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-3.5 transition hover:border-[#5FD1B4]/50 hover:bg-white/10"
            >
              <MessageCircle size={17} className="text-[#5FD1B4]" />
              <span>LINE OA</span>
              <span className="text-[13px] font-semibold text-white">
                @gpoofficial
              </span>
            </a>
          </div>

          <div className="mx-auto mt-3 flex max-w-2xl flex-wrap items-center justify-center gap-4 text-[11px] text-white/60">
            <span className="inline-flex items-center gap-1.5">
              <Clock size={13} className="text-[#5FD1B4]" />
              จ–ศ 8:00–16:00 น.
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Monitor size={13} className="text-[#5FD1B4]" />
              ระบบออนไลน์ 24 ชม.
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={13} className="text-[#5FD1B4]" />
              GPO สาขาภาคใต้
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}