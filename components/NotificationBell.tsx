'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X } from 'lucide-react';
import {
  getUnreadNotificationCount,
  getUnreadNotifications,
  markNotificationsAsRead,
  getUnreadNotificationCountForSale,
  getUnreadNotificationsForSale,
  markNotificationsAsReadForSale,
} from '@/app/actions/notification-actions';
import type { NotificationLogRow } from '@/lib/types';

// สลับชุด action ตาม scope — CSR เห็นทุกแจ้งเตือน, Sale เห็นเฉพาะหน่วยงานในเขตที่ดูแล
// (กรองที่ฝั่ง server อยู่แล้ว ดู notification-actions.ts) และมีสถานะ "อ่านแล้ว" แยกจากกัน
const ACTIONS_BY_SCOPE = {
  csr: {
    getCount: getUnreadNotificationCount,
    getList: getUnreadNotifications,
    markRead: markNotificationsAsRead,
  },
  sale: {
    getCount: getUnreadNotificationCountForSale,
    getList: getUnreadNotificationsForSale,
    markRead: markNotificationsAsReadForSale,
  },
} as const;

// poll badge ทุก 45 วิ — ค่าเดียวกับที่ StaffChatWidget เคยใช้ตอน ping ยังอยู่ในแชท
const POLL_INTERVAL_MS = 45_000;

// สีจุดกำกับแต่ละประเภท — ให้กวาดตาแยกความเร่งด่วนได้ไวโดยไม่ต้องอ่านข้อความก่อน
// (ping = แดง เร่งด่วนสุด, new_request = น้ำเงิน, new_client = เหลืองทอง)
const TYPE_DOT_COLOR: Record<NotificationLogRow['type'], string> = {
  ping: 'bg-red-500',
  new_request: 'bg-blue-500',
  new_client: 'bg-amber-500',
};

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

// ข้อความแต่ละประเภท — เพิ่มประเภทใหม่ในอนาคตแค่เพิ่ม case ตรงนี้กับ TYPE_DOT_COLOR ด้านบน
function renderNotificationText(n: NotificationLogRow) {
  switch (n.type) {
    case 'ping':
      return <>ลูกค้ากดขอให้ตรวจสอบคำร้อง <span className="font-mono">{n.ref_id}</span></>;
    case 'new_request':
      return <>มีคำร้องใหม่เข้าระบบ <span className="font-mono">{n.ref_id}</span></>;
    case 'new_client':
      return <>{n.contact_name} จาก {n.hospital_name} ลงทะเบียนขอเข้าใช้งานระบบ</>;
  }
}

/**
 * NotificationBell — กระดิ่งแจ้งเตือน ใช้ร่วมกันทั้งหน้า CSR hub และ Sale hub (วางไว้ก่อน
 * ปุ่ม "ออกจากระบบ") ต่างกันแค่ prop `scope` — 'csr' (default) เห็นทุกแจ้งเตือนไม่กรอง,
 * 'sale' เห็นเฉพาะหน่วยงานในเขตที่ตัวเองดูแล (org_type/province ตรงกับ sale_customer_types/
 * sale_provinces ของตัวเอง — ดู getSaleCoverage() ใน sale-actions.ts) และมีสถานะ "อ่านแล้ว"
 * แยกเป็นอิสระจากฝั่ง CSR โดยสิ้นเชิง — CSR เปิดอ่านแล้วไม่กระทบ badge ฝั่ง Sale และกลับกัน
 *
 * อ่าน/mark อ่านจาก notification_log ตารางรวม (ดู app/actions/notification-actions.ts)
 * ครอบคลุม 3 ประเภทตอนนี้: ping เร่งงาน (ย้ายมาจาก request_pings เดิม), new_request
 * (ลูกค้า/CSR ส่งคำร้องเข้าระบบ), new_client (ลูกค้าลงทะเบียนขอเข้าใช้งานใหม่) — เพิ่ม
 * ประเภทถัดไปแค่เพิ่ม insert จุดที่เกี่ยวข้อง + case ใน renderNotificationText ด้านบน
 * ไม่ต้องแก้ schema หรือ action ใหม่ทั้งชุด
 *
 * สิทธิ์เช็คผ่าน getManagerOrCsrSession()/getSaleCoverage() ที่ฝั่ง server action ตาม
 * scope เหมือนเดิมทุกจุด ไม่มี concept "อ่านแยกตามคน" (แค่แยกระดับ role/scope) เปิด drawer
 * นี้ = mark ทุกรายการที่ค้างในขอบเขตของตัวเองเป็นอ่านแล้วทันที
 *
 * ── Presentation: drawer เดียวกันทุกขนาดจอ ──
 * เดิมเคยแยก 2 แบบ (dropdown เล็กใต้ปุ่มบนจอกว้าง / drawer เต็มจอทางขวาบนจอแคบ) แต่ dropdown
 * แบบ absolute-ยึดปุ่มมีปัญหาเรื้อรัง — ทั้ง "โผล่ทางซ้าย" (เพราะปุ่มไม่ใช่ปุ่มขวาสุดของแถว)
 * และเสี่ยงโดน backdrop-filter ของ header bar แย่ง containing block เหมือนที่เจอฝั่งมือถือ
 * จึงรวมเป็น drawer เดียวกันทุกขนาดจอ — เลื่อนเข้าจากขอบขวา พร้อม backdrop คลุมด้านหลัง ไม่ต้อง
 * คำนวณตำแหน่งอ้างอิงกับปุ่มเลย เพราะยึดกับขอบจอทั้งแถบ ใช้ createPortal ไปที่ document.body
 * เสมอ (ดูเหตุผลด้านล่าง) กว้าง max-w-sm พอเหมาะสำหรับทั้งมือถือและจอกว้าง
 *
 * ★ ต้อง createPortal ไปที่ document.body — เพราะ header bar ที่ครอบปุ่มกระดิ่งอยู่
 * (app/admin/csr/page.tsx) มี backdrop-blur-md ซึ่งตาม spec ทำให้ ancestor นั้นกลายเป็น
 * containing block ของลูกที่ position:fixed แทน viewport จริง (เจอใน Safari/iOS เป็นหลัก)
 * ถ้าไม่ portal ออกมา drawer ที่ตั้งใจให้ fixed inset-0 เต็มจอ จะไปบีบอยู่แค่ในกรอบเล็กๆ ของ
 * header bar เท่านั้น ดูเหมือนเนื้อหาแจ้งเตือนหายไป/ถูกบังอยู่ข้างหลัง
 */
