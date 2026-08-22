# Design system — GPO Xchange Portal

แนวทาง UI ที่ใช้อยู่: **Option B — Institutional Green** (ดูที่มา/ตัวเลือกอื่นในเอกสารเสนอทิศทางที่คุยกันไว้ก่อนหน้า) เก็บสีเขียวแบรนด์เดิมของระบบไว้ ตัดของตกแต่งที่ทำให้หน้าตาดูเป็นเทมเพลต AI ออก ใช้แล้วที่:

- [app/admin/manager/page.tsx](app/admin/manager/page.tsx) — hub
- [app/admin/sale/page.tsx](app/admin/sale/page.tsx) — hub
- [app/admin/sale/history/page.tsx](app/admin/sale/history/page.tsx)
- [app/admin/sale/workflow/page.tsx](app/admin/sale/workflow/page.tsx)
- [app/admin/sale/component/SaleActiveWorkflow.tsx](app/admin/sale/component/SaleActiveWorkflow.tsx)
- [components/StatCard.tsx](components/StatCard.tsx), [components/MiniStat.tsx](components/MiniStat.tsx) — component กลาง แก้ตรงตัว component แล้ว (ไม่ใช่แค่ prop สี) จึงส่งผลถึงทุกหน้าที่ใช้ร่วมด้วย (CSR, WH, Logistics, Manager staff-approvals) — ดูหมายเหตุท้ายไฟล์
- [app/admin/manager/tracking/page.tsx](app/admin/manager/tracking/page.tsx) — เคยพลาดตอนทำ Manager hub รอบแรก (ตัวหน้านี้ไม่ได้ผูกกับ hub โดยตรง) แก้ตามให้ตรงตอนทำ CSR tracking คู่แฝด

**โซน Manager ทำครบทุกหน้าย่อยแล้ว** (hub เคยทำไปก่อนหน้านี้แล้ว รอบนี้ไล่หน้าย่อยที่เหลือ):

- [app/admin/manager/sla/page.tsx](app/admin/manager/sla/page.tsx) — SLA Monitoring System ทั้ง 3 แท็บ (ภาพรวม/ตั้งค่ากฎ/Audit Trail) — `TAB_ACCENTS` เดิมมี 3 โทน (แดง/ม่วง/ทีล) พร้อม glow shadow + gradient bar ต่อแท็บ ลดเหลือ 2 กลุ่ม: `red` (destructive) สำหรับแท็บ "ภาพรวม SLA" เพราะเกี่ยวกับใบงานเกินกำหนดจริง กับ `neutral` (accent) สำหรับอีก 2 แท็บที่ไม่มีความหมายเชิงสถานะ — ตัด glow/gradient bar ออกหมด เหลือแท่งซ้าย 1px สีทึบ
- [app/admin/manager/staff-approvals/page.tsx](app/admin/manager/staff-approvals/page.tsx) — 4 แท็บ (จัดการสิทธิ์พนักงาน/ใบงานทั้งหมด/ภาพรวม & สถิติ/รายงานผู้บริหาร) — เดิม `TAB_ACCENTS` มี 4 โทน (indigo/violet/gold/teal) ทั้งที่ไม่มีแท็บไหนเป็นสถานะเชิงความหมายเลย ตัดออกทั้งหมดเหลือ accent เดียว, ปุ่ม/ไอคอนหมวดต่างๆ (จัดการสิทธิ์=ส้ม, ใบงานทั้งหมด=น้ำเงิน, รายงาน=ทีล, พอร์ตลูกค้า=อำพัน) รวมเป็น `bg-accent`/`text-accent-foreground` เดียวกันหมด
- [app/admin/manager/staff-approvals/component/ManagerInsights.tsx](app/admin/manager/staff-approvals/component/ManagerInsights.tsx) — dashboard กราฟ (ใช้ร่วมกับ `app/admin/csr/reports/page.tsx` ด้วย) — แก้เฉพาะ **UI chrome** (การ์ด wrapper, ไอคอนหัวข้อ, toggle ปุ่ม, font size/weight) ส่วน **สี chart ภายใน recharts ไม่แตะ** (`fill`, `stroke`, `tick.fill`, `contentStyle` ของ `<Tooltip>`) เพราะเป็น raw hex ที่ recharts SVG props ต้องการจริง ไม่ใช่ Tailwind class ได้ — ชุดสี categorical (`PALETTE`, `REQUEST_TYPE_COLORS`) เป็นของที่ถูกต้องแล้วสำหรับกราฟ (กราฟต้องการสีแยกแยะประเภทจริง ต่างจาก UI ตกแต่งที่ควรเหลือ accent เดียว)
  - **`accentBg`/`accentColor` ของการ์ดสถิติ (ไม่ใช่ตัวกราฟ)** — รอบแรกรวมเป็น `bg-accent` เดียวหมด (11 สีรุ้งเดิม → เขียวเดียว) แต่ผู้ใช้ feedback ว่าแบนไปสำหรับหน้า analytics โดยเฉพาะ ขอสีสันกลับมาบ้างแบบเดียวกับแถบ MiniStat ของ CSR — รอบสองจึงจัดกลุ่มสีตาม**ประเภทตัวเลข** แทนการสุ่มต่อการ์ด: `blue-100/blue-600` = ตัวเลขจำนวน/นับ (ใบงาน, ลูกค้าตามจำนวน, จังหวัดตามจำนวน), `emerald-100/emerald-600` = ตัวเลขมูลค่า/เงินบาท, `amber-100/amber-600` = เวลา/ระยะเวลา, `violet-100/violet-600` = หมวดหมู่เชิงเหตุผล (เหตุผลที่ลูกค้าส่งเรื่อง), `rose-100/rose-600` = ข้อมูลเกี่ยวกับยา, `bg-destructive/10`/`text-destructive` = การปฏิเสธ (คงเดิมจากรอบแรก) — **กติกา**: การ์ด analytics/stat-dashboard แบบนี้ยกเว้นจากกฎ "accent เดียว" ได้ ถ้าจัดกลุ่มสีตามความหมายของตัวเลข (ไม่ใช่สุ่มสีต่อการ์ดแบบเดิม) ต่างจาก tile นำทาง/action ปกติที่ยังต้องเป็น accent เดียวเหมือนเดิม

**โซน CSR ทำครบทุกหน้าแล้ว (hub + หน้าย่อยทั้งหมด รวมเนื้อหา ไม่ใช่แค่ topbar):**

- [app/admin/csr/page.tsx](app/admin/csr/page.tsx) — hub
- [app/admin/csr/dashboard/page.tsx](app/admin/csr/dashboard/page.tsx) — topbar + เนื้อหาทั้งหมด: stat cards, sidebar tabs, sub-tabs, ตารางใบงาน, Active Workflow board, 3 confirm modal
- [app/admin/csr/customers/page.tsx](app/admin/csr/customers/page.tsx) — topbar + ทั้ง 4 แท็บ (รออนุมัติ/ต่ออายุ/ค้นหา/Export) + เอกสารโมดัล
- [app/admin/csr/reports/page.tsx](app/admin/csr/reports/page.tsx) — topbar + filter bar + ตาราง + pagination (ไม่รวม `ManagerInsights` ที่ import มาใช้ — component แยกไฟล์ ยังไม่ได้แตะ)
- [app/admin/csr/chatbot/page.tsx](app/admin/csr/chatbot/page.tsx) — topbar + เนื้อหา
- [app/admin/csr/tracking/page.tsx](app/admin/csr/tracking/page.tsx) — ตัวหน้าเต็มรูปแบบ (topbar + wrapper) เนื้อหาหลักอยู่ใน `TrackingDetailView.tsx` ด้านล่าง

