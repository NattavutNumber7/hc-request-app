/**
 * AllRequestsPage.jsx — All HC requests overview (TA / Admin only)
 * ─────────────────────────────────────────────────────────────────────────────
 * หน้าแสดงคำขออัตรากำลังทั้งหมดในระบบ สำหรับ TA และ Admin เท่านั้น
 * ใช้ RequestTable พร้อม showFilters=true เพื่อให้กรองและค้นหาข้อมูลได้
 *
 * Sync from Sheets:
 *   ปุ่ม "Sync Sheets" เรียก GAS ?action=syncFromSheets เพื่อดึงข้อมูล
 *   Status / PIC / Candidate ที่ TA แก้ไขใน Google Sheets กลับมายัง Firestore
 *   (ใช้เมื่อ onSheetEdit trigger ไม่ทำงาน หรือต้องการ sync ด้วยตนเอง)
 *
 * Props:
 *   user          {object}   Firebase user object ของผู้ใช้ที่ login อยู่
 *   role          {string}   role ของผู้ใช้ ('ta' | 'admin')
 *   department    {string}   แผนกของผู้ใช้
 *   isDarkMode    {boolean}  สถานะ dark mode
 *   toggleDarkMode {function} toggle dark/light mode
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from 'react'
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import Layout from '../components/Shared/Layout'
import RequestTable from '../components/Dashboard/RequestTable'
import { syncFromSheets } from '../services/webhook'

export default function AllRequestsPage({ user, role, department, isDarkMode, toggleDarkMode }) {
  // 'idle' | 'running' | 'done' | 'error'
  const [syncState,  setSyncState]  = useState('idle')
  const [syncResult, setSyncResult] = useState(null)

  async function handleSyncSheets() {
    if (syncState === 'running') return
    setSyncState('running')
    setSyncResult(null)
    try {
      const res = await syncFromSheets()
      if (res.success) {
        setSyncResult(`Synced ${res.synced} / ${res.total} rows`)
        setSyncState('done')
      } else {
        setSyncResult(res.error || 'Sync failed')
        setSyncState('error')
      }
    } catch (err) {
      setSyncResult(err.message)
      setSyncState('error')
    }
    // reset กลับ idle หลัง 5 วินาที
    setTimeout(() => { setSyncState('idle'); setSyncResult(null) }, 5000)
  }

  return (
    <Layout user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode}>
      <div className="flex flex-col gap-6">
        {/* ─── Header ─── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 italic tracking-tight">คำขอทั้งหมด</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">รายการคำขออัตรากำลังทั้งหมดในระบบ</p>
          </div>

          {/* Sync from Sheets button — visible to both ta and admin */}
          <button
            onClick={handleSyncSheets}
            disabled={syncState === 'running'}
            className={`
              flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black
              border transition-all shrink-0
              ${syncState === 'done'
                ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                : syncState === 'error'
                  ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400'
                  : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:border-emerald-300 dark:hover:border-emerald-500/40 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/5 shadow-sm'
              }
            `}
            title="Sync ข้อมูล Status/PIC จาก Google Sheets กลับมา Firestore"
          >
            {syncState === 'running' ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : syncState === 'done' ? (
              <CheckCircle2 size={13} />
            ) : syncState === 'error' ? (
              <AlertCircle size={13} />
            ) : (
              <RefreshCw size={13} />
            )}
            <span>
              {syncState === 'running' ? 'กำลัง Sync...'
                : syncState === 'done'    ? syncResult
                : syncState === 'error'   ? (syncResult || 'Error')
                : 'Sync Sheets'}
            </span>
          </button>
        </div>

        {/* showFilters=true เปิด filter bar ให้กรองตาม status, แผนก, ช่วงวันที่ ฯลฯ */}
        <RequestTable user={user} role={role} department={department} showFilters />
      </div>
    </Layout>
  )
}
