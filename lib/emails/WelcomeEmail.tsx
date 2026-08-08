import { Html, Body, Head, Heading, Text, Container } from '@react-email/components';
import * as React from 'react';

interface WelcomeEmailProps {
  hospitalName: string;
}

export default function WelcomeEmail({ hospitalName }: WelcomeEmailProps = { hospitalName: 'หน่วยงานของท่าน' }) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>ยินดีต้อนรับสู่ระบบ Xchange Portal</Heading>
          <Text style={text}>เรียน ทีมงาน {hospitalName},</Text>
          <Text style={text}>
            ระบบได้รับคำขอลงทะเบียนของท่านเรียบร้อยแล้ว ขณะนี้คำขอกำลังอยู่ในขั้นตอนการตรวจสอบข้อมูลโดยเจ้าหน้าที่องค์การเภสัชกรรม (GPO)
          </Text>
          <Text style={text}>
            หากมีการอัปเดตสถานะ หรือต้องการข้อมูลเพิ่มเติม ระบบจะแจ้งเตือนไปยังอีเมลนี้อีกครั้งครับ
          </Text>
          <Text style={footer}>องค์การเภสัชกรรม (GPO) - GPO Xchange Portal</Text>
        </Container>
      </Body>
    </Html>
  );
}

// ── Styles (แยกออกมาแบบนี้ แก้ไขง่ายมากครับ) ──
const main = { backgroundColor: '#f6f9fc', fontFamily: 'Arial, sans-serif' };
const container = { backgroundColor: '#ffffff', padding: '40px', borderRadius: '8px' };
const h1 = { color: '#0f766e', fontSize: '24px', fontWeight: 'bold' };
const text = { color: '#334155', fontSize: '16px', lineHeight: '24px' };
const footer = { color: '#64748b', fontSize: '12px', marginTop: '40px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' };