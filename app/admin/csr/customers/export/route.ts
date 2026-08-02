import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { admin as supabaseAdmin } from '@/lib/supabase/admin';
import { getManagerOrCsrSession } from '@/app/actions/manager-actions';
import { ORG_TYPE_OPTIONS } from '@/lib/sale-coverage';

export const dynamic = 'force-dynamic';

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

const orgTypeLabel = (value: string | null) =>
  ORG_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? '-';

export async function GET() {
  try {
    await getManagerOrCsrSession();
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' }, { status: 403 });
  }

  const { data: customers, error } = await supabaseAdmin
    .from('b2b_customers')
    .select('customer_code, hospital_name, org_type, province, contact_name, position, phone, email, created_at')
    .order('hospital_name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'ดึงข้อมูลลูกค้าไม่สำเร็จ' }, { status: 500 });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GPO Xchange Portal';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('รายชื่อลูกค้า');
  sheet.columns = [
    { header: 'รหัสลูกค้า', key: 'customer_code', width: 16 },
    { header: 'ชื่อหน่วยงาน', key: 'hospital_name', width: 32 },
    { header: 'ประเภทหน่วยงาน', key: 'org_type', width: 18 },
    { header: 'จังหวัด', key: 'province', width: 14 },
    { header: 'ชื่อผู้ติดต่อ', key: 'contact_name', width: 22 },
    { header: 'ตำแหน่ง', key: 'position', width: 16 },
    { header: 'เบอร์โทรศัพท์', key: 'phone', width: 16 },
    { header: 'อีเมล', key: 'email', width: 26 },
    { header: 'วันที่ลงทะเบียน', key: 'created_at', width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).eachCell((cell) => { cell.fill = HEADER_FILL; });

  (customers ?? []).forEach((c) => {
    sheet.addRow({
      customer_code: c.customer_code ?? '-',
      hospital_name: c.hospital_name ?? '-',
      org_type: orgTypeLabel(c.org_type),
      province: c.province ?? '-',
      contact_name: c.contact_name ?? '-',
      position: c.position ?? '-',
      phone: c.phone ?? '-',
      email: c.email ?? '-',
      created_at: c.created_at ? new Date(c.created_at).toLocaleDateString('th-TH') : '-',
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const dateStamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="customer-list-${dateStamp}.xlsx"`,
    },
  });
}
