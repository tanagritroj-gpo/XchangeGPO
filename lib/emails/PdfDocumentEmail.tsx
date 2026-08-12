import { Html, Body, Head, Heading, Text, Container, Section, Row, Column, Button, Hr } from '@react-email/components';
import * as React from 'react';

export interface PdfDocumentEmailDrugItem {
  drugName: string;
  qty: number;
  unit: string;
  lot: string | null;
  exp: string | null;
}

export interface PdfDocumentEmailProps {
  hospitalName: string;
  refId: string;
  docNumber: string | null;
  requestDateText: string | null;
  requestType: string | null;
  returnReason: string | null;
  deliveryType: string | null;
  totalValueText: string;
  items: PdfDocumentEmailDrugItem[];
  downloadUrl: string;
  // ★ ฝั่ง CSR กรอกแทนลูกค้า เปลี่ยนข้อความต้อนรับให้ตรงกับความจริง (คนละคนกดสร้างเอกสาร)
  preparedByStaff?: boolean;
}

export default function PdfDocumentEmail({
  hospitalName,
  refId,
  docNumber,
  requestDateText,
  requestType,
  returnReason,
  deliveryType,
  totalValueText,
  items,
  downloadUrl,
  preparedByStaff = false,
}: PdfDocumentEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>เอกสารแบบฟอร์มรับคืน/แลกเปลี่ยนสินค้า</Heading>
          <Text style={text}>เรียน ทีมงาน {hospitalName},</Text>
          <Text style={text}>
            {preparedByStaff
              ? 'เจ้าหน้าที่ CSR ได้จัดเตรียมเอกสารแบบฟอร์มรับคืน/แลกเปลี่ยนสินค้าให้ท่านเรียบร้อยแล้ว'
              : 'ระบบได้จัดเตรียมเอกสารแบบฟอร์มรับคืน/แลกเปลี่ยนสินค้าของท่านเรียบร้อยแล้ว'}{' '}
            สรุปรายละเอียดคำร้องมีดังนี้ครับ
          </Text>

          {/* เลขอ้างอิง — เด่นสุดในอีเมล ให้ผู้รับหาได้ทันทีแม้ไม่เปิด PDF */}
          <Section style={refBox}>
            <Row>
              <Column>
                <Text style={refLabel}>เลขที่อ้างอิง</Text>
                <Text style={refValue}>{refId}</Text>
              </Column>
              {docNumber && (
                <Column>
                  <Text style={refLabel}>เลขที่เอกสาร</Text>
                  <Text style={refValue}>{docNumber}</Text>
                </Column>
              )}
            </Row>
          </Section>

          {/* สรุปคำร้อง */}
          <Section>
            {requestDateText && <DetailRow label="วันที่ทำรายการ" value={requestDateText} />}
            {requestType && <DetailRow label="ประเภทรายการ" value={requestType} />}
            {returnReason && <DetailRow label="เหตุผลการส่งคืน" value={returnReason} />}
            {deliveryType && <DetailRow label="วิธีส่งคืน" value={deliveryType} />}
          </Section>

          {items.length > 0 && (
            <>
              <Hr style={hr} />
              <Text style={sectionTitle}>รายการยาและเวชภัณฑ์ ({items.length} รายการ)</Text>
              {items.map((item, i) => (
                <Section key={i} style={itemRow}>
                  <Text style={itemName}>
                    {i + 1}. {item.drugName}
                  </Text>
                  <Text style={itemMeta}>
                    จำนวน {item.qty} {item.unit}
                    {item.lot ? ` · Lot: ${item.lot}` : ''}
                    {item.exp ? ` · หมดอายุ: ${item.exp}` : ''}
                  </Text>
                </Section>
              ))}
              <Section style={totalRow}>
                <Row>
                  <Column>
                    <Text style={totalLabel}>รวมมูลค่า</Text>
                  </Column>
                  <Column align="right">
                    <Text style={totalValue}>{totalValueText} บาท</Text>
                  </Column>
                </Row>
              </Section>
            </>
          )}

          <Hr style={hr} />

          <Section style={{ textAlign: 'center' as const, margin: '28px 0' }}>
            <Button href={downloadUrl} style={button}>
              ดาวน์โหลดเอกสาร PDF
            </Button>
          </Section>
          <Text style={footerNote}>ลิงก์ดาวน์โหลดนี้มีอายุการใช้งาน 24 ชั่วโมงนับจากเวลาที่ส่งอีเมลฉบับนี้</Text>

          <Text style={footer}>องค์การเภสัชกรรม (GPO) — GPO Xchange Portal</Text>
        </Container>
      </Body>
    </Html>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Row style={detailRow}>
      <Column style={detailLabelCol}>
        <Text style={detailLabel}>{label}</Text>
      </Column>
      <Column>
        <Text style={detailValue}>{value}</Text>
      </Column>
    </Row>
  );
}

// ── Styles ──
const main = { backgroundColor: '#f6f9fc', fontFamily: 'Arial, sans-serif' };
const container = { backgroundColor: '#ffffff', padding: '40px', borderRadius: '8px' };
const h1 = { color: '#0f5132', fontSize: '22px', fontWeight: 'bold', marginBottom: '4px' };
const text = { color: '#334155', fontSize: '16px', lineHeight: '24px' };

const refBox = { backgroundColor: '#d1fae5', padding: '16px 20px', borderRadius: '8px', margin: '20px 0' };
const refLabel = { color: '#0f5132', fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.05em', textTransform: 'uppercase' as const, margin: '0 0 4px' };
const refValue = { color: '#0f5132', fontSize: '20px', fontWeight: 'bold', margin: 0, fontFamily: 'monospace' };

const detailRow = { margin: '4px 0' };
const detailLabelCol = { width: '150px' };
const detailLabel = { color: '#64748b', fontSize: '13px', fontWeight: 'bold', margin: 0 };
const detailValue = { color: '#334155', fontSize: '14px', margin: 0 };

const hr = { borderColor: '#e2e8f0', margin: '20px 0' };
const sectionTitle = { color: '#0f5132', fontSize: '14px', fontWeight: 'bold', margin: '0 0 12px' };
const itemRow = { margin: '0 0 10px' };
const itemName = { color: '#1e293b', fontSize: '14px', fontWeight: 'bold', margin: 0 };
const itemMeta = { color: '#64748b', fontSize: '13px', margin: '2px 0 0' };

const totalRow = { borderTop: '2px dashed #e2e8f0', paddingTop: '10px', marginTop: '10px' };
const totalLabel = { color: '#64748b', fontSize: '13px', fontWeight: 'bold', margin: 0 };
const totalValue = { color: '#0f5132', fontSize: '18px', fontWeight: 'bold', margin: 0 };

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
const footerNote = { color: '#94a3b8', fontSize: '12px', textAlign: 'center' as const, margin: '0 0 20px' };
const footer = { color: '#64748b', fontSize: '12px', marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' };
