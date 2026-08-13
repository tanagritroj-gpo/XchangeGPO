import { Html, Body, Head, Heading, Text, Container, Section, Hr } from '@react-email/components';
import * as React from 'react';

interface WelcomeEmailProps {
  hospitalName?: string;
}

export default function WelcomeEmail({ hospitalName = 'หน่วยงานของท่าน' }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>ยินดีต้อนรับสู่ระบบ GPO Xchange Portal</Heading>
          <Text style={text}>เรียน ทีมงาน {hospitalName},</Text>
          <Text style={text}>
            ระบบ GPO Xchange Portal ได้รับข้อมูลการลงทะเบียนใช้งานระบบของท่านเรียบร้อยแล้ว
          </Text>
          <Section style={noticeBox}>
            <Text style={noticeText}>กรุณารอเจ้าหน้าที่อนุมัติภายใน 1–2 วันทำการ</Text>
          </Section>
          <Text style={text}>
            เมื่อคำขอของท่านได้รับการอนุมัติ ระบบจะส่งอีเมลแจ้งพร้อมลิงก์เข้าใช้งานไปยังอีเมลนี้อีกครั้งครับ
          </Text>

          <Hr style={hr} />

          <Text style={contactTitle}>หากพบปัญหาการใช้งานระบบ ติดต่อทีมงานได้ที่</Text>
          <Text style={contactLine}>โทรศัพท์: 074-230547 (จ–ศ 8:00–16:00 น.)</Text>
          <Text style={contactLine}>อีเมล: gposouthhdy@gmail.com</Text>
          <Text style={contactLine}>LINE OA: @gpoofficial</Text>
          <Text style={contactLine}>องค์การเภสัชกรรม สาขาภาคใต้</Text>

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
const noticeBox = { backgroundColor: '#fef3c7', padding: '14px 18px', borderRadius: '8px', margin: '16px 0' };
const noticeText = { color: '#92400e', fontSize: '15px', fontWeight: 'bold', margin: 0 };
const hr = { borderColor: '#e2e8f0', margin: '24px 0' };
const contactTitle = { color: '#0f766e', fontSize: '13px', fontWeight: 'bold', margin: '0 0 8px' };
const contactLine = { color: '#64748b', fontSize: '13px', margin: '2px 0' };
const footer = { color: '#64748b', fontSize: '12px', marginTop: '30px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' };