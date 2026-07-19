import Link from "next/link";
import {
  RefreshCw,
  CreditCard,
  Building2,
  Ban,
  ArrowUpRight,
  Clock,
  Download,
} from "lucide-react";

/**
 * ── ทำไมรีดีไซน์รอบนี้ต่างจากทุกรอบก่อนหน้า ──────────────────────────
 * ทุกเวอร์ชันที่ผ่านมา (vibrant, Lovable, Starbucks) ใช้โครงเดียวกันหมด:
 * hero บล็อกสีทึบเต็มแถบ + การ์ดกริดไอคอนสี — เป็นแพทเทิร์นเทมเพลตที่พบ
 * บ่อยที่สุดในหน้า AI-generated SaaS ทั่วไป ต่อให้เปลี่ยนสีให้เข้าธีมไหนก็
 * ยังอ่านเป็น "หน้าเว็บ SaaS" อยู่ดี — รอบนี้เปลี่ยนวิธีคิดใหม่: เนื้อหานี้
 * คือ "เอกสารหลักเกณฑ์ทางการ" ไม่ใช่หน้า marketing จึงออกแบบให้อ่านเหมือน
 * เอกสารที่จัดวางตัวอักษรมาอย่างดี (editorial) แทน — ไม่มี hero บล็อกสี,
 * ไม่มีการ์ดไอคอนสีสด ใช้เส้นบางๆ (hairline) แบ่งหมวดแทนกล่อง และใช้
 * font-serif (Noto Serif Thai ที่ตั้งค่าไว้ในโปรเจกต์อยู่แล้ว) กับหัวข้อ
 * ให้น้ำหนักแบบเอกสารทางการ ตัดกับ font-sans (Sarabun) ในเนื้อความ
 *
 * Signature ของหน้านี้: แถบสัดส่วนระยะเวลาเล็กๆ ข้างตัวเลขแต่ละกรณี
 * (มาตราส่วนเดียวกันทั้ง 3 กรณี 0–7 เดือน) ทำให้ "6 เดือน" กับ "1 เดือน"
 * เทียบสัดส่วนกันได้จริงด้วยสายตา ไม่ใช่แค่ตัวเลขลอยแยกกันคนละกล่อง
 * ──────────────────────────────────────────────────────────────────── */

type RuleRow = {
  icon: typeof RefreshCw;
  title: string;
  body: string;
  months: number;
  anchorLabel: string;
  tone: "teal" | "amber";
  formType?: "exchange" | "debt-reduction";
};

const SCALE_MAX_MONTHS = 7;

const gpoOwnRows: RuleRow[] = [
  {
    icon: RefreshCw,
    title: "รับคืนเพื่อแลกเปลี่ยน",
    body: "สินค้าหมดอายุ ให้ส่งแลกเปลี่ยนภายในกำหนด นับจากวันที่สินค้าหมดอายุ",
    months: 6,
    anchorLabel: "นับจากวันหมดอายุ",
    tone: "teal",
    formType: "exchange",
  },
  {
    icon: CreditCard,
    title: "รับคืนเพื่อลดหนี้",
    body: "ต้องคืนเพื่อลดหนี้ภายในกำหนด นับจากวันที่ได้รับผลิตภัณฑ์",
    months: 1,
    anchorLabel: "นับจากวันรับสินค้า",
    tone: "teal",
    formType: "debt-reduction",
  },
];

const otherManufacturerRow: RuleRow = {
  icon: Building2,
  title: "ผลิตภัณฑ์ผู้ผลิตอื่น",
  body: "ต้องคืนก่อนวันหมดอายุตามกำหนด (องค์การเภสัชกรรมส่งต่อบริษัทผู้ผลิต)",
  months: 7,
  anchorLabel: "ก่อนวันหมดอายุ",
  tone: "amber",
};

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