interface NotificationBellProps {
  scope?: keyof typeof ACTIONS_BY_SCOPE;
}

export function NotificationBell({ scope = 'csr' }: NotificationBellProps) {
  const actions = ACTIONS_BY_SCOPE[scope];
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationLogRow[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const res = await actions.getCount();
      if (!cancelled && res.success) setUnreadCount(res.count ?? 0);
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [actions]);

  // ปิด panel เมื่อคลิกนอกกรอบ หรือกด Escape — เช็คทั้ง containerRef (ปุ่มกระดิ่ง) และ
  // drawerRef (เนื้อหา drawer ที่ portal ออกไปที่ document.body แล้ว ไม่ได้อยู่ใต้
  // containerRef ใน DOM อีกต่อไป) ไม่งั้นคลิกในเนื้อหา drawer เองจะโดนตีความว่าคลิกนอกกรอบ
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideButton = containerRef.current?.contains(target);
      const insideDrawer = drawerRef.current?.contains(target);
      if (!insideButton && !insideDrawer) setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleToggle = async () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (!willOpen) return;

    setIsLoadingNotifications(true);
    try {
      const res = await actions.getList();
      if (res.success) {
        setNotifications(res.data ?? []);
        if ((res.data ?? []).length > 0) {
          await actions.markRead();
          setUnreadCount(0);
        }
      }
    } finally {
      setIsLoadingNotifications(false);
    }
  };

  // ── เนื้อหารายการแจ้งเตือนภายใน drawer ──
  const notificationList = (
    <div className="max-h-full overflow-y-auto">
      {isLoadingNotifications ? (
        <p className="py-8 text-center text-xs text-muted-foreground">กำลังโหลด...</p>
      ) : notifications.length === 0 ? (
        <div className="py-8 text-center">
          <Bell className="w-7 h-7 text-slate-300 mx-auto mb-2" strokeWidth={1.75} />
          <p className="text-xs text-muted-foreground font-medium">ไม่มีการแจ้งเตือนใหม่</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {notifications.map((n) => (
            <div key={n.id} className="flex items-start gap-3 px-4 py-3">
              <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${TYPE_DOT_COLOR[n.type]}`} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">{renderNotificationText(n)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{formatRelativeTime(n.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={handleToggle}
        aria-label={open ? 'ปิดการแจ้งเตือน' : 'เปิดการแจ้งเตือน'}
        className="relative flex items-center justify-center w-9 h-9 rounded-xl text-[#6B6698] hover:text-[#E1592A] bg-white/70 hover:bg-[#FBEFE6] border border-white/60 hover:border-[#F0C6AA] transition-colors shrink-0"
      >
        <Bell className="w-4 h-4" strokeWidth={2.25} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* ══ Drawer เลื่อนเข้าจากขอบขวา + backdrop — ทุกขนาดจอ — render ค้างไว้เสมอ (ไม่ใช้
           {open && ...}) เพื่อให้ transition เล่นได้ทั้งตอนเปิดและปิด ควบคุมด้วย opacity/
           translate-x + pointer-events แทน — portal ไปที่ document.body หนี backdrop-blur-md
           ของ header bar ที่จะแย่งเป็น containing block ของ fixed (ดู comment บนสุดของไฟล์) ══ */}
      {mounted && createPortal(
        <div
          ref={drawerRef}
          className={`fixed inset-0 z-50 transition-opacity duration-300 ${
            open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div
            className={`absolute top-0 right-0 bottom-0 w-[85vw] max-w-sm bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
              open ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 shrink-0">
              <p className="text-sm font-bold text-[#241F5E]">การแจ้งเตือน</p>
              <button
                onClick={() => setOpen(false)}
                aria-label="ปิดการแจ้งเตือน"
                className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{notificationList}</div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default NotificationBell;
