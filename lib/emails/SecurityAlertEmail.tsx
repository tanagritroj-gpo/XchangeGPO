import { Html, Body, Head, Heading, Text, Container, Section } from '@react-email/components';
import * as React from 'react';

interface SecurityAlertEmailProps {
  /** เช่น "เปลี่ยนรหัสผ่าน", "เปลี่ยนอีเมลบัญชี", "เปลี่ยน Username", "แก้ไขข้อมูลติดต่อ" */
  action: string;
  whenText: string;
  ip?: string | null;
  /** ข้อความเพิ่มเติม เช่น "จาก sale@old.com เป็น sale@new.com" */
  detail?: string | null;
}

export default function SecurityAlertEmail({ action, whenText, ip, detail }: SecurityAlertEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>แจ้งเตือนความปลอดภัย — GPO Xchange Portal</Heading>
          <Text style={text}>
            มีการ<strong>{action}</strong>ในบัญชีของท่านเมื่อ {whenText}
            {ip ? ` จากหมายเลข IP ${ip}` : ''}
          </Text>
          {detail ? (
            <Section style={detailBox}>
              <Text style={detailText}>{detail}</Text>
            </Section>
          ) : null}
          <Text style={warn}>
            หาก<strong>ท่านเป็นผู้ดำเนินการเอง</strong> ไม่ต้องทำอะไรเพิ่มเติม —
            แต่หาก<strong>ไม่ใช่ท่าน</strong> กรุณารีเซ็ตรหัสผ่านและติดต่อเจ้าหน้าที่ทันที
          </Text>
          <Text style={footer}>อีเมลฉบับนี้ส่งอัตโนมัติ กรุณาอย่าตอบกลับ</Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: '#f6f9fc', fontFamily: 'Arial, sans-serif' };
const container = { backgroundColor: '#ffffff', padding: '40px', borderRadius: '8px' };
const h1 = { color: '#0f5132', fontSize: '20px', fontWeight: 'bold' as const };
const text = { color: '#334155', fontSize: '15px', lineHeight: '1.6' };
const detailBox = { backgroundColor: '#f1f5f9', padding: '12px 16px', borderRadius: '6px' };
const detailText = { color: '#334155', fontSize: '14px', margin: '0' };
const warn = { color: '#92400e', fontSize: '14px', lineHeight: '1.6', marginTop: '20px' };
const footer = { color: '#94a3b8', fontSize: '12px', marginTop: '28px' };
