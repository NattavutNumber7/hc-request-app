import { useState, useRef } from 'react'
import { doc, collection, writeBatch } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { FolderOpen, Plus, Settings2 } from 'lucide-react'
import Layout from '../Shared/Layout'

const STATUS_MAP = {
  'onboard': 'Closed',
  'pending onboard': 'Onboarding',
  'offering': 'Offering',
  'interviewing': 'Interviewing',
  'in progress': 'Recruiting',
  'cancelled': 'Cancelled',
  'rejected': 'Recruiting',
}

// PIC name → Firestore email (เพิ่มได้เรื่อยๆ)
const PIC_EMAIL_MAP = {
  'jitlada (mo)':    'jitlada.m@freshket.co',
  'jiratcha (belle)': 'jiratcha.a@freshket.co',
}

function picToEmail(name) {
  return PIC_EMAIL_MAP[name.toLowerCase().trim()] || ''
}

const TYPE_MAP = {
  'replacement': 'Replacement',
  'replace': 'Replacement',
  'new hc': 'New HC',
  'new': 'New HC',
}

const STATUS_COLOR = {
  Closed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  Onboarding: 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  Offering: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  Recruiting: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Interviewing: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Cancelled: 'bg-slate-100 text-slate-500',
}

export default function ImportPage({ user, role, isDarkMode, toggleDarkMode }) {
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(0)
  const [errors, setErrors] = useState([])
  const [done, setDone] = useState(false)
  const fileRef = useRef(null)

  function processRawRows(raw, file) {
    console.log('[Import] raw rows:', raw.length, '| sample keys:', raw[0] ? Object.keys(raw[0]) : 'empty')

    const filtered = raw.filter(r => {
      // รองรับหลาย column name ที่เป็นวันที่เปิด
      const dt = r['Open Jobs'] || r['Offer Year'] || r['Progress Year'] ||
                 r['Offering Date'] || r['Start Progress Date'] || ''
      if (dt instanceof Date) return dt.getFullYear() === 2026
      if (typeof dt === 'string' && dt) {
        // "6-Jan-2026", "2026-01-06", "1/6/2026" ฯลฯ
        return dt.includes('2026')
      }
      if (typeof dt === 'number') {
        // Excel serial date — แปลงเป็น Date แล้วเช็คปี
        const d = new Date(Math.round((dt - 25569) * 86400 * 1000))
        return d.getFullYear() === 2026
      }
      return false
    })
    console.log('[Import] filtered (2026 only):', filtered.length)

    const mapped = filtered.map((r, i) => {
      const rawStatus = (r['Status'] || '').toString().toLowerCase().trim()
      const rawType = (r['Job Type'] || r['Emp. Type'] || '').toString().toLowerCase().trim()

      // วันเปิด request (column "Open Jobs") → createdAt
      const openDate = r['Open Jobs'] || r['Start Progress Date'] || ''
      // วันเริ่มงาน (column "Onboard Date") → startDate เท่านั้น ห้ามปน Offering Date
      const onboardDate = r['Onboard Date'] || r['Onboarded Date'] || ''

      function toDate(val) {
        if (val instanceof Date) return val
        if (typeof val === 'string' && val) return new Date(val)
        return null
      }

      const createdAt = toDate(openDate) || new Date('2026-01-01')
      const startDateObj = toDate(onboardDate)

      return {
        _rowNum: i + 1,
        position: (r['Position'] || r['Positions'] || '').toString().trim(),
        department: (r['Department'] || '').toString().trim(),
        section: (r['Business Unit'] || '').toString().trim(),
        jg: (r['Rank'] || '').toString().trim(),
        assignedToName: (r['PIC'] || '').toString().trim(),
        status: STATUS_MAP[rawStatus] || 'Closed',
        candidateName: (r['Offered Candidate'] || r['Candidate Name-Surname'] || '').toString().trim(),
        startDate: startDateObj ? startDateObj.toISOString().slice(0, 10) : '',
        requestType: TYPE_MAP[rawType] || 'New HC',
        hcId: (r['HCID'] || r['HcID'] || '').toString().trim(),
        createdAt,
        closedAt: rawStatus === 'onboard' ? (startDateObj || createdAt) : null,
      }
    }).filter(r => r.position)

    console.log('[Import] mapped rows (non-empty position):', mapped.length)
    if (mapped.length === 0) console.warn('[Import] ⚠️ 0 rows — ตรวจสอบ column names และ year filter')

    setRows(mapped)
    setFileName(file.name)
    setDone(false)
    setImported(0)
    setErrors([])
  }

  function parseFile(file) {
    const isCsv = file.name.toLowerCase().endsWith('.csv')
    console.log('[Import] parseFile:', file.name, isCsv ? 'CSV' : 'Excel')
    const reader = new FileReader()
    reader.onerror = (e) => console.error('[Import] FileReader error:', e)

    reader.onload = async (e) => {
      try {
        const mod = await import('xlsx')
        const XLSX = mod.default ?? mod

        let raw
        if (isCsv) {
          // CSV: parse as string
          const wb = XLSX.read(e.target.result, { type: 'string', cellDates: true })
          const ws = wb.Sheets[wb.SheetNames[0]]
          raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
          console.log('[Import] CSV sheet:', wb.SheetNames[0])
        } else {
          // Excel: pick correct sheet
          const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
          console.log('[Import] workbook sheets:', wb.SheetNames)
          const sheetName =
            wb.SheetNames.find(s => /job opening.*(20\d\d)/i.test(s)) ||
            wb.SheetNames.find(s => s.toLowerCase().includes('job opening')) ||
            wb.SheetNames[0]
          console.log('[Import] using sheet:', sheetName)
          const ws = wb.Sheets[sheetName]
          raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
        }

        processRawRows(raw, file)
      } catch (err) {
        console.error('[Import] ❌ parse error:', err)
        alert('อ่านไฟล์ไม่ได้: ' + err.message)
      }
    }

    if (isCsv) {
      reader.readAsText(file, 'UTF-8')
    } else {
      reader.readAsArrayBuffer(file)
    }
  }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    parseFile(file)
  }

  async function handleImport() {
    if (!rows.length) return
    setImporting(true)
    setErrors([])
    let count = 0
    const errs = []
    const BATCH_SIZE = 400
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE)
      const batch = writeBatch(db)
      chunk.forEach(r => {
        const ref = doc(collection(db, 'hc_requests'))
        batch.set(ref, {
          position: r.position,
          department: r.department,
          section: r.section,
          jg: r.jg,
          assignedToName: r.assignedToName,
          assignedTo: picToEmail(r.assignedToName),
          status: r.status,
          candidateName: r.candidateName,
          startDate: r.startDate,
          requestType: r.requestType,
          hcId: r.hcId,
          headcount: 1,
          reason: 'นำเข้าข้อมูลย้อนหลัง',
          requirements: '',
          requesterName: 'Imported',
          requesterEmail: user.email,
          createdAt: r.createdAt,
          closedAt: r.closedAt || null,
          statusHistory: [{ status: r.status, changedAt: r.createdAt.toISOString(), changedByName: 'Import', changedBy: user.email }],
          importedAt: new Date(),
          importedBy: user.email,
        })
      })
      try {
        await batch.commit()
        count += chunk.length
        setImported(count)
      } catch (err) {
        errs.push(`Batch ${i / BATCH_SIZE + 1}: ${err.message}`)
      }
    }
    setErrors(errs)
    setImporting(false)
    setDone(true)
  }

  return (
    <Layout user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode}>
      <div className="max-w-5xl mx-auto py-8 px-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/20"><FolderOpen size={20} className="text-blue-600 dark:text-blue-400"/></div>
          <div>
            <h1 className="text-lg font-black text-gray-900 dark:text-gray-100">Import ข้อมูลย้อนหลัง</h1>
            <p className="text-xs text-gray-500 dark:text-slate-400">รองรับ Excel (.xlsx) และ CSV (.csv) — กรองเฉพาะปี 2026</p>
          </div>
        </div>

        {!rows.length && !done && (
          <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 dark:border-slate-700 rounded-2xl cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors">
            <FolderOpen size={32} className="text-gray-300 dark:text-slate-600 mb-3"/>
            <p className="text-sm font-bold text-gray-500 dark:text-slate-400">คลิกหรือลากไฟล์มาวาง</p>
            <p className="text-xs text-gray-400 dark:text-slate-600 mt-1">.xlsx หรือ .csv</p>
            <input id="import-file" name="import-file" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} ref={fileRef}/>
          </label>
        )}

        {rows.length > 0 && !done && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-black text-gray-700 dark:text-gray-200">{fileName}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">พบ <span className="font-black text-blue-600 dark:text-blue-400">{rows.length}</span> รายการปี 2026</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setRows([]); setFileName('') }}
                  className="px-3 py-1.5 text-xs font-bold rounded-xl border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                  เปลี่ยนไฟล์
                </button>
                <button onClick={handleImport} disabled={importing}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-black rounded-xl bg-[#008065] text-white hover:bg-[#006b54] transition-colors shadow-md shadow-emerald-500/20 disabled:opacity-60">
                  {importing ? <><Settings2 size={12} className="animate-spin"/> กำลัง Import {imported}/{rows.length}</> : <><Plus size={12}/> Import {rows.length} รายการ</>}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden">
              <div className="overflow-x-auto max-h-[480px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                    <tr>
                      {['#','ตำแหน่ง','แผนก','JG','TA (PIC)','Status','Candidate','วันเริ่ม'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {rows.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                        <td className="px-3 py-2 text-gray-400 dark:text-slate-600 tabular-nums">{r._rowNum}</td>
                        <td className="px-3 py-2 font-bold text-gray-800 dark:text-gray-200 max-w-[160px] truncate">{r.position}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-slate-400 max-w-[120px] truncate">{r.department}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-slate-500">{r.jg}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-slate-400">{r.assignedToName}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex px-2 py-0.5 rounded-full font-bold text-[10px] ${STATUS_COLOR[r.status] || ''}`}>{r.status}</span>
                        </td>
                        <td className="px-3 py-2 text-gray-600 dark:text-slate-400 max-w-[120px] truncate">{r.candidateName}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-slate-500 whitespace-nowrap">{r.startDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {done && (
          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-8 text-center">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">Import เสร็จสมบูรณ์</p>
            <p className="text-sm text-emerald-600 dark:text-emerald-500 mt-1">นำเข้าแล้ว <span className="font-black">{imported}</span> รายการเข้า Firestore</p>
            {errors.length > 0 && (
              <div className="mt-4 text-left bg-red-50 dark:bg-red-900/20 rounded-xl p-3">
                {errors.map((e, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400">{e}</p>)}
              </div>
            )}
            <button onClick={() => { setRows([]); setFileName(''); setDone(false); setImported(0) }}
              className="mt-5 px-5 py-2 text-sm font-bold rounded-xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors">
              Import ไฟล์ใหม่
            </button>
          </div>
        )}
      </div>
    </Layout>
  )
}
