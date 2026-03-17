import { useEffect, useState, useMemo } from 'react'
import { collection, onSnapshot, orderBy, query, doc, updateDoc } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { sendStatusUpdate } from '../../services/webhook'
import { logAudit } from '../../services/auditLog'
import { Loader2, UserCheck, XCircle, ChevronUp, ChevronDown, ChevronsUpDown, SlidersHorizontal, X, FileText, Search, ChevronRight, Users, Calendar, AlignLeft, ClipboardList } from 'lucide-react'
import { getJDSignedUrl } from '../../services/supabase'

// Freshket brand colors
const STATUS_CONFIG = {
  Open:         { label: 'Open',         bg: 'bg-yellow-50 dark:bg-yellow-500/10',     text: 'text-yellow-700 dark:text-yellow-500',   border: 'border-yellow-200 dark:border-yellow-500/20' },
  Recruiting:   { label: 'Recruiting',   bg: 'bg-emerald-50 dark:bg-emerald-500/10',   text: 'text-emerald-700 dark:text-emerald-500', border: 'border-emerald-200 dark:border-emerald-500/20' },
  Interviewing: { label: 'Interviewing', bg: 'bg-orange-50 dark:bg-orange-500/10',     text: 'text-orange-700 dark:text-orange-500',   border: 'border-orange-200 dark:border-orange-500/20' },
  Offering:     { label: 'Offering',     bg: 'bg-indigo-50 dark:bg-indigo-500/10',     text: 'text-indigo-700 dark:text-indigo-500',   border: 'border-indigo-200 dark:border-indigo-500/20' },
  Closed:       { label: 'Closed',       bg: 'bg-slate-100 dark:bg-slate-800',         text: 'text-slate-700 dark:text-slate-400',     border: 'border-slate-200 dark:border-slate-700' },
  Cancelled:    { label: 'Cancelled',    bg: 'bg-gray-50 dark:bg-slate-900',           text: 'text-gray-500 dark:text-slate-500',     border: 'border-gray-200 dark:border-slate-800' },
}

