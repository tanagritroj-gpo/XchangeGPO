import { Html, Body, Head, Heading, Text, Container, Section, Row, Column, Button, Hr, Img } from '@react-email/components';
import * as React from 'react';
import { CONTACT } from '@/lib/return-policy';

export interface PdfDocumentEmailDrugItem {
  drugName: string;
  qty: number;
  unit: string;
  lot: string | null;
  exp: string | null;
  // verified email #2: รายการที่ CSR ตรวจแล้วไม่ผ่านเกณฑ์ — ขีดคร่อมในลิสต์ + เหตุผลกำกับ
  rejected?: boolean;
  rejectReason?: string | null;
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
  // ไม่มีค่าเมื่อ pendingVerification (email #1 แจ้งรับเรื่อง ยังไม่มีเอกสารให้ดาวน์โหลด)
  downloadUrl?: string | null;
  // ลิงก์หน้าติดตามสถานะแบบ public (ไม่ต้อง login) พร้อม ref กรอกไว้ให้แล้ว — โชว์เป็นทั้ง
  // ข้อความลิงก์และ QR code (แนบเป็น inline attachment อ้างอิงผ่าน cid นี้ — ดู
  // lib/email-service.ts ที่เป็นคนสร้าง QR จริงแล้วแนบเข้ามาพร้อม cid เดียวกัน)
  trackingUrl: string;
  trackingQrCid: string;
  // ★ ฝั่ง CSR กรอกแทนลูกค้า เปลี่ยนข้อความต้อนรับให้ตรงกับความจริง (คนละคนกดสร้างเอกสาร)
  preparedByStaff?: boolean;
  // email #1 (แลกเปลี่ยน) — แจ้งรับเรื่อง ระบบกำลังตรวจสอบ ยังไม่แนบลิงก์ PDF
  pendingVerification?: boolean;
  // email #2 (แลกเปลี่ยน) — เอกสารผ่านการตรวจสอบรายการสินค้าและหลักเกณฑ์แล้ว
  verified?: boolean;
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
  trackingUrl,
  trackingQrCid,
  preparedByStaff = false,
  pendingVerification = false,
  verified = false,
}: PdfDocumentEmailProps) {
  const intro = pendingVerification
    ? 'องค์การเภสัชกรรม สาขาภาคใต้ ได้รับคำร้องขอแลกเปลี่ยน/คืนยาและเวชภัณฑ์ของท่านเรียบร้อยแล้ว ขณะนี้เจ้าหน้าที่อยู่ระหว่างตรวจสอบรายการสินค้าและหลักเกณฑ์การรับคืน/แลกเปลี่ยน เมื่อดำเนินการแล้วเสร็จ ระบบจะจัดส่งเอกสารฉบับสมบูรณ์ให้ท่านทางอีเมลนี้อีกครั้ง'
    : verified
      ? 'องค์การเภสัชกรรม สาขาภาคใต้ ได้ตรวจสอบคำร้องขอแลกเปลี่ยน/คืนยาและเวชภัณฑ์ของท่านเรียบร้อยแล้ว โปรดดาวน์โหลดเอกสารฉบับสมบูรณ์ตามลิงก์ด้านล่าง'
      : preparedByStaff
        ? 'เจ้าหน้าที่ CSR ได้จัดเตรียมเอกสารแบบฟอร์มรับคืน/แลกเปลี่ยนสินค้าให้ท่านเรียบร้อยแล้ว สรุปรายละเอียดคำร้องมีดังนี้ครับ'
        : 'ระบบได้จัดเตรียมเอกสารแบบฟอร์มรับคืน/แลกเปลี่ยนสินค้าของท่านเรียบร้อยแล้ว สรุปรายละเอียดคำร้องมีดังนี้ครับ';

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>
            {pendingVerification ? 'รับเรื่องคำร้องขอแลกเปลี่ยน/คืนสินค้าแล้ว' : 'เอกสารแบบฟอร์มรับคืน/แลกเปลี่ยนสินค้า'}
          </Heading>
          <Text style={text}>เรียน ทีมงาน {hospitalName},</Text>
          <Text style={text}>{intro}</Text>

          {pendingVerification && (
            <Section style={noticeAmber}>
              <Text style={noticeText}>⏳ อยู่ระหว่างตรวจสอบรายการสินค้าและหลักเกณฑ์การรับคืน/แลกเปลี่ยน</Text>
            </Section>
          )}
          {verified && (
            <Section style={noticeGreen}>
              <Text style={noticeText}>
                ✓ เอกสารฉบับนี้ผ่านการตรวจสอบแล้ว — เจ้าหน้าที่ได้ตรวจรายการสินค้าและหลักเกณฑ์เรียบร้อย
                รายการที่ไม่ผ่านเกณฑ์จะมีเครื่องหมายขีดคร่อมและหมายเหตุกำกับไว้ในเอกสาร PDF
              </Text>
            </Section>
          )}

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
                  <Text style={item.rejected ? itemNameRejected : itemName}>
                    {i + 1}. {item.drugName}
                  </Text>
                  <Text style={itemMeta}>
                    จำนวน {item.qty} {item.unit}
                    {item.lot ? ` · Lot: ${item.lot}` : ''}
                    {item.exp ? ` · หมดอายุ: ${item.exp}` : ''}
                  </Text>
                  {item.rejected && (
                    <Text style={itemRejectNote}>✕ ไม่ผ่านเกณฑ์: {item.rejectReason || 'ไม่ระบุเหตุผล'}</Text>
                  )}
                </Section>
              ))}
              <Section style={totalRow}>
                <Row>
                  <Column>
                    <Text style={totalLabel}>{verified ? 'รวมมูลค่า (เฉพาะรายการที่ผ่านเกณฑ์)' : 'รวมมูลค่า'}</Text>
                  </Column>
                  <Column align="right">
                    <Text style={totalValue}>{totalValueText} บาท</Text>
                  </Column>
                </Row>
              </Section>
            </>
          )}

          {downloadUrl && (
            <>
              <Hr style={hr} />
              <Section style={{ textAlign: 'center' as const, margin: '28px 0' }}>
                <Button href={downloadUrl} style={button}>
                  ดาวน์โหลดเอกสาร PDF
                </Button>
              </Section>
              <Text style={footerNote}>ลิงก์ดาวน์โหลดนี้มีอายุการใช้งาน 24 ชั่วโมงนับจากเวลาที่ส่งอีเมลฉบับนี้</Text>
            </>
          )}

          <Hr style={hr} />

          <Text style={sectionTitle}>ติดตามสถานะใบงาน</Text>
          <Text style={text}>
            ท่านสามารถติดตามสถานะใบงานนี้ได้ตลอดเวลา โดยไม่ต้องเข้าสู่ระบบ ผ่านลิงก์:{' '}
            <a href={trackingUrl} style={link}>{trackingUrl}</a>
          </Text>
          <Text style={text}>
            กรอกเลขที่อ้างอิง <strong>{refId}</strong> ในหน้าติดตามสถานะ หรือสแกน QR code ด้านล่างเพื่อเข้าสู่หน้านั้นโดยตรง
          </Text>
          <Section style={{ textAlign: 'center' as const, margin: '20px 0' }}>
            <Img src={`cid:${trackingQrCid}`} width={160} height={160} alt="QR Code ติดตามสถานะ" style={qrImage} />
          </Section>

          <Hr style={hr} />
          <Text style={contactTitle}>หากมีข้อสงสัย กรุณาติดต่อ องค์การเภสัชกรรม สาขาภาคใต้</Text>
          <Text style={contactLine}>โทรศัพท์: {CONTACT.phone} ({CONTACT.hours})</Text>
          <Text style={contactLine}>อีเมล: {CONTACT.email} · LINE OA: {CONTACT.lineOA}</Text>

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
const itemNameRejected = { color: '#b91c1c', fontSize: '14px', fontWeight: 'bold', margin: 0, textDecoration: 'line-through' as const };
const itemRejectNote = { color: '#b91c1c', fontSize: '12px', margin: '2px 0 0', fontWeight: 'bold' as const };
const itemMeta = { color: '#64748b', fontSize: '13px', margin: '2px 0 0' };

const noticeAmber = { backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 16px', margin: '16px 0' };
const noticeGreen = { backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 16px', margin: '16px 0' };
const noticeText = { color: '#334155', fontSize: '13px', margin: 0, lineHeight: '20px' };
const contactTitle = { color: '#0f766e', fontSize: '13px', fontWeight: 'bold' as const, margin: '0 0 6px' };
const contactLine = { color: '#64748b', fontSize: '13px', margin: '2px 0' };

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
const link = { color: '#0f766e', textDecoration: 'underline', wordBreak: 'break-all' as const };
const qrImage = { margin: '0 auto', border: '8px solid #f0fdf4', borderRadius: '8px' };
const footer = { color: '#64748b', fontSize: '12px', marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' };
