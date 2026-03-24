import { useEffect, useState, useMemo, Fragment } from 'react'
import { collection, onSnapshot, orderBy, query, doc, updateDoc, getDocs, where, deleteDoc, serverTimestamp, arrayUnion } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { sendStatusUpdate } from '../../services/webhook'
import { logAudit } from '../../services/auditLog'
import { Loader2, UserCheck, XCircle, ChevronUp, ChevronDown, ChevronsUpDown, SlidersHorizontal, X, FileText, Search, ChevronRight, Users, Calendar, AlignLeft, ClipboardList, Pencil, Trash2 } from 'lucide-react'
import { getJDSignedUrl, deleteJDFile } from '../../services/supabase'
import ConfirmModal from '../Shared/ConfirmModal'

// ─── สี Badge ของแต่ละสถานะ (light + dark mode) ───
const STATUS_CONFIG = {
  Open:         { label: 'Open',         bg: 'bg-yellow-50 dark:bg-yellow-500/10',     text: 'text-yellow-700 dark:text-yellow-500',   border: 'border-yellow-200 dark:border-yellow-500/20' },
  Recruiting:   { label: 'Recruiting',   bg: 'bg-emerald-50 dark:bg-emerald-500/10',   text: 'text-emerald-700 dark:text-emerald-500', border: 'border-emerald-200 dark:border-emerald-500/20' },
  Interviewing: { label: 'Interviewing', bg: 'bg-orange-50 dark:bg-orange-500/10',     text: 'text-orange-700 dark:text-orange-500',   border: 'border-orange-200 dark:border-orange-500/20' },
  Offering:     { label: 'Offering',     bg: 'bg-indigo-50 dark:bg-indigo-500/10',     text: 'text-indigo-700 dark:text-indigo-500',   border: 'border-indigo-200 dark:border-indigo-500/20' },
  Rejected:     { label: 'Rejected',     bg: 'bg-red-50 dark:bg-red-500/10',           text: 'text-red-700 dark:text-red-500',         border: 'border-red-200 dark:border-red-500/20' },
  Closed:       { label: 'Closed',       bg: 'bg-slate-100 dark:bg-slate-800',         text: 'text-slate-700 dark:text-slate-400',     border: 'border-slate-200 dark:border-slate-700' },
  Cancelled:    { label: 'Cancelled',    bg: 'bg-gray-50 dark:bg-slate-900',           text: 'text-gray-500 dark:text-slate-500',     border: 'border-gray-200 dark:border-slate-800' },
}

// ─── Tab list และสถานะที่ TA สามารถเปลี่ยนได้ (ยกเว้น Open) ───
const STATUS_TABS = ['ทั้งหมด', 'Open', 'Recruiting', 'Interviewing', 'Offering', 'Rejected', 'Closed', 'Cancelled']
const TA_STATUSES = ['Open', 'Recruiting', 'Interviewing', 'Offering', 'Closed']
const ALL_STATUSES = ['Open', 'Recruiting', 'Interviewing', 'Offering', 'Rejected', 'Closed', 'Cancelled']

// คืน list สถานะที่เปลี่ยนได้ → ไม่รวม Open (TA ไม่สามารถย้อนกลับมา Open ได้)
function getAvailableStatuses(currentStatus) {
  const options = TA_STATUSES.filter(s => s !== 'Open')
  if (!options.includes(currentStatus)) return [currentStatus, ...options]
  return options
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border} uppercase tracking-wider`}>
      {cfg.label}
    </span>
  )
}

// ─── คำนวณวันที่ใช้ตั้งแต่ Open จนถึงปัจจุบัน (หรือ closedAt) ───
function getDaysOpen(req) {
  const created = req.createdAt?.toDate?.()
  if (!created) return null
  const end = req.closedAt?.toDate?.() || new Date()
  return Math.floor((end - created) / (1000 * 60 * 60 * 24))
}

// แสดงป้าย SLA: 🔴 >30วัน 🟡 15-30วัน 🟢 <15วัน
function SLABadge({ req }) {
  const days = getDaysOpen(req)
  if (days === null) return null
  const done = ['Closed', 'Cancelled'].includes(req.status)
  if (done) return <span className="text-[10px] text-slate-400 dark:text-slate-600 font-mono">{days}d</span>
  const style = days > 30
    ? 'text-red-600 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20'
    : days > 15
    ? 'text-yellow-600 bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/20'
    : 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20'
  const dot = days > 30 ? '🔴' : days > 15 ? '🟡' : '🟢'
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg text-[10px] font-bold border ${style}`}>
      {dot} {days}d
    </span>
  )
}

// สร้าง entry สำหรับ statusHistory array
function buildHistoryEntry(status, user) {
  return { status, changedAt: new Date().toISOString(), changedBy: user.email, changedByName: user.displayName }
}

