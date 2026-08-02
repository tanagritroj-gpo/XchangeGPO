# คู่มือ Self-Hosting 101 อย่างละเอียด
### GPO Xchange Portal (Next.js + Supabase/PostgreSQL)

**จัดทำเมื่อ:** 30 กรกฎาคม 2569
**เป้าหมาย:** อธิบายขั้นตอนย้ายระบบจาก Supabase Cloud ไปสู่การโฮสต์เอง (self-host) ตั้งแต่พื้นฐานจนถึงจุดที่ต้องระวังเฉพาะของโปรเจกต์นี้ เหมาะสำหรับทีมที่ต้องการควบคุมข้อมูลเองทั้งหมด (เช่น ข้อกำหนดข้อมูลต้องอยู่ในประเทศ, ลดต้นทุนระยะยาว, หรือข้อกำหนดด้านความมั่นคงของหน่วยงานรัฐ)

---

## 0. ทำความเข้าใจก่อนเริ่ม: Self-host คืออะไร กับใครควรทำ

Self-host หมายถึงการรันทั้ง Postgres, Auth, Storage, Realtime และส่วนประกอบอื่นๆ ของ Supabase เองบนเซิร์ฟเวอร์ที่หน่วยงานควบคุม (on-premise หรือ cloud VM ของตัวเอง) แทนการใช้ Supabase Cloud ที่จัดการให้ทั้งหมด

**ข้อดี:** ควบคุมข้อมูลเต็มรูปแบบ, ไม่มีค่าใช้จ่ายรายเดือนตาม usage ของ Supabase, ปรับแต่ง infrastructure ได้อิสระ
**ข้อเสีย/สิ่งที่ต้องรับผิดชอบเอง:** backup, patching ความปลอดภัย, การขยายระบบ (scaling), monitoring, และ downtime ทั้งหมดเป็นความรับผิดชอบของทีมเอง — Supabase Cloud จัดการเรื่องเหล่านี้ให้อัตโนมัติ

**คำแนะนำ:** ควรมีทีมหรือบุคลากรที่ดูแล infrastructure/DevOps อย่างน้อย 1 คนก่อนตัดสินใจ self-host เต็มรูปแบบ หากยังไม่มี ให้พิจารณา "Supabase self-hosted แบบ managed VM" ผ่านผู้ให้บริการ cloud ที่คุ้นเคย (เช่น DigitalOcean, AWS EC2) เป็นจุดกึ่งกลางก่อน

---

## 1. เตรียมความพร้อมก่อนย้าย (สิ่งที่ต้องทำใน repo นี้ก่อนวันย้ายจริง)

โปรเจกต์นี้มีพื้นฐานที่ดีสำหรับ self-host อยู่แล้ว เพราะเลือกใช้ PostgreSQL สำหรับ rate-limiting แทน Redis และมี migration files ครบใน `supabase/migrations/` แต่ควรตรวจสอบรายการต่อไปนี้ก่อนย้ายจริง:

1. **Schema ต้องมาจาก migration files เท่านั้น** — ห้ามมี schema ใดที่แก้ผ่านหน้า Supabase Studio โดยไม่มี migration บันทึกไว้ ตรวจสอบด้วยการรัน `supabase db diff` เทียบระหว่าง production กับ migration history ก่อนย้าย ถ้าต่างกันต้องสร้าง migration ปิด gap ก่อน
2. **แยก config ออกจากโค้ดแล้วหรือยัง** — ตรวจว่า `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ทั้งหมดอ่านจาก environment variable เท่านั้น (ระบบนี้ทำถูกต้องแล้วผ่าน `.env.local`) เพื่อให้สลับไปชี้ instance self-host ได้โดยไม่แก้โค้ด
3. **ตรวจสอบว่า `service_role` key ไม่หลุดไปฝั่ง client** — ทุกไฟล์ที่ import `admin as supabaseAdmin` ต้องมี `import 'server-only'` กำกับ (ระบบนี้ทำอยู่แล้วในหลายจุด ควรตรวจให้ครบทุกไฟล์ก่อนย้าย)
4. **List extension ที่ใช้จริง** — โปรเจกต์นี้ใช้ `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `pg_cron`, `supabase_vault` เป็นอย่างน้อย (ตรวจสอบจาก `list_extensions`) ต้องแน่ใจว่า self-host image รองรับ extension เหล่านี้ครบก่อนย้าย
5. **Rate limit ที่ทำเองบน Postgres ไม่ต้องแก้อะไร** — เป็นข้อดีของการออกแบบเดิม เพราะไม่ผูกกับ Redis/Vercel KV ที่ Supabase Cloud อาจให้บริการเสริม

