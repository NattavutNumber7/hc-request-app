import { useEffect, useState } from 'react'
import { doc, onSnapshot, collection, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../services/firebase'
import { UserPlus, Trash2 } from 'lucide-react'
import Layout from '../components/Shared/Layout'
import ConfirmModal from '../components/Shared/ConfirmModal'

const VALID_ROLES = ['manager', 'ta', 'admin']

export default function UserManagementPage({ user, role, isDarkMode, toggleDarkMode }) {
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
    const email = emailInput.trim().toLowerCase()
    if (!email) return
    if (!email.endsWith('@freshket.co')) {
      setPageError('อนุญาตเฉพาะ email @freshket.co เท่านั้น')
      setTimeout(() => setPageError(''), 4000)
      return
    }
    if (!VALID_ROLES.includes(roleSelect)) {
      setPageError('Role ไม่ถูกต้อง')
      setTimeout(() => setPageError(''), 4000)
      return
    }
    setIsBusy(true)
    try {
      await setDoc(doc(db, 'users', email), {
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
    if (!VALID_ROLES.includes(newRole)) return
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
              id="user-email" name="user-email"
              type="email" required placeholder="User Email (freshket.co)"
              value={emailInput} onChange={e => setEmailInput(e.target.value)}
              className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <input
              id="user-name" name="user-name"
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
