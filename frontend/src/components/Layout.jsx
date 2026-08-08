import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Package, Receipt, Users, Settings, Sun, Moon, RefreshCw, Zap, Image, LogOut, Menu, FileText, Wallet, BookOpen, ShieldCheck, Bell, CheckCircle2, X, Megaphone, UserCheck, MessageSquare, Building2 } from 'lucide-react'
import { useTenant } from '../TenantContext'

export default function Layout() {
  const navigate = useNavigate()
  const { tenant, hasModule, isPlatformAdmin } = useTenant()
  const [lightMode, setLightMode] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [collapsed, setCollapsed] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false)
  
  // New Mercado Libre status & progress states
  const [meliStatus, setMeliStatus] = useState(null)
  const [progress, setProgress] = useState(null)
  const [showProgressModal, setShowProgressModal] = useState(false)
  const [autoSyncing, setAutoSyncing] = useState(false)

  // Notification Center State
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [activeNotifFilter, setActiveNotifFilter] = useState('all')
  const [dismissedIds, setDismissedIds] = useState([])

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/dashboard/notifications')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
      }
    } catch (err) {
      console.error("Error fetching notifications:", err)
    }
  }

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60000)
    return () => clearInterval(interval)
  }, [])

  const filteredNotifs = notifications
    .filter(n => !dismissedIds.includes(n.id))
    .filter(n => activeNotifFilter === 'all' || n.category === activeNotifFilter)

  const visibleUnreadCount = notifications.filter(n => !dismissedIds.includes(n.id)).length

  const handleNotifClick = (n) => {
    setDismissedIds(prev => [...prev, n.id])
    setShowNotifications(false)
    if (n.link) navigate(n.link)
  }

  const handleClearAllNotifs = () => {
    setDismissedIds(notifications.map(n => n.id))
  }

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


  // Consultar estado de Meli, redirección automática de login y autosincronización
  useEffect(() => {
    const initStatusAndSync = async () => {
      const token = localStorage.getItem('adminToken');
      if (!token) return;
      
      try {
        // 1. Obtener perfil de usuario para actualizar permisos y nombre
        const profileRes = await fetch('/api/auth/profile');
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          localStorage.setItem('adminPermissions', profileData.permissions || "");
          localStorage.setItem('adminUsername', profileData.username);
          localStorage.setItem('adminFullName', profileData.full_name);
        }

        // 2. Obtener estado de autenticación de Meli
        const statusRes = await fetch('/api/settings/status');
        if (!statusRes.ok) return;
        const statusData = await statusRes.json();
        setMeliStatus(statusData);
        
        // 3. Redirección automática si acaba de iniciar sesión y no está vinculado
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
        
        // 4. Sincronización automática de 7 días al ingresar (una vez por sesión de navegador)
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

  const hasPermission = (perm) => {
    const permsStr = localStorage.getItem('adminPermissions');
    if (permsStr === null || permsStr === "") return true; // default allowed during loading
    const perms = permsStr.split(',').map(p => p.trim());
    if (perm === 'inpi' && (perms.includes('inpi') || perms.includes('settings'))) return true;
    return perms.includes(perm);
  };

  // Permiso de usuario y módulo contratado son dos filtros distintos y se
  // aplican los dos: el permiso dice qué puede hacer esta persona, el módulo
  // dice qué contrató el negocio. Si no se pasa módulo, se usa el permiso.
  const canShow = (perm, moduleName = perm) => hasPermission(perm) && hasModule(moduleName);

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

  const handleSync24h = async () => {
    setSyncing(true);
    setProgress({ status: 'idle', progress: 0, message: 'Iniciando sincronización de 24 horas (Mercado Libre y Mercado Pago)...', current: 0, total: 100 });
    setShowProgressModal(true);
    
    try {
      const dateFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('.')[0] + 'Z';
      const res = await fetch('/api/settings/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 500, date_from: dateFrom })
      });
      
      if (res.ok) {
        startPollingProgress();
      } else {
        alert("Error al iniciar sincronización de 24 horas");
        setShowProgressModal(false);
        setSyncing(false);
      }
    } catch (e) {
      alert("Error de conexión al iniciar sincronización");
      setShowProgressModal(false);
      setSyncing(false);
    }
  };

  const handleAuthMeliClick = async () => {
    try {
      const configRes = await fetch('/api/settings/config')
      if (configRes.ok) {
        const configData = await configRes.json()
        if (configData.client_id) {
          const redirectUri = configData.redirect_uri || (window.location.origin + '/settings')
          const url = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${configData.client_id}&redirect_uri=${encodeURIComponent(redirectUri)}`
          window.location.href = url
        } else {
          alert("Primero ingresá tu App ID (Client ID) en Configuración > Conexión ML / MP.")
          window.location.href = '/settings'
        }
      }
    } catch (e) {
      console.error("Auth Meli error:", e)
      alert("Error al conectar con Mercado Libre")
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch(e) {}
    localStorage.removeItem('adminToken')
    localStorage.removeItem('adminPermissions')
    window.location.href = '/login'
  }

  return (
    <div className="layout">
      {!collapsed && (
        <div className="sidebar-backdrop" onClick={() => setCollapsed(true)} />
      )}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          {tenant?.settings?.logo_url ? (
            <img src={tenant.settings.logo_url} alt={tenant.name}
                 style={{ width: 22, height: 22, minWidth: 22, objectFit: 'contain', borderRadius: 4 }} />
          ) : (
            <Zap className="text-blue-500" style={{ minWidth: 20 }} />
          )}
          <span className="logo-text" title={tenant?.name || 'ControlCenterES'}>
            {tenant?.name || 'ControlCenterES'}
          </span>
        </div>
        {tenant && tenant.status === 'trial' && (
          <div className="nav-text" style={{
            margin: '0 12px 10px', padding: '5px 10px', borderRadius: 10,
            fontSize: '0.7rem', fontWeight: 700, textAlign: 'center',
            backgroundColor: 'rgba(37, 99, 235, 0.12)', color: 'var(--accent-blue)'
          }}>
            Período de prueba
          </div>
        )}
        <nav className="nav-links">
          {canShow('dashboard') && (
            <NavLink to="/" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <LayoutDashboard size={20} style={{ minWidth: 20 }} />
              <span className="nav-text">Métricas</span>
            </NavLink>
          )}
          {canShow('inventory') && (
            <NavLink to="/inventory" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <Package size={20} style={{ minWidth: 20 }} />
              <span className="nav-text">Inventario</span>
            </NavLink>
          )}
          {canShow('sales') && (
            <NavLink to="/sales" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <Receipt size={20} style={{ minWidth: 20 }} />
              <span className="nav-text">Ventas</span>
            </NavLink>
          )}
          {canShow('billing') && (
            <NavLink to="/billing" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <FileText size={20} style={{ minWidth: 20 }} />
              <span className="nav-text">Facturación</span>
            </NavLink>
          )}
          {canShow('expenses') && (
            <NavLink to="/expenses" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <Wallet size={20} style={{ minWidth: 20 }} />
              <span className="nav-text">Finanzas</span>
            </NavLink>
          )}
          {canShow('customers') && (
            <NavLink to="/customers" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <Users size={20} style={{ minWidth: 20 }} />
              <span className="nav-text">Clientes</span>
            </NavLink>
          )}
          {canShow('media') && (
            <NavLink to="/media" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <Image size={20} style={{ minWidth: 20 }} />
              <span className="nav-text">Archivos</span>
            </NavLink>
          )}
          {canShow('blog', 'blog') && (
            <NavLink to="/cms" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <BookOpen size={20} style={{ minWidth: 20 }} />
              <span className="nav-text">Blog & Web</span>
            </NavLink>
          )}
          {canShow('inpi') && (
            <NavLink to="/inpi" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <ShieldCheck size={20} style={{ minWidth: 20 }} />
              <span className="nav-text">Propiedad Industrial</span>
            </NavLink>
          )}
          {canShow('marketing') && (
            <NavLink to="/marketing" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <Megaphone size={20} style={{ minWidth: 20 }} />
              <span className="nav-text">Marketing & Redes</span>
            </NavLink>
          )}
          {isPlatformAdmin && hasPermission('settings') && (
            <NavLink to="/tenants" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <Building2 size={20} style={{ minWidth: 20 }} />
              <span className="nav-text">Inquilinos</span>
            </NavLink>
          )}
          {hasPermission('settings') && (
            <NavLink to="/settings" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <Settings size={20} style={{ minWidth: 20 }} />
              <span className="nav-text">Configuración</span>
            </NavLink>
          )}
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

            {/* Vínculo Meli status Badge (Clickable for instant OAuth) */}
            {meliStatus && (
              <div 
                onClick={handleAuthMeliClick}
                title={meliStatus.is_authenticated ? "Cuenta vinculada con Mercado Libre. Hacé clic para revincular." : "¡Hacé clic para vincular tu cuenta de Mercado Libre!"}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  backgroundColor: meliStatus.is_authenticated ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.15)',
                  color: meliStatus.is_authenticated ? 'var(--accent-emerald)' : 'var(--accent-red)',
                  border: `1px solid ${meliStatus.is_authenticated ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  userSelect: 'none'
                }}
              >
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
                  <span>🔗 Sin Vincular Meli (Hacé clic aquí)</span>
                )}
              </div>
            )}

            {/* Quick 24h Sync Button for Mercado Libre & Mercado Pago */}
            {meliStatus && meliStatus.is_authenticated && (
              <button 
                onClick={handleSync24h}
                disabled={syncing || autoSyncing}
                title="Sincronizar ventas, cobros y publicaciones de Mercado Libre y Mercado Pago de las últimas 24 horas"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  backgroundColor: 'var(--accent-emerald)',
                  color: '#ffffff',
                  border: 'none',
                  cursor: syncing || autoSyncing ? 'not-allowed' : 'pointer',
                  opacity: syncing || autoSyncing ? 0.7 : 1,
                  transition: 'all 0.2s',
                  boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
                }}
              >
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                <span>{syncing ? 'Sincronizando 24h...' : '⚡ Sincronizar 24hs ML/MP'}</span>
              </button>
            )}

            {/* Autosync indicator */}
            {autoSyncing && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <RefreshCw size={14} className="animate-spin" />
                <span>Auto-sincronizando 7d...</span>
              </span>
            )}
            
            <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
              
              {/* Notification Center Bell */}
              <div style={{ position: 'relative' }}>
                <button 
                  className="btn-icon" 
                  onClick={() => setShowNotifications(!showNotifications)}
                  title="Centro de Alertas y Notificaciones"
                  style={{ position: 'relative' }}
                >
                  <Bell size={20} />
                  {visibleUnreadCount > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      backgroundColor: 'var(--accent-red)',
                      color: '#ffffff',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      borderRadius: '10px',
                      padding: '2px 6px',
                      lineHeight: 1,
                      border: '2px solid var(--bg-card)',
                      boxShadow: '0 0 6px rgba(239, 68, 68, 0.5)'
                    }}>
                      {visibleUnreadCount}
                    </span>
                  )}
                </button>

                {/* Popover Dropdown */}
                {showNotifications && (
                  <div style={{
                    position: 'absolute',
                    top: '42px',
                    right: '0',
                    width: '380px',
                    maxWidth: '90vw',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.4)',
                    zIndex: 9999,
                    overflow: 'hidden'
                  }}>
                    {/* Popover Header */}
                    <div style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border-color)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: 'var(--bg-dark)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Bell size={18} style={{ color: 'var(--accent-blue)' }} />
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Notificaciones</h4>
                      </div>
                      <button className="btn-icon" onClick={() => setShowNotifications(false)} style={{ padding: '2px' }}>
                        <X size={16} />
                      </button>
                    </div>

                    {/* Filter Pills */}
                    <div style={{ display: 'flex', gap: '6px', padding: '8px 12px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', overflowX: 'auto' }}>
                      {[
                        { id: 'all', label: 'Todas' },
                        { id: 'inpi', label: '🛡️ INPI' },
                        { id: 'sales', label: '🛒 Ventas' },
                        { id: 'inventory', label: '📦 Stock' },
                        { id: 'leads', label: '🌱 Leads' },
                        { id: 'whatsapp', label: '💬 WhatsApp' }
                      ].map(f => (
                        <button
                          key={f.id}
                          onClick={() => setActiveNotifFilter(f.id)}
                          style={{
                            padding: '4px 10px',
                            fontSize: '0.75rem',
                            borderRadius: '12px',
                            border: 'none',
                            backgroundColor: activeNotifFilter === f.id ? 'var(--accent-blue)' : 'var(--bg-dark)',
                            color: activeNotifFilter === f.id ? '#ffffff' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontWeight: 600,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    {/* Notifications List */}
                    <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                      {filteredNotifs.length === 0 ? (
                        <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          <CheckCircle2 size={32} style={{ color: 'var(--accent-emerald)', marginBottom: '8px', opacity: 0.8 }} />
                          <p style={{ margin: 0 }}>¡Todo al día! No hay alertas pendientes.</p>
                        </div>
                      ) : (
                        filteredNotifs.map(n => (
                          <div
                            key={n.id}
                            onClick={() => handleNotifClick(n)}
                            style={{
                              padding: '12px 16px',
                              borderBottom: '1px solid var(--border-color)',
                              cursor: 'pointer',
                              display: 'flex',
                              gap: '12px',
                              alignItems: 'flex-start',
                              backgroundColor: 'transparent',
                              transition: 'background-color 0.15s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <div style={{
                              padding: '6px',
                              borderRadius: '8px',
                              backgroundColor: n.severity === 'danger' ? 'rgba(239, 68, 68, 0.12)' : n.severity === 'warning' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(37, 99, 235, 0.12)',
                              color: n.severity === 'danger' ? 'var(--accent-red)' : n.severity === 'warning' ? '#f59e0b' : 'var(--accent-blue)',
                              flexShrink: 0
                            }}>
                              {n.category === 'inpi' ? <ShieldCheck size={16} /> : n.category === 'sales' ? <Receipt size={16} /> : n.category === 'leads' ? <UserCheck size={16} /> : n.category === 'whatsapp' ? <MessageSquare size={16} /> : <Package size={16} />}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {n.title}
                                </strong>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: '6px' }}>{n.time}</span>
                              </div>
                              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
                                {n.message}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Footer */}
                    {filteredNotifs.length > 0 && (
                      <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', textAlign: 'center' }}>
                        <button
                          onClick={handleClearAllNotifs}
                          style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                        >
                          Marcar todas como leídas
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button className="btn-icon" onClick={() => setLightMode(!lightMode)} title={lightMode ? "Modo Oscuro" : "Modo Claro"}>
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
