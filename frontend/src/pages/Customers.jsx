import React, { useState, useEffect } from 'react'

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })

  useEffect(() => {
    fetch('/api/customers/')
      .then(res => res.json())
      .then(data => {
        setCustomers(data.customers || [])
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

  const sortedCustomers = React.useMemo(() => {
    let sortableItems = [...customers]
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let aVal = a[sortConfig.key]
        let bVal = b[sortConfig.key]

        // Custom handles
        if (sortConfig.key === 'nickname') {
          aVal = (a.nickname || "").toLowerCase()
          bVal = (b.nickname || "").toLowerCase()
        } else if (sortConfig.key === 'full_name') {
          aVal = (a.full_name || "").toLowerCase()
          bVal = (b.full_name || "").toLowerCase()
        } else if (sortConfig.key === 'total_orders') {
          aVal = a.total_orders || 0
          bVal = b.total_orders || 0
        } else if (sortConfig.key === 'total_spent') {
          aVal = a.total_spent || 0
          bVal = b.total_spent || 0
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }
    return sortableItems
  }, [customers, sortConfig])

  return (
    <div>
      <h1 className="page-title">Cartera de Clientes</h1>
      <p className="page-subtitle">Listado de compradores con métricas de compras recurrentes.</p>

      <div className="card">
        {loading ? <p>Cargando...</p> : (
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => requestSort('nickname')} style={{cursor: 'pointer', userSelect: 'none'}}>Comprador{getSortIcon('nickname')}</th>
                <th onClick={() => requestSort('full_name')} style={{cursor: 'pointer', userSelect: 'none'}}>Nombre Real{getSortIcon('full_name')}</th>
                <th>Contacto</th>
                <th>Doc</th>
                <th onClick={() => requestSort('total_orders')} style={{cursor: 'pointer', userSelect: 'none'}}>Total Órdenes{getSortIcon('total_orders')}</th>
                <th onClick={() => requestSort('total_spent')} style={{cursor: 'pointer', userSelect: 'none'}}>Total Gastado{getSortIcon('total_spent')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedCustomers.map(c => (
                <tr key={c.buyer_id}>
                  <td style={{fontWeight: 600, color: 'var(--accent-blue)'}}>@{c.nickname}</td>
                  <td>{c.full_name}</td>
                  <td>
                    <div style={{fontSize: '0.8rem'}}>{c.email || '-'}</div>
                    <div style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>{c.phone || '-'}</div>
                  </td>
                  <td style={{fontSize: '0.8rem'}}>{c.document_type} {c.document_number}</td>
                  <td style={{textAlign: 'center', fontWeight: 'bold'}}>{c.total_orders}</td>
                  <td style={{color: 'var(--accent-emerald)', fontWeight: 'bold'}}>${c.total_spent.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
