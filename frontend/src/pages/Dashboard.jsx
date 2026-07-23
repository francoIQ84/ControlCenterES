import React, { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, ShoppingBag, AlertTriangle, Eye, Globe, TrendingDown } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [orders, setOrders] = useState([])
  const [period, setPeriod] = useState('total')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [mpBalance, setMpBalance] = useState(null)

  useEffect(() => {
    let url = `/api/dashboard/metrics?period=${period}`
    if (period === 'custom' && startDate) url += `&start_date=${startDate}`
    if (period === 'custom' && endDate) url += `&end_date=${endDate}`

    fetch(url)
      .then(res => res.json())
      .then(data => setStats(data))
  }, [period, startDate, endDate])

  useEffect(() => {
    fetch('/api/sales/')
      .then(res => res.json())
      .then(data => setOrders(data.orders || []))

    fetch('/api/mercadopago/balance')
      .then(res => res.ok ? res.json() : null)
      .then(setMpBalance)
      .catch(err => console.error(err))
  }, [])

  if (!stats) return <div>Cargando...</div>

  // Prepare chart data with client-side filtering based on selected period
  const now = new Date();
  let dateMin = null;
  let dateMax = null;

  if (period === 'day') {
    dateMin = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  } else if (period === 'week') {
    dateMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === 'month') {
    dateMin = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (period === 'year') {
    dateMin = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  } else if (period === 'custom') {
    if (startDate) dateMin = new Date(startDate + 'T00:00:00');
    if (endDate) dateMax = new Date(endDate + 'T23:59:59');
  }

  const salesByDate = {}
  orders.forEach(o => {
    if (o.status === 'paid') {
      const orderDate = new Date(o.date_created);
      if (dateMin && orderDate < dateMin) return;
      if (dateMax && orderDate > dateMax) return;
      const d = o.date_created.split('T')[0]
      salesByDate[d] = (salesByDate[d] || 0) + o.total_amount
    }
  })
  const chartData = Object.keys(salesByDate).sort().map(d => ({ date: d, amount: salesByDate[d] }))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Panel de Control</h1>
          <p className="page-subtitle" style={{ margin: '5px 0 0 0' }}>Analiza el rendimiento de tus ventas en Mercado Libre, ganancias y estadísticas de visitas.</p>
        </div>
        
        {/* Period Selector Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '4px',
            gap: '4px'
          }}>
            {['day', 'week', 'month', 'year', 'total', 'custom'].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: period === p ? 'var(--accent-blue)' : 'transparent',
                  color: period === p ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.2s'
                }}
              >
                {p === 'day' && 'Hoy'}
                {p === 'week' && '7 Días'}
                {p === 'month' && 'Mes'}
                {p === 'year' && 'Año'}
                {p === 'total' && 'Histórico'}
                {p === 'custom' && 'Personalizado'}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '4px 10px'
            }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Desde:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  backgroundColor: 'var(--bg-dark)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '0.8rem'
                }}
              />
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Hasta:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  backgroundColor: 'var(--bg-dark)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '0.8rem'
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid-cards">
        <div className="card kpi-card" style={{borderLeft: '4px solid var(--accent-blue)'}}>
          <div className="kpi-title">Facturación Total <DollarSign size={18} color="var(--accent-blue)"/></div>
          <div className="kpi-value">${Math.round(stats.total_revenue || 0).toLocaleString()}</div>
          <div className="kpi-subtitle">Ordenes aprobadas pagadas</div>
        </div>
        <div className="card kpi-card" style={{borderLeft: '4px solid var(--accent-emerald)'}}>
          <div className="kpi-title">Ganancia Neta Est. <TrendingUp size={18} color="var(--accent-emerald)"/></div>
          <div className="kpi-value">${Math.round(stats.total_profit || 0).toLocaleString()}</div>
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
          <div className="kpi-subtitle">Productos en stock crítico/alerta</div>
        </div>
        <div className="card kpi-card" style={{borderLeft: '4px solid var(--accent-red)'}}>
          <div className="kpi-title">Gastos Totales <TrendingDown size={18} color="var(--accent-red)"/></div>
          <div className="kpi-value">${Math.round(stats.expenses_total || 0).toLocaleString()}</div>
          <div className="kpi-subtitle">Fijos: ${Math.round(stats.expenses_fixed || 0).toLocaleString()} | Var: ${Math.round(stats.expenses_variable || 0).toLocaleString()}</div>
        </div>
        <div className="card kpi-card" style={{borderLeft: '4px solid var(--accent-amber)'}}>
          <div className="kpi-title">Visitas Mercado Libre <Eye size={18} color="var(--accent-amber)"/></div>
          <div className="kpi-value">{(stats.total_visits_meli || 0).toLocaleString()}</div>
          <div className="kpi-subtitle">Total acumulado en Meli</div>
        </div>
        <div className="card kpi-card" style={{borderLeft: '4px solid #009ee3'}}>
          <div className="kpi-title" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span>Cobros Mercado Pago</span>
            <a 
              href="https://www.mercadopago.com.ar/summary" 
              target="_blank" 
              rel="noopener noreferrer" 
              style={{fontSize: '0.75rem', color: '#009ee3', textDecoration: 'none', fontWeight: 'bold'}}
              title="Abrir resumen oficial en Mercado Pago"
            >
              Ver en MP ↗
            </a>
          </div>
          <div className="kpi-value">${Math.round(mpBalance?.available_balance || 0).toLocaleString()}</div>
          <div className="kpi-subtitle">
            {mpBalance?.is_calculated ? (
              <span>Facturado (30d) | Hoy: <strong>${Math.round(mpBalance?.today_sales || 0).toLocaleString()}</strong></span>
            ) : (
              <span>Disponible | A liberar: ${Math.round(mpBalance?.unavailable_balance || 0).toLocaleString()}</span>
            )}
          </div>
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
            <div style={{overflowX: 'auto', maxHeight: '350px', overflowY: 'auto'}}>
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
 
      {/* Alert Products List */}
      {stats.low_stock_products && stats.low_stock_products.length > 0 && (
        <div className="card" style={{marginTop: '20px', borderLeft: '4px solid var(--accent-orange)'}}>
          <h3 style={{marginTop: 0, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-orange)'}}>
            <AlertTriangle size={20} />
            Alerta de Reposición: Productos con Stock Crítico
          </h3>
          <p className="page-subtitle" style={{fontSize: '0.85rem', marginBottom: 15}}>
            Los siguientes artículos alcanzaron o están por debajo del límite de stock mínimo definido.
          </p>
          <div style={{overflowX: 'auto'}}>
            <table className="data-table" style={{width: '100%', borderCollapse: 'collapse'}}>
              <thead>
                <tr style={{borderBottom: '1px solid var(--border-color)'}}>
                  <th style={{textAlign: 'left', padding: '10px 5px'}}>Producto</th>
                  <th style={{textAlign: 'left', padding: '10px 5px'}}>ID / SKU</th>
                  <th style={{textAlign: 'center', padding: '10px 5px'}}>Stock Actual</th>
                  <th style={{textAlign: 'center', padding: '10px 5px'}}>Stock Mínimo</th>
                  <th style={{textAlign: 'center', padding: '10px 5px'}}>Estado (ML)</th>
                </tr>
              </thead>
              <tbody>
                {stats.low_stock_products.map((p) => (
                  <tr key={p.ml_id} style={{borderBottom: '1px solid var(--border-color)'}}>
                    <td style={{padding: '10px 5px', fontWeight: 600}}>{p.title}</td>
                    <td style={{padding: '10px 5px', fontFamily: 'monospace', fontSize: '0.8rem'}}>{p.ml_id}</td>
                    <td style={{textAlign: 'center', padding: '10px 5px', color: 'var(--accent-red)', fontWeight: 'bold'}}>{p.available_quantity}</td>
                    <td style={{textAlign: 'center', padding: '10px 5px', color: 'var(--text-secondary)'}}>{p.min_stock || 3}</td>
                    <td style={{textAlign: 'center', padding: '10px 5px'}}>
                      <span className="badge" style={{
                        backgroundColor: p.status === 'active' ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-dark)',
                        color: p.status === 'active' ? 'var(--accent-emerald)' : 'var(--text-secondary)'
                      }}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
 
      {/* Web Visits Breakdown */}
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px', marginTop: '20px', alignItems: 'start'}}>
        {/* Visits by Domain */}
        <div className="card">
          <h3 style={{marginTop: 0, marginBottom: 15}}>Visitas por Sitio Web</h3>
          {stats.visits_by_domain && stats.visits_by_domain.length > 0 ? (
            <div style={{overflowX: 'auto'}}>
              <table className="data-table" style={{width: '100%', borderCollapse: 'collapse'}}>
                <thead>
                  <tr style={{borderBottom: '1px solid var(--border-color)'}}>
                    <th style={{textAlign: 'left', padding: '10px 5px'}}>Dominio</th>
                    <th style={{textAlign: 'right', padding: '10px 5px'}}>Visitas</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.visits_by_domain.map((d, idx) => (
                    <tr key={idx} style={{borderBottom: '1px solid var(--border-color)'}}>
                      <td style={{padding: '10px 5px', fontWeight: 600, fontSize: '0.85rem'}}>{d.domain}</td>
                      <td style={{textAlign: 'right', padding: '10px 5px', fontWeight: 600, color: 'var(--accent-cyan)'}}>{d.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="kpi-subtitle" style={{margin: '40px 0', textAlign: 'center'}}>No hay visitas registradas para este periodo</p>
          )}
        </div>

        {/* Visits by Country */}
        <div className="card">
          <h3 style={{marginTop: 0, marginBottom: 15}}>Origen Geográfico (Visitas Web)</h3>
          {stats.visits_by_country && stats.visits_by_country.length > 0 ? (
            <div style={{overflowX: 'auto'}}>
              <table className="data-table" style={{width: '100%', borderCollapse: 'collapse'}}>
                <thead>
                  <tr style={{borderBottom: '1px solid var(--border-color)'}}>
                    <th style={{textAlign: 'left', padding: '10px 5px'}}>País</th>
                    <th style={{textAlign: 'right', padding: '10px 5px'}}>Visitas</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.visits_by_country.map((c, idx) => (
                    <tr key={idx} style={{borderBottom: '1px solid var(--border-color)'}}>
                      <td style={{padding: '10px 5px', fontWeight: 600, fontSize: '0.85rem'}}>{c.country}</td>
                      <td style={{textAlign: 'right', padding: '10px 5px', fontWeight: 600, color: 'var(--accent-blue)'}}>{c.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="kpi-subtitle" style={{margin: '40px 0', textAlign: 'center'}}>No hay visitas registradas para este periodo</p>
          )}
        </div>
      </div>
    </div>
  )
}
