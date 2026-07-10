import React, { useState, useEffect } from 'react'
import MediaBrowser from '../components/MediaBrowser'

export default function Settings() {
  const [config, setConfig] = useState({ client_id: '', client_secret: '', redirect_uri: '', demo_mode: true })
  const [status, setStatus] = useState({ is_authenticated: false, user_id: null })
  const [code, setCode] = useState("")
  
  // Tabs & Logs
  const [activeTab, setActiveTab] = useState("connection") // "connection", "users", "security", "web_config"
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // User Management
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  
  // Create User Form State
  const [newUsername, setNewUsername] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newFullName, setNewFullName] = useState("")
  
  // Change Password Form State
  const [editingUserId, setEditingUserId] = useState(null)
  const [changePassword, setChangePassword] = useState("")

  // Web Config State
  const [webConfig, setWebConfig] = useState({
    store_name: "Tienda Oficial",
    logo_url: "",
    hero_title: "Nuestra Tienda Oficial",
    hero_subtitle: "Los mejores productos directo de fábrica, al mejor precio.",
    hero_image: "",
    contact_phone: "",
    address: "",
    footer_text: "© 2026 ControlCenterES. Todos los derechos reservados."
  })
  const [webConfigLoading, setWebConfigLoading] = useState(false)
  const [showImageSelector, setShowImageSelector] = useState(false)
  const [selectorTarget, setSelectorTarget] = useState("")

  useEffect(() => {
    fetch('/api/settings/config').then(r=>r.json()).then(setConfig)
    fetch('/api/settings/status').then(r=>r.json()).then(setStatus)
  }, [])

  // Load history when security tab opens
  useEffect(() => {
    if (activeTab === "security") {
      setHistoryLoading(true)
      fetch('/api/auth/history')
        .then(r => {
          if (!r.ok) throw new Error("Unauthorized or error")
          return r.json()
        })
        .then(data => {
          setHistory(data.history || [])
          setHistoryLoading(false)
        })
        .catch(err => {
          console.error(err)
          setHistoryLoading(false)
        })
    }
  }, [activeTab])

  // Load users when users tab opens
  const fetchUsers = () => {
    setUsersLoading(true)
    fetch('/api/auth/users')
      .then(r => {
        if (!r.ok) throw new Error("Unauthorized or error")
        return r.json()
      })
      .then(data => {
        setUsers(data || [])
        setUsersLoading(false)
      })
      .catch(err => {
        console.error(err)
        setUsersLoading(false)
      })
  }

  useEffect(() => {
    if (activeTab === "users") {
      fetchUsers()
    }
  }, [activeTab])

  // Load Web Config when web_config tab opens
  useEffect(() => {
    if (activeTab === "web_config") {
      setWebConfigLoading(true)
      fetch('/api/settings/web-config')
        .then(r => {
          if (!r.ok) throw new Error("Unauthorized or error")
          return r.json()
        })
        .then(data => {
          setWebConfig(data)
          setWebConfigLoading(false)
        })
        .catch(err => {
          console.error(err)
          setWebConfigLoading(false)
        })
    }
  }, [activeTab])

  const handleSave = async () => {
    await fetch('/api/settings/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    alert("Configuración guardada")
    window.location.reload()
  }

  const handleAuth = () => {
    const url = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${config.client_id}&redirect_uri=${config.redirect_uri}`
    window.open(url, '_blank')
  }

  const handleCode = async () => {
    try {
      const res = await fetch('/api/settings/exchange-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      })
      if(res.ok) {
        alert("Autenticación exitosa")
        window.location.reload()
      } else {
        const errorData = await res.json()
        alert("Error de autenticación: " + (errorData.detail || "Error desconocido"))
      }
    } catch(e) {
      alert("Error: " + e.message)
    }
  }

  // User CRUD handlers
  const handleCreateUser = async (e) => {
    e.preventDefault()
    if (!newUsername || !newPassword || !newFullName) {
      alert("Todos los campos son requeridos")
      return
    }
    
    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          full_name: newFullName
        })
      })
      const data = await res.json()
      if (res.ok) {
        alert("Usuario creado exitosamente")
        setNewUsername("")
        setNewPassword("")
        setNewFullName("")
        fetchUsers()
      } else {
        alert("Error: " + (data.detail || "No se pudo crear el usuario"))
      }
    } catch(err) {
      alert("Error al conectar con el servidor: " + err.message)
    }
  }

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar este usuario?")) {
      return
    }
    
    try {
      const res = await fetch(`/api/auth/users/${userId}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (res.ok) {
        alert("Usuario eliminado")
        fetchUsers()
      } else {
        alert("Error: " + (data.detail || "No se pudo eliminar el usuario"))
      }
    } catch(err) {
      alert("Error: " + err.message)
    }
  }

  const handleUpdatePassword = async (e) => {
    e.preventDefault()
    if (!changePassword) {
      alert("Introduce la nueva contraseña")
      return
    }
    
    try {
      const res = await fetch(`/api/auth/users/${editingUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: changePassword })
      })
      const data = await res.json()
      if (res.ok) {
        alert("Contraseña actualizada. Las sesiones activas de este usuario han sido invalidadas.")
        setEditingUserId(null)
        setChangePassword("")
      } else {
        alert("Error: " + (data.detail || "No se pudo cambiar la contraseña"))
      }
    } catch(err) {
      alert("Error: " + err.message)
    }
  }

  // Web configuration save handler
  const handleSaveWebConfig = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/settings/web-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webConfig)
      })
      if (res.ok) {
        alert("Configuración de la tienda web guardada con éxito")
      } else {
        const errorData = await res.json()
        alert("Error al guardar: " + (errorData.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    }
  }

  return (
    <div>
      <h1 className="page-title">Configuración</h1>
      <p className="page-subtitle">Ajustes del sistema, seguridad, usuarios y personalización de la tienda web.</p>

      {/* Tabs Headers */}
      <div style={{display: 'flex', gap: 15, borderBottom: '1px solid var(--border-color)', marginBottom: 25}}>
        <button 
          style={{
            padding: '10px 15px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'connection' ? '3px solid var(--accent-blue)' : 'none',
            color: activeTab === 'connection' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'connection' ? 'bold' : 'normal',
            cursor: 'pointer'
          }}
          onClick={() => setActiveTab('connection')}
        >
          Conexión Mercado Libre
        </button>
        <button 
          style={{
            padding: '10px 15px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'users' ? '3px solid var(--accent-blue)' : 'none',
            color: activeTab === 'users' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'users' ? 'bold' : 'normal',
            cursor: 'pointer'
          }}
          onClick={() => setActiveTab('users')}
        >
          Gestión de Usuarios
        </button>
        <button 
          style={{
            padding: '10px 15px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'web_config' ? '3px solid var(--accent-blue)' : 'none',
            color: activeTab === 'web_config' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'web_config' ? 'bold' : 'normal',
            cursor: 'pointer'
          }}
          onClick={() => setActiveTab('web_config')}
        >
          Configuración Web
        </button>
        <button 
          style={{
            padding: '10px 15px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'security' ? '3px solid var(--accent-blue)' : 'none',
            color: activeTab === 'security' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'security' ? 'bold' : 'normal',
            cursor: 'pointer'
          }}
          onClick={() => setActiveTab('security')}
        >
          Seguridad & Accesos
        </button>
      </div>

      {/* Tab 1: Connection settings */}
      {activeTab === 'connection' && (
        <div style={{display: 'flex', gap: 20, alignItems: 'flex-start'}}>
          <div className="card" style={{flex: 1}}>
            <h3>API de Mercado Libre</h3>
            <div style={{display: 'flex', flexDirection: 'column', gap: 15}}>
              <label>App ID (Client ID)
                <input type="text" value={config.client_id} onChange={e => setConfig({...config, client_id: e.target.value})} style={{width: '100%', marginTop: 5}}/>
              </label>
              <label>Client Secret
                <input type="password" value={config.client_secret} onChange={e => setConfig({...config, client_secret: e.target.value})} style={{width: '100%', marginTop: 5}}/>
              </label>
              <label>Redirect URI
                <input type="text" value={config.redirect_uri} onChange={e => setConfig({...config, redirect_uri: e.target.value})} style={{width: '100%', marginTop: 5}}/>
              </label>
              <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: 'pointer', marginTop: 5}}>
                <input type="checkbox" checked={config.demo_mode} onChange={e => setConfig({...config, demo_mode: e.target.checked})} style={{width: 'auto'}}/>
                Activar Modo Demo (Datos de prueba ficticios)
              </label>
              <button className="btn" onClick={handleSave}>Guardar API Config</button>
            </div>
          </div>

          <div className="card" style={{flex: 1}}>
            <h3>Estado de Conexión</h3>
            {status.is_authenticated ? (
              <div style={{color: 'var(--accent-emerald)', fontWeight: 'bold'}}>
                ✓ Conectado a Mercado Libre (Usuario ID: {status.user_id})
              </div>
            ) : (
              <div style={{color: 'var(--accent-red)', fontWeight: 'bold'}}>
                ✗ No autenticado
              </div>
            )}

            <div style={{marginTop: 20}}>
              <p style={{fontSize: '0.9rem'}}>1. Haz clic aquí para autorizar la app:</p>
              <button className="btn" style={{backgroundColor: '#ffe600', color: '#333'}} onClick={handleAuth}>
                Autorizar en Mercado Libre
              </button>
              
              <p style={{fontSize: '0.9rem', marginTop: 20}}>2. Pega el código de la URL (TG-xxx):</p>
              <div style={{display: 'flex', gap: 10}}>
                <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="TG-..." style={{flex: 1}}/>
                <button className="btn" onClick={handleCode}>Vincular</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: User management */}
      {activeTab === 'users' && (
        <div style={{display: 'flex', gap: 20, alignItems: 'flex-start'}}>
          <div className="card" style={{flex: 2}}>
            <h3>Usuarios del Sistema</h3>
            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 15}}>
              Usuarios autorizados para acceder y administrar el panel ControlCenterES.
            </p>
            
            {usersLoading ? <p>Cargando usuarios...</p> : (
              <table className="data-table" style={{width: '100%', borderCollapse: 'collapse'}}>
                <thead>
                  <tr>
                    <th style={{textAlign: 'left', padding: '12px 10px'}}>Usuario</th>
                    <th style={{textAlign: 'left', padding: '12px 10px'}}>Nombre Completo</th>
                    <th style={{textAlign: 'left', padding: '12px 10px'}}>Fecha de Creación</th>
                    <th style={{textAlign: 'left', padding: '12px 10px'}}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{borderBottom: '1px solid var(--border-color)'}}>
                      <td style={{padding: '12px 10px', fontSize: '0.85rem', fontWeight: 600}}>
                        {u.username}
                      </td>
                      <td style={{padding: '12px 10px', fontSize: '0.85rem'}}>
                        {u.full_name}
                      </td>
                      <td style={{padding: '12px 10px', fontSize: '0.85rem'}}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                      </td>
                      <td style={{padding: '12px 10px', fontSize: '0.85rem', display: 'flex', gap: 10}}>
                        <button 
                          className="btn" 
                          style={{padding: '4px 8px', fontSize: '0.75rem', backgroundColor: 'var(--accent-blue)', color: '#fff'}}
                          onClick={() => {
                            setEditingUserId(u.id)
                            setChangePassword("")
                          }}
                        >
                          Clave
                        </button>
                        <button 
                          className="btn" 
                          style={{padding: '4px 8px', fontSize: '0.75rem', backgroundColor: 'var(--accent-red)', color: '#fff'}}
                          onClick={() => handleDeleteUser(u.id)}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 20}}>
            {/* Create User Card */}
            <div className="card">
              <h3>Crear Usuario</h3>
              <form onSubmit={handleCreateUser} style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                <label>Nombre de Usuario
                  <input 
                    type="text" 
                    required
                    value={newUsername} 
                    onChange={e => setNewUsername(e.target.value.toLowerCase().replace(/\s/g, ''))} 
                    placeholder="ej. franco"
                    style={{width: '100%', marginTop: 5}}
                  />
                </label>
                <label>Nombre Completo
                  <input 
                    type="text" 
                    required
                    value={newFullName} 
                    onChange={e => setNewFullName(e.target.value)} 
                    placeholder="ej. Franco Di Picar"
                    style={{width: '100%', marginTop: 5}}
                  />
                </label>
                <label>Contraseña
                  <input 
                    type="password" 
                    required
                    value={newPassword} 
                    onChange={e => setNewPassword(e.target.value)} 
                    placeholder="Nueva contraseña"
                    style={{width: '100%', marginTop: 5}}
                  />
                </label>
                <button type="submit" className="btn" style={{marginTop: 5}}>Crear Cuenta</button>
              </form>
            </div>

            {/* Change Password Card */}
            {editingUserId && (
              <div className="card" style={{border: '1px solid var(--accent-blue)'}}>
                <h3>Cambiar Clave</h3>
                <p style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 8}}>
                  Modificando la contraseña del usuario #{editingUserId}.
                </p>
                <form onSubmit={handleUpdatePassword} style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                  <label>Nueva Contraseña
                    <input 
                      type="password" 
                      required
                      value={changePassword} 
                      onChange={e => setChangePassword(e.target.value)} 
                      placeholder="Escribe la clave"
                      style={{width: '100%', marginTop: 5}}
                    />
                  </label>
                  <div style={{display: 'flex', gap: 10, marginTop: 5}}>
                    <button type="submit" className="btn" style={{flex: 1}}>Actualizar</button>
                    <button 
                      type="button" 
                      className="btn" 
                      style={{backgroundColor: 'var(--bg-dark)', color: 'var(--text-secondary)', flex: 1}}
                      onClick={() => setEditingUserId(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Web Customizer */}
      {activeTab === 'web_config' && (
        <div className="card" style={{width: '100%'}}>
          <h3>Personalización de la Tienda Web</h3>
          <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20}}>
            Modifica los textos, imágenes y datos de contacto de tu e-commerce storefront en tiempo real.
          </p>
          
          {webConfigLoading ? <p>Cargando configuración...</p> : (
            <form onSubmit={handleSaveWebConfig} style={{display: 'flex', gap: 30}}>
              {/* Left Column: Text configurations */}
              <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 15}}>
                <label>Nombre de la Tienda
                  <input 
                    type="text" 
                    value={webConfig.store_name} 
                    onChange={e => setWebConfig({ ...webConfig, store_name: e.target.value })} 
                    style={{width: '100%', marginTop: 5}}
                    required
                  />
                </label>
                
                <label>Título del Banner Principal (Hero)
                  <input 
                    type="text" 
                    value={webConfig.hero_title} 
                    onChange={e => setWebConfig({ ...webConfig, hero_title: e.target.value })} 
                    style={{width: '100%', marginTop: 5}}
                    required
                  />
                </label>
                
                <label>Subtítulo del Banner (Hero)
                  <textarea 
                    value={webConfig.hero_subtitle} 
                    onChange={e => setWebConfig({ ...webConfig, hero_subtitle: e.target.value })} 
                    style={{width: '100%', marginTop: 5, minHeight: 80, resize: 'vertical'}}
                    required
                  />
                </label>

                <label>Texto de Pie de Página (Footer)
                  <input 
                    type="text" 
                    value={webConfig.footer_text} 
                    onChange={e => setWebConfig({ ...webConfig, footer_text: e.target.value })} 
                    style={{width: '100%', marginTop: 5}}
                    required
                  />
                </label>
              </div>
              
              {/* Right Column: Contact & Media configurations */}
              <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 15}}>
                <label>Teléfono de Contacto (ej. WhatsApp)
                  <input 
                    type="text" 
                    value={webConfig.contact_phone} 
                    onChange={e => setWebConfig({ ...webConfig, contact_phone: e.target.value })} 
                    placeholder="ej. 5493416789012"
                    style={{width: '100%', marginTop: 5}}
                  />
                </label>
                
                <label>Dirección Local Comercial
                  <input 
                    type="text" 
                    value={webConfig.address} 
                    onChange={e => setWebConfig({ ...webConfig, address: e.target.value })} 
                    placeholder="ej. Bv. Oroño 123, Rosario"
                    style={{width: '100%', marginTop: 5}}
                  />
                </label>
                
                <div>
                  <label style={{display: 'block', marginBottom: 5}}>Logotipo de la Tienda</label>
                  <div style={{display: 'flex', gap: 10}}>
                    <input 
                      type="text" 
                      value={webConfig.logo_url} 
                      onChange={e => setWebConfig({ ...webConfig, logo_url: e.target.value })} 
                      placeholder="URL del Logotipo o selecciona de la Galería" 
                      style={{flex: 1}}
                    />
                    <button 
                      type="button" 
                      className="btn" 
                      style={{backgroundColor: 'var(--accent-blue)', color: '#fff'}}
                      onClick={() => {
                        setSelectorTarget("logo_url")
                        setShowImageSelector(true)
                      }}
                    >
                      Galería
                    </button>
                  </div>
                  {webConfig.logo_url && (
                    <div style={{marginTop: 10, display: 'flex', alignItems: 'center', gap: 10}}>
                      <span style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>Previsualización:</span>
                      <img src={webConfig.logo_url} alt="Logo preview" style={{maxHeight: 40, objectFit: 'contain', backgroundColor: 'var(--bg-dark)', padding: 4, borderRadius: 4}} />
                    </div>
                  )}
                </div>

                <div>
                  <label style={{display: 'block', marginBottom: 5}}>Imagen del Banner Principal (Hero)</label>
                  <div style={{display: 'flex', gap: 10}}>
                    <input 
                      type="text" 
                      value={webConfig.hero_image} 
                      onChange={e => setWebConfig({ ...webConfig, hero_image: e.target.value })} 
                      placeholder="URL del Banner o selecciona de la Galería" 
                      style={{flex: 1}}
                    />
                    <button 
                      type="button" 
                      className="btn" 
                      style={{backgroundColor: 'var(--accent-blue)', color: '#fff'}}
                      onClick={() => {
                        setSelectorTarget("hero_image")
                        setShowImageSelector(true)
                      }}
                    >
                      Galería
                    </button>
                  </div>
                  {webConfig.hero_image && (
                    <div style={{marginTop: 10, display: 'flex', alignItems: 'center', gap: 10}}>
                      <span style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>Previsualización:</span>
                      <img src={webConfig.hero_image} alt="Banner preview" style={{maxHeight: 60, maxWidth: 150, objectFit: 'contain', borderRadius: 4}} />
                    </div>
                  )}
                </div>
                
                <button type="submit" className="btn" style={{marginTop: 10, alignSelf: 'flex-start'}}>
                  Guardar Configuración Web
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Tab 4: Security settings */}
      {activeTab === 'security' && (
        <div className="card" style={{width: '100%'}}>
          <h3>Historial de Inicios de Sesión</h3>
          <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20}}>
            Muestra el registro detallado de las IPs y localizaciones de todas las personas que ingresan o intentan ingresar a este panel.
          </p>
          
          {historyLoading ? <p>Cargando historial...</p> : (
            <table className="data-table" style={{width: '100%', borderCollapse: 'collapse'}}>
              <thead>
                <tr>
                  <th style={{textAlign: 'left', padding: '12px 10px'}}>Fecha</th>
                  <th style={{textAlign: 'left', padding: '12px 10px'}}>Usuario</th>
                  <th style={{textAlign: 'left', padding: '12px 10px'}}>Dirección IP</th>
                  <th style={{textAlign: 'left', padding: '12px 10px'}}>Ubicación</th>
                  <th style={{textAlign: 'left', padding: '12px 10px'}}>Estado</th>
                  <th style={{textAlign: 'left', padding: '12px 10px'}}>Navegador / Dispositivo</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{textAlign: 'center', padding: 20, color: 'var(--text-secondary)'}}>
                      No se encontraron registros de accesos.
                    </td>
                  </tr>
                ) : (
                  history.map(item => (
                    <tr key={item.id} style={{borderBottom: '1px solid var(--border-color)'}}>
                      <td style={{padding: '12px 10px', fontSize: '0.85rem'}}>
                        {new Date(item.timestamp).toLocaleString()}
                      </td>
                      <td style={{padding: '12px 10px', fontSize: '0.85rem', fontWeight: 600}}>
                        {item.username || 'Desconocido'}
                      </td>
                      <td style={{padding: '12px 10px', fontSize: '0.85rem', fontFamily: 'monospace'}}>
                        {item.ip_address}
                      </td>
                      <td style={{padding: '12px 10px', fontSize: '0.85rem'}}>
                        {item.country === 'Red Local' ? 'Red Local' : `${item.city}, ${item.region}, ${item.country}`}
                      </td>
                      <td style={{padding: '12px 10px', fontSize: '0.85rem'}}>
                        {item.status === 'success' ? (
                          <span style={{
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            color: 'var(--accent-emerald)',
                            padding: '3px 8px',
                            borderRadius: 12,
                            fontWeight: 600,
                            fontSize: '0.75rem'
                          }}>Exitoso</span>
                        ) : (
                          <span style={{
                            backgroundColor: 'rgba(239, 68, 68, 0.15)',
                            color: 'var(--accent-red)',
                            padding: '3px 8px',
                            borderRadius: 12,
                            fontWeight: 600,
                            fontSize: '0.75rem'
                          }}>Fallido</span>
                        )}
                      </td>
                      <td style={{
                        padding: '12px 10px', 
                        fontSize: '0.75rem', 
                        color: 'var(--text-secondary)',
                        maxWidth: 250,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }} title={item.user_agent}>
                        {item.user_agent}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Media Selector Modal */}
      {showImageSelector && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div className="card shadow-2xl" style={{
            width: 900,
            maxWidth: '95%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            padding: 25,
            overflow: 'hidden',
            backgroundColor: 'var(--bg-card)',
            borderRadius: 12
          }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid var(--border-color)', paddingBottom: 15}}>
              <h3 style={{margin: 0}}>Seleccionar Imagen de Galería</h3>
              <button 
                className="btn" 
                style={{backgroundColor: 'var(--bg-dark)', color: 'var(--text-secondary)', padding: '6px 12px', fontSize: '0.85rem'}}
                onClick={() => setShowImageSelector(false)}
              >
                Cerrar
              </button>
            </div>
            
            <div style={{flex: 1, overflowY: 'auto'}}>
              <MediaBrowser onSelectImage={(url) => {
                setWebConfig(prev => ({ ...prev, [selectorTarget]: url }))
                setShowImageSelector(false)
              }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
