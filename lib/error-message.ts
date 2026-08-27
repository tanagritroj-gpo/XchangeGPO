export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  // Supabase/Postgrest errors ({ message, details, hint, code }) เป็น plain object ไม่ใช่
  // instanceof Error — String(obj) ธรรมดาจะได้ "[object Object]" แทนข้อความจริง
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return String(error);
}
