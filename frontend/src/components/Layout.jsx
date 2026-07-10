import React, { useState, useEffect } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Package, Receipt, Users, Settings, Sun, Moon, RefreshCw, Zap, Image } from 'lucide-react'

export default function Layout() {
  const [lightMode, setLightMode] = useState(true)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (lightMode) {
      document.body.classList.add('light-mode')
    } else {
      document.body.classList.remove('light-mode')
    }
  }, [lightMode])

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

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <Zap className="text-blue-500" />
          ControlCenterES
        </div>
        <nav className="nav-links">
          <NavLink to="/" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={20} /> Dashboard
          </NavLink>
          <NavLink to="/inventory" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <Package size={20} /> Inventario
          </NavLink>
          <NavLink to="/sales" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <Receipt size={20} /> Ventas
          </NavLink>
          <NavLink to="/customers" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <Users size={20} /> Clientes
          </NavLink>
          <NavLink to="/media" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <Image size={20} /> Imágenes
          </NavLink>
          <NavLink to="/settings" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <Settings size={20} /> Configuración
          </NavLink>
        </nav>
      </aside>
      <main className="main-content">
        <header className="header">
          <div style={{display: 'flex', gap: '10px'}}>
            <button className="btn-icon" onClick={handleSync} disabled={syncing}>
              <RefreshCw size={20} className={syncing ? 'animate-spin' : ''} />
            </button>
            <button className="btn-icon" onClick={() => setLightMode(!lightMode)}>
              {lightMode ? <Moon size={20} /> : <Sun size={20} />}
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
