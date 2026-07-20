'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Loader2, BarChart3 } from 'lucide-react';

type ChatMessage = { role: 'user' | 'assistant'; text: string };

const GREETING =
  'สวัสดีครับ 👋 ผมเป็นผู้ช่วยสรุปสถิติของระบบ GPO Xchange ถามได้เลยครับ เช่น "เดือนนี้มีใบงานกี่ใบ", "ลูกค้ารายไหนส่งเรื่องมากที่สุด", "เหตุผลปฏิเสธที่พบบ่อยคืออะไร"';

/**
 * StaffChatWidget — ปุ่มแชทลอยสำหรับ Manager เท่านั้น
 *
 * ตั้งใจแยกไฟล์จาก components/ChatWidget.tsx (ของลูกค้า) โดยสิ้นเชิง แม้
 * โค้ดจะคล้ายกันมาก เพราะ:
 * 1. ยิง endpoint คนละตัว (/api/staff-chat vs /api/chat) — การรวมเป็น
 *    component เดียวแล้ว branch endpoint ด้วย prop เสี่ยงต่อการเผลอส่ง
 *    ผิด endpoint ถ้ามีคนมาแก้ทีหลังโดยไม่ระวัง
 * 2. สิทธิ์การเข้าถึงคนละระดับกัน (ลูกค้า vs manager) แยกไฟล์ชัดเจนง่ายต่อ
 *    การ audit ว่า component ไหนคุยกับ endpoint ที่มีข้อมูลอ่อนไหวระดับไหน
 *
 * ตำแหน่ง/offset ใช้ค่าเดียวกับ ChatWidget ของลูกค้า (ดูเหตุผลที่นั่น) —
 * แต่หน้า manager เป็น desktop-first เป็นหลัก ไม่มี BottomNav จึงตัด
 * offset สำหรับมือถือออก ใช้ bottom-6 ทุกขนาดจอ
 */
export function StaffChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', text: GREETING }]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setError(null);
    setInput('');
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', text }];
    setMessages([...nextMessages, { role: 'assistant', text: '' }]);
    setStreaming(true);

    try {
      const res = await fetch('/api/staff-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';

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
            if (piece) {
              assistantText += piece;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: 'assistant', text: assistantText };
                return copy;
              });
            }
          } catch {
            // chunk ยังไม่ครบ JSON — ข้ามไปรอบถัดไป
          }
        }
      }

      if (!assistantText.trim()) {
        throw new Error('ผู้ช่วยไม่ได้ตอบกลับ กรุณาลองใหม่');
      }
    } catch (err: any) {
      setError(err?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      setMessages((prev) => (prev[prev.length - 1]?.text === '' ? prev.slice(0, -1) : prev));
    } finally {
      setStreaming(false);
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
              <p className="text-sm font-bold leading-tight">ผู้ช่วยสถิติ (Manager)</p>
              <p className="text-[11px] leading-tight text-purple-100">สรุปข้อมูลสถิติจากแดชบอร์ดสด</p>
            </div>
            <button
              onClick={() => setOpen(false)}
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
              disabled={streaming}
              maxLength={500}
              className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-purple-400 disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              aria-label="ส่งข้อความ"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {streaming ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              )}
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'ปิดหน้าต่างแชท' : 'เปิดหน้าต่างแชท'}
        className="fixed bottom-6 right-6 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-purple-600 text-white shadow-lg shadow-purple-900/20 transition-transform duration-150 hover:bg-purple-700 active:scale-95"
      >
        {open ? (
          <X className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
        ) : (
          <MessageCircle className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
        )}
      </button>
    </>
  );
}

export default StaffChatWidget;