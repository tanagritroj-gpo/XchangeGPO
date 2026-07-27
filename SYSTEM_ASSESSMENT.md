# ประเมินระบบรับคืน–แลกเปลี่ยนสินค้า (NewXchangeportal)

**วันที่ประเมิน:** 2026-07-27
**Repository:** `newgpo-exchange` (branch ที่ตรวจสอบ: `RLS_supabase`, working tree clean)
**Supabase project:** `tanagritroj-gpo` (`qgztveswduffskucqppt`, Postgres 17, ap-southeast-1)
**วิธีประเมิน:** อ่านโค้ดทั้งหมดใน `app/`, `lib/`, `components/`, ประวัติ git, และ query schema/security-performance advisors จริงจาก Supabase MCP (ไม่มี `.sql`/migration เก็บใน repo — schema อยู่บน Supabase เท่านั้น)

---

## 1. สรุปภาพรวม (Executive Summary)

ระบบนี้เป็นเว็บแอป Next.js 15 + Supabase สำหรับ **ดิจิไทซ์กระบวนการรับคืน/แลกเปลี่ยนยา-เวชภัณฑ์แบบ B2B** ระหว่างโรงพยาบาล (ลูกค้า) กับหน่วยงาน (ทีม CSR / คลังสินค้า / โลจิสติกส์ / ผู้จัดการ) แทนกระบวนการกระดาษเดิม

**สถานะโครงการ:** Prototype/Pilot ที่ทำโดยผู้พัฒนาคนเดียว เริ่ม 2026-06-12 มี 101 commits ในเวลา ~6 สัปดาห์ (118 ไฟล์ TypeScript) ข้อมูลจริงบน Supabase ยังมีน้อยมาก (`requests`=4, `drug_items`=8, `b2b_customers`=2, `staff_users`=4) แต่ `sessions`=55 แถว ซึ่งสะท้อนว่ามีการทดสอบ/ใช้งานจริงพอสมควรแล้ว

**ข้อสรุปหลัก:** แกนธุรกิจ (business logic) และ workflow ของระบบถูกออกแบบมาดีและครบวงจร มี audit trail และแนวคิดด้านความปลอดภัยที่ดีหลายจุด (OTP timing-safe, anti-enumeration, signed URL, PDPA log) **แต่ยังมีจุดที่เป็นบั๊กจริงและช่องโหว่ที่ต้องแก้ก่อนเปิดใช้งานกับข้อมูลลูกค้าจริงในวงกว้าง** โดยเฉพาะ rate-limit ที่ใช้งานไม่ได้จริงใน 7 จุด, debug code ที่หลุดไป production, และระบบ auth สองระบบที่ปนกันอยู่ ระบบยังไม่มี automated test และ CI เลย ซึ่งเสี่ยงมากขึ้นเมื่อ workflow มีสถานะซับซ้อนหลายขั้น

---

## 2. ระบบทำอะไร (Functional Overview)

### บทบาทผู้ใช้ (Actors)

| บทบาท | เข้าถึงผ่าน | หน้าที่หลัก |
|---|---|---|
| **ลูกค้า (โรงพยาบาล/B2B)** | `/`, `app/(authenticated)/*` | ล็อกอินด้วย OTP ทางอีเมล, กรอกฟอร์มขอคืน/แลกสินค้า (พร้อมเซ็นชื่อดิจิทัล), ติดตามสถานะ, ดูประวัติ, ดาวน์โหลด/รับ PDF, คุยกับ chatbot |
| **CSR (Customer Service)** | `app/admin/csr/*` | อนุมัติ/ปฏิเสธคำขอสมัครลูกค้าใหม่, กรอกฟอร์มแทนลูกค้า, ตรวจสอบ/อนุมัติ/ปฏิเสธคำขอและรายการยาแต่ละชิ้น, แท็ก compliance |
| **คลังสินค้า (WH)** | `app/admin/wh/dashboard` | ตรวจรับสินค้า 2 ขั้น (ตรวจสภาพ → รับเข้าคลัง) ต่อรายการ/เป็นชุด |
| **โลจิสติกส์ (Logistics)** | `app/admin/logistics/dashboard` | เปลี่ยนสถานะ อนุมัติ → อยู่ระหว่างขนส่ง → ถึงคลัง (หรือปฏิเสธ) |
| **ผู้จัดการ (Manager)** | `app/admin/manager/staff-approvals` | อนุมัติพนักงานใหม่, ดู insight/กราฟสรุปผลงาน, คุยกับ chatbot วิเคราะห์ข้อมูลภายใน |

