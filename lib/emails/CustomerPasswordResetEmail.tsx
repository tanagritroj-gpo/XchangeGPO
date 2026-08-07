import { Html, Body, Head, Heading, Text, Container, Section } from '@react-email/components';
import * as React from 'react';

interface CustomerPasswordResetEmailProps {
  otp: string;
}

export default function CustomerPasswordResetEmail({ otp }: CustomerPasswordResetEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>ตั้งรหัสผ่านใหม่ — GPO Xchange Portal</Heading>
          <Text style={text}>มีการขอตั้งรหัสผ่านใหม่สำหรับบัญชีลูกค้าของท่าน รหัสยืนยันคือ:</Text>
          <Section style={otpBox}>
            <Heading style={otpText}>{otp}</Heading>
          </Section>
          <Text style={footer}>รหัสนี้มีอายุ 5 นาที หากท่านไม่ได้เป็นผู้ขอตั้งรหัสผ่านใหม่ กรุณาเพิกเฉยต่ออีเมลฉบับนี้ครับ</Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: '#f6f9fc', fontFamily: 'Arial, sans-serif' };
const container = { backgroundColor: '#ffffff', padding: '40px', borderRadius: '8px' };
const h1 = { color: '#0f5132', fontSize: '20px', fontWeight: 'bold' };
const text = { color: '#334155', fontSize: '16px' };
const otpBox = { backgroundColor: '#d1fae5', padding: '10px', borderRadius: '5px', textAlign: 'center' as const };
const otpText = { color: '#0f5132', fontSize: '32px', margin: '0' };
const footer = { color: '#64748b', fontSize: '12px', marginTop: '30px' };
