import React, { useState, useEffect } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Package, Receipt, Users, Settings, Sun, Moon, RefreshCw, Zap, Image, LogOut, Menu } from 'lucide-react'

export default function Layout() {
  const [lightMode, setLightMode] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [collapsed, setCollapsed] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false)

  useEffect(() => {
    if (lightMode) {
      document.body.classList.add('light-mode')
    } else {
      document.body.classList.remove('light-mode')
    }
  }, [lightMode])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setCollapsed(false)
      } else {
        setCollapsed(true)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/inventory/sync', { method: 'POST' })
      await fetch('/api/sales/sync', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 2000 })
      })
      alert("Sincronización completa")
      window.location.reload()
    } catch (e) {
      alert("Error al sincronizar")
    } finally {
      setSyncing(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch(e) {}
    localStorage.removeItem('adminToken')
    window.location.href = '/login'
  }

  return (
    <div className="layout">
      {!collapsed && (
        <div className="sidebar-backdrop" onClick={() => setCollapsed(true)} />
      )}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <Zap className="text-blue-500" style={{ minWidth: 20 }} />
          <span className="logo-text">ControlCenterES</span>
        </div>
        <nav className="nav-links">
          <NavLink to="/" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={20} style={{ minWidth: 20 }} />
            <span className="nav-text">Métricas</span>
          </NavLink>
          <NavLink to="/inventory" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <Package size={20} style={{ minWidth: 20 }} />
            <span className="nav-text">Inventario</span>
          </NavLink>
          <NavLink to="/sales" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <Receipt size={20} style={{ minWidth: 20 }} />
            <span className="nav-text">Ventas</span>
          </NavLink>
          <NavLink to="/customers" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <Users size={20} style={{ minWidth: 20 }} />
            <span className="nav-text">Clientes</span>
          </NavLink>
          <NavLink to="/media" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <Image size={20} style={{ minWidth: 20 }} />
            <span className="nav-text">Imágenes</span>
          </NavLink>
          <NavLink to="/settings" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <Settings size={20} style={{ minWidth: 20 }} />
            <span className="nav-text">Configuración</span>
          </NavLink>
        </nav>
      </aside>
      <main className="main-content">
        <header className="header" style={{ justifyContent: 'space-between', paddingLeft: '20px' }}>
          <button className="btn-icon" onClick={() => setCollapsed(!collapsed)} title={collapsed ? "Mostrar menú" : "Ocultar menú"}>
            <Menu size={20} />
          </button>
          <div style={{display: 'flex', gap: '10px'}}>
            <button className="btn-icon" onClick={handleSync} disabled={syncing}>
              <RefreshCw size={20} className={syncing ? 'animate-spin' : ''} />
            </button>
            <button className="btn-icon" onClick={() => setLightMode(!lightMode)}>
              {lightMode ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            <button className="btn-icon" onClick={handleLogout} title="Cerrar sesión">
              <LogOut size={20} />
            </button>
          </div>
        </header>
        <div className="content-area">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