const toneText = { teal: "text-[#0F6D63]", amber: "text-[#B5651D]" } as const;
const toneBar = { teal: "bg-[#0F6D63]", amber: "bg-[#B5651D]" } as const;
const toneRing = { teal: "border-[#0F6D63]/30", amber: "border-[#B5651D]/30" } as const;

/** แถวกรณีคืนสินค้า 1 รายการ — เลขเดือนเป็นสีหมึกธรรมดา ไม่ใช่ป้ายสี
 *  จุดที่สื่อ "ระยะเวลา" จริงๆ คือแถบสัดส่วนเล็กๆ ข้างล่างชื่อกรณี */
function RuleRow({ row }: { row: RuleRow }) {
  const Icon = row.icon;
  const pct = Math.round((row.months / SCALE_MAX_MONTHS) * 100);
  return (
    <div className="flex gap-5 border-b border-[#E7E5E2] py-7 last:border-b-0">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${toneRing[row.tone]} ${toneText[row.tone]}`}
      >
        <Icon className="h-[17px] w-[17px]" strokeWidth={1.5} aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h4 className="font-serif text-base font-semibold text-[#12181B]">{row.title}</h4>
          <span className={`font-mono text-[26px] font-semibold leading-none tabular-nums ${toneText[row.tone]}`}>
            {row.months}
            <span className="ml-1.5 font-sans text-xs font-normal tracking-wide text-[#6B7280]">เดือน</span>
          </span>
        </div>

        <p className="mt-2 max-w-prose text-sm leading-relaxed text-[#6B7280]">{row.body}</p>

        {/* แถบสัดส่วนระยะเวลา — มาตราส่วนเดียวกันทุกกรณี (0–7 เดือน) */}
        <div className="mt-4 flex items-center gap-2.5">
          <div className="h-[2px] w-28 shrink-0 rounded-full bg-[#E7E5E2]">
            <div
              className={`h-full rounded-full ${toneBar[row.tone]}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="flex items-center gap-1 text-xs text-[#6B7280]">
            <Clock className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
            {row.anchorLabel}
          </span>
        </div>

        {row.formType && (
          <Link
            href={`/form?type=${row.formType}`}
            className={`mt-4 inline-flex items-center gap-1.5 rounded-full border ${toneRing[row.tone]} ${toneText[row.tone]} px-3.5 py-1.5 text-xs font-medium tracking-wide transition hover:bg-[#12181B] hover:text-white hover:border-[#12181B]`}
          >
            ยื่นเรื่องแบบนี้
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#6B7280]">
      {children}
    </h2>
  );
}

/**
 * ReturnPolicySection — editorial document redesign
 *
 * ไม่มี hero บล็อกสี ไม่มีการ์ดไอคอนสี — จัดวางแบบเอกสารทางการที่พิมพ์มา
 * อย่างดี: หัวข้อ serif, เนื้อความ sans, เส้นบางคั่นหมวดแทนกล่อง, ตัวเลข
 * ระยะเวลาเทียบสัดส่วนกันได้จริงด้วยแถบเล็กๆ ใต้แต่ละกรณี
 */
export function ReturnPolicySection() {
  return (
    <section className="w-full bg-[#FCFBF9]">
      {/* Header — letterhead: เส้นคู่บางบน-ล่าง + ตราประทับมุมขวาให้น้ำหนักทางการ */}
      <header className="mx-auto max-w-4xl px-6 pb-10 pt-14 sm:pt-20">
        <div className="mb-8 flex items-start justify-between border-b border-t border-[#E7E5E2] py-3">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-[#0F6D63]">
            นโยบายองค์การเภสัชกรรม
          </p>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#0F6D63]/30 font-serif text-[10px] font-semibold text-[#0F6D63]">
            GPO
          </div>
        </div>

        <h1 className="font-serif text-[2.1rem] font-semibold leading-[1.18] tracking-tight text-[#12181B] sm:text-[2.75rem]">
          หลักเกณฑ์การรับคืนผลิตภัณฑ์
        </h1>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[#6B7280]">
          แนวทางการรับคืน แลกเปลี่ยน และลดหนี้ผลิตภัณฑ์ยา อ่านจบยื่นเรื่องได้ทันที
        </p>
        <a
          href="/document/return-policy-gpo.jpg"
          download
          className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-[#0F6D63]/30 px-3.5 py-1.5 text-xs font-medium tracking-wide text-[#0F6D63] transition hover:border-[#12181B] hover:bg-[#12181B] hover:text-white"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          ดาวน์โหลดเอกสารต้นฉบับ (JPG)
        </a>
      </header>

      <div className="mx-auto w-full max-w-4xl bg-white px-6 pb-16 shadow-[0_0_0_1px_rgba(18,24,27,0.05)] sm:rounded-t-2xl sm:px-10 sm:pt-2">
        {/* กรณีที่รับคืน */}
        <section aria-labelledby="cases-heading" className="mb-20">
          <SectionLabel>กรณีที่รับคืน</SectionLabel>

          <div className="mb-8">
            <h3 className="mb-1 font-serif text-lg font-semibold text-[#12181B]">
              ผลิตภัณฑ์ที่องค์การเภสัชกรรมผลิตเอง
            </h3>
            <p className="mb-2 text-sm text-[#6B7280]">
              แลกเปลี่ยนและลดหนี้ อยู่ในสินค้ากลุ่มเดียวกัน ต่างแค่เงื่อนไขการคืน
            </p>
            <div>
              {gpoOwnRows.map((row) => (
                <RuleRow key={row.title} row={row} />
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-1 font-serif text-lg font-semibold text-[#12181B]">
              ผลิตภัณฑ์ผู้ผลิตอื่นที่จัดจำหน่ายโดยองค์การฯ
            </h3>
            <p className="mb-2 text-sm text-[#6B7280]">
              องค์การเภสัชกรรมส่งต่อบริษัทผู้ผลิต ไม่ได้รับคืนเอง
            </p>
            <div>
              <RuleRow row={otherManufacturerRow} />
            </div>
          </div>
        </section>

        {/* สินค้าที่ไม่รับคืน / แลกเปลี่ยน */}
        <section aria-labelledby="excluded-heading" className="mb-20">
          <SectionLabel>สินค้าที่ไม่รับคืน / แลกเปลี่ยน</SectionLabel>
          <ul className="max-w-prose">
            {excludedItems.map((item, i) => (
              <li
                key={item}
                className={`flex gap-3 py-3 text-sm leading-relaxed text-[#12181B]/80 ${
                  i !== excludedItems.length - 1 ? "border-b border-[#E7E5E2]" : ""
                }`}
              >
                <Ban
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#B5651D]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* เงื่อนไขการส่งคืนสินค้า */}
        <section aria-labelledby="conditions-heading" className="mb-20">
          <SectionLabel>เงื่อนไขการส่งคืนสินค้า</SectionLabel>
          <ol className="max-w-prose">
            {conditions.map((c, i) => (
              <li
                key={c.title}
                className={`flex gap-4 py-4 ${
                  i !== conditions.length - 1 ? "border-b border-[#E7E5E2]" : ""
                }`}
              >
                <span className="font-mono text-sm text-[#6B7280]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="text-sm leading-relaxed text-[#12181B]/80">
                  <span className="font-semibold text-[#12181B]">{c.title}</span>
                  {" — "}
                  {c.text}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* ข้อยกเว้น */}
        <footer className="rounded-lg border border-[#E7E5E2] bg-[#FCFBF9] px-6 py-5">
          <p className="font-serif text-[15px] italic leading-relaxed text-[#12181B]/80">
            <span className="not-italic font-semibold text-[#12181B]">ข้อยกเว้น</span> —
            หากเป็นเหตุผิดพลาดอันเกิดจากองค์การเภสัชกรรม
            ให้รับคืนหรือแลกเปลี่ยนสินค้าได้แล้วแต่กรณี
          </p>
        </footer>
      </div>
    </section>
  );
}

export default ReturnPolicySection;