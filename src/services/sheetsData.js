let cache = null

export async function fetchSheetsData() {
  if (cache) return cache

  const url = import.meta.env.VITE_GAS_DATA_URL
  if (!url) {
    console.warn('VITE_GAS_DATA_URL not set')
    return { managers: {}, positions: [] }
  }

  try {
    const res = await fetch(url)
    const data = await res.json()
    cache = data
    return data
  } catch (err) {
    console.error('Failed to fetch sheets data:', err)
    return { managers: {}, positions: [] }
  }
}

export function getDepartmentByEmail(managers, email) {
  if (!email || !managers) return ''
  return managers[email.trim()] ?? ''
}

export function getEmployeesByDepartment(employees, department) {
  if (!employees || !department) return []
  return employees[department] ?? []
}

export function getPositionsByDepartment(positions, department) {
  if (!positions || !department) return []
  return positions[department] ?? []
}
