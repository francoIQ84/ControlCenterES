import React, { useState, useEffect, useRef } from 'react'
import { Package, CloudOff, Cloud, RefreshCw, Save, QrCode, Camera } from 'lucide-react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import MediaBrowser from '../components/MediaBrowser'

export default function Inventory() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [drafts, setDrafts] = useState({})
  const [viewMode, setViewMode] = useState('detailed') // 'detailed' o 'compact'
  
  // QR Modals state
  const [showQrScanModal, setShowQrScanModal] = useState(false)
  const [showQrPrintModal, setShowQrPrintModal] = useState(false)
  const [selectedProductForQr, setSelectedProductForQr] = useState(null)
  
  // Categories State
  const [categories, setCategories] = useState([])
  const [showCategoriesModal, setShowCategoriesModal] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")

  const initialNewProduct = {
    title: "",
    qty: 0,
    price: 0,
    cost: 0,
    cost_meli: 0,
    price_web: 0,
    images: "",
    description: "",
    is_web_active: true,
    publish_to_meli: false,
    category_id: "",
    sync_meli: true,
    min_stock: 0
  }
  const [newProduct, setNewProduct] = useState(initialNewProduct)
  const [showAddModal, setShowAddModal] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryCallback, setGalleryCallback] = useState(null)

  const openGallery = (callback) => {
    setGalleryCallback(() => callback)
    setGalleryOpen(true)
  }

  const handleDraftChange = (ml_id, data) => {
    setDrafts(prev => ({
      ...prev,
      [ml_id]: data
    }))
  }

  const getModifiedItems = React.useCallback(() => {
    const modified = []
    for (const ml_id in drafts) {
      const orig = products.find(p => p.ml_id === ml_id)
      if (orig) {
        const d = drafts[ml_id]
        const isChanged =
          d.qty !== (orig.available_quantity || 0) ||
          d.price !== (orig.price || 0) ||
          d.cost !== (orig.cost_price || 0) ||
          d.cost_meli !== (orig.cost_meli || 0) ||
          d.price_web !== (orig.price_web || 0) ||
          d.images !== (orig.images || "") ||
          d.description !== (orig.description || "") ||
          d.is_web_active !== (orig.is_web_active ? 1 : 0) ||
          (d.category_id || null) !== (orig.category_id || null) ||
          d.sync_meli !== (orig.sync_meli === 0 ? 0 : 1) ||
          d.min_stock !== (orig.min_stock || 0);
        if (isChanged) {
          modified.push(d)
        }
      }
    }
    return modified
  }, [drafts, products])

  const saveAllChanges = async () => {
    const itemsToSave = getModifiedItems()
    if (itemsToSave.length === 0) return

    try {
      setLoading(true)
      const res = await fetch('/api/inventory/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToSave })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.warnings && data.warnings.length > 0) {
          alert("Guardado con algunas advertencias:\n" + data.warnings.join('\n'))
        } else {
          alert("Todos los cambios guardados correctamente")
        }
        setDrafts({})
        fetchProducts()
      } else {
        const errText = await res.text()
        alert("Error al guardar cambios en lote: " + errText)
        setLoading(false)
      }
    } catch(e) {
      alert("Error: " + e.message)
      setLoading(false)
    }
  }

  const exportToExcel = () => {
    const listToExport = sortedProducts && sortedProducts.length > 0 ? sortedProducts : products;
    if (!listToExport || listToExport.length === 0) {
      alert("No hay productos en el inventario para exportar.");
      return;
    }

    const headers = [
      "ID / SKU",
      "Título del Producto",
      "Categoría",
      "Stock Actual",
      "Stock Mínimo",
      "Alerta Stock",
      "Costo Base ($)",
      "Costo ML ($)",
      "Costo Total ($)",
      "Precio ML ($)",
      "Precio Web ($)",
      "Ganancia Est. ML ($)",
      "Margen ML (%)",
      "Ganancia Est. Web ($)",
      "Margen Web (%)",
      "Visitas ML",
      "Visitas Web",
      "Visitas Totales",
      "Activo en Web",
      "Sincronizar ML",
      "Estado ML",
      "Última Modificación"
    ];

    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<!--[if gte mso 9]><xml>
<x:ExcelWorkbook>
<x:ExcelWorksheets>
<x:ExcelWorksheet>
<x:Name>Inventario</x:Name>
<x:WorksheetOptions>
<x:DisplayGridlines/>
</x:WorksheetOptions>
</x:ExcelWorksheet>
</x:ExcelWorksheets>
</x:ExcelWorkbook>
</xml><![endif]-->
<style>
  table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 10pt; }
  th { background-color: #107c41; color: #ffffff; font-weight: bold; border: 1px solid #999999; padding: 8px; text-align: left; }
  td { border: 1px solid #cccccc; padding: 6px; vertical-align: middle; }
  .text { mso-number-format:"\\@"; }
  .num { text-align: right; }
  .critical { color: #d9534f; font-weight: bold; text-align: center; }
  .ok { color: #5cb85c; font-weight: bold; text-align: center; }
</style>
</head>
<body>
<table>
<thead>
  <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
</thead>
<tbody>`;

    const escapeHtml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    listToExport.forEach(p => {
      const cost_base = p.cost_price || 0;
      const cost_ml = p.cost_meli || 0;
      const cost_total = cost_base + cost_ml;
      const price_ml = p.price || 0;
      const price_web = p.price_web || 0;

      const profit_ml = price_ml > 0 ? price_ml - cost_total : 0;
      const margin_ml = price_ml > 0 ? (profit_ml / price_ml * 100) : 0;

      const profit_web = price_web > 0 ? price_web - cost_base : 0;
      const margin_web = price_web > 0 ? (profit_web / price_web * 100) : 0;

      const qty = p.available_quantity || 0;
      const min_stock = p.min_stock || 3;
      const isCritical = qty <= min_stock;

      const visits_meli = p.visits_meli || 0;
      const visits_web = p.visits_web || 0;

      html += `<tr>
        <td class="text">${escapeHtml(p.ml_id)}</td>
        <td>${escapeHtml(p.title)}</td>
        <td>${escapeHtml(p.category_name || 'Sin categoría')}</td>
        <td class="num">${qty}</td>
        <td class="num">${min_stock}</td>
        <td class="${isCritical ? 'critical' : 'ok'}">${isCritical ? 'CRÍTICO' : 'OK'}</td>
        <td class="num">$${cost_base.toFixed(2)}</td>
        <td class="num">$${cost_ml.toFixed(2)}</td>
        <td class="num">$${cost_total.toFixed(2)}</td>
        <td class="num">$${price_ml.toFixed(2)}</td>
        <td class="num">$${price_web.toFixed(2)}</td>
        <td class="num">$${profit_ml.toFixed(2)}</td>
        <td class="num">${margin_ml.toFixed(1)}%</td>
        <td class="num">$${profit_web.toFixed(2)}</td>
        <td class="num">${margin_web.toFixed(1)}%</td>
        <td class="num">${visits_meli}</td>
        <td class="num">${visits_web}</td>
        <td class="num">${visits_meli + visits_web}</td>
        <td>${p.is_web_active ? 'Sí' : 'No'}</td>
        <td>${p.sync_meli !== 0 ? 'Sí' : 'No'}</td>
        <td>${escapeHtml(p.status)}</td>
        <td>${p.last_modified ? new Date(p.last_modified).toLocaleString('es-AR') : ''}</td>
      </tr>`;
    });

    html += `</tbody></table></body></html>`;

    const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `inventario_${new Date().toISOString().slice(0, 10)}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  const fetchProducts = () => {
    setLoading(true)
    fetch(`/api/inventory/?query=${query}`)
      .then(res => res.json())
      .then(data => {
        setProducts(data.products || [])
        setDrafts({})
        setLoading(false)
      })
  }

  const handleSyncCosts = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/inventory/sync-costs', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        alert(data.message || "Costos de Mercado Libre actualizados correctamente desde la API")
        fetchProducts()
      } else {
        const err = await res.json()
        alert("Error al actualizar costos MeLi: " + (err.detail || 'Ocurrió un error'))
        setLoading(false)
      }
    } catch(e) {
      alert("Error de conexión: " + e.message)
      setLoading(false)
    }
  }

  const fetchCategories = () => {
    fetch('/api/categories/')
      .then(res => res.json())
      .then(data => setCategories(data.categories || []))
      .catch(err => console.error(err))
  }

  useEffect(() => {
    fetchProducts()
    fetchCategories()
  }, [query])

  const handleUpdate = async (ml_id, qty, price, cost, cost_meli, price_web, images, description, is_web_active, category_id, sync_meli, min_stock) => {
    try {
      const res = await fetch(`/api/inventory/${ml_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          qty: parseInt(qty), 
          price: parseFloat(price), 
          cost: parseFloat(cost),
          cost_meli: parseFloat(cost_meli) || 0.0,
          price_web: parseFloat(price_web) || 0,
          images: images || "",
          description: description || "",
          is_web_active: is_web_active ? 1 : 0,
          category_id: category_id ? parseInt(category_id) : null,
          sync_meli: sync_meli ? 1 : 0,
          min_stock: parseInt(min_stock) || 0
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

  const handleCreateCategory = async (e) => {
    e.preventDefault()
    if (!newCategoryName.trim()) return
    try {
      const res = await fetch('/api/categories/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName.trim() })
      })
      if (res.ok) {
        setNewCategoryName("")
        fetchCategories()
      } else {
        const err = await res.json()
        alert("Error: " + (err.detail || "No se pudo crear la categoría"))
      }
    } catch (err) {
      alert("Error: " + err.message)
    }
  }

  const handleDeleteCategory = async (id) => {
    if (!confirm("¿Estás seguro de que deseas borrar esta categoría? Los productos asociados se quedarán sin categoría.")) return
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        fetchCategories()
        fetchProducts()
      } else {
        const err = await res.json()
        alert("Error: " + (err.detail || "No se pudo borrar la categoría"))
      }
    } catch (err) {
      alert("Error: " + err.message)
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
          is_web_active: newProduct.is_web_active ? 1 : 0,
          category_id: newProduct.category_id || null,
          sync_meli: newProduct.sync_meli ? 1 : 0,
          min_stock: newProduct.min_stock || 0
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

  const modifiedCount = getModifiedItems().length

  return (
    <div>
      <h1 className="page-title">Inventario de Publicaciones</h1>
      <p className="page-subtitle">Sincronizá tus publicaciones de Mercado Libre y gestioná tu Tienda Web.</p>

      <div className="inventory-controls" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 15, flexWrap: 'wrap'}}>
        <div style={{display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap'}}>
          <input 
            type="text" 
            placeholder="Buscar producto..." 
            value={query} 
            onChange={e => setQuery(e.target.value)} 
            className="search-input"
            style={{width: 250, marginBottom: 0}}
          />
          <div style={{display: 'inline-flex', border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden'}}>
            <button 
              type="button"
              className="btn" 
              style={{
                padding: '6px 12px', 
                fontSize: '0.8rem',
                backgroundColor: viewMode === 'detailed' ? 'var(--accent-blue)' : 'transparent',
                color: viewMode === 'detailed' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: 0,
                cursor: 'pointer',
                boxShadow: 'none'
              }}
              onClick={() => setViewMode('detailed')}
            >
              Detallada
            </button>
            <button 
              type="button"
              className="btn" 
              style={{
                padding: '6px 12px', 
                fontSize: '0.8rem',
                backgroundColor: viewMode === 'compact' ? 'var(--accent-blue)' : 'transparent',
                color: viewMode === 'compact' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: 0,
                cursor: 'pointer',
                boxShadow: 'none'
              }}
              onClick={() => setViewMode('compact')}
            >
              Comprimida
            </button>
          </div>
        </div>
        <div className="control-buttons" style={{display: 'flex', gap: 10, flexWrap: 'wrap'}}>
          {modifiedCount > 0 && (
            <button className="btn" style={{backgroundColor: '#10b981', color: 'white', border: 'none'}} onClick={saveAllChanges}>
              Guardar {modifiedCount} cambios
            </button>
          )}
          <button 
            className="btn" 
            style={{
              backgroundColor: '#107c41', 
              color: '#ffffff', 
              border: 'none', 
              display: 'flex', 
              alignItems: 'center', 
              gap: 6,
              fontWeight: '600'
            }} 
            onClick={exportToExcel}
          >
            📊 Exportar a Excel
          </button>
          <button className="btn" style={{backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 5}} onClick={() => setShowCategoriesModal(true)}>
            📁 Gestionar Categorías
          </button>
          <button className="btn" style={{backgroundColor: 'var(--accent-emerald)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: 6}} onClick={() => setShowQrScanModal(true)}>
            <QrCode size={16} /> Escanear QR
          </button>
          <button className="btn" onClick={() => setShowAddModal(true)}>
            + Agregar Producto
          </button>
        </div>
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
                <label style={{flex: 1, fontSize: '0.85rem'}}>Costo Base *
                  <input type="number" required step="0.01" min="0" value={newProduct.cost} onChange={e => setNewProduct({...newProduct, cost: parseFloat(e.target.value) || 0})} style={{width: '100%', marginTop: 5}}/>
                </label>
                <label style={{flex: 1, fontSize: '0.85rem'}}>Costo Adic. ML
                  <input type="number" step="0.01" min="0" value={newProduct.cost_meli} onChange={e => setNewProduct({...newProduct, cost_meli: parseFloat(e.target.value) || 0})} style={{width: '100%', marginTop: 5}}/>
                </label>
                <label style={{flex: 1, fontSize: '0.85rem'}}>Stock Mínimo
                  <input type="number" min="0" value={newProduct.min_stock} onChange={e => setNewProduct({...newProduct, min_stock: parseInt(e.target.value) || 0})} style={{width: '100%', marginTop: 5}}/>
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

              <label style={{fontSize: '0.85rem'}}>Categoría
                <select 
                  value={newProduct.category_id} 
                  onChange={e => setNewProduct({...newProduct, category_id: e.target.value ? parseInt(e.target.value) : ""})} 
                  style={{width: '100%', marginTop: 5}}
                >
                  <option value="">Sin Categoría</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
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

      <div className="card table-card">
        {loading ? <p>Cargando...</p> : (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                {viewMode === 'compact' ? (
                  <tr>
                    <th style={{width: 50}}>IMG</th>
                    <th onClick={() => requestSort('title')} style={{cursor: 'pointer', userSelect: 'none'}}>Detalle{getSortIcon('title')}</th>
                    <th onClick={() => requestSort('status')} style={{cursor: 'pointer', userSelect: 'none'}}>Estado{getSortIcon('status')}</th>
                    <th style={{width: 60}}>Stock</th>
                    <th style={{width: 80}}>P. ML</th>
                    <th style={{width: 80}}>C. Base</th>
                    <th style={{width: 80}} title="Costo total de Mercado Libre obtenido desde la API (Comisión de venta + Envío gratis si aplica)">C. ML ⓘ</th>
                    <th style={{width: 80}}>P. Web</th>
                    <th style={{width: 50, textAlign: 'center'}}>Web</th>
                    <th style={{width: 110}}>Acciones</th>
                  </tr>
                ) : (
                  <tr>
                    <th>IMG</th>
                    <th onClick={() => requestSort('title')} style={{cursor: 'pointer', userSelect: 'none'}}>Detalle{getSortIcon('title')}</th>
                    <th onClick={() => requestSort('status')} style={{cursor: 'pointer', userSelect: 'none'}}>Status (ML){getSortIcon('status')}</th>
                    <th onClick={() => requestSort('stock')} style={{cursor: 'pointer', userSelect: 'none'}}>Stock & Precios{getSortIcon('stock')}</th>
                    <th onClick={() => requestSort('is_web_active')} style={{cursor: 'pointer', userSelect: 'none'}}>Datos Tienda Web{getSortIcon('is_web_active')}</th>
                    <th>Acción</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {sortedProducts.map(p => (
                  <ProductRow 
                    key={p.ml_id} 
                    p={p} 
                    onSave={handleUpdate} 
                    onOpenGallery={openGallery} 
                    onDraftChange={handleDraftChange} 
                    categories={categories} 
                    viewMode={viewMode}
                    onOpenQrModal={(prod) => {
                      setSelectedProductForQr(prod)
                      setShowQrPrintModal(true)
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
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

      {showCategoriesModal && (
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
            width: 450,
            maxWidth: '90%',
            maxHeight: '80vh',
            overflowY: 'auto',
            padding: 25,
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-card)',
            borderRadius: 12
          }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid var(--border-color)', paddingBottom: 15}}>
              <h3 style={{margin: 0}}>Gestionar Categorías</h3>
              <button 
                className="btn" 
                style={{backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '4px 8px', fontSize: '0.75rem'}}
                onClick={() => setShowCategoriesModal(false)}
              >
                Cerrar
              </button>
            </div>
            
            <form onSubmit={handleCreateCategory} style={{display: 'flex', gap: 10, marginBottom: 20}}>
              <input 
                type="text" 
                required 
                placeholder="Nueva categoría (ej. Bombas)" 
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                style={{flex: 1, padding: 6}}
              />
              <button type="submit" className="btn" style={{padding: '6px 12px'}}>Añadir</button>
            </form>
            
            <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
              <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Categorías Existentes</span>
              {categories.length === 0 ? (
                <p style={{color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', margin: '20px 0'}}>No hay categorías creadas aún.</p>
              ) : (
                <ul style={{listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '30vh', overflowY: 'auto'}}>
                  {categories.map(c => (
                    <li key={c.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.02)'}}>
                      <span style={{fontWeight: 500, fontSize: '0.9rem'}}>{c.name} <small style={{color: 'var(--text-secondary)', fontWeight: 'normal'}}>({c.slug})</small></span>
                      <button 
                        type="button" 
                        className="btn" 
                        style={{backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-red)', padding: '2px 6px', fontSize: '0.75rem', border: 'none'}}
                        onClick={() => handleDeleteCategory(c.id)}
                      >
                        Eliminar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {showQrPrintModal && (
        <QRPrintModal product={selectedProductForQr} onClose={() => setShowQrPrintModal(false)} />
      )}

      {showQrScanModal && (
        <QRScannerModal 
          onClose={() => setShowQrScanModal(false)} 
          onStockUpdated={(updatedProd) => {
            setProducts(prev => prev.map(item => item.ml_id === updatedProd.ml_id ? updatedProd : item))
          }}
        />
      )}
    </div>
  )
}

function ProductRow({ p, onSave, onOpenGallery, onDraftChange, categories, viewMode, onOpenQrModal }) {
  const [qty, setQty] = useState(p.available_quantity)
  const [price, setPrice] = useState(p.price)
  const [cost, setCost] = useState(p.cost_price)
  const [costMeli, setCostMeli] = useState(p.cost_meli || 0)
  const [minStock, setMinStock] = useState(p.min_stock || 0)
  
  const [priceWeb, setPriceWeb] = useState(p.price_web || 0)
  const [isWebActive, setIsWebActive] = useState(p.is_web_active === 1)
  const [categoryId, setCategoryId] = useState(p.category_id || "")
  const [syncMeli, setSyncMeli] = useState(p.sync_meli !== 0)
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
  
  const parseNum = (val, isInt = false) => {
    if (val === null || val === undefined || val === "") return 0
    const parsed = isInt ? parseInt(val, 10) : parseFloat(val)
    return isNaN(parsed) ? 0 : parsed
  }

  const numPrice = parseNum(price)
  const numCost = parseNum(cost)
  const numCostMeli = parseNum(costMeli)
  const numPriceWeb = parseNum(priceWeb)

  const totalCostMeli = numCost + numCostMeli
  const profitMeli = numPrice > 0 ? numPrice - totalCostMeli : 0
  const marginMeli = numPrice > 0 ? (profitMeli / numPrice) * 100 : 0

  const profitWeb = numPriceWeb > 0 ? numPriceWeb - numCost : 0
  const marginWeb = numPriceWeb > 0 ? (profitWeb / numPriceWeb) * 100 : 0

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

  useEffect(() => {
    onDraftChange(p.ml_id, {
      ml_id: p.ml_id,
      qty: parseNum(qty, true),
      price: parseNum(price),
      cost: parseNum(cost),
      cost_meli: parseNum(costMeli),
      price_web: parseNum(priceWeb),
      images: getCombinedImages(),
      description: description || "",
      is_web_active: isWebActive ? 1 : 0,
      category_id: categoryId ? parseInt(categoryId) : null,
      sync_meli: syncMeli ? 1 : 0,
      min_stock: parseNum(minStock, true)
    })
  }, [qty, price, cost, costMeli, priceWeb, isWebActive, description, useMeliImage, customMainUrl, additionalUrls, categoryId, syncMeli, minStock])

  if (viewMode === 'compact') {
    return (
      <React.Fragment>
        <tr className="product-row-card compact-tr" style={{borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem'}}>
          <td data-label="Imagen" style={{padding: '5px 8px'}}>
            <img 
              src={p.thumbnail || 'https://via.placeholder.com/35'} 
              alt="thumb" 
              style={{width: 35, height: 35, objectFit: 'contain', borderRadius: 4, border: '1px solid var(--border-color)', backgroundColor: '#fff'}}
            />
          </td>
          <td data-label="Detalle" style={{padding: '5px 8px'}}>
            <div style={{fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '280px'}} title={p.title}>{p.title}</div>
            <div style={{color: 'var(--text-secondary)', fontSize: '0.7rem', fontFamily: 'monospace'}}>{p.ml_id}</div>
            <div style={{color: 'var(--text-secondary)', fontSize: '0.68rem', marginTop: 2}}>
              🕒 Modif: {p.last_modified ? new Date(p.last_modified).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin cambios'}
            </div>
          </td>
          <td data-label="Estado" style={{padding: '5px 8px'}}>
            <span style={{
              fontSize: '0.8rem', 
              fontWeight: 600,
              color: p.status === 'active' ? 'var(--accent-emerald)' : 'var(--text-secondary)'
            }}>
              {p.status === 'active' ? 'Activa' : p.status}
            </span>
          </td>
          <td data-label="Stock" style={{padding: '5px 8px'}}>
            <input type="number" value={qty} onChange={e => setQty(e.target.value)} style={{width: 55, padding: '3px 5px', fontSize: '0.8rem', border: '1px solid var(--border-color)', borderRadius: 4, backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}/>
            {p.prev_stock !== null && p.prev_stock !== undefined && (
              <div style={{fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 1}}>ant: {p.prev_stock}</div>
            )}
          </td>
          <td data-label="P. ML" style={{padding: '5px 8px'}}>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} style={{width: 75, padding: '3px 5px', fontSize: '0.8rem', border: '1px solid var(--border-color)', borderRadius: 4, backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}} disabled={p.status === 'local'}/>
            {p.prev_price !== null && p.prev_price !== undefined && (
              <div style={{fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 1}}>ant: ${p.prev_price.toLocaleString('es-AR')}</div>
            )}
          </td>
          <td data-label="C. Base" style={{padding: '5px 8px'}}>
            <input type="number" value={cost} onChange={e => setCost(e.target.value)} style={{width: 75, padding: '3px 5px', fontSize: '0.8rem', border: '1px solid var(--border-color)', borderRadius: 4, backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}/>
            {p.prev_cost_price !== null && p.prev_cost_price !== undefined && (
              <div style={{fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 1}}>ant: ${p.prev_cost_price.toLocaleString('es-AR')}</div>
            )}
          </td>
          <td data-label="C. ML" style={{padding: '5px 8px'}}>
            <input type="number" value={costMeli} onChange={e => setCostMeli(e.target.value)} style={{width: 65, padding: '3px 5px', fontSize: '0.8rem', border: '1px solid var(--border-color)', borderRadius: 4, backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}/>
            {p.prev_cost_meli !== null && p.prev_cost_meli !== undefined && (
              <div style={{fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 1}}>ant: ${p.prev_cost_meli.toLocaleString('es-AR')}</div>
            )}
          </td>
          <td data-label="P. Web" style={{padding: '5px 8px'}}>
            <input type="number" value={priceWeb} onChange={e => setPriceWeb(e.target.value)} style={{width: 75, padding: '3px 5px', fontSize: '0.8rem', border: '1px solid var(--border-color)', borderRadius: 4, backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}/>
            {p.prev_price_web !== null && p.prev_price_web !== undefined && (
              <div style={{fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 1}}>ant: ${p.prev_price_web.toLocaleString('es-AR')}</div>
            )}
          </td>
          <td data-label="Web" style={{padding: '5px 8px', textAlign: 'center'}}>
            <input type="checkbox" checked={isWebActive} onChange={e => setIsWebActive(e.target.checked)} style={{width: 'auto', cursor: 'pointer'}}/>
          </td>
          <td data-label="Acciones" style={{padding: '5px 8px'}}>
            <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
              <button className="btn-icon" onClick={() => onSave(p.ml_id, qty, price, cost, costMeli, priceWeb, getCombinedImages(), description, isWebActive, categoryId, syncMeli, minStock)} title="Guardar Todo" style={{padding: 4}}>
                <Save size={14} className="text-blue-500" />
              </button>
              <button type="button" className="btn-icon" onClick={() => onOpenQrModal(p)} title="Ver / Imprimir QR" style={{padding: 4, color: 'var(--accent-blue)'}}>
                <QrCode size={14} />
              </button>
              <button type="button" className="btn" style={{padding: '3px 6px', fontSize: '0.7rem', backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: 'pointer'}} onClick={() => setShowWebDetails(!showWebDetails)}>
                Web {showWebDetails ? '▲' : '▼'}
              </button>
            </div>
          </td>
        </tr>
        {showWebDetails && (
          <tr className="web-details-row" style={{backgroundColor: 'var(--bg-dark)'}}>
            <td colSpan="10" style={{padding: 15}}>
              <div style={{display: 'flex', gap: 20, flexWrap: 'wrap'}}>
                {/* Columna 1: Imagen Principal */}
                <div style={{flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 8}}>
                  <span style={{fontSize: '0.8rem', fontWeight: 'bold'}}>Imagen Web</span>
                  <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
                    <img 
                      src={useMeliImage ? (p.thumbnail || 'https://via.placeholder.com/150') : (customMainUrl || 'https://via.placeholder.com/150')} 
                      alt="Preview" 
                      style={{width: 60, height: 60, objectFit: 'contain', border: '1px solid var(--border-color)', borderRadius: 6, backgroundColor: '#fff'}}
                    />
                    <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                      <label style={{fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer'}} disabled={p.status === 'local'}>
                        <input type="radio" name={`img-source-${p.ml_id}`} checked={useMeliImage} onChange={() => setUseMeliImage(true)} disabled={p.status === 'local'}/>
                        Mercado Libre
                      </label>
                      <label style={{fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer'}}>
                        <input type="radio" name={`img-source-${p.ml_id}`} checked={!useMeliImage} onChange={() => setUseMeliImage(false)}/>
                        Personalizada
                      </label>
                    </div>
                  </div>
                  {!useMeliImage && (
                    <div style={{display: 'flex', gap: 5}}>
                      <input type="text" value={customMainUrl} onChange={e => setCustomMainUrl(e.target.value)} style={{flex: 1, fontSize: '0.75rem', padding: '3px 5px', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4}}/>
                      <button type="button" className="btn" style={{padding: '2px 6px', fontSize: '0.7rem'}} onClick={() => onOpenGallery((url) => setCustomMainUrl(url))}>Sel</button>
                    </div>
                  )}
                </div>
                {/* Columna 2: Info Web */}
                <div style={{flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 8}}>
                  <div>
                    <label style={{fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: 4}}>Categoría</label>
                    <select value={categoryId} onChange={e => setCategoryId(e.target.value ? parseInt(e.target.value) : "")} style={{width: '100%', padding: '4px 8px', fontSize: '0.75rem', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4}}>
                      <option value="">Sin Categoría</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div style={{display: 'flex', alignItems: 'center', gap: 10, marginTop: 4}}>
                    <label style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>Alerta Mín:
                      <input type="number" value={minStock} onChange={e => setMinStock(e.target.value)} style={{width: 50, marginLeft: 5, padding: '3px 5px', fontSize: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 4, backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}/>
                    </label>
                    {p.status !== 'local' && (
                      <label style={{display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text-secondary)'}}>
                        <input type="checkbox" checked={syncMeli} onChange={e => setSyncMeli(e.target.checked)}/>
                        Sincronizar ML
                      </label>
                    )}
                  </div>
                </div>
                {/* Columna 3: Descrip */}
                <div style={{flex: 2, minWidth: 250}}>
                  <label style={{fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: 4}}>Descripción Web</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} style={{width: '100%', height: 60, padding: 5, fontSize: '0.75rem', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4}}/>
                </div>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: 8, marginTop: 8}}>
                <div style={{fontSize: '0.75rem', fontWeight: 600, display: 'flex', gap: 15, flexWrap: 'wrap'}}>
                  {p.status !== 'local' && (
                    <span style={{color: profitMeli >= 0 ? 'var(--accent-emerald)' : 'var(--accent-red)'}}>
                      Costo Total ML: ${totalCostMeli.toFixed(2)} | Margen ML: {marginMeli.toFixed(1)}% (Beneficio: ${profitMeli.toFixed(2)})
                    </span>
                  )}
                  {numPriceWeb > 0 && (
                    <span style={{color: profitWeb >= 0 ? 'var(--accent-emerald)' : 'var(--accent-red)'}}>
                      Margen Web: {marginWeb.toFixed(1)}% (Beneficio: ${profitWeb.toFixed(2)})
                    </span>
                  )}
                </div>
                {p.available_quantity <= (p.min_stock || 3) && p.status === 'active' && (
                  <div style={{color: 'var(--accent-orange)', fontWeight: 'bold'}}>
                    ⚠️ Alerta: Stock Bajo (Límite: {p.min_stock || 3})
                  </div>
                )}
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    )
  }

  return (
    <React.Fragment>
      <tr className="product-row-card">
        <td data-label="Imagen">
          <img 
            src={p.thumbnail || 'https://via.placeholder.com/50'} 
            alt="thumb" 
            style={{width: 50, height: 50, objectFit: 'contain', borderRadius: 4, border: '1px solid var(--border-color)', backgroundColor: '#fff'}}
          />
        </td>
        <td data-label="Detalle">
          <div style={{fontWeight: 600, fontSize: '0.9rem'}}>{p.title}</div>
          <div style={{color: 'var(--text-secondary)', fontSize: '0.75rem', fontFamily: 'monospace'}}>{p.ml_id}</div>
          <div style={{color: 'var(--text-secondary)', fontSize: '0.68rem', marginTop: 3}}>
            🕒 Modificado: {p.last_modified ? new Date(p.last_modified).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin cambios'}
          </div>
        </td>
        <td data-label="Estado ML">
          {p.status === 'active' ? 
            <span style={{color: 'var(--accent-emerald)', fontSize: '0.8rem', fontWeight: 600}}><Cloud size={14}/> Activa</span> : 
            (p.status === 'local' ?
              <span style={{color: 'var(--accent-blue)', fontSize: '0.8rem', fontWeight: 600}}><CloudOff size={14}/> Local (Web)</span> :
              <span style={{color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600}}><CloudOff size={14}/> {p.status}</span>
            )
          }
        </td>
        <td data-label="Stock y Precios" style={{
          backgroundColor: (p.available_quantity <= (p.min_stock || 3) && p.status === 'active') ? 'rgba(245, 158, 11, 0.05)' : 'transparent'
        }}>
          <div style={{display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center'}}>
            <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Stock:
              <input type="number" value={qty} onChange={e => setQty(e.target.value)} style={{width: 60, marginLeft: 5, padding: 4}}/>
              {p.prev_stock !== null && p.prev_stock !== undefined && <div style={{fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 2, textAlign: 'center'}}>ant: {p.prev_stock}</div>}
            </label>
            <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Precio ML:
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} style={{width: 80, marginLeft: 5, padding: 4}} disabled={p.status === 'local'}/>
              {p.prev_price !== null && p.prev_price !== undefined && <div style={{fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 2, textAlign: 'center'}}>ant: ${p.prev_price.toLocaleString('es-AR')}</div>}
            </label>
            <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Costo Base:
              <input type="number" value={cost} onChange={e => setCost(e.target.value)} style={{width: 80, marginLeft: 5, padding: 4}}/>
              {p.prev_cost_price !== null && p.prev_cost_price !== undefined && <div style={{fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 2, textAlign: 'center'}}>ant: ${p.prev_cost_price.toLocaleString('es-AR')}</div>}
            </label>
            <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}} title="Costo total de Mercado Libre obtenido desde la API (Comisión de venta + Envío gratis si aplica)">Costo ML ⓘ:
              <input type="number" value={costMeli} onChange={e => setCostMeli(e.target.value)} style={{width: 70, marginLeft: 5, padding: 4}}/>
              {p.prev_cost_meli !== null && p.prev_cost_meli !== undefined && <div style={{fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 2, textAlign: 'center'}}>ant: ${p.prev_cost_meli.toLocaleString('es-AR')}</div>}
            </label>
            <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Alerta Mín:
              <input type="number" value={minStock} onChange={e => setMinStock(e.target.value)} style={{width: 50, marginLeft: 5, padding: 4}}/>
            </label>
          </div>
          {(p.available_quantity <= (p.min_stock || 3) && p.status === 'active') && (
            <div style={{fontSize: '0.75rem', color: 'var(--accent-orange)', fontWeight: 'bold', marginTop: 4}}>
              ⚠️ Stock Bajo (Límite: {p.min_stock || 3})
            </div>
          )}
          {p.status !== 'local' && numPrice > 0 && (
            <div style={{fontSize: '0.75rem', color: profitMeli >= 0 ? 'var(--accent-emerald)' : 'var(--accent-red)', marginTop: 5, fontWeight: 600}}>
              Margen ML: {marginMeli.toFixed(1)}% (Beneficio: ${profitMeli.toFixed(2)})
            </div>
          )}
        </td>
        <td data-label="Tienda Web">
          <div style={{display: 'flex', flexDirection: 'column', gap: 5}}>
            <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>
              <input type="checkbox" checked={isWebActive} onChange={e => setIsWebActive(e.target.checked)} style={{marginRight: 5}}/>
              Mostrar en Web
            </label>
            <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Precio Web:
              <input type="number" value={priceWeb} onChange={e => setPriceWeb(e.target.value)} style={{width: 80, marginLeft: 5, padding: 4}}/>
              {p.prev_price_web !== null && p.prev_price_web !== undefined && <div style={{fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 2}}>ant: ${p.prev_price_web.toLocaleString('es-AR')}</div>}
            </label>
            {numPriceWeb > 0 && (
              <div style={{fontSize: '0.75rem', color: profitWeb >= 0 ? 'var(--accent-emerald)' : 'var(--accent-red)', marginTop: 2, fontWeight: 600}}>
                Margen Web: {marginWeb.toFixed(1)}% (Beneficio: ${profitWeb.toFixed(2)})
              </div>
            )}
            <button className="btn" style={{padding: '4px 8px', fontSize: '0.75rem', marginTop: 5}} onClick={() => setShowWebDetails(!showWebDetails)}>
              Editar Contenido Web
            </button>
          </div>
        </td>
        <td data-label="Acción">
          <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
            <button className="btn-icon" onClick={() => onSave(p.ml_id, qty, price, cost, costMeli, priceWeb, getCombinedImages(), description, isWebActive, categoryId, syncMeli, minStock)} title="Guardar Todo">
              <Save size={18} className="text-blue-500" />
            </button>
            <button type="button" className="btn-icon" onClick={() => onOpenQrModal(p)} title="Ver / Imprimir QR" style={{color: 'var(--accent-blue)'}}>
              <QrCode size={18} />
            </button>
          </div>
        </td>
      </tr>
      {showWebDetails && (
        <tr className="web-details-row" style={{backgroundColor: 'var(--bg-dark)'}}>
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

              {/* Columna 2: Imágenes Adicionales y Categoría */}
              <div style={{flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 10}}>
                <div>
                  <label style={{fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: 5}}>Imágenes Adicionales (URLs, separadas por coma)</label>
                  <textarea 
                    value={additionalUrls} 
                    onChange={e => setAdditionalUrls(e.target.value)} 
                    style={{width: '100%', height: 80, backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4, padding: 8, fontSize: '0.8rem'}}
                    placeholder="https://ejemplo.com/foto1.jpg, https://ejemplo.com/foto2.jpg"
                  />
                </div>
                <div>
                  <label style={{fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: 5}}>Categoría de Producto</label>
                  <select 
                    value={categoryId} 
                    onChange={e => setCategoryId(e.target.value ? parseInt(e.target.value) : "")} 
                    style={{width: '100%', padding: '6px 10px', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4}}
                  >
                    <option value="">Sin Categoría</option>
                    {categories.map(c => (
                       <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                {p.status !== 'local' && (
                  <div style={{marginTop: 5}}>
                    <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-primary)'}}>
                      <input 
                        type="checkbox" 
                        checked={syncMeli} 
                        onChange={e => setSyncMeli(e.target.checked)} 
                        style={{width: 'auto'}}
                      />
                      Sincronizar con Mercado Libre
                    </label>
                  </div>
                )}
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

function QRPrintModal({ product, onClose }) {
  if (!product) return null
  const qrPayload = `CC-PROD-${product.ml_id}`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrPayload)}`

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=400,height=400')
    printWindow.document.write(`
      <html>
        <head>
          <title>Etiqueta ${product.ml_id}</title>
          <style>
            body { font-family: sans-serif; text-align: center; padding: 10px; margin: 0; }
            .label-box { border: 2px dashed #000; border-radius: 8px; padding: 12px; width: 220px; margin: 0 auto; box-sizing: border-box; }
            .title { font-size: 12px; font-weight: bold; margin-bottom: 6px; word-wrap: break-word; line-height: 1.2; }
            .sku { font-size: 10px; font-family: monospace; color: #555; margin-top: 6px; }
            img { width: 140px; height: 140px; }
          </style>
        </head>
        <body>
          <div class="label-box">
            <div class="title">${product.title}</div>
            <img src="${qrUrl}" />
            <div class="sku">REF: ${product.ml_id}</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: 1200
    }}>
      <div className="card" style={{
        width: 380, maxWidth: '90%', padding: 25,
        backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: 12, textAlign: 'center'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: 15 }}>🏷️ Etiqueta de Producto QR</h3>

        <div style={{
          border: '2px dashed var(--border-color)', borderRadius: 10,
          padding: 15, backgroundColor: '#fff', color: '#000', margin: '0 auto 20px',
          maxWidth: 240
        }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: 8, minHeight: 36, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {product.title}
          </div>
          <img src={qrUrl} alt="QR Code" style={{ width: 150, height: 150, objectFit: 'contain' }} />
          <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#666', marginTop: 8 }}>
            CODE: {qrPayload}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn" style={{ backgroundColor: 'var(--accent-blue)', color: '#fff', flex: 1 }} onClick={handlePrint}>
            🖨️ Imprimir Etiqueta
          </button>
          <button className="btn" style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function QRScannerModal({ onClose, onStockUpdated }) {
  const [scannedProduct, setScannedProduct] = useState(null)
  const [newQty, setNewQty] = useState(0)
  const [newPrice, setNewPrice] = useState(0)
  const [newPriceWeb, setNewPriceWeb] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [adjusting, setAdjusting] = useState(false)
  const [manualCode, setManualCode] = useState("")
  const scannerInstanceRef = useRef(null)

  const processProductLookup = async (codeToSearch) => {
    if (!codeToSearch || !codeToSearch.trim()) return
    setLoading(true)
    setError("")

    try {
      const res = await fetch(`/api/inventory/scan/${encodeURIComponent(codeToSearch.trim())}`)
      if (res.ok) {
        const data = await res.json()
        setScannedProduct(data.product)
        setNewQty(data.product.available_quantity || 0)
        setNewPrice(data.product.price || 0)
        setNewPriceWeb(data.product.price_web || 0)
        // Pause camera scanner when product is found
        if (scannerInstanceRef.current) {
          try { scannerInstanceRef.current.pause(true) } catch(e) {}
        }
      } else {
        const errData = await res.json()
        setError(errData.detail || "Producto no encontrado con el código escaneado")
      }
    } catch (err) {
      setError("Error de conexión al buscar producto")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Render camera scanner
    let scanner = null
    try {
      scanner = new Html5QrcodeScanner(
        "qr-camera-viewfinder",
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          aspectRatio: 1.0,
          showTorchButtonIfSupported: true,
          rememberLastUsedCamera: true
        },
        /* verbose= */ false
      )

      scannerInstanceRef.current = scanner

      scanner.render(
        (decodedText) => {
          processProductLookup(decodedText)
        },
        (errorMessage) => {
          // ignore scan frame misses
        }
      )
    } catch(err) {
      console.warn("Could not initialize camera scanner:", err)
    }

    return () => {
      if (scannerInstanceRef.current) {
        try {
          scannerInstanceRef.current.clear().catch(() => {})
        } catch(e) {}
      }
    }
  }, [])

  const resumeCamera = () => {
    setScannedProduct(null)
    setError("")
    setManualCode("")
    if (scannerInstanceRef.current) {
      try { scannerInstanceRef.current.resume() } catch(e) {}
    }
  }

  const handleQuickStockSave = async (qtyToSave) => {
    if (!scannedProduct) return
    setAdjusting(true)
    try {
      const res = await fetch('/api/inventory/quick-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ml_id: scannedProduct.ml_id, 
          qty: qtyToSave,
          price: parseFloat(newPrice) || 0,
          price_web: parseFloat(newPriceWeb) || 0
        })
      })
      if (res.ok) {
        const data = await res.json()
        setScannedProduct(data.product)
        setNewQty(data.product.available_quantity)
        setNewPrice(data.product.price)
        setNewPriceWeb(data.product.price_web)
        onStockUpdated(data.product)
        if (data.warning) {
          alert(data.warning)
        }
      } else {
        alert("Error al actualizar datos del producto")
      }
    } catch (err) {
      alert("Error de red al actualizar datos")
    } finally {
      setAdjusting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: 1200
    }}>
      <div className="card" style={{
        width: 520, maxWidth: '94%', maxHeight: '92vh', overflowY: 'auto',
        padding: 20, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: 14
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderBottom: '1px solid var(--border-color)', paddingBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Camera size={20} color="var(--accent-emerald)" /> Escáner por Cámara de Celular
          </h3>
          <button className="btn" style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '4px 10px', fontSize: '0.8rem' }} onClick={onClose}>
            Cerrar
          </button>
        </div>

        {/* Live Camera Viewfinder */}
        <div style={{ display: scannedProduct ? 'none' : 'block', marginBottom: 15 }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: 0, marginBottom: 10 }}>
            Apunte la cámara de su celular al código QR del producto:
          </p>
          
          <div 
            id="qr-camera-viewfinder" 
            style={{ 
              width: '100%', 
              borderRadius: 10, 
              overflow: 'hidden', 
              border: '2px solid var(--accent-emerald)',
              backgroundColor: '#000' 
            }} 
          />

          {/* Manual entry fallback */}
          <form onSubmit={(e) => { e.preventDefault(); processProductLookup(manualCode); }} style={{ marginTop: 15, display: 'flex', gap: 8 }}>
            <input 
              type="text"
              placeholder="O ingrese código / SKU manualmente..."
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              style={{ flex: 1, padding: '6px 10px', fontSize: '0.85rem' }}
            />
            <button type="submit" className="btn" disabled={loading} style={{ backgroundColor: 'var(--accent-blue)', color: '#fff', fontSize: '0.8rem' }}>
              {loading ? "Buscando..." : "Buscar"}
            </button>
          </form>
        </div>

        {/* Error message */}
        {error && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-red)', padding: 12, borderRadius: 8, fontSize: '0.85rem', marginBottom: 15, textAlign: 'center', fontWeight: 600 }}>
            ❌ {error}
          </div>
        )}

        {/* Scanned product detail & quick stock/price controls */}
        {scannedProduct && (
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, padding: 16, backgroundColor: 'rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: 15 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <img
                src={scannedProduct.thumbnail || 'https://via.placeholder.com/60'}
                alt="Product"
                style={{ width: 65, height: 65, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border-color)', backgroundColor: '#fff' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', fontSize: '1rem', color: 'var(--text-primary)' }}>{scannedProduct.title}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', marginTop: 2 }}>
                  REF: {scannedProduct.ml_id}
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--bg-card)', padding: 15, borderRadius: 10, border: '1px solid var(--border-color)' }}>
              {/* Stock controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Stock Disponible:</span>
                <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: scannedProduct.available_quantity > 0 ? 'var(--accent-emerald)' : 'var(--accent-red)' }}>
                  {scannedProduct.available_quantity} unidades
                </span>
              </div>

              {/* Incremental / Decremental Buttons */}
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 15, flexWrap: 'wrap' }}>
                <button type="button" className="btn" style={{ padding: '8px 14px', fontSize: '0.85rem', fontWeight: 'bold', backgroundColor: 'rgba(239,68,68,0.15)', color: 'var(--accent-red)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6 }} onClick={() => handleQuickStockSave(Math.max(0, scannedProduct.available_quantity - 5))}>
                  -5
                </button>
                <button type="button" className="btn" style={{ padding: '8px 14px', fontSize: '0.85rem', fontWeight: 'bold', backgroundColor: 'rgba(239,68,68,0.15)', color: 'var(--accent-red)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6 }} onClick={() => handleQuickStockSave(Math.max(0, scannedProduct.available_quantity - 1))}>
                  -1
                </button>
                <button type="button" className="btn" style={{ padding: '8px 14px', fontSize: '0.85rem', fontWeight: 'bold', backgroundColor: 'rgba(16,185,129,0.15)', color: 'var(--accent-emerald)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6 }} onClick={() => handleQuickStockSave(scannedProduct.available_quantity + 1)}>
                  +1
                </button>
                <button type="button" className="btn" style={{ padding: '8px 14px', fontSize: '0.85rem', fontWeight: 'bold', backgroundColor: 'rgba(16,185,129,0.15)', color: 'var(--accent-emerald)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6 }} onClick={() => handleQuickStockSave(scannedProduct.available_quantity + 5)}>
                  +5
                </button>
                <button type="button" className="btn" style={{ padding: '8px 14px', fontSize: '0.85rem', fontWeight: 'bold', backgroundColor: 'rgba(16,185,129,0.15)', color: 'var(--accent-emerald)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6 }} onClick={() => handleQuickStockSave(scannedProduct.available_quantity + 10)}>
                  +10
                </button>
              </div>

              {/* Exact Stock Direct Input */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', borderTop: '1px dashed var(--border-color)', paddingTop: 12, marginBottom: 12 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, flex: 1 }}>Fijar Stock Exacto:</label>
                <input
                  type="number"
                  min="0"
                  value={newQty}
                  onChange={e => setNewQty(parseInt(e.target.value) || 0)}
                  style={{ width: 90, padding: '6px 8px', fontSize: '0.95rem', textAlign: 'center', fontWeight: 'bold' }}
                />
              </div>

              {/* Price Editors Section */}
              <div style={{ display: 'flex', gap: 12, borderTop: '1px dashed var(--border-color)', paddingTop: 12 }}>
                <label style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Precio Mercado Libre ($):
                  <input
                    type="number"
                    step="0.01"
                    value={newPrice}
                    onChange={e => setNewPrice(e.target.value)}
                    disabled={scannedProduct.status === 'local'}
                    style={{ width: '100%', marginTop: 4, padding: '6px 8px', fontSize: '0.9rem', fontWeight: 'bold' }}
                  />
                </label>
                <label style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Precio Tienda Web ($):
                  <input
                    type="number"
                    step="0.01"
                    value={newPriceWeb}
                    onChange={e => setNewPriceWeb(e.target.value)}
                    style={{ width: '100%', marginTop: 4, padding: '6px 8px', fontSize: '0.9rem', fontWeight: 'bold' }}
                  />
                </label>
              </div>

              {/* Main Save Button */}
              <button
                type="button"
                className="btn"
                disabled={adjusting}
                onClick={() => handleQuickStockSave(newQty)}
                style={{ backgroundColor: 'var(--accent-blue)', color: '#fff', padding: '10px 14px', fontSize: '0.9rem', width: '100%', marginTop: 15, fontWeight: 'bold' }}
              >
                {adjusting ? "Guardando Cambios..." : "💾 Guardar Stock y Precios"}
              </button>
            </div>

            <button 
              type="button" 
              className="btn" 
              onClick={resumeCamera}
              style={{ backgroundColor: 'var(--accent-emerald)', color: '#fff', padding: '10px 15px', fontSize: '0.9rem', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}
            >
              <Camera size={18} /> Escanear Otro Producto
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

