import { lazy, Suspense } from 'react'
import Layout from '../components/Shared/Layout'

const HCRequestForm = lazy(() => import('../components/Forms/HCRequestForm'))

export default function FormPage({ user, role, isDarkMode, toggleDarkMode, maintenanceMode }) {
  return (
    <Layout user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 italic tracking-tight">ยื่นคำขออัตรากำลัง</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">กรอกข้อมูลให้ครบถ้วน แล้วกด "ยื่นคำขอ"</p>
          {maintenanceMode && (
            <p className="text-xs text-orange-500 font-bold mt-1">⚠️ ระบบปิดปรับปรุง — คำขอจะถูกบันทึกแต่ไม่แจ้ง Slack</p>
          )}
        </div>
        <Suspense fallback={<div className="flex items-center justify-center py-20 text-gray-400 text-sm">กำลังโหลดฟอร์ม...</div>}>
          <HCRequestForm user={user} role={role} maintenanceMode={maintenanceMode} />
        </Suspense>
      </div>
    </Layout>
  )
}
