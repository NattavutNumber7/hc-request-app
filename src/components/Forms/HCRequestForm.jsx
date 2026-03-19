import { useState, useEffect, useRef } from 'react'
import { collection, addDoc, updateDoc, doc, serverTimestamp, getDocs, query, where } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { sendToWebhook } from '../../services/webhook'
import { logAudit } from '../../services/auditLog'
import { uploadJDFile, getJDSignedUrl } from '../../services/supabase'
import { Loader2, CheckCircle, ChevronDown, X, Paperclip, FileText, ExternalLink } from 'lucide-react'
import { HQ_JG_LEVELS, OPERATION_JG_LEVELS } from '../../data/jobGrades'
import { fetchSheetsData, getDepartmentByEmail, getEmployeesByDepartment, getPositionsByDepartment } from '../../services/sheetsData'

const INITIAL_FORM = {
  requestType: 'New HC',
  position: '',
  orgTrack: '',
  jg: '',
  department: '',
  headcount: 1,
  requirements: '',
  reason: '',
  targetStartDate: '',
  replacementFor: '',
}

const OPERATION_ONLY_DEPARTMENT_PREFIXES = ['Processing Center', 'Distribution Center']
const HYBRID_DEPARTMENT_PREFIXES = ['Supply Chain & Operation Strategy']

function matchesDepartmentPrefix(department, prefixes) {
  return prefixes.some((prefix) => department.startsWith(prefix))
}

function getTrackConfigByDepartment(department) {
  if (!department) {
    return { options: [], defaultTrack: '', locked: true }
  }

  if (matchesDepartmentPrefix(department, OPERATION_ONLY_DEPARTMENT_PREFIXES)) {
    return { options: ['OPERATION'], defaultTrack: 'OPERATION', locked: true }
  }

  if (matchesDepartmentPrefix(department, HYBRID_DEPARTMENT_PREFIXES)) {
    return { options: ['HQ', 'OPERATION'], defaultTrack: '', locked: false }
  }

  return { options: ['HQ'], defaultTrack: 'HQ', locked: true }
}

function normalizeText(value) {
  return (value || '').trim().toLowerCase()
}

function getTimestampMs(ts) {
  return ts?.toDate?.()?.getTime?.() ?? 0
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
  const feedbackTopRef = useRef(null)
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
  const [customPositions, setCustomPositions] = useState([])
  const [existingJD, setExistingJD] = useState(null)
  const [checkingJD, setCheckingJD] = useState(false)
  const [openingJD, setOpeningJD] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)   // URL สำหรับ inline PDF viewer

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
        const cfg = getTrackConfigByDepartment(dept)
        setForm((prev) => ({ ...prev, department: dept, orgTrack: cfg.defaultTrack }))
        setDeptAutoFilled(true)
      }
    })
  }, [user.email])

  useEffect(() => {
    if (!form.department) {
      setCustomPositions([])
      return
    }

    let cancelled = false
    async function loadCustomPositions() {
      try {
        const q = query(collection(db, 'custom_positions'), where('department', '==', form.department))
        const snap = await getDocs(q)
        if (cancelled) return
        setCustomPositions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      } catch (e) {
        console.error('Error loading custom positions:', e)
      }
    }

    loadCustomPositions()
    return () => { cancelled = true }
  }, [form.department])

  useEffect(() => {
    if (!form.position || !form.department) {
      setExistingJD(null)
      return
    }

    let cancelled = false
    async function loadExistingJD() {
      setCheckingJD(true)
      try {
        const q = query(collection(db, 'hc_requests'), where('position', '==', form.position))
        const snap = await getDocs(q)
        if (cancelled) return

        const matched = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((r) =>
            r.jdFilePath &&
            r.department === form.department &&
            (!form.orgTrack || !r.orgTrack || r.orgTrack === form.orgTrack)
          )
          .sort((a, b) => getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt))[0] ?? null

        setExistingJD(matched)
      } catch (e) {
        console.error('Error loading existing JD:', e)
        setExistingJD(null)
      } finally {
        if (!cancelled) setCheckingJD(false)
      }
    }

    loadExistingJD()
    return () => { cancelled = true }
  }, [form.position, form.department, form.orgTrack])

  useEffect(() => {
    if (!success && !error) return
    feedbackTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [success, error])

  async function handleOpenExistingJD() {
    if (!existingJD?.jdFilePath) return
    setOpeningJD(true)
    try {
      const url = await getJDSignedUrl(existingJD.jdFilePath)
      if (url) setPreviewUrl(url)
    } finally {
      setOpeningJD(false)
    }
  }

  function handleChange(e) {
    const { name, value } = e.target
    if (name === 'department') {
      const cfg = getTrackConfigByDepartment(value)
      setForm((prev) => ({ ...prev, department: value, orgTrack: cfg.defaultTrack, jg: '' }))
      return
    }
    if (name === 'orgTrack') {
      setForm((prev) => ({ ...prev, orgTrack: value, jg: '' }))
      return
    }
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

      // สร้าง Firestore doc ก่อน เพื่อใช้ docRef.id เป็นชื่อ folder ใน Supabase
      const docRef = await addDoc(collection(db, 'hc_requests'), payload)

      // อัพโหลดไฟล์ JD หลังสร้าง doc (ใช้ docRef.id เป็น folder)
      if (jdFile) {
        setUploadProgress('กำลังอัพโหลดไฟล์ JD...')
        const { url, path, error: uploadErr } = await uploadJDFile(jdFile, docRef.id)
        if (uploadErr) throw new Error('อัพโหลดไฟล์ไม่สำเร็จ: ' + uploadErr)
        await updateDoc(doc(db, 'hc_requests', docRef.id), {
          jdFileUrl:  url,
          jdFilePath: path,
          jdFileName: jdFile.name,
        })
        setUploadProgress('')
      }

      const normalizedPosition = normalizeText(payload.position)
      const knownFromSheet = getPositionsByDepartment(positionsByDept, payload.department)
        .some((p) => normalizeText(p) === normalizedPosition)
      const knownFromCustom = customPositions
        .some((p) => normalizeText(p.position) === normalizedPosition && (p.orgTrack || '') === (payload.orgTrack || ''))

      if (!knownFromSheet && !knownFromCustom && normalizedPosition) {
        const customDoc = {
          department: payload.department,
          orgTrack: payload.orgTrack || '',
          position: payload.position.trim(),
          normalizedPosition,
          createdBy: user.email,
          createdAt: serverTimestamp(),
        }
        await addDoc(collection(db, 'custom_positions'), customDoc)
        setCustomPositions((prev) => [...prev, customDoc])
      }

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
      setForm((prev) => ({ ...INITIAL_FORM, department: prev.department, orgTrack: prev.orgTrack })) // คง department/track ไว้
      setTimeout(() => setSuccess(false), 4000)
    } catch (err) {
      console.error('Submit error:', err)
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
  }

  const trackConfig = getTrackConfigByDepartment(form.department)
  const jgLevels = form.orgTrack === 'OPERATION' ? OPERATION_JG_LEVELS : HQ_JG_LEVELS
  const customPositionOptions = customPositions
    .filter((p) => !p.orgTrack || !form.orgTrack || p.orgTrack === form.orgTrack)
    .map((p) => p.position)
  const positionOptions = [...new Set([
    ...getPositionsByDepartment(positionsByDept, form.department),
    ...customPositionOptions,
  ])].sort((a, b) => a.localeCompare(b))

  return (
    <>
    <div className="max-w-7xl mx-auto flex gap-5 items-start">
      {/* ── Main Form Card ── */}
      <div className="flex-1 min-w-0">
      <div ref={feedbackTopRef} className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 p-8 shadow-xl shadow-emerald-900/5 transition-all">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 italic tracking-tight mb-8">ยื่นคำขออัตรากำลัง (HC Request)</h2>

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

          {/* ตำแหน่ง + Track + JG */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* ตำแหน่ง */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-black text-gray-500 dark:text-slate-500 tracking-widest ml-1">ตำแหน่งที่ต้องการ *</label>
              <PositionCombobox
                value={form.position}
                onChange={(val) => setForm((prev) => ({ ...prev, position: val }))}
                positions={positionOptions}
                required
              />
              {form.department && positionOptions.length === 0 && (
                <p className="text-[10px] font-bold text-gray-400 ml-1 uppercase italic">กำลังโหลด...</p>
              )}
            </div>

            {/* Track */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-black text-gray-500 dark:text-slate-500 tracking-widest ml-1">Track *</label>
              {trackConfig.locked ? (
                <input
                  type="text"
                  value={trackConfig.defaultTrack || '—'}
                  readOnly
                  className="w-full border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm bg-gray-50/50 dark:bg-slate-950/20 text-gray-500 dark:text-slate-400 cursor-not-allowed font-bold"
                />
              ) : (
                <select
                  name="orgTrack"
                  value={form.orgTrack}
                  onChange={handleChange}
                  required
                  className="w-full border border-gray-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 bg-white dark:bg-slate-900 dark:text-gray-100 transition-all font-bold"
                >
                  <option value="">เลือก Track</option>
                  {trackConfig.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Job Grade */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-black text-gray-500 dark:text-slate-500 tracking-widest ml-1">Job Grade *</label>
              <select
                name="jg"
                value={form.jg}
                onChange={handleChange}
                required
                disabled={!form.orgTrack}
                className="w-full border border-gray-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 bg-white dark:bg-slate-900 dark:text-gray-100 transition-all font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">{form.orgTrack ? 'เลือก JG' : 'เลือก Track ก่อน'}</option>
                {jgLevels.map(({ value, label }) => (
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

          {/* จำนวน HC (เฉพาะ New HC) */}
          {form.requestType === 'New HC' ? (
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
            <label className="block text-sm uppercase font-black text-gray-400 dark:text-slate-500 tracking-wider ml-1 mb-2">Requirement (Optional)</label>
            <textarea
              name="requirements"
              value={form.requirements}
              onChange={handleChange}
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
      </div>{/* end flex-1 */}

      {/* ── JD Preview Sidebar ── */}
      {existingJD && (
        <div className="hidden lg:flex w-[460px] shrink-0 flex-col sticky top-6 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="rounded-3xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20 overflow-hidden shadow-sm flex flex-col">

            {/* Header row */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-emerald-200/60 dark:border-emerald-800/60">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <FileText size={14} />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-500">JD ที่มีในระบบ</p>
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate max-w-[280px]">{existingJD.jdFileName || 'ไฟล์ JD'}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* ปุ่มเปิดในแท็บใหม่ */}
                {previewUrl && (
                  <a href={previewUrl} target="_blank" rel="noreferrer"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                    title="เปิดในแท็บใหม่"
                  >
                    <ExternalLink size={13} />
                  </a>
                )}
                {/* ปุ่ม toggle preview */}
                <button
                  type="button"
                  onClick={previewUrl ? () => setPreviewUrl(null) : handleOpenExistingJD}
                  disabled={openingJD}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
                  title={previewUrl ? 'ซ่อน PDF' : 'ดู PDF'}
                >
                  {openingJD ? <Loader2 size={13} className="animate-spin" /> : previewUrl ? <X size={13} /> : <FileText size={13} />}
                </button>
              </div>
            </div>

            {/* PDF iframe หรือ placeholder */}
            {previewUrl ? (
              <iframe
                src={previewUrl}
                className="w-full border-0 bg-gray-100 dark:bg-slate-800"
                style={{ height: 'calc(100vh - 160px)', minHeight: '600px' }}
                title="JD Preview"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-8 px-5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-500">
                  <FileText size={22} />
                </div>
                <div className="text-center">
                  <p className="text-[11px] text-gray-400 dark:text-slate-500">
                    อัพโหลดเมื่อ {existingJD.createdAt?.toDate?.().toLocaleDateString('th-TH') || '—'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenExistingJD}
                  disabled={openingJD}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-2xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-[#008065] dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-60 shadow-sm"
                >
                  {openingJD ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  เปิดดูไฟล์ JD
                </button>
                <p className="text-[10px] text-emerald-700/40 dark:text-emerald-500/40 text-center">
                  อัพโหลดใหม่ได้ในฟอร์มด้านซ้าย
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  )
}
