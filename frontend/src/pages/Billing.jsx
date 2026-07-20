import React, { useState, useEffect } from 'react'

export default function Billing() {
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortConfig, setSortConfig] = useState({ key: 'invoice_number', direction: 'desc' })
  const [docFilter, setDocFilter] = useState('all') // 'all', 'cuit', 'dni'
  const [typeFilter, setTypeFilter] = useState('all') // 'all', 'meli', 'local'
  const [searchTerm, setSearchTerm] = useState('')
  const [ptoVta, setPtoVta] = useState(1)
  const [cbteTipo, setCbteTipo] = useState(11)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  const loadBillingData = () => {
    setLoading(true)
    fetch('/api/sales/')
      .then(res => res.json())
      .then(data => {
        // Filter only orders that have been invoiced (i.e. have invoice_number or afip_cae)
        const invoiced = (data.orders || []).filter(o => o.invoice_number || o.afip_cae)
        setSales(invoiced)
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setLoading(false)
      })
  }

  useEffect(() => {
    // Fetch default settings to pre-populate selectors
    fetch('/api/settings/arca-config')
      .then(res => res.json())
      .then(config => {
        if (config.afip_pto_vta) setPtoVta(config.afip_pto_vta)
        if (config.afip_type_cmp) setCbteTipo(config.afip_type_cmp)
      })
      .catch(err => console.error("Error fetching AFIP config defaults:", err))

    loadBillingData()
  }, [])

  const handleSync = () => {
    setSyncing(true)
    setSyncResult(null)
    fetch(`/api/sales/sync-afip?pto_vta=${ptoVta}&cbte_tipo=${cbteTipo}`)
      .then(res => {
        if (!res.ok) {
          return res.json().then(err => { throw new Error(err.detail || 'Error al sincronizar con AFIP') })
        }
        return res.json()
      })
      .then(data => {
        setSyncing(false)
        if (data.success) {
          setSyncResult({
            success: true,
            message: `Sincronización exitosa. Se importaron ${data.synced_count} facturas. (Último número en AFIP: #${data.last_authorized})`
          })
          loadBillingData()
        } else {
          setSyncResult({
            success: false,
            message: data.error || 'Ocurrió un error inesperado al sincronizar.'
          })
        }
      })
      .catch(err => {
        setSyncing(false)
        setSyncResult({
          success: false,
          message: err.message || 'Error de conexión con el servidor.'
        })
      })
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

  // Filter based on search term and dropdown filters
  const filteredSales = React.useMemo(() => {
    return sales.filter(o => {
      const q = searchTerm.toLowerCase()
      const invNum = (o.invoice_number || '').toLowerCase()
      const cae = (o.afip_cae || '').toLowerCase()
      const buyerName = (o.buyer?.name || '').toLowerCase()
      const docNum = (o.buyer?.document_number || '').toLowerCase()
      const orderId = String(o.order_id)
      
      const matchesSearch = invNum.includes(q) || cae.includes(q) || buyerName.includes(q) || docNum.includes(q) || orderId.includes(q)
      if (!matchesSearch) return false

      const isCuit = o.buyer?.document_type === 'CUIT' || String(o.buyer?.document_number || '').length === 11
      if (docFilter === 'cuit' && !isCuit) return false
      if (docFilter === 'dni' && isCuit) return false

      const isMeli = o.source_platform === 'MERCADOLIBRE'
      if (typeFilter === 'meli' && !isMeli) return false
      if (typeFilter === 'local' && isMeli) return false

      return true
    })
  }, [sales, searchTerm, docFilter, typeFilter])

  // Sort sales
  const sortedSales = React.useMemo(() => {
    let sortableItems = [...filteredSales]
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let aVal = a[sortConfig.key]
        let bVal = b[sortConfig.key]

        if (sortConfig.key === 'buyer_name') {
          aVal = (a.buyer?.name || '').toLowerCase()
          bVal = (b.buyer?.name || '').toLowerCase()
        } else if (sortConfig.key === 'total_amount') {
          aVal = Number(a.total_amount) || 0
          bVal = Number(b.total_amount) || 0
        } else if (sortConfig.key === 'date_created') {
          aVal = a.date_created || ''
          bVal = b.date_created || ''
        } else if (sortConfig.key === 'invoice_number') {
          aVal = a.invoice_number || ''
          bVal = b.invoice_number || ''
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }
    return sortableItems
  }, [filteredSales, sortConfig])

  // Totals calculations
  const totalAmountSum = React.useMemo(() => {
    return sales.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0)
  }, [sales])

  const totalCuitCount = React.useMemo(() => {
    return sales.filter(o => o.buyer?.document_type === 'CUIT' || String(o.buyer?.document_number || '').length === 11).length
  }, [sales])

  const totalDniCount = React.useMemo(() => {
    return sales.length - totalCuitCount
  }, [sales, totalCuitCount])

  const formatDate = (isoString) => {
    try {
      if (!isoString) return '-'
      const date = new Date(isoString)
      return date.toLocaleDateString('es-AR')
    } catch {
      return isoString || '-'
    }
  }

  return (
    <div>
      <h1 className="page-title">Historial de Facturación</h1>
      <p className="page-subtitle">Visualiza y descarga todos los comprobantes fiscales válidos autorizados por AFIP/ARCA.</p>

      {/* Summary Cards */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '25px', marginTop: '15px' }}>
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '0.85rem', color: '#666' }}>Total Facturado</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#003A70' }}>
            ${totalAmountSum.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '0.85rem', color: '#666' }}>Comprobantes Emitidos</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#333' }}>
            {sales.length}
          </span>
        </div>

        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '0.85rem', color: '#666' }}>Facturas a CUIT (A/B/C)</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#10b981' }}>
            {totalCuitCount}
          </span>
        </div>

        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ fontSize: '0.85rem', color: '#666' }}>Facturas a DNI (Consumidor Final)</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#3b82f6' }}>
            {totalDniCount}
          </span>
        </div>
      </div>

      {/* AFIP Sync Control Panel */}
      <div className="card" style={{
        marginBottom: '20px',
        padding: '20px',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%)',
        borderLeft: '5px solid #003A70',
        borderRadius: '8px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.05)'
      }}>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
        <h3 style={{ margin: '0 0 10px 0', color: '#003A70', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#003a70" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
          Sincronización Oficial AFIP / ARCA
        </h3>
        <p style={{ margin: '0 0 15px 0', fontSize: '0.85rem', color: '#555' }}>
          Importa comprobantes autorizados históricamente desde los servidores de la Administración Federal directamente a tu base de datos local.
        </p>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: '150px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#444' }}>Punto de Venta</label>
            <input
              type="number"
              min="1"
              value={ptoVta}
              onChange={(e) => setPtoVta(parseInt(e.target.value) || 1)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #ccc',
                fontSize: '0.9rem',
                backgroundColor: '#fff'
              }}
            />
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: '200px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#444' }}>Tipo de Comprobante</label>
            <select
              value={cbteTipo}
              onChange={(e) => setCbteTipo(parseInt(e.target.value))}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #ccc',
                fontSize: '0.9rem',
                backgroundColor: '#fff',
                height: '38px'
              }}
            >
              <option value={11}>Factura C (Clase C)</option>
              <option value={6}>Factura B (Clase B)</option>
              <option value={1}>Factura A (Clase A)</option>
            </select>
          </div>
          
          <button
            className="btn btn-primary"
            onClick={handleSync}
            disabled={syncing}
            style={{
              padding: '10px 20px',
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              backgroundColor: '#003A70',
              borderColor: '#003A70',
              fontWeight: '600',
              boxShadow: '0 2px 6px rgba(0,58,112,0.2)'
            }}
          >
            {syncing ? (
              <>
                <span className="spinner" style={{
                  display: 'inline-block',
                  width: '14px',
                  height: '14px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderRadius: '50%',
                  borderTopColor: '#fff',
                  animation: 'spin 1s linear infinite'
                }}></span>
                Sincronizando...
              </>
            ) : 'Sincronizar desde AFIP'}
          </button>
        </div>

        {syncResult && (
          <div style={{
            marginTop: '15px',
            padding: '12px 15px',
            borderRadius: '6px',
            backgroundColor: syncResult.success ? '#e6f4ea' : '#fce8e6',
            color: syncResult.success ? '#137333' : '#c5221f',
            fontSize: '0.85rem',
            border: `1px solid ${syncResult.success ? '#ceead6' : '#fad2cf'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <strong>{syncResult.success ? 'Éxito:' : 'Error:'}</strong>
            {syncResult.message}
          </div>
        )}
      </div>

      {/* Filter and Search */}
      <div className="card" style={{ marginBottom: '20px', padding: '15px 20px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Buscar por Nro. Factura, CAE, Nombre Comprador o DNI/CUIT..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ flex: 1, minWidth: '250px', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }}
          />
          
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <select
              value={docFilter}
              onChange={(e) => setDocFilter(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', height: '40px' }}
            >
              <option value="all">Todos los Documentos</option>
              <option value="cuit">Sólo CUIT (Empresas)</option>
              <option value="dni">Sólo DNI (Consumidor Final)</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', height: '40px' }}
            >
              <option value="all">Todos los Canales</option>
              <option value="meli">Mercado Libre</option>
              <option value="local">Locales/Web</option>
            </select>
          </div>

          {(searchTerm || docFilter !== 'all' || typeFilter !== 'all') && (
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                setSearchTerm('')
                setDocFilter('all')
                setTypeFilter('all')
              }}
              style={{ padding: '10px 15px', height: '40px' }}
            >
              Limpiar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Main Invoices Table */}
      <div className="card">
        {loading ? (
          <p style={{ padding: '20px' }}>Cargando comprobantes...</p>
        ) : sortedSales.length === 0 ? (
          <p style={{ padding: '25px', textAlign: 'center', color: '#777' }}>No se encontraron comprobantes facturados.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => requestSort('invoice_number')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Nro. Comprobante{getSortIcon('invoice_number')}
                </th>
                <th onClick={() => requestSort('date_created')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Fecha Emisión{getSortIcon('date_created')}
                </th>
                <th onClick={() => requestSort('buyer_name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Comprador / Razón Social{getSortIcon('buyer_name')}
                </th>
                <th>CUIT / DNI</th>
                <th>Domicilio Fiscal</th>
                <th>CAE</th>
                <th onClick={() => requestSort('total_amount')} style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'right' }}>
                  Total{getSortIcon('total_amount')}
                </th>
                <th style={{ textAlign: 'center' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {sortedSales.map(o => (
                <tr key={o.order_id}>
                  <td style={{ fontWeight: 'bold' }}>{o.invoice_number || '-'}</td>
                  <td>{formatDate(o.date_created)}</td>
                  <td>
                    <div>{o.buyer?.name || 'Consumidor Final'}</div>
                    <small style={{ color: '#888', fontSize: '0.75rem' }}>ID: {o.order_id}</small>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.85rem' }}>
                      {o.buyer?.document_number ? (
                        <>
                          <strong style={{ fontSize: '0.75rem', color: '#555' }}>{o.buyer.document_type || 'DOC'}: </strong>
                          {o.buyer.document_number}
                        </>
                      ) : (
                        'Consumidor Final'
                      )}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.buyer?.address || ''}>
                    {o.buyer?.address || '-'}
                  </td>
                  <td>
                    <div>{o.afip_cae || '-'}</div>
                    {o.afip_cae_exp && (
                      <div style={{ color: '#888', fontSize: '0.7rem' }}>Vence: {formatDate(o.afip_cae_exp)}</div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#10b981' }}>
                    ${Number(o.total_amount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <a
                      href={`/api/sales/${o.order_id}/invoice/pdf?token=${localStorage.getItem('adminToken')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary"
                      style={{ fontSize: '0.8rem', padding: '5px 10px', textDecoration: 'none', display: 'inline-block' }}
                    >
                      Ver PDF
                    </a>
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
