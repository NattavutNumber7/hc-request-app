/**
 * JDFilesPage.jsx — JD Files management page
 * ─────────────────────────────────────────────────────────────────────────────
 * หน้าแสดงและจัดการไฟล์ Job Description (JD) ทั้งหมดที่อัปโหลดเข้าระบบ
 * ดึงรายการไฟล์จาก Supabase Storage และ map กับข้อมูล HC Request จาก Firestore
 * เพื่อแสดงชื่อตำแหน่งและแผนกแทนชื่อ folder
 *
 * การ map ไฟล์ → HC Request:
 *   - folder name ของไฟล์ใน Storage = Firestore doc ID ของ hc_requests
 *   - ไฟล์เก่าที่ใช้ tmp_* folder จะ fallback ไป index ด้วย jdFilePath แทน
 *
 * Props:
 *   user          {object}   Firebase user object ของผู้ใช้ที่ login อยู่
 *   role          {string}   role ของผู้ใช้ ('admin' เท่านั้นที่ลบไฟล์ได้)
 *   isDarkMode    {boolean}  สถานะ dark mode
 *   toggleDarkMode {function} toggle dark/light mode
 *
 * Notes:
 *   - การลบไฟล์จะลบใน Supabase Storage พร้อมกัน clear field ใน Firestore doc ด้วย
 *   - folder ที่ขึ้นต้นด้วย tmp_ ไม่ใช่ Firestore doc ID จึงข้ามการ clear Firestore
 *   - ใช้ cancelled flag ใน useEffect เพื่อป้องกัน setState หลัง unmount
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from 'react'
import { collection, getDocs, query, doc, updateDoc, deleteField } from 'firebase/firestore'
import { db } from '../services/firebase'
import { FolderOpen, FileText, ExternalLink, Clock, Trash2 } from 'lucide-react'
import { listJDFiles, getJDSignedUrl, deleteJDFile } from '../services/supabase'
import Layout from '../components/Shared/Layout'
import ConfirmModal from '../components/Shared/ConfirmModal'

export default function JDFilesPage({ user, role, isDarkMode, toggleDarkMode }) {
  const [files, setFiles] = useState([])
  const [requestMap, setRequestMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [deletingPath, setDeletingPath] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [confirmState, setConfirmState] = useState({ isOpen: false, file: null })

  useEffect(() => {
    // cancelled flag ป้องกัน setState เมื่อ component unmount ก่อน fetch เสร็จ
    let cancelled = false
    async function load() {
      const { data } = await listJDFiles()
      if (cancelled) return

      try {
        // ดึง hc_requests ทั้งหมดมา build lookup map เพื่อแสดงชื่อตำแหน่ง/แผนก
        const qReq = query(collection(db, 'hc_requests'))
        const snap = await getDocs(qReq)
        if (cancelled) return
        const map = {}
        snap.forEach(d => {
          const data = d.data()
          // index ด้วย doc ID หลัก
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

  // เปิดไฟล์ในแท็บใหม่ผ่าน signed URL (URL มีอายุจำกัดจาก Supabase)
  async function handleOpen(path) {
    const url = await getJDSignedUrl(path)
    if (url) window.open(url, '_blank')
  }

  async function handleDeleteFile(file) {
    if (!file?.path) return
    setDeletingPath(file.path)
    try {
      // ลบไฟล์จาก Supabase Storage
      await deleteJDFile(file.path)

      // ล้าง reference ของไฟล์ JD ใน request ต้นทาง (ถ้า folder เป็น Firestore doc ID)
      // ข้าม folder ที่ขึ้นต้นด้วย tmp_ เพราะไม่ใช่ Firestore doc ID
      if (file.folder && !file.folder.startsWith('tmp_')) {
        try {
          await updateDoc(doc(db, 'hc_requests', file.folder), {
            jdFilePath: deleteField(),
            jdFileUrl: deleteField(),
            jdFileName: deleteField(),
          })
        } catch (e) {
          console.error('[JDFilesPage] Could not clear Firestore ref:', e)
        }
      }

      // อัปเดต local state ให้ลบไฟล์ออกจาก list โดยไม่ต้อง refetch
      setFiles((prev) => prev.filter((f) => f.path !== file.path))
    } catch (e) {
      console.error('[JDFilesPage] Delete error:', e)
      setDeleteError('ลบไฟล์ไม่สำเร็จ กรุณาลองใหม่')
      setTimeout(() => setDeleteError(''), 4000)
    } finally {
      setDeletingPath('')
    }
  }

  // แปลง bytes → KB / MB สำหรับแสดงขนาดไฟล์
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
              // หา request ที่ตรงกับ folder ของไฟล์นี้ (ใช้ requestMap ที่ build ไว้)
              const req = requestMap[file.folder]
              // ตัด timestamp prefix ออกจากชื่อไฟล์ (format: {timestamp}_{originalName})
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
                      {/* แสดง position + department จาก request ที่ตรงกัน หรือ fallback เป็น folder ID ย่อ */}
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

                  {/* ปุ่ม open และ delete แสดงเมื่อ hover — delete แสดงเฉพาะ admin */}
                  <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ExternalLink size={16} className="text-gray-300" />
                    {role === 'admin' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation() // ป้องกัน click เปิดไฟล์เมื่อกดปุ่มลบ
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

      {/* Confirm dialog ก่อนลบไฟล์ */}
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
