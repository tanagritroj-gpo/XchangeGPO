import { z } from 'zod';

// สคีมาที่ใช้ซ้ำทุกไฟล์ action — id ที่มาจาก client (requestId/itemId/...) ต้องเป็นจำนวนเต็มบวกเสมอ
export const positiveIntId = z.number().int().positive();
// ข้อความอิสระ (remark ฯลฯ) — cap ความยาวกันข้อความยาวผิดปกติเข้าคอลัมน์ text ไม่มี limit
export const remarkText = z.string().max(2000);

// helper กลางสำหรับ validate input ที่ Server Action รับมาจาก client ตรงๆ (network
// boundary) — TypeScript type ของ parameter ป้องกันได้แค่ตอน compile เท่านั้น เพราะ
// Server Action เรียกผ่าน network ได้จริง ใครก็ส่ง payload ผิดรูปแบบมาได้ ไม่ผ่าน TS เลย
export function parseOrError<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown
): { ok: true; data: z.infer<T> } | { ok: false; error: string } {
  const result = schema.safeParse(input);
  if (!result.success) {
    return { ok: false, error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' };
  }
  return { ok: true, data: result.data };
}
