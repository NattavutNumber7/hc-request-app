const STATUS_COLOR = {
  Open: 'bg-yellow-400',
  Recruiting: 'bg-blue-400',
  Interviewing: 'bg-purple-400',
  Offering: 'bg-orange-400',
  Closed: 'bg-green-400',
}

const MONTH_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

export default function MonthlyPipeline({ requests }) {
  // กลุ่มตาม เดือน/ปี เฉพาะ 6 เดือนล่าสุด
  const byMonth = {}
  requests
    .filter((r) => r.status !== 'Cancelled')
    .forEach((r) => {
      const date = r.createdAt?.toDate?.()
      if (!date) return
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      if (!byMonth[key]) byMonth[key] = { total: 0, Open: 0, Recruiting: 0, Interviewing: 0, Offering: 0, Closed: 0 }
      byMonth[key][r.status] = (byMonth[key][r.status] || 0) + 1
      byMonth[key].total += 1
    })

  const months = Object.keys(byMonth).sort().slice(-6)
  const maxTotal = Math.max(...months.map((m) => byMonth[m].total), 1)

  if (months.length === 0) return null

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm transition-colors">
      <h3 className="text-base font-bold text-gray-800 dark:text-gray-100 italic tracking-tight mb-1">Monthly Pipeline</h3>
      <p className="text-xs text-gray-400 dark:text-slate-500 font-medium mb-6 uppercase tracking-wider">จำนวนคำขอรายเดือน (6 เดือนล่าสุด)</p>

      <div className="flex items-end gap-3 h-32 mb-2">
        {months.map((key) => {
          const d = byMonth[key]
          const [year, month] = key.split('-')
          const heightPct = (d.total / maxTotal) * 100
          return (
            <div key={key} className="flex flex-col items-center gap-1.5 flex-1 group">
              <span className="text-[10px] font-black text-gray-500 dark:text-slate-400 transition-transform group-hover:scale-110">{d.total}</span>
              <div className="w-full flex flex-col-reverse rounded-lg overflow-hidden border border-transparent dark:group-hover:border-slate-700 transition-all shadow-sm" style={{ height: `${Math.max(heightPct, 12)}%`, minHeight: '12px' }}>
                {Object.entries(STATUS_COLOR).map(([status, color]) =>
                  d[status] > 0 ? (
                    <div
                      key={status}
                      title={`${status}: ${d[status]}`}
                      className={`w-full transition-opacity group-hover:opacity-90 ${color}`}
                      style={{ flex: d[status] }}
                    />
                  ) : null
                )}
              </div>
              <div className="flex flex-col items-center leading-none mt-1">
                <span className="text-[10px] font-bold text-gray-600 dark:text-slate-500">{MONTH_TH[Number(month) - 1]}</span>
                <span className="text-[9px] font-bold text-gray-300 dark:text-slate-700">{year}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-6 pt-5 border-t border-gray-50 dark:border-slate-800">
        {Object.entries(STATUS_COLOR).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded ${color} shadow-sm`} />
            <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-tight">{status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
