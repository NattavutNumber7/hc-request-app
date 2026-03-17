import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './services/firebase'
import { fetchSheetsData, getDepartmentByEmail } from './services/sheetsData'
import { doc, getDoc, collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from './services/firebase'
import { FolderOpen, ClipboardList } from 'lucide-react'

import Login from './components/Auth/Login'
import NavBar from './components/Shared/NavBar'
import StatCards from './components/Dashboard/StatCards'
import RequestTable from './components/Dashboard/RequestTable'
import MonthlyPipeline from './components/Dashboard/MonthlyPipeline'
import HCRequestForm from './components/Forms/HCRequestForm'

function Layout({ user, role, isDarkMode, toggleDarkMode, children }) {
  return (
    <div className="min-h-screen flex flex-col transition-colors duration-300 bg-[#f5f7f6] dark:bg-slate-950">
      <NavBar user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode} />
      <main className="flex-1 px-6 py-7 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  )
}

// Protected Route Wrapper
function RoleGuard({ role, allowed, children, redirectTo }) {
  if (!role) return null
  if (allowed.includes(role)) return children
  return <Navigate to={redirectTo} replace />
}

function DashboardPage({ user, role, isDarkMode, toggleDarkMode }) {
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
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 italic tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">ภาพรวมคำขออัตรากำลังทั้งหมด</p>
        </div>
        <StatCards stats={stats} />
        <RequestTable user={user} role={role} onStatsChange={handleStatsChange} />
        <MonthlyPipeline requests={requests} />
      </div>
    </Layout>
  )
}

function FormPage({ user, role, isDarkMode, toggleDarkMode }) {
  return (
    <Layout user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 italic tracking-tight">ยื่นคำขออัตรากำลัง</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">กรอกข้อมูลให้ครบถ้วน แล้วกด "ยื่นคำขอ"</p>
        </div>
        <HCRequestForm user={user} role={role} />
      </div>
    </Layout>
  )
}

function MyRequestsPage({ user, role, isDarkMode, toggleDarkMode }) {
  return (
    <Layout user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 italic tracking-tight">คำขอของฉัน</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">คำขออัตรากำลังที่คุณยื่นทั้งหมด</p>
        </div>
        <RequestTable user={user} role={role} filterMine />
      </div>
    </Layout>
  )
}

function AllRequestsPage({ user, role, isDarkMode, toggleDarkMode }) {
  return (
    <Layout user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 italic tracking-tight">คำขอทั้งหมด</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">รายการคำขออัตรากำลังทั้งหมดในระบบ</p>
        </div>
        <RequestTable user={user} role={role} showFilters />
      </div>
    </Layout>
  )
}

function MyCasesPage({ user, role, isDarkMode, toggleDarkMode }) {
  return (
    <Layout user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 italic tracking-tight">เคสของฉัน</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">คำขอที่คุณรับเป็น TA ดูแลอยู่</p>
        </div>
        <RequestTable user={user} role={role} filterMyCases />
      </div>
    </Layout>
  )
}

function JDFilesPage({ user, role, isDarkMode, toggleDarkMode }) {
  return (
    <Layout user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode}>
      <div className="flex flex-col gap-6">
        <div className="animate-in fade-in slide-in-from-left-4 duration-500">
          <h1 className="text-3xl font-black text-gray-800 dark:text-gray-100 italic tracking-tight">JD Files</h1>
          <p className="text-sm font-bold text-gray-400 dark:text-slate-500 mt-1 uppercase tracking-widest">Repository of Job Descriptions</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-gray-100 dark:border-slate-800 p-24 flex flex-col items-center gap-6 text-center shadow-xl shadow-emerald-900/5 transition-all group">
          <div className="w-24 h-24 rounded-[2rem] bg-emerald-50 dark:bg-emerald-500/5 flex items-center justify-center text-emerald-600 dark:text-emerald-500 transition-transform group-hover:scale-110 duration-500">
            <FolderOpen size={48} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-xl font-black text-gray-800 dark:text-gray-100 tracking-tight">คลังไฟล์ JD ยังว่างอยู่</p>
            <p className="text-sm font-bold text-gray-400 dark:text-slate-500 mt-2 uppercase tracking-widest">Coming soon: Centralized JD Management</p>
          </div>
        </div>
      </div>
    </Layout>
  )
}