**โซน WH/Logistics ทำครบแล้ว** (ไม่มี hub ของตัวเอง — แต่ละแผนกมีแค่หน้า dashboard เดียว ไม่มี customers/reports/chatbot แบบ CSR):

- [app/admin/wh/dashboard/page.tsx](app/admin/wh/dashboard/page.tsx) — topbar + hero + local StatCard/TabButton + WHRequestList + RequestCard confirm/hint banner (ตัดอีโมจิ 🏭 ออก ใช้ไอคอน `Warehouse` แทน, ตัดตัวอักษรลูกศร "←" ออก ใช้ `ArrowLeft` แทน ให้ตรงกับปุ่มย้อนกลับหน้าอื่นทั้งระบบ) — เพิ่ม liveliness รอบหลังแล้ว (ดูหัวข้อ "ความมีชีวิตชีวา" ด้านล่าง)
- [app/admin/wh/dashboard/component/WHDrugrow.tsx](app/admin/wh/dashboard/component/WHDrugrow.tsx) — แถวรายการยา + 3 confirm modal (ตรวจรับ/จัดเก็บ/ปฏิเสธ) — `MODAL_META` เปลี่ยนจาก inline gradient string เป็น Tailwind class (`solidBg`) ตามหลักการเดียวกับที่ปรับ CSR dashboard modal
- [app/admin/logistics/dashboard/page.tsx](app/admin/logistics/dashboard/page.tsx) — topbar + hero + local StatCard/TabButton + LogisticsRequestList + ปุ่มส่งรถ (คงสีน้ำเงินไว้ตามเดิม เพราะ "ส่งรถ" ทำให้สถานะเข้ากลุ่ม in-transit ตรงกับ semantic "กำลังดำเนินการ=น้ำเงิน" อยู่แล้ว) + ตัดตัวอักษร "▾" ออก ใช้ `ChevronDown` แทน — เพิ่ม liveliness รอบหลังแล้ว (ดูหัวข้อ "ความมีชีวิตชีวา" ด้านล่าง)
- [app/admin/logistics/dashboard/component/LOGDrugrow.tsx](app/admin/logistics/dashboard/component/LOGDrugrow.tsx) — แถวรายการยา + confirm modal เดียว (ตรวจรับ/ปฏิเสธ)

พบบั๊กระหว่างแก้ WH dashboard: การลบ wrapper div ชั้นนอกของ confirm banner (Step 1b) โดยไม่ลบ closing tag คู่กัน ทำให้ JSX ไม่ balance (`tsc` จับได้ทันทีเป็น syntax error) — เป็นเหตุผลว่าทำไมต้องรัน `tsc --noEmit` หลังทุกการแก้ไขที่ลด/เพิ่มระดับ wrapper div ไม่ใช่แค่เปลี่ยน className
- [components/tracking/TrackingDetailView.tsx](components/tracking/TrackingDetailView.tsx) — component กลาง ใช้ร่วมกับหน้า Track & Trace ของ Manager **และหน้าติดตามสถานะของลูกค้าเอง** (`app/(authenticated)/customer/tracking/page.tsx`) ไฟล์นี้ไม่มี hex ผิดมาตรฐานอยู่แล้ว (เขียนดีมาก่อน) แก้แค่จุดเล็ก: gradient icon, `font-black`, `rounded-2xl/3xl`→`rounded-lg`, `shadow-sm/2xl`→ตัด/ลดเหลือ `shadow-lg` เฉพาะ modal, `text-[10px]`→`text-[11px]` — **ผลข้างเคียงที่ตั้งใจ**: หน้าติดตามสถานะฝั่งลูกค้าได้รับการแก้ไปด้วยจุดเล็กๆ เหล่านี้ แม้ยังไม่ได้ทำ Option B เต็มรูปแบบให้ทั้งโซนลูกค้า
- [components/skeletons/DashboardSkeleton.tsx](components/skeletons/DashboardSkeleton.tsx) — `SkeletonSidebarTabs`, `SkeletonSubTabs`, `SkeletonFilterBar`, `SkeletonTableRows`, `SkeletonSimpleRows`, `SkeletonTopBar`, `SkeletonStatCards`, และ default `bgClassName` ของ `StaffDashboardSkeleton` แก้ตามให้ตรง token ใหม่แล้วทั้งหมด (ใช้ร่วมกับ WH/Logistics ด้วย — ดูหมายเหตุท้ายไฟล์)

ไฟล์นี้คือ reference ตอนจะทำหน้าอื่นต่อ ให้ผลลัพธ์ออกมาสม่ำเสมอกันทั้งระบบ

## หลักการ

1. **Accent เดียวทั้งระบบ** — สีเขียวแบรนด์ (`--primary`) เท่านั้นที่ใช้เป็นของตกแต่ง/CTA แต่ละหน้า/แต่ละ tile ห้ามคิดสีของตัวเอง (เดิมเป็นปัญหาหลัก: หน้า manager ใช้ม่วง/ทอง/ทีล/แดงปนกัน, หน้า sale ใช้ indigo/ทอง/ส้ม/อำพัน — เห็นแล้วรู้ทันทีว่าไม่มีระบบ)
2. **สีเชิงความหมาย (semantic) แยกจาก accent** — สีที่สื่อสถานะจริง (รอ/เสร็จ/ปฏิเสธ/เกินกำหนด) ยังคงแยกสีได้ตามความหมาย ไม่ใช่ข้อยกเว้นของกฎข้อ 1 เพราะสีตรงนี้ "บอกอะไรบางอย่าง" ไม่ใช่การตกแต่ง — ดูตารางด้านล่าง
3. **ไม่มี gradient ตกแต่ง** — ห้ามใช้ `bg-gradient-to-br`, `linear-gradient(...)`, blob วงกลมลอยพื้นหลัง, noise texture ทุกจุดที่ไม่ได้สื่อความหมายอะไร (เคยมี 29 ไฟล์ใช้ gradient แบบนี้)
4. **Radius 2 ระดับเท่านั้น** — ไม่ไล่ `rounded-xl` → `rounded-3xl` แบบสุ่มอีกต่อไป
5. **เงาน้อยที่สุด** — ใช้ border 1px แทน `shadow-md/lg/xl/2xl` สีตามธีมการ์ด เงามีไว้เฉพาะ hover ของ tile ที่คลิกได้ (เปลี่ยนสี border ตอน hover ไม่ใช่เพิ่มเงา)
6. **Weight ตามลำดับชั้นจริง** — เลิกใช้ `font-black` เกร่อทุก label (เคยมี 157 จุด) เมื่อทุกอย่างหนักเท่ากันหมด ไม่มีอะไรเด่นจริง
7. **Animation มีความหมายเท่านั้น** — `animate-pulse`/`animate-ping` ใช้ได้เฉพาะจุดที่สื่อสถานะ live จริง (เช่น "Active" ของบัญชี) ไม่ใช่จุดตกแต่งเปล่าๆ (เช่น dot หน้าคำว่า "ยินดีต้อนรับ" — ตัดออก)
8. **Font size floor = 11px ไม่มีข้อยกเว้น** — ห้ามมี `text-[9px]`/`text-[10px]`/`text-[10.5px]` อีก ภาษาไทยต้องการพื้นที่แนวตั้งมากกว่าอังกฤษ (สระบน-ล่าง/วรรณยุกต์) ที่ขนาดต่ำกว่านี้อ่านไม่ออกจริงโดยเฉพาะมือถือ — ดูสเกลเต็มด้านล่าง
9. **Icon stroke width ตามขนาด** — ไอคอนหลัก/ใหญ่ (≥20px เช่น icon header, hero) ใช้ default lucide `2` ไม่ใส่ prop ก็ได้ — ไอคอนเล็กในชิป/badge/ปุ่มจิ๋ว (<16px) ใช้ `2.5` เพราะเส้นบางจะจางหายที่ขนาดเล็ก ห้ามสลับใช้ `2.25` ปนแบบสุ่ม
10. **ข้อยกเว้นกฎ accent เดียว: สี categorical ของกราฟ (recharts)** — ชุดสีที่ใช้แยกประเภทข้อมูลในกราฟ (`fill`/`stroke`/`tick.fill` ของแท่ง/เส้น/แกน, `PALETTE`/`REQUEST_TYPE_COLORS` ใน `ManagerInsights.tsx`) ไม่ต้องรวมเป็น accent เดียว เพราะกราฟต้องมีสีแยกแยะประเภทจริงถึงจะอ่านออก (ตรงข้ามกับ UI ตกแต่งที่ควรมีสีเดียว) และ recharts SVG props รับได้แค่ raw hex ไม่รับ Tailwind class อยู่แล้ว — ที่ต้องแก้คือแค่ **UI chrome รอบกราฟ** (การ์ด wrapper, ไอคอนหัวข้อ, toggle ปุ่ม) ไม่ใช่สีข้างในกราฟเอง
11. **ข้อยกเว้นกฎ accent เดียว: การ์ดสถิติในหน้า analytics** — ต่างจาก tile นำทาง/action ทั่วไปที่ต้อง accent เดียวเสมอ การ์ดสรุปตัวเลขในหน้าสถิติ (เช่น `ManagerInsights.tsx`) ใส่สีได้หลายโทน **ถ้าจัดกลุ่มตามความหมายของตัวเลข** ไม่ใช่สุ่มสีต่อการ์ด — ดูตัวอย่างการจัดกลุ่มที่ใช้จริงในหัวข้อแรกของไฟล์นี้ (บรรทัด ManagerInsights.tsx)
12. **Flat ไม่ได้แปลว่าไม่มีชีวิตชีวา** — หลังตัด gradient/เงาเยอะ/สีรุ้งออกหมดตามกฎ 1-6 ห้ามปล่อยให้หน้าดูเย็นชา ให้เพิ่มชีวิตชีวากลับด้วย hero glow วงเดียว + hero quick-stat + hover lift เฉพาะ element ที่คลิกได้จริง + เงาสีตามสีของ element เอง เท่านั้น (ไม่ใช้ gradient หลายสี/บล็อบสุ่มสี/glassmorphism) — ดูรายละเอียดเต็มที่หัวข้อ "ความมีชีวิตชีวา" ด้านล่าง

