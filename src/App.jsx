import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './services/firebase'
import { fetchSheetsData, getDepartmentByEmail } from './services/sheetsData'
import { doc, getDoc, getDocs, addDoc, collection, onSnapshot, orderBy, query, setDoc, deleteDoc, updateDoc, deleteField, serverTimestamp, where } from 'firebase/firestore'
import { db } from './services/firebase'
import { FolderOpen, FileText, ExternalLink, Clock, Settings2, UserPlus, Trash2, Tag, Search, Plus } from 'lucide-react'
import { listJDFiles, getJDSignedUrl, deleteJDFile } from './services/supabase'

import Login from './components/Auth/Login'
import NavBar from './components/Shared/NavBar'
import ConfirmModal from './components/Shared/ConfirmModal'
import StatCards from './components/Dashboard/StatCards'
import RequestTable from './components/Dashboard/RequestTable'
import MonthlyPipeline from './components/Dashboard/MonthlyPipeline'
import HCRequestForm from './components/Forms/HCRequestForm'

const DEV_EMAIL = import.meta.env.VITE_DEV_EMAIL

// ─── Dev Tool: แสดงเฉพาะเมื่อมี VITE_DEV_EMAIL ใน .env (ใช้ test role/dept) ───
function RoleSwitcher({ currentRole, onSwitch, currentDept, onDeptSwitch }) {
  if (!DEV_EMAIL) return null
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 scale-90 sm:scale-100 origin-bottom-right">
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-2 shadow-2xl flex flex-col gap-1 ring-4 ring-emerald-500/10">
        <div className="px-3 py-1.5 border-b border-gray-50 dark:border-slate-800 mb-1 flex items-center gap-2">
          <Settings2 size={14} className="text-emerald-500" />
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Dev Switcher</span>
        </div>
        
        {/* Role Switch */}
        <div className="flex flex-col gap-1 mb-2 px-1">
          <span className="text-[9px] font-bold text-gray-400 uppercase ml-1 mb-0.5">Roles</span>
          <div className="flex gap-1">
            {['manager', 'ta', 'admin'].map((r) => (
              <button
                key={r}
                onClick={() => onSwitch(r)}
                className={`flex-1 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all uppercase tracking-tight ${
                  currentRole === r 
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30' 
                    : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-800'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Dept Override */}
        <div className="flex flex-col gap-1 px-1">
          <span className="text-[9px] font-bold text-gray-400 uppercase ml-1 mb-0.5">Dept Override</span>
          <input 
            type="text"
            value={currentDept}
            onChange={(e) => onDeptSwitch(e.target.value)}
            placeholder="Enter Dept..."
            className="w-full px-3 py-2 text-[11px] font-bold rounded-xl border border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
      </div>
    </div>
  )
}

// ─── Layout หลักที่ครอบทุกหน้า (NavBar + main content) ───
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

// ─── Guard: ป้องกันการเข้าหน้าที่ไม่มีสิทธิ์ → redirect ไปหน้าที่กำหนด ───
function RoleGuard({ role, allowed, children, redirectTo }) {
  if (!role) return null
  if (allowed.includes(role)) return children
  return <Navigate to={redirectTo} replace />
}

// ─── Pages ──────────────────────────────────────────────────────────────────
function DashboardPage({ user, role, department, isDarkMode, toggleDarkMode }) {
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

function FormPage({ user, role, isDarkMode, toggleDarkMode }) {
  return (
    <Layout user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 italic tracking-tight">ยื่นคำขออัตรากำลัง</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">กรอกข้อมูลให้ครบถ้วน แล้วกด "ยื่นคำขอ"</p>
        </div>
        <HCRequestForm user={user} role={role} />
      </div>
    </Layout>
  )
}

function MyRequestsPage({ user, role, department, isDarkMode, toggleDarkMode }) {
  return (
    <Layout user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 italic tracking-tight">คำขอของฉัน</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">คำขออัตรากำลังที่คุณยื่นทั้งหมด</p>
        </div>
        <RequestTable user={user} role={role} department={department} filterMine />
      </div>
    </Layout>
  )
}

function AllRequestsPage({ user, role, department, isDarkMode, toggleDarkMode }) {
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

function MyCasesPage({ user, role, department, isDarkMode, toggleDarkMode }) {
  return (
    <Layout user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 italic tracking-tight">เคสของฉัน</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">คำขอที่คุณรับเป็น TA ดูแลอยู่</p>
        </div>
        <RequestTable user={user} role={role} department={department} filterMyCases />
      </div>
    </Layout>
  )
}

// ─── Admin: จัดการ User Role (manager / ta / admin) ผ่าน Firestore users collection ───
function UserManagementPage({ user, role, isDarkMode, toggleDarkMode }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [emailInput, setEmailInput] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [roleSelect, setRoleSelect] = useState('manager')
  const [isBusy, setIsBusy] = useState(false)
  const [confirmState, setConfirmState] = useState({ isOpen: false, email: '' })
  const [pageError, setPageError] = useState('')

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => ({ email: d.id, ...d.data() })))
      setLoading(false)
    })
  }, [])

  async function handleAdd(e) {
    if (e) e.preventDefault()
    if (!emailInput) return
    setIsBusy(true)
    try {
      await setDoc(doc(db, 'users', emailInput.trim().toLowerCase()), {
        name: nameInput,
        role: roleSelect,
        updatedAt: new Date()
      })
      setEmailInput(''); setNameInput(''); setRoleSelect('manager')
    } catch (e) {
      setPageError('เพิ่มผู้ใช้ไม่สำเร็จ: ' + e.message)
      setTimeout(() => setPageError(''), 4000)
    }
    setIsBusy(false)
  }

  async function handleDelete(email) {
    try {
      await deleteDoc(doc(db, 'users', email))
    } catch (e) {
      setPageError('ลบผู้ใช้ไม่สำเร็จ: ' + e.message)
      setTimeout(() => setPageError(''), 4000)
    }
  }

  async function handleUpdateRole(email, newRole) {
    try {
      await setDoc(doc(db, 'users', email), { role: newRole }, { merge: true })
    } catch (e) {
      setPageError('อัพเดต role ไม่สำเร็จ: ' + e.message)
      setTimeout(() => setPageError(''), 4000)
    }
  }

  return (
    <Layout user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode}>
      <div className="flex flex-col gap-8">
        {pageError && (
          <div className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 rounded-2xl px-5 py-3 text-sm font-bold animate-in fade-in slide-in-from-top-2">
            {pageError}
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 italic tracking-tight">จัดการผู้ใช้</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">กำหนดบทบาท Admin, TA หรือ Manager ในระบบ</p>
        </div>

        {/* Add User Form */}
        <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 p-6 rounded-3xl shadow-xl shadow-gray-200/40 dark:shadow-none">
          <h2 className="text-sm font-black text-[#008065] dark:text-emerald-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <UserPlus size={16} /> กำหนด Role ใหม่
          </h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input 
              type="email" required placeholder="User Email (freshket.co)"
              value={emailInput} onChange={e => setEmailInput(e.target.value)}
              className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <input 
              type="text" placeholder="Full Name"
              value={nameInput} onChange={e => setNameInput(e.target.value)}
              className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <select 
              value={roleSelect} onChange={e => setRoleSelect(e.target.value)}
              className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="manager">Manager</option>
              <option value="ta">TA / People Experience</option>
              <option value="admin">Admin</option>
            </select>
            <button 
              type="submit" disabled={isBusy}
              className="bg-[#008065] text-white font-bold rounded-xl py-2 shadow-lg shadow-emerald-500/20 transition-all hover:bg-[#006651] disabled:opacity-50"
            >
              บันทึกสิทธิ์
            </button>
          </form>
        </div>

        {/* Users list */}
        <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl shadow-xl shadow-gray-200/40 dark:shadow-none overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#fcfdfd] dark:bg-slate-800/30 border-b border-gray-50 dark:border-slate-800/50">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">User</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Current Role</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800/50">
                {users.map(u => (
                  <tr key={u.email} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-gray-800 dark:text-gray-200">{u.name || '---'}</span>
                        <span className="text-xs text-gray-400 font-medium">{u.email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select 
                        value={u.role}
                        onChange={(e) => handleUpdateRole(u.email, e.target.value)}
                        className={`text-xs font-black px-3 py-1.5 rounded-full border border-gray-100 dark:border-slate-800 focus:outline-none transition-colors ${
                          u.role === 'admin' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' :
                          u.role === 'ta' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                          'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                        }`}
                      >
                        <option value="manager">Manager</option>
                        <option value="ta">TA</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => setConfirmState({ isOpen: true, email: u.email })}
                        className="p-2 text-gray-300 hover:text-red-500 transition-colors rounded-xl hover:bg-red-50 dark:hover:bg-red-950/20"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && !loading && (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-gray-400 font-medium italic">ไม่พบบทบาทผู้ใช้ในฐานข้อมูล</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <ConfirmModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState({ isOpen: false, email: '' })}
        onConfirm={async () => {
          await handleDelete(confirmState.email)
          setConfirmState({ isOpen: false, email: '' })
        }}
        title="ลบผู้ใช้ออกจากระบบ"
        message={confirmState.email ? `ต้องการลบผู้ใช้ ${confirmState.email} ใช่หรือไม่?` : ''}
        confirmText="ลบผู้ใช้"
        variant="danger"
      />
    </Layout>
  )
}

// ─── Admin/TA: คลังไฟล์ JD ทั้งหมดจาก Supabase Storage ───
// requestMap: index ด้วยทั้ง docId (ไฟล์ใหม่) และ tmp_* folder (ไฟล์เก่า)
function JDFilesPage({ user, role, isDarkMode, toggleDarkMode }) {
  const [files, setFiles] = useState([])
  const [requestMap, setRequestMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [deletingPath, setDeletingPath] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [confirmState, setConfirmState] = useState({ isOpen: false, file: null })

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await listJDFiles()
      if (cancelled) return

      try {
        const qReq = query(collection(db, 'hc_requests'))
        const snap = await getDocs(qReq)
        if (cancelled) return
        const map = {}
        snap.forEach(d => {
          const data = d.data()
          map[d.id] = data
          // index ด้วย folder จาก jdFilePath ด้วย (รองรับไฟล์เก่าที่ใช้ tmp_* folder)
          if (data.jdFilePath) {
            const folder = data.jdFilePath.split('/')[0]
            map[folder] = data
          }
        })
        setRequestMap(map)
      } catch (e) {
        console.error('[JDFilesPage] Error fetching request map:', e)
      }

      if (!cancelled) {
        setFiles(data)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function handleOpen(path) {
    const url = await getJDSignedUrl(path)
    if (url) window.open(url, '_blank')
  }

  async function handleDeleteFile(file) {
    if (!file?.path) return
    setDeletingPath(file.path)
    try {
      await deleteJDFile(file.path)

      // ล้าง reference ของไฟล์ JD ใน request ต้นทาง (ถ้ามี)
      if (file.folder) {
        await updateDoc(doc(db, 'hc_requests', file.folder), {
          jdFilePath: deleteField(),
          jdFileUrl: deleteField(),
          jdFileName: deleteField(),
        })
      }

      setFiles((prev) => prev.filter((f) => f.path !== file.path))
    } catch (e) {
      console.error('[JDFilesPage] Delete error:', e)
      setDeleteError('ลบไฟล์ไม่สำเร็จ กรุณาลองใหม่')
      setTimeout(() => setDeleteError(''), 4000)
    } finally {
      setDeletingPath('')
    }
  }

  function formatSize(bytes) {
    if (!bytes) return '—'
    const mb = bytes / (1024 * 1024)
    return mb < 0.1 ? `${(bytes / 1024).toFixed(1)} KB` : `${mb.toFixed(2)} MB`
  }

  return (
    <Layout user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode}>
      <div className="flex flex-col gap-6">
        <div className="animate-in fade-in slide-in-from-left-4 duration-500">
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 italic tracking-tight">JD Files</h1>
          <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 mt-0.5 uppercase tracking-widest">คลังข้อมูล Job Description ที่อัปโหลดเข้าระบบ</p>
        </div>

        {deleteError && (
          <div className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 rounded-2xl px-5 py-3 text-sm font-bold animate-in fade-in slide-in-from-top-2">
            {deleteError}
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-gray-400 animate-pulse">กำลังดึงข้อมูลไฟล์...</div>
        ) : files.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-gray-100 dark:border-slate-800 p-24 flex flex-col items-center gap-6 text-center shadow-xl shadow-emerald-900/5 transition-all group">
            <div className="w-24 h-24 rounded-[2rem] bg-emerald-50 dark:bg-emerald-500/5 flex items-center justify-center text-emerald-600 dark:text-emerald-500 transition-transform group-hover:scale-110 duration-500">
              <FolderOpen size={48} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100 tracking-tight">คลังไฟล์ JD ยังว่างอยู่</p>
              <p className="text-xs font-bold text-gray-400 dark:text-slate-500 mt-2 uppercase tracking-widest">ยังไม่มีการอัปโหลดไฟล์ JD เข้าระบบในขณะนี้</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {files.map((file) => {
              const req = requestMap[file.folder]
              // Clean up file name (remove timestamp_ prefix if exists)
              const displayName = file.name.includes('_') 
                ? file.name.split('_').slice(1).join('_') 
                : file.name

              return (
                <div 
                  key={file.path}
                  onClick={() => handleOpen(file.path)}
                  className="group relative bg-white dark:bg-slate-900 p-5 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm hover:shadow-xl hover:shadow-emerald-900/5 transition-all cursor-pointer overflow-hidden"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-500 shrink-0 group-hover:scale-110 transition-transform">
                      <FileText size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black text-emerald-600 dark:text-emerald-500 uppercase tracking-widest mb-1 truncate">
                        {req ? `${req.position} (${req.department})` : file.folder.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate mb-2">
                        {displayName}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          <Clock size={12} className="shrink-0" />
                          {new Date(file.created_at).toLocaleDateString('th-TH')}
                        </div>
                        <div className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">
                          {formatSize(file.metadata?.size)}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ExternalLink size={16} className="text-gray-300" />
                    {role === 'admin' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmState({ isOpen: true, file })
                        }}
                        disabled={deletingPath === file.path}
                        className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                        title="ลบไฟล์ JD"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <ConfirmModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState({ isOpen: false, file: null })}
        onConfirm={async () => {
          await handleDeleteFile(confirmState.file)
          setConfirmState({ isOpen: false, file: null })
        }}
        title="ลบไฟล์ JD ออกจากระบบ"
        message={confirmState.file ? `ต้องการลบไฟล์ ${confirmState.file.name} ใช่หรือไม่?` : ''}
        confirmText="ลบไฟล์"
        variant="danger"
      />
    </Layout>
  )
}

const STATUS_CONFIG = {
  Submit: { label: 'ยื่นคำขอ', bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-500/20' },
  Assign: { label: 'รับเคส', bg: 'bg-purple-50 dark:bg-purple-500/10', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-500/20' },
  StatusChange: { label: 'เปลี่ยนสถานะ', bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-500/20' },
  Cancel: { label: 'ยกเลิก', bg: 'bg-rose-50 dark:bg-rose-500/10', text: 'text-rose-700 dark:text-rose-400', border: 'border-rose-200 dark:border-rose-500/20' },
}

// ─── Admin: ประวัติการเปลี่ยนแปลงทั้งหมด (hc_logs Firestore collection) ───
function AuditLogPage({ user, role, isDarkMode, toggleDarkMode }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingLogId, setDeletingLogId] = useState('')
  const [confirmState, setConfirmState] = useState({ isOpen: false, logId: '' })
  const [logError, setLogError] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'hc_logs'), orderBy('timestamp', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  async function handleDeleteLog(logId) {
    if (!logId) return
    setDeletingLogId(logId)
    try {
      await deleteDoc(doc(db, 'hc_logs', logId))
      setLogs((prev) => prev.filter((log) => log.id !== logId))
    } catch (e) {
      console.error('Delete log error:', e)
      setLogError('ลบ log ไม่สำเร็จ กรุณาลองใหม่')
      setTimeout(() => setLogError(''), 4000)
    } finally {
      setDeletingLogId('')
    }
  }

  return (
    <Layout user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 italic tracking-tight">Audit Log</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">ประวัติการเปลี่ยนแปลงทั้งหมดในระบบ</p>
        </div>

        {logError && (
          <div className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 rounded-2xl px-5 py-3 text-sm font-bold animate-in fade-in slide-in-from-top-2">
            {logError}
          </div>
        )}

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
                  {role === 'admin' && (
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-right">จัดการ</th>
                  )}
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
                      {role === 'admin' && (
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={() => setConfirmState({ isOpen: true, logId: log.id })}
                            disabled={deletingLogId === log.id}
                            className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                            title="ลบ log นี้"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ConfirmModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState({ isOpen: false, logId: '' })}
        onConfirm={async () => {
          await handleDeleteLog(confirmState.logId)
          setConfirmState({ isOpen: false, logId: '' })
        }}
        title="ลบ Audit Log"
        message="ต้องการลบ log รายการนี้ใช่หรือไม่?"
        confirmText="ลบ Log"
        variant="danger"
      />
    </Layout>
  )
}

// ─── Admin: จัดการตำแหน่งที่ถูก custom เพิ่มเข้ามา (ไม่มีใน Google Sheets) ───
function CustomPositionsPage({ user, role, isDarkMode, toggleDarkMode }) {
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [confirmState, setConfirmState] = useState({ isOpen: false, id: '' })
  const [pageError, setPageError] = useState('')
  const [addForm, setAddForm] = useState({ department: '', orgTrack: 'HQ', position: '' })
  const [isAdding, setIsAdding] = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'custom_positions'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setPositions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  async function handleDelete(id) {
    setDeletingId(id)
    try {
      await deleteDoc(doc(db, 'custom_positions', id))
    } catch (e) {
      setPageError('ลบ position ไม่สำเร็จ: ' + e.message)
      setTimeout(() => setPageError(''), 4000)
    } finally {
      setDeletingId('')
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!addForm.department.trim() || !addForm.position.trim()) return
    setIsAdding(true)
    try {
      await addDoc(collection(db, 'custom_positions'), {
        department: addForm.department.trim(),
        orgTrack: addForm.orgTrack,
        position: addForm.position.trim(),
        normalizedPosition: addForm.position.trim().toLowerCase(),
        createdBy: user.email,
        createdAt: serverTimestamp(),
      })
      setAddForm({ department: '', orgTrack: 'HQ', position: '' })
    } catch (e) {
      setPageError('เพิ่ม position ไม่สำเร็จ: ' + e.message)
      setTimeout(() => setPageError(''), 4000)
    }
    setIsAdding(false)
  }

  const depts = [...new Set(positions.map(p => p.department))].sort()
  const filtered = positions.filter(p =>
    (!deptFilter || p.department === deptFilter) &&
    (!search || p.position.toLowerCase().includes(search.toLowerCase()) || p.department.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <Layout user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 italic tracking-tight">Custom Positions</h1>
          <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 mt-0.5 uppercase tracking-widest">ตำแหน่งที่สร้างเพิ่มเติมโดยผู้ใช้งาน</p>
        </div>

        {pageError && (
          <div className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 rounded-2xl px-5 py-3 text-sm font-bold animate-in fade-in slide-in-from-top-2">
            {pageError}
          </div>
        )}

        {/* Add form */}
        <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 p-6 rounded-3xl shadow-xl shadow-gray-200/40 dark:shadow-none">
          <h2 className="text-sm font-black text-[#008065] dark:text-emerald-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Plus size={16} /> เพิ่ม Position ใหม่
          </h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input
              type="text" placeholder="ชื่อแผนก"
              value={addForm.department} onChange={e => setAddForm(f => ({ ...f, department: e.target.value }))}
              className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <select
              value={addForm.orgTrack} onChange={e => setAddForm(f => ({ ...f, orgTrack: e.target.value }))}
              className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="HQ">HQ</option>
              <option value="OPERATION">OPERATION</option>
            </select>
            <input
              type="text" placeholder="ชื่อตำแหน่ง" required
              value={addForm.position} onChange={e => setAddForm(f => ({ ...f, position: e.target.value }))}
              className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <button
              type="submit" disabled={isAdding}
              className="bg-[#008065] text-white font-bold rounded-xl py-2 shadow-lg shadow-emerald-500/20 transition-all hover:bg-[#006651] disabled:opacity-50"
            >
              เพิ่ม
            </button>
          </form>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" placeholder="ค้นหา position หรือ แผนก..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <select
            value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
            className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">ทุกแผนก</option>
            {depts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400 animate-pulse">กำลังดึงข้อมูล...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 p-20 flex flex-col items-center gap-4 text-center shadow-xl shadow-gray-200/40 dark:shadow-none">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-500/5 flex items-center justify-center text-emerald-500"><Tag size={32} /></div>
            <p className="text-sm font-bold text-gray-500 dark:text-slate-400">ไม่พบตำแหน่งที่ตรงกัน</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl shadow-xl shadow-gray-200/40 dark:shadow-none overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#fcfdfd] dark:bg-slate-800/30 border-b border-gray-50 dark:border-slate-800/50">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">ตำแหน่ง</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">แผนก</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Track</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">สร้างโดย</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">วันที่</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800/50">
                  {filtered.map(pos => (
                    <tr key={pos.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="px-6 py-4 text-sm font-bold text-gray-800 dark:text-gray-100">{pos.position}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400">{pos.department}</td>
                      <td className="px-6 py-4">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 uppercase">{pos.orgTrack || '—'}</span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-400 dark:text-slate-500">{pos.createdBy}</td>
                      <td className="px-6 py-4 text-xs text-gray-400 dark:text-slate-500">{pos.createdAt?.toDate?.().toLocaleDateString('th-TH') || '—'}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setConfirmState({ isOpen: true, id: pos.id })}
                          disabled={deletingId === pos.id}
                          className="p-2 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                        >
                          {deletingId === pos.id ? <Settings2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 border-t border-gray-50 dark:border-slate-800/50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              {filtered.length} รายการ
            </div>
          </div>
        )}

        <ConfirmModal
          isOpen={confirmState.isOpen}
          onClose={() => setConfirmState({ isOpen: false, id: '' })}
          onConfirm={async () => {
            await handleDelete(confirmState.id)
            setConfirmState({ isOpen: false, id: '' })
          }}
          title="ลบ Custom Position"
          message="ต้องการลบตำแหน่งนี้ออกจากระบบใช่หรือไม่?"
          confirmText="ลบ"
          variant="danger"
        />
      </div>
    </Layout>
  )
}

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

  // ─── ตรวจสอบสถานะ login และดึง role ของ user จาก Firestore ───
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        const userEmail = firebaseUser.email?.trim().toLowerCase()
        try {
          const userRef = doc(db, 'users', userEmail)
          const userDoc = await getDoc(userRef)
          
          const { managers } = await fetchSheetsData()
          const sheetDept = getDepartmentByEmail(managers, userEmail)
          setDepartment(sheetDept || '')

          if (userDoc.exists()) {
            setRole(userDoc.data().role)
          } else {
            setRole(sheetDept ? 'manager' : 'ta')
          }
        } catch (error) {
          console.error('[App] Error fetching role:', error)
          setRole('manager')
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

  const defaultRoute = role === 'manager' ? '/my-requests' : '/dashboard'
  const pageProps = { user, role, department, isDarkMode, toggleDarkMode }

  return (
    <>
      <Routes>
        <Route
          path="/request"
          element={
            <RoleGuard role={role} allowed={['manager', 'admin']} redirectTo="/dashboard">
              <FormPage {...pageProps} />
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
    </>
  )
}
