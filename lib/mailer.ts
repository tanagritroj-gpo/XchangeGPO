import 'server-only';
import nodemailer from 'nodemailer';

// ★ อีเมลทุกฉบับของระบบส่งผ่าน Gmail SMTP ตามที่ทีมไอแนะนำ (ย้ายออกจาก resend ทั้งหมดแล้ว)
// ต้องใช้ App Password ของ Gmail/Workspace (ไม่ใช่รหัสผ่านบัญชีตรงๆ — Google บล็อก SMTP
// login ด้วยรหัสผ่านปกติมานานแล้วถ้าเปิด 2-Step Verification)
const transporter = nodemailer.createTransport({
  host: process.env.GMAIL_SMTP_HOST,
  port: Number(process.env.GMAIL_SMTP_PORT) || 465,
  secure: true, // port 465 = implicit TLS
  auth: {
    user: process.env.GMAIL_SMTP_USER,
    pass: process.env.GMAIL_SMTP_PASSWORD,
  },
});

export interface SendGmailAttachment {
  filename: string;
  content: Buffer;
  // cid = Content-ID — ใช้อ้างอิงจาก template ผ่าน <img src="cid:xxx"> เพื่อฝังรูปในตัวอีเมล
  // โดยตรง (ไม่ใช่ลิงก์โหลดจากเว็บ) วิธีนี้เมลไคลเอนต์หลักๆ (Gmail, Outlook, Apple Mail)
  // รองรับหมด ต่างจาก data: URI ที่ Gmail มักบล็อกไม่ยอมโชว์รูปให้
  cid: string;
}

export interface SendGmailParams {
  to: string;
  subject: string;
  html: string;
  attachments?: SendGmailAttachment[];
}

// คืนรูปแบบผลลัพธ์ให้หน้าตาคล้าย resend.emails.send() เดิม ({ error }) เพื่อลด diff
// ตรงจุดเรียกใช้ในไฟล์ action ทั้งสองที่ (send-pdf-email-action.ts / staff-form-actions.ts)
export async function sendGmailMail({ to, subject, html, attachments }: SendGmailParams): Promise<{ error: Error | null }> {
  try {
    await transporter.sendMail({
      from: `"GPO Xchange Portal" <${process.env.GMAIL_SMTP_USER}>`,
      to,
      subject,
      html,
      attachments,
    });
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}