## Token (มาจาก `app/globals.css` เดิม ไม่ได้เพิ่มใหม่)

ทุกอย่างอิง CSS variable ที่ตั้งไว้แล้วในระบบ ไม่ hardcode hex ในหน้าใหม่อีก:

| Tailwind class | ใช้ทำอะไร |
|---|---|
| `bg-background` | พื้นหลังหน้า (paper neutral อุ่นๆ) |
| `bg-card` / `border-border` | พื้นการ์ด + เส้นขอบมาตรฐาน |
| `bg-primary` / `text-primary-foreground` | พื้นทึบสีเขียวแบรนด์ — ใช้กับ hero และปุ่ม/ลิงก์หลักเท่านั้น |
| `text-primary` | ข้อความ/ไอคอน accent บนพื้นขาว (CTA text, icon สีเดียวไม่มีกล่อง) |
| `bg-accent` / `text-accent-foreground` | ไอคอนสี่เหลี่ยมทึบ (เขียวอ่อน+เขียวเข้ม) แทนไอคอนไล่เฉด, ใช้กับ chip ข้อมูลทั่วไปที่ไม่ใช่สถานะ |
| `bg-secondary` / `text-muted-foreground` | พื้นที่ placeholder / disabled / "เร็วๆ นี้" |
| `border-destructive` / `bg-destructive/10` / `text-destructive` | เฉพาะสถานะเร่งด่วน/ผิดพลาดจริง (เช่น SLA เกินกำหนด) |

Radius: `rounded-md` (การ์ดย่อย/ไอคอน/ปุ่ม) และ `rounded-lg` (การ์ดหลัก) — ไม่ใช้ `rounded-xl` ขึ้นไป

## Type scale

| ระดับ | ขนาด | ใช้กับ |
|---|---|---|
| Micro label | `text-[11px]` (+ `uppercase tracking-wide` ถ้าเป็น section label) | ป้ายหมวด, label ใต้ตัวเลข, ชิป, badge ตัวเลขในวงกลมเล็ก |
| Meta/caption | `text-xs` (12px) | คำอธิบายใต้หัวข้อ, timestamp |
| Body | `text-sm` (14px) | ชื่อรายการ, ปุ่ม, หัวข้อ tile (`font-bold`) |
| หัวข้อใหญ่ | `text-2xl`/`text-3xl` | ตัวเลขสถิติเด่น, hero heading |

ไม่มีขนาดต่ำกว่า `text-[11px]` ในระบบอีก — ถ้า element เดิมมี padding/ขนาดกล่องแคบเกินจะไม่พอ (เช่นวงกลม badge ตัวเลข) ให้ขยายกล่องตาม ไม่ลดขนาดตัวอักษรกลับ

## สี semantic สำหรับสถานะใบงาน (ยกเว้นจากกฎ accent เดียว)

ใช้กับ `MiniStat`/สถิติย่อยที่นับตามสถานะจริงเท่านั้น ไม่ใช่กับ tile หรือ label ทั่วไป:

| สถานะ | สี |
|---|---|
| รอตรวจสอบ/รอดำเนินการ | `bg-amber-50` / `text-amber-600` |
| กำลังดำเนินการ | `bg-blue-50` / `text-blue-600` |
| เสร็จสิ้น | `bg-emerald-50` / `text-emerald-600` |
| ถูกปฏิเสธ | `bg-red-50` / `text-red-600` |
| เกินกำหนด SLA / แจ้งเตือน | `border-destructive`, `bg-destructive/10`, `text-destructive` |

ตัวเลข/รวม/ประเภทที่ไม่ใช่สถานะ (เช่น "ใบงานรวม", ชิปจังหวัด/ประเภทลูกค้า) → ใช้ `bg-accent`/`text-accent-foreground` เดียวกันหมด ไม่แยกสีตามหมวด

**ปุ่ม action ที่ทำให้สถานะเปลี่ยนไปสู่กลุ่มไหน ใช้สีของกลุ่มปลายทางนั้น** ไม่ใช่คิดสีใหม่ — พบใน CSR Dashboard: ปุ่ม "เริ่มแลกเปลี่ยน/เริ่มลดหนี้" (`ActionButton`) เดิมใช้ส้ม `#E1592A` (สีแบรนด์เก่าของ CSR ที่เลิกใช้แล้ว) แก้เป็นน้ำเงินแทน เพราะกดแล้วสถานะเข้าสู่กลุ่ม "กำลังดำเนินการ" ซึ่งใช้น้ำเงินอยู่แล้วในตาราง semantic ด้านบน — ส่วนปุ่ม "อนุมัติ"/"ปฏิเสธ"/"เสร็จสิ้น" ใช้ emerald/red/emerald ตรงไปตรงมาเพราะปลายทางคือ "เสร็จสิ้น"/"ถูกปฏิเสธ" อยู่แล้ว

