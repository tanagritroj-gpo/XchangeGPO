'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { generateReturnFormFromDB } from '@/app/services/pdf-service'

export async function generatePdfAction(requestId: number) {
  // 1. เรียกใช้ cookies() แล้วค่อยดึงค่า
  const cookieStore = await cookies() // บางเวอร์ชันต้องใช้ await หรือเรียกตรงๆ
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )

  try {
    const pdfBuffer = await generateReturnFormFromDB(requestId, supabase)
    return { success: true, data: Array.from(pdfBuffer), error: null }
  } catch (error: any) {
    console.error('[generatePdfAction] ❌', error)
    return { success: false, data: null, error: error.message }
  }
}