---

## 2. ทางเลือกในการ Self-host

| แนวทาง | เหมาะกับ | ความซับซ้อน |
|---|---|---|
| **Supabase Docker Compose (official self-hosting kit)** | ทีมที่ต้องการ stack ครบ (Postgres+Auth+Storage+Realtime+Studio) เหมือน Cloud | ปานกลาง |
| **Postgres เปล่า + เขียน Auth/Storage เอง** | ทีมที่ต้องการควบคุมทุกส่วน และมีระบบ auth ของตัวเองอยู่แล้ว | สูง |
| **Managed Postgres (RDS/Cloud SQL) + Supabase self-host เฉพาะ Auth/Storage/Realtime** | ทีมที่อยากลดภาระดูแล DB เอง แต่ยังคุม service อื่น | ปานกลาง-สูง |

**สำหรับระบบนี้ แนะนำแนวทางแรก (Docker Compose)** เพราะระบบใช้ session แบบเขียนเอง **ไม่ได้พึ่ง Supabase Auth (`auth.users`) เป็นระบบยืนยันตัวตนจริง** อยู่แล้ว (ใช้ตาราง `sessions` ของตัวเอง) จึงมีความยืดหยุ่นสูงกว่าโปรเจกต์ทั่วไปที่ผูกกับ Supabase Auth เต็มรูปแบบ — ส่วนที่ต้อง self-host จริงๆ คือ **Postgres + Storage** เป็นหลัก ส่วน Auth service ของ Supabase อาจไม่จำเป็นต้องรันเลยด้วยซ้ำถ้าตัดสินใจเลิกใช้ Google OAuth ผ่าน Supabase Auth

---

## 3. ขั้นตอนติดตั้ง Supabase Self-hosted (Docker Compose)

### ขั้นที่ 1 — เตรียมเซิร์ฟเวอร์

- ขั้นต่ำแนะนำ: 4 vCPU, 8GB RAM, SSD storage (ปรับตามปริมาณข้อมูลและผู้ใช้พร้อมกัน)
- ติดตั้ง Docker และ Docker Compose บนเซิร์�ฟเวอร์ (Ubuntu LTS แนะนำสำหรับความเสถียร)
- เปิด firewall เฉพาะพอร์ตที่จำเป็น (443 สำหรับ HTTPS, ปิดพอร์ต Postgres/Studio จากอินเทอร์เน็ตสาธารณะ ให้เข้าถึงผ่าน VPN/internal network เท่านั้น)


### ขั้นที่ 2 — ดาวน์โหลด Supabase self-hosting kit

```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```

### ขั้นที่ 3 — ตั้งค่า environment variables สำคัญใน `.env`

- `POSTGRES_PASSWORD` — ตั้งรหัสผ่านที่แข็งแรง (ไม่ใช้ค่า default เด็ดขาด)
- `JWT_SECRET` — สุ่มค่าใหม่ ห้ามใช้ค่าตัวอย่างจากเอกสาร
- `ANON_KEY` / `SERVICE_ROLE_KEY` — สร้างใหม่ด้วย JWT ที่เซ็นด้วย `JWT_SECRET` ของตัวเอง (มีสคริปต์ช่วยสร้างใน repo ของ Supabase)
- `SITE_URL` — ตั้งเป็นโดเมนจริงของระบบ ไม่ใช่ localhost

