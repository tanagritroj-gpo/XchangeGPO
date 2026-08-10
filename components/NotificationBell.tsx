'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, Clock, AlertTriangle } from 'lucide-react';
import {
  getUnreadNotificationCount,
  getRecentNotifications,
  markNotificationsAsRead,
  getUnreadNotificationCountForManager,
  getRecentNotificationsForManager,
  markNotificationsAsReadForManager,
  getUnreadNotificationCountForLog,
  getRecentNotificationsForLog,
  markNotificationsAsReadForLog,
  getUnreadNotificationCountForWh,
  getRecentNotificationsForWh,
  markNotificationsAsReadForWh,
  getUnreadNotificationCountForSale,
  getRecentNotificationsForSale,
  markNotificationsAsReadForSale,
} from '@/app/actions/notification-actions';
import {
  getUnreadSlaCountForCsr,
  getSlaQueueForCsr,
  markSlaNotificationsAsReadForCsr,
  getUnreadSlaCountForLog,
  getSlaQueueForLog,
  markSlaNotificationsAsReadForLog,
  getUnreadSlaCountForWh,
  getSlaQueueForWh,
  markSlaNotificationsAsReadForWh,
} from '@/app/actions/sla-actions';
import { getStatusLabel } from '@/lib/tracking-status';
import type { NotificationLogRow, SlaQueueRow } from '@/lib/types';

// สลับชุด action ตาม scope — csr/manager/log/wh เห็นทุกแจ้งเตือนเหมือนกันหมด (ไม่กรอง),
// sale เห็นเฉพาะหน่วยงานในเขตที่ดูแล (กรองที่ฝั่ง server อยู่แล้ว ดู notification-actions.ts)
// ทุก scope มีสถานะ "อ่านแล้ว" เป็นอิสระจากกันเสมอ — เปิดอ่าน scope หนึ่งไม่กระทบ badge
// ของ scope อื่นเลย
const ACTIONS_BY_SCOPE = {
  csr: {
    getCount: getUnreadNotificationCount,
    getList: getRecentNotifications,
    markRead: markNotificationsAsRead,
  },
  manager: {
    getCount: getUnreadNotificationCountForManager,
    getList: getRecentNotificationsForManager,
    markRead: markNotificationsAsReadForManager,
  },
  log: {
    getCount: getUnreadNotificationCountForLog,
    getList: getRecentNotificationsForLog,
    markRead: markNotificationsAsReadForLog,
  },
  wh: {
    getCount: getUnreadNotificationCountForWh,
    getList: getRecentNotificationsForWh,
    markRead: markNotificationsAsReadForWh,
  },
  sale: {
    getCount: getUnreadNotificationCountForSale,
    getList: getRecentNotificationsForSale,
    markRead: markNotificationsAsReadForSale,
  },
} as const;

// แท็บ "SLA Monitoring" — มีเฉพาะ scope csr/log/wh (แผนกที่ถือใบงานจริง) manager/sale ไม่มี
// แท็บนี้เพราะ manager มีหน้าเต็มแยกต่างหาก (/admin/manager/sla) และ sale ไม่เกี่ยวกับ SLA
// ใบงานคืน/แลกเปลี่ยน — ดู 06-sla-monitoring-design.md หัวข้อ 6
const SLA_ACTIONS_BY_SCOPE = {
  csr: {
    getCount: getUnreadSlaCountForCsr,
    getQueue: getSlaQueueForCsr,
    markRead: markSlaNotificationsAsReadForCsr,
  },
  log: {
    getCount: getUnreadSlaCountForLog,
    getQueue: getSlaQueueForLog,
    markRead: markSlaNotificationsAsReadForLog,
  },
  wh: {
    getCount: getUnreadSlaCountForWh,
    getQueue: getSlaQueueForWh,
    markRead: markSlaNotificationsAsReadForWh,
  },
} as const;

type SlaScope = keyof typeof SLA_ACTIONS_BY_SCOPE;

