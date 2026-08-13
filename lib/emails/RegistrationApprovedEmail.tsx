import { Html, Body, Head, Heading, Text, Container, Section, Button, Hr } from '@react-email/components';
import * as React from 'react';

interface RegistrationApprovedEmailProps {
  hospitalName: string;
  customerCode: string;
  loginUrl: string;
  documentUrl: string;
}

export default function RegistrationApprovedEmail({
  hospitalName,
  customerCode,
  loginUrl,
  documentUrl,
}: RegistrationApprovedEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>คำขอเข้าใช้ระบบได้รับการอนุมัติแล้ว</Heading>
          <Text style={text}>เรียน ทีมงาน {hospitalName},</Text>
          <Text style={text}>
            คำขอเข้าใช้งานระบบของท่านได้รับการอนุมัติเรียบร้อยแล้ว ท่านสามารถเข้าใช้งานระบบรับคืน/แลกเปลี่ยนสินค้า
            และติดตามสถานะงานได้ทันทีผ่านลิงก์ด้านล่างนี้
          </Text>

          <Section style={codeBox}>
            <Text style={codeLabel}>รหัสลูกค้าของท่าน</Text>
            <Text style={codeValue}>{customerCode}</Text>
          </Section>

          <Section style={{ textAlign: 'center' as const, margin: '28px 0' }}>
            <Button href={loginUrl} style={button}>
              เข้าสู่ระบบ GPO Xchange Portal
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={text}>
            ท่านสามารถดาวน์โหลดเอกสารยืนยันการลงทะเบียนได้จากลิงก์นี้เช่นกัน (ลิงก์มีอายุการใช้งาน 24 ชั่วโมง):
          </Text>
          <Text style={text}>
            <a href={documentUrl} style={link}>ดาวน์โหลดเอกสารยืนยันการลงทะเบียน</a>
          </Text>

          <Text style={footer}>องค์การเภสัชกรรม (GPO) — GPO Xchange Portal</Text>
        </Container>
      </Body>
    </Html>
  );
}

// ── Styles ──
const main = { backgroundColor: '#f6f9fc', fontFamily: 'Arial, sans-serif' };
const container = { backgroundColor: '#ffffff', padding: '40px', borderRadius: '8px' };
const h1 = { color: '#0f5132', fontSize: '22px', fontWeight: 'bold' };
const text = { color: '#334155', fontSize: '16px', lineHeight: '24px' };

const codeBox = { backgroundColor: '#d1fae5', padding: '16px 20px', borderRadius: '8px', margin: '20px 0', textAlign: 'center' as const };
const codeLabel = { color: '#0f5132', fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.05em', textTransform: 'uppercase' as const, margin: '0 0 4px' };
const codeValue = { color: '#0f5132', fontSize: '22px', fontWeight: 'bold', margin: 0, fontFamily: 'monospace' };

const button = {
  backgroundColor: '#0f5132',
  color: '#ffffff',
  padding: '12px 28px',
  borderRadius: '8px',
  textDecoration: 'none',
  fontWeight: 'bold' as const,
  fontSize: '15px',
  display: 'inline-block',
};
const link = { color: '#0f766e', fontSize: '14px', textDecoration: 'underline' };
const hr = { borderColor: '#e2e8f0', margin: '24px 0' };
const footer = { color: '#64748b', fontSize: '12px', marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' };
