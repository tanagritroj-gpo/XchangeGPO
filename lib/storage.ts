// lib/storage.ts
import { createClient } from '@/lib/supabase/client';

// กำหนด Type ไว้ที่นี่เลย ไม่ต้องแยกไฟล์
export interface UploadResult {
  url: string | null;
  error: string | null;
}

const supabase = createClient();

export const uploadSignature = async (file: File): Promise<UploadResult> => {
  const fileName = `${Date.now()}_${file.name}`;
  
  const { data, error } = await supabase.storage
    .from('signatures')
    .upload(fileName, file);

  if (error) return { url: null, error: error.message };

  const { data: publicUrlData } = supabase.storage
    .from('signatures')
    .getPublicUrl(fileName);

  return { url: publicUrlData.publicUrl, error: null };
};