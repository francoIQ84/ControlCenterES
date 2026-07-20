import React, { useState, useEffect } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Package, Receipt, Users, Settings, Sun, Moon, RefreshCw, Zap, Image, LogOut, Menu, FileText, Wallet } from 'lucide-react'

export default function Layout() {
  const [lightMode, setLightMode] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [collapsed, setCollapsed] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false)
  
  // New Mercado Libre status & progress states
  const [meliStatus, setMeliStatus] = useState(null)
  const [progress, setProgress] = useState(null)
  const [showProgressModal, setShowProgressModal] = useState(false)
  const [autoSyncing, setAutoSyncing] = useState(false)

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

  // Captura y canje de código de Mercado Libre (?code=TG-xxx) en la URL
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const code = queryParams.get('code');
    if (code) {
      const exchangeCode = async () => {
        try {
          const res = await fetch('/api/settings/exchange-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
          });
          if (res.ok) {
            window.history.replaceState({}, document.title, window.location.pathname);
            window.location.reload();
          } else {
            alert("Error al vincular con Mercado Libre");
          }
        } catch (e) {
          console.error("Exchange code error:", e);
        }
      };
      exchangeCode();
    }
  }, []);

  // Consultar estado de Meli, redirección automática de login y autosincronización
  useEffect(() => {
    const initStatusAndSync = async () => {
      const token = localStorage.getItem('adminToken');
      if (!token) return;
      
      try {
        // 1. Obtener estado de autenticación de Meli
        const statusRes = await fetch('/api/settings/status');
        if (!statusRes.ok) return;
        const statusData = await statusRes.json();
        setMeliStatus(statusData);
        
        // 2. Redirección automática si acaba de iniciar sesión y no está vinculado
        const justLoggedIn = localStorage.getItem('justLoggedIn');
        if (justLoggedIn === 'true') {
          localStorage.removeItem('justLoggedIn');
          if (!statusData.is_authenticated && !statusData.demo_mode) {
            const configRes = await fetch('/api/settings/config');
            if (configRes.ok) {
              const configData = await configRes.json();
              if (configData.client_id && configData.redirect_uri) {
                window.location.href = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${configData.client_id}&redirect_uri=${configData.redirect_uri}`;
                return;
              }
            }
          }
        }
        
        // 3. Sincronización automática de 7 días al ingresar (una vez por sesión de navegador)
        const autoSynced = sessionStorage.getItem('meliAutoSynced');
        if (!autoSynced && statusData.is_authenticated) {
          sessionStorage.setItem('meliAutoSynced', 'true');
          setAutoSyncing(true);
          
          const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('.')[0] + 'Z';
          const res = await fetch('/api/settings/sync-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: 500, date_from: dateFrom })
          });
          
          if (res.ok) {
            const interval = setInterval(async () => {
              const pRes = await fetch('/api/settings/sync-progress');
              if (pRes.ok) {
                const pData = await pRes.ok ? await pRes.json() : null;
                if (pData && (pData.status === 'completed' || pData.status === 'failed')) {
                  clearInterval(interval);
                  setAutoSyncing(false);
                  window.location.reload();
                }
              }
            }, 2000);
          } else {
            setAutoSyncing(false);
          }
        }
      } catch (e) {
        console.error("Meli init error:", e);
      }
    };
    
    initStatusAndSync();
  }, []);

  const startPollingProgress = () => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/settings/sync-progress');
        if (res.ok) {
          const pData = await res.json();
          setProgress(pData);
          if (pData.status === 'completed' || pData.status === 'failed') {
            clearInterval(interval);
            setSyncing(false);
          }
        }
      } catch (e) {
        console.error("Error polling sync progress:", e);
      }
    }, 1000);
  };

  const handleSync = async () => {
    setSyncing(true);
    setProgress({ status: 'idle', progress: 0, message: 'Iniciando sincronización...', current: 0, total: 100 });
    setShowProgressModal(true);
    
    try {
      const res = await fetch('/api/settings/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 2000 })
      });
      
      if (res.ok) {
        startPollingProgress();
      } else {
        alert("Error al iniciar sincronización");
        setShowProgressModal(false);
        setSyncing(false);
      }
    } catch (e) {
      alert("Error de conexión al iniciar sincronización");
      setShowProgressModal(false);
      setSyncing(false);
    }
  };

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
          <NavLink to="/billing" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <FileText size={20} style={{ minWidth: 20 }} />
            <span className="nav-text">Facturación</span>
          </NavLink>
          <NavLink to="/expenses" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <Wallet size={20} style={{ minWidth: 20 }} />
            <span className="nav-text">Gastos</span>
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
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            {/* AFIP Status Badge */}
            {meliStatus && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: '600',
                backgroundColor: meliStatus.afip_active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                color: meliStatus.afip_active ? 'var(--accent-emerald)' : 'var(--accent-red)',
                border: `1px solid ${meliStatus.afip_active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
              }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: meliStatus.afip_active ? 'var(--accent-emerald)' : 'var(--accent-red)',
                  boxShadow: meliStatus.afip_active ? '0 0 8px var(--accent-emerald)' : '0 0 8px var(--accent-red)'
                }}></span>
                <span>{meliStatus.afip_active ? 'AFIP Vinculada' : 'AFIP Inactiva'}</span>
              </div>
            )}

            {/* Vínculo Meli status Badge */}
            {meliStatus && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: '600',
                backgroundColor: meliStatus.is_authenticated ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                color: meliStatus.is_authenticated ? 'var(--accent-emerald)' : 'var(--accent-red)',
                border: `1px solid ${meliStatus.is_authenticated ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
              }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: meliStatus.is_authenticated ? 'var(--accent-emerald)' : 'var(--accent-red)',
                  boxShadow: meliStatus.is_authenticated ? '0 0 8px var(--accent-emerald)' : '0 0 8px var(--accent-red)'
                }}></span>
                {meliStatus.is_authenticated ? (
                  <span>Meli Vinculado {meliStatus.demo_mode && '(Demo)'}</span>
                ) : (
                  <span>Sin Vincular Meli</span>
                )}
              </div>
            )}

            {/* Autosync indicator */}
            {autoSyncing && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <RefreshCw size={14} className="animate-spin" />
                <span>Auto-sincronizando 7d...</span>
              </span>
            )}
            
            <div style={{display: 'flex', gap: '10px'}}>
              <button className="btn-icon" onClick={handleSync} disabled={syncing || autoSyncing} title="Sincronizar Histórico (2 Años)">
                <RefreshCw size={20} className={syncing ? 'animate-spin' : ''} />
              </button>
              <button className="btn-icon" onClick={() => setLightMode(!lightMode)}>
                {lightMode ? <Moon size={20} /> : <Sun size={20} />}
              </button>
              <button className="btn-icon" onClick={handleLogout} title="Cerrar sesión">
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </header>
        <div className="content-area">
          <Outlet />
        </div>
      </main>

      {/* Real-time Sync Progress Modal */}
      {showProgressModal && progress && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="card" style={{
            width: '450px',
            maxWidth: '100%',
            padding: '30px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            textAlign: 'center',
            backgroundColor: 'var(--bg-card)'
          }}>
            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Sincronización con Mercado Libre</h3>
            
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px' }}>
              <RefreshCw 
                size={40} 
                className={(progress.status === 'completed' || progress.status === 'failed') ? '' : 'animate-spin'}
                style={{ 
                  color: 'var(--accent-blue)', 
                }} 
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: '600' }}>
                <span style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '300px'
                }} title={progress.message}>{progress.message}</span>
                <span>{progress.progress}%</span>
              </div>
              
              <div style={{
                height: '10px',
                width: '100%',
                backgroundColor: 'var(--bg-dark)',
                borderRadius: '5px',
                overflow: 'hidden',
                border: '1px solid var(--border-color)'
              }}>
                <div style={{
                  height: '100%',
                  width: `${progress.progress}%`,
                  background: 'linear-gradient(90deg, var(--accent-blue) 0%, var(--accent-emerald) 100%)',
                  borderRadius: '5px',
                  transition: 'width 0.3s ease'
                }}></div>
              </div>
            </div>
            
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {progress.status === 'syncing_products' && 'Sincronizando catálogo de publicaciones...'}
              {progress.status === 'syncing_sales' && 'Descargando y actualizando ventas...'}
              {progress.status === 'completed' && 'Sincronización histórica finalizada.'}
              {progress.status === 'failed' && 'Error durante la sincronización.'}
            </div>

            {(progress.status === 'completed' || progress.status === 'failed') && (
              <button 
                className="btn" 
                style={{
                  marginTop: '10px',
                  backgroundColor: progress.status === 'completed' ? 'var(--accent-emerald)' : 'var(--accent-red)',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  setShowProgressModal(false);
                  window.location.reload();
                }}
              >
                {progress.status === 'completed' ? 'Aceptar y Recargar' : 'Cerrar'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
