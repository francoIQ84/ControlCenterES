import React, { useState, useEffect } from 'react'
import { Package, CloudOff, Cloud, RefreshCw, Save } from 'lucide-react'
import MediaBrowser from '../components/MediaBrowser'

export default function Inventory() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })

  const initialNewProduct = {
    title: "",
    qty: 0,
    price: 0,
    cost: 0,
    price_web: 0,
    images: "",
    description: "",
    is_web_active: true,
    publish_to_meli: false
  }
  const [newProduct, setNewProduct] = useState(initialNewProduct)
  const [showAddModal, setShowAddModal] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryCallback, setGalleryCallback] = useState(null)

  const openGallery = (callback) => {
    setGalleryCallback(() => callback)
    setGalleryOpen(true)
  }

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
      if(res.ok) {
        const data = await res.json()
        if (data.warning) {
          alert(data.warning)
        } else {
          alert("Guardado correctamente (ML + Web)")
        }
        fetchProducts()
      } else {
        alert("Error al guardar")
      }
    } catch(e) {
      alert("Error: " + e.message)
    }
  }

  const handleAddSubmit = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/inventory/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newProduct,
          is_web_active: newProduct.is_web_active ? 1 : 0
        })
      })
      if(res.ok) {
        alert("Producto creado con éxito")
        setShowAddModal(false)
        setNewProduct(initialNewProduct)
        fetchProducts()
      } else {
        const errorData = await res.json()
        alert("Error al crear producto: " + (errorData.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error: " + err.message)
    }
  }

  const handleCancelAdd = () => {
    setShowAddModal(false)
    setNewProduct(initialNewProduct)
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

  const sortedProducts = React.useMemo(() => {
    let sortableItems = [...products]
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let aVal = a[sortConfig.key]
        let bVal = b[sortConfig.key]

        // Custom handles
        if (sortConfig.key === 'title') {
          aVal = (a.title || "").toLowerCase()
          bVal = (b.title || "").toLowerCase()
        } else if (sortConfig.key === 'status') {
          aVal = (a.status || "").toLowerCase()
          bVal = (b.status || "").toLowerCase()
        } else if (sortConfig.key === 'stock') {
          aVal = a.available_quantity || 0
          bVal = b.available_quantity || 0
        } else if (sortConfig.key === 'is_web_active') {
          aVal = a.is_web_active || 0
          bVal = b.is_web_active || 0
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }
    return sortableItems
  }, [products, sortConfig])

  return (
    <div>
      <h1 className="page-title">Inventario de Publicaciones</h1>
      <p className="page-subtitle">Sincronizá tus publicaciones de Mercado Libre y gestioná tu Tienda Web.</p>

      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
        <input 
          type="text" 
          placeholder="Buscar producto..." 
          value={query} 
          onChange={e => setQuery(e.target.value)} 
          style={{width: 300, marginBottom: 0}}
        />
        <button className="btn" onClick={() => setShowAddModal(true)}>
          + Agregar Producto
        </button>
      </div>

      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{
            width: 500,
            maxWidth: '90%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: 25,
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-card)'
          }}>
            <h3 style={{marginTop: 0, marginBottom: 20}}>Agregar Nuevo Producto</h3>
            
            <form onSubmit={handleAddSubmit} style={{display: 'flex', flexDirection: 'column', gap: 15}}>
              <label style={{fontSize: '0.85rem'}}>Título *
                <input type="text" required value={newProduct.title} onChange={e => setNewProduct({...newProduct, title: e.target.value})} style={{width: '100%', marginTop: 5}}/>
              </label>
              
              <div style={{display: 'flex', gap: 15}}>
                <label style={{flex: 1, fontSize: '0.85rem'}}>Stock *
                  <input type="number" required min="0" value={newProduct.qty} onChange={e => setNewProduct({...newProduct, qty: parseInt(e.target.value) || 0})} style={{width: '100%', marginTop: 5}}/>
                </label>
                <label style={{flex: 1, fontSize: '0.85rem'}}>Costo *
                  <input type="number" required step="0.01" min="0" value={newProduct.cost} onChange={e => setNewProduct({...newProduct, cost: parseFloat(e.target.value) || 0})} style={{width: '100%', marginTop: 5}}/>
                </label>
              </div>

              <div style={{display: 'flex', gap: 15}}>
                <label style={{flex: 1, fontSize: '0.85rem'}}>Precio ML / Original *
                  <input type="number" required step="0.01" min="0" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: parseFloat(e.target.value) || 0})} style={{width: '100%', marginTop: 5}}/>
                </label>
                <label style={{flex: 1, fontSize: '0.85rem'}}>Precio Tienda Web *
                  <input type="number" required step="0.01" min="0" value={newProduct.price_web} onChange={e => setNewProduct({...newProduct, price_web: parseFloat(e.target.value) || 0})} style={{width: '100%', marginTop: 5}}/>
                </label>
              </div>

              <label style={{fontSize: '0.85rem'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5}}>
                  <span>URL de Imagen (Opcional)</span>
                  <button type="button" className="btn" style={{padding: '3px 8px', fontSize: '0.75rem'}} onClick={() => openGallery((url) => setNewProduct(prev => ({...prev, images: url})))}>
                    Seleccionar de Galería
                  </button>
                </div>
                <input type="text" value={newProduct.images} onChange={e => setNewProduct({...newProduct, images: e.target.value})} placeholder="https://ejemplo.com/foto.jpg" style={{width: '100%'}}/>
              </label>

              <label style={{fontSize: '0.85rem'}}>Descripción Web
                <textarea value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value})} style={{width: '100%', height: 70, marginTop: 5, padding: 8, backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4}}/>
              </label>

              <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer'}}>
                <input type="checkbox" checked={newProduct.is_web_active} onChange={e => setNewProduct({...newProduct, is_web_active: e.target.checked})} style={{width: 'auto'}}/>
                Mostrar en la Tienda Web
              </label>

              <div style={{border: '1px solid var(--border-color)', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 10}}>
                <span style={{fontSize: '0.85rem', fontWeight: 'bold'}}>Destino del Producto:</span>
                <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer'}}>
                  <input type="radio" name="destination" checked={!newProduct.publish_to_meli} onChange={() => setNewProduct({...newProduct, publish_to_meli: false})}/>
                  Solo en la Tienda Web (Local)
                </label>
                <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer'}}>
                  <input type="radio" name="destination" checked={newProduct.publish_to_meli} onChange={() => setNewProduct({...newProduct, publish_to_meli: true})}/>
                  Publicar en Mercado Libre y Tienda Web
                </label>

                {newProduct.publish_to_meli && (
                  <div style={{fontSize: '0.75rem', color: 'var(--accent-blue)', padding: '5px 10px', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: 4, marginTop: 5}}>
                    💡 Nota: En modo real se recomienda publicar directamente en Mercado Libre y sincronizar. En modo Demo, esto simulará la publicación de inmediato generando un ID MLA.
                  </div>
                )}
              </div>

              <div style={{display: 'flex', justify: 'flex-end', gap: 10, marginTop: 10}}>
                <button type="button" className="btn" style={{backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)'}} onClick={handleCancelAdd}>
                  Cancelar
                </button>
                <button type="submit" className="btn">
                  Guardar Producto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        {loading ? <p>Cargando...</p> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>IMG</th>
                <th onClick={() => requestSort('title')} style={{cursor: 'pointer', userSelect: 'none'}}>Detalle{getSortIcon('title')}</th>
                <th onClick={() => requestSort('status')} style={{cursor: 'pointer', userSelect: 'none'}}>Status (ML){getSortIcon('status')}</th>
                <th onClick={() => requestSort('stock')} style={{cursor: 'pointer', userSelect: 'none'}}>Stock & Precios{getSortIcon('stock')}</th>
                <th onClick={() => requestSort('is_web_active')} style={{cursor: 'pointer', userSelect: 'none'}}>Datos Tienda Web{getSortIcon('is_web_active')}</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map(p => (
                <ProductRow key={p.ml_id} p={p} onSave={handleUpdate} onOpenGallery={openGallery} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {galleryOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1100
        }}>
          <div className="card" style={{
            width: 800,
            maxWidth: '95%',
            maxHeight: '85vh',
            overflowY: 'auto',
            padding: 20,
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 12
          }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15}}>
              <h3 style={{margin: 0}}>Seleccionar Imagen</h3>
              <button 
                className="btn" 
                style={{
                  padding: '4px 10px', 
                  backgroundColor: 'transparent', 
                  border: '1px solid var(--border-color)', 
                  color: 'var(--text-primary)'
                }} 
                onClick={() => setGalleryOpen(false)}
              >
                Cerrar
              </button>
            </div>
            <MediaBrowser onSelectImage={(url) => {
              if (galleryCallback) galleryCallback(url)
              setGalleryOpen(false)
            }} />
          </div>
        </div>
      )}
    </div>
  )
}

