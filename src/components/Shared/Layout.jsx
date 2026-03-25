import NavBar from './NavBar'

export default function Layout({ user, role, isDarkMode, toggleDarkMode, children }) {
  return (
    <div className="min-h-screen flex flex-col transition-colors duration-300 bg-[#f5f7f6] dark:bg-slate-950">
      <NavBar user={user} role={role} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode} />
      <main className="flex-1 px-6 py-7 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  )
}
