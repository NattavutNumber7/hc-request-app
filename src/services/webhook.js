const WEBHOOK_URL = import.meta.env.VITE_GAS_WEBHOOK_URL
const DATA_URL = import.meta.env.VITE_GAS_DATA_URL

/**
 * อัพเดต Status ใน Google Sheets เมื่อมีการเปลี่ยนแปลงใน Web App
 * ใช้ DATA_URL (doGet) แทน WEBHOOK_URL เพราะ updateStatus handler อยู่ใน doGet
 */
export async function sendStatusUpdate(docId, status, assignedToName = null) {
  if (!DATA_URL) {
    console.error('[sendStatusUpdate] VITE_GAS_DATA_URL not configured')
    return
  }
  try {
    const params = new URLSearchParams({ action: 'updateStatus', id: docId, status })
    if (assignedToName) params.set('assignedToName', assignedToName)
    const url = `${DATA_URL}?${params.toString()}`
    console.log('[sendStatusUpdate] GET', url)
    // GAS รองรับ CORS สำหรับ GET → อ่าน response ได้
    const res = await fetch(url)
    const json = await res.json()
    console.log('[sendStatusUpdate] response:', json)
  } catch (error) {
    console.error('[sendStatusUpdate] error:', error)
  }
}

/**
 * ส่งข้อมูล HC Request ไปยัง Google Apps Script Webhook
 * @param {Object} data - ข้อมูล Request ที่จะส่งไป Google Sheets
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function sendToWebhook(data) {
  if (!WEBHOOK_URL) {
    console.warn('GAS Webhook URL not configured')
    return { success: false, message: 'Webhook URL not configured' }
  }

  try {
    // GAS ไม่รองรับ CORS preflight → ใช้ text/plain + no-cors
    // e.postData.contents ใน GAS ยังอ่านได้ปกติ
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(data),
      mode: 'no-cors',
    })
    // no-cors คืน opaque response → ถือว่าสำเร็จถ้าไม่ throw
    return { success: true, message: 'ส่งข้อมูลไป Google Sheets เรียบร้อย' }
  } catch (error) {
    console.error('Webhook error:', error)
    return { success: false, message: error.message }
  }
}
