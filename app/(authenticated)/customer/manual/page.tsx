'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import {
  Rocket,
  LogIn,
  KeyRound,
  UserPlus,
  FileEdit,
  ListChecks,
  PenLine,
  ClipboardCheck,
  ShieldCheck,
  FileText,
  Mail,
  QrCode,
  Search,
  Bell,
  History,
  Building2,
  UserCog,
  Bot,
  ScrollText,
  Phone,
  MessageCircle,
  Clock,
  Monitor,
  MapPin,
  ChevronDown,
  ArrowRight,
  ArrowDown,
  RefreshCw,
  CalendarClock,
  CheckCircle2,
  XCircle,
  Circle,
  Truck,
  Repeat,
  Receipt,
  Sparkles,
  Package,
  Users,
  Lock,
  type LucideIcon,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
//  หน้า "คู่มือการใช้งานระบบ (สำหรับลูกค้าที่เข้าสู่ระบบแล้ว)"
//  — สรุปทุกฟังก์ชันฝั่งลูกค้าของ GPO Xchange Portal ไว้ในหน้าเดียว
//  — ปรับ UI ตาม design.md (Option B — Institutional Green): accent เดียว,
//    rounded-md/lg, border 1px แทนเงาหนัก, ไม่มี gradient/blob ตกแต่ง,
//    สีเชิงความหมาย (amber/blue/emerald/red) ใช้เฉพาะแผนภาพสถานะงานเท่านั้น
//  — หน้านี้อยู่ใน (authenticated) layout → มี max-w-5xl + padding + Sidebar
//    ครอบให้แล้ว จึงจัดเป็น stack ของการ์ด (เหมือนหน้าประวัติ/บัญชี) ไม่ full-bleed
// ═══════════════════════════════════════════════════════════════════════════

// ── เมนูลัดกระโดดไปแต่ละหัวข้อ ──
const SECTION_NAV = [
  { id: 'overview', label: 'ภาพรวมระบบ' },
  { id: 'types', label: 'ประเภทการคืน' },
  { id: 'start', label: 'เริ่มต้นใช้งาน' },
  { id: 'form', label: 'ยื่นคำร้อง' },
  { id: 'after', label: 'หลังยื่นสำเร็จ' },
  { id: 'tracking', label: 'ติดตามสถานะ' },
  { id: 'history', label: 'ประวัติคำร้อง' },
  { id: 'account', label: 'บัญชีผู้ใช้' },
  { id: 'spark', label: 'ผู้ช่วย GPO Spark' },
  { id: 'policy', label: 'หลักเกณฑ์การคืน' },
  { id: 'faq', label: 'คำถามที่พบบ่อย' },
];

// ── คุณสมบัติหลักของระบบ (ภาพรวมว่าระบบทำอะไรได้บ้าง) ──
const CAPABILITIES: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: FileEdit, title: 'ยื่นคำร้องออนไลน์ครบวงจร', desc: 'แบบฟอร์มรับคืน/แลกเปลี่ยน/ลดหนี้ 5 ขั้นตอน มีการตรวจสอบข้อมูลให้อัตโนมัติ' },
  { icon: FileText, title: 'ออกเอกสาร PDF อัตโนมัติ', desc: 'สร้างใบรับคืนตามแบบฟอร์มมาตรฐาน FM-AJJ0-008 ทันทีที่ยื่นสำเร็จ' },
  { icon: PenLine, title: 'ลายมือชื่อดิจิทัล', desc: 'เซ็นบนหน้าจอด้วยเมาส์หรือนิ้ว พร้อมบันทึกความยินยอม PDPA' },
  { icon: Search, title: 'ติดตามสถานะเรียลไทม์', desc: 'ดูสถานะได้ 2 ระดับ ทั้งแบบกรอกเลขอ้างอิง และแบบเข้าสู่ระบบดูรายละเอียดเต็ม' },
  { icon: Mail, title: 'แจ้งเตือนทางอีเมล', desc: 'ส่งไฟล์ PDF ให้ทันทีที่ยื่น และแจ้งเตือนทุกครั้งที่สถานะเปลี่ยน' },
  { icon: History, title: 'ประวัติดิจิทัลถาวร', desc: 'ค้นย้อนหลังคำร้องทั้งของตัวเองและทั้งหน่วยงานได้ทุกเมื่อ ไม่ต้องเก็บกระดาษ' },
];

// ── วงจรของคำร้อง 1 ใบ ตั้งแต่ยื่นจนจบ (แผนภาพภาพรวมการทำงานของระบบ) ──
const LIFECYCLE: { icon: LucideIcon; title: string; short: string; desc: string; by: string }[] = [
  { icon: FileEdit, title: 'ยื่นคำร้อง + ลงนาม', short: 'ยื่นคำร้อง', desc: 'กรอกแบบฟอร์ม แนบใบส่งของ เซ็นชื่อ และยืนยัน', by: 'คุณ' },
  { icon: FileText, title: 'ออกเอกสาร & แจ้งเตือน', short: 'ออกเอกสาร', desc: 'สร้าง PDF ให้เลขอ้างอิง และส่งอีเมลทันที', by: 'ระบบอัตโนมัติ' },
  { icon: ClipboardCheck, title: 'ตรวจสอบ & อนุมัติ', short: 'ตรวจ + อนุมัติ', desc: 'ตรวจความถูกต้องของคำร้องและอนุมัติ', by: 'เจ้าหน้าที่ CSR' },
  { icon: Truck, title: 'รับคืนสินค้า', short: 'รับคืนสินค้า', desc: 'เข้ารับสินค้า และตรวจสอบสภาพจริงที่คลัง', by: 'ทีมขนส่ง & คลัง' },
  { icon: Repeat, title: 'แลกเปลี่ยน / ลดหนี้', short: 'แลก / ลดหนี้', desc: 'ดำเนินการตามประเภทคำร้องที่เลือกไว้', by: 'เจ้าหน้าที่ GPO' },
  { icon: CheckCircle2, title: 'เสร็จสิ้น & บันทึกประวัติ', short: 'เสร็จสิ้น', desc: 'แจ้งผลทางอีเมล และเก็บไว้ในประวัติของคุณ', by: 'ระบบอัตโนมัติ' },
];