const STATUS_TABS = ['ทั้งหมด', 'Open', 'Recruiting', 'Interviewing', 'Offering', 'Closed', 'Cancelled']
const TA_STATUSES = ['Recruiting', 'Interviewing', 'Offering', 'Closed']
const ALL_STATUSES = ['Open', 'Recruiting', 'Interviewing', 'Offering', 'Closed', 'Cancelled']

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border} uppercase tracking-wider`}>
      {cfg.label}
    </span>
  )
}

function SortIcon({ field, sortField, sortDir }) {
  if (sortField !== field) return <ChevronsUpDown size={12} className="text-gray-300" />
  return sortDir === 'asc'
    ? <ChevronUp size={12} style={{ color: '#008065' }} />
    : <ChevronDown size={12} style={{ color: '#008065' }} />
}

export default function RequestTable({
  user, role, onStatsChange,
  filterMine = false, filterMyCases = false, showFilters = false,
}) {
  const [requests, setRequests]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [updating, setUpdating]     = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [search, setSearch]         = useState('')
  const [activeTab, setActiveTab]   = useState('ทั้งหมด')
  const [filterDept, setFilterDept] = useState('')
  const [filterAssigned, setFilterAssigned] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo]     = useState('')
  const [showFilterBar, setShowFilterBar]   = useState(false)
  const [sortField, setSortField]   = useState('createdAt')
  const [sortDir, setSortDir]       = useState('desc')

  useEffect(() => {
    const q = query(collection(db, 'hc_requests'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      setRequests(data)
      setLoading(false)
      const active = data.filter((r) => r.status !== 'Cancelled')
      onStatsChange?.(
        {
          open:     active.filter((r) => r.status === 'Open').length,
          assigned: active.filter((r) => ['Recruiting', 'Interviewing', 'Offering'].includes(r.status)).length,
          closed:   active.filter((r) => r.status === 'Closed').length,
          total:    active.length,
        },
        data
      )
    })
  }, [onStatsChange])

  async function handleCancel(id) {
    setUpdating(id)
    const req = requests.find((r) => r.id === id)
    await updateDoc(doc(db, 'hc_requests', id), { status: 'Cancelled' })
    sendStatusUpdate(id, 'Cancelled')
    logAudit({ requestId: id, action: 'Cancel', by: user.email, byName: user.displayName, fromStatus: req?.status, toStatus: 'Cancelled', position: req?.position, department: req?.department })
    setUpdating(null)
  }

  async function handleClaim(id) {
    setUpdating(id)
    const req = requests.find((r) => r.id === id)
    await updateDoc(doc(db, 'hc_requests', id), { status: 'Recruiting', assignedTo: user.email, assignedToName: user.displayName })
    sendStatusUpdate(id, 'Recruiting', user.displayName)
    logAudit({ requestId: id, action: 'Assign', by: user.email, byName: user.displayName, fromStatus: req?.status, toStatus: 'Recruiting', position: req?.position, department: req?.department })
    setUpdating(null)
  }

  async function handleStatusChange(id, newStatus) {
    const req = requests.find((r) => r.id === id)
    await updateDoc(doc(db, 'hc_requests', id), { status: newStatus })
    sendStatusUpdate(id, newStatus)
    logAudit({ requestId: id, action: 'StatusChange', by: user.email, byName: user.displayName, fromStatus: req?.status, toStatus: newStatus, position: req?.position, department: req?.department })
  }

  function toggleSort(field) {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const departments = useMemo(() => [...new Set(requests.map((r) => r.department).filter(Boolean))].sort(), [requests])
  const assignees   = useMemo(() => [...new Set(requests.map((r) => r.assignedToName).filter(Boolean))].sort(), [requests])

  // Tab counts
  const tabCounts = useMemo(() => {
    const base = filterMine ? requests.filter(r => r.requesterEmail === user.email)
                : filterMyCases ? requests.filter(r => r.assignedTo === user.email)
                : requests
    const counts = { ทั้งหมด: base.length }
    ALL_STATUSES.forEach(s => { counts[s] = base.filter(r => r.status === s).length })
    return counts
  }, [requests, filterMine, filterMyCases, user.email])

  const displayed = useMemo(() => {
    let list = [...requests]
    if (filterMine)    list = list.filter((r) => r.requesterEmail === user.email)
    if (filterMyCases) list = list.filter((r) => r.assignedTo === user.email)
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
  }, [requests, filterMine, filterMyCases, activeTab, filterDept, filterAssigned, filterDateFrom, filterDateTo, search, sortField, sortDir, user.email])

  const hasAdvancedFilters = filterDept || filterAssigned || filterDateFrom || filterDateTo

  function clearAdvanced() { setFilterDept(''); setFilterAssigned(''); setFilterDateFrom(''); setFilterDateTo('') }

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
      <Loader2 size={20} className="animate-spin" style={{ color: '#008065' }} />
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
            <button onClick={() => { clearAdvanced(); setSearch(''); setActiveTab('ทั้งหมด') }} className="text-sm mt-2 hover:underline" style={{ color: '#008065' }}>
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
                const isOwner  = req.requesterEmail === user.email
                const isTA     = role === 'ta' || role === 'admin'
                const isAdmin  = role === 'admin'
                const isExpanded      = expandedId === req.id
                const canViewFile     = req.jdFilePath && (isTA || isOwner)
                const canCancel       = (isOwner || isAdmin) && req.status === 'Open'
                const canClaim        = isTA && req.status === 'Open'
                const canUpdateStatus = isTA && !['Open', 'Closed', 'Cancelled'].includes(req.status)
                const isBusy          = updating === req.id

                async function handleOpenFile(e) {
                  e.stopPropagation()
                  const url = await getJDSignedUrl(req.jdFilePath)
                  if (url) window.open(url, '_blank')
                }

                return (
                  <>
                    <tr
                      key={req.id}
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
                              onChange={(e) => { e.stopPropagation(); handleStatusChange(req.id, e.target.value) }}
                              className="text-[10px] font-bold border border-emerald-500/30 rounded-lg px-2 py-1 bg-white dark:bg-slate-900 text-[#008065] dark:text-emerald-400 focus:outline-none cursor-pointer uppercase tracking-tight"
                            >
                              {TA_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          )}
                          {canCancel && (
                            <button onClick={(e) => { e.stopPropagation(); handleCancel(req.id) }} disabled={isBusy}
                              className="flex items-center gap-1.5 px-2.5 py-1 text-red-500 dark:text-red-400 text-[10px] font-bold border border-red-200 dark:border-red-900/30 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50 transition-all uppercase tracking-tight"
                            >
                              {isBusy ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} strokeWidth={3} />}
                              ยกเลิก
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
                              <div>
                                <p className="text-[10px] font-black text-gray-400 dark:text-slate-600 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                                  <Calendar size={12} strokeWidth={3} />
                                  {req.requestType === 'Replacement' ? 'วันที่ลาออก (LWD)' : 'วันที่รับคนเข้า'}
                                </p>
                                <p className="text-sm font-extrabold text-gray-700 dark:text-gray-200">{req.targetStartDate || '—'}</p>
                              </div>
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
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
