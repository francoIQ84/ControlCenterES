import React, { useState, useEffect } from 'react'
import { ShoppingBag, Globe, Store, Check, Clock, Plus, Trash2, ShoppingCart, DollarSign, Link } from 'lucide-react'

export default function Sales() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortConfig, setSortConfig] = useState({ key: 'date_created', direction: 'desc' })

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
    shipping_status: "pending", // "pending" or "delivered"
    payment_method: "Efectivo",
    auto_invoice: false,
    invoice_type: "B",
    items: [{ id: "manual-1", title: "", quantity: 1, price: 0 }]
  })

  const [invoicingStates, setInvoicingStates] = useState({})

  const fetchOrders = () => {
    setLoading(true)
    fetch('/api/sales/')
      .then(res => res.json())
      .then(data => {
        setOrders(data.orders || [])
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setLoading(false)
      })
  }

  // AFIP Invoicing Modal State
  const [invoiceModalOrder, setInvoiceModalOrder] = useState(null)
  const [customInvoiceDocType, setCustomInvoiceDocType] = useState('99') // '99' or 'CUIT'
  const [customCuit, setCustomCuit] = useState('')
  const [customName, setCustomName] = useState('')
  const [cuitLookupLoading, setCuitLookupLoading] = useState(false)

  const handleOpenInvoiceModal = (order) => {
    setInvoiceModalOrder(order)
    const buyerDoc = order.buyer?.document_number || ''
    const buyerDocType = order.buyer?.document_type || ''
    if (buyerDocType === 'CUIT' || buyerDoc.length === 11) {
      setCustomInvoiceDocType('CUIT')
      setCustomCuit(buyerDoc)
      setCustomName(order.buyer?.name || '')
    } else {
      setCustomInvoiceDocType('99')
      setCustomCuit('')
      setCustomName('')
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
        alert(`¡Razón Social encontrada!: ${data.razon_social}`)
      } else {
        alert("Error AFIP Padrón: " + (data.detail || "No se encontró el CUIT"))
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
    setInvoicingStates(prev => ({ ...prev, [orderId]: true }))

    try {
      const bodyPayload = {
        doc_type: customInvoiceDocType,
        cuit: customInvoiceDocType === 'CUIT' ? customCuit : null,
        name: customInvoiceDocType === 'CUIT' ? customName : null
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
          shipping_status: "pending",
          payment_method: "Efectivo",
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

  const sortedOrders = React.useMemo(() => {
    let sortableItems = [...orders]
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
  }, [orders, sortConfig])

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
    const isDelivered = order.shipping_status === 'delivered'
    return (
      <button
        onClick={() => handleToggleShipping(order.order_id, order.shipping_status)}
        title="Haz clic para cambiar el estado de entrega"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          borderRadius: 6,
          fontSize: '0.75rem',
          fontWeight: 600,
          border: 'none',
          cursor: 'pointer',
          transition: 'all 0.2s',
          backgroundColor: isDelivered ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
          color: isDelivered ? 'var(--accent-emerald)' : '#d97706'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'none'
        }}
      >
        {isDelivered ? <Check size={12} /> : <Clock size={12} />}
        {isDelivered ? 'Entregado' : 'Pendiente'}
      </button>
    )
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
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
        <div>
          <h1 className="page-title">Historial de Ventas</h1>
          <p className="page-subtitle">Visualiza todas las ventas sincronizadas e ingresa pedidos locales.</p>
        </div>
        <div style={{display: 'flex', gap: 10}}>
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

      <div className="card">
        {loading ? <p>Cargando ventas...</p> : (
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
                    <strong>{o.buyer.nickname || 'Cliente Web/Mostrador'}</strong><br/>
                    <small style={{color: 'var(--text-secondary)'}}>{o.buyer.name}</small>
                  </td>
                  <td>
                    <ul style={{margin: 0, paddingLeft: 15, fontSize: '0.8rem', color: 'var(--text-secondary)'}}>
                      {o.items.map(i => (
                        <li key={i.id}>{i.quantity}x {i.title.substring(0,30)}{i.title.length > 30 ? '...' : ''}</li>
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
                    <span style={{
                      padding: '3px 6px', 
                      borderRadius: 4, 
                      fontSize: '0.7rem', 
                      fontWeight: 600,
                      backgroundColor: o.status === 'paid' || o.status === 'approved' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      color: o.status === 'paid' || o.status === 'approved' ? 'var(--accent-emerald)' : 'var(--accent-red)'
                    }}>{(o.status === 'paid' || o.status === 'approved') ? `APROBADO ${o.payment_method ? `(${o.payment_method})` : ''}` : o.status.toUpperCase()}</span>
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
                    {o.source_platform === 'MERCADOLIBRE' && meliEnableManualMsg && (
                      <div style={{display: 'flex', gap: 4, marginTop: 5, justifyContent: 'center', width: '100%'}}>
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
              <div style={{display: 'flex', gap: 15}}>
                <label style={{flex: 1}}>Canal de Venta
                  <select 
                    value={newOrder.source_platform}
                    onChange={e => handleSourcePlatformChange(e.target.value)}
                    style={{width: '100%', marginTop: 5}}
                  >
                    <option value="LOCAL">Local Comercial</option>
                    <option value="WEB">Tienda Web</option>
                  </select>
                </label>

                <label style={{flex: 1}}>Medio de Pago
                  <select 
                    value={newOrder.payment_method}
                    onChange={e => setNewOrder({ ...newOrder, payment_method: e.target.value })}
                    style={{width: '100%', marginTop: 5}}
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Mercado Pago (Point)">Mercado Pago (Point)</option>
                    <option value="Mercado Pago (Link)">Mercado Pago (Link)</option>
                    <option value="Transferencia">Transferencia Bancaria</option>
                  </select>
                </label>
                
                <label style={{flex: 1}}>Estado de Entrega
                  <select 
                    value={newOrder.shipping_status}
                    onChange={e => setNewOrder({ ...newOrder, shipping_status: e.target.value })}
                    style={{width: '100%', marginTop: 5}}
                  >
                    <option value="pending">Pendiente</option>
                    <option value="delivered">Entregado</option>
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
                </div>
              )}
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
    </div>
  )
}
