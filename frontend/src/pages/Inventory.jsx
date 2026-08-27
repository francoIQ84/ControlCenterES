import React, { useState, useEffect, useRef } from 'react'
import { Package, CloudOff, Cloud, RefreshCw, Save, QrCode, Camera, ExternalLink, Eye, EyeOff } from 'lucide-react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import MediaBrowser from '../components/MediaBrowser'
import { useTenant } from '../TenantContext'

export default function Inventory() {
  const [products, setProducts] = useState([])
  const { isSimpleView } = useTenant()
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [drafts, setDrafts] = useState({})
  const [viewMode, setViewMode] = useState('compact') // 'compact' o 'detailed'
  const [showHidden, setShowHidden] = useState(false)
  
  // QR Modals state
  const [showQrScanModal, setShowQrScanModal] = useState(false)
  const [showQrPrintModal, setShowQrPrintModal] = useState(false)
  const [selectedProductForQr, setSelectedProductForQr] = useState(null)
  
  // Categories State
  const [categories, setCategories] = useState([])
  const [categoryFilter, setCategoryFilter] = useState("ALL") // "ALL" | "UNCATEGORIZED" | category_id
  const [showCategoriesModal, setShowCategoriesModal] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")

  // Multi-selection & Bulk Actions state
  const [selectedIds, setSelectedIds] = useState([])
  const [showBulkCategoryModal, setShowBulkCategoryModal] = useState(false)
  const [showBulkPriceModal, setShowBulkPriceModal] = useState(false)
  const [bulkTargetCategory, setBulkTargetCategory] = useState("")
  const [bulkPriceTarget, setBulkPriceTarget] = useState("both") // 'meli', 'web', 'both'
  const [bulkPriceType, setBulkPriceType] = useState("percentage") // 'percentage', 'fixed'
  const [bulkPriceValue, setBulkPriceValue] = useState(0)

  // Dispatch Schedule State
  const [showDispatchScheduleModal, setShowDispatchScheduleModal] = useState(false)
  const [dispatchConfig, setDispatchConfig] = useState({
    enabled: false,
    weekday_days: 0,
    weekend_days: 2,
    weekend_start_day: 4,
    weekend_start_hour: 18,
    weekend_end_day: 0,
    weekend_end_hour: 8,
    current_mode: 'weekday',
    last_applied_mode: '',
    last_applied_at: ''
  })

  // Profitability Modal State
  const [showProfitabilityModal, setShowProfitabilityModal] = useState(false)
  const [profitabilityData, setProfitabilityData] = useState({ products: [], summary: {} })
  const [profitabilityLoading, setProfitabilityLoading] = useState(false)
  const [editingProfitItem, setEditingProfitItem] = useState(null)

  const fetchProfitability = async () => {
    setProfitabilityLoading(true)
    try {
      const res = await fetch('/api/inventory/profitability')
      if (res.ok) {
        setProfitabilityData(await res.json())
      }
    } catch (e) {
      console.error(e)
    } finally {
      setProfitabilityLoading(false)
    }
  }

  const handleSaveProfitabilityParams = async (e) => {
    e.preventDefault()
    if (!editingProfitItem) return
    try {
      const res = await fetch(`/api/inventory/profitability/${editingProfitItem.ml_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cost_price: parseFloat(editingProfitItem.cost_price || 0),
          cost_meli: parseFloat(editingProfitItem.cost_meli || 0),
          shipping_cost_est: parseFloat(editingProfitItem.shipping_cost_est || 0),
          tax_rate_pct: parseFloat(editingProfitItem.tax_rate_pct || 3.5),
          other_cost: parseFloat(editingProfitItem.other_cost || 0)
        })
      })
      if (res.ok) {
        setEditingProfitItem(null)
        fetchProfitability()
        fetchProducts()
      } else {
        alert("Error al actualizar costos del producto")
      }
    } catch (e) {
      alert("Error: " + e.message)
    }
  }

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
    const parseN = (v, isInt = false) => {
      if (v === null || v === undefined || v === '') return 0
      const p = isInt ? parseInt(v, 10) : parseFloat(v)
      return isNaN(p) ? 0 : p
    }
    const parseB = (v, defaultVal = 1) => {
      if (v === null || v === undefined || v === '') return defaultVal
      if (v === true || v === 1 || v === '1' || v === 'true') return 1
      if (v === false || v === 0 || v === '0' || v === 'false') return 0
      return defaultVal
    }

    for (const ml_id in drafts) {
      const orig = products.find(p => p.ml_id === ml_id)
      if (orig) {
        const d = drafts[ml_id]

        const qtyChanged = parseN(d.qty, true) !== parseN(orig.available_quantity, true)
        const priceChanged = Math.abs(parseN(d.price) - parseN(orig.price)) > 0.01
        const costChanged = Math.abs(parseN(d.cost) - parseN(orig.cost_price)) > 0.01
        const costMeliChanged = Math.abs(parseN(d.cost_meli) - parseN(orig.cost_meli)) > 0.01
        const priceWebChanged = Math.abs(parseN(d.price_web) - parseN(orig.price_web)) > 0.01
        const minStockChanged = parseN(d.min_stock, true) !== parseN(orig.min_stock, true)
        const featuredOrderChanged = parseN(d.featured_order, true) !== parseN(orig.featured_order, true)

        const webActiveChanged = parseB(d.is_web_active, 1) !== parseB(orig.is_web_active, 1)
        const syncMeliChanged = parseB(d.sync_meli, 1) !== parseB(orig.sync_meli, 1)

        const cat1 = d.category_id ? String(d.category_id) : ""
        const cat2 = orig.category_id ? String(orig.category_id) : ""
        const categoryChanged = cat1 !== cat2

        const desc1 = (d.description || "").trim()
        const desc2 = (orig.description || "").trim()
        const descChanged = desc1 !== desc2

        let imagesChanged = false
        if (d.images !== undefined && d.images !== null) {
          const img1 = (d.images || "").trim()
          const img2 = (orig.images || "").trim()
          const thumb = (orig.thumbnail || "").trim()
          if (img1 !== img2 && img1 !== thumb && !(img1 === "" && (img2 === "" || img2 === thumb))) {
            imagesChanged = true
          }
        }

        const isChanged =
          qtyChanged ||
          priceChanged ||
          costChanged ||
          costMeliChanged ||
          priceWebChanged ||
          minStockChanged ||
          featuredOrderChanged ||
          webActiveChanged ||
          syncMeliChanged ||
          categoryChanged ||
          descChanged ||
          imagesChanged

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
    fetch(`/api/inventory/?query=${encodeURIComponent(query)}&show_hidden=${showHidden}`)
      .then(res => res.json())
      .then(data => {
        setProducts(data.products || [])
        setDrafts({})
        setLoading(false)
      })
  }

  const handleToggleHide = async (ml_id, currentHiddenStatus) => {
    const isHiddenInt = currentHiddenStatus ? 1 : 0
    const newStatus = isHiddenInt === 1 ? 0 : 1
    const actionText = newStatus === 1 ? "ocultar" : "volver a mostrar"
    if (!confirm(`¿Estás seguro de que deseas ${actionText} este producto del inventario?`)) return

    try {
      setLoading(true)
      const res = await fetch(`/api/inventory/${ml_id}/toggle-hidden`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_hidden: newStatus })
      })
      if (res.ok) {
        fetchProducts()
      } else {
        alert("Error al cambiar la visibilidad del producto")
        setLoading(false)
      }
    } catch(e) {
      alert("Error: " + e.message)
      setLoading(false)
    }
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
  }, [query, showHidden])

  const handleUpdate = async (ml_id, qty, price, cost, cost_meli, price_web, images, description, is_web_active, category_id, sync_meli, min_stock, featured_order = 0, use_meli_description = 1, description_meli = "") => {
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
          use_meli_description: use_meli_description ? 1 : 0,
          description_meli: description_meli || "",
          is_web_active: is_web_active ? 1 : 0,
          category_id: category_id ? parseInt(category_id) : null,
          sync_meli: sync_meli ? 1 : 0,
          min_stock: parseInt(min_stock) || 0,
          featured_order: parseInt(featured_order) || 0
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
        const errData = await res.json()
        alert("Error al actualizar: " + (errData.detail || "Error del servidor"))
      }
    } catch(e) {
      alert("Error al guardar cambios")
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

  const uncategorizedCount = React.useMemo(() => {
    return products.filter(p => {
      const draftCat = drafts[p.ml_id]?.category_id
      const catId = draftCat !== undefined ? draftCat : p.category_id
      return !catId || catId === 0 || String(catId) === '0' || String(catId) === ''
    }).length
  }, [products, drafts])

  const categoryCounts = React.useMemo(() => {
    const counts = {}
    products.forEach(p => {
      const draftCat = drafts[p.ml_id]?.category_id
      const catId = draftCat !== undefined ? draftCat : p.category_id
      if (catId && catId !== 0 && String(catId) !== '0' && String(catId) !== '') {
        const key = String(catId)
        counts[key] = (counts[key] || 0) + 1
      }
    })
    return counts
  }, [products, drafts])

  const sortedProducts = React.useMemo(() => {
    let sortableItems = products.filter(p => {
      const draftCat = drafts[p.ml_id]?.category_id
      const catId = draftCat !== undefined ? draftCat : p.category_id

      if (categoryFilter === 'UNCATEGORIZED') {
        if (catId && catId !== 0 && String(catId) !== '0' && String(catId) !== '') return false
      } else if (categoryFilter !== 'ALL') {
        if (String(catId) !== String(categoryFilter)) return false
      }
      return true
    })

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
  }, [products, drafts, categoryFilter, sortConfig])

  const handleToggleSelectProduct = (ml_id) => {
    setSelectedIds(prev => 
      prev.includes(ml_id) ? prev.filter(id => id !== ml_id) : [...prev, ml_id]
    )
  }

  const handleToggleSelectAll = () => {
    if (!sortedProducts || sortedProducts.length === 0) return
    const visibleIds = sortedProducts.map(p => p.ml_id)
    const allSelected = visibleIds.every(id => selectedIds.includes(id))
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !visibleIds.includes(id)))
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...visibleIds])))
    }
  }

  const clearSelection = () => {
    setSelectedIds([])
  }

  const handleBulkHide = async (is_hidden) => {
    if (selectedIds.length === 0) return
    const actionText = is_hidden === 1 ? "ocultar" : "volver a mostrar"
    if (!confirm(`¿Estás seguro de que deseas ${actionText} ${selectedIds.length} producto(s)?`)) return

    try {
      setLoading(true)
      const res = await fetch('/api/inventory/bulk-hide', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ml_ids: selectedIds, is_hidden })
      })
      if (res.ok) {
        const data = await res.json()
        alert(data.message || "Operación realizada correctamente")
        clearSelection()
        fetchProducts()
      } else {
        alert("Error al realizar la acción masiva")
        setLoading(false)
      }
    } catch(e) {
      alert("Error: " + e.message)
      setLoading(false)
    }
  }

  const handleBulkWebActive = async (is_web_active) => {
    if (selectedIds.length === 0) return
    const actionText = is_web_active === 1 ? "activar" : "desactivar"
    if (!confirm(`¿Estás seguro de que deseas ${actionText} en la Tienda Web a ${selectedIds.length} producto(s)?`)) return

    try {
      setLoading(true)
      const res = await fetch('/api/inventory/bulk-web-active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ml_ids: selectedIds, is_web_active })
      })
      if (res.ok) {
        const data = await res.json()
        alert(data.message || "Operación realizada correctamente")
        clearSelection()
        fetchProducts()
      } else {
        alert("Error al realizar la acción masiva")
        setLoading(false)
      }
    } catch(e) {
      alert("Error: " + e.message)
      setLoading(false)
    }
  }

  const handleBulkSyncMeli = async (sync_meli) => {
    if (selectedIds.length === 0) return
    const actionText = sync_meli === 1 ? "activar" : "desactivar"
    if (!confirm(`¿Estás seguro de que deseas ${actionText} la sincronización con Mercado Libre para ${selectedIds.length} producto(s)?`)) return

    try {
      setLoading(true)
      const res = await fetch('/api/inventory/bulk-sync-meli', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ml_ids: selectedIds, sync_meli })
      })
      if (res.ok) {
        const data = await res.json()
        alert(data.message || "Operación realizada correctamente")
        clearSelection()
        fetchProducts()
      } else {
        alert("Error al realizar la acción masiva")
        setLoading(false)
      }
    } catch(e) {
      alert("Error: " + e.message)
      setLoading(false)
    }
  }

  const handleApplyBulkCategory = async (e) => {
    e.preventDefault()
    if (selectedIds.length === 0) return
    try {
      setLoading(true)
      const catId = bulkTargetCategory ? parseInt(bulkTargetCategory) : null
      const res = await fetch('/api/inventory/bulk-category', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ml_ids: selectedIds, category_id: catId })
      })
      if (res.ok) {
        const data = await res.json()
        alert(data.message || "Categoría actualizada correctamente")
        setShowBulkCategoryModal(false)
        setBulkTargetCategory("")
        clearSelection()
        fetchProducts()
      } else {
        alert("Error al asignar categoría masiva")
        setLoading(false)
      }
    } catch(e) {
      alert("Error: " + e.message)
      setLoading(false)
    }
  }

  const handleApplyBulkPriceAdjust = async (e) => {
    e.preventDefault()
    if (selectedIds.length === 0) return
    const val = parseFloat(bulkPriceValue)
    if (isNaN(val) || val === 0) {
      alert("Por favor ingresa un valor de ajuste válido distinto de cero.")
      return
    }
    if (!confirm(`¿Confirmas aplicar el ajuste de precio (${val > 0 ? '+' : ''}${val}${bulkPriceType === 'percentage' ? '%' : '$'}) a ${selectedIds.length} producto(s)?`)) return

    try {
      setLoading(true)
      const res = await fetch('/api/inventory/bulk-price-adjust', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ml_ids: selectedIds,
          target: bulkPriceTarget,
          adjustment_type: bulkPriceType,
          value: val
        })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.warnings && data.warnings.length > 0) {
          alert(data.message + "\nAdvertencias:\n" + data.warnings.join('\n'))
        } else {
          alert(data.message || "Precios ajustados correctamente")
        }
        setShowBulkPriceModal(false)
        setBulkPriceValue(0)
        clearSelection()
        fetchProducts()
      } else {
        alert("Error al ajustar precios")
        setLoading(false)
      }
    } catch(e) {
      alert("Error: " + e.message)
      setLoading(false)
    }
  }

  const fetchDispatchSchedule = async () => {
    try {
      const res = await fetch('/api/inventory/dispatch-schedule')
      if (res.ok) {
        const data = await res.json()
        setDispatchConfig(data)
      }
    } catch(e) {
      console.error("Error al cargar programación de envíos:", e)
    }
  }

  const handleSaveDispatchSchedule = async (e) => {
    e.preventDefault()
    try {
      setLoading(true)
      const res = await fetch('/api/inventory/dispatch-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dispatchConfig)
      })
      if (res.ok) {
        const data = await res.json()
        alert(data.message || "Configuración guardada correctamente")
        setShowDispatchScheduleModal(false)
        fetchDispatchSchedule()
        setLoading(false)
      } else {
        alert("Error al guardar la configuración")
        setLoading(false)
      }
    } catch(err) {
      alert("Error: " + err.message)
      setLoading(false)
    }
  }

  const handleApplyDispatchScheduleNow = async () => {
    if (!confirm("¿Confirmas aplicar inmediatamente la regla de disponibilidad a TODAS las publicaciones de Mercado Libre?")) return
    try {
      setLoading(true)
      const res = await fetch('/api/inventory/dispatch-schedule/apply-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      if (res.ok) {
        const data = await res.json()
        alert(data.message || "Regla de disponibilidad aplicada correctamente")
        fetchDispatchSchedule()
        fetchProducts()
      } else {
        const err = await res.json()
        alert("Error al aplicar regla de envíos: " + (err.detail || "Error desconocido"))
        setLoading(false)
      }
    } catch(err) {
      alert("Error: " + err.message)
      setLoading(false)
    }
  }

  const isAllVisibleSelected = React.useMemo(() => {
    if (!sortedProducts || sortedProducts.length === 0) return false
    return sortedProducts.every(p => selectedIds.includes(p.ml_id))
  }, [sortedProducts, selectedIds])

  const isSomeVisibleSelected = React.useMemo(() => {
    if (!sortedProducts || sortedProducts.length === 0) return false
    return sortedProducts.some(p => selectedIds.includes(p.ml_id)) && !isAllVisibleSelected
  }, [sortedProducts, selectedIds, isAllVisibleSelected])

  const modifiedCount = getModifiedItems().length

  return (
    <div>
      <h1 className="page-title">Inventario de Publicaciones</h1>
      <p className="page-subtitle">Sincronizá tus publicaciones de Mercado Libre y gestioná tu Tienda Web.</p>

      <div className="inventory-controls" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 15, flexWrap: 'wrap'}}>
        <div style={{display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap'}}>
          <input 
            type="text" 
            placeholder="Buscar por nombre o ID..." 
            value={query} 
            onChange={e => setQuery(e.target.value)} 
            className="search-input"
            style={{width: 220, marginBottom: 0}}
          />
          {!isSimpleView && (
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="search-input"
            style={{
              width: 230,
              marginBottom: 0,
              padding: '6px 10px',
              fontSize: '0.82rem',
              borderRadius: 6,
              border: categoryFilter === 'UNCATEGORIZED' ? '1px solid #f59e0b' : '1px solid var(--border-color)',
              backgroundColor: categoryFilter === 'UNCATEGORIZED' ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-card)',
              color: categoryFilter === 'UNCATEGORIZED' ? '#f59e0b' : 'var(--text-primary)',
              fontWeight: categoryFilter === 'UNCATEGORIZED' ? '700' : 'normal',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">📁 Todas las Categorías ({products.length})</option>
            <option value="UNCATEGORIZED">
              ⚠️ Sin Categoría ({uncategorizedCount})
            </option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                📁 {c.name} ({categoryCounts[String(c.id)] || 0})
              </option>
            ))}
          </select>
          )}
          {!isSimpleView && (
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
          )}
          {!isSimpleView && (
          <button 
            type="button"
            className="btn" 
            style={{
              padding: '6px 12px', 
              fontSize: '0.8rem',
              backgroundColor: showHidden ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-card)',
              color: showHidden ? 'var(--accent-red)' : 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 6,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
            onClick={() => setShowHidden(!showHidden)}
            title={showHidden ? "Ocultar productos archivados" : "Mostrar productos archivados / ocultos"}
          >
            {showHidden ? <EyeOff size={14} /> : <Eye size={14} />}
            {showHidden ? 'Ocultos Visibles' : 'Ver Ocultos'}
          </button>
          )}
        </div>
        <div className="control-buttons" style={{display: 'flex', gap: 10, flexWrap: 'wrap'}}>
          {modifiedCount > 0 && (
            <button className="btn" style={{backgroundColor: '#10b981', color: 'white', border: 'none'}} onClick={saveAllChanges}>
              Guardar {modifiedCount} cambios
            </button>
          )}
          {!isSimpleView && (
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
          )}
          {!isSimpleView && (
          <button 
            className="btn" 
            style={{
              backgroundColor: 'rgba(16, 185, 129, 0.15)', 
              color: '#10b981', 
              border: '1px solid #10b981', 
              display: 'flex', 
              alignItems: 'center', 
              gap: 6,
              fontWeight: '600'
            }} 
            onClick={() => {
              fetchProfitability()
              setShowProfitabilityModal(true)
            }}
          >
            📊 Calculadora de Rentabilidad
          </button>
          )}
          {!isSimpleView && (
          <button className="btn" style={{backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 5}} onClick={() => setShowCategoriesModal(true)}>
            📁 Gestionar Categorías
          </button>
          )}
          {!isSimpleView && (
          <button 
            className="btn" 
            style={{
              backgroundColor: 'var(--bg-card)', 
              color: 'var(--text-primary)', 
              border: '1px solid var(--border-color)', 
              display: 'flex', 
              alignItems: 'center', 
              gap: 5
            }} 
            onClick={() => {
              fetchDispatchSchedule()
              setShowDispatchScheduleModal(true)
            }}
            title="Programar tiempo de elaboración / disponibilidad de stock semanal para Mercado Libre"
          >
            📅 Disponibilidad MeLi
          </button>
          )}
          {!isSimpleView && (
          <button className="btn" style={{backgroundColor: 'var(--accent-emerald)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: 6}} onClick={() => setShowQrScanModal(true)}>
            <QrCode size={16} /> Escanear QR
          </button>
          )}
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
                    <option key={c.id} value={c.id}>{c.name} ({categoryCounts[String(c.id)] || 0})</option>
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

      {selectedIds.length > 0 && (
        <div style={{
          position: 'sticky',
          top: 10,
          zIndex: 100,
          marginBottom: 15,
          padding: '12px 18px',
          borderRadius: 10,
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--accent-blue)',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap'
        }}>
          <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
            <span style={{
              backgroundColor: 'var(--accent-blue)',
              color: '#fff',
              padding: '3px 10px',
              borderRadius: 12,
              fontWeight: 'bold',
              fontSize: '0.85rem'
            }}>
              {selectedIds.length} seleccionado{selectedIds.length > 1 ? 's' : ''}
            </span>
            <span style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>
              Acciones masivas:
            </span>
          </div>
          
          <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center'}}>
            <button 
              type="button" 
              className="btn" 
              style={{padding: '5px 10px', fontSize: '0.78rem', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', display: 'inline-flex', alignItems: 'center', gap: 4}}
              onClick={() => handleBulkHide(1)}
              title="Ocultar del inventario"
            >
              <EyeOff size={14} /> Ocultar
            </button>

            <button 
              type="button" 
              className="btn" 
              style={{padding: '5px 10px', fontSize: '0.78rem', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'inline-flex', alignItems: 'center', gap: 4}}
              onClick={() => handleBulkHide(0)}
              title="Mostrar en el inventario"
            >
              <Eye size={14} /> Mostrar
            </button>

            <div style={{width: 1, height: 20, backgroundColor: 'var(--border-color)', margin: '0 4px'}} />

            <button 
              type="button" 
              className="btn" 
              style={{padding: '5px 10px', fontSize: '0.78rem', backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#2563eb', border: '1px solid rgba(59, 130, 246, 0.3)', display: 'inline-flex', alignItems: 'center', gap: 4}}
              onClick={() => handleBulkWebActive(1)}
              title="Activar en Tienda Web"
            >
              Activar Web
            </button>

            <button 
              type="button" 
              className="btn" 
              style={{padding: '5px 10px', fontSize: '0.78rem', backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', display: 'inline-flex', alignItems: 'center', gap: 4}}
              onClick={() => handleBulkWebActive(0)}
              title="Desactivar en Tienda Web"
            >
              Desactivar Web
            </button>

            <div style={{width: 1, height: 20, backgroundColor: 'var(--border-color)', margin: '0 4px'}} />

            <button 
              type="button" 
              className="btn" 
              style={{padding: '5px 10px', fontSize: '0.78rem', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#d97706', border: '1px solid rgba(245, 158, 11, 0.3)', display: 'inline-flex', alignItems: 'center', gap: 4}}
              onClick={() => setShowBulkCategoryModal(true)}
            >
              📁 Asignar Categoría
            </button>

            <button 
              type="button" 
              className="btn" 
              style={{padding: '5px 10px', fontSize: '0.78rem', backgroundColor: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.3)', display: 'inline-flex', alignItems: 'center', gap: 4}}
              onClick={() => setShowBulkPriceModal(true)}
            >
              🏷️ Ajustar Precios
            </button>

            <button 
              type="button" 
              className="btn" 
              style={{padding: '5px 10px', fontSize: '0.78rem', backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', display: 'inline-flex', alignItems: 'center', gap: 4}}
              onClick={() => handleBulkSyncMeli(1)}
              title="Activar Sincro MeLi"
            >
              <Cloud size={13} /> Sincro MeLi
            </button>

            <div style={{width: 1, height: 20, backgroundColor: 'var(--border-color)', margin: '0 4px'}} />

            <button 
              type="button" 
              className="btn" 
              style={{padding: '5px 10px', fontSize: '0.78rem', backgroundColor: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer'}}
              onClick={clearSelection}
            >
              ✕ Cancelar
            </button>
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
                    <th style={{width: 35, textAlign: 'center'}}>
                      <input 
                        type="checkbox" 
                        checked={isAllVisibleSelected}
                        ref={el => { if (el) el.indeterminate = isSomeVisibleSelected }}
                        onChange={handleToggleSelectAll}
                        style={{cursor: 'pointer'}}
                        title="Seleccionar / Deseleccionar todos los visibles"
                      />
                    </th>
                    <th style={{width: 45}}>IMG</th>
                    <th onClick={() => requestSort('title')} style={{cursor: 'pointer', userSelect: 'none', minWidth: 220}}>Detalle{getSortIcon('title')}</th>
                    <th onClick={() => requestSort('status')} style={{cursor: 'pointer', userSelect: 'none', width: 90}}>Estado{getSortIcon('status')}</th>
                    <th style={{width: 60}}>Stock</th>
                    <th style={{width: 75}}>P. ML</th>
                    <th style={{width: 75}}>C. Base</th>
                    <th style={{width: 75}} title="Costo total de Mercado Libre obtenido desde la API (Comisión de venta + Envío gratis si aplica)">C. ML ⓘ</th>
                    <th style={{width: 75}}>P. Web</th>
                    <th style={{width: 45, textAlign: 'center'}}>Web</th>
                    <th style={{width: 100}}>Acciones</th>
                  </tr>
                ) : (
                  <tr>
                    <th style={{width: 35, textAlign: 'center'}}>
                      <input 
                        type="checkbox" 
                        checked={isAllVisibleSelected}
                        ref={el => { if (el) el.indeterminate = isSomeVisibleSelected }}
                        onChange={handleToggleSelectAll}
                        style={{cursor: 'pointer'}}
                        title="Seleccionar / Deseleccionar todos los visibles"
                      />
                    </th>
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
                    categoryCounts={categoryCounts}
                    viewMode={viewMode}
                    isSelected={selectedIds.includes(p.ml_id)}
                    onToggleSelect={handleToggleSelectProduct}
                    onOpenQrModal={(prod) => {
                      setSelectedProductForQr(prod)
                      setShowQrPrintModal(true)
                    }}
                    onToggleHide={handleToggleHide}
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
                      <span style={{fontWeight: 500, fontSize: '0.9rem'}}>{c.name} <small style={{color: 'var(--text-secondary)', fontWeight: 'normal'}}>({categoryCounts[String(c.id)] || 0} productos)</small></span>
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
      {showBulkCategoryModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1050
        }}>
          <div className="card" style={{
            width: 420, maxWidth: '90%', padding: 25,
            backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12
          }}>
            <h3 style={{marginTop: 0, marginBottom: 15}}>Asignar Categoría en Lote</h3>
            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 15}}>
              Se asignará la categoría elegida a los <strong>{selectedIds.length}</strong> productos seleccionados.
            </p>
            <form onSubmit={handleApplyBulkCategory} style={{display: 'flex', flexDirection: 'column', gap: 15}}>
              <label style={{fontSize: '0.85rem'}}>Categoría:
                <select 
                  value={bulkTargetCategory}
                  onChange={e => setBulkTargetCategory(e.target.value)}
                  style={{width: '100%', marginTop: 6, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                >
                  <option value="">Sin Categoría ({uncategorizedCount})</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({categoryCounts[String(c.id)] || 0})</option>
                  ))}
                </select>
              </label>
              <div style={{display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10}}>
                <button type="button" className="btn" style={{backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)'}} onClick={() => setShowBulkCategoryModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn" style={{backgroundColor: 'var(--accent-blue)', color: '#fff'}}>
                  Aplicar a {selectedIds.length} Productos
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBulkPriceModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1050
        }}>
          <div className="card" style={{
            width: 480, maxWidth: '90%', padding: 25,
            backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12
          }}>
            <h3 style={{marginTop: 0, marginBottom: 15}}>Ajuste Masivo de Precios</h3>
            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 15}}>
              Modificar el precio de los <strong>{selectedIds.length}</strong> productos seleccionados.
            </p>

            <form onSubmit={handleApplyBulkPriceAdjust} style={{display: 'flex', flexDirection: 'column', gap: 15}}>
              <label style={{fontSize: '0.85rem'}}>Aplicar a:
                <select 
                  value={bulkPriceTarget} 
                  onChange={e => setBulkPriceTarget(e.target.value)}
                  style={{width: '100%', marginTop: 5, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                >
                  <option value="both">Ambos (Precio MeLi y Precio Web)</option>
                  <option value="meli">Solo Precio Mercado Libre</option>
                  <option value="web">Solo Precio Tienda Web</option>
                </select>
              </label>

              <div style={{display: 'flex', gap: 12}}>
                <label style={{flex: 1, fontSize: '0.85rem'}}>Tipo de Ajuste:
                  <select 
                    value={bulkPriceType} 
                    onChange={e => setBulkPriceType(e.target.value)}
                    style={{width: '100%', marginTop: 5, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                  >
                    <option value="percentage">Porcentaje (%)</option>
                    <option value="fixed">Monto Fijo ($)</option>
                  </select>
                </label>

                <label style={{flex: 1, fontSize: '0.85rem'}}>Valor ({bulkPriceType === 'percentage' ? '%' : '$'}):
                  <input 
                    type="number" 
                    step="any"
                    required 
                    value={bulkPriceValue}
                    onChange={e => setBulkPriceValue(e.target.value)}
                    placeholder="ej: 10 o -5"
                    style={{width: '100%', marginTop: 5, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                  />
                </label>
              </div>

              <div style={{
                padding: '10px 14px',
                borderRadius: 6,
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                fontSize: '0.8rem',
                color: 'var(--accent-blue)'
              }}>
                💡 <strong>Resumen del ajuste:</strong> {
                  parseFloat(bulkPriceValue) === 0 ? "Sin cambio" : (
                    parseFloat(bulkPriceValue) > 0 
                      ? `Aumentará los precios un ${bulkPriceType === 'percentage' ? `${bulkPriceValue}%` : `$${bulkPriceValue}`}`
                      : `Reducirá los precios un ${bulkPriceType === 'percentage' ? `${Math.abs(bulkPriceValue)}%` : `$${Math.abs(bulkPriceValue)}`}`
                  )
                } en los productos seleccionados.
              </div>

              <div style={{display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10}}>
                <button type="button" className="btn" style={{backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)'}} onClick={() => setShowBulkPriceModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn" style={{backgroundColor: 'var(--accent-emerald)', color: '#fff'}}>
                  Aplicar Ajuste
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDispatchScheduleModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1050
        }}>
          <div className="card" style={{
            width: 520, maxWidth: '92%', maxHeight: '90vh', overflowY: 'auto', padding: 25,
            border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', borderRadius: 12
          }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderBottom: '1px solid var(--border-color)', paddingBottom: 12}}>
              <h3 style={{margin: 0}}>📅 Programación de Disponibilidad MeLi</h3>
              <button 
                className="btn" 
                style={{backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '4px 8px', fontSize: '0.75rem'}}
                onClick={() => setShowDispatchScheduleModal(false)}
              >
                Cerrar
              </button>
            </div>

            <div style={{
              padding: '12px 15px',
              borderRadius: 8,
              backgroundColor: dispatchConfig.current_mode === 'weekend' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              border: dispatchConfig.current_mode === 'weekend' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
              marginBottom: 18
            }}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'bold', fontSize: '0.85rem', color: dispatchConfig.current_mode === 'weekend' ? '#d97706' : '#10b981'}}>
                {dispatchConfig.current_mode === 'weekend' ? '🌙 Modo Fin de Semana Activo' : '☀️ Modo Días Hábiles Activo'}
              </div>
              <div style={{fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4}}>
                Disponibilidad configurada: <strong>{dispatchConfig.current_mode === 'weekend' ? dispatchConfig.weekend_days : dispatchConfig.weekday_days} días</strong>.
                {dispatchConfig.last_applied_at && (
                  <span style={{display: 'block', marginTop: 2, fontSize: '0.72rem'}}>
                    Último cambio aplicado: {new Date(dispatchConfig.last_applied_at).toLocaleString('es-AR')}
                  </span>
                )}
              </div>
            </div>

            <form onSubmit={handleSaveDispatchSchedule} style={{display: 'flex', flexDirection: 'column', gap: 16}}>
              <label style={{display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.9rem', fontWeight: 'bold', cursor: 'pointer'}}>
                <input 
                  type="checkbox" 
                  checked={dispatchConfig.enabled} 
                  onChange={e => setDispatchConfig({...dispatchConfig, enabled: e.target.checked})}
                  style={{width: 18, height: 18, cursor: 'pointer'}}
                />
                Activar Programación Automática Semanal
              </label>

              <div style={{border: '1px solid var(--border-color)', borderRadius: 8, padding: 15, display: 'flex', flexDirection: 'column', gap: 12}}>
                <span style={{fontSize: '0.85rem', fontWeight: 'bold'}}>Configuración de Días de Elaboración / Envío:</span>

                <div style={{display: 'flex', gap: 15}}>
                  <label style={{flex: 1, fontSize: '0.82rem'}}>
                    ☀️ En la semana (Lun - Vie):
                    <select 
                      value={dispatchConfig.weekday_days}
                      onChange={e => setDispatchConfig({...dispatchConfig, weekday_days: parseInt(e.target.value) || 0})}
                      style={{width: '100%', marginTop: 5, padding: 6, borderRadius: 4, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                    >
                      <option value={0}>0 días (Entrega inmediata)</option>
                      <option value={1}>1 día de elaboración</option>
                      <option value={2}>2 días de elaboración</option>
                      <option value={3}>3 días de elaboración</option>
                      <option value={4}>4 días de elaboración</option>
                      <option value={5}>5 días de elaboración</option>
                    </select>
                  </label>

                  <label style={{flex: 1, fontSize: '0.82rem'}}>
                    🌙 Fin de Semana:
                    <select 
                      value={dispatchConfig.weekend_days}
                      onChange={e => setDispatchConfig({...dispatchConfig, weekend_days: parseInt(e.target.value) || 0})}
                      style={{width: '100%', marginTop: 5, padding: 6, borderRadius: 4, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                    >
                      <option value={0}>0 días (Entrega inmediata)</option>
                      <option value={1}>1 día de elaboración</option>
                      <option value={2}>2 días de elaboración</option>
                      <option value={3}>3 días de elaboración</option>
                      <option value={4}>4 días de elaboración</option>
                      <option value={5}>5 días de elaboración</option>
                    </select>
                  </label>
                </div>
              </div>

              <div style={{border: '1px solid var(--border-color)', borderRadius: 8, padding: 15, display: 'flex', flexDirection: 'column', gap: 12}}>
                <span style={{fontSize: '0.85rem', fontWeight: 'bold'}}>Franja Horaria de Fin de Semana:</span>

                <div style={{display: 'flex', gap: 15}}>
                  <label style={{flex: 1, fontSize: '0.82rem'}}>
                    Inicio de Fin de Semana:
                    <select 
                      value={dispatchConfig.weekend_start_day}
                      onChange={e => setDispatchConfig({...dispatchConfig, weekend_start_day: parseInt(e.target.value)})}
                      style={{width: '100%', marginTop: 5, padding: 6, borderRadius: 4, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                    >
                      <option value={4}>Viernes</option>
                      <option value={5}>Sábado</option>
                    </select>
                  </label>

                  <label style={{flex: 1, fontSize: '0.82rem'}}>
                    Hora de Inicio:
                    <select 
                      value={dispatchConfig.weekend_start_hour}
                      onChange={e => setDispatchConfig({...dispatchConfig, weekend_start_hour: parseInt(e.target.value)})}
                      style={{width: '100%', marginTop: 5, padding: 6, borderRadius: 4, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                    >
                      {Array.from({length: 24}, (_, i) => (
                        <option key={i} value={i}>{String(i).padStart(2, '0')}:00 hs</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div style={{display: 'flex', gap: 15}}>
                  <label style={{flex: 1, fontSize: '0.82rem'}}>
                    Fin de Fin de Semana:
                    <select 
                      value={dispatchConfig.weekend_end_day}
                      onChange={e => setDispatchConfig({...dispatchConfig, weekend_end_day: parseInt(e.target.value)})}
                      style={{width: '100%', marginTop: 5, padding: 6, borderRadius: 4, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                    >
                      <option value={0}>Lunes</option>
                      <option value={6}>Domingo</option>
                    </select>
                  </label>

                  <label style={{flex: 1, fontSize: '0.82rem'}}>
                    Hora de Fin:
                    <select 
                      value={dispatchConfig.weekend_end_hour}
                      onChange={e => setDispatchConfig({...dispatchConfig, weekend_end_hour: parseInt(e.target.value)})}
                      style={{width: '100%', marginTop: 5, padding: 6, borderRadius: 4, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                    >
                      {Array.from({length: 24}, (_, i) => (
                        <option key={i} value={i}>{String(i).padStart(2, '0')}:00 hs</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 10, flexWrap: 'wrap'}}>
                <button 
                  type="button" 
                  className="btn" 
                  style={{backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#d97706', border: '1px solid rgba(245, 158, 11, 0.3)', fontSize: '0.8rem'}}
                  onClick={handleApplyDispatchScheduleNow}
                  title="Aplica la disponibilidad según el horario actual a todas las publicaciones en Mercado Libre de inmediato"
                >
                  ⚡ Aplicar Cambio Ahora
                </button>

                <div style={{display: 'flex', gap: 10}}>
                  <button type="button" className="btn" style={{backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)'}} onClick={() => setShowDispatchScheduleModal(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn" style={{backgroundColor: 'var(--accent-blue)', color: '#fff'}}>
                    Guardar Configuración
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function ProductRow({ p, onSave, onOpenGallery, onDraftChange, categories, categoryCounts, viewMode, onOpenQrModal, onToggleHide, isSelected, onToggleSelect }) {
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
  const [useMeliDescription, setUseMeliDescription] = useState(p.use_meli_description !== 0)
  const [descMeli, setDescMeli] = useState(p.description_meli || "")
  const [isSyncingDesc, setIsSyncingDesc] = useState(false)
  const [featuredOrder, setFeaturedOrder] = useState(p.featured_order || 0)
  const [showWebDetails, setShowWebDetails] = useState(false)

  const handleSyncDesc = async () => {
    setIsSyncingDesc(true)
    try {
      const res = await fetch(`/api/inventory/${p.ml_id}/sync-description`, { method: 'POST' })
      const data = await res.json()
      if (data.success && data.description_meli) {
        setDescMeli(data.description_meli)
        alert('Descripción sincronizada exitosamente desde Mercado Libre.')
      } else {
        alert(data.message || 'No se pudo traer la descripción de Mercado Libre.')
      }
    } catch (e) {
      alert('Error al conectar con la API de descripciones.')
    } finally {
      setIsSyncingDesc(false)
    }
  }

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
      use_meli_description: useMeliDescription ? 1 : 0,
      description_meli: descMeli || "",
      is_web_active: isWebActive ? 1 : 0,
      category_id: categoryId ? parseInt(categoryId) : null,
      sync_meli: syncMeli ? 1 : 0,
      min_stock: parseNum(minStock, true),
      featured_order: parseNum(featuredOrder, true)
    })
  }, [qty, price, cost, costMeli, priceWeb, isWebActive, description, useMeliDescription, descMeli, useMeliImage, customMainUrl, additionalUrls, categoryId, syncMeli, minStock, featuredOrder])

  if (viewMode === 'compact') {
    return (
      <React.Fragment>
        <tr className="product-row-card compact-tr" style={{borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem', backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.12)' : undefined}}>
          <td data-label="Selección" className="sticky-col-left-1" style={{padding: '5px 8px', textAlign: 'center'}}>
            <input 
              type="checkbox" 
              checked={isSelected}
              onChange={() => onToggleSelect(p.ml_id)}
              style={{cursor: 'pointer'}}
            />
          </td>
          <td data-label="Imagen" className="sticky-col-left-2" style={{padding: '5px 8px'}}>
            <img 
              src={p.thumbnail || 'https://via.placeholder.com/35'} 
              alt="thumb" 
              style={{width: 35, height: 35, objectFit: 'contain', borderRadius: 4, border: '1px solid var(--border-color)', backgroundColor: '#fff'}}
            />
          </td>
          <td data-label="Detalle" style={{padding: '6px 10px'}}>
            <div 
              style={{
                fontWeight: 600, 
                fontSize: '0.86rem', 
                color: 'var(--text-primary)', 
                lineHeight: '1.3',
                wordBreak: 'break-word'
              }} 
              title={p.title}
            >
              {p.title}
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap'}}>
              <span style={{color: 'var(--text-secondary)', fontSize: '0.7rem', fontFamily: 'monospace'}}>{p.ml_id}</span>
              {p.category_name ? (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '1px 6px',
                  fontSize: '0.65rem',
                  borderRadius: 3,
                  backgroundColor: 'var(--bg-hover)',
                  color: 'var(--text-secondary)'
                }}>
                  📁 {p.category_name}
                </span>
              ) : (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '1px 6px',
                  fontSize: '0.65rem',
                  borderRadius: 3,
                  backgroundColor: 'rgba(245, 158, 11, 0.2)',
                  color: '#d97706',
                  fontWeight: 600
                }}>
                  ⚠️ Sin Categoría
                </span>
              )}
              {p.is_hidden === 1 && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '1px 6px',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  borderRadius: 3,
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  color: '#ef4444'
                }}>
                  👁️ Oculto
                </span>
              )}
              {parseNum(featuredOrder, true) > 0 && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                  padding: '1px 5px',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  borderRadius: 3,
                  backgroundColor: 'rgba(245, 158, 11, 0.2)',
                  color: '#d97706'
                }}>
                  ⭐ #{featuredOrder}
                </span>
              )}
              {p.status !== 'local' && (
                <>
                  <a 
                    href={p.permalink || `https://articulo.mercadolibre.com.ar/${p.ml_id.replace('MLA', 'MLA-')}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 2,
                      padding: '1px 5px',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      borderRadius: 3,
                      backgroundColor: 'rgba(245, 158, 11, 0.15)',
                      color: '#d97706',
                      textDecoration: 'none'
                    }}
                    title="Ver publicación pública en Mercado Libre (Vista Comprador)"
                  >
                    <ExternalLink size={10} /> MeLi ↗
                  </a>
                  <a 
                    href={`https://vendedores.mercadolibre.com.ar/publicaciones/listado?search=${p.ml_id}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 2,
                      padding: '1px 5px',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      borderRadius: 3,
                      backgroundColor: 'rgba(245, 158, 11, 0.25)',
                      color: '#b45309',
                      textDecoration: 'none',
                      border: '1px solid rgba(245, 158, 11, 0.4)'
                    }}
                    title="Buscar y modificar en Central de Vendedores de Mercado Libre"
                  >
                    ✏️ MeLi (Editar) ↗
                  </a>
                </>
              )}
              {isWebActive && (
                <a 
                  href={`https://${window.location.hostname.replace('admin.', '')}/product/${p.ml_id}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 2,
                    padding: '1px 5px',
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    borderRadius: 3,
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    color: '#2563eb',
                    textDecoration: 'none'
                  }}
                  title="Ver producto en la Tienda Web"
                >
                  <ExternalLink size={10} /> Web ↗
                </a>
              )}
            </div>
            <div style={{color: 'var(--text-secondary)', fontSize: '0.68rem', marginTop: 3}}>
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
              <button className="btn-icon" onClick={() => onSave(p.ml_id, qty, price, cost, costMeli, priceWeb, getCombinedImages(), description, isWebActive, categoryId, syncMeli, minStock, featuredOrder, useMeliDescription ? 1 : 0, descMeli)} title="Guardar Todo" style={{padding: 4}}>
                <Save size={14} className="text-blue-500" />
              </button>
              <button type="button" className="btn-icon" onClick={() => onOpenQrModal(p)} title="Ver / Imprimir QR" style={{padding: 4, color: 'var(--accent-blue)'}}>
                <QrCode size={14} />
              </button>
              <button type="button" className="btn-icon" onClick={() => onToggleHide(p.ml_id, p.is_hidden)} title={p.is_hidden ? "Restaurar a inventario activo" : "Ocultar / Archivar producto"} style={{padding: 4, color: p.is_hidden ? '#ef4444' : 'var(--text-secondary)'}}>
                {p.is_hidden ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button type="button" className="btn" style={{padding: '3px 6px', fontSize: '0.7rem', backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: 'pointer'}} onClick={() => setShowWebDetails(!showWebDetails)}>
                Web {showWebDetails ? '▲' : '▼'}
              </button>
            </div>
          </td>
        </tr>
        {showWebDetails && (
          <tr className="web-details-row" style={{backgroundColor: 'var(--bg-dark)'}}>
            <td colSpan="11" style={{padding: 15}}>
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
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name} {categoryCounts && categoryCounts[String(c.id)] !== undefined ? `(${categoryCounts[String(c.id)]})` : ''}</option>)}
                    </select>
                  </div>
                  <div style={{display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap'}}>
                    <label style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>Alerta Mín:
                      <input type="number" value={minStock} onChange={e => setMinStock(e.target.value)} style={{width: 50, marginLeft: 5, padding: '3px 5px', fontSize: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 4, backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}/>
                    </label>
                    <label style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>⭐ Orden Destacado:
                      <input type="number" min="0" value={featuredOrder} onChange={e => setFeaturedOrder(e.target.value)} style={{width: 50, marginLeft: 5, padding: '3px 5px', fontSize: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 4, backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}} title="0 = Normal. 1, 2, 3... = Destacado en Portada"/>
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
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4}}>
                    <label style={{fontSize: '0.8rem', fontWeight: 'bold'}}>Descripción Personalizada (Manual)</label>
                    {p.status !== 'local' && (
                      <button 
                        type="button" 
                        onClick={handleSyncDesc} 
                        disabled={isSyncingDesc}
                        style={{fontSize: '0.7rem', padding: '2px 6px', background: 'var(--bg-hover)', color: 'var(--accent-blue)', border: '1px solid var(--border-color)', borderRadius: 4, cursor: 'pointer'}}
                      >
                        {isSyncingDesc ? 'Cargando...' : '🔄 Traer ML'}
                      </button>
                    )}
                  </div>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción escrita en el sistema (sobrescribe la de ML)..." style={{width: '100%', height: 60, padding: 5, fontSize: '0.75rem', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4}}/>
                  {p.status !== 'local' && (
                    <div style={{marginTop: 6}}>
                      <label style={{display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-primary)', cursor: 'pointer'}}>
                        <input 
                          type="checkbox" 
                          checked={useMeliDescription} 
                          onChange={e => setUseMeliDescription(e.target.checked)} 
                        />
                        <span>Usar descripción de Mercado Libre por defecto</span>
                      </label>
                    </div>
                  )}
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
      <tr className="product-row-card" style={{backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.12)' : undefined}}>
        <td data-label="Selección" style={{padding: '5px 8px', textAlign: 'center'}}>
          <input 
            type="checkbox" 
            checked={isSelected}
            onChange={() => onToggleSelect(p.ml_id)}
            style={{cursor: 'pointer'}}
          />
        </td>
        <td data-label="Imagen">
          <img 
            src={p.thumbnail || 'https://via.placeholder.com/50'} 
            alt="thumb" 
            style={{width: 50, height: 50, objectFit: 'contain', borderRadius: 4, border: '1px solid var(--border-color)', backgroundColor: '#fff'}}
          />
        </td>
        <td data-label="Detalle">
          <div style={{fontWeight: 600, fontSize: '0.9rem'}}>{p.title}</div>
          <div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap'}}>
            <span style={{color: 'var(--text-secondary)', fontSize: '0.75rem', fontFamily: 'monospace'}}>{p.ml_id}</span>
            {parseNum(featuredOrder, true) > 0 && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                fontSize: '0.72rem',
                fontWeight: 600,
                borderRadius: 4,
                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                color: '#d97706',
                border: '1px solid rgba(245, 158, 11, 0.3)'
              }}>
                ⭐ #{featuredOrder}
              </span>
            )}
            {p.status !== 'local' && (
              <>
                <a 
                  href={p.permalink || `https://articulo.mercadolibre.com.ar/${p.ml_id.replace('MLA', 'MLA-')}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    borderRadius: 4,
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    color: '#d97706',
                    textDecoration: 'none',
                    border: '1px solid rgba(245, 158, 11, 0.3)'
                  }}
                  title="Ver publicación pública en Mercado Libre (Vista Comprador)"
                >
                  <ExternalLink size={12} /> MeLi ↗
                </a>
                <a 
                  href={`https://vendedores.mercadolibre.com.ar/publicaciones/listado?search=${p.ml_id}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    borderRadius: 4,
                    backgroundColor: 'rgba(245, 158, 11, 0.25)',
                    color: '#b45309',
                    textDecoration: 'none',
                    border: '1px solid rgba(245, 158, 11, 0.4)'
                  }}
                  title="Buscar y modificar en Central de Vendedores de Mercado Libre"
                >
                  ✏️ MeLi (Editar) ↗
                </a>
              </>
            )}
            {isWebActive && (
              <a 
                href={`https://${window.location.hostname.replace('admin.', '')}/product/${p.ml_id}`} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 8px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  borderRadius: 4,
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  color: '#2563eb',
                  textDecoration: 'none',
                  border: '1px solid rgba(59, 130, 246, 0.3)'
                }}
                title="Ver producto en la Tienda Web"
              >
                <ExternalLink size={12} /> Web ↗
              </a>
            )}
          </div>
          <div style={{color: 'var(--text-secondary)', fontSize: '0.68rem', marginTop: 4}}>
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
            <button className="btn-icon" onClick={() => onSave(p.ml_id, qty, price, cost, costMeli, priceWeb, getCombinedImages(), description, isWebActive, categoryId, syncMeli, minStock, featuredOrder, useMeliDescription ? 1 : 0, descMeli)} title="Guardar Todo">
              <Save size={18} className="text-blue-500" />
            </button>
            <button type="button" className="btn-icon" onClick={() => onOpenQrModal(p)} title="Ver / Imprimir QR" style={{color: 'var(--accent-blue)'}}>
              <QrCode size={18} />
            </button>
            <button type="button" className="btn-icon" onClick={() => onToggleHide(p.ml_id, p.is_hidden)} title={p.is_hidden ? "Restaurar a inventario activo" : "Ocultar / Archivar producto"} style={{color: p.is_hidden ? '#ef4444' : 'var(--text-secondary)'}}>
              {p.is_hidden ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </td>
      </tr>
      {showWebDetails && (
        <tr className="web-details-row" style={{backgroundColor: 'var(--bg-dark)'}}>
          <td colSpan="7" style={{padding: 20}}>
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
                <div style={{marginTop: 5}}>
                  <label style={{fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: 5}}>⭐ Orden Destacado en Portada Web</label>
                  <input 
                    type="number" 
                    min="0" 
                    value={featuredOrder} 
                    onChange={e => setFeaturedOrder(e.target.value)} 
                    placeholder="0 = Normal. 1, 2, 3... = Posición"
                    style={{width: '100%', padding: '6px 10px', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4}}
                    title="0 = No destacado. 1, 2, 3... = Destacado en Portada"
                  />
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
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5}}>
                  <label style={{fontSize: '0.85rem', fontWeight: 'bold'}}>Descripción Personalizada (Manual)</label>
                  {p.status !== 'local' && (
                    <button 
                      type="button" 
                      onClick={handleSyncDesc} 
                      disabled={isSyncingDesc}
                      style={{fontSize: '0.75rem', padding: '3px 8px', background: 'var(--bg-hover)', color: 'var(--accent-blue)', border: '1px solid var(--border-color)', borderRadius: 4, cursor: 'pointer'}}
                    >
                      {isSyncingDesc ? 'Cargando...' : '🔄 Traer ML'}
                    </button>
                  )}
                </div>
                <textarea 
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  style={{width: '100%', height: 75, backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4, padding: 8, fontSize: '0.8rem'}}
                  placeholder="Escribí una descripción personalizada escrita en el sistema (sobrescribe la de ML)..."
                />
                {p.status !== 'local' && (
                  <div style={{marginTop: 8}}>
                    <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer'}}>
                      <input 
                        type="checkbox" 
                        checked={useMeliDescription} 
                        onChange={e => setUseMeliDescription(e.target.checked)} 
                      />
                      <span>Usar descripción de Mercado Libre por defecto (si no hay manual)</span>
                    </label>
                  </div>
                )}
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

      {/* PROFITABILITY & NET MARGIN CALCULATOR MODAL */}
      {showProfitabilityModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex',
          justifyContent: 'center', alignItems: 'center', zIndex: 1100, padding: 20
        }}>
          <div className="card" style={{ width: 1050, maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto', padding: 25, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, color: '#10b981', display: 'flex', alignItems: 'center', gap: 8 }}>
                  📊 Calculadora de Rentabilidad Neto por Producto
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Análisis de ganancia neta descontando costo de mercadería, comisiones MeLi/MP, envíos e impuestos (IIBB).
                </p>
              </div>
              <button className="btn" onClick={() => setShowProfitabilityModal(false)} style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                ✕ Cerrar
              </button>
            </div>

            {profitabilityLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Cargando análisis de rentabilidad...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* KPI Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 15 }}>
                  <div className="card" style={{ padding: 15, borderLeft: '4px solid #3b82f6' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Margen Neto Promedio MeLi</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>
                      {profitabilityData.summary?.avg_margin_meli || 0}%
                    </div>
                  </div>
                  <div className="card" style={{ padding: 15, borderLeft: '4px solid #10b981' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Margen Neto Promedio Web</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>
                      {profitabilityData.summary?.avg_margin_web || 0}%
                    </div>
                  </div>
                  <div className="card" style={{ padding: 15, borderLeft: '4px solid #ef4444' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Productos Críticos (&lt;10% margen)</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444' }}>
                      {profitabilityData.summary?.critical_margin_count || 0}
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Producto</th>
                        <th style={{ textAlign: 'right' }}>Costo $</th>
                        <th style={{ textAlign: 'right' }}>Envío Est. $</th>
                        <th style={{ textAlign: 'right' }}>Imp. IIBB %</th>
                        <th style={{ textAlign: 'right' }}>Precio MeLi</th>
                        <th style={{ textAlign: 'right' }}>Ganancia MeLi</th>
                        <th style={{ textAlign: 'right' }}>Precio Web</th>
                        <th style={{ textAlign: 'right' }}>Ganancia Web</th>
                        <th style={{ textAlign: 'right' }}>Favor Web</th>
                        <th style={{ textAlign: 'center' }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(profitabilityData.products || []).map(item => {
                        const isMeliCritical = item.margin_pct_meli < 10
                        return (
                          <tr key={item.ml_id}>
                            <td style={{ fontWeight: 600, maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.title}
                            </td>
                            <td style={{ textAlign: 'right' }}>${item.cost_price}</td>
                            <td style={{ textAlign: 'right' }}>${item.shipping_cost_est}</td>
                            <td style={{ textAlign: 'right' }}>{item.tax_rate_pct}%</td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>${item.price}</td>
                            <td style={{ textAlign: 'right' }}>
                              <span className="badge" style={{ backgroundColor: isMeliCritical ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)', color: isMeliCritical ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>
                                ${item.net_profit_meli} ({item.margin_pct_meli}%)
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>${item.price_web}</td>
                            <td style={{ textAlign: 'right' }}>
                              <span className="badge" style={{ backgroundColor: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 'bold' }}>
                                ${item.net_profit_web} ({item.margin_pct_web}%)
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', color: item.diff_web_extra > 0 ? '#10b981' : 'var(--text-secondary)' }}>
                              {item.diff_web_extra > 0 ? `+$${item.diff_web_extra}` : `$${item.diff_web_extra}`}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button className="btn" onClick={() => setEditingProfitItem({ ...item })} style={{ padding: '3px 8px', fontSize: '0.75rem', backgroundColor: 'var(--bg-hover)', color: 'var(--accent-blue)', border: '1px solid var(--border-color)' }}>
                                ✏️ Editar
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EDIT COST PARAMS MODAL */}
      {editingProfitItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200 }}>
          <div className="card" style={{ width: 440, padding: 22, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <h3 style={{ marginTop: 0, marginBottom: 15 }}>✏️ Ajustar Parámetros de Costo</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 15 }}>
              {editingProfitItem.title}
            </p>
            <form onSubmit={handleSaveProfitabilityParams} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Costo de Mercadería $
                <input type="number" step="0.01" value={editingProfitItem.cost_price} onChange={e => setEditingProfitItem(p => ({ ...p, cost_price: e.target.value }))} style={{ width: '100%', marginTop: 4 }} />
              </label>
              <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Comisión MeLi (% o $ Fijo)
                <input type="number" step="0.01" value={editingProfitItem.cost_meli} onChange={e => setEditingProfitItem(p => ({ ...p, cost_meli: e.target.value }))} style={{ width: '100%', marginTop: 4 }} />
              </label>
              <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Costo de Envío Estimado $
                <input type="number" step="0.01" value={editingProfitItem.shipping_cost_est} onChange={e => setEditingProfitItem(p => ({ ...p, shipping_cost_est: e.target.value }))} style={{ width: '100%', marginTop: 4 }} />
              </label>
              <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Impuestos / IIBB %
                <input type="number" step="0.01" value={editingProfitItem.tax_rate_pct} onChange={e => setEditingProfitItem(p => ({ ...p, tax_rate_pct: e.target.value }))} style={{ width: '100%', marginTop: 4 }} />
              </label>
              <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Otros Costos / Embalaje $
                <input type="number" step="0.01" value={editingProfitItem.other_cost} onChange={e => setEditingProfitItem(p => ({ ...p, other_cost: e.target.value }))} style={{ width: '100%', marginTop: 4 }} />
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" className="btn" onClick={() => setEditingProfitItem(null)}>Cancelar</button>
                <button type="submit" className="btn-primary" style={{ padding: '6px 16px' }}>Guardar y Recalcular</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