## Pattern ต่อชนิด tile (bento grid hub pages)

**Hero tile (ทักทาย)** — `bg-primary` ทึบเต็ม ไม่มี noise/blob, dot สถานะเป็นจุดนิ่ง (ไม่ pulse), `font-bold` ไม่ใช้ `font-black`

**Tile สถานะบัญชี** — `bg-card border border-border`, จุด `animate-ping` สีเขียว (อันเดียวในทั้งหน้าที่ยอมให้มี animation เพราะสื่อสถานะ live จริง)

**Tile ลิงก์ทั่วไป (ไม่ featured)** — `bg-card border border-border`, ไอคอนสี่เหลี่ยม `bg-accent text-accent-foreground`, hover เปลี่ยนแค่สี border (`hover:border-primary/50`)

**Tile ลิงก์ featured/มีตัวเลขเด่น** — เหมือน tile ทั่วไป แต่เพิ่ม `border-l-[3px] border-l-primary` (แถบซ้าย) และไอคอนเป็น `bg-primary text-primary-foreground` แทน accent tint — ใช้แถบสีบอกความสำคัญแทนการทาสีทั้งใบแบบเดิม

**Tile placeholder ("เร็วๆ นี้")** — `border-dashed border-border`, `bg-secondary` สำหรับไอคอน/badge, `opacity-80`

**แถบไอคอน pipeline (ตกแต่งล้วน ไม่ใช่ stepper จริง)** — วงกลม `bg-accent`, ไอคอน `text-accent-foreground`, เส้นประคั่น `border-border` — เดิมเป็นสีเฉพาะ tile (indigo) ตอนนี้ใช้ accent เดียวกับทั้งหน้า

## Page container / topbar มาตรฐาน

พบว่า topbar ของหน้าหลัก (hub) กับหน้าย่อย (เช่น history/workflow ของ Sale) ขนาดไม่ตรงกัน เพราะแต่ละหน้าตั้ง `max-w-*`/padding/ขนาดปุ่มเองแยกกันตอนสร้างทีละหน้า ไม่ได้อ้างอิงกฎกลาง — กฎที่ใช้แก้ (ทำแล้วกับ Sale ทั้ง 3 หน้า):

- **Container**: `max-w-6xl mx-auto w-full` เดียวกันทุกหน้าในโซนเดียวกัน (hub และหน้าย่อยทั้งหมด) ไม่ว่าเนื้อหาข้างในจะเป็น bento grid, list, หรือ board ก็ตาม — ถ้าเนื้อหาแคบกว่าธรรมชาติ ปล่อยให้มีที่ว่างข้างเอง ไม่ลด container ให้แคบลงเฉพาะหน้า
- **Padding แนวนอน**: `px-4 md:px-6` ทุกหน้า (ไม่ใช่ `px-6` ตายตัวแบบที่ hub เคยใช้)
- **Padding แนวตั้งก่อน topbar**: `pt-6` เท่ากันทุกหน้า
- **ปุ่ม logout**: `px-4 py-2.5 text-sm` + ไอคอน `w-5 h-5` (สี่เหลี่ยมจัตุรัสเท่ากันทั้งกว้าง/สูง — เดิม hub มีบั๊ก `w-4 h-5` ที่ทำให้ไอคอนบิดเบี้ยว แก้แล้ว) ปุ่ม/ลิงก์ "ย้อนกลับ" ฝั่งซ้ายของหน้าย่อยก็ใช้ scale ข้อความเดียวกัน (`text-sm font-semibold`)

**ยังไม่ได้ตัดสินใจ**: topbar ของ hub มี `NotificationBell` อยู่ข้าง logout แต่หน้าย่อย (history/workflow) ไม่มี — ทำให้ฝั่งขวาของ topbar หน้า hub "กว้างกว่า" หน้าย่อยอยู่ดีแม้ปุ่ม logout จะขนาดเท่ากันแล้ว เป็นคำถามเชิง product (จะให้เห็นกระดิ่งแจ้งเตือนได้จากทุกหน้าย่อยด้วยไหม) ไม่ใช่แค่ layout เฉยๆ จึงยังไม่แก้เอง

### Topbar แบบ "sticky" (หน้าย่อยลึกที่ไม่ใช่ hub — CSR dashboard/customers/tracking/reports/chatbot)

หน้าเหล่านี้ใช้ topbar อีกแบบ ต่างจาก brand bar ของ hub — เป็นแถบบางลอยติดขอบบน (`sticky top-0 z-30`) มีแค่ปุ่ม "ย้อนกลับ" + หัวข้อ 2 บรรทัด + ปุ่ม/badge ฝั่งขวา ไม่ใช่โลโก้แบรนด์เต็ม — พบว่าหน้า CSR ทั้ง 5 มีโครง/ขนาดตรงกันอยู่แล้วเกือบหมด (icon `size={15}` `strokeWidth={2.5}`, ปุ่ม `px-3 py-2`, container `max-w-6xl`) มีจุดเดียวที่ไม่ตรง: **`chatbot/page.tsx` ใช้ `max-w-4xl`** ขณะที่อีก 4 หน้าใช้ `max-w-6xl` — แก้ให้ตรงกันแล้ว พร้อมแปลง `bg-white/70 backdrop-blur-xl border-white/50` (กระจกโปร่งแสง) → `bg-card border-border` (โทเคนกลาง) และ subtitle `text-[10px] md:text-[11px]` → `text-[11px]` ตาม floor เดียวกับกฎ font size ด้านบน

(อัปเดต: เนื้อหาใต้ topbar ของทั้ง 5 หน้าทำเสร็จตามมาในรอบถัดมาแล้ว — ดูหัวข้อแรกของไฟล์นี้)

## Footer / header มาตรฐาน

Header แบรนด์บนสุดของทุก hub: `bg-card border border-border rounded-lg`, โลโก้ `bg-primary text-primary-foreground rounded-md`, ปุ่ม logout `bg-background hover:bg-secondary border border-border`

Footer: `border-t border-border` เส้นเดียว ไม่มี gradient divider, ข้อความ `text-muted-foreground` ล้วน ยกเว้นชื่อระบบที่ตัวหนา `text-foreground`

สีเชิงความหมายเพิ่มเติมที่พบระหว่างทำหน้า Sale: **ป้ายแผนกเจ้าของงาน** (CSR/โลจิสติกส์/คลังสินค้า ใน `SaleActiveWorkflow.tsx`) นับเป็น semantic เหมือนสถานะ — อำพัน/ฟ้า/ม่วงต่อแผนก คงไว้ตามเดิม ไม่ต้องรวมเป็น accent เดียว

## ความมีชีวิตชีวา (liveliness หลัง flat design)

หลังทำ Option B เสร็จรอบแรก feedback คือดู "เย็นชา" (cold) เกินไป — flat design ที่ตัด gradient/เงา/สีรุ้งออกหมดทำให้ดูมืออาชีพขึ้นจริง แต่ขาดชีวิตชีวา แก้ด้วยเทคนิคที่**ไม่ย้อนกลับไปเป็น AI slop เดิม** (ไม่ใช้ gradient หลายสี/บล็อบสุ่มสี/glassmorphism) — ใช้ 4 เทคนิคนี้ซ้ำทุกโซนที่ทำแล้ว:

