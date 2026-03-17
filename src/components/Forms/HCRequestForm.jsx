import { useState, useEffect, useRef } from 'react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { sendToWebhook } from '../../services/webhook'
import { logAudit } from '../../services/auditLog'
import { uploadJDFile } from '../../services/supabase'
import { Loader2, CheckCircle, ChevronDown, X, Paperclip, FileText } from 'lucide-react'
import { HQ_JG_LEVELS } from '../../data/jobGrades'
import { fetchSheetsData, getDepartmentByEmail, getEmployeesByDepartment, getPositionsByDepartment } from '../../services/sheetsData'

const INITIAL_FORM = {
  requestType: 'New HC',
  position: '',
  jg: '',
  department: '',
  headcount: 1,
  requirements: '',
  reason: '',
  targetStartDate: '',
  replacementFor: '',
  driveLink: '',
}

// Combobox: dropdown + พิมพ์เองได้
function PositionCombobox({ value, onChange, positions, required }) {
  const [open, setOpen] = useState(false)
  const [searchText, setSearchText] = useState('') // ใช้กรองเท่านั้น
  const [isFocused, setIsFocused] = useState(false)
  const ref = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (!ref.current?.contains(e.target)) {
        setOpen(false)
        setIsFocused(false)
        setSearchText('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // กรองด้วย searchText เมื่อพิมพ์ ถ้าไม่ได้พิมพ์แสดงทั้งหมด
  const filtered = searchText
    ? positions.filter((p) => p.toLowerCase().includes(searchText.toLowerCase()))
    : positions

  function select(p) {
    onChange(p)
    setSearchText('')
    setOpen(false)
    setIsFocused(false)
  }

  function handleFocus() {
    setIsFocused(true)
    setSearchText('')
    setOpen(true)
  }

  function handleInput(e) {
    setSearchText(e.target.value)
    onChange(e.target.value) // ให้พิมพ์ใหม่ได้
    setOpen(true)
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={isFocused ? searchText : value}
          onChange={handleInput}
          onFocus={handleFocus}
          required={required}
          placeholder={value || 'เลือกหรือพิมพ์ตำแหน่ง...'}
          className="w-full border border-gray-300 dark:border-slate-800 rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 bg-white dark:bg-slate-900 dark:text-gray-100 transition-all font-medium"
        />
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-600 pointer-events-none" />
      </div>
      {open && (
        <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-xl max-h-52 overflow-y-auto ring-1 ring-black/5 transition-all">
          {filtered.length > 0 ? (
            filtered.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => select(p)}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors font-medium ${
                  p === value ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-bold' : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                {p}
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-sm text-gray-400 dark:text-slate-600 italic">
              ไม่พบ — จะใช้ "{searchText}" เป็นตำแหน่งใหม่
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function HCRequestForm({ user, role }) {
  const [form, setForm] = useState(INITIAL_FORM)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [positionsByDept, setPositionsByDept] = useState({})
  const [employees, setEmployees] = useState({})
  const [deptAutoFilled, setDeptAutoFilled] = useState(false)
  const [allDepts, setAllDepts] = useState([])
  const [jdFile, setJdFile] = useState(null)
  const [uploadProgress, setUploadProgress] = useState('')

  // โหลด positions, employees และ auto-fill department จาก Google Sheets
  useEffect(() => {
    fetchSheetsData().then(({ managers, positions: pos, employees: emp }) => {
      if (pos && typeof pos === 'object') {
        setPositionsByDept(pos)
        setAllDepts(Object.keys(pos).sort())
      }
      if (emp) setEmployees(emp)

      const dept = getDepartmentByEmail(managers, user.email)
      if (dept) {
        setForm((prev) => ({ ...prev, department: dept }))
        setDeptAutoFilled(true)
      }
    })
  }, [user.email])

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const payload = {
        ...form,
        headcount: Number(form.headcount),
        requesterName: user.displayName,
        requesterEmail: user.email,
        status: 'Open',
        createdAt: serverTimestamp(),
      }

      // อัพโหลดไฟล์ JD ก่อน (ถ้ามี)
      let jdFileUrl  = null
      let jdFilePath = null
      let jdFileName = null
      if (jdFile) {
        setUploadProgress('กำลังอัพโหลดไฟล์ JD...')
        const tmpId = `tmp_${Date.now()}`
        const { url, path, error: uploadErr } = await uploadJDFile(jdFile, tmpId)
        if (uploadErr) throw new Error('อัพโหลดไฟล์ไม่สำเร็จ: ' + uploadErr)
        jdFileUrl  = url
        jdFilePath = path
        jdFileName = jdFile.name
        setUploadProgress('')
      }

      if (jdFileUrl)  payload.jdFileUrl  = jdFileUrl
      if (jdFilePath) payload.jdFilePath = jdFilePath
      if (jdFileName) payload.jdFileName = jdFileName

      const docRef = await addDoc(collection(db, 'hc_requests'), payload)
      await sendToWebhook({ ...payload, id: docRef.id, createdAt: new Date().toISOString() })
      logAudit({
        requestId:  docRef.id,
        action:     'Submit',
        by:         user.email,
        byName:     user.displayName,
        toStatus:   'Open',
        position:   payload.position,
        department: payload.department,
      })

      setSuccess(true)
      setForm((prev) => ({ ...INITIAL_FORM, department: prev.department })) // คง department ไว้
      setTimeout(() => setSuccess(false), 4000)
    } catch (err) {
      console.error('Submit error:', err)
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 p-8 shadow-xl shadow-emerald-900/5 transition-all">
        <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 italic tracking-tight mb-8">ยื่นคำขออัตรากำลัง (HC Request)</h2>

        {success && (
          <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-2xl px-5 py-4 mb-8 shadow-sm transition-all animate-in fade-in slide-in-from-top-4">
            <CheckCircle size={20} />
            <p className="font-bold">ยื่นคำขอสำเร็จแล้ว! ข้อมูลถูกส่งเข้าระบบเรียบร้อย</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 rounded-2xl px-5 py-4 mb-8 shadow-sm font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* ประเภทคำขอ */}
          <div>
            <label className="block text-[10px] uppercase font-black text-gray-500 dark:text-slate-500 tracking-widest ml-1 mb-2">ประเภทคำขอ *</label>
            <div className="flex gap-6">
              {['New HC', 'Replacement'].map((type) => (
                <label key={type} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="radio"
                    name="requestType"
                    value={type}
                    checked={form.requestType === type}
                    onChange={handleChange}
                    className="w-4 h-4 accent-emerald-600 dark:accent-emerald-500 cursor-pointer"
                  />
                  <span className={`text-sm font-bold transition-colors ${form.requestType === type ? 'text-gray-900 dark:text-white' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-slate-300'}`}>{type}</span>
                </label>
              ))}
            </div>
          </div>

          {/* ตำแหน่ง + JG */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-[10px] uppercase font-black text-gray-500 dark:text-slate-500 tracking-widest ml-1 mb-2">ตำแหน่งที่ต้องการ *</label>
              <PositionCombobox
                value={form.position}
                onChange={(val) => setForm((prev) => ({ ...prev, position: val }))}
                positions={getPositionsByDepartment(positionsByDept, form.department)}
                required
              />
              {form.department && getPositionsByDepartment(positionsByDept, form.department).length === 0 && (
                <p className="text-[10px] font-bold text-gray-400 ml-1 mt-1.5 uppercase italic">กำลังโหลดรายชื่อ...</p>
              )}
            </div>

            <div>
              <label className="block text-[10px] uppercase font-black text-gray-500 dark:text-slate-500 tracking-widest ml-1 mb-2">Job Grade (JG) *</label>
              <select
                name="jg"
                value={form.jg}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 bg-white dark:bg-slate-900 dark:text-gray-100 transition-all font-bold"
              >
                <option value="">เลือก JG</option>
                {HQ_JG_LEVELS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* แผนก (read-only, auto-fill) */}
          <div>
            <label className="block text-[10px] uppercase font-black text-gray-500 dark:text-slate-500 tracking-widest ml-1 mb-2">
              แผนก *
              {deptAutoFilled && role !== 'admin' && (
                <span className="ml-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 px-2 py-0.5 rounded-full text-[9px] uppercase font-black tracking-tighter">Auto Filled</span>
              )}
            </label>
            {role === 'admin' ? (
              <select
                name="department"
                value={form.department}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 bg-white dark:bg-slate-900 dark:text-gray-100 transition-all font-bold"
              >
                <option value="">เลือกแผนก</option>
                {allDepts.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={form.department || 'ไม่พบข้อมูลแผนก'}
                readOnly
                className="w-full border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm bg-gray-50/50 dark:bg-slate-950/20 text-gray-400 dark:text-slate-600 cursor-not-allowed font-bold"
              />
            )}
          </div>

          {/* จำนวน HC + วันที่เริ่มงาน (เฉพาะ New HC) */}
          {form.requestType === 'New HC' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-[10px] uppercase font-black text-gray-500 dark:text-slate-500 tracking-widest ml-1 mb-2">จำนวนที่ต้องการ (HC) *</label>
                <input
                  type="number"
                  name="headcount"
                  value={form.headcount}
                  onChange={handleChange}
                  min={1}
                  required
                  className="w-full border border-gray-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 bg-white dark:bg-slate-900 dark:text-gray-100 transition-all font-bold tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-black text-gray-500 dark:text-slate-500 tracking-widest ml-1 mb-2">วันที่ต้องการรับคนเข้า *</label>
                <input
                  type="date"
                  name="targetStartDate"
                  value={form.targetStartDate}
                  onChange={handleChange}
                  required
                  className="w-full border border-gray-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 bg-white dark:bg-slate-900 dark:text-gray-100 transition-all font-bold"
                />
              </div>
            </div>
          ) : null}

          {/* แทนใคร + วันสุดท้าย (เฉพาะ Replacement) */}
          {form.requestType === 'Replacement' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-[10px] uppercase font-black text-gray-500 dark:text-slate-500 tracking-widest ml-1 mb-2">พนักงานที่ต้องการทดแทน *</label>
                <select
                  name="replacementFor"
                  value={form.replacementFor}
                  onChange={handleChange}
                  required
                  className="w-full border border-gray-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 bg-white dark:bg-slate-900 dark:text-gray-100 transition-all font-bold"
                >
                  <option value="">เลือกพนักงาน</option>
                  {getEmployeesByDepartment(employees, form.department).map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                {form.department && getEmployeesByDepartment(employees, form.department).length === 0 && (
                  <p className="text-[10px] font-bold text-amber-500 ml-1 mt-1.5 uppercase italic">ไม่พบพนักงานในฐานข้อมูล...</p>
                )}
              </div>
              <div>
                <label className="block text-[10px] uppercase font-black text-gray-500 dark:text-slate-500 tracking-widest ml-1 mb-2">วันลาออก (Last Working Day) *</label>
                <input
                  type="date"
                  name="targetStartDate"
                  value={form.targetStartDate}
                  onChange={handleChange}
                  required
                  className="w-full border border-gray-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 bg-white dark:bg-slate-900 dark:text-gray-100 transition-all font-bold"
                />
              </div>
            </div>
          )}

          {/* เหตุผล */}
          <div>
            <label className="block text-[10px] uppercase font-black text-gray-500 dark:text-slate-500 tracking-widest ml-1 mb-2">เหตุผลในการขอ *</label>
            <textarea
              name="reason"
              value={form.reason}
              onChange={handleChange}
              required
              rows={3}
              placeholder="อธิบายเหตุผลและความจำเป็นในการขออัตรากำลัง..."
              className="w-full border border-gray-300 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 bg-white dark:bg-slate-900 dark:text-gray-100 transition-all font-medium resize-none shadow-sm"
            />
          </div>

          {/* Requirements */}
          <div>
            <label className="block text-[10px] uppercase font-black text-gray-500 dark:text-slate-500 tracking-widest ml-1 mb-2">JD Requirement *</label>
            <textarea
              name="requirements"
              value={form.requirements}
              onChange={handleChange}
              required
              rows={4}
              placeholder={`เช่น\n- ประสบการณ์ 3+ ปี ในสายงานตรง\n- ทักษะการสื่อสารดีเยี่ยม\n- ตรงต่อเวลาและรับผิดชอบสูง`}
              className="w-full border border-gray-300 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 bg-white dark:bg-slate-900 dark:text-gray-100 transition-all font-medium resize-none shadow-sm"
            />
          </div>

          {/* JD File Upload */}
          <div>
            <label className="block text-[10px] uppercase font-black text-gray-500 dark:text-slate-500 tracking-widest ml-1 mb-2">
              แนบไฟล์ JD (Optional)
            </label>
            {jdFile ? (
              <div className="flex items-center gap-3 border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl px-4 py-3 shadow-md animate-in zoom-in-95">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-600 shrink-0">
                  <FileText size={20} strokeWidth={3} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 truncate">{jdFile.name}</p>
                  <p className="text-[10px] font-black text-emerald-600/60 uppercase">{(jdFile.size / 1024).toFixed(0)} KB</p>
                </div>
                <button
                  type="button"
                  onClick={() => setJdFile(null)}
                  className="p-2 text-emerald-400 hover:text-red-500 transition-all hover:rotate-90"
                >
                  <X size={18} strokeWidth={3} />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center gap-2 border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-2xl px-8 py-8 cursor-pointer hover:border-emerald-500 dark:hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/5 transition-all group shadow-inner">
                <div className="w-12 h-12 rounded-full bg-gray-50 dark:bg-slate-800 flex items-center justify-center text-gray-400 group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-md">
                  <Paperclip size={20} strokeWidth={3} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-gray-600 dark:text-slate-400">คลิกเพื่ออัพโหลดไฟล์ JD</p>
                  <p className="text-[10px] font-black text-gray-400 dark:text-slate-600 uppercase tracking-widest mt-1">PDF, Word, Images (Up to 10MB)</p>
                </div>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => setJdFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
            {uploadProgress && (
              <div className="flex items-center gap-2 mt-3 px-3 py-1.5 bg-emerald-500/10 text-emerald-600 rounded-lg text-xs font-black uppercase tracking-tighter animate-pulse">
                <Loader2 size={12} className="animate-spin" /> {uploadProgress}
              </div>
            )}
          </div>

          {/* ผู้ยื่น */}
          <div className="bg-gray-50 dark:bg-slate-950/50 rounded-2xl border border-gray-100 dark:border-slate-800/50 px-5 py-4 flex items-center gap-4 transition-colors">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full ring-2 ring-emerald-500/20 shadow-md" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white text-lg font-black shadow-md">{user.displayName?.[0]}</div>
            )}
            <div className="leading-tight">
              <p className="text-[10px] font-black text-gray-400 dark:text-slate-600 uppercase tracking-widest">Requester</p>
              <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{user.displayName} <span className="text-xs font-normal text-gray-400 mx-1">|</span> {user.email}</p>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-3 bg-[#008065] text-white text-base font-black py-4 rounded-2xl hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-emerald-500/20 active:scale-[0.98]"
          >
            {loading ? <Loader2 size={18} className="animate-spin" strokeWidth={3} /> : <FileText size={18} strokeWidth={3} />}
            {loading ? 'กำลังส่งข้อมูลเข้าระบบ...' : 'ยื่นคำขออัตรากำลัง'}
          </button>
        </form>
      </div>
    </div>
  )
}