### Workflow หลัก (state machine ของ `requests.current_status` / `drug_items.current_status`)

```
pending_review → approved → in_transit → at_warehouse → checked_in → receiving → exchanging → completed
                                              ↘ rejected (เข้าถึงได้จากเกือบทุกขั้น ทั้งระดับคำขอและระดับรายการยา)
```

สถานะของ "คำขอ" (request) ถูกคำนวณจากสถานะรวมของ "รายการยา" (drug items) ย่อยในคำขอนั้น — ตรรกะนี้ถูก implement แยกกันคนละที่ในทั้ง `wh-actions.ts` และ `logistics-actions.ts` (ดูหัวข้อ 5.7)

---

## 3. สถาปัตยกรรมเทคนิค

- **Frontend/Backend:** Next.js 15 (App Router) + React 19 + Server Actions, TypeScript, Tailwind + shadcn/ui
- **Database/Backend-as-a-Service:** Supabase (Postgres 17) — **schema/RLS ทั้งหมดจัดการนอก repo** ไม่มีไฟล์ migration ใน git เลย ตรวจสอบได้เฉพาะผ่าน Supabase MCP เท่านั้น
- **Auth:** ระบบ session ที่เขียนเอง (custom) — ตาราง `sessions` + httpOnly cookie, ไม่ใช้ Supabase Auth (`auth.users`) เป็นระบบจริง (ดูหัวข้อ 5.4)
- **การเข้าถึงฐานข้อมูล:** ทุก server action ใช้ Supabase client แบบ **service_role** (`lib/supabase/admin.ts`) ซึ่ง **bypass RLS ทั้งหมด** — การควบคุมสิทธิ์ทำในโค้ด applications เท่านั้น
- **บริการเสริม:** สร้าง PDF ด้วย `pdf-lib`+`fontkit` (ฟอนต์ไทย Sarabun), ส่งอีเมลด้วย Resend, ลายเซ็นดิจิทัลด้วย `react-signature-canvas`, กราฟด้วย Recharts, Chatbot 2 ตัว (ลูกค้า + พนักงาน) เรียก Gemini API โดยตรง (ไม่ผ่าน Anthropic/Claude)
- **Rate limiting:** ทำเองบน Postgres (ตาราง `rate_limits` + RPC `increment_rate_limit`) เพื่อให้ self-host ได้โดยไม่ต้องพึ่ง Redis — เป็นการตัดสินใจทางสถาปัตยกรรมที่ดี แต่การใช้งานมีบั๊ก (ดูหัวข้อ 5.1)

### โครงสร้างข้อมูลหลัก (จาก Supabase MCP, live schema)

