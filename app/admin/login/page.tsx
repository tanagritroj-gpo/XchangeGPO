'use client';
import { useState } from 'react';
import { loginStaffAction } from '@/app/actions/auth-staff';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const res = await loginStaffAction({ username, password });

    if (res.success) {
      // ไม่ต้องใช้ localStorage.setItem('username', res.username) แล้ว!
      // เพราะ loginStaffAction ได้สร้าง Session Cookie ไว้ที่ฝั่ง Server แล้วครับ
      
      if (res.role === 'manager') {
        window.location.href = '/admin/manager/staff-approvals';
      } else {
        window.location.href = '/dashboard';
      }
    } else {
      setError(res.error || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form onSubmit={handleLogin} className="bg-white p-8 rounded-3xl shadow-xl w-96 border border-slate-100">
        <h1 className="text-2xl font-black text-slate-800 mb-6">LOGIN</h1>
        
        {error && <p className="text-red-500 text-xs mb-4 font-bold">{error}</p>}

        <input
          type="text"
          placeholder="Username"
          className="w-full p-4 mb-4 rounded-xl border border-slate-200"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full p-4 mb-6 rounded-xl border border-slate-200"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button 
          type="submit" 
          className="w-full bg-slate-900 text-white p-4 rounded-xl font-bold hover:bg-slate-800"
          disabled={isLoading}
        >
          {isLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  );
}