import Link from "next/link";
import {
  RefreshCw,
  CreditCard,
  Building2,
  Factory,
  Ban,
  ArrowRight,
  CalendarClock,
} from "lucide-react";
import { StickyReturnCTA } from "./StickyReturnCTA";

/**
 * ── Font setup: เหมือนเดิม ไม่ต้องแก้ ──
 * ใช้ font-sans (Sarabun) เป็นหลัก, font-mono (IBM Plex Mono) สำหรับตัวเลข/รหัส
 * ตามที่ตั้งค่าไว้ใน app/layout.tsx + tailwind.config.ts แล้ว
 */

type RuleRow = {
  icon: typeof RefreshCw;
  title: string;
  body: string;
  months: number;
  /** จุดเริ่มนับของกรอบเวลา แสดงเป็น pill เล็กๆ ใต้ตัวเลขใหญ่ */
  anchorLabel: string;
  chipTone: "teal" | "coral" | "amber";
  /** ถ้ามีค่า = แสดงปุ่ม "ยื่นเรื่องแบบนี้" ต่อกรณี, ไม่มี = ไม่แสดง (เช่นกรณีที่ GPO ส่งต่อบริษัทผู้ผลิตเอง ไม่ใช่คำร้องที่ลูกค้ายื่นตรง) */
  formType?: "exchange" | "debt-reduction";
};

// กลุ่ม "gpo" = ผลิตภัณฑ์ที่องค์การเภสัชกรรมผลิตเอง (แลกเปลี่ยน/ลดหนี้ อยู่ด้วยกัน
// เพราะเป็นสินค้ากลุ่มเดียวกัน แค่คนละเงื่อนไขการคืน) — "other" = สินค้าที่ GPO
// แค่จัดจำหน่ายแทนผู้ผลิตรายอื่น จึงแยกกลุ่มเพราะกระบวนการหลังบ้านต่างกันจริง
// (ส่งต่อบริษัทผู้ผลิต ไม่ใช่ GPO รับคืนเอง)
const gpoOwnRows: RuleRow[] = [
  {
    icon: RefreshCw,
    title: "รับคืนเพื่อแลกเปลี่ยน",
    body: "สินค้าหมดอายุ ให้ส่งแลกเปลี่ยนภายในกำหนด นับจากวันที่สินค้าหมดอายุ",
    months: 6,
    anchorLabel: "นับจากวันหมดอายุ",
    chipTone: "teal",
    formType: "exchange",
  },
  {
    icon: CreditCard,
    title: "รับคืนเพื่อลดหนี้",
    body: "ต้องคืนเพื่อลดหนี้ภายในกำหนด นับจากวันที่ได้รับผลิตภัณฑ์",
    months: 1,
    anchorLabel: "นับจากวันรับสินค้า",
    chipTone: "coral",
    formType: "debt-reduction",
  },
];

const otherManufacturerRow: RuleRow = {
  icon: Building2,
  title: "ผลิตภัณฑ์ผู้ผลิตอื่น",
  body: "ต้องคืนก่อนวันหมดอายุตามกำหนด (องค์การเภสัชกรรมส่งต่อบริษัทผู้ผลิต)",
  months: 7,
  anchorLabel: "ก่อนวันหมดอายุ",
  chipTone: "amber",
  // ไม่มี formType — เคสนี้ GPO เป็นคนส่งต่อให้บริษัทผู้ผลิตเอง ไม่ใช่คำร้องที่ลูกค้ายื่นในระบบนี้โดยตรง
};

const chipStyles = {
  teal: "bg-teal-100 text-teal-700",
  coral: "bg-[#FDEBE8] text-[#C1432E]",
  amber: "bg-amber-100 text-amber-800",
} as const;

// badge ตัวเลขใหญ่ — ใช้สีเดียวกับ chip ไอคอน แต่เข้มขึ้นเพื่อให้อ่านง่ายในพื้นที่เล็ก
const badgeStyles = {
  teal: "bg-teal-600 text-white",
  coral: "bg-[#F97362] text-white",
  amber: "bg-amber-500 text-white",
} as const;

