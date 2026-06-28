'use server'

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import OTPEmail from '@/lib/emails/OTPEmail';
import * as React from 'react';

const resend = new Resend(process.env.RESEND_API_KEY);

// 1. ส่ง OTP (คงเดิม)
export async function sendOTP(email: string) {
try {
const supabase = await createClient();
const { data: customer, error: customerErr } = await supabase
.from('b2b_customers')
.select('*')
.eq('email', email)
.single();

if (customerErr || !customer) throw new Error("ไม่พบอีเมลนี้ในระบบลูกค้า");

const otp = Math.floor(100000 + Math.random() * 900000).toString();
const { error: logErr } = await supabase
.from('otp_logs')
.insert({
email: email,
otp_code: otp,
expires_at: new Date(Date.now() + 5 * 60000).toISOString(),
used: false
});

if (logErr) throw logErr;

const emailHtml = await render(React.createElement(OTPEmail, { otp: otp }));
await resend.emails.send({
from: 'GPO Xchange <onboarding@resend.dev>',
to: email,
subject: 'รหัส OTP ยืนยันการเข้าใช้งานระบบ Xchange',
html: emailHtml,
});

return { success: true };
} catch (e: any) {
return { success: false, error: e.message };
}
}

// 2. ยืนยัน OTP (ปรับ Cookie ให้หมดอายุใน 1 ชั่วโมง)
export async function verifyOTP(email: string, otp: string) {
try {
const supabase = await createClient();

const { data: log, error: logErr } = await supabase
.from('otp_logs')
.select('*')
.eq('email', email)
.eq('otp_code', otp)
.eq('used', false)
.gt('expires_at', new Date().toISOString())
.single();

if (logErr || !log) throw new Error("รหัส OTP ไม่ถูกต้องหรือหมดอายุ");

await supabase.from('otp_logs').update({ used: true }).eq('id', log.id);

const { data: customer } = await supabase
.from('b2b_customers')
.select('*')
.eq('email', email)
.single();

const cookieStore = await cookies();
// ปรับ maxAge เป็น 3600 วินาที (1 ชั่วโมง)
cookieStore.set('customer_session', JSON.stringify(customer), {
httpOnly: true,
secure: process.env.NODE_ENV === 'production',
maxAge: 3600,
path: '/'
});

return { success: true };
} catch (e: any) {
return { success: false, error: e.message };
}
}

// 3. ดึง Session พร้อมเช็คความสมบูรณ์
export async function getCustomerSession() {
try {
const cookieStore = await cookies();
const sessionCookie = cookieStore.get('customer_session');
if (!sessionCookie) return null;
const session = JSON.parse(sessionCookie.value);
const supabase = await createClient();
const { data: customer, error } = await supabase
.from('b2b_customers')
.select('id, email, hospital_name, contact_name')
.eq('id', session.id)
.single();

if (error || !customer) {
logoutCustomer(); // ถ้าหา user ไม่เจอใน DB ให้ลบ cookie ทิ้งทันที
return null;
}

return customer;
} catch {
return null;
}
}

// 4. Logout (ชัดเจนขึ้น)
export async function logoutCustomer() {
const cookieStore = await cookies();
cookieStore.delete('customer_session');
} 