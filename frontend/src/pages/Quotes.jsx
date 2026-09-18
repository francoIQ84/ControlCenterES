import React, { useState, useEffect, useMemo } from 'react'
import { 
  FileText, Plus, Search, Download, CheckCircle2, Clock, 
  AlertTriangle, XCircle, MessageCircle, User, Trash2, 
  Edit3, DollarSign, Package, ExternalLink, Calendar, 
  TrendingUp, RefreshCw, ChevronRight, X, ArrowRight, Check
} from 'lucide-react'
import { getCachedData, setCachedData, invalidateCache, CacheKeys } from '../utils/cache'
import { matchesQuery, matchesPhoneOrDoc } from '../utils/searchUtils'
import { formatDateTimeAR } from '../utils/dateUtils'

export default function Quotes() {
  const cachedQuotes = getCachedData(CacheKeys.QUOTES)
  const [quotes, setQuotes] = useState(() => cachedQuotes || [])
  const [loading, setLoading] = useState(() => !cachedQuotes)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const cachedInv = getCachedData(CacheKeys.INVENTORY_SUMMARY) || getCachedData(CacheKeys.INVENTORY)
  const [inventory, setInventory] = useState(() => cachedInv || [])
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingQuote, setEditingQuote] = useState(null)
  const [convertingQuote, setConvertingQuote] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  
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
  }, [])

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
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { id: `manual-${Date.now()}`, title: '', quantity: 1, price: 0, sku: '' }]
    }))
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
        alert(editingQuote ? '¡Presupuesto actualizado con éxito!' : `¡Presupuesto #${savedQuote.quote_number} creado con éxito!`)
        setShowCreateModal(false)
        setEditingQuote(null)
        setFormData(initialQuoteForm)
        invalidateCache('quotes')
        await fetchQuotes(true)

        if (downloadAfter && savedQuote?.id) {
          window.open(`/api/quotes/${savedQuote.id}/pdf`, '_blank')
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

  // Convert quote to confirmed sale order
  const handleConfirmConvert = async () => {
    if (!convertingQuote) return
    setSubmitting(true)

    try {
      const res = await fetch(`/api/quotes/${convertingQuote.id}/convert-to-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(convertForm)
      })

      if (res.ok) {
        const data = await res.json()
        alert(`🎉 ${data.message || 'Presupuesto convertido a venta con éxito.'}`)
        setConvertingQuote(null)
        invalidateCache('quotes')
        invalidateCache('sales')
        await fetchQuotes(true)
      } else {
        const err = await res.json().catch(() => ({}))
        alert('Error al confirmar venta: ' + (err.detail || 'Error desconocido'))
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
            className="btn btn-primary" 
            onClick={() => {
              setEditingQuote(null)
              setFormData(initialQuoteForm)
              setShowCreateModal(true)
            }}
            style={{display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', fontWeight: 600}}
          >
            <Plus size={18} /> Nuevo Presupuesto
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20}}>
        {/* Vigentes */}
        <div style={{
          backgroundColor: 'var(--bg-card)', 
          border: '1px solid var(--border-color)', 
          borderRadius: 12, 
          padding: '14px 18px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600}}>⏳ VIGENTES / ACTIVOS</span>
            <span style={{backgroundColor: 'rgba(59, 130, 246, 0.12)', color: 'var(--accent-blue)', padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700}}>
              {metrics.pendingCount}
            </span>
          </div>
          <div style={{fontSize: '1.4rem', fontWeight: 700, marginTop: 6, color: 'var(--text-primary)'}}>
            ${metrics.pendingAmount.toLocaleString('es-AR')}
          </div>
          <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4}}>
            Cotizaciones dentro del plazo de validez
          </div>
        </div>

        {/* Concretados / Abonados */}
        <div style={{
          backgroundColor: 'var(--bg-card)', 
          border: '1px solid var(--border-color)', 
          borderRadius: 12, 
          padding: '14px 18px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600}}>✅ ABONADOS (VENTAS)</span>
            <span style={{backgroundColor: 'rgba(16, 185, 129, 0.12)', color: 'var(--accent-emerald)', padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700}}>
              {metrics.approvedCount}
            </span>
          </div>
          <div style={{fontSize: '1.4rem', fontWeight: 700, marginTop: 6, color: 'var(--accent-emerald)'}}>
            ${metrics.approvedAmount.toLocaleString('es-AR')}
          </div>
          <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4}}>
            Presupuestos confirmados a venta
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
            <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600}}>⚠️ VENCIDOS</span>
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
            Tasa de conversión a venta real
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
            { id: 'pending', label: '⏳ Vigentes' },
            { id: 'approved', label: '✅ Abonados' },
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
                            gap: 4, 
                            padding: '3px 9px', 
                            borderRadius: 12, 
                            fontSize: '0.75rem', 
                            fontWeight: 700, 
                            backgroundColor: 'rgba(16, 185, 129, 0.12)', 
                            color: 'var(--accent-emerald)'
                          }}>
                            <CheckCircle2 size={13} /> Abonado
                          </span>
                        ) : isExpired ? (
                          <span style={{
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: 4, 
                            padding: '3px 9px', 
                            borderRadius: 12, 
                            fontSize: '0.75rem', 
                            fontWeight: 700, 
                            backgroundColor: 'rgba(239, 68, 68, 0.12)', 
                            color: 'var(--accent-red)'
                          }}>
                            <AlertTriangle size={13} /> Vencido
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: 4, 
                            padding: '3px 9px', 
                            borderRadius: 12, 
                            fontSize: '0.75rem', 
                            fontWeight: 700, 
                            backgroundColor: 'rgba(59, 130, 246, 0.12)', 
                            color: 'var(--accent-blue)'
                          }}>
                            <Clock size={13} /> Vigente
                          </span>
                        )}
                      </td>

                      {/* Fecha Finalización */}
                      <td style={{padding: '12px 14px', whiteSpace: 'nowrap', color: q.completed_at ? 'var(--accent-emerald)' : 'var(--text-secondary)'}}>
                        {q.completed_at ? (
                          <div>
                            <div style={{fontWeight: 600}}>{formatDateDisplay(q.completed_at)}</div>
                            {q.order_id && (
                              <div style={{fontSize: '0.7rem', color: 'var(--text-secondary)'}}>
                                Orden #{q.order_id}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span>-</span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td style={{padding: '12px 14px', textAlign: 'right'}}>
                        <div style={{display: 'flex', justifyContent: 'flex-end', gap: 6}}>
                          
                          {/* Confirm Sale / Abonado */}
                          {!isApproved && (
                            <button
                              onClick={() => {
                                setConvertingQuote(q)
                                setConvertForm({
                                  payment_method: 'Efectivo',
                                  shipping_status: 'delivered',
                                  auto_invoice: false,
                                  invoice_type: 'B'
                                })
                              }}
                              title="Confirmar venta y marcar como abonado (descuenta stock)"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '4px 9px',
                                borderRadius: 6,
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                                color: 'var(--accent-emerald)',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: 600
                              }}
                            >
                              <Check size={13} /> Cobrado
                            </button>
                          )}

                          {/* PDF Download */}
                          <a
                            href={`/api/quotes/${q.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Descargar o imprimir PDF"
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
          padding: 16
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: 14,
            border: '1px solid var(--border-color)',
            width: '100%',
            maxWidth: 820,
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px', 
              borderBottom: '1px solid var(--border-color)', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8}}>
                  <FileText size={20} color="var(--accent-blue)" /> 
                  {editingQuote ? `Editar Presupuesto #${editingQuote.quote_number}` : 'Armar Nuevo Presupuesto'}
                </h3>
                <span style={{fontSize: '0.78rem', color: 'var(--text-secondary)'}}>
                  El stock no se reservará ni descontará hasta que el cliente abone y se confirme la venta.
                </span>
              </div>
              <button 
                onClick={() => setShowCreateModal(false)}
                style={{border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4}}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16}}>
              
              {/* Row 1: Lista de Precios & Validez */}
              <div style={{
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
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
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10}}>
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
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                  <h4 style={{margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6}}>
                    <Package size={16} color="var(--accent-blue)" /> Productos y Cantidades
                  </h4>
                  <button 
                    type="button"
                    onClick={handleAddItem}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: '0.78rem',
                      padding: '4px 10px',
                      borderRadius: 6,
                      backgroundColor: 'rgba(59, 130, 246, 0.12)',
                      color: 'var(--accent-blue)',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    <Plus size={14} /> Agregar Producto
                  </button>
                </div>

                <div style={{border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden'}}>
                  <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem'}}>
                    <thead>
                      <tr style={{backgroundColor: 'var(--bg-hover)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)'}}>
                        <th style={{padding: '8px 10px', textAlign: 'left'}}>Producto / Artículo</th>
                        <th style={{padding: '8px 10px', width: 80, textAlign: 'center'}}>Cant.</th>
                        <th style={{padding: '8px 10px', width: 120, textAlign: 'right'}}>Precio Unit. ($)</th>
                        <th style={{padding: '8px 10px', width: 120, textAlign: 'right'}}>Subtotal</th>
                        <th style={{padding: '8px 10px', width: 40}}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.items.map((item, idx) => {
                        const itemSub = (Number(item.price) || 0) * (parseInt(item.quantity) || 0)
                        const filteredProds = inventory.filter(p => {
                          if (!item.title) return true
                          return matchesQuery([p.title, p.ml_id, p.sku], item.title)
                        }).slice(0, 15)

                        return (
                          <tr key={idx} style={{borderBottom: '1px solid var(--border-color)'}}>
                            {/* Product title with Autocomplete search */}
                            <td style={{padding: '8px 10px', position: 'relative'}}>
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
                                  padding: '6px 8px', 
                                  borderRadius: 6, 
                                  border: '1px solid var(--border-color)', 
                                  backgroundColor: 'var(--bg-card)', 
                                  color: 'var(--text-primary)',
                                  fontSize: '0.82rem'
                                }}
                              />

                              {/* Autocomplete Dropdown */}
                              {activeSearchIdx === idx && item.title && (
                                <div style={{
                                  position: 'absolute',
                                  top: '100%',
                                  left: 10,
                                  right: 10,
                                  zIndex: 1000,
                                  backgroundColor: 'var(--bg-card)',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: 8,
                                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)',
                                  maxHeight: 220,
                                  overflowY: 'auto'
                                }}>
                                  {filteredProds.length > 0 ? (
                                    filteredProds.map(p => {
                                      const pPrice = getProductPriceBySource(p, formData.price_source)
                                      return (
                                        <div
                                          key={p.ml_id}
                                          onMouseDown={() => handleSelectProduct(idx, p.ml_id)}
                                          style={{
                                            padding: '8px 10px',
                                            cursor: 'pointer',
                                            borderBottom: '1px solid var(--border-color)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            fontSize: '0.78rem'
                                          }}
                                        >
                                          <div style={{flex: 1, minWidth: 0}}>
                                            <div style={{fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                                              {p.title}
                                            </div>
                                            <div style={{color: 'var(--text-secondary)', fontSize: '0.7rem'}}>
                                              {p.ml_id} • Stock: {p.available_quantity ?? 0}
                                            </div>
                                          </div>
                                          <div style={{fontWeight: 700, color: 'var(--accent-emerald)', marginLeft: 8}}>
                                            ${pPrice.toLocaleString('es-AR')}
                                          </div>
                                        </div>
                                      )
                                    })
                                  ) : (
                                    <div 
                                      style={{padding: 8, fontSize: '0.78rem', color: 'var(--accent-blue)', cursor: 'pointer', textAlign: 'center'}}
                                      onMouseDown={() => setActiveSearchIdx(null)}
                                    >
                                      ✓ Usar como ítem personalizado: "{item.title}"
                                    </div>
                                  )}
                                </div>
                              )}
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
                                  padding: '6px 4px', 
                                  borderRadius: 6, 
                                  border: '1px solid var(--border-color)', 
                                  backgroundColor: 'var(--bg-card)', 
                                  color: 'var(--text-primary)',
                                  fontSize: '0.82rem'
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
                                  padding: '6px 8px', 
                                  borderRadius: 6, 
                                  border: '1px solid var(--border-color)', 
                                  backgroundColor: 'var(--bg-card)', 
                                  color: 'var(--text-primary)',
                                  fontSize: '0.82rem',
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
                                  style={{border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent-red)'}}
                                >
                                  <Trash2 size={14} />
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
                onClick={() => setShowCreateModal(false)}
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
                  {submitting ? 'Guardando...' : 'Guardar Presupuesto'}
                </button>

                <button 
                  type="button"
                  disabled={submitting}
                  className="btn btn-primary"
                  onClick={() => handleSaveQuote(true)}
                  style={{display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600}}
                >
                  <Download size={16} /> Guardar y Abrir PDF
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Confirmar Venta / Marcar Abonado */}
      {/* ========================================================================= */}
      {convertingQuote && (
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
          padding: 16
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: 14,
            border: '1px solid var(--border-color)',
            width: '100%',
            maxWidth: 480,
            padding: 22,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)'
          }}>
            <h3 style={{margin: '0 0 8px', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: 8}}>
              <CheckCircle2 size={22} color="var(--accent-emerald)" /> Confirmar Venta de Presupuesto
            </h3>
            
            <p style={{margin: '0 0 16px', fontSize: '0.84rem', color: 'var(--text-secondary)'}}>
              El cliente <b>{convertingQuote.customer_name}</b> abonó la cotización <b>#{convertingQuote.quote_number}</b> por un total de <b>${Number(convertingQuote.total_amount).toLocaleString('es-AR')}</b>.
              <br /><br />
              Al confirmar, se registrará la venta en la sección de Ventas, se descontará el stock del inventario y se guardará la fecha de finalización.
            </p>

            <div style={{display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18}}>
              <div>
                <label style={{display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4}}>
                  Medio de Pago Utilizado
                </label>
                <select 
                  value={convertForm.payment_method}
                  onChange={e => setConvertForm({ ...convertForm, payment_method: e.target.value })}
                  style={{width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)', fontWeight: 600}}
                >
                  <option value="Efectivo">💵 Efectivo</option>
                  <option value="Transferencia (Mercado Pago)">📱 Transferencia (Mercado Pago)</option>
                  <option value="Transferencia (CBU o Alias)">🏦 Transferencia (CBU o Alias Bancario)</option>
                  <option value="Mercado Pago (Point)">💳 Mercado Pago (Point)</option>
                  <option value="Tarjeta de Débito">💳 Tarjeta de Débito</option>
                  <option value="Tarjeta de Crédito">💳 Tarjeta de Crédito</option>
                </select>
              </div>

              <div>
                <label style={{display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4}}>
                  Estado de Entrega de la Mercadería
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
              <div style={{marginTop: 4, display: 'flex', alignItems: 'center', gap: 8}}>
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
                    Tipo de Comprobante
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

            <div style={{display: 'flex', justifyContent: 'flex-end', gap: 10}}>
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
                disabled={submitting}
                className="btn"
                onClick={handleConfirmConvert}
                style={{
                  backgroundColor: 'var(--accent-emerald)', 
                  color: '#ffffff', 
                  fontWeight: 600, 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 6
                }}
              >
                <Check size={16} /> {submitting ? 'Procesando...' : 'Confirmar Venta y Descontar Stock'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
