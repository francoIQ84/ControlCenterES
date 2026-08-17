import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { 
  Users, MessageSquare, TrendingUp, RefreshCw, Sparkles, Filter, Search, Plus, 
  Trash2, Edit2, Download, ExternalLink, Mail, Phone, ShoppingBag, UserCheck, 
  CheckCircle2, AlertTriangle, Layers, HelpCircle, Upload, FileText
} from 'lucide-react'
import MeliQuestions from './MeliQuestions'

export default function Customers() {
  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') || 'customers'
  const [activeTab, setActiveTab] = useState(initialTab) // 'customers' | 'meli_questions' | 'inquiries' | 'leads' | 'whatsapp'

  useEffect(() => {
    const t = searchParams.get('tab')
    if (t) setActiveTab(t)
  }, [searchParams])
  const [loading, setLoading] = useState(true)
  const [syncingWa, setSyncingWa] = useState(false)
  const [syncingMetaLeads, setSyncingMetaLeads] = useState(false)
  const [analyzingInquiries, setAnalyzingInquiries] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState('ALL')
  const [syncNotice, setSyncNotice] = useState(null)

  // WhatsApp File Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importingFile, setImportingFile] = useState(false)
  const [selectedWaFile, setSelectedWaFile] = useState(null)
  const [importError, setImportError] = useState('')

  // Central CRM State
  const [crmData, setCrmData] = useState({
    metrics: { total_customers: 0, total_wa_chats: 0, total_leads: 0, total_inquiries: 0 },
    customers: [],
    leads: [],
    whatsapp_chats: [],
    product_inquiries: []
  })

  // Modal State for Manual Customer
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('create')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Selection & Bulk Actions State
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([])
  const [deletingBulk, setDeletingBulk] = useState(false)


  const initialForm = {
    nickname: '',
    full_name: '',
    email: '',
    phone: '',
    document_type: 'DNI',
    document_number: '',
    address: '',
    source_platform: 'MANUAL'
  }
  const [formData, setFormData] = useState(initialForm)

  const fetchCrmData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/customers/central')
      if (res.ok) {
        const json = await res.json()
        if (json.data) {
          setCrmData(json.data)
        }
      }
    } catch (err) {
      console.error("Error fetching CRM central data:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCrmData()
  }, [])

  // Action: Trigger WhatsApp Contact Sync
  const handleSyncWhatsApp = async () => {
    setSyncingWa(true)
    setSyncNotice(null)
    try {
      const res = await fetch('/api/customers/sync-whatsapp', { method: 'POST' })
      const json = await res.json()
      if (res.ok && json.status === 'success') {
        setSyncNotice({ type: 'success', text: `¡WhatsApp Sincronizado! Se procesaron ${json.total_found} contactos (${json.synced_count} guardados en clientes).` })
        fetchCrmData()
      } else {
        setSyncNotice({ type: 'warning', text: json.message || 'No se pudieron extraer contactos de WhatsApp en este momento.' })
      }
    } catch (err) {
      setSyncNotice({ type: 'error', text: `Error de conexión: ${err.message}` })
    } finally {
      setSyncingWa(false)
    }
  }

  // Action: Trigger Meta Lead Ads Sync (Instagram & Facebook Ads)
  const handleSyncMetaLeads = async () => {
    setSyncingMetaLeads(true)
    setSyncNotice(null)
    try {
      const res = await fetch('/api/customers/sync-meta-leads', { method: 'POST' })
      const json = await res.json()
      if (res.ok && json.success) {
        if (json.forms_processed === 0) {
          setSyncNotice({
            type: 'warning',
            text: 'ℹ️ Se procesaron 0 formularios de Meta. Para importar prospectos automáticamente, vinculá tu Token en Marketing > Configuración Meta y asegurate de tener formularios de Lead Ads activos en Instagram/Facebook.'
          })
        } else {
          setSyncNotice({
            type: 'success',
            text: `¡Leads de Meta Sincronizados! Se procesaron ${json.forms_processed || 0} formularios de Instagram/Facebook Ads y se importaron ${json.synced_count || 0} nuevos clientes.`
          })
        }
        fetchCrmData()
      } else {
        setSyncNotice({
          type: 'warning',
          text: json.detail || 'No se pudieron descargar los leads de Meta Ads. Verifica que las credenciales de Instagram/Facebook estén configuradas.'
        })
      }
    } catch (err) {
      setSyncNotice({ type: 'error', text: `Error de conexión: ${err.message}` })
    } finally {
      setSyncingMetaLeads(false)
    }
  }

  // Action: Trigger Chat Inquiry AI Analysis
  const handleAnalyzeInquiries = async () => {
    setAnalyzingInquiries(true)
    setSyncNotice(null)
    try {
      const res = await fetch('/api/customers/analyze-inquiries', { method: 'POST' })
      const json = await res.json()
      if (res.ok && json.status === 'success') {
        setSyncNotice({ type: 'success', text: `¡Análisis completado! Se indexaron ${json.analyzed_count} nuevas consultas de productos en el historial.` })
        fetchCrmData()
      } else {
        setSyncNotice({ type: 'error', text: 'Error durante el análisis del historial de chats.' })
      }
    } catch (err) {
      setSyncNotice({ type: 'error', text: `Error: ${err.message}` })
    } finally {
      setAnalyzingInquiries(false)
    }
  }

  // Action: Import WhatsApp Backup / Chat File
  const [selectedKeyFile, setSelectedKeyFile] = useState(null)

  const handleUploadWaFile = async (e) => {
    e.preventDefault()
    if (!selectedWaFile) {
      setImportError('Por favor selecciona un archivo (.txt, .db, .crypt14)')
      return
    }
    setImportingFile(true)
    setImportError('')
    try {
      const formDataUpload = new FormData()
      formDataUpload.append('file', selectedWaFile)
      if (selectedKeyFile) {
        formDataUpload.append('key_file', selectedKeyFile)
      }
      const res = await fetch('/api/customers/import-whatsapp-file', {
        method: 'POST',
        body: formDataUpload
      })
      const json = await res.json()
      if (res.ok && json.status === 'success') {
        const d = json.data
        setSyncNotice({
          type: 'success',
          text: `¡Copia de WhatsApp Importada! Se procesaron ${d.imported_messages} mensajes, ${d.imported_contacts} nuevos contactos y ${d.analyzed_inquiries} consultas de productos por IA.`
        })
        setIsImportModalOpen(false)
        setSelectedWaFile(null)
        setSelectedKeyFile(null)
        fetchCrmData()
      } else {
        throw new Error(json.detail || json.message || 'Error al procesar el archivo de WhatsApp')
      }
    } catch (err) {
      setImportError(err.message)
    } finally {
      setImportingFile(false)
    }
  }

  // Handle Manual Customer Modals
  const handleOpenCreate = () => {
    setModalMode('create')
    setSelectedCustomer(null)
    setFormData(initialForm)
    setErrorMsg('')
    setIsModalOpen(true)
  }

  const handleOpenEdit = (customer) => {
    setModalMode('edit')
    setSelectedCustomer(customer)
    setFormData({
      nickname: customer.nickname || '',
      full_name: customer.full_name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      document_type: customer.document_type || 'DNI',
      document_number: customer.document_number || '',
      address: customer.address || '',
      source_platform: customer.source_platform || 'MANUAL'
    })
    setErrorMsg('')
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setErrorMsg('')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErrorMsg('')
    try {
      let url = '/api/customers/'
      let method = 'POST'
      if (modalMode === 'edit' && selectedCustomer) {
        url = `/api/customers/${selectedCustomer.buyer_id}`
        method = 'PUT'
      }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Error al guardar cliente')
      setIsModalOpen(false)
      fetchCrmData()
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (customer) => {
    if (!window.confirm(`¿Estás seguro de eliminar el cliente "${customer.full_name || customer.nickname}"?`)) return
    try {
      const res = await fetch(`/api/customers/${customer.buyer_id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar cliente')
      setSelectedCustomerIds(prev => prev.filter(id => id !== customer.buyer_id))
      fetchCrmData()
    } catch (err) {
      alert(err.message)
    }
  }

  // CSV Exporter for Leads
  const exportLeadsCSV = () => {
    if (!crmData.leads || crmData.leads.length === 0) return
    const headers = ['ID', 'Nombre', 'Email', 'Pais', 'Origen', 'PDF Enviado', 'Fecha']
    const rows = crmData.leads.map(l => [
      l.id, `"${l.name || ''}"`, `"${l.email || ''}"`, `"${l.country || ''}"`, `"${l.source || ''}"`, `"${l.pdf_sent || ''}"`, `"${l.created_at || ''}"`
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `leads_hidroponia_${new Date().toISOString().slice(0,10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const [sortConfig, setSortConfig] = useState({ key: 'total_spent', direction: 'desc' })

  // Filtering for Customers
  const filteredCustomers = useMemo(() => {
    let items = crmData.customers || []
    if (platformFilter !== 'ALL') {
      items = items.filter(c => {
        const p = (c.source_platform || '').toUpperCase()
        if (platformFilter === 'WHATSAPP') return p === 'WHATSAPP' || p === 'WA'
        if (platformFilter === 'MERCADOLIBRE') return p === 'MERCADOLIBRE' || p === 'MELI'
        if (platformFilter === 'MERCADOPAGO') return p === 'MERCADOPAGO' || p === 'MP'
        if (platformFilter === 'INSTAGRAM') return p.includes('INSTAGRAM')
        if (platformFilter === 'FACEBOOK') return p.includes('FACEBOOK')
        if (platformFilter === 'MANUAL') {
          return p === 'MANUAL' || !p || (!['MERCADOLIBRE', 'MELI', 'MERCADOPAGO', 'MP', 'WHATSAPP', 'WA', 'WEB_LEAD', 'LEAD', 'INSTAGRAM_ADS', 'FACEBOOK_ADS'].includes(p))
        }
        return p === platformFilter
      })
    }
    if (!searchQuery.trim()) return items
    const q = searchQuery.toLowerCase().trim()
    return items.filter(c =>
      (c.nickname || '').toLowerCase().includes(q) ||
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.document_number || '').toLowerCase().includes(q)
    )
  }, [crmData.customers, platformFilter, searchQuery])

  // Sorting for Customers
  const handleRequestSort = (key) => {
    let direction = 'desc'
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc'
    }
    setSortConfig({ key, direction })
  }

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return ' ⇅'
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼'
  }

  const sortedCustomers = useMemo(() => {
    let items = [...filteredCustomers]
    if (!sortConfig.key) return items

    return items.sort((a, b) => {
      let aVal = a[sortConfig.key]
      let bVal = b[sortConfig.key]

      if (sortConfig.key === 'full_name') {
        aVal = (a.full_name || a.nickname || '').toLowerCase()
        bVal = (b.full_name || b.nickname || '').toLowerCase()
      } else if (sortConfig.key === 'source_platform') {
        aVal = (a.source_platform || 'MANUAL').toLowerCase()
        bVal = (b.source_platform || 'MANUAL').toLowerCase()
      } else if (sortConfig.key === 'total_orders') {
        aVal = Number(a.total_orders || 0)
        bVal = Number(b.total_orders || 0)
      } else if (sortConfig.key === 'total_spent') {
        aVal = Number(a.total_spent || 0)
        bVal = Number(b.total_spent || 0)
      } else if (sortConfig.key === 'last_activity') {
        aVal = a.last_activity || a.created_at || ''
        bVal = b.last_activity || b.created_at || ''
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredCustomers, sortConfig])

  // Multi-Selection Logic
  const toggleSelectCustomer = (buyer_id) => {
    setSelectedCustomerIds(prev =>
      prev.includes(buyer_id) ? prev.filter(id => id !== buyer_id) : [...prev, buyer_id]
    )
  }

  const visibleCustomerIds = useMemo(() => sortedCustomers.map(c => c.buyer_id), [sortedCustomers])

  const isAllSelected = useMemo(() => {
    return visibleCustomerIds.length > 0 && visibleCustomerIds.every(id => selectedCustomerIds.includes(id))
  }, [visibleCustomerIds, selectedCustomerIds])

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedCustomerIds(prev => prev.filter(id => !visibleCustomerIds.includes(id)))
    } else {
      setSelectedCustomerIds(prev => Array.from(new Set([...prev, ...visibleCustomerIds])))
    }
  }

  const handleBulkDelete = async () => {
    const count = selectedCustomerIds.length
    if (count === 0) return
    if (!window.confirm(`¿Estás seguro de que deseas eliminar los ${count} contactos seleccionados? Esta acción no se puede deshacer.`)) return

    setDeletingBulk(true)
    try {
      const res = await fetch('/api/customers/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer_ids: selectedCustomerIds })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Error al eliminar los contactos seleccionados')

      setSelectedCustomerIds([])
      fetchCrmData()
    } catch (err) {
      alert(err.message)
    } finally {
      setDeletingBulk(false)
    }
  }

  // Helper Badge Render
  const renderPlatformBadge = (platform) => {
    const p = (platform || 'MANUAL').toUpperCase()
    if (p.includes('INSTAGRAM')) {
      return <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', backgroundColor: '#e1306c', color: '#fff' }}>📸 Instagram Ads</span>
    }
    if (p.includes('FACEBOOK')) {
      return <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', backgroundColor: '#1877f2', color: '#fff' }}>🟦 Facebook Ads</span>
    }
    if (p === 'MERCADOLIBRE' || p === 'MELI') {
      return <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', backgroundColor: '#fff159', color: '#333' }}>MercadoLibre</span>
    }
    if (p === 'MERCADOPAGO' || p === 'MP') {
      return <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', backgroundColor: '#009ee3', color: '#fff' }}>MercadoPago</span>
    }
    if (p === 'WHATSAPP' || p === 'WA') {
      return <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', backgroundColor: '#25D366', color: '#fff' }}>WhatsApp</span>
    }
    if (p === 'WEB_LEAD' || p === 'LEAD') {
      return <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', backgroundColor: '#10b981', color: '#fff' }}>Lead Web</span>
    }
    return <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', backgroundColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Manual</span>
  }

  return (
    <div style={{ paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px', marginBottom: '20px' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users style={{ color: 'var(--accent-blue)' }} /> CRM & Clientes
          </h1>
          <p className="page-subtitle">
            Gestión omnicanal centralizada: Cartera de compradores, auto-responder de Mercado Libre con IA, consultas de productos y leads.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 15px', borderRadius: '8px', fontWeight: '600' }}
          >
            <Upload size={16} /> Importar Copia WA
          </button>

          <button
            onClick={handleSyncWhatsApp}
            disabled={syncingWa}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 15px', borderRadius: '8px', fontWeight: '600' }}
          >
            <RefreshCw size={16} className={syncingWa ? 'spin' : ''} />
            {syncingWa ? 'Sincronizando...' : 'Extraer Contactos WA'}
          </button>

          <button
            onClick={handleSyncMetaLeads}
            disabled={syncingMetaLeads}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 15px', borderRadius: '8px', fontWeight: '600', backgroundColor: '#e1306c', color: '#fff', border: 'none' }}
            title="Descargar clientes e importar formularios de Instagram Ads / Facebook Ads"
          >
            <Download size={16} className={syncingMetaLeads ? 'spin' : ''} />
            {syncingMetaLeads ? 'Descargando...' : '📥 Sincronizar Leads Meta'}
          </button>

          <button
            onClick={handleAnalyzeInquiries}
            disabled={analyzingInquiries}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 15px', borderRadius: '8px', fontWeight: '600', backgroundColor: '#8b5cf6', color: '#fff', border: 'none' }}
          >
            <Sparkles size={16} className={analyzingInquiries ? 'spin' : ''} />
            {analyzingInquiries ? 'Analizando...' : 'Analizar Chats con IA'}
          </button>

          <button
            onClick={handleOpenCreate}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 15px', borderRadius: '8px', fontWeight: '600' }}
          >
            <Plus size={16} /> Nuevo Cliente
          </button>
        </div>
      </div>

      {/* Sync Notification Banner */}
      {syncNotice && (
        <div style={{
          padding: '12px 18px',
          borderRadius: '10px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          backgroundColor: syncNotice.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: `1px solid ${syncNotice.type === 'success' ? '#10b981' : '#ef4444'}`,
          color: syncNotice.type === 'success' ? '#10b981' : '#ef4444'
        }}>
          {syncNotice.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          <span style={{ fontSize: '14px', fontWeight: '600' }}>{syncNotice.text}</span>
        </div>
      )}

      {/* Metric Cards Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', marginBottom: '25px' }}>
        <div className="card" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
            <Users size={24} />
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '700' }}>{crmData.metrics.total_customers}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Clientes Consolidados</div>
          </div>
        </div>

        <div className="card" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(37, 211, 102, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#25D366' }}>
            <MessageSquare size={24} />
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '700' }}>{crmData.metrics.total_wa_chats}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Chats WhatsApp Únicos</div>
          </div>
        </div>

        <div className="card" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
            <UserCheck size={24} />
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '700' }}>{crmData.metrics.total_leads}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Leads & Suscriptores</div>
          </div>
        </div>

        <div className="card" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(139, 92, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b5cf6' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '700' }}>{crmData.metrics.total_inquiries}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Productos Más Consultados</div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation (Settings.jsx pattern) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: 10,
        marginBottom: '25px'
      }}>
        <button
          onClick={() => setActiveTab('customers')}
          style={{
            padding: '10px 12px',
            border: activeTab === 'customers' ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
            borderRadius: '8px',
            backgroundColor: activeTab === 'customers' ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-card)',
            color: activeTab === 'customers' ? 'var(--accent-blue)' : 'var(--text-secondary)',
            fontWeight: '700',
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <Users size={16} /> Clientes ({crmData.customers.length})
        </button>

        <button
          onClick={() => setActiveTab('meli_questions')}
          style={{
            padding: '10px 12px',
            border: activeTab === 'meli_questions' ? '2px solid #f59e0b' : '1px solid var(--border-color)',
            borderRadius: '8px',
            backgroundColor: activeTab === 'meli_questions' ? 'rgba(245, 158, 11, 0.1)' : 'var(--bg-card)',
            color: activeTab === 'meli_questions' ? '#f59e0b' : 'var(--text-secondary)',
            fontWeight: '700',
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <Sparkles size={16} /> Preguntas ML (IA)
        </button>

        <button
          onClick={() => setActiveTab('inquiries')}
          style={{
            padding: '10px 12px',
            border: activeTab === 'inquiries' ? '2px solid #8b5cf6' : '1px solid var(--border-color)',
            borderRadius: '8px',
            backgroundColor: activeTab === 'inquiries' ? 'rgba(139, 92, 246, 0.1)' : 'var(--bg-card)',
            color: activeTab === 'inquiries' ? '#8b5cf6' : 'var(--text-secondary)',
            fontWeight: '700',
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <TrendingUp size={16} /> Consultas ({crmData.product_inquiries.length})
        </button>

        <button
          onClick={() => setActiveTab('leads')}
          style={{
            padding: '10px 12px',
            border: activeTab === 'leads' ? '2px solid #10b981' : '1px solid var(--border-color)',
            borderRadius: '8px',
            backgroundColor: activeTab === 'leads' ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-card)',
            color: activeTab === 'leads' ? '#10b981' : 'var(--text-secondary)',
            fontWeight: '700',
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <UserCheck size={16} /> Leads Web ({crmData.leads.length})
        </button>

        <button
          onClick={() => setActiveTab('whatsapp')}
          style={{
            padding: '10px 12px',
            border: activeTab === 'whatsapp' ? '2px solid #25D366' : '1px solid var(--border-color)',
            borderRadius: '8px',
            backgroundColor: activeTab === 'whatsapp' ? 'rgba(37, 211, 102, 0.1)' : 'var(--bg-card)',
            color: activeTab === 'whatsapp' ? '#25D366' : 'var(--text-secondary)',
            fontWeight: '700',
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <MessageSquare size={16} /> Chats WhatsApp ({crmData.whatsapp_chats.length})
        </button>
      </div>

      {/* TAB 2: Preguntas Mercado Libre (IA) */}
      {activeTab === 'meli_questions' && (
        <MeliQuestions embedded={true} />
      )}

      {/* TAB 1: Cartera de Clientes */}
      {activeTab === 'customers' && (
        <div>
          {/* Controls Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px' }}>
              <div className="search-box" style={{ width: '100%', position: 'relative' }}>
                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Buscar por nombre, teléfono, email, DNI..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: '38px', width: '100%', borderRadius: '8px', border: '1px solid var(--border-color)', height: '40px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Filter size={16} style={{ color: 'var(--text-secondary)' }} />
              <select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', height: '40px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
              >
                <option value="ALL">Todos los orígenes</option>
                <option value="INSTAGRAM">📸 Instagram Ads</option>
                <option value="FACEBOOK">🟦 Facebook Ads</option>
                <option value="WHATSAPP">💬 WhatsApp</option>
                <option value="MERCADOLIBRE">🟡 MercadoLibre</option>
                <option value="MERCADOPAGO">💳 MercadoPago</option>
                <option value="MANUAL">✏️ Manual</option>
              </select>
            </div>
          </div>

          {/* Batch Action Bar */}
          {selectedCustomerIds.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '10px',
              padding: '12px 18px',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontWeight: '700', color: '#ef4444', fontSize: '14px' }}>
                  {selectedCustomerIds.length} contacto{selectedCustomerIds.length > 1 ? 's' : ''} seleccionado{selectedCustomerIds.length > 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => setSelectedCustomerIds([])}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Desmarcar todos
                </button>
              </div>
              <button
                onClick={handleBulkDelete}
                disabled={deletingBulk}
                style={{
                  backgroundColor: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: '600',
                  cursor: deletingBulk ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: deletingBulk ? 0.7 : 1,
                  boxShadow: '0 2px 8px rgba(239, 68, 68, 0.25)'
                }}
              >
                <Trash2 size={16} /> {deletingBulk ? 'Eliminando...' : `Eliminar (${selectedCustomerIds.length})`}
              </button>
            </div>
          )}

          {/* Customer Table */}
          <div className="table-responsive card">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      title={isAllSelected ? "Deseleccionar todos" : "Seleccionar todos los visibles"}
                    />
                  </th>
                  <th onClick={() => handleRequestSort('full_name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Cliente{getSortIcon('full_name')}
                  </th>
                  <th>Contacto</th>
                  <th onClick={() => handleRequestSort('source_platform')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Origen{getSortIcon('source_platform')}
                  </th>
                  <th onClick={() => handleRequestSort('total_orders')} style={{ textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}>
                    Compras{getSortIcon('total_orders')}
                  </th>
                  <th onClick={() => handleRequestSort('total_spent')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>
                    Total Gastado{getSortIcon('total_spent')}
                  </th>
                  <th onClick={() => handleRequestSort('last_activity')} style={{ textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}>
                    Última Actividad{getSortIcon('last_activity')}
                  </th>
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: '30px' }}>Cargando cartera de clientes...</td></tr>
                ) : sortedCustomers.length === 0 ? (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>No se encontraron clientes.</td></tr>
                ) : (
                  sortedCustomers.map(c => {
                    const cleanPhone = (c.phone || '').replace(/[^0-9]/g, '')
                    const isSelected = selectedCustomerIds.includes(c.buyer_id)
                    return (
                      <tr key={c.buyer_id} style={{ backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent' }}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectCustomer(c.buyer_id)}
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                        </td>
                        <td>
                          <div style={{ fontWeight: '700' }}>{c.full_name || c.nickname || `Cliente #${c.buyer_id}`}</div>
                          {c.nickname && c.nickname !== c.full_name && (
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>@{c.nickname}</div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '13px' }}>
                            {c.phone && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Phone size={13} style={{ color: '#25D366' }} />
                                <span>{c.phone}</span>
                              </div>
                            )}
                            {c.email && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                                <Mail size={13} />
                                <span>{c.email}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td>{renderPlatformBadge(c.source_platform)}</td>
                        <td style={{ textAlign: 'center', fontWeight: '700' }}>{c.total_orders || 0}</td>
                        <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--accent-blue)' }}>
                          ${(c.total_spent || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
                          {c.last_activity || c.created_at || 'Reciente'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                            {cleanPhone && (
                              <a
                                href={`https://wa.me/${cleanPhone}`}
                                target="_blank"
                                rel="noreferrer"
                                title="Abrir WhatsApp"
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: '6px',
                                  backgroundColor: 'rgba(37, 211, 102, 0.15)',
                                  color: '#25D366',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  textDecoration: 'none',
                                  fontWeight: '600',
                                  fontSize: '12px'
                                }}
                              >
                                <MessageSquare size={14} /> WhatsApp
                              </a>
                            )}
                            <button
                              onClick={() => handleOpenEdit(c)}
                              className="btn-icon"
                              title="Editar cliente"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(c)}
                              className="btn-icon"
                              style={{ color: '#ef4444' }}
                              title="Eliminar cliente"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}

              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Productos Más Consultados */}
      {activeTab === 'inquiries' && (
        <div>
          <div style={{ marginBottom: '15px', color: 'var(--text-secondary)', fontSize: '14px' }}>
            Estadística extraída del análisis automático del historial de chats de WhatsApp e inquietudes de clientes.
          </div>

          {crmData.product_inquiries.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
              <HelpCircle size={40} style={{ color: 'var(--text-secondary)', marginBottom: '12px' }} />
              <h3>Aún no hay estadísticas de consultas indexadas</h3>
              <p style={{ color: 'var(--text-secondary)', maxWidth: '500px', margin: '0 auto 20px' }}>
                Haz clic en el botón superior <strong>"Analizar Chats con IA"</strong> para procesar el historial de conversaciones y generar el ranking de productos más pedidos.
              </p>
              <button onClick={handleAnalyzeInquiries} className="btn btn-primary">
                <Sparkles size={16} /> Iniciar Análisis de Historial
              </button>
            </div>
          ) : (
            <div className="table-responsive card">
              <table className="table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th style={{ textAlign: 'center' }}>Consultas Totales</th>
                    <th style={{ textAlign: 'center' }}>Clientes Únicos</th>
                    <th style={{ textAlign: 'center' }}>Estado de Stock</th>
                    <th style={{ textAlign: 'right' }}>Precio Web</th>
                    <th style={{ textAlign: 'center' }}>Última Consulta</th>
                  </tr>
                </thead>
                <tbody>
                  {crmData.product_inquiries.map((p, idx) => (
                    <tr key={idx}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {p.thumbnail ? (
                            <img src={p.thumbnail} alt={p.catalog_title} style={{ width: '42px', height: '42px', borderRadius: '6px', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '42px', height: '42px', borderRadius: '6px', backgroundColor: 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <ShoppingBag size={20} style={{ color: 'var(--text-secondary)' }} />
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: '700' }}>{p.catalog_title}</div>
                            {p.ml_id && <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>ID: {p.ml_id}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: '800', fontSize: '16px', color: '#8b5cf6' }}>
                        {p.inquiry_count}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: '600' }}>
                        {p.unique_customers} clientes
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {p.stock > 0 ? (
                          <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                            Con Stock ({p.stock} u.)
                          </span>
                        ) : (
                          <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
                            Agotado / Sin Stock
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '700' }}>
                        ${p.price_web ? p.price_web.toLocaleString('es-AR', { minimumFractionDigits: 2 }) : 'N/A'}
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {p.last_inquired_at || 'Reciente'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Leads & Suscriptores Web */}
      {activeTab === 'leads' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              Prospectos registrados desde el pop-up web y formulario de guía/boletín.
            </span>
            <button onClick={exportLeadsCSV} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Download size={16} /> Exportar CSV
            </button>
          </div>

          <div className="table-responsive card">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>País</th>
                  <th>Origen</th>
                  <th>Recurso Enviado</th>
                  <th>Fecha Registro</th>
                </tr>
              </thead>
              <tbody>
                {crmData.leads.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>No hay leads registrados.</td></tr>
                ) : (
                  crmData.leads.map(l => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: '600' }}>{l.name || 'Sin especificar'}</td>
                      <td>
                        <a href={`mailto:${l.email}`} style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}>
                          {l.email}
                        </a>
                      </td>
                      <td>{l.country || 'Argentina'}</td>
                      <td><span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '11px', backgroundColor: 'var(--border-color)' }}>{l.source || 'Popup Lead'}</span></td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{l.pdf_sent || 'Guía Hidroponia PDF'}</td>
                      <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{l.created_at || 'N/D'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Extractor de WhatsApp */}
      {activeTab === 'whatsapp' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              Listado de números únicos detectados en la cuenta de WhatsApp conectada.
            </span>
            <button onClick={handleSyncWhatsApp} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RefreshCw size={16} className={syncingWa ? 'spin' : ''} /> Ejecutar Extractor
            </button>
          </div>

          <div className="table-responsive card">
            <table className="table">
              <thead>
                <tr>
                  <th>Número / Remitente</th>
                  <th style={{ textAlign: 'center' }}>Mensajes Intercambiados</th>
                  <th style={{ textAlign: 'center' }}>Última Actividad</th>
                  <th style={{ textAlign: 'center' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {crmData.whatsapp_chats.length === 0 ? (
                  <tr><td colSpan="4" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>No hay chats de WhatsApp registrados en la base de datos.</td></tr>
                ) : (
                  crmData.whatsapp_chats.map((w, idx) => {
                    const cleanPhone = (w.sender || '').replace(/[^0-9]/g, '')
                    return (
                      <tr key={idx}>
                        <td style={{ fontWeight: '700' }}>
                          +{w.sender}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: '700' }}>{w.total_messages}</td>
                        <td style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>{w.last_activity || 'N/D'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <a
                            href={`https://wa.me/${cleanPhone}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              padding: '5px 12px',
                              borderRadius: '6px',
                              backgroundColor: '#25D366',
                              color: '#fff',
                              textDecoration: 'none',
                              fontSize: '12px',
                              fontWeight: '600',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <ExternalLink size={13} /> Chat WhatsApp
                          </a>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Crear/Editar Cliente Manual */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={handleCloseModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <h2 style={{ marginBottom: '15px' }}>{modalMode === 'create' ? 'Nuevo Cliente' : 'Editar Cliente'}</h2>

            {errorMsg && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444', marginBottom: '15px', fontSize: '14px' }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>Nombre Completo / Razón Social</label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>Teléfono / WhatsApp</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Ej: 5493416123456"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>Doc. Tipo</label>
                  <select
                    value={formData.document_type}
                    onChange={e => setFormData({ ...formData, document_type: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  >
                    <option value="DNI">DNI</option>
                    <option value="CUIT">CUIT</option>
                    <option value="CUIL">CUIL</option>
                    <option value="PASAPORTE">Pasaporte</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>Número Documento</label>
                  <input
                    type="text"
                    value={formData.document_number}
                    onChange={e => setFormData({ ...formData, document_number: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: '600' }}>Dirección / Domicilio</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '15px' }}>
                <button type="button" onClick={handleCloseModal} className="btn btn-secondary">Cancelar</button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? 'Guardando...' : 'Guardar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Importar Copia de WhatsApp / Archivo .txt / .db */}
      {isImportModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsImportModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '580px' }}>
            <h2 style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px', color: '#25D366' }}>
              <FileText size={22} /> Importar Copia de WhatsApp
            </h2>

            {/* Instruction Guide Box */}
            <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '10px', padding: '14px 16px', marginBottom: '18px' }}>
              <h4 style={{ margin: '0 0 8px', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                <Phone size={16} /> ¿Dónde encontrar el archivo en tu celular?
              </h4>
              <div style={{ fontSize: '13px', lineHeight: '1.5', color: 'var(--text-primary)' }}>
                <p style={{ margin: '0 0 10px' }}>
                  <strong>📱 Opción 1: Copia de Seguridad Local (Android)</strong><br />
                  Abre el explorador de archivos de tu celular y navega hasta:<br />
                  <code style={{ background: 'var(--border-color)', padding: '3px 6px', borderRadius: '4px', fontSize: '12px', wordBreak: 'break-all', display: 'inline-block', marginTop: '3px' }}>
                    Almacenamiento Interno &gt; Android &gt; media &gt; com.whatsapp &gt; WhatsApp &gt; Databases
                  </code><br />
                  Selecciona el archivo <strong>msgstore.db.crypt14</strong> (o <strong>msgstore.db</strong>).
                </p>
                <p style={{ margin: 0 }}>
                  <strong>💬 Opción 2: Exportar Chat individual (.txt)</strong><br />
                  En tu celular: Abre WhatsApp &gt; Entra a un chat &gt; Toca los 3 puntos (arriba a la derecha) &gt; <strong>Más</strong> &gt; <strong>Exportar chat</strong> &gt; <strong>Sin archivos multimedia</strong>.
                </p>
              </div>
            </div>

            {importError && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444', marginBottom: '15px', fontSize: '14px' }}>
                {importError}
              </div>
            )}

            <form onSubmit={handleUploadWaFile} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                  1. Archivo de copia (msgstore.db.crypt14, msgstore.db o .txt) *
                </label>
                <input
                  type="file"
                  accept=".txt,.db,.crypt14,.crypt15,.crypt12,.csv,.json"
                  required
                  onChange={e => setSelectedWaFile(e.target.files[0] || null)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '2px dashed var(--border-color)',
                    background: 'var(--bg-card)',
                    cursor: 'pointer'
                  }}
                />
              </div>

              {selectedWaFile && (
                <div style={{ fontSize: '13px', color: '#10b981', fontWeight: '600' }}>
                  ✓ Archivo de copia: {selectedWaFile.name} ({(selectedWaFile.size / 1024).toFixed(1)} KB)
                </div>
              )}

              {/* Optional Key File Input */}
              <div style={{ marginTop: '5px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                  2. Archivo Key de WhatsApp (Requerido para desencriptar .crypt14 / .crypt15)
                </label>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Sube el archivo <code>key</code> (de 158 bytes) extraído de tu celular para descifrar todo el historial automáticamente.
                </div>
                <input
                  type="file"
                  onChange={e => setSelectedKeyFile(e.target.files[0] || null)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-card)',
                    cursor: 'pointer'
                  }}
                />
              </div>

              {selectedKeyFile && (
                <div style={{ fontSize: '13px', color: '#8b5cf6', fontWeight: '600' }}>
                  🔑 Clave privada vinculada: {selectedKeyFile.name} ({selectedKeyFile.size} bytes)
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsImportModalOpen(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={importingFile || !selectedWaFile}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#25D366', color: '#fff', border: 'none' }}
                >
                  <Upload size={16} className={importingFile ? 'spin' : ''} />
                  {importingFile ? 'Importando & Procesando IA...' : 'Comenzar Importación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
