'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Loader2, BarChart3 } from 'lucide-react';
import {
  getUnreadPingCount,
  getUnreadPings,
  markPingsAsRead,
} from '@/app/actions/staff-ping-actions';

type ChatMessage = { role: 'user' | 'assistant'; text: string };

const GREETING =
  'สวัสดีครับ 👋 ผมเป็นผู้ช่วยสรุปสถิติของระบบ GPO Xchange ถามได้เลยครับ เช่น "เดือนนี้มีใบงานกี่ใบ", "ลูกค้ารายไหนส่งเรื่องมากที่สุด", "เหตุผลปฏิเสธที่พบบ่อยคืออะไร"';

// poll badge ทุก 45 วิ (อยู่ในช่วง 30-60 วิที่ตกลงกันไว้ — ไม่ต้อง real-time
// เป๊ะ polling ก็พอสำหรับ use case นี้)
const POLL_INTERVAL_MS = 45_000;

function formatRelativeTime(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชม. ที่แล้ว`;
  const days = Math.floor(hours / 24);
  return `${days} วันที่แล้ว`;
}

function buildPingSummary(pings: { ref_id: string; created_at: string }[]) {
  const lines = pings.map((p) => `- ${p.ref_id} (${formatRelativeTime(p.created_at)})`);
  return `🔔 มี ${pings.length} คำร้องที่ลูกค้ากดขอให้ตรวจสอบ:\n${lines.join('\n')}`;
}

/**
 * StaffChatWidget — ปุ่มแชทลอยสำหรับ Manager และ CSR (สิทธิ์เท่ากัน)
 *
 * ตั้งใจแยกไฟล์จาก components/ChatWidget.tsx (ของลูกค้า) โดยสิ้นเชิง แม้
 * โค้ดจะคล้ายกันมาก เพราะ:
 * 1. ยิง endpoint คนละตัว (/api/staff-chat vs /api/chat) — การรวมเป็น
 *    component เดียวแล้ว branch endpoint ด้วย prop เสี่ยงต่อการเผลอส่ง
 *    ผิด endpoint ถ้ามีคนมาแก้ทีหลังโดยไม่ระวัง
 * 2. สิทธิ์การเข้าถึงคนละระดับกัน (ลูกค้า vs staff) แยกไฟล์ชัดเจนง่ายต่อ
 *    การ audit ว่า component ไหนคุยกับ endpoint ที่มีข้อมูลอ่อนไหวระดับไหน
 *
 * ใช้ component เดียวกันสำหรับทั้ง Manager (mount ที่ app/admin/manager/
 * layout.tsx) และ CSR (mount ที่ layout โซน CSR) เพราะสิทธิ์เข้าถึงข้อมูล
 * เท่ากันแล้วตามที่ตัดสินใจไว้ — การเช็คสิทธิ์จริงอยู่ที่ฝั่ง server
 * (/api/staff-chat, staff-ping-actions.ts) เท่านั้น component นี้ไม่ต้องรู้
 * ว่าคนเปิดเป็น role ไหน
 *
 * ── ฟีเจอร์กระดิ่งเร่งงาน (เพิ่มใหม่) ──
 * - Badge ตัวเลขมุมขวาบนของปุ่มลอย: poll getUnreadPingCount() ทุก 45 วิ
 * - ตอนเปิดแชท: ดึง getUnreadPings() มาสรุปเป็นข้อความ inject เข้า
 *   conversation ก่อน (ทำ local ไม่ผ่าน Gemini เลย — เร็วกว่าและไม่เสีย
 *   โควต้า AI สำหรับแค่การแสดงข้อมูลดิบที่มีอยู่แล้ว) แล้ว markPingsAsRead()
 *   ทันที เพราะไม่มี concept "อ่านแยกตามคน" (ดูเหตุผลใน staff-ping-actions.ts)
 *
 * ตำแหน่ง/offset ใช้ค่าเดียวกับ ChatWidget ของลูกค้า (ดูเหตุผลที่นั่น) —
 * แต่หน้า manager/CSR เป็น desktop-first เป็นหลัก ไม่มี BottomNav จึงตัด
 * offset สำหรับมือถือออก ใช้ bottom-6 ทุกขนาดจอ
 */
export function StaffChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', text: GREETING }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // poll badge จำนวน ping ที่ยังไม่อ่าน
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const res = await getUnreadPingCount();
      if (!cancelled && res.success) setUnreadCount(res.count ?? 0);
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const handleToggle = async () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (!willOpen) return;

    // เปิดแชท — ถ้ามี ping ค้างอยู่ ดึงมาสรุปเป็นข้อความแทรกเข้า conversation
    // ก่อน แล้ว mark อ่านทันที (เงียบๆ ถ้าพลาด ไม่ให้กระทบการเปิดแชทปกติ)
    try {
      const pingsRes = await getUnreadPings();
      if (pingsRes.success && pingsRes.data && pingsRes.data.length > 0) {
        const summary = buildPingSummary(pingsRes.data);
        setMessages((prev) => [...prev, { role: 'assistant', text: summary }]);
        await markPingsAsRead();
        setUnreadCount(0);
      }
    } catch {
      // เงียบไว้ — ไม่ให้ error ตรงนี้บล็อกการเปิดแชทปกติ
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setError(null);
    setInput('');
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', text }];
    setMessages([...nextMessages, { role: 'assistant', text: '' }]);
    setIsLoading(true);

    try {
      // ไม่ใช่ streaming แล้ว (ต่างจาก ChatWidget ของลูกค้า) — route นี้อาจต้อง
      // เรียก Gemini 2 รอบเวลาบอทขอเรียก tool ดึงข้อมูลสด (ดู reason ที่
      // app/api/staff-chat/route.ts) จึงรอผลลัพธ์สุดท้ายเป็น JSON ก้อนเดียว
      const res = await fetch('/api/staff-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      }

      const assistantText: string = data?.text ?? '';
      if (!assistantText.trim()) {
        throw new Error('ผู้ช่วยไม่ได้ตอบกลับ กรุณาลองใหม่');
      }

      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', text: assistantText };
        return copy;
      });
    } catch (err: any) {
      setError(err?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      setMessages((prev) => (prev[prev.length - 1]?.text === '' ? prev.slice(0, -1) : prev));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-[60] flex h-[70vh] max-h-[600px] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl">
          <div className="flex items-center gap-2.5 bg-gradient-to-br from-purple-600 to-purple-700 px-4 py-3.5 text-white">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15">
              <BarChart3 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-tight">ผู้ช่วยสถิติ</p>
              <p className="text-[11px] leading-tight text-purple-100">สรุปข้อมูลสถิติจากแดชบอร์ดสด</p>
            </div>
            <button
              onClick={handleToggle}
              aria-label="ปิดหน้าต่างแชท"
              className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'rounded-br-sm bg-purple-600 text-white'
                      : 'rounded-bl-sm border border-slate-100 bg-white text-slate-700'
                  }`}
                >
                  {m.text || (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" strokeWidth={2} aria-hidden="true" />
                  )}
                </div>
              </div>
            ))}
            {error && (
              <p className="whitespace-pre-wrap rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                {error}
              </p>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2 border-t border-slate-100 bg-white p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="ถามเรื่องสถิติ..."
              disabled={isLoading}
              maxLength={500}
              className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-purple-400 disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              aria-label="ส่งข้อความ"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              )}
            </button>
          </form>
        </div>
      )}

      <button
        onClick={handleToggle}
        aria-label={open ? 'ปิดหน้าต่างแชท' : 'เปิดหน้าต่างแชท'}
        className="fixed bottom-6 right-6 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-purple-600 text-white shadow-lg shadow-purple-900/20 transition-transform duration-150 hover:bg-purple-700 active:scale-95"
      >
        {open ? (
          <X className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
        ) : (
          <MessageCircle className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
        )}

        {/* Badge จำนวน ping ที่ยังไม่อ่าน — โชว์เฉพาะตอนปิดอยู่ (เปิดแชทแล้ว
            unreadCount จะถูกเคลียร์เป็น 0 จาก handleToggle อยู่แล้ว) */}
        {!open && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </>
  );
}

export default StaffChatWidget;