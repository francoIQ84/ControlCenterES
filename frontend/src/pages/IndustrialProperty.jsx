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
  UploadCloud,
  Lightbulb,
  Cpu,
  Palette,
  Plus,
  Edit3,
  Layers,
  Filter,
  Globe,
  BookOpen,
  ArrowRight,
  Loader2
} from 'lucide-react'

// Clasificación Internacional de Patentes (CIP / IPC)
const CIP_SECTIONS = [
  { code: 'A', name: 'Necesidades Corrientes de la Vida', desc: 'Agricultura, alimentación, tabaco, artículos personales o domésticos, salud, salvamento, recreo.' },
  { code: 'B', name: 'Técnicas Industriales Diversas; Transportes', desc: 'Separación, mezcla, conformado, moldeo, impresión, vehículos, ferrocarriles, aviación, embalaje.' },
  { code: 'C', name: 'Química; Metalurgia', desc: 'Tratamiento de aguas, compuestos orgánicos e inorgánicos, vidrio, cemento, metalurgia, aleaciones.' },
  { code: 'D', name: 'Textiles; Papel', desc: 'Fibras naturales o sintéticas, hilado, tejeduría, cueros, fabricación de papel y cartón.' },
  { code: 'E', name: 'Construcciones Fijas', desc: 'Edificación, cerrajería, obras públicas, minería, perforación de suelos y pozos.' },
  { code: 'F', name: 'Mecánica; Iluminación; Calefacción; Armamento', desc: 'Motores, bombas, turbinas, ingeniería en general, armas, municiones, voladura.' },
  { code: 'G', name: 'Física', desc: 'Instrumentos, óptica, fotografía, cálculo, computación, señalización, energía nuclear.' },
  { code: 'H', name: 'Electricidad', desc: 'Elementos básicos, circuitos, generación, conversión, distribución, técnica de comunicaciones.' }
]

// Clasificación Internacional de Dibujos y Modelos Industriales (Arreglo de Locarno)
const LOCARNO_POPULAR_CLASSES = [
  { classNum: '06', title: 'Muebles y artículos de decoración', examples: 'Sillas, mesas, camas, estanterías, lámparas' },
  { classNum: '09', title: 'Envases, embalajes y recipientes', examples: 'Botellas, frascos, cajas, latas, dispensers' },
  { classNum: '02', title: 'Artículos de vestimenta y mercería', examples: 'Prendas, calzados, botones, corbatas' },
  { classNum: '12', title: 'Medios de transporte y elevación', examples: 'Vehículos terrestres, náuticos, accesorios de auto' },
  { classNum: '14', title: 'Equipos de grabación, telecomunicación y datos', examples: 'Teléfonos, pantallas, carcasas de equipos' },
  { classNum: '15', title: 'Máquinas no especificadas en otras clases', examples: 'Maquinaria industrial, motores, herramientas' },
  { classNum: '21', title: 'Juegos, juguetes, tiendas y artículos de deporte', examples: 'Juguetes infantiles, artículos de gimnasio' },
  { classNum: '28', title: 'Productos farmacéuticos y cosméticos, tocador', examples: 'Aplicadores cosméticos, envases de perfume' }
]

