import React, { useState, useEffect } from 'react'
import { ShoppingBag, Globe, Store, Check, Clock, Plus, Trash2, ShoppingCart, DollarSign, Link, MessageSquare, Send, ExternalLink, FileText, UserCheck, Search, X, Filter } from 'lucide-react'
import { useTenant } from '../TenantContext'

export default function Sales() {
  const [orders, setOrders] = useState([])
  const { isSimpleView, isChannelEnabled } = useTenant()
  const [loading, setLoading] = useState(true)
  const [sortConfig, setSortConfig] = useState({ key: 'date_created', direction: 'desc' })

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState('ALL')
  const [shippingFilter, setShippingFilter] = useState('ALL')

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [inventory, setInventory] = useState([])
  const [meliEnableManualMsg, setMeliEnableManualMsg] = useState(false)

  // Inventory Linking Modal State
  const [linkModalOrder, setLinkModalOrder] = useState(null)
  const [selectedProdId, setSelectedProdId] = useState('')
  const [selectedQty, setSelectedQty] = useState(1)
  const [linkingLoading, setLinkingLoading] = useState(false)

  // Mercado Pago QR / Link Charge State
  const [generatedCharge, setGeneratedCharge] = useState(null)
  const [chargeLoading, setChargeLoading] = useState(false)

  const handleGenerateMPCharge = async () => {
    if (!newOrder.items || newOrder.items.length === 0) {
      alert("Por favor añade al menos un producto.")
      return
    }
    setChargeLoading(true)
    try {
      const res = await fetch('/api/mercadopago/create-charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: newOrder.items,
          buyer_name: newOrder.buyer_name || "Cliente Mostrador"
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setGeneratedCharge(data.charge)
      } else {
        alert("Error al generar cobro: " + (data.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setChargeLoading(false)
    }
  }

  // Active product search index for dropdown autocomplete
  const [activeSearchIdx, setActiveSearchIdx] = useState(null)

  const [newOrder, setNewOrder] = useState({
    buyer_nickname: "",
    buyer_name: "",
    source_platform: "LOCAL", // "LOCAL" or "WEB"
    shipping_status: "delivered", // "pending" or "delivered"
    payment_method: "Efectivo",
    payment_status: "paid", // "paid" or "pending"
    auto_invoice: false,
    invoice_type: "B",
    items: [{ id: "manual-1", title: "", quantity: 1, price: 0 }]
  })

  const [invoicingStates, setInvoicingStates] = useState({})

  // Mercado Libre Chat Modal State
  const [chatModalOrder, setChatModalOrder] = useState(null)
  const [chatMessages, setChatMessages] = useState([])
  const [chatMeliUrl, setChatMeliUrl] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [newMessageText, setNewMessageText] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [unreadMap, setUnreadMap] = useState({})

  const fetchOrders = () => {
    setLoading(true)
    fetch('/api/sales/')
      .then(res => res.json())
      .then(data => {
        const fetchedOrders = data.orders || []
        setOrders(fetchedOrders)
        setLoading(false)
        
        // Auto-mark first 2 Mercado Libre sales with an unread badge notification
        const initialUnread = {}
        let count = 0
        fetchedOrders.forEach(o => {
          if (o.source_platform === 'MERCADOLIBRE' && count < 2) {
            initialUnread[o.order_id] = 1
            count++
          }
        })
        setUnreadMap(prev => (Object.keys(prev).length > 0 ? prev : initialUnread))
      })
      .catch(err => {
        console.error(err)
        setLoading(false)
      })
  }

  const handleOpenChatModal = async (order) => {
    setChatModalOrder(order)
    setChatMessages([])
    setChatLoading(true)
    setChatMeliUrl(`https://www.mercadolibre.com.ar/ventas/${order.order_id}/detalle`)

    // Clear unread notification badge for this order
    setUnreadMap(prev => ({ ...prev, [order.order_id]: 0 }))

    try {
      const res = await fetch(`/api/sales/${order.order_id}/messages`)
      const data = await res.json()
      if (res.ok) {
        setChatMessages(data.messages || [])
        if (data.meli_chat_url) setChatMeliUrl(data.meli_chat_url)
      }
    } catch (err) {
      console.error("Error al obtener mensajes de la orden:", err)
    } finally {
      setChatLoading(false)
    }
  }

  const handleSendChatMessage = async (e) => {
    if (e) e.preventDefault()
    if (!newMessageText.trim() || !chatModalOrder) return
    setSendingMessage(true)

    try {
      const res = await fetch(`/api/sales/${chatModalOrder.order_id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newMessageText })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        const sentMsg = {
          id: data.data?.id || `sent_${Date.now()}`,
          from_buyer: false,
          sender_name: "Vendedor",
          text: newMessageText,
          created_at: new Date().toISOString(),
          read: true
        }
        setChatMessages(prev => [...prev, sentMsg])
        setNewMessageText('')
      } else {
        alert("Error al enviar mensaje: " + (data.detail || "Error en el servidor"))
      }
    } catch (err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setSendingMessage(false)
    }
  }

  // AFIP Invoicing Modal State
  const [invoiceModalOrder, setInvoiceModalOrder] = useState(null)
  const [customInvoiceDocType, setCustomInvoiceDocType] = useState('99') // '99' or 'CUIT'
  const [customCuit, setCustomCuit] = useState('')
  const [customName, setCustomName] = useState('')
  const [customIvaCondition, setCustomIvaCondition] = useState('IVA Exento')
  const [customShippingCost, setCustomShippingCost] = useState(0)
  const [includeShippingInInvoice, setIncludeShippingInInvoice] = useState(true)
  const [cuitLookupLoading, setCuitLookupLoading] = useState(false)
  const [mlBillingInfo, setMlBillingInfo] = useState(null)
  const [mlBillingLoading, setMlBillingLoading] = useState(false)

  const mapIvaCondition = (condStr) => {
    if (!condStr) return 'IVA Exento'
    const lower = condStr.toLowerCase()
    if (lower.includes('exent')) return 'IVA Exento'
    if (lower.includes('monotribut')) return 'Responsable Monotributo'
    if (lower.includes('inscript')) return 'Responsable Inscripto'
    if (lower.includes('consumidor')) return 'Consumidor Final'
    if (lower.includes('no responsable')) return 'No Responsable'
    return condStr
  }

  const handleOpenInvoiceModal = async (order) => {
    setInvoiceModalOrder(order)
    setMlBillingInfo(null)
    setCustomIvaCondition('IVA Exento')
    setCustomShippingCost(0)
    setIncludeShippingInInvoice(true)
    
    const buyerDoc = order.buyer?.document_number || ''
    const buyerDocType = order.buyer?.document_type || ''
    const buyerName = order.buyer?.name || ''
    const buyerIva = order.buyer?.iva_condition || order.buyer?.taxpayer_type || ''

    if (buyerDocType === 'CUIT' || buyerDoc.length === 11) {
      setCustomInvoiceDocType('CUIT')
      setCustomCuit(buyerDoc)
      setCustomName(buyerName)
      if (buyerIva) setCustomIvaCondition(mapIvaCondition(buyerIva))
    } else {
      setCustomInvoiceDocType('99')
      setCustomCuit('')
      setCustomName('')
    }

    // Fetch detailed billing info and shipping cost from backend/ML
    setMlBillingLoading(true)
    try {
      const res = await fetch(`/api/sales/${order.order_id}/billing-info`)
      if (res.ok) {
        const data = await res.json()
        setMlBillingInfo(data)
        if (data.is_free_shipping || data.shipping_cost === 0) {
          setCustomShippingCost(data.seller_shipping_cost || 0)
          setIncludeShippingInInvoice(false) // Default UNCHECKED for Free Shipping!
        } else if (data.shipping_cost > 0) {
          setCustomShippingCost(data.shipping_cost)
          setIncludeShippingInInvoice(true) // Default CHECKED if buyer paid for shipping
        }
        if (data.document_number && (data.document_number.length === 11 || data.document_type === 'CUIT' || data.document_type === 'CUIL')) {
          setCustomInvoiceDocType('CUIT')
          setCustomCuit(data.document_number)
          if (data.name) setCustomName(data.name)
          if (data.taxpayer_type) setCustomIvaCondition(mapIvaCondition(data.taxpayer_type))
        }
      }
    } catch(err) {
      console.error("Error loading billing info:", err)
    } finally {
      setMlBillingLoading(false)
    }
  }

  const handleApplyMlBilling = () => {
    if (!mlBillingInfo) return
    if (mlBillingInfo.document_number) {
      setCustomInvoiceDocType('CUIT')
      setCustomCuit(mlBillingInfo.document_number)
    }
    if (mlBillingInfo.name) {
      setCustomName(mlBillingInfo.name)
    }
    if (mlBillingInfo.taxpayer_type) {
      setCustomIvaCondition(mapIvaCondition(mlBillingInfo.taxpayer_type))
    }
  }

  const handleLookupAFIP = async () => {
    if (!customCuit || customCuit.trim().length < 8) {
      alert("Por favor ingresa un CUIT / CUIL válido.")
      return
    }
    setCuitLookupLoading(true)
    try {
      const res = await fetch(`/api/sales/lookup-cuit/${customCuit.trim()}`)
      const data = await res.json()
      if (res.ok && data.success) {
        setCustomName(data.razon_social || '')
        if (data.iva_condition) {
          const detected = mapIvaCondition(data.iva_condition)
          setCustomIvaCondition(detected)
          alert(`¡Datos AFIP encontrados!\n• Razón Social: ${data.razon_social}\n• Condición IVA: ${detected}`)
        } else {
          alert(`¡Razón Social encontrada!: ${data.razon_social}`)
        }
      } else {
        alert("Error AFIP Padrón: " + (data.detail || data.error || "No se encontró el CUIT"))
      }
    } catch(err) {
      alert("Error al consultar CUIT: " + err.message)
    } finally {
      setCuitLookupLoading(false)
    }
  }

  const handleConfirmInvoice = async () => {
    if (!invoiceModalOrder) return
    const orderId = invoiceModalOrder.order_id

    if (invoiceModalOrder.invoice_number || invoiceModalOrder.afip_cae || invoiceModalOrder.invoice_generated === 1) {
      alert(`⚠️ Este pedido #${orderId} ya posee una factura emitida (${invoiceModalOrder.invoice_number || 'con CAE'}). No se pueden emitir facturas duplicadas para la misma venta.`)
      setInvoiceModalOrder(null)
      return
    }

    setInvoicingStates(prev => ({ ...prev, [orderId]: true }))

    try {
      const bodyPayload = {
        doc_type: customInvoiceDocType,
        cuit: customInvoiceDocType === 'CUIT' ? customCuit : null,
        name: customInvoiceDocType === 'CUIT' ? customName : null,
        iva_condition: customInvoiceDocType === 'CUIT' ? customIvaCondition : 'Consumidor Final',
        include_shipping: includeShippingInInvoice,
        shipping_cost: customShippingCost
      }

      const res = await fetch(`/api/sales/${orderId}/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      })

      if (res.ok) {
        const data = await res.json()
        let msg = `Factura generada con éxito: ${data.invoice_number}`
        if (data.meli_uploaded !== undefined && data.meli_uploaded !== null) {
           msg += data.meli_uploaded ? ` | Adjuntada en ML ✓` : ` | Error ML: ${data.meli_msg}`
        }
        alert(msg)
        setInvoiceModalOrder(null)
        fetchOrders()
      } else {
        const err = await res.json()
        alert("Error al facturar: " + (err.detail || "Error desconocido"))
      }
    } catch (err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setInvoicingStates(prev => ({ ...prev, [orderId]: false }))
    }
  }

  const handleCreateInvoice = async (orderId) => {
    const targetOrder = orders.find(o => o.order_id === orderId)
    if (targetOrder) {
      if (targetOrder.invoice_number || targetOrder.afip_cae || targetOrder.invoice_generated === 1) {
        alert(`⚠️ El pedido #${orderId} ya se encuentra facturado (Comprobante: ${targetOrder.invoice_number || 'con CAE'}).`)
        return
      }
      handleOpenInvoiceModal(targetOrder)
    } else {
      setInvoicingStates(prev => ({ ...prev, [orderId]: true }))
      try {
        const res = await fetch(`/api/sales/${orderId}/invoice`, { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          alert(`Factura generada con éxito: ${data.invoice_number}`)
          fetchOrders()
        } else {
          const err = await res.json()
          alert("Error al facturar: " + (err.detail || "Error desconocido"))
        }
      } catch (err) {
        alert("Error: " + err.message)
      } finally {
        setInvoicingStates(prev => ({ ...prev, [orderId]: false }))
      }
    }
  }

  const handleSendMeliMessage = async (orderId, type) => {
    try {
      const res = await fetch(`/api/sales/${orderId}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_type: type })
      })
      const data = await res.json()
      if (res.ok) {
        alert("Mensaje enviado exitosamente")
      } else {
        alert("Error al enviar mensaje: " + (data.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    }
  }

  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar la venta #${orderId} del historial local?`)) return
    try {
      const res = await fetch(`/api/sales/${orderId}`, { method: 'DELETE' })
      if (res.ok) {
        alert(`Venta #${orderId} eliminada con éxito.`)
        fetchOrders()
      } else {
        const data = await res.json()
        alert("Error al eliminar venta: " + (data.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    }
  }

  const fetchInventory = () => {
    fetch('/api/inventory/')
      .then(res => res.json())
      .then(data => {
        setInventory(data.products || [])
      })
      .catch(err => console.error(err))
  }

  useEffect(() => {
    fetchOrders()
    fetchInventory()
    fetch('/api/settings/config')
      .then(res => {
        if (res.ok) return res.json()
        throw new Error("Cannot fetch settings config")
      })
      .then(data => {
        setMeliEnableManualMsg(!!data.meli_enable_manual_msg)
      })
      .catch(err => console.warn("Failed to fetch Meli config:", err))
  }, [])

  const handleToggleShipping = async (orderId, currentStatus) => {
    const nextStatus = currentStatus === 'delivered' ? 'pending' : 'delivered'
    const confirmMsg = nextStatus === 'delivered' 
      ? "¿Marcar esta venta como ENTREGADA?" 
      : "¿Marcar esta venta como PENDIENTE de entrega?"
      
    if (!window.confirm(confirmMsg)) return

    try {
      const res = await fetch(`/api/sales/${orderId}/shipping`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipping_status: nextStatus })
      })
      if (res.ok) {
        setOrders(prev => prev.map(o => o.order_id === orderId ? { ...o, shipping_status: nextStatus } : o))
      } else {
        alert("Error al actualizar estado de entrega")
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    }
  }

  const handleConfirmPayment = async (orderId) => {
    const targetOrder = orders.find(o => o.order_id === orderId)
    const amountStr = targetOrder ? `$${Number(targetOrder.total_amount).toLocaleString()}` : ''
    const methodStr = targetOrder?.payment_method ? ` (${targetOrder.payment_method})` : ''
    
    if (!window.confirm(`¿Confirmar que se acreditó el pago de ${amountStr}${methodStr} para la orden #${orderId}? Pasará a estado APROBADO.`)) {
      return
    }

    try {
      const res = await fetch(`/api/sales/${orderId}/payment-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_status: 'paid' })
      })
      if (res.ok) {
        setOrders(prev => prev.map(o => o.order_id === orderId ? { ...o, status: 'paid', payment_status: 'approved' } : o))
      } else {
        const err = await res.json().catch(() => ({}))
        alert("Error al confirmar pago: " + (err.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    }
  }

  const handleAddItem = () => {
    setNewOrder(prev => ({
      ...prev,
      items: [...prev.items, { id: `manual-${Date.now()}`, title: "", quantity: 1, price: 0 }]
    }))
  }

  const handleRemoveItem = (index) => {
    if (newOrder.items.length === 1) return
    setNewOrder(prev => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index)
    }))
  }

  const handleItemChange = (index, field, value) => {
    setNewOrder(prev => {
      const updatedItems = [...prev.items]
      updatedItems[index] = {
        ...updatedItems[index],
        [field]: field === 'quantity' ? parseInt(value) || 0 : field === 'price' ? parseFloat(value) || 0 : value
      }
      return { ...prev, items: updatedItems }
    })
  }

  const handleProductSelect = (index, prodId) => {
    const selectedProduct = inventory.find(p => p.ml_id === prodId)
    setNewOrder(prev => {
      const updatedItems = [...prev.items]
      if (selectedProduct) {
        const price = prev.source_platform === 'LOCAL' 
          ? selectedProduct.price 
          : (selectedProduct.price_web || selectedProduct.price)
        updatedItems[index] = {
          ...updatedItems[index],
          id: prodId,
          title: selectedProduct.title,
          price: price
        }
      } else {
        updatedItems[index] = {
          ...updatedItems[index],
          id: `manual-${Date.now()}`,
          title: "",
          price: 0
        }
      }
      return { ...prev, items: updatedItems }
    })
  }

  const handleBarcodeScanOrSearch = (index, text) => {
    handleItemChange(index, 'title', text)
    if (!text || text.trim().length < 2) return

    const cleanText = text.trim().toLowerCase()
    // Check exact match by ml_id, title, or barcode
    const exactMatch = inventory.find(p => 
      String(p.ml_id).toLowerCase() === cleanText || 
      String(p.title).toLowerCase() === cleanText
    )

    if (exactMatch) {
      handleProductSelect(index, exactMatch.ml_id)
      setActiveSearchIdx(null)
    }
  }

  const handleCreateManualOrder = async (e) => {
    e.preventDefault()
    
    const finalBuyerName = newOrder.buyer_name || "Consumidor Final"
    const finalBuyerNickname = newOrder.buyer_nickname || "consumidor_final"
    
    const invalidItems = newOrder.items.some(item => !item.title || item.quantity <= 0 || item.price < 0)
    if (invalidItems) {
      alert("Todos los productos de la venta deben tener un nombre, cantidad mayor a 0 y precio válido")
      return
    }

    // Calculate total
    const total_amount = newOrder.items.reduce((sum, item) => sum + (item.price * item.quantity), 0)

    try {
      const res = await fetch('/api/sales/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newOrder,
          buyer_name: finalBuyerName,
          buyer_nickname: finalBuyerNickname,
          total_amount
        })
      })
      if (res.ok) {
        const createdData = await res.json()
        const createdOrderId = createdData.order_id
        alert("Venta registrada con éxito")
        setShowModal(false)
        const shouldInvoice = newOrder.auto_invoice
        setNewOrder({
          buyer_nickname: "",
          buyer_name: "",
          source_platform: "LOCAL",
          shipping_status: "delivered",
          payment_method: "Efectivo",
          payment_status: "paid",
          auto_invoice: false,
          invoice_type: "B",
          items: [{ id: "manual-1", title: "", quantity: 1, price: 0 }]
        })
        fetchOrders()

        if (shouldInvoice && createdOrderId) {
          handleCreateInvoice(createdOrderId)
        }
      } else {
        alert("Error al registrar la venta")
      }
    } catch(err) {
      alert("Error: " + err.message)
    }
  }

  const handleSourcePlatformChange = (newPlatform) => {
    const updatedItems = newOrder.items.map(item => {
      const selectedProduct = inventory.find(p => p.ml_id === item.id)
      if (selectedProduct) {
        const price = newPlatform === 'LOCAL' 
          ? selectedProduct.price 
          : (selectedProduct.price_web || selectedProduct.price)
        return { ...item, price }
      }
      return item
    })
    setNewOrder(prev => ({
      ...prev,
      source_platform: newPlatform,
      items: updatedItems
    }))
  }

  const requestSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return ' ⇅'
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼'
  }

  const filteredOrders = React.useMemo(() => {
    return orders.filter(o => {
      // 1. Platform filter
      if (platformFilter !== 'ALL') {
        const platform = (o.source_platform || '').toUpperCase()
        if (platformFilter === 'MERCADOPAGO') {
          if (!platform.startsWith('MERCADOPAGO')) return false
        } else if (platform !== platformFilter) {
          return false
        }
      }

      // 2. Shipping status filter
      if (shippingFilter !== 'ALL') {
        const sStatus = o.shipping_status || 'pending'
        if (shippingFilter === 'delivered' && sStatus !== 'delivered') return false
        if (shippingFilter === 'pending' && sStatus === 'delivered') return false
        if (shippingFilter === 'ready_for_pickup' && !['ready_for_pickup', 'to_be_withdrawn'].includes(sStatus)) return false
        if (shippingFilter === 'in_transit' && !['shipped', 'in_transit', 'active', 'out_for_delivery'].includes(sStatus)) return false
        if (shippingFilter === 'ready_to_ship' && !['ready_to_ship', 'handling'].includes(sStatus)) return false
      }

      // 3. Search Query filter
      if (!searchQuery || !searchQuery.trim()) return true

      const q = searchQuery.toLowerCase().trim()

      // Buyer details
      const nickname = (o.buyer?.nickname || '').toLowerCase()
      const name = (o.buyer?.name || '').toLowerCase()
      const docNum = (o.buyer?.document_number || '').toLowerCase()
      const buyerId = String(o.buyer?.id || '').toLowerCase()

      // Order details
      const orderId = String(o.order_id || '').toLowerCase()
      const invoiceNum = (o.invoice_number || '').toLowerCase()
      const cae = (o.afip_cae || '').toLowerCase()
      const payMethod = (o.payment_method || '').toLowerCase()
      const status = (o.status || '').toLowerCase()
      const platform = (o.source_platform || '').toLowerCase()
      const total = String(o.total_amount || '')

      // Items details
      const itemsMatch = (o.items || []).some(item =>
        (item.title || '').toLowerCase().includes(q) ||
        String(item.id || '').toLowerCase().includes(q)
      )

      return nickname.includes(q) ||
        name.includes(q) ||
        docNum.includes(q) ||
        buyerId.includes(q) ||
        orderId.includes(q) ||
        invoiceNum.includes(q) ||
        cae.includes(q) ||
        payMethod.includes(q) ||
        status.includes(q) ||
        platform.includes(q) ||
        total.includes(q) ||
        itemsMatch
    })
  }, [orders, platformFilter, shippingFilter, searchQuery])

  const sortedOrders = React.useMemo(() => {
    let sortableItems = [...filteredOrders]
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let aVal = a[sortConfig.key]
        let bVal = b[sortConfig.key]

        if (sortConfig.key === 'date_created') {
          aVal = new Date(a.date_created).getTime()
          bVal = new Date(b.date_created).getTime()
        } else if (sortConfig.key === 'buyer') {
          aVal = (a.buyer?.nickname || "").toLowerCase()
          bVal = (b.buyer?.nickname || "").toLowerCase()
        } else if (sortConfig.key === 'total_amount') {
          aVal = a.total_amount || 0
          bVal = b.total_amount || 0
        } else if (sortConfig.key === 'status') {
          aVal = (a.status || "").toLowerCase()
          bVal = (b.status || "").toLowerCase()
        } else if (sortConfig.key === 'shipping_status') {
          aVal = (a.shipping_status || "").toLowerCase()
          bVal = (b.shipping_status || "").toLowerCase()
        } else if (sortConfig.key === 'source_platform') {
          aVal = (a.source_platform || "").toLowerCase()
          bVal = (b.source_platform || "").toLowerCase()
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }
    return sortableItems
  }, [filteredOrders, sortConfig])

  // Helper renderers
  const renderPlatformBadge = (platform) => {
    const p = platform?.toUpperCase() || ''
    if (p.startsWith('MERCADOPAGO')) {
      let sublabel = 'Mercado Pago'
      if (p.includes('TRANSFER')) sublabel = 'MP Transferencia'
      else if (p.includes('QR')) sublabel = 'MP QR / Point'
      else if (p.includes('LINK')) sublabel = 'MP Link'

      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          borderRadius: 6,
          fontSize: '0.75rem',
          fontWeight: 600,
          backgroundColor: 'rgba(0, 158, 227, 0.15)',
          color: '#009ee3'
        }}>
          <DollarSign size={12} /> {sublabel}
        </span>
      )
    }

    switch (p) {
      case 'MERCADOLIBRE':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            borderRadius: 6,
            fontSize: '0.75rem',
            fontWeight: 600,
            backgroundColor: 'rgba(255, 230, 0, 0.15)',
            color: '#b39200'
          }}>
            <ShoppingBag size={12} /> Mercado Libre
          </span>
        )
      case 'TIENDANUBE':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            borderRadius: 6,
            fontSize: '0.75rem',
            fontWeight: 600,
            backgroundColor: 'rgba(0, 128, 255, 0.15)',
            color: '#0080FF'
          }}>
            <ShoppingBag size={12} /> Tiendanube
          </span>
        )
      case 'WEB':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            borderRadius: 6,
            fontSize: '0.75rem',
            fontWeight: 600,
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            color: 'var(--accent-blue)'
          }}>
            <Globe size={12} /> Tienda Web
          </span>
        )
      case 'LOCAL':
      default:
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            borderRadius: 6,
            fontSize: '0.75rem',
            fontWeight: 600,
            backgroundColor: 'rgba(168, 85, 247, 0.15)',
            color: '#8b5cf6'
          }}>
            <Store size={12} /> Local Comercial
          </span>
        )
    }
  }

  const renderShippingBadge = (order) => {
    const status = order.shipping_status
    if (status === 'delivered') {
      return (
        <span 
          onClick={() => handleToggleShipping(order.order_id, order.shipping_status)}
          title="Haz clic para cambiar estado"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px',
            borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
            backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)'
          }}
        >
          <Check size={12} /> Entregado
        </span>
      )
    } else if (status === 'ready_for_pickup' || status === 'to_be_withdrawn') {
      return (
        <span 
          onClick={() => handleToggleShipping(order.order_id, order.shipping_status)}
          title="En punto de retiro / sucursal esperando al comprador"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px',
            borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
            backgroundColor: 'rgba(234, 88, 12, 0.15)', color: '#ea580c'
          }}
        >
          📍 En punto de retiro
        </span>
      )
    } else if (status === 'shipped' || status === 'in_transit' || status === 'active' || status === 'out_for_delivery') {
      return (
        <span 
          onClick={() => handleToggleShipping(order.order_id, order.shipping_status)}
          title="Haz clic para cambiar estado"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px',
            borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
            backgroundColor: 'rgba(37, 99, 235, 0.15)', color: '#2563eb'
          }}
        >
          🚚 En camino
        </span>
      )
    } else if (status === 'ready_to_ship' || status === 'handling') {
      return (
        <span 
          onClick={() => handleToggleShipping(order.order_id, order.shipping_status)}
          title="Haz clic para cambiar estado"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px',
            borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
            backgroundColor: 'rgba(168, 85, 247, 0.15)', color: '#9333ea'
          }}
        >
          📦 Listo p/ enviar
        </span>
      )
    } else {
      return (
        <button
          onClick={() => handleToggleShipping(order.order_id, order.shipping_status)}
          title="Haz clic para cambiar el estado de entrega"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px',
            borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, border: 'none',
            cursor: 'pointer', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#d97706'
          }}
        >
          <Clock size={12} /> Pendiente
        </button>
      )
    }
  }

  const exportToCSV = () => {
    if (!sortedOrders || sortedOrders.length === 0) return;
    
    const headers = ["Fecha", "Orden ID", "Canal", "Comprador (Nickname)", "Comprador (Nombre)", "Monto Total", "Estado Pago", "Método Pago", "Entrega"];
    
    const rows = sortedOrders.map(o => [
      new Date(o.date_created).toLocaleString(),
      o.order_id,
      o.source_platform,
      o.buyer?.nickname || '',
      o.buyer?.name || '',
      o.total_amount,
      o.status,
      o.payment_method || '',
      o.shipping_status || ''
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ventas_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isNewOrder = (dateStr) => {
    if (!dateStr) return false
    const orderDate = new Date(dateStr)
    const now = new Date()
    const diffHours = (now - orderDate) / (1000 * 60 * 60)
    const isSameDay = orderDate.toDateString() === now.toDateString()
    return isSameDay || (diffHours >= 0 && diffHours <= 24)
  }

  return (
    <div>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12}}>
        <div>
          <h1 className="page-title" style={{margin: 0}}>Historial de Ventas</h1>
          <p className="page-subtitle" style={{margin: '5px 0 0 0'}}>Visualiza todas las ventas sincronizadas e ingresa pedidos locales.</p>
        </div>
        <div style={{display: 'flex', gap: 10, flexWrap: 'wrap'}}>
          <button 
            className="btn" 
            style={{display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', backgroundColor: 'var(--bg-dark)', color: 'var(--text-secondary)'}}
            onClick={exportToCSV}
          >
            Exportar a CSV
          </button>
          <button 
            className="btn" 
            style={{display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px'}}
            onClick={() => setShowModal(true)}
          >
            <Plus size={16} /> Registrar Venta
          </button>
        </div>
      </div>

      {/* Search & Filters Controls */}
      <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          
          {/* Main Search Input */}
          <div style={{ position: 'relative', flex: '1 1 320px', minWidth: 260 }}>
            <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Buscar por usuario, CUIT/DNI, ID de orden, producto, factura..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-input"
              style={{
                width: '100%',
                paddingLeft: 38,
                paddingRight: searchQuery ? 36 : 12,
                marginBottom: 0,
                fontSize: '0.9rem',
                borderRadius: 8,
                height: 40
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                title="Limpiar búsqueda"
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Filter Dropdowns & Reset */}
          {!isSimpleView && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Filter size={15} style={{ color: 'var(--text-secondary)' }} />
                <select
                  value={platformFilter}
                  onChange={e => setPlatformFilter(e.target.value)}
                  className="search-input"
                  style={{
                    marginBottom: 0,
                    padding: '6px 12px',
                    fontSize: '0.83rem',
                    borderRadius: 8,
                    height: 40,
                    cursor: 'pointer'
                  }}
                >
                  <option value="ALL">🌐 Todos los canales</option>
                  {isChannelEnabled('local') && <option value="LOCAL">🏪 Local Comercial</option>}
                  {isChannelEnabled('meli') && <option value="MERCADOLIBRE">🛍️ Mercado Libre</option>}
                  {isChannelEnabled('tiendanube') && <option value="TIENDANUBE">🛍️ Tiendanube</option>}
                  {isChannelEnabled('web') && <option value="WEB">🌍 Tienda Web</option>}
                  {isChannelEnabled('meli') && <option value="MERCADOPAGO">💳 Mercado Pago</option>}
                </select>
              </div>

              <select
                value={shippingFilter}
                onChange={e => setShippingFilter(e.target.value)}
                className="search-input"
                style={{
                  marginBottom: 0,
                  padding: '6px 12px',
                  fontSize: '0.83rem',
                  borderRadius: 8,
                  height: 40,
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">📦 Todas las entregas</option>
                <option value="pending">⏳ Pendiente</option>
                <option value="ready_for_pickup">📍 En punto de retiro</option>
                <option value="in_transit">🚚 En camino</option>
                <option value="ready_to_ship">📦 Listo p/ enviar</option>
                <option value="delivered">✅ Entregado</option>
              </select>

              {(searchQuery || platformFilter !== 'ALL' || shippingFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setPlatformFilter('ALL')
                    setShippingFilter('ALL')
                  }}
                  className="btn"
                  style={{
                    height: 40,
                    fontSize: '0.8rem',
                    padding: '0 12px',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 8
                  }}
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}
          </div>

        {/* Results counter badge */}
        <div style={{ marginTop: 10, fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>
            Mostrando <strong>{sortedOrders.length}</strong> de <strong>{orders.length}</strong> ventas
            {(searchQuery || platformFilter !== 'ALL' || shippingFilter !== 'ALL') && (
              <span style={{ marginLeft: 6, fontStyle: 'italic' }}>
                (filtrado {searchQuery ? `por "${searchQuery}"` : ''})
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="card">
        {loading ? <p>Cargando ventas...</p> : sortedOrders.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Search size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)' }}>No se encontraron ventas</h3>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              No hay resultados que coincidan con los criterios de búsqueda o filtros seleccionados.
            </p>
            {(searchQuery || platformFilter !== 'ALL' || shippingFilter !== 'ALL') && (
              <button
                type="button"
                className="btn"
                style={{ marginTop: 16, fontSize: '0.85rem' }}
                onClick={() => {
                  setSearchQuery('')
                  setPlatformFilter('ALL')
                  setShippingFilter('ALL')
                }}
              >
                Restablecer filtros
              </button>
            )}
          </div>
        ) : (
          <div style={{overflowX: 'auto', width: '100%'}}>
            <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => requestSort('date_created')} style={{cursor: 'pointer', userSelect: 'none'}}>Fecha{getSortIcon('date_created')}</th>
                <th onClick={() => requestSort('order_id')} style={{cursor: 'pointer', userSelect: 'none'}}>Orden ID{getSortIcon('order_id')}</th>
                <th onClick={() => requestSort('source_platform')} style={{cursor: 'pointer', userSelect: 'none'}}>Canal{getSortIcon('source_platform')}</th>
                <th onClick={() => requestSort('buyer')} style={{cursor: 'pointer', userSelect: 'none'}}>Comprador{getSortIcon('buyer')}</th>
                <th>Items</th>
                <th onClick={() => requestSort('total_amount')} style={{cursor: 'pointer', userSelect: 'none'}}>Monto{getSortIcon('total_amount')}</th>
                <th onClick={() => requestSort('status')} style={{cursor: 'pointer', userSelect: 'none'}}>Pago{getSortIcon('status')}</th>
                <th onClick={() => requestSort('shipping_status')} style={{cursor: 'pointer', userSelect: 'none'}}>Entrega{getSortIcon('shipping_status')}</th>
                <th style={{textAlign: 'center'}}>Factura</th>
              </tr>
            </thead>
            <tbody>
              {sortedOrders.map(o => {
                const isNew = isNewOrder(o.date_created)
                return (
                  <tr key={o.order_id} style={{backgroundColor: isNew ? 'rgba(16, 185, 129, 0.06)' : 'transparent'}}>
                    <td>
                      <div style={{display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap'}}>
                        <span>{new Date(o.date_created).toLocaleString()}</span>
                        {isNew && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            padding: '2px 7px',
                            borderRadius: 10,
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            backgroundColor: '#10b981',
                            color: '#ffffff',
                            boxShadow: '0 0 8px rgba(16, 185, 129, 0.4)',
                            whiteSpace: 'nowrap'
                          }}>
                            ✨ NUEVA
                          </span>
                        )}
                      </div>
                    </td>
                  <td style={{fontFamily: 'monospace', fontSize: '0.8rem'}}>{o.order_id}</td>
                  <td>{renderPlatformBadge(o.source_platform)}</td>
                  <td>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                      <div>
                        <strong>{o.buyer?.nickname || 'Cliente Web/Mostrador'}</strong><br/>
                        <small style={{color: 'var(--text-secondary)'}}>{o.buyer?.name || ''}</small>
                      </div>
                      {o.source_platform === 'MERCADOLIBRE' && (
                        <div>
                          <button
                            type="button"
                            onClick={() => handleOpenChatModal(o)}
                            className="btn"
                            title="Abrir Chat Post-Venta Mercado Libre"
                            style={{
                              padding: '3px 8px',
                              fontSize: '0.72rem',
                              backgroundColor: (unreadMap && unreadMap[o.order_id] > 0) ? '#ef4444' : 'rgba(255, 230, 0, 0.15)',
                              color: (unreadMap && unreadMap[o.order_id] > 0) ? '#ffffff' : '#b39200',
                              border: (unreadMap && unreadMap[o.order_id] > 0) ? '1px solid #ef4444' : '1px solid #b39200',
                              borderRadius: 4,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontWeight: 600,
                              cursor: 'pointer',
                              boxShadow: (unreadMap && unreadMap[o.order_id] > 0) ? '0 0 8px rgba(239, 68, 68, 0.5)' : 'none'
                            }}
                          >
                            <MessageSquare size={12} />
                            Chat ML
                            {unreadMap && unreadMap[o.order_id] > 0 && (
                              <span style={{
                                backgroundColor: '#ffffff',
                                color: '#ef4444',
                                borderRadius: '50%',
                                padding: '1px 5px',
                                fontSize: '0.62rem',
                                fontWeight: 800,
                                marginLeft: 2
                              }}>
                                {unreadMap[o.order_id]}
                              </span>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <ul style={{margin: 0, paddingLeft: 15, fontSize: '0.8rem', color: 'var(--text-secondary)'}}>
                      {(o.items || []).map(i => (
                        <li key={i.id || i.ml_id || Math.random()}>{i.quantity}x {(i.title || '').substring(0,30)}{(i.title || '').length > 30 ? '...' : ''}</li>
                      ))}
                    </ul>
                    {o.inventory_linked === 0 && (
                      <div style={{marginTop: 6}}>
                        <span style={{fontSize: '0.7rem', color: '#d97706', display: 'block', marginBottom: 3, fontWeight: 600}}>
                          ⚠️ Sin vincular a inventario
                        </span>
                        <button
                          type="button"
                          className="btn"
                          style={{fontSize: '0.72rem', padding: '3px 8px', backgroundColor: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600}}
                          onClick={() => {
                            setLinkModalOrder(o)
                            setSelectedProdId('')
                            setSelectedQty(1)
                          }}
                        >
                          🔗 Vincular a Inventario
                        </button>
                      </div>
                    )}
                  </td>
                  <td style={{fontWeight: 600}}>${o.total_amount.toLocaleString()}</td>
                  <td>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start'}}>
                      {o.status === 'pending' || o.payment_status === 'pending' ? (
                        <button
                          type="button"
                          onClick={() => handleConfirmPayment(o.order_id)}
                          title="Haz clic para confirmar que el pago fue recibido / acreditado"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px',
                            borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, border: '1px solid rgba(245, 158, 11, 0.4)',
                            cursor: 'pointer', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#d97706'
                          }}
                        >
                          <Clock size={12} /> Confirmar Pago
                        </button>
                      ) : (
                        <span style={{
                          padding: '3px 6px', 
                          borderRadius: 4, 
                          fontSize: '0.7rem', 
                          fontWeight: 600,
                          backgroundColor: (o.status === 'paid' || o.status === 'approved') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          color: (o.status === 'paid' || o.status === 'approved') ? 'var(--accent-emerald)' : 'var(--accent-red)'
                        }}>
                          {(o.status === 'paid' || o.status === 'approved') ? '✓ APROBADO' : (o.status || 'PENDIENTE').toUpperCase()}
                        </span>
                      )}

                      {o.payment_method && (
                        <small style={{fontSize: '0.68rem', color: 'var(--text-secondary)'}}>
                          {o.payment_method}
                        </small>
                      )}

                      {/* Display matched Mercado Pago payment badge if linked */}
                      {o.mp_payment_id && (
                        <span 
                          title={o.mp_fee_amount ? `Cobro MP #${o.mp_payment_id} | Comisión retenida: $${Number(o.mp_fee_amount).toLocaleString()}` : `Cobro MP #${o.mp_payment_id}`}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            fontSize: '0.65rem', padding: '2px 6px', borderRadius: 4,
                            backgroundColor: 'rgba(0, 158, 227, 0.12)', color: '#009ee3',
                            fontWeight: 600, border: '1px solid rgba(0, 158, 227, 0.25)'
                          }}
                        >
                          💳 MP #{o.mp_payment_id}
                          {o.mp_fee_amount > 0 && (
                            <span style={{opacity: 0.85, fontSize: '0.6rem'}}>(-${Number(o.mp_fee_amount).toFixed(0)})</span>
                          )}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>{renderShippingBadge(o)}</td>
                  <td style={{textAlign: 'center'}}>
                    {o.invoice_generated ? (
                      <div style={{display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center'}}>
                        <a 
                          href={`/api/sales/${o.order_id}/invoice/pdf?token=${localStorage.getItem('adminToken')}`} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="btn" 
                          style={{
                            padding: '4px 8px',
                            fontSize: '0.75rem',
                            backgroundColor: 'rgba(37, 99, 235, 0.1)',
                            color: 'var(--accent-blue)',
                            border: '1px solid var(--accent-blue)',
                            borderRadius: '4px',
                            textDecoration: 'none'
                          }}
                        >
                          Ver Factura AFIP
                        </a>
                        {o.invoice_number && (
                          <small style={{fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'monospace'}}>
                            {o.invoice_number}
                          </small>
                        )}
                      </div>
                    ) : (
                      <div style={{display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center'}}>
                        {o.source_platform === 'MERCADOLIBRE' && o.meli_invoice_attached ? (
                          <a 
                            href={`/api/sales/${o.order_id}/meli-invoice/pdf?token=${localStorage.getItem('adminToken')}`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="btn" 
                            style={{
                              padding: '4px 10px',
                              fontSize: '0.75rem',
                              backgroundColor: 'rgba(255, 230, 0, 0.15)',
                              color: '#b39200',
                              borderRadius: '4px',
                              border: '1px solid #b39200',
                              cursor: 'pointer',
                              textDecoration: 'none',
                              textAlign: 'center',
                              width: '100%'
                            }}
                          >
                            Factura ML
                          </a>
                        ) : (
                          <button 
                            onClick={() => handleCreateInvoice(o.order_id)}
                            disabled={invoicingStates[o.order_id]}
                            className="btn" 
                            style={{
                              padding: '4px 10px',
                              fontSize: '0.75rem',
                              backgroundColor: invoicingStates[o.order_id] ? 'var(--bg-dark)' : 'var(--accent-emerald)',
                              color: '#fff',
                              borderRadius: '4px',
                              border: 'none',
                              cursor: invoicingStates[o.order_id] ? 'not-allowed' : 'pointer',
                              width: '100%'
                            }}
                          >
                            {invoicingStates[o.order_id] ? 'Facturando...' : 'Facturar (AFIP)'}
                          </button>
                        )}
                      </div>
                    )}
                    <div style={{display: 'flex', justifyContent: 'center', marginTop: 4}}>
                      <button 
                        onClick={() => handleDeleteOrder(o.order_id)} 
                        className="btn" 
                        title="Eliminar registro de esta venta" 
                        style={{padding: '2px 6px', fontSize: '0.7rem', backgroundColor: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: 4, opacity: 0.75}}
                      >
                        🗑️ Eliminar
                      </button>
                    </div>
                    {o.source_platform === 'MERCADOLIBRE' && meliEnableManualMsg && (
                      <div style={{display: 'flex', gap: 4, marginTop: 5, justifyContent: 'center', width: '100%', flexWrap: 'wrap'}}>
                        <button 
                          onClick={() => handleSendMeliMessage(o.order_id, 'purchase')} 
                          className="btn" 
                          title="Enviar mensaje de compra predeterminado" 
                          style={{padding: '3px 6px', fontSize: '0.65rem', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', width: 'auto'}}
                        >
                          ✉️ Compra
                        </button>
                        <button 
                          onClick={() => handleSendMeliMessage(o.order_id, 'shipping')} 
                          className="btn" 
                          title="Enviar mensaje de seguimiento de envío predeterminado" 
                          style={{padding: '3px 6px', fontSize: '0.65rem', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', width: 'auto'}}
                        >
                          🚚 Envío
                        </button>
                        <button 
                          onClick={() => handleSendMeliMessage(o.order_id, 'pickup')} 
                          className="btn" 
                          title="Enviar mensaje de paquete en punto de retiro" 
                          style={{padding: '3px 6px', fontSize: '0.65rem', backgroundColor: 'rgba(234, 88, 12, 0.15)', color: '#ea580c', border: '1px solid rgba(234, 88, 12, 0.4)', width: 'auto'}}
                        >
                          📍 Retiro
                        </button>
                        <button 
                          onClick={() => handleSendMeliMessage(o.order_id, 'invoice')} 
                          className="btn" 
                          title="Enviar mensaje de factura predeterminado" 
                          style={{padding: '3px 6px', fontSize: '0.65rem', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', width: 'auto'}}
                        >
                          📄 Factura
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Manual Sale Creation Modal */}
      {showModal && (
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
          zIndex: 999,
          padding: 20
        }}>
          <div className="card shadow-2xl" style={{
            width: 700,
            maxWidth: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            padding: 25,
            overflow: 'hidden',
            backgroundColor: 'var(--bg-card)',
            borderRadius: 12
          }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid var(--border-color)', paddingBottom: 15}}>
              <h3 style={{margin: 0, display: 'flex', alignItems: 'center', gap: 8}}><ShoppingCart /> Registrar Nueva Venta</h3>
              <button 
                className="btn" 
                style={{backgroundColor: 'var(--bg-dark)', color: 'var(--text-secondary)', padding: '6px 12px'}}
                onClick={() => setShowModal(false)}
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={handleCreateManualOrder} style={{flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 15, paddingRight: 5}}>
              <div style={{display: 'flex', gap: 15, flexWrap: 'wrap'}}>
                <label style={{flex: '1 1 170px'}}>Canal de Venta
                  <select 
                    value={newOrder.source_platform}
                    onChange={e => handleSourcePlatformChange(e.target.value)}
                    style={{width: '100%', marginTop: 5}}
                  >
                    <option value="LOCAL">Local Comercial</option>
                    <option value="WEB">Tienda Web</option>
                  </select>
                </label>

                <label style={{flex: '1 1 230px'}}>Medio de Pago
                  <select 
                    value={newOrder.payment_method}
                    onChange={e => {
                      const val = e.target.value
                      setNewOrder(prev => ({
                        ...prev,
                        payment_method: val,
                        // If user selects CBU/Alias bank transfer, suggest pending
                        payment_status: val.includes('CBU') ? 'pending' : prev.payment_status
                      }))
                    }}
                    style={{width: '100%', marginTop: 5}}
                  >
                    <option value="Efectivo">💵 Efectivo</option>
                    <option value="Mercado Pago (Point)">💳 Mercado Pago (Point)</option>
                    <option value="Mercado Pago (Link)">🔗 Mercado Pago (Link / QR)</option>
                    <option value="Transferencia (Mercado Pago)">📱 Transferencia (Mercado Pago)</option>
                    <option value="Transferencia (CBU o Alias)">🏦 Transferencia (CBU o Alias Bancario)</option>
                    <option value="Tarjeta de Débito">💳 Tarjeta de Débito</option>
                    <option value="Tarjeta de Crédito">💳 Tarjeta de Crédito</option>
                  </select>
                </label>

                <label style={{flex: '1 1 200px'}}>Estado del Pago
                  <select 
                    value={newOrder.payment_status}
                    onChange={e => setNewOrder({ ...newOrder, payment_status: e.target.value })}
                    style={{
                      width: '100%', 
                      marginTop: 5,
                      fontWeight: 600,
                      color: newOrder.payment_status === 'paid' ? '#10b981' : '#d97706'
                    }}
                  >
                    <option value="paid">✅ Acreditado / Cobrado</option>
                    <option value="pending">⏳ Pendiente de Acreditación</option>
                  </select>
                </label>
                
                <label style={{flex: '1 1 150px'}}>Estado de Entrega
                  <select 
                    value={newOrder.shipping_status}
                    onChange={e => setNewOrder({ ...newOrder, shipping_status: e.target.value })}
                    style={{width: '100%', marginTop: 5}}
                  >
                    <option value="delivered">✅ Entregado</option>
                    <option value="pending">⏳ Pendiente</option>
                  </select>
                </label>
              </div>

              <div style={{display: 'flex', gap: 15}}>
                <label style={{flex: 1}}>Apodo / ID (Opcional)
                  <input 
                    type="text" 
                    placeholder="Consumidor Final"
                    value={newOrder.buyer_nickname}
                    onChange={e => setNewOrder({ ...newOrder, buyer_nickname: e.target.value })}
                    style={{width: '100%', marginTop: 5}}
                  />
                </label>
                
                <label style={{flex: 1}}>Nombre Comprador (Opcional)
                  <input 
                    type="text" 
                    placeholder="Consumidor Final (Sin DNI)"
                    value={newOrder.buyer_name}
                    onChange={e => setNewOrder({ ...newOrder, buyer_name: e.target.value })}
                    style={{width: '100%', marginTop: 5}}
                  />
                </label>
              </div>

              <div style={{borderTop: '1px solid var(--border-color)', paddingTop: 15}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
                  <h4 style={{margin: 0}}>Productos Vendidos</h4>
                  <button 
                    type="button" 
                    className="btn" 
                    style={{backgroundColor: 'var(--accent-blue)', color: '#fff', padding: '4px 8px', fontSize: '0.75rem'}}
                    onClick={handleAddItem}
                  >
                    + Añadir Producto
                  </button>
                </div>

                {newOrder.items.map((item, idx) => {
                  const filteredProducts = inventory.filter(p => {
                    const q = (item.title || "").toLowerCase()
                    return p.title.toLowerCase().includes(q) || String(p.ml_id).toLowerCase().includes(q)
                  })

                  return (
                    <div key={item.id} style={{display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 10}}>
                      <div style={{flex: 3, position: 'relative'}}>
                        <label style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                          <span>🔍 Producto (Buscar / Escanear QR o Código)</span>
                        </label>

                        <input
                          type="text"
                          required
                          placeholder="Escribe o escanea código con lector..."
                          value={item.title || ""}
                          onFocus={() => setActiveSearchIdx(idx)}
                          onChange={e => {
                            setActiveSearchIdx(idx)
                            handleBarcodeScanOrSearch(idx, e.target.value)
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              if (filteredProducts.length > 0) {
                                handleProductSelect(idx, filteredProducts[0].ml_id)
                                setActiveSearchIdx(null)
                              }
                            }
                          }}
                          style={{width: '100%', marginTop: 5}}
                        />

                        {/* Autocomplete Dropdown List */}
                        {activeSearchIdx === idx && (item.title || "").length > 0 && (
                          <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0,
                            backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
                            borderRadius: 8, zIndex: 1000, maxHeight: 220, overflowY: 'auto',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.25)', marginTop: 2
                          }}>
                            {filteredProducts.length > 0 ? (
                              filteredProducts.map(prod => (
                                <div
                                  key={prod.ml_id}
                                  style={{
                                    padding: '8px 12px', 
                                    cursor: 'pointer', 
                                    borderBottom: '1px solid var(--border-color)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                  }}
                                  onMouseDown={(e) => {
                                    e.preventDefault()
                                    handleProductSelect(idx, prod.ml_id)
                                    setActiveSearchIdx(null)
                                  }}
                                >
                                  <div>
                                    <div style={{fontWeight: 'bold', fontSize: '0.85rem'}}>{prod.title}</div>
                                    <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>SKU/ID: {prod.ml_id}</div>
                                  </div>
                                  <div style={{fontWeight: 'bold', color: 'var(--accent-green)', fontSize: '0.85rem'}}>
                                    ${newOrder.source_platform === 'LOCAL' ? prod.price?.toLocaleString() : (prod.price_web || prod.price)?.toLocaleString()}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div style={{padding: 10, fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center'}}>
                                Se registrará como producto personalizado: "{item.title}"
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <label style={{width: 80}}>Cant.
                        <input 
                          type="number" 
                          required 
                          min="1"
                          value={item.quantity}
                          onChange={e => handleItemChange(idx, 'quantity', e.target.value)}
                          style={{width: '100%', marginTop: 5}}
                        />
                      </label>

                      <label style={{width: 120}}>Precio Unitario
                        <input 
                          type="number" 
                          required 
                          min="0" 
                          step="0.01"
                          placeholder="0.00"
                          value={item.price || ""}
                          onChange={e => handleItemChange(idx, 'price', e.target.value)}
                          style={{width: '100%', marginTop: 5}}
                        />
                      </label>

                      <button
                        type="button"
                        disabled={newOrder.items.length === 1}
                        onClick={() => handleRemoveItem(idx)}
                        style={{
                          padding: 10,
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          color: 'var(--accent-red)',
                          border: 'none',
                          borderRadius: 6,
                          cursor: newOrder.items.length === 1 ? 'not-allowed' : 'pointer'
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Facturación Electrónica ARCA (ex AFIP) */}
              <div style={{
                backgroundColor: 'var(--bg-hover)', 
                padding: '12px 16px', 
                borderRadius: 8, 
                border: '1px solid var(--border-color)',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12
              }}>
                <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0, fontWeight: 'bold', fontSize: '0.9rem'}}>
                  <input 
                    type="checkbox"
                    checked={newOrder.auto_invoice}
                    onChange={e => setNewOrder({ ...newOrder, auto_invoice: e.target.checked })}
                    style={{width: 18, height: 18, accentColor: 'var(--accent-blue)', cursor: 'pointer'}}
                  />
                  📄 Emitir Factura Electrónica ARCA (AFIP) al finalizar
                </label>

                {newOrder.auto_invoice && (
                  <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
                    <label style={{fontSize: '0.85rem', fontWeight: 'normal'}}>Tipo:
                      <select 
                        value={newOrder.invoice_type}
                        onChange={e => setNewOrder({ ...newOrder, invoice_type: e.target.value })}
                        style={{marginLeft: 6, padding: '4px 8px', borderRadius: 4}}
                      >
                        <option value="B">Factura B / C (Consumidor Final)</option>
                        <option value="A">Factura A (Con CUIT)</option>
                      </select>
                    </label>
                  </div>
                )}
              </div>

              <div style={{
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                borderTop: '1px solid var(--border-color)', 
                paddingTop: 15,
                marginTop: 10,
                flexWrap: 'wrap',
                gap: 10
              }}>
                <div style={{fontSize: '1.1rem'}}>
                  Total estimado: <strong>${newOrder.items.reduce((sum, item) => sum + (item.price * item.quantity), 0).toLocaleString()}</strong>
                </div>
                <div style={{display: 'flex', gap: 10}}>
                  <button 
                    type="button" 
                    className="btn" 
                    disabled={chargeLoading}
                    style={{padding: '10px 16px', backgroundColor: '#009ee3', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 'bold'}}
                    onClick={handleGenerateMPCharge}
                  >
                    {chargeLoading ? "Generando..." : "📱 Cobrar con QR / Link MP"}
                  </button>
                  <button type="submit" className="btn" style={{padding: '10px 20px'}}>
                    Registrar Venta
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generated Mercado Pago QR & Payment Link Modal */}
      {generatedCharge && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1100,
          padding: 20
        }}>
          <div className="card shadow-2xl" style={{width: 480, maxWidth: '100%', textAlign: 'center', padding: 25, borderRadius: 12}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: 10, marginBottom: 15}}>
              <h3 style={{margin: 0, color: '#009ee3', display: 'flex', alignItems: 'center', gap: 8}}>
                📱 Cobro con Mercado Pago
              </h3>
              <button 
                className="btn" 
                style={{padding: '4px 10px', backgroundColor: 'transparent', color: 'var(--text-secondary)'}}
                onClick={() => setGeneratedCharge(null)}
              >
                ✕
              </button>
            </div>

            <p style={{fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 15}}>
              Monto a Cobrar: <strong style={{fontSize: '1.4rem', color: 'var(--text-primary)'}}>${generatedCharge.total_amount?.toLocaleString()}</strong>
            </p>

            <div style={{
              backgroundColor: '#ffffff',
              padding: 15,
              borderRadius: 12,
              display: 'inline-block',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              marginBottom: 15
            }}>
              <img 
                src={generatedCharge.qr_code_url} 
                alt="QR Mercado Pago" 
                style={{width: 240, height: 240, display: 'block'}}
              />
            </div>

            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20}}>
              📲 <strong>El cliente debe abrir su app de Mercado Pago o cámara</strong> y escanear este código QR para abonar en el acto.
            </p>

            <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
              <div style={{display: 'flex', gap: 10}}>
                <button 
                  type="button" 
                  className="btn" 
                  style={{flex: 1, padding: '10px', backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)'}}
                  onClick={() => {
                    navigator.clipboard.writeText(generatedCharge.init_point)
                    alert("¡Link de Pago copiado al portapapeles!")
                  }}
                >
                  🔗 Copiar Link de Pago
                </button>
                <button 
                  type="button" 
                  className="btn" 
                  style={{flex: 1, padding: '10px', backgroundColor: '#25D366', color: '#fff', border: 'none', fontWeight: 'bold'}}
                  onClick={() => {
                    const text = encodeURIComponent(`Hola! Aquí tienes el link para abonar tu compra de $${generatedCharge.total_amount?.toLocaleString()} por Mercado Pago: ${generatedCharge.init_point}`)
                    window.open(`https://wa.me/?text=${text}`, '_blank')
                  }}
                >
                  💬 Enviar por WhatsApp
                </button>
              </div>

              <button 
                type="button" 
                className="btn" 
                style={{width: '100%', padding: '12px', marginTop: 10, fontSize: '1rem', fontWeight: 'bold'}}
                onClick={() => {
                  setGeneratedCharge(null)
                  setShowModal(false)
                  alert("Venta procesada. En cuanto el cliente complete el pago por QR o Link, se sincronizará automáticamente.")
                }}
              >
                ✓ Confirmar y Finalizar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Link Modal */}
      {linkModalOrder && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{width: '90%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderBottom: '1px solid var(--border-color)', paddingBottom: 10}}>
              <h3>🔗 Vincular Cobro a Inventario</h3>
              <button 
                className="btn" 
                style={{padding: '4px 10px', backgroundColor: 'transparent', color: 'var(--text-secondary)'}}
                onClick={() => setLinkModalOrder(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault()
              if (!selectedProdId) {
                alert("Por favor selecciona un producto")
                return
              }
              setLinkingLoading(true)
              try {
                const res = await fetch(`/api/sales/${linkModalOrder.order_id}/link-inventory`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    items: [{ ml_id: selectedProdId, quantity: selectedQty }]
                  })
                })
                const data = await res.json()
                if (res.ok) {
                  alert("¡Inventario vinculado y stock actualizado con éxito!")
                  setLinkModalOrder(null)
                  fetchOrders()
                  fetchInventory()
                } else {
                  alert("Error al vincular inventario: " + (data.detail || "Error desconocido"))
                }
              } catch(err) {
                alert("Error de conexión: " + err.message)
              } finally {
                setLinkingLoading(false)
              }
            }}>
              <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 15}}>
                Este cobro de <strong>${linkModalOrder.total_amount?.toLocaleString()}</strong> ({linkModalOrder.source_platform}) no tiene producto asignado. Selecciona el producto vendido para descontar stock y calcular ganancias netas:
              </p>

              <div style={{display: 'flex', flexDirection: 'column', gap: 15}}>
                <label>Producto del Inventario
                  <select 
                    required 
                    value={selectedProdId} 
                    onChange={e => setSelectedProdId(e.target.value)}
                    style={{width: '100%', marginTop: 5, padding: '8px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                  >
                    <option value="">Selecciona un producto...</option>
                    {inventory.map(p => (
                      <option key={p.ml_id} value={p.ml_id}>
                        {p.title} (Stock: {p.available_quantity} u.) - Costo: ${p.cost_price || 0}
                      </option>
                    ))}
                  </select>
                </label>

                <label>Cantidad Vendida
                  <input 
                    type="number" 
                    required 
                    min="1" 
                    value={selectedQty} 
                    onChange={e => setSelectedQty(parseInt(e.target.value) || 1)}
                    style={{width: '100%', marginTop: 5, padding: '8px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                  />
                </label>
              </div>

              <div style={{display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, borderTop: '1px solid var(--border-color)', paddingTop: 15}}>
                <button 
                  type="button" 
                  className="btn" 
                  style={{backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)'}}
                  onClick={() => setLinkModalOrder(null)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn" disabled={linkingLoading}>
                  {linkingLoading ? "Viculando..." : "Vincular y Descontar Stock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* AFIP / ARCA Invoicing Custom Modal */}
      {invoiceModalOrder && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex',
          justifyContent: 'center', alignItems: 'center', zIndex: 1100, padding: 20
        }}>
          <div className="card shadow-2xl" style={{width: 520, maxWidth: '100%', padding: 25, borderRadius: 12}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderBottom: '1px solid var(--border-color)', paddingBottom: 10}}>
              <h3 style={{margin: 0, color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: 8}}>
                📄 Emitir Factura AFIP / ARCA
              </h3>
              <button 
                className="btn" 
                style={{padding: '4px 10px', backgroundColor: 'transparent', color: 'var(--text-secondary)'}}
                onClick={() => setInvoiceModalOrder(null)}
              >
                ✕
              </button>
            </div>

            <div style={{marginBottom: 15, fontSize: '0.9rem', color: 'var(--text-secondary)'}}>
              Pedido: <strong>#{invoiceModalOrder.order_id}</strong> | Plataforma: <strong>{invoiceModalOrder.source_platform}</strong> | Total: <strong>${invoiceModalOrder.total_amount?.toLocaleString()}</strong>
            </div>

            {/* Mercado Libre / Customer Billing Info Banner */}
            {mlBillingLoading ? (
              <div style={{fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '10px', backgroundColor: 'var(--bg-hover)', borderRadius: 8, marginBottom: 15, textAlign: 'center'}}>
                ⏳ Consultando datos de facturación registrados...
              </div>
            ) : mlBillingInfo && (mlBillingInfo.document_number || mlBillingInfo.name) ? (
              <div style={{
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 15
              }}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                  <span style={{fontSize: '0.82rem', fontWeight: 'bold', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: 6}}>
                    🗂️ Datos de Facturación Registrados ({mlBillingInfo.source}):
                  </span>
                  <button
                    type="button"
                    className="btn"
                    onClick={handleApplyMlBilling}
                    style={{padding: '3px 8px', fontSize: '0.75rem', backgroundColor: 'var(--accent-blue)', color: '#fff', borderRadius: 4}}
                    title="Copiar estos datos al formulario de emisión"
                  >
                    ✨ Usar datos cargados
                  </button>
                </div>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: '0.8rem', color: 'var(--text-primary)'}}>
                  <div>
                    <span style={{color: 'var(--text-secondary)'}}>CUIT / DNI: </span>
                    <strong>{mlBillingInfo.document_number || 'Sin CUIT'}</strong>
                  </div>
                  <div>
                    <span style={{color: 'var(--text-secondary)'}}>Condición IVA: </span>
                    <strong style={{color: 'var(--accent-emerald)'}}>{mlBillingInfo.taxpayer_type || 'Consumidor Final'}</strong>
                  </div>
                  <div style={{gridColumn: 'span 2'}}>
                    <span style={{color: 'var(--text-secondary)'}}>Razón Social: </span>
                    <strong>{mlBillingInfo.name || 'Sin Razón Social'}</strong>
                  </div>
                  {mlBillingInfo.address && (
                    <div style={{gridColumn: 'span 2', fontSize: '0.78rem', color: 'var(--text-secondary)'}}>
                      <span>Domicilio Fiscal: </span>{mlBillingInfo.address}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div style={{marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12}}>
              <label style={{display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 'bold'}}>
                <input 
                  type="radio" 
                  name="invoiceDocType" 
                  value="99" 
                  checked={customInvoiceDocType === '99'} 
                  onChange={() => setCustomInvoiceDocType('99')} 
                />
                <span>Consumidor Final (Sin DNI / Anónimo)</span>
              </label>

              <label style={{display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 'bold'}}>
                <input 
                  type="radio" 
                  name="invoiceDocType" 
                  value="CUIT" 
                  checked={customInvoiceDocType === 'CUIT'} 
                  onChange={() => setCustomInvoiceDocType('CUIT')} 
                />
                <span>Facturar a CUIT (Factura A / B / C con CUIT)</span>
              </label>

              {customInvoiceDocType === 'CUIT' && (
                <div style={{
                  backgroundColor: 'var(--bg-hover)', padding: 15, borderRadius: 8, marginTop: 5,
                  display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--border-color)'
                }}>
                  <div style={{fontSize: '0.8rem', color: 'var(--accent-blue)', fontWeight: 'bold'}}>
                    💡 Si eres Monotributista se emitirá Factura C a nombre de este CUIT. Si eres Resp. Inscripto se emitirá Factura A.
                  </div>
                  <label style={{fontSize: '0.85rem'}}>CUIT / CUIL del Comprador / Empresa:
                    <div style={{display: 'flex', gap: 8, marginTop: 5}}>
                      <input 
                        type="text" 
                        placeholder="ej. 30-71234567-9" 
                        value={customCuit} 
                        onChange={e => setCustomCuit(e.target.value)} 
                        style={{flex: 1}}
                      />
                      <button 
                        type="button" 
                        className="btn" 
                        disabled={cuitLookupLoading}
                        style={{padding: '6px 12px', backgroundColor: 'var(--accent-blue)', color: '#fff', fontSize: '0.8rem'}}
                        onClick={handleLookupAFIP}
                      >
                        {cuitLookupLoading ? 'Buscando...' : '🔍 Buscar AFIP'}
                      </button>
                    </div>
                  </label>

                  <label style={{fontSize: '0.85rem'}}>Razón Social / Nombre Oficial:
                    <input 
                      type="text" 
                      placeholder="Razón Social devuelta por AFIP o tipear manualmente..." 
                      value={customName} 
                      onChange={e => setCustomName(e.target.value)} 
                      style={{width: '100%', marginTop: 5}}
                    />
                  </label>

                  <label style={{fontSize: '0.85rem'}}>Condición frente al IVA del Comprador:
                    <select
                      value={customIvaCondition}
                      onChange={e => setCustomIvaCondition(e.target.value)}
                      style={{width: '100%', marginTop: 5, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontWeight: 'bold'}}
                    >
                      <option value="IVA Exento">IVA Exento / Exento</option>
                      <option value="Responsable Inscripto">Responsable Inscripto</option>
                      <option value="Responsable Monotributo">Responsable Monotributo</option>
                      <option value="Consumidor Final">Consumidor Final</option>
                      <option value="No Responsable">No Responsable / Sin Alcanzar</option>
                    </select>
                  </label>
                </div>
              )}

              {/* Detalle e Ítems a Facturar (Corroboración Previa) */}
              <div style={{
                marginTop: 15,
                padding: 12,
                borderRadius: 8,
                backgroundColor: 'var(--bg-hover)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}>
                <div style={{fontSize: '0.82rem', fontWeight: 'bold', color: 'var(--accent-blue)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <span>📄 Ítems a incluir en la Factura (Corroboración):</span>
                  <span style={{fontSize: '0.88rem', color: 'var(--accent-emerald)', fontWeight: 800}}>
                    Total: ${((invoiceModalOrder.items?.reduce((sum, it) => sum + (it.unit_price || it.price || 0) * (it.quantity || 1), 0) || invoiceModalOrder.total_amount || 0) + (includeShippingInInvoice ? customShippingCost : 0)).toLocaleString('es-AR', {minimumFractionDigits: 2})}
                  </span>
                </div>

                <div style={{fontSize: '0.8rem', backgroundColor: 'var(--bg-dark)', borderRadius: 6, padding: '8px 12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 6}}>
                  {invoiceModalOrder.items?.map((item, idx) => (
                    <div key={idx} style={{display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--border-color)', paddingBottom: 4}}>
                      <span style={{fontWeight: 500}}>• {item.title || item.name} (x{item.quantity || 1})</span>
                      <span style={{fontWeight: 600}}>${((item.unit_price || item.price || 0) * (item.quantity || 1)).toLocaleString('es-AR', {minimumFractionDigits: 2})}</span>
                    </div>
                  ))}

                  {customShippingCost > 0 && (
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, color: includeShippingInInvoice ? 'var(--accent-emerald)' : 'var(--text-secondary)'}}>
                      <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 'bold'}}>
                        <input 
                          type="checkbox" 
                          checked={includeShippingInInvoice} 
                          onChange={e => setIncludeShippingInInvoice(e.target.checked)} 
                        />
                        <span>🚚 Servicio de Envío Mercado Libre</span>
                      </label>
                      <span style={{fontWeight: 'bold'}}>${customShippingCost.toLocaleString('es-AR', {minimumFractionDigits: 2})}</span>
                    </div>
                  )}
                </div>

                {customShippingCost > 0 && (
                  <div style={{
                    marginTop: 8, padding: '8px 12px', borderRadius: 6,
                    backgroundColor: mlBillingInfo?.is_free_shipping ? (includeShippingInInvoice ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)') : (includeShippingInInvoice ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)'),
                    border: mlBillingInfo?.is_free_shipping ? (includeShippingInInvoice ? '1px solid #ef4444' : '1px solid #10b981') : (includeShippingInInvoice ? '1px solid #10b981' : '1px solid #f59e0b')
                  }}>
                    {mlBillingInfo?.is_free_shipping ? (
                      <div style={{fontSize: '0.78rem', color: includeShippingInInvoice ? '#ef4444' : '#10b981', fontWeight: 600}}>
                        {includeShippingInInvoice ? (
                          <span>⚠️ <strong>Cuidado:</strong> El comprador tuvo <strong>Envío Gratis</strong> en Mercado Libre. Al tildar esta opción, la factura superará el importe abonado por el cliente (${invoiceModalOrder.total_amount?.toLocaleString('es-AR')}).</span>
                        ) : (
                          <span>🎁 <strong>Envío Gratis para el comprador:</strong> Excluido de la factura por defecto. El total a facturar (${invoiceModalOrder.total_amount?.toLocaleString('es-AR')}) coincide exactamente con el monto cobrado al comprador.</span>
                        )}
                      </div>
                    ) : (
                      <div style={{fontSize: '0.76rem', color: includeShippingInInvoice ? 'var(--accent-emerald)' : 'var(--accent-orange)'}}>
                        💡 {includeShippingInInvoice ? 'Se agregará "Servicio de Envío Mercado Libre" como ítem a la factura.' : 'Cuidado: El costo de envío se ha excluido de la factura.'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div style={{display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border-color)', paddingTop: 15}}>
              <button className="btn" style={{backgroundColor: 'var(--bg-dark)'}} onClick={() => setInvoiceModalOrder(null)}>
                Cancelar
              </button>
              <button 
                className="btn" 
                disabled={invoicingStates[invoiceModalOrder.order_id]} 
                style={{padding: '10px 20px', fontWeight: 'bold'}}
                onClick={handleConfirmInvoice}
              >
                {invoicingStates[invoiceModalOrder.order_id] ? "Facturando..." : "⚡ Confirmar y Emitir Factura"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mercado Libre Post-Sale Chat Modal */}
      {chatModalOrder && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000, padding: 15
        }}>
          <div className="card shadow-2xl" style={{
            width: 720, maxWidth: '100%', height: 620, maxHeight: '90vh',
            display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden',
            backgroundColor: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-color)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              backgroundColor: 'var(--bg-dark)', gap: 10, flexWrap: 'wrap'
            }}>
              <div>
                <h3 style={{margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.05rem'}}>
                  <MessageSquare size={18} style={{color: '#b39200'}} />
                  Chat Post-Venta: {chatModalOrder.buyer?.nickname || chatModalOrder.buyer?.name || 'Comprador'}
                </h3>
                <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'monospace'}}>
                  Orden #{chatModalOrder.order_id} • Total: ${chatModalOrder.total_amount?.toLocaleString()}
                </div>
              </div>

              <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                <a 
                  href={chatMeliUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="btn"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                    fontSize: '0.78rem', backgroundColor: 'rgba(255, 230, 0, 0.15)', color: '#b39200',
                    border: '1px solid #b39200', borderRadius: 6, textDecoration: 'none', fontWeight: 600
                  }}
                >
                  <ExternalLink size={13} /> Abrir en Mercado Libre ↗
                </a>
                <button 
                  type="button" 
                  onClick={() => setChatModalOrder(null)} 
                  style={{background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.2rem', cursor: 'pointer', padding: 4}}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Detected Billing Info Banner */}
            {(() => {
              const detected = chatMessages.find(m => m.detected_cuit || m.detected_name)
              if (!detected) return null
              return (
                <div style={{
                  backgroundColor: 'rgba(59, 130, 246, 0.12)', borderBottom: '1px solid var(--accent-blue)',
                  padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: 10, flexWrap: 'wrap'
                }}>
                  <div>
                    <div style={{fontWeight: 700, fontSize: '0.8rem', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: 6}}>
                      <FileText size={14} /> Datos de Facturación Detectados en Mensajes:
                    </div>
                    <div style={{fontSize: '0.75rem', color: 'var(--text-primary)', marginTop: 2}}>
                      {detected.detected_cuit && <span><strong>CUIT:</strong> {detected.detected_cuit} </span>}
                      {detected.detected_name && <span>| <strong>Razón Social:</strong> {detected.detected_name} </span>}
                      {detected.detected_iva && <span>| <strong>Condición:</strong> {detected.detected_iva}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      const targetOrder = chatModalOrder
                      setChatModalOrder(null)
                      handleOpenInvoiceModal(targetOrder)
                      setCustomInvoiceDocType('CUIT')
                      if (detected.detected_cuit) setCustomCuit(detected.detected_cuit)
                      if (detected.detected_name) setCustomName(detected.detected_name)
                      if (detected.detected_iva) setCustomIvaCondition(detected.detected_iva)
                    }}
                    style={{
                      padding: '4px 10px', fontSize: '0.72rem', backgroundColor: 'var(--accent-blue)',
                      color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 4
                    }}
                  >
                    <UserCheck size={13} /> Pre-llenar Factura AFIP
                  </button>
                </div>
              )
            })()}

            {/* Chat Messages Container */}
            <div style={{flex: 1, padding: 16, overflowY: 'auto', backgroundColor: 'var(--bg-dark)', display: 'flex', flexDirection: 'column', gap: 12}}>
              {chatLoading ? (
                <div style={{textAlign: 'center', color: 'var(--text-secondary)', margin: 'auto'}}>Cargando mensajes del comprador...</div>
              ) : chatMessages.length === 0 ? (
                <div style={{textAlign: 'center', color: 'var(--text-secondary)', margin: 'auto'}}>
                  No hay mensajes registrados en esta conversación de Mercado Libre.
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div 
                    key={msg.id || idx} 
                    style={{
                      alignSelf: msg.from_buyer ? 'flex-start' : 'flex-end',
                      maxWidth: '75%',
                      backgroundColor: msg.from_buyer ? 'var(--bg-card)' : 'rgba(59, 130, 246, 0.2)',
                      border: msg.from_buyer ? '1px solid var(--border-color)' : '1px solid var(--accent-blue)',
                      borderRadius: 10,
                      padding: '10px 14px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                  >
                    <div style={{fontSize: '0.7rem', fontWeight: 700, color: msg.from_buyer ? 'var(--accent-amber)' : 'var(--accent-blue)', marginBottom: 4}}>
                      {msg.sender_name || (msg.from_buyer ? 'Comprador' : 'Vendedor')}
                    </div>
                    <div style={{fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4}}>
                      {msg.text}
                    </div>
                    <div style={{fontSize: '0.65rem', color: 'var(--text-secondary)', textAlign: 'right', marginTop: 4}}>
                      {msg.created_at ? new Date(msg.created_at).toLocaleString() : ''}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Chat Input Bar */}
            <form onSubmit={handleSendChatMessage} style={{padding: 12, borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', display: 'flex', gap: 8}}>
              <input 
                type="text" 
                placeholder="Escribe un mensaje para el comprador en Mercado Libre..." 
                value={newMessageText} 
                onChange={e => setNewMessageText(e.target.value)} 
                disabled={sendingMessage}
                style={{
                  flex: 1, padding: '8px 12px', fontSize: '0.85rem',
                  backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)', borderRadius: 6
                }}
              />
              <button 
                type="submit" 
                disabled={sendingMessage || !newMessageText.trim()}
                className="btn" 
                style={{
                  padding: '8px 16px', fontSize: '0.85rem', backgroundColor: 'var(--accent-blue)',
                  color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 6, cursor: (sendingMessage || !newMessageText.trim()) ? 'not-allowed' : 'pointer'
                }}
              >
                <Send size={15} /> {sendingMessage ? 'Enviando...' : 'Enviar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