### ขั้นที่ 4 — รันระบบ

```bash
docker compose up -d
```

ตรวจสอบว่า container ทั้งหมด (`db`, `auth`, `rest`, `storage`, `realtime`, `studio`, `kong`) รันสถานะ `healthy` ก่อนดำเนินการต่อ

### ขั้นที่ 5 — ย้าย schema เข้า instance ใหม่

```bash
# ใช้ Supabase CLI เชื่อมต่อ instance ใหม่ แล้ว push migration ที่มีอยู่ใน repo
supabase link --project-ref <self-host-ref-หรือ-connection-string>
supabase db push
```

**สำคัญ:** ต้องรัน migration ทุกไฟล์ตามลำดับเวลาใน `supabase/migrations/` ห้ามข้ามหรือรันแบบสุ่ม เพราะบาง migration แก้ trigger/constraint ที่อ้างอิงกัน (เช่น migration ที่แก้ `check_document_attachment_consistency()` ให้รองรับคอลัมน์ `client_id` ต้องรันหลัง migration ที่เพิ่มคอลัมน์นั้นเข้ามาก่อน)

### ขั้นที่ 6 — ย้ายข้อมูล (ถ้ามีข้อมูลจริงอยู่แล้วบน Cloud)

```bash
# Export จาก Supabase Cloud
pg_dump --data-only --format=custom -h <cloud-host> -U postgres -d postgres > data.dump

# Import เข้า self-host instance
pg_restore --data-only -h <self-host-ip> -U postgres -d postgres data.dump
```

ทดสอบนับจำนวนแถวในตารางสำคัญ (`requests`, `drug_items`, `b2b_customers`) เทียบกับต้นทางให้ตรงกันทุกตารางก่อนตัดสินใจ cutover จริง

---

## 4. จุดที่ต้องระวังเป็นพิเศษ — สิทธิ์ (Permissions) ของตาราง/ฟังก์ชันใหม่

นี่คือจุดที่สำคัญที่สุดจุดหนึ่งสำหรับโปรเจกต์นี้ และมักถูกมองข้าม:

### 4.1 ปัญหา: ตาราง/ฟังก์ชันใหม่ที่สร้างในอนาคตจะได้รับสิทธิ์อัตโนมัติ

เมื่อสร้างตารางหรือฟังก์ชันใหม่บน Postgres (ไม่ว่าจะบน Supabase Cloud หรือ self-host) ระบบจะให้สิทธิ์ `EXECUTE`/บางกรณี `SELECT` แก่ pseudo-role ที่ชื่อ `PUBLIC` เป็นค่าเริ่มต้นเสมอ และเนื่องจาก `anon` และ `authenticated` เป็นสมาชิกของ `PUBLIC` โดยอัตโนมัติ **หมายความว่าตาราง/ฟังก์ชันใหม่ทุกตัวจะถูก "แจกกุญแจ" ให้บุคคลภายนอกโดยไม่ได้ตั้งใจ ถ้าไม่ตั้งค่า RLS/GRANT ให้ถูกต้องตั้งแต่วันที่สร้าง**

**ข้อจำกัดสำคัญ:** นี่เป็นพฤติกรรมเริ่มต้นระดับ PostgreSQL/สิทธิ์ผู้ดูแลระบบของแพลตฟอร์ม **ทีมพัฒนาไม่สามารถแก้ "กฎ" นี้ได้เอง** ทำได้เพียงแก้ "กุญแจของห้องที่เจอ" คือไปตั้งค่า RLS/GRANT ของแต่ละตาราง/ฟังก์ชันที่สร้างขึ้นเป็นรายตัวเท่านั้น (สำหรับ Supabase Cloud การเปลี่ยน default behavior นี้ต้องติดต่อ Supabase Support โดยตรง)

### 4.2 Checklist บังคับทุกครั้งที่สร้างตาราง/ฟังก์ชันใหม่

