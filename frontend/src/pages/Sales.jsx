import React, { useState, useEffect } from 'react'

export default function Sales() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })

  useEffect(() => {
    fetch('/api/sales/')
      .then(res => res.json())
      .then(data => {
        setOrders(data.orders || [])
        setLoading(false)
      })
  }, [])

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

        // Custom handles
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
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }
    return sortableItems
  }, [orders, sortConfig])

  return (
    <div>
      <h1 className="page-title">Historial de Ventas</h1>
      <p className="page-subtitle">Visualiza todas las ventas descargadas de tu cuenta.</p>

      <div className="card">
        {loading ? <p>Cargando...</p> : (
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => requestSort('date_created')} style={{cursor: 'pointer', userSelect: 'none'}}>Fecha{getSortIcon('date_created')}</th>
                <th onClick={() => requestSort('order_id')} style={{cursor: 'pointer', userSelect: 'none'}}>Orden ID{getSortIcon('order_id')}</th>
                <th onClick={() => requestSort('buyer')} style={{cursor: 'pointer', userSelect: 'none'}}>Comprador{getSortIcon('buyer')}</th>
                <th onClick={() => requestSort('total_amount')} style={{cursor: 'pointer', userSelect: 'none'}}>Monto{getSortIcon('total_amount')}</th>
                <th onClick={() => requestSort('status')} style={{cursor: 'pointer', userSelect: 'none'}}>Estado{getSortIcon('status')}</th>
                <th>Items</th>
              </tr>
            </thead>
            <tbody>
              {sortedOrders.map(o => (
                <tr key={o.order_id}>
                  <td>{new Date(o.date_created).toLocaleString()}</td>
                  <td style={{fontFamily: 'monospace'}}>{o.order_id}</td>
                  <td>
                    <strong>{o.buyer.nickname}</strong><br/>
                    <small>{o.buyer.name}</small>
                  </td>
                  <td>${o.total_amount.toLocaleString()}</td>
                  <td>
                    <span style={{
                      padding: '4px 8px', 
                      borderRadius: 4, 
                      fontSize: '0.75rem', 
                      fontWeight: 600,
                      backgroundColor: o.status === 'paid' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      color: o.status === 'paid' ? 'var(--accent-emerald)' : 'var(--accent-red)'
                    }}>{o.status.toUpperCase()}</span>
                  </td>
                  <td>
                    <ul style={{margin: 0, paddingLeft: 15, fontSize: '0.8rem', color: 'var(--text-secondary)'}}>
                      {o.items.map(i => (
                        <li key={i.id}>{i.quantity}x {i.title.substring(0,30)}...</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
