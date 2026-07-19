import Link from "next/link";
import {
  RefreshCw,
  CreditCard,
  Building2,
  Factory,
  Ban,
  ArrowRight,
  CalendarClock,
  ImageIcon,
  Download,
} from "lucide-react";

/**
 * ── ดีไซน์ Starbucks ชุดเดียวกับ /customer/history, /customer/tracking, /welcome ──
 * token/เหตุผลข้อยกเว้นเดียวกันทุกจุด (ฟอนต์ไทยคงเดิม, ไม่ใช้ Gold เพราะไม่มี
 * concept ระดับสมาชิก) ดูรายละเอียดเต็มได้ที่ HistoryPage.tsx
 *
 * เพิ่มเติมเฉพาะไฟล์นี้: ห่อ hero ด้วย rounded-xl overflow-hidden เพราะตอนนี้
 * component ถูกเรนเดอร์ในกล่องที่มี padding ของ (authenticated) layout
 * (max-w-5xl mx-auto p-4 md:p-8) ไม่ใช่เต็มจอแบบ public เดิมที่ตั้งใจไว้แต่แรก
 * ถ้าปล่อยเป็นสี่เหลี่ยมมุมฉากเต็มขอบจะดูเหมือนบล็อกสีลอยผิดที่ (เคยแก้จุดนี้
 * ไว้แล้วรอบก่อน แต่ไฟล์ที่แปะมารอบนี้เป็นเวอร์ชันก่อนแก้ จึงใส่กลับให้ด้วย)
 */

const CARD_SHADOW =
  "shadow-[0px_0px_0.5px_0px_rgba(0,0,0,0.14),0px_1px_1px_0px_rgba(0,0,0,0.24)]";
const BUTTON_ACTIVE = "transition-transform duration-200 ease-out active:scale-95";

type RuleRow = {
  icon: typeof RefreshCw;
  title: string;
  body: string;
  months: number;
  /** จุดเริ่มนับของกรอบเวลา แสดงเป็น pill เล็กๆ ใต้ตัวเลขใหญ่ */
  anchorLabel: string;
  chipTone: "green" | "accent" | "yellow";
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
    chipTone: "green",
    formType: "exchange",
  },
  {
    icon: CreditCard,
    title: "รับคืนเพื่อลดหนี้",
    body: "ต้องคืนเพื่อลดหนี้ภายในกำหนด นับจากวันที่ได้รับผลิตภัณฑ์",
    months: 1,
    anchorLabel: "นับจากวันรับสินค้า",
    chipTone: "accent",
    formType: "debt-reduction",
  },
];

const otherManufacturerRow: RuleRow = {
  icon: Building2,
  title: "ผลิตภัณฑ์ผู้ผลิตอื่น",
  body: "ต้องคืนก่อนวันหมดอายุตามกำหนด (องค์การเภสัชกรรมส่งต่อบริษัทผู้ผลิต)",
  months: 7,
  anchorLabel: "ก่อนวันหมดอายุ",
  chipTone: "yellow",
  // ไม่มี formType — เคสนี้ GPO เป็นคนส่งต่อให้บริษัทผู้ผลิตเอง ไม่ใช่คำร้องที่ลูกค้ายื่นในระบบนี้โดยตรง
};

// สีตามบทบาทที่สเปก Starbucks กำหนด — เขียว 2 เฉด (Starbucks Green / Green
// Accent) ใช้แยกเคส "แลกเปลี่ยน" กับ "ลดหนี้" ที่อยู่ในกลุ่ม GPO ผลิตเอง
// เดียวกัน (ทั้งคู่คือ "เขียวแบรนด์" แต่คนละเฉดสื่อว่าเป็นคนละ action)
// เหลือง (#fbbc05) สงวนไว้ให้เคสพิเศษที่ไม่ใช่ GPO ผลิตเองเท่านั้น
const chipStyles = {
  green: "bg-[#d4e9e2] text-[#006241]",
  accent: "bg-[#00754A]/10 text-[#00754A]",
  yellow: "bg-[#fbbc05]/20 text-amber-800",
} as const;

