import { useEffect, useState, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db } from './services/firebase'
import { fetchSheetsData, getDepartmentByEmail } from './services/sheetsData'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { PowerOff, Power } from 'lucide-react'
import { sendMaintenanceAlert } from './services/webhook'

import Login from './components/Auth/Login'

// นำเข้า Shared Components
import { RoleSwitcher, RoleGuard, MaintenancePage } from './components/Shared/AppHelpers'

// นำเข้า Pages
import DashboardPage from './pages/DashboardPage'
import FormPage from './pages/FormPage'
import MyRequestsPage from './pages/MyRequestsPage'
import AllRequestsPage from './pages/AllRequestsPage'
import MyCasesPage from './pages/MyCasesPage'
import UserManagementPage from './pages/UserManagementPage'
import JDFilesPage from './pages/JDFilesPage'
import AuditLogPage from './pages/AuditLogPage'
import CustomPositionsPage from './pages/CustomPositionsPage'
import AdminToolsPage from './pages/AdminToolsPage'

// Lazy load
const ImportPage = lazy(() => import('./components/Admin/ImportPage'))

const DEV_EMAIL = import.meta.env.VITE_DEV_EMAIL

// ─── Root App ────────────────────────────────────────────────────────────────
// Auth flow: Firebase onAuthStateChanged → ดึง role จาก Firestore users collection
// Dark mode: เก็บใน localStorage → ใส่ class 'dark' ที่ <html> element
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [role, setRole] = useState(null)
  const [department, setDepartment] = useState('')
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark'
  })
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState('')
  const [togglingMaintenance, setTogglingMaintenance] = useState(false)

  // ─── Sync dark mode กับ localStorage และ class ที่ html element ───
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

  // ─── อ่านสถานะ maintenance ครั้งเดียว (ไม่ต้อง realtime) ───
  useEffect(() => {
    getDoc(doc(db, 'settings', 'maintenance'))
      .then((snap) => {
        if (snap.exists()) {
          setMaintenanceMode(snap.data().active ?? false)
          setMaintenanceMessage(snap.data().message ?? '')
        }
      })
      .catch((e) => console.error('[App] maintenance fetch failed:', e))
  }, [])

  // Admin: toggle maintenance mode → เขียน Firestore + แจ้ง Slack
  async function toggleMaintenance() {
    if (togglingMaintenance) return
    setTogglingMaintenance(true)
    const next = !maintenanceMode
    try {
      await setDoc(doc(db, 'settings', 'maintenance'), {
        active: next,
        message: next ? 'กำลังดำเนินการปรับปรุงระบบ กรุณารอสักครู่' : '',
        updatedAt: serverTimestamp(),
        updatedBy: user?.email,
      })
      await sendMaintenanceAlert(next)
      setMaintenanceMode(next)
      setMaintenanceMessage(next ? 'กำลังดำเนินการปรับปรุงระบบ กรุณารอสักครู่' : '')
    } catch (e) {
      console.error('[toggleMaintenance] error:', e)
    }
    setTogglingMaintenance(false)
  }

  // ─── ตรวจสอบสถานะ login และดึง role ของ user จาก Firestore ───
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        const userEmail = firebaseUser.email?.trim().toLowerCase()
        try {
          const userRef = doc(db, 'users', userEmail)
          const [userDoc, { managers }] = await Promise.all([
            getDoc(userRef),
            fetchSheetsData(),
          ])

          const sheetDept = getDepartmentByEmail(managers, userEmail)
          setDepartment(sheetDept || '')

          if (userDoc.exists()) {
            setRole(userDoc.data().role)
          } else {
            setRole(sheetDept ? 'manager' : 'ta')
          }
        } catch (error) {
          console.error('[App] Error fetching role:', error)
          setRole('ta')
        }
      } else {
        setUser(null)
        setRole(null)
        setDepartment('')
      }
      setAuthLoading(false)
    })
    return () => unsubscribe()
  }, [])

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f7f6] dark:bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#008065]" />
      </div>
    )
  }

  if (!user) return <Login />

  // แสดงหน้า maintenance ให้ non-admin เมื่อระบบปิดปรับปรุง
  if (maintenanceMode && role !== 'admin') {
    return <MaintenancePage message={maintenanceMessage} />
  }

  const defaultRoute = role === 'manager' ? '/my-requests' : '/dashboard'
  const pageProps = { user, role, department, isDarkMode, toggleDarkMode }

  return (
    <>
      <Routes>
        <Route
          path="/request"
          element={
            <RoleGuard role={role} allowed={['manager', 'admin']} redirectTo="/dashboard">
              <FormPage {...pageProps} maintenanceMode={maintenanceMode} />
            </RoleGuard>
          }
        />
        <Route path="/my-requests" element={<MyRequestsPage {...pageProps} />} />
        <Route
          path="/jd-files"
          element={
            <RoleGuard role={role} allowed={['ta', 'admin']} redirectTo={defaultRoute}>
              <JDFilesPage {...pageProps} />
            </RoleGuard>
          }
        />

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
        <Route
          path="/users"
          element={
            <RoleGuard role={role} allowed={['admin']} redirectTo="/dashboard">
              <UserManagementPage {...pageProps} />
            </RoleGuard>
          }
        />
        <Route
          path="/custom-positions"
          element={
            <RoleGuard role={role} allowed={['admin']} redirectTo="/dashboard">
              <CustomPositionsPage {...pageProps} />
            </RoleGuard>
          }
        />

        <Route
          path="/admin-tools"
          element={
            <RoleGuard role={role} allowed={['admin']} redirectTo="/dashboard">
              <AdminToolsPage {...pageProps} />
            </RoleGuard>
          }
        />
        <Route
          path="/import"
          element={
            <RoleGuard role={role} allowed={['admin']} redirectTo="/dashboard">
              <ImportPage {...pageProps} />
            </RoleGuard>
          }
        />

        <Route path="*" element={<Navigate to={defaultRoute} replace />} />
      </Routes>

      {user?.email === DEV_EMAIL && (
        <RoleSwitcher
          currentRole={role}
          onSwitch={setRole}
          currentDept={department}
          onDeptSwitch={setDepartment}
        />
      )}

      {/* Admin: ปุ่มเปิด/ปิดระบบ — แสดงเฉพาะ admin */}
      {role === 'admin' && (
        <div className="fixed bottom-6 left-6 z-[100]">
          <button
            onClick={toggleMaintenance}
            disabled={togglingMaintenance}
            title={maintenanceMode ? 'เปิดระบบ' : 'ปิดระบบเพื่อปรับปรุง'}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold shadow-xl transition-all disabled:opacity-50 ${
              maintenanceMode
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/30'
                : 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/30'
            }`}
          >
            {maintenanceMode ? <Power size={15} /> : <PowerOff size={15} />}
            {togglingMaintenance ? 'กำลังดำเนินการ...' : maintenanceMode ? 'เปิดระบบ' : 'ปิดระบบ'}
          </button>
          {maintenanceMode && (
            <p className="text-[10px] text-orange-500 font-bold mt-1.5 text-center">ระบบปิดอยู่</p>
          )}
        </div>
      )}
    </>
  )
}
