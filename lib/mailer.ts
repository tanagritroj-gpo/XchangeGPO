import 'server-only';
import nodemailer from 'nodemailer';

// ★ อีเมล "ส่ง PDF link" หลังยื่นแบบฟอร์มสำเร็จ (ทั้งฝั่งลูกค้าและ CSR) ส่งผ่าน Gmail SMTP
// ตามที่ทีมไอแนะนำ — แยกจาก resend ที่ยังใช้กับอีเมลอื่น (OTP/welcome) อยู่ ไม่ได้ย้ายทั้งหมด
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

export interface SendGmailParams {
  to: string;
  subject: string;
  html: string;
}

// คืนรูปแบบผลลัพธ์ให้หน้าตาคล้าย resend.emails.send() เดิม ({ error }) เพื่อลด diff
// ตรงจุดเรียกใช้ในไฟล์ action ทั้งสองที่ (send-pdf-email-action.ts / staff-form-actions.ts)
export async function sendGmailMail({ to, subject, html }: SendGmailParams): Promise<{ error: Error | null }> {
  try {
    await transporter.sendMail({
      from: `"GPO Xchange Portal" <${process.env.GMAIL_SMTP_USER}>`,
      to,
      subject,
      html,
    });
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}
