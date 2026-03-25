/**
 * supabase.js
 * ────────────────────────────────────────────────────────────
 * Hybrid Storage Layer — ใช้ Supabase Storage สำหรับเก็บไฟล์ JD (PDF)
 * ส่วน Auth และ Database หลักยังคงใช้ Firebase / Firestore
 *
 * Bucket  : jd-files  (private, ต้องใช้ signed URL ในการเข้าถึง)
 * Folder  : {firestore_doc_id}/  (ใช้ docRef.id เป็นชื่อ folder)
 * Auth    : anon key + signed URL แทน Firebase Auth token
 * ────────────────────────────────────────────────────────────
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const MAX_FILE_SIZE_MB = 10
const ALLOWED_TYPES = ['application/pdf']

/**
 * อัพโหลดไฟล์ JD ไปยัง Supabase Storage
 * @param {File} file - ไฟล์ที่จะอัพโหลด (PDF เท่านั้น, ไม่เกิน 10MB)
 * @param {string} requestId - Firebase doc ID ใช้เป็น folder
 * @returns {Promise<{url: string|null, path: string|null, error: string|null}>}
 */
export async function uploadJDFile(file, requestId) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { url: null, path: null, error: 'อัพโหลดได้เฉพาะไฟล์ PDF เท่านั้น' }
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return { url: null, path: null, error: `ไฟล์ต้องไม่เกิน ${MAX_FILE_SIZE_MB}MB` }
  }

  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const fileName = safeName
    const filePath = `${requestId}/${Date.now()}_${fileName}`

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

/**
 * ดึงรายการไฟล์ทั้งหมดใน bucket jd-files
 */
export async function listJDFiles() {
  try {
    // ดึงโฟลเดอร์ทั้งหมด (requestId)
    const { data: folders, error: foldersError } = await supabase.storage
      .from('jd-files')
      .list('', { limit: 100 })

    if (foldersError) throw foldersError

    let allFiles = []

    // วนลูปดึงไฟล์ในแต่ละโฟลเดอร์
    for (const folder of folders) {
      if (folder.name === '.emptyFolderPlaceholder') continue

      const { data: files, error: filesError } = await supabase.storage
        .from('jd-files')
        .list(folder.name, { limit: 100 })

      if (filesError) {
        console.error(`Error listing folder ${folder.name}:`, filesError)
        continue
      }

      const filesWithDetails = files.map(f => ({
        ...f,
        folder: folder.name,
        path: `${folder.name}/${f.name}`
      }))

      allFiles = [...allFiles, ...filesWithDetails]
    }

    return { data: allFiles, error: null }
  } catch (err) {
    console.error('[listJDFiles]', err)
    return { data: [], error: err.message }
  }
}

/**
 * ลบไฟล์ JD ออกจาก Supabase Storage
 */
export async function deleteJDFile(filePath) {
  if (!filePath) return
  try {
    const { error } = await supabase.storage
      .from('jd-files')
      .remove([filePath])

    if (error) throw error
    return { success: true, error: null }
  } catch (err) {
    console.error('[deleteJDFile]', err)
    return { success: false, error: err.message }
  }
}
