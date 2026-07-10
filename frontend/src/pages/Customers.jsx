import React, { useState, useEffect } from 'react'

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('http://localhost:8088/api/customers/')
      .then(res => res.json())
      .then(data => {
        setCustomers(data.customers || [])
        setLoading(false)
      })
  }, [])

  return (
    <div>
      <h1 className="page-title">Cartera de Clientes</h1>
      <p className="page-subtitle">Listado de compradores con métricas de compras recurrentes.</p>

      <div className="card">
        {loading ? <p>Cargando...</p> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Comprador</th>
                <th>Nombre Real</th>
                <th>Contacto</th>
                <th>Doc</th>
                <th>Total Órdenes</th>
                <th>Total Gastado</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(c => (
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
