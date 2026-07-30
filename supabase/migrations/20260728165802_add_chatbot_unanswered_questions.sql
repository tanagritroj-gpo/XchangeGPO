-- เก็บคำถามที่บอทลูกค้าตอบ "ไม่แน่ใจ" ไว้ทบทวน — ปิด loop ระหว่างคำถามจริงที่
-- ลูกค้าถามกับเนื้อหาที่มีอยู่ใน FAQ_ENTRIES (lib/chatbot-knowledge.ts) ถ้าพบว่า
-- คำถามแบบเดิมถูกถามซ้ำบ่อย ค่อยเพิ่มเข้า FAQ_ENTRIES

create table public.chatbot_unanswered_questions (
  id bigint generated always as identity primary key,
  question text not null,
  answer text,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.chatbot_unanswered_questions is
  'คำถามที่บอทลูกค้า (app/api/chat) ตอบว่า "ไม่แน่ใจ" — เก็บไว้ให้ manager ทบทวนว่าควรเพิ่มเข้า FAQ_ENTRIES ไหม';

alter table public.chatbot_unanswered_questions enable row level security;

create policy "deny_client_access" on public.chatbot_unanswered_questions
  for all to anon, authenticated using (false) with check (false);