| ตาราง | RLS | มีนโยบายหรือไม่ | ความหมาย |
|---|---|---|---|
| `requests` | ✅ | มี (3 policies, ซ้ำซ้อน) | คำขอคืน/แลกเปลี่ยนหลัก |
| `drug_items` | ✅ | ❌ ไม่มี | รายการยา/เวชภัณฑ์ในคำขอ |
| `b2b_customers` | ✅ | (ไม่ตรวจสอบ) | ลูกค้าที่อนุมัติแล้ว |
| `clients` | ✅ | ❌ ไม่มี | คำขอสมัครลูกค้าที่รออนุมัติ |
| `staff_users` | ✅ | ❌ ไม่มี | บัญชีพนักงาน (csr/log/wh/manager) |
| `sessions` | ✅ | ❌ ไม่มี | session token ของทั้งลูกค้า/พนักงาน |
| `status_logs` | ✅ | (ไม่ตรวจสอบ) | audit trail การเปลี่ยนสถานะ |
| `data_correction_logs` | ✅ | ❌ ไม่มี | log การแก้ไขข้อมูลย้อนหลัง |
| `access_logs` | ✅ | ❌ ไม่มี | log การเข้าถึงเอกสาร (เพื่อ PDPA) |
| `document_attachments` | ✅ | ❌ ไม่มี | ที่อยู่ไฟล์ PDF ที่สร้างแล้ว |
| `otp_logs` | ✅ | ❌ ไม่มี | OTP hash + expiry |
| `timeline_summary` | ✅ | ❌ ไม่มี | สรุป timeline สำหรับหน้า tracking |
| `request_pings` | ✅ | (ไม่ตรวจสอบ) | ปุ่ม "เร่งงาน" จากหน้า tracking ของลูกค้า |
| `rate_limits` | ✅ | (ไม่ตรวจสอบ) | fixed-window counter |

---

## 4. จุดแข็งที่พบ (Strengths)

- **ออกแบบ workflow/state machine ครบวงจร** ครอบคลุมทั้งฝั่งลูกค้าและพนักงาน 4 แผนก พร้อม audit trail (`status_logs`, `data_correction_logs`, `access_logs`) ที่เหมาะกับโดเมนที่ต้องตรวจสอบย้อนหลังได้ (เวชภัณฑ์/PDPA)
- **สัญชาตญาณด้านความปลอดภัยที่ดีหลายจุด:**
  - OTP flow คืนค่า `{success:true}` เสมอไม่ว่าอีเมลจะมีอยู่จริงหรือไม่ ป้องกัน enumeration ([app/actions/auth-actions.ts](app/actions/auth-actions.ts))
  - Staff login เทียบ `bcrypt` กับ dummy hash เสมอแม้ user ไม่พบ เพื่อป้องกัน timing attack ([app/actions/auth-staff.ts](app/actions/auth-staff.ts))
  - PDF เข้าถึงผ่าน signed URL อายุสั้น (300s/24h) ไม่ใช่ public URL
  - หน้า tracking สาธารณะ (`app/actions/tracking-actions.ts`) มี allowlist คอลัมน์ปลอดภัย (ไม่เผย `value_amount`, `invoice_number`) และมี rate-limit เข้มกว่าปกติสำหรับกรณี "หา ref ไม่เจอ" เพื่อชะลอการ brute-force ref id
  - ค้นหาลูกค้าด้วย ILIKE มีการ escape wildcard (`%`/`_`) ป้องกัน wildcard injection
- **เอกสารความรู้ chatbot (`lib/chatbot-knowledge.ts`)** เขียนเป็นโครงสร้างข้อมูล ไม่ใช่ text blob ทำให้ดูแลรักษาง่ายกว่า
- **`lib/manager-stats.ts`** ถูกออกแบบให้เป็น single source of truth สำหรับทั้งกราฟหน้าจอและ chatbot วิเคราะห์ข้อมูล ป้องกันตัวเลขไม่ตรงกัน — แนวคิดถูกต้อง
- โค้ดมี **comment อธิบายเหตุผลของบั๊กที่เคยเจอมาก่อน** (เช่นเรื่อง `role` vs `department` ใน `manager-actions.ts`) ซึ่งเป็นนิสัยที่ดีสำหรับทีมงานในอนาคต

---

## 5. ปัญหาสำคัญที่พบ (Key Findings, เรียงตามความรุนแรง)

### 🔴 ระดับวิกฤต — ควรแก้ก่อนใช้งานจริงกับข้อมูลลูกค้า

**5.1 Rate limiting ใช้งานไม่ได้จริงใน 7 จุดจาก 13 จุด (bug เชิง truthiness)**

`checkRateLimit()` คืนค่าเป็น **object** เสมอ `{allowed, remaining}` ([lib/rate-limit.ts:4-7](lib/rate-limit.ts)) ไม่ใช่ boolean แต่หลายจุดเช็คแบบ `const allowed = await checkRateLimit(...); if (!allowed)` ซึ่ง object เป็น truthy เสมอ ทำให้ **เงื่อนไข rate-limit ไม่เคยทำงาน**:

- [app/actions/form-actions.ts:43](app/actions/form-actions.ts) — จำกัดสร้างคำขอ 10/ชม. (ลูกค้า) — **ไม่ทำงาน**
- [app/actions/staff-form-actions.ts:44](app/actions/staff-form-actions.ts) — ค้นหาลูกค้า 30/นาที — ไม่ทำงาน
- [app/actions/staff-form-actions.ts:83](app/actions/staff-form-actions.ts) — สร้างคำขอโดย CSR 30/ชม. — ไม่ทำงาน
- [app/actions/staff-form-actions.ts:185](app/actions/staff-form-actions.ts) — สร้าง PDF (staff) 5/นาที — ไม่ทำงาน
- [app/actions/staff-form-actions.ts:270](app/actions/staff-form-actions.ts) — ส่งอีเมล (staff) 20/ชม. — ไม่ทำงาน
- [app/actions/generate-pdf-action.ts:20](app/actions/generate-pdf-action.ts) — สร้าง PDF (ลูกค้า) 5/นาที — ไม่ทำงาน
- [app/actions/send-pdf-email-action.ts:19](app/actions/send-pdf-email-action.ts) — ส่งอีเมล (ลูกค้า) 5/ชม. — ไม่ทำงาน

ตรงกันข้าม `auth-actions.ts:39,83` และ `tracking-actions.ts:30,45,104` เช็คถูกต้องด้วยการ destructure `.allowed` — แสดงว่าบั๊กแบบเดียวกันนี้เคยถูกแก้ในไฟล์เดียวแต่ไม่ได้ถูกแก้ในอีก 7 จุดที่เหลือ ซึ่งเสี่ยงต่อการ spam สร้างคำขอ/ยิง PDF-email ซ้ำๆ **แก้ง่ายมาก** (เปลี่ยนเป็น `if (!allowed.allowed)`) แต่ผลกระทบสูง

**5.2 Debug code หลุดไปยัง production**

- **PDF ทุกใบที่สร้างขึ้น** (ทั้งฝั่งลูกค้าและ CSR) มีเส้นตารางกริดสีเทาและตัวเลขพิกัดพิมพ์ทับเอกสารทั้งหน้า — โค้ดมี comment กำกับไว้ตรงๆ ว่า "ส่วนที่เพิ่มเข้ามา: ตีเส้น Grid และตัวเลขพิกัด" ซึ่งควรเป็นเครื่องมือชั่วคราวสำหรับหาพิกัดตอน dev เท่านั้น ([app/services/pdf-service.ts:27-43](app/services/pdf-service.ts))
- **Chatbot ลูกค้า** ส่ง error message ดิบจาก Gemini API กลับไปให้ผู้ใช้เห็นตรงๆ เมื่อเกิด error พร้อม comment เตือนไว้เองว่า "ต้องเอาบรรทัด detail นี้ออกก่อนใช้งานจริง" แต่ยังไม่ได้เอาออก ([app/api/chat/route.ts:79](app/api/chat/route.ts))

**5.3 ไม่มี RLS policy ใน 9 ตาราง (ยืนยันจาก Supabase Advisor จริง)**

ตาราง `access_logs`, `clients`, `data_correction_logs`, `document_attachments`, `drug_items`, `otp_logs`, `sessions`, `staff_users`, `timeline_summary` เปิด RLS ไว้แต่ **ไม่มี policy เลย** วันนี้ปลอดภัยเพราะทุก request จริงผ่าน service_role (bypass RLS) แต่หมายความว่า **ไม่มีการป้องกันระดับฐานข้อมูลเลย (zero defense-in-depth)** — ถ้าวันหนึ่งมีโค้ด/ฟีเจอร์ไหนใช้ anon/publishable key เข้าตารางเหล่านี้โดยตรง (บั๊ก, mobile app ใหม่, 3rd-party integration) ข้อมูล session token, password hash, OTP hash, audit log ทั้งหมดจะเปิดหรือปิดสนิทตามค่า default ของ Postgres RLS (deny-by-default หากไม่มี policy ก็ deny ทั้งหมด ซึ่งจริงๆ "ปลอดภัยโดยบังเอิญ" แต่ไม่ใช่การออกแบบที่ตั้งใจ ควรตรวจสอบและเขียน policy อย่างชัดเจนเพื่อไม่ให้พึ่งพาเพียง service_role)