const excludedItems: string[] = [
  "ยาและผลิตภัณฑ์แช่เย็น (−20°C และ 2−8°C)",
  "ชุดช่วยเหลือผู้ประสบภัย · ชีววัตถุ · Oseltamivir · Favipiravir · Molnupiravir",
  "ยากัญชาหยดลิ้น 4 สูตร (CBD, THC, CBD:THC 1:1, THC FORTE)",
  "ยาเสพติด · วัตถุออกฤทธิ์ต่อจิตประสาท (Diazepam 2,5,10 mg // Diazepam inj. // Phenobarbital 30, 60 mg // Brown mixture 180, 450 ml)",
  "เครื่องสำอาง",
  "เฉพาะผลิตภัณฑ์ผู้ผลิตอื่น ไม่รับคืนแลกเปลี่ยน ยากำพร้า · กลุ่มยาต้านไวรัสเอดส์",
  'รายการสินค้าที่ระบุ "ไม่รับเปลี่ยนคืนสินค้า" ในใบส่งของ',
];

const conditions: { title: string; text: string }[] = [
  {
    title: "สินค้าต้องอยู่ในสภาพสมบูรณ์ ไม่ชำรุด",
    text: "บรรจุอยู่เต็มขนาดบรรจุ โดยแต่ละขนาดบรรจุต้องเป็นรุ่นการผลิตเดียวกัน พร้อมแนบเอกสารใบส่งของหรือหลักฐานการรับสินค้า",
  },
  {
    title: "สินค้าที่ได้รับจากการแลกเปลี่ยน",
    text: "Billing No. ขึ้นต้นด้วย 30X7 ไม่สามารถนำกลับมาแลกเปลี่ยนได้อีก",
  },
  {
    title: "สินค้าส่งเสริมการขายหรือรางวัลการขาย",
    text: "Billing No. ขึ้นต้นด้วย 30X8 ไม่สามารถแลกเปลี่ยนได้",
  },
  {
    title: "ในการรับคืนสินค้า",
    text: "องค์การเภสัชกรรม จะรับคืนสินค้าเฉพาะจากผู้ที่สั่งซื้อโดยตรงจากองค์การเภสัชกรรมเท่านั้น",
  },
];