1. **Hero glow วงเดียว** — `<div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary-foreground/10 blur-2xl pointer-events-none" />` ใน hero/welcome banner ที่เป็น `bg-primary` ทึบอยู่แล้ว สีเดียวจากพื้นเอง (opacity 10%) ไม่ใช่บล็อบหลายสีแบบ AI slop
2. **Hero quick-stat row** — แถวสถิติย่อยที่ดึงข้อมูลที่ fetch ไว้อยู่แล้วมาโชว์ใน hero (ไม่ query เพิ่ม) คั่นด้วย `border-t border-primary-foreground/15` ด้านล่างเนื้อหาทักทายเดิม + ปุ่ม/ลิงก์ CTA มุมขวา ให้ hero ไม่ดูโล่ง
3. **Hover shadow + lift บน tile/element ที่คลิกได้จริงเท่านั้น** — `hover:shadow-md hover:-translate-y-0.5 transition-all duration-200` (hub tiles) หรือ `shadow-sm` เฉยๆ สำหรับ element เล็กในลิสต์แน่น (เช่น sidebar tab ของ WH/Logistics ที่ไม่มีที่ให้ยกตัวขึ้นเยอะ) — **สำคัญ**: ห้ามใส่กับ element ที่ไม่ได้คลิกได้จริง (เช่น StatCard สรุปตัวเลขของ WH/Logistics เป็น display-only ไม่มี `onClick` จึงไม่ใส่ hover effect เพราะจะเป็น false affordance)
4. **เงาสีตามสีของ element เอง** — ไม่ใช่เงาเทาทึบมาตรฐาน แต่ผูกกับสีไอคอนนั้นเอง เช่น `shadow-primary/30`/`shadow-accent/40` (ไอคอนที่ใช้สี token) หรือ `shadow-amber-400/30`/`shadow-blue-400/30`/`shadow-indigo-400/30` (ไอคอนที่ใช้สี semantic ของ WH/Logistics ตามตารางสถานะด้านบน) — ห้ามผสมสีเงากับสีไอคอนที่ต่างกัน

ใช้แล้วที่:

- [app/admin/sale/page.tsx](app/admin/sale/page.tsx) — hero glow + hover lift บน 2 featured card — quick-stat row เดิมโชว์ total/active ซ้ำกับป้ายตัวเลขบนการ์ด "Active Workflow"/"ประวัติใบงาน" ด้านล่างเป๊ะๆ (ผู้ใช้ทักว่าดูแปลก เห็นเลขชุดเดียวกันวนซ้ำ 3 รอบ) แก้เป็นสถิติผลงานแทน: **เสร็จสิ้นแล้ว** (`completed`) + **อัตราปิดงานสำเร็จ** (`completed/total`) — มุมมองที่การ์ดด้านล่างไม่มี ใช้ `counts` ชุดเดียวกันที่ fetch ไว้อยู่แล้ว ไม่ query เพิ่ม — **หลักการทั่วไป**: เวลาเพิ่ม hero quick-stat ห้ามซ้ำกับตัวเลขที่ขึ้นอยู่แล้วบน tile/การ์ดอื่นในหน้าเดียวกัน ให้เลือกมุมมองใหม่ที่มีอยู่ใน state ที่ fetch ไว้แล้วแทน
- [app/admin/sale/history/page.tsx](app/admin/sale/history/page.tsx), [app/admin/sale/workflow/page.tsx](app/admin/sale/workflow/page.tsx) — เงาสีบนไอคอนหัวข้อ (`shadow-accent/40`)
- [app/admin/sale/component/SaleActiveWorkflow.tsx](app/admin/sale/component/SaleActiveWorkflow.tsx) — `WorkflowCard` เพิ่ม hover state ที่ไม่เคยมีมาก่อนทั้งที่คลิกได้ (`hover:border-primary/30 hover:shadow-sm`)
- [app/admin/manager/page.tsx](app/admin/manager/page.tsx), [app/admin/csr/page.tsx](app/admin/csr/page.tsx) — hero glow + quick-stat row (ใบงานรวม/รอดำเนินการ) + hover lift บน tile ทั้งหมด (ยกเว้น tile placeholder "Download Center" ของ CSR ที่ตั้งใจปิดใช้งานอยู่)
- [app/admin/wh/dashboard/page.tsx](app/admin/wh/dashboard/page.tsx) — hero glow + quick-stat row (ใบงานรวมทั้งหมด/รอตรวจรับ + ปุ่มไปแท็บ "รอตรวจรับ") + เงาสี `shadow-accent/40` บนไอคอนหัวข้อ "Warehouse Operations" + `WHTabButton` เพิ่ม prop `accentShadow` ใส่เงาสีตามสีแท็บ (`shadow-amber-400/30`/`shadow-blue-400/30`) ตอน active เท่านั้น
- [app/admin/logistics/dashboard/page.tsx](app/admin/logistics/dashboard/page.tsx) — hero glow + quick-stat row (ใบงานรวมทั้งหมด/อยู่ระหว่างขนส่ง + ปุ่มไปแท็บ "อยู่ระหว่างขนส่ง") + เงาสีบนไอคอนหัวข้อของ 2 แท็บ (`shadow-blue-400/30`/`shadow-indigo-400/30`) + `LogTabButton` เพิ่ม prop `accentShadow` เหมือนกับ `WHTabButton`

## หน้ากลาง "จัดการบัญชี" (/admin/account)

หน้าใหม่ใช้ร่วมกันทุกแผนก (ไม่ผูกกับ zone ไหน) ให้พนักงาน self-service เปลี่ยน Username/อีเมล/รหัสผ่านของบัญชีตัวเองได้ — เข้าถึงจากการ์ด "บัญชีผู้ใช้" ที่การ์ดคู่ "สถานะบัญชี" ของแต่ละ hub (ตอนนี้ทำแค่ CSR ก่อนตามที่ขอ ยังไม่ได้ผูกจาก Manager/Sale/WH/Logistics):

