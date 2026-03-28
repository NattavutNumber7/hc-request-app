import { Navigate } from 'react-router-dom'
import { Settings2, PowerOff } from 'lucide-react'

const DEV_EMAIL = import.meta.env.VITE_DEV_EMAIL

// ─── Dev Tool: แสดงเฉพาะเมื่อมี VITE_DEV_EMAIL ใน .env (ใช้ test role/dept) ───
export function RoleSwitcher({ currentRole, onSwitch, currentDept, onDeptSwitch }) {
  if (!DEV_EMAIL) return null
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 scale-90 sm:scale-100 origin-bottom-right">
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-2 shadow-2xl flex flex-col gap-1 ring-4 ring-emerald-500/10">
        <div className="px-3 py-1.5 border-b border-gray-50 dark:border-slate-800 mb-1 flex items-center gap-2">
          <Settings2 size={14} className="text-emerald-500" />
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Dev Switcher</span>
        </div>

        {/* Role Switch */}
        <div className="flex flex-col gap-1 mb-2 px-1">
          <span className="text-[9px] font-bold text-gray-400 uppercase ml-1 mb-0.5">Roles</span>
          <div className="flex gap-1">
            {['manager', 'ta', 'admin'].map((r) => (
              <button
                key={r}
                onClick={() => onSwitch(r)}
                className={`flex-1 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all uppercase tracking-tight ${
                  currentRole === r
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30'
                    : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-800'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Dept Override */}
        <div className="flex flex-col gap-1 px-1">
          <span className="text-[9px] font-bold text-gray-400 uppercase ml-1 mb-0.5">Dept Override</span>
          <input
            type="text"
            value={currentDept}
            onChange={(e) => onDeptSwitch(e.target.value)}
            id="dev-dept-override" name="dev-dept-override"
            placeholder="Enter Dept..."
            className="w-full px-3 py-2 text-[11px] font-bold rounded-xl border border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
      </div>
    </div>
  )
}

// ─── Guard: ป้องกันการเข้าหน้าที่ไม่มีสิทธิ์ → redirect ไปหน้าที่กำหนด ───
export function RoleGuard({ role, allowed, children, redirectTo }) {
  if (!role) return null
  if (allowed.includes(role)) return children
  return <Navigate to={redirectTo} replace />
}

// ─── Maintenance Mode Page ───────────────────────────────────────────────────
export function MaintenancePage({ message }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f7f6] dark:bg-slate-950 px-6">
      <div className="text-center flex flex-col items-center gap-6 max-w-md">
        <div className="w-20 h-20 rounded-3xl bg-orange-100 dark:bg-orange-500/10 flex items-center justify-center">
          <PowerOff size={36} className="text-orange-500" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-800 dark:text-gray-100 tracking-tight">ระบบปิดปรับปรุง</h1>
          <p className="text-gray-500 dark:text-slate-400 mt-2 text-sm leading-relaxed">
            {message || 'กำลังดำเนินการปรับปรุงระบบ กรุณารอสักครู่แล้วลองใหม่อีกครั้ง'}
          </p>
        </div>
        <p className="text-xs text-gray-400 dark:text-slate-600 font-mono">HC Request System — Maintenance Mode</p>
      </div>
    </div>
  )
}
