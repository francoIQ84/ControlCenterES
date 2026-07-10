import React, { useState, useEffect } from 'react'

export default function Sales() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('http://localhost:8088/api/sales/')
      .then(res => res.json())
      .then(data => {
        setOrders(data.orders || [])
        setLoading(false)
      })
  }, [])

  return (
    <div>
      <h1 className="page-title">Historial de Ventas</h1>
      <p className="page-subtitle">Visualiza todas las ventas descargadas de tu cuenta.</p>

      <div className="card">
        {loading ? <p>Cargando...</p> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Orden ID</th>
                <th>Comprador</th>
                <th>Monto</th>
                <th>Estado</th>
                <th>Items</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
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
