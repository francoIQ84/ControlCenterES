import React, { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, ShoppingBag, AlertTriangle, Eye, Globe } from 'lucide-react'
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
        <div className="card kpi-card" style={{borderLeft: '4px solid var(--accent-amber)'}}>
          <div className="kpi-title">Visitas Mercado Libre <Eye size={18} color="var(--accent-amber)"/></div>
          <div className="kpi-value">{(stats.total_visits_meli || 0).toLocaleString()}</div>
          <div className="kpi-subtitle">Total acumulado en Meli</div>
        </div>
        <div className="card kpi-card" style={{borderLeft: '4px solid var(--accent-cyan)'}}>
          <div className="kpi-title">Visitas Tienda Web <Globe size={18} color="var(--accent-cyan)"/></div>
          <div className="kpi-value">{(stats.total_visits_web || 0).toLocaleString()}</div>
          <div className="kpi-subtitle">Total de visualizaciones web</div>
        </div>
      </div>

      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', alignItems: 'start'}}>
        <div className="card">
          <h3 style={{marginTop: 0, marginBottom: 15}}>Tendencia de Facturación</h3>
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
            <p className="kpi-subtitle" style={{margin: '40px 0', textAlign: 'center'}}>No hay datos suficientes</p>
          )}
        </div>

        <div className="card">
          <h3 style={{marginTop: 0, marginBottom: 15}}>Productos más Vistos</h3>
          {stats.top_products && stats.top_products.length > 0 ? (
            <div style={{overflowX: 'auto'}}>
              <table className="data-table" style={{width: '100%', borderCollapse: 'collapse'}}>
                <thead>
                  <tr style={{borderBottom: '1px solid var(--border-color)'}}>
                    <th style={{textAlign: 'left', padding: '10px 5px'}}>Producto</th>
                    <th style={{textAlign: 'center', padding: '10px 5px'}}>ML</th>
                    <th style={{textAlign: 'center', padding: '10px 5px'}}>Web</th>
                    <th style={{textAlign: 'center', padding: '10px 5px'}}>Total</th>
                    <th style={{textAlign: 'left', padding: '10px 5px', width: '35%'}}>Porcentaje</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.top_products.map((p) => {
                    const total = p.visits_meli + p.visits_web;
                    const meliPct = total > 0 ? (p.visits_meli / total) * 100 : 0;
                    const webPct = total > 0 ? (p.visits_web / total) * 100 : 0;
                    return (
                      <tr key={p.ml_id} style={{borderBottom: '1px solid var(--border-color)'}}>
                        <td style={{padding: '10px 5px'}}>
                          <div style={{fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px'}} title={p.title}>{p.title}</div>
                          <div style={{fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'monospace'}}>{p.ml_id}</div>
                        </td>
                        <td style={{textAlign: 'center', padding: '10px 5px', color: 'var(--accent-amber)', fontWeight: '600', fontSize: '0.85rem'}}>{p.visits_meli.toLocaleString()}</td>
                        <td style={{textAlign: 'center', padding: '10px 5px', color: 'var(--accent-cyan)', fontWeight: '600', fontSize: '0.85rem'}}>{p.visits_web.toLocaleString()}</td>
                        <td style={{textAlign: 'center', padding: '10px 5px', fontWeight: '600', fontSize: '0.85rem'}}>{total.toLocaleString()}</td>
                        <td style={{padding: '10px 5px'}}>
                          <div style={{display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', backgroundColor: 'var(--bg-dark)'}}>
                            <div style={{width: `${meliPct}%`, backgroundColor: 'var(--accent-amber)'}} title={`Mercado Libre: ${meliPct.toFixed(0)}%`}></div>
                            <div style={{width: `${webPct}%`, backgroundColor: 'var(--accent-cyan)'}} title={`Web: ${webPct.toFixed(0)}%`}></div>
                          </div>
                          <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '4px'}}>
                            <span>ML: {meliPct.toFixed(0)}%</span>
                            <span>Web: {webPct.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="kpi-subtitle" style={{margin: '40px 0', textAlign: 'center'}}>No hay datos de visitas disponibles</p>
          )}
        </div>
      </div>
    </div>
  )
}