function hasSlaTab(scope: keyof typeof ACTIONS_BY_SCOPE): scope is SlaScope {
  return scope in SLA_ACTIONS_BY_SCOPE;
}

// poll badge ทุก 45 วิ — ค่าเดียวกับที่ StaffChatWidget เคยใช้ตอน ping ยังอยู่ในแชท
const POLL_INTERVAL_MS = 45_000;

// สีจุดกำกับแต่ละประเภท — ให้กวาดตาแยกความเร่งด่วนได้ไวโดยไม่ต้องอ่านข้อความก่อน
// (ping = แดง เร่งด่วนสุด, new_request = น้ำเงิน, new_client = เหลืองทอง) ใช้เฉพาะรายการ
// ที่ยังไม่อ่านเท่านั้น — รายการที่อ่านแล้วลดโทนเป็นจุดเทากลางๆ ตามรูปแบบ read/unread ด้านล่าง
const TYPE_DOT_COLOR: Record<NotificationLogRow['type'], string> = {
  ping: 'bg-red-500',
  new_request: 'bg-blue-500',
  new_client: 'bg-amber-500',
  // โทนเดียวกับ getCardTone ใน components/history/ExchangeHistoryView.tsx — อำพัน=เตือน, แดง=เกินกำหนด
  sla_warning: 'bg-amber-500',
  sla_breach: 'bg-red-500',
};

