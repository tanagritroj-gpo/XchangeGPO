'use client';

import { useState, useEffect, useRef } from 'react';
import { Building2, MapPin, Search, Check } from 'lucide-react';
import { searchOrganizations } from '@/app/actions/csr-actions';

interface OrgOption {
  id: number;
  hospital_name: string;
  customer_code: string | null;
  province: string | null;
  org_type: string | null;
}

interface OrganizationPickerProps {
  selected: OrgOption | null;
  onSelect: (org: OrgOption) => void;
  onClear: () => void;
}

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <label className="text-[13px] font-black text-muted-foreground uppercase tracking-widest block mb-2 flex items-center gap-1.5">
    <span className="w-1 h-1 rounded-full bg-slate-300" />
    {children}
  </label>
);

// ★ ขั้นเลือกลูกค้าตอนกรอกแบบฟอร์มแทน มองในมุม "organization" (หน่วยงาน) ล้วนๆ — ค้นหา/
// แสดงผลแค่ hospital_name + customer_code + จังหวัด/ประเภท ไม่ต้องดึงอีเมล/เบอร์โทรของ
// ผู้ติดต่อรายคนเข้ามาเลย (ต่างจาก CustomerPicker.tsx ที่ยังใช้ค้นระดับ b2b_customer รายคน
// อยู่ที่หน้า "ค้นหาลูกค้าในระบบ" ของ CSR — คนละจุดประสงค์กัน แยกไฟล์ไว้ไม่ปนกัน) ใช้
// searchOrganizations() ตัวเดียวกับหน้า customers ตรงๆ ไม่เพิ่ม endpoint ใหม่
export default function OrganizationPicker({ selected, onSelect, onClear }: OrganizationPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      setError('');
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError('');
      const res = await searchOrganizations(query);
      if (res.success) {
        setResults(res.data ?? []);
        setShowResults(true);
      } else {
        setError(res.error || 'ค้นหาไม่สำเร็จ');
        setResults([]);
      }
      setLoading(false);
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // ปิด dropdown เมื่อคลิกข้างนอก
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (org: OrgOption) => {
    onSelect(org);
    setQuery('');
    setResults([]);
    setShowResults(false);
  };

  // ── การ์ดหน่วยงานที่เลือกแล้ว ──
  if (selected) {
    return (
      <div className="relative overflow-hidden rounded-2xl border-2 border-teal-200 bg-gradient-to-br from-teal-50 to-emerald-50/60 p-4 sm:p-5 shadow-sm">
        <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-teal-200/30 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm" style={{ background: 'linear-gradient(135deg,#0f5132,#1a7a45)' }}>
              <Building2 size={20} className="text-white" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black text-teal-600 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-teal-500 text-white text-[10px] flex items-center justify-center"><Check size={11} strokeWidth={3} /></span>
                หน่วยงานที่เลือก
              </p>
              <p className="text-base font-black text-slate-800 truncate">{selected.hospital_name}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                {selected.customer_code && (
                  <span className="text-xs font-bold text-teal-700 bg-white/70 px-2 py-0.5 rounded-full border border-teal-100">รหัส {selected.customer_code}</span>
                )}
                {selected.province && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1"><MapPin size={13} strokeWidth={2.5} />{selected.province}</span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="text-sm font-bold text-red-500 hover:text-white hover:bg-red-500 border border-red-200 hover:border-red-500 px-3 py-1.5 rounded-lg transition-all shrink-0"
          >
            เปลี่ยน
          </button>
        </div>
      </div>
    );
  }

  // ── ช่องค้นหา ──
  return (
    <div ref={wrapperRef} className="relative">
      <FieldLabel>ค้นหาหน่วยงาน (ชื่อหน่วยงาน)</FieldLabel>
      <div className="relative">
        <Search size={18} strokeWidth={2.5} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder="พิมพ์ชื่อหน่วยงานอย่างน้อย 2 ตัวอักษรเพื่อค้นหา..."
          className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 text-slate-700 font-bold text-base border-2 border-slate-100 focus:bg-white focus:border-teal-400 focus:ring-4 focus:ring-teal-50 outline-none transition-all duration-200"
        />
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground font-medium mt-2 px-1">กำลังค้นหา...</p>
      )}
      {error && (
        <p className="text-sm text-red-500 font-bold mt-2 px-1">{error}</p>
      )}

      {showResults && results.length > 0 && (
        <div className="absolute z-20 mt-2 w-full bg-white rounded-2xl border border-slate-100 shadow-xl overflow-hidden max-h-72 overflow-y-auto">
          {results.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => handleSelect(org)}
              className="w-full flex items-center gap-3 text-left px-4 py-3 hover:bg-teal-50 border-b border-slate-50 last:border-0 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                <Building2 size={16} className="text-teal-600" strokeWidth={2.25} />
              </div>
              <div className="min-w-0">
                <p className="text-base font-black text-slate-800 truncate">{org.hospital_name}</p>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-0.5">
                  {org.customer_code && (
                    <span className="text-xs font-bold text-muted-foreground">รหัส {org.customer_code}</span>
                  )}
                  {org.province && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin size={11} strokeWidth={2.5} />{org.province}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {showResults && !loading && query.trim().length >= 2 && results.length === 0 && !error && (
        <div className="absolute z-20 mt-2 w-full bg-white rounded-2xl border border-slate-100 shadow-xl p-4 text-center">
          <p className="text-sm text-muted-foreground font-medium">ไม่พบหน่วยงานที่ตรงกับ &quot;{query}&quot;</p>
        </div>
      )}
    </div>
  );
}