export default function IndustrialProperty() {
  // Main Tab State: 'consultas' | 'tramites'
  const [activeTab, setActiveTab] = useState('consultas')
  
  // Sub-tab inside Consultas: 'monitored' | 'denominacion' | 'patentes' | 'disenos' | 'titular' | 'notificaciones'
  const [consultSubTab, setConsultSubTab] = useState('monitored')

  // Asset type filter for Portafolio: 'ALL' | 'marca' | 'patente' | 'modelo_utilidad' | 'diseno_industrial'
  const [assetTypeFilter, setAssetTypeFilter] = useState('ALL')

  // Portfolio stats summary
  const [stats, setStats] = useState({
    total: 0,
    marcas: 0,
    patentes: 0,
    modelos_utilidad: 0,
    disenos_industriales: 0,
    alertas_urgentes: 0
  })

  // Form inputs for Online Search (Marcas SOAP)
  const [denominacion, setDenominacion] = useState('')
  const [cuit, setCuit] = useState('')
  const [titular, setTitular] = useState('')
  const [fechaInicial, setFechaInicial] = useState('')
  const [fechaFinal, setFechaFinal] = useState('')
  const [expediente, setExpediente] = useState('')

  // Patent & Model Search state
  const [patentQuery, setPatentQuery] = useState('')
  const [patentApplicant, setPatentApplicant] = useState('')
  const [patentCipFilter, setPatentCipFilter] = useState('')

  // Design Search state
  const [designQuery, setDesignQuery] = useState('')
  const [designDesigner, setDesignDesigner] = useState('')
  const [designLocarnoFilter, setDesignLocarnoFilter] = useState('')

  // Live Model Search from INPI state
  const [modelActaInput, setModelActaInput] = useState('')
  const [searchingModel, setSearchingModel] = useState(false)
  const [modelSearchResult, setModelSearchResult] = useState(null)
  const [modelSearchError, setModelSearchError] = useState(null)
  const [addedModelSuccess, setAddedModelSuccess] = useState(false)

  // Quick Patent Incorporate state
  const [quickPatentForm, setQuickPatentForm] = useState({
    acta: '',
    denominacion: '',
    titulares: '',
    asset_type: 'patente',
    fecha_ingreso: new Date().toISOString().substring(0, 10),
    clasificacion: ''
  })
  const [addingQuickPatent, setAddingQuickPatent] = useState(false)
  const [quickPatentSuccess, setQuickPatentSuccess] = useState(false)

  // Monitored items state
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

  // Create & Edit Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editModalItem, setEditModalItem] = useState(null)
  const [submittingAsset, setSubmittingAsset] = useState(false)

  // Initial state for new asset creation
  const defaultAssetForm = {
    asset_type: 'patente',
    acta: '',
    denominacion: '',
    titulares: '',
    cuit: '',
    subtipo: '',
    inventores_disenadores: '',
    clasificacion: '',
    fecha_ingreso: new Date().toISOString().substring(0, 10),
    fecha_concesion: '',
    estado: 'T',
    numero_resolucion: '',
    anualidades_pagadas: 0,
    quinquenio_actual: 1,
    clase: '',
    tipo_marca: 'Denominativa',
    document_url: '',
    notes: ''
  }
  const [newAssetForm, setNewAssetForm] = useState(defaultAssetForm)

  const openCreateModal = (assetType = 'patente') => {
    setNewAssetForm({
      ...defaultAssetForm,
      asset_type: assetType
    })
    setIsCreateModalOpen(true)
  }

  // Patent search helper URL generators
  const getEspacenetUrl = () => {
    let qParts = []
    if (patentQuery.trim()) qParts.push(patentQuery.trim())
    if (patentApplicant.trim()) qParts.push(`pa all "${patentApplicant.trim()}"`)
    if (patentCipFilter.trim()) qParts.push(`ic all "${patentCipFilter.trim()}"`)
    const qStr = qParts.length > 0 ? qParts.join(' AND ') : 'pn=AR'
    return `https://worldwide.espacenet.com/patent/search?q=${encodeURIComponent(qStr)}`
  }

  const getGooglePatentsUrl = () => {
    const q = [patentQuery.trim(), patentApplicant.trim(), patentCipFilter.trim()].filter(Boolean).join(' ')
    return q ? `https://patents.google.com/?country=AR&q=${encodeURIComponent(q)}` : 'https://patents.google.com/?country=AR'
  }

  // Load portfolio and stats on mount
  useEffect(() => {
    fetchMonitoredTrademarks()
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/inpi/stats')
      const result = await res.json()
      if (res.ok && result.success) {
        setStats(result.stats || {})
      }
    } catch (err) {
      console.error("Error al obtener estadísticas de PI:", err)
    }
  }

  const fetchMonitoredTrademarks = async () => {
    setLoadingMonitored(true)
    try {
      const res = await fetch('/api/inpi/monitored')
      const result = await res.json()
      if (res.ok && result.success) {
        setMonitoredList(result.results || [])
      }
    } catch (err) {
      console.error("Error cargando activos monitoreados:", err)
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
        fetchStats()
      } else {
        alert("Error al agregar activo: " + (result.detail || result.message))
      }
    } catch (err) {
      alert("Error de conexión: " + err.message)
    }
  }

  // Live Model Search from INPI
  const handleSearchModel = async (overrideActa = null) => {
    const targetActa = (overrideActa || modelActaInput || '').trim()
    if (!targetActa) {
      alert("Por favor ingresá un número de Acta o Expediente del Modelo.")
      return
    }

    setSearchingModel(true)
    setModelSearchError(null)
    setModelSearchResult(null)
    setAddedModelSuccess(false)

    try {
      const res = await fetch(`/api/inpi/consulta-modelo?acta=${encodeURIComponent(targetActa)}`)
      const json = await res.json()

      if (res.ok && json.success && json.result) {
        setModelSearchResult(json.result)
      } else {
        setModelSearchError(json.message || "No se encontró ningún modelo o diseño industrial con ese número en el INPI.")
      }
    } catch (err) {
      setModelSearchError("Error de comunicación con el servicio del INPI: " + err.message)
    } finally {
      setSearchingModel(false)
    }
  }

  // Add found model to Monitored Assets with 1 click
  const handleAddFoundModel = async () => {
    if (!modelSearchResult) return
    try {
      const res = await fetch('/api/inpi/monitored', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modelSearchResult)
      })
      const result = await res.json()
      if (res.ok && result.success) {
        setAddedModelSuccess(true)
        fetchMonitoredTrademarks()
        fetchStats()
      } else {
        alert("Error al incorporar modelo: " + (result.detail || result.message))
      }
    } catch (err) {
      alert("Error de conexión: " + err.message)
    }
  }

  // Quick incorporate patent / utility model
  const handleAddQuickPatent = async (e) => {
    if (e) e.preventDefault()
    if (!quickPatentForm.acta.trim() || !quickPatentForm.denominacion.trim()) {
      alert("Por favor ingresá al menos el Número de Solicitud/Acta y el Título de la invención.")
      return
    }

    setAddingQuickPatent(true)
    setQuickPatentSuccess(false)
    try {
      const res = await fetch('/api/inpi/monitored', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quickPatentForm)
      })
      const result = await res.json()
      if (res.ok && result.success) {
        setQuickPatentSuccess(true)
        fetchMonitoredTrademarks()
        fetchStats()
        setQuickPatentForm({
          acta: '',
          denominacion: '',
          titulares: '',
          asset_type: 'patente',
          fecha_ingreso: new Date().toISOString().substring(0, 10),
          clasificacion: ''
        })
      } else {
        alert("Error al incorporar al seguimiento: " + (result.detail || result.message))
      }
    } catch (err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setAddingQuickPatent(false)
    }
  }

  // Autofill INPI model data in create modal
  const handleAutofillModelInModal = async () => {
    const actaToFetch = (newAssetForm.acta || '').trim()
    if (!actaToFetch) {
      alert("Ingresá primero el número de Acta en el campo para consultar al INPI.")
      return
    }
    try {
      const res = await fetch(`/api/inpi/consulta-modelo?acta=${encodeURIComponent(actaToFetch)}`)
      const json = await res.json()
      if (res.ok && json.success && json.result) {
        const r = json.result
        setNewAssetForm(prev => ({
          ...prev,
          denominacion: r.denominacion || prev.denominacion,
          titulares: r.titulares || prev.titulares,
          clasificacion: r.clasificacion || prev.clasificacion,
          fecha_ingreso: r.fecha_ingreso ? r.fecha_ingreso.split('/').reverse().join('-') : prev.fecha_ingreso,
          fecha_concesion: r.fecha_concesion ? r.fecha_concesion.split('/').reverse().join('-') : prev.fecha_concesion,
          estado: r.estado || prev.estado,
          asset_type: 'diseno_industrial'
        }))
        alert(`¡Datos del Modelo ${actaToFetch} cargados automáticamente desde el INPI!`)
      } else {
        alert(json.message || "No se encontraron datos en INPI con ese número de acta.")
      }
    } catch (err) {
      alert("Error al consultar INPI: " + err.message)
    }
  }

  const handleRemoveFromMonitored = async (acta) => {
    if (!window.confirm(`¿Seguro que deseas quitar el activo Acta ${acta} del seguimiento diario?`)) return
    try {
      const res = await fetch(`/api/inpi/monitored/${acta}`, { method: 'DELETE' })
      if (res.ok) {
        fetchMonitoredTrademarks()
        fetchStats()
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
        fetchStats()
      } else {
        alert("Error al sincronizar: " + (result.detail || result.message))
      }
    } catch (err) {
      alert("Error en sincronización: " + err.message)
    } finally {
      setSyncingAll(false)
    }
  }

  // Quick Action: +1 Anualidad Pagada
  const handleIncrementAnnuity = async (item) => {
    const current = Number(item.anualidades_pagadas || 0)
    const maxAnnuities = item.asset_type === 'patente' ? 20 : 10
    if (current >= maxAnnuities) {
      alert(`Este activo ya completó el pago máximo de ${maxAnnuities} anualidades.`)
      return
    }
    const nextVal = current + 1
    if (!window.confirm(`¿Confirmar pago de la anualidad ${nextVal}º para "${item.denominacion || item.acta}"?`)) return

    try {
      const res = await fetch(`/api/inpi/monitored/${item.acta}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anualidades_pagadas: nextVal })
      })
      if (res.ok) {
        fetchMonitoredTrademarks()
        fetchStats()
      } else {
        const err = await res.json()
        alert("Error al actualizar anualidad: " + (err.detail || err.message))
      }
    } catch (err) {
      alert("Error de conexión: " + err.message)
    }
  }

  // Quick Action: Renovar Quinquenio
  const handleAdvanceQuinquennium = async (item) => {
    const current = Number(item.quinquenio_actual || 1)
    if (current >= 3) {
      alert("Este diseño industrial ya alcanzó el 3º y último quinquenio de vigencia máxima (15 años).")
      return
    }
    const nextVal = current + 1
    if (!window.confirm(`¿Confirmar renovación al ${nextVal}º Quinquenio para "${item.denominacion || item.acta}"?`)) return

    try {
      const res = await fetch(`/api/inpi/monitored/${item.acta}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quinquenio_actual: nextVal })
      })
      if (res.ok) {
        fetchMonitoredTrademarks()
        fetchStats()
      } else {
        const err = await res.json()
        alert("Error al renovar quinquenio: " + (err.detail || err.message))
      }
    } catch (err) {
      alert("Error de conexión: " + err.message)
    }
  }

  // Handle Save New Asset
  const handleSaveNewAsset = async (e) => {
    e.preventDefault()
    if (!newAssetForm.acta.trim() || !newAssetForm.denominacion.trim()) {
      alert("Por favor completá el Número de Expediente/Acta y el Título/Denominación.")
      return
    }

    setSubmittingAsset(true)
    try {
      const payload = {
        ...newAssetForm,
        acta: newAssetForm.acta.trim(),
        denominacion: newAssetForm.denominacion.trim(),
        titulares: newAssetForm.titulares.trim(),
        clase: newAssetForm.clase ? parseInt(newAssetForm.clase) : null,
        anualidades_pagadas: parseInt(newAssetForm.anualidades_pagadas) || 0,
        quinquenio_actual: parseInt(newAssetForm.quinquenio_actual) || 1
      }

      const res = await fetch('/api/inpi/monitored', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const result = await res.json()
      if (res.ok && result.success) {
        setIsCreateModalOpen(false)
        setNewAssetForm(defaultAssetForm)
        fetchMonitoredTrademarks()
        fetchStats()
      } else {
        alert("Error al guardar activo: " + (result.detail || result.message))
      }
    } catch (err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setSubmittingAsset(false)
    }
  }

  // Handle Save Edit Asset
  const handleSaveEditAsset = async (e) => {
    e.preventDefault()
    if (!editModalItem) return

    setSubmittingAsset(true)
    try {
      const payload = {
        denominacion: editModalItem.denominacion,
        titulares: editModalItem.titulares,
        inventores_disenadores: editModalItem.inventores_disenadores,
        clasificacion: editModalItem.clasificacion,
        estado: editModalItem.estado,
        fecha_ingreso: editModalItem.fecha_ingreso,
        fecha_concesion: editModalItem.fecha_concesion,
        numero_resolucion: editModalItem.numero_resolucion,
        anualidades_pagadas: parseInt(editModalItem.anualidades_pagadas) || 0,
        quinquenio_actual: parseInt(editModalItem.quinquenio_actual) || 1,
        document_url: editModalItem.document_url,
        notes: editModalItem.notes
      }

      const res = await fetch(`/api/inpi/monitored/${editModalItem.acta}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const result = await res.json()
      if (res.ok && result.success) {
        setEditModalItem(null)
        fetchMonitoredTrademarks()
        fetchStats()
      } else {
        alert("Error al actualizar activo: " + (result.detail || result.message))
      }
    } catch (err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setSubmittingAsset(false)
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

  // Filter monitored portfolio by selected asset type
  const filteredMonitoredList = monitoredList.filter(item => {
    if (assetTypeFilter === 'ALL') return true
    const type = item.asset_type || 'marca'
    return type === assetTypeFilter
  })

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

  // Format Asset Type Badge
  const renderAssetTypeBadge = (type) => {
    const t = (type || 'marca').toLowerCase()
    if (t === 'patente') {
      return (
        <span className="badge" style={{ backgroundColor: 'rgba(234, 179, 8, 0.15)', color: '#ca8a04', border: '1px solid rgba(234, 179, 8, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
          <Lightbulb size={12} /> Patente de Invención
        </span>
      )
    } else if (t === 'modelo_utilidad') {
      return (
        <span className="badge" style={{ backgroundColor: 'rgba(147, 51, 234, 0.15)', color: '#9333ea', border: '1px solid rgba(147, 51, 234, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
          <Cpu size={12} /> Modelo de Utilidad
        </span>
      )
    } else if (t === 'diseno_industrial') {
      return (
        <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
          <Palette size={12} /> Modelo / Diseño Industrial
        </span>
      )
    }
    return (
      <span className="badge badge-blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
        <ShieldCheck size={12} /> Marca Registrada
      </span>
    )
  }

  // Format DJUMT Badge helper for trademarks
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700 }}>Propiedad Industrial e Intelectual</h1>
              <span className="badge badge-blue" style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: '12px' }}>
                INPI Argentina
              </span>
              <span className="badge badge-secondary" style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: '12px' }}>
                Leyes 22.362, 24.481 y Dec-Ley 6673/63
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Gestión y seguimiento integral de <strong>Marcas</strong>, <strong>Patentes de Invención</strong>, <strong>Modelos de Utilidad</strong> y <strong>Diseños Industriales</strong>.
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
              <span>⭐ Mis Activos ({monitoredList.length})</span>
            </button>

            <button
              className={`btn ${consultSubTab === 'denominacion' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setConsultSubTab('denominacion'); setData(null); setError(null); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem' }}
            >
              <ShieldCheck size={16} />
              <span>🛡️ Marcas INPI (SOAP)</span>
            </button>

            <button
              className={`btn ${consultSubTab === 'patentes' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setConsultSubTab('patentes'); setData(null); setError(null); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem' }}
            >
              <Lightbulb size={16} style={{ color: consultSubTab === 'patentes' ? '#fff' : '#ca8a04' }} />
              <span>💡 Patentes y Modelos</span>
            </button>

            <button
              className={`btn ${consultSubTab === 'disenos' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setConsultSubTab('disenos'); setData(null); setError(null); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem' }}
            >
              <Palette size={16} style={{ color: consultSubTab === 'disenos' ? '#fff' : '#059669' }} />
              <span>🎨 Diseños Industriales</span>
            </button>

            <button
              className={`btn ${consultSubTab === 'titular' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setConsultSubTab('titular'); setData(null); setError(null); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem' }}
            >
              <Building2 size={16} />
              <span>🪪 Por CUIT / Titular</span>
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
          {/* SUB-TAB 1: MIS ACTIVOS EN SEGUIMIENTO (PORTAFOLIO PI)         */}
          {/* ------------------------------------------------------------- */}
          {consultSubTab === 'monitored' && (
            <div>

              {/* Stats Overview Chips */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ padding: '10px', borderRadius: '10px', backgroundColor: 'rgba(37, 99, 235, 0.1)', color: 'var(--accent-blue)' }}>
                    <Layers size={24} />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Total Activos PI</span>
                    <h3 style={{ margin: '2px 0 0 0', fontSize: '1.5rem', fontWeight: 700 }}>{stats.total || monitoredList.length}</h3>
                  </div>
                </div>

                <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #3b82f6', display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ padding: '10px', borderRadius: '10px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                    <ShieldCheck size={24} />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Marcas</span>
                    <h3 style={{ margin: '2px 0 0 0', fontSize: '1.5rem', fontWeight: 700 }}>{stats.marcas || 0}</h3>
                  </div>
                </div>

                <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #ca8a04', display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ padding: '10px', borderRadius: '10px', backgroundColor: 'rgba(234, 179, 8, 0.1)', color: '#ca8a04' }}>
                    <Lightbulb size={24} />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Patentes</span>
                    <h3 style={{ margin: '2px 0 0 0', fontSize: '1.5rem', fontWeight: 700 }}>{stats.patentes || 0}</h3>
                  </div>
                </div>

                <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #9333ea', display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ padding: '10px', borderRadius: '10px', backgroundColor: 'rgba(147, 51, 234, 0.1)', color: '#9333ea' }}>
                    <Cpu size={24} />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Modelos de Utilidad</span>
                    <h3 style={{ margin: '2px 0 0 0', fontSize: '1.5rem', fontWeight: 700 }}>{stats.modelos_utilidad || 0}</h3>
                  </div>
                </div>

                <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #059669', display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ padding: '10px', borderRadius: '10px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#059669' }}>
                    <Palette size={24} />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Diseños Industriales</span>
                    <h3 style={{ margin: '2px 0 0 0', fontSize: '1.5rem', fontWeight: 700 }}>{stats.disenos_industriales || 0}</h3>
                  </div>
                </div>

                {stats.alertas_urgentes > 0 && (
                  <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #dc2626', backgroundColor: 'rgba(239, 68, 68, 0.05)', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ padding: '10px', borderRadius: '10px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#dc2626' }}>
                      <AlertTriangle size={24} />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#dc2626', textTransform: 'uppercase', fontWeight: 700 }}>Alertas Urgentes</span>
                      <h3 style={{ margin: '2px 0 0 0', fontSize: '1.5rem', fontWeight: 700, color: '#dc2626' }}>{stats.alertas_urgentes}</h3>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Toolbar & Filters */}
              <div className="card" style={{ padding: '18px 24px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                
                {/* Filter Pills by Asset Type */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginRight: '6px' }}>
                    <Filter size={14} /> Filtrar por:
                  </span>

                  <button
                    className={`btn ${assetTypeFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: '20px' }}
                    onClick={() => setAssetTypeFilter('ALL')}
                  >
                    Todos ({monitoredList.length})
                  </button>

                  <button
                    className={`btn ${assetTypeFilter === 'marca' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: '20px' }}
                    onClick={() => setAssetTypeFilter('marca')}
                  >
                    🛡️ Marcas ({monitoredList.filter(i => (i.asset_type || 'marca') === 'marca').length})
                  </button>

                  <button
                    className={`btn ${assetTypeFilter === 'patente' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: '20px' }}
                    onClick={() => setAssetTypeFilter('patente')}
                  >
                    💡 Patentes ({monitoredList.filter(i => i.asset_type === 'patente').length})
                  </button>

                  <button
                    className={`btn ${assetTypeFilter === 'modelo_utilidad' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: '20px' }}
                    onClick={() => setAssetTypeFilter('modelo_utilidad')}
                  >
                    ⚙️ Modelos ({monitoredList.filter(i => i.asset_type === 'modelo_utilidad').length})
                  </button>

                  <button
                    className={`btn ${assetTypeFilter === 'diseno_industrial' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: '20px' }}
                    onClick={() => setAssetTypeFilter('diseno_industrial')}
                  >
                    🎨 Diseños ({monitoredList.filter(i => i.asset_type === 'diseno_industrial').length})
                  </button>
                </div>

                {/* Right Action Buttons */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      if (assetTypeFilter === 'diseno_industrial') setConsultSubTab('disenos');
                      else if (assetTypeFilter === 'patente' || assetTypeFilter === 'modelo_utilidad') setConsultSubTab('patentes');
                      else setConsultSubTab('denominacion');
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                  >
                    <Search size={16} />
                    <span>
                      {assetTypeFilter === 'diseno_industrial' ? 'Buscar y Agregar Diseño' :
                       assetTypeFilter === 'patente' || assetTypeFilter === 'modelo_utilidad' ? 'Buscar y Agregar Patente' :
                       assetTypeFilter === 'marca' ? 'Buscar y Agregar Marca' : 'Buscar y Agregar Activo'}
                    </span>
                  </button>

                  <button 
                    className="btn btn-secondary" 
                    onClick={handleSyncAllMonitored} 
                    disabled={syncingAll || monitoredList.filter(i => (i.asset_type || 'marca') === 'marca').length === 0}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
                    title="El Web Service SOAP del INPI actualiza resoluciones y trámites de marcas registradas. Las patentes y diseños se controlan por calendario legal de vigencias y anualidades."
                  >
                    <RefreshCw size={15} className={syncingAll ? 'animate-spin' : ''} />
                    <span>{syncingAll ? 'Sincronizando...' : 'Sincronizar Marcas (SOAP)'}</span>
                  </button>
                </div>
              </div>

              {/* Monitored List */}
              {loadingMonitored ? (
                <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--accent-blue)', marginBottom: '12px' }} />
                  <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Cargando portafolio de activos...</p>
                </div>
              ) : filteredMonitoredList.length === 0 ? (
                <div className="card" style={{ padding: '48px 24px', textAlign: 'center', backgroundColor: 'var(--bg-card)' }}>
                  {assetTypeFilter === 'patente' ? (
                    <>
                      <Lightbulb size={48} style={{ color: '#ca8a04', opacity: 0.6, marginBottom: '16px' }} />
                      <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>No tenés patentes de invención en seguimiento</h3>
                      <p style={{ color: 'var(--text-secondary)', maxWidth: '560px', margin: '0 auto 20px auto', fontSize: '0.9rem', lineHeight: '1.5' }}>
                        Buscá o agregá tus solicitudes o patentes concedidas para llevar el control automático de la vigencia legal de 20 años y el pago de anualidades de mantenimiento (Ley 24.481).
                      </p>
                      <div style={{ display: 'inline-flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <button className="btn btn-primary" onClick={() => setConsultSubTab('patentes')}>
                          <Search size={16} />
                          <span>Buscar y Agregar Patente</span>
                        </button>
                      </div>
                    </>
                  ) : assetTypeFilter === 'modelo_utilidad' ? (
                    <>
                      <Cpu size={48} style={{ color: '#9333ea', opacity: 0.6, marginBottom: '16px' }} />
                      <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>No tenés modelos de utilidad en seguimiento</h3>
                      <p style={{ color: 'var(--text-secondary)', maxWidth: '560px', margin: '0 auto 20px auto', fontSize: '0.9rem', lineHeight: '1.5' }}>
                        Buscá o agregá tus innovaciones y mejoras funcionales para monitorear su vigencia decenal improrrogable (10 años según Ley 24.481) y vencimientos de anualidades ante el INPI.
                      </p>
                      <div style={{ display: 'inline-flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <button className="btn btn-primary" onClick={() => setConsultSubTab('patentes')}>
                          <Search size={16} />
                          <span>Buscar y Agregar Modelo</span>
                        </button>
                      </div>
                    </>
                  ) : assetTypeFilter === 'diseno_industrial' ? (
                    <>
                      <Palette size={48} style={{ color: '#059669', opacity: 0.6, marginBottom: '16px' }} />
                      <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>No tenés modelos o diseños industriales en seguimiento</h3>
                      <p style={{ color: 'var(--text-secondary)', maxWidth: '560px', margin: '0 auto 20px auto', fontSize: '0.9rem', lineHeight: '1.5' }}>
                        Buscá por N° de Acta en el padrón oficial del INPI para agregarlo a tu seguimiento con 1 clic y controlar los vencimientos de quinquenios (Dec-Ley 6673/63).
                      </p>
                      <div style={{ display: 'inline-flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <button className="btn btn-primary" onClick={() => setConsultSubTab('disenos')} style={{ backgroundColor: '#059669', borderColor: '#059669' }}>
                          <Search size={16} />
                          <span>Buscar y Agregar Modelo en INPI</span>
                        </button>
                      </div>
                    </>
                  ) : assetTypeFilter === 'marca' ? (
                    <>
                      <ShieldCheck size={48} style={{ color: '#3b82f6', opacity: 0.6, marginBottom: '16px' }} />
                      <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>No tenés marcas en seguimiento</h3>
                      <p style={{ color: 'var(--text-secondary)', maxWidth: '560px', margin: '0 auto 20px auto', fontSize: '0.9rem', lineHeight: '1.5' }}>
                        Podés buscar tus marcas por denominación o por CUIT en el Web Service oficial del INPI para agregarlas con un clic a tu monitoreo.
                      </p>
                      <div style={{ display: 'inline-flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <button className="btn btn-primary" onClick={() => setConsultSubTab('denominacion')}>
                          <Search size={16} />
                          <span>Buscar Marcas en INPI</span>
                        </button>
                        <button className="btn btn-secondary" onClick={() => setConsultSubTab('titular')}>
                          <Building2 size={16} />
                          <span>Buscar por CUIT / Titular</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Layers size={48} style={{ color: 'var(--accent-blue)', opacity: 0.4, marginBottom: '16px' }} />
                      <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Aún no tenés activos en tu seguimiento</h3>
                      <p style={{ color: 'var(--text-secondary)', maxWidth: '560px', margin: '0 auto 20px auto', fontSize: '0.9rem', lineHeight: '1.5' }}>
                        Podés buscar tus marcas y modelos en el INPI para agregarlos automáticamente con un clic, o agregar Patentes y Modelos de Utilidad para su seguimiento legal de vencimientos.
                      </p>
                      <div style={{ display: 'inline-flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <button className="btn btn-primary" onClick={() => setConsultSubTab('disenos')} style={{ backgroundColor: '#059669', borderColor: '#059669' }}>
                          <Palette size={16} />
                          <span>Buscar Modelos / Diseños (INPI)</span>
                        </button>
                        <button className="btn btn-secondary" onClick={() => setConsultSubTab('denominacion')}>
                          <Search size={16} />
                          <span>Buscar Marcas en INPI</span>
                        </button>
                        <button className="btn btn-secondary" onClick={() => setConsultSubTab('patentes')}>
                          <Lightbulb size={16} />
                          <span>Buscar Patentes</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
                  {filteredMonitoredList.map((item) => {
                    const type = item.asset_type || 'marca'
                    const isPatentOrUtility = type === 'patente' || type === 'modelo_utilidad'
                    const isDesign = type === 'diseno_industrial'
                    const isTrademark = type === 'marca'

                    // Alert check
                    const isAlertUrgent = item.alerta_estado === 'URGENTE' || item.djumt_codigo === 'PRESENTAR_AHORA'
                    const isAlertExpired = item.alerta_estado === 'VENCIDO' || item.djumt_codigo === 'EN_MORA'

                    return (
                      <div key={item.acta} className="card" style={{ 
                        padding: '20px', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        justifyContent: 'space-between',
                        border: isAlertUrgent 
                          ? '1px solid rgba(245, 158, 11, 0.6)' 
                          : isAlertExpired 
                            ? '1px solid rgba(239, 68, 68, 0.6)' 
                            : '1px solid var(--border-color)',
                        boxShadow: isAlertUrgent ? '0 0 14px rgba(245, 158, 11, 0.15)' : 'none'
                      }}>
                        <div>
                          {/* Card Top: Asset Type Badge & Actions */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            {renderAssetTypeBadge(type)}
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <button 
                                className="btn-icon" 
                                style={{ padding: '4px' }} 
                                onClick={() => setEditModalItem(item)}
                                title="Editar datos del activo"
                              >
                                <Edit3 size={15} />
                              </button>
                              <button 
                                className="btn-icon" 
                                style={{ color: 'var(--accent-red)', padding: '4px' }} 
                                onClick={() => handleRemoveFromMonitored(item.acta)}
                                title="Quitar de seguimiento"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>

                          {/* Info Header: Thumbnail / Icon + Title */}
                          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', marginBottom: '14px' }}>
                            <div 
                              onClick={() => { setImageModalItem(item); setImageUrlInput(item.image_url || ''); }}
                              title="Hacé clic para cargar o cambiar imagen"
                              style={{
                                width: '60px',
                                height: '60px',
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
                                  {type === 'patente' ? <Lightbulb size={22} style={{ color: '#ca8a04' }} /> :
                                   type === 'modelo_utilidad' ? <Cpu size={22} style={{ color: '#9333ea' }} /> :
                                   type === 'diseno_industrial' ? <Palette size={22} style={{ color: '#059669' }} /> :
                                   <ImageIcon size={20} />}
                                  <span style={{ display: 'block', fontSize: '0.6rem', marginTop: '2px' }}>Imagen</span>
                                </div>
                              )}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--accent-blue)', lineHeight: '1.3' }}>
                                {item.denominacion || 'Sin denominación'}
                              </h4>

                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Exp. #{item.acta}</span>
                                {item.clasificacion && (
                                  <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
                                    {type === 'patente' || type === 'modelo_utilidad' ? `CIP: ${item.clasificacion}` : 
                                     type === 'diseno_industrial' ? `Locarno: ${item.clasificacion}` : 
                                     `Clase: ${item.clasificacion}`}
                                  </span>
                                )}
                                {item.clase && isTrademark && (
                                  <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>Clase {item.clase}</span>
                                )}
                              </div>

                              {item.titulares && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  Titular: <strong>{item.titulares}</strong>
                                </div>
                              )}

                              {item.inventores_disenadores && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {isDesign ? 'Diseñador' : 'Inventor'}: <span>{item.inventores_disenadores}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Specific Status & Deadlines */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', fontSize: '0.85rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Estado INPI:</span>
                              {renderStatusBadge(item.estado)}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Nº Resolución:</span>
                              <span style={{ fontWeight: 600 }}>{item.numero_resolucion ? `Res. ${item.numero_resolucion}` : 'En Trámite'}</span>
                            </div>

                            {/* Section for Patents and Utility Models (Annuities) */}
                            {isPatentOrUtility && (
                              <div style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-color)', marginTop: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                  <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    Control de Anualidades:
                                  </span>
                                  <span className="badge badge-blue" style={{ fontSize: '0.75rem' }}>
                                    Año {item.anualidades_pagadas || 0} de {type === 'patente' ? 20 : 10}
                                  </span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>Próxima anualidad:</span>
                                  <strong>{item.proxima_anualidad ? `Año ${item.proxima_anualidad}` : (item.anualidades_pagadas >= (type === 'patente' ? 20 : 10) ? 'Completadas' : 'Año 3')}</strong>
                                </div>

                                {item.fecha_proximo_vencimiento && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', marginTop: '4px' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Vencimiento cuota:</span>
                                    <span style={{ fontWeight: 600 }}>{item.fecha_proximo_vencimiento}</span>
                                  </div>
                                )}

                                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                                  <button
                                    className="btn btn-secondary"
                                    onClick={() => handleIncrementAnnuity(item)}
                                    style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                                    title="Confirmar pago de la siguiente anualidad anual"
                                  >
                                    <Plus size={12} />
                                    <span>+1 Anualidad Pagada</span>
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Section for Industrial Designs (Quinquenniums) */}
                            {isDesign && (
                              <div style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-color)', marginTop: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                  <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    Período de Vigencia:
                                  </span>
                                  <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#059669', fontSize: '0.75rem', fontWeight: 600 }}>
                                    Quinquenio {item.quinquenio_actual || 1} de 3
                                  </span>
                                </div>

                                {item.fecha_proximo_vencimiento && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Vence este período:</span>
                                    <span style={{ fontWeight: 600 }}>{item.fecha_proximo_vencimiento}</span>
                                  </div>
                                )}

                                {(item.quinquenio_actual || 1) < 3 && (
                                  <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                                    <button
                                      className="btn btn-secondary"
                                      onClick={() => handleAdvanceQuinquennium(item)}
                                      style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                                      title="Renovar por 5 años más (hasta 15 años total)"
                                    >
                                      <RefreshCw size={12} />
                                      <span>Renovar al {(item.quinquenio_actual || 1) + 1}º Quinquenio</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Section for Trademarks (DJUMT) */}
                            {isTrademark && (
                              <div style={{ marginTop: '4px' }}>
                                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
                                  Declaración Jurada (DJUMT):
                                </span>
                                {renderDjumtBadge(item)}
                              </div>
                            )}

                            {/* Alert Status Banner */}
                            {item.alerta_mensaje && (
                              <div style={{ 
                                padding: '8px 12px', 
                                borderRadius: '6px', 
                                fontSize: '0.8rem',
                                marginTop: '4px',
                                backgroundColor: isAlertExpired ? 'rgba(239, 68, 68, 0.12)' : isAlertUrgent ? 'rgba(245, 158, 11, 0.12)' : 'rgba(37, 99, 235, 0.08)',
                                border: `1px solid ${isAlertExpired ? 'rgba(239, 68, 68, 0.3)' : isAlertUrgent ? 'rgba(245, 158, 11, 0.3)' : 'rgba(37, 99, 235, 0.2)'}`,
                                color: isAlertExpired ? 'var(--accent-red)' : isAlertUrgent ? '#d97706' : 'var(--text-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}>
                                {isAlertExpired ? <AlertCircle size={14} /> : isAlertUrgent ? <AlertTriangle size={14} /> : <Info size={14} />}
                                <span>{item.alerta_mensaje}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Footer Actions */}
                        <div style={{ display: 'flex', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--border-color)', alignItems: 'center' }}>
                          {item.document_url ? (
                            <a
                              href={item.document_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary"
                              style={{ flex: 1, fontSize: '0.8rem', padding: '6px 10px', justifyContent: 'center' }}
                              title="Abrir documento o memoria técnica"
                            >
                              <LinkIcon size={14} />
                              <span>Documentación</span>
                            </a>
                          ) : (
                            <a
                              href="https://portaltramites.inpi.gob.ar/marcasconsultas/busqueda"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary"
                              style={{ flex: 1, fontSize: '0.8rem', padding: '6px 10px', justifyContent: 'center' }}
                            >
                              <ExternalLink size={14} />
                              <span>Portal INPI</span>
                            </a>
                          )}

                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                            onClick={() => setSelectedRecord(item)}
                            title="Ficha completa de diagnóstico"
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* SEARCH FORMS (PATENTES, DISEÑOS, DENOMINACION, TITULAR, NOTIF) */}
          {/* ------------------------------------------------------------- */}
          {consultSubTab !== 'monitored' && (
            <div>
              {/* VISTA 1: PATENTES Y MODELOS DE UTILIDAD */}
              {consultSubTab === 'patentes' && (
                <div>
                  {/* Regulatory & Information Banner */}
                  <div className="card" style={{ 
                    padding: '24px 28px', 
                    marginBottom: '24px',
                    backgroundColor: 'rgba(234, 179, 8, 0.05)',
                    border: '1px solid rgba(234, 179, 8, 0.25)',
                    borderRadius: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                      <div style={{
                        padding: '12px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(234, 179, 8, 0.15)',
                        color: '#ca8a04',
                        flexShrink: 0
                      }}>
                        <Lightbulb size={28} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Búsqueda y Consulta de Patentes y Modelos de Utilidad</h2>
                          <span className="badge" style={{ backgroundColor: 'rgba(234, 179, 8, 0.2)', color: '#ca8a04', fontWeight: 600 }}>
                            Ley Nacional 24.481
                          </span>
                        </div>
                        <p style={{ margin: '8px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                          En Argentina, las <strong>Patentes de Invención</strong> confieren 20 años de exclusividad improrrogables desde la solicitud, y los <strong>Modelos de Utilidad</strong> (mejoras funcionales a herramientas o artefactos) otorgan 10 años. Ambas figuras devengan <strong>anualidades de mantenimiento</strong> a partir del 3° año.
                        </p>
                        <div style={{ 
                          marginTop: '12px', 
                          padding: '10px 14px', 
                          borderRadius: '8px', 
                          backgroundColor: 'var(--bg-card)', 
                          border: '1px solid var(--border-color)',
                          fontSize: '0.85rem',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px'
                        }}>
                          <Info size={18} style={{ color: 'var(--accent-blue)', minWidth: 18 }} />
                          <span>
                            <strong>Nota sobre consultas INPI:</strong> El Web Service SOAP abierto del INPI solo procesa marcas y boletines. Para patentes y modelos, las consultas de antecedentes se realizan a través de las bases oficiales integradas: <strong>Espacenet</strong> (con catálogo oficial de patentes argentinas <code>AR</code>), <strong>Latipat</strong>, <strong>Google Patents</strong> y el <strong>Portal de Trámites del INPI</strong>.
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* INCORPORAR PATENTE O MODELO DE UTILIDAD DIRECTAMENTE */}
                  <div className="card" style={{ 
                    padding: '24px', 
                    marginBottom: '24px',
                    border: '1px solid rgba(234, 179, 8, 0.4)',
                    background: 'linear-gradient(180deg, rgba(234, 179, 8, 0.04) 0%, var(--bg-card) 100%)',
                    borderRadius: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                      <div style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '8px',
                        backgroundColor: '#ca8a04',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff'
                      }}>
                        <Star size={20} fill="#fff" />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>Agregar Mi Patente o Modelo de Utilidad al Seguimiento</span>
                          <span className="badge" style={{ backgroundColor: 'rgba(234, 179, 8, 0.2)', color: '#ca8a04', fontSize: '0.75rem' }}>
                            1 Clic
                          </span>
                        </h3>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          Ingresá los datos de tu trámite o solicitud para activar el cálculo automático de anualidades (a partir del 3° año) y vigencia legal.
                        </p>
                      </div>
                    </div>

                    <form onSubmit={handleAddQuickPatent}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                        <div>
                          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', marginBottom: '4px' }}>
                            Tipo de Activo:
                          </label>
                          <select
                            className="input"
                            value={quickPatentForm.asset_type}
                            onChange={(e) => setQuickPatentForm({ ...quickPatentForm, asset_type: e.target.value })}
                            style={{ width: '100%' }}
                          >
                            <option value="patente">💡 Patente de Invención (20 años)</option>
                            <option value="modelo_utilidad">⚙️ Modelo de Utilidad (10 años)</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', marginBottom: '4px' }}>
                            N° de Solicitud / Acta / Expediente: *
                          </label>
                          <input
                            type="text"
                            className="input"
                            placeholder="Ej: P20210100456 o 20210100456"
                            value={quickPatentForm.acta}
                            onChange={(e) => setQuickPatentForm({ ...quickPatentForm, acta: e.target.value })}
                            required
                            style={{ width: '100%' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', marginBottom: '4px' }}>
                            Título o Denominación de la Invención: *
                          </label>
                          <input
                            type="text"
                            className="input"
                            placeholder="Ej: Sistema hidropónico automatizado..."
                            value={quickPatentForm.denominacion}
                            onChange={(e) => setQuickPatentForm({ ...quickPatentForm, denominacion: e.target.value })}
                            required
                            style={{ width: '100%' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', marginBottom: '4px' }}>
                            Titular / Solicitante:
                          </label>
                          <input
                            type="text"
                            className="input"
                            placeholder="Ej: Mi Empresa S.A. o Nombre..."
                            value={quickPatentForm.titulares}
                            onChange={(e) => setQuickPatentForm({ ...quickPatentForm, titulares: e.target.value })}
                            style={{ width: '100%' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', marginBottom: '4px' }}>
                            Fecha de Presentación (Ingreso):
                          </label>
                          <input
                            type="date"
                            className="input"
                            value={quickPatentForm.fecha_ingreso}
                            onChange={(e) => setQuickPatentForm({ ...quickPatentForm, fecha_ingreso: e.target.value })}
                            style={{ width: '100%' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', marginBottom: '4px' }}>
                            Clasificación CIP / IPC (Opcional):
                          </label>
                          <input
                            type="text"
                            className="input"
                            placeholder="Ej: A01G 31/00"
                            value={quickPatentForm.clasificacion}
                            onChange={(e) => setQuickPatentForm({ ...quickPatentForm, clasificacion: e.target.value })}
                            style={{ width: '100%' }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        {quickPatentSuccess && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', fontSize: '0.85rem', fontWeight: 600 }}>
                            <Check size={16} /> ¡Activo incorporado con éxito! Podés verlo en 
                            <button 
                              type="button" 
                              onClick={() => { setConsultSubTab('monitored'); setAssetTypeFilter(quickPatentForm.asset_type); }} 
                              style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontWeight: 700 }}
                            >
                              Mis Activos
                            </button>.
                          </div>
                        )}
                        {!quickPatentSuccess && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>* Campos mínimos para iniciar el monitoreo.</span>}

                        <button
                          type="submit"
                          className="btn btn-primary"
                          disabled={addingQuickPatent}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: '#ca8a04',
                            borderColor: '#ca8a04',
                            padding: '8px 20px',
                            fontWeight: 600
                          }}
                        >
                          {addingQuickPatent ? <Loader2 size={16} className="spin" /> : <Star size={16} fill="#fff" />}
                          <span>+ Agregar al Seguimiento</span>
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Official Bases Access Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '28px' }}>
                    
                    {/* Espacenet Card */}
                    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '4px solid #ca8a04' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <span className="badge" style={{ backgroundColor: 'rgba(234, 179, 8, 0.15)', color: '#ca8a04', fontWeight: 600 }}>
                            Base Oficial Recomendada por INPI
                          </span>
                        </div>
                        <h4 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 700 }}>Espacenet (EPO)</h4>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 14px 0', lineHeight: '1.4' }}>
                          Base global con más de 140M de documentos técnicos, incluyendo la colección completa de patentes publicadas en Argentina (código <code>AR</code>).
                        </p>
                      </div>
                      <a
                        href={getEspacenetUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem' }}
                      >
                        <span>Buscar en Espacenet</span>
                        <ExternalLink size={14} />
                      </a>
                    </div>

                    {/* Latipat Card */}
                    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '4px solid #3b82f6' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <span className="badge badge-blue">Iberoamérica & Argentina</span>
                        </div>
                        <h4 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 700 }}>Latipat - Espacenet</h4>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 14px 0', lineHeight: '1.4' }}>
                          Plataforma de cooperación internacional especializada en publicaciones de patentes en español y portugués de toda América Latina y España.
                        </p>
                      </div>
                      <a
                        href="https://lp.espacenet.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem' }}
                      >
                        <span>Consultar en Latipat</span>
                        <ExternalLink size={14} />
                      </a>
                    </div>

                    {/* Google Patents Card */}
                    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '4px solid #10b981' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#059669', fontWeight: 600 }}>
                            Búsqueda Rápida & Citaciones
                          </span>
                        </div>
                        <h4 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 700 }}>Google Patents (Filtro AR)</h4>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 14px 0', lineHeight: '1.4' }}>
                          Indexación de texto completo, diagramas, familias de patentes mundiales y antecedentes previos con filtro preconfigurado para Argentina.
                        </p>
                      </div>
                      <a
                        href={getGooglePatentsUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem' }}
                      >
                        <span>Buscar en Google Patents</span>
                        <ExternalLink size={14} />
                      </a>
                    </div>

                  </div>

                  {/* CIP Guide Reference Accordion / Cards */}
                  <div className="card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                          Guía de Clasificación Internacional de Patentes (CIP / IPC)
                        </h3>
                        <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          Hacé clic en una sección para insertarla automáticamente en el filtro de búsqueda:
                        </p>
                      </div>
                      <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>
                        OMPI / WIPO - 8 Secciones
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                      {CIP_SECTIONS.map((sec) => (
                        <div
                          key={sec.code}
                          onClick={() => setPatentCipFilter(sec.code)}
                          style={{
                            padding: '12px 14px',
                            borderRadius: '8px',
                            backgroundColor: patentCipFilter === sec.code ? 'rgba(234, 179, 8, 0.12)' : 'var(--bg-dark)',
                            border: patentCipFilter === sec.code ? '1px solid #ca8a04' : '1px solid var(--border-color)',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ 
                              display: 'inline-block', 
                              width: '24px', 
                              height: '24px', 
                              lineHeight: '24px', 
                              textAlign: 'center', 
                              borderRadius: '6px', 
                              backgroundColor: '#ca8a04', 
                              color: '#fff', 
                              fontWeight: 700,
                              fontSize: '0.8rem'
                            }}>
                              {sec.code}
                            </span>
                            <strong style={{ fontSize: '0.85rem', color: patentCipFilter === sec.code ? '#ca8a04' : 'var(--text-primary)' }}>
                              {sec.name}
                            </strong>
                          </div>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
                            {sec.desc}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}

              {/* VISTA 2: DISEÑOS INDUSTRIALES */}
              {consultSubTab === 'disenos' && (
                <div>
                  {/* Regulatory & Information Banner */}
                  <div className="card" style={{ 
                    padding: '24px 28px', 
                    marginBottom: '24px',
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    borderRadius: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                      <div style={{
                        padding: '12px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        color: '#059669',
                        flexShrink: 0
                      }}>
                        <Palette size={28} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Búsqueda y Consulta de Diseños y Modelos Industriales</h2>
                          <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#059669', fontWeight: 600 }}>
                            Decreto-Ley 6673/63
                          </span>
                        </div>
                        <p style={{ margin: '8px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                          En Argentina, los <strong>Modelos y Diseños Industriales</strong> protegen las formas, líneas o aspectos ornamentales aplicados a productos. Otorgan una vigencia inicial de <strong>5 años</strong>, renovable por hasta <strong>dos períodos consecutivos de 5 años cada uno</strong> (vigencia máxima total de 15 años).
                        </p>
                        <div style={{ 
                          marginTop: '12px', 
                          padding: '10px 14px', 
                          borderRadius: '8px', 
                          backgroundColor: 'var(--bg-card)', 
                          border: '1px solid var(--border-color)',
                          fontSize: '0.85rem',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px'
                        }}>
                          <Info size={18} style={{ color: 'var(--accent-blue)', minWidth: 18 }} />
                          <span>
                            <strong>Red Oficial Designview:</strong> El INPI Argentina está plenamente integrado en <strong>Designview</strong>, la base de datos de modelos y dibujos industriales más grande del mundo (con más de 20 millones de registros de más de 70 oficinas internacionales, incluyendo Argentina).
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* BÚSQUEDA Y AGREGADO DIRECTO DE MODELOS INPI */}
                  <div className="card" style={{ 
                    padding: '24px', 
                    marginBottom: '24px',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.04) 0%, var(--bg-card) 100%)',
                    borderRadius: '12px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '8px',
                          backgroundColor: '#059669',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff'
                        }}>
                          <Search size={20} />
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>Buscar y Agregar Modelo Industrial (INPI)</span>
                            <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#059669', fontSize: '0.75rem' }}>
                              Consulta Oficial Online
                            </span>
                          </h3>
                          <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Ingresá el número de Acta o Expediente para consultar el padrón oficial del INPI y agregarlo a tu seguimiento con 1 clic.
                          </p>
                        </div>
                      </div>
                    </div>

                    <form onSubmit={(e) => { e.preventDefault(); handleSearchModel(); }} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                      <input
                        type="text"
                        className="input"
                        placeholder="N° de Acta o Expediente del Modelo (Ej: 96000, 90000, 95400...)"
                        value={modelActaInput}
                        onChange={(e) => setModelActaInput(e.target.value)}
                        style={{ flex: 1, minWidth: '260px', fontSize: '0.95rem' }}
                      />
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={searchingModel}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '8px', 
                          backgroundColor: '#059669', 
                          borderColor: '#059669',
                          padding: '0 24px',
                          fontWeight: 600
                        }}
                      >
                        {searchingModel ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
                        <span>{searchingModel ? 'Consultando INPI...' : 'Buscar Modelo en INPI'}</span>
                      </button>
                    </form>

                    {/* Quick test badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      <span>Ejemplos rápidos:</span>
                      <button
                        type="button"
                        onClick={() => { setModelActaInput('96000'); handleSearchModel('96000'); }}
                        style={{ background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '2px 8px', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text-primary)' }}
                      >
                        Acta 96000 (Generador Portátil)
                      </button>
                      <button
                        type="button"
                        onClick={() => { setModelActaInput('90000'); handleSearchModel('90000'); }}
                        style={{ background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '2px 8px', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text-primary)' }}
                      >
                        Acta 90000 (Tapón)
                      </button>
                    </div>

                    {/* ERROR FEEDBACK */}
                    {modelSearchError && (
                      <div style={{ 
                        marginTop: '16px', 
                        padding: '12px 16px', 
                        borderRadius: '8px', 
                        backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#ef4444',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <AlertTriangle size={18} />
                        <span style={{ fontSize: '0.85rem' }}>{modelSearchError}</span>
                      </div>
                    )}

                    {/* RESULT PREVIEW CARD */}
                    {modelSearchResult && (
                      <div style={{ 
                        marginTop: '20px', 
                        padding: '20px', 
                        borderRadius: '10px', 
                        backgroundColor: 'var(--bg-dark)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
                          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                            {modelSearchResult.image_url ? (
                              <img 
                                src={modelSearchResult.image_url} 
                                alt={modelSearchResult.denominacion}
                                style={{ width: '80px', height: '80px', objectFit: 'contain', borderRadius: '8px', backgroundColor: '#fff', border: '1px solid var(--border-color)', padding: '4px' }}
                              />
                            ) : (
                              <div style={{ width: '64px', height: '64px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Palette size={32} />
                              </div>
                            )}
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#059669', fontWeight: 700 }}>
                                   Acta N° {modelSearchResult.acta}
                                </span>
                                <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>
                                  Clase Locarno: {modelSearchResult.clasificacion || 'N/A'}
                                </span>
                                <span className="badge badge-blue" style={{ fontSize: '0.75rem' }}>
                                  {modelSearchResult.estado}
                                </span>
                              </div>
                              <h3 style={{ margin: '4px 0 8px 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {modelSearchResult.denominacion}
                              </h3>
                              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                <strong>Titular(es):</strong> {modelSearchResult.titulares || 'No especificado'}
                              </p>
                              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                <strong>Fecha de Depósito (Ingreso):</strong> {modelSearchResult.fecha_ingreso || 'N/A'}
                                {modelSearchResult.fecha_concesion && ` • Concesión: ${modelSearchResult.fecha_concesion}`}
                              </p>
                            </div>
                          </div>

                          {/* ACTION BUTTON */}
                          <div>
                            {monitoredList.some(m => String(m.acta) === String(modelSearchResult.acta)) || addedModelSuccess ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                                <span className="badge badge-success" style={{ padding: '6px 14px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Check size={16} /> Ya está en tu Seguimiento
                                </span>
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => { setConsultSubTab('monitored'); setAssetTypeFilter('diseno_industrial'); }}
                                  style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                  <span>Ver en Mis Activos</span>
                                  <ArrowRight size={14} />
                                </button>
                              </div>
                            ) : (
                              <button
                                className="btn btn-primary"
                                onClick={handleAddFoundModel}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  backgroundColor: '#059669',
                                  borderColor: '#059669',
                                  padding: '10px 20px',
                                  fontSize: '0.95rem',
                                  fontWeight: 700,
                                  boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)'
                                }}
                              >
                                <Star size={18} fill="#fff" />
                                <span>+ Agregar al Portafolio y Seguir</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* QUINQUENNIUM & OFFICIAL RENEWAL SCHEDULE */}
                        {modelSearchResult.renovaciones_oficiales && modelSearchResult.renovaciones_oficiales.length > 0 && (
                          <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: '#ca8a04', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Clock size={15} />
                              <span>Plazos Oficiales de Renovación de Quinquenios (INPI):</span>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                              {modelSearchResult.renovaciones_oficiales.map((ren, idx) => (
                                <div key={idx} style={{ 
                                  padding: '6px 12px', 
                                  borderRadius: '6px', 
                                  backgroundColor: 'rgba(234, 179, 8, 0.1)', 
                                  border: '1px solid rgba(234, 179, 8, 0.3)',
                                  fontSize: '0.8rem',
                                  color: 'var(--text-primary)',
                                  fontWeight: 500
                                }}>
                                  {ren}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* LEGAL SUMMARY ALERT */}
                        <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          ℹ️ Al agregar este modelo, el sistema monitoreará automáticamente los períodos quinquenales de vigencia (Decreto-Ley 6673/63) y te alertará 6 meses antes de cada vencimiento de renovación.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Official Bases Access Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '28px' }}>
                    
                    {/* Designview Card */}
                    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '4px solid #059669' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#059669', fontWeight: 600 }}>
                            Base Oficial Recomendada por INPI
                          </span>
                        </div>
                        <h4 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 700 }}>Designview (EUIPO / INPI)</h4>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 14px 0', lineHeight: '1.4' }}>
                          La herramienta oficial más grande del mundo para la búsqueda de dibujos y modelos industriales, con registros argentinos integrados y visualización de planos y fotos.
                        </p>
                      </div>
                      <a
                        href="https://www.tmdn.org/tmdsview-web/welcome#/dsview"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem', backgroundColor: '#059669', borderColor: '#059669' }}
                      >
                        <span>Abrir Designview Oficial</span>
                        <ExternalLink size={14} />
                      </a>
                    </div>

                    {/* WIPO Global Design Database */}
                    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '4px solid #8b5cf6' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <span className="badge badge-purple">Organización Mundial (OMPI)</span>
                        </div>
                        <h4 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 700 }}>WIPO Global Design Database</h4>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 14px 0', lineHeight: '1.4' }}>
                          Consulta mundial de registros de diseños bajo el Sistema de La Haya y oficinas nacionales participantes de la OMPI.
                        </p>
                      </div>
                      <a
                        href="https://www.wipo.int/designdb/en/index.jsp"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem' }}
                      >
                        <span>Consultar WIPO Design</span>
                        <ExternalLink size={14} />
                      </a>
                    </div>

                  </div>

                  {/* Locarno Guide */}
                  <div className="card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                          Clasificación Internacional de Diseños de Locarno
                        </h3>
                        <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          Clases frecuentes del Arreglo de Locarno aplicadas en el INPI Argentina:
                        </p>
                      </div>
                      <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>
                        Locarno - 32 Clases
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                      {LOCARNO_POPULAR_CLASSES.map((loc) => (
                        <div
                          key={loc.classNum}
                          onClick={() => setDesignLocarnoFilter(loc.classNum)}
                          style={{
                            padding: '12px 14px',
                            borderRadius: '8px',
                            backgroundColor: designLocarnoFilter === loc.classNum ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-dark)',
                            border: designLocarnoFilter === loc.classNum ? '1px solid #059669' : '1px solid var(--border-color)',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ 
                              display: 'inline-block', 
                              width: '26px', 
                              height: '24px', 
                              lineHeight: '24px', 
                              textAlign: 'center', 
                              borderRadius: '6px', 
                              backgroundColor: '#059669', 
                              color: '#fff', 
                              fontWeight: 700,
                              fontSize: '0.8rem'
                            }}>
                              {loc.classNum}
                            </span>
                            <strong style={{ fontSize: '0.85rem', color: designLocarnoFilter === loc.classNum ? '#059669' : 'var(--text-primary)' }}>
                              {loc.title}
                            </strong>
                          </div>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
                            Ejemplos: {loc.examples}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}

              {/* VISTA 3: CONSULTAS SOAP INPI (MARCAS, TITULAR, BOLETIN) */}
              {(consultSubTab === 'denominacion' || consultSubTab === 'titular' || consultSubTab === 'notificaciones') && (
                <div>
                  {/* Search Form Card */}
                  <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                
                {/* 1. Denominacion Form */}
                {consultSubTab === 'denominacion' && (
                  <form onSubmit={handleSearchDenominacion}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '0.9rem' }}>
                      Nombre de la marca o denominación a verificar en el INPI:
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
                          <span>Buscar Marcas del Titular (INPI)</span>
                        </>
                      )}
                    </button>

                    <div style={{ 
                      marginTop: '16px', 
                      padding: '10px 14px', 
                      borderRadius: '8px', 
                      backgroundColor: 'var(--bg-dark)', 
                      border: '1px solid var(--border-color)',
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <Info size={16} style={{ color: 'var(--accent-blue)', minWidth: 16 }} />
                      <span>
                        El Web Service del INPI recupera automáticamente todas las <strong>marcas</strong> vinculadas a este CUIT o Titular. Para buscar y agregar patentes o modelos de este titular, consultá las pestañas especializadas de Patentes o Diseños.
                      </span>
                    </div>
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
                      <table className="mobile-cards" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
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
                                  <td data-label="Acta / Nº" style={{ padding: '12px 16px', fontWeight: 600 }}>
                                    {item.Acta || item.Expediente || item.Id_Notificacion || 'N/A'}
                                  </td>
                                  <td data-label="Denominación / Marca" style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--accent-blue)' }}>
                                    {item.Denominacion || item.NombreNotificacion || 'N/A'}
                                    {item.Tipo_Marca && <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)' }}>Tipo: {item.Tipo_Marca}</span>}
                                  </td>
                                  <td data-label="Clase" style={{ padding: '12px 16px' }}>
                                    {item.Clase ? <span className="badge badge-secondary">Clase {item.Clase}</span> : '-'}
                                  </td>
                                  <td data-label="Nº Resolución" style={{ padding: '12px 16px', fontSize: '0.85rem', fontWeight: 600 }}>
                                    {item.Numero_Resolucion ? `Res. ${item.Numero_Resolucion}` : '-'}
                                  </td>
                                  <td data-label="Estado" style={{ padding: '12px 16px' }}>
                                    {renderStatusBadge(item.Estado)}
                                  </td>
                                  <td data-label="Declaración Jurada (DJUMT)" style={{ padding: '12px 16px' }}>
                                    {renderDjumtBadge(item)}
                                  </td>
                                  <td data-label="Acciones" style={{ padding: '12px 16px', textAlign: 'right' }}>
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

      {/* MODAL 2: EDITAR ACTIVO */}
      {editModalItem && (
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Edit3 size={20} style={{ color: 'var(--accent-blue)' }} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Actualizar Activo: {editModalItem.denominacion || editModalItem.acta}</h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Expediente #{editModalItem.acta}</span>
                </div>
              </div>
              <button className="btn-icon" onClick={() => setEditModalItem(null)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEditAsset}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                  Denominación / Título:
                </label>
                <input
                  type="text"
                  className="input"
                  value={editModalItem.denominacion || ''}
                  onChange={(e) => setEditModalItem({ ...editModalItem, denominacion: e.target.value })}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                    Estado del Trámite:
                  </label>
                  <select
                    className="input"
                    value={editModalItem.estado || 'T'}
                    onChange={(e) => setEditModalItem({ ...editModalItem, estado: e.target.value })}
                    style={{ width: '100%' }}
                  >
                    <option value="T">En Trámite (T)</option>
                    <option value="C">Concedida (C)</option>
                    <option value="D">Denegada (D)</option>
                    <option value="R">Desistida (R)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                    Nº de Resolución:
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={editModalItem.numero_resolucion || ''}
                    onChange={(e) => setEditModalItem({ ...editModalItem, numero_resolucion: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Specific for Patent / Utility Model: Annuities */}
              {(editModalItem.asset_type === 'patente' || editModalItem.asset_type === 'modelo_utilidad') && (
                <div style={{ padding: '12px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-dark)', marginBottom: '14px', border: '1px solid var(--border-color)' }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                    Anualidades Pagadas Hasta la Fecha (0 a {editModalItem.asset_type === 'patente' ? '20' : '10'}):
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={editModalItem.asset_type === 'patente' ? '20' : '10'}
                    className="input"
                    value={editModalItem.anualidades_pagadas || 0}
                    onChange={(e) => setEditModalItem({ ...editModalItem, anualidades_pagadas: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>
              )}

              {/* Specific for Industrial Design: Quinquennium */}
              {editModalItem.asset_type === 'diseno_industrial' && (
                <div style={{ padding: '12px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-dark)', marginBottom: '14px', border: '1px solid var(--border-color)' }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                    Quinquenio Actual de Vigencia:
                  </label>
                  <select
                    className="input"
                    value={editModalItem.quinquenio_actual || 1}
                    onChange={(e) => setEditModalItem({ ...editModalItem, quinquenio_actual: e.target.value })}
                    style={{ width: '100%' }}
                  >
                    <option value="1">1º Quinquenio (Años 1 a 5)</option>
                    <option value="2">2º Quinquenio (Años 6 a 10)</option>
                    <option value="3">3º Quinquenio (Años 11 a 15 - Vigencia Máxima)</option>
                  </select>
                </div>
              )}

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                  Inventores / Diseñadores:
                </label>
                <input
                  type="text"
                  className="input"
                  value={editModalItem.inventores_disenadores || ''}
                  onChange={(e) => setEditModalItem({ ...editModalItem, inventores_disenadores: e.target.value })}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                  Enlace a Memoria Descriptiva / Documentación:
                </label>
                <input
                  type="url"
                  className="input"
                  value={editModalItem.document_url || ''}
                  onChange={(e) => setEditModalItem({ ...editModalItem, document_url: e.target.value })}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                  Observaciones / Notas:
                </label>
                <textarea
                  className="input"
                  rows={2}
                  value={editModalItem.notes || ''}
                  onChange={(e) => setEditModalItem({ ...editModalItem, notes: e.target.value })}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditModalItem(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={submittingAsset}>
                  {submittingAsset ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
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
            {(selectedRecord.alerta_mensaje || selectedRecord.djumt_mensaje) && (
              <div style={{
                padding: '14px 18px',
                borderRadius: '8px',
                marginBottom: '20px',
                backgroundColor: 'rgba(37, 99, 235, 0.12)',
                border: '1px solid rgba(37, 99, 235, 0.4)'
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={18} />
                  <span>Diagnóstico y Estado Legal</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.4' }}>
                  {selectedRecord.alerta_mensaje || selectedRecord.djumt_mensaje}
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
                  <Award size={12} /> Concesión
                </span>
                <strong style={{ fontSize: '0.95rem', display: 'block', marginTop: '4px', color: 'var(--accent-blue)' }}>
                  {selectedRecord.fecha_concesion || selectedRecord.fecha_concesion_estimada || 'En Trámite'}
                </strong>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--bg-dark)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} /> Próximo Vencimiento
                </span>
                <strong style={{ fontSize: '0.95rem', display: 'block', marginTop: '4px' }}>
                  {selectedRecord.fecha_proximo_vencimiento || selectedRecord.fecha_vencimiento_10anos || 'N/A'}
                </strong>
              </div>
            </div>

            {/* Full Record Key-Values */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.88rem' }}>
              {Object.entries(selectedRecord).filter(([k]) => !['requiere_djumt', 'djumt_codigo', 'djumt_mensaje', 'fecha_concesion_estimada', 'fecha_limite_djumt_inicio', 'fecha_limite_djumt_fin', 'fecha_vencimiento_10anos', 'id', 'alerta_estado', 'alerta_mensaje'].includes(k)).map(([key, val]) => {
                if (key === 'image_url') {
                  return (
                    <div key={key} style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: '12px', padding: '8px 12px', backgroundColor: 'var(--bg-dark)', borderRadius: '6px', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Imagen / Logo:
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
                <span>Cargar Imagen del Activo ({imageModalItem.denominacion})</span>
              </h3>
              <button className="btn-icon" onClick={() => setImageModalItem(null)}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Pegá la <strong>URL de la imagen</strong>, la cadena <strong>Base64</strong> o subí un archivo desde tu equipo:
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                URL o Cadena Base64 de la Imagen:
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
                O Subir Archivo de Imagen:
              </label>
              <label className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                <UploadCloud size={16} />
                <span>Seleccionar Imagen...</span>
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
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Vista previa:</span>
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
                {savingImage ? 'Guardando...' : 'Guardar Imagen'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
