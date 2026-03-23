import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

/**
 * บันทึก Audit Log ลง Firestore hc_logs
 * @param {Object} params
 * @param {string} params.requestId    - Firestore doc ID ของ HC Request
 * @param {string} params.action       - 'Submit' | 'StatusChange' | 'Assign' | 'Cancel'
 * @param {string} params.by           - email ผู้ทำ
 * @param {string} params.byName       - ชื่อผู้ทำ
 * @param {string} [params.fromStatus] - สถานะก่อนเปลี่ยน
 * @param {string} [params.toStatus]   - สถานะหลังเปลี่ยน
 * @param {string} [params.position]   - ตำแหน่งของ request
 * @param {string} [params.department] - แผนกของ request
 */
export async function logAudit({ requestId, action, by, byName, fromStatus, toStatus, position, department, note }) {
  try {
    await addDoc(collection(db, 'hc_logs'), {
      requestId,
      action,
      by,
      byName,
      fromStatus: fromStatus ?? null,
      toStatus:   toStatus   ?? null,
      position:   position   ?? '',
      department: department ?? '',
      note:       note       ?? '',
      timestamp: serverTimestamp(),
    })
  } catch (error) {
    console.error('[auditLog] failed:', error)
  }
}