**5.4 ระบบ authentication ปนกันอยู่ 2 ระบบ — ระบบหนึ่งใช้จริง อีกระบบเป็นซากที่เหลือจาก template**

ระบบจริงที่ใช้งานทั้งแอปคือ session แบบ custom (ตาราง `sessions` + cookie `customer_session`/`staff_session`) แต่ในโค้ดยังมี **Supabase Auth starter-kit เดิม** หลงเหลืออยู่เต็ม (`components/login-form.tsx`, `sign-up-form.tsx`, `forgot-password-form.tsx`, หน้า `app/auth/login`, `/sign-up`, `/forgot-password`, `/callback` ฯลฯ) ที่ใช้ `supabase.auth.signInWithPassword()` ซึ่ง **ไม่เชื่อมกับระบบ session จริงเลย** และปุ่ม Google OAuth บนหน้าแรก (`app/actions/auth-google.ts`) ก็เข้า Supabase Auth เช่นกัน — ล็อกอินสำเร็จแต่ไม่ได้สร้าง `customer_session` cookie จริง จึง**ดูเหมือนฟีเจอร์ที่ยังไม่เสร็จ/ใช้งานไม่ได้จริง**

ที่สำคัญกว่านั้น: RLS policy บนตาราง `requests` (`RLS_requests_owner`, "Enable read access for authenticated users", "Enable read access for customers" — ยืนยันจาก Supabase advisor) **อ้างอิง `auth.<function>()`** ซึ่งใช้งานได้เฉพาะกับผู้ใช้ที่ล็อกอินผ่าน Supabase Auth เท่านั้น แต่ลูกค้า/พนักงานจริงแทบทั้งหมดไม่เคยผ่าน Supabase Auth เลย (ใช้ OTP/bcrypt custom) แปลว่า **policy เหล่านี้ตรวจสอบสิทธิ์ตาม identity ที่แทบไม่มีใครมี** — เป็นหลักฐานว่าเดิมทีระบบอาจตั้งใจใช้ Supabase Auth แล้วภายหลังเปลี่ยนมาใช้ custom session แต่ RLS ไม่ได้ถูกปรับตาม กลายเป็นของค้างที่ไม่มีผลจริง (เพราะ service_role bypass อยู่แล้ว) — ควรตัดสินใจให้ชัดว่าจะเก็บหรือลบระบบ Supabase Auth ทิ้ง แล้วปรับ policy ให้ตรงกับโมเดล auth จริง

**5.5 ไม่มี automated test และไม่มี CI เลย**

ไม่พบไฟล์ `*.test.*`/`*.spec.*`, ไม่มี testing library ใน `package.json`, ไม่มี `.github/workflows` — สำหรับระบบที่มี state machine หลายขั้นและเกี่ยวข้องกับมูลค่าเงิน/การปฏิบัติตามกฎระเบียบ (compliance) แบบนี้ การไม่มี test เลยเป็นความเสี่ยงสูง โดยเฉพาะเมื่อพบว่ามีบั๊กจริง (ข้อ 5.1) หลุดไปแล้วโดยไม่มีอะไรจับได้

### 🟡 ระดับปานกลาง

**5.6 Redirect เป้าหมายผิด/ซ้ำซ้อนสำหรับกรณี "ยังไม่ล็อกอิน"** — มีการเช็ค session ซ้ำ 3 ชั้นสำหรับ route เดียวกัน: `app/(authenticated)/layout.tsx` (ถูกต้อง → `/`), `app/(authenticated)/form/layout.tsx` → `redirect('/auth')` (route นี้ไม่มีอยู่จริง จะ 404), `app/(authenticated)/form/page.tsx` → `redirect('/auth/login')` (หน้า legacy ที่ใช้ไม่ได้จริงตามข้อ 5.4)

