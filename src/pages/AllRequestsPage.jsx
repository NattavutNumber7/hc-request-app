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
        <RequestTable user={user} role={role} department={department} showFilters />
      </div>
    </Layout>
  )
}
