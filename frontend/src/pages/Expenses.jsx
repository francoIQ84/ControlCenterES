import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Wallet, Calendar, DollarSign, Tag, TrendingDown, TrendingUp, PieChart, ArrowUpRight, ArrowDownRight, Layers, FileText, CheckCircle2, AlertTriangle, Search, ChevronDown, ChevronUp, Pencil, RefreshCw, Clock, ExternalLink, Copy, Check, Link2, CreditCard } from 'lucide-react'
import { useTenant } from '../TenantContext'

export default function Expenses() {
  const [activeTab, setActiveTab] = useState('summary') // 'summary' | 'expenses' | 'incomes'
  const { isSimpleView } = useTenant()
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  // Data states
  const [fixedExpenses, setFixedExpenses] = useState([])
  const [variableExpenses, setVariableExpenses] = useState([])
  const [manualIncomes, setManualIncomes] = useState([])
  const [salesList, setSalesList] = useState([])
  const [vencimientos, setVencimientos] = useState([])
  const [vencimientosFilter, setVencimientosFilter] = useState('all') // 'all' | 'pending' | 'overdue' | 'paid'
  const [copiedCodeId, setCopiedCodeId] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [testPhone, setTestPhone] = useState('')
  const [sendingTestAlert, setSendingTestAlert] = useState(false)
  const [showSalesDetails, setShowSalesDetails] = useState(true)
  const [salesSearch, setSalesSearch] = useState('')
  const [summary, setSummary] = useState({
    total_sales: 0,
    total_manual_incomes: 0,
    total_incomes: 0,
    total_fixed_expenses: 0,
    total_variable_expenses: 0,
    total_transfers: 0,
    total_expenses: 0,
    net_balance: 0,
    margin_pct: 0
  })
  const [loading, setLoading] = useState(true)

  // Form states
  const [newFixed, setNewFixed] = useState({ description: '', amount: '', category: 'Sueldos' })
  const [newVariable, setNewVariable] = useState({ date: new Date().toISOString().split('T')[0], description: '', amount: '', category: 'Insumos' })
  const [newIncome, setNewIncome] = useState({ date: new Date().toISOString().split('T')[0], description: '', amount: '', category: 'Venta Directa / Extra' })
  const [newService, setNewService] = useState({
    description: '',
    category: 'Servicios',
    amount: '',
    due_date: new Date().toISOString().split('T')[0],
    payment_link: '',
    payment_code: '',
    auto_recurring: true
  })
  const [editModal, setEditModal] = useState({ open: false, type: '', item: null })
  const [syncMpLoading, setSyncMpLoading] = useState(false)

  const handleSyncMp = async () => {
    setSyncMpLoading(true)
    try {
      const res = await fetch('/api/mercadopago/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50 })
      })
      const isJson = res.headers.get('content-type')?.includes('application/json')
      const data = isJson ? await res.json() : {}
      if (res.ok && data.success) {
        alert(`¡Sincronización de Gastos/Compras completada con éxito!`)
        loadData()
      } else {
        const errMsg = data.detail || data.error || (res.status === 504 ? 'El servidor tardó en responder. Por favor intenta de nuevo.' : 'Error del servidor')
        alert("Error al sincronizar con Mercado Pago: " + errMsg)
      }
    } catch (e) {
      alert("Error de conexión: " + e.message)
    } finally {
      setSyncMpLoading(false)
    }
  }

  const fixedCategories = ['Sueldos', 'Alquiler', 'Impuestos', 'Servicios', 'Software/Suscripciones', 'Otros Fijos']
  const variableCategories = ['Insumos', 'Logística', 'Mantenimiento', 'Marketing', 'Otros Variables']
  const incomeCategories = ['Venta Directa / Extra', 'Aporte de Capital', 'Reembolso', 'Inversión', 'Otros Ingresos']
  const serviceCategories = ['Servicios', 'Impuestos', 'Alquiler', 'Software/Suscripciones', 'Otros']

  const fetchSummary = async () => {
    try {
      const res = await fetch(`/api/expenses/summary?month=${selectedMonth}&year=${selectedYear}`)
      if (res.ok) setSummary(await res.json())
    } catch (e) {
      console.error(e)
    }
  }

  const fetchFixed = async () => {
    try {
      const res = await fetch(`/api/expenses/fixed?month=${selectedMonth}&year=${selectedYear}`)
      if (res.ok) setFixedExpenses(await res.json())
    } catch (e) {
      console.error(e)
    }
  }

  const fetchVariable = async () => {
    try {
      const res = await fetch(`/api/expenses/variable?month=${selectedMonth}&year=${selectedYear}`)
      if (res.ok) setVariableExpenses(await res.json())
    } catch (e) {
      console.error(e)
    }
  }

  const fetchIncomes = async () => {
    try {
      const res = await fetch(`/api/expenses/incomes?month=${selectedMonth}&year=${selectedYear}`)
      if (res.ok) setManualIncomes(await res.json())
    } catch (e) {
      console.error(e)
    }
  }

  const fetchSalesList = async () => {
    try {
      const res = await fetch(`/api/expenses/sales?month=${selectedMonth}&year=${selectedYear}`)
      if (res.ok) setSalesList(await res.json())
    } catch (e) {
      console.error(e)
    }
  }

  const fetchVencimientos = async () => {
    try {
      const res = await fetch(`/api/expenses/vencimientos?month=${selectedMonth}&year=${selectedYear}`)
      if (res.ok) setVencimientos(await res.json())
    } catch (e) {
      console.error(e)
    }
  }

  const fetchForecast = async () => {
    try {
      const res = await fetch('/api/expenses/forecast')
      if (res.ok) setForecast(await res.json())
    } catch (e) {
      console.error(e)
    }
  }

  const handleSendTestAlert = async () => {
    if (!testPhone) return alert("Ingresa un número de teléfono (ej: 5491123456789)")
    setSendingTestAlert(true)
    try {
      const res = await fetch('/api/expenses/vencimientos/test-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        alert("¡Alerta de prueba enviada por WhatsApp con éxito!")
      } else {
        alert("Error: " + (data.detail || "No se pudo enviar la alerta"))
      }
    } catch (e) {
      alert("Error de conexión: " + e.message)
    } finally {
      setSendingTestAlert(false)
    }
  }

  const loadData = async () => {
    setLoading(true)
    await Promise.all([fetchSummary(), fetchFixed(), fetchVariable(), fetchIncomes(), fetchSalesList(), fetchVencimientos(), fetchForecast()])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [selectedMonth, selectedYear])

  const handleAddFixed = async (e) => {
    e.preventDefault()
    if (!newFixed.description || !newFixed.amount) return
    try {
      const res = await fetch('/api/expenses/fixed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: newFixed.description,
          amount: parseFloat(newFixed.amount),
          category: newFixed.category,
          month: selectedMonth,
          year: selectedYear
        })
      })
      if (res.ok) {
        setNewFixed({ description: '', amount: '', category: 'Sueldos' })
        fetchFixed()
        fetchSummary()
      }
    } catch (e) {
      alert("Error al guardar gasto fijo")
    }
  }

  const handleAddVariable = async (e) => {
    e.preventDefault()
    if (!newVariable.date || !newVariable.description || !newVariable.amount) return
    try {
      const res = await fetch('/api/expenses/variable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: newVariable.date,
          description: newVariable.description,
          amount: parseFloat(newVariable.amount),
          category: newVariable.category
        })
      })
      if (res.ok) {
        setNewVariable({ ...newVariable, description: '', amount: '' })
        fetchVariable()
        fetchSummary()
      }
    } catch (e) {
      alert("Error al guardar gasto variable")
    }
  }

  const handleAddIncome = async (e) => {
    e.preventDefault()
    if (!newIncome.date || !newIncome.description || !newIncome.amount) return
    try {
      const res = await fetch('/api/expenses/incomes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: newIncome.date,
          description: newIncome.description,
          amount: parseFloat(newIncome.amount),
          category: newIncome.category
        })
      })
      if (res.ok) {
        setNewIncome({ ...newIncome, description: '', amount: '' })
        fetchIncomes()
        fetchSummary()
      }
    } catch (e) {
      alert("Error al guardar ingreso")
    }
  }
  const handleTogglePaidFixed = async (exp) => {
    try {
      const res = await fetch(`/api/expenses/fixed/${exp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...exp, is_paid: !exp.is_paid })
      })
      if (res.ok) {
        fetchFixed()
      }
    } catch (e) {
      alert("Error al actualizar estado")
    }
  }

  const handleDeleteFixed = async (id) => {
    if (!confirm("¿Eliminar este gasto fijo?")) return
    try {
      const res = await fetch(`/api/expenses/fixed/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchFixed()
        fetchSummary()
      }
    } catch (e) {}
  }

  const handleCopyPreviousFixed = async () => {
    if (!confirm(`¿Deseas traer los gastos fijos del mes anterior para ${selectedMonth}/${selectedYear}? (Esto actualizará los datos del mes actual)`)) return
    try {
      const res = await fetch(`/api/expenses/fixed/copy-previous?month=${selectedMonth}&year=${selectedYear}`, { method: 'POST' })
      if (res.ok) {
        fetchFixed()
        fetchSummary()
      } else {
        const data = await res.json()
        alert(data.detail || "Error al traer gastos fijos")
      }
    } catch (e) {
      alert("Error de conexión: " + e.message)
    }
  }

  const handleDeleteVariable = async (id) => {
    if (!confirm("¿Eliminar este gasto variable?")) return
    try {
      const res = await fetch(`/api/expenses/variable/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchVariable()
        fetchSummary()
      }
    } catch (e) {}
  }

  const handleDeleteIncome = async (id) => {
    if (!confirm("¿Eliminar este ingreso?")) return
    try {
      const res = await fetch(`/api/expenses/incomes/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchIncomes()
        fetchSummary()
      }
    } catch (e) {}
  }

  const handleAddService = async (e) => {
    e.preventDefault()
    if (!newService.description || !newService.amount || !newService.due_date) return
    try {
      const res = await fetch('/api/expenses/vencimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: newService.description,
          category: newService.category,
          amount: parseFloat(newService.amount),
          due_date: newService.due_date,
          period_month: selectedMonth,
          period_year: selectedYear,
          payment_link: newService.payment_link,
          payment_code: newService.payment_code,
          auto_recurring: newService.auto_recurring
        })
      })
      if (res.ok) {
        setNewService({
          description: '',
          category: 'Servicios',
          amount: '',
          due_date: new Date().toISOString().split('T')[0],
          payment_link: '',
          payment_code: '',
          auto_recurring: true
        })
        fetchVencimientos()
      }
    } catch (e) {
      alert("Error al guardar vencimiento")
    }
  }

  const handleDeleteService = async (id) => {
    if (!confirm("¿Eliminar este servicio/vencimiento?")) return
    try {
      const res = await fetch(`/api/expenses/vencimientos/${id}`, { method: 'DELETE' })
      if (res.ok) fetchVencimientos()
    } catch (e) {
      alert("Error al eliminar registro")
    }
  }

  const handlePayService = async (service, addToVariable = true) => {
    try {
      const res = await fetch(`/api/expenses/vencimientos/${service.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ add_to_variable_expenses: addToVariable })
      })
      if (res.ok) {
        fetchVencimientos()
        fetchVariable()
        fetchSummary()
      }
    } catch (e) {
      alert("Error al marcar como pagado")
    }
  }

  const handleUnpayService = async (id) => {
    try {
      const res = await fetch(`/api/expenses/vencimientos/${id}/unpay`, { method: 'POST' })
      if (res.ok) fetchVencimientos()
    } catch (e) {
      alert("Error al desmarcar pago")
    }
  }

  const handleCopyCode = (code, id) => {
    if (!code) return
    navigator.clipboard.writeText(code)
    setCopiedCodeId(id)
    setTimeout(() => setCopiedCodeId(null), 2000)
  }

  const handleSaveEdit = async (e) => {
    e.preventDefault()
    if (!editModal.item || !editModal.item.description || !editModal.item.amount) return
    const { type, item } = editModal

    try {
      let url = `/api/expenses/${type}/${item.id}`
      let bodyData = {}

      if (type === 'fixed') {
        bodyData = {
          description: item.description,
          amount: parseFloat(item.amount),
          category: item.category,
          month: item.month || selectedMonth,
          year: item.year || selectedYear
        }
      } else if (type === 'variable' || type === 'incomes') {
        bodyData = {
          date: item.date,
          description: item.description,
          amount: parseFloat(item.amount),
          category: item.category
        }
      } else if (type === 'vencimientos') {
        bodyData = {
          description: item.description,
          category: item.category,
          amount: parseFloat(item.amount),
          due_date: item.due_date,
          period_month: item.period_month || selectedMonth,
          period_year: item.period_year || selectedYear,
          payment_link: item.payment_link || '',
          payment_code: item.payment_code || '',
          auto_recurring: item.auto_recurring !== undefined ? item.auto_recurring : true
        }
      }

      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      })

      if (res.ok) {
        setEditModal({ open: false, type: '', item: null })
        if (type === 'fixed') fetchFixed()
        else if (type === 'variable') fetchVariable()
        else if (type === 'incomes') fetchIncomes()
        else if (type === 'vencimientos') fetchVencimientos()
        fetchSummary()
      } else {
        alert("Error al actualizar el registro")
      }
    } catch(err) {
      alert("Error: " + err.message)
    }
  }

  const totalFixed = fixedExpenses.reduce((acc, curr) => acc + curr.amount, 0)
  const totalVariable = variableExpenses.reduce((acc, curr) => acc + curr.amount, 0)
  const totalManualIncome = manualIncomes.reduce((acc, curr) => acc + curr.amount, 0)

  const exportExpensesToCSV = () => {
    const headers = ["Tipo", "Fecha/Periodo", "Descripción", "Categoría", "Monto"]
    const fixedRows = fixedExpenses.map(e => ["Gasto Fijo", `${selectedMonth}/${selectedYear}`, e.description, e.category, e.amount])
    const variableRows = variableExpenses.map(e => ["Gasto Variable", e.date, e.description, e.category, e.amount])
    const rows = [...fixedRows, ...variableRows]
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `gastos_${selectedMonth}_${selectedYear}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const exportIncomesToCSV = () => {
    const headers = ["Tipo", "Fecha", "Descripción", "Categoría", "Monto"]
    const rows = manualIncomes.map(e => ["Ingreso Manual", e.date, e.description, e.category, e.amount])
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `ingresos_${selectedMonth}_${selectedYear}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div>
      {/* Header section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Finanzas</h1>
          <p className="page-subtitle" style={{ margin: '5px 0 0 0' }}>Gestiona tus ingresos, egresos y el balance mensual de tu negocio.</p>
        </div>
        
        {/* Global Month & Year Selector + Sync Button */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button 
            type="button"
            className="btn btn-secondary" 
            onClick={handleSyncMp}
            disabled={syncMpLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', fontSize: '0.85rem', fontWeight: 600, backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid #3b82f6' }}
          >
            <RefreshCw className={syncMpLoading ? 'animate-spin' : ''} size={16} />
            {syncMpLoading ? 'Sincronizando...' : '🔄 Sincronizar Gastos / Compras MP'}
          </button>

          <div style={{ display: 'flex', gap: 10, backgroundColor: 'var(--bg-card)', padding: '10px 15px', borderRadius: 8, border: '1px solid var(--border-color)', alignItems: 'center' }}>
            <Calendar size={18} color="var(--text-secondary)" />
            <span style={{fontWeight: 'bold'}}>Período:</span>
            <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                <option key={m} value={m}>{new Date(2000, m-1, 1).toLocaleString('es-ES', { month: 'long' }).toUpperCase()}</option>
              ))}
            </select>
            <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: 10,
        marginBottom: 25
      }}>
        <button 
          onClick={() => setActiveTab('summary')}
          style={{
            padding: '12px 16px',
            fontWeight: 600,
            fontSize: '0.9rem',
            border: activeTab === 'summary' ? '2px solid #3b82f6' : '1px solid var(--border-color)',
            borderRadius: 8,
            backgroundColor: activeTab === 'summary' ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-card)',
            color: activeTab === 'summary' ? '#3b82f6' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'all 0.2s'
          }}
        >
          <PieChart size={18} /> Resumen General
        </button>
        
        {!isSimpleView && (
        <button 
          onClick={() => setActiveTab('expenses')}
          style={{
            padding: '12px 16px',
            fontWeight: 600,
            fontSize: '0.9rem',
            border: activeTab === 'expenses' ? '2px solid #ef4444' : '1px solid var(--border-color)',
            borderRadius: 8,
            backgroundColor: activeTab === 'expenses' ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-card)',
            color: activeTab === 'expenses' ? '#ef4444' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'all 0.2s'
          }}
        >
          <TrendingDown size={18} /> Gastos (Egresos)
        </button>
        )}
        
        {!isSimpleView && (
        <button 
          onClick={() => setActiveTab('vencimientos')}
          style={{
            padding: '12px 16px',
            fontWeight: 600,
            fontSize: '0.9rem',
            border: activeTab === 'vencimientos' ? '2px solid #f59e0b' : '1px solid var(--border-color)',
            borderRadius: 8,
            backgroundColor: activeTab === 'vencimientos' ? 'rgba(245, 158, 11, 0.1)' : 'var(--bg-card)',
            color: activeTab === 'vencimientos' ? '#f59e0b' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'all 0.2s'
          }}
        >
          <Clock size={18} /> Vencimientos y Servicios
        </button>
        )}

        {!isSimpleView && (
        <button 
          onClick={() => setActiveTab('incomes')}
          style={{
            padding: '12px 16px',
            fontWeight: 600,
            fontSize: '0.9rem',
            border: activeTab === 'incomes' ? '2px solid #10b981' : '1px solid var(--border-color)',
            borderRadius: 8,
            backgroundColor: activeTab === 'incomes' ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-card)',
            color: activeTab === 'incomes' ? '#10b981' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'all 0.2s'
          }}
        >
          <TrendingUp size={18} /> Ingresos
        </button>
        )}
      </div>

      {/* --- TAB: VENCIMIENTOS Y SERVICIOS --- */}
      {activeTab === 'vencimientos' && (() => {
        const overdue = vencimientos.filter(v => v.status === 'overdue')
        const pending = vencimientos.filter(v => v.status === 'pending')
        const paid = vencimientos.filter(v => v.status === 'paid')
        
        const sumOverdue = overdue.reduce((acc, c) => acc + c.amount, 0)
        const sumPending = pending.reduce((acc, c) => acc + c.amount, 0)
        const sumPaid = paid.reduce((acc, c) => acc + c.amount, 0)

        const filtered = vencimientos.filter(v => {
          if (vencimientosFilter === 'overdue') return v.status === 'overdue'
          if (vencimientosFilter === 'pending') return v.status === 'pending'
          if (vencimientosFilter === 'paid') return v.status === 'paid'
          return true
        })

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* WHATSAPP ALERTS TOOLBAR CARD */}
            <div className="card" style={{ backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 15, padding: '14px 20px' }}>
              <div>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#10b981', fontSize: '0.95rem' }}>
                  🔔 Alertas Automáticas por WhatsApp Activas
                </strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  El sistema envía un recordatorio por WhatsApp 3 días antes de cada vencimiento con el link directo para pagar.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input 
                  type="text" 
                  placeholder="WhatsApp ej: 5491123456789" 
                  value={testPhone} 
                  onChange={e => setTestPhone(e.target.value)} 
                  style={{ padding: '6px 12px', fontSize: '0.82rem', width: 210, borderRadius: 6, border: '1px solid var(--border-color)' }}
                />
                <button 
                  type="button" 
                  className="btn" 
                  onClick={handleSendTestAlert}
                  disabled={sendingTestAlert}
                  style={{ padding: '6px 14px', fontSize: '0.82rem', fontWeight: 600, backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                >
                  {sendingTestAlert ? 'Enviando...' : '📱 Probar Alerta WhatsApp'}
                </button>
              </div>
            </div>

            {/* Top KPI Cards for Vencimientos */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
              <div className="card" style={{ borderLeft: '4px solid #ef4444', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>🔴 Vencidos Impagos</span>
                  <AlertTriangle size={18} color="#ef4444" />
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#ef4444' }}>
                  ${Math.round(sumOverdue).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {overdue.length} servicio(s) pasados de fecha
                </div>
              </div>

              <div className="card" style={{ borderLeft: '4px solid #f59e0b', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>🟡 Pendientes este Mes</span>
                  <Clock size={18} color="#f59e0b" />
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#f59e0b' }}>
                  ${Math.round(sumPending).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {pending.length} servicio(s) por vencer
                </div>
              </div>

              <div className="card" style={{ borderLeft: '4px solid #10b981', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>🟢 Pagados este Mes</span>
                  <CheckCircle2 size={18} color="#10b981" />
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#10b981' }}>
                  ${Math.round(sumPaid).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {paid.length} servicio(s) abonados
                </div>
              </div>
            </div>

            {/* FORM CARD TO ADD NEW SERVICE / BILL */}
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Plus size={20} color="#f59e0b" /> Agregar Nuevo Vencimiento de Impuesto / Servicio
              </h3>
              <form onSubmit={handleAddService} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, alignItems: 'end' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Servicio / Impuesto *
                  <input 
                    type="text" 
                    required 
                    placeholder="Ej: Luz Edenor, ARBA, Monotributo" 
                    value={newService.description} 
                    onChange={e => setNewService(prev => ({ ...prev, description: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </label>

                <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Categoría
                  <select 
                    value={newService.category} 
                    onChange={e => setNewService(prev => ({ ...prev, category: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }}
                  >
                    {serviceCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>

                <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Monto $ *
                  <input 
                    type="number" 
                    step="0.01" 
                    required 
                    placeholder="0.00" 
                    value={newService.amount} 
                    onChange={e => setNewService(prev => ({ ...prev, amount: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </label>

                <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Fecha de Vencimiento *
                  <input 
                    type="date" 
                    required 
                    value={newService.due_date} 
                    onChange={e => setNewService(prev => ({ ...prev, due_date: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </label>

                <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Link de Pago (Mercado Pago, PMC, VEP)
                  <input 
                    type="url" 
                    placeholder="https://mpago.la/... o https://..." 
                    value={newService.payment_link} 
                    onChange={e => setNewService(prev => ({ ...prev, payment_link: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </label>

                <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Código de Pago (CPE / VEP / Barcode)
                  <input 
                    type="text" 
                    placeholder="Ej: 0382918392183" 
                    value={newService.payment_code} 
                    onChange={e => setNewService(prev => ({ ...prev, payment_code: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </label>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6 }}>
                  <input 
                    type="checkbox" 
                    id="auto_recurring_check"
                    checked={newService.auto_recurring} 
                    onChange={e => setNewService(prev => ({ ...prev, auto_recurring: e.target.checked }))}
                  />
                  <label htmlFor="auto_recurring_check" style={{ fontSize: '0.82rem', cursor: 'pointer', userSelect: 'none' }}>
                    Repetir todos los meses
                  </label>
                </div>

                <button type="submit" className="btn-primary" style={{ padding: '9px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%' }}>
                  <Plus size={16} /> Guardar Vencimiento
                </button>
              </form>
            </div>

            {/* SERVICES TABLE & FILTERS */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, flexWrap: 'wrap', gap: 10 }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Clock size={20} color="#f59e0b" /> Listado de Vencimientos del Período
                </h3>

                {/* Filter Pills */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button 
                    onClick={() => setVencimientosFilter('all')}
                    style={{
                      padding: '5px 12px', fontSize: '0.8rem', borderRadius: 20, cursor: 'pointer', border: 'none',
                      backgroundColor: vencimientosFilter === 'all' ? 'var(--accent-blue)' : 'var(--bg-hover)',
                      color: vencimientosFilter === 'all' ? '#fff' : 'var(--text-secondary)'
                    }}
                  >
                    Todos ({vencimientos.length})
                  </button>
                  <button 
                    onClick={() => setVencimientosFilter('overdue')}
                    style={{
                      padding: '5px 12px', fontSize: '0.8rem', borderRadius: 20, cursor: 'pointer', border: 'none',
                      backgroundColor: vencimientosFilter === 'overdue' ? '#ef4444' : 'var(--bg-hover)',
                      color: vencimientosFilter === 'overdue' ? '#fff' : 'var(--text-secondary)'
                    }}
                  >
                    🔴 Vencidos ({overdue.length})
                  </button>
                  <button 
                    onClick={() => setVencimientosFilter('pending')}
                    style={{
                      padding: '5px 12px', fontSize: '0.8rem', borderRadius: 20, cursor: 'pointer', border: 'none',
                      backgroundColor: vencimientosFilter === 'pending' ? '#f59e0b' : 'var(--bg-hover)',
                      color: vencimientosFilter === 'pending' ? '#fff' : 'var(--text-secondary)'
                    }}
                  >
                    🟡 Pendientes ({pending.length})
                  </button>
                  <button 
                    onClick={() => setVencimientosFilter('paid')}
                    style={{
                      padding: '5px 12px', fontSize: '0.8rem', borderRadius: 20, cursor: 'pointer', border: 'none',
                      backgroundColor: vencimientosFilter === 'paid' ? '#10b981' : 'var(--bg-hover)',
                      color: vencimientosFilter === 'paid' ? '#fff' : 'var(--text-secondary)'
                    }}
                  >
                    🟢 Pagados ({paid.length})
                  </button>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Estado</th>
                      <th style={{ textAlign: 'left' }}>Servicio / Impuesto</th>
                      <th style={{ textAlign: 'left' }}>Categoría</th>
                      <th style={{ textAlign: 'left' }}>Vencimiento</th>
                      <th style={{ textAlign: 'right' }}>Monto</th>
                      <th style={{ textAlign: 'center' }}>Link / Código de Pago</th>
                      <th style={{ textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '30px 0' }}>
                          No hay vencimientos registrados para este filtro.
                        </td>
                      </tr>
                    )}
                    {filtered.map(item => {
                      const isPaid = item.status === 'paid'
                      const isOverdue = item.status === 'overdue'

                      return (
                        <tr key={item.id} style={{ opacity: isPaid ? 0.75 : 1 }}>
                          <td>
                            {isPaid ? (
                              <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <CheckCircle2 size={13} /> Pagado
                              </span>
                            ) : isOverdue ? (
                              <span className="badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 'bold' }}>
                                <AlertTriangle size={13} /> Vencido
                              </span>
                            ) : (
                              <span className="badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Clock size={13} /> Pendiente
                              </span>
                            )}
                          </td>
                          <td style={{ fontWeight: 600 }}>
                            {item.description}
                            {item.auto_recurring && (
                              <span title="Repetitivo mensual" style={{ marginLeft: 6, fontSize: '0.75rem', opacity: 0.6 }}>🔄</span>
                            )}
                          </td>
                          <td>
                            <span className="badge" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                              {item.category || 'Servicios'}
                            </span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap', fontWeight: isOverdue ? 'bold' : 'normal', color: isOverdue ? '#ef4444' : 'inherit' }}>
                            {item.due_date}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1.05rem', color: isPaid ? '#10b981' : isOverdue ? '#ef4444' : 'var(--text-primary)' }}>
                            ${Math.round(item.amount).toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                              {item.payment_link ? (
                                <a 
                                  href={item.payment_link} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="btn"
                                  style={{
                                    padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600,
                                    backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6',
                                    border: '1px solid #3b82f6', display: 'inline-flex', alignItems: 'center', gap: 4,
                                    borderRadius: 6, textDecoration: 'none'
                                  }}
                                  title="Abrir enlace de pago"
                                >
                                  <ExternalLink size={13} /> Ir a Pagar
                                </a>
                              ) : null}

                              {item.payment_code ? (
                                <button 
                                  type="button"
                                  onClick={() => handleCopyCode(item.payment_code, item.id)}
                                  className="btn"
                                  style={{
                                    padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600,
                                    backgroundColor: copiedCodeId === item.id ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-hover)',
                                    color: copiedCodeId === item.id ? '#10b981' : 'var(--text-primary)',
                                    border: '1px solid var(--border-color)', display: 'inline-flex', alignItems: 'center', gap: 4,
                                    borderRadius: 6
                                  }}
                                  title={`Copiar código: ${item.payment_code}`}
                                >
                                  {copiedCodeId === item.id ? <Check size={13} /> : <Copy size={13} />}
                                  {copiedCodeId === item.id ? 'Copiado!' : 'Código'}
                                </button>
                              ) : null}

                              {!item.payment_link && !item.payment_code && (
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', italic: 'true' }}>-</span>
                              )}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                              {!isPaid ? (
                                <button 
                                  type="button"
                                  onClick={() => handlePayService(item, true)}
                                  className="btn"
                                  style={{
                                    padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600,
                                    backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981',
                                    border: '1px solid #10b981', borderRadius: 6, cursor: 'pointer'
                                  }}
                                  title="Marcar como pagado y registrar en gastos variables"
                                >
                                  ✅ Marcar Pagado
                                </button>
                              ) : (
                                <button 
                                  type="button"
                                  onClick={() => handleUnpayService(item.id)}
                                  className="btn"
                                  style={{
                                    padding: '4px 10px', fontSize: '0.78rem',
                                    backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)',
                                    border: '1px solid var(--border-color)', borderRadius: 6, cursor: 'pointer'
                                  }}
                                  title="Desmarcar pago"
                                >
                                  ↩️ Desmarcar
                                </button>
                              )}

                              <button 
                                className="btn-icon" 
                                onClick={() => setEditModal({ open: true, type: 'vencimientos', item: { ...item } })} 
                                style={{ color: 'var(--accent-blue)' }} 
                                title="Editar"
                              >
                                <Pencil size={16} />
                              </button>

                              <button 
                                className="btn-icon" 
                                onClick={() => handleDeleteService(item.id)} 
                                style={{ color: '#ef4444' }} 
                                title="Eliminar"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      {/* --- TAB 1: RESUMEN GENERAL --- */}
      {activeTab === 'summary' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Top KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {/* Total Incomes Card */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, borderLeft: '4px solid #10b981' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Ingresos del Mes</span>
                <ArrowUpRight size={20} color="#10b981" />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#10b981' }}>
                ${Math.round(summary.total_incomes).toLocaleString()}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Ventas: ${Math.round(summary.total_sales).toLocaleString()} | Extras: ${Math.round(summary.total_manual_incomes).toLocaleString()}
              </div>
            </div>

            {/* Total Expenses Card */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, borderLeft: '4px solid #ef4444' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Gastos del Mes</span>
                <ArrowDownRight size={20} color="#ef4444" />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#ef4444' }}>
                ${Math.round(summary.total_expenses).toLocaleString()}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Fijos: ${Math.round(summary.total_fixed_expenses).toLocaleString()} | Variables: ${Math.round(summary.total_variable_expenses).toLocaleString()}
              </div>
            </div>

            {/* Net Balance Card */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, borderLeft: `4px solid ${summary.net_balance >= 0 ? '#10b981' : '#ef4444'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Balance Neto Mensual</span>
                <span className="badge" style={{ backgroundColor: summary.net_balance >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: summary.net_balance >= 0 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                  {summary.net_balance >= 0 ? 'Superávit' : 'Déficit'}
                </span>
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: summary.net_balance >= 0 ? '#10b981' : '#ef4444' }}>
                ${Math.round(summary.net_balance).toLocaleString()}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Margen Neto: <strong>{summary.margin_pct}%</strong>
              </div>
            </div>
          </div>

          {/* Breakdown Section */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 20, marginTop: 10 }}>
            {/* Incomes Summary Card */}
            <div className="card">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 0, color: '#10b981' }}>
                <TrendingUp size={20} /> Detalle de Entradas
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 15 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span>🛒 Ventas Registradas (Sistema)</span>
                  <strong>${Math.round(summary.total_sales).toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span>➕ Otros Ingresos Manuales</span>
                  <strong>${Math.round(summary.total_manual_incomes).toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontWeight: 'bold', fontSize: '1.05rem' }}>
                  <span>Total Ingresos:</span>
                  <span style={{ color: '#10b981' }}>${Math.round(summary.total_incomes).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Expenses Summary Card */}
            <div className="card">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 0, color: '#ef4444' }}>
                <TrendingDown size={20} /> Detalle de Salidas
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 15 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span>🏢 Gastos Fijos (Sueldos, Alquiler, etc.)</span>
                  <strong>${Math.round(summary.total_fixed_expenses).toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span>📦 Gastos Variables (Insumos, Logística)</span>
                  <strong>${Math.round(summary.total_variable_expenses).toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontWeight: 'bold', fontSize: '1.05rem' }}>
                  <span>Total Gastos:</span>
                  <span style={{ color: '#ef4444' }}>${Math.round(summary.total_expenses).toLocaleString()}</span>
                </div>
                {summary.total_transfers > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', marginTop: 8, backgroundColor: 'rgba(59,130,246,0.05)', borderRadius: 6, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    <span>💸 Transferencias / Pagos Tarjeta MP (no cuentan como gasto)</span>
                    <strong>${Math.round(summary.total_transfers).toLocaleString()}</strong>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CASHFLOW FORECAST CARD */}
          {forecast && (
            <div className="card" style={{ marginTop: 20, borderLeft: '4px solid #3b82f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: '#3b82f6' }}>
                    <TrendingUp size={20} /> Proyección de Flujo de Caja (Cashflow Forecast 30 y 60 Días)
                  </h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                    Estimación predictiva basada en ventas diarias promedio (${Math.round(forecast.avg_daily_sales).toLocaleString()}/día) y gastos agendados.
                  </p>
                </div>

                <span className="badge" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', fontWeight: 'bold' }}>
                  Saldo Actual: ${Math.round(forecast.current_balance).toLocaleString()}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
                {/* Month 1 Forecast Card */}
                <div style={{ backgroundColor: 'var(--bg-hover)', padding: 18, borderRadius: 10, border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '1rem' }}>🔮 Mes +1 ({forecast.month_1.month_name})</strong>
                    <span className="badge" style={{ backgroundColor: forecast.month_1.status === 'healthy' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: forecast.month_1.status === 'healthy' ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                      {forecast.month_1.status === 'healthy' ? '🟢 Liquidez Saludable' : '🔴 Riesgo de Liquidez'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.88rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Ingresos Est. (+Ventas):</span>
                      <span style={{ color: '#10b981', fontWeight: 600 }}>+${Math.round(forecast.month_1.projected_incomes).toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Egresos Est. (-Gastos/Servicios):</span>
                      <span style={{ color: '#ef4444', fontWeight: 600 }}>-${Math.round(forecast.month_1.projected_expenses).toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border-color)', paddingTop: 6, fontWeight: 'bold' }}>
                      <span>Caja Estimada a Fin de Mes:</span>
                      <span style={{ color: forecast.month_1.estimated_ending_balance >= 0 ? '#10b981' : '#ef4444', fontSize: '1.1rem' }}>
                        ${Math.round(forecast.month_1.estimated_ending_balance).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Month 2 Forecast Card */}
                <div style={{ backgroundColor: 'var(--bg-hover)', padding: 18, borderRadius: 10, border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '1rem' }}>🔮 Mes +2 ({forecast.month_2.month_name})</strong>
                    <span className="badge" style={{ backgroundColor: forecast.month_2.status === 'healthy' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: forecast.month_2.status === 'healthy' ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                      {forecast.month_2.status === 'healthy' ? '🟢 Liquidez Saludable' : '🔴 Riesgo de Liquidez'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.88rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Ingresos Est. (+Ventas):</span>
                      <span style={{ color: '#10b981', fontWeight: 600 }}>+${Math.round(forecast.month_2.projected_incomes).toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Egresos Est. (-Gastos/Servicios):</span>
                      <span style={{ color: '#ef4444', fontWeight: 600 }}>-${Math.round(forecast.month_2.projected_expenses).toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border-color)', paddingTop: 6, fontWeight: 'bold' }}>
                      <span>Caja Estimada a Fin de Mes:</span>
                      <span style={{ color: forecast.month_2.estimated_ending_balance >= 0 ? '#10b981' : '#ef4444', fontSize: '1.1rem' }}>
                        ${Math.round(forecast.month_2.estimated_ending_balance).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- TAB 2: GASTOS (EGRESOS) --- */}
      {activeTab === 'expenses' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 15 }}>
            <button 
              className="btn" 
              onClick={exportExpensesToCSV}
              style={{ padding: '6px 14px', fontSize: '0.85rem', backgroundColor: 'var(--bg-dark)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
            >
              Exportar Gastos a CSV
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', alignItems: 'start' }}>
            {/* FIXED EXPENSES CARD */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
                  <Wallet size={20} color="var(--accent-blue)" /> 
                  Gastos Fijos
                </h3>
                <button 
                  className="btn" 
                  onClick={handleCopyPreviousFixed}
                  style={{ padding: '5px 12px', fontSize: '0.8rem', backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}
                  title="Traer gastos fijos del mes anterior"
                >
                  <RefreshCw size={14} /> Traer gastos fijos del mes anterior
                </button>
              </div>
              <p className="page-subtitle" style={{fontSize: '0.85rem', marginBottom: 20}}>
                Gastos recurrentes para el mes. Se heredan automáticamente del mes anterior si el mes está vacío.
              </p>

              <form onSubmit={handleAddFixed} style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                <input 
                  type="text" 
                  placeholder="Descripción" 
                  value={newFixed.description}
                  onChange={e => setNewFixed({...newFixed, description: e.target.value})}
                  style={{ flex: 2, minWidth: 150 }}
                  required
                />
                <input 
                  type="number" 
                  placeholder="Monto $" 
                  value={newFixed.amount}
                  onChange={e => setNewFixed({...newFixed, amount: e.target.value})}
                  style={{ flex: 1, minWidth: 100 }}
                  step="0.01"
                  required
                />
                <select 
                  value={newFixed.category}
                  onChange={e => setNewFixed({...newFixed, category: e.target.value})}
                  style={{ flex: 1.5, minWidth: 120 }}
                >
                  {fixedCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="submit" className="btn-primary" style={{ padding: '0 15px' }} title="Agregar al mes">
                  <Plus size={18} />
                </button>
              </form>

              {loading ? <p>Cargando...</p> : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{textAlign: 'left'}}>Descripción</th>
                        <th style={{textAlign: 'left'}}>Categoría</th>
                        <th style={{textAlign: 'right'}}>Monto</th>
                        <th style={{textAlign: 'center'}}>Pagado</th>
                        <th style={{textAlign: 'center', width: 50}}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {fixedExpenses.length === 0 && <tr><td colSpan="4" style={{textAlign: 'center', color: 'var(--text-secondary)'}}>No hay gastos fijos para este mes.</td></tr>}
                      {fixedExpenses.map(exp => (
                        <tr key={exp.id}>
                          <td>{exp.description}</td>
                          <td><span className="badge" style={{backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)'}}>{exp.category}</span></td>
                          <td style={{textAlign: 'right', fontWeight: 'bold'}}>${Math.round(exp.amount).toLocaleString()}</td>
                          <td style={{textAlign: 'center'}}>
                            <input 
                              type="checkbox" 
                              checked={exp.is_paid || false} 
                              onChange={() => handleTogglePaidFixed(exp)}
                              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent-blue)' }}
                              title="Marcar como pagado"
                            />
                          </td>
                          <td style={{textAlign: 'center', whiteSpace: 'nowrap'}}>
                            <button className="btn-icon" onClick={() => setEditModal({ open: true, type: 'fixed', item: { ...exp } })} style={{color: 'var(--accent-blue)', marginRight: 6}} title="Editar">
                              <Pencil size={16} />
                            </button>
                            <button className="btn-icon" onClick={() => handleDeleteFixed(exp.id)} style={{color: '#ef4444'}} title="Eliminar">
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="2" style={{textAlign: 'right', fontWeight: 'bold', paddingTop: 15}}>Total Mensual Fijo:</td>
                        <td style={{textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem', color: '#ef4444', paddingTop: 15}}>${Math.round(totalFixed).toLocaleString()}</td>
                        <td colSpan="2"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* VARIABLE EXPENSES CARD */}
            <div className="card">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 0 }}>
                <TrendingDown size={20} color="#ef4444" /> 
                Gastos Variables
              </h3>
              <p className="page-subtitle" style={{fontSize: '0.85rem', marginBottom: 20}}>
                Gastos puntuales para este mes (insumos, envíos, reparaciones).
              </p>

              <form onSubmit={handleAddVariable} style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                <input 
                  type="date" 
                  value={newVariable.date}
                  onChange={e => setNewVariable({...newVariable, date: e.target.value})}
                  style={{ width: 130 }}
                  required
                />
                <input 
                  type="text" 
                  placeholder="Descripción" 
                  value={newVariable.description}
                  onChange={e => setNewVariable({...newVariable, description: e.target.value})}
                  style={{ flex: 2, minWidth: 120 }}
                  required
                />
                <input 
                  type="number" 
                  placeholder="Monto $" 
                  value={newVariable.amount}
                  onChange={e => setNewVariable({...newVariable, amount: e.target.value})}
                  style={{ width: 100 }}
                  step="0.01"
                  required
                />
                <select 
                  value={newVariable.category}
                  onChange={e => setNewVariable({...newVariable, category: e.target.value})}
                  style={{ flex: 1, minWidth: 100 }}
                >
                  {variableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="submit" className="btn-primary" style={{ padding: '0 15px' }} title="Agregar">
                  <Plus size={18} />
                </button>
              </form>

              {loading ? <p>Cargando...</p> : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{textAlign: 'left'}}>Fecha</th>
                        <th style={{textAlign: 'left'}}>Descripción</th>
                        <th style={{textAlign: 'left'}}>Categoría</th>
                        <th style={{textAlign: 'right'}}>Monto</th>
                        <th style={{textAlign: 'center', width: 50}}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {variableExpenses.length === 0 && <tr><td colSpan="5" style={{textAlign: 'center', color: 'var(--text-secondary)'}}>No hay gastos variables para este mes.</td></tr>}
                      {variableExpenses.map(exp => (
                        <tr key={exp.id}>
                          <td style={{whiteSpace: 'nowrap'}}>{exp.date}</td>
                          <td>{exp.description}</td>
                          <td><span className="badge" style={{backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)'}}>{exp.category}</span></td>
                          <td style={{textAlign: 'right', fontWeight: 'bold'}}>${Math.round(exp.amount).toLocaleString()}</td>
                          <td style={{textAlign: 'center', whiteSpace: 'nowrap'}}>
                            <button className="btn-icon" onClick={() => setEditModal({ open: true, type: 'variable', item: { ...exp } })} style={{color: 'var(--accent-blue)', marginRight: 6}} title="Editar">
                              <Pencil size={16} />
                            </button>
                            <button className="btn-icon" onClick={() => handleDeleteVariable(exp.id)} style={{color: '#ef4444'}} title="Eliminar">
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="3" style={{textAlign: 'right', fontWeight: 'bold', paddingTop: 15}}>Total Variables del Mes:</td>
                        <td style={{textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem', color: '#ef4444', paddingTop: 15}}>${Math.round(totalVariable).toLocaleString()}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 3: INGRESOS --- */}
      {activeTab === 'incomes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Automatic Sales Banner */}
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid #10b981', flexWrap: 'wrap', gap: 15 }}>
            <div>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                <TrendingUp size={20} color="#10b981" /> 
                Ingresos por Ventas Registradas (Sistema)
              </h3>
              <p className="page-subtitle" style={{ margin: '5px 0 0 0', fontSize: '0.85rem' }}>
                Suma total de ventas confirmadas en MercadoPago y Tienda durante este mes.
              </p>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#10b981' }}>
              ${Math.round(summary.total_sales).toLocaleString()}
            </div>
          </div>

          {/* Automatic Sales Breakdown List Card */}
          {(() => {
            const salesIdCounts = {}
            salesList.forEach(s => {
              const idStr = String(s.order_id)
              salesIdCounts[idStr] = (salesIdCounts[idStr] || 0) + 1
            })
            const duplicateSalesIds = Object.keys(salesIdCounts).filter(id => salesIdCounts[id] > 1)

            const filteredSalesList = salesList.filter(s => {
              if (!salesSearch.trim()) return true
              const q = salesSearch.toLowerCase()
              return String(s.order_id).toLowerCase().includes(q) ||
                     (s.buyer_name || '').toLowerCase().includes(q) ||
                     (s.buyer_nickname || '').toLowerCase().includes(q) ||
                     (s.source_platform || '').toLowerCase().includes(q) ||
                     (s.payment_method || '').toLowerCase().includes(q) ||
                     String(s.total_amount).includes(q)
            })

            return (
              <div className="card" style={{ padding: '15px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)' }}>
                      📋 Detalle de Ventas Registradas ({salesList.length})
                    </h4>
                    {duplicateSalesIds.length === 0 ? (
                      <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '4px 10px', borderRadius: 20, fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle2 size={14} /> Sin duplicados detectados ({salesList.length} registros)
                      </span>
                    ) : (
                      <span className="badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '4px 10px', borderRadius: 20, fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <AlertTriangle size={14} /> ⚠️ {duplicateSalesIds.length} orden(es) con posibles duplicados
                      </span>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ position: 'relative' }}>
                      <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input 
                        type="text" 
                        placeholder="Buscar por ID, cliente, plataforma..." 
                        value={salesSearch}
                        onChange={e => setSalesSearch(e.target.value)}
                        style={{ paddingLeft: 30, fontSize: '0.82rem', height: 32, width: 220 }}
                      />
                    </div>
                    <button 
                      className="btn" 
                      onClick={() => setShowSalesDetails(!showSalesDetails)}
                      style={{ padding: '4px 12px', fontSize: '0.82rem', backgroundColor: 'var(--bg-dark)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      {showSalesDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {showSalesDetails ? 'Ocultar Lista' : 'Ver Lista'}
                    </button>
                  </div>
                </div>

                {showSalesDetails && (
                  <div style={{ marginTop: 15 }}>
                    {filteredSalesList.length === 0 ? (
                      <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        No se encontraron ventas registradas para el período seleccionado.
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                          <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--card-bg)', zIndex: 1 }}>
                            <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                              <th style={{ padding: '8px 10px' }}>Fecha</th>
                              <th style={{ padding: '8px 10px' }}>ID Venta / Cobro</th>
                              <th style={{ padding: '8px 10px' }}>Origen / Plataforma</th>
                              <th style={{ padding: '8px 10px' }}>Medio de Pago</th>
                              <th style={{ padding: '8px 10px' }}>Cliente / Payer</th>
                              <th style={{ padding: '8px 10px' }}>Estado</th>
                              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Monto Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredSalesList.map((s, idx) => {
                              const isDup = salesIdCounts[String(s.order_id)] > 1
                              return (
                                <tr key={s.order_id + '-' + idx} style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: isDup ? 'rgba(239, 68, 68, 0.08)' : 'transparent' }}>
                                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{s.date_created || '-'}</td>
                                  <td style={{ padding: '8px 10px', fontWeight: 'bold', color: isDup ? '#ef4444' : 'var(--text-main)' }}>
                                    #{s.order_id} {isDup && <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>(Duplicado)</span>}
                                  </td>
                                  <td style={{ padding: '8px 10px' }}>
                                    <span className="badge" style={{ backgroundColor: 'var(--bg-dark)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border-color)', fontSize: '0.78rem' }}>
                                      {s.source_platform || 'MERCADOPAGO'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{s.payment_method || '-'}</td>
                                  <td style={{ padding: '8px 10px' }}>{s.buyer_name || s.buyer_nickname || 'Cliente MP'}</td>
                                  <td style={{ padding: '8px 10px' }}>
                                    <span style={{ color: '#10b981', fontWeight: 500 }}>{s.status || 'approved'}</span>
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: '#10b981' }}>
                                    ${s.total_amount?.toLocaleString()}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ borderTop: '2px solid var(--border-color)', fontWeight: 'bold' }}>
                              <td colSpan={6} style={{ padding: '10px' }}>Total ({filteredSalesList.length} de {salesList.length} registros)</td>
                              <td style={{ padding: '10px', textAlign: 'right', color: '#10b981', fontSize: '1rem' }}>
                                ${filteredSalesList.reduce((acc, curr) => acc + (curr.total_amount || 0), 0).toLocaleString()}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Manual Extra Incomes Card */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Plus size={20} color="#10b981" /> 
                  Otros Ingresos Manuales
                </h3>
                <p className="page-subtitle" style={{ margin: '5px 0 0 0', fontSize: '0.85rem' }}>
                  Registra ingresos extraordinarios (inversiones, aportes de socios, cobros especiales).
                </p>
              </div>
              <button 
                className="btn" 
                onClick={exportIncomesToCSV}
                style={{ padding: '6px 14px', fontSize: '0.85rem', backgroundColor: 'var(--bg-dark)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
              >
                Exportar Ingresos a CSV
              </button>
            </div>

            {/* Income Add Form */}
            <form onSubmit={handleAddIncome} style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <input 
                type="date" 
                value={newIncome.date}
                onChange={e => setNewIncome({...newIncome, date: e.target.value})}
                style={{ width: 130 }}
                required
              />
              <input 
                type="text" 
                placeholder="Descripción del ingreso" 
                value={newIncome.description}
                onChange={e => setNewIncome({...newIncome, description: e.target.value})}
                style={{ flex: 2, minWidth: 150 }}
                required
              />
              <input 
                type="number" 
                placeholder="Monto $" 
                value={newIncome.amount}
                onChange={e => setNewIncome({...newIncome, amount: e.target.value})}
                style={{ width: 120 }}
                step="0.01"
                required
              />
              <select 
                value={newIncome.category}
                onChange={e => setNewIncome({...newIncome, category: e.target.value})}
                style={{ flex: 1, minWidth: 140 }}
              >
                {incomeCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button type="submit" className="btn-primary" style={{ padding: '0 18px', backgroundColor: '#10b981', borderColor: '#10b981' }} title="Agregar Ingreso">
                <Plus size={18} />
              </button>
            </form>

            {loading ? <p>Cargando...</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{textAlign: 'left'}}>Fecha</th>
                      <th style={{textAlign: 'left'}}>Descripción</th>
                      <th style={{textAlign: 'left'}}>Categoría</th>
                      <th style={{textAlign: 'right'}}>Monto</th>
                      <th style={{textAlign: 'center', width: 50}}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {manualIncomes.length === 0 && (
                      <tr><td colSpan="5" style={{textAlign: 'center', color: 'var(--text-secondary)'}}>No hay otros ingresos manuales registrados para este mes.</td></tr>
                    )}
                    {manualIncomes.map(inc => (
                      <tr key={inc.id}>
                        <td style={{whiteSpace: 'nowrap'}}>{inc.date}</td>
                        <td>{inc.description}</td>
                        <td><span className="badge" style={{backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981'}}>{inc.category}</span></td>
                        <td style={{textAlign: 'right', fontWeight: 'bold', color: '#10b981'}}>${Math.round(inc.amount).toLocaleString()}</td>
                        <td style={{textAlign: 'center', whiteSpace: 'nowrap'}}>
                          <button className="btn-icon" onClick={() => setEditModal({ open: true, type: 'incomes', item: { ...inc } })} style={{color: 'var(--accent-blue)', marginRight: 6}} title="Editar">
                            <Pencil size={16} />
                          </button>
                          <button className="btn-icon" onClick={() => handleDeleteIncome(inc.id)} style={{color: '#ef4444'}} title="Eliminar">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="3" style={{textAlign: 'right', fontWeight: 'bold', paddingTop: 15}}>Total Otros Ingresos:</td>
                      <td style={{textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem', color: '#10b981', paddingTop: 15}}>${Math.round(totalManualIncome).toLocaleString()}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      {/* --- EDIT MODAL --- */}
      {editModal.open && editModal.item && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex',
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="card" style={{ width: 450, maxWidth: '90%', padding: 25, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <h3 style={{ marginTop: 0, marginBottom: 20 }}>
              ✏️ Editar {editModal.type === 'fixed' ? 'Gasto Fijo' : editModal.type === 'variable' ? 'Gasto Variable' : 'Ingreso Manual'}
            </h3>
            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              {editModal.type !== 'fixed' && (
                <label style={{ fontSize: '0.85rem' }}>Fecha *
                  <input 
                    type="date" 
                    required 
                    value={editModal.item.date || ''} 
                    onChange={e => setEditModal(prev => ({ ...prev, item: { ...prev.item, date: e.target.value } }))} 
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </label>
              )}
              <label style={{ fontSize: '0.85rem' }}>Descripción *
                <input 
                  type="text" 
                  required 
                  value={editModal.item.description || ''} 
                  onChange={e => setEditModal(prev => ({ ...prev, item: { ...prev.item, description: e.target.value } }))} 
                  style={{ width: '100%', marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: '0.85rem' }}>Monto $ *
                <input 
                  type="number" 
                  step="0.01" 
                  required 
                  value={editModal.item.amount || ''} 
                  onChange={e => setEditModal(prev => ({ ...prev, item: { ...prev.item, amount: e.target.value } }))} 
                  style={{ width: '100%', marginTop: 4 }}
                />
              </label>
              {editModal.type === 'vencimientos' && (
                <>
                  <label style={{ fontSize: '0.85rem' }}>Fecha de Vencimiento *
                    <input 
                      type="date" 
                      required 
                      value={editModal.item.due_date || ''} 
                      onChange={e => setEditModal(prev => ({ ...prev, item: { ...prev.item, due_date: e.target.value } }))} 
                      style={{ width: '100%', marginTop: 4 }}
                    />
                  </label>
                  <label style={{ fontSize: '0.85rem' }}>Link de Pago (Mercado Pago, PMC, VEP)
                    <input 
                      type="url" 
                      placeholder="https://..." 
                      value={editModal.item.payment_link || ''} 
                      onChange={e => setEditModal(prev => ({ ...prev, item: { ...prev.item, payment_link: e.target.value } }))} 
                      style={{ width: '100%', marginTop: 4 }}
                    />
                  </label>
                  <label style={{ fontSize: '0.85rem' }}>Código de Pago (CPE / VEP / Barcode)
                    <input 
                      type="text" 
                      placeholder="12345678..." 
                      value={editModal.item.payment_code || ''} 
                      onChange={e => setEditModal(prev => ({ ...prev, item: { ...prev.item, payment_code: e.target.value } }))} 
                      style={{ width: '100%', marginTop: 4 }}
                    />
                  </label>
                </>
              )}
              <label style={{ fontSize: '0.85rem' }}>Categoría
                <select 
                  value={editModal.item.category || ''} 
                  onChange={e => setEditModal(prev => ({ ...prev, item: { ...prev.item, category: e.target.value } }))} 
                  style={{ width: '100%', marginTop: 4 }}
                >
                  {(editModal.type === 'fixed' ? fixedCategories : editModal.type === 'variable' ? variableCategories : editModal.type === 'vencimientos' ? serviceCategories : incomeCategories).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button 
                  type="button" 
                  className="btn" 
                  onClick={() => setEditModal({ open: false, type: '', item: null })}
                  style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" style={{ padding: '6px 16px' }}>
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
