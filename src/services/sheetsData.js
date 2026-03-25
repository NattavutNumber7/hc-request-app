import { resolveDeptNames } from '../data/deptMapping'

let cache = null
let cacheTime = null
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 นาที

export async function fetchSheetsData() {
  const now = Date.now()
  if (cache && cacheTime && now - cacheTime < CACHE_TTL_MS) return cache

  const url = import.meta.env.VITE_GAS_DATA_URL
  if (!url) {
    console.warn('VITE_GAS_DATA_URL not set')
    return { managers: {}, positions: [], employees: {} }
  }

  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    cache = data
    cacheTime = now
    return data
  } catch (err) {
    console.error('Failed to fetch sheets data:', err)
    // คืน cache เก่าถ้ามี ไม่งั้นคืนค่าว่าง (ไม่ save cache เพื่อให้ retry ครั้งถัดไป)
    return cache ?? { managers: {}, positions: [], employees: {} }
  }
}

export function getDepartmentByEmail(managers, email) {
  if (!email || !managers) return ''
  return managers[email.trim()] ?? ''
}

// รองรับ section เพื่อ narrow down Distribution Center (ANR/LKB/IYR)
export function getEmployeesByDepartment(employees, department, section = '') {
  if (!employees || !department) return []
  const deptNames = resolveDeptNames(department, section)
  // รวม employees จากทุก mapped department แล้ว dedupe
  const all = deptNames.flatMap((d) => employees[d] ?? [])
  return [...new Set(all)]
}

export function getPositionsByDepartment(positions, department) {
  if (!positions || !department) return []
  const deptNames = resolveDeptNames(department)
  const all = deptNames.flatMap((d) => positions[d] ?? [])
  return [...new Set(all)].sort((a, b) => a.localeCompare(b))
}