const STATUS_CONFIG = {
  Submit: { label: 'ยื่นคำขอ', bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-500/20' },
  Assign: { label: 'รับเคส', bg: 'bg-purple-50 dark:bg-purple-500/10', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-500/20' },
  StatusChange: { label: 'เปลี่ยนสถานะ', bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-500/20' },
  Cancel: { label: 'ยกเลิก', bg: 'bg-rose-50 dark:bg-rose-500/10', text: 'text-rose-700 dark:text-rose-400', border: 'border-rose-200 dark:border-rose-500/20' },
}

function AuditLogPage({ user, role, isDarkMode, toggleDarkMode }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'hc_logs'), orderBy('timestamp', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  return (
    <Layout user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 italic tracking-tight">Audit Log</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">ประวัติการเปลี่ยนแปลงทั้งหมดในระบบ</p>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">กำลังโหลด...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-20 text-gray-400">ยังไม่มีประวัติ</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-800/50">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-left">เวลา</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-left">Request ID</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-left">ตำแหน่ง / แผนก</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-left">Action</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-left">จาก → ไป</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-left">โดย</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                {logs.map((log) => {
                  const config = STATUS_CONFIG[log.action] || { label: log.action, bg: 'bg-gray-100 dark:bg-slate-800', text: 'text-gray-600 dark:text-slate-400', border: 'border-gray-200 dark:border-slate-700' }
                  return (
                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors group">
                      <td className="px-5 py-4 text-gray-400 dark:text-slate-500 text-[10px] font-black uppercase tracking-tighter whitespace-nowrap">
                        {log.timestamp?.toDate?.().toLocaleString('th-TH') ?? '—'}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-[10px] font-bold text-gray-400 dark:text-slate-600 bg-gray-50 dark:bg-slate-950 px-2 py-1 rounded-md border border-gray-100 dark:border-slate-800">
                          {log.requestId?.slice(0, 8).toUpperCase() ?? '—'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-black text-gray-800 dark:text-gray-200 tracking-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{log.position || '—'}</p>
                        {log.department && <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">{log.department}</p>}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${config.bg} ${config.text} ${config.border}`}>
                          {config.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-[11px] font-bold text-gray-500 dark:text-slate-400">
                        {log.fromStatus && log.toStatus
                          ? <div className="flex items-center gap-2">
                            {log.fromStatus} <span className="text-gray-300 dark:text-slate-700">→</span> <span className="text-emerald-600 dark:text-emerald-500">{log.toStatus}</span>
                          </div>
                          : log.toStatus ? <span className="text-emerald-600 dark:text-emerald-500">{log.toStatus}</span> : '—'}
                      </td>
                      <td className="px-5 py-4 text-xs font-bold text-gray-600 dark:text-slate-400">{log.byName ?? log.by ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  )
}

export default function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [role, setRole] = useState(null) // 'manager' | 'ta'
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark'
  })

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDarkMode])

  const toggleDarkMode = () => {
    setIsDarkMode(prev => {
      const newVal = !prev
      localStorage.setItem('theme', newVal ? 'dark' : 'light')
      return newVal
    })
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // ... same auth logic ...
      if (firebaseUser) {
        setUser(firebaseUser)
        const userEmail = firebaseUser.email?.trim().toLowerCase()
        try {
          const userRef = doc(db, 'users', userEmail)
          const userDoc = await getDoc(userRef)
          if (userDoc.exists()) {
            setRole(userDoc.data().role)
          } else {
            const { managers } = await fetchSheetsData()
            const dept = getDepartmentByEmail(managers, userEmail)
            setRole(dept ? 'manager' : 'ta')
          }
        } catch (error) {
          console.error('DEBUG: Error fetching role:', error)
          setRole('manager')
        }
      } else {
        setUser(null)
        setRole(null)
      }
      setAuthLoading(false)
    })
    return () => unsubscribe()
  }, [])

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f7f6] dark:bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#008065' }} />
      </div>
    )
  }

  if (!user) return <Login />

  const defaultRoute = role === 'manager' ? '/my-requests' : '/dashboard'
  const pageProps = { user, role, isDarkMode, toggleDarkMode }

  return (
    <Routes>
      <Route path="/request" element={<FormPage {...pageProps} />} />
      <Route path="/my-requests" element={<MyRequestsPage {...pageProps} />} />
      <Route path="/jd-files" element={<JDFilesPage {...pageProps} />} />

      {/* TA/PE & Admin Only Routes */}
      <Route
        path="/dashboard"
        element={
          <RoleGuard role={role} allowed={['ta', 'admin']} redirectTo="/my-requests">
            <DashboardPage {...pageProps} />
          </RoleGuard>
        }
      />
      <Route
        path="/all-requests"
        element={
          <RoleGuard role={role} allowed={['ta', 'admin']} redirectTo="/my-requests">
            <AllRequestsPage {...pageProps} />
          </RoleGuard>
        }
      />
      <Route
        path="/my-cases"
        element={
          <RoleGuard role={role} allowed={['ta', 'admin']} redirectTo="/my-requests">
            <MyCasesPage {...pageProps} />
          </RoleGuard>
        }
      />
      <Route
        path="/audit-log"
        element={
          <RoleGuard role={role} allowed={['ta', 'admin']} redirectTo="/my-requests">
            <AuditLogPage {...pageProps} />
          </RoleGuard>
        }
      />

      <Route path="*" element={<Navigate to={defaultRoute} replace />} />
    </Routes>
  )
}
