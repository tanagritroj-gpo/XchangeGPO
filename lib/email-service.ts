import 'server-only';
import * as React from 'react';
import { render } from '@react-email/render';
import QRCode from 'qrcode';
import { sendGmailMail } from '@/lib/mailer';
import WelcomeEmail from '@/lib/emails/WelcomeEmail';
import RegistrationApprovedEmail from '@/lib/emails/RegistrationApprovedEmail';
import CustomerPasswordResetEmail from '@/lib/emails/CustomerPasswordResetEmail';
import StaffPasswordResetEmail from '@/lib/emails/StaffPasswordResetEmail';
import SecurityAlertEmail from '@/lib/emails/SecurityAlertEmail';
import AccountLockedEmail from '@/lib/emails/AccountLockedEmail';
import PdfDocumentEmail, { type PdfDocumentEmailDrugItem } from '@/lib/emails/PdfDocumentEmail';

// ★ จุดรวมเดียวของ "ระบบส่งอีเมลอะไร ตอนไหน เนื้อหาอะไร" — ไฟล์ business logic (auth.ts,
// auth-actions.ts, auth-staff.ts, csr-actions.ts, send-pdf-email-action.ts,
// staff-form-actions.ts) แค่เรียกฟังก์ชันในนี้บรรทัดเดียว ไม่ต้อง render()/sendGmailMail()
// เองที่จุดเรียกอีกต่อไป — อยากรู้ว่าระบบส่งอีเมลกี่แบบ ตอนไหนบ้าง ดูไฟล์นี้ไฟล์เดียวพอ
// (เดิมกระจายอยู่ 6 ไฟล์ ต้องไล่ดูทีละไฟล์ถึงจะเห็นภาพรวม)
//
// ทุกฟังก์ชันคืนรูปแบบเดียวกับ sendGmailMail ตรงๆ ({ error: Error | null }) เพื่อให้
// จุดเรียกเดิม (if (emailErr) throw emailErr ฯลฯ) แก้น้อยที่สุด

type SendResult = { error: Error | null };

// ── 1. ลูกค้าลงทะเบียนสำเร็จ — แจ้งว่าระบบรับข้อมูลแล้ว รออนุมัติ 1-2 วันทำการ ──
export async function sendRegistrationReceivedEmail(params: {
  to: string;
  hospitalName: string;
}): Promise<SendResult> {
  const html = await render(React.createElement(WelcomeEmail, { hospitalName: params.hospitalName }));
  return sendGmailMail({
    to: params.to,
    subject: 'รับข้อมูลการลงทะเบียนแล้ว — GPO Xchange Portal',
    html,
  });
}

// ── 2. CSR อนุมัติการลงทะเบียน — แจ้งเปิดใช้งานรหัสลูกค้า + ลิงก์เข้าระบบ + เอกสารยืนยัน ──
export async function sendRegistrationApprovedEmail(params: {
  to: string;
  hospitalName: string;
  customerCode: string;
  documentUrl: string;
}): Promise<SendResult> {
  const html = await render(
    React.createElement(RegistrationApprovedEmail, {
      hospitalName: params.hospitalName,
      customerCode: params.customerCode,
      loginUrl: process.env.NEXT_PUBLIC_SITE_URL ?? '/',
      documentUrl: params.documentUrl,
    })
  );
  return sendGmailMail({
    to: params.to,
    subject: 'คำขอเข้าใช้ระบบได้รับการอนุมัติแล้ว — GPO Xchange Portal',
    html,
  });
}

// ── 3. OTP ตั้งรหัสผ่านใหม่ — ฝั่งลูกค้า ──
export async function sendCustomerOtpEmail(params: { to: string; otp: string }): Promise<SendResult> {
  const html = await render(React.createElement(CustomerPasswordResetEmail, { otp: params.otp }));
  return sendGmailMail({
    to: params.to,
    subject: 'รหัส OTP สำหรับตั้งรหัสผ่านใหม่ — GPO Xchange Portal',
    html,
  });
}

// ── 4. OTP ตั้งรหัสผ่านใหม่ — ฝั่ง staff ──
export async function sendStaffOtpEmail(params: { to: string; otp: string }): Promise<SendResult> {
  const html = await render(React.createElement(StaffPasswordResetEmail, { otp: params.otp }));
  return sendGmailMail({
    to: params.to,
    subject: 'รหัส OTP สำหรับตั้งรหัสผ่านใหม่ — GPO Xchange Staff Portal',
    html,
  });
}