- [app/admin/account/page.tsx](app/admin/account/page.tsx) — 3 ฟอร์มแยก (Username/อีเมล/รหัสผ่าน) ทุกฟอร์มต้องกรอกรหัสผ่านปัจจุบันเพื่อยืนยันตัวตนก่อนบันทึกเสมอ (self-service ทันที ไม่ต้องรอ manager อนุมัติ ตามที่ผู้ใช้เลือก) — ปุ่ม "ลืมรหัสผ่านปัจจุบัน?" ลิงก์ไปหน้า `/auth/staff-forgot-password` (flow OTP เดิม ไม่ได้สร้างใหม่) — container ใช้ `max-w-6xl` เท่าทุกหน้าสำหรับแถบ back/logout บนสุด แต่เนื้อหาฟอร์มห่อด้วย `max-w-2xl` แคบกว่า เพราะเป็นฟอร์มล้วนไม่ใช่ list/table (ข้อยกเว้นจากกฎ container กว้างเท่ากันทั้ง zone เพราะหน้านี้ไม่ได้อยู่ใน zone ไหน)
- [app/admin/account/layout.tsx](app/admin/account/layout.tsx) — server component เช็ค `getStaffSession()` แล้ว `redirect('/')` ถ้าไม่ได้ login (**ไม่เช็ค department** ต่างจาก layout.tsx ของ csr/manager/sale/wh/logistics ที่ล็อกเฉพาะแผนกตัวเอง เพราะหน้านี้ใช้ร่วมได้ทุกแผนก) — จุดที่พลาดตอนแรก: สร้างหน้าไว้แล้วลืมใส่ layout guard นี้ ทำให้ route ตอบ 200 แทนที่จะ 307 เหมือนหน้า `/admin/*` อื่นทั้งหมด (เช็ค route ด้วย curl เจอเอง ไม่ใช่ security hole จริงเพราะ server action ทุกตัวยัง authenticate ซ้ำเองอยู่แล้ว แต่ behavior ไม่สอดคล้องกับหน้าอื่น)
- [app/actions/auth-staff.ts](app/actions/auth-staff.ts) — เพิ่ม `updateStaffUsername`/`updateStaffEmail`/`updateStaffPassword` แยกจาก `requestStaffPasswordReset`/`resetStaffPassword` เดิม (ฝั่งนั้นคือ "ลืมรหัสผ่าน" ยืนยันด้วย OTP, ฝั่งนี้คือ self-service ยืนยันด้วยรหัสผ่านปัจจุบันโดยตรง) ทั้ง 3 ฟังก์ชัน authenticate ผ่าน `getStaffSession()` เอง ไม่รับ staffId จาก client กัน แก้บัญชีคนอื่น, ใช้ rate-limit bucket ร่วมกัน (`staff-account-update:{staffId}`) กันเดารหัสผ่านผ่านฟังก์ชันไหนก็ได้เกินงบรวม — `updateStaffPassword` revoke session อื่นทั้งหมด "ยกเว้น session ปัจจุบัน" (ต่างจาก `resetStaffPassword` ที่ revoke ทุก session รวมของตัวเองด้วย เพราะยืนยันตัวตนใหม่ผ่าน OTP ไม่ใช่ session เดิม)
- `staff_account_change_logs` (ตาราง DB ใหม่ ผ่าน migration `supabase/migrations/20260822160000_add_staff_account_change_logs.sql` — apply แล้วผ่าน Supabase MCP) — audit log แยกจาก `staff_password_reset_logs` เก็บทุกครั้งที่แก้บัญชีสำเร็จ (`field`, `old_value`/`new_value` สำหรับ username/email เท่านั้น — `password` ไม่เก็บค่าใดๆ แม้แต่ hash กัน risk ถ้าตารางรั่ว) RLS ล็อกเหมือนตาราง audit อื่น (`deny_client_access` — เขียน/อ่านได้เฉพาะ service_role)
- [test/fakeSupabase.ts](test/fakeSupabase.ts) — ขยาย fake ให้ `.update()` เช็ค unique-constraint (23505) ด้วยเหมือน `.insert()` (เดิมเช็คแค่ insert) เพราะ `updateStaffUsername` ต้องมี test path ที่จำลอง username ซ้ำได้จริงตอน update ไม่ใช่แค่ตอนสมัครใหม่ — เพิ่ม `staff_users: ['username']` เข้า `UNIQUE_COLUMNS`
- test ครบทั้ง 3 ฟังก์ชันใน `app/actions/__tests__/auth-staff.test.ts` (rate limit, validation, wrong password, duplicate username, session revocation, audit log) ตามธรรมเนียม "ทุก server action ต้องมี test coverage" ของ repo นี้

## โครงหน้า Logistics Dashboard ปรับใหม่ (เลิกใช้ tab แยกเป็นหน้าย่อยจริง)

ผู้ใช้ขอปรับ [app/admin/logistics/dashboard/page.tsx](app/admin/logistics/dashboard/page.tsx) จากระบบ sidebar tab (3 แท็บ: อนุมัติรับคืนสินค้า/อยู่ระหว่างขนส่ง/อัปโหลดรูป สลับดูทีละแท็บบนหน้าเดียว) เป็นหน้ากลางแบบ hub เล็กๆ 2 การ์ด **กดเข้าไปเจอเนื้อหาที่หน้าแยกจริง** (ตอนแรกลองทำเป็น 2 การ์ดหัวข้อ static โชว์เนื้อหาเต็มพร้อมกันในหน้าเดียว แต่ผู้ใช้แก้ไขว่าไม่ใช่ ต้องการให้กดการ์ดแล้ว "เด้งไปหน้าอื่น" แบบเดียวกับที่ Sale hub ลิงก์ไปหน้า history/workflow):

1. **หัวข้อสถิติใน Welcome Banner** ([app/admin/logistics/dashboard/page.tsx](app/admin/logistics/dashboard/page.tsx)) — เพิ่ม "อนุมัติรับคืนสินค้า" แทรกก่อน "อยู่ระหว่างขนส่ง" ปุ่ม CTA "ดูรายการขนส่ง" เปลี่ยนจากสลับ tab เป็น `Link` ไปหน้า `/admin/logistics/dashboard/in-transit` ตรงๆ
2. **ตัดสถิติสรุปย่อ 3 การ์ด + sidebar tab เดิมออกทั้งหมด** — ลบ component `StatCard`/`LogTabButton` (ไม่มีที่ใช้แล้ว เคยมีไว้ไฮไลต์ tab ที่ active) พร้อม state `activeTab`/`expandedReq`/`transitModal` ทั้งชุดออกจากหน้ากลาง (ย้ายไปอยู่ที่หน้าย่อยตามเนื้อหาที่ใช้จริงแทน) หน้ากลางเหลือแค่ fetch ตัวเลขสรุปมาโชว์ hero + การ์ด ไม่ต้องมี state ของ modal/รายการใบงานอีก
3. **หน้าย่อยใหม่ 2 หน้า** ลิงก์จากการ์ด "ส่งรถไปรับคืนสินค้า" และ "รถขนส่งรับคืนสินค้าถึงคลัง" บนหน้ากลาง (การ์ดสไตล์เดียวกับ tile ของ Sale/CSR hub: icon เหลี่ยม + ตัวเลขนับมุมขวาบน + `border-l-[3px]` สีตามความหมายสถานะ + hover shadow+lift):
   - [app/admin/logistics/dashboard/approved/page.tsx](app/admin/logistics/dashboard/approved/page.tsx) — "ส่งรถไปรับคืนสินค้า" (เดิมแท็บ "อนุมัติรับคืนสินค้า") มี modal "ยืนยันส่งรถไปรับคืน" อยู่ที่นี่ (ทำงานเฉพาะรายการ `approved`)
   - [app/admin/logistics/dashboard/in-transit/page.tsx](app/admin/logistics/dashboard/in-transit/page.tsx) — "รถขนส่งรับคืนสินค้าถึงคลัง" รวมเดิม 2 แท็บเข้าด้วยกันตามที่ขอ ("อยู่ระหว่างขนส่ง" + "อัปโหลดรูปสินค้ารับคืน") อยู่การ์ดเดียวกัน คั่นด้วย `border-t` — placeholder อัปโหลดรูปยังเป็น "กำลังพัฒนา" เหมือนเดิมทุกประการ ไม่ได้แตะ logic
   - แต่ละหน้าย่อย fetch ข้อมูลของตัวเองอิสระ (เรียก `getLogisticsDashboardData()` ซ้ำแล้วกรองฝั่ง client เอง เหมือน pattern Sale history/workflow ที่ไม่ผูก state ร่วมข้ามหน้า) — โครง topbar ใช้แบบ "bar เดียวไม่ sticky" ของ `app/admin/sale/history/page.tsx` (ไม่ใช่แบบ sticky ของหน้า dashboard เดิม)
   - [app/admin/logistics/layout.tsx](app/admin/logistics/layout.tsx) (auth guard เช็ค `session.department === 'log'`) ครอบคลุมหน้าย่อยใหม่ทั้ง 2 อัตโนมัติอยู่แล้วเพราะ Next.js layout ใช้กับทุก route ที่ซ้อนอยู่ข้างใต้ ไม่ต้องสร้าง layout ใหม่

