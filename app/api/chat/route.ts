import { NextRequest } from 'next/server';
import { CHATBOT_SYSTEM_PROMPT, MAX_HISTORY_MESSAGES } from '@/lib/chatbot-knowledge';

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
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// gemini-2.0-flash ปิดบริการไปแล้ว 1 มิ.ย. 2026
// gemini-2.5-flash-lite แม้ยังไม่ถึงวันปิดบริการทางการ (16 ต.ค. 2026) แต่
// Google เริ่มบล็อกไม่ให้ API key ที่สร้างใหม่เข้าถึงแล้ว (คืน 404 "no
// longer available to new users") — ข้ามไปใช้รุ่น 3.x ที่เป็นรุ่นปัจจุบัน
// จริงๆ แทน ตัดปัญหานี้ทิ้งไปเลย
const MODEL = 'gemini-3.1-flash-lite';

export async function POST(req: NextRequest) {
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
    // ⚠️ ชั่วคราวเพื่อ debug — โชว์ error จริงจาก Gemini ให้เห็นในแชทเลย
    // ต้องเอาบรรทัด detail นี้ออกก่อนใช้งานจริง (ไม่ควรโชว์ error ดิบจาก
    // backend ให้ผู้ใช้ปลายทางเห็นตรงๆ)
    return Response.json(
      { error: 'เชื่อมต่อผู้ช่วย AI ไม่สำเร็จ กรุณาลองใหม่', detail: `${geminiRes.status}: ${errText}` },
      { status: 502 },
    );
  }

  return new Response(geminiRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}