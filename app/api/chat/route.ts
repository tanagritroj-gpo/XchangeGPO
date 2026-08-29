import { NextRequest } from 'next/server';
import { CHATBOT_SYSTEM_PROMPT, MAX_HISTORY_MESSAGES } from '@/lib/chatbot-knowledge';
import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getCustomerSession } from '@/app/actions/auth-actions';
import { checkRateLimit } from '@/lib/rate-limit';

// วลีที่ prompt สั่งให้บอทพูดตรงๆ เวลาไม่มั่นใจ (ดู "กฎกันตอบมั่ว" ใน
// CHATBOT_SYSTEM_PROMPT) ใช้จับคำถามที่บอทตอบไม่ได้เพื่อเก็บไว้ทบทวน
const UNCERTAIN_MARKER = 'ไม่แน่ใจ';

// จำนวนตัวอักษรสูงสุดต่อ 1 ข้อความ — กัน request เดี่ยวที่ยัดข้อความยาวผิดปกติ
// เข้ามาเพื่อดันต้นทุน token (ไม่เกี่ยวกับ MAX_HISTORY_MESSAGES ที่คุมแค่ "จำนวน"
// ข้อความ ไม่ได้คุม "ความยาว" ของแต่ละข้อความ) 1,500 ตัวอักษรเผื่อเหลือเฟือสำหรับ
// คำถาม FAQ จริงที่ยาวที่สุดในระบบ (ยาวสุดตอนนี้ไม่ถึง 200 ตัวอักษร)
const MAX_MESSAGE_LENGTH = 1500;

/**
 * POST /api/chat
 *
 * รับ { messages: { role: 'user' | 'assistant'; text: string }[] } แล้วเรียก
 * Gemini API แบบ streaming ต่อ — ส่ง SSE stream กลับให้ client อ่านต่อตรงๆ
 * ไม่ประมวลผลซ้ำฝั่ง server เพื่อลด latency/complexity
 *
 * ── ทำไมต้องผ่าน route นี้ ไม่เรียก Gemini ตรงจาก browser ──
 * GEMINI_API_KEY ต้องอยู่ฝั่ง server เท่านั้น (env var ไม่มี prefix NEXT_PUBLIC_)
 * ถ้าเรียกจาก client โดยตรง key จะหลุดไปอยู่ใน bundle ที่ใครก็ดูได้จาก DevTools
 *
 * ── auth + rate limit (แก้ตามรายงาน audit วันที่ 2569-08-11 — เดิมไม่มีทั้งคู่) ──
 * เช็ค session ก่อนอย่างอื่นทั้งหมดเหมือน /api/staff-chat — ChatWidget ของลูกค้า
 * mount เฉพาะใน layout ที่ authenticated อยู่แล้ว (welcome/(authenticated)) ไม่มี
 * flow ไหนที่ตั้งใจให้คนไม่ login คุยกับบอทได้ การเช็ค session ก่อนเรียก Gemini
 * ทุกครั้งจึงตัดต้นทุน token จากผู้ใช้ไม่ผ่านการยืนยันตัวตนได้เท่ากับศูนย์ (ไม่ใช่แค่
 * ป้องกัน แต่ยังเป็นเกราะหลักด้าน "ไม่เปลือง token" ด้วย) ต่อด้วย rate limit ผูกกับ
 * customer.id กันบัญชีเดียว (ถูกขโมย/สคริปต์ยิงถี่) ถล่ม Gemini API เกินจำเป็น —
 * 30 ครั้ง/10 นาที กว้างพอสำหรับสนทนาจริงกับ FAQ bot แต่บล็อกการยิงรัวแบบสคริปต์
 *
 * ── เผื่อขยายชุดคำถาม (FAQ_ENTRIES) ในอนาคต ──
 * ตอนนี้ CHATBOT_SYSTEM_PROMPT ยัดทุกคำถาม/คำตอบเข้า system prompt เดียวส่งทุก
 * request (ดู lib/chatbot-knowledge.ts) เหมาะกับขนาดปัจจุบัน (~10 entries) ถ้า
 * FAQ_ENTRIES โตขึ้นมากในอนาคต (หลักสิบ-ร้อยรายการ) ต้นทุน token/request จะโตเป็น
 * เส้นตรงตามไปด้วย ถึงจุดนั้นควรเปลี่ยนไปใช้ pattern แบบ function-calling/retrieval
 * (ดึงเฉพาะ entry ที่เกี่ยวข้องตามคำถาม) แบบเดียวกับที่ /api/staff-chat ใช้กับ
 * TOOLS อยู่แล้ว แทนที่จะยัดทุกอย่างเข้า prompt เดียวเหมือนตอนนี้ — rate limit
 * และการเช็ค auth ในไฟล์นี้ออกแบบให้ไม่ผูกกับโครง prompt แบบใดแบบหนึ่ง จึงไม่ต้อง
 * แก้ตรงนี้ซ้ำตอนเปลี่ยนโครง FAQ ในอนาคต
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// gemini-2.0-flash ปิดบริการไปแล้ว 1 มิ.ย. 2026
// gemini-2.5-flash-lite แม้ยังไม่ถึงวันปิดบริการทางการ (16 ต.ค. 2026) แต่
// Google เริ่มบล็อกไม่ให้ API key ที่สร้างใหม่เข้าถึงแล้ว (คืน 404 "no
// longer available to new users") — ข้ามไปใช้รุ่น 3.x ที่เป็นรุ่นปัจจุบัน
// จริงๆ แทน ตัดปัญหานี้ทิ้งไปเลย
const MODEL = 'gemini-3.1-flash-lite';

export async function POST(req: NextRequest) {
  // ── 1. เช็ค session ก่อนอย่างอื่นทั้งหมด (เหมือน /api/staff-chat) — ตัดจบ
  // ทันทีถ้าไม่ได้ login ไม่แตะ Gemini เลยแม้แต่ครั้งเดียว ──
  const customer = await getCustomerSession();
  if (!customer?.id) {
    return Response.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }

  if (!GEMINI_API_KEY) {
    return Response.json(
      { error: 'ระบบแชทยังไม่พร้อมใช้งาน (ไม่พบ GEMINI_API_KEY)' },
      { status: 500 },
    );
  }

  let body: { messages?: { role: string; text: string }[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'รูปแบบคำขอไม่ถูกต้อง' }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return Response.json({ error: 'ไม่มีข้อความ' }, { status: 400 });
  }
  if (messages.some((m) => typeof m.text !== 'string' || m.text.length > MAX_MESSAGE_LENGTH)) {
    return Response.json({ error: 'ข้อความยาวเกินไป กรุณาสั้นลง' }, { status: 400 });
  }

  // ── 2. Rate limit ผูกกับลูกค้าคนนี้ — กันบัญชีเดียว (ถูกขโมย/สคริปต์) ยิงถี่
  // เกินจำเป็น 30 ครั้ง/10 นาที กว้างพอสำหรับสนทนาจริง ──
  // ใช้ failMode 'closed' (ค่าเริ่มต้น) โดยตั้งใจ — rate limit ตรงนี้กันต้นทุน token ของ
  // Gemini ถ้า DB สะดุดจนเช็คไม่ได้ ยอมให้แชทบอท (ฟีเจอร์เสริม) ตอบ error ชั่วคราว
  // ดีกว่าปล่อยให้สคริปต์ยิงถล่ม Gemini ในช่วงนั้น
  const rateResult = await checkRateLimit(`chat:${customer.id}`, 30, 600);
  if (!rateResult.allowed) {
    return Response.json({ error: 'ส่งข้อความถี่เกินไป กรุณาลองใหม่อีกครั้งในอีกสักครู่' }, { status: 429 });
  }

  // เก็บแค่ history ล่าสุด N ข้อความ กันส่ง context ยาวเกินจำเป็น (คุมต้นทุน)
  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES);

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: CHATBOT_SYSTEM_PROMPT }] },
        contents: trimmed.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.text }],
        })),
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.3,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      }),
    },
  );

  if (!geminiRes.ok || !geminiRes.body) {
    const errText = await geminiRes.text().catch(() => '');
    console.error('Gemini API error:', geminiRes.status, errText);
    return Response.json(
      { error: 'เชื่อมต่อผู้ช่วย AI ไม่สำเร็จ กรุณาลองใหม่' },
      { status: 502 },
    );
  }

  // tee ก็อปปี้ stream ออกเป็น 2 ทาง: ทางหนึ่งส่งกลับ client ตามปกติ (ไม่หน่วง
  // latency เลย) อีกทางอ่านใน background เพื่อตรวจว่าบอทตอบ "ไม่แน่ใจ" ไหม
  // ถ้าใช่ เก็บคำถามไว้ให้ manager ทบทวนว่าควรเพิ่มเข้า FAQ_ENTRIES
  const [clientStream, loggingStream] = geminiRes.body.tee();
  const lastUserMessage = trimmed[trimmed.length - 1];
  if (lastUserMessage?.role === 'user') {
    logIfUncertain(loggingStream, lastUserMessage.text).catch((e) =>
      console.error('logIfUncertain failed:', e),
    );
  } else {
    loggingStream.cancel().catch(() => {});
  }

  return new Response(clientStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

async function logIfUncertain(stream: ReadableStream<Uint8Array>, question: string) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr) continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const piece = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (piece) fullText += piece;
      } catch {
        // chunk ยังไม่ครบ JSON — ข้ามไปรอบถัดไป เหมือนฝั่ง client
      }
    }
  }

  if (!question.trim() || !fullText.includes(UNCERTAIN_MARKER)) return;

  const { error } = await supabaseAdmin.from('chatbot_unanswered_questions').insert({
    question: question.slice(0, 1000),
    answer: fullText.slice(0, 2000),
  });
  if (error) console.error('Failed to log unanswered chatbot question:', error.message);
}