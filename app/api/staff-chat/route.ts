import { NextRequest } from 'next/server';
import { getStaffSession } from '@/app/actions/auth-staff';
import { getCSRDashboardData } from '@/app/actions/csr-actions';
import { getManagerStatusLogs } from '@/app/actions/manager-actions';
import { summarizeManagerStatsForChatbot } from '@/lib/manager-stats';
import { executeStaffChatTool } from '@/app/actions/staff-chat-tools';
import { getErrorMessage } from '@/lib/error-message';

// ★ ใช้ index signature เผื่อฟิลด์อื่นที่ Gemini แนบมา (เช่น thoughtSignature ของรุ่น 3.x)
// ที่ต้อง echo กลับไปทั้งก้อนโดยไม่แตะ — ดูคอมเมนต์ใกล้ functionCallPart ด้านล่าง
interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
  [key: string]: unknown;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}

/**
 * POST /api/staff-chat
 *
 * แยก route ต่างหากจาก /api/chat (ของลูกค้า) โดยตั้งใจ — ห้ามใช้ route
 * เดียวกันเด็ดขาด เพราะ route นี้เข้าถึงข้อมูลธุรกิจจริง (รายได้/ลูกค้า)
 * ต้องเช็คสิทธิ์คนละแบบ คนละระดับความเสี่ยงกันโดยสิ้นเชิง
 *
 * เดิมเปิดให้เฉพาะ role 'manager' — ตอนนี้ขยายให้ CSR เข้าถึงได้เท่ากันแล้ว
 * (ตัดสินใจว่า CSR ควรเห็นสถิติธุรกิจเต็มเหมือน Manager) จึงรวมไว้ที่
 * route เดียวกัน ไม่แยกเป็นสอง endpoint ที่ logic เหมือนกันเป๊ะ
 *
 * ⚠️ เช็คสิทธิ์ CSR ต้องดูจาก session.department === 'csr' ไม่ใช่
 * session.role — เพราะ staff ทุกแผนกที่ไม่ใช่ manager จะมี role = 'staff'
 * เสมอ (ดู registerStaff ใน auth-staff.ts) แผนกจริงอยู่ที่ department
 * เท่านั้น ถ้าในอนาคตอยากให้ role ไหนเห็นข้อมูลน้อยกว่าอีก role ค่อยแยก
 * branch ในนี้ตาม isManager/isCsr เพิ่ม ไม่ต้องแยกทั้ง route
 *
 * ── ข้อมูลมาจาก 2 แหล่งแยกกัน (ยืนยันจากผู้ใช้จริง) ──
 * - requests    → getCSRDashboardData() ใน app/actions/csr-actions.ts
 *                 คืนค่า { success, requests }
 * - statusLogs  → getManagerStatusLogs() ใน app/actions/manager-actions.ts
 *                 คืนค่า { success, data }
 * ⚠️ getManagerStatusLogs() เช็คสิทธิ์แค่ role === 'manager' เท่านั้น
 * (ดูจากโค้ดที่เคยเห็น: `if (session.role !== 'manager') throw ...`) —
 * พอ CSR เรียก route นี้ (role='staff' เสมอ) จะโดนเงื่อนไขนั้นบล็อกแน่นอน
 * ต้องไปแก้ manager-actions.ts ให้เช็ค `session.role !== 'manager' &&
 * session.department !== 'csr'` แทน (เหมือน pattern ที่แก้ในไฟล์นี้)
 * ไม่ใช่แค่เพิ่ม `session.role !== 'csr'` เพราะ role ของ CSR ไม่เคยเป็น
 * 'csr' อยู่แล้ว — เป็นจุดที่มีโอกาสสูงมากที่จะเจอปัญหาเดิมซ้ำอีกรอบ
 *
 * ── ลำดับการเช็คความปลอดภัย (สำคัญมาก ห้ามสลับลำดับ) ──
 * 1. เช็ค session ก่อนอย่างอื่นทั้งหมด — ถ้าไม่มี session หรือไม่ใช่
 *    manager/csr ตัดจบทันที ไม่แตะฐานข้อมูลเลย
 * 2. ดึงข้อมูลเฉพาะหลังผ่านข้อ 1 แล้วเท่านั้น
 *
 * ── Function calling (เพิ่มใหม่) ──
 * เดิมมีแค่ summarizeManagerStatsForChatbot() สรุปคงที่ก้อนเดียวฉีดเข้า
 * prompt ทุกครั้ง ถามนอกเหนือจากที่สรุปไว้ (เดือน/ปีอื่นที่ไม่ใช่ปัจจุบัน,
 * ลูกค้ารายหนึ่งเจาะจง) จะตอบไม่ได้ — ตอนนี้ให้โมเดลเรียก "tool" (ดู TOOLS
 * ด้านล่าง) เพื่อ query ข้อมูลสดตามคำถามจริงได้ด้วย การ query จริงทำใน
 * app/actions/staff-chat-tools.ts (ไม่เปิด SQL ดิบให้โมเดลเห็นเลย โมเดล
 * เห็นแค่ชื่อฟังก์ชัน + พารามิเตอร์ที่กำหนดไว้ตายตัว) เนื่องจากต้องรอผล
 * function call ก่อนตอบได้ (อาจมี 2 รอบ call Gemini) จึงเปลี่ยนจาก
 * streaming เป็น non-streaming JSON response — ยอมรับได้เพราะเป็นเครื่องมือ
 * ภายในของ staff ไม่ใช่แชทลูกค้าที่ latency สำคัญมาก
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3.1-flash-lite';

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'get_rejection_breakdown',
        description:
          'ดึงสถิติเหตุผลการปฏิเสธคำร้อง แยกตามหมวดเหตุผล ใช้ตอบคำถามเช่น "ทำไมเดือนนี้ปฏิเสธเยอะ" หรือ "เหตุผลปฏิเสธของเดือน/ปีที่ระบุคืออะไร" ถ้าไม่ระบุปี/เดือนจะคืนค่าทุกช่วงเวลา',
        parameters: {
          type: 'OBJECT',
          properties: {
            year: { type: 'NUMBER', description: 'ปี ค.ศ. เช่น 2026 (ไม่ระบุ = ทุกปี)' },
            month: { type: 'NUMBER', description: 'เดือน 1-12 (ต้องระบุคู่กับ year เท่านั้น)' },
          },
        },
      },
      {
        name: 'get_period_stats',
        description:
          'ดึงสถิติภาพรวม (จำนวนใบงาน, มูลค่ารวม, อัตราปฏิเสธ) ของเดือน/ปีที่ระบุ ใช้ตอบคำถามเกี่ยวกับช่วงเวลาในอดีตที่ไม่ใช่เดือนปัจจุบัน (สรุปคงที่ด้านล่างมีแค่เดือนนี้/ปีนี้เทียบกับก่อนหน้าเท่านั้น)',
        parameters: {
          type: 'OBJECT',
          properties: {
            year: { type: 'NUMBER', description: 'ปี ค.ศ. เช่น 2025' },
            month: { type: 'NUMBER', description: 'เดือน 1-12' },
          },
          required: ['year', 'month'],
        },
      },
      {
        name: 'get_customer_stats',
        description:
          'ค้นหาสถิติของลูกค้า/โรงพยาบาลรายหนึ่งจากชื่อ (จำนวนคำร้องทั้งหมด, มูลค่ารวม, จำนวนที่ถูกปฏิเสธ/เสร็จสิ้น) ใช้เมื่อถามถึงลูกค้ารายใดรายหนึ่งเจาะจง',
        parameters: {
          type: 'OBJECT',
          properties: {
            hospital_name: { type: 'STRING', description: 'ชื่อโรงพยาบาล/หน่วยงาน หรือบางส่วนของชื่อ' },
          },
          required: ['hospital_name'],
        },
      },
    ],
  },
];

async function callGemini(payload: Record<string, unknown>): Promise<GeminiResponse> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('Gemini API error (staff-chat):', res.status, errText);
    throw new Error('เชื่อมต่อผู้ช่วย AI ไม่สำเร็จ กรุณาลองใหม่');
  }
  return res.json();
}

const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
];

export async function POST(req: NextRequest) {
  // ── 1. เช็คสิทธิ์ก่อนเสมอ ──
  const session = await getStaffSession();
  if (!session?.id) {
    return Response.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }
  const isManager = session.role === 'manager';
  const isCsr = session.department === 'csr';
  if (!isManager && !isCsr) {
    return Response.json({ error: 'ไม่มีสิทธิ์เข้าถึงส่วนนี้' }, { status: 403 });
  }

  if (!GEMINI_API_KEY) {
    return Response.json({ error: 'ระบบแชทยังไม่พร้อมใช้งาน (ไม่พบ GEMINI_API_KEY)' }, { status: 500 });
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

  // ── 2. ดึงข้อมูลจาก 2 แหล่งพร้อมกัน (หลังผ่านการเช็คสิทธิ์แล้วเท่านั้น) ──
  const [requestsRes, logsRes] = await Promise.all([
    getCSRDashboardData(),
    getManagerStatusLogs(),
  ]);

  if (!requestsRes?.success) {
    console.error('staff-chat: getCSRDashboardData failed:', requestsRes?.error);
  }
  if (!logsRes?.success) {
    console.error('staff-chat: getManagerStatusLogs failed:', logsRes?.error);
  }

  const requests = requestsRes?.success ? requestsRes.requests ?? [] : [];
  const statusLogs = logsRes?.success ? logsRes.data ?? [] : [];
  const statsSummary = summarizeManagerStatsForChatbot(requests, statusLogs);

  const systemPrompt = `คุณคือผู้ช่วยสรุปข้อมูลสถิติสำหรับทีมงาน (Manager/CSR) ของ "GPO Xchange Portal" ระบบรับคืน/แลกเปลี่ยนสินค้าขององค์การเภสัชกรรม สาขาภาคใต้

# ขอบเขตหน้าที่
- ตอบคำถามเกี่ยวกับสถิติ/แนวโน้มธุรกิจของระบบนี้เท่านั้น
- "ข้อมูลสถิติปัจจุบัน" ด้านล่างครอบคลุมแค่ภาพรวม/เดือนนี้/ปีนี้เท่านั้น ถ้าคำถามต้องการข้อมูลช่วงเวลาอื่น (เดือน/ปีในอดีต) หรือลูกค้ารายใดรายหนึ่งเจาะจง ให้เรียกใช้ฟังก์ชันที่มีให้แทนการเดา
- ห้ามเดาตัวเลขที่ไม่มีทั้งในสรุปด้านล่างและในผลลัพธ์ฟังก์ชันเด็ดขาด ถ้าเรียกฟังก์ชันแล้วยังไม่มีคำตอบ (เช่นข้อมูลระดับ transaction เดี่ยวๆ ที่ละเอียดเกินไป) ให้บอกตรงๆ ว่าไม่มีข้อมูลนี้ แนะนำให้ไปดูที่แดชบอร์ดโดยตรงแทน
- ข้อมูลนี้เป็นข้อมูลธุรกิจภายใน ห้ามเปิดเผยหรือสรุปให้ผู้ใช้ที่ไม่ใช่พนักงาน (คุณจะถูกเรียกใช้จาก Manager หรือ CSR ที่ผ่านการยืนยันตัวตนและสิทธิ์แล้วเท่านั้น จึงตอบได้เต็มที่)

# น้ำเสียง
ตอบกระชับ ตรงประเด็น ใช้ภาษาไทย เน้นตัวเลขและ insight ที่นำไปใช้ตัดสินใจได้จริง ถ้าตัวเลขมีนัยสำคัญ (เช่นเปลี่ยนแปลงเยอะจากเดือนก่อน) ให้ชี้ให้เห็นด้วย

# ─── ข้อมูลสถิติปัจจุบัน (คำนวณสดจากฐานข้อมูล ณ ขณะนี้ — ภาพรวม/เดือนนี้/ปีนี้เท่านั้น) ───
${statsSummary}
`;

  const baseContents = messages.slice(-10).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.text }],
  }));

  let data: GeminiResponse;
  try {
    data = await callGemini({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: baseContents,
      tools: TOOLS,
      generationConfig: { maxOutputTokens: 600, temperature: 0.2 },
      safetySettings: SAFETY_SETTINGS,
    });
  } catch (e: unknown) {
    return Response.json({ error: getErrorMessage(e) }, { status: 502 });
  }

  let parts: GeminiPart[] = data?.candidates?.[0]?.content?.parts ?? [];
  const functionCallPart = parts.find((p) => p.functionCall);

  // ถ้าโมเดลขอเรียก tool: รันฟังก์ชันจริง แล้วส่งผลลัพธ์กลับไปให้โมเดลตอบต่อ
  // อีกรอบ (รูปแบบ 2-turn function calling มาตรฐานของ Gemini API)
  if (functionCallPart) {
    const { name, args } = functionCallPart.functionCall!;
    const toolResult = await executeStaffChatTool(name, args ?? {});

    try {
      data = await callGemini({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [
          ...baseContents,
          // ★ ส่ง parts ทั้งก้อนที่โมเดลตอบกลับมาเป๊ะๆ (ไม่ใช่แค่ {name, args}
          // ที่ดึงมาสร้างใหม่เอง) — โมเดลรุ่น 3.x แนบ thought_signature มากับ
          // functionCall part ด้วย ถ้าสร้าง part ใหม่เองจะหลุด signature นี้
          // ไป แล้ว Gemini จะตอบ 400 "missing a thought_signature" ตอนส่ง
          // functionResponse กลับไปรอบถัดไป
          { role: 'model', parts },
          { role: 'function', parts: [{ functionResponse: { name, response: toolResult } }] },
        ],
        tools: TOOLS,
        generationConfig: { maxOutputTokens: 600, temperature: 0.2 },
        safetySettings: SAFETY_SETTINGS,
      });
    } catch (e: unknown) {
      return Response.json({ error: getErrorMessage(e) }, { status: 502 });
    }
    parts = data?.candidates?.[0]?.content?.parts ?? [];
  }

  const finalText = parts.find((p) => p.text)?.text ?? '';
  if (!finalText.trim()) {
    return Response.json({ error: 'ผู้ช่วยไม่ได้ตอบกลับ กรุณาลองใหม่' }, { status: 502 });
  }

  return Response.json({ text: finalText });
}
