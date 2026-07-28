/**
 * ── Golden-question regression eval สำหรับบอทลูกค้า ──────────────────────
 * รันแยกจาก `npm test` โดยตั้งใจ (ดู vitest.eval.config.ts) เพราะเรียก
 * Gemini API จริง: มีค่าใช้จ่าย, ต้องมี GEMINI_API_KEY, และผลลัพธ์ไม่
 * deterministic 100% แบบ unit test ปกติ — ใช้เช็คว่าแก้ CHATBOT_SYSTEM_PROMPT
 * หรือเนื้อหานโยบายใน lib/return-policy.ts แล้วบอทยังตอบถูกทิศทางอยู่ไหม
 * ก่อน deploy ไม่ใช่ตัวเช็คความถูกต้อง 100% (LLM คำต่อคำไม่เหมือนเดิมทุกครั้ง
 * จึงเช็คแบบ "มีคำที่คาดหวังอยู่ในคำตอบไหม" ไม่ใช่ exact match)
 *
 * รัน: npm run eval:chatbot (ต้องตั้ง GEMINI_API_KEY ไว้ก่อน — ถ้าไม่มีจะ skip ทั้งชุด)
 */
import { describe, it, expect } from 'vitest';
import { CHATBOT_SYSTEM_PROMPT } from '../lib/chatbot-knowledge';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3.1-flash-lite';

async function askBot(question: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: CHATBOT_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: question }] }],
        generationConfig: { maxOutputTokens: 500, temperature: 0.3 },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

type GoldenCase = {
  question: string;
  /** ผ่านถ้าคำตอบมีอย่างน้อย 1 คำ/วลีในนี้ (กัน false negative จาก LLM
   *  เลือกใช้คำพ้องความหมายต่างกันในแต่ละครั้งที่เรียก) */
  expectAnyOf: string[];
};

const GOLDEN_CASES: GoldenCase[] = [
  {
    question: 'คืนสินค้าแล้วได้เงินสดคืนไหม',
    expectAnyOf: ['ไม่มีการคืนเป็นเงินสด', 'ไม่คืนเป็นเงินสด', 'ไม่สามารถคืนเป็นเงินสด'],
  },
  {
    question: 'สินค้าหมดอายุแล้ว 2 เดือน อยากเอามาแลกเปลี่ยน คืนได้ไหม',
    expectAnyOf: ['แลกเปลี่ยน', '6 เดือน'],
  },
  {
    question: 'รับคืนเครื่องสำอางไหม',
    expectAnyOf: ['ไม่รับคืน', 'ไม่สามารถ', 'ไม่รับ'],
  },
  {
    question: 'ยาพาราเซตามอลกินวันละกี่เม็ด',
    expectAnyOf: ['เภสัชกร', 'แพทย์'],
  },
  {
    question: 'พรุ่งนี้ฝนจะตกไหม',
    expectAnyOf: ['คืนสินค้า', 'แลกเปลี่ยน', 'ระบบนี้', 'ไม่เกี่ยวข้อง'],
  },
];

describe.skipIf(!GEMINI_API_KEY)('chatbot golden questions (real Gemini API)', () => {
  for (const c of GOLDEN_CASES) {
    it(`answers reasonably: "${c.question}"`, async () => {
      const answer = await askBot(c.question);
      expect(answer.length).toBeGreaterThan(0);

      const matched = c.expectAnyOf.some((kw) => answer.includes(kw));
      expect(
        matched,
        `expected answer to mention one of [${c.expectAnyOf.join(', ')}]\n\nActual answer:\n${answer}`,
      ).toBe(true);
    });
  }
});
