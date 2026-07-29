'use client';

import { useState, useEffect, useRef } from 'react';
import { searchB2BCustomers } from '@/app/actions/staff-form-actions';

interface Customer {
  id: number;
  hospital_name: string;
  contact_name: string | null;
  position: string | null;
  phone: string | null;
  email: string;
  customer_code: string | null;
}

interface CustomerPickerProps {
  selected: Customer | null;
  onSelect: (customer: Customer) => void;
  onClear: () => void;
}

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest block mb-2 flex items-center gap-1.5">
    <span className="w-1 h-1 rounded-full bg-slate-300" />
    {children}
  </label>
);

export default function CustomerPicker({ selected, onSelect, onClear }: CustomerPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
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
      const res = await searchB2BCustomers(query);
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

  const handleSelect = (c: Customer) => {
    onSelect(c);
    setQuery('');
    setResults([]);
    setShowResults(false);
  };

  // ── แสดงการ์ดลูกค้าที่เลือกแล้ว ──
  if (selected) {
    return (
      <div className="rounded-2xl border-2 border-teal-200 bg-teal-50/50 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black text-teal-600 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-teal-500 text-white text-[9px] flex items-center justify-center">✓</span>
              ลูกค้าที่เลือก
            </p>
            <p className="text-sm font-black text-slate-800">{selected.hospital_name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selected.contact_name || '-'} {selected.position && `· ${selected.position}`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              📞 {selected.phone || '-'} · ✉️ {selected.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-bold text-red-500 hover:text-white hover:bg-red-500 border border-red-200 hover:border-red-500 px-3 py-1.5 rounded-lg transition-all shrink-0"
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
      <FieldLabel>ค้นหาลูกค้า (ชื่อหน่วยงาน / ผู้ติดต่อ / รหัสลูกค้า / อีเมล)</FieldLabel>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setShowResults(true)}
        placeholder="พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา..."
        className="w-full px-4 py-3 rounded-xl bg-slate-50 text-slate-700 font-bold text-sm border-2 border-slate-100 focus:bg-white focus:border-teal-400 focus:ring-4 focus:ring-teal-50 outline-none transition-all duration-200"
      />

      {loading && (
        <p className="text-xs text-muted-foreground font-medium mt-2 px-1">กำลังค้นหา...</p>
      )}
      {error && (
        <p className="text-xs text-red-500 font-bold mt-2 px-1">{error}</p>
      )}

      {showResults && results.length > 0 && (
        <div className="absolute z-20 mt-2 w-full bg-white rounded-2xl border border-slate-100 shadow-xl overflow-hidden max-h-72 overflow-y-auto">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleSelect(c)}
              className="w-full text-left px-4 py-3 hover:bg-teal-50 border-b border-slate-50 last:border-0 transition-colors"
            >
              <p className="text-sm font-black text-slate-800">{c.hospital_name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {c.contact_name || '-'} {c.customer_code && `· รหัส ${c.customer_code}`}
              </p>
              <p className="text-xs text-muted-foreground">{c.email}</p>
            </button>
          ))}
        </div>
      )}

      {showResults && !loading && query.trim().length >= 2 && results.length === 0 && !error && (
        <div className="absolute z-20 mt-2 w-full bg-white rounded-2xl border border-slate-100 shadow-xl p-4 text-center">
          <p className="text-xs text-muted-foreground font-medium">ไม่พบลูกค้าที่ตรงกับ "{query}"</p>
        </div>
      )}
    </div>
  );
}