// ── สิ่งที่ลูกค้าทำได้ตลอดเวลา ระหว่างที่คำร้องยังดำเนินการอยู่ ──
const ANYTIME_ACTIONS = ['ติดตามสถานะ', 'ดาวน์โหลดเอกสาร PDF', 'เร่งงาน', 'ดูประวัติย้อนหลัง'];

// ── ประเภทการคืน (สรุปจากหน้าหลักเกณฑ์) ──
const RETURN_TYPES = [
  {
    icon: Repeat,
    name: 'รับคืนแลกเปลี่ยน',
    window: 'ภายใน 6 เดือน นับจากวันที่สินค้าหมดอายุ',
    use: 'สินค้าหมดอายุแล้ว หรือใกล้หมดอายุ — ได้สินค้าใหม่ทดแทน',
  },
  {
    icon: Receipt,
    name: 'รับคืนลดหนี้',
    window: 'ภายใน 1 เดือน นับจากวันที่รับสินค้า',
    use: 'คืนด้วยเหตุผลอื่นที่ไม่ใช่หมดอายุ (สั่งผิด/ไม่ต้องการแล้ว) — หักลบยอดหนี้',
  },
];

// ── 5 ขั้นตอนการยื่นคำร้อง พร้อมจุดเด่นของแต่ละขั้น ──
const FORM_STEPS: { icon: LucideIcon; title: string; desc: string; highlights: string[] }[] = [
  {
    icon: ListChecks,
    title: 'เลือกประเภทและตรวจข้อมูล',
    desc: 'เลือกประเภทรายการ (แลกเปลี่ยน / ลดหนี้ / CCR / อื่นๆ) ระบบออกเลขที่เอกสารและวันที่ให้อัตโนมัติ',
    highlights: ['ดึงชื่อหน่วยงาน ผู้ประสานงาน เบอร์โทร อีเมล จากบัญชีของคุณให้อัตโนมัติ'],
  },
  {
    icon: Package,
    title: 'เพิ่มรายการยา/เวชภัณฑ์',
    desc: 'ระบุชื่อยา จำนวน หน่วย Lot No. และวันหมดอายุ ได้สูงสุด 5 รายการต่อคำร้อง',
    highlights: [
      'มูลค่ารวมคำนวณให้อัตโนมัติจากจำนวน × ราคาต่อหน่วย',
      'หน่วยเลือกจากรายการ หรือกด “ระบุหน่วยเพิ่ม” เพื่อพิมพ์เอง',
      'แนบรูปใบส่งของได้สูงสุด 5 รูป (ถ่ายจากกล้องมือถือได้ ระบบย่อไฟล์ให้เอง)',
    ],
  },
  {
    icon: Truck,
    title: 'เหตุผลและวิธีส่งคืน',
    desc: 'ระบุเหตุผลการคืน และเลือกวิธีส่ง — โดยบริษัทขนส่ง (กรอกที่อยู่ให้ไปรับ) หรือผ่านผู้แทน',
    highlights: [
      'กรณีแลกเปลี่ยน เลือกได้ว่าต้องการสินค้ารายการเดิม หรือระบุรายการใหม่',
      'เลือก “ผ่านผู้แทน” ระบบจะแสดงชื่อผู้แทนที่ดูแลหน่วยงานของคุณให้อัตโนมัติ',
    ],
  },
  {
    icon: PenLine,
    title: 'ลงลายมือชื่อและยินยอม PDPA',
    desc: 'เซ็นชื่อบนหน้าจอด้วยเมาส์หรือนิ้ว ระบุชื่อ–ตำแหน่งผู้ลงนาม และกดยอมรับความยินยอมข้อมูลส่วนบุคคล',
    highlights: ['ไม่ต้องพิมพ์เอกสารออกมาเซ็น ทำได้ทั้งบนคอมพิวเตอร์และมือถือ'],
  },
  {
    icon: ClipboardCheck,
    title: 'ตรวจสอบและยืนยัน',
    desc: 'ระบบสรุปข้อมูลทั้งหมดให้ตรวจซ้ำอีกครั้ง เมื่อกดยืนยันแล้วจะแก้ไขเองไม่ได้',
    highlights: ['ถ้าพบข้อมูลผิด กดย้อนกลับไปแก้ก่อนยืนยันได้ทุกขั้น'],
  },
];

// ── สิ่งที่ได้รับหลังยื่นคำร้องสำเร็จ ──
const AFTER_SUBMIT = [
  { icon: FileText, title: 'เลขที่อ้างอิง (Ref ID)', desc: 'ได้รับทันทีในหน้าจอ ใช้ติดตามสถานะและอ้างอิงกับเจ้าหน้าที่' },
  { icon: ScrollText, title: 'เอกสาร PDF อัตโนมัติ', desc: 'สร้างตามแบบฟอร์มมาตรฐาน FM-AJJ0-008 กดดาวน์โหลดดูได้ทุกเมื่อ (ลิงก์มีอายุ 5 นาทีต่อครั้ง เพื่อความปลอดภัย)' },
  { icon: Mail, title: 'อีเมลแนบ PDF', desc: 'ระบบส่งอีเมลพร้อมไฟล์ PDF ให้อัตโนมัติ และแจ้งเตือนอีกครั้งเมื่อสถานะเปลี่ยน' },
  { icon: QrCode, title: 'QR Code ติดตามสถานะ', desc: 'บันทึกเป็นรูปได้ ใครสแกนก็ดูสถานะคำร้องนี้ได้โดยไม่ต้องเข้าสู่ระบบ' },
];

