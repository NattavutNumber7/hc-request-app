import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/**
 * อัพโหลดไฟล์ JD ไปยัง Supabase Storage
 * @param {File} file - ไฟล์ที่จะอัพโหลด
 * @param {string} requestId - Firebase doc ID ใช้เป็น folder
 * @param {string} userEmail - email ผู้อัพโหลด (ใช้ sign JWT)
 * @returns {Promise<{url: string|null, error: string|null}>}
 */
export async function uploadJDFile(file, requestId, accessToken) {
  try {
    // Sign in to Supabase with Firebase token workaround → ใช้ anon + path-based security
    const ext      = file.name.split('.').pop()
    const filePath = `${requestId}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('jd-files')
      .upload(filePath, file, { upsert: false, contentType: file.type })

    if (uploadError) throw uploadError

    // สร้าง signed URL อายุ 7 วัน (TA กดเปิดได้)
    const { data, error: urlError } = await supabase.storage
      .from('jd-files')
      .createSignedUrl(filePath, 60 * 60 * 24 * 7)

    if (urlError) throw urlError

    return { url: data.signedUrl, path: filePath, error: null }
  } catch (err) {
    console.error('[uploadJDFile]', err)
    return { url: null, path: null, error: err.message }
  }
}

/**
 * สร้าง signed URL ใหม่สำหรับดูไฟล์ (อายุ 1 ชั่วโมง)
 */
export async function getJDSignedUrl(filePath) {
  const { data, error } = await supabase.storage
    .from('jd-files')
    .createSignedUrl(filePath, 60 * 60)

  if (error) return null
  return data.signedUrl
}
