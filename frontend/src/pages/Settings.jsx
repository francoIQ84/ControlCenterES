import React, { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import MediaBrowser from '../components/MediaBrowser'
import LeadMagnetSettings from '../components/LeadMagnetSettings'
import { useTenant } from '../TenantContext'

export default function Settings() {
  const { isSimpleView, channels, isChannelEnabled, updateChannels } = useTenant()
  const [config, setConfig] = useState({ 
    client_id: '', 
    client_secret: '', 
    redirect_uri: '', 
    demo_mode: false,
    meli_sync_interval: 30,
    meli_msg_purchase: '',
    meli_msg_shipping: '',
    meli_msg_pickup: '',
    meli_msg_invoice: '',
    meli_enable_manual_msg: false,
    meli_send_purchase_msg: true,
    meli_send_shipping_msg: true,
    meli_send_pickup_msg: true,
    meli_send_invoice_msg: true
  })
  const [status, setStatus] = useState({ is_authenticated: false, user_id: null })
  const [code, setCode] = useState("")

  const [syncingHistorical, setSyncingHistorical] = useState(false)
  const [syncingToday, setSyncingToday] = useState(false)
  const [syncProgress, setSyncProgress] = useState(null)

  // Polling automático de progreso en tiempo real
  useEffect(() => {
    let intervalId = null
    const checkProgress = async () => {
      try {
        const res = await fetch('/api/settings/sync-progress')
        if (res.ok) {
          const data = await res.json()
          if (data && data.status) {
            setSyncProgress(data)
          }
        }
      } catch (err) {
        console.error("Error al consultar progreso de sincronización:", err)
      }
    }

    checkProgress()
    intervalId = setInterval(checkProgress, 1200)

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  const handleSyncToday = async () => {
    setSyncingToday(true)
    setSyncProgress({ status: 'syncing_products', progress: 5, message: 'Iniciando sincronización del día...' })
    try {
      const dateFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('.')[0] + 'Z'
      const res = await fetch('/api/settings/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 500, date_from: dateFrom })
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        alert("Error al iniciar la sincronización: " + (errData.detail || "Error desconocido"))
      }
    } catch (err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setSyncingToday(false)
    }
  }

  const handleSyncHistorical = async () => {
    setSyncingHistorical(true)
    setSyncProgress({ status: 'syncing_products', progress: 5, message: 'Iniciando sincronización histórica (2 años)...' })
    try {
      const res = await fetch('/api/settings/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 2000 })
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        alert("Error al iniciar la sincronización: " + (errData.detail || "Error desconocido"))
      }
    } catch (err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setSyncingHistorical(false)
    }
  }
  
  // Tabs & Logs
  const [activeTab, setActiveTab] = useState("channels") // "channels", "connection", "tiendanube", "users", "security", "web_config", "arca"
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Tiendanube State
  const [tnStatus, setTnStatus] = useState({
    is_connected: false,
    is_demo_mode: false,
    store_id: null,
    total_local_products: 0,
    synced_products_count: 0,
    last_sync_at: null,
    auth_url: null,
    client_id_configured: false
  })
  const [tnLoading, setTnLoading] = useState(false)
  const [tnSyncing, setTnSyncing] = useState(false)
  const [tnExportingBranding, setTnExportingBranding] = useState(false)
  const [tnConfig, setTnConfig] = useState({
    client_id: '',
    client_secret: '',
    redirect_uri: 'https://admin.hidroponiarosario.com/api/tiendanube/callback'
  })
  const [tnSavingConfig, setTnSavingConfig] = useState(false)
  const [tnConfigMsg, setTnConfigMsg] = useState(null)
  const [showTnSecret, setShowTnSecret] = useState(false)
  const [tnExportOptions, setTnExportOptions] = useState({
    price_source: 'auto',
    only_with_stock: false,
    price_modifier_pct: 0.0,
    sync_branding: true
  })
  const [tnExporting, setTnExporting] = useState(false)
  const [tnExportProgress, setTnExportProgress] = useState(null)

  const fetchTnStatus = () => {
    setTnLoading(true)
    fetch('/api/tiendanube/status')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setTnStatus(data)
      })
      .catch(err => console.error("Error fetching Tiendanube status:", err))
      .finally(() => setTnLoading(false))
  }

  const fetchTnConfig = () => {
    fetch('/api/tiendanube/config')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setTnConfig(prev => ({ ...prev, ...data }))
      })
      .catch(err => console.error("Error fetching Tiendanube config:", err))
  }

  const handleSaveTnConfig = async () => {
    setTnSavingConfig(true)
    setTnConfigMsg(null)
    try {
      const res = await fetch('/api/tiendanube/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: tnConfig.client_id,
          client_secret: tnConfig.client_secret
        })
      })
      const data = await res.json()
      if (res.ok) {
        setTnConfigMsg({ type: 'success', text: 'Credenciales de Tiendanube guardadas con éxito.' })
        fetchTnStatus()
      } else {
        setTnConfigMsg({ type: 'error', text: data.detail || 'Error al guardar credenciales.' })
      }
    } catch (err) {
      setTnConfigMsg({ type: 'error', text: 'Error de conexión: ' + err.message })
    } finally {
      setTnSavingConfig(false)
    }
  }

  const handleTnConnect = () => {
    if (tnStatus.auth_url) {
      window.location.href = tnStatus.auth_url
    } else {
      fetch('/api/tiendanube/auth-url')
        .then(r => r.json())
        .then(d => {
          if (d.auth_url) window.location.href = d.auth_url
          else alert("No se pudo generar la URL de autorización de Tiendanube.")
        })
        .catch(err => alert("Error: " + err.message))
    }
  }

  const handleTnDisconnect = async () => {
    if (!window.confirm("¿Seguro que deseas desvincular la cuenta de Tiendanube de este sistema?")) return
    try {
      const res = await fetch('/api/tiendanube/disconnect', { method: 'DELETE' })
      if (res.ok) {
        alert("Tiendanube desvinculada.")
        fetchTnStatus()
      } else {
        alert("Error al desvincular")
      }
    } catch(err) {
      alert("Error: " + err.message)
    }
  }

  const handleTnSyncOrders = async () => {
    setTnSyncing(true)
    try {
      const res = await fetch('/api/tiendanube/sync-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100 })
      })
      const data = await res.json()
      if (res.ok) {
        alert(data.message || "Órdenes de Tiendanube sincronizadas con éxito.")
        fetchTnStatus()
      } else {
        alert("Error: " + (data.detail || "No se pudieron sincronizar las órdenes"))
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setTnSyncing(false)
    }
  }

  const handleTnExportBranding = async () => {
    setTnExportingBranding(true)
    try {
      const res = await fetch('/api/tiendanube/export-branding', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        alert("✅ " + (data.message || "Logotipo e información de tienda sincronizados con Tiendanube."))
      } else {
        alert("Error: " + (data.detail || "No se pudo sincronizar la marca"))
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setTnExportingBranding(false)
    }
  }

  const handleTnStartExport = async () => {
    if (!window.confirm("¿Deseas iniciar la exportación masiva de productos y categorías a Tiendanube?")) return
    setTnExporting(true)
    try {
      const res = await fetch('/api/tiendanube/export-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tnExportOptions)
      })
      if (res.ok) {
        const poll = setInterval(async () => {
          try {
            const pRes = await fetch('/api/tiendanube/export-progress')
            if (pRes.ok) {
              const pData = await pRes.json()
              setTnExportProgress(pData)
              if (pData.status === 'completed' || pData.status === 'failed') {
                clearInterval(poll)
                setTnExporting(false)
                fetchTnStatus()
              }
            }
          } catch(e) {
            console.error(e)
          }
        }, 1500)
      } else {
        const errData = await res.json()
        alert("Error: " + (errData.detail || "No se pudo iniciar la exportación"))
        setTnExporting(false)
      }
    } catch(err) {
      alert("Error: " + err.message)
      setTnExporting(false)
    }
  }

  const [tnImporting, setTnImporting] = useState(false)
  const [tnImportProgress, setTnImportProgress] = useState(null)

  const handleTnStartImport = async () => {
    if (!window.confirm("¿Deseas importar todo tu catálogo y categorías desde Tiendanube hacia ControlCenterES?")) return
    setTnImporting(true)
    try {
      const res = await fetch('/api/tiendanube/import-catalog', { method: 'POST' })
      if (res.ok) {
        const poll = setInterval(async () => {
          try {
            const pRes = await fetch('/api/tiendanube/export-progress')
            if (pRes.ok) {
              const pData = await pRes.json()
              setTnImportProgress(pData)
              if (pData.status === 'completed' || pData.status === 'failed') {
                clearInterval(poll)
                setTnImporting(false)
                fetchTnStatus()
                alert(pData.message || "Importación desde Tiendanube completada.")
              }
            }
          } catch(e) {
            console.error(e)
          }
        }, 1500)
      } else {
        const errData = await res.json()
        alert("Error: " + (errData.detail || "No se pudo iniciar la importación"))
        setTnImporting(false)
      }
    } catch(err) {
      alert("Error: " + err.message)
      setTnImporting(false)
    }
  }

  const handleTnImportAll = async () => {
    if (!window.confirm("¿Deseas realizar una IMPORTACIÓN TOTAL desde Tiendanube? (Se importará el logotipo de tu tienda, datos de contacto, categorías, todos los productos con imágenes y stock, y las últimas ventas).")) return
    setTnImporting(true)
    try {
      const res = await fetch('/api/tiendanube/import-all', { method: 'POST' })
      if (res.ok) {
        const poll = setInterval(async () => {
          try {
            const pRes = await fetch('/api/tiendanube/export-progress')
            if (pRes.ok) {
              const pData = await pRes.json()
              setTnImportProgress(pData)
              if (pData.status === 'completed' || pData.status === 'failed') {
                clearInterval(poll)
                setTnImporting(false)
                fetchTnStatus()
                alert(pData.message || "Importación total desde Tiendanube finalizada con éxito.")
              }
            }
          } catch(e) {
            console.error(e)
          }
        }, 1500)
      } else {
        const errData = await res.json()
        alert("Error: " + (errData.detail || "No se pudo iniciar la importación total"))
        setTnImporting(false)
      }
    } catch(err) {
      alert("Error: " + err.message)
      setTnImporting(false)
    }
  }

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
    settings: true,
    inpi: true,
    marketing: true,
    blog: true
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
    settings: false,
    inpi: false,
    marketing: false,
    blog: false
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

  // Featured Products Order state
  const [inventoryProducts, setInventoryProducts] = useState([])
  const [featuredIds, setFeaturedIds] = useState([])
  const [selectedProductToAdd, setSelectedProductToAdd] = useState("")
  const [savingFeaturedOrder, setSavingFeaturedOrder] = useState(false)
  
  // Backup State
  const [backups, setBackups] = useState([])
  const [backupsLoading, setBackupsLoading] = useState(false)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [diskSpace, setDiskSpace] = useState(null)

  // Google Drive State
  const [googleDriveConfig, setGoogleDriveConfig] = useState({
    active: false,
    folder_id: '',
    service_account_json: ''
  })
  const [savingGDrive, setSavingGDrive] = useState(false)

  // Restore State
  const [restoreFile, setRestoreFile] = useState(null)
  const [restorePreview, setRestorePreview] = useState(null)
  const [restorePreviewLoading, setRestorePreviewLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreResult, setRestoreResult] = useState(null)

  // WhatsApp Chatbot State
  const [waConfig, setWaConfig] = useState({
    enabled: false,
    gemini_api_key: '',
    bot_instructions: '',
    status: 'disconnected',
    phone: '',
    qr: ''
  })
  const [testingKey, setTestingKey] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [showPromptModal, setShowPromptModal] = useState(false)
  const [useMonospacePrompt, setUseMonospacePrompt] = useState(true)

  const [modelCapabilities, setModelCapabilities] = useState(null)

  const promptText = waConfig.bot_instructions || ""
  const promptCharCount = promptText.length
  const promptWordCount = promptText.trim() ? promptText.trim().split(/\s+/).filter(Boolean).length : 0
  const promptTokenEst = Math.ceil(promptCharCount / 4)
  const promptLineCount = promptText ? promptText.split('\n').length : 0


  const handleTestGeminiKey = async () => {
    if (!waConfig.gemini_api_key) {
      alert("Por favor ingresa una API Key de Gemini primero.")
      return
    }
    setTestingKey(true)
    setTestResult(null)
    setModelCapabilities(null)
    try {
      const res = await fetch('/api/whatsapp/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gemini_api_key: waConfig.gemini_api_key })
      })
      const data = await res.json()
      if (data.success) {
        setTestResult({ success: true, message: data.message || "Conexión exitosa" })
        // Fetch detailed model capabilities
        try {
          const capRes = await fetch('/api/marketing/ai-models')
          if (capRes.ok) {
            const capData = await capRes.json()
            if (capData.success) {
              setModelCapabilities(capData)
            }
          }
        } catch (e) {
          console.error("Error fetching AI model capabilities:", e)
        }
      } else {
        setTestResult({ success: false, message: data.error || data.detail || "Error al conectar" })
      }
    } catch (err) {
      setTestResult({ success: false, message: "Error de red: " + err.message })
    } finally {
      setTestingKey(false)
    }
  }

  const fetchModelCapabilities = async () => {
    try {
      const res = await fetch('/api/marketing/ai-models')
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setModelCapabilities(data)
        }
      }
    } catch (e) {}
  }

  const [inquiriesSummary, setInquiriesSummary] = useState(null)
  const [inquiriesList, setInquiriesList] = useState([])
  const [inquiriesLoading, setInquiriesLoading] = useState(false)
  const [tokenUsage, setTokenUsage] = useState(null)

  const fetchTokenUsage = () => {
    fetch('/api/whatsapp/token-usage')
      .then(r => r.ok ? r.json() : null)
      .then(setTokenUsage)
      .catch(err => console.error(err))
  }

  const fetchInquiries = () => {
    setInquiriesLoading(true)
    Promise.all([
      fetch('/api/whatsapp/inquiries/summary').then(r => r.ok ? r.json() : null),
      fetch('/api/whatsapp/inquiries/list').then(r => r.ok ? r.json() : [])
    ]).then(([summaryData, listData]) => {
      if (summaryData) setInquiriesSummary(summaryData)
      if (listData) setInquiriesList(listData)
    }).catch(err => console.error(err))
    .finally(() => setInquiriesLoading(false))
  }

  const [pausedChats, setPausedChats] = useState([])
  const [unpausingSender, setUnpausingSender] = useState(null)

  const fetchPausedChats = () => {
    fetch('/api/whatsapp/paused-chats')
      .then(r => r.ok ? r.json() : [])
      .then(setPausedChats)
      .catch(err => console.error(err))
  }

  const handleUnpauseChat = async (sender) => {
    setUnpausingSender(sender)
    try {
      const res = await fetch('/api/whatsapp/unpause-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender })
      })
      if (res.ok) {
        fetchPausedChats()
      } else {
        alert("Error al reanudar la IA.")
      }
    } catch(err) {
      alert("Error: " + err.message)
    } finally {
      setUnpausingSender(null)
    }
  }

  // WhatsApp Schedule State
  const DEFAULT_SCHEDULE = {
    enabled: false,
    timezone: 'America/Argentina/Buenos_Aires',
    days: {
      monday: { mode: 'allday' },
      tuesday: { mode: 'allday' },
      wednesday: { mode: 'allday' },
      thursday: { mode: 'allday' },
      friday: { mode: 'allday' },
      saturday: { mode: 'allday' },
      sunday: { mode: 'allday' }
    },
    off_schedule_message: ''
  }
  const [waSchedule, setWaSchedule] = useState(DEFAULT_SCHEDULE)
  const [savingSchedule, setSavingSchedule] = useState(false)

  const DAY_LABELS = {
    monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles',
    thursday: 'Jueves', friday: 'Viernes', saturday: 'Sábado', sunday: 'Domingo'
  }
  const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

  const HOUR_OPTIONS = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      HOUR_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }

  const fetchWaSchedule = () => {
    fetch('/api/whatsapp/schedule')
      .then(r => r.ok ? r.json() : DEFAULT_SCHEDULE)
      .then(data => setWaSchedule(prev => ({ ...DEFAULT_SCHEDULE, ...data })))
      .catch(err => console.error(err))
  }

  const handleSaveWaSchedule = async () => {
    setSavingSchedule(true)
    try {
      const res = await fetch('/api/whatsapp/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(waSchedule)
      })
      if (res.ok) {
        alert("Horario del asistente guardado con éxito.")
      } else {
        alert("Error al guardar el horario.")
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setSavingSchedule(false)
    }
  }

  const updateDayConfig = (day, updates) => {
    setWaSchedule(prev => ({
      ...prev,
      days: {
        ...prev.days,
        [day]: { ...prev.days[day], ...updates }
      }
    }))
  }

  const fetchWaConfig = () => {
    fetch('/api/whatsapp/config')
      .then(r => {
        if (r.ok) return r.json()
        throw new Error("Failed to fetch WhatsApp config")
      })
      .then(setWaConfig)
      .catch(err => console.error(err))
    fetchInquiries()
    fetchTokenUsage()
    fetchPausedChats()
    fetchModelCapabilities()
    fetchWaSchedule()
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

  const [disconnectingWa, setDisconnectingWa] = useState(false)

  const handleDisconnectWa = async () => {
    if (!window.confirm("¿Seguro que deseas desvincular la línea de WhatsApp actual y generar un nuevo código QR?")) {
      return
    }
    setDisconnectingWa(true)
    try {
      const res = await fetch('/api/whatsapp/disconnect', { method: 'POST' })
      if (res.ok) {
        alert("Línea desvinculada correctamente. Se generará un nuevo código QR en breve.")
        fetchWaConfig()
      } else {
        alert("Error al desvincular la línea de WhatsApp.")
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setDisconnectingWa(false)
    }
  }

  // Polling WhatsApp status when on tab
  useEffect(() => {
    if (activeTab === 'whatsapp') {
      fetchWaConfig()
      const interval = setInterval(() => {
        fetch('/api/whatsapp/config')
          .then(r => r.json())
          .then(data => {
            if (data) {
              setWaConfig(prev => ({
                ...prev,
                status: data.status,
                phone: data.phone,
                qr: data.qr
              }))
            }
          })
          .catch(err => console.error("Error polling WhatsApp config:", err))
        fetchPausedChats()
      }, 4000)
      return () => clearInterval(interval)
    }
  }, [activeTab])

  useEffect(() => {
    fetch('/api/settings/config').then(r=>r.json()).then(setConfig)
    fetch('/api/settings/status').then(r=>r.json()).then(setStatus)
    fetchTnStatus()

    // Detectar si venimos del flujo OAuth de Tiendanube
    const params = new URLSearchParams(window.location.search)
    if (params.get('tn_status') === 'success') {
      alert("🎉 ¡Tiendanube conectada exitosamente! Todos los webhooks y sincronización han sido configurados automáticamente.")
      setActiveTab('tiendanube')
      window.history.replaceState({}, document.title, window.location.pathname)
    } else if (params.get('tn_error')) {
      alert("Error al conectar Tiendanube: " + params.get('tn_error'))
      setActiveTab('tiendanube')
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

  useEffect(() => {
    if (activeTab === "tiendanube") {
      fetchTnStatus()
    }
  }, [activeTab])

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
    } else if (activeTab === "tiendanube") {
      fetchTnStatus()
      fetchTnConfig()
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

  const fetchGoogleDriveConfig = () => {
    fetch('/api/integrations/')
      .then(r => r.json())
      .then(data => {
        if (data && data.integrations) {
          const gd = data.integrations.find(i => i.provider === 'google_drive')
          if (gd) {
            setGoogleDriveConfig({
              active: gd.is_active || false,
              folder_id: gd.has_credentials ? '(Configurado - ID oculto por seguridad)' : '',
              service_account_json: gd.has_credentials ? '********' : ''
            })
          }
        }
      })
      .catch(err => console.error(err))
  }

  const handleSaveGoogleDrive = async () => {
    setSavingGDrive(true)
    try {
      let credentials = {}
      if (googleDriveConfig.service_account_json && googleDriveConfig.service_account_json !== '********') {
        try {
          credentials = JSON.parse(googleDriveConfig.service_account_json)
        } catch(e) {
          alert("El JSON de la Service Account no es válido.")
          setSavingGDrive(false)
          return
        }
      }
      
      if (googleDriveConfig.folder_id && googleDriveConfig.folder_id !== '(Configurado - ID oculto por seguridad)') {
        credentials.folder_id = googleDriveConfig.folder_id
      }

      const res = await fetch('/api/integrations/google_drive', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentials,
          is_active: googleDriveConfig.active
        })
      })
      if (res.ok) {
        alert("Configuración de Google Drive guardada con éxito.")
        fetchGoogleDriveConfig()
      } else {
        const data = await res.json()
        alert("Error al guardar: " + (data.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setSavingGDrive(false)
    }
  }

  useEffect(() => {
    if (activeTab === "backups") {
      fetchBackups()
      fetchDiskSpace()
      fetchGoogleDriveConfig()
    }
    if (activeTab === "web_config") {
      fetchFeaturedProducts()
    }
  }, [activeTab])

  const fetchFeaturedProducts = () => {
    fetch('/api/inventory/')
      .then(r => r.json())
      .then(data => {
        if (data && data.products) {
          setInventoryProducts(data.products)
          const featured = data.products
            .filter(p => (p.featured_order || 0) > 0)
            .sort((a, b) => a.featured_order - b.featured_order)
            .map(p => p.ml_id)
          setFeaturedIds(featured)
        }
      })
      .catch(err => console.error(err))
  }

  const moveFeaturedUp = (index) => {
    if (index <= 0) return
    const newArr = [...featuredIds]
    const temp = newArr[index - 1]
    newArr[index - 1] = newArr[index]
    newArr[index] = temp
    setFeaturedIds(newArr)
  }

  const moveFeaturedDown = (index) => {
    if (index >= featuredIds.length - 1) return
    const newArr = [...featuredIds]
    const temp = newArr[index + 1]
    newArr[index + 1] = newArr[index]
    newArr[index] = temp
    setFeaturedIds(newArr)
  }

  const removeFeatured = (id) => {
    setFeaturedIds(prev => prev.filter(item => item !== id))
  }

  const addFeatured = () => {
    if (!selectedProductToAdd) return
    if (!featuredIds.includes(selectedProductToAdd)) {
      setFeaturedIds(prev => [...prev, selectedProductToAdd])
    }
    setSelectedProductToAdd("")
  }

  const handleSaveFeaturedOrder = async () => {
    setSavingFeaturedOrder(true)
    try {
      const res = await fetch('/api/inventory/featured-order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured_ids: featuredIds })
      })
      const data = await res.json()
      if (res.ok) {
        alert("Orden de productos destacados guardado con éxito. Se verán primero en la portada de la tienda web.")
        fetchFeaturedProducts()
      } else {
        alert("Error al guardar orden: " + (data.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error: " + err.message)
    } finally {
      setSavingFeaturedOrder(false)
    }
  }

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

  const handleRestoreFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setRestoreFile(f)
    setRestorePreview(null)
    setRestoreResult(null)
    // Upload to preview endpoint
    setRestorePreviewLoading(true)
    // We can't preview an uploaded file directly — we'll show file info
    // and let the user confirm before restoring
    const sizeMB = (f.size / (1024 * 1024)).toFixed(2)
    setRestorePreview({
      filename: f.name,
      size_mb: sizeMB,
      // We'll fetch manifest after upload if it's a known backup on server
    })
    setRestorePreviewLoading(false)
  }

  const handleRestore = async () => {
    if (!restoreFile) return
    if (!window.confirm('⚠️ ATENCIÓN: Esto reemplazará TODOS los datos actuales del sistema (base de datos, archivos, certificados, sesión de WhatsApp) con los del respaldo seleccionado.\n\n¿Estás seguro de que deseas continuar?')) return
    if (!window.confirm('🔴 ÚLTIMA CONFIRMACIÓN: Esta acción NO se puede deshacer (se creará un respaldo de seguridad automático antes de restaurar).\n\n¿Confirmar restauración?')) return

    setRestoring(true)
    setRestoreResult(null)
    try {
      const formData = new FormData()
      formData.append('file', restoreFile)
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (res.ok) {
        setRestoreResult({ success: true, ...data })
        fetchBackups()
        fetchDiskSpace()
      } else {
        setRestoreResult({ success: false, error: data.detail?.message || data.detail || 'Error desconocido' })
      }
    } catch (err) {
      setRestoreResult({ success: false, error: err.message })
    } finally {
      setRestoring(false)
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
    if (!config.client_id) {
      alert("Por favor ingresa primero tu App ID (Client ID) y presiona 'Guardar API Config'.")
      return
    }
    const redirectUri = config.redirect_uri || (window.location.origin + '/settings')
    const url = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${config.client_id}&redirect_uri=${encodeURIComponent(redirectUri)}`
    window.location.href = url
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
          settings: true,
          inpi: true,
          marketing: true,
          blog: true
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
      settings: list.includes('settings'),
      inpi: list.includes('inpi'),
      marketing: list.includes('marketing'),
      blog: list.includes('blog')
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
      {/* Tab bar (4 per row grid) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 10,
        marginBottom: 25
      }}>
        {[
          { id: 'channels', label: 'Canales & Módulos', icon: '🎛️' },
          ...(isChannelEnabled('meli') ? [{ id: 'connection', label: 'Conexión ML / MP', icon: '🔌' }] : []),
          ...(isChannelEnabled('tiendanube') ? [{ id: 'tiendanube', label: 'Tiendanube', icon: '🛍️' }] : []),
          { id: 'users', label: 'Gestión de Usuarios', icon: '👥' },
          ...(isChannelEnabled('web') ? [
            { id: 'web_config', label: 'Configuración Web', icon: '🌐' },
            { id: 'lead_magnet', label: 'Pop-up Lead Magnet & Emails', icon: '🌱' },
          ] : []),
          { id: 'security', label: 'Seguridad & Accesos', icon: '🔒' },
          ...(isChannelEnabled('arca') ? [{ id: 'arca', label: 'Facturación ARCA (ex AFIP)', icon: '🧾' }] : []),
          { id: 'backups', label: 'Respaldos', icon: '💾' },
          ...(isChannelEnabled('whatsapp') ? [{ id: 'whatsapp', label: 'Asistente WhatsApp (IA)', icon: '🤖' }] : [])
        ].filter(t => !isSimpleView || ['channels', 'connection', 'tiendanube', 'web_config', 'whatsapp'].includes(t.id)).map(t => {
          const isActive = activeTab === t.id
          return (
            <button
              key={t.id}
              style={{
                padding: '12px 10px',
                borderRadius: 8,
                border: isActive ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
                backgroundColor: isActive ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-card)',
                color: isActive ? 'var(--accent-blue)' : 'var(--text-primary)',
                fontWeight: isActive ? 'bold' : '500',
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                textAlign: 'center',
                transition: 'all 0.2s'
              }}
              onClick={() => setActiveTab(t.id)}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab: Channels & Modules Management */}
      {activeTab === 'channels' && (
        <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
          <div className="card" style={{
            background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(16, 185, 129, 0.04) 100%)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 15
          }}>
            <div>
              <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6}}>
                <span style={{fontSize: '1.8rem'}}>🎛️</span>
                <h3 style={{margin: 0, fontSize: '1.25rem'}}>Canales de Venta e Integraciones Habilitadas</h3>
              </div>
              <p style={{margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)'}}>
                Enciende o apaga las plataformas que utilizas. El sistema ocultará automáticamente todos los menús, botones, columnas y filtros de las plataformas desactivadas para mantener tu espacio 100% limpio y sin distracciones.
              </p>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 16
          }}>
            {[
              {
                id: 'channel_local',
                icon: '🏪',
                title: 'Venta en Mostrador / Local (POS)',
                description: 'Punto de Venta presencial, cobranzas en caja, facturación de mostrador y lector de código de barras/QR.',
                active: isChannelEnabled('local')
              },
              {
                id: 'channel_web',
                icon: '🌐',
                title: 'Tienda Web Propia (Ecommerce)',
                description: 'Catálogo online integrado, carrito de compras, pop-up lead magnet, precios web y pedidos directos.',
                active: isChannelEnabled('web')
              },
              {
                id: 'channel_meli',
                icon: '🛍️',
                title: 'Mercado Libre / Mercado Pago',
                description: 'Sincronización bidireccional de publicaciones, stock en vivo, preguntas con IA, cobros y envíos.',
                active: isChannelEnabled('meli')
              },
              {
                id: 'channel_tiendanube',
                icon: '🛍️',
                title: 'Tiendanube (Nuvemshop)',
                description: 'Exportador/importador masivo de catálogo, sincronización de stock y pedidos en tiempo real por webhooks.',
                active: isChannelEnabled('tiendanube')
              },
              {
                id: 'channel_arca',
                icon: '🧾',
                title: 'Facturación ARCA (ex AFIP)',
                description: 'Emisión de comprobantes electrónicos oficiales (Facturas A, B, C) con obtención directa de CAE.',
                active: isChannelEnabled('arca')
              },
              {
                id: 'channel_whatsapp',
                icon: '🤖',
                title: 'Asistente WhatsApp (IA)',
                description: 'Bot de inteligencia artificial para responder preguntas, consultar stock y cotizar productos las 24hs.',
                active: isChannelEnabled('whatsapp')
              }
            ].map(channel => (
              <div
                key={channel.id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 14,
                  border: channel.active ? '1px solid var(--accent-blue)' : '1px solid var(--border-color)',
                  backgroundColor: channel.active ? 'rgba(37, 99, 235, 0.03)' : 'var(--bg-card)',
                  transition: 'all 0.2s ease'
                }}
              >
                <div>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                      <span style={{fontSize: '1.5rem'}}>{channel.icon}</span>
                      <strong style={{fontSize: '1rem', color: 'var(--text-primary)'}}>{channel.title}</strong>
                    </div>

                    <span style={{
                      padding: '4px 10px',
                      borderRadius: 12,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      backgroundColor: channel.active ? 'rgba(16, 185, 129, 0.15)' : 'rgba(156, 163, 175, 0.15)',
                      color: channel.active ? 'var(--accent-emerald)' : 'var(--text-secondary)',
                      border: channel.active ? '1px solid var(--accent-emerald)' : '1px solid var(--border-color)'
                    }}>
                      {channel.active ? '🟢 HABILITADO' : '⚪ DESACTIVADO'}
                    </span>
                  </div>

                  <p style={{fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4}}>
                    {channel.description}
                  </p>
                </div>

                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: 12}}>
                  <span style={{fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)'}}>
                    Estado del Canal:
                  </span>

                  <button
                    type="button"
                    className="btn"
                    onClick={() => updateChannels({ [channel.id]: !channel.active })}
                    style={{
                      backgroundColor: channel.active ? 'rgba(239, 68, 68, 0.1)' : 'var(--accent-blue)',
                      color: channel.active ? 'var(--accent-red)' : '#fff',
                      border: channel.active ? '1px solid var(--accent-red)' : 'none',
                      padding: '6px 14px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      borderRadius: 6,
                      cursor: 'pointer'
                    }}
                  >
                    {channel.active ? 'Desactivar Canal' : 'Activar Canal'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lead Magnet Tab */}
      {activeTab === 'lead_magnet' && (
        <LeadMagnetSettings />
      )}

      {/* Tab 1: Connection settings */}
      {activeTab === 'connection' && (
        <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
          <div style={{display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap'}}>
            <div className="card" style={{flex: 1, minWidth: 300}}>
              <h3>API de Mercado Libre / Mercado Pago (ML / MP)</h3>
              <div style={{display: 'flex', flexDirection: 'column', gap: 15}}>
                <label>App ID (Client ID)
                  <input type="text" value={config.client_id} onChange={e => setConfig({...config, client_id: e.target.value})} style={{width: '100%', marginTop: 5}}/>
                </label>
                <label>Client Secret
                  <input type="password" value={config.client_secret} onChange={e => setConfig({...config, client_secret: e.target.value})} style={{width: '100%', marginTop: 5}}/>
                </label>
                <label>Redirect URI
                  <div style={{display: 'flex', gap: 8, marginTop: 5}}>
                    <input type="text" value={config.redirect_uri} onChange={e => setConfig({...config, redirect_uri: e.target.value})} style={{flex: 1}}/>
                    <button 
                      type="button" 
                      className="btn" 
                      style={{fontSize: '0.75rem', padding: '6px 10px', whiteSpace: 'nowrap'}} 
                      onClick={() => setConfig({...config, redirect_uri: window.location.origin + '/settings'})}
                      title="Usar la URL actual de tu navegador"
                    >
                      Usar URL actual
                    </button>
                  </div>
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
              <h3>Estado de Conexión ML / MP</h3>
              {status.is_authenticated ? (
                <div style={{color: 'var(--accent-emerald)', fontWeight: 'bold', padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--accent-emerald)'}}>
                  ✓ Conectado a Mercado Libre / Mercado Pago (Usuario ID: {status.user_id})
                </div>
              ) : (
                <div style={{color: 'var(--accent-red)', fontWeight: 'bold', padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)'}}>
                  ✗ No autenticado
                </div>
              )}

              <div style={{marginTop: 20}}>
                <div style={{fontSize: '0.85rem', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-hover)', padding: '10px 12px', borderRadius: '6px', marginBottom: 15}}>
                  💡 <strong>Vinculación en 1-Clic:</strong> Haz clic en <strong>Autorizar Mercado Libre / Pago</strong>. Otorga permiso único para ambas plataformas de forma transparente sin copiar códigos.
                </div>

                <p style={{fontSize: '0.9rem', fontWeight: 600}}>1. Autorizar aplicación:</p>
                <button className="btn" style={{backgroundColor: '#ffe600', color: '#333', fontWeight: 'bold', width: '100%', padding: '10px 15px'}} onClick={handleAuth}>
                  Autorizar Mercado Libre / Mercado Pago
                </button>
                
                <details style={{marginTop: 20, fontSize: '0.85rem', color: 'var(--text-secondary)'}}>
                  <summary style={{cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)'}}>
                    Opción manual: Pegar código TG-xxx
                  </summary>
                  <div style={{marginTop: 10}}>
                    <p style={{fontSize: '0.85rem', marginBottom: 5}}>Pega el código de la URL (TG-xxx):</p>
                    <div style={{display: 'flex', gap: 10}}>
                      <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="TG-..." style={{flex: 1}}/>
                      <button className="btn" onClick={handleCode}>Vincular</button>
                    </div>
                  </div>
                </details>

                <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Real-time sync progress card */}
                  {syncProgress && (syncProgress.status === 'syncing_products' || syncProgress.status === 'syncing_sales' || syncProgress.status === 'syncing_mp' || syncProgress.status === 'completed' || syncProgress.status === 'failed') && (
                    <div style={{
                      padding: '14px 16px',
                      borderRadius: '10px',
                      backgroundColor: syncProgress.status === 'completed' 
                        ? 'rgba(16, 185, 129, 0.08)' 
                        : syncProgress.status === 'failed' 
                          ? 'rgba(239, 68, 68, 0.08)' 
                          : 'rgba(59, 130, 246, 0.08)',
                      border: `1px solid ${
                        syncProgress.status === 'completed' 
                          ? 'var(--accent-emerald, #10b981)' 
                          : syncProgress.status === 'failed' 
                            ? 'var(--accent-red, #ef4444)' 
                            : 'var(--accent-blue, #3b82f6)'
                      }`,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {syncProgress.status === 'completed' ? (
                            <span style={{ fontSize: '1.2rem' }}>✅</span>
                          ) : syncProgress.status === 'failed' ? (
                            <span style={{ fontSize: '1.2rem' }}>❌</span>
                          ) : (
                            <RefreshCw size={18} className="animate-spin" style={{ color: 'var(--accent-blue, #3b82f6)' }} />
                          )}
                          <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                            {syncProgress.status === 'completed' 
                              ? '¡Sincronización Completada!' 
                              : syncProgress.status === 'failed' 
                                ? 'Error en la Sincronización' 
                                : syncProgress.status === 'syncing_products'
                                  ? 'Paso 1/3: Sincronizando Catálogo y Publicaciones'
                                  : syncProgress.status === 'syncing_sales'
                                    ? 'Paso 2/3: Descargando Ventas y Facturación'
                                    : 'Paso 3/3: Sincronizando Mercado Pago'}
                          </strong>
                        </div>
                        
                        <span style={{
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: 'var(--bg-card, #fff)',
                          border: '1px solid var(--border-color)',
                          color: syncProgress.status === 'completed' 
                            ? 'var(--accent-emerald)' 
                            : syncProgress.status === 'failed' 
                              ? 'var(--accent-red)' 
                              : 'var(--accent-blue)'
                        }}>
                          {syncProgress.progress || 0}%
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div style={{
                        width: '100%',
                        height: '8px',
                        backgroundColor: 'rgba(0,0,0,0.08)',
                        borderRadius: '4px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${Math.min(100, Math.max(5, syncProgress.progress || 0))}%`,
                          height: '100%',
                          backgroundColor: syncProgress.status === 'completed' 
                            ? 'var(--accent-emerald, #10b981)' 
                            : syncProgress.status === 'failed' 
                              ? 'var(--accent-red, #ef4444)' 
                              : 'var(--accent-blue, #3b82f6)',
                          borderRadius: '4px',
                          transition: 'width 0.4s ease'
                        }} />
                      </div>

                      {/* Message / Details */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <span style={{ fontStyle: 'italic', wordBreak: 'break-word', flex: 1 }}>
                          {syncProgress.message || 'Procesando sincronización en segundo plano...'}
                        </span>
                        {(syncProgress.status === 'completed' || syncProgress.status === 'failed') && (
                          <button
                            type="button"
                            onClick={() => setSyncProgress(null)}
                            style={{
                              marginLeft: '10px',
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              textDecoration: 'underline'
                            }}
                          >
                            Cerrar
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '8px', color: 'var(--text-primary)' }}>
                      Sincronización Rápida del Día:
                    </span>
                    <button 
                      className="btn" 
                      onClick={handleSyncToday}
                      disabled={syncingToday || syncingHistorical || (syncProgress && (syncProgress.status === 'syncing_products' || syncProgress.status === 'syncing_sales' || syncProgress.status === 'syncing_mp'))}
                      style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 14px', fontSize: '0.85rem', backgroundColor: 'var(--accent-emerald)', color: '#fff' }}
                    >
                      <RefreshCw size={16} className={(syncingToday || (syncProgress && (syncProgress.status === 'syncing_products' || syncProgress.status === 'syncing_sales' || syncProgress.status === 'syncing_mp'))) ? 'animate-spin' : ''} />
                      <span>
                        {(syncingToday || (syncProgress && (syncProgress.status === 'syncing_products' || syncProgress.status === 'syncing_sales' || syncProgress.status === 'syncing_mp')))
                          ? `Sincronizando (${syncProgress?.progress || 0}%)...` 
                          : '⚡ Sincronizar Hoy (Últimas 24 hs)'}
                      </span>
                    </button>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginTop: '6px', textAlign: 'center' }}>
                      Actualización rápida de publicaciones, ventas y pagos del día de hoy.
                    </span>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '8px', color: 'var(--text-primary)' }}>
                      Sincronización Histórica Completa:
                    </span>
                    <button 
                      className="btn btn-secondary" 
                      onClick={handleSyncHistorical}
                      disabled={syncingHistorical || syncingToday || (syncProgress && (syncProgress.status === 'syncing_products' || syncProgress.status === 'syncing_sales' || syncProgress.status === 'syncing_mp'))}
                      style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 14px', fontSize: '0.85rem' }}
                    >
                      <RefreshCw size={16} className={syncingHistorical ? 'animate-spin' : ''} />
                      <span>
                        {syncingHistorical ? `Sincronizando (${syncProgress?.progress || 0}%)...` : '🔄 Sincronizar Histórico (2 Años)'}
                      </span>
                    </button>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginTop: '6px', textAlign: 'center' }}>
                      Descarga y actualiza todas las ventas, productos y cobros de los últimos 2 años.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{flex: 1, minWidth: 300}}>
              <h3 style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                <span style={{fontSize: '1.2rem'}}>🛍️</span>
                Estado de Conexión Tiendanube
              </h3>
              
              {tnStatus.is_connected ? (
                <div style={{color: 'var(--accent-emerald)', fontWeight: 'bold', padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--accent-emerald)'}}>
                  ✓ Tienda #{tnStatus.store_id || 'Conectada'}
                </div>
              ) : (
                <div style={{color: 'var(--accent-red)', fontWeight: 'bold', padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)'}}>
                  ✗ No vinculada
                </div>
              )}

              <div style={{marginTop: 20}}>
                <div style={{fontSize: '0.85rem', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-hover)', padding: '10px 12px', borderRadius: '6px', marginBottom: 15}}>
                  💡 <strong>Vinculación en 1-Clic:</strong> Haz clic en <strong>Conectar con Tiendanube</strong> para autorizar la integración oficial.
                </div>
                
                <p style={{fontSize: '0.9rem', fontWeight: 600}}>1. Autorizar aplicación:</p>
                <button 
                  className="btn" 
                  onClick={handleTnAuth}
                  style={{backgroundColor: '#0052cc', color: '#fff', fontWeight: 'bold', width: '100%', padding: '10px 15px'}}
                >
                  Conectar con Tiendanube
                </button>

                {tnStatus.is_connected && (
                  <button 
                    className="btn" 
                    onClick={handleTnDisconnect}
                    style={{backgroundColor: 'transparent', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', fontWeight: 'bold', width: '100%', padding: '10px 15px', marginTop: '10px'}}
                  >
                    Desvincular Tiendanube
                  </button>
                )}
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
                    checked={config.meli_send_pickup_msg !== false} 
                    onChange={e => setConfig({...config, meli_send_pickup_msg: e.target.checked})} 
                    style={{width: 'auto'}}
                  />
                  Enviar mensaje automático cuando el pedido esté en punto de retiro
                </label>
                <textarea 
                  value={config.meli_msg_pickup || ""} 
                  onChange={e => setConfig({...config, meli_msg_pickup: e.target.value})} 
                  disabled={config.meli_send_pickup_msg === false}
                  placeholder="ej. ¡Hola! Te informamos que tu paquete ya está disponible y a la espera de ser retirado en el punto de retiro / sucursal seleccionada. Recuerda llevar tu DNI y el código de seguimiento. ¡Muchas gracias por tu compra!"
                  style={{width: '100%', marginTop: 8, minHeight: 70, padding: 8, backgroundColor: config.meli_send_pickup_msg === false ? 'var(--bg-dark)' : 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4, opacity: config.meli_send_pickup_msg === false ? 0.6 : 1}}
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

      {/* Tab: Tiendanube Integration */}
      {activeTab === 'tiendanube' && (
        <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
          {/* Header Banner */}
          <div className="card" style={{
            background: 'linear-gradient(135deg, rgba(0, 128, 255, 0.12) 0%, rgba(37, 99, 235, 0.05) 100%)',
            border: '1px solid rgba(0, 128, 255, 0.3)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 15
          }}>
            <div>
              <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6}}>
                <span style={{fontSize: '1.8rem'}}>🛍️</span>
                <h3 style={{margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)'}}>
                  Integración Oficial con Tiendanube (Nuvemshop)
                </h3>
              </div>
              <p style={{margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)'}}>
                Sincronización en tiempo real de stock, precios, pedidos, clientes y facturación automática con AFIP.
              </p>
            </div>

            <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
              {tnStatus.is_connected ? (
                <span style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: 'var(--accent-emerald)',
                  fontWeight: '700',
                  fontSize: '0.85rem',
                  border: '1px solid var(--accent-emerald)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <span style={{width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--accent-emerald)'}}></span>
                  Tienda #{tnStatus.store_id || 'Conectada'}
                </span>
              ) : (
                <span style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  color: 'var(--accent-red)',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                  border: '1px solid var(--accent-red)'
                }}>
                  No Vinculada
                </span>
              )}
            </div>
          </div>

          <div style={{display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap'}}>
            {/* Card 1: Estado y Conexión 1-Clic */}
            <div className="card" style={{flex: 1, minWidth: 320}}>
              <h3>Conexión y Autenticación</h3>
              <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 15}}>
                Conecta tu tienda con 1 solo clic. Las credenciales se almacenan cifradas y los webhooks se configuran solos.
              </p>

              {tnStatus.is_connected ? (
                <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
                  <div style={{
                    padding: 14,
                    borderRadius: 8,
                    backgroundColor: 'var(--bg-hover)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}>
                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem'}}>
                      <span style={{color: 'var(--text-secondary)'}}>Identificador de Tienda:</span>
                      <strong style={{color: 'var(--text-primary)'}}>#{tnStatus.store_id || '999888'}</strong>
                    </div>
                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem'}}>
                      <span style={{color: 'var(--text-secondary)'}}>Total Productos Locales:</span>
                      <strong style={{color: 'var(--text-primary)'}}>{tnStatus.total_local_products}</strong>
                    </div>
                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem'}}>
                      <span style={{color: 'var(--text-secondary)'}}>Productos en Tiendanube:</span>
                      <strong style={{color: 'var(--accent-blue)'}}>{tnStatus.synced_products_count}</strong>
                    </div>
                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem'}}>
                      <span style={{color: 'var(--text-secondary)'}}>Recepción en Tiempo Real:</span>
                      <strong style={{color: 'var(--accent-emerald)'}}>⚡ Webhooks Activos</strong>
                    </div>
                  </div>

                  <div style={{display: 'flex', flexDirection: 'column', gap: 10, marginTop: 5}}>
                    <button
                      className="btn"
                      onClick={handleTnSyncOrders}
                      disabled={tnSyncing}
                      style={{backgroundColor: 'var(--accent-blue)', color: '#fff', padding: '10px 14px', fontSize: '0.85rem'}}
                    >
                      {tnSyncing ? 'Sincronizando órdenes...' : '🔄 Sincronizar Pedidos Recientes'}
                    </button>

                    <button
                      className="btn btn-secondary"
                      onClick={handleTnExportBranding}
                      disabled={tnExportingBranding}
                      style={{padding: '10px 14px', fontSize: '0.85rem'}}
                    >
                      {tnExportingBranding ? 'Sincronizando marca...' : '🎨 Sincronizar Logo y Datos a Tiendanube'}
                    </button>

                    <button
                      className="btn"
                      onClick={handleTnDisconnect}
                      style={{backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', padding: '8px 12px', fontSize: '0.8rem', marginTop: 10}}
                    >
                      Desvincular Tiendanube
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
                  <div style={{fontSize: '0.85rem', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-hover)', padding: '10px 12px', borderRadius: '8px', lineHeight: 1.4}}>
                    🔑 Ingresa tu <strong>App ID</strong> y <strong>Client Secret</strong> de Tiendanube Partners para habilitar la vinculación automática.
                  </div>

                  <div>
                    <label style={{fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-primary)'}}>
                      App ID (Client ID):
                    </label>
                    <input 
                      type="text" 
                      value={tnConfig.client_id || ''}
                      onChange={e => setTnConfig({ ...tnConfig, client_id: e.target.value })}
                      placeholder="ej. 41040"
                      style={{width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.88rem'}}
                    />
                  </div>

                  <div>
                    <label style={{fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-primary)'}}>
                      Client Secret:
                    </label>
                    <div style={{display: 'flex', gap: 6}}>
                      <input 
                        type={showTnSecret ? "text" : "password"} 
                        value={tnConfig.client_secret || ''}
                        onChange={e => setTnConfig({ ...tnConfig, client_secret: e.target.value })}
                        placeholder="Pega el Client Secret copiado de Tiendanube"
                        style={{flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.88rem'}}
                      />
                      <button 
                        type="button" 
                        className="btn btn-secondary"
                        onClick={() => setShowTnSecret(!showTnSecret)}
                        style={{padding: '6px 12px', fontSize: '0.8rem'}}
                      >
                        {showTnSecret ? 'Ocultar' : 'Ver'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-primary)'}}>
                      URL de Redirección (para Tiendanube Partners ➔ Configuración):
                    </label>
                    <div style={{display: 'flex', gap: 6}}>
                      <input 
                        type="text" 
                        readOnly 
                        value="https://admin.hidroponiarosario.com/api/tiendanube/callback"
                        style={{flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: '0.78rem', fontFamily: 'monospace'}}
                      />
                      <button 
                        type="button" 
                        className="btn btn-secondary"
                        onClick={() => {
                          navigator.clipboard.writeText("https://admin.hidroponiarosario.com/api/tiendanube/callback")
                          alert("URL de redirección copiada al portapapeles.")
                        }}
                        style={{padding: '6px 12px', fontSize: '0.8rem'}}
                      >
                        📋 Copiar
                      </button>
                    </div>
                    <span style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4, display: 'block'}}>
                      Pega esta URL en Tiendanube Partners ➔ Pestaña <strong>Configuración</strong> ➔ <strong>URLs de redireccionamiento</strong>.
                    </span>
                  </div>

                  <button 
                    type="button" 
                    className="btn"
                    onClick={handleSaveTnConfig}
                    disabled={tnSavingConfig}
                    style={{backgroundColor: 'var(--accent-blue)', color: '#fff', padding: '9px 14px', fontSize: '0.85rem', fontWeight: 600}}
                  >
                    {tnSavingConfig ? 'Guardando...' : '💾 Guardar Credenciales de Tiendanube'}
                  </button>

                  {tnConfigMsg && (
                    <div style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      fontSize: '0.8rem',
                      backgroundColor: tnConfigMsg.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      border: `1px solid ${tnConfigMsg.type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-red)'}`,
                      color: tnConfigMsg.type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-red)'
                    }}>
                      {tnConfigMsg.text}
                    </div>
                  )}

                  <hr style={{border: 'none', borderTop: '1px solid var(--border-color)', margin: '4px 0'}} />

                  <button
                    className="btn"
                    onClick={handleTnConnect}
                    disabled={!tnConfig.client_id}
                    style={{
                      backgroundColor: tnConfig.client_id ? '#0080FF' : 'var(--bg-hover)',
                      color: tnConfig.client_id ? '#fff' : 'var(--text-secondary)',
                      fontWeight: '700',
                      padding: '12px 18px',
                      fontSize: '0.95rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      borderRadius: 8,
                      boxShadow: tnConfig.client_id ? '0 4px 12px rgba(0, 128, 255, 0.3)' : 'none',
                      cursor: tnConfig.client_id ? 'pointer' : 'not-allowed'
                    }}
                  >
                    <span>🛍️</span>
                    <span>Conectar con Tiendanube (1 Clic)</span>
                  </button>

                  <p style={{fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', margin: 0}}>
                    Serás redirigido a la pantalla oficial de Tiendanube para otorgar el acceso seguro.
                  </p>
                </div>
              )}
            </div>

            {/* Card 2: Exportación Masiva de Catálogo */}
            <div className="card" style={{flex: 1.3, minWidth: 340}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8}}>
                <span style={{fontSize: '1.3rem'}}>🚀</span>
                <h3 style={{margin: 0}}>Poblador / Exportador de Catálogo</h3>
              </div>
              <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16}}>
                ¿Creaste una tienda nueva y está vacía? Exporta todos tus productos de ControlCenterES con fotos en HD, descripciones, categorías, precios y stock real de forma 100% automatizada.
              </p>

              <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
                  <label style={{fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: 4}}>
                    Origen de Precio:
                    <select
                      value={tnExportOptions.price_source}
                      onChange={e => setTnExportOptions({...tnExportOptions, price_source: e.target.value})}
                      style={{padding: '8px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                    >
                      <option value="auto">Automático (Precio Web o Lista)</option>
                      <option value="list">Precio de Lista / Mostrador</option>
                      <option value="web">Precio Web Exclusivo</option>
                    </select>
                  </label>

                  <label style={{fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: 4}}>
                    Ajuste Porcentual (%):
                    <input
                      type="number"
                      step="0.5"
                      value={tnExportOptions.price_modifier_pct}
                      onChange={e => setTnExportOptions({...tnExportOptions, price_modifier_pct: parseFloat(e.target.value) || 0.0})}
                      placeholder="ej. -5 para 5% OFF"
                      style={{padding: '8px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                    />
                  </label>
                </div>

                <div style={{display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={tnExportOptions.only_with_stock}
                      onChange={e => setTnExportOptions({...tnExportOptions, only_with_stock: e.target.checked})}
                      style={{width: 'auto'}}
                    />
                    Exportar únicamente artículos con stock mayor a 0
                  </label>

                  <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={tnExportOptions.sync_branding}
                      onChange={e => setTnExportOptions({...tnExportOptions, sync_branding: e.target.checked})}
                      style={{width: 'auto'}}
                    />
                    Sincronizar también logotipo y datos de contacto oficiales
                  </label>
                </div>

                {/* Progress Box */}
                {tnExportProgress && (
                  <div style={{
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: 'var(--bg-hover)',
                    border: '1px solid var(--border-color)',
                    marginTop: 6
                  }}>
                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 6}}>
                      <span>{tnExportProgress.message || 'Procesando exportación...'}</span>
                      <strong>{tnExportProgress.progress || 0}%</strong>
                    </div>
                    <div style={{width: '100%', height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden'}}>
                      <div style={{
                        width: `${tnExportProgress.progress || 0}%`,
                        height: '100%',
                        backgroundColor: tnExportProgress.status === 'failed' ? 'var(--accent-red)' : '#0080FF',
                        transition: 'width 0.3s ease'
                      }}></div>
                    </div>
                  </div>
                )}

                <button
                  className="btn"
                  onClick={handleTnStartExport}
                  disabled={tnExporting || !tnStatus.is_connected}
                  style={{
                    backgroundColor: 'var(--accent-emerald)',
                    color: '#fff',
                    fontWeight: '700',
                    padding: '12px 16px',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    marginTop: 6,
                    opacity: (!tnStatus.is_connected || tnExporting) ? 0.6 : 1
                  }}
                >
                  <RefreshCw size={16} className={tnExporting ? 'animate-spin' : ''} />
                  <span>{tnExporting ? 'Exportando catálogo a Tiendanube...' : '🚀 Iniciar Exportación Masiva de Catálogo'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Card 3: Importación Inversa desde Tiendanube a ControlCenterES */}
          <div className="card" style={{
            border: '1px solid rgba(16, 185, 129, 0.3)',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(37, 99, 235, 0.03) 100%)'
          }}>
            <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8}}>
              <span style={{fontSize: '1.4rem'}}>📥</span>
              <h3 style={{margin: 0}}>Traer productos y ventas desde Tiendanube a este sistema</h3>
            </div>
            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5}}>
              ¿Ya tienes una tienda funcionando en Tiendanube con productos cargados y quieres empezar a usar ControlCenterES? Importa tu catálogo con fotos en HD, descripciones, categorías, precios, stock, logotipo oficial e historial de ventas con 1 solo clic.
            </p>

            {/* Progress Box for Import */}
            {tnImportProgress && (
              <div style={{
                padding: 14,
                borderRadius: 8,
                backgroundColor: 'var(--bg-hover)',
                border: '1px solid var(--border-color)',
                marginBottom: 16
              }}>
                <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 6}}>
                  <span>{tnImportProgress.message || 'Importando desde Tiendanube...'}</span>
                  <strong>{tnImportProgress.progress || 0}%</strong>
                </div>
                <div style={{width: '100%', height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden'}}>
                  <div style={{
                    width: `${tnImportProgress.progress || 0}%`,
                    height: '100%',
                    backgroundColor: tnImportProgress.status === 'failed' ? 'var(--accent-red)' : 'var(--accent-emerald)',
                    transition: 'width 0.3s ease'
                  }}></div>
                </div>
              </div>
            )}

            <div style={{display: 'flex', gap: 12, flexWrap: 'wrap'}}>
              <button
                className="btn"
                onClick={handleTnStartImport}
                disabled={tnImporting || !tnStatus.is_connected}
                style={{
                  backgroundColor: 'var(--accent-blue)',
                  color: '#fff',
                  fontWeight: '600',
                  padding: '10px 18px',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  opacity: (!tnStatus.is_connected || tnImporting) ? 0.6 : 1
                }}
              >
                <RefreshCw size={15} className={tnImporting ? 'animate-spin' : ''} />
                <span>{tnImporting ? 'Importando...' : '📥 Importar Catálogo & Categorías'}</span>
              </button>

              <button
                className="btn"
                onClick={handleTnImportAll}
                disabled={tnImporting || !tnStatus.is_connected}
                style={{
                  backgroundColor: 'var(--accent-emerald)',
                  color: '#fff',
                  fontWeight: '700',
                  padding: '10px 20px',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  opacity: (!tnStatus.is_connected || tnImporting) ? 0.6 : 1
                }}
              >
                <RefreshCw size={15} className={tnImporting ? 'animate-spin' : ''} />
                <span>{tnImporting ? 'Importando todo...' : '✨ Importar TODO (Logo, Catálogo y Ventas)'}</span>
              </button>
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
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={newPerms.inpi} onChange={e => setNewPerms(prev => ({...prev, inpi: e.target.checked}))} />
                      Propiedad Industrial
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={newPerms.marketing} onChange={e => setNewPerms(prev => ({...prev, marketing: e.target.checked}))} />
                      Marketing & Redes
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={newPerms.blog} onChange={e => setNewPerms(prev => ({...prev, blog: e.target.checked}))} />
                      Blog & Web
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
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={editPerms.inpi} onChange={e => setEditPerms(prev => ({...prev, inpi: e.target.checked}))} />
                      Propiedad Industrial
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={editPerms.marketing} onChange={e => setEditPerms(prev => ({...prev, marketing: e.target.checked}))} />
                      Marketing & Redes
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer'}}>
                      <input type="checkbox" checked={editPerms.blog} onChange={e => setEditPerms(prev => ({...prev, blog: e.target.checked}))} />
                      Blog & Web
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

          <div style={{marginTop: 35, paddingTop: 25, borderTop: '1px solid var(--border-color)'}}>
            <h3 style={{marginBottom: 5}}>⭐ Productos Destacados en Portada (Vista "Todos")</h3>
            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20}}>
              Seleccioná y ordená los productos del inventario que querés que aparezcan <strong>primeros</strong> en la página web pública cuando el usuario no tenga ninguna categoría filtrada.
            </p>

            <div style={{display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap'}}>
              <select 
                value={selectedProductToAdd} 
                onChange={e => setSelectedProductToAdd(e.target.value)}
                style={{flex: 1, minWidth: 250, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
              >
                <option value="">-- Seleccionar producto para agregar a destacados --</option>
                {inventoryProducts
                  .filter(p => p.is_web_active && !featuredIds.includes(p.ml_id))
                  .map(p => (
                    <option key={p.ml_id} value={p.ml_id}>
                      {p.title} (Stock: {p.available_quantity} - ${p.price_web > 0 ? p.price_web : p.price})
                    </option>
                  ))}
              </select>
              <button 
                type="button" 
                className="btn" 
                onClick={addFeatured}
                disabled={!selectedProductToAdd}
                style={{backgroundColor: 'var(--accent-emerald)', color: '#fff'}}
              >
                + Agregar a Destacados
              </button>
            </div>

            {featuredIds.length === 0 ? (
              <div style={{padding: 20, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-color)', borderRadius: 8}}>
                No hay productos destacados configurados. Se mostrarán por orden alfabetico por defecto.
              </div>
            ) : (
              <div style={{display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20}}>
                {featuredIds.map((id, idx) => {
                  const prod = inventoryProducts.find(p => p.ml_id === id) || { title: id, thumbnail: '', price: 0 }
                  return (
                    <div 
                      key={id} 
                      style={{
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        padding: '10px 15px', 
                        backgroundColor: 'var(--bg-dark)', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: 8,
                        gap: 15
                      }}
                    >
                      <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                        <span style={{
                          fontWeight: 'bold', 
                          fontSize: '0.9rem', 
                          color: '#d97706', 
                          width: 28, 
                          height: 28, 
                          borderRadius: '50%', 
                          backgroundColor: 'rgba(245, 158, 11, 0.15)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center'
                        }}>
                          #{idx + 1}
                        </span>
                        {prod.thumbnail && (
                          <img src={prod.thumbnail} alt="" style={{width: 40, height: 40, objectFit: 'contain', borderRadius: 4, backgroundColor: '#fff'}} />
                        )}
                        <div>
                          <div style={{fontWeight: 600, fontSize: '0.9rem'}}>{prod.title}</div>
                          <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>
                            ID: {id} | Categoría: {prod.category_name || 'Sin Categoría'} | Stock: {prod.available_quantity}
                          </div>
                        </div>
                      </div>

                      <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                        <button 
                          type="button" 
                          className="btn" 
                          style={{padding: '4px 8px', fontSize: '0.75rem', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)'}} 
                          onClick={() => moveFeaturedUp(idx)}
                          disabled={idx === 0}
                        >
                          ⬆️ Subir
                        </button>
                        <button 
                          type="button" 
                          className="btn" 
                          style={{padding: '4px 8px', fontSize: '0.75rem', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)'}} 
                          onClick={() => moveFeaturedDown(idx)}
                          disabled={idx === featuredIds.length - 1}
                        >
                          ⬇️ Bajar
                        </button>
                        <button 
                          type="button" 
                          className="btn" 
                          style={{padding: '4px 8px', fontSize: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)'}} 
                          onClick={() => removeFeatured(id)}
                        >
                          ❌ Quitar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <button 
              type="button" 
              className="btn" 
              onClick={handleSaveFeaturedOrder}
              disabled={savingFeaturedOrder}
              style={{backgroundColor: 'var(--accent-blue)', color: '#fff', fontSize: '0.9rem', padding: '10px 20px'}}
            >
              {savingFeaturedOrder ? 'Guardando...' : '💾 Guardar Orden de Productos Destacados'}
            </button>
          </div>
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
        <div style={{display: 'flex', gap: 20, alignItems: 'flex-start', flexDirection: 'column'}}>
          
          {/* Google Drive Integration Card */}
          <div style={{
            backgroundColor: 'var(--bg-dark)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '20px',
            width: '100%'
          }}>
            <h3 style={{marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8}}>
              ☁️ Integración con Google Drive
            </h3>
            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20}}>
              Al configurar una Service Account de Google Cloud, el sistema subirá automáticamente una copia de todos los respaldos generados (tanto manuales como mensuales) a la carpeta especificada en Drive.
            </p>
            
            <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20}}>
              <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.9rem'}}>
                <input 
                  type="checkbox" 
                  checked={googleDriveConfig.active}
                  onChange={e => setGoogleDriveConfig(prev => ({...prev, active: e.target.checked}))}
                  style={{width: 16, height: 16}}
                />
                Activar subida automática a Google Drive
              </label>
            </div>

            <div style={{display: 'flex', flexDirection: 'column', gap: 15, opacity: googleDriveConfig.active ? 1 : 0.5}}>
              <div>
                <label style={{display: 'block', marginBottom: 5, fontSize: '0.85rem', fontWeight: 'bold'}}>
                  ID de la Carpeta Destino
                </label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="Ej: 1A2B3C4D5E6F7G8H9I0J"
                  value={googleDriveConfig.folder_id}
                  onChange={e => setGoogleDriveConfig(prev => ({...prev, folder_id: e.target.value}))}
                  disabled={!googleDriveConfig.active}
                />
              </div>
              
              <div>
                <label style={{display: 'block', marginBottom: 5, fontSize: '0.85rem', fontWeight: 'bold'}}>
                  JSON de Google Cloud Service Account
                </label>
                <textarea 
                  className="input" 
                  placeholder='{"type": "service_account", "project_id": "...", ...}'
                  rows={5}
                  style={{resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem'}}
                  value={googleDriveConfig.service_account_json}
                  onChange={e => setGoogleDriveConfig(prev => ({...prev, service_account_json: e.target.value}))}
                  disabled={!googleDriveConfig.active}
                />
                <span style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4, display: 'block'}}>
                  Pegá el contenido completo del archivo .json que descargaste desde Google Cloud. No olvides compartir la carpeta de Drive con el correo electrónico (client_email) de esta Service Account con permisos de "Editor".
                </span>
              </div>
              
              <button 
                className="btn btn-primary" 
                onClick={handleSaveGoogleDrive}
                disabled={savingGDrive || !googleDriveConfig.active}
                style={{alignSelf: 'flex-start', marginTop: 5}}
              >
                {savingGDrive ? 'Guardando...' : 'Guardar Configuración'}
              </button>
            </div>
          </div>

          {/* Info Card */}
          <div style={{
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid var(--accent-blue)',
            borderRadius: '8px',
            padding: '15px 20px',
            width: '100%',
            fontSize: '0.9rem',
            lineHeight: '1.5'
          }}>
            <div style={{fontWeight: 'bold', color: 'var(--accent-blue)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px'}}>
              🕒 Respaldos Automáticos Programados Activos
            </div>
            <div style={{marginBottom: 10}}>
              El sistema realiza un respaldo automático completo <strong>1 vez al mes</strong> y conserva <strong>1 año de historial (los últimos 12 respaldos automáticos)</strong>. Los respaldos manuales se conservan indefinidamente.
            </div>
            <div style={{fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 8}}>
              <strong>📦 Contenido de cada respaldo:</strong>
              <div style={{display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6}}>
                {[
                  { icon: '🗄️', label: 'Base de datos completa (clientes, ventas, inventario, gastos, settings, marketing)' },
                  { icon: '🖼️', label: 'Imágenes y archivos (uploads/)' },
                  { icon: '🧾', label: 'Facturas PDF (invoices/)' },
                  { icon: '🔐', label: 'Certificados AFIP/ARCA (.crt, .key)' },
                  { icon: '💬', label: 'Sesión de WhatsApp (auth_state/)' },
                  { icon: '📇', label: 'Contactos WhatsApp (contacts_cache)' },
                ].map((item, i) => (
                  <span key={i} style={{
                    padding: '3px 10px',
                    borderRadius: 6,
                    backgroundColor: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    fontSize: '0.76rem',
                    whiteSpace: 'nowrap'
                  }}>
                    {item.icon} {item.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Backup List Card */}
          <div className="card" style={{width: '100%'}}>
            <h3>Respaldos del Sistema (Backups)</h3>
            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 15}}>
              Archivo ZIP completo con base de datos, configuraciones, imágenes, facturas, certificados AFIP y sesión de WhatsApp.
            </p>
            
            <button 
              className="btn" 
              onClick={handleCreateBackup} 
              disabled={creatingBackup}
              style={{marginBottom: 20, backgroundColor: 'var(--accent-emerald)', color: '#fff'}}
            >
              {creatingBackup ? 'Creando respaldo (puede demorar)...' : '💾 Crear Nuevo Respaldo Manual'}
            </button>
            
            {backupsLoading ? <p>Cargando respaldos...</p> : (
              <table className="data-table" style={{width: '100%', borderCollapse: 'collapse'}}>
                <thead>
                  <tr>
                    <th style={{textAlign: 'left', padding: '12px 10px'}}>Archivo</th>
                    <th style={{textAlign: 'left', padding: '12px 10px'}}>Tipo</th>
                    <th style={{textAlign: 'left', padding: '12px 10px'}}>Contenido</th>
                    <th style={{textAlign: 'left', padding: '12px 10px'}}>Fecha</th>
                    <th style={{textAlign: 'left', padding: '12px 10px'}}>Tamaño</th>
                    <th style={{textAlign: 'left', padding: '12px 10px'}}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map(b => {
                    const isAuto = b.type === 'auto' || b.id.includes('auto_')
                    const c = b.main_file?.contents || {}
                    return (
                      <tr key={b.id} style={{borderBottom: '1px solid var(--border-color)'}}>
                        <td style={{padding: '12px 10px', fontSize: '0.82rem', fontWeight: 600}}>
                          {b.id}
                        </td>
                        <td style={{padding: '12px 10px', fontSize: '0.82rem'}}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '0.73rem',
                            fontWeight: '600',
                            backgroundColor: isAuto ? 'rgba(139, 92, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: isAuto ? 'var(--accent-purple)' : 'var(--accent-emerald)',
                            border: `1px solid ${isAuto ? 'rgba(139, 92, 246, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
                          }}>
                            {isAuto ? 'Automático' : 'Manual'}
                          </span>
                        </td>
                        <td style={{padding: '12px 10px', fontSize: '0.82rem'}}>
                          <div style={{display: 'flex', gap: 4, flexWrap: 'wrap'}}>
                            {c.database !== false && <span title="Base de datos" style={{cursor: 'default'}}>🗄️</span>}
                            {b.media_file && <span title="Uploads (imágenes, PDFs)" style={{cursor: 'default'}}>🖼️</span>}
                            {c.invoices && <span title="Facturas" style={{cursor: 'default'}}>🧾</span>}
                            {c.afip_certs && <span title="Certificados AFIP/ARCA" style={{cursor: 'default'}}>🔐</span>}
                            {c.whatsapp_session && <span title="Sesión WhatsApp" style={{cursor: 'default'}}>💬</span>}
                            {c.whatsapp_contacts && <span title="Contactos WhatsApp" style={{cursor: 'default'}}>📇</span>}
                            {!b.main_file?.contents && <span style={{fontSize: '0.7rem', color: 'var(--text-secondary)'}} title="Backup legacy sin manifiesto">v1</span>}
                          </div>
                        </td>
                        <td style={{padding: '12px 10px', fontSize: '0.82rem'}}>
                          {new Date(b.created_at).toLocaleString()}
                        </td>
                        <td style={{padding: '12px 10px', fontSize: '0.82rem', whiteSpace: 'nowrap'}}>
                          {b.main_file && <div>Sis: {(b.main_file.size_bytes / (1024 * 1024)).toFixed(2)} MB</div>}
                          {b.media_file && <div style={{color: 'var(--text-secondary)'}}>Med: {(b.media_file.size_bytes / (1024 * 1024)).toFixed(2)} MB</div>}
                        </td>
                        <td style={{padding: '12px 10px', fontSize: '0.82rem', display: 'flex', gap: '4px', flexWrap: 'wrap'}}>
                          {b.main_file && (
                            <button 
                              onClick={() => handleDownloadBackup(b.main_file.filename)}
                              className="btn"
                              style={{padding: '4px 8px', fontSize: '0.73rem', backgroundColor: 'var(--accent-blue)', color: '#fff', border: 'none', cursor: 'pointer', display: 'inline-block'}}
                              title="Descargar Sistema"
                            >
                              ⬇ Sist.
                            </button>
                          )}
                          {b.media_file && (
                            <button 
                              onClick={() => handleDownloadBackup(b.media_file.filename)}
                              className="btn"
                              style={{padding: '4px 8px', fontSize: '0.73rem', backgroundColor: 'var(--accent-purple)', color: '#fff', border: 'none', cursor: 'pointer', display: 'inline-block'}}
                              title="Descargar Medios"
                            >
                              ⬇ Med.
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {backups.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{padding: '20px', textAlign: 'center', color: 'var(--text-secondary)'}}>
                        No hay respaldos creados aún.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Restore Card */}
          <div className="card" style={{width: '100%'}}>
            <h3 style={{display: 'flex', alignItems: 'center', gap: 8}}>🔄 Restaurar Sistema desde Respaldo</h3>
            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 15}}>
              Sube un archivo ZIP de respaldo para restaurar completamente el sistema: base de datos, configuraciones, archivos, certificados AFIP y sesión de WhatsApp.
            </p>

            {/* Warning */}
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 18,
              fontSize: '0.84rem',
              lineHeight: 1.5,
            }}>
              <strong style={{color: 'var(--accent-red)'}}>⚠️ Advertencias importantes:</strong>
              <ul style={{margin: '6px 0 0 16px', padding: 0, color: 'var(--text-secondary)'}}>
                <li>Al subir el <strong>ZIP del sistema</strong>, esta acción <strong>reemplaza todos los datos actuales</strong> de la base de datos y configuraciones.</li>
                <li>Si subís el <strong>ZIP de medios</strong> (fotos/reels), solo se agregarán o actualizarán las imágenes, <strong>sin borrar ni reiniciar la base de datos</strong>.</li>
                <li>Se crea un respaldo de seguridad automático antes de restaurar el sistema.</li>
                <li>La sesión de WhatsApp <strong>no puede estar activa en dos servidores a la vez</strong>.</li>
              </ul>
            </div>

            {/* File Input */}
            <div style={{
              border: '2px dashed var(--border-color)',
              borderRadius: 10,
              padding: '25px 20px',
              textAlign: 'center',
              marginBottom: 18,
              backgroundColor: restoreFile ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-dark)',
              transition: 'all 0.2s ease',
            }}>
              <input
                type="file"
                accept=".zip"
                onChange={handleRestoreFileChange}
                id="restore-file-input"
                style={{display: 'none'}}
              />
              <label htmlFor="restore-file-input" style={{cursor: 'pointer', display: 'block'}}>
                {restoreFile ? (
                  <div>
                    <div style={{fontSize: '1.5rem', marginBottom: 6}}>📦</div>
                    <div style={{fontWeight: 600, fontSize: '0.95rem'}}>{restoreFile.name}</div>
                    <div style={{fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4}}>
                      {(restoreFile.size / (1024 * 1024)).toFixed(2)} MB — Click para cambiar archivo
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{fontSize: '2rem', marginBottom: 8}}>📁</div>
                    <div style={{fontWeight: 600, fontSize: '0.9rem'}}>Click aquí para seleccionar archivo ZIP de respaldo</div>
                    <div style={{fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4}}>o arrastra y soltá el archivo</div>
                  </div>
                )}
              </label>
            </div>

            {/* Restore Button */}
            {restoreFile && (
              <button
                className="btn"
                onClick={handleRestore}
                disabled={restoring}
                style={{
                  backgroundColor: restoring ? 'var(--text-secondary)' : 'var(--accent-red)',
                  color: '#fff',
                  padding: '10px 24px',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  border: 'none',
                  cursor: restoring ? 'not-allowed' : 'pointer',
                  marginBottom: 15,
                }}
              >
                {restoring ? '⏳ Restaurando sistema (esto puede demorar varios minutos)...' : '🔄 Restaurar Sistema desde este Respaldo'}
              </button>
            )}

            {/* Restore Result */}
            {restoreResult && (
              <div style={{
                padding: '15px 18px',
                borderRadius: 8,
                border: `1px solid ${restoreResult.success ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                backgroundColor: restoreResult.success ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                marginTop: 10,
              }}>
                <div style={{fontWeight: 700, fontSize: '0.95rem', marginBottom: 8, color: restoreResult.success ? 'var(--accent-emerald)' : 'var(--accent-red)'}}>
                  {restoreResult.success ? '✅ Restauración completada exitosamente' : '❌ Error en la restauración'}
                </div>
                {restoreResult.success && restoreResult.restore_log && (
                  <div style={{fontSize: '0.82rem', color: 'var(--text-secondary)'}}>
                    <div>🗄️ Base de datos: {restoreResult.restore_log.database_restored ? '✅ Restaurada' : '❌ No restaurada'}</div>
                    {restoreResult.restore_log.directories_restored?.length > 0 && (
                      <div>📁 Directorios restaurados: {restoreResult.restore_log.directories_restored.join(', ')}</div>
                    )}
                    {restoreResult.restore_log.files_restored?.length > 0 && (
                      <div>📄 Archivos restaurados: {restoreResult.restore_log.files_restored.join(', ')}</div>
                    )}
                    {restoreResult.restore_log.services_restarted && (
                      <div>🔄 Servicios reiniciados automáticamente</div>
                    )}
                    {restoreResult.restore_log.pre_restore_backup && (
                      <div>💾 Respaldo pre-restauración: {restoreResult.restore_log.pre_restore_backup}</div>
                    )}
                    {restoreResult.restore_log.errors?.length > 0 && (
                      <div style={{marginTop: 8, color: 'var(--accent-amber)'}}>
                        ⚠️ Advertencias: {restoreResult.restore_log.errors.join('; ')}
                      </div>
                    )}
                  </div>
                )}
                {!restoreResult.success && (
                  <div style={{fontSize: '0.85rem'}}>{restoreResult.error}</div>
                )}
              </div>
            )}
          </div>

          {/* Disk Space Card */}
          <div style={{width: '100%', display: 'flex', flexDirection: 'column', gap: 20}}>
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
                  <div style={{display: 'flex', gap: 10, alignItems: 'center', marginTop: 5}}>
                    <input 
                      type="password" 
                      value={waConfig.gemini_api_key || ""} 
                      onChange={e => {
                        setWaConfig({...waConfig, gemini_api_key: e.target.value})
                        setTestResult(null)
                      }} 
                      placeholder="AIzaSy..." 
                      style={{flex: 1}}
                      required={waConfig.enabled}
                    />
                    <button 
                      type="button" 
                      onClick={handleTestGeminiKey} 
                      className="btn btn-secondary" 
                      disabled={testingKey || !waConfig.gemini_api_key}
                      style={{whiteSpace: 'nowrap'}}
                    >
                      {testingKey ? 'Probando...' : 'Probar Clave'}
                    </button>
                  </div>
                  {testResult && (
                    <div style={{
                      marginTop: 8, 
                      padding: '8px 12px', 
                      borderRadius: 4, 
                      fontSize: '0.82rem',
                      backgroundColor: testResult.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: testResult.success ? 'var(--accent-emerald)' : 'var(--accent-red)',
                      border: `1px solid ${testResult.success ? 'var(--accent-emerald)' : 'var(--accent-red)'}`
                    }}>
                      {testResult.success ? '✓ ' : '✕ '} {testResult.message}
                    </div>
                  )}

                  {modelCapabilities && (
                    <div style={{
                      marginTop: 10,
                      padding: '12px 14px',
                      borderRadius: 8,
                      backgroundColor: 'var(--bg-dark)',
                      border: '1px solid var(--border-color)',
                      fontSize: '0.82rem'
                    }}>
                      <div style={{fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                        <span>🤖 Servicios e IA Habilitados con esta API Key:</span>
                        <span style={{fontSize: '0.75rem', opacity: 0.7}}>Clave: {modelCapabilities.api_key_prefix}</span>
                      </div>
                      
                      <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                        {/* Gemini Text & Code */}
                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.03)'}}>
                          <span style={{display: 'flex', alignItems: 'center', gap: 6}}>
                            <span style={{color: '#10B981'}}>🟢</span> 
                            <strong>Google Gemini 2.0 Flash / Textos IA:</strong>
                          </span>
                          <span style={{color: '#10B981', fontWeight: 600}}>Habilitado (Gratis)</span>
                        </div>

                        {/* Imagen 3 */}
                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.03)'}}>
                          <span style={{display: 'flex', alignItems: 'center', gap: 6}}>
                            <span>{modelCapabilities.imagen_models?.length > 0 ? '🟢' : '🟡'}</span> 
                            <strong>Google Imagen 3.0 (Fotos IA):</strong>
                          </span>
                          <span style={{color: modelCapabilities.imagen_models?.length > 0 ? '#10B981' : '#F59E0B', fontWeight: 600}}>
                            {modelCapabilities.imagen_models?.length > 0 ? `Activo (${modelCapabilities.imagen_models[0]})` : 'Requiere Habilitar en AI Studio'}
                          </span>
                        </div>

                        {/* Google Veo */}
                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.03)'}}>
                          <span style={{display: 'flex', alignItems: 'center', gap: 6}}>
                            <span>{modelCapabilities.veo_models?.length > 0 ? '🟢' : '🟡'}</span> 
                            <strong>Google Veo 3.1 / 2.0 (Video IA):</strong>
                          </span>
                          <span style={{color: modelCapabilities.veo_models?.length > 0 ? '#10B981' : '#F59E0B', fontWeight: 600}}>
                            {modelCapabilities.veo_models?.length > 0 ? `Activo (${modelCapabilities.veo_models.join(', ')})` : 'Requiere Habilitar en AI Studio / Billing'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <small style={{display: 'block', marginTop: 6, color: 'var(--text-secondary)', fontSize: '0.75rem'}}>
                    Obtén o configura tus servicios en <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" style={{color: 'var(--accent-blue)', textDecoration: 'underline'}}>Google AI Studio</a>.
                  </small>
                </label>

                <div>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 10}}>
                    <label style={{margin: 0, fontWeight: 600}}>
                      Instrucciones de Personalización (System Instructions)
                    </label>
                    <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                      <span style={{fontSize: '0.75rem', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-dark)', padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border-color)'}}>
                        📊 {promptCharCount.toLocaleString()} chars | {promptWordCount.toLocaleString()} palabras | ~{promptTokenEst.toLocaleString()} tokens
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowPromptModal(true)}
                        className="btn btn-secondary"
                        style={{padding: '4px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4}}
                      >
                        🔍 Ampliar Editor
                      </button>
                    </div>
                  </div>

                  <textarea 
                    value={waConfig.bot_instructions || ""} 
                    onChange={e => setWaConfig({...waConfig, bot_instructions: e.target.value})} 
                    placeholder="ej. Eres un asistente virtual experto..."
                    style={{
                      width: '100%', 
                      marginTop: 5, 
                      minHeight: 280, 
                      padding: 12, 
                      backgroundColor: 'var(--bg-dark)', 
                      color: 'var(--text-primary)', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: 6,
                      fontFamily: useMonospacePrompt ? 'Consolas, Monaco, "Courier New", monospace' : 'inherit',
                      fontSize: '0.85rem',
                      lineHeight: '1.5',
                      resize: 'vertical'
                    }}
                    required
                  />

                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, flexWrap: 'wrap', gap: 8}}>
                    <small style={{color: 'var(--text-secondary)', fontSize: '0.75rem', flex: 1}}>
                      💡 <strong>Prompts Extensos Soportados:</strong> Gemini soporta hasta <strong>1.000.000 de tokens</strong> (~750.000 palabras). Podés agregar políticas de envío, FAQs, reglas de atención y horarios sin límite.
                    </small>
                    <label style={{fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', margin: 0}}>
                      <input 
                        type="checkbox" 
                        checked={useMonospacePrompt} 
                        onChange={e => setUseMonospacePrompt(e.target.checked)}
                        style={{width: 'auto', margin: 0}}
                      />
                      Fuente Monoespaciada
                    </label>
                  </div>
                </div>

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
                <div style={{ width: '100%' }}>
                  <div style={{display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-red)', fontWeight: 600, fontSize: '0.8rem', marginBottom: 15}}>
                    ● DESCONECTADO
                  </div>
                  <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 15}}>
                    El bot de WhatsApp no tiene una sesión activa. Haz clic abajo para generar el código QR de escaneo.
                  </p>
                  <button 
                    type="button"
                    onClick={handleDisconnectWa}
                    disabled={disconnectingWa}
                    className="btn btn-primary"
                    style={{
                      width: '100%',
                      backgroundColor: '#25D366',
                      color: '#fff',
                      border: 'none',
                      fontSize: '0.88rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      padding: '10px 14px',
                      borderRadius: '8px'
                    }}
                  >
                    {disconnectingWa ? "Generando QR..." : "📱 Generar Código QR de Vinculación"}
                  </button>
                </div>
              )}

              {(waConfig.status === 'connected' || waConfig.phone) && (
                <div style={{width: '100%', marginTop: 10, paddingTop: 15, borderTop: '1px solid var(--border-color)'}}>
                  <button 
                    type="button"
                    onClick={handleDisconnectWa}
                    disabled={disconnectingWa}
                    className="btn"
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      color: 'var(--accent-red)',
                      border: '1px solid var(--accent-red)',
                      fontSize: '0.82rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      padding: '8px 12px'
                    }}
                  >
                    {disconnectingWa ? "Desvinculando..." : "🔴 Desvincular Línea y Generar Nuevo QR"}
                  </button>
                </div>
              )}
            </div>

            {/* Paused Chats / Human Takeover Card */}
            <div className="card" style={{width: '100%', marginTop: 10}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, flexWrap: 'wrap', gap: 10}}>
                <div>
                  <h3 style={{margin: 0}}>👤 Chats en Atención Humana (IA Pausada)</h3>
                  <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0'}}>
                    Clientes en los que la IA se ha pausado temporalmente (por respuesta directa de un vendedor o por solicitud del cliente).
                  </p>
                </div>
                <button onClick={fetchPausedChats} type="button" className="btn btn-secondary" style={{fontSize: '0.8rem', padding: '6px 12px'}}>
                  🔄 Actualizar Lista
                </button>
              </div>

              {pausedChats.length > 0 ? (
                <div style={{overflowX: 'auto'}}>
                  <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem'}}>
                    <thead>
                      <tr style={{borderBottom: '1px solid var(--border-color)', textAlign: 'left'}}>
                        <th style={{padding: '8px'}}>Número de Cliente</th>
                        <th style={{padding: '8px'}}>Motivo de Pausa</th>
                        <th style={{padding: '8px'}}>Pausado Hasta</th>
                        <th style={{padding: '8px', textAlign: 'right'}}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pausedChats.map((c, i) => (
                        <tr key={i} style={{borderBottom: '1px solid var(--border-color)'}}>
                          <td style={{padding: '8px', fontFamily: 'monospace', fontWeight: 600}}>+{c.sender}</td>
                          <td style={{padding: '8px'}}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: 10,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              backgroundColor: c.reason === 'intervencion_operador' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                              color: c.reason === 'intervencion_operador' ? 'var(--accent-blue)' : 'var(--accent-amber)'
                            }}>
                              {c.reason === 'intervencion_operador' ? '👤 Respuesta de Vendedor' : '🤖 Solicitud de Cliente'}
                            </span>
                          </td>
                          <td style={{padding: '8px'}}>{new Date(c.paused_until).toLocaleString()}</td>
                          <td style={{padding: '8px', textAlign: 'right'}}>
                            <button
                              type="button"
                              onClick={() => handleUnpauseChat(c.sender)}
                              disabled={unpausingSender === c.sender}
                              className="btn"
                              style={{
                                padding: '4px 10px',
                                fontSize: '0.75rem',
                                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                color: 'var(--accent-emerald)',
                                border: '1px solid var(--accent-emerald)',
                                borderRadius: 4,
                                cursor: 'pointer'
                              }}
                            >
                              {unpausingSender === c.sender ? "Reanudando..." : "🟢 Reanudar IA"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{padding: '15px 0', color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic'}}>
                  No hay chats pausados en este momento. La IA está respondiendo a todas las conversaciones activas.
                </div>
              )}
            </div>

            {/* Token Usage & API Key Quota Card */}
            <div className="card" style={{width: '100%', marginTop: 10}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, flexWrap: 'wrap', gap: 10}}>
                <div>
                  <h3 style={{margin: 0}}>⚡ Consumo de Tokens & Cuota de API Key</h3>
                  <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0'}}>
                    Monitoreo en tiempo real de tokens utilizados y limite diario de la cuota gratuita de Google AI Studio.
                  </p>
                </div>
                <button onClick={fetchTokenUsage} type="button" className="btn btn-secondary" style={{fontSize: '0.8rem', padding: '6px 12px'}}>
                  🔄 Actualizar Tokens
                </button>
              </div>

              {/* Daily Quota Progress Bar */}
              <div style={{marginBottom: 20}}>
                <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 6}}>
                  <span>Cuota Diaria Gratuita Usada (Consultas Hoy): <strong>{tokenUsage?.requests_today || 0} / {tokenUsage?.daily_limit_requests || 1500}</strong></span>
                  <span style={{fontWeight: 600, color: (tokenUsage?.quota_used_percent || 0) > 80 ? 'var(--accent-red)' : 'var(--accent-emerald)'}}>
                    {tokenUsage?.quota_used_percent || 0}%
                  </span>
                </div>
                <div style={{width: '100%', height: 10, backgroundColor: 'var(--bg-dark)', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--border-color)'}}>
                  <div style={{
                    width: `${tokenUsage?.quota_used_percent || 0}%`, 
                    height: '100%', 
                    backgroundColor: (tokenUsage?.quota_used_percent || 0) > 80 ? 'var(--accent-red)' : 'var(--accent-emerald)',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>

              {/* KPI Tokens Breakdown */}
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 15}}>
                <div style={{padding: '12px 15px', borderRadius: 8, backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-color)'}}>
                  <div style={{fontSize: '0.78rem', color: 'var(--text-secondary)'}}>Tokens Usados Hoy (Entrada + Salida)</div>
                  <div style={{fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--accent-blue)', marginTop: 4}}>
                    {(tokenUsage?.total_tokens_today || 0).toLocaleString()}
                  </div>
                  <small style={{fontSize: '0.72rem', color: 'var(--text-secondary)'}}>
                    Prompt: {(tokenUsage?.prompt_tokens_today || 0).toLocaleString()} | Resp.: {(tokenUsage?.reply_tokens_today || 0).toLocaleString()}
                  </small>
                </div>

                <div style={{padding: '12px 15px', borderRadius: 8, backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-color)'}}>
                  <div style={{fontSize: '0.78rem', color: 'var(--text-secondary)'}}>Tokens Acumulados Este Mes</div>
                  <div style={{fontSize: '1.4rem', fontWeight: 'bold', color: '#a855f7', marginTop: 4}}>
                    {(tokenUsage?.total_tokens_month || 0).toLocaleString()}
                  </div>
                  <small style={{fontSize: '0.72rem', color: 'var(--text-secondary)'}}>
                    {(tokenUsage?.requests_month || 0)} consultas (Est. en Plan Pago: ${tokenUsage?.cost_month_usd || 0} USD)
                  </small>
                </div>

                <div style={{padding: '12px 15px', borderRadius: 8, backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-color)'}}>
                  <div style={{fontSize: '0.78rem', color: 'var(--text-secondary)'}}>Promedio por Consulta</div>
                  <div style={{fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--accent-emerald)', marginTop: 4}}>
                    {tokenUsage?.requests_today > 0 ? Math.round(tokenUsage.total_tokens_today / tokenUsage.requests_today) : 0} tokens
                  </div>
                  <small style={{fontSize: '0.72rem', color: 'var(--text-secondary)'}}>
                    Costo est. hoy en Plan Pago: ${tokenUsage?.cost_today_usd || 0} USD
                  </small>
                </div>
              </div>
            </div>

            {/* Schedule Configuration Card */}
            <div className="card" style={{width: '100%', marginTop: 10}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, flexWrap: 'wrap', gap: 10}}>
                <div>
                  <h3 style={{margin: 0}}>🕐 Horario de Actividad del Asistente</h3>
                  <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0'}}>
                    Configura en qué días y horarios el asistente de IA responde automáticamente. Fuera de esos horarios, el bot puede quedarse en silencio o enviar un mensaje personalizado.
                  </p>
                </div>
              </div>

              {/* Enable Schedule Toggle */}
              <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem', cursor: 'pointer', marginBottom: 18, padding: '10px 14px', borderRadius: 8, backgroundColor: waSchedule.enabled ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-dark)', border: `1px solid ${waSchedule.enabled ? 'var(--accent-blue)' : 'var(--border-color)'}`, transition: 'all 0.2s ease'}}>
                <input 
                  type="checkbox" 
                  checked={waSchedule.enabled} 
                  onChange={e => setWaSchedule({...waSchedule, enabled: e.target.checked})} 
                  style={{width: 'auto'}}
                />
                <div>
                  <strong>Activar Restricción de Horario</strong>
                  <div style={{fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2}}>
                    {waSchedule.enabled 
                      ? '✅ El asistente solo responderá dentro de los horarios configurados abajo.' 
                      : '⚡ Desactivado: El asistente responde las 24 horas, todos los días.'}
                  </div>
                </div>
              </label>

              {waSchedule.enabled && (
                <>
                  {/* Weekly Overview Bar */}
                  <div style={{marginBottom: 20, padding: '12px 14px', borderRadius: 8, backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-color)'}}>
                    <div style={{fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600}}>📅 Resumen Semanal</div>
                    <div style={{display: 'flex', gap: 6}}>
                      {DAY_ORDER.map(day => {
                        const dc = waSchedule.days?.[day] || { mode: 'allday' }
                        const isAllDay = dc.mode === 'allday'
                        const isOff = dc.mode === 'off'
                        const isRange = dc.mode === 'range'
                        return (
                          <div key={day} style={{
                            flex: 1, 
                            textAlign: 'center', 
                            padding: '8px 4px', 
                            borderRadius: 6,
                            backgroundColor: isAllDay ? 'rgba(16, 185, 129, 0.15)' : isOff ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.12)',
                            border: `1px solid ${isAllDay ? 'rgba(16, 185, 129, 0.3)' : isOff ? 'rgba(239, 68, 68, 0.25)' : 'rgba(59, 130, 246, 0.3)'}`,
                            transition: 'all 0.2s ease'
                          }}>
                            <div style={{fontSize: '0.72rem', fontWeight: 700, color: isAllDay ? 'var(--accent-emerald)' : isOff ? 'var(--accent-red)' : 'var(--accent-blue)'}}>
                              {DAY_LABELS[day]?.substring(0, 3).toUpperCase()}
                            </div>
                            <div style={{fontSize: '0.68rem', marginTop: 3, color: 'var(--text-secondary)'}}>
                              {isAllDay ? '24hs' : isOff ? 'OFF' : (dc.ranges && dc.ranges.length > 0 ? dc.ranges.map(r => `${r.from}-${r.to}`).join(', ') : '—')}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Per-Day Configuration */}
                  <div style={{display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20}}>
                    {DAY_ORDER.map(day => {
                      const dc = waSchedule.days?.[day] || { mode: 'allday' }
                      const isWeekend = day === 'saturday' || day === 'sunday'
                      return (
                        <div key={day} style={{
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 12, 
                          padding: '10px 14px', 
                          borderRadius: 8, 
                          backgroundColor: 'var(--bg-dark)', 
                          border: '1px solid var(--border-color)',
                          flexWrap: 'wrap'
                        }}>
                          {/* Day Name */}
                          <div style={{width: 90, fontWeight: 600, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6}}>
                            <span style={{
                              width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
                              backgroundColor: dc.mode === 'allday' ? 'var(--accent-emerald)' : dc.mode === 'off' ? 'var(--accent-red)' : 'var(--accent-blue)'
                            }} />
                            {DAY_LABELS[day]}
                          </div>

                          {/* Mode Selector */}
                          <div style={{display: 'flex', gap: 4}}>
                            {[
                              { value: 'allday', label: '🟢 Todo el Día', color: 'var(--accent-emerald)' },
                              { value: 'range', label: '🕐 Horario', color: 'var(--accent-blue)' },
                              { value: 'off', label: '🔴 Inactivo', color: 'var(--accent-red)' }
                            ].map(opt => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                  const updates = { mode: opt.value }
                                  if (opt.value === 'range' && (!dc.ranges || dc.ranges.length === 0)) {
                                    updates.ranges = [{ from: '08:00', to: '20:00' }]
                                  }
                                  updateDayConfig(day, updates)
                                }}
                                style={{
                                  padding: '4px 10px',
                                  fontSize: '0.75rem',
                                  fontWeight: dc.mode === opt.value ? 700 : 500,
                                  borderRadius: 6,
                                  border: `1px solid ${dc.mode === opt.value ? opt.color : 'var(--border-color)'}`,
                                  backgroundColor: dc.mode === opt.value ? `${opt.color}15` : 'transparent',
                                  color: dc.mode === opt.value ? opt.color : 'var(--text-secondary)',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>

                          {/* Time Range Selectors (only for 'range' mode) */}
                          {dc.mode === 'range' && (
                            <div style={{display: 'flex', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap'}}>
                              {(dc.ranges || []).map((range, ri) => (
                                <div key={ri} style={{display: 'flex', alignItems: 'center', gap: 4}}>
                                  <select 
                                    value={range.from} 
                                    onChange={e => {
                                      const newRanges = [...(dc.ranges || [])]
                                      newRanges[ri] = { ...newRanges[ri], from: e.target.value }
                                      updateDayConfig(day, { ranges: newRanges })
                                    }}
                                    style={{padding: '4px 6px', fontSize: '0.8rem', borderRadius: 4, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer'}}
                                  >
                                    {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                                  </select>
                                  <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>a</span>
                                  <select 
                                    value={range.to} 
                                    onChange={e => {
                                      const newRanges = [...(dc.ranges || [])]
                                      newRanges[ri] = { ...newRanges[ri], to: e.target.value }
                                      updateDayConfig(day, { ranges: newRanges })
                                    }}
                                    style={{padding: '4px 6px', fontSize: '0.8rem', borderRadius: 4, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer'}}
                                  >
                                    {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                                  </select>
                                  {(dc.ranges || []).length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newRanges = (dc.ranges || []).filter((_, i) => i !== ri)
                                        updateDayConfig(day, { ranges: newRanges })
                                      }}
                                      style={{padding: '2px 6px', fontSize: '0.72rem', borderRadius: 4, border: '1px solid var(--accent-red)', backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--accent-red)', cursor: 'pointer'}}
                                    >✕</button>
                                  )}
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  const newRanges = [...(dc.ranges || []), { from: '08:00', to: '20:00' }]
                                  updateDayConfig(day, { ranges: newRanges })
                                }}
                                style={{padding: '3px 8px', fontSize: '0.72rem', borderRadius: 4, border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'var(--accent-blue)', cursor: 'pointer'}}
                                title="Agregar otro rango horario"
                              >+ Rango</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Quick Presets */}
                  <div style={{marginBottom: 18, padding: '10px 14px', borderRadius: 8, backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-color)'}}>
                    <div style={{fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8}}>⚡ Presets Rápidos</div>
                    <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{padding: '5px 12px', fontSize: '0.78rem'}}
                        onClick={() => {
                          const newDays = {}
                          DAY_ORDER.forEach(d => {
                            if (d === 'saturday' || d === 'sunday') {
                              newDays[d] = { mode: 'allday' }
                            } else {
                              newDays[d] = { mode: 'range', ranges: [{ from: '20:00', to: '23:30' }, { from: '00:00', to: '10:00' }] }
                            }
                          })
                          setWaSchedule(prev => ({ ...prev, days: newDays }))
                        }}
                      >
                        🌙 Nocturno L-V (20:00–10:00) + Fines 24hs
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{padding: '5px 12px', fontSize: '0.78rem'}}
                        onClick={() => {
                          const newDays = {}
                          DAY_ORDER.forEach(d => {
                            newDays[d] = { mode: 'range', ranges: [{ from: '09:00', to: '18:00' }] }
                          })
                          setWaSchedule(prev => ({ ...prev, days: newDays }))
                        }}
                      >
                        🏢 Horario Comercial (9:00–18:00)
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{padding: '5px 12px', fontSize: '0.78rem'}}
                        onClick={() => {
                          const newDays = {}
                          DAY_ORDER.forEach(d => {
                            newDays[d] = { mode: 'allday' }
                          })
                          setWaSchedule(prev => ({ ...prev, days: newDays }))
                        }}
                      >
                        🟢 Todos los Días 24hs
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{padding: '5px 12px', fontSize: '0.78rem'}}
                        onClick={() => {
                          const newDays = {}
                          DAY_ORDER.forEach(d => {
                            if (d === 'saturday' || d === 'sunday') {
                              newDays[d] = { mode: 'off' }
                            } else {
                              newDays[d] = { mode: 'range', ranges: [{ from: '08:00', to: '17:00' }] }
                            }
                          })
                          setWaSchedule(prev => ({ ...prev, days: newDays }))
                        }}
                      >
                        📅 Solo L-V (8:00–17:00)
                      </button>
                    </div>
                  </div>

                  {/* Off-Schedule Message */}
                  <div style={{marginBottom: 18}}>
                    <label style={{fontWeight: 600, fontSize: '0.88rem', marginBottom: 6, display: 'block'}}>
                      💬 Mensaje Fuera de Horario <span style={{fontWeight: 400, fontSize: '0.78rem', color: 'var(--text-secondary)'}}>(opcional — dejar vacío para silencio total)</span>
                    </label>
                    <textarea
                      value={waSchedule.off_schedule_message || ''}
                      onChange={e => setWaSchedule({...waSchedule, off_schedule_message: e.target.value})}
                      placeholder="Ej: En este momento estamos fuera de horario de atención. Te responderemos a la brevedad. ¡Gracias por tu paciencia!"
                      style={{
                        width: '100%',
                        minHeight: 70,
                        padding: 10,
                        backgroundColor: 'var(--bg-dark)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 6,
                        fontSize: '0.85rem',
                        lineHeight: '1.5',
                        resize: 'vertical'
                      }}
                    />
                    <small style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4, display: 'block'}}>
                      Si dejas este campo vacío, el bot simplemente no responderá cuando esté fuera de horario (silencio total).
                    </small>
                  </div>
                </>
              )}

              {/* Save Button */}
              <button
                type="button"
                onClick={handleSaveWaSchedule}
                disabled={savingSchedule}
                className="btn"
                style={{alignSelf: 'flex-start', backgroundColor: 'var(--accent-blue)', color: '#fff', border: 'none', padding: '8px 20px', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer'}}
              >
                {savingSchedule ? 'Guardando...' : '💾 Guardar Horario'}
              </button>
            </div>

            {/* Demand & Inquiries Analytics Panel */}
            <div className="card" style={{width: '100%', marginTop: 10}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, flexWrap: 'wrap', gap: 10}}>
                <div>
                  <h3 style={{margin: 0}}>📊 Demanda & Productos Solicitados por Clientes</h3>
                  <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0'}}>
                    Monitoreo en tiempo real del interés y productos más preguntados en WhatsApp por tus clientes.
                  </p>
                </div>
                <button onClick={fetchInquiries} type="button" className="btn btn-secondary" style={{fontSize: '0.8rem', padding: '6px 12px'}}>
                  {inquiriesLoading ? 'Cargando...' : '🔄 Actualizar Demanda'}
                </button>
              </div>

              {/* KPI Cards */}
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 15, marginBottom: 20}}>
                <div style={{padding: '15px', borderRadius: 8, backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-color)'}}>
                  <div style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Total Consultas Registradas</div>
                  <div style={{fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--accent-blue)', marginTop: 4}}>
                    {inquiriesSummary?.total_inquiries || 0}
                  </div>
                </div>

                <div style={{padding: '15px', borderRadius: 8, backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-color)'}}>
                  <div style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Consultas Con Stock</div>
                  <div style={{fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--accent-emerald)', marginTop: 4}}>
                    {inquiriesSummary?.total_in_stock || 0}
                  </div>
                </div>

                <div style={{padding: '15px', borderRadius: 8, backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-color)'}}>
                  <div style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Sin Stock (Oportunidades Perdidas)</div>
                  <div style={{fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--accent-red)', marginTop: 4}}>
                    {inquiriesSummary?.total_out_of_stock || 0}
                  </div>
                </div>
              </div>

              {/* Top Requested Products Table */}
              <h4 style={{marginBottom: 10, fontSize: '0.95rem'}}>🔥 Top Productos Más Consultados por Clientes</h4>
              {inquiriesSummary?.top_products && inquiriesSummary.top_products.length > 0 ? (
                <div style={{overflowX: 'auto', marginBottom: 20}}>
                  <table style={{width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem'}}>
                    <thead>
                      <tr style={{borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)'}}>
                        <th style={{padding: '8px 12px'}}>Producto Consultado</th>
                        <th style={{padding: '8px 12px', textAlign: 'center'}}>Total Consultas</th>
                        <th style={{padding: '8px 12px', textAlign: 'center'}}>Con Stock</th>
                        <th style={{padding: '8px 12px', textAlign: 'center'}}>Sin Stock</th>
                        <th style={{padding: '8px 12px'}}>Estado / Oportunidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inquiriesSummary.top_products.map((p, idx) => {
                        const hasOutOfStock = p.out_of_stock_count > 0;
                        return (
                          <tr key={idx} style={{borderBottom: '1px solid var(--border-color)'}}>
                            <td style={{padding: '10px 12px', fontWeight: 600}}>{p.product_name}</td>
                            <td style={{padding: '10px 12px', textAlign: 'center', fontWeight: 'bold'}}>{p.count}</td>
                            <td style={{padding: '10px 12px', textAlign: 'center', color: 'var(--accent-emerald)'}}>{p.in_stock_count}</td>
                            <td style={{padding: '10px 12px', textAlign: 'center', color: hasOutOfStock ? 'var(--accent-red)' : 'var(--text-secondary)'}}>{p.out_of_stock_count}</td>
                            <td style={{padding: '10px 12px'}}>
                              {hasOutOfStock ? (
                                <span style={{padding: '3px 8px', borderRadius: 12, backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-red)', fontSize: '0.75rem', fontWeight: 600}}>
                                  ⚠️ Oportunidad (Sin Stock)
                                </span>
                              ) : (
                                <span style={{padding: '3px 8px', borderRadius: 12, backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)', fontSize: '0.75rem', fontWeight: 600}}>
                                  ✓ En Stock
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '10px 0'}}>
                  Aún no hay consultas registradas. A medida que los clientes pregunten por productos en WhatsApp, la IA los registrará y mostrará aquí automáticamente.
                </p>
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

      {/* Expanded Prompt Editor Modal */}
      {showPromptModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 99999,
          padding: 20
        }}>
          <div className="card shadow-2xl" style={{
            width: 1100,
            maxWidth: '98%',
            height: '92vh',
            display: 'flex',
            flexDirection: 'column',
            padding: 25,
            overflow: 'hidden',
            backgroundColor: 'var(--bg-card)',
            borderRadius: 12,
            border: '1px solid var(--border-color)'
          }}>
            {/* Modal Header */}
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderBottom: '1px solid var(--border-color)', paddingBottom: 12}}>
              <div>
                <h3 style={{margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8}}>
                  🤖 Editor Ampliado de Instrucciones (System Prompt)
                </h3>
                <p style={{margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)'}}>
                  Redacta y organiza de forma cómoda el comportamiento completo del asistente de WhatsApp.
                </p>
              </div>
              <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-dark)', padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-color)'}}>
                  📊 <strong>{promptCharCount.toLocaleString()}</strong> caracteres | <strong>{promptWordCount.toLocaleString()}</strong> palabras | <strong>{promptLineCount}</strong> líneas | ~<strong>{promptTokenEst.toLocaleString()}</strong> tokens Gemini
                </span>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{padding: '6px 12px', fontSize: '0.85rem'}}
                  onClick={() => setShowPromptModal(false)}
                >
                  ✕ Cerrar
                </button>
              </div>
            </div>

            {/* Quick Templates Toolbar */}
            <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, backgroundColor: 'var(--bg-dark)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)'}}>
              <span style={{fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600}}>⚡ Insertar Secciones Recomendadas:</span>
              
              <button
                type="button"
                className="btn btn-secondary"
                style={{padding: '3px 8px', fontSize: '0.75rem'}}
                onClick={() => {
                  const snippet = `\n\nREGLAS DE ATENCIÓN Y TONO:\n- Saluda de manera amable y profesional.\n- Responde en español neutro / argentino de forma clara y directa.\n- Prioriza responder dudas frecuentes con listas con viñetas.`
                  setWaConfig(prev => ({ ...prev, bot_instructions: (prev.bot_instructions || "") + snippet }))
                }}
              >
                + Tono y Reglas
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                style={{padding: '3px 8px', fontSize: '0.75rem'}}
                onClick={() => {
                  const snippet = `\n\nINFORMACIÓN DE ENVÍOS Y ENTREGAS:\n- Realizamos envíos a todo el país.\n- Despacho dentro de las 24-48 hs hábiles de confirmado el pago.\n- Retiros por sucursal en horario comercial de Lunes a Viernes de 9 a 18 hs.`
                  setWaConfig(prev => ({ ...prev, bot_instructions: (prev.bot_instructions || "") + snippet }))
                }}
              >
                + Envíos y Entregas
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                style={{padding: '3px 8px', fontSize: '0.75rem'}}
                onClick={() => {
                  const snippet = `\n\nMEDIOS DE PAGO Y FACTURACIÓN:\n- Aceptamos Mercado Pago, Transferencia Bancaria y Tarjetas de Crédito/Débito.\n- Emitimos Factura A y B oficial.`
                  setWaConfig(prev => ({ ...prev, bot_instructions: (prev.bot_instructions || "") + snippet }))
                }}
              >
                + Pagos y Facturación
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                style={{padding: '3px 8px', fontSize: '0.75rem'}}
                onClick={() => {
                  const snippet = `\n\nPREGUNTAS FRECUENTES (FAQ):\n- ¿Los precios incluyen IVA?: Sí, todos los precios incluyen IVA.\n- ¿Hacen presupuestos mayoristas?: Sí, consultá con nuestros asesores.`
                  setWaConfig(prev => ({ ...prev, bot_instructions: (prev.bot_instructions || "") + snippet }))
                }}
              >
                + Preguntas Frecuentes
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                style={{padding: '3px 8px', fontSize: '0.75rem'}}
                onClick={() => {
                  const snippet = `\n\nRESTRICCIONES:\n- No inventes stock ni precios que no figuren en la memoria del sistema.\n- Si el usuario solicita hablar con una persona real o requiere atención personalizada, indica amablemente que un representante humano tomará la consulta.`
                  setWaConfig(prev => ({ ...prev, bot_instructions: (prev.bot_instructions || "") + snippet }))
                }}
              >
                + Restricciones y Seguridad
              </button>
            </div>

            {/* Main Full-Size Textarea */}
            <div style={{flex: 1, display: 'flex', flexDirection: 'column', position: 'relative'}}>
              <textarea 
                value={waConfig.bot_instructions || ""} 
                onChange={e => setWaConfig({...waConfig, bot_instructions: e.target.value})} 
                placeholder="Escribe aquí las instrucciones detalladas para el asistente virtual..."
                style={{
                  width: '100%', 
                  height: '100%', 
                  padding: 15, 
                  backgroundColor: 'var(--bg-dark)', 
                  color: 'var(--text-primary)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: 8,
                  fontFamily: useMonospacePrompt ? 'Consolas, Monaco, "Courier New", monospace' : 'inherit',
                  fontSize: '0.9rem',
                  lineHeight: '1.6',
                  outline: 'none',
                  resize: 'none'
                }}
              />
            </div>

            {/* Modal Footer */}
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, paddingTop: 12, borderTop: '1px solid var(--border-color)'}}>
              <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{padding: '6px 12px', fontSize: '0.8rem'}}
                  onClick={() => {
                    navigator.clipboard.writeText(waConfig.bot_instructions || "")
                    alert("¡Prompt copiado al portapapeles!")
                  }}
                >
                  📋 Copiar Texto
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{padding: '6px 12px', fontSize: '0.8rem', color: 'var(--accent-red)'}}
                  onClick={() => {
                    if (window.confirm("¿Seguro que deseas limpiar todo el contenido del prompt?")) {
                      setWaConfig(prev => ({ ...prev, bot_instructions: "" }))
                    }
                  }}
                >
                  🗑️ Limpiar
                </button>
              </div>

              <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
                <button 
                  type="button"
                  className="btn" 
                  style={{padding: '8px 20px', fontSize: '0.9rem', backgroundColor: 'var(--accent-emerald)', color: '#fff'}}
                  onClick={() => setShowPromptModal(false)}
                >
                  ✓ Aplicar al Asistente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
