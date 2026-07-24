import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Wallet, Calendar, DollarSign, Tag, TrendingDown, TrendingUp, PieChart, ArrowUpRight, ArrowDownRight, Layers, FileText } from 'lucide-react'

export default function Expenses() {
  const [activeTab, setActiveTab] = useState('summary') // 'summary' | 'expenses' | 'incomes'
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  // Data states
  const [fixedExpenses, setFixedExpenses] = useState([])
  const [variableExpenses, setVariableExpenses] = useState([])
  const [manualIncomes, setManualIncomes] = useState([])
  const [summary, setSummary] = useState({
    total_sales: 0,
    total_manual_incomes: 0,
    total_incomes: 0,
    total_fixed_expenses: 0,
    total_variable_expenses: 0,
    total_expenses: 0,
    net_balance: 0,
    margin_pct: 0
  })
  const [loading, setLoading] = useState(true)

  // Form states
  const [newFixed, setNewFixed] = useState({ description: '', amount: '', category: 'Sueldos' })
  const [newVariable, setNewVariable] = useState({ date: new Date().toISOString().split('T')[0], description: '', amount: '', category: 'Insumos' })
  const [newIncome, setNewIncome] = useState({ date: new Date().toISOString().split('T')[0], description: '', amount: '', category: 'Venta Directa / Extra' })

  const fixedCategories = ['Sueldos', 'Alquiler', 'Impuestos', 'Servicios', 'Software/Suscripciones', 'Otros Fijos']
  const variableCategories = ['Insumos', 'Logística', 'Mantenimiento', 'Marketing', 'Otros Variables']
  const incomeCategories = ['Venta Directa / Extra', 'Aporte de Capital', 'Reembolso', 'Inversión', 'Otros Ingresos']

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

  const loadData = async () => {
    setLoading(true)
    await Promise.all([fetchSummary(), fetchFixed(), fetchVariable(), fetchIncomes()])
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
        
        {/* Global Month & Year Selector */}
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

      {/* Tabs Bar */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--border-color)', marginBottom: 25, flexWrap: 'wrap' }}>
        <button 
          onClick={() => setActiveTab('summary')}
          style={{
            padding: '12px 22px',
            fontWeight: 600,
            fontSize: '0.95rem',
            border: 'none',
            borderBottom: activeTab === 'summary' ? '3px solid #3b82f6' : '3px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'summary' ? '#3b82f6' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.2s'
          }}
        >
          <PieChart size={18} /> Resumen General
        </button>
        
        <button 
          onClick={() => setActiveTab('expenses')}
          style={{
            padding: '12px 22px',
            fontWeight: 600,
            fontSize: '0.95rem',
            border: 'none',
            borderBottom: activeTab === 'expenses' ? '3px solid #ef4444' : '3px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'expenses' ? '#ef4444' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.2s'
          }}
        >
          <TrendingDown size={18} /> Gastos (Egresos)
        </button>
        
        <button 
          onClick={() => setActiveTab('incomes')}
          style={{
            padding: '12px 22px',
            fontWeight: 600,
            fontSize: '0.95rem',
            border: 'none',
            borderBottom: activeTab === 'incomes' ? '3px solid #10b981' : '3px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'incomes' ? '#10b981' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.2s'
          }}
        >
          <TrendingUp size={18} /> Ingresos
        </button>
      </div>

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
              </div>
            </div>
          </div>
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
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 0 }}>
                <Wallet size={20} color="var(--accent-blue)" /> 
                Gastos Fijos
              </h3>
              <p className="page-subtitle" style={{fontSize: '0.85rem', marginBottom: 20}}>
                Gastos recurrentes para el mes (ej. Sueldos, Alquiler, Servicios).
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
                            <button className="btn-icon" onClick={() => handleDeleteFixed(exp.id)} style={{color: '#ef4444'}}>
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
                        <td></td>
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
                          <td style={{textAlign: 'center'}}>
                            <button className="btn-icon" onClick={() => handleDeleteVariable(exp.id)} style={{color: '#ef4444'}}>
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
                        <td style={{textAlign: 'center'}}>
                          <button className="btn-icon" onClick={() => handleDeleteIncome(inc.id)} style={{color: '#ef4444'}}>
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
    </div>
  )
}
