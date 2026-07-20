import React, { useState, useEffect } from 'react'
import { ShoppingBag, Globe, Store, Check, Clock, Plus, Trash2, ShoppingCart } from 'lucide-react'

export default function Sales() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortConfig, setSortConfig] = useState({ key: 'date_created', direction: 'desc' })

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [inventory, setInventory] = useState([])
  const [newOrder, setNewOrder] = useState({
    buyer_nickname: "",
    buyer_name: "",
    source_platform: "LOCAL", // "LOCAL" or "WEB"
    shipping_status: "pending", // "pending" or "delivered"
    payment_method: "Efectivo",
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

  const handleCreateInvoice = async (orderId) => {
    setInvoicingStates(prev => ({ ...prev, [orderId]: true }))
    try {
      const res = await fetch(`/api/sales/${orderId}/invoice`, {
        method: 'POST'
      })
      if (res.ok) {
        const data = await res.json()
        let msg = `Factura generada con éxito: ${data.invoice_number}`
        if (data.meli_uploaded !== undefined) {
           msg += data.meli_uploaded ? ` | Adjuntada en ML ✓` : ` | Error ML: ${data.meli_msg}`
        }
        alert(msg)
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
    const updatedItems = [...newOrder.items]
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: field === 'quantity' ? parseInt(value) || 0 : field === 'price' ? parseFloat(value) || 0 : value
    }
    setNewOrder(prev => ({ ...prev, items: updatedItems }))
  }

  const handleCreateManualOrder = async (e) => {
    e.preventDefault()
    
    // Validations
    if (!newOrder.buyer_nickname || !newOrder.buyer_name) {
      alert("Todos los datos del comprador son obligatorios")
      return
    }
    
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
          total_amount
        })
      })
      if (res.ok) {
        alert("Venta registrada con éxito")
        setShowModal(false)
        setNewOrder({
          buyer_nickname: "",
          buyer_name: "",
          source_platform: "LOCAL",
          shipping_status: "pending",
          payment_method: "Efectivo",
          items: [{ id: "manual-1", title: "", quantity: 1, price: 0 }]
        })
        fetchOrders()
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
    switch (platform?.toUpperCase()) {
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
              {sortedOrders.map(o => (
                <tr key={o.order_id}>
                  <td>{new Date(o.date_created).toLocaleString()}</td>
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
                  </td>
                </tr>
              ))}
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
                <label style={{flex: 1}}>Apodo / Nickname Comprador
                  <input 
                    type="text" 
                    required 
                    placeholder="ej. franco_84"
                    value={newOrder.buyer_nickname}
                    onChange={e => setNewOrder({ ...newOrder, buyer_nickname: e.target.value })}
                    style={{width: '100%', marginTop: 5}}
                  />
                </label>
                
                <label style={{flex: 1}}>Nombre Completo Comprador
                  <input 
                    type="text" 
                    required 
                    placeholder="ej. Franco Di Picar"
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

                {newOrder.items.map((item, idx) => (
                  <div key={item.id} style={{display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 10}}>
                    <label style={{flex: 3}}>Nombre del Producto
                      <select
                        required
                        value={item.id.startsWith('manual-') ? "" : item.id}
                        onChange={e => {
                          const prodId = e.target.value
                          const selectedProduct = inventory.find(p => p.ml_id === prodId)
                          const title = selectedProduct ? selectedProduct.title : ""
                          let price = 0
                          if (selectedProduct) {
                            price = newOrder.source_platform === 'LOCAL' 
                              ? selectedProduct.price 
                              : (selectedProduct.price_web || selectedProduct.price)
                          }
                          handleItemChange(idx, 'title', title)
                          handleItemChange(idx, 'id', prodId)
                          handleItemChange(idx, 'price', price)
                        }}
                        style={{width: '100%', marginTop: 5}}
                      >
                        <option value="">Seleccione un producto...</option>
                        {inventory.map(prod => (
                          <option key={prod.ml_id} value={prod.ml_id}>
                            {prod.title} (${newOrder.source_platform === 'LOCAL' ? prod.price : (prod.price_web || prod.price)})
                          </option>
                        ))}
                      </select>
                    </label>
                    
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
                ))}
              </div>

              <div style={{
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                borderTop: '1px solid var(--border-color)', 
                paddingTop: 15,
                marginTop: 10
              }}>
                <div style={{fontSize: '1.1rem'}}>
                  Total estimado: <strong>${newOrder.items.reduce((sum, item) => sum + (item.price * item.quantity), 0).toLocaleString()}</strong>
                </div>
                <button type="submit" className="btn" style={{padding: '10px 20px'}}>
                  Registrar Venta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