// ── 5. แจ้งเตือนความปลอดภัย — มีการเปลี่ยน credential (รหัสผ่าน/อีเมล/username/ข้อมูลติดต่อ)
// ยิงหลังทำสำเร็จเสมอ (best-effort) ให้เจ้าของบัญชีรู้ตัวถ้าไม่ใช่คนทำ — audit §UX-6 ──
export async function sendSecurityAlertEmail(params: {
  to: string | string[];
  action: string;
  whenText: string;
  ip?: string | null;
  detail?: string | null;
}): Promise<SendResult> {
  const html = await render(
    React.createElement(SecurityAlertEmail, {
      action: params.action,
      whenText: params.whenText,
      ip: params.ip ?? null,
      detail: params.detail ?? null,
    })
  );
  return sendGmailMail({
    to: params.to,
    subject: `แจ้งเตือนความปลอดภัย: ${params.action} — GPO Xchange Portal`,
    html,
  });
}

// ── 6. แจ้งบัญชีถูกล็อกชั่วคราวจากการ login ผิดหลายครั้ง (lib/account-lockout.ts) ──
export async function sendAccountLockedEmail(params: {
  to: string;
  minutesLocked: number;
  whenText: string;
  ip?: string | null;
}): Promise<SendResult> {
  const html = await render(
    React.createElement(AccountLockedEmail, {
      minutesLocked: params.minutesLocked,
      whenText: params.whenText,
      ip: params.ip ?? null,
    })
  );
  return sendGmailMail({
    to: params.to,
    subject: 'บัญชีถูกล็อกชั่วคราว — GPO Xchange Portal',
    html,
  });
}

// ── 7. ส่งลิงก์ PDF ใบรับคืน/แลกเปลี่ยนสินค้า — ใช้ร่วมกันทั้งฝั่งลูกค้า (ผู้รับเดียว) และ
// ฝั่ง CSR (เรียกวนทีละคนจาก caller เอง ให้แต่ละคนได้อีเมลแยกฉบับ ไม่เห็นกันเอง) ──
export async function sendPdfDocumentEmail(params: {
  to: string;
  refId: string;
  hospitalName: string;
  docNumber: string | null;
  requestDateText: string | null;
  requestType: string | null;
  returnReason: string | null;
  deliveryType: string | null;
  totalValueText: string;
  items: PdfDocumentEmailDrugItem[];
  downloadUrl: string;
  preparedByStaff?: boolean;
}): Promise<SendResult> {
  // ลิงก์หน้าติดตามสถานะแบบ public (ไม่ต้อง login) พร้อม ref กรอกไว้ให้แล้ว — ค่าเดียวกับ QR
  // code ใน ReviewSuccessCard.tsx ตอนกดดูหลังส่งฟอร์ม (level M, ไม่มี logo กลาง) แค่ต้อง
  // generate ฝั่ง server แทนด้วย package `qrcode` (ตัว react ใช้ browser canvas ไม่มีให้ใช้
  // ในอีเมล) แล้วแนบเป็นรูปในตัวอีเมลผ่าน cid
  const trackingUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/tracking?ref=${encodeURIComponent(params.refId)}`;
  const trackingQrCid = 'tracking-qr';
  const qrPngBuffer = await QRCode.toBuffer(trackingUrl, { width: 320, margin: 1, errorCorrectionLevel: 'M' });

  const html = await render(
    React.createElement(PdfDocumentEmail, {
      hospitalName: params.hospitalName,
      refId: params.refId,
      docNumber: params.docNumber,
      requestDateText: params.requestDateText,
      requestType: params.requestType,
      returnReason: params.returnReason,
      deliveryType: params.deliveryType,
      totalValueText: params.totalValueText,
      items: params.items,
      downloadUrl: params.downloadUrl,
      trackingUrl,
      trackingQrCid,
      preparedByStaff: params.preparedByStaff,
    })
  );
  return sendGmailMail({
    to: params.to,
    subject: `เอกสารแบบฟอร์มรับคืน/แลกเปลี่ยนสินค้า (Ref: ${params.refId})`,
    html,
    attachments: [
      { filename: 'tracking-qr.png', content: qrPngBuffer, cid: trackingQrCid },
    ],
  });
}