**component กลางที่แยกออกมา**: [app/admin/logistics/dashboard/component/LogisticsRequestList.tsx](app/admin/logistics/dashboard/component/LogisticsRequestList.tsx) — ย้าย `LogisticsRequestList`/`StatusBadge`/`LOGISTICS_STATUS`/pagination ออกจาก page.tsx เดิมมาไว้ตรงนี้ ให้ 2 หน้าย่อยเรียกใช้ร่วมกันได้ (เดิมอยู่ไฟล์เดียวกับหน้า dashboard เพราะใช้แค่ที่เดียว) — component นี้**ไม่มี wrapper `<section>` ของตัวเองอีกต่อไป** (ถอดออกจากตอนที่ยังลองทำเป็นการ์ดสแตติกในหน้าเดียว กันซ้อนกรอบกับการ์ดของหน้าย่อยที่ห่อเองแล้ว) — **หลักการทั่วไป**: ก่อนยุบ component ที่มี wrapper ของตัวเองมาไว้ "ข้างใน" การ์ดอื่น ต้องเช็คว่า component นั้น render กรอบ/พื้นหลังซ้อนกับกรอบใหม่หรือไม่ ถ้าใช่ต้องถอดออกก่อน

หน้า "รถขนส่งรับคืนสินค้าถึงคลัง" ไม่มีปุ่ม "ส่งรถไปรับคืน" เลย (ปุ่มนั้นทำงานเฉพาะ `req.current_status === 'approved'` ซึ่งหน้านี้กรองเฉพาะ `in_transit` อยู่แล้ว) ส่ง `onSendTruck` เป็น no-op function เข้าไปเพราะ prop เป็น required แต่ปุ่มจะไม่แสดงผลจริงอยู่ดี

เพิ่มการ์ดคู่ "สถานะบัญชี + บัญชีผู้ใช้" ให้หน้ากลาง (`app/admin/logistics/dashboard/page.tsx`) ด้วย ยกโครงมาจาก CSR hub ตรงๆ (การ์ดสถานะ `flex-1` + การ์ด username กว้างคงที่ `w-28 md:w-32` เรียงชิดกันทุกขนาดจอ ลิงก์ไป `/admin/account`) — หน้านี้เดิมไม่เคยมีการ์ดแบบนี้เลย (มีแค่ป้าย "Active" เล็กๆ ฝังอยู่มุมขวาบนของ hero ไม่มีนาฬิกาเข็ม) ตอนเพิ่มการ์ดใหม่เลยตัดป้ายเดิมในตัว hero ออกด้วย (ซ้ำซ้อนกันถ้าเก็บไว้ทั้งคู่) พร้อมเพิ่ม `now`/`AnalogClock` state ที่หน้านี้ไม่เคยมีมาก่อน (WH ก็มีป้ายแบบเดียวกันฝังใน hero โดยยังไม่ได้ทำตามในรอบนี้ รอ request เพิ่มเติม)

รอบถัดมา: ผู้ใช้ส่งภาพหน้า CSR มาเทียบ อยากให้ "ขนาดและจัดเรียง" ของ hero หลัก log เหมือน CSR คือ hero กับการ์ดคู่สถานะบัญชี/บัญชีผู้ใช้ **อยู่แถวเดียวกัน ข้างๆ กัน** (ไม่ใช่การ์ดคู่ตกลงมาเป็นแถวแยกด้านล่าง hero แบบที่เพิ่งทำไปรอบก่อน) แก้โดยห่อทั้งสองด้วย `grid grid-cols-1 md:grid-cols-6 gap-4` (grid 6 คอลัมน์เหมือนโครง bento ของ CSR/Manager/Sale hub) hero ได้ `md:col-span-4`, การ์ดคู่ได้ `md:col-span-2` — **ต่างจาก CSR ตรงที่**: CSR hero เป็น `md:row-span-2` เพราะมี tile ที่ 2 ("กรอกแบบฟอร์มแทนลูกค้า") ต่อคิวใต้การ์ดคู่สถานะ/username ให้ความสูงรวมของฝั่งขวาเท่า hero พอดี — หน้า Logistics นี้ไม่มี tile ที่ 2 แบบนั้นในบริเวณเดียวกัน (มีแค่การ์ดคู่เดียว) เลยปล่อยเป็นแถวเดียว ไม่ใส่ row-span ให้ hero — ผลคือ grid default (`align-items: stretch`) จะยืดการ์ดคู่ให้สูงเท่า hero เอง ซึ่งยอมรับได้เพราะเนื้อหาในการ์ดใช้ `items-center justify-center` อยู่แล้ว (ต่างจากบั๊ก stretch ที่เจอตอนแก้ Sale ตรงที่การ์ดนั้นมีไอคอนตรึงตำแหน่งตายตัวแยกจากเนื้อหา ไม่ใช่กลุ่มเดียว centered)

## ยังไม่ได้ทำ

