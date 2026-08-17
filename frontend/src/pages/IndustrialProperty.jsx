import React, { useState, useEffect } from 'react'
import { 
  ShieldCheck, 
  Search, 
  Building2, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ExternalLink, 
  Eye, 
  RefreshCw, 
  Sparkles,
  Info,
  X,
  FileCheck,
  AlertTriangle,
  Calendar,
  Award,
  Star,
  Trash2,
  Image as ImageIcon,
  Link as LinkIcon,
  Check,
  UploadCloud
} from 'lucide-react'

export default function IndustrialProperty() {
  // Main Tab State: 'consultas' | 'tramites'
  const [activeTab, setActiveTab] = useState('consultas')
  
  // Sub-tab inside Consultas: 'monitored' | 'denominacion' | 'titular' | 'notificaciones'
  const [consultSubTab, setConsultSubTab] = useState('monitored')

  // Form inputs
  const [denominacion, setDenominacion] = useState('')
  const [cuit, setCuit] = useState('')
  const [titular, setTitular] = useState('')
  const [fechaInicial, setFechaInicial] = useState('')
  const [fechaFinal, setFechaFinal] = useState('')
  const [expediente, setExpediente] = useState('')

  // Monitored trademarks state
  const [monitoredList, setMonitoredList] = useState([])
  const [loadingMonitored, setLoadingMonitored] = useState(false)
  const [syncingAll, setSyncingAll] = useState(false)

  // Filter state for search results
  const [selectedClase, setSelectedClase] = useState('ALL')

  // Query state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  
  // Detail Modal & Image Modal state
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [imageModalItem, setImageModalItem] = useState(null)
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [savingImage, setSavingImage] = useState(false)

  // Load monitored trademarks list on mount
  useEffect(() => {
    fetchMonitoredTrademarks()
  }, [])

  const fetchMonitoredTrademarks = async () => {
    setLoadingMonitored(true)
    try {
      const res = await fetch('/api/inpi/monitored')
      const result = await res.json()
      if (res.ok && result.success) {
        setMonitoredList(result.results || [])
      }
    } catch (err) {
      console.error("Error cargando marcas monitoreadas:", err)
    } finally {
      setLoadingMonitored(false)
    }
  }

  // Toggle monitoring for a marca
  const handleAddToMonitored = async (item) => {
    try {
      const res = await fetch('/api/inpi/monitored', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      })
      const result = await res.json()
      if (res.ok && result.success) {
        fetchMonitoredTrademarks()
      } else {
        alert("Error al agregar marca: " + (result.detail || result.message))
      }
    } catch (err) {
      alert("Error de conexión: " + err.message)
    }
  }

  const handleRemoveFromMonitored = async (acta) => {
    if (!window.confirm(`¿Seguro que deseas quitar la marca Acta ${acta} del seguimiento diario?`)) return
    try {
      const res = await fetch(`/api/inpi/monitored/${acta}`, { method: 'DELETE' })
      if (res.ok) {
        fetchMonitoredTrademarks()
      }
    } catch (err) {
      alert("Error al eliminar: " + err.message)
    }
  }

  const handleSyncAllMonitored = async () => {
    setSyncingAll(true)
    try {
      const res = await fetch('/api/inpi/monitored/sync', { method: 'POST' })
      const result = await res.json()
      if (res.ok && result.success) {
        alert(`Sincronización finalizada: ${result.message}`)
        fetchMonitoredTrademarks()
      } else {
        alert("Error al sincronizar: " + (result.detail || result.message))
      }
    } catch (err) {
      alert("Error en sincronización: " + err.message)
    } finally {
      setSyncingAll(false)
    }
  }

  const normalizeImageString = (str) => {
    if (!str) return ''
    const trimmed = str.trim()
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/')) {
      return trimmed
    }
    if (trimmed.startsWith('/9j/')) {
      return `data:image/jpeg;base64,${trimmed}`
    } else if (trimmed.startsWith('iVBORw')) {
      return `data:image/png;base64,${trimmed}`
    } else if (trimmed.startsWith('PHN2')) {
      return `data:image/svg+xml;base64,${trimmed}`
    } else if (trimmed.length > 30 && !trimmed.includes(' ')) {
      return `data:image/jpeg;base64,${trimmed}`
    }
    return trimmed
  }

  const handleSaveLogoImage = async () => {
    if (!imageModalItem) return
    setSavingImage(true)
    const finalImage = normalizeImageString(imageUrlInput)
    try {
      const res = await fetch(`/api/inpi/monitored/${imageModalItem.acta}/image`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: finalImage })
      })
      if (res.ok) {
        setImageModalItem(null)
        setImageUrlInput('')
        fetchMonitoredTrademarks()
      } else {
        alert("Error al guardar la imagen")
      }
    } catch (err) {
      alert("Error al guardar imagen: " + err.message)
    } finally {
      setSavingImage(false)
    }
  }

  const handleLocalFileUpload = (e) => {
    const file = e.target.files && e.target.files[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("La imagen no debe superar los 5MB")
        return
      }
      const reader = new FileReader()
      reader.onload = (evt) => {
        setImageUrlInput(evt.target.result)
      }
      reader.readAsDataURL(file)
    }
  }

  // 1. Search by Denominacion
  const handleSearchDenominacion = async (e) => {
    if (e) e.preventDefault()
    if (!denominacion.trim()) return

    setLoading(true)
    setError(null)
    setData(null)

    try {
      const res = await fetch(`/api/inpi/consulta-denominacion?denominacion=${encodeURIComponent(denominacion.trim())}`)
      const result = await res.json()
      if (res.ok && result.success) {
        setData(result)
      } else {
        setError(result.detail || 'Error al consultar denominación en el INPI')
      }
    } catch (err) {
      setError('Error de conexión con el backend: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // 2. Search by CUIT / Titular
  const handleSearchTitular = async (e) => {
    if (e) e.preventDefault()
    if (!cuit.trim() && !titular.trim()) return

    setLoading(true)
    setError(null)
    setData(null)

    try {
      const params = new URLSearchParams()
      if (cuit.trim()) params.append('cuit', cuit.trim())
      if (titular.trim()) params.append('titular', titular.trim())

      const res = await fetch(`/api/inpi/consulta-cuit-titular?${params.toString()}`)
      const result = await res.json()
      if (res.ok && result.success) {
        setData(result)
      } else {
        setError(result.detail || 'Error al consultar titular en el INPI')
      }
    } catch (err) {
      setError('Error de conexión con el backend: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // 3. Search Notificaciones
  const handleSearchNotificaciones = async (e) => {
    if (e) e.preventDefault()

    setLoading(true)
    setError(null)
    setData(null)

    try {
      const params = new URLSearchParams()
      if (fechaInicial) params.append('fecha_inicial', fechaInicial)
      if (fechaFinal) params.append('fecha_final', fechaFinal)
      if (expediente) params.append('expediente', expediente)

      const res = await fetch(`/api/inpi/consulta-notificaciones?${params.toString()}`)
      const result = await res.json()
      if (res.ok && result.success) {
        setData(result)
      } else {
        setError(result.detail || 'Error al consultar notificaciones en el INPI')
      }
    } catch (err) {
      setError('Error de conexión con el backend: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Quick preset search helper
  const triggerExampleSearch = (term) => {
    setConsultSubTab('denominacion')
    setDenominacion(term)
    setLoading(true)
    setError(null)
    fetch(`/api/inpi/consulta-denominacion?denominacion=${encodeURIComponent(term)}`)
      .then(res => res.json())
      .then(result => {
        if (result.success) setData(result)
        else setError(result.detail)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  // Filtered results by Clase
  const getFilteredResults = () => {
    if (!data || !data.results) return []
    if (selectedClase === 'ALL') return data.results
    return data.results.filter(r => String(r.Clase) === String(selectedClase))
  }

  const filteredResults = getFilteredResults()
  const monitoredActas = monitoredList.map(m => String(m.acta))

  // Format status badge helper
  const renderStatusBadge = (estado) => {
    const code = (estado || '').trim().toUpperCase()
    if (code === 'C' || code.includes('CONCEDIDA') || code.includes('REGISTRADA')) {
      return (
        <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <CheckCircle2 size={12} /> Concedida
        </span>
      )
    } else if (code === 'T' || code.includes('TRAMITE') || code.includes('EXAMEN') || code.includes('PENDIENTE')) {
      return (
        <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Clock size={12} /> En Trámite ({code})
        </span>
      )
    } else if (code === 'D' || code === 'R' || code.includes('DENEGADA') || code.includes('DESISTIDA')) {
      return (
        <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <AlertCircle size={12} /> Desestimada ({code})
        </span>
      )
    }
    return <span className="badge badge-secondary">{estado || 'N/A'}</span>
  }

  // Format DJUMT Badge helper
  const renderDjumtBadge = (item) => {
    const requiere = item.requiere_djumt
    if (!requiere) {
      return <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>No requiere</span>
    }

    const code = item.djumt_codigo
    if (code === 'PRESENTAR_AHORA') {
      return (
        <span className="badge badge-warning" style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '4px',
          backgroundColor: 'rgba(245, 158, 11, 0.15)',
          color: '#d97706',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          fontWeight: 700
        }} title={item.djumt_mensaje}>
          <AlertTriangle size={13} /> Presentar DJUMT Ahora
        </span>
      )
    } else if (code === 'EN_MORA') {
      return (
        <span className="badge badge-danger" style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '4px',
          fontWeight: 700
        }} title={item.djumt_mensaje}>
          <AlertCircle size={13} /> DJUMT Vencida (En Mora)
        </span>
      )
    } else if (code === 'PENDIENTE') {
      return (
        <span className="badge badge-blue" style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '4px',
          fontSize: '0.75rem'
        }} title={item.djumt_mensaje}>
          <Clock size={12} /> Vigente (Próx: {item.fecha_limite_djumt_inicio})
        </span>
      )
    }
    return <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>-</span>
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* Header Banner */}
      <div className="card" style={{ 
        padding: '24px 30px', 
        marginBottom: '24px',
        background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(124, 58, 237, 0.08) 100%)',
        border: '1px solid rgba(37, 99, 235, 0.2)',
        borderRadius: '12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '12px',
            backgroundColor: 'var(--accent-blue)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 8px 16px rgba(37, 99, 235, 0.25)'
          }}>
            <ShieldCheck size={30} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700 }}>Propiedad Industrial</h1>
              <span className="badge badge-blue" style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: '12px' }}>
                INPI Argentina
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Seguimiento diario de marcas, resoluciones, logotipos y control de **Declaración Jurada de Medio Término (DJUMT)**
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <a 
            href="https://portaltramites.inpi.gob.ar/marcasconsultas/busqueda" 
            target="_blank" 
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <span>Portal Oficial INPI</span>
            <ExternalLink size={14} />
          </a>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '12px', 
        borderBottom: '2px solid var(--border-color)', 
        marginBottom: '24px',
        paddingBottom: '2px'
      }}>
        <button
          onClick={() => setActiveTab('consultas')}
          style={{
            padding: '12px 20px',
            fontSize: '0.95rem',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'consultas' ? '3px solid var(--accent-blue)' : '3px solid transparent',
            color: activeTab === 'consultas' ? 'var(--accent-blue)' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s'
          }}
        >
          <Search size={18} />
          <span>Consultas y Seguimiento de Marcas</span>
        </button>

        <button
          onClick={() => setActiveTab('tramites')}
          style={{
            padding: '12px 20px',
            fontSize: '0.95rem',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'tramites' ? '3px solid var(--accent-blue)' : '3px solid transparent',
            color: activeTab === 'tramites' ? 'var(--accent-blue)' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            opacity: 0.8,
            transition: 'all 0.2s'
          }}
        >
          <FileCheck size={18} />
          <span>Ingresos y Trámites</span>
          <span className="badge badge-purple" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>Próximamente</span>
        </button>
      </div>

      {/* TAB CONTENT: INGRESOS Y TRAMITES (PROXIMAMENTE) */}
      {activeTab === 'tramites' && (
        <div className="card" style={{ padding: '40px', textAlign: 'center', backgroundColor: 'var(--bg-card)' }}>
          <div style={{ 
            width: '64px', 
            height: '64px', 
            borderRadius: '50%', 
            backgroundColor: 'rgba(124, 58, 237, 0.1)', 
            color: '#8b5cf6', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            margin: '0 auto 16px auto'
          }}>
            <Sparkles size={32} />
          </div>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>Módulo de Ingresos y Trámites del INPI</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto 24px auto', lineHeight: '1.6' }}>
            Este espacio estará destinado a la presentación directa y renovación de solicitudes de <strong>Marcas Nuevas</strong>, 
            <strong> Renovaciones</strong>, <strong>Modelos y Diseños Industriales</strong>, y <strong>Patentes de Invención</strong>.
          </p>
          <div style={{
            display: 'inline-flex',
            gap: '12px',
            padding: '12px 20px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-dark)',
            border: '1px solid var(--border-color)',
            fontSize: '0.85rem',
            color: 'var(--text-secondary)'
          }}>
            <Info size={16} style={{ color: 'var(--accent-blue)', minWidth: 16 }} />
            <span>Módulo planificado para la siguiente etapa de integración SOAP. Por el momento podés realizar todas tus consultas y seguimiento en la pestaña <strong>Consultas</strong>.</span>
          </div>
        </div>
      )}

      {/* TAB CONTENT: CONSULTAS */}
      {activeTab === 'consultas' && (
        <div>
          
          {/* Sub-tabs Selector */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '10px',
            marginBottom: '20px'
          }}>
            <button
              className={`btn ${consultSubTab === 'monitored' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setConsultSubTab('monitored'); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem' }}
            >
              <Star size={16} style={{ color: consultSubTab === 'monitored' ? '#fff' : '#f59e0b', fill: consultSubTab === 'monitored' ? '#fff' : '#f59e0b' }} />
              <span>⭐ Marcas en Seguimiento ({monitoredList.length})</span>
            </button>

            <button
              className={`btn ${consultSubTab === 'denominacion' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setConsultSubTab('denominacion'); setData(null); setError(null); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem' }}
            >
              <Search size={16} />
              <span>Por Denominación</span>
            </button>

            <button
              className={`btn ${consultSubTab === 'titular' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setConsultSubTab('titular'); setData(null); setError(null); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem' }}
            >
              <Building2 size={16} />
              <span>Por CUIT / Titular</span>
            </button>

            <button
              className={`btn ${consultSubTab === 'notificaciones' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setConsultSubTab('notificaciones'); setData(null); setError(null); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem' }}
            >
              <FileText size={16} />
              <span>Boletín / Notificaciones</span>
            </button>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* SUB-TAB 1: MIS MARCAS EN SEGUIMIENTO (PORTAFOLIO)             */}
          {/* ------------------------------------------------------------- */}
          {consultSubTab === 'monitored' && (
            <div>
              {/* Monitored Header Actions */}
              <div className="card" style={{ padding: '20px 24px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Star size={20} style={{ color: '#f59e0b', fill: '#f59e0b' }} />
                    <span>Portafolio de Marcas en Seguimiento Diario</span>
                  </h3>
                  <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    Marcas guardadas para monitoreo constante de estado, resoluciones y fechas límites de DJUMT.
                  </p>
                </div>

                <button 
                  className="btn btn-secondary" 
                  onClick={handleSyncAllMonitored} 
                  disabled={syncingAll || monitoredList.length === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <RefreshCw size={16} className={syncingAll ? 'animate-spin' : ''} />
                  <span>{syncingAll ? 'Sincronizando con INPI...' : 'Sincronizar Todo Ahora'}</span>
                </button>
              </div>

              {/* Monitored List */}
              {loadingMonitored ? (
                <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--accent-blue)', marginBottom: '12px' }} />
                  <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Cargando portafolio de marcas...</p>
                </div>
              ) : monitoredList.length === 0 ? (
                <div className="card" style={{ padding: '48px 24px', textAlign: 'center', backgroundColor: 'var(--bg-card)' }}>
                  <Star size={48} style={{ color: '#f59e0b', opacity: 0.4, marginBottom: '16px' }} />
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Aún no tenés marcas agregadas al seguimiento</h3>
                  <p style={{ color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto 20px auto', fontSize: '0.9rem' }}>
                    Buscá tus marcas por CUIT o Denominación en los buscadores y hacé clic en el botón <strong>"⭐ Agregar a Seguimiento"</strong> para guardarlas y monitorearlas diariamente.
                  </p>
                  <button className="btn btn-primary" onClick={() => setConsultSubTab('titular')}>
                    <Search size={16} />
                    <span>Buscar mis Marcas por CUIT</span>
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
                  {monitoredList.map((item) => (
                    <div key={item.acta} className="card" style={{ 
                      padding: '20px', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      justifyContent: 'space-between',
                      border: item.djumt_codigo === 'PRESENTAR_AHORA' ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid var(--border-color)',
                      boxShadow: item.djumt_codigo === 'PRESENTAR_AHORA' ? '0 0 12px rgba(245, 158, 11, 0.15)' : 'none'
                    }}>
                      <div>
                        {/* Top info header: Logo thumbnail or Placeholder */}
                        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', marginBottom: '14px' }}>
                          <div 
                            onClick={() => { setImageModalItem(item); setImageUrlInput(item.image_url || ''); }}
                            title="Hacé clic para cargar o cambiar la imagen del logo"
                            style={{
                              width: '64px',
                              height: '64px',
                              borderRadius: '8px',
                              backgroundColor: 'var(--bg-dark)',
                              border: '1px dashed var(--border-color)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              overflow: 'hidden',
                              flexShrink: 0
                            }}
                          >
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.denominacion} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            ) : (
                              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '4px' }}>
                                <ImageIcon size={20} />
                                <span style={{ display: 'block', fontSize: '0.65rem', marginTop: '2px' }}>Cargar Logo</span>
                              </div>
                            )}
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--accent-blue)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {item.denominacion}
                              </h4>
                              <button 
                                className="btn-icon" 
                                style={{ color: 'var(--accent-red)', padding: '2px' }} 
                                onClick={() => handleRemoveFromMonitored(item.acta)}
                                title="Quitar de seguimiento"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>

                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Acta #{item.acta}</span>
                              {item.clase && <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>Clase {item.clase}</span>}
                              {item.tipo_marca && <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>({item.tipo_marca})</span>}
                            </div>
                          </div>
                        </div>

                        {/* Status Badges */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Estado INPI:</span>
                            {renderStatusBadge(item.estado)}
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Nº Resolución:</span>
                            <span style={{ fontWeight: 600 }}>{item.numero_resolucion ? `Res. ${item.numero_resolucion}` : 'En Trámite'}</span>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Concesión Est.:</span>
                            <span>{item.fecha_concesion_estimada || 'N/A'}</span>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Vencimiento (10 años):</span>
                            <span style={{ fontWeight: 600 }}>{item.fecha_vencimiento_10anos || 'N/A'}</span>
                          </div>

                          {/* DJUMT Alert Box */}
                          <div style={{ marginTop: '4px' }}>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>Estado Declaración Jurada (DJUMT):</span>
                            {renderDjumtBadge(item)}
                          </div>
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div style={{ display: 'flex', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                        <a
                          href="https://portaltramites.inpi.gob.ar/marcasconsultas/busqueda"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary"
                          style={{ flex: 1, fontSize: '0.8rem', padding: '6px 10px', justifyContent: 'center' }}
                        >
                          <ExternalLink size={14} />
                          <span>Ver en Portal INPI</span>
                        </a>

                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                          onClick={() => setSelectedRecord(item)}
                          title="Ficha completa"
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* SEARCH FORMS (DENOMINACION, TITULAR, NOTIFICACIONES)           */}
          {/* ------------------------------------------------------------- */}
          {consultSubTab !== 'monitored' && (
            <div>
              {/* Search Form Card */}
              <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                
                {/* 1. Denominacion Form */}
                {consultSubTab === 'denominacion' && (
                  <form onSubmit={handleSearchDenominacion}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '0.9rem' }}>
                      Nombre de la marca o denominación a verificar:
                    </label>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '280px', position: 'relative' }}>
                        <input
                          type="text"
                          className="input"
                          placeholder="Ej: MANZANA, MERCADO, SPEED, etc..."
                          value={denominacion}
                          onChange={(e) => setDenominacion(e.target.value)}
                          style={{ width: '100%', paddingLeft: '38px' }}
                        />
                        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      </div>
                      <button type="submit" className="btn btn-primary" disabled={loading || !denominacion.trim()}>
                        {loading ? (
                          <>
                            <RefreshCw size={16} className="animate-spin" />
                            <span>Consultando INPI...</span>
                          </>
                        ) : (
                          <>
                            <Search size={16} />
                            <span>Buscar Marca</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Example pills */}
                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      <span>Sugerencias rápidas:</span>
                      {['MANZANA', 'SPEED', 'NOVA', 'ECO'].map(term => (
                        <button
                          key={term}
                          type="button"
                          onClick={() => triggerExampleSearch(term)}
                          style={{
                            background: 'var(--bg-dark)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  </form>
                )}

                {/* 2. Titular / CUIT Form */}
                {consultSubTab === 'titular' && (
                  <form onSubmit={handleSearchTitular}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.9rem' }}>
                          CUIT del Titular (Solo números):
                        </label>
                        <input
                          type="text"
                          className="input"
                          placeholder="Ej: 20313832482"
                          value={cuit}
                          onChange={(e) => setCuit(e.target.value)}
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.9rem' }}>
                          Nombre o Razón Social del Titular:
                        </label>
                        <input
                          type="text"
                          className="input"
                          placeholder="Ej: GENTILI FRANCO..."
                          value={titular}
                          onChange={(e) => setTitular(e.target.value)}
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={loading || (!cuit.trim() && !titular.trim())}>
                      {loading ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" />
                          <span>Consultando...</span>
                        </>
                      ) : (
                        <>
                          <Building2 size={16} />
                          <span>Buscar Marcas del Titular</span>
                        </>
                      )}
                    </button>
                  </form>
                )}

                {/* 3. Notificaciones Form */}
                {consultSubTab === 'notificaciones' && (
                  <form onSubmit={handleSearchNotificaciones}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                          Fecha Inicial:
                        </label>
                        <input
                          type="date"
                          className="input"
                          value={fechaInicial}
                          onChange={(e) => setFechaInicial(e.target.value)}
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                          Fecha Final:
                        </label>
                        <input
                          type="date"
                          className="input"
                          value={fechaFinal}
                          onChange={(e) => setFechaFinal(e.target.value)}
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                          Nº de Expediente / Acta:
                        </label>
                        <input
                          type="text"
                          className="input"
                          placeholder="Ej: 3853395"
                          value={expediente}
                          onChange={(e) => setExpediente(e.target.value)}
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" />
                          <span>Consultando Boletín...</span>
                        </>
                      ) : (
                        <>
                          <FileText size={16} />
                          <span>Buscar Notificaciones</span>
                        </>
                      )}
                    </button>
                  </form>
                )}

              </div>

              {/* Error Message */}
              {error && (
                <div className="card" style={{ padding: '16px 20px', marginBottom: '24px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <AlertCircle size={20} style={{ minWidth: 20 }} />
                  <div>
                    <strong style={{ display: 'block' }}>Atención</strong>
                    <span style={{ fontSize: '0.9rem' }}>{error}</span>
                  </div>
                </div>
              )}

              {/* Results Summary and Grid */}
              {data && (
                <div>
                  {/* Summary Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                    <div className="card" style={{ padding: '16px 20px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Total Registros Encontrados</span>
                      <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '4px', color: 'var(--accent-blue)' }}>
                        {data.total || (data.results ? data.results.length : 0)}
                      </div>
                    </div>

                    {data.estado && (
                      <div className="card" style={{ padding: '16px 20px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Estado de Disponibilidad</span>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '6px', color: data.estado.toLowerCase().includes('disponible') ? 'var(--accent-emerald)' : 'var(--accent-red)' }}>
                          {data.estado}
                        </div>
                      </div>
                    )}

                    {/* Class Filter Dropdown */}
                    {consultSubTab !== 'notificaciones' && data.results && data.results.length > 0 && (
                      <div className="card" style={{ padding: '16px 20px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Filtrar por Clase Niza</span>
                        <select
                          className="input"
                          value={selectedClase}
                          onChange={(e) => setSelectedClase(e.target.value)}
                          style={{ marginTop: '6px', width: '100%', padding: '6px 10px', fontSize: '0.85rem' }}
                        >
                          <option value="ALL">Todas las Clases ({data.results.length})</option>
                          {Array.from(new Set(data.results.map(r => r.Clase))).filter(Boolean).sort((a,b) => a - b).map(claseNum => (
                            <option key={claseNum} value={claseNum}>Clase {claseNum}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Data Table */}
                  <div className="card" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Resultados del Servicio Web INPI</h3>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Mostrando {filteredResults.length} registro(s)
                      </span>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                        <thead>
                          <tr style={{ backgroundColor: 'var(--bg-dark)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                            <th style={{ padding: '12px 16px' }}>Acta / N°</th>
                            <th style={{ padding: '12px 16px' }}>Denominación / Marca</th>
                            <th style={{ padding: '12px 16px' }}>Clase</th>
                            <th style={{ padding: '12px 16px' }}>Nº Resolución</th>
                            <th style={{ padding: '12px 16px' }}>Estado</th>
                            <th style={{ padding: '12px 16px' }}>Declaración Jurada (DJUMT)</th>
                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredResults.length === 0 ? (
                            <tr>
                              <td colSpan="7" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                No se encontraron registros para la consulta ingresada.
                              </td>
                            </tr>
                          ) : (
                            filteredResults.map((item, idx) => {
                              const isMonitored = monitoredActas.includes(String(item.Acta))
                              return (
                                <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.15s' }}>
                                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                                    {item.Acta || item.Expediente || item.Id_Notificacion || 'N/A'}
                                  </td>
                                  <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--accent-blue)' }}>
                                    {item.Denominacion || item.NombreNotificacion || 'N/A'}
                                    {item.Tipo_Marca && <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)' }}>Tipo: {item.Tipo_Marca}</span>}
                                  </td>
                                  <td style={{ padding: '12px 16px' }}>
                                    {item.Clase ? <span className="badge badge-secondary">Clase {item.Clase}</span> : '-'}
                                  </td>
                                  <td style={{ padding: '12px 16px', fontSize: '0.85rem', fontWeight: 600 }}>
                                    {item.Numero_Resolucion ? `Res. ${item.Numero_Resolucion}` : '-'}
                                  </td>
                                  <td style={{ padding: '12px 16px' }}>
                                    {renderStatusBadge(item.Estado)}
                                  </td>
                                  <td style={{ padding: '12px 16px' }}>
                                    {renderDjumtBadge(item)}
                                  </td>
                                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                    <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                                      {item.Acta && (
                                        <button
                                          className={`btn ${isMonitored ? 'btn-secondary' : 'btn-primary'}`}
                                          style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                          onClick={() => isMonitored ? handleRemoveFromMonitored(item.Acta) : handleAddToMonitored(item)}
                                          title={isMonitored ? "Quitar de seguimiento" : "Agregar a marcas en seguimiento diario"}
                                        >
                                          <Star size={14} style={{ color: isMonitored ? '#f59e0b' : '#fff', fill: isMonitored ? '#f59e0b' : 'none' }} />
                                          <span>{isMonitored ? 'En Seguimiento' : '+ Seguimiento'}</span>
                                        </button>
                                      )}

                                      <button 
                                        className="btn-icon" 
                                        onClick={() => setSelectedRecord(item)}
                                        title="Ver detalle legal completo"
                                      >
                                        <Eye size={18} />
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
                </div>
              )}

              {/* Initial Blank State */}
              {!data && !loading && !error && (
                <div className="card" style={{ padding: '48px 24px', textAlign: 'center', backgroundColor: 'var(--bg-card)' }}>
                  <Building2 size={48} style={{ color: 'var(--accent-blue)', opacity: 0.5, marginBottom: '16px' }} />
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Consulta de Propiedad Industrial en Tiempo Real</h3>
                  <p style={{ color: 'var(--text-secondary)', maxWidth: '540px', margin: '0 auto', fontSize: '0.9rem', lineHeight: '1.5' }}>
                    Ingresá una denominación, CUIT o datos de boletín para consultar la base de datos oficial del INPI Argentina. 
                    Podés agregar cualquier marca encontrada a tu portafolio de seguimiento diario con un solo clic.
                  </p>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* DETALLE MODAL */}
      {selectedRecord && (
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
            width: '650px',
            maxWidth: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '28px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-card)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Award size={24} style={{ color: 'var(--accent-blue)' }} />
                <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Ficha de Diagnóstico Legal e INPI</h3>
              </div>
              <button className="btn-icon" onClick={() => setSelectedRecord(null)}>
                <X size={20} />
              </button>
            </div>

            {/* Legal Status Alert inside Modal */}
            {selectedRecord.requiere_djumt && (
              <div style={{
                padding: '14px 18px',
                borderRadius: '8px',
                marginBottom: '20px',
                backgroundColor: selectedRecord.djumt_codigo === 'PRESENTAR_AHORA' ? 'rgba(245, 158, 11, 0.12)' : selectedRecord.djumt_codigo === 'EN_MORA' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(37, 99, 235, 0.12)',
                border: `1px solid ${selectedRecord.djumt_codigo === 'PRESENTAR_AHORA' ? 'rgba(245, 158, 11, 0.4)' : selectedRecord.djumt_codigo === 'EN_MORA' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(37, 99, 235, 0.4)'}`
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={18} />
                  <span>Declaración Jurada de Uso de Medio Término (DJUMT)</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.4' }}>
                  {selectedRecord.djumt_mensaje}
                </p>
              </div>
            )}

            {/* Timeline Blocks */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              <div style={{ padding: '12px', backgroundColor: 'var(--bg-dark)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={12} /> Fecha Solicitud
                </span>
                <strong style={{ fontSize: '0.95rem', display: 'block', marginTop: '4px' }}>
                  {selectedRecord.Fecha_Ingreso || selectedRecord.fecha_ingreso ? (selectedRecord.Fecha_Ingreso || selectedRecord.fecha_ingreso).replace('T', ' ').substring(0, 10) : 'N/A'}
                </strong>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--bg-dark)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Award size={12} /> Concesión Estimada
                </span>
                <strong style={{ fontSize: '0.95rem', display: 'block', marginTop: '4px', color: 'var(--accent-blue)' }}>
                  {selectedRecord.fecha_concesion_estimada || 'N/A'}
                </strong>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--bg-dark)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} /> Vencimiento 10 Años
                </span>
                <strong style={{ fontSize: '0.95rem', display: 'block', marginTop: '4px' }}>
                  {selectedRecord.fecha_vencimiento_10anos || 'N/A'}
                </strong>
              </div>
            </div>

            {/* Full Record Key-Values */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.88rem' }}>
              {Object.entries(selectedRecord).filter(([k]) => !['requiere_djumt', 'djumt_codigo', 'djumt_mensaje', 'fecha_concesion_estimada', 'fecha_limite_djumt_inicio', 'fecha_limite_djumt_fin', 'fecha_vencimiento_10anos', 'id'].includes(k)).map(([key, val]) => {
                if (key === 'image_url') {
                  return (
                    <div key={key} style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: '12px', padding: '8px 12px', backgroundColor: 'var(--bg-dark)', borderRadius: '6px', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Logo / Imagen:
                      </span>
                      <div>
                        {val ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <img src={val} alt="Logo" style={{ width: '42px', height: '42px', objectFit: 'contain', borderRadius: '4px', backgroundColor: '#fff', padding: '2px', border: '1px solid var(--border-color)' }} />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={val}>
                              {val.length > 35 ? `${val.substring(0, 35)}...` : val}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Sin Imagen</span>
                        )}
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={key} style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: '12px', padding: '8px 12px', backgroundColor: 'var(--bg-dark)', borderRadius: '6px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                      {key.replace(/_/g, ' ')}:
                    </span>
                    <span style={{ wordBreak: 'break-word', fontWeight: (key === 'Denominacion' || key === 'denominacion') ? 700 : 400 }}>
                      {val || 'N/A'}
                    </span>
                  </div>
                )
              })}
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <a
                href="https://portaltramites.inpi.gob.ar/marcasconsultas/busqueda"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem' }}
              >
                <ExternalLink size={14} />
                <span>Ver en Portal INPI</span>
              </a>

              <button className="btn btn-secondary" onClick={() => setSelectedRecord(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT/UPLOAD LOGO IMAGE MODAL */}
      {imageModalItem && (
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
            width: '500px',
            maxWidth: '100%',
            padding: '28px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-card)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ImageIcon size={20} style={{ color: 'var(--accent-blue)' }} />
                <span>Cargar Logo de Marca ({imageModalItem.denominacion})</span>
              </h3>
              <button className="btn-icon" onClick={() => setImageModalItem(null)}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Pegá la <strong>URL de la imagen</strong>, la cadena <strong>Base64</strong> (ej: <code>data:image/jpg;base64,...</code>) o elegí un archivo de tu equipo:
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                URL o Cadena Base64 del Logo:
              </label>
              <textarea
                className="input"
                rows={3}
                placeholder="https://... o data:image/jpg;base64,... o código base64 directo"
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                O Subir Imagen desde tu PC:
              </label>
              <label className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                <UploadCloud size={16} />
                <span>Seleccionar Archivo de Imagen...</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLocalFileUpload}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            {/* Image Preview */}
            {imageUrlInput.trim() && (
              <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Vista previa del Logo:</span>
                <div style={{ width: '140px', height: '140px', margin: '0 auto', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px', backgroundColor: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={normalizeImageString(imageUrlInput)} alt="Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none'; }} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-secondary" onClick={() => setImageModalItem(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={handleSaveLogoImage} disabled={savingImage}>
                {savingImage ? 'Guardando...' : 'Guardar Logo'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
