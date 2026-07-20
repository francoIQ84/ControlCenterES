import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Wallet, Calendar, DollarSign, Tag, TrendingDown } from 'lucide-react'

export default function Expenses() {
  const [fixedExpenses, setFixedExpenses] = useState([])
  const [variableExpenses, setVariableExpenses] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  // Form states
  const [newFixed, setNewFixed] = useState({ description: '', amount: '', category: 'Sueldos' })
  const [newVariable, setNewVariable] = useState({ date: new Date().toISOString().split('T')[0], description: '', amount: '', category: 'Insumos' })
  const [loading, setLoading] = useState(true)

  const fixedCategories = ['Sueldos', 'Alquiler', 'Impuestos', 'Servicios', 'Software/Suscripciones', 'Otros Fijos']
  const variableCategories = ['Insumos', 'Logística', 'Mantenimiento', 'Marketing', 'Otros Variables']

  const fetchFixed = async () => {
    try {
      const res = await fetch(`/api/expenses/fixed?month=${selectedMonth}&year=${selectedYear}`)
      if (res.ok) {
        setFixedExpenses(await res.json())
      }
    } catch (e) {
      console.error(e)
    }
  }

  const fetchVariable = async () => {
    try {
      const res = await fetch(`/api/expenses/variable?month=${selectedMonth}&year=${selectedYear}`)
      if (res.ok) {
        setVariableExpenses(await res.json())
      }
    } catch (e) {
      console.error(e)
    }
  }

  const loadData = async () => {
    setLoading(true)
    await Promise.all([fetchFixed(), fetchVariable()])
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
      }
    } catch (e) {
      alert("Error al guardar gasto variable")
    }
  }

  const handleDeleteFixed = async (id) => {
    if (!confirm("¿Eliminar este gasto fijo?")) return
    try {
      const res = await fetch(`/api/expenses/fixed/${id}`, { method: 'DELETE' })
      if (res.ok) fetchFixed()
    } catch (e) {}
  }

  const handleDeleteVariable = async (id) => {
    if (!confirm("¿Eliminar este gasto variable?")) return
    try {
      const res = await fetch(`/api/expenses/variable/${id}`, { method: 'DELETE' })
      if (res.ok) fetchVariable()
    } catch (e) {}
  }

  const totalFixed = fixedExpenses.reduce((acc, curr) => acc + curr.amount, 0)
  const totalVariable = variableExpenses.reduce((acc, curr) => acc + curr.amount, 0)

  const exportToCSV = () => {
    const headers = ["Tipo Gasto", "Fecha/Periodo", "Descripción", "Categoría", "Monto"];
    const fixedRows = fixedExpenses.map(e => [
      "Fijo",
      `${selectedMonth}/${selectedYear}`,
      e.description,
      e.category,
      e.amount
    ]);
    const variableRows = variableExpenses.map(e => [
      "Variable",
      e.date,
      e.description,
      e.category,
      e.amount
    ]);
    const rows = [...fixedRows, ...variableRows];
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `gastos_${selectedMonth}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Control de Gastos</h1>
          <p className="page-subtitle" style={{ margin: '5px 0 0 0' }}>Gestiona tus egresos. Seleccioná el mes que querés visualizar y rendir.</p>
        </div>
        
        {/* GLOBAL MONTH SELECTOR */}
        <div style={{ display: 'flex', gap: 10, backgroundColor: 'var(--bg-card)', padding: '10px 15px', borderRadius: 8, border: '1px solid var(--border-color)', alignItems: 'center' }}>
          <Calendar size={18} color="var(--text-secondary)" />
          <span style={{fontWeight: 'bold'}}>Período a rendir:</span>
          <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
              <option key={m} value={m}>{new Date(2000, m-1, 1).toLocaleString('es-ES', { month: 'long' }).toUpperCase()}</option>
            ))}
          </select>
          <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button 
            className="btn" 
            onClick={exportToCSV}
            style={{ padding: '6px 12px', fontSize: '0.85rem', marginLeft: 10, backgroundColor: 'var(--bg-dark)', color: 'var(--text-secondary)', border: 'none' }}
          >
            Exportar a CSV
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', alignItems: 'start' }}>
        
        {/* FIXED EXPENSES CARD */}
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 0 }}>
            <Wallet size={20} color="var(--accent-blue)" /> 
            Gastos Fijos
          </h3>
          <p className="page-subtitle" style={{fontSize: '0.85rem', marginBottom: 20}}>
            Estos gastos se asocian al mes seleccionado arriba (ej. Sueldos, Alquiler).
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
                        <button className="btn-icon" onClick={() => handleDeleteFixed(exp.id)} style={{color: 'var(--accent-red)'}}>
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="2" style={{textAlign: 'right', fontWeight: 'bold', paddingTop: 15}}>Total Mensual Fijo:</td>
                    <td style={{textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--accent-red)', paddingTop: 15}}>${Math.round(totalFixed).toLocaleString()}</td>
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
            <TrendingDown size={20} color="var(--accent-red)" /> 
            Gastos Variables
          </h3>
          
          <p className="page-subtitle" style={{fontSize: '0.85rem', marginBottom: 20}}>
            Anota los gastos puntuales para este mes (insumos, envíos, reparaciones). Podés elegir el día exacto.
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
                  {variableExpenses.length === 0 && <tr><td colSpan="5" style={{textAlign: 'center', color: 'var(--text-secondary)'}}>No hay gastos para este mes.</td></tr>}
                  {variableExpenses.map(exp => (
                    <tr key={exp.id}>
                      <td style={{whiteSpace: 'nowrap'}}>{exp.date}</td>
                      <td>{exp.description}</td>
                      <td><span className="badge" style={{backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)'}}>{exp.category}</span></td>
                      <td style={{textAlign: 'right', fontWeight: 'bold'}}>${Math.round(exp.amount).toLocaleString()}</td>
                      <td style={{textAlign: 'center'}}>
                        <button className="btn-icon" onClick={() => handleDeleteVariable(exp.id)} style={{color: 'var(--accent-red)'}}>
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="3" style={{textAlign: 'right', fontWeight: 'bold', paddingTop: 15}}>Total Variables del Mes:</td>
                    <td style={{textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--accent-red)', paddingTop: 15}}>${Math.round(totalVariable).toLocaleString()}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