function ProductRow({ p, onSave, onOpenGallery }) {
  const [qty, setQty] = useState(p.available_quantity)
  const [price, setPrice] = useState(p.price)
  const [cost, setCost] = useState(p.cost_price)
  
  const [priceWeb, setPriceWeb] = useState(p.price_web || 0)
  const [isWebActive, setIsWebActive] = useState(p.is_web_active === 1)
  const [description, setDescription] = useState(p.description || "")
  const [showWebDetails, setShowWebDetails] = useState(false)

  const isMeliMain = !p.images || p.images.split(',')[0].trim() === p.thumbnail
  const [useMeliImage, setUseMeliImage] = useState(isMeliMain)
  const [customMainUrl, setCustomMainUrl] = useState(isMeliMain ? "" : (p.images ? p.images.split(',')[0].trim() : ""))
  
  const getInitialAdditional = () => {
    if (!p.images) return ""
    const parts = p.images.split(',').map(s => s.trim()).filter(Boolean)
    if (parts.length === 0) return ""
    if (parts[0] === p.thumbnail) {
      return parts.slice(1).join(', ')
    } else {
      return parts.slice(1).join(', ')
    }
  }
  const [additionalUrls, setAdditionalUrls] = useState(getInitialAdditional())
  
  const profit = price - cost
  const margin = price > 0 ? (profit / price) * 100 : 0

  const getCombinedImages = () => {
    const cleanAdd = additionalUrls.split(',').map(s => s.trim()).filter(Boolean)
    if (useMeliImage) {
      if (cleanAdd.length === 0) return ""
      return [p.thumbnail, ...cleanAdd].join(',')
    } else {
      const cleanMain = customMainUrl.trim()
      if (!cleanMain) {
        return cleanAdd.join(',')
      }
      return [cleanMain, ...cleanAdd].join(',')
    }
  }

  return (
    <React.Fragment>
      <tr>
        <td>
          <img 
            src={p.thumbnail || 'https://via.placeholder.com/50'} 
            alt="thumb" 
            style={{width: 50, height: 50, objectFit: 'contain', borderRadius: 4, border: '1px solid var(--border-color)', backgroundColor: '#fff'}}
          />
        </td>
        <td>
          <div style={{fontWeight: 600, fontSize: '0.9rem'}}>{p.title}</div>
          <div style={{color: 'var(--text-secondary)', fontSize: '0.75rem', fontFamily: 'monospace'}}>{p.ml_id}</div>
        </td>
        <td>
          {p.status === 'active' ? 
            <span style={{color: 'var(--accent-emerald)', fontSize: '0.8rem', fontWeight: 600}}><Cloud size={14}/> Activa</span> : 
            (p.status === 'local' ?
              <span style={{color: 'var(--accent-blue)', fontSize: '0.8rem', fontWeight: 600}}><CloudOff size={14}/> Local (Web)</span> :
              <span style={{color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600}}><CloudOff size={14}/> {p.status}</span>
            )
          }
        </td>
        <td>
          <div style={{display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center'}}>
            <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Stock:
              <input type="number" value={qty} onChange={e => setQty(e.target.value)} style={{width: 60, marginLeft: 5, padding: 4}}/>
            </label>
            <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Precio ML:
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} style={{width: 80, marginLeft: 5, padding: 4}} disabled={p.status === 'local'}/>
            </label>
            <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Costo:
              <input type="number" value={cost} onChange={e => setCost(e.target.value)} style={{width: 80, marginLeft: 5, padding: 4}}/>
            </label>
          </div>
          {p.status !== 'local' && (
            <div style={{fontSize: '0.75rem', color: profit >= 0 ? 'var(--accent-emerald)' : 'var(--accent-red)', marginTop: 5, fontWeight: 600}}>
              Margen ML: {margin.toFixed(1)}% (${profit.toFixed(2)})
            </div>
          )}
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
          <button className="btn-icon" onClick={() => onSave(p.ml_id, qty, price, cost, priceWeb, getCombinedImages(), description, isWebActive)} title="Guardar Todo">
            <Save size={18} className="text-blue-500" />
          </button>
        </td>
      </tr>
      {showWebDetails && (
        <tr style={{backgroundColor: 'var(--bg-dark)'}}>
          <td colSpan="6" style={{padding: 20}}>
            <div style={{display: 'flex', gap: 20, flexWrap: 'wrap'}}>
              {/* Columna 1: Imagen Principal y Previsualización */}
              <div style={{flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 10}}>
                <span style={{fontSize: '0.85rem', fontWeight: 'bold'}}>Imagen Principal de la Web</span>
                
                <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
                  <img 
                    src={useMeliImage ? (p.thumbnail || 'https://via.placeholder.com/150') : (customMainUrl || 'https://via.placeholder.com/150')} 
                    alt="Preview" 
                    style={{width: 80, height: 80, objectFit: 'contain', border: '1px solid var(--border-color)', borderRadius: 6, backgroundColor: '#fff'}}
                  />
                  <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-primary)'}} disabled={p.status === 'local'}>
                      <input 
                        type="radio" 
                        name={`img-source-${p.ml_id}`}
                        checked={useMeliImage}
                        onChange={() => setUseMeliImage(true)}
                        disabled={p.status === 'local'}
                      />
                      De Mercado Libre
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-primary)'}}>
                      <input 
                        type="radio" 
                        name={`img-source-${p.ml_id}`}
                        checked={!useMeliImage}
                        onChange={() => setUseMeliImage(false)}
                      />
                      Personalizada (URL)
                    </label>
                  </div>
                </div>

                {!useMeliImage && (
                  <div style={{display: 'flex', gap: 5}}>
                    <input 
                      type="text" 
                      value={customMainUrl} 
                      onChange={e => setCustomMainUrl(e.target.value)} 
                      placeholder="https://ejemplo.com/foto.jpg"
                      style={{flex: 1, fontSize: '0.8rem', padding: 5, backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4}}
                    />
                    <button type="button" className="btn" style={{padding: '4px 8px', fontSize: '0.75rem', flexShrink: 0}} onClick={() => onOpenGallery((url) => setCustomMainUrl(url))}>
                      Seleccionar
                    </button>
                  </div>
                )}
              </div>

              {/* Columna 2: Imágenes Adicionales */}
              <div style={{flex: 1, minWidth: 200}}>
                <label style={{fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: 5}}>Imágenes Adicionales (URLs, separadas por coma)</label>
                <textarea 
                  value={additionalUrls} 
                  onChange={e => setAdditionalUrls(e.target.value)} 
                  style={{width: '100%', height: 80, backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4, padding: 8, fontSize: '0.8rem'}}
                  placeholder="https://ejemplo.com/foto1.jpg, https://ejemplo.com/foto2.jpg"
                />
              </div>

              {/* Columna 3: Descripción */}
              <div style={{flex: 2, minWidth: 250}}>
                <label style={{fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: 5}}>Descripción Web (Formato Texto)</label>
                <textarea 
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  style={{width: '100%', height: 80, backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4, padding: 8, fontSize: '0.8rem'}}
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