**5.7 Logic คำนวณสถานะรวมจาก drug items ซ้ำกันคนละที่** — implement เกือบเหมือนกันทั้งใน `wh-actions.ts` และ `logistics-actions.ts` (ฟังก์ชัน `isAllChecked`/`isAllProcessed` ฯลฯ) ทั้งที่มี [app/repositories/ReturnRepository.ts](app/repositories/ReturnRepository.ts) อยู่แล้วซึ่งดูเหมือนตั้งใจเป็นที่รวม logic แบบนี้ แต่ปัจจุบันมีแค่ helper `sanitizeDate` 4 บรรทัด (ที่ก็ยังถูก copy-paste ซ้ำใน `form-actions.ts` และ `staff-form-actions.ts` แทนที่จะ import)

**5.8 `lib/storage.ts` ใช้ bucket แบบ public URL ฝั่ง client** ต่างจาก flow ที่ผ่านการ harden แล้วใน `form-actions.ts` (bucket ส่วนตัว + signed URL + ตรวจขนาด/ชนิดไฟล์) — ควรยืนยันว่าโค้ดนี้ยัง reachable อยู่จริงหรือไม่ ถ้ายังใช้อยู่คือช่องทางที่ลายเซ็นลูกค้าอาจรั่วผ่าน public URL

**5.9 การจับคู่สถานะ/เหตุผลปฏิเสธด้วย regex ข้อความภาษาไทยแบบ free-text** — `lib/tracking-status.ts` เดาไอคอน/สีจาก regex เช่น `/ปฏิเสธ|ยกเลิก|ไม่อนุมัติ/` และ `lib/manager-stats.ts` นับ "เหตุผลปฏิเสธยอดนิยม" โดย group ตาม string เป๊ะๆ ของ `staff_remark` — พนักงานพิมพ์ต่างกันนิดเดียวสถิติจะกระจายผิด ควรเปลี่ยนไปใช้ enum/dropdown แทนข้อความอิสระ

**5.10 ไม่มี pagination ในหน้า analytics** — `getCSRDashboardData` และ `getManagerStatusLogs` ดึงข้อมูล `requests`/`drug_items`/`status_logs` "ทั้งหมด" ทุกครั้งที่โหลดหน้า/เรียก chatbot ภายใน ยังไม่เป็นปัญหาตอนนี้ (ข้อมูลน้อย) แต่จะช้าลงเรื่อยๆ เมื่อข้อมูลโตขึ้น

**5.11 Dependency เสี่ยงเรื่อง reproducibility** — `next` ถูก pin เป็น `"latest"` ตรงๆ ใน `package.json` ต่างจาก dependency อื่นที่ระบุ version ชัดเจน ทำให้ build แต่ละครั้งอาจได้ Next.js คนละ major version

### 🟢 เล็กน้อย

- `console.log` หลุดไปฝั่ง browser เผย env var ทุกครั้งที่สร้าง client ([lib/supabase/client.ts:5](lib/supabase/client.ts))
- `lib/supabase/config.ts` เป็น dead code ที่จะ throw ทันทีถ้ามีคนเอาไปใช้ (อ่าน env var คนละชื่อกับไฟล์อื่น) — ไม่มีที่ import ใช้งานตอนนี้ แต่เป็นกับดักในอนาคต
- เนื้อหานโยบายการคืนสินค้าถูกพิมพ์ซ้ำอยู่ 2 ที่ (`lib/chatbot-knowledge.ts` กับ `components/ReturnPolicySection.tsx`) — ต้อง sync มือ

### จาก Supabase Performance Advisor (ยืนยันจริงจากระบบ)

