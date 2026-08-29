import { Html, Body, Head, Heading, Text, Container } from '@react-email/components';
import * as React from 'react';

interface AccountLockedEmailProps {
  minutesLocked: number;
  whenText: string;
  ip?: string | null;
}

export default function AccountLockedEmail({ minutesLocked, whenText, ip }: AccountLockedEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>บัญชีถูกล็อกชั่วคราว — GPO Xchange Portal</Heading>
          <Text style={text}>
            บัญชีของท่านถูก<strong>ล็อกชั่วคราว {minutesLocked} นาที</strong> เนื่องจากมีการพยายาม
            เข้าสู่ระบบด้วยรหัสผ่านที่ไม่ถูกต้องหลายครั้งติดต่อกัน เมื่อ {whenText}
            {ip ? ` (IP ล่าสุด ${ip})` : ''}
          </Text>
          <Text style={text}>
            ท่านสามารถเข้าสู่ระบบได้อีกครั้งหลังครบกำหนด หรือ<strong>รีเซ็ตรหัสผ่าน</strong>เพื่อปลดล็อกทันที
          </Text>
          <Text style={warn}>
            หากท่าน<strong>ไม่ได้เป็นผู้พยายามเข้าสู่ระบบ</strong> แสดงว่าอาจมีผู้อื่นทราบชื่อบัญชีของท่าน
            และกำลังเดารหัสผ่าน — กรุณาเปลี่ยนรหัสผ่านให้แข็งแรงขึ้นและติดต่อเจ้าหน้าที่
          </Text>
          <Text style={footer}>อีเมลฉบับนี้ส่งอัตโนมัติ กรุณาอย่าตอบกลับ</Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: '#f6f9fc', fontFamily: 'Arial, sans-serif' };
const container = { backgroundColor: '#ffffff', padding: '40px', borderRadius: '8px' };
const h1 = { color: '#b91c1c', fontSize: '20px', fontWeight: 'bold' as const };
const text = { color: '#334155', fontSize: '15px', lineHeight: '1.6' };
const warn = { color: '#92400e', fontSize: '14px', lineHeight: '1.6', marginTop: '20px' };
const footer = { color: '#94a3b8', fontSize: '12px', marginTop: '28px' };