- **โซน CSR ทำครบทั้งหมดแล้ว** (hub + ทุกหน้าย่อย รวมเนื้อหา ไม่ใช่แค่ topbar)
- **WH/Logistics ทำครบแล้ว** (ดูหัวข้อแรกของไฟล์นี้)
- **โซน Manager ทำครบทั้งหมดแล้ว** (hub + staff-approvals ทั้ง 4 แท็บ + sla + tracking + `ManagerInsights.tsx`)
- การ์ด "บัญชีผู้ใช้" ที่ลิงก์ไป `/admin/account` (จัดการบัญชี) ทำแล้วที่ CSR + Manager + Sale hub + Logistics dashboard — เหลือแค่ WH dashboard (ไม่มี hub ของตัวเอง มีแค่หน้า dashboard เดียว เดิมก็ไม่มี tile "สถานะบัญชี" แบบนี้เหมือนที่ Logistics เคยไม่มีมาก่อน) ยังไม่ได้ทำ รอ request เพิ่มเติม
  - Sale hub เดิมไม่มีการ์ด "บัญชีผู้ใช้" อยู่แล้ว (มีแค่ "สถานะบัญชี" เดี่ยวๆ) ต้องสร้างใหม่ทั้งการ์ด ไม่ใช่แค่ผูกลิงก์เหมือน CSR/Manager
  - ลองมาแล้วหลายรอบก่อนจะได้ทรงสุดท้าย: (1) เบียด "บัญชีผู้ใช้" ไว้ในคอลัมน์เดียวกับ "สถานะบัญชี" คู่กับ "ขอบเขตที่ดูแล" ทางขวา → เจอ grid stretch บั๊ก (คอลัมน์ซ้ายสูงขึ้น ดันให้ "ขอบเขตที่ดูแล" ถูกยืดสูงตามจนมีช่องว่างเปล่าๆ กลางการ์ด) (2) สลับคู่กันระหว่าง breakpoint ด้วย grid-cols-2 เดียวกันแล้วสลับ col-span → ผู้ใช้ดูแล้วไม่สวย (3) ยกโครงมาจาก CSR ตรงๆ (สถานะบัญชี+บัญชีผู้ใช้ติดกันเต็มความกว้างทุก breakpoint, ขอบเขตที่ดูแลแยกเต็มแถว) → ที่หน้าจอกว้างปานกลาง (ยังไม่ถึง md) การ์ดสถานะบัญชีถูกบีบเป็น `flex-1` ข้างการ์ด username แคบๆ ทำให้มีที่ว่างเยอะเกินไป ไม่สวยอีกเช่นกัน — สุดท้ายผู้ใช้ขอชัดเจนว่ามือถืออยากให้บัญชีผู้ใช้ไปคู่กับขอบเขตที่ดูแล (ประเภทลูกค้า) แทน ส่วน desktop ให้คงแบบ CSR ไว้เหมือนเดิม
  - **ทรงสุดท้ายที่ใช้จริง**: จับคู่กันคนละแบบจริงๆ ระหว่าง 2 breakpoint (มือถือ: บัญชีผู้ใช้คู่ขอบเขตที่ดูแล / desktop: บัญชีผู้ใช้คู่สถานะบัญชีแบบ CSR) — เพราะ adjacency ของ DOM เปลี่ยนจริง ไม่ใช่แค่ขนาด/col-span จึงเลือก **render wrapper 2 ชุดแยกกัน** แทนการพยายาม merge เป็น class เดียว: เนื้อหาการ์ดทั้ง 3 ใบ (`statusCardBody`/`usernameCardBody`/`scopeCardBody`) แยกเป็นตัวแปร JSX ไว้ก่อน `return` กันโค้ดซ้ำ แล้ว render 2 wrapper คือ `<div className="md:hidden">` (โครงมือถือ: การ์ดสถานะเดี่ยวเต็มแถวบน + `grid-cols-2` บัญชีผู้ใช้/ขอบเขตที่ดูแลแถวล่าง พร้อม `items-start` กัน grid stretch) กับ `<div className="hidden md:contents">` (โครง desktop: `display:contents` ถอด wrapper ออกให้ลูกกลายเป็น grid item ของ bento grid หลักตรงๆ แบบ CSR/Manager) — **บทเรียน**: ถ้าการ์ดต้อง "จับคู่กันคนละแบบจริงๆ" ระหว่าง breakpoint (ไม่ใช่แค่ขนาด/ทิศทางเปลี่ยน) การพยายามใช้ responsive class เดียวมักจบด้วยการประนีประนอมที่ไม่มีฝั่งไหนสวยจริง — render 2 โครงแยกกัน (ใช้ `md:hidden` / `hidden md:contents` คู่กัน) แล้วดึงเนื้อหาการ์ดมาใช้ร่วมผ่านตัวแปร JSX แทน ตรงไปตรงมากว่าและแก้แต่ละฝั่งได้อิสระโดยไม่กระทบกัน
  - รอบถัดมา: ผู้ใช้เห็นว่าการ์ด "บัญชีผู้ใช้" กับ "ขอบเขตที่ดูแล" (แถวล่างบนมือถือ) สูงไม่เท่ากัน (ขอบเขตที่ดูแลสูงกว่ามากเพราะมีชิป 2 กลุ่ม) อยากให้สูงเท่ากัน — ต่างจากบั๊กรอบแรกที่ต้องใส่ `items-start` กันการยืด คราวนี้คือ**อยากให้ยืด** จึงตัด `items-start` ออกจาก grid แถวล่างของชุดมือถือ (เหลือแค่ `grid grid-cols-2 gap-3`) ปล่อย default `align-items: stretch` ทำงาน — ใช้ได้เพราะการ์ด "บัญชีผู้ใช้" ทั้งกลุ่ม (ไอคอน+username+label) อยู่ใน container เดียวที่มี `items-center justify-center` อยู่แล้ว พอถูกยืดสูงขึ้นเนื้อหาทั้งกลุ่มเลยแค่เลื่อนไปกึ่งกลางกล่อง ไม่ได้แหวกช่องว่างประหลาดแบบที่การ์ด "ขอบเขตที่ดูแล" เคยเป็น (อันนั้นไอคอนตรึงบนแยกจากเนื้อหาด้านล่างที่เป็น `flex-1` คนละก้อน) — **บทเรียนเสริม**: จะยืดการ์ดให้เท่ากันได้อย่างปลอดภัย เนื้อหาข้างในต้องเป็นกลุ่มเดียวที่ centered ทั้งกลุ่ม ไม่ใช่แยกเป็นส่วนที่ pin ตำแหน่งตายตัว (เช่น ไอคอนตรึงบน) ผสมกับส่วนที่ centered แยกต่างหาก
  - รอบถัดมาอีก: การ์ด "สถานะบัญชี" แถวบนบนมือถือ (เดี่ยว เต็มความกว้าง) ใช้ `justify-between` อยู่ (ตอนที่เพิ่งแยกออกมาจากการจับคู่กับบัญชีผู้ใช้ คิดว่าไม่มีการ์ดข้างๆ แล้วน่าจะใช้ได้) แต่พอเต็มความกว้างจอจริงๆ กลับดันข้อความ/นาฬิกาไปสุดขอบจนช่องว่างตรงกลางดูแปลกอีก (ปัญหาเดิมจาก CSR ย้อนกลับมาแต่คนละสาเหตุ — รอบนี้เพราะการ์ด "กว้างเกินไป" ไม่ใช่เพราะ "มีการ์ดข้างๆ" มาบีบ) แก้เหมือนกันคือเปลี่ยนเป็น `justify-center gap-6` ให้ทั้งกลุ่มอยู่กึ่งกลางการ์ดแทน — **บทเรียนสรุปรวม**: `justify-between` ในการ์ดที่มีแค่ 2 ก้อนเนื้อหา (ข้อความ + องค์ประกอบตกแต่งอย่างนาฬิกา) มีความเสี่ยงสูงที่จะดูช่องว่างแปลกได้แทบทุกกรณีที่ความกว้างการ์ดไม่คงที่/ไม่เล็กพอดี — `justify-center` + gap คงที่ ปลอดภัยกว่าเป็นค่าเริ่มต้นสำหรับ pattern นี้
- หน้าลูกค้า (`app/welcome`, `app/(authenticated)/customer/*`) ยังไม่แตะ — ตามข้อเสนอเดิมควรใช้ Option B เช่นกันแต่ยังไม่ได้ทำจริง
- Component กลางที่ยังฝังสี/gradient ตรงโค้ด (`Sidebar.tsx`, ฯลฯ) ยังไม่ได้แก้ เพราะกระทบหลายหน้าพร้อมกัน ต้องคุยขอบเขตก่อน
- `AnalogClock.tsx`/`NotificationBell.tsx` ยังไม่ได้แก้ (ใช้ร่วมกับ CSR/Manager เหมือนกัน) — `StatCard.tsx`/`MiniStat.tsx` แก้แล้ว (ดูด้านบน): เปลี่ยน `bg-white`→`bg-card`, ตัด shadow, `rounded-2xl/xl`→`rounded-lg/md`, `font-black`→`font-bold`, label 9-10px→11px ครบ — **ผลข้างเคียงที่ตั้งใจ**: หน้า CSR/WH/Logistics/Manager staff-approvals ที่ยังไม่ได้ทำ Option B เต็มรูปแบบ จะเห็น StatCard/MiniStat ในหน้าเหล่านั้นเปลี่ยนไปแล้วเหมือนกัน (สีธีมเดิมของแต่ละหน้ายังอยู่ เพราะ `iconBg`/`iconText` ยังส่งเป็น prop เหมือนเดิม เปลี่ยนแค่ radius/shadow/font ของตัวการ์ดเอง) — ถือเป็นการเริ่มไล่ปรับ shared component ไปพร้อมกันโดยตั้งใจ ไม่ใช่บั๊ก
- `SkeletonStatCards` และ `SkeletonTopBar` ใน `components/skeletons/DashboardSkeleton.tsx` แก้ตามให้ตรงกับของจริงแล้วทั้งคู่ (กันการ์ด/แถบ "เปลี่ยนรูปทรง" ตอนโหลดเสร็จ) — ส่วนอื่นในไฟล์เดียวกัน (`SkeletonSubTabs`, `SkeletonFilterBar`, `SkeletonTableRows` ฯลฯ) ยังเป็นของเดิม ไม่ได้แตะ เพราะเป็น skeleton ของเนื้อหาที่ยังไม่ได้ทำ Option B
