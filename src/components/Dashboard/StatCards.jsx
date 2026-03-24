import { Inbox, UserCheck, CheckCircle, Clock, Timer } from 'lucide-react'

const STAT_CONFIG = [
  {
    key: 'open',
    label: 'Open',
    labelTh: 'รออนุมัติ',
    icon: Inbox,
    color: 'text-yellow-600 dark:text-yellow-500',
    bg: 'bg-yellow-50 dark:bg-yellow-500/10',
    border: 'border-yellow-200 dark:border-yellow-500/20',
  },
  {
    key: 'assigned',
    label: 'In Progress',
    labelTh: 'กำลังดำเนินการ',
    icon: UserCheck,
    color: 'text-blue-600 dark:text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    border: 'border-blue-200 dark:border-blue-500/20',
  },
  {
    key: 'closed',
    label: 'Closed',
    labelTh: 'เสร็จสิ้น',
    icon: CheckCircle,
    color: 'text-green-600 dark:text-green-500',
    bg: 'bg-green-50 dark:bg-green-500/10',
    border: 'border-green-200 dark:border-green-500/20',
  },
  {
    key: 'total',
    label: 'Total',
    labelTh: 'ทั้งหมด',
    icon: Clock,
    color: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-800/50',
    border: 'border-slate-200 dark:border-slate-800',
  },
  {
    key: 'avgDaysToFill',
    label: 'Avg Fill Time',
    labelTh: 'เฉลี่ยวันปิดเคส',
    icon: Timer,
    color: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-50 dark:bg-purple-500/10',
    border: 'border-purple-200 dark:border-purple-500/20',
    suffix: ' วัน',
  },
]

export default function StatCards({ stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {STAT_CONFIG.map((card) => {
        const value = stats[card.key]
        const display = value === null || value === undefined
          ? card.key === 'avgDaysToFill' ? '—' : '0'
          : `${value}${card.suffix ?? ''}`
        return (
          <div
            key={card.key}
            className={`rounded-xl border ${card.border} ${card.bg} p-5 flex flex-col gap-2 transition-colors`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">{card.label}</span>
              <card.icon size={18} className={card.color} />
            </div>
            <p className={`text-4xl font-black tracking-tight ${card.color}`}>{display}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 uppercase font-semibold tracking-wider font-mono">{card.labelTh}</p>
          </div>
        )
      })}
    </div>
  )
}
