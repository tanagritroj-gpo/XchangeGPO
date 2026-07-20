import { NextRequest } from 'next/server';
import { getStaffSession } from '@/app/actions/auth-staff';
import { getCSRDashboardData } from '@/app/actions/csr-actions';
import { getManagerStatusLogs } from '@/app/actions/manager-actions';
import { summarizeManagerStatsForChatbot } from '@/lib/manager-stats';

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
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3.1-flash-lite';

export async function POST(req: NextRequest) {
  // ── 1. เช็คสิทธิ์ก่อนเสมอ ──
  const session = await getStaffSession();
  if (!session?.id) {
    return Response.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  }
  // manager: role เป็น 'manager' โดยตรง (department ก็เป็น 'manager' เหมือนกัน)
  // csr: role เป็นแค่ 'staff' เสมอ (ดู registerStaff ใน auth-staff.ts —
  // role = department === 'manager' ? 'manager' : 'staff') ตัวที่บอกว่าเป็น
  // แผนก CSR จริงๆ คือ department เท่านั้น เช็คจาก role อย่างเดียวจะพลาด
  // staff ทุกแผนกที่ไม่ใช่ manager รวมถึง CSR ด้วย
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
    console.error('staff-chat: getCSRDashboardData failed:', (requestsRes as any)?.error);
  }
  if (!logsRes?.success) {
    console.error('staff-chat: getManagerStatusLogs failed:', (logsRes as any)?.error);
  }

  const requests = requestsRes?.success ? (requestsRes as any).requests ?? [] : [];
  const statusLogs = logsRes?.success ? (logsRes as any).data ?? [] : [];
  const statsSummary = summarizeManagerStatsForChatbot(requests, statusLogs);

  const systemPrompt = `คุณคือผู้ช่วยสรุปข้อมูลสถิติสำหรับทีมงาน (Manager/CSR) ของ "GPO Xchange Portal" ระบบรับคืน/แลกเปลี่ยนสินค้าขององค์การเภสัชกรรม สาขาภาคใต้

# ขอบเขตหน้าที่
- ตอบคำถามเกี่ยวกับสถิติ/แนวโน้มธุรกิจของระบบนี้เท่านั้น โดยอ้างอิงจาก "ข้อมูลสถิติปัจจุบัน" ด้านล่างเท่านั้น
- ห้ามเดาตัวเลขที่ไม่มีในข้อมูลด้านล่างเด็ดขาด ถ้าคำถามต้องการตัวเลขที่ไม่มีอยู่ในสรุปนี้ (เช่น ข้อมูลย้อนหลังเกิน 12 เดือน หรือรายละเอียดระดับ transaction เดี่ยวๆ) ให้บอกตรงๆ ว่าข้อมูลนี้ไม่มีในสรุป แนะนำให้ไปดูที่หน้า "ภาพรวม & สถิติ" ในแดชบอร์ดโดยตรงแทน
- ข้อมูลนี้เป็นข้อมูลธุรกิจภายใน ห้ามเปิดเผยหรือสรุปให้ผู้ใช้ที่ไม่ใช่พนักงาน (คุณจะถูกเรียกใช้จาก Manager หรือ CSR ที่ผ่านการยืนยันตัวตนและสิทธิ์แล้วเท่านั้น จึงตอบได้เต็มที่)

# น้ำเสียง
ตอบกระชับ ตรงประเด็น ใช้ภาษาไทย เน้นตัวเลขและ insight ที่นำไปใช้ตัดสินใจได้จริง ถ้าตัวเลขมีนัยสำคัญ (เช่นเปลี่ยนแปลงเยอะจากเดือนก่อน) ให้ชี้ให้เห็นด้วย

# ─── ข้อมูลสถิติปัจจุบัน (คำนวณสดจากฐานข้อมูล ณ ขณะนี้) ───
${statsSummary}
`;

  const trimmedHistory = messages.slice(-10);

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: trimmedHistory.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.text }],
        })),
        generationConfig: { maxOutputTokens: 600, temperature: 0.2 },
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
    console.error('Gemini API error (staff-chat):', geminiRes.status, errText);
    return Response.json({ error: 'เชื่อมต่อผู้ช่วย AI ไม่สำเร็จ กรุณาลองใหม่' }, { status: 502 });
  }

  return new Response(geminiRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}