เนื่องจากไม่มีทางแก้ที่ระดับกฎ จึงต้องมี **checklist บังคับ** ที่ทุกคนในทีมทำตามทุกครั้งไม่มีข้อยกเว้น:

1. **ทุกตารางใหม่:** เปิด RLS ทันทีหลังสร้าง (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`) แล้วเขียน policy จริงหรือปล่อยเป็น deny-all อย่างตั้งใจ (ไม่ใช่ลืมเขียน policy)
2. **ทุกฟังก์ชันใหม่:** รัน `REVOKE EXECUTE ON FUNCTION <ชื่อฟังก์ชัน> FROM PUBLIC;` แล้ว `GRANT EXECUTE ... TO service_role;` เฉพาะ role ที่ต้องใช้จริง — **ต้อง revoke จาก `PUBLIC` โดยตรง ไม่ใช่ revoke จาก `anon`/`authenticated` แยกกัน** เพราะสิทธิ์ที่มาจากการเป็นสมาชิก `PUBLIC` จะไม่หายไปถ้า revoke ผิดที่
3. **Verify ด้วยคำสั่งตรวจสอบจริง ห้ามเชื่อว่ารันสำเร็จแล้วจบ:**
   ```sql
   SELECT has_function_privilege('anon', '<ชื่อฟังก์ชัน>(<parameter types>)', 'EXECUTE');
   SELECT has_function_privilege('authenticated', '<ชื่อฟังก์ชัน>(<parameter types>)', 'EXECUTE');
   -- ต้องได้ผลลัพธ์ false ทั้งคู่สำหรับฟังก์ชันที่ไม่ควรเรียกจาก client โดยตรง
   ```
4. **รัน security advisor หลังทุกการเปลี่ยนแปลง schema** — ถ้าใช้ Supabase Cloud มี `get_advisors` ให้ใช้ได้ทันที ถ้า self-host ต้องเขียน query ตรวจสอบเองด้วย `pg_policies`, `pg_proc`, และ `has_function_privilege()` เป็นประจำ (แนะนำทำเป็นสคริปต์ตรวจสอบอัตโนมัติรันหลัง deploy ทุกครั้ง)
5. **บันทึกเป็นเอกสารทุกครั้งที่ตั้งใจเปิดสิทธิ์กว้าง** (เช่น ฟังก์ชัน tracking แบบ public ที่ไม่ต้องล็อกอิน) พร้อมเหตุผล เพื่อไม่ให้คนถัดไปเข้าใจผิดว่าเป็นความผิดพลาด แล้วไป "แก้" จนกระทบฟีเจอร์ที่ตั้งใจเปิดไว้

### 4.3 เหตุผลที่ต้องเข้มงวดเรื่องนี้เป็นพิเศษสำหรับระบบนี้

ระบบนี้เก็บข้อมูลที่เชื่อมโยงกับ **PDPA** (มี `pdpa_consented_at`, `access_logs`) และข้อมูลลูกค้า B2B ที่มีมูลค่าทางธุรกิจ (`b2b_customers`, `requests.total_value`) เคยพบมาแล้วในการตรวจสอบระบบนี้ว่า policy ที่เปิดกว้างเกินไปทำให้ใครก็ตามที่มี anon key (เป็นค่าที่เปิดเผยต่อสาธารณะโดยธรรมชาติ เพราะฝังอยู่ใน client-side code) สามารถดึงข้อมูลลูกค้าทั้งตารางได้โดยไม่ต้องล็อกอิน — ซึ่งได้รับการแก้ไขแล้ว แต่เป็นตัวอย่างจริงว่าความผิดพลาดประเภทนี้เกิดขึ้นได้ง่ายและกระทบหนัก จึงต้องมี checklist ป้องกันไม่ให้เกิดซ้ำกับตาราง/ฟังก์ชันที่จะสร้างใหม่ในอนาคต

---

## 5. Storage Buckets — สิ่งที่ต้องตั้งค่าใหม่บน Self-host

โปรเจกต์นี้ใช้ 3 bucket หลัก: `return-documents` (ลายเซ็นคำร้อง), `registration-documents` (เอกสารยืนยันการลงทะเบียน), และ bucket ที่เก็บลายเซ็นลูกค้าตอนสมัคร ทั้งหมดต้องตั้งเป็น **private** (`public = false`) บน self-host instance และเข้าถึงผ่าน signed URL เท่านั้นเหมือนบน Cloud — ตรวจสอบ policy ของแต่ละ bucket แยกกันสำหรับ SELECT/INSERT/UPDATE/DELETE เพราะ `public=false` ไม่ได้แปลว่าปิดสิทธิ์เขียน/ลบไปด้วยโดยอัตโนมัติ ต้องเขียน storage policy กำกับแยกต่างหาก

---

## 6. Backup และ Disaster Recovery

Self-host **ไม่มี auto-backup ให้เหมือน Supabase Cloud** จึงต้องวางแผนเอง:

1. **pg_dump รายวัน** อย่างน้อย ตั้ง cron job export ทั้ง schema และข้อมูลไปเก็บนอกเซิร์ฟเวอร์หลัก (เช่น object storage แยก region)
2. **WAL archiving / PITR (Point-in-Time Recovery)** ถ้าต้องการ restore ย้อนไปเวลาใดก็ได้ ไม่ใช่แค่ ณ เวลาที่ backup ล่าสุด — สำคัญมากสำหรับระบบที่มีธุรกรรมทางการเงิน/มูลค่าสินค้า
3. **ทดสอบ restore จริงอย่างน้อยไตรมาสละครั้ง** — backup ที่ไม่เคยทดสอบ restore ถือว่ายังพิสูจน์ไม่ได้ว่าใช้งานได้จริง
4. **แยก backup ของ Storage bucket ต่างหากจาก database** เพราะไฟล์ PDF/ลายเซ็นอยู่ใน object storage คนละระบบกับ Postgres data

---

## 7. Monitoring และการดูแลต่อเนื่อง

- ตั้ง monitoring สำหรับ container health (`db`, `auth`, `storage`, `realtime`) ด้วยเครื่องมือเช่น Prometheus + Grafana หรือ uptime checker พื้นฐาน
- เปิดใช้ `pg_stat_statements` (มีอยู่แล้วในโปรเจกต์) เพื่อดู query ที่ช้าเมื่อข้อมูลเริ่มโตขึ้น
- ตั้ง alert เมื่อ disk usage ของ Postgres/Storage เกิน threshold ที่กำหนด (เช่น 80%) เพราะ self-host ไม่มีการขยาย storage อัตโนมัติแบบ Cloud
- วางแผน patching security ของ Docker images เป็นระยะ (Supabase self-hosting kit มีการอัปเดต image สม่ำเสมอ ควรติดตามและทดสอบก่อนอัปเดต production)

---

## 8. ขั้นตอนสรุปสำหรับวัน Cutover จริง

1. หยุดรับคำขอใหม่ชั่วคราว (maintenance mode) แจ้งผู้ใช้ล่วงหน้า
2. รัน `pg_dump` ครั้งสุดท้ายจาก Cloud (ข้อมูลล่าสุดที่สุด)
3. Import เข้า self-host instance ที่เตรียมไว้แล้วตามขั้นตอนข้างต้น
4. รัน checklist สิทธิ์ (หัวข้อ 4.2) ครบทุกตาราง/ฟังก์ชันก่อนเปิดใช้งาน
5. สลับ environment variable (`NEXT_PUBLIC_SUPABASE_URL` ฯลฯ) ของแอป Next.js ให้ชี้ไปยัง self-host instance
6. ทดสอบ smoke test ครบทุก flow หลักตามเอกสาร UAT (`02-valuation-uat.md`) อีกครั้งบน instance ใหม่ก่อนประกาศเปิดใช้งานจริง
7. เก็บ Supabase Cloud instance เดิมไว้แบบ read-only อย่างน้อย 1-2 สัปดาห์เป็น fallback ก่อนปิดถาวร
