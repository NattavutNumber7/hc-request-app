/**
 * AppHelpers.jsx — Shared utility components: RoleSwitcher, RoleGuard, MaintenancePage
 * ─────────────────────────────────────────────────────────────────────────────
 * ไฟล์นี้รวม component ที่ใช้ร่วมกันทั่วทั้งแอปไว้ 3 ตัว:
 *
 *   RoleSwitcher  — เครื่องมือสำหรับ dev ใช้สลับ role/dept โดยไม่ต้องแก้ Firebase
 *                   แสดงผลเฉพาะเมื่อมี VITE_DEV_EMAIL กำหนดใน .env เท่านั้น
 *
 *   RoleGuard     — Route guard ครอบ protected pages
 *                   redirect ผู้ใช้ไปหน้าอื่นหาก role ไม่อยู่ใน allowed list
 *
 *   MaintenancePage — หน้า full-screen สำหรับแจ้ง maintenance mode
 *                     แสดงให้ผู้ใช้ที่ไม่ใช่ admin เห็นเมื่อระบบปิดปรับปรุง
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Navigate } from 'react-router-dom'
import { Settings2, PowerOff } from 'lucide-react'

// อ่านค่า VITE_DEV_EMAIL จาก .env — ถ้าไม่มีค่า RoleSwitcher จะไม่แสดง
const DEV_EMAIL = import.meta.env.VITE_DEV_EMAIL

/**
 * RoleSwitcher — Dev-only floating panel for switching role and department
 * ─────────────────────────────────────────────────────────────────────────────
 * Widget ลอยมุมขวาล่างสำหรับ developer ใช้ทดสอบ UI ในแต่ละ role
 * โดยไม่ต้องเปลี่ยนข้อมูลใน Firebase หรือ login ด้วย account อื่น
 * จะ render null ทันทีหาก VITE_DEV_EMAIL ไม่ได้กำหนดใน .env
 *
 * Props:
 *   currentRole  {string}   role ที่ active อยู่ตอนนี้ ('manager' | 'ta' | 'admin')
 *   onSwitch     {function} callback(role: string) เมื่อกดเปลี่ยน role
 *   currentDept  {string}   dept override ที่ใช้อยู่ตอนนี้
 *   onDeptSwitch {function} callback(dept: string) เมื่อพิมพ์ dept ใหม่
 */
export function RoleSwitcher({ currentRole, onSwitch, currentDept, onDeptSwitch }) {
  // ซ่อน widget ทั้งหมดเมื่อไม่ได้อยู่ใน dev mode
  if (!DEV_EMAIL) return null
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 scale-90 sm:scale-100 origin-bottom-right">
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-2 shadow-2xl flex flex-col gap-1 ring-4 ring-emerald-500/10">
        <div className="px-3 py-1.5 border-b border-gray-50 dark:border-slate-800 mb-1 flex items-center gap-2">
          <Settings2 size={14} className="text-emerald-500" />
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Dev Switcher</span>
        </div>

        {/* Role Switch — กดเพื่อ mock role โดยไม่ผ่าน Firebase */}
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

        {/* Dept Override — พิมพ์ชื่อแผนกเพื่อ mock department โดยไม่ผ่าน Firebase */}
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

/**
 * RoleGuard — Route guard that blocks access based on role
 * ─────────────────────────────────────────────────────────────────────────────
 * ครอบ protected route — หาก role ของผู้ใช้ไม่อยู่ใน allowed list
 * จะ redirect ไปที่ redirectTo แทนที่จะ render children
 * render null ในระหว่างที่ role ยังโหลดไม่เสร็จ (role เป็น falsy)
 *
 * Props:
 *   role       {string}    role ของผู้ใช้ที่ login อยู่
 *   allowed    {string[]}  รายการ role ที่มีสิทธิ์เข้าหน้านี้ได้
 *   children   {ReactNode} component ที่จะ render เมื่อผ่าน guard
 *   redirectTo {string}    path ที่จะ redirect ไปหาก role ไม่ผ่าน
 */
export function RoleGuard({ role, allowed, children, redirectTo }) {
  // รอ role โหลดเสร็จก่อน เพื่อไม่ redirect ผิดพลาดระหว่าง init
  if (!role) return null
  if (allowed.includes(role)) return children
  return <Navigate to={redirectTo} replace />
}

/**
 * MaintenancePage — Full-screen maintenance mode page
 * ─────────────────────────────────────────────────────────────────────────────
 * หน้า full-screen แสดงให้ผู้ใช้ที่ไม่ใช่ admin เห็นเมื่อระบบปิดปรับปรุง
 * แสดง icon, ข้อความหัว "ระบบปิดปรับปรุง" และ message ที่รับมาจาก props
 *
 * Props:
 *   message {string} ข้อความอธิบายเพิ่มเติม (optional)
 *                    หากไม่ส่งจะแสดง default message
 */
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
