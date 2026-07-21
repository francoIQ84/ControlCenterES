import React, { useState, useEffect, useMemo } from 'react'

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [searchQuery, setSearchQuery] = useState('')

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('create') // 'create' | 'edit'
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const initialForm = {
    nickname: '',
    full_name: '',
    email: '',
    phone: '',
    document_type: 'DNI',
    document_number: '',
    address: ''
  }
  const [formData, setFormData] = useState(initialForm)

  const fetchCustomers = () => {
    setLoading(true)
    fetch('/api/customers/')
      .then(res => res.json())
      .then(data => {
        setCustomers(data.customers || [])
        setLoading(false)
      })
      .catch(err => {
        console.error("Error fetching customers:", err)
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchCustomers()
  }, [])

  const handleOpenCreate = () => {
    setModalMode('create')
    setSelectedCustomer(null)
    setFormData(initialForm)
    setErrorMsg('')
    setIsModalOpen(true)
  }

  const handleOpenEdit = (customer) => {
    setModalMode('edit')
    setSelectedCustomer(customer)
    setFormData({
      nickname: customer.nickname || '',
      full_name: customer.full_name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      document_type: customer.document_type || 'DNI',
      document_number: customer.document_number || '',
      address: customer.address || ''
    })
    setErrorMsg('')
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setErrorMsg('')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErrorMsg('')

    try {
      let url = '/api/customers/'
      let method = 'POST'

      if (modalMode === 'edit' && selectedCustomer) {
        url = `/api/customers/${selectedCustomer.buyer_id}`
        method = 'PUT'
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Error al guardar cliente')
      }

      setIsModalOpen(false)
      fetchCustomers()
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (customer) => {
    if (!window.confirm(`¿Estás seguro de eliminar el cliente "${customer.full_name || customer.nickname}"?`)) {
      return
    }

    try {
      const res = await fetch(`/api/customers/${customer.buyer_id}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Error al eliminar cliente')
      }
      fetchCustomers()
    } catch (err) {
      alert(err.message)
    }
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

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers
    const q = searchQuery.toLowerCase().trim()
    return customers.filter(c =>
      (c.nickname || '').toLowerCase().includes(q) ||
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.document_number || '').toLowerCase().includes(q) ||
      (c.address || '').toLowerCase().includes(q)
    )
  }, [customers, searchQuery])

  const sortedCustomers = useMemo(() => {
    let sortableItems = [...filteredCustomers]
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let aVal = a[sortConfig.key]
        let bVal = b[sortConfig.key]

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
  }, [filteredCustomers, sortConfig])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px', marginBottom: '20px' }}>
        <div>
          <h1 className="page-title">Cartera de Clientes</h1>
          <p className="page-subtitle">Listado de compradores con métricas de compras recurrentes y gestión manual.</p>
        </div>
        <button
          onClick={handleOpenCreate}
          style={{
            backgroundColor: 'var(--accent-blue)',
            color: '#fff',
            border: 'none',
            padding: '10px 18px',
            borderRadius: '8px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 2px 4px rgba(59, 130, 246, 0.3)'
          }}
        >
          ➕ Nuevo Cliente
        </button>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{ fontSize: '1.2rem' }}>🔍</span>
          <input
            type="text"
            placeholder="Buscar por nombre, alias, DNI/CUIT, email, teléfono o dirección..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-dark)',
              color: 'var(--text-primary)',
              fontSize: '0.95rem'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      <div className="card">
        {loading ? <p>Cargando clientes...</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th onClick={() => requestSort('nickname')} style={{ cursor: 'pointer', userSelect: 'none' }}>Comprador{getSortIcon('nickname')}</th>
                  <th onClick={() => requestSort('full_name')} style={{ cursor: 'pointer', userSelect: 'none' }}>Nombre Real{getSortIcon('full_name')}</th>
                  <th>Contacto</th>
                  <th>Documento</th>
                  <th>Dirección</th>
                  <th onClick={() => requestSort('total_orders')} style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}>Órdenes{getSortIcon('total_orders')}</th>
                  <th onClick={() => requestSort('total_spent')} style={{ cursor: 'pointer', userSelect: 'none' }}>Total Gastado{getSortIcon('total_spent')}</th>
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sortedCustomers.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                      No se encontraron clientes.
                    </td>
                  </tr>
                ) : (
                  sortedCustomers.map(c => (
                    <tr key={c.buyer_id}>
                      <td style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>
                        @{c.nickname || 'Sin Alias'}
                        {c.source_platform && (
                          <span style={{
                            display: 'inline-block',
                            marginLeft: '6px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            backgroundColor: c.source_platform === 'MERCADOLIBRE' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                            color: c.source_platform === 'MERCADOLIBRE' ? 'var(--accent-amber)' : 'var(--accent-blue)'
                          }}>
                            {c.source_platform === 'MERCADOLIBRE' ? 'MeLi' : 'Manual'}
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: 500 }}>{c.full_name || '-'}</td>
                      <td>
                        <div style={{ fontSize: '0.85rem' }}>{c.email || '-'}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{c.phone || '-'}</div>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {c.document_number ? `${c.document_type || 'Doc'} ${c.document_number}` : '-'}
                      </td>
                      <td style={{ fontSize: '0.85rem', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.address || ''}>
                        {c.address || '-'}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{c.total_orders}</td>
                      <td style={{ color: 'var(--accent-emerald)', fontWeight: 'bold' }}>${(c.total_spent || 0).toLocaleString()}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button
                            onClick={() => handleOpenEdit(c)}
                            title="Editar Cliente"
                            style={{
                              backgroundColor: 'rgba(59, 130, 246, 0.15)',
                              color: 'var(--accent-blue)',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              padding: '5px 10px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: '600'
                            }}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => handleDelete(c)}
                            title="Eliminar Cliente"
                            style={{
                              backgroundColor: 'rgba(239, 68, 68, 0.15)',
                              color: 'var(--accent-red)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              padding: '5px 8px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.8rem'
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Agregar / Editar Cliente */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '25px',
            width: '100%',
            maxWidth: '550px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem' }}>
                {modalMode === 'create' ? '👤 Agregar Nuevo Cliente' : `✏️ Editar Cliente`}
              </h2>
              <button
                onClick={handleCloseModal}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '1.2rem',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid var(--accent-red)',
                color: 'var(--accent-red)',
                padding: '10px 14px',
                borderRadius: '8px',
                marginBottom: '15px',
                fontSize: '0.9rem'
              }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSave}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    Alias / Nickname
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: juan_perez"
                    value={formData.nickname}
                    onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-dark)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    Nombre y Apellido / Razón Social *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Juan Pérez"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-dark)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="ejemplo@correo.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-dark)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    Teléfono / WhatsApp
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 3411234567"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-dark)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    Tipo Doc
                  </label>
                  <select
                    value={formData.document_type}
                    onChange={(e) => setFormData({ ...formData, document_type: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-dark)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <option value="DNI">DNI</option>
                    <option value="CUIT">CUIT</option>
                    <option value="CUIL">CUIL</option>
                    <option value="PASAPORTE">Pasaporte</option>
                    <option value="CI">CI</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    Número de Documento
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 20301234567"
                    value={formData.document_number}
                    onChange={(e) => setFormData({ ...formData, document_number: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-dark)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  Dirección Completa
                </label>
                <input
                  type="text"
                  placeholder="Ej: Av. Pellegrini 1234, Rosario, Santa Fe"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-dark)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: 'var(--accent-blue)',
                    color: '#fff',
                    fontWeight: '600',
                    cursor: 'pointer',
                    opacity: saving ? 0.7 : 1
                  }}
                >
                  {saving ? 'Guardando...' : (modalMode === 'create' ? 'Crear Cliente' : 'Guardar Cambios')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
