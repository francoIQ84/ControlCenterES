import React, { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, ShoppingBag, AlertTriangle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [orders, setOrders] = useState([])

  useEffect(() => {
    fetch('/api/dashboard/metrics')
      .then(res => res.json())
      .then(data => setStats(data))
      
    fetch('/api/sales/')
      .then(res => res.json())
      .then(data => setOrders(data.orders || []))
  }, [])

  if (!stats) return <div>Cargando...</div>

  // Prepare chart data
  const salesByDate = {}
  orders.forEach(o => {
    if(o.status === 'paid') {
      const d = o.date_created.split('T')[0]
      salesByDate[d] = (salesByDate[d] || 0) + o.total_amount
    }
  })
  const chartData = Object.keys(salesByDate).sort().map(d => ({ date: d, amount: salesByDate[d] }))

  return (
    <div>
      <h1 className="page-title">Panel de Control</h1>
      <p className="page-subtitle">Analiza el rendimiento de tus ventas en Mercado Libre, márgenes de ganancia y alertas de inventario.</p>

      <div className="grid-cards">
        <div className="card kpi-card" style={{borderLeft: '4px solid var(--accent-blue)'}}>
          <div className="kpi-title">Facturación Total <DollarSign size={18} color="var(--accent-blue)"/></div>
          <div className="kpi-value">${stats.total_revenue.toLocaleString()}</div>
          <div className="kpi-subtitle">Ordenes aprobadas pagadas</div>
        </div>
        <div className="card kpi-card" style={{borderLeft: '4px solid var(--accent-emerald)'}}>
          <div className="kpi-title">Ganancia Neta Est. <TrendingUp size={18} color="var(--accent-emerald)"/></div>
          <div className="kpi-value">${stats.total_profit.toLocaleString()}</div>
          <div className="kpi-subtitle">Margen Promedio: {stats.profit_margin.toFixed(1)}%</div>
        </div>
        <div className="card kpi-card" style={{borderLeft: '4px solid var(--accent-purple)'}}>
          <div className="kpi-title">Órdenes concretadas <ShoppingBag size={18} color="var(--accent-purple)"/></div>
          <div className="kpi-value">{stats.total_sales}</div>
          <div className="kpi-subtitle">Ventas finalizadas</div>
        </div>
        <div className="card kpi-card" style={{borderLeft: '4px solid var(--accent-red)'}}>
          <div className="kpi-title">Alertas de Stock <AlertTriangle size={18} color="var(--accent-red)"/></div>
          <div className="kpi-value" style={{color: stats.low_stock_count > 0 ? 'var(--accent-red)' : 'inherit'}}>{stats.low_stock_count}</div>
          <div className="kpi-subtitle">Productos con 3 unidades o menos</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{marginTop: 0}}>Tendencia de Facturación</h3>
        {chartData.length > 0 ? (
          <div style={{height: 300, width: '100%'}}>
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <XAxis dataKey="date" stroke="var(--text-secondary)" />
                <YAxis stroke="var(--text-secondary)" />
                <Tooltip contentStyle={{backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)'}} />
                <Bar dataKey="amount" fill="var(--accent-blue)" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="kpi-subtitle">No hay datos suficientes</p>
        )}
      </div>
    </div>
  )
}