// ── แผนภาพสถานะงาน 4 ขั้น (ตรงกับที่เห็นในหน้าติดตามสถานะจริง) ──
const STATUS_FLOW: { icon: LucideIcon; label: string; sub: string; tone: string; dot: string }[] = [
  { icon: ClipboardCheck, label: 'รับคำร้อง', sub: 'รอเจ้าหน้าที่ตรวจสอบ', tone: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  { icon: ShieldCheck, label: 'อนุมัติ', sub: 'ตรวจสอบผ่าน เริ่มดำเนินการ', tone: 'border-blue-200 bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  { icon: Truck, label: 'ตรวจรับ / ขนส่ง', sub: 'รับสินค้า ตรวจที่คลัง ดำเนินการ', tone: 'border-blue-200 bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  { icon: CheckCircle2, label: 'เสร็จสิ้น', sub: 'ดำเนินการครบ แจ้งผลทางอีเมล', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
];

// ── เปรียบเทียบติดตามสถานะ 2 แบบ ──
const TRACKING_COMPARE: { label: string; pub: string | boolean; priv: string | boolean }[] = [
  { label: 'วิธีเข้าถึง', pub: 'กรอกเลขอ้างอิง (Ref ID)', priv: 'เข้าสู่ระบบด้วยบัญชีของคุณ' },
  { label: 'สถานะปัจจุบัน + แผนภาพขั้นตอน', pub: true, priv: true },
  { label: 'รายการยาและ Timeline', pub: true, priv: true },
  { label: 'หมายเหตุจากเจ้าหน้าที่', pub: false, priv: true },
  { label: 'มูลค่าคำร้อง', pub: false, priv: true },
  { label: 'ปุ่ม “เร่งงาน” แจ้งเตือนทีมงาน', pub: false, priv: true },
  { label: 'ดาวน์โหลด PDF ใบรับคืน', pub: false, priv: true },
];

// ── หลักเกณฑ์การคืน (สรุปสั้น) ──
const POLICY_EXCLUDED = [
  'ยา/ผลิตภัณฑ์แช่เย็น (−20°C และ 2–8°C)',
  'ชีววัตถุ, Oseltamivir, Favipiravir, Molnupiravir, ชุดช่วยเหลือผู้ประสบภัย',
  'ยากัญชาหยดลิ้น 4 สูตร',
  'ยาเสพติด / วัตถุออกฤทธิ์ต่อจิตประสาท',
  'เครื่องสำอาง',
  'สินค้าที่ระบุ “ไม่รับเปลี่ยนคืนสินค้า” ไว้ในใบส่งของ',
];
const POLICY_CONDITIONS = [
  'สินค้าต้องสภาพสมบูรณ์ บรรจุเต็มขนาด รุ่นการผลิตเดียวกัน พร้อมแนบใบส่งของ',
  'Billing No. ขึ้นต้น 30X7 (เคยแลกเปลี่ยนแล้ว) หรือ 30X8 (ของแถม/ส่งเสริมการขาย) แลกเปลี่ยนไม่ได้',
  'รับคืนเฉพาะจากผู้ที่สั่งซื้อโดยตรงจากองค์การเภสัชกรรมเท่านั้น',
];

// ── FAQ (รวมจากคู่มือเดิม + คำถามที่ลูกค้าถามบ่อยกับผู้ช่วย GPO Spark) ──
const FAQS = [
  {
    q: 'คืนสินค้าแล้วได้เงินสดคืนไหม',
    a: 'ระบบนี้ไม่มีการคืนเป็นเงินสด มี 2 รูปแบบเท่านั้น คือ “แลกเปลี่ยน” (ได้สินค้าใหม่ทดแทน) หรือ “ลดหนี้” (หักลบยอดหนี้ค้างชำระ)',
  },
  {
    q: 'ควรเลือกแลกเปลี่ยนหรือลดหนี้',
    a: 'ถ้าสินค้าหมดอายุแล้วหรือใกล้หมดอายุ ให้ใช้ “แลกเปลี่ยน” (มีเวลา 6 เดือนหลังหมดอายุ) ถ้าสินค้ายังไม่หมดอายุแต่อยากคืนด้วยเหตุอื่น เช่น สั่งผิด ให้ใช้ “ลดหนี้” แต่ต้องรีบยื่นภายใน 1 เดือนหลังรับสินค้า',
  },
  {
    q: 'ต้องเข้าสู่ระบบทุกครั้งเพื่อดูสถานะหรือไม่',
    a: 'ไม่จำเป็น ใช้เลขอ้างอิง (Ref ID) เช็คที่หน้า “ติดตามสถานะ” ได้ทันทีโดยไม่ต้องเข้าสู่ระบบ แต่ถ้าเข้าสู่ระบบจะเห็นข้อมูลมากกว่า เช่น หมายเหตุจากเจ้าหน้าที่ และใช้ปุ่ม “เร่งงาน” ได้',
  },
  {
    q: 'ยื่นคำร้องแล้วใช้เวลานานแค่ไหน',
    a: 'ระยะเวลาขึ้นกับแต่ละกรณี ไม่มีตัวเลขตายตัว แนะนำให้ติดตามสถานะเองด้วยเลขอ้างอิง หากรอนานผิดปกติสามารถกดปุ่ม “เร่งงาน” ในหน้าติดตามสถานะ (แบบเข้าสู่ระบบ) เพื่อแจ้งเตือนทีมงานได้',
  },
  {
    q: 'คำร้องถูกปฏิเสธ ทำอย่างไรต่อ',
    a: 'เปิดหน้า “ติดตามสถานะ” แบบเข้าสู่ระบบ เพื่อดูหมายเหตุจากเจ้าหน้าที่ว่าปฏิเสธเพราะอะไร หากไม่เข้าใจให้ติดต่อเจ้าหน้าที่ CSR พร้อมแจ้งเลขอ้างอิง',
  },
  {
    q: 'บางรายการในคำร้องผ่าน บางรายการถูกปฏิเสธ',
    a: 'เป็นเรื่องปกติ — แต่ละรายการยาในคำร้องเดียวกันถูกพิจารณาแยกกัน รายการที่ผ่านจะดำเนินการต่อ ส่วนรายการที่ถูกปฏิเสธจะไม่ถูกดำเนินการ ไม่กระทบรายการอื่น',
  },
  {
    q: 'ต้องมีเอกสารอะไรบ้างตอนคืนสินค้า',
    a: 'ต้องแนบใบส่งของหรือหลักฐานการรับสินค้าเสมอ และต้องเป็นการสั่งซื้อโดยตรงจากองค์การเภสัชกรรม (ไม่รับจากคนกลาง)',
  },
  {
    q: 'กรอกข้อมูลผิดหลังส่งคำร้องแล้ว แก้เองได้ไหม',
    a: 'แก้เองไม่ได้ กรุณาติดต่อเจ้าหน้าที่ CSR ผ่านช่องทางในอีเมลยืนยัน พร้อมแจ้งเลขอ้างอิงของคำร้อง',
  },
  {
    q: 'ลืมรหัสผ่านต้องทำอย่างไร',
    a: 'กด “ลืมรหัสผ่าน” ที่หน้าเข้าสู่ระบบ ระบบจะส่งรหัส OTP ไปที่อีเมล (อายุ 5 นาที) ใช้ตั้งรหัสผ่านใหม่ได้เองทันที',
  },
  {
    q: 'บัญชีมีอายุการใช้งานหรือไม่',
    a: 'การลงทะเบียนเข้าใช้ระบบมีอายุ 2 ปี นับจากวันที่ได้รับอนุมัติ ตามปกติเจ้าหน้าที่จะทบทวนข้อมูลและต่ออายุให้ล่วงหน้าก่อนครบกำหนด หากเข้าสู่ระบบไม่ได้เพราะบัญชีหมดอายุ กรุณาติดต่อเจ้าหน้าที่ CSR เพื่อต่ออายุ',
  },
  {
    q: 'เปลี่ยนอีเมลของบัญชีได้ไหม',
    a: 'เปลี่ยนเองไม่ได้ เพราะอีเมลผูกกับการเข้าสู่ระบบด้วย Google กรุณาติดต่อเจ้าหน้าที่ CSR หากต้องการเปลี่ยน',
  },
  {
    q: 'เอกสาร PDF ใช้แทนเอกสารตัวจริงได้ไหม',
    a: 'เอกสารที่ระบบสร้างเป็นไปตามแบบฟอร์มมาตรฐาน FM-AJJ0-008 ใช้อ้างอิงได้ กรณีต้องการต้นฉบับลงนามเพิ่มเติม โปรดตรวจสอบกับเจ้าหน้าที่ผู้ดูแล',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
//  Sub-components
// ═══════════════════════════════════════════════════════════════════════════

function SectionHeader({
  icon: Icon,
  eyebrow,
  title,
  intro,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  intro?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</span>
      </div>
      <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h2>
      {intro && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{intro}</p>}
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-border bg-card p-5 ${className}`}>{children}</div>;
}

/** ชิปจุดเด่นของฟีเจอร์ */
function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-600">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.5} aria-hidden="true" />
      {children}
    </span>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-secondary/40"
      >
        <span className="text-sm font-bold text-foreground">{q}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-primary transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={2.5}
          aria-hidden="true"
        />
      </button>
      {open && (
        <p className="border-t border-border px-4 py-3.5 text-sm leading-relaxed text-slate-600">{a}</p>
      )}
    </div>
  );
}

function YesNo({ value }: { value: string | boolean }) {
  if (typeof value === 'boolean') {
    return value ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-600" strokeWidth={2.5} aria-label="มี" />
    ) : (
      <span className="text-slate-300" aria-label="ไม่มี">—</span>
    );
  }
  return <span className="text-slate-600">{value}</span>;
}

/** แผนภาพวงจรคำร้องแบบวงปิด (งูกินหาง) — 6 ขั้นวางรอบวงรี ลูกศรไหลตามเข็มนาฬิกา
 *  แล้ววนกลับมาที่ขั้นแรก จุดกึ่งกลางวงเป็นสัญลักษณ์การหมุนวน */
function LifecycleLoop() {
  // viewBox 120×100 + preserveAspectRatio="none" → รูปวงยืดเต็มกล่องตาม aspect เสมอ
  // มือถือกล่องเกือบจัตุรัส (วงกลม) / เดสก์ท็อปกล่องกว้าง (วงรีแนวนอน) จาก RX/RY ชุดเดียว
  const CX = 60;
  const CY = 50;
  const RX = 42;
  const RY = 35;
  const N = LIFECYCLE.length;
  const node = (i: number) => {
    const a = ((-90 + (360 / N) * i) * Math.PI) / 180;
    return { x: CX + RX * Math.cos(a), y: CY + RY * Math.sin(a) };
  };
  const nodes = LIFECYCLE.map((_, i) => node(i));
  const arcPath = (i: number) => {
    const p1 = nodes[i];
    const p2 = nodes[(i + 1) % N];
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    let ox = mx - CX;
    let oy = my - CY;
    const l = Math.hypot(ox, oy) || 1;
    ox /= l;
    oy /= l;
    const bow = 4;
    const cx = mx + ox * bow;
    const cy = my + oy * bow;
    const t = 0.34; // ร่นปลายเส้นเข้าหา control ไม่ให้ลูกศรมุดใต้การ์ด
    const s1x = p1.x + (cx - p1.x) * t;
    const s1y = p1.y + (cy - p1.y) * t;
    const s2x = p2.x + (cx - p2.x) * t;
    const s2y = p2.y + (cy - p2.y) * t;
    return `M ${s1x.toFixed(2)} ${s1y.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${s2x.toFixed(2)} ${s2y.toFixed(2)}`;
  };

  return (
    <div className="relative mx-auto mt-5 aspect-square w-full max-w-[21rem] sm:aspect-[3/2] sm:max-w-2xl">
      <svg
        viewBox="0 0 120 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <marker id="lcArrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M1 1 L9 5 L1 9 z" fill="hsl(var(--primary))" />
          </marker>
        </defs>
        {/* ซี่ล้อจากจุดกึ่งกลางไปแต่ละขั้น — เติมพื้นที่ว่างกลางวง ให้ดูเป็นวงล้อ */}
        {nodes.map((p, i) => (
          <line key={`s${i}`} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="hsl(var(--primary))" strokeOpacity="0.12" strokeWidth="1" />
        ))}
        <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.18" strokeWidth="1" />
        {LIFECYCLE.map((_, i) => (
          <path
            key={i}
            d={arcPath(i)}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeOpacity="0.5"
            strokeWidth="1.1"
            strokeLinecap="round"
            markerEnd="url(#lcArrow)"
          />
        ))}
      </svg>

      {/* จุดกึ่งกลาง — สัญลักษณ์วงจร */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground ring-4 ring-card sm:h-14 sm:w-14">
          <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.5} aria-hidden="true" />
        </span>
        <p className="mt-1.5 text-[11px] font-bold text-primary sm:mt-2 sm:text-xs">วงจรคำร้อง</p>
      </div>

      {/* การ์ดแต่ละขั้น วางบนเส้นวงรี */}
      {LIFECYCLE.map((step, i) => {
        const Icon = step.icon;
        const p = nodes[i];
        return (
          <div
            key={step.title}
            title={`${step.desc} · โดย ${step.by}`}
            style={{ left: `${(p.x / 120) * 100}%`, top: `${p.y}%` }}
            className="absolute w-24 -translate-x-1/2 -translate-y-1/2 sm:w-32"
          >
            <div className="rounded-md border border-border bg-card px-2 py-1 text-center shadow-sm sm:py-1.5">
              {/* มือถือ: เลข + ชื่อสั้นในบรรทัดเดียว / เดสก์ท็อป: เลข+ไอคอนบรรทัดบน แล้วชื่อเต็ม */}
              <div className="flex items-center justify-center gap-1 sm:gap-1.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold leading-none text-primary-foreground">
                  {i + 1}
                </span>
                <Icon className="hidden h-3.5 w-3.5 shrink-0 text-primary sm:block" strokeWidth={2.5} aria-hidden="true" />
                <span className="text-[11px] font-bold leading-tight text-foreground sm:hidden">{step.short}</span>
              </div>
              <p className="mt-1 hidden text-[11px] font-bold leading-tight text-foreground sm:block">{step.title}</p>
              <p className="mt-0.5 hidden text-[11px] leading-tight text-muted-foreground sm:block">โดย {step.by}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Page
// ═══════════════════════════════════════════════════════════════════════════

export default function CustomerManualPage() {
  return (
    <div className="space-y-10 pb-4">
      {/* ─────────────── HERO ─────────────── */}
      <section className="rounded-lg bg-primary p-6 text-primary-foreground sm:p-8">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary-foreground/70">
          <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
          GPO Xchange Portal · คู่มือสำหรับลูกค้า
        </div>
        <h1 className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">
          ยื่นคำร้องคืน/แลกเปลี่ยนสินค้า ทำเองได้ครบทุกขั้นตอน
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-primary-foreground/80">
          คู่มือนี้อธิบายทุกฟังก์ชันที่คุณใช้ได้ในระบบ ตั้งแต่ยื่นคำร้อง เซ็นเอกสาร รับไฟล์ PDF
          ติดตามสถานะ ไปจนถึงดูประวัติย้อนหลัง — อ่านเฉพาะหัวข้อที่ต้องการได้จากเมนูลัดด้านล่าง
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link
            href="/form"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary-foreground px-4 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-primary-foreground/90"
          >
            <FileEdit className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            เริ่มยื่นคำร้อง
          </Link>
          <Link
            href="/customer/tracking"
            className="inline-flex items-center gap-1.5 rounded-md border border-primary-foreground/30 px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-foreground/10"
          >
            <Search className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            ติดตามสถานะคำร้อง
          </Link>
        </div>
      </section>

      {/* ─────────────── เมนูลัด ─────────────── */}
      <nav aria-label="เมนูลัดหัวข้อคู่มือ" className="flex flex-wrap gap-2">
        {SECTION_NAV.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {s.label}
          </a>
        ))}
      </nav>

      {/* ─────────────── 1. ภาพรวมระบบ ─────────────── */}
      <section id="overview" className="scroll-mt-6 space-y-5">
        <SectionHeader
          icon={Rocket}
          eyebrow="ภาพรวมระบบ"
          title="GPO Xchange Portal คืออะไร"
          intro="ระบบดิจิทัลครบวงจรสำหรับยื่นคำร้องคืนและแลกเปลี่ยนสินค้าขององค์การเภสัชกรรม แทนการกรอกฟอร์มกระดาษ ส่งไปรษณีย์หรือแฟกซ์ และรอโทรศัพท์ติดต่อกลับ — ทำเรื่อง เซ็นเอกสาร รับไฟล์ ติดตามสถานะ และดูย้อนหลัง ได้ด้วยตัวเองทั้งหมดผ่านหน้าเว็บเดียว ใช้ได้ทั้งคอมพิวเตอร์และมือถือ"
        />

        {/* คุณสมบัติหลัก — มือถือ 2 คอลัมน์ (6 การ์ด = 3 แถว) ไม่ให้ดูหลวม */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3">
          {CAPABILITIES.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.title} className="rounded-lg border border-border bg-card p-3.5 sm:p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground sm:h-9 sm:w-9">
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2} aria-hidden="true" />
                </span>
                <h3 className="mt-2 text-[13px] font-bold leading-snug text-foreground sm:mt-2.5 sm:text-sm">{c.title}</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600 sm:text-xs">{c.desc}</p>
              </div>
            );
          })}
        </div>

        {/* แผนภาพวงจรของคำร้อง 1 ใบ — flow แบบวงปิด (งูกินหาง): 6 ขั้นเรียงรอบวงรี
            ลูกศรไหลตามเข็มนาฬิกาและวนกลับมาที่ขั้นแรก */}
        <div className="rounded-lg border border-border bg-card p-5 sm:p-6">
          <p className="text-sm font-bold text-foreground">วงจรของคำร้อง 1 ใบ ตั้งแต่ยื่นจนเสร็จสิ้น</p>
          <p className="mt-1 text-xs text-slate-500">เป็นวงปิด — ยื่นคำร้องใบใหม่เมื่อไหร่ ก็เริ่มรอบใหม่ตามเดิม</p>

          <LifecycleLoop />

          {/* สิ่งที่ทำได้ตลอดเวลาระหว่างทาง */}
          <div className="mt-6 flex flex-col gap-2 rounded-md border border-dashed border-primary/30 bg-accent/40 p-3.5 sm:flex-row sm:items-center sm:gap-3">
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-primary">ทำได้ทุกเมื่อระหว่างทาง</span>
            <div className="flex flex-wrap gap-1.5">
              {ANYTIME_ACTIONS.map((a) => (
                <span key={a} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-bold text-slate-600">
                  <span className="h-1 w-1 rounded-full bg-primary" aria-hidden="true" />
                  {a}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────── 2. ประเภทการคืน ─────────────── */}
      <section id="types" className="scroll-mt-6 space-y-5">
        <SectionHeader
          icon={Repeat}
          eyebrow="ประเภทการคืน"
          title="เลือกให้ถูกตั้งแต่ต้น: แลกเปลี่ยน หรือ ลดหนี้"
          intro="ระบบนี้ไม่มีการคืนเป็นเงินสด มี 2 รูปแบบหลัก ต่างกันที่ “กรอบเวลา” และ “สิ่งที่ได้กลับมา”"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {RETURN_TYPES.map((t) => {
            const Icon = t.icon;
            return (
              <Card key={t.name}>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                    <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                  </span>
                  <h3 className="text-sm font-bold text-foreground">{t.name}</h3>
                </div>
                <dl className="mt-3 space-y-2 text-xs">
                  <div>
                    <dt className="font-bold uppercase tracking-wide text-muted-foreground">กรอบเวลา</dt>
                    <dd className="mt-0.5 font-bold text-primary">{t.window}</dd>
                  </div>
                  <div>
                    <dt className="font-bold uppercase tracking-wide text-muted-foreground">ใช้เมื่อ</dt>
                    <dd className="mt-0.5 leading-relaxed text-slate-600">{t.use}</dd>
                  </div>
                </dl>
              </Card>
            );
          })}
        </div>
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <Circle className="mt-0.5 h-4 w-4 shrink-0 fill-amber-400 text-amber-400" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-amber-900">
            <span className="font-bold">ยังไม่แน่ใจ?</span> ถามผู้ช่วย GPO Spark (ปุ่มลอยมุมขวาล่าง) หรือดู
            <Link href="/return-policy" className="mx-1 font-bold text-amber-900 underline underline-offset-2">หลักเกณฑ์การคืนฉบับเต็ม</Link>
            ก่อนยื่นได้เสมอ
          </p>
        </div>
      </section>

      {/* ─────────────── 3. เริ่มต้นใช้งาน ─────────────── */}
      <section id="start" className="scroll-mt-6 space-y-5">
        <SectionHeader
          icon={LogIn}
          eyebrow="เริ่มต้นใช้งาน"
          title="ลงทะเบียนเข้าใช้ระบบ"
          intro="การลงทะเบียนมีอายุ 2 ปี นับจากวันที่ได้รับอนุมัติ และหนึ่งหน่วยงานมีผู้ใช้ได้หลายบัญชี — ทุกบัญชีในหน่วยงานเดียวกันเห็นงานร่วมกันได้"
        />
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
          {[
            {
              icon: UserPlus,
              title: 'สมัครสมาชิก',
              desc: 'กรอกข้อมูลหน่วยงาน ผู้ประสานงาน ลงลายมือชื่อดิจิทัลและยินยอม PDPA แล้วรอเจ้าหน้าที่อนุมัติ 1–2 วันทำการ',
            },
            {
              icon: LogIn,
              title: 'เข้าสู่ระบบ',
              desc: 'เข้าด้วยอีเมล + รหัสผ่าน หรือปุ่ม “Sign in with Google” ด้วยอีเมลเดียวกับที่ลงทะเบียนไว้',
            },
            {
              icon: CalendarClock,
              title: 'อายุการใช้งาน 2 ปี',
              desc: 'ก่อนครบกำหนด เจ้าหน้าที่จะทบทวนข้อมูลการลงทะเบียนของคุณล่วงหน้า เพื่อให้ใช้งานต่อเนื่องได้อย่างราบรื่น',
            },
            {
              icon: KeyRound,
              title: 'ลืมรหัสผ่าน',
              desc: 'กด “ลืมรหัสผ่าน” ที่หน้าเข้าสู่ระบบ รับรหัส OTP ทางอีเมล (อายุ 5 นาที) แล้วตั้งรหัสใหม่ได้เองทันที',
            },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.title} className="rounded-lg border border-border bg-card p-3.5 sm:p-5">
                <Icon className="h-4 w-4 text-primary sm:h-5 sm:w-5" strokeWidth={2} aria-hidden="true" />
                <h3 className="mt-2 text-[13px] font-bold leading-snug text-foreground sm:mt-2.5 sm:text-sm">{c.title}</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600 sm:text-xs">{c.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─────────────── 4. ยื่นคำร้อง 5 ขั้นตอน ─────────────── */}
      <section id="form" className="scroll-mt-6 space-y-5">
        <SectionHeader
          icon={FileEdit}
          eyebrow="ยื่นคำร้อง"
          title="แบบฟอร์มออนไลน์ 5 ขั้นตอน"
          intro="ทุกขั้นมีการตรวจสอบข้อมูลเบื้องต้นให้อัตโนมัติ ข้อมูลจะไม่หายถ้ากดย้อนกลับไปแก้"
        />
        <ol className="space-y-3">
          {FORM_STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="relative rounded-lg border border-border bg-card p-5">
                <div className="flex items-start gap-3.5">
                  <div className="flex flex-col items-center">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    {i < FORM_STEPS.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
                  </div>
                  <div className="min-w-0 flex-1 pb-1">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} aria-hidden="true" />
                      <h3 className="text-sm font-bold text-foreground">{step.title}</h3>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{step.desc}</p>
                    {step.highlights.length > 0 && (
                      <div className="mt-2.5 space-y-1.5 rounded-md bg-secondary/50 p-3">
                        {step.highlights.map((h) => (
                          <Highlight key={h}>{h}</Highlight>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ─────────────── 5. หลังยื่นสำเร็จ ─────────────── */}
      <section id="after" className="scroll-mt-6 space-y-5">
        <SectionHeader
          icon={CheckCircle2}
          eyebrow="หลังยื่นสำเร็จ"
          title="สิ่งที่คุณได้รับทันที"
          intro="เมื่อกดยืนยันแล้ว ระบบจะแสดงการ์ดสรุปพร้อมเครื่องมือทั้งหมดสำหรับเก็บหลักฐานและติดตามงาน"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {AFTER_SUBMIT.map((f) => {
            const Icon = f.icon;
            return (
              <Card key={f.title}>
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                    <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{f.title}</h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{f.desc}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ─────────────── 6. ติดตามสถานะ ─────────────── */}
      <section id="tracking" className="scroll-mt-6 space-y-5">
        <SectionHeader
          icon={Search}
          eyebrow="ติดตามสถานะ"
          title="รู้ทุกความเคลื่อนไหวของคำร้อง"
          intro="คำร้องจะเดินผ่านสถานะ 4 ขั้นแบบเรียลไทม์ ดูได้ทั้งแบบไม่ต้องเข้าสู่ระบบ และแบบเข้าสู่ระบบเพื่อดูรายละเอียดเต็ม"
        />

        {/* แผนภาพสถานะ 4 ขั้น + สาขาปฏิเสธ */}
        <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:items-stretch">
            {STATUS_FLOW.map((s, i) => {
              const Icon = s.icon;
              return (
                <Fragment key={s.label}>
                  <div
                    className={`flex w-full max-w-[13.5rem] items-center gap-2 rounded-md border px-2.5 py-1.5 sm:max-w-none sm:flex-1 sm:flex-col sm:gap-1 sm:py-2 sm:text-center ${s.tone}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold leading-tight sm:text-xs">{`${i + 1}. ${s.label}`}</p>
                      <p className="mt-0.5 text-[11px] leading-tight opacity-75">{s.sub}</p>
                    </div>
                  </div>
                  {i < STATUS_FLOW.length - 1 && (
                    <div className="flex shrink-0 items-center justify-center" aria-hidden="true">
                      <ArrowRight className="hidden h-4 w-4 text-slate-300 sm:block" strokeWidth={2.5} />
                      <ArrowDown className="h-4 w-4 text-slate-300 sm:hidden" strokeWidth={2.5} />
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
          <div className="mt-4 flex flex-col gap-2 border-t border-dashed border-border pt-4 text-xs leading-relaxed text-slate-600 sm:flex-row sm:items-center sm:gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 font-bold text-red-700">
              <XCircle className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              ปฏิเสธคำร้อง
            </span>
            <span>
              หากไม่ผ่านการตรวจสอบ คำร้อง (หรือเฉพาะบางรายการยา) จะเข้าสถานะนี้แทน พร้อมหมายเหตุจากเจ้าหน้าที่ —
              รายการยาแต่ละรายการในคำร้องเดียวกันถูกพิจารณาแยกกันได้
            </span>
          </div>
        </div>

        {/* เปรียบเทียบ 2 แบบ */}
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-xs sm:text-sm">
            <thead>
              <tr className="bg-secondary text-foreground">
                <th className="px-4 py-3 font-bold">รายการ</th>
                <th className="px-4 py-3 font-bold">
                  <span className="inline-flex items-center gap-1.5">
                    <Search className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" /> ไม่เข้าสู่ระบบ
                  </span>
                </th>
                <th className="px-4 py-3 font-bold">
                  <span className="inline-flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" /> เข้าสู่ระบบ
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {TRACKING_COMPARE.map((row, i) => (
                <tr key={row.label} className={i % 2 === 0 ? 'bg-card' : 'bg-secondary/30'}>
                  <td className="px-4 py-3 font-medium text-slate-700">{row.label}</td>
                  <td className="px-4 py-3"><YesNo value={row.pub} /></td>
                  <td className="px-4 py-3"><YesNo value={row.priv} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Card className="border-amber-200 bg-amber-50/50">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-600">
              <Bell className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-foreground">ปุ่ม “เร่งงาน”</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                ในหน้าติดตามสถานะแบบเข้าสู่ระบบ หากคำร้องยังไม่เสร็จและคุณต้องการเร่ง กดปุ่มนี้เพื่อแจ้งเตือนทีมงานได้
                (กดซ้ำได้อีกครั้งหลังผ่านไป 1 ชั่วโมง เพื่อไม่ให้ทีมงานได้รับแจ้งเตือนถี่เกินไป)
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* ─────────────── 7. ประวัติคำร้อง ─────────────── */}
      <section id="history" className="scroll-mt-6 space-y-5">
        <SectionHeader
          icon={History}
          eyebrow="ประวัติคำร้อง"
          title="ย้อนดูงานเก่าได้ทุกเมื่อ ไม่ต้องเก็บกระดาษ"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <History className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              </span>
              <h3 className="text-sm font-bold text-foreground">ประวัติการยื่นคำร้อง</h3>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              คำร้องทั้งหมดที่คุณเคยยื่น กรองตามประเภทงานและสถานะได้ พร้อมสรุปยอด (ทั้งหมด / กำลังดำเนินการ / เสร็จสิ้น / ถูกปฏิเสธ / มูลค่ารวม)
            </p>
          </Card>
          <Card>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <Building2 className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              </span>
              <h3 className="text-sm font-bold text-foreground">ประวัติงานรวมทั้งหน่วยงาน</h3>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              รวมคำร้องของทุกบัญชีในหน่วยงานเดียวกัน เห็นด้วยว่าใครเป็นผู้ยื่น เหมาะสำหรับสรุปรายงานภายใน
            </p>
          </Card>
        </div>
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/40 p-4">
          <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} aria-hidden="true" />
          <p className="text-xs leading-relaxed text-slate-600">
            ในทุกรายการมีปุ่ม <span className="font-bold text-foreground">“ตรวจสอบ PDF ใบรับคืน/แลกเปลี่ยน”</span> กดเปิดดูเอกสารของคำร้องนั้นได้ทันที
            และปุ่มลัดไปหน้าติดตามสถานะของคำร้องนั้น
          </p>
        </div>
      </section>

      {/* ─────────────── 8. บัญชีผู้ใช้ ─────────────── */}
      <section id="account" className="scroll-mt-6 space-y-5">
        <SectionHeader icon={UserCog} eyebrow="บัญชีผู้ใช้" title="จัดการบัญชีของคุณเอง" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <KeyRound className="h-5 w-5 text-primary" strokeWidth={2} aria-hidden="true" />
            <h3 className="mt-2.5 text-sm font-bold text-foreground">เปลี่ยนรหัสผ่าน</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              ยืนยันด้วยรหัสผ่านปัจจุบัน เมื่อเปลี่ยนสำเร็จ อุปกรณ์อื่นที่ยังเข้าสู่ระบบค้างไว้จะถูกออกจากระบบอัตโนมัติ
            </p>
          </Card>
          <Card>
            <Users className="h-5 w-5 text-primary" strokeWidth={2} aria-hidden="true" />
            <h3 className="mt-2.5 text-sm font-bold text-foreground">แก้ไขข้อมูลติดต่อ</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              แก้ชื่อผู้ติดต่อ เบอร์โทร และตำแหน่งได้เอง ไม่ต้องยืนยันรหัสผ่าน — ข้อมูลนี้จะถูกใช้กรอกในคำร้องครั้งถัดไปให้อัตโนมัติ
            </p>
          </Card>
        </div>
        <p className="text-xs leading-relaxed text-slate-500">
          หมายเหตุ: <span className="font-bold text-slate-600">อีเมล</span> ของบัญชีแก้เองไม่ได้ เพราะผูกกับการเข้าสู่ระบบด้วย Google —
          หากต้องการเปลี่ยน กรุณาติดต่อเจ้าหน้าที่ CSR
        </p>
      </section>

      {/* ─────────────── 9. ผู้ช่วย GPO Spark ─────────────── */}
      <section id="spark" className="scroll-mt-6 space-y-5">
        <SectionHeader
          icon={Bot}
          eyebrow="ผู้ช่วย GPO Spark"
          title="มีคำถาม ถามได้ตลอด 24 ชม."
        />
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG มาสคอตแบบ static ใน /public, next/image ไม่ช่วย optimize อะไร (เหมือน ChatWidget.tsx) */}
            <img
              src="/mascot/gpo_spark_avatar_1x1.svg"
              alt="มาสคอต GPO Spark"
              className="h-16 w-16 shrink-0 rounded-full border border-border"
            />
            <div>
              <p className="text-sm leading-relaxed text-slate-600">
                ปุ่มลอยรูปมาสคอตมุมขวาล่างของทุกหน้า คือผู้ช่วย <span className="font-bold text-foreground">GPO Spark</span> —
                ตอบคำถามเรื่องเงื่อนไขการคืนสินค้าและวิธีใช้งานระบบได้ทันที
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                ผู้ช่วยตอบเฉพาะข้อมูลนโยบายและวิธีใช้งานทั่วไป ไม่เข้าถึงข้อมูลคำร้องหรือข้อมูลส่วนตัวของคุณ
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* ─────────────── 10. หลักเกณฑ์การคืน (สรุป) ─────────────── */}
      <section id="policy" className="scroll-mt-6 space-y-5">
        <SectionHeader
          icon={ScrollText}
          eyebrow="หลักเกณฑ์การคืน"
          title="เงื่อนไขสำคัญก่อนยื่นคำร้อง"
          intro="สรุปจากประกาศขององค์การเภสัชกรรม — อ่านฉบับเต็มได้ที่หน้าหลักเกณฑ์การรับคืนผลิตภัณฑ์"
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <XCircle className="h-4 w-4 text-red-500" strokeWidth={2.5} aria-hidden="true" />
              สินค้าที่ไม่รับคืน / แลกเปลี่ยน
            </h3>
            <ul className="mt-3 space-y-1.5">
              {POLICY_EXCLUDED.map((x) => (
                <li key={x} className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                  {x}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <ClipboardCheck className="h-4 w-4 text-primary" strokeWidth={2.5} aria-hidden="true" />
              เงื่อนไขการรับคืน
            </h3>
            <ul className="mt-3 space-y-1.5">
              {POLICY_CONDITIONS.map((x) => (
                <li key={x} className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                  {x}
                </li>
              ))}
            </ul>
            <p className="mt-3 rounded-md bg-secondary/50 p-3 text-xs leading-relaxed text-slate-600">
              <span className="font-bold text-foreground">ข้อยกเว้น:</span> หากเป็นความผิดพลาดขององค์การเภสัชกรรมเอง
              (ส่งผิดรายการ / ของชำรุดตั้งแต่ต้น) รับคืนหรือแลกเปลี่ยนได้โดยไม่ติดเงื่อนไขเวลาและสภาพสินค้า
            </p>
          </Card>
        </div>
        <Link
          href="/return-policy"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-bold text-primary transition-colors hover:border-primary/50"
        >
          <ScrollText className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
          อ่านหลักเกณฑ์ฉบับเต็ม
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
        </Link>
      </section>

      {/* ─────────────── 11. FAQ ─────────────── */}
      <section id="faq" className="scroll-mt-6 space-y-5">
        <SectionHeader icon={MessageCircle} eyebrow="คำถามที่พบบ่อย" title="ยังมีข้อสงสัยอยู่ใช่ไหม" />
        {/* มือถือ 1 คอลัมน์ / เดสก์ท็อป 2 คอลัมน์ — items-start กันการ์ดที่กางแล้วดันการ์ดข้างๆ ให้สูงตาม */}
        <div className="grid grid-cols-1 items-start gap-2.5 sm:grid-cols-2">
          {FAQS.map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </section>

      {/* ─────────────── 12. ช่องทางติดต่อ ─────────────── */}
      <section id="contact" className="scroll-mt-6">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Phone className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </span>
            <h2 className="text-lg font-bold text-foreground">ช่องทางการติดต่อ</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            หากพบปัญหาการใช้งาน หรือมีข้อสงสัยที่ผู้ช่วย GPO Spark ตอบไม่ได้ ติดต่อทีมงาน GPO สาขาภาคใต้ ได้ตามช่องทางนี้
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <a
              href="tel:074230547"
              className="flex flex-col gap-1.5 rounded-md border border-border p-3.5 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Phone className="h-4 w-4 text-primary" strokeWidth={2.5} aria-hidden="true" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">โทรศัพท์</span>
              <span className="font-mono text-sm font-bold text-foreground">074-230547</span>
            </a>
            <a
              href="mailto:gposouthhdy@gmail.com"
              className="flex flex-col gap-1.5 rounded-md border border-border p-3.5 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Mail className="h-4 w-4 text-primary" strokeWidth={2.5} aria-hidden="true" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">อีเมล</span>
              <span className="break-all text-sm font-bold text-foreground">gposouthhdy@gmail.com</span>
            </a>
            <a
              href="https://line.me/R/ti/p/@gpoofficial"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col gap-1.5 rounded-md border border-border p-3.5 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <MessageCircle className="h-4 w-4 text-primary" strokeWidth={2.5} aria-hidden="true" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">LINE OA</span>
              <span className="text-sm font-bold text-foreground">@gpoofficial</span>
            </a>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} aria-hidden="true" /> จ–ศ 8:00–16:00 น.
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Monitor className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} aria-hidden="true" /> ระบบออนไลน์ 24 ชม.
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} aria-hidden="true" /> GPO สาขาภาคใต้
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
