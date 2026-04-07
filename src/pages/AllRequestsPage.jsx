/**
 * AllRequestsPage.jsx — All HC requests overview (TA / Admin only)
 * ─────────────────────────────────────────────────────────────────────────────
 * หน้าแสดงคำขออัตรากำลังทั้งหมดในระบบ สำหรับ TA และ Admin เท่านั้น
 * ใช้ RequestTable พร้อม showFilters=true เพื่อให้กรองและค้นหาข้อมูลได้
 *
 * Props:
 *   user          {object}   Firebase user object ของผู้ใช้ที่ login อยู่
 *   role          {string}   role ของผู้ใช้ ('ta' | 'admin')
 *   department    {string}   แผนกของผู้ใช้
 *   isDarkMode    {boolean}  สถานะ dark mode
 *   toggleDarkMode {function} toggle dark/light mode
 * ─────────────────────────────────────────────────────────────────────────────
 */
import Layout from '../components/Shared/Layout'
import RequestTable from '../components/Dashboard/RequestTable'

export default function AllRequestsPage({ user, role, department, isDarkMode, toggleDarkMode }) {
  return (
    <Layout user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 italic tracking-tight">คำขอทั้งหมด</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">รายการคำขออัตรากำลังทั้งหมดในระบบ</p>
        </div>
        {/* showFilters=true เปิด filter bar ให้กรองตาม status, แผนก, ช่วงวันที่ ฯลฯ */}
        <RequestTable user={user} role={role} department={department} showFilters />
      </div>
    </Layout>
  )
}
