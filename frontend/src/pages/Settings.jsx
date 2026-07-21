import React, { useState, useEffect } from 'react'
import MediaBrowser from '../components/MediaBrowser'

export default function Settings() {
  const [config, setConfig] = useState({ 
    client_id: '', 
    client_secret: '', 
    redirect_uri: '', 
    demo_mode: true,
    meli_sync_interval: 30,
    meli_msg_purchase: '',
    meli_msg_shipping: '',
    meli_msg_invoice: '',
    meli_enable_manual_msg: false,
    meli_send_purchase_msg: true,
    meli_send_shipping_msg: true,
    meli_send_invoice_msg: true
  })
  const [status, setStatus] = useState({ is_authenticated: false, user_id: null })
  const [code, setCode] = useState("")
  
  // Tabs & Logs
  const [activeTab, setActiveTab] = useState("connection") // "connection", "users", "security", "web_config", "arca"
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // User Management
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  
  // Create User Form State
  const [newUsername, setNewUsername] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newFullName, setNewFullName] = useState("")
  const [newPerms, setNewPerms] = useState({
    dashboard: true,
    inventory: true,
    sales: true,
    billing: true,
    expenses: true,
    customers: true,
    media: true,
    settings: true
  })
  
  // Change Password / Permissions Form State
  const [editingUserId, setEditingUserId] = useState(null)
  const [changePassword, setChangePassword] = useState("")
  const [editingPermissionsUserId, setEditingPermissionsUserId] = useState(null)
  const [editPerms, setEditPerms] = useState({
    dashboard: false,
    inventory: false,
    sales: false,
    billing: false,
    expenses: false,
    customers: false,
    media: false,
    settings: false
  })

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

  // ARCA State
  const [arcaConfig, setArcaConfig] = useState({
    afip_enabled: false,
    afip_cuit: '',
    afip_pto_vta: 1,
    afip_type_cmp: 11,
    afip_concept: 1,
    afip_environment: 'homologacion',
    merchant_name: '',
    merchant_address: '',
    merchant_phone: '',
    merchant_iibb: '',
    merchant_iva_condition: 'Responsable Monotributo',
    merchant_start_date: '',
    afip_cert_uploaded: false,
    afip_key_generated: false
  })
  const [searchingCuit, setSearchingCuit] = useState(false)
  const [csrCompanyName, setCsrCompanyName] = useState('Hidroponia Rosario')
  const [generatedCsr, setGeneratedCsr] = useState('')
  const [generatingCsr, setGeneratingCsr] = useState(false)
  const [uploadingCert, setUploadingCert] = useState(false)
  const [webConfigLoading, setWebConfigLoading] = useState(false)
  const [showImageSelector, setShowImageSelector] = useState(false)
  const [selectorTarget, setSelectorTarget] = useState("")
  
  // Backup State
  const [backups, setBackups] = useState([])
  const [backupsLoading, setBackupsLoading] = useState(false)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [diskSpace, setDiskSpace] = useState(null)

  // WhatsApp Chatbot State
  const [waConfig, setWaConfig] = useState({
    enabled: false,
    gemini_api_key: '',
    bot_instructions: '',
    status: 'disconnected',
    phone: '',
    qr: ''
  })

  const fetchWaConfig = () => {
    fetch('/api/whatsapp/config')
      .then(r => {
        if (r.ok) return r.json()
        throw new Error("Failed to fetch WhatsApp config")
      })
      .then(setWaConfig)
      .catch(err => console.error(err))
  }

  const handleSaveWaConfig = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: waConfig.enabled,
          gemini_api_key: waConfig.gemini_api_key,
          bot_instructions: waConfig.bot_instructions
        })
      })
      if (res.ok) {
        alert("Configuración de WhatsApp guardada con éxito.")
        fetchWaConfig()
      } else {
        alert("Error al guardar la configuración.")
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    }
  }

  // Polling WhatsApp status when on tab
  useEffect(() => {
    if (activeTab === 'whatsapp') {
      fetchWaConfig()
      const interval = setInterval(() => {
        fetch('/api/whatsapp/config')
          .then(r => r.json())
          .then(setWaConfig)
          .catch(err => console.error("Error polling WhatsApp config:", err))
      }, 4000)
      return () => clearInterval(interval)
    }
  }, [activeTab])

  useEffect(() => {
    fetch('/api/settings/config').then(r=>r.json()).then(setConfig)
    fetch('/api/settings/status').then(r=>r.json()).then(setStatus)
  }, [])

  useEffect(() => {
    if (activeTab === "arca") {
      fetch('/api/settings/arca-config')
        .then(r => r.json())
        .then(setArcaConfig)
        .catch(err => console.error(err))
    }
  }, [activeTab])

  const handleSaveArcaConfig = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/settings/arca-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(arcaConfig)
      })
      if (res.ok) {
        alert("Configuración de facturación ARCA guardada con éxito")
      } else {
        alert("Error al guardar la configuración")
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    }
  }

  const handleGenerateCsr = async () => {
    if (!arcaConfig.afip_cuit) {
      alert("Por favor ingresa tu CUIT antes de generar la solicitud de certificado (CSR).")
      return
    }
    setGeneratingCsr(true)
    try {
      const res = await fetch('/api/settings/arca-generate-csr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuit: arcaConfig.afip_cuit,
          company_name: csrCompanyName
        })
      })
      if (res.ok) {
        const data = await res.json()
        setGeneratedCsr(data.csr)
        alert("Solicitud de certificado (CSR) generada con éxito. Cópiala o descárgala para subirla en la web de AFIP.")
        fetch('/api/settings/arca-config').then(r=>r.json()).then(setArcaConfig)
      } else {
        const err = await res.json()
        alert("Error al generar CSR: " + (err.detail || "Error del servidor"))
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setGeneratingCsr(false)
    }
  }

  const handleUploadCert = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    setUploadingCert(true)
    const formData = new FormData()
    formData.append("file", file)
    
    try {
      const res = await fetch('/api/settings/arca-upload-cert', {
        method: 'POST',
        body: formData
      })
      if (res.ok) {
        alert("Certificado digital (.crt) subido con éxito.")
        fetch('/api/settings/arca-config').then(r=>r.json()).then(setArcaConfig)
      } else {
        alert("Error al subir el certificado")
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setUploadingCert(false)
    }
  }

  const handleCuitLookup = async () => {
    if (!arcaConfig.afip_cuit) {
      alert("Por favor ingresa un CUIT para buscar.")
      return
    }
    setSearchingCuit(true)
    try {
      const res = await fetch(`/api/settings/arca-cuit-lookup?cuit=${arcaConfig.afip_cuit}&env=${arcaConfig.afip_environment}`)
      if (res.ok) {
        const data = await res.json()
        setArcaConfig(prev => ({
          ...prev,
          merchant_name: data.razon_social || prev.merchant_name,
          merchant_address: data.direccion || prev.merchant_address,
          merchant_iibb: data.iibb || prev.merchant_iibb,
          merchant_iva_condition: data.iva_condition || prev.merchant_iva_condition,
          merchant_start_date: data.fecha_inicio || prev.merchant_start_date
        }))
        let msg = "✅ Datos recuperados de AFIP con éxito"
        if (data.categoria_monotributo) {
          msg += `\n\nCategoría Monotributo: ${data.categoria_monotributo}`
        }
        if (data.monotributo_max_factura) {
          msg += `\nMonto máx. facturación: ${data.monotributo_max_factura}`
        }
        alert(msg)
      } else {
        const err = await res.json()
        alert("Error al buscar CUIT: " + (err.detail || "Error de AFIP"))
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setSearchingCuit(false)
    }
  }

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
  
  // Load Backups and Disk Space when backups tab opens
  const fetchBackups = () => {
    setBackupsLoading(true)
    fetch('/api/backup/list')
      .then(r => {
        if (!r.ok) throw new Error("Unauthorized or error")
        return r.json()
      })
      .then(data => {
        setBackups(data || [])
        setBackupsLoading(false)
      })
      .catch(err => {
        console.error(err)
        setBackupsLoading(false)
      })
  }

  const fetchDiskSpace = () => {
    fetch('/api/backup/disk-space')
      .then(r => r.json())
      .then(setDiskSpace)
      .catch(err => console.error(err))
  }

  useEffect(() => {
    if (activeTab === "backups") {
      fetchBackups()
      fetchDiskSpace()
    }
  }, [activeTab])

  const handleCreateBackup = async () => {
    setCreatingBackup(true)
    try {
      const res = await fetch('/api/backup/create', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        alert("Respaldo creado con éxito: " + data.filename)
        fetchBackups()
        fetchDiskSpace()
      } else {
        alert("Error al crear respaldo: " + (data.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setCreatingBackup(false)
    }
  }

  const handleDownloadBackup = async (filename) => {
    try {
      const res = await fetch(`/api/backup/download/${filename}`)
      if (!res.ok) {
        alert("Error al descargar el respaldo")
        return
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch(err) {
      alert("Error de conexión: " + err.message)
    }
  }

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
    
    const permissions = Object.keys(newPerms).filter(k => newPerms[k]).join(',')
    
    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          full_name: newFullName,
          permissions
        })
      })
      const data = await res.json()
      if (res.ok) {
        alert("Usuario creado exitosamente")
        setNewUsername("")
        setNewPassword("")
        setNewFullName("")
        setNewPerms({
          dashboard: true,
          inventory: true,
          sales: true,
          billing: true,
          expenses: true,
          customers: true,
          media: true,
          settings: true
        })
        fetchUsers()
      } else {
        alert("Error: " + (data.detail || "No se pudo crear el usuario"))
      }
    } catch(err) {
      alert("Error al conectar con el servidor: " + err.message)
    }
  }

  const handleEditPermissionsClick = (user) => {
    setEditingPermissionsUserId(user.id)
    setEditingUserId(null) // Cerrar tarjeta de clave
    const list = (user.permissions || "").split(',').map(p => p.trim())
    setEditPerms({
      dashboard: list.includes('dashboard'),
      inventory: list.includes('inventory'),
      sales: list.includes('sales'),
      billing: list.includes('billing'),
      expenses: list.includes('expenses'),
      customers: list.includes('customers'),
      media: list.includes('media'),
      settings: list.includes('settings')
    })
  }

  const handleUpdatePermissions = async (e) => {
    e.preventDefault()
    const permissions = Object.keys(editPerms).filter(k => editPerms[k]).join(',')
    
    try {
      const res = await fetch(`/api/auth/users/${editingPermissionsUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions })
      })
      const data = await res.json()
      if (res.ok) {
        alert("Permisos actualizados exitosamente")
        setEditingPermissionsUserId(null)
        fetchUsers()
      } else {
        alert("Error: " + (data.detail || "No se pudieron actualizar los permisos"))
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
        <button 
          style={{
            padding: '10px 15px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'arca' ? '3px solid var(--accent-blue)' : 'none',
            color: activeTab === 'arca' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'arca' ? 'bold' : 'normal',
            cursor: 'pointer'
          }}
          onClick={() => setActiveTab('arca')}
        >
          Facturación ARCA (ex AFIP)
        </button>
        <button 
          style={{
            padding: '10px 15px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'backups' ? '3px solid var(--accent-blue)' : 'none',
            color: activeTab === 'backups' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'backups' ? 'bold' : 'normal',
            cursor: 'pointer'
          }}
          onClick={() => setActiveTab('backups')}
        >
          Respaldos
        </button>
        <button 
          style={{
            padding: '10px 15px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'whatsapp' ? '3px solid var(--accent-blue)' : 'none',
            color: activeTab === 'whatsapp' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'whatsapp' ? 'bold' : 'normal',
            cursor: 'pointer'
          }}
          onClick={() => setActiveTab('whatsapp')}
        >
          🤖 Asistente WhatsApp (IA)
        </button>
      </div>

      {/* Tab 1: Connection settings */}
      {activeTab === 'connection' && (
        <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
          <div style={{display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap'}}>
            <div className="card" style={{flex: 1, minWidth: 300}}>
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
                <label style={{display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.9rem', marginTop: 5}}>
                  Intervalo de Sincronización Automática
                  <select 
                    value={config.meli_sync_interval || 30} 
                    onChange={e => setConfig({...config, meli_sync_interval: parseInt(e.target.value)})}
                    style={{width: '100%', marginTop: 5, padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                  >
                    <option value={15}>Cada 15 minutos</option>
                    <option value={30}>Cada 30 minutos</option>
                    <option value={60}>Cada 60 minutos (1 hora)</option>
                    <option value={120}>Cada 120 minutos (2 horas)</option>
                  </select>
                </label>
                <button className="btn" onClick={handleSave}>Guardar API Config</button>
              </div>
            </div>

            <div className="card" style={{flex: 1, minWidth: 300}}>
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

          <div className="card">
            <h3>Mensajería Automática y Manual (Mercado Libre)</h3>
            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 15}}>
              Configura los mensajes predeterminados y decide qué comunicaciones se envían de forma automática o si se habilitan controles manuales.
            </p>
            <div style={{display: 'flex', flexDirection: 'column', gap: 15}}>
              
              <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', paddingBottom: 12, marginBottom: 10}}>
                <input 
                  type="checkbox" 
                  checked={config.meli_enable_manual_msg || false} 
                  onChange={e => setConfig({...config, meli_enable_manual_msg: e.target.checked})} 
                  style={{width: 'auto'}}
                />
                <strong>Habilitar botones de mensajería manual en la lista de Ventas</strong>
              </label>

              <div style={{borderBottom: '1px solid var(--border-color)', paddingBottom: 15}}>
                <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: 'pointer', fontWeight: 600}}>
                  <input 
                    type="checkbox" 
                    checked={config.meli_send_purchase_msg !== false} 
                    onChange={e => setConfig({...config, meli_send_purchase_msg: e.target.checked})} 
                    style={{width: 'auto'}}
                  />
                  Enviar mensaje automático de compra
                </label>
                <textarea 
                  value={config.meli_msg_purchase || ""} 
                  onChange={e => setConfig({...config, meli_msg_purchase: e.target.value})} 
                  disabled={config.meli_send_purchase_msg === false}
                  placeholder="ej. ¡Hola! Gracias por tu compra. Nos pondremos en contacto a la brevedad para coordinar. ¡Saludos!"
                  style={{width: '100%', marginTop: 8, minHeight: 70, padding: 8, backgroundColor: config.meli_send_purchase_msg === false ? 'var(--bg-dark)' : 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4, opacity: config.meli_send_purchase_msg === false ? 0.6 : 1}}
                />
              </div>

              <div style={{borderBottom: '1px solid var(--border-color)', paddingBottom: 15}}>
                <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: 'pointer', fontWeight: 600}}>
                  <input 
                    type="checkbox" 
                    checked={config.meli_send_shipping_msg !== false} 
                    onChange={e => setConfig({...config, meli_send_shipping_msg: e.target.checked})} 
                    style={{width: 'auto'}}
                  />
                  Enviar mensaje automático de seguimiento de envío
                </label>
                <textarea 
                  value={config.meli_msg_shipping || ""} 
                  onChange={e => setConfig({...config, meli_msg_shipping: e.target.value})} 
                  disabled={config.meli_send_shipping_msg === false}
                  placeholder="ej. Hola, te informamos que tu pedido está en camino. Puedes realizar el seguimiento desde el detalle de tu compra. ¡Gracias por confiar en nosotros!"
                  style={{width: '100%', marginTop: 8, minHeight: 70, padding: 8, backgroundColor: config.meli_send_shipping_msg === false ? 'var(--bg-dark)' : 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4, opacity: config.meli_send_shipping_msg === false ? 0.6 : 1}}
                />
              </div>

              <div style={{borderBottom: '1px solid var(--border-color)', paddingBottom: 15}}>
                <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: 'pointer', fontWeight: 600}}>
                  <input 
                    type="checkbox" 
                    checked={config.meli_send_invoice_msg !== false} 
                    onChange={e => setConfig({...config, meli_send_invoice_msg: e.target.checked})} 
                    style={{width: 'auto'}}
                  />
                  Enviar mensaje automático al adjuntar factura
                </label>
                <textarea 
                  value={config.meli_msg_invoice || ""} 
                  onChange={e => setConfig({...config, meli_msg_invoice: e.target.value})} 
                  disabled={config.meli_send_invoice_msg === false}
                  placeholder="ej. Hola, te informamos que ya adjuntamos tu factura digital a los detalles de tu compra. ¡Saludos!"
                  style={{width: '100%', marginTop: 8, minHeight: 70, padding: 8, backgroundColor: config.meli_send_invoice_msg === false ? 'var(--bg-dark)' : 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4, opacity: config.meli_send_invoice_msg === false ? 0.6 : 1}}
                />
              </div>

              <button className="btn" onClick={handleSave} style={{alignSelf: 'flex-start'}}>Guardar Cambios de Configuración</button>
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
                            setEditingPermissionsUserId(null)
                            setChangePassword("")
                          }}
                        >
                          Clave
                        </button>
                        <button 
                          className="btn" 
                          style={{padding: '4px 8px', fontSize: '0.75rem', backgroundColor: 'var(--accent-emerald)', color: '#fff'}}
                          onClick={() => handleEditPermissionsClick(u)}
                        >
                          Permisos
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
                
                <div style={{marginTop: 5, marginBottom: 5}}>
                  <span style={{fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 5}}>Permisos:</span>
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 15px', fontSize: '0.85rem'}}>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={newPerms.dashboard} onChange={e => setNewPerms(prev => ({...prev, dashboard: e.target.checked}))} />
                      Métricas
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={newPerms.inventory} onChange={e => setNewPerms(prev => ({...prev, inventory: e.target.checked}))} />
                      Inventario
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={newPerms.sales} onChange={e => setNewPerms(prev => ({...prev, sales: e.target.checked}))} />
                      Ventas
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={newPerms.billing} onChange={e => setNewPerms(prev => ({...prev, billing: e.target.checked}))} />
                      Facturación
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={newPerms.expenses} onChange={e => setNewPerms(prev => ({...prev, expenses: e.target.checked}))} />
                      Gastos
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={newPerms.customers} onChange={e => setNewPerms(prev => ({...prev, customers: e.target.checked}))} />
                      Clientes
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={newPerms.media} onChange={e => setNewPerms(prev => ({...prev, media: e.target.checked}))} />
                      Imágenes
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={newPerms.settings} onChange={e => setNewPerms(prev => ({...prev, settings: e.target.checked}))} />
                      Configuración
                    </label>
                  </div>
                </div>

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

            {/* Edit Permissions Card */}
            {editingPermissionsUserId && (
              <div className="card" style={{border: '1px solid var(--accent-blue)'}}>
                <h3>Editar Permisos</h3>
                <p style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 8}}>
                  Modificando los permisos del usuario #{editingPermissionsUserId}.
                </p>
                <form onSubmit={handleUpdatePermissions} style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 15px', fontSize: '0.85rem'}}>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={editPerms.dashboard} onChange={e => setEditPerms(prev => ({...prev, dashboard: e.target.checked}))} />
                      Métricas
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={editPerms.inventory} onChange={e => setEditPerms(prev => ({...prev, inventory: e.target.checked}))} />
                      Inventario
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={editPerms.sales} onChange={e => setEditPerms(prev => ({...prev, sales: e.target.checked}))} />
                      Ventas
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={editPerms.billing} onChange={e => setEditPerms(prev => ({...prev, billing: e.target.checked}))} />
                      Facturación
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={editPerms.expenses} onChange={e => setEditPerms(prev => ({...prev, expenses: e.target.checked}))} />
                      Gastos
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={editPerms.customers} onChange={e => setEditPerms(prev => ({...prev, customers: e.target.checked}))} />
                      Clientes
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={editPerms.media} onChange={e => setEditPerms(prev => ({...prev, media: e.target.checked}))} />
                      Imágenes
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={editPerms.settings} onChange={e => setEditPerms(prev => ({...prev, settings: e.target.checked}))} />
                      Configuración
                    </label>
                  </div>
                  <div style={{display: 'flex', gap: 10, marginTop: 5}}>
                    <button type="submit" className="btn" style={{flex: 1}}>Guardar</button>
                    <button 
                      type="button" 
                      className="btn" 
                      style={{backgroundColor: 'var(--bg-dark)', color: 'var(--text-secondary)', flex: 1}}
                      onClick={() => setEditingPermissionsUserId(null)}
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
                  <label style={{display: 'block', marginBottom: 5}}>Favicon (Ícono de pestaña)</label>
                  <div style={{display: 'flex', gap: 10}}>
                    <input 
                      type="text" 
                      value={webConfig.favicon_url || ""} 
                      onChange={e => setWebConfig({ ...webConfig, favicon_url: e.target.value })} 
                      placeholder="URL del Favicon (Recomendado: 32x32px)" 
                      style={{flex: 1}}
                    />
                    <button 
                      type="button" 
                      className="btn" 
                      style={{backgroundColor: 'var(--accent-blue)', color: '#fff'}}
                      onClick={() => {
                        setSelectorTarget("favicon_url")
                        setShowImageSelector(true)
                      }}
                    >
                      Galería
                    </button>
                  </div>
                  {webConfig.favicon_url && (
                    <div style={{marginTop: 10, display: 'flex', alignItems: 'center', gap: 10}}>
                      <span style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>Previsualización:</span>
                      <img src={webConfig.favicon_url} alt="Favicon preview" style={{maxHeight: 32, maxWidth: 32, objectFit: 'contain', backgroundColor: 'var(--bg-dark)', padding: 2, borderRadius: 4}} />
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

      {/* Tab 5: ARCA / AFIP Billing Settings */}
      {activeTab === 'arca' && (
        <div style={{display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap'}}>
          <div className="card" style={{flex: 1, minWidth: 350}}>
            <h3>Facturación Electrónica ARCA (ex AFIP)</h3>
            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20}}>
              Vincula tu cuenta comercial y emite facturas oficiales autorizadas por ARCA.
            </p>
            
            <form onSubmit={handleSaveArcaConfig} style={{display: 'flex', flexDirection: 'column', gap: 15}}>
              <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: 'pointer'}}>
                <input 
                  type="checkbox" 
                  checked={arcaConfig.afip_enabled} 
                  onChange={e => setArcaConfig({...arcaConfig, afip_enabled: e.target.checked})} 
                  style={{width: 'auto'}}
                />
                Activar Facturación Electrónica ARCA/AFIP
              </label>

              <label>CUIT de la Empresa / Monotributista
                <div style={{display: 'flex', gap: 10, marginTop: 5}}>
                  <input 
                    type="text" 
                    required
                    placeholder="ej. 30-71234567-9"
                    value={arcaConfig.afip_cuit} 
                    onChange={e => setArcaConfig({...arcaConfig, afip_cuit: e.target.value})} 
                    style={{flex: 1, marginTop: 0}}
                  />
                  <button 
                    type="button" 
                    onClick={handleCuitLookup}
                    disabled={searchingCuit}
                    className="btn"
                    style={{backgroundColor: 'var(--accent-blue)', color: '#fff', fontSize: '0.8rem', padding: '0 12px', height: '38px'}}
                  >
                    {searchingCuit ? "Buscando..." : "Buscar AFIP"}
                  </button>
                </div>
              </label>

              <label>Razón Social (Oficial)
                <input 
                  type="text" 
                  required
                  placeholder="ej. Hidroponia Rosario S.R.L."
                  value={arcaConfig.merchant_name} 
                  onChange={e => setArcaConfig({...arcaConfig, merchant_name: e.target.value})} 
                  style={{width: '100%', marginTop: 5}}
                />
              </label>

              <label>Dirección Comercial / Fiscal
                <input 
                  type="text" 
                  required
                  placeholder="ej. Bv. Oroño 4500, Rosario"
                  value={arcaConfig.merchant_address} 
                  onChange={e => setArcaConfig({...arcaConfig, merchant_address: e.target.value})} 
                  style={{width: '100%', marginTop: 5}}
                />
              </label>

              <label>Teléfono de Contacto
                <input 
                  type="text" 
                  placeholder="ej. +54 341 456-7890"
                  value={arcaConfig.merchant_phone} 
                  onChange={e => setArcaConfig({...arcaConfig, merchant_phone: e.target.value})} 
                  style={{width: '100%', marginTop: 5}}
                />
              </label>

              <label>N° de Ingresos Brutos (IIBB)
                <input 
                  type="text" 
                  placeholder="ej. 20313832482 (o mismo que CUIT)"
                  value={arcaConfig.merchant_iibb} 
                  onChange={e => setArcaConfig({...arcaConfig, merchant_iibb: e.target.value})} 
                  style={{width: '100%', marginTop: 5}}
                />
              </label>

              <div style={{display: 'flex', gap: 15}}>
                <label style={{flex: 1}}>Condición frente al IVA
                  <select
                    value={arcaConfig.merchant_iva_condition}
                    onChange={e => setArcaConfig({...arcaConfig, merchant_iva_condition: e.target.value})}
                    style={{width: '100%', marginTop: 5}}
                  >
                    <option value="Responsable Monotributo">Responsable Monotributo</option>
                    <option value="Responsable Inscripto">Responsable Inscripto</option>
                    <option value="Exento">Exento</option>
                    <option value="No Responsable">No Responsable</option>
                  </select>
                </label>
                <label style={{flex: 1}}>Fecha de Inicio de Actividades
                  <input 
                    type="text" 
                    placeholder="ej. 01/01/2020"
                    value={arcaConfig.merchant_start_date} 
                    onChange={e => setArcaConfig({...arcaConfig, merchant_start_date: e.target.value})} 
                    style={{width: '100%', marginTop: 5}}
                  />
                </label>
              </div>

              <div style={{display: 'flex', gap: 15}}>
                <label style={{flex: 1}}>Punto de Venta
                  <input 
                    type="number" 
                    required
                    min="1"
                    value={arcaConfig.afip_pto_vta} 
                    onChange={e => setArcaConfig({...arcaConfig, afip_pto_vta: parseInt(e.target.value) || 1})} 
                    style={{width: '100%', marginTop: 5}}
                  />
                </label>

                <label style={{flex: 1}}>Tipo de Comprobante
                  <select 
                    value={arcaConfig.afip_type_cmp} 
                    onChange={e => setArcaConfig({...arcaConfig, afip_type_cmp: parseInt(e.target.value) || 11})} 
                    style={{width: '100%', marginTop: 5}}
                  >
                    <option value={11}>Factura C (Monotributo)</option>
                    <option value={6}>Factura B (Consumidor Final)</option>
                    <option value={1}>Factura A (Responsable Inscripto a CUIT)</option>
                  </select>
                </label>
              </div>

              <div style={{display: 'flex', gap: 15}}>
                <label style={{flex: 1}}>Concepto Factura
                  <select 
                    value={arcaConfig.afip_concept} 
                    onChange={e => setArcaConfig({...arcaConfig, afip_concept: parseInt(e.target.value) || 1})} 
                    style={{width: '100%', marginTop: 5}}
                  >
                    <option value={1}>Productos</option>
                    <option value={2}>Servicios</option>
                    <option value={3}>Productos & Servicios</option>
                  </select>
                </label>

                <label style={{flex: 1}}>Entorno
                  <select 
                    value={arcaConfig.afip_environment} 
                    onChange={e => setArcaConfig({...arcaConfig, afip_environment: e.target.value})} 
                    style={{width: '100%', marginTop: 5}}
                  >
                    <option value="homologacion">Homologación (Prueba)</option>
                    <option value="produccion">Producción (Real)</option>
                  </select>
                </label>
              </div>

              <button className="btn" type="submit" style={{marginTop: 10}}>
                Guardar Configuración ARCA
              </button>
            </form>
          </div>

          <div className="card" style={{flex: 1, minWidth: 350}}>
            <h3>Certificados Digitales de Autenticación</h3>
            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20}}>
              Configura tus credenciales y certificados para establecer conexión segura con ARCA.
            </p>

            <div style={{display: 'flex', flexDirection: 'column', gap: 15, marginBottom: 25}}>
              <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
                <span style={{fontSize: '0.9rem', fontWeight: 600}}>Clave Privada:</span>
                <span style={{
                  padding: '3px 8px',
                  borderRadius: 12,
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  backgroundColor: arcaConfig.afip_key_generated ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: arcaConfig.afip_key_generated ? 'var(--accent-emerald)' : 'var(--accent-red)'
                }}>
                  {arcaConfig.afip_key_generated ? "✓ Generada" : "✗ Faltante"}
                </span>
              </div>
              <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
                <span style={{fontSize: '0.9rem', fontWeight: 600}}>Certificado (.crt):</span>
                <span style={{
                  padding: '3px 8px',
                  borderRadius: 12,
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  backgroundColor: arcaConfig.afip_cert_uploaded ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: arcaConfig.afip_cert_uploaded ? 'var(--accent-emerald)' : 'var(--accent-red)'
                }}>
                  {arcaConfig.afip_cert_uploaded ? "✓ Activo" : "✗ Pendiente de subir"}
                </span>
              </div>

              {!arcaConfig.afip_cert_uploaded && (
                <div className="alert warning" style={{
                  padding: 10,
                  borderRadius: 6,
                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                  color: 'var(--accent-orange)',
                  fontSize: '0.8rem',
                  border: '1px solid rgba(245, 158, 11, 0.2)'
                }}>
                  <strong>Nota:</strong> Al no tener un certificado activo, el sistema operará en <strong>Modo Demo / Homologación de prueba</strong> generándote facturas simuladas con CAE para que pruebes las vistas.
                </div>
              )}
            </div>

            <div style={{borderTop: '1px solid var(--border-color)', paddingTop: 20, marginBottom: 20}}>
              <h4>1. Generar Solicitud de Certificado (CSR)</h4>
              <p style={{fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 15}}>
                Ingresa el nombre de tu empresa para generar la clave privada y la solicitud CSR que debes subir en AFIP.
              </p>

              <div style={{display: 'flex', gap: 10, marginBottom: 15}}>
                <input 
                  type="text" 
                  placeholder="Nombre de la Empresa"
                  value={csrCompanyName}
                  onChange={e => setCsrCompanyName(e.target.value)}
                  style={{flex: 1}}
                />
                <button 
                  className="btn" 
                  disabled={generatingCsr}
                  onClick={handleGenerateCsr}
                  style={{whiteSpace: 'nowrap', backgroundColor: 'var(--bg-dark)', color: 'var(--text-secondary)'}}
                >
                  {generatingCsr ? 'Generando...' : 'Generar CSR'}
                </button>
              </div>

              {generatedCsr && (
                <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                  <label style={{fontSize: '0.8rem', fontWeight: 600}}>Solicitud Certificado (CSR):</label>
                  <textarea 
                    readOnly
                    rows="6"
                    value={generatedCsr}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      width: '100%',
                      padding: 10,
                      backgroundColor: 'var(--bg-dark)',
                      color: '#fff',
                      border: '1px solid var(--border-color)',
                      borderRadius: 6
                    }}
                  />
                  <a 
                    href={`data:text/plain;charset=utf-8,${encodeURIComponent(generatedCsr)}`} 
                    download="arca.csr"
                    className="btn"
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.8rem',
                      display: 'inline-block',
                      textAlign: 'center',
                      textDecoration: 'none',
                      backgroundColor: 'var(--accent-blue)',
                      color: '#fff',
                      borderRadius: 4
                    }}
                  >
                    Descargar arca.csr
                  </a>
                </div>
              )}
            </div>

            <div style={{borderTop: '1px solid var(--border-color)', paddingTop: 20}}>
              <h4>2. Subir Certificado AFIP (.crt)</h4>
              <p style={{fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 15}}>
                Sube el certificado digital emitido por la web de AFIP correspondiente al CSR generado arriba.
              </p>

              <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                <input 
                  type="file" 
                  accept=".crt,.pem"
                  onChange={handleUploadCert}
                  disabled={uploadingCert}
                  style={{
                    fontSize: '0.85rem',
                    padding: 8,
                    border: '1px dashed var(--border-color)',
                    borderRadius: 6,
                    cursor: 'pointer'
                  }}
                />
                {uploadingCert && <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Subiendo certificado...</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Backups */}
      {activeTab === 'backups' && (
        <div style={{display: 'flex', gap: 20, alignItems: 'flex-start'}}>
          <div className="card" style={{flex: 2}}>
            <h3>Respaldos del Sistema (Backups)</h3>
            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 15}}>
              Descarga un archivo ZIP completo con la base de datos, configuraciones e imágenes de la tienda.
            </p>
            
            <button 
              className="btn" 
              onClick={handleCreateBackup} 
              disabled={creatingBackup}
              style={{marginBottom: 20, backgroundColor: 'var(--accent-emerald)', color: '#fff'}}
            >
              {creatingBackup ? 'Creando respaldo (puede demorar)...' : 'Crear Nuevo Respaldo'}
            </button>
            
            {backupsLoading ? <p>Cargando respaldos...</p> : (
              <table className="data-table" style={{width: '100%', borderCollapse: 'collapse'}}>
                <thead>
                  <tr>
                    <th style={{textAlign: 'left', padding: '12px 10px'}}>Archivo</th>
                    <th style={{textAlign: 'left', padding: '12px 10px'}}>Fecha de Creación</th>
                    <th style={{textAlign: 'left', padding: '12px 10px'}}>Tamaño</th>
                    <th style={{textAlign: 'left', padding: '12px 10px'}}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map(b => (
                    <tr key={b.filename} style={{borderBottom: '1px solid var(--border-color)'}}>
                      <td style={{padding: '12px 10px', fontSize: '0.85rem', fontWeight: 600}}>
                        {b.filename}
                      </td>
                      <td style={{padding: '12px 10px', fontSize: '0.85rem'}}>
                        {new Date(b.created_at).toLocaleString()}
                      </td>
                      <td style={{padding: '12px 10px', fontSize: '0.85rem'}}>
                        {(b.size_bytes / (1024 * 1024)).toFixed(2)} MB
                      </td>
                      <td style={{padding: '12px 10px', fontSize: '0.85rem'}}>
                        <button 
                          onClick={() => handleDownloadBackup(b.filename)}
                          className="btn"
                          style={{padding: '4px 12px', fontSize: '0.75rem', backgroundColor: 'var(--accent-blue)', color: '#fff', border: 'none', cursor: 'pointer', display: 'inline-block'}}
                        >
                          Descargar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {backups.length === 0 && (
                    <tr>
                      <td colSpan="4" style={{padding: '20px', textAlign: 'center', color: 'var(--text-secondary)'}}>
                        No hay respaldos creados aún.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 20}}>
            <div className="card">
              <h3>Espacio en la VPS</h3>
              {diskSpace ? (
                <div style={{marginTop: 15}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 5}}>
                    <span>{diskSpace.used_gb} GB Usados</span>
                    <span style={{color: 'var(--text-secondary)'}}>{diskSpace.free_gb} GB Libres</span>
                  </div>
                  <div style={{width: '100%', height: 10, backgroundColor: 'var(--bg-dark)', borderRadius: 5, overflow: 'hidden'}}>
                    <div 
                      style={{
                        height: '100%', 
                        width: `${diskSpace.percent_used}%`, 
                        backgroundColor: diskSpace.percent_used > 85 ? 'var(--accent-red)' : (diskSpace.percent_used > 70 ? 'var(--accent-amber)' : 'var(--accent-emerald)'),
                        transition: 'width 0.3s ease'
                      }}
                    ></div>
                  </div>
                  <div style={{textAlign: 'right', fontSize: '0.75rem', marginTop: 5, color: 'var(--text-secondary)'}}>
                    Total: {diskSpace.total_gb} GB
                  </div>
                </div>
              ) : (
                <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>Cargando información de disco...</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: WhatsApp Agent Settings */}
      {activeTab === 'whatsapp' && (
        <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
          <div style={{display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap'}}>
            
            {/* API Config Panel */}
            <div className="card" style={{flex: 2, minWidth: 320}}>
              <h3>Asistente de WhatsApp con Gemini AI</h3>
              <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20}}>
                Configura tu agente inteligente para responder de forma automática consultas de clientes en WhatsApp, incluyendo stock, precios y estado de sus pedidos.
              </p>
              
              <form onSubmit={handleSaveWaConfig} style={{display: 'flex', flexDirection: 'column', gap: 15}}>
                
                <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem', cursor: 'pointer', marginBottom: 5}}>
                  <input 
                    type="checkbox" 
                    checked={waConfig.enabled || false} 
                    onChange={e => setWaConfig({...waConfig, enabled: e.target.checked})} 
                    style={{width: 'auto'}}
                  />
                  <strong>Activar Asistente Virtual en WhatsApp</strong>
                </label>

                <label>Google Gemini API Key (Capa Gratuita o Pago)
                  <input 
                    type="password" 
                    value={waConfig.gemini_api_key || ""} 
                    onChange={e => setWaConfig({...waConfig, gemini_api_key: e.target.value})} 
                    placeholder="AIzaSy..." 
                    style={{width: '100%', marginTop: 5}}
                    required={waConfig.enabled}
                  />
                  <small style={{display: 'block', marginTop: 4, color: 'var(--text-secondary)', fontSize: '0.75rem'}}>
                    Obtén una clave gratuita de API en <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" style={{color: 'var(--accent-blue)', textDecoration: 'underline'}}>Google AI Studio</a>.
                  </small>
                </label>

                <label>Instrucciones de Personalización (System Instructions)
                  <textarea 
                    value={waConfig.bot_instructions || ""} 
                    onChange={e => setWaConfig({...waConfig, bot_instructions: e.target.value})} 
                    placeholder="ej. Eres un asistente virtual experto..."
                    style={{
                      width: '100%', 
                      marginTop: 5, 
                      minHeight: 180, 
                      padding: 10, 
                      backgroundColor: 'var(--bg-card)', 
                      color: 'var(--text-primary)', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: 4,
                      fontFamily: 'inherit',
                      fontSize: '0.85rem'
                    }}
                    required
                  />
                  <small style={{display: 'block', marginTop: 4, color: 'var(--text-secondary)', fontSize: '0.75rem'}}>
                    Define el tono del bot, reglas de cortesía, y cómo debe responder a preguntas frecuentes. El catálogo y stock vigentes de tu web se anexarán automáticamente a su memoria.
                  </small>
                </label>

                <button type="submit" className="btn" style={{alignSelf: 'flex-start'}}>Guardar Configuración</button>
              </form>
            </div>

            {/* Connection Status Panel */}
            <div className="card" style={{flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 15, alignItems: 'center', textAlign: 'center'}}>
              <h3>Estado del Servicio</h3>
              
              {waConfig.status === 'connected' && (
                <div style={{width: '100%'}}>
                  <div style={{display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)', fontWeight: 600, fontSize: '0.8rem', marginBottom: 15}}>
                    ● CONECTADO
                  </div>
                  <p style={{fontSize: '0.9rem', margin: '0 0 10px 0'}}>
                    El asistente virtual está respondiendo activamente consultas.
                  </p>
                  <div style={{fontSize: '0.85rem', padding: '10px 15px', backgroundColor: 'var(--bg-dark)', borderRadius: 6, display: 'inline-block', fontFamily: 'monospace'}}>
                    Línea Vinculada: +{waConfig.phone}
                  </div>
                </div>
              )}

              {waConfig.status === 'connecting' && (
                <div>
                  <div style={{display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, backgroundColor: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)', fontWeight: 600, fontSize: '0.8rem', marginBottom: 15}}>
                    ● CONECTANDO...
                  </div>
                  <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>
                    Iniciando el cliente de WhatsApp en el servidor. Por favor, aguarda.
                  </p>
                </div>
              )}

              {waConfig.status === 'qrcode' && waConfig.qr && (
                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%'}}>
                  <div style={{display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#d97706', fontWeight: 600, fontSize: '0.8rem', marginBottom: 15}}>
                    ● CÓDIGO QR LISTO
                  </div>
                  <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 15}}>
                    Escanea este código desde la sección <strong>Dispositivos Vinculados</strong> en tu celular para conectar el bot.
                  </p>
                  <div style={{padding: 10, backgroundColor: '#fff', borderRadius: 8, display: 'inline-block'}}>
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(waConfig.qr)}`} 
                      alt="WhatsApp QR Code" 
                      style={{display: 'block', width: 200, height: 200}}
                    />
                  </div>
                </div>
              )}

              {waConfig.status === 'disconnected' && (
                <div>
                  <div style={{display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-red)', fontWeight: 600, fontSize: '0.8rem', marginBottom: 15}}>
                    ● DESCONECTADO
                  </div>
                  <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>
                    El bot de WhatsApp no se encuentra iniciado. Asegúrate de que el servicio está activo en el servidor.
                  </p>
                </div>
              )}
            </div>

          </div>
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