/** การ์ดกรณีคืนสินค้า 1 ใบ — ใช้ร่วมกันทั้งกลุ่ม GPO ผลิตเองและกลุ่มผู้ผลิตอื่น */
function RuleCard({ row }: { row: RuleRow }) {
  const Icon = row.icon;
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        {/* ตัวเลขระยะเวลา — ใหญ่ เห็นปุ๊บเข้าใจปั๊บ ไม่ต้องตีความความยาวแถบ */}
        <div
          className={`flex w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-2xl py-3 ${badgeStyles[row.chipTone]}`}
        >
          <span className="text-3xl font-bold leading-none">{row.months}</span>
          <span className="mt-1 text-[11px] font-medium opacity-90">เดือน</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${chipStyles[row.chipTone]}`}
            >
              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </div>
            <h4 className="font-medium text-stone-900">{row.title}</h4>
          </div>
          <p className="text-sm leading-relaxed text-stone-500">{row.body}</p>

          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-500">
            <CalendarClock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {row.anchorLabel}
          </div>

          {row.formType && (
            <div className="mt-3">
              <Link
                href={`/form?type=${row.formType}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#F97362] px-3.5 py-2 text-xs font-medium text-[#C1432E] transition hover:bg-[#FDEBE8]"
              >
                ยื่นเรื่องแบบนี้
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * ReturnPolicySection — v3 (Clinical vibrant + CTA เชื่อมฟอร์ม)
 *
 * เปลี่ยนจาก v2 (editorial สีเรียบ) เพราะ feedback ว่าจืดชืดเกินไป
 * เพิ่มสีสันแบบมีเป้าหมาย: เขียว teal = โทนหลักองค์กร, ส้มคอรัล = สีเดียว
 * ที่ใช้กับ "การกระทำ" (ปุ่ม CTA + เคสลดหนี้ซึ่งกระทบเงินโดยตรง จึงเด่นสุด),
 * เหลืองอำพัน = เคสพิเศษ (ผู้ผลิตอื่น) ไม่ใช้สีไล่เฉดแบบสุ่ม — สีเดิมที่ใช้
 * แทน "การกระทำ" ในหน้านี้ (ปุ่ม, ลิงก์) คือคอรัลเท่านั้น ทำให้ปุ่มเด่นชัด
 * ท่ามกลางเนื้อหา ไม่ปนกับสีตกแต่งอื่น
 *
 * Server Component เหมือนเดิม ยกเว้น StickyReturnCTA ที่แยกเป็น client
 * component ต่างหาก (ต้องฟัง scroll event)
 */
export function ReturnPolicySection() {
  return (
    <section className="w-full">
      {/* Hero */}
      <div className="bg-gradient-to-br from-teal-700 to-teal-800 px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center sm:text-left">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-teal-200">
            นโยบายองค์การเภสัชกรรม
          </p>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
            หลักเกณฑ์การรับคืนผลิตภัณฑ์
          </h1>
          <p className="mt-3 max-w-md text-teal-100 sm:mx-0">
            แนวทางการรับคืน แลกเปลี่ยน และลดหนี้ผลิตภัณฑ์ยา อ่านจบยื่นเรื่องได้ทันที
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl px-6 py-14">
        {/* กรณีที่รับคืน — แบ่ง 2 กลุ่มใหญ่ตามที่มาของผลิตภัณฑ์ */}
        <section aria-labelledby="cases-heading" className="mb-16">
          <h2
            id="cases-heading"
            className="mb-6 text-xs font-semibold uppercase tracking-widest text-stone-400"
          >
            กรณีที่รับคืน
          </h2>

          {/* กลุ่ม 1: ผลิตภัณฑ์ที่ GPO ผลิตเอง — แลกเปลี่ยน + ลดหนี้ อยู่ด้วยกัน
              เพราะเป็นสินค้ากลุ่มเดียวกัน ต่างแค่เงื่อนไขการคืน */}
          <div className="mb-6 rounded-3xl border-2 border-teal-100 bg-teal-50/40 p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2 px-1">
              <Factory className="h-4 w-4 text-teal-700" strokeWidth={2} aria-hidden="true" />
              <h3 className="text-sm font-semibold text-teal-800">
                ผลิตภัณฑ์ที่องค์การเภสัชกรรมผลิตเอง
              </h3>
            </div>
            <div className="space-y-4">
              {gpoOwnRows.map((row) => (
                <RuleCard key={row.title} row={row} />
              ))}
            </div>
          </div>

          {/* กลุ่ม 2: ผู้ผลิตอื่น — แยกเพราะกระบวนการหลังบ้านต่างกันจริง
              (GPO ส่งต่อบริษัทผู้ผลิต ไม่ได้รับคืนเอง) */}
          <div className="rounded-3xl border-2 border-amber-100 bg-amber-50/40 p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2 px-1">
              <Building2 className="h-4 w-4 text-amber-700" strokeWidth={2} aria-hidden="true" />
              <h3 className="text-sm font-semibold text-amber-800">
                ผลิตภัณฑ์ผู้ผลิตอื่นที่จัดจำหน่ายโดยองค์การฯ
              </h3>
            </div>
            <div className="space-y-4">
              <RuleCard row={otherManufacturerRow} />
            </div>
          </div>
        </section>

        {/* สินค้าที่ไม่รับคืน / แลกเปลี่ยน */}
        <section aria-labelledby="excluded-heading" className="mb-16">
          <h2
            id="excluded-heading"
            className="mb-6 text-xs font-semibold uppercase tracking-widest text-stone-400"
          >
            สินค้าที่ไม่รับคืน / แลกเปลี่ยน
          </h2>
          <ul className="overflow-hidden rounded-2xl border border-stone-200">
            {excludedItems.map((item, i) => (
              <li
                key={item}
                className={`flex gap-3 bg-white px-4 py-3.5 ${
                  i !== excludedItems.length - 1 ? "border-b border-stone-100" : ""
                }`}
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                  <Ban className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                </span>
                <span className="text-sm leading-relaxed text-stone-600">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* เงื่อนไขการส่งคืนสินค้า */}
        <section aria-labelledby="conditions-heading" className="mb-16">
          <h2
            id="conditions-heading"
            className="mb-6 text-xs font-semibold uppercase tracking-widest text-stone-400"
          >
            เงื่อนไขการส่งคืนสินค้า
          </h2>
          <ol className="space-y-3">
            {conditions.map((c, i) => (
              <li
                key={c.title}
                className="flex gap-4 rounded-2xl border border-stone-200 bg-white p-4"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-600 font-mono text-xs font-medium text-white">
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed text-stone-600">
                  <span className="font-medium text-stone-900">{c.title}</span>
                  {" — "}
                  {c.text}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* ข้อยกเว้น */}
        <footer className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm leading-relaxed text-amber-900">
            <span className="font-semibold">ข้อยกเว้น</span> —
            หากเป็นเหตุผิดพลาดอันเกิดจากองค์การเภสัชกรรม
            ให้รับคืนหรือแลกเปลี่ยนสินค้าได้แล้วแต่กรณี
          </p>
        </footer>
      </div>

      <StickyReturnCTA />
    </section>
  );
}

export default ReturnPolicySection;