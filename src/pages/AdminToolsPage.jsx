import { useState } from 'react'
import { collection, getDocs, writeBatch } from 'firebase/firestore'
import { db } from '../services/firebase'
import { Clock, Tag, FileText, Trash2, DatabaseZap, Settings2, AlertTriangle } from 'lucide-react'
import { listJDFiles, deleteJDFile } from '../services/supabase'
import Layout from '../components/Shared/Layout'

export default function AdminToolsPage({ user, role, isDarkMode, toggleDarkMode }) {
  const [status, setStatus] = useState({})   // { key: 'idle'|'running'|'done'|'error', count }
  const [confirm, setConfirm] = useState(null) // key ที่กำลังจะ clear

  async function bulkDeleteCollection(colName) {
    const snap = await getDocs(collection(db, colName))
    // Firestore batch max 500 — chunk ถ้ามีเยอะ
    const CHUNK = 400
    for (let i = 0; i < snap.docs.length; i += CHUNK) {
      const batch = writeBatch(db)
      snap.docs.slice(i, i + CHUNK).forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
    return snap.size
  }

  async function runClear(key) {
    setStatus(s => ({ ...s, [key]: { state: 'running' } }))
    try {
      let count = 0
      if (key === 'auditlog') {
        count = await bulkDeleteCollection('hc_logs')
      } else if (key === 'positions') {
        count = await bulkDeleteCollection('custom_positions')
      } else if (key === 'jd') {
        const { data: files } = await listJDFiles()
        for (const f of files) await deleteJDFile(f.path)
        count = files.length
      } else if (key === 'requests') {
        count = await bulkDeleteCollection('hc_requests')
      }
      setStatus(s => ({ ...s, [key]: { state: 'done', count } }))
    } catch (err) {
      console.error('[AdminTools]', key, err)
      setStatus(s => ({ ...s, [key]: { state: 'error' } }))
    }
    setConfirm(null)
  }

  const TOOLS = [
    {
      key: 'auditlog',
      icon: <Clock size={20} />,
      label: 'Audit Log',
      desc: 'ลบประวัติการเปลี่ยนแปลงทั้งหมดใน hc_logs',
      color: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      border: 'border-orange-200 dark:border-orange-800',
    },
    {
      key: 'positions',
      icon: <Tag size={20} />,
      label: 'Custom Positions',
      desc: 'ลบ custom positions ทั้งหมดใน Firestore',
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      border: 'border-purple-200 dark:border-purple-800',
    },
    {
      key: 'jd',
      icon: <FileText size={20} />,
      label: 'JD Files (Supabase)',
      desc: 'ลบไฟล์ JD PDF ทั้งหมดใน Supabase Storage',
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-800',
    },
    {
      key: 'requests',
      icon: <Trash2 size={20} />,
      label: 'HC Requests (ทั้งหมด)',
      desc: 'ลบ request ทั้งหมดใน hc_requests — ระวัง ไม่สามารถย้อนกลับได้',
      color: 'text-rose-700 dark:text-rose-400',
      bg: 'bg-rose-50 dark:bg-rose-900/20',
      border: 'border-rose-300 dark:border-rose-800',
    },
  ]

  return (
    <Layout user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode}>
      <div className="max-w-xl mx-auto py-8 px-4">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800"><DatabaseZap size={20} className="text-slate-600 dark:text-slate-400"/></div>
          <div>
            <h1 className="text-lg font-black text-gray-900 dark:text-gray-100">Admin Tools</h1>
            <p className="text-xs text-gray-500 dark:text-slate-400">Bulk clear database — ไม่สามารถย้อนกลับได้</p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {TOOLS.map(t => {
            const s = status[t.key]
            return (
              <div key={t.key} className={`rounded-2xl border p-5 ${t.bg} ${t.border}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={t.color}>{t.icon}</span>
                    <div>
                      <p className={`text-sm font-black ${t.color}`}>{t.label}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{t.desc}</p>
                    </div>
                  </div>
                  {s?.state === 'done' ? (
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-3 py-1 rounded-full">
                      ✓ ลบแล้ว {s.count} รายการ
                    </span>
                  ) : s?.state === 'running' ? (
                    <span className="text-xs font-bold text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Settings2 size={13} className="animate-spin"/> กำลังลบ...
                    </span>
                  ) : s?.state === 'error' ? (
                    <span className="text-xs font-bold text-red-600 dark:text-red-400">เกิดข้อผิดพลาด</span>
                  ) : (
                    <button
                      onClick={() => setConfirm(t.key)}
                      className="flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors shadow-sm"
                    >
                      <Trash2 size={12}/> Clear
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Confirm modal */}
        {confirm && (() => {
          const t = TOOLS.find(x => x.key === confirm)
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-sm mx-4 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-xl bg-red-100 dark:bg-red-900/30"><AlertTriangle size={18} className="text-red-600 dark:text-red-400"/></div>
                  <div>
                    <p className="font-black text-gray-900 dark:text-gray-100 text-sm">ยืนยันการลบ {t.label}?</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">การกระทำนี้ไม่สามารถย้อนกลับได้</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setConfirm(null)} className="flex-1 px-4 py-2 text-sm font-bold rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                    ยกเลิก
                  </button>
                  <button onClick={() => runClear(confirm)} className="flex-1 px-4 py-2 text-sm font-black rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors shadow-md shadow-red-500/20">
                    ลบทั้งหมด
                  </button>
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </Layout>
  )
}