- `auth_rls_initplan` (WARN) ×3 — policy บน `requests`/`status_logs` เรียก `auth.<function>()` แบบ re-evaluate ทุกแถว ควรครอบด้วย `(select auth.<function>())`
- `multiple_permissive_policies` (WARN) — ตาราง `requests` มี 3 policy ที่ทับซ้อนกันสำหรับ role `authenticated` action `SELECT`
- Foreign key ที่ไม่มี index รองรับ: `request_pings.customer_id`, `request_pings.read_by`, `requests.created_by_staff_id`
- Index ที่สร้างไว้แต่ไม่เคยถูกใช้เลยหลายตัว (เช่น `idx_sessions_customer_id`, `idx_access_logs_*`, `idx_document_attachments_*`) — ปกติสำหรับระบบข้อมูลน้อย ยังไม่ต้องรีบลบ แต่ควรรีเช็คหลังมีข้อมูลจริงมากขึ้น

---

## 6. ประเมินศักยภาพเชิงธุรกิจ (Business Potential)

**กลุ่มเป้าหมาย/pain point:** กระบวนการรับคืน-แลกเปลี่ยนยา/เวชภัณฑ์ระหว่างองค์กร (ดูจากโดเมน `newgpo` และคำว่า GPO ในโค้ด บ่งชี้บริบทหน่วยงานเภสัชภัณฑ์ของรัฐ) กับโรงพยาบาลคู่ค้า เป็นงานที่แต่เดิมทำด้วยกระดาษ/เอกสารและมีหลายแผนกเกี่ยวข้อง (CSR → โลจิสติกส์ → คลัง → CSR) การมีระบบติดตามสถานะแบบ real-time พร้อม audit trail ตอบโจทย์ pain point จริงเรื่อง "งานหาย/ตามงานไม่ได้/ไม่รู้ว่าใครทำอะไรไปบ้าง"

**จุดที่ทำให้มีศักยภาพ:**
- Workflow ครอบคลุมครบทุกแผนกจริงในองค์กร ไม่ใช่แค่ฟอร์มเดียว
- มี audit/compliance trail ในระดับที่เหมาะกับงานกำกับดูแล (status_logs, data_correction_logs, access_logs) ซึ่งมักเป็นจุดที่ระบบลักษณะนี้ในหน่วยงานราชการ/รัฐวิสาหกิจต้องมี
- Chatbot 2 ชั้น (ลูกค้า FAQ + พนักงานวิเคราะห์ข้อมูล) เป็นฟีเจอร์ที่เพิ่มมูลค่าได้จริงถ้าทำสำเร็จ ลดภาระ CSR ตอบคำถามซ้ำๆ และช่วยผู้บริหารดูภาพรวมได้เร็วขึ้น
- เลือกใช้ Postgres แทน Redis สำหรับ rate-limit แสดงว่ามีความคิดเรื่อง self-hosting/deployment ที่ไม่ผูกกับ vendor เพิ่ม เหมาะกับหน่วยงานรัฐที่มักมีข้อจำกัดเรื่อง cloud vendor

**ความเสี่ยงที่กระทบศักยภาพ:**
- **Bus factor = 1** (ผู้พัฒนาคนเดียว, ไม่มี test, ไม่มี CI/เอกสาร) — หากต้องส่งต่อทีมอื่นดูแลต่อจะใช้เวลานานและเสี่ยงสูง
- ช่องโหว่ด้าน auth/RLS ที่พบ (ข้อ 5.3–5.4) มีน้ำหนักมากเป็นพิเศษเพราะระบบนี้เก็บข้อมูลที่เชื่อมโยงกับ **PDPA** (มี `access_logs`, `pdpa_consented_at` ในตาราง `clients` แสดงว่าตระหนักเรื่องนี้อยู่แล้ว) — ถ้าจะขยายไปใช้กับโรงพยาบาลจริงจำนวนมาก ต้องปิดช่องโหว่พวกนี้ก่อน ไม่ใช่ทางเลือก
- Rate-limit ที่ใช้งานไม่ได้จริง (ข้อ 5.1) เปิดช่องให้ปั่นสร้างคำขอ/ส่งอีเมล/สร้าง PDF จำนวนมาก ซึ่งกระทบทั้งต้นทุน (อีเมล, storage) และอาจถูกใช้เป็นช่องทาง spam/DoS เบาๆ ได้
- ยังเป็น pilot scale (ข้อมูลหลักหลักสิบแถว) การ query แบบไม่มี pagination ยังไม่กระทบตอนนี้ แต่ถ้าจะ "ไปจริง" ทั้งองค์กรต้องแก้ก่อนข้อมูลโต

**ข้อสรุปศักยภาพ:** แนวคิดและ workflow ของระบบเข้มแข็งและตรงจุด ระบบนี้**พร้อมสำหรับ pilot ภายในหรือทดสอบกับกลุ่มลูกค้าจำกัด** แต่ **ยังไม่ควรเปิดใช้งานเป็นวงกว้างกับข้อมูลโรงพยาบาลจริงจนกว่าจะปิดช่องโหว่ระดับวิกฤต (หัวข้อ 5.1–5.5) และเพิ่ม automated testing** เพื่อป้องกันบั๊กแบบที่เพิ่งพบ (rate-limit) ไม่ให้เกิดซ้ำแบบเงียบๆ อีก

---

## 7. คำแนะนำ เรียงลำดับความสำคัญ

**P0 — ก่อนใช้งานกับข้อมูลจริงในวงกว้าง**
1. แก้บั๊ก rate-limit ทั้ง 7 จุด (เปลี่ยน `if (!allowed)` → `if (!allowed.allowed)`)
2. เอา debug grid ออกจาก `pdf-service.ts` และเอา `detail` ที่รั่ว error ออกจาก `app/api/chat/route.ts`
3. ตัดสินใจและรวมระบบ auth ให้เหลือระบบเดียว — ลบ Supabase-Auth starter scaffold ที่ไม่ได้ใช้ (หรือเชื่อม Google OAuth ให้ทำงานจริงถ้าต้องการเก็บไว้) แล้วปรับ RLS policy บน `requests` ให้สอดคล้องกับโมเดล auth จริง
4. ทบทวนตาราง 9 ตารางที่ไม่มี RLS policy — เขียน policy อย่างตั้งใจ (หรือยืนยันว่า deny-all ถูกต้องแล้วบันทึกเหตุผลไว้) อย่าปล่อยให้ปลอดภัยเพราะบังเอิญ

**P1 — เสริมความมั่นคงของระบบ**
5. เพิ่ม automated test อย่างน้อยสำหรับ state-machine ของ `wh-actions.ts`/`logistics-actions.ts`/`csr-actions.ts` ซึ่งเป็นหัวใจธุรกิจ
6. เพิ่ม CI ขั้นต่ำ (lint + build) ใน `.github/workflows`
7. Pin เวอร์ชัน Next.js ให้ชัดเจนแทน `"latest"`

**P2 — ลดหนี้เทคนิค**
8. รวม logic คำนวณสถานะจาก drug items เป็น helper เดียว ใช้ `ReturnRepository.ts` ให้เป็นประโยชน์จริง
9. แก้ redirect เป้าหมายผิดใน `form/layout.tsx` และ `form/page.tsx`
10. ยืนยันสถานะ `lib/storage.ts` (ยังใช้จริงหรือไม่) และถ้าเลิกใช้ให้ลบทิ้ง
11. เพิ่ม pagination/caching ให้ query สถิติของ manager dashboard และ staff chatbot

**P3 — Performance tuning ตาม Supabase Advisor**
12. ครอบ `auth.<function>()` ใน RLS policy ด้วย `(select ...)`, รวม policy ที่ซ้ำซ้อนบน `requests`, เพิ่ม index ให้ FK ที่ขาด, ทบทวน index ที่ไม่เคยถูกใช้

---

*เอกสารนี้จัดทำจากการอ่านโค้ดในบรานช์ `RLS_supabase` ณ commit `d182a66` ร่วมกับข้อมูล schema/security/performance advisor จริงจาก Supabase MCP เมื่อวันที่ 2026-07-27 ควรอ่านร่วมกับ diff การเปลี่ยนแปลงล่าสุดหากมีการแก้ไขโค้ดหลังจากนี้*
