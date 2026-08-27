'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { X, Send, Loader2, Bot } from 'lucide-react';
import { CHATBOT_GREETING } from '@/lib/chatbot-knowledge';
import { getErrorMessage } from '@/lib/error-message';

type ChatMessage = { role: 'user' | 'assistant'; text: string };

// เปิดหน้าต่างแชทอัตโนมัติแค่ครั้งแรกที่มาถึงหน้า welcome ต่อ session เดียว
// (ไม่เก็บถาวรใน localStorage เพราะไม่อยากให้ตามหลอนทุกครั้งที่ login ใหม่
// ในเครื่องเดียวกัน — sessionStorage หายเองตอนปิดแท็บ/เบราว์เซอร์)
const AUTO_OPEN_KEY = 'gpo_chat_auto_opened';
// เช็คแบบ prefix กัน route ย่อยอย่าง /welcome/dashboard ไม่ถูกนับด้วย ถ้า
// เช็คตรงตัว (=== '/welcome') จะพลาด route ย่อยพวกนี้ไปเลย
const AUTO_OPEN_PATH_PREFIX = '/welcome';
const AUTO_OPEN_DELAY_MS = 700;

/**
 * ChatWidget — ปุ่มลอย + หน้าต่างแชท FAQ
 *
 * ตำแหน่ง/offset อิงตาม StickyReturnCTA ที่เคยแก้ไว้ก่อนหน้า:
 * 5rem (80px) = ความสูงจริงของ BottomNav (h-16=64px) + เว้น 16px, บวก
 * env(safe-area-inset-bottom) ให้ตรงกับ padding ของ BottomNav/main ใน
 * app/(authenticated)/layout.tsx — กันปุ่มจมใต้ BottomNav บนจอมี home indicator
 * บนมือถือ, bottom-6 บนจอ >= md ที่ไม่มี BottomNav แล้ว, z-[60] กันโดน
 * layer อื่นบัง (สูงกว่า header/sidebar ที่ใช้ z-50 ทั่วไป)
 *
 * ไม่มี tool-calling ในเวอร์ชันนี้ (ตามที่เลือกไว้ — ตอบ FAQ ทั่วไปเท่านั้น
 * ไม่แตะข้อมูลลูกค้า) ถ้าจะเพิ่มทีหลัง ต้องคิดเรื่อง auth scoping ใหม่
 * ทั้งชุด ไม่ใช่แค่เพิ่ม tool เฉยๆ
 */
export function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', text: CHATBOT_GREETING },
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // เปิดอัตโนมัติแค่ครั้งแรกที่เจอหน้า /welcome ต่อ session — ไม่รบกวนถ้า
  // ผู้ใช้เคยปิดไปแล้วหรือกำลังอยู่หน้าอื่น ไม่ auto-open ซ้ำ
  useEffect(() => {
    if (!pathname?.startsWith(AUTO_OPEN_PATH_PREFIX)) return;
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(AUTO_OPEN_KEY)) return;

    const timer = setTimeout(() => {
      setOpen(true);
      sessionStorage.setItem(AUTO_OPEN_KEY, '1');
    }, AUTO_OPEN_DELAY_MS);

    return () => clearTimeout(timer);
  }, [pathname]);

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
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        const debugSuffix = data?.detail ? `\n\n[debug] ${data.detail}` : '';
        throw new Error((data?.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่') + debugSuffix);
      }

      // อ่าน SSE stream ของ Gemini เอง — แต่ละ chunk เป็นบรรทัด "data: {...}"
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
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      // ลบ assistant message ที่ว่างเปล่าออก ถ้า stream ล้มเหลวตั้งแต่ต้น
      setMessages((prev) => (prev[prev.length - 1]?.text === '' ? prev.slice(0, -1) : prev));
    } finally {
      setStreaming(false);
    }
  };

  return (
    <>
      {/* หน้าต่างแชท */}
      {open && (
        <div className="fixed bottom-36 right-4 z-[60] flex h-[70dvh] max-h-[560px] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl md:bottom-24 md:right-6">
          {/* Header — โทนน้ำเงินเดียวกับ mascot "GPO Spark" (#0B73E8 → #0D3D91 ตรงกับ
              gradient "blue" ในไฟล์ SVG ของมาสคอต) แยกจากโทน teal/emerald ของแอปหลัก
              ตั้งใจให้ผู้ช่วยแชทมีเอกลักษณ์สีเป็นของตัวเอง ผูกกับตัวมาสคอต ไม่ปนกับที่อื่น */}
          <div className="flex items-center gap-2.5 bg-gradient-to-br from-[#0B73E8] to-[#0D3D91] px-4 py-3.5 text-white">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15">
              <Bot className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-tight">ผู้ช่วย GPO Xchange</p>
              <p className="text-[11px] leading-tight text-blue-100">ตอบคำถามนโยบายคืนสินค้า</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="ปิดหน้าต่างแชท"
              className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          {/* ข้อความ */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'rounded-br-sm bg-[#0B73E8] text-white'
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

          {/* ช่องพิมพ์ */}
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
              placeholder="พิมพ์คำถาม..."
              disabled={streaming}
              maxLength={500}
              className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-blue-400 disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              aria-label="ส่งข้อความ"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0B73E8] text-white transition-colors hover:bg-[#0D3D91] disabled:cursor-not-allowed disabled:opacity-40"
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

      {/* ปุ่มลอย — mascot "GPO Spark" ตอนปิดอยู่ (idle bob ตลอดเวลา, โบกมือตอน hover
          ผ่าน CSS ล้วนๆ ดู app/globals.css) สลับกลับเป็นปุ่ม X ปกติตอนเปิดแชทแล้ว
          (ไม่เอาไอคอนปิดไปวาดทับหน้ามาสคอต แยกเป็นปุ่มฟังก์ชันธรรมดาชัดเจนกว่า) —
          ใหญ่ขึ้นกว่าปุ่มเดิม (h-14/56px) ให้เห็นตัวมาสคอตชัด แต่ยังจำกัดขนาดบนมือถือ
          (h-16/64px) ไม่ให้ไปบังเนื้อหา ขยายเต็มที่เฉพาะจอ md ขึ้นไปที่มีที่ว่างเยอะกว่า */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'ปิดหน้าต่างแชท' : 'เปิดหน้าต่างแชท'}
        className={`fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-[60] flex items-center justify-center rounded-full shadow-lg transition-transform duration-150 active:scale-95 md:bottom-6 md:right-6 ${
          open
            ? 'h-14 w-14 bg-[#0B73E8] text-white shadow-blue-900/20 hover:bg-[#0D3D91]'
            : 'gpo-spark h-16 w-16 overflow-hidden border-4 border-white shadow-blue-900/20 md:h-20 md:w-20'
        }`}
      >
        {open ? (
          <X className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
        ) : (
          <img src="/mascot/gpo_spark_avatar_1x1.svg" alt="" className="h-full w-full object-cover" />
        )}
      </button>
    </>
  );
}

export default ChatWidget;