function SortIcon({ field, sortField, sortDir }) {
  if (sortField !== field) return <ChevronsUpDown size={12} className="text-gray-300" />
  return sortDir === 'asc'
    ? <ChevronUp size={12} className="text-[#008065]" />
    : <ChevronDown size={12} className="text-[#008065]" />
}

export default function RequestTable({
  user, role, department, onStatsChange,
  filterMine = false, filterMyCases = false, showFilters = false,
}) {
  const [requests, setRequests]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [updating, setUpdating]     = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [allTAs, setAllTAs]         = useState([])
  const [reassigningId, setReassigningId] = useState(null)
  const [search, setSearch]         = useState('')
  const [activeTab, setActiveTab]   = useState('ทั้งหมด')
  const [filterDept, setFilterDept] = useState('')
  const [filterAssigned, setFilterAssigned] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo]     = useState('')
  const [showFilterBar, setShowFilterBar]   = useState(false)
  const [sortField, setSortField]   = useState('createdAt')
  const [sortDir, setSortDir]       = useState('desc')
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, payload: null })
  // Offering modal: กรอกวันเริ่มงานก่อนเปลี่ยนสถานะเป็น Offering
  const [offeringModal, setOfferingModal] = useState({ isOpen: false, id: null })
  const [offeringStartDate, setOfferingStartDate] = useState('')

  // ─── Realtime listener: ดึง hc_requests จาก Firestore แบบ realtime ───
  // คำนวณ stats (open/assigned/closed) และส่งกลับผ่าน onStatsChange callback
  useEffect(() => {
    const q = query(collection(db, 'hc_requests'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      setRequests(data)
      setLoading(false)
      const active = data.filter((r) => r.status !== 'Cancelled')
      // คำนวณ Average Days to Fill จาก request ที่ Closed และมี closedAt
      const closedWithDate = data.filter(r => r.status === 'Closed' && r.createdAt && r.closedAt)
      const avgDaysToFill = closedWithDate.length > 0
        ? Math.round(closedWithDate.reduce((sum, r) => sum + getDaysOpen(r), 0) / closedWithDate.length)
        : null
      onStatsChange?.(
        {
          open:         active.filter((r) => r.status === 'Open').length,
          assigned:     active.filter((r) => ['Recruiting', 'Interviewing', 'Offering'].includes(r.status)).length,
          closed:       active.filter((r) => r.status === 'Closed').length,
          total:        active.length,
          avgDaysToFill,
        },
        data
      )
    })
  }, [onStatsChange])

  // ─── โหลดรายชื่อ TA/Admin สำหรับ dropdown reassign ───
  useEffect(() => {
    if (role === 'admin' || role === 'ta') {
      const q = query(collection(db, 'users'), where('role', 'in', ['ta', 'admin']))
      getDocs(q).then(snap => {
        setAllTAs(snap.docs.map(d => ({ email: d.id, name: d.data().name || d.id })))
      }).catch(e => console.error('Error fetching TAs:', e))
    }
  }, [role])

  // ─── Action Handlers ─────────────────────────────────────────
  async function handleCancel(id) {
    setUpdating(id)
    const req = requests.find((r) => r.id === id)
    await updateDoc(doc(db, 'hc_requests', id), { status: 'Cancelled', statusHistory: arrayUnion(buildHistoryEntry('Cancelled', user)) })
    sendStatusUpdate(id, 'Cancelled')
    logAudit({ requestId: id, action: 'Cancel', by: user.email, byName: user.displayName, fromStatus: req?.status, toStatus: 'Cancelled', position: req?.position, department: req?.department })
    setUpdating(null)
  }

  async function handleClaim(id) {
    setUpdating(id)
    const req = requests.find((r) => r.id === id)
    await updateDoc(doc(db, 'hc_requests', id), { status: 'Recruiting', assignedTo: user.email, assignedToName: user.displayName, assignedAt: serverTimestamp(), statusHistory: arrayUnion(buildHistoryEntry('Recruiting', user)) })
    sendStatusUpdate(id, 'Recruiting', user.displayName, new Date().toISOString())
    logAudit({ requestId: id, action: 'Assign', by: user.email, byName: user.displayName, fromStatus: req?.status, toStatus: 'Recruiting', position: req?.position, department: req?.department })
    setUpdating(null)
  }

  // Auto-assign TA ถ้ายังไม่มีคนรับเคสและเปลี่ยนจาก Open → working status
  // extraData: ข้อมูลเพิ่มเติม เช่น { startDate } ตอนเปลี่ยนเป็น Offering
  async function handleStatusChange(id, newStatus, extraData = {}) {
    const req = requests.find((r) => r.id === id)

    const updateData = {
      status: newStatus,
      ...extraData,
      statusHistory: arrayUnion(buildHistoryEntry(newStatus, user)),
    }

    // Auto-assign if changing from Open to a working status and not already assigned
    if (req.status === 'Open' && ['Recruiting', 'Interviewing', 'Offering', 'Closed'].includes(newStatus) && !req.assignedTo) {
      updateData.assignedTo = user.email
      updateData.assignedToName = user.displayName
      updateData.assignedAt = serverTimestamp()
    }

    // บันทึก rejectedAt / closedAt เพื่อใช้คำนวณ SLA
    if (newStatus === 'Rejected') updateData.rejectedAt = serverTimestamp()
    if (newStatus === 'Closed')   updateData.closedAt   = serverTimestamp()

    await updateDoc(doc(db, 'hc_requests', id), updateData)
    const assignedAt = updateData.assignedAt ? new Date().toISOString() : req.assignedAt?.toDate?.().toISOString()
    sendStatusUpdate(id, newStatus, updateData.assignedToName || req.assignedToName, assignedAt, extraData.startDate || null)
    logAudit({
      requestId: id,
      action: newStatus === 'Rejected' ? 'Rejected' : 'StatusChange',
      by: user.email,
      byName: user.displayName,
      fromStatus: req?.status,
      toStatus: newStatus,
      position: req?.position,
      department: req?.department,
      note: extraData.startDate ? `วันเริ่มงาน: ${extraData.startDate}` : undefined,
    })
  }

  // Offering confirm: บันทึกวันเริ่มงาน + เปลี่ยนสถานะ
  async function handleOfferingConfirm() {
    if (!offeringStartDate || !offeringModal.id) return
    await handleStatusChange(offeringModal.id, 'Offering', { startDate: offeringStartDate })
    setOfferingModal({ isOpen: false, id: null })
    setOfferingStartDate('')
  }

  // Rejected → เปิด recruit ใหม่ (ย้อนกลับเป็น Open)
  async function handleReopen(id) {
    const req = requests.find((r) => r.id === id)
    await updateDoc(doc(db, 'hc_requests', id), { status: 'Open', startDate: '', rejectedAt: null, statusHistory: arrayUnion(buildHistoryEntry('Open', user)) })
    sendStatusUpdate(id, 'Open', req.assignedToName)
    logAudit({
      requestId: id,
      action: 'Reopen',
      by: user.email,
      byName: user.displayName,
      fromStatus: 'Rejected',
      toStatus: 'Open',
      position: req?.position,
      department: req?.department,
      note: 'ผู้สมัครไม่มารายงานตัว — เปิด recruit ใหม่',
    })
  }

  async function handleReassign(id, newTAEmail, newTAName) {
    setUpdating(id)
    const req = requests.find((r) => r.id === id)
    const now = new Date().toISOString()
    await updateDoc(doc(db, 'hc_requests', id), {
      assignedTo: newTAEmail,
      assignedToName: newTAName,
      assignedAt: serverTimestamp(),
    })
    sendStatusUpdate(id, req?.status, newTAName, now)
    logAudit({ 
      requestId: id, 
      action: 'Assign', 
      by: user.email, 
      byName: user.displayName, 
      fromStatus: req?.status, 
      toStatus: req?.status, 
      position: req?.position, 
      department: req?.department,
      note: `Reassigned from ${req.assignedToName} to ${newTAName}`
    })
    setReassigningId(null)
    setUpdating(null)
  }

  async function handleDelete(id) {
    setUpdating(id)
    try {
      const req = requests.find((r) => r.id === id)
      
      // 1. ลบไฟล์ JD ใน Supabase Storage (ถ้ามี)
      if (req?.jdFilePath) {
        await deleteJDFile(req.jdFilePath)
      }

      // 2. ลบ Document ใน Firestore
      await deleteDoc(doc(db, 'hc_requests', id))

      logAudit({ 
        requestId: id, 
        action: 'Delete', 
        by: user.email, 
        byName: user.displayName, 
        position: req?.position, 
        department: req?.department,
        note: 'Permanently deleted from database & storage by Admin'
      })
    } catch (e) {
      console.error('Delete error:', e)
    }
    setUpdating(null)
  }

  function openConfirm(action, payload) {
    setConfirmState({ isOpen: true, action, payload })
  }

  function closeConfirm() {
    if (confirmState.action === 'reassign') setReassigningId(null)
    setConfirmState({ isOpen: false, action: null, payload: null })
  }

  async function handleConfirm() {
    const { action, payload } = confirmState
    try {
      if (action === 'cancel') await handleCancel(payload.id)
      if (action === 'close') await handleStatusChange(payload.id, 'Closed')
      if (action === 'reassign') await handleReassign(payload.id, payload.email, payload.name)
      if (action === 'delete') await handleDelete(payload.id)
    } catch (err) {
      console.error('[handleConfirm] error:', err)
    } finally {
      closeConfirm()
    }
  }

  function getConfirmContent() {
    const { action, payload } = confirmState

    if (action === 'cancel') {
      return {
        title: 'ยืนยันการยกเลิกคำขอ',
        message: 'ต้องการยกเลิกคำขอนี้ใช่หรือไม่? หลังยกเลิกแล้วเคสจะไม่อยู่ในกระบวนการต่อ',
        confirmText: 'ยืนยันการยกเลิก',
        variant: 'warning',
      }
    }

    if (action === 'close') {
      return {
        title: 'ปิดเคสนี้',
        message: 'ต้องการเปลี่ยนสถานะเป็น Closed ใช่หรือไม่? หลังจากนี้การแก้ไขบางส่วนอาจไม่สามารถทำได้',
        confirmText: 'ปิดเคส',
        variant: 'info',
      }
    }

    if (action === 'reassign') {
      return {
        title: 'ย้ายผู้ดูแลเคส',
        message: payload ? `ต้องการย้ายเคสนี้ไปให้ ${payload.name} ดูแลแทนใช่หรือไม่?` : '',
        confirmText: 'ยืนยันการย้าย',
        variant: 'warning',
      }
    }

    if (action === 'delete') {
      return {
        title: 'ลบคำขอออกจากระบบ',
        message: 'ต้องการลบรายการนี้ออกจากฐานข้อมูลและไฟล์ที่เกี่ยวข้องถาวรใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้',
        confirmText: 'ลบถาวร',
        variant: 'danger',
      }
    }

    return {
      title: 'ยืนยันการทำรายการ',
      message: '',
      confirmText: 'ยืนยัน',
      variant: 'info',
    }
  }

  function toggleSort(field) {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const departments = useMemo(() => [...new Set(requests.map((r) => r.department).filter(Boolean))].sort(), [requests])
  const assignees   = useMemo(() => [...new Set(requests.map((r) => r.assignedToName).filter(Boolean))].sort(), [requests])

  // ─── คำนวณจำนวนรายการในแต่ละ Tab (นับตาม visibility rule เดียวกับ displayed) ───
  const tabCounts = useMemo(() => {
    let base = [...requests]
    
    // Visibility logic
    if (role === 'manager') {
      // สำหรับ Manager: เห็นเฉพาะของตัวเอง + แผนกตัวเอง (หรือแผนกที่ override มาเทส)
      base = base.filter(r => r.requesterEmail === user.email || r.department === department)
    } else if (role === 'ta' && department) {
      // สำหรับ TA ถ้ามีการ override แผนก ให้กรองตามแผนก
      base = base.filter(r => r.department === department)
    }

    // Sub-filters (Tabs / Toggle)
    if (filterMine) base = base.filter(r => r.requesterEmail === user.email)
    if (filterMyCases) {
      base = role === 'admin'
        ? base.filter(r => Boolean(r.assignedTo))
        : base.filter(r => r.assignedTo === user.email)
    }

    const counts = { ทั้งหมด: base.length }
    ALL_STATUSES.forEach(s => { counts[s] = base.filter(r => r.status === s).length })
    return counts
  }, [requests, filterMine, filterMyCases, user.email, role, department])

  // ─── กรองและเรียงข้อมูลสำหรับแสดงในตาราง ───
  // Visibility: manager เห็นเฉพาะของตัวเอง + แผนก, ta/admin เห็นทั้งหมด
  const displayed = useMemo(() => {
    let list = [...requests]

    // Visibility logic (must match tabCounts)
    if (role === 'manager') {
      list = list.filter(r => r.requesterEmail === user.email || r.department === department)
    } else if (role === 'ta' && department) {
      list = list.filter(r => r.department === department)
    }

    if (filterMine) list = list.filter((r) => r.requesterEmail === user.email)
    if (filterMyCases) {
      list = role === 'admin'
        ? list.filter((r) => Boolean(r.assignedTo))
        : list.filter((r) => r.assignedTo === user.email)
    }
    if (activeTab !== 'ทั้งหมด') list = list.filter((r) => r.status === activeTab)
    if (filterDept)    list = list.filter((r) => r.department === filterDept)
    if (filterAssigned) list = list.filter((r) => r.assignedToName === filterAssigned)
    if (filterDateFrom) list = list.filter((r) => r.createdAt?.toDate?.() >= new Date(filterDateFrom))
    if (filterDateTo)  { const to = new Date(filterDateTo); to.setHours(23,59,59); list = list.filter((r) => r.createdAt?.toDate?.() <= to) }
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((r) =>
        r.position?.toLowerCase().includes(q) ||
        r.department?.toLowerCase().includes(q) ||
        r.requesterName?.toLowerCase().includes(q) ||
        r.id?.toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => {
      let aVal = sortField === 'createdAt' ? a.createdAt?.toDate?.()?.getTime() ?? 0 : a[sortField] ?? ''
      let bVal = sortField === 'createdAt' ? b.createdAt?.toDate?.()?.getTime() ?? 0 : b[sortField] ?? ''
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [requests, filterMine, filterMyCases, activeTab, filterDept, filterAssigned, filterDateFrom, filterDateTo, search, sortField, sortDir, user.email, role, department])

  const hasAdvancedFilters = filterDept || filterAssigned || filterDateFrom || filterDateTo

  function clearAdvanced() { setFilterDept(''); setFilterAssigned(''); setFilterDateFrom(''); setFilterDateTo('') }

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
      <Loader2 size={20} className="animate-spin text-[#008065]" />
      <span>กำลังโหลดข้อมูล...</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">

      {/* Search + Filter toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาตำแหน่ง, แผนก, ผู้ยื่น..."
            className="w-full pl-8 pr-10 py-1.5 text-sm border border-gray-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#00ce7c]/30 transition-all font-medium"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X size={13} strokeWidth={3} />
            </button>
          )}
        </div>

        {showFilters && (
          <button
            onClick={() => setShowFilterBar(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border transition-all font-medium ${
              showFilterBar || hasAdvancedFilters
                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                : 'bg-white dark:bg-slate-900 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800'
            }`}
          >
            <SlidersHorizontal size={13} />
            Filters
            {hasAdvancedFilters && (
              <span className="ml-1 bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 rounded-full leading-none">
                {[filterDept, filterAssigned, filterDateFrom, filterDateTo].filter(Boolean).length}
              </span>
            )}
          </button>
        )}
        {hasAdvancedFilters && (
          <button onClick={clearAdvanced} className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500 hover:text-emerald-600 transition-colors font-medium">
            <X size={11} strokeWidth={3} /> ล้างค่าทิ้ง
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400 dark:text-slate-600 font-medium">{displayed.length} รายการ</span>
      </div>

      {/* Status Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-100 dark:border-slate-800 overflow-x-auto pb-0">
        {STATUS_TABS.map((tab) => {
          const active = activeTab === tab
          const count  = tabCounts[tab] ?? 0
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold whitespace-nowrap transition-all border-b-2 -mb-px ${
                active
                  ? 'border-[#008065] text-[#008065]'
                  : 'border-transparent text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'
              }`}
            >
              {tab}
              {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full leading-none transition-colors ${
                  active
                    ? 'bg-[#008065] text-white'
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Advanced Filter Bar */}
      {showFilters && showFilterBar && (
        <div className="rounded-2xl border border-gray-200 dark:border-slate-800 p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50/50 dark:bg-slate-900/50 backdrop-blur-sm transition-all shadow-inner">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-slate-500 tracking-wider">Department</label>
            <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="text-sm border border-gray-200 dark:border-slate-800 rounded-xl px-3 py-2 bg-white dark:bg-slate-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#00ce7c]/30">
              <option value="">ทั้งหมด</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-slate-500 tracking-wider">Assigned To</label>
            <select value={filterAssigned} onChange={(e) => setFilterAssigned(e.target.value)} className="text-sm border border-gray-200 dark:border-slate-800 rounded-xl px-3 py-2 bg-white dark:bg-slate-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#00ce7c]/30">
              <option value="">ทั้งหมด</option>
              {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-slate-500 tracking-wider">วันที่ตั้งแต่</label>
            <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="text-sm border border-gray-200 dark:border-slate-800 rounded-xl px-3 py-2 bg-white dark:bg-slate-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#00ce7c]/30" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-slate-500 tracking-wider">ถึงวันที่</label>
            <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="text-sm border border-gray-200 dark:border-slate-800 rounded-xl px-3 py-2 bg-white dark:bg-slate-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#00ce7c]/30" />
          </div>
        </div>
      )}

      {/* Table */}
      {displayed.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-dashed border-gray-200 bg-white">
          <p className="text-gray-400 font-medium">ไม่พบรายการ</p>
          {(hasAdvancedFilters || search || activeTab !== 'ทั้งหมด') && (
            <button onClick={() => { clearAdvanced(); setSearch(''); setActiveTab('ทั้งหมด') }} className="text-sm mt-2 hover:underline text-[#008065]">
              ล้าง filter ทั้งหมด
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition-colors">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-slate-800/50 backdrop-blur-sm">
                {[
                  { label: 'ID', field: null },
                  { label: 'ประเภท', field: null },
                  { label: 'ตำแหน่ง / JG', field: 'position' },
                  { label: 'แผนก', field: 'department' },
                  { label: 'ผู้ยื่น', field: null },
                  { label: 'TA', field: 'assignedToName' },
                  { label: 'สถานะ', field: 'status' },
                  { label: 'วันที่ยื่น', field: 'createdAt' },
                  { label: 'SLA', field: null },
                  { label: 'Actions', field: null },
                ].map(({ label, field }) => (
                    <th
                      key={label}
                      className={`px-4 py-3 text-left text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest ${field ? 'cursor-pointer select-none hover:text-[#008065] dark:hover:text-emerald-400' : ''} transition-colors`}
                      onClick={field ? () => toggleSort(field) : undefined}
                    >
                      <span className="flex items-center gap-1.5">
                        {label}
                        {field && <SortIcon field={field} sortField={sortField} sortDir={sortDir} />}
                      </span>
                    </th>
                ))}
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-800/50">
              {displayed.map((req) => {
                // ─── Permission flags สำหรับแต่ละแถว ───
                const isOwner  = req.requesterEmail === user.email
                const isTA     = role === 'ta' || role === 'admin'
                const isAdmin  = role === 'admin'
                const isExpanded      = expandedId === req.id
                const canViewFile     = req.jdFilePath && (isTA || isOwner)
                const canCancel       = isAdmin || (isTA && req.status !== 'Closed' && req.status !== 'Cancelled') || (isOwner && req.status === 'Open')
                const canClaim        = isTA && req.status === 'Open'
                const canUpdateStatus = filterMyCases && isTA && req.status !== 'Cancelled' && (req.status !== 'Closed' || isAdmin)
                const canReassign     = isTA && (isAdmin || filterMyCases) && req.status !== 'Cancelled' && req.status !== 'Closed' && allTAs.length > 0
                const isBusy          = updating === req.id

                async function handleOpenFile(e) {
                  e.stopPropagation()
                  const url = await getJDSignedUrl(req.jdFilePath)
                  if (url) window.open(url, '_blank')
                }

                return (
                  <Fragment key={req.id}>
                    <tr
                      className={`transition-all cursor-pointer group ${isExpanded ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : 'hover:bg-gray-50/80 dark:hover:bg-slate-800/80'}`}
                      onClick={() => setExpandedId(isExpanded ? null : req.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ChevronRight size={13} strokeWidth={3} className={`text-gray-300 dark:text-slate-700 transition-transform shrink-0 ${isExpanded ? 'rotate-90 text-emerald-500' : 'rotate-0 group-hover:text-gray-400'}`} />
                          <span className="font-mono text-[10px] font-bold text-gray-400 dark:text-slate-600 tracking-tighter uppercase">{req.id.slice(0, 7)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-tight ${
                          req.requestType === 'New HC'
                            ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'
                            : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                        }`}>
                          {req.requestType === 'New HC' ? 'New HC' : 'Replace'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-gray-800 dark:text-gray-200 leading-tight">{req.position}</p>
                        {req.jg && <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 mt-0.5 uppercase tracking-wide">{req.jg}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-slate-400 font-medium">{req.department}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-slate-500 text-[11px] font-medium">{req.requesterName}</td>
                      <td className="px-4 py-3">
                        {req.assignedToName
                          ? <span className="text-xs font-bold text-emerald-600 dark:text-emerald-500">{req.assignedToName}</span>
                          : <span className="text-slate-300 dark:text-slate-800">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={req.status} /></td>
                      <td className="px-4 py-3 text-gray-400 dark:text-slate-600 text-[11px] font-medium font-mono whitespace-nowrap">
                        {req.createdAt?.toDate?.().toLocaleDateString('th-TH') ?? '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <SLABadge req={req} />
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2 flex-wrap">
                          {canViewFile && (
                            <button onClick={handleOpenFile} title={req.jdFileName || 'ไฟล์ JD'}
                              className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold border rounded-lg transition-all bg-emerald-50 dark:bg-emerald-950/30 text-[#008065] dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 uppercase tracking-tight"
                            >
                              <FileText size={11} strokeWidth={3} /> JD
                            </button>
                          )}
                          {canClaim && (
                            <button onClick={(e) => { e.stopPropagation(); handleClaim(req.id) }} disabled={isBusy}
                              className="flex items-center gap-1.5 px-3 py-1 bg-[#008065] text-white text-[10px] font-bold rounded-lg disabled:opacity-50 transition-all hover:bg-emerald-700 shadow-md shadow-emerald-500/20 uppercase tracking-tight"
                            >
                              {isBusy ? <Loader2 size={11} className="animate-spin" /> : <UserCheck size={11} strokeWidth={3} />}
                              รับเรื่อง
                            </button>
                          )}
                          {canUpdateStatus && (
                            <select
                              value={req.status}
                              onClick={e => e.stopPropagation()}
                              onChange={(e) => {
                                e.stopPropagation()
                                const val = e.target.value
                                if (val === 'Closed') { openConfirm('close', { id: req.id }); return }
                                // Offering → เปิด modal กรอกวันเริ่มงาน
                                if (val === 'Offering') { setOfferingModal({ isOpen: true, id: req.id }); return }
                                handleStatusChange(req.id, val)
                              }}
                              className="text-[10px] font-bold border border-emerald-500/30 rounded-lg px-2 py-1 bg-white dark:bg-slate-900 text-[#008065] dark:text-emerald-400 focus:outline-none cursor-pointer uppercase tracking-tight"
                            >
                              {getAvailableStatuses(req.status).map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          )}
                          {/* Offering → Reject: ผู้สมัครไม่มา */}
                          {isTA && req.status === 'Offering' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleStatusChange(req.id, 'Rejected') }}
                              className="flex items-center gap-1.5 px-2.5 py-1 text-red-600 dark:text-red-400 text-[10px] font-bold border border-red-300 dark:border-red-900/30 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-all uppercase tracking-tight"
                            >
                              <XCircle size={11} strokeWidth={3} /> Reject
                            </button>
                          )}
                          {/* Rejected → Reopen: เปิด recruit ใหม่ */}
                          {isTA && req.status === 'Rejected' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleReopen(req.id) }}
                              className="flex items-center gap-1.5 px-2.5 py-1 text-yellow-700 dark:text-yellow-400 text-[10px] font-bold border border-yellow-300 dark:border-yellow-900/30 rounded-lg hover:bg-yellow-50 dark:hover:bg-yellow-950/20 transition-all uppercase tracking-tight"
                            >
                              <UserCheck size={11} strokeWidth={3} /> Recruit ใหม่
                            </button>
                          )}
                          {canReassign && (
                            reassigningId === req.id ? (
                              <select
                                value=""
                                onClick={e => e.stopPropagation()}
                                onChange={(e) => {
                                  e.stopPropagation()
                                  const selected = allTAs.find(t => t.email === e.target.value)
                                  if (selected) openConfirm('reassign', { id: req.id, email: selected.email, name: selected.name })
                                  else setReassigningId(null)
                                }}
                                onBlur={() => setTimeout(() => setReassigningId(null), 200)}
                                autoFocus
                                className="text-[10px] font-bold border border-emerald-500/30 rounded-lg px-2 py-1 bg-white dark:bg-slate-900 text-[#008065] dark:text-emerald-400 focus:outline-none cursor-pointer"
                              >
                                <option value="">ย้ายไปที่...</option>
                                {allTAs.map(t => (
                                  <option key={t.email} value={t.email}>{t.name}</option>
                                ))}
                              </select>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setReassigningId(req.id) }}
                                className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold border rounded-lg transition-all bg-white dark:bg-slate-900 text-[#008065] dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 uppercase tracking-tight"
                              >
                                <Pencil size={11} strokeWidth={3} />
                                ย้ายคนดูแลเคส
                              </button>
                            )
                          )}
                          {canCancel && (
                            <button onClick={(e) => { e.stopPropagation(); openConfirm('cancel', { id: req.id }) }} disabled={isBusy}
                              className="flex items-center gap-1.5 px-2.5 py-1 text-red-500 dark:text-red-400 text-[10px] font-bold border border-red-200 dark:border-red-900/30 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50 transition-all uppercase tracking-tight"
                            >
                              {isBusy ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} strokeWidth={3} />}
                              ยกเลิก
                            </button>
                          )}
                          {isAdmin && (
                            <button onClick={(e) => { e.stopPropagation(); openConfirm('delete', { id: req.id }) }} disabled={isBusy}
                              className="flex items-center gap-1.5 px-2.5 py-1 text-white bg-red-600 dark:bg-red-700 text-[10px] font-bold rounded-lg hover:bg-red-700 dark:hover:bg-red-800 disabled:opacity-50 transition-all uppercase tracking-tight shadow-sm"
                            >
                              {isBusy ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} strokeWidth={3} />}
                              ลบ
                            </button>
                          )}
                        </div>

                      </td>
                    </tr>

                    {/* Expanded Detail Row */}
                    {isExpanded && (
                      <tr key={`${req.id}-detail`} className="bg-emerald-50/50 dark:bg-emerald-900/10">
                        <td colSpan={9} className="px-6 pb-6 pt-0">
                          <div className="border border-emerald-500/20 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 bg-white dark:bg-slate-900 shadow-xl shadow-emerald-900/5 transition-colors">

                            {/* จำนวน HC + วันที่ */}
                            <div className="flex flex-col gap-5">
                              <div>
                                <p className="text-[10px] font-black text-gray-400 dark:text-slate-600 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                                  <Users size={12} strokeWidth={3} /> จำนวน HC
                                </p>
                                <p className="text-xl font-black text-[#008065] dark:text-emerald-500 tabular-nums">{req.headcount ?? 1} <span className="text-sm font-bold text-gray-400">คน</span></p>
                              </div>
                              {req.startDate && (
                                <div>
                                  <p className="text-[10px] font-black text-gray-400 dark:text-slate-600 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                                    <Calendar size={12} strokeWidth={3} /> วันเริ่มงาน
                                  </p>
                                  <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{req.startDate}</p>
                                </div>
                              )}
                              {req.requestType === 'Replacement' && (
                                <div>
                                  <p className="text-[10px] font-black text-gray-400 dark:text-slate-600 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                                    <Calendar size={12} strokeWidth={3} /> วันที่ลาออก (LWD)
                                  </p>
                                  <p className="text-sm font-extrabold text-gray-700 dark:text-gray-200">{req.targetStartDate || '—'}</p>
                                </div>
                              )}
                              {req.requestType === 'Replacement' && req.replacementFor && (
                                <div>
                                  <p className="text-[10px] font-black text-gray-400 dark:text-slate-600 uppercase tracking-widest mb-2">ทดแทนพนักงานเดิม</p>
                                  <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-500 drop-shadow-sm">{req.replacementFor}</p>
                                </div>
                              )}
                            </div>

                            {/* เหตุผล */}
                            <div>
                              <p className="text-[10px] font-black text-gray-400 dark:text-slate-600 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                                <AlignLeft size={12} strokeWidth={3} /> เหตุผลในการขอ
                              </p>
                              <div className="bg-gray-50 dark:bg-slate-800/50 p-3 rounded-xl border border-gray-100 dark:border-slate-800">
                                <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap italic font-medium">"{req.reason || '—'}"</p>
                              </div>
                            </div>

                            {/* Requirements */}
                            <div>
                              <p className="text-[10px] font-black text-gray-400 dark:text-slate-600 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                                <ClipboardList size={12} strokeWidth={3} /> Requirements
                              </p>
                              <div className="bg-gray-50 dark:bg-slate-800/50 p-3 rounded-xl border border-gray-100 dark:border-slate-800">
                                <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap font-medium">{req.requirements || '—'}</p>
                              </div>
                            </div>

                            {/* Meta */}
                            <div className="flex flex-col gap-5">
                              <div>
                                <p className="text-[10px] font-black text-gray-400 dark:text-slate-600 uppercase tracking-widest mb-2">ข้อมูลผู้ยื่น</p>
                                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{req.requesterName}</p>
                                <p className="text-[11px] font-bold text-gray-400 dark:text-slate-600 transition-colors hover:text-[#008065]">{req.requesterEmail}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-black text-gray-400 dark:text-slate-600 uppercase tracking-widest mb-2">Timestamp</p>
                                <p className="text-sm font-bold text-gray-500 dark:text-slate-400 font-mono italic">
                                  {req.createdAt?.toDate?.().toLocaleString('th-TH') ?? '—'}
                                </p>
                              </div>
                              {req.jdFileName && (
                                <div>
                                  <p className="text-[10px] font-black text-gray-400 dark:text-slate-600 uppercase tracking-widest mb-2">ไฟล์ Job Description</p>
                                  <button
                                    onClick={handleOpenFile}
                                    className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl border-2 font-black transition-all bg-emerald-50 dark:bg-emerald-950/30 text-[#008065] dark:text-emerald-400 border-emerald-500/20 hover:border-emerald-500 shadow-sm uppercase tracking-tighter"
                                  >
                                    <FileText size={14} strokeWidth={3} /> {req.jdFileName}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmModal
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        {...getConfirmContent()}
      />

      {/* ── Offering Modal: กรอกวันเริ่มงาน ── */}
      {offeringModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-black text-gray-800 dark:text-gray-100 mb-1">Offering</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-5">กรุณากรอกวันเริ่มงานของผู้สมัคร</p>
            <label className="block text-[10px] font-black text-gray-500 dark:text-slate-500 uppercase tracking-widest mb-2">วันเริ่มงาน</label>
            <input
              type="date"
              value={offeringStartDate}
              onChange={(e) => setOfferingStartDate(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-sm font-medium"
              autoFocus
            />
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setOfferingModal({ isOpen: false, id: null }); setOfferingStartDate('') }}
                className="flex-1 px-4 py-2.5 text-sm font-bold rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleOfferingConfirm}
                disabled={!offeringStartDate}
                className="flex-1 px-4 py-2.5 text-sm font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-md shadow-indigo-500/20"
              >
                ยืนยัน Offering
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