const badgeStyles = {
  green: "bg-[#006241] text-white",
  accent: "bg-[#00754A] text-white",
  yellow: "bg-[#fbbc05] text-amber-900",
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
    <div className={`rounded-xl bg-white p-5 ${CARD_SHADOW}`}>
      <div className="flex items-start gap-4">
        {/* ตัวเลขระยะเวลา — ใหญ่ เห็นปุ๊บเข้าใจปั๊บ ไม่ต้องตีความความยาวแถบ */}
        <div
          className={`flex w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-lg py-3 ${badgeStyles[row.chipTone]}`}
        >
          <span className="text-3xl font-semibold leading-none">{row.months}</span>
          <span className="mt-1 text-[11px] font-normal opacity-90">เดือน</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${chipStyles[row.chipTone]}`}
            >
              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </div>
            <h4 className="font-semibold text-black/[.87]">{row.title}</h4>
          </div>
          <p className="text-sm leading-relaxed text-black/[.58]">{row.body}</p>

          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#f9f9f9] px-3 py-1.5 text-xs font-normal text-black/[.58]">
            <CalendarClock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {row.anchorLabel}
          </div>

          {row.formType && (
            <div className="mt-3">
              <Link
                href={`/form?type=${row.formType}`}
                className={`inline-flex items-center gap-1.5 rounded-full border border-[#00754A] px-3.5 py-2 text-xs font-semibold text-[#00754A] ${BUTTON_ACTIVE}`}
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
 * ReturnPolicySection — Starbucks
 *
 * เขียว 2 เฉดแยก action ในกลุ่ม GPO ผลิตเอง (Starbucks Green/Green Accent),
 * เหลือง (#fbbc05) สำหรับเคสพิเศษที่ไม่ใช่ GPO ผลิตเอง, แดง (#c82014) สำหรับ
 * รายการต้องห้าม — ทุกสีคัดลอกจาก token จริงของสเปก ไม่ผสมเอง
 *
 * Server Component ล้วน ไม่มี client component ย่อย
 */
export function ReturnPolicySection() {
  return (
    <section className="w-full">
      {/* Hero — ห่อด้วยมุมมนเพราะตอนนี้อยู่ในกล่องที่มี padding ของ
          (authenticated) layout ไม่ใช่เต็มจอ */}
      <div className={`overflow-hidden rounded-xl ${CARD_SHADOW}`}>
        <div className="relative overflow-hidden bg-[#1E3932] px-6 pb-10 pt-16 sm:pb-12 sm:pt-20">
          {/* พื้นผิวจุดไข่ปลาจางๆ ให้พื้นสีทึบไม่แบนจนเกินไป */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)",
              backgroundSize: "18px 18px",
            }}
            aria-hidden="true"
          />

          <div className="relative mx-auto max-w-2xl tracking-[-0.01em]">
            {/* ตราประทับ — สื่อว่าเป็นเอกสารทางการที่อัปเดตล่าสุด */}
            <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-normal text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              ฉบับปรับปรุงล่าสุด
            </div>

            <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-white/70">
              นโยบายองค์การเภสัชกรรม
            </p>
            <h1 className="max-w-lg text-3xl font-semibold leading-[1.15] tracking-[-0.16px] text-white sm:text-4xl">
              หลักเกณฑ์การรับคืนผลิตภัณฑ์
            </h1>
            <p className="mt-3 max-w-md text-white/70">
              แนวทางการรับคืน แลกเปลี่ยน และลดหนี้ผลิตภัณฑ์ยา อ่านจบยื่นเรื่องได้ทันที
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl px-6 py-14 tracking-[-0.01em]">
        {/* กรณีที่รับคืน — แบ่ง 2 กลุ่มใหญ่ตามที่มาของผลิตภัณฑ์ */}
        <section aria-labelledby="cases-heading" className="mb-16">
          <h2
            id="cases-heading"
            className="mb-6 text-xs font-semibold uppercase tracking-widest text-black/[.58]"
          >
            กรณีที่รับคืน
          </h2>

          {/* กลุ่ม 1: ผลิตภัณฑ์ที่ GPO ผลิตเอง — แลกเปลี่ยน + ลดหนี้ อยู่ด้วยกัน
              เพราะเป็นสินค้ากลุ่มเดียวกัน ต่างแค่เงื่อนไขการคืน */}
          <div className="mb-6 rounded-xl bg-[#d4e9e2]/40 p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2 px-1">
              <Factory className="h-4 w-4 text-[#006241]" strokeWidth={2} aria-hidden="true" />
              <h3 className="text-sm font-semibold text-[#006241]">
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
          <div className="rounded-xl bg-[#fbbc05]/10 p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2 px-1">
              <Building2 className="h-4 w-4 text-amber-800" strokeWidth={2} aria-hidden="true" />
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
            className="mb-6 text-xs font-semibold uppercase tracking-widest text-black/[.58]"
          >
            สินค้าที่ไม่รับคืน / แลกเปลี่ยน
          </h2>
          <ul className={`overflow-hidden rounded-xl bg-white ${CARD_SHADOW}`}>
            {excludedItems.map((item, i) => (
              <li
                key={item}
                className={`flex gap-3 px-4 py-3.5 ${
                  i !== excludedItems.length - 1 ? "border-b border-black/[.06]" : ""
                }`}
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#c82014]/10 text-[#c82014]">
                  <Ban className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                </span>
                <span className="text-sm leading-relaxed text-black/[.58]">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* เงื่อนไขการส่งคืนสินค้า */}
        <section aria-labelledby="conditions-heading" className="mb-16">
          <h2
            id="conditions-heading"
            className="mb-6 text-xs font-semibold uppercase tracking-widest text-black/[.58]"
          >
            เงื่อนไขการส่งคืนสินค้า
          </h2>
          <ol className="space-y-3">
            {conditions.map((c, i) => (
              <li
                key={c.title}
                className={`flex gap-4 rounded-xl bg-white p-4 ${CARD_SHADOW}`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#006241] font-mono text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed text-black/[.58]">
                  <span className="font-semibold text-black/[.87]">{c.title}</span>
                  {" — "}
                  {c.text}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* เอกสารต้นฉบับ — ดาวน์โหลดไปอ้างอิงต่อได้ */}
        <section aria-labelledby="source-doc-heading" className="mb-16">
          <h2
            id="source-doc-heading"
            className="mb-6 text-xs font-semibold uppercase tracking-widest text-black/[.58]"
          >
            เอกสารต้นฉบับ
          </h2>
          <div
            className={`flex flex-col items-start gap-4 rounded-xl bg-white p-5 sm:flex-row sm:items-center sm:justify-between ${CARD_SHADOW}`}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#d4e9e2] text-[#006241]">
                <ImageIcon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-black/[.87]">
                  หลักเกณฑ์การรับคืนผลิตภัณฑ์ (ต้นฉบับ)
                </p>
                <p className="text-xs font-normal text-black/[.58]">
                  เอกสารอ้างอิงจากองค์การเภสัชกรรม · JPG
                </p>
              </div>
            </div>
            <a
              href="/document/return-policy-gpo.jpg"
              download
              className={`inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[#00754A] px-4 py-2.5 text-sm font-semibold text-white sm:w-auto ${BUTTON_ACTIVE}`}
            >
              <Download className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              ดาวน์โหลด JPG
            </a>
          </div>
        </section>

        {/* ข้อยกเว้น */}
        <footer className="rounded-xl bg-[#fbbc05]/10 p-5">
          <p className="text-sm leading-relaxed text-amber-900">
            <span className="font-semibold">ข้อยกเว้น</span> —
            หากเป็นเหตุผิดพลาดอันเกิดจากองค์การเภสัชกรรม
            ให้รับคืนหรือแลกเปลี่ยนสินค้าได้แล้วแต่กรณี
          </p>
        </footer>
      </div>
    </section>
  );
}

export default ReturnPolicySection;