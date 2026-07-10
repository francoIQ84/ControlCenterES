import React, { useState, useEffect } from 'react'
import { Package, CloudOff, Cloud, RefreshCw, Save } from 'lucide-react'

export default function Inventory() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")

  const fetchProducts = () => {
    setLoading(true)
    fetch(`/api/inventory/?query=${query}`)
      .then(res => res.json())
      .then(data => {
        setProducts(data.products || [])
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchProducts()
  }, [query])

  const handleUpdate = async (ml_id, qty, price, cost, price_web, images, description, is_web_active) => {
    try {
      const res = await fetch(`/api/inventory/${ml_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          qty: parseInt(qty), 
          price: parseFloat(price), 
          cost: parseFloat(cost),
          price_web: parseFloat(price_web) || 0,
          images: images || "",
          description: description || "",
          is_web_active: is_web_active ? 1 : 0
        })
      })
      if(res.ok) alert("Guardado correctamente (ML + Web)")
      else alert("Error al guardar")
    } catch(e) {
      alert("Error: " + e.message)
    }
  }

  return (
    <div>
      <h1 className="page-title">Inventario de Publicaciones</h1>
      <p className="page-subtitle">Sincronizá tus publicaciones de Mercado Libre y gestioná tu Tienda Web.</p>

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
                <th>Status (ML)</th>
                <th>Stock & Precios</th>
                <th>Datos Tienda Web</th>
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
  
  const [priceWeb, setPriceWeb] = useState(p.price_web || 0)
  const [isWebActive, setIsWebActive] = useState(p.is_web_active === 1)
  const [images, setImages] = useState(p.images || "")
  const [description, setDescription] = useState(p.description || "")
  const [showWebDetails, setShowWebDetails] = useState(false)
  
  const profit = price - cost
  const margin = price > 0 ? (profit / price) * 100 : 0

  return (
    <React.Fragment>
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
          <div style={{display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center'}}>
            <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Stock:
              <input type="number" value={qty} onChange={e => setQty(e.target.value)} style={{width: 60, marginLeft: 5, padding: 4}}/>
            </label>
            <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Precio ML:
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} style={{width: 80, marginLeft: 5, padding: 4}}/>
            </label>
            <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Costo:
              <input type="number" value={cost} onChange={e => setCost(e.target.value)} style={{width: 80, marginLeft: 5, padding: 4}}/>
            </label>
          </div>
          <div style={{fontSize: '0.75rem', color: profit >= 0 ? 'var(--accent-emerald)' : 'var(--accent-red)', marginTop: 5, fontWeight: 600}}>
            Margen ML: {margin.toFixed(1)}% (${profit.toFixed(2)})
          </div>
        </td>
        <td>
          <div style={{display: 'flex', flexDirection: 'column', gap: 5}}>
            <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>
              <input type="checkbox" checked={isWebActive} onChange={e => setIsWebActive(e.target.checked)} style={{marginRight: 5}}/>
              Mostrar en Web
            </label>
            <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Precio Web:
              <input type="number" value={priceWeb} onChange={e => setPriceWeb(e.target.value)} style={{width: 80, marginLeft: 5, padding: 4}}/>
            </label>
            <button className="btn" style={{padding: '4px 8px', fontSize: '0.75rem', marginTop: 5}} onClick={() => setShowWebDetails(!showWebDetails)}>
              Editar Contenido Web
            </button>
          </div>
        </td>
        <td>
          <button className="btn-icon" onClick={() => onSave(p.ml_id, qty, price, cost, priceWeb, images, description, isWebActive)} title="Guardar Todo">
            <Save size={18} className="text-blue-500" />
          </button>
        </td>
      </tr>
      {showWebDetails && (
        <tr style={{backgroundColor: 'var(--bg-dark)'}}>
          <td colSpan="6" style={{padding: 20}}>
            <div style={{display: 'flex', gap: 20}}>
              <div style={{flex: 1}}>
                <label style={{fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: 5}}>Imágenes Adicionales (URLs separadas por coma)</label>
                <textarea 
                  value={images} 
                  onChange={e => setImages(e.target.value)} 
                  style={{width: '100%', height: 80, backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4, padding: 8}}
                  placeholder="https://ejemplo.com/foto1.jpg, https://ejemplo.com/foto2.jpg"
                />
              </div>
              <div style={{flex: 2}}>
                <label style={{fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: 5}}>Descripción Web (Formato Texto)</label>
                <textarea 
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  style={{width: '100%', height: 80, backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4, padding: 8}}
                  placeholder="Descripción detallada para la tienda..."
                />
              </div>
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  )
}