// วันที่ + เวลาแบบเต็ม (ไม่ใช่ relative time) — รายการล่าสุด 10 อันอาจย้อนไปหลายวัน relative
// time เพียวๆ จะเริ่มกำกวม ("3 วันที่แล้ว" ตอนไหน?) จึงโชว์วันที่/เวลาจริงเสมอ อ่านชัดเจนกว่า
function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  const datePart = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  const timePart = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} · ${timePart} น.`;
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
    case 'sla_warning':
      return <>ใบงาน <span className="font-mono">{n.ref_id}</span> ใกล้ครบกำหนด SLA</>;
    case 'sla_breach':
      return <>ใบงาน <span className="font-mono">{n.ref_id}</span> เกินกำหนด SLA แล้ว</>;
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
 * ── รายการที่แสดง: 10 อันล่าสุดเสมอ ไม่ใช่แค่ที่ยังไม่อ่าน ──
 * เดิม list จะหายไปทันทีที่เปิด drawer (เพราะกรองเฉพาะ unread) เปลี่ยนเป็น feed กิจกรรม
 * ล่าสุดแบบแอปแจ้งเตือนทั่วไป — แต่ละแถวมี n.isUnread (คำนวณฝั่ง server ตอน fetch แนบมา
 * กับ NotificationLogRow) ใช้ไฮไลต์รายการที่ยังไม่อ่าน ณ ตอนเปิด drawer ครั้งนี้ (พื้นหลัง
 * ติดสี + ตัวหนา + จุดสีตามประเภท + ป้าย "ใหม่") แยกจากรายการที่อ่านแล้ว (พื้นขาว + ตัว
 * ปกติ + จุดเทา) — ค่านี้เป็น snapshot ตอน fetch เท่านั้น ไม่ re-render ให้จางลงหลัง
 * markRead() เสร็จ กันไม่ให้กะพริบระหว่างที่ผู้ใช้กำลังอ่านอยู่ในรอบเดียวกัน
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
  const slaActions = hasSlaTab(scope) ? SLA_ACTIONS_BY_SCOPE[scope] : null;
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'feed' | 'sla'>('feed');
  const [unreadCount, setUnreadCount] = useState(0);
  const [slaUnreadCount, setSlaUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationLogRow[]>([]);
  const [slaQueue, setSlaQueue] = useState<SlaQueueRow[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [isLoadingSlaQueue, setIsLoadingSlaQueue] = useState(false);
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

  // ยอดค้างของแท็บ SLA แยก poll ต่างหาก — เฉพาะ scope csr/log/wh ที่มีแท็บนี้
  useEffect(() => {
    if (!slaActions) return;
    let cancelled = false;

    const poll = async () => {
      const res = await slaActions.getCount();
      if (!cancelled && res.success) setSlaUnreadCount(res.count ?? 0);
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [slaActions]);

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

    if (!slaActions) return;
    setIsLoadingSlaQueue(true);
    try {
      const res = await slaActions.getQueue();
      if (res.success) setSlaQueue(res.data ?? []);
      await slaActions.markRead();
      setSlaUnreadCount(0);
    } finally {
      setIsLoadingSlaQueue(false);
    }
  };

  // ── เนื้อหารายการแจ้งเตือนภายใน drawer ── read/unread ต่างกันชัดเจน 3 ชั้น: พื้นหลัง
  // ติดสี, น้ำหนักตัวอักษร, สีจุดกำกับประเภท — ป้าย "ใหม่" เสริมอีกชั้นให้ชัวร์ไม่พลาด
  const notificationList = (
    <div className="max-h-full overflow-y-auto">
      {isLoadingNotifications ? (
        <p className="py-8 text-center text-xs text-muted-foreground">กำลังโหลด...</p>
      ) : notifications.length === 0 ? (
        <div className="py-8 text-center">
          <Bell className="w-7 h-7 text-slate-300 mx-auto mb-2" strokeWidth={1.75} />
          <p className="text-xs text-muted-foreground font-medium">ยังไม่มีการแจ้งเตือน</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 px-4 py-3 ${n.isUnread ? 'bg-[#ECEAF6]/50' : ''}`}
            >
              <span
                className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.isUnread ? TYPE_DOT_COLOR[n.type] : 'bg-slate-300'}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={`text-xs leading-relaxed ${
                      n.isUnread ? 'font-bold text-[#241F5E]' : 'font-medium text-[#6B6698]'
                    }`}
                  >
                    {renderNotificationText(n)}
                  </p>
                  {n.isUnread && (
                    <span className="shrink-0 text-[9px] font-bold text-[#2E2B7A] bg-[#ECEAF6] px-1.5 py-0.5 rounded-full">
                      ใหม่
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-[#A7A2C4] mt-1">{formatDateTime(n.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── แท็บ "SLA Monitoring" — live queue ของแผนกตัวเอง ต่างจาก notificationList ตรงที่ไม่มี
  // concept read/unread ต่อแถว (badge บนกระดิ่งมาจาก notification_log แยกต่างหาก ดูหัวไฟล์)
  // การ์ดย่อยแยกรายการชัดเจน (พื้นหลังติดโทนสีตามความเร่งด่วน ไม่ใช่แค่จุดสีเล็กๆ เหมือนเดิม)
  // ขนาดตัวอักษรใหญ่ขึ้นทั้งชุดให้อ่านง่ายบนจอมือถือ (ของเดิมใช้ text-[9px]/[10px] เล็กเกินไป)
  const slaOverdueCount = slaQueue.filter((r) => r.isOverdue).length;
  const slaNearDueCount = slaQueue.length - slaOverdueCount;

  const slaQueueList = (
    <div className="max-h-full overflow-y-auto">
      {isLoadingSlaQueue ? (
        <p className="py-10 text-center text-sm text-muted-foreground">กำลังโหลด...</p>
      ) : slaQueue.length === 0 ? (
        <div className="py-14 text-center px-6">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
            <Clock className="w-7 h-7 text-emerald-500" strokeWidth={1.75} />
          </div>
          <p className="text-sm font-bold text-[#241F5E]">ไม่มีใบงานใกล้ครบ/เกินกำหนด</p>
          <p className="text-xs text-muted-foreground mt-1">ทุกใบงานของแผนกอยู่ในกรอบเวลาที่กำหนด</p>
        </div>
      ) : (
        <div className="p-3 space-y-2.5">
          {/* สรุปจำนวนด่วน — กวาดตาได้ไวว่ามีกี่ใบเกินกำหนดจริง กี่ใบแค่ใกล้ครบ */}
          <div className="flex items-center gap-2 px-0.5 pb-0.5">
            {slaOverdueCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-50 px-2.5 py-1.5 rounded-full">
                <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2.5} /> เกินกำหนด {slaOverdueCount}
              </span>
            )}
            {slaNearDueCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-full">
                <Clock className="w-3.5 h-3.5" strokeWidth={2.5} /> ใกล้ครบกำหนด {slaNearDueCount}
              </span>
            )}
          </div>

          {slaQueue.map((r) => (
            <div
              key={r.id}
              className={`rounded-2xl border p-3.5 flex items-start gap-3 ${
                r.isOverdue ? 'bg-red-50/70 border-red-100' : 'bg-amber-50/70 border-amber-100'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${r.isOverdue ? 'bg-red-100' : 'bg-amber-100'}`}>
                <AlertTriangle className={`w-5 h-5 ${r.isOverdue ? 'text-red-600' : 'text-amber-600'}`} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-black text-[#241F5E] font-mono">{r.ref_id}</p>
                  <span
                    className={`shrink-0 text-[11px] font-bold text-white px-2 py-1 rounded-full ${
                      r.isOverdue ? 'bg-red-600' : 'bg-amber-500'
                    }`}
                  >
                    {r.isOverdue ? 'เกินกำหนด' : 'ใกล้ครบกำหนด'}
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-700 mt-1">{getStatusLabel(r.current_status)}</p>
                {r.hospital_name && <p className="text-xs text-slate-500 truncate mt-0.5">{r.hospital_name}</p>}
                <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
                  ครบกำหนด {formatDateTime(r.status_due_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const totalUnread = unreadCount + slaUnreadCount;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={handleToggle}
        aria-label={open ? 'ปิดการแจ้งเตือน' : 'เปิดการแจ้งเตือน'}
        className="relative flex items-center justify-center w-9 h-9 rounded-xl text-[#6B6698] hover:text-[#E1592A] bg-white/70 hover:bg-[#FBEFE6] border border-white/60 hover:border-[#F0C6AA] transition-colors shrink-0"
      >
        <Bell className="w-4 h-4" strokeWidth={2.25} />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
            {totalUnread > 9 ? '9+' : totalUnread}
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
            className={`absolute top-0 right-0 bottom-0 w-[90vw] max-w-sm sm:max-w-md bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
              open ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 shrink-0">
              <div>
                <p className="text-sm font-bold text-[#241F5E]">
                  {slaActions && activeTab === 'sla' ? 'SLA Monitoring' : 'การแจ้งเตือน'}
                </p>
                <p className="text-[11px] text-[#A7A2C4]">
                  {slaActions && activeTab === 'sla' ? 'ใบงานใกล้ครบ/เกินกำหนดของแผนก ณ ขณะนี้' : '10 รายการล่าสุด'}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="ปิดการแจ้งเตือน"
                className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>

            {/* แท็บ "การแจ้งเตือน" / "SLA Monitoring" — เฉพาะ scope csr/log/wh (มี slaActions) */}
            {slaActions && (
              <div className="flex items-center gap-1.5 p-2.5 border-b border-slate-100 shrink-0">
                <button
                  onClick={() => setActiveTab('feed')}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-xl transition-colors ${
                    activeTab === 'feed' ? 'bg-[#ECEAF6] text-[#2E2B7A]' : 'text-muted-foreground hover:bg-slate-100'
                  }`}
                >
                  การแจ้งเตือน
                  {unreadCount > 0 && (
                    <span className="text-[10px] font-bold bg-[#2E2B7A] text-white rounded-full min-w-[18px] text-center px-1.5 py-0.5">{unreadCount}</span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('sla')}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-xl transition-colors ${
                    activeTab === 'sla' ? 'bg-red-50 text-red-700' : 'text-muted-foreground hover:bg-slate-100'
                  }`}
                >
                  SLA Monitoring
                  {slaUnreadCount > 0 && (
                    <span className="text-[10px] font-bold bg-red-600 text-white rounded-full min-w-[18px] text-center px-1.5 py-0.5">{slaUnreadCount}</span>
                  )}
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {slaActions && activeTab === 'sla' ? slaQueueList : notificationList}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default NotificationBell;
