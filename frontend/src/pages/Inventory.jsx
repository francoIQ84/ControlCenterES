import React, { useState, useEffect } from 'react'
import { Package, CloudOff, Cloud, RefreshCw, Save } from 'lucide-react'

export default function Inventory() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")

  const fetchProducts = () => {
    setLoading(true)
    fetch(`http://localhost:8088/api/inventory/?query=${query}`)
      .then(res => res.json())
      .then(data => {
        setProducts(data.products || [])
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchProducts()
  }, [query])

  const handleUpdate = async (ml_id, qty, price, cost) => {
    try {
      const res = await fetch(`http://localhost:8088/api/inventory/${ml_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qty: parseInt(qty), price: parseFloat(price), cost: parseFloat(cost) })
      })
      if(res.ok) alert("Guardado en Mercado Libre")
      else alert("Error al guardar")
    } catch(e) {
      alert("Error: " + e.message)
    }
  }

  return (
    <div>
      <h1 className="page-title">Inventario de Publicaciones</h1>
      <p className="page-subtitle">Sincronizá tus publicaciones de Mercado Libre y calculá tus márgenes reales agregando el costo de tu mercadería.</p>

      <div style={{marginBottom: 20}}>
        <input 
          type="text" 
          placeholder="Buscar producto..." 
          value={query} 
          onChange={e => setQuery(e.target.value)} 
          style={{width: 300}}
        />
      </div>

      <div className="card">
        {loading ? <p>Cargando...</p> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>IMG</th>
                <th>Detalle</th>
                <th>Status</th>
                <th>Stock & Precios</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <ProductRow key={p.ml_id} p={p} onSave={handleUpdate} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function ProductRow({ p, onSave }) {
  const [qty, setQty] = useState(p.available_quantity)
  const [price, setPrice] = useState(p.price)
  const [cost, setCost] = useState(p.cost_price)
  
  const profit = price - cost
  const margin = price > 0 ? (profit / price) * 100 : 0

  return (
    <tr>
      <td><img src={p.thumbnail} alt="thumb" style={{width: 50, height: 50, objectFit: 'contain', borderRadius: 4}}/></td>
      <td>
        <div style={{fontWeight: 600, fontSize: '0.9rem'}}>{p.title}</div>
        <div style={{color: 'var(--text-secondary)', fontSize: '0.75rem', fontFamily: 'monospace'}}>{p.ml_id}</div>
      </td>
      <td>
        {p.status === 'active' ? 
          <span style={{color: 'var(--accent-emerald)', fontSize: '0.8rem', fontWeight: 600}}><Cloud size={14}/> Activa</span> : 
          <span style={{color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600}}><CloudOff size={14}/> {p.status}</span>}
      </td>
      <td>
        <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
          <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Stock:
            <input type="number" value={qty} onChange={e => setQty(e.target.value)} style={{width: 60, marginLeft: 5, padding: 4}}/>
          </label>
          <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Precio ML:
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} style={{width: 80, marginLeft: 5, padding: 4}}/>
          </label>
          <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Costo Local:
            <input type="number" value={cost} onChange={e => setCost(e.target.value)} style={{width: 80, marginLeft: 5, padding: 4}}/>
          </label>
        </div>
        <div style={{fontSize: '0.75rem', color: profit >= 0 ? 'var(--accent-emerald)' : 'var(--accent-red)', marginTop: 5, fontWeight: 600}}>
          Margen: {margin.toFixed(1)}% (${profit.toFixed(2)})
        </div>
      </td>
      <td>
        <button className="btn-icon" onClick={() => onSave(p.ml_id, qty, price, cost)} title="Guardar">
          <Save size={18} className="text-blue-500" />
        </button>
      </td>
    </tr>
  )
}
