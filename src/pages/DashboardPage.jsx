import Layout from '../components/Shared/Layout'
import StatCards from '../components/Dashboard/StatCards'
import RequestTable from '../components/Dashboard/RequestTable'
import MonthlyPipeline from '../components/Dashboard/MonthlyPipeline'
import { useState } from 'react'

export default function DashboardPage({ user, role, department, isDarkMode, toggleDarkMode }) {
  const [stats, setStats] = useState({ open: 0, assigned: 0, closed: 0, total: 0 })
  const [requests, setRequests] = useState([])

  function handleStatsChange(newStats, allRequests) {
    setStats(newStats)
    if (allRequests) setRequests(allRequests)
  }

  return (
    <Layout user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 italic tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">ภาพรวมคำขออัตรากำลังทั้งหมด</p>
        </div>
        <StatCards stats={stats} />
        <RequestTable user={user} role={role} department={department} onStatsChange={handleStatsChange} />
        <MonthlyPipeline requests={requests} />
      </div>
    </Layout>
  )
}
