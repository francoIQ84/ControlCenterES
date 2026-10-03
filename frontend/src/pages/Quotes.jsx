import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useParams } from 'react-router-dom'
import { 
  FileText, Plus, Search, Download, CheckCircle2, Clock, 
  AlertTriangle, XCircle, MessageCircle, User, Trash2, 
  Edit3, DollarSign, Package, ExternalLink, Calendar, 
  TrendingUp, RefreshCw, ChevronRight, X, ArrowRight, Check,
  Building, MapPin, Link2, Sparkles, Copy
} from 'lucide-react'
import { getCachedData, setCachedData, invalidateCache, CacheKeys } from '../utils/cache'
import { matchesQuery, matchesPhoneOrDoc } from '../utils/searchUtils'
import { formatDateTimeAR } from '../utils/dateUtils'

export default function Quotes() {
  const cachedQuotes = getCachedData(CacheKeys.QUOTES)
  const [quotes, setQuotes] = useState(() => cachedQuotes || [])
  const [loading, setLoading] = useState(() => !cachedQuotes)
  const [statusFilter, setStatusFilter] = useState('all')
  const { queryParam } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialUrlSearch = queryParam || searchParams.get('search') || searchParams.get('q') || ""
  const [searchTerm, setSearchTerm] = useState(initialUrlSearch)

  // Sincronizar búsqueda en tiempo real con la URL para que persista al refrescar (F5) y sea compartible
  useEffect(() => {
    const currentParam = searchParams.get('search') || searchParams.get('q') || ""
    const trimmed = searchTerm ? searchTerm.trim() : ""
    if (trimmed !== currentParam) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        if (trimmed) {
          next.set('search', trimmed)
          next.delete('q')
        } else {
          next.delete('search')
          next.delete('q')
        }
        return next
      }, { replace: true })
    }
  }, [searchTerm])

  // Si el usuario navega con Atrás/Adelante en el historial del navegador
  useEffect(() => {
    const urlParam = queryParam || searchParams.get('search') || searchParams.get('q') || ""
    if (urlParam !== searchTerm) {
      setSearchTerm(urlParam)
    }
  }, [searchParams, queryParam])
  const cachedInv = getCachedData(CacheKeys.INVENTORY_SUMMARY) || getCachedData(CacheKeys.INVENTORY)
  const [inventory, setInventory] = useState(() => cachedInv || [])
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingQuote, setEditingQuote] = useState(null)
  const [cloningFromQuote, setCloningFromQuote] = useState(null)
  const [convertingQuote, setConvertingQuote] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Mobile detection for responsive modal
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth <= 768 : false)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Auto-close autocomplete on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.quote-item-search-cell')) {
        setActiveSearchIdx(null)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveSearchIdx(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])
  const [convertMode, setConvertMode] = useState('cash') // 'cash' or 'link_transfer'
  const [candidateTransfers, setCandidateTransfers] = useState([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [selectedTransferId, setSelectedTransferId] = useState('')
  const [manualTransferId, setManualTransferId] = useState('')
  const [manualLookupResult, setManualLookupResult] = useState(null)
  const [manualLookupLoading, setManualLookupLoading] = useState(false)
  
  // Search autocomplete in modal
  const [activeSearchIdx, setActiveSearchIdx] = useState(null)
  const [customSearchQuery, setCustomSearchQuery] = useState('')

  // New quote form state
  const initialQuoteForm = {
    customer_name: '',
    customer_doc: '',
    customer_email: '',
    customer_phone: '',
    customer_address: '',
    price_source: 'web', // 'web', 'mercadolibre', 'cash_discount', 'tiendanube'
    valid_days: 7,
    notes: 'Los precios expresados tienen una validez de 7 días corridos a partir de la fecha de emisión. Pago por transferencia bancaria o efectivo.',
    items: [{ id: `manual-${Date.now()}`, title: '', quantity: 1, price: 0, sku: '' }]
  }
  const [formData, setFormData] = useState(initialQuoteForm)

  // Convert to order form state
  const [convertForm, setConvertForm] = useState({
    payment_method: 'Efectivo',
    shipping_status: 'delivered',
    auto_invoice: false,
    invoice_type: 'B'
  })

  // Commercial config state (Nombre comercial, dirección y datos para presupuestos)
  const [commercialConfig, setCommercialConfig] = useState({
    merchant_commercial_name: 'Experiencia Sustentable',
    merchant_commercial_address: 'Zeballos 1726, Rosario, Santa Fe, Argentina',
    merchant_phone: '+54 9 3412 59-0161',
    merchant_email: '',
    show_legal_name: false,
    legal_name: 'GENTILI FRANCO AGUSTIN',
    show_cuit: false,
    cuit: '20-31383248-2',
    has_commercial_address: true
  })
  const [showCommercialModal, setShowCommercialModal] = useState(false)
  const [commercialForm, setCommercialForm] = useState({
    merchant_commercial_name: 'Experiencia Sustentable',
    merchant_commercial_address: 'Zeballos 1726, Rosario, Santa Fe, Argentina',
    merchant_phone: '+54 9 3412 59-0161',
    merchant_email: '',
    show_legal_name: false,
    legal_name: 'GENTILI FRANCO AGUSTIN',
    show_cuit: false,
    cuit: '20-31383248-2'
  })
  const [savingCommercial, setSavingCommercial] = useState(false)
  const [pendingPdfQuoteId, setPendingPdfQuoteId] = useState(null)
  const [pendingOpenCreate, setPendingOpenCreate] = useState(false)

  const fetchCommercialConfig = async () => {
    try {
      const res = await fetch('/api/quotes/config')
      if (res.ok) {
        const data = await res.json()
        setCommercialConfig(data)
        setCommercialForm({
          merchant_commercial_name: data.merchant_commercial_name || 'Experiencia Sustentable',
          merchant_commercial_address: data.merchant_commercial_address || 'Zeballos 1726, Rosario, Santa Fe, Argentina',
          merchant_phone: data.merchant_phone || '+54 9 3412 59-0161',
          merchant_email: data.merchant_email || '',
          show_legal_name: Boolean(data.show_legal_name),
          legal_name: data.legal_name || 'GENTILI FRANCO AGUSTIN',
          show_cuit: Boolean(data.show_cuit),
          cuit: data.cuit || '20-31383248-2'
        })
      }
    } catch (err) {
      console.error('Error fetching commercial config:', err)
    }
  }

  const handleSaveCommercialConfig = async (e) => {
    if (e) e.preventDefault()
    if (!commercialForm.merchant_commercial_address?.trim()) {
      alert('Por favor ingresa la Dirección Comercial.')
      return
    }
    setSavingCommercial(true)
    try {
      const res = await fetch('/api/quotes/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(commercialForm)
      })
      if (res.ok) {
        setCommercialConfig({
          ...commercialConfig,
          ...commercialForm,
          has_commercial_address: true
        })
        setShowCommercialModal(false)
        alert('¡Datos de presupuesto guardados con éxito!')
        
        if (pendingPdfQuoteId) {
          const token = encodeURIComponent(localStorage.getItem('adminToken') || '')
          window.open(`/api/quotes/${pendingPdfQuoteId}/pdf?token=${token}`, '_blank')
          setPendingPdfQuoteId(null)
        } else if (pendingOpenCreate) {
          setPendingOpenCreate(false)
          setEditingQuote(null)
          setFormData(initialQuoteForm)
          setShowCreateModal(true)
        }
      } else {
        const err = await res.json().catch(() => ({}))
        alert('Error al guardar datos comerciales: ' + (err.detail || 'Error del servidor'))
      }
    } catch (err) {
      alert('Error de conexión: ' + err.message)
    } finally {
      setSavingCommercial(false)
    }
  }

  const fetchQuotes = async (forceSpinner = false) => {
    if (forceSpinner || (!getCachedData(CacheKeys.QUOTES) && quotes.length === 0)) {
      setLoading(true)
    }
    try {
      const res = await fetch('/api/quotes/')
      if (res.ok) {
        const data = await res.json()
        const fetched = data.quotes || []
        setQuotes(fetched)
        setCachedData(CacheKeys.QUOTES, fetched)
      }
    } catch (err) {
      console.error('Error fetching quotes:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchInventory = async () => {
    const existing = getCachedData(CacheKeys.INVENTORY_SUMMARY) || getCachedData(CacheKeys.INVENTORY)
    if (existing && existing.length > 0) {
      setInventory(existing)
      return
    }
    try {
      const res = await fetch('/api/inventory/?summary=true')
      if (res.ok) {
        const data = await res.json()
        const prods = data.products || []
        setInventory(prods)
        setCachedData(CacheKeys.INVENTORY_SUMMARY, prods)
      }
    } catch (err) {
      console.error('Error fetching inventory:', err)
    }
  }

  useEffect(() => {
    fetchQuotes()
    fetchInventory()
    fetchCommercialConfig()
  }, [])

  useEffect(() => {
    if (showCreateModal && (!inventory || inventory.length === 0)) {
      fetchInventory()
    }
  }, [showCreateModal, inventory?.length])

  // KPI Calculations
  const metrics = useMemo(() => {
    const total = quotes.length
    const pending = quotes.filter(q => q.status === 'pending' && !q.is_expired)
    const pendingAmount = pending.reduce((sum, q) => sum + (Number(q.total_amount) || 0), 0)
    
    const approved = quotes.filter(q => q.status === 'approved')
    const approvedAmount = approved.reduce((sum, q) => sum + (Number(q.total_amount) || 0), 0)
    
    const expired = quotes.filter(q => q.is_expired || q.status === 'expired')
    const conversionRate = total > 0 ? Math.round((approved.length / total) * 100) : 0

    return {
      total,
      pendingCount: pending.length,
      pendingAmount,
      approvedCount: approved.length,
      approvedAmount,
      expiredCount: expired.length,
      conversionRate
    }
  }, [quotes])

  // Filtered Quotes
  const filteredQuotes = useMemo(() => {
    return quotes.filter(q => {
      // Status filter
      if (statusFilter === 'pending') {
        if (q.status !== 'pending' || q.is_expired) return false
      } else if (statusFilter === 'approved') {
        if (q.status !== 'approved') return false
      } else if (statusFilter === 'expired') {
        if (!q.is_expired && q.status !== 'expired') return false
      } else if (statusFilter === 'cancelled') {
        if (q.status !== 'cancelled') return false
      }

      // Search filter (multi-word, accent-insensitive, flexible phone/doc)
      if (searchTerm.trim()) {
        const targets = [
          q.customer_name,
          q.quote_number,
          q.customer_phone,
          q.customer_doc,
          q.title,
          q.notes
        ]
        if (matchesQuery(targets, searchTerm)) return true
        if (matchesPhoneOrDoc(q.customer_phone, searchTerm)) return true
        if (matchesPhoneOrDoc(q.customer_doc, searchTerm)) return true
        if (matchesPhoneOrDoc(q.quote_number, searchTerm)) return true
        return false
      }

      return true
    })
  }, [quotes, statusFilter, searchTerm])

  // Pricing helper according to price source
  const getProductPriceBySource = (product, source) => {
    if (!product) return 0
    if (source === 'mercadolibre') {
      return Math.round(Number(product.price) || 0)
    }
    if (source === 'web') {
      const pWeb = Number(product.price_web) || 0
      return Math.round(pWeb > 0 ? pWeb : (Number(product.price) || 0))
    }
    if (source === 'cash_discount') {
      const pWeb = Number(product.price_web) || 0
      const base = pWeb > 0 ? pWeb : (Number(product.price) || 0)
      const disc = Number(product.cash_discount_pct) || 0
      return disc > 0 ? Math.round(base * (1 - disc / 100)) : Math.round(base)
    }
    if (source === 'tiendanube') {
      const pTn = Number(product.price_tn) || 0
      const pWeb = Number(product.price_web) || 0
      return Math.round(pTn > 0 ? pTn : (pWeb > 0 ? pWeb : (Number(product.price) || 0)))
    }
    return Math.round(Number(product.price_web) || Number(product.price) || 0)
  }

  // Handle changing price source inside form
  const handlePriceSourceChange = (newSource) => {
    setFormData(prev => {
      const updatedItems = prev.items.map(item => {
        const prod = inventory.find(p => p.ml_id === item.id)
        if (prod) {
          const newPrice = getProductPriceBySource(prod, newSource)
          return { ...item, price: newPrice }
        }
        return item
      })
      return {
        ...prev,
        price_source: newSource,
        items: updatedItems
      }
    })
  }

  // Handle adding product from autocomplete
  const handleSelectProduct = (index, prodId) => {
    const selectedProduct = inventory.find(p => p.ml_id === prodId)
    setFormData(prev => {
      const updated = [...prev.items]
      if (selectedProduct) {
        const price = getProductPriceBySource(selectedProduct, prev.price_source)
        updated[index] = {
          ...updated[index],
          id: prodId,
          sku: selectedProduct.sku || prodId,
          title: selectedProduct.title,
          price: price
        }
      }
      return { ...prev, items: updated }
    })
    setActiveSearchIdx(null)
    setCustomSearchQuery('')
  }

  const handleItemChange = (index, field, value) => {
    setFormData(prev => {
      const updated = [...prev.items]
      updated[index] = {
        ...updated[index],
        [field]: field === 'quantity' ? parseInt(value) || 0 : field === 'price' ? parseFloat(value) || 0 : value
      }
      return { ...prev, items: updated }
    })
  }

  const handleAddItem = () => {
    const nextIdx = formData.items.length
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { id: `manual-${Date.now()}`, title: '', quantity: 1, price: 0, sku: '' }]
    }))
    setActiveSearchIdx(nextIdx)
  }

  const handleRemoveItem = (index) => {
    if (formData.items.length === 1) return
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index)
    }))
  }

  const calculateTotal = (items) => {
    return (items || []).reduce((sum, it) => sum + ((Number(it.price) || 0) * (parseInt(it.quantity) || 0)), 0)
  }

  // Submit quote (Create or Edit)
  const handleSaveQuote = async (downloadAfter = false) => {
    if (!formData.customer_name.trim()) {
      alert('Por favor, indicá el nombre del cliente.')
      return
    }
    const hasInvalid = formData.items.some(it => !it.title || it.quantity <= 0)
    if (hasInvalid) {
      alert('Revisá los productos: todos deben tener título y cantidad mayor a 0.')
      return
    }

    setSubmitting(true)
    const payload = {
      customer_name: formData.customer_name,
      customer_doc: formData.customer_doc,
      customer_email: formData.customer_email,
      customer_phone: formData.customer_phone,
      customer_address: formData.customer_address,
      price_source: formData.price_source,
      items: formData.items,
      total_amount: calculateTotal(formData.items),
      valid_days: parseInt(formData.valid_days) || 7,
      notes: formData.notes
    }

    try {
      const url = editingQuote ? `/api/quotes/${editingQuote.id}` : '/api/quotes/'
      const method = editingQuote ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        const resData = await res.json()
        const savedQuote = resData.quote
        alert(editingQuote ? '¡Presupuesto actualizado con éxito!' : (cloningFromQuote ? `¡Presupuesto clonado con éxito (#${savedQuote.quote_number})!` : `¡Presupuesto #${savedQuote.quote_number} creado con éxito!`))
        setShowCreateModal(false)
        setEditingQuote(null)
        setCloningFromQuote(null)
        setFormData(initialQuoteForm)
        invalidateCache('quotes')
        await fetchQuotes(true)

        if (downloadAfter && savedQuote?.id) {
          if (!commercialConfig.merchant_commercial_address?.trim()) {
            setPendingPdfQuoteId(savedQuote.id)
            setShowCommercialModal(true)
          } else {
            const token = encodeURIComponent(localStorage.getItem('adminToken') || '')
            window.open(`/api/quotes/${savedQuote.id}/pdf?token=${token}`, '_blank')
          }
        }
      } else {
        const err = await res.json().catch(() => ({}))
        alert('Error al guardar presupuesto: ' + (err.detail || 'Error desconocido'))
      }
    } catch (err) {
      alert('Error de conexión: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Open Cobrar Modal & fetch candidate transfers
  const handleOpenCobrarModal = async (q) => {
    setConvertingQuote(q)
    setConvertMode('cash')
    setSelectedTransferId('')
    setManualTransferId('')
    setManualLookupResult(null)
    setCandidateTransfers([])
    setLoadingCandidates(true)
    setConvertForm({
      payment_method: 'Efectivo',
      shipping_status: 'delivered',
      auto_invoice: false,
      invoice_type: 'B'
    })

    try {
      const res = await fetch(`/api/quotes/${q.id}/candidate-transfers`)
      if (res.ok) {
        const data = await res.json()
        const cands = data.candidates || []
        setCandidateTransfers(cands)
        // If an exact match is found, auto-select it and switch to link_transfer mode
        const exactMatch = cands.find(c => c.is_exact_match)
        if (exactMatch) {
          setSelectedTransferId(String(exactMatch.order_id))
          setConvertMode('link_transfer')
        } else if (cands.length > 0 && (cands[0].name_match || cands[0].is_close_match)) {
          setSelectedTransferId(String(cands[0].order_id))
          setConvertMode('link_transfer')
        }
      }
    } catch (err) {
      console.error('Error fetching candidate transfers:', err)
    } finally {
      setLoadingCandidates(false)
    }
  }

  // Lookup manual order/transfer ID
  const handleLookupManualTransfer = async () => {
    const val = String(manualTransferId).trim()
    if (!val) return
    setManualLookupLoading(true)
    setManualLookupResult(null)
    try {
      const res = await fetch(`/api/quotes/lookup-transfer/${encodeURIComponent(val)}`)
      if (res.ok) {
        const data = await res.json()
        setManualLookupResult(data)
        if (data.found && !data.already_linked) {
          setSelectedTransferId(val)
        }
      } else {
        const err = await res.json().catch(() => ({}))
        setManualLookupResult({ error: err.detail || 'No se encontró la orden' })
      }
    } catch (err) {
      setManualLookupResult({ error: 'Error de conexión: ' + err.message })
    } finally {
      setManualLookupLoading(false)
    }
  }

  // Convert quote to confirmed sale order (cash or linking existing transfer)
  const handleConfirmConvert = async () => {
    if (!convertingQuote) return

    const isLinkMode = (convertMode === 'link_transfer')
    let finalTransferId = null
    if (isLinkMode) {
      finalTransferId = selectedTransferId || manualTransferId
      if (!finalTransferId) {
        alert('Por favor selecciona una transferencia de la lista o ingresa el N° de orden / ID de cobro de Mercado Pago.')
        return
      }
    }

    setSubmitting(true)

    try {
      const payload = {
        mode: isLinkMode ? 'link_transfer' : 'cash',
        existing_order_id: isLinkMode ? parseInt(finalTransferId) : null,
        payment_method: isLinkMode ? 'Transferencia (Mercado Pago)' : convertForm.payment_method,
        shipping_status: convertForm.shipping_status,
        auto_invoice: convertForm.auto_invoice,
        invoice_type: convertForm.invoice_type
      }

      const res = await fetch(`/api/quotes/${convertingQuote.id}/convert-to-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        const data = await res.json()
        alert(`🎉 ${data.message || 'Presupuesto cobrado con éxito.'}`)
        setConvertingQuote(null)
        invalidateCache('quotes')
        invalidateCache('sales')
        await fetchQuotes(true)
      } else {
        const err = await res.json().catch(() => ({}))
        alert('Error al confirmar cobro: ' + (err.detail || 'Error desconocido'))
      }
    } catch (err) {
      alert('Error de conexión: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Delete quote
  const handleDeleteQuote = async (quoteId, quoteNum) => {
    if (!window.confirm(`¿Estás seguro de eliminar el presupuesto #${quoteNum}? Esta acción no se puede deshacer.`)) {
      return
    }
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, { method: 'DELETE' })
      if (res.ok) {
        invalidateCache('quotes')
        setQuotes(prev => prev.filter(q => q.id !== quoteId))
      } else {
        alert('Error al eliminar presupuesto')
      }
    } catch (err) {
      alert('Error de conexión: ' + err.message)
    }
  }

  // Send WhatsApp message
  const handleOpenWhatsApp = (q) => {
    const rawPhone = (q.customer_phone || '').replace(/\D/g, '')
    if (!rawPhone) {
      alert('El presupuesto no tiene un número de teléfono cargado.')
      return
    }
    const phone = rawPhone.startsWith('54') ? rawPhone : `549${rawPhone}`
    const text = encodeURIComponent(
      `¡Hola ${q.customer_name}! Te enviamos el presupuesto solicitado #${q.quote_number} por un total de $${Number(q.total_amount).toLocaleString('es-AR')}.\n` +
      `Quedamos a tu entera disposición ante cualquier consulta. ¡Muchas gracias!`
    )
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank')
  }

  // Open Edit Modal
  const handleOpenEdit = (q) => {
    setCloningFromQuote(null)
    setEditingQuote(q)
    setFormData({
      customer_name: q.customer_name || '',
      customer_doc: q.customer_doc || '',
      customer_email: q.customer_email || '',
      customer_phone: q.customer_phone || '',
      customer_address: q.customer_address || '',
      price_source: q.price_source || 'web',
      valid_days: q.valid_days || 7,
      notes: q.notes || '',
      items: q.items && q.items.length > 0 ? q.items : [{ id: `manual-${Date.now()}`, title: '', quantity: 1, price: 0, sku: '' }]
    })
    setShowCreateModal(true)
  }

  // Open Clone Modal
  const handleOpenClone = (q) => {
    setEditingQuote(null)
    setCloningFromQuote(q)
    setFormData({
      customer_name: q.customer_name || '',
      customer_doc: q.customer_doc || '',
      customer_email: q.customer_email || '',
      customer_phone: q.customer_phone || '',
      customer_address: q.customer_address || '',
      price_source: q.price_source || 'web',
      valid_days: q.valid_days || 7,
      notes: q.notes || '',
      items: q.items && q.items.length > 0
        ? q.items.map((it, idx) => ({ ...it, id: `cloned-${Date.now()}-${idx}` }))
        : [{ id: `manual-${Date.now()}`, title: '', quantity: 1, price: 0, sku: '' }]
    })
    setShowCreateModal(true)
  }

  // Format dates helper
  const formatDateDisplay = (dtStr) => {
    if (!dtStr) return '-'
    return formatDateTimeAR(dtStr, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) || '-'
  }

  // Badge mapping for price sources
  const getPriceSourceBadge = (src) => {
    switch (src) {
      case 'mercadolibre':
        return <span style={{fontSize: '0.72rem', padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(234, 179, 8, 0.15)', color: '#ca8a04', fontWeight: 600}}>🟡 ML</span>
      case 'cash_discount':
        return <span style={{fontSize: '0.72rem', padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#059669', fontWeight: 600}}>💵 Efvo Desc</span>
      case 'tiendanube':
        return <span style={{fontSize: '0.72rem', padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#2563eb', fontWeight: 600}}>🛍️ TN</span>
      default:
        return <span style={{fontSize: '0.72rem', padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(99, 102, 241, 0.15)', color: '#4f46e5', fontWeight: 600}}>🌐 Web</span>
    }
  }

  return (
    <div className="quotes-page-container" style={{padding: '20px 24px', maxWidth: 1400, margin: '0 auto'}}>
      
      {/* Top Header */}
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12}}>
        <div>
          <h1 style={{margin: 0, fontSize: '1.6rem', display: 'flex', alignItems: 'center', gap: 10}}>
            <FileText size={26} color="var(--accent-blue)" /> Presupuestos & Cotizaciones
          </h1>
          <p style={{margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem'}}>
            Armá cotizaciones oficiales con validez por días, descargá el PDF corporativo o confirmalas a venta en un clic.
          </p>
        </div>

        <div style={{display: 'flex', gap: 10}}>
          <button 
            className="btn" 
            onClick={fetchQuotes} 
            title="Recargar listado"
            style={{backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)'}}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>

          <button 
            className="btn" 
            onClick={() => {
              setPendingPdfQuoteId(null)
              setPendingOpenCreate(false)
              setShowCommercialModal(true)
            }}
            title="Configurar Nombre Comercial, Dirección y Datos para el membrete de Presupuestos"
            style={{
              display: 'flex', 
              alignItems: 'center', 
              gap: 6, 
              padding: '9px 14px', 
              fontWeight: 600,
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)'
            }}
          >
            <Building size={16} color="var(--accent-blue)" /> Membrete de Presupuesto
          </button>

          <button 
            className="btn btn-primary" 
            onClick={() => {
              if (!commercialConfig.merchant_commercial_address?.trim()) {
                setPendingOpenCreate(true)
                setShowCommercialModal(true)
                return
              }
              setEditingQuote(null)
              setCloningFromQuote(null)
              setFormData(initialQuoteForm)
              setShowCreateModal(true)
            }}
            style={{display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', fontWeight: 600}}
          >
            <Plus size={18} /> Nuevo Presupuesto
          </button>
        </div>
      </div>

      {/* Banner de alerta si falta dirección comercial */}
      {!commercialConfig.merchant_commercial_address?.trim() && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          marginBottom: 18,
          borderRadius: 10,
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          gap: 12,
          flexWrap: 'wrap'
        }}>
          <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
            <AlertTriangle size={22} color="#d97706" />
            <div>
              <div style={{fontWeight: 700, fontSize: '0.92rem', color: '#b45309'}}>
                Falta configurar la Dirección Comercial para tus presupuestos
              </div>
              <div style={{fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 2}}>
                Indica la dirección del local comercial (ej. Zeballos 1726, Rosario) para que se imprima en el membrete del PDF en lugar de la dirección fiscal.
              </div>
            </div>
          </div>
          <button
            className="btn"
            onClick={() => setShowCommercialModal(true)}
            style={{backgroundColor: '#d97706', color: '#fff', fontWeight: 700, fontSize: '0.84rem', padding: '7px 16px', display: 'flex', alignItems: 'center', gap: 6}}
          >
            <MapPin size={16} /> Configurar Dirección Ahora
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20}}>
        {/* Vigentes / Pendientes */}
        <div style={{
          backgroundColor: 'var(--bg-card)', 
          border: '1px solid var(--border-color)', 
          borderRadius: 12, 
          padding: '14px 18px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600}}>⏳ PENDIENTES DE COBRO</span>
            <span style={{backgroundColor: 'rgba(59, 130, 246, 0.12)', color: 'var(--accent-blue)', padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700}}>
              {metrics.pendingCount}
            </span>
          </div>
          <div style={{fontSize: '1.4rem', fontWeight: 700, marginTop: 6, color: 'var(--text-primary)'}}>
            ${metrics.pendingAmount.toLocaleString('es-AR')}
          </div>
          <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4}}>
            Cotizaciones vigentes pendientes de cobrar
          </div>
        </div>

        {/* Concretados / Cobrados */}
        <div style={{
          backgroundColor: 'var(--bg-card)', 
          border: '1px solid var(--border-color)', 
          borderRadius: 12, 
          padding: '14px 18px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600}}>✅ COBRADOS (VENTAS)</span>
            <span style={{backgroundColor: 'rgba(16, 185, 129, 0.12)', color: 'var(--accent-emerald)', padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700}}>
              {metrics.approvedCount}
            </span>
          </div>
          <div style={{fontSize: '1.4rem', fontWeight: 700, marginTop: 6, color: 'var(--accent-emerald)'}}>
            ${metrics.approvedAmount.toLocaleString('es-AR')}
          </div>
          <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4}}>
            Presupuestos cobrados y convertidos a venta
          </div>
        </div>

        {/* Vencidos */}
        <div style={{
          backgroundColor: 'var(--bg-card)', 
          border: '1px solid var(--border-color)', 
          borderRadius: 12, 
          padding: '14px 18px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600}}>⚠️ VENCIDOS (NO COBRADOS)</span>
            <span style={{backgroundColor: 'rgba(239, 68, 68, 0.12)', color: 'var(--accent-red)', padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700}}>
              {metrics.expiredCount}
            </span>
          </div>
          <div style={{fontSize: '1.4rem', fontWeight: 700, marginTop: 6, color: 'var(--accent-red)'}}>
            {metrics.expiredCount} cotizaciones
          </div>
          <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4}}>
            Superaron los días de validez fijados
          </div>
        </div>

        {/* Tasa de Cierre */}
        <div style={{
          backgroundColor: 'var(--bg-card)', 
          border: '1px solid var(--border-color)', 
          borderRadius: 12, 
          padding: '14px 18px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600}}>📈 EFECTIVIDAD / CIERRE</span>
            <span style={{backgroundColor: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6', padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700}}>
              {metrics.conversionRate}%
            </span>
          </div>
          <div style={{fontSize: '1.4rem', fontWeight: 700, marginTop: 6, color: '#8b5cf6'}}>
            {metrics.conversionRate}%
          </div>
          <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4}}>
            Tasa de presupuestos cobrados
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        gap: 12, 
        marginBottom: 16, 
        flexWrap: 'wrap',
        backgroundColor: 'var(--bg-card)',
        padding: '10px 14px',
        borderRadius: 10,
        border: '1px solid var(--border-color)'
      }}>
        {/* Search */}
        <div style={{display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 240}}>
          <Search size={18} color="var(--text-secondary)" />
          <input 
            type="text" 
            placeholder="Buscar por cliente, N° presupuesto, teléfono o CUIT..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              width: '100%', 
              border: 'none', 
              outline: 'none', 
              backgroundColor: 'transparent',
              fontSize: '0.88rem',
              color: 'var(--text-primary)'
            }}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} style={{border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)'}}>
              <X size={16} />
            </button>
          )}
        </div>

        {/* Status Pills */}
        <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
          {[
            { id: 'all', label: 'Todos' },
            { id: 'pending', label: '⏳ Pendientes de cobro' },
            { id: 'approved', label: '✅ Cobrados' },
            { id: 'expired', label: '⚠️ Vencidos' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              style={{
                padding: '6px 12px',
                borderRadius: 20,
                fontSize: '0.8rem',
                fontWeight: 600,
                border: '1px solid',
                borderColor: statusFilter === tab.id ? 'var(--accent-blue)' : 'var(--border-color)',
                backgroundColor: statusFilter === tab.id ? 'var(--accent-blue)' : 'transparent',
                color: statusFilter === tab.id ? '#ffffff' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.18s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Quotes Table */}
      <div style={{
        backgroundColor: 'var(--bg-card)', 
        borderRadius: 12, 
        border: '1px solid var(--border-color)', 
        overflow: 'hidden',
        boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
      }}>
        {loading ? (
          <div style={{padding: 40, textAlign: 'center', color: 'var(--text-secondary)'}}>
            <RefreshCw size={24} className="animate-spin" style={{margin: '0 auto 10px'}} />
            Cargando presupuestos...
          </div>
        ) : filteredQuotes.length === 0 ? (
          <div style={{padding: 50, textAlign: 'center', color: 'var(--text-secondary)'}}>
            <FileText size={36} style={{margin: '0 auto 12px', opacity: 0.4}} />
            <h4 style={{margin: '0 0 6px', color: 'var(--text-primary)'}}>No se encontraron presupuestos</h4>
            <p style={{margin: 0, fontSize: '0.85rem'}}>Podés crear uno nuevo haciendo clic en "+ Nuevo Presupuesto".</p>
          </div>
        ) : (
          <div style={{overflowX: 'auto'}}>
            <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left'}}>
              <thead>
                <tr style={{backgroundColor: 'var(--bg-hover)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)'}}>
                  <th style={{padding: '12px 14px', fontWeight: 600}}>N° Presupuesto</th>
                  <th style={{padding: '12px 14px', fontWeight: 600}}>Cliente</th>
                  <th style={{padding: '12px 14px', fontWeight: 600}}>Fecha Emisión</th>
                  <th style={{padding: '12px 14px', fontWeight: 600}}>Validez</th>
                  <th style={{padding: '12px 14px', fontWeight: 600}}>Total</th>
                  <th style={{padding: '12px 14px', fontWeight: 600}}>Lista Precios</th>
                  <th style={{padding: '12px 14px', fontWeight: 600}}>Operador</th>
                  <th style={{padding: '12px 14px', fontWeight: 600}}>Estado</th>
                  <th style={{padding: '12px 14px', fontWeight: 600}}>Fecha Finalización</th>
                  <th style={{padding: '12px 14px', fontWeight: 600, textAlign: 'right'}}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotes.map((q) => {
                  const isApproved = q.status === 'approved'
                  const isExpired = q.is_expired || q.status === 'expired'
                  
                  return (
                    <tr key={q.id} style={{borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.15s'}}>
                      {/* N° Presupuesto */}
                      <td style={{padding: '12px 14px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)'}}>
                        {q.quote_number}
                      </td>

                      {/* Cliente */}
                      <td style={{padding: '12px 14px'}}>
                        <div style={{fontWeight: 600, color: 'var(--text-primary)'}}>{q.customer_name}</div>
                        <div style={{fontSize: '0.73rem', color: 'var(--text-secondary)', display: 'flex', gap: 6, marginTop: 2}}>
                          {q.customer_phone && <span>📞 {q.customer_phone}</span>}
                          {q.customer_doc && <span>🆔 {q.customer_doc}</span>}
                        </div>
                      </td>

                      {/* Fecha Emisión */}
                      <td style={{padding: '12px 14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap'}}>
                        {formatDateDisplay(q.created_at)}
                      </td>

                      {/* Validez */}
                      <td style={{padding: '12px 14px', whiteSpace: 'nowrap'}}>
                        <div style={{fontSize: '0.8rem', fontWeight: 500}}>
                          {q.valid_days} días
                        </div>
                        <div style={{fontSize: '0.72rem', color: isExpired ? 'var(--accent-red)' : 'var(--text-secondary)'}}>
                          Hasta {formatDateDisplay(q.valid_until).split(' ')[0]}
                        </div>
                      </td>

                      {/* Total */}
                      <td style={{padding: '12px 14px', fontWeight: 700, fontSize: '0.95rem', color: 'var(--accent-emerald)', whiteSpace: 'nowrap'}}>
                        ${Number(q.total_amount || 0).toLocaleString('es-AR')}
                      </td>

                      {/* Lista Precios */}
                      <td style={{padding: '12px 14px'}}>
                        {getPriceSourceBadge(q.price_source)}
                      </td>

                      {/* Operador (Discreto) */}
                      <td style={{padding: '12px 14px'}}>
                        <div 
                          title={`Elaborado por operador: ${q.created_by_user || 'Admin'}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.72rem',
                            color: 'var(--text-secondary)',
                            backgroundColor: 'var(--bg-hover)',
                            padding: '2px 7px',
                            borderRadius: '12px',
                            border: '1px solid var(--border-color)',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <User size={11} style={{ opacity: 0.7, color: 'var(--accent-blue)' }} />
                          <span>{q.created_by_user || 'Admin'}</span>
                        </div>
                      </td>

                      {/* Estado */}
                      <td style={{padding: '12px 14px'}}>
                        {isApproved ? (
                          <span style={{
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: 5, 
                            padding: '4px 10px', 
                            borderRadius: 12, 
                            fontSize: '0.75rem', 
                            fontWeight: 700, 
                            backgroundColor: 'rgba(16, 185, 129, 0.12)', 
                            color: 'var(--accent-emerald)',
                            border: '1px solid rgba(16, 185, 129, 0.25)'
                          }}>
                            <CheckCircle2 size={13} /> Cobrado
                          </span>
                        ) : isExpired ? (
                          <span style={{
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: 5, 
                            padding: '4px 10px', 
                            borderRadius: 12, 
                            fontSize: '0.75rem', 
                            fontWeight: 700, 
                            backgroundColor: 'rgba(239, 68, 68, 0.12)', 
                            color: 'var(--accent-red)',
                            border: '1px solid rgba(239, 68, 68, 0.25)'
                          }}>
                            <AlertTriangle size={13} /> Vencido (No cobrado)
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: 5, 
                            padding: '4px 10px', 
                            borderRadius: 12, 
                            fontSize: '0.75rem', 
                            fontWeight: 700, 
                            backgroundColor: 'rgba(59, 130, 246, 0.12)', 
                            color: 'var(--accent-blue)',
                            border: '1px solid rgba(59, 130, 246, 0.25)'
                          }}>
                            <Clock size={13} /> Pendiente de cobro
                          </span>
                        )}
                      </td>

                      {/* Fecha Finalización */}
                      <td style={{padding: '12px 14px', whiteSpace: 'nowrap', color: q.completed_at ? 'var(--accent-emerald)' : 'var(--text-secondary)'}}>
                        {q.completed_at ? (
                          <div>
                            <div style={{fontWeight: 600}}>{formatDateDisplay(q.completed_at)}</div>
                            {q.order_id && (
                              <a
                                href={`/sales?search=${q.order_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Ver orden en el módulo de Ventas"
                                style={{fontSize: '0.72rem', color: 'var(--accent-blue)', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 2}}
                              >
                                Orden #{q.order_id} <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        ) : (
                          <span>-</span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td style={{padding: '12px 14px', textAlign: 'right'}}>
                        <div style={{display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center'}}>
                          
                          {/* Confirm Sale / Cobrar */}
                          {!isApproved ? (
                            <button
                              onClick={() => handleOpenCobrarModal(q)}
                              title="Registrar cobro: Efectivo o asociar a transferencia de Ventas"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '5px 11px',
                                borderRadius: 6,
                                border: '1px solid rgba(16, 185, 129, 0.4)',
                                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                color: 'var(--accent-emerald)',
                                cursor: 'pointer',
                                fontSize: '0.78rem',
                                fontWeight: 700
                              }}
                            >
                              <DollarSign size={13} /> Cobrar
                            </button>
                          ) : (
                            <a
                              href={`/sales?search=${q.order_id || q.quote_number}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Presupuesto cobrado. Ver venta #${q.order_id || ''}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '4px 8px',
                                borderRadius: 6,
                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                                color: 'var(--accent-emerald)',
                                textDecoration: 'none',
                                fontSize: '0.72rem',
                                fontWeight: 600
                              }}
                            >
                              <CheckCircle2 size={12} /> Cobrado
                            </a>
                          )}

                          {/* PDF Download */}
                          <a
                            href={`/api/quotes/${q.id}/pdf?token=${encodeURIComponent(localStorage.getItem('adminToken') || '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Descargar o imprimir PDF"
                            onClick={(e) => {
                              if (!commercialConfig.merchant_commercial_address?.trim()) {
                                e.preventDefault()
                                setPendingPdfQuoteId(q.id)
                                setShowCommercialModal(true)
                              }
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              border: '1px solid var(--border-color)',
                              backgroundColor: 'var(--bg-hover)',
                              color: 'var(--text-primary)',
                              textDecoration: 'none'
                            }}
                          >
                            <Download size={14} />
                          </a>

                          {/* WhatsApp */}
                          {q.customer_phone && (
                            <button
                              onClick={() => handleOpenWhatsApp(q)}
                              title="Enviar cotización por WhatsApp"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                border: '1px solid rgba(37, 211, 102, 0.3)',
                                backgroundColor: 'rgba(37, 211, 102, 0.12)',
                                color: '#16a34a',
                                cursor: 'pointer'
                              }}
                            >
                              <MessageCircle size={14} />
                            </button>
                          )}

                          {/* Edit */}
                          {!isApproved && (
                            <button
                              onClick={() => handleOpenEdit(q)}
                              title="Editar presupuesto"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                border: '1px solid var(--border-color)',
                                backgroundColor: 'var(--bg-hover)',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer'
                              }}
                            >
                              <Edit3 size={13} />
                            </button>
                          )}

                          {/* Clone */}
                          <button
                            onClick={() => handleOpenClone(q)}
                            title={`Clonar presupuesto #${q.quote_number}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              border: '1px solid var(--border-color)',
                              backgroundColor: 'var(--bg-hover)',
                              color: 'var(--accent-blue, #2563eb)',
                              cursor: 'pointer'
                            }}
                          >
                            <Copy size={13} />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDeleteQuote(q.id, q.quote_number)}
                            title="Eliminar presupuesto"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              border: '1px solid var(--border-color)',
                              backgroundColor: 'var(--bg-hover)',
                              color: 'var(--accent-red)',
                              cursor: 'pointer'
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: Crear / Editar Presupuesto */}
      {/* ========================================================================= */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: isMobile ? 8 : 16
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: isMobile ? 10 : 14,
            border: '1px solid var(--border-color)',
            width: '100%',
            maxWidth: isMobile ? '100%' : 'min(1150px, 96vw)',
            maxHeight: isMobile ? '96vh' : '94vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: isMobile ? '12px 16px' : '16px 20px', 
              borderBottom: '1px solid var(--border-color)', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{margin: 0, fontSize: isMobile ? '1.05rem' : '1.2rem', display: 'flex', alignItems: 'center', gap: 8}}>
                  <FileText size={20} color="var(--accent-blue)" /> 
                  {editingQuote 
                    ? `Editar Presupuesto #${editingQuote.quote_number}` 
                    : cloningFromQuote 
                      ? `Clonar Presupuesto #${cloningFromQuote.quote_number} (Nueva Cotización)` 
                      : 'Armar Nuevo Presupuesto'}
                </h3>
                <span style={{fontSize: '0.78rem', color: 'var(--text-secondary)'}}>
                  El stock no se reservará ni descontará hasta que el cliente abone y se confirme la venta.
                </span>
              </div>
              <button 
                onClick={() => {
                  setShowCreateModal(false)
                  setEditingQuote(null)
                  setCloningFromQuote(null)
                }}
                style={{border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4}}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{
              flex: 1, 
              overflowY: 'auto', 
              padding: isMobile ? '12px 12px 100px 12px' : '18px 22px 120px 22px', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: 16
            }}>
              
              {/* Banner de Clonación */}
              {cloningFromQuote && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: '0.85rem',
                  color: 'var(--text-primary)'
                }}>
                  <Copy size={16} color="var(--accent-blue)" style={{flexShrink: 0}} />
                  <div>
                    <strong>Clonando a partir del Presupuesto #{cloningFromQuote.quote_number}:</strong>
                    <span style={{ marginLeft: 6, color: 'var(--text-secondary)' }}>
                      Se generará una nueva cotización independiente con número correlativo y vigencia actual. Podés modificar los productos o datos antes de guardar.
                    </span>
                  </div>
                </div>
              )}

              {/* Membrete Emisor Bar */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'rgba(59, 130, 246, 0.07)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: '0.8rem',
                flexWrap: 'wrap',
                gap: 8
              }}>
                <div style={{display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)'}}>
                  <Building size={16} color="var(--accent-blue)" />
                  <span>
                    <b>Membrete PDF:</b> {commercialConfig.merchant_commercial_name} · {commercialConfig.merchant_commercial_address || 'Sin dirección'}
                    {commercialConfig.show_legal_name ? ` · R. Social: ${commercialConfig.legal_name}` : ''}
                    {commercialConfig.show_cuit ? ` · CUIT: ${commercialConfig.cuit}` : ''}
                    {!commercialConfig.show_legal_name && !commercialConfig.show_cuit ? ' · (Razón Social y CUIT desactivados)' : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCommercialModal(true)}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: 'var(--accent-blue)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    textDecoration: 'underline'
                  }}
                >
                  Configurar membrete
                </button>
              </div>

              {/* Row 1: Lista de Precios & Validez */}
              <div style={{
                display: 'grid', 
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))', 
                gap: 12,
                backgroundColor: 'var(--bg-hover)',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid var(--border-color)'
              }}>
                <div>
                  <label style={{display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: 'var(--accent-blue)'}}>
                    🏷️ Lista de Precios de Origen
                  </label>
                  <select 
                    value={formData.price_source}
                    onChange={e => handlePriceSourceChange(e.target.value)}
                    style={{
                      width: '100%', 
                      padding: '7px 10px', 
                      borderRadius: 6, 
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      fontWeight: 600
                    }}
                  >
                    <option value="web">🌐 Tienda Web (Precio catálogo web)</option>
                    <option value="mercadolibre">🟡 Mercado Libre (Precio oficial ML)</option>
                    <option value="cash_discount">💵 Descuento en Efectivo (% configurado)</option>
                    <option value="tiendanube">🛍️ Tienda Nube</option>
                  </select>
                </div>

                <div>
                  <label style={{display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)'}}>
                    ⏳ Validez de la Cotización
                  </label>
                  <div style={{display: 'flex', gap: 6}}>
                    <select 
                      value={formData.valid_days}
                      onChange={e => setFormData({ ...formData, valid_days: parseInt(e.target.value) || 7 })}
                      style={{
                        flex: 1, 
                        padding: '7px 10px', 
                        borderRadius: 6, 
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--bg-card)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <option value="3">3 días corridos</option>
                      <option value="7">7 días corridos (Recomendado)</option>
                      <option value="15">15 días corridos</option>
                      <option value="30">30 días corridos</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Row 2: Datos del Cliente */}
              <div>
                <h4 style={{margin: '0 0 10px', fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6}}>
                  <User size={16} color="var(--accent-blue)" /> Datos del Cliente / Destinatario
                </h4>
                <div style={{display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10}}>
                  <div>
                    <label style={{display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 2}}>
                      Nombre / Razón Social *
                    </label>
                    <input 
                      type="text"
                      placeholder="ej: Juan Pérez o Empresa S.A."
                      value={formData.customer_name}
                      onChange={e => setFormData({ ...formData, customer_name: e.target.value })}
                      style={{width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                    />
                  </div>

                  <div>
                    <label style={{display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 2}}>
                      DNI / CUIT (Opcional)
                    </label>
                    <input 
                      type="text"
                      placeholder="ej: 30-71234567-9"
                      value={formData.customer_doc}
                      onChange={e => setFormData({ ...formData, customer_doc: e.target.value })}
                      style={{width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                    />
                  </div>

                  <div>
                    <label style={{display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 2}}>
                      WhatsApp / Teléfono
                    </label>
                    <input 
                      type="text"
                      placeholder="ej: 341 555-1234"
                      value={formData.customer_phone}
                      onChange={e => setFormData({ ...formData, customer_phone: e.target.value })}
                      style={{width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                    />
                  </div>

                  <div>
                    <label style={{display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 2}}>
                      Email
                    </label>
                    <input 
                      type="email"
                      placeholder="ej: cliente@email.com"
                      value={formData.customer_email}
                      onChange={e => setFormData({ ...formData, customer_email: e.target.value })}
                      style={{width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                    />
                  </div>
                </div>
              </div>

              {/* Row 3: Items / Productos Table */}
              <div>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
                  <h4 style={{margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6}}>
                    <Package size={16} color="var(--accent-blue)" /> Productos y Cantidades ({formData.items.length})
                  </h4>
                  <button 
                    type="button"
                    onClick={handleAddItem}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: 6,
                      backgroundColor: 'rgba(59, 130, 246, 0.12)',
                      color: 'var(--accent-blue)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    <Plus size={14} /> Agregar Producto
                  </button>
                </div>

                <div style={{
                  border: '1px solid var(--border-color)', 
                  borderRadius: 8, 
                  overflow: isMobile ? 'auto' : 'visible', 
                  position: 'relative'
                }}>
                  <table style={{width: '100%', minWidth: isMobile ? 620 : '100%', borderCollapse: 'collapse', fontSize: '0.84rem'}}>
                    <thead>
                      <tr style={{backgroundColor: 'var(--bg-hover)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)'}}>
                        <th style={{padding: '10px 12px', textAlign: 'left'}}>Producto / Artículo (Buscar en Catálogo o Personalizado)</th>
                        <th style={{padding: '10px 12px', width: 85, textAlign: 'center'}}>Cant.</th>
                        <th style={{padding: '10px 12px', width: 140, textAlign: 'right'}}>Precio Unit. ($)</th>
                        <th style={{padding: '10px 12px', width: 140, textAlign: 'right'}}>Subtotal</th>
                        <th style={{padding: '10px 12px', width: 44, textAlign: 'center'}}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.items.map((item, idx) => {
                        const itemSub = (Number(item.price) || 0) * (parseInt(item.quantity) || 0)
                        const filteredProds = inventory.filter(p => {
                          if (!item.title) return true
                          return matchesQuery([p.title, p.ml_id, p.sku], item.title)
                        }).slice(0, 20)

                        return (
                          <tr key={item.id || idx} style={{borderBottom: '1px solid var(--border-color)'}}>
                            {/* Product title with Autocomplete search */}
                            <td className="quote-item-search-cell" style={{padding: '8px 10px', position: 'relative'}}>
                              <div style={{position: 'relative', width: '100%'}}>
                                <input 
                                  type="text"
                                  placeholder="Escribí para buscar en inventario..."
                                  value={item.title}
                                  onChange={e => {
                                    handleItemChange(idx, 'title', e.target.value)
                                    setActiveSearchIdx(idx)
                                  }}
                                  onFocus={() => setActiveSearchIdx(idx)}
                                  style={{
                                    width: '100%', 
                                    padding: '8px 10px', 
                                    borderRadius: 6, 
                                    border: activeSearchIdx === idx ? '1px solid var(--accent-blue)' : '1px solid var(--border-color)', 
                                    backgroundColor: 'var(--bg-card)', 
                                    color: 'var(--text-primary)',
                                    fontSize: '0.84rem'
                                  }}
                                />

                                {/* Autocomplete Dropdown */}
                                {activeSearchIdx === idx && (item.title?.trim()?.length > 0) && (
                                  <div style={{
                                    position: 'absolute',
                                    top: 'calc(100% + 4px)',
                                    left: 0,
                                    width: 'max(100%, 540px)',
                                    maxWidth: 'calc(100vw - 40px)',
                                    zIndex: 99999,
                                    backgroundColor: 'var(--bg-card)',
                                    border: '1px solid var(--accent-blue)',
                                    borderRadius: 8,
                                    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.45)',
                                    maxHeight: 300,
                                    overflowY: 'auto'
                                  }}>
                                    <div style={{
                                      padding: '6px 12px',
                                      backgroundColor: 'var(--bg-hover)',
                                      borderBottom: '1px solid var(--border-color)',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      fontSize: '0.72rem',
                                      color: 'var(--text-secondary)'
                                    }}>
                                      <span>📦 Resultados encontrados en inventario ({filteredProds.length})</span>
                                      <span style={{fontSize: '0.68rem', color: 'var(--accent-blue)', fontWeight: 600}}>
                                        Hacé clic para cargar
                                      </span>
                                    </div>

                                    {filteredProds.length > 0 ? (
                                      filteredProds.map(p => {
                                        const pPrice = getProductPriceBySource(p, formData.price_source)
                                        return (
                                          <div
                                            key={p.ml_id}
                                            onMouseDown={() => handleSelectProduct(idx, p.ml_id)}
                                            style={{
                                              padding: '9px 12px',
                                              cursor: 'pointer',
                                              borderBottom: '1px solid var(--border-color)',
                                              display: 'flex',
                                              justifyContent: 'space-between',
                                              alignItems: 'center',
                                              gap: 12,
                                              fontSize: '0.82rem'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                          >
                                            <div style={{flex: 1, minWidth: 0}}>
                                              <div style={{fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'normal', lineHeight: 1.3}}>
                                                {p.title}
                                              </div>
                                              <div style={{color: 'var(--text-secondary)', fontSize: '0.72rem', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center'}}>
                                                <span style={{fontFamily: 'monospace'}}>{p.sku || p.ml_id}</span>
                                                <span>•</span>
                                                <span style={{color: (p.available_quantity ?? 0) > 0 ? '#10b981' : '#ef4444', fontWeight: 600}}>
                                                  Stock: {p.available_quantity ?? 0}
                                                </span>
                                              </div>
                                            </div>
                                            <div style={{textAlign: 'right', flexShrink: 0}}>
                                              <div style={{fontWeight: 700, color: 'var(--accent-emerald)', fontSize: '0.92rem'}}>
                                                ${pPrice.toLocaleString('es-AR')}
                                              </div>
                                              <div style={{fontSize: '0.68rem', color: 'var(--text-secondary)'}}>
                                                {formData.price_source === 'cash_discount' ? 'Precio Efectivo' : 'Precio Lista'}
                                              </div>
                                            </div>
                                          </div>
                                        )
                                      })
                                    ) : (
                                      <div 
                                        style={{padding: '12px 14px', fontSize: '0.8rem', color: 'var(--text-primary)', textAlign: 'center', backgroundColor: 'rgba(59, 130, 246, 0.05)'}}
                                      >
                                        <div style={{color: 'var(--text-secondary)', marginBottom: 4}}>
                                          No se encontraron productos coincidentes en el inventario.
                                        </div>
                                        <button
                                          type="button"
                                          onMouseDown={() => setActiveSearchIdx(null)}
                                          style={{
                                            border: 'none',
                                            background: 'none',
                                            color: 'var(--accent-blue)',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            fontSize: '0.8rem'
                                          }}
                                        >
                                          ✓ Usar "{item.title}" como producto personalizado
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Quantity */}
                            <td style={{padding: '8px 10px'}}>
                              <input 
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={e => handleItemChange(idx, 'quantity', e.target.value)}
                                style={{
                                  width: '100%', 
                                  textAlign: 'center', 
                                  padding: '7px 4px', 
                                  borderRadius: 6, 
                                  border: '1px solid var(--border-color)', 
                                  backgroundColor: 'var(--bg-card)', 
                                  color: 'var(--text-primary)',
                                  fontSize: '0.84rem'
                                }}
                              />
                            </td>

                            {/* Unit Price */}
                            <td style={{padding: '8px 10px'}}>
                              <input 
                                type="number"
                                min="0"
                                step="any"
                                value={item.price}
                                onChange={e => handleItemChange(idx, 'price', e.target.value)}
                                style={{
                                  width: '100%', 
                                  textAlign: 'right', 
                                  padding: '7px 8px', 
                                  borderRadius: 6, 
                                  border: '1px solid var(--border-color)', 
                                  backgroundColor: 'var(--bg-card)', 
                                  color: 'var(--text-primary)',
                                  fontSize: '0.84rem',
                                  fontWeight: 600
                                }}
                              />
                            </td>

                            {/* Subtotal */}
                            <td style={{padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)'}}>
                              ${itemSub.toLocaleString('es-AR')}
                            </td>

                            {/* Remove */}
                            <td style={{padding: '8px 10px', textAlign: 'center'}}>
                              {formData.items.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(idx)}
                                  title="Eliminar producto"
                                  style={{
                                    border: 'none', 
                                    background: 'none', 
                                    cursor: 'pointer', 
                                    color: 'var(--accent-red)',
                                    padding: 4,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Total Summary Row */}
                <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: 10, alignItems: 'center', gap: 10}}>
                  <span style={{fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)'}}>
                    Total Presupuestado:
                  </span>
                  <span style={{fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-emerald)'}}>
                    ${calculateTotal(formData.items).toLocaleString('es-AR')}
                  </span>
                </div>
              </div>

              {/* Row 4: Observaciones */}
              <div>
                <label style={{display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)'}}>
                  Observaciones y Condiciones Comerciales (se imprimen en el PDF)
                </label>
                <textarea 
                  rows="2"
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  style={{
                    width: '100%', 
                    padding: '8px 10px', 
                    borderRadius: 6, 
                    border: '1px solid var(--border-color)', 
                    backgroundColor: 'var(--bg-card)', 
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem',
                    resize: 'vertical'
                  }}
                />
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '14px 20px', 
              borderTop: '1px solid var(--border-color)', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              backgroundColor: 'var(--bg-hover)'
            }}>
              <button 
                type="button"
                className="btn"
                onClick={() => {
                  setShowCreateModal(false)
                  setEditingQuote(null)
                  setCloningFromQuote(null)
                }}
                style={{backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)'}}
              >
                Cancelar
              </button>

              <div style={{display: 'flex', gap: 10}}>
                <button 
                  type="button"
                  disabled={submitting}
                  className="btn"
                  onClick={() => handleSaveQuote(false)}
                  style={{backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontWeight: 600}}
                >
                  {submitting ? 'Guardando...' : (cloningFromQuote ? 'Crear Presupuesto Clonado' : 'Guardar Presupuesto')}
                </button>

                <button 
                  type="button"
                  disabled={submitting}
                  className="btn btn-primary"
                  onClick={() => handleSaveQuote(true)}
                  style={{display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600}}
                >
                  <Download size={16} /> {cloningFromQuote ? 'Crear y Abrir PDF' : 'Guardar y Abrir PDF'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Registrar Cobro de Presupuesto (Efectivo o Asociar Transferencia)   */}
      {/* ========================================================================= */}
      {convertingQuote && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 16
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: 14,
            border: '1px solid var(--border-color)',
            width: '100%',
            maxWidth: 580,
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.35)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--bg-hover)'
            }}>
              <div>
                <h3 style={{margin: 0, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)'}}>
                  <DollarSign size={22} color="var(--accent-emerald)" /> Registrar Cobro de Presupuesto #{convertingQuote.quote_number}
                </h3>
                <span style={{fontSize: '0.78rem', color: 'var(--text-secondary)'}}>
                  Cliente: <b>{convertingQuote.customer_name}</b> · Total: <b style={{color: 'var(--accent-emerald)'}}>${Number(convertingQuote.total_amount).toLocaleString('es-AR')}</b>
                </span>
              </div>
              <button
                onClick={() => setConvertingQuote(null)}
                style={{border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4}}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14}}>
              
              {/* Method Selection Tabs */}
              <div>
                <label style={{display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)'}}>
                  ¿CÓMO ABONÓ EL CLIENTE ESTA COTIZACIÓN?
                </label>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10}}>
                  
                  {/* Option 1: Asociar a Transferencia (Mercado Pago / Banco) */}
                  <div
                    onClick={() => setConvertMode('link_transfer')}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '2px solid',
                      borderColor: convertMode === 'link_transfer' ? 'var(--accent-blue)' : 'var(--border-color)',
                      backgroundColor: convertMode === 'link_transfer' ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-hover)',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4}}>
                      <Link2 size={18} color={convertMode === 'link_transfer' ? 'var(--accent-blue)' : 'var(--text-secondary)'} />
                      <span style={{fontWeight: 700, fontSize: '0.84rem', color: convertMode === 'link_transfer' ? 'var(--accent-blue)' : 'var(--text-primary)'}}>
                        Asociar a Transferencia
                      </span>
                    </div>
                    <div style={{fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.3}}>
                      Ya entró a Ventas por Mercado Pago o banco. Evita duplicar la venta.
                    </div>
                  </div>

                  {/* Option 2: Efectivo / Nuevo Cobro Directo */}
                  <div
                    onClick={() => setConvertMode('cash')}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '2px solid',
                      borderColor: convertMode === 'cash' ? 'var(--accent-emerald)' : 'var(--border-color)',
                      backgroundColor: convertMode === 'cash' ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-hover)',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4}}>
                      <DollarSign size={18} color={convertMode === 'cash' ? 'var(--accent-emerald)' : 'var(--text-secondary)'} />
                      <span style={{fontWeight: 700, fontSize: '0.84rem', color: convertMode === 'cash' ? 'var(--accent-emerald)' : 'var(--text-primary)'}}>
                        Efectivo / Nuevo Cobro
                      </span>
                    </div>
                    <div style={{fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.3}}>
                      Cobro en mano en mostrador o tarjeta posnet. Genera un nuevo registro en Ventas.
                    </div>
                  </div>

                </div>
              </div>

              {/* Mode 1 Content: Transfer Linking */}
              {convertMode === 'link_transfer' && (
                <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                  
                  {loadingCandidates ? (
                    <div style={{padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem'}}>
                      <RefreshCw size={18} className="animate-spin" style={{margin: '0 auto 6px'}} />
                      Buscando transferencias en Ventas coincidentes con ${Number(convertingQuote.total_amount).toLocaleString('es-AR')}...
                    </div>
                  ) : (
                    <>
                      {/* Exact Match Alert Banner if found */}
                      {candidateTransfers.some(c => c.is_exact_match) && (
                        <div style={{
                          backgroundColor: 'rgba(16, 185, 129, 0.12)',
                          border: '1px solid rgba(16, 185, 129, 0.35)',
                          borderRadius: 8,
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10
                        }}>
                          <Sparkles size={20} color="var(--accent-emerald)" />
                          <div style={{fontSize: '0.82rem', color: 'var(--text-primary)'}}>
                            <b>¡Coincidencia automática detectada!</b> Se encontró una transferencia por el importe exacto de <b>${Number(convertingQuote.total_amount).toLocaleString('es-AR')}</b>.
                          </div>
                        </div>
                      )}

                      {/* Candidate transfers list */}
                      <div>
                        <label style={{display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6}}>
                          Seleccioná la transferencia ingresada en Ventas:
                        </label>
                        
                        {candidateTransfers.length > 0 ? (
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            maxHeight: 180,
                            overflowY: 'auto',
                            border: '1px solid var(--border-color)',
                            borderRadius: 8,
                            padding: 6,
                            backgroundColor: 'var(--bg-hover)'
                          }}>
                            {candidateTransfers.map(c => {
                              const isSelected = String(selectedTransferId) === String(c.order_id)
                              return (
                                <div
                                  key={c.order_id}
                                  onClick={() => setSelectedTransferId(String(c.order_id))}
                                  style={{
                                    padding: '8px 12px',
                                    borderRadius: 6,
                                    border: '1px solid',
                                    borderColor: isSelected ? 'var(--accent-blue)' : 'transparent',
                                    backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-card)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontSize: '0.8rem',
                                    transition: 'all 0.12s'
                                  }}
                                >
                                  <div>
                                    <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                                      <span style={{fontWeight: 700, color: 'var(--text-primary)'}}>Orden #{c.order_id}</span>
                                      {c.is_exact_match && (
                                        <span style={{fontSize: '0.68rem', backgroundColor: 'rgba(16, 185, 129, 0.2)', color: 'var(--accent-emerald)', padding: '1px 6px', borderRadius: 4, fontWeight: 700}}>
                                          ⭐ Monto Exacto
                                        </span>
                                      )}
                                      {c.name_match && (
                                        <span style={{fontSize: '0.68rem', backgroundColor: 'rgba(59, 130, 246, 0.2)', color: 'var(--accent-blue)', padding: '1px 6px', borderRadius: 4, fontWeight: 600}}>
                                          Cliente Coincide
                                        </span>
                                      )}
                                    </div>
                                    <div style={{color: 'var(--text-secondary)', fontSize: '0.72rem', marginTop: 2}}>
                                      {c.buyer_name} · {formatDateDisplay(c.date_created)} {c.payment_method ? `· ${c.payment_method}` : ''}
                                    </div>
                                  </div>

                                  <div style={{textAlign: 'right'}}>
                                    <div style={{fontWeight: 700, color: c.is_exact_match ? 'var(--accent-emerald)' : 'var(--text-primary)'}}>
                                      ${Number(c.total_amount).toLocaleString('es-AR')}
                                    </div>
                                    {isSelected && (
                                      <span style={{fontSize: '0.7rem', color: 'var(--accent-blue)', fontWeight: 700}}>
                                        ✓ Seleccionada
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div style={{padding: 12, backgroundColor: 'var(--bg-hover)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center'}}>
                            No se encontraron transferencias recientes en Ventas. Podés ingresar el N° de orden manualmente a continuación.
                          </div>
                        )}
                      </div>

                      {/* Manual Lookup of Order ID */}
                      <div style={{backgroundColor: 'var(--bg-hover)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)'}}>
                        <label style={{display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4}}>
                          O ingresá manualmente el N° de Orden / ID de pago de Mercado Pago:
                        </label>
                        <div style={{display: 'flex', gap: 8}}>
                          <input
                            type="text"
                            placeholder="ej: 179737320580 o ID de orden"
                            value={manualTransferId}
                            onChange={e => setManualTransferId(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleLookupManualTransfer(); } }}
                            style={{
                              flex: 1,
                              padding: '6px 10px',
                              borderRadius: 6,
                              border: '1px solid var(--border-color)',
                              backgroundColor: 'var(--bg-card)',
                              color: 'var(--text-primary)',
                              fontSize: '0.82rem',
                              fontFamily: 'monospace'
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleLookupManualTransfer}
                            disabled={manualLookupLoading || !manualTransferId.trim()}
                            className="btn"
                            style={{padding: '6px 12px', fontSize: '0.78rem', fontWeight: 600, backgroundColor: 'var(--accent-blue)', color: '#fff'}}
                          >
                            {manualLookupLoading ? 'Buscando...' : 'Buscar'}
                          </button>
                        </div>

                        {manualLookupResult && (
                          <div style={{marginTop: 8, fontSize: '0.76rem'}}>
                            {manualLookupResult.error ? (
                              <div style={{color: 'var(--accent-red)'}}>❌ {manualLookupResult.error}</div>
                            ) : manualLookupResult.already_linked ? (
                              <div style={{color: 'var(--accent-red)'}}>
                                ⚠️ Esta orden ya está asociada al Presupuesto #{manualLookupResult.linked_quote_number}.
                              </div>
                            ) : (
                              <div style={{color: 'var(--accent-emerald)', fontWeight: 600}}>
                                ✓ Orden #{manualLookupResult.order?.order_id} encontrada (${Number(manualLookupResult.order?.total_amount).toLocaleString('es-AR')} - {manualLookupResult.order?.buyer?.name || 'Sin nombre'}). Seleccionada para asociar.
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Explanation Callout */}
                      <div style={{
                        backgroundColor: 'rgba(59, 130, 246, 0.07)',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        borderRadius: 8,
                        padding: '10px 12px',
                        fontSize: '0.78rem',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.4
                      }}>
                        💡 <b>Protección contra duplicados:</b> Al asociar, la transferencia de <b>Ventas</b> se actualizará con los productos específicos de este presupuesto y se descontará el stock de inventario. <b>No se duplicará la venta ni la facturación</b> en tus estadísticas.
                      </div>
                    </>
                  )}

                </div>
              )}

              {/* Mode 2 Content: Cash or Direct Payment */}
              {convertMode === 'cash' && (
                <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                  <div>
                    <label style={{display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4}}>
                      Medio de Pago Utilizado
                    </label>
                    <select 
                      value={convertForm.payment_method}
                      onChange={e => setConvertForm({ ...convertForm, payment_method: e.target.value })}
                      style={{width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)', fontWeight: 600}}
                    >
                      <option value="Efectivo">💵 Efectivo (Billetes / Caja)</option>
                      <option value="Tarjeta de Débito">💳 Tarjeta de Débito (Posnet local)</option>
                      <option value="Tarjeta de Crédito">💳 Tarjeta de Crédito (Posnet local)</option>
                      <option value="Transferencia (CBU o Alias)">🏦 Transferencia Directa Nueva (CBU no sincronizado)</option>
                      <option value="Mercado Pago (Point)">📱 Mercado Pago (Point físico)</option>
                    </select>
                  </div>

                  <div style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.07)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: '0.78rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.4
                  }}>
                    📦 <b>Registro de nueva venta:</b> Se creará un nuevo registro comercial en el módulo de <b>Ventas</b> por <b>${Number(convertingQuote.total_amount).toLocaleString('es-AR')}</b> a nombre de <b>{convertingQuote.customer_name}</b> y se descontará el stock correspondiente del inventario.
                  </div>
                </div>
              )}

              {/* Common Options: Shipping & AFIP Invoice */}
              <div style={{
                borderTop: '1px solid var(--border-color)',
                paddingTop: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}>
                <div>
                  <label style={{display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4}}>
                    Estado de Entrega de los Productos
                  </label>
                  <select 
                    value={convertForm.shipping_status}
                    onChange={e => setConvertForm({ ...convertForm, shipping_status: e.target.value })}
                    style={{width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)'}}
                  >
                    <option value="delivered">✅ Entregado en mano / Enviado</option>
                    <option value="pending">⏳ Pendiente de Retiro o Entrega</option>
                  </select>
                </div>

                {/* AFIP Auto Invoice */}
                <div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 4}}>
                  <input 
                    type="checkbox"
                    id="auto_inv_cb"
                    checked={convertForm.auto_invoice}
                    onChange={e => setConvertForm({ ...convertForm, auto_invoice: e.target.checked })}
                    style={{width: 16, height: 16, cursor: 'pointer'}}
                  />
                  <label htmlFor="auto_inv_cb" style={{fontSize: '0.82rem', color: 'var(--text-primary)', cursor: 'pointer'}}>
                    Emitir Factura Electrónica AFIP inmediatamente
                  </label>
                </div>

                {convertForm.auto_invoice && (
                  <div>
                    <label style={{display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4}}>
                      Tipo de Comprobante AFIP
                    </label>
                    <select 
                      value={convertForm.invoice_type}
                      onChange={e => setConvertForm({ ...convertForm, invoice_type: e.target.value })}
                      style={{width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)'}}
                    >
                      <option value="B">Factura B (Consumidor Final)</option>
                      <option value="A">Factura A (Responsable Inscripto)</option>
                      <option value="C">Factura C</option>
                    </select>
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--bg-hover)'
            }}>
              <button 
                type="button"
                className="btn"
                onClick={() => setConvertingQuote(null)}
                style={{backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)'}}
              >
                Cancelar
              </button>

              <button 
                type="button"
                disabled={submitting || (convertMode === 'link_transfer' && !selectedTransferId && !manualTransferId)}
                className="btn"
                onClick={handleConfirmConvert}
                style={{
                  backgroundColor: convertMode === 'link_transfer' ? 'var(--accent-blue)' : 'var(--accent-emerald)', 
                  color: '#ffffff', 
                  fontWeight: 700, 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 6,
                  padding: '9px 18px',
                  borderRadius: 8
                }}
              >
                <Check size={16} /> 
                {submitting 
                  ? 'Procesando...' 
                  : convertMode === 'link_transfer'
                    ? `Asociar a Transferencia ${selectedTransferId ? `#${selectedTransferId}` : ''} y Marcar Cobrado`
                    : 'Registrar Cobro en Efectivo y Descontar Stock'
                }
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal de Configuración de Datos Comerciales para Presupuestos */}
      {showCommercialModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(3px)',
          padding: 16
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: 520,
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 12,
            padding: 24,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                <div style={{
                  width: 38, height: 38, borderRadius: 8, 
                  backgroundColor: 'rgba(59, 130, 246, 0.12)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Building size={20} color="var(--accent-blue)" />
                </div>
                <div>
                  <h3 style={{margin: 0, fontSize: '1.15rem'}}>Membrete Comercial de Presupuestos</h3>
                  <span style={{fontSize: '0.78rem', color: 'var(--text-secondary)'}}>
                    Configuración de cabecera para cotizaciones y PDF
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setShowCommercialModal(false)}
                style={{background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)'}}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.4}}>
              Indica el <b>Nombre Comercial</b> y la <b>Dirección Comercial</b> (del local físico o showroom) que figurará en los presupuestos ante tus clientes, evitando usar la dirección fiscal de facturación.
            </p>

            <form onSubmit={handleSaveCommercialConfig} style={{display: 'flex', flexDirection: 'column', gap: 14}}>
              <label style={{display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem', fontWeight: 600}}>
                Nombre Comercial / Marca de Fantasía *
                <input
                  type="text"
                  required
                  placeholder="ej. Experiencia Sustentable"
                  value={commercialForm.merchant_commercial_name}
                  onChange={e => setCommercialForm({...commercialForm, merchant_commercial_name: e.target.value})}
                  style={{padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                />
              </label>

              <label style={{display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem', fontWeight: 600}}>
                Dirección Comercial (Local / Showroom) *
                <input
                  type="text"
                  required
                  placeholder="ej. Zeballos 1726, Rosario, Santa Fe, Argentina"
                  value={commercialForm.merchant_commercial_address}
                  onChange={e => setCommercialForm({...commercialForm, merchant_commercial_address: e.target.value})}
                  style={{padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                />
                <span style={{fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 400}}>
                  Dirección donde atiendes o entregas (no la dirección fiscal de AFIP).
                </span>
              </label>

              <label style={{display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem', fontWeight: 600}}>
                Teléfono / WhatsApp de Contacto
                <input
                  type="text"
                  placeholder="ej. +54 9 3412 59-0161"
                  value={commercialForm.merchant_phone}
                  onChange={e => setCommercialForm({...commercialForm, merchant_phone: e.target.value})}
                  style={{padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                />
              </label>

              <label style={{display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem', fontWeight: 600}}>
                Email Comercial (Opcional)
                <input
                  type="email"
                  placeholder="ej. contacto@experienciasustentable.com"
                  value={commercialForm.merchant_email}
                  onChange={e => setCommercialForm({...commercialForm, merchant_email: e.target.value})}
                  style={{padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                />
              </label>

              {/* Opciones de Razón Social y CUIT (Filtro / Inclusión en Presupuestos) */}
              <div style={{
                backgroundColor: 'var(--bg-hover)',
                border: '1px solid var(--border-color)',
                borderRadius: 8,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}>
                <div style={{fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6}}>
                  📑 Datos Fiscales en Presupuestos (AFIP/ARCA)
                </div>
                <div style={{fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.35}}>
                  Por defecto, la Razón Social y el CUIT están ocultos para que el presupuesto sea 100% comercial con tu marca de fantasía. Puedes activarlos aquí si necesitas cotizaciones con datos impositivos.
                </div>

                <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                  {/* Toggle Razón Social */}
                  <div>
                    <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600}}>
                      <input
                        type="checkbox"
                        checked={commercialForm.show_legal_name}
                        onChange={e => setCommercialForm({...commercialForm, show_legal_name: e.target.checked})}
                        style={{width: 16, height: 16, cursor: 'pointer'}}
                      />
                      Mostrar Razón Social en el Presupuesto
                    </label>
                    {commercialForm.show_legal_name && (
                      <input
                        type="text"
                        placeholder="Razón Social (ej. GENTILI FRANCO AGUSTIN)"
                        value={commercialForm.legal_name}
                        onChange={e => setCommercialForm({...commercialForm, legal_name: e.target.value})}
                        style={{marginTop: 6, width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem'}}
                      />
                    )}
                  </div>

                  {/* Toggle CUIT */}
                  <div>
                    <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600}}>
                      <input
                        type="checkbox"
                        checked={commercialForm.show_cuit}
                        onChange={e => setCommercialForm({...commercialForm, show_cuit: e.target.checked})}
                        style={{width: 16, height: 16, cursor: 'pointer'}}
                      />
                      Mostrar CUIT en el Presupuesto
                    </label>
                    {commercialForm.show_cuit && (
                      <input
                        type="text"
                        placeholder="CUIT (ej. 20-31383248-2)"
                        value={commercialForm.cuit}
                        onChange={e => setCommercialForm({...commercialForm, cuit: e.target.value})}
                        style={{marginTop: 6, width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem'}}
                      />
                    )}
                  </div>
                </div>
              </div>

              <div style={{display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10}}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowCommercialModal(false)}
                  style={{backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border-color)'}}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingCommercial}
                  style={{display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontWeight: 600}}
                >
                  <Check size={16} /> {savingCommercial ? 'Guardando...' : 'Guardar y Continuar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
