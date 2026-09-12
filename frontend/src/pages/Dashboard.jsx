import React, { useEffect, useState, useMemo } from 'react'
import { 
  DollarSign, TrendingUp, ShoppingBag, AlertTriangle, Eye, Globe, 
  TrendingDown, ChevronDown, ChevronUp, BarChart3, MapPin, 
  ExternalLink 
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useTenant } from '../TenantContext'

// Punto de corte unico para el modo celular del panel. Se resuelve de forma
// sincrona en el primer render para que las secciones ya nazcan plegadas en el
// telefono y no se vea el parpadeo de abrir/cerrar.
const MOBILE_BREAKPOINT = 768
const isMobileViewport = () =>
  typeof window !== 'undefined' && window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(isMobileViewport)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
    const onChange = (e) => setIsMobile(e.matches)
    setIsMobile(mq.matches)
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else mq.addListener(onChange)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange)
      else mq.removeListener(onChange)
    }
  }, [])

  return isMobile
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [orders, setOrders] = useState([])
  const [period, setPeriod] = useState('total')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showAllKpis, setShowAllKpis] = useState(false)
  const { isSimpleView } = useTenant()
  const isMobile = useIsMobile()

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
  }, [])

  if (!stats) return <div style={{ padding: 20 }}>Cargando datos del panel...</div>

  // Prepare chart data with client-side filtering based on selected period
  const now = new Date()
  let dateMin = null
  let dateMax = null

  if (period === 'day') {
    dateMin = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  } else if (period === 'week') {
    dateMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  } else if (period === 'month') {
    dateMin = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  } else if (period === 'year') {
    dateMin = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
  } else if (period === 'custom') {
    if (startDate) dateMin = new Date(startDate + 'T00:00:00')
    if (endDate) dateMax = new Date(endDate + 'T23:59:59')
  }

  const salesByDate = {}
  orders.forEach(o => {
    if (o.status === 'paid') {
      const orderDate = new Date(o.date_created)
      if (dateMin && orderDate < dateMin) return
      if (dateMax && orderDate > dateMax) return
      const d = o.date_created.split('T')[0]
      salesByDate[d] = (salesByDate[d] || 0) + o.total_amount
    }
  })
  const chartData = Object.keys(salesByDate).sort().map(d => ({ date: d, amount: salesByDate[d] }))

  // Los KPI se declaran como datos: en celular mostramos solo los 4 primeros y
  // el resto queda detras de un boton, para que el resumen entre en una pantalla.
  const kpis = [
    {
      key: 'revenue',
      title: 'Facturación',
      icon: DollarSign,
      color: 'var(--accent-blue)',
      value: `$${Math.round(stats.total_revenue || 0).toLocaleString()}`,
      subtitle: 'Órdenes aprobadas pagadas'
    },
    {
      key: 'profit',
      title: 'Ganancia Neta Est.',
      icon: TrendingUp,
      color: 'var(--accent-emerald)',
      value: `$${Math.round(stats.total_profit || 0).toLocaleString()}`,
      subtitle: `Margen Promedio: ${stats.profit_margin?.toFixed(1) || 0}%`
    },
    {
      key: 'sales',
      title: 'Órdenes',
      icon: ShoppingBag,
      color: 'var(--accent-purple)',
      value: `${stats.total_sales || 0}`,
      subtitle: 'Ventas finalizadas'
    },
    {
      key: 'low_stock',
      title: 'Alertas de Stock',
      icon: AlertTriangle,
      color: 'var(--accent-red)',
      value: `${stats.low_stock_count || 0}`,
      valueColor: stats.low_stock_count > 0 ? 'var(--accent-red)' : undefined,
      subtitle: 'Productos en stock crítico'
    },
    {
      key: 'expenses',
      title: 'Gastos Totales',
      icon: TrendingDown,
      color: 'var(--accent-red)',
      value: `$${Math.round(stats.expenses_total || 0).toLocaleString()}`,
      subtitle: `Fijos: $${Math.round(stats.expenses_fixed || 0).toLocaleString()} | Var: $${Math.round(stats.expenses_variable || 0).toLocaleString()}`
    },
    {
      key: 'visits_meli',
      title: 'Visitas Mercado Libre',
      icon: Eye,
      color: 'var(--accent-amber)',
      value: (stats.total_visits_meli || 0).toLocaleString(),
      subtitle: 'Total acumulado en Meli'
    },
    {
      key: 'visits_web',
      title: 'Visitas Tienda Web',
      icon: Globe,
      color: 'var(--accent-cyan)',
      value: (stats.total_visits_web || 0).toLocaleString(),
      subtitle: 'Total de visualizaciones web'
    }
  ]

  const PRIMARY_KPI_COUNT = 4
  const hiddenKpiCount = kpis.length - PRIMARY_KPI_COUNT
  const visibleKpis = (isMobile && !showAllKpis) ? kpis.slice(0, PRIMARY_KPI_COUNT) : kpis

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header & Period Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Panel de Control</h1>
          {/* En celular el subtitulo solo roba altura util: se muestra en desktop */}
          {!isMobile && (
            <p className="page-subtitle" style={{ margin: '4px 0 0 0', fontSize: '0.85rem' }}>
              Analiza el rendimiento de tus ventas en Mercado Libre, ganancias y estadísticas de visitas.
            </p>
          )}
        </div>
        
        {/* Period Selector Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', maxWidth: '100%' }}>
          <div style={{
            display: 'flex',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '3px',
            gap: '3px',
            overflowX: 'auto',
            maxWidth: '100%',
            whiteSpace: 'nowrap',
            WebkitOverflowScrolling: 'touch'
          }}>
            {(isSimpleView ? ['day', 'week', 'month'] : ['day', 'week', 'month', 'year', 'total', 'custom']).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="dashboard-pill"
                style={{
                  borderRadius: '6px',
                  fontWeight: '600',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: period === p ? 'var(--accent-blue)' : 'transparent',
                  color: period === p ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.2s',
                  padding: '4px 10px'
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
              gap: '6px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '4px 8px'
            }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Desde:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  backgroundColor: 'var(--bg-dark)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  padding: '3px 6px',
                  fontSize: '0.75rem',
                  minHeight: '28px'
                }}
              />
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Hasta:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  backgroundColor: 'var(--bg-dark)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  padding: '3px 6px',
                  fontSize: '0.75rem',
                  minHeight: '28px'
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Early Warning Banner: en celular es una sola linea tocable */}
      {stats && (stats.low_stock_count > 0) && isMobile && (
        <a
          href="/inventory"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            padding: '8px 10px',
            marginBottom: '12px',
            textDecoration: 'none'
          }}
        >
          <AlertTriangle size={16} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: 0 }}>
            <strong style={{ color: 'var(--accent-red)' }}>{stats.low_stock_count}</strong> producto(s) en stock crítico
          </span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-red)', flexShrink: 0 }}>Ver ➔</span>
        </a>
      )}

      {stats && (stats.low_stock_count > 0) && !isMobile && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '10px',
          padding: '10px 14px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)' }}>
              Alerta Operativa: Tenés <strong style={{ color: 'var(--accent-red)' }}>{stats.low_stock_count}</strong> producto(s) en stock crítico.
            </span>
          </div>
          <a href="/inventory" style={{
            fontSize: '0.75rem',
            fontWeight: '700',
            color: '#ffffff',
            backgroundColor: 'var(--accent-red)',
            padding: '4px 10px',
            borderRadius: '6px',
            textDecoration: 'none'
          }}>
            Ver Inventario ➔
          </a>
        </div>
      )}

      {/* KPI Grid */}
      <div className="responsive-kpi-grid">
        {visibleKpis.map(kpi => {
          const Icon = kpi.icon
          return (
            <div key={kpi.key} className="card kpi-card" style={{ borderLeft: `4px solid ${kpi.color}` }}>
              <div className="kpi-title">
                <span className="kpi-title-text">{kpi.title}</span>
                <Icon size={16} color={kpi.color} />
              </div>
              <div className="kpi-value" style={kpi.valueColor ? { color: kpi.valueColor } : undefined}>
                {kpi.value}
              </div>
              <div className="kpi-subtitle" title={kpi.subtitle}>{kpi.subtitle}</div>
            </div>
          )
        })}
      </div>

      {/* En celular el resto de los KPI queda detras de un boton */}
      {isMobile && hiddenKpiCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '-6px', marginBottom: '14px' }}>
          <button
            type="button"
            className="dashboard-pill"
            onClick={() => setShowAllKpis(v => !v)}
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              color: 'var(--accent-blue)',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            {showAllKpis ? 'Ver menos métricas' : `+${hiddenKpiCount} métricas más`}
          </button>
        </div>
      )}

      {!isSimpleView && (
        <>
          {/* Row 1: Sales Trend Chart & Top Products Widget */}
          <div className="dashboard-widgets-grid">
            <SalesTrendWidget chartData={chartData} totalRevenue={stats.total_revenue} />
            <TopProductsWidget products={stats.top_products || []} />
          </div>

          {/* Critical Stock Alert List (Collapsible) */}
          {stats.low_stock_products && stats.low_stock_products.length > 0 && (
            <LowStockAlertWidget products={stats.low_stock_products} />
          )}

          {/* Row 2: Web Visits Breakdown (Domains & Countries) */}
          <div className="dashboard-widgets-grid">
            <DomainVisitsWidget visits={stats.visits_by_domain || []} />
            <CountryVisitsWidget visits={stats.visits_by_country || []} />
          </div>
        </>
      )}
    </div>
  )
}

// =============================================================================
// REUSABLE COLLAPSIBLE CARD COMPONENT
// =============================================================================
function DashboardCollapsibleCard({
  title,
  icon: Icon,
  iconColor = 'var(--text-primary)',
  badge = null,
  badgeColor = 'var(--text-secondary)',
  badgeBg = 'var(--bg-dark)',
  defaultOpen = true,
  mobileDefaultOpen = false,
  storageKey = null,
  children,
  extraHeaderActions = null,
  borderColor = 'var(--border-color)',
  style = {}
}) {
  // En celular las secciones arrancan plegadas: la pantalla queda como un indice
  // de features y cada una se despliega a demanda. Si el usuario abre o cierra
  // una seccion, esa preferencia se recuerda entre visitas.
  const [isOpen, setIsOpen] = useState(() => {
    if (storageKey) {
      try {
        const saved = window.localStorage.getItem(`dashSection:${storageKey}`)
        if (saved === '1') return true
        if (saved === '0') return false
      } catch {
        // localStorage puede no estar disponible (modo privado): usamos el default
      }
    }
    return isMobileViewport() ? mobileDefaultOpen : defaultOpen
  })

  const isMobile = useIsMobile()

  const toggleOpen = () => {
    setIsOpen(prev => {
      const next = !prev
      if (storageKey) {
        try {
          window.localStorage.setItem(`dashSection:${storageKey}`, next ? '1' : '0')
        } catch {
          // sin persistencia, el estado vive solo en memoria
        }
      }
      return next
    })
  }

  return (
    <div className="dashboard-collapsible-card" style={{ borderColor, ...style }}>
      <div 
        className={`dashboard-collapsible-header ${isOpen ? 'is-open' : ''}`}
        onClick={toggleOpen}
      >
        <div className="dashboard-collapsible-title-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          {Icon && <Icon size={18} style={{ color: iconColor, flexShrink: 0 }} />}
          <h3 style={{ 
            margin: 0, 
            fontSize: '0.94rem', 
            fontWeight: 600, 
            color: 'var(--text-primary)', 
            whiteSpace: 'nowrap', 
            overflow: 'hidden', 
            textOverflow: 'ellipsis' 
          }}>
            {title}
          </h3>
          {badge !== null && badge !== undefined && (
            <span style={{
              fontSize: '0.72rem',
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: badgeBg,
              color: badgeColor,
              fontWeight: 600,
              flexShrink: 0
            }}>
              {badge}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {/* Con la seccion plegada los botones de accion solo ensanchan el encabezado */}
          {(!isMobile || isOpen) && extraHeaderActions}
          <button
            type="button"
            onClick={toggleOpen}
            className="dashboard-pill"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '2px 4px'
            }}
            title={isOpen ? 'Contraer sección' : 'Desplegar sección'}
          >
            {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>
      {isOpen && (
        <div className="dashboard-collapsible-body">
          {children}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// SALES TREND CHART WIDGET (X-Axis date overlapping fixed)
// =============================================================================
function SalesTrendWidget({ chartData = [], totalRevenue = 0 }) {
  const formatXAxisDate = (dateStr) => {
    if (!dateStr) return ''
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}` // DD/MM
    }
    return dateStr
  }

  return (
    <DashboardCollapsibleCard
      title="Tendencia de Facturación"
      icon={BarChart3}
      iconColor="var(--accent-blue)"
      badge={`$${Math.round(totalRevenue || 0).toLocaleString()}`}
      badgeColor="var(--accent-blue)"
      badgeBg="rgba(59, 130, 246, 0.12)"
      defaultOpen={true}
      mobileDefaultOpen={false}
      storageKey="salesTrend"
    >
      {chartData.length > 0 ? (
        <div style={{ height: 230, width: '100%' }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 8, right: 10, left: -10, bottom: 0 }}>
              <XAxis 
                dataKey="date" 
                stroke="var(--text-secondary)" 
                tickFormatter={formatXAxisDate} 
                minTickGap={28}
                interval="preserveStartEnd"
                tick={{ fontSize: 11 }}
              />
              <YAxis 
                stroke="var(--text-secondary)" 
                tickFormatter={(val) => `$${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                tick={{ fontSize: 11 }}
                width={48}
              />
              <Tooltip 
                formatter={(val) => [`$${Math.round(val).toLocaleString()}`, 'Facturación']}
                labelFormatter={(label) => `Fecha: ${label}`}
                contentStyle={{ 
                  backgroundColor: 'var(--bg-card)', 
                  borderColor: 'var(--border-color)', 
                  color: 'var(--text-primary)', 
                  borderRadius: '8px', 
                  fontSize: '0.8rem',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)' 
                }} 
              />
              <Bar dataKey="amount" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="kpi-subtitle" style={{ margin: '30px 0', textAlign: 'center' }}>No hay datos suficientes</p>
      )}
    </DashboardCollapsibleCard>
  )
}

// =============================================================================
// TOP PRODUCTS WIDGET (Compact rows + Tap-to-expand details)
// =============================================================================
function TopProductsWidget({ products = [] }) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('total') // 'total', 'meli', 'web', 'ratio_web'
  const [sourceFilter, setSourceFilter] = useState('all') // 'all', 'meli_only', 'web_only', 'both'
  const [displayLimit, setDisplayLimit] = useState(5)
  const [expandedIds, setExpandedIds] = useState({})
  const isMobile = useIsMobile()
  // El bloque de busqueda + filtros son dos filas de controles: en celular se
  // muestran solo si el usuario los pide.
  const [showFilters, setShowFilters] = useState(!isMobileViewport())

  const toggleExpand = (id) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const filteredAndSorted = useMemo(() => {
    let list = [...products]

    // 1. Text Search Filter
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter(p => (p.title || '').toLowerCase().includes(q) || (p.ml_id || '').toLowerCase().includes(q))
    }

    // 2. Traffic Source Filter
    if (sourceFilter === 'meli_only') {
      list = list.filter(p => (p.visits_meli || 0) > 0)
    } else if (sourceFilter === 'web_only') {
      list = list.filter(p => (p.visits_web || 0) > 0)
    } else if (sourceFilter === 'both') {
      list = list.filter(p => (p.visits_meli || 0) > 0 && (p.visits_web || 0) > 0)
    }

    // 3. Sort Order
    list.sort((a, b) => {
      const aMeli = a.visits_meli || 0
      const aWeb = a.visits_web || 0
      const aTotal = aMeli + aWeb

      const bMeli = b.visits_meli || 0
      const bWeb = b.visits_web || 0
      const bTotal = bMeli + bWeb

      if (sortBy === 'meli') {
        return bMeli - aMeli || bTotal - aTotal
      } else if (sortBy === 'web') {
        return bWeb - aWeb || bTotal - aTotal
      } else if (sortBy === 'ratio_web') {
        const aRatio = aTotal > 0 ? (aWeb / aTotal) : 0
        const bRatio = bTotal > 0 ? (bWeb / bTotal) : 0
        return bRatio - aRatio || bTotal - aTotal
      } else {
        return bTotal - aTotal
      }
    })

    return list
  }, [products, search, sortBy, sourceFilter])

  const visibleList = filteredAndSorted.slice(0, displayLimit)
  const totalMeliVisits = filteredAndSorted.reduce((sum, p) => sum + (p.visits_meli || 0), 0)
  const totalWebVisits = filteredAndSorted.reduce((sum, p) => sum + (p.visits_web || 0), 0)

  const areAllExpanded = visibleList.length > 0 && visibleList.every(p => expandedIds[p.ml_id])

  const toggleExpandAll = () => {
    if (areAllExpanded) {
      setExpandedIds({})
    } else {
      const newExp = {}
      visibleList.forEach(p => { newExp[p.ml_id] = true })
      setExpandedIds(newExp)
    }
  }

  return (
    <DashboardCollapsibleCard
      title="Productos más Vistos"
      icon={Eye}
      iconColor="var(--accent-amber)"
      badge={`${filteredAndSorted.length} items`}
      badgeColor="var(--accent-amber)"
      badgeBg="rgba(245, 158, 11, 0.12)"
      defaultOpen={true}
      mobileDefaultOpen={false}
      storageKey="topProducts"
      extraHeaderActions={
        visibleList.length > 0 ? (
          <button
            type="button"
            className="dashboard-pill"
            onClick={toggleExpandAll}
            style={{
              backgroundColor: 'var(--bg-dark)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.7rem'
            }}
            title={areAllExpanded ? 'Plegar todos los detalles' : 'Desplegar todos los detalles'}
          >
            {areAllExpanded ? 'Plegar todo' : 'Desplegar todo'}
          </button>
        ) : null
      }
    >
      {/* Search & Filters */}
      {isMobile && (
        <button
          type="button"
          className="dashboard-pill"
          onClick={() => setShowFilters(v => !v)}
          style={{
            width: '100%',
            marginBottom: 8,
            backgroundColor: 'var(--bg-dark)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontWeight: 600,
            justifyContent: 'space-between'
          }}
        >
          <span>Buscar y ordenar</span>
          {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      )}

      <div style={{ display: (!isMobile || showFilters) ? 'flex' : 'none', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {/* Row 1: Search & Channel Filter */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 180px', minWidth: '150px' }}>
            <input 
              type="text" 
              placeholder="Buscar producto o ID..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              style={{
                width: '100%', 
                padding: '6px 28px 6px 10px', 
                fontSize: '0.8rem', 
                backgroundColor: 'var(--bg-dark)', 
                color: 'var(--text-primary)', 
                border: '1px solid var(--border-color)', 
                borderRadius: 6,
                minHeight: '34px'
              }}
            />
            {search && (
              <button 
                type="button" 
                onClick={() => setSearch('')} 
                style={{
                  position: 'absolute', 
                  right: 8, 
                  top: '50%', 
                  transform: 'translateY(-50%)', 
                  background: 'none', 
                  border: 'none', 
                  color: 'var(--text-secondary)', 
                  cursor: 'pointer', 
                  fontSize: '0.85rem',
                  minHeight: 'auto',
                  padding: 2
                }}
              >
                ✕
              </button>
            )}
          </div>

          <div style={{ flex: '0 0 auto' }}>
            <select 
              value={sourceFilter} 
              onChange={e => setSourceFilter(e.target.value)}
              style={{
                padding: '5px 8px', 
                fontSize: '0.76rem', 
                borderRadius: 6, 
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-dark)', 
                color: 'var(--text-primary)', 
                cursor: 'pointer',
                minHeight: '34px'
              }}
            >
              <option value="all">Todos los canales</option>
              <option value="meli_only">Solo visitas ML</option>
              <option value="web_only">Solo visitas Web</option>
              <option value="both">Tráfico Mixto (ML + Web)</option>
            </select>
          </div>
        </div>

        {/* Row 2: Sort Pills and Totals */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          flexWrap: 'wrap',
          backgroundColor: 'var(--bg-dark)',
          padding: '6px 8px',
          borderRadius: 8
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginRight: 2 }}>
              Ordenar:
            </span>
            <button 
              type="button" 
              className="dashboard-pill"
              onClick={() => setSortBy('total')}
              style={{
                border: 'none', cursor: 'pointer', fontWeight: 600,
                backgroundColor: sortBy === 'total' ? 'var(--accent-blue)' : 'var(--bg-card)',
                color: sortBy === 'total' ? '#fff' : 'var(--text-primary)'
              }}
            >
              📊 Total
            </button>
            <button 
              type="button" 
              className="dashboard-pill"
              onClick={() => setSortBy('meli')}
              style={{
                border: 'none', cursor: 'pointer', fontWeight: 600,
                backgroundColor: sortBy === 'meli' ? 'var(--accent-amber)' : 'var(--bg-card)',
                color: sortBy === 'meli' ? '#000' : 'var(--text-primary)'
              }}
            >
              💛 ML
            </button>
            <button 
              type="button" 
              className="dashboard-pill"
              onClick={() => setSortBy('web')}
              style={{
                border: 'none', cursor: 'pointer', fontWeight: 600,
                backgroundColor: sortBy === 'web' ? 'var(--accent-cyan)' : 'var(--bg-card)',
                color: sortBy === 'web' ? '#000' : 'var(--text-primary)'
              }}
            >
              🌐 Web
            </button>
            <button 
              type="button" 
              className="dashboard-pill"
              onClick={() => setSortBy('ratio_web')}
              style={{
                border: 'none', cursor: 'pointer', fontWeight: 600,
                backgroundColor: sortBy === 'ratio_web' ? 'var(--accent-emerald)' : 'var(--bg-card)',
                color: sortBy === 'ratio_web' ? '#fff' : 'var(--text-primary)'
              }}
            >
              ⚖️ % Web
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
            <span>ML: <b style={{ color: 'var(--accent-amber)' }}>{totalMeliVisits.toLocaleString()}</b></span>
            <span>Web: <b style={{ color: 'var(--accent-cyan)' }}>{totalWebVisits.toLocaleString()}</b></span>
          </div>
        </div>
      </div>

      {/* Product List with Expandable Rows */}
      {visibleList.length > 0 ? (
        <div>
          {visibleList.map((p, idx) => {
            const meliVisits = p.visits_meli || 0
            const webVisits = p.visits_web || 0
            const total = meliVisits + webVisits
            const meliPct = total > 0 ? (meliVisits / total) * 100 : 0
            const webPct = total > 0 ? (webVisits / total) * 100 : 0
            const isExpanded = !!expandedIds[p.ml_id]

            return (
              <div 
                key={p.ml_id} 
                className={`dashboard-product-row ${isExpanded ? 'is-expanded' : ''}`}
              >
                {/* Compact Row Header - Click to toggle */}
                <div 
                  className="dashboard-product-summary"
                  onClick={() => toggleExpand(p.ml_id)}
                  title="Toca para desplegar/plegar detalles"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: idx === 0 ? 'var(--accent-amber)' : idx === 1 ? 'var(--text-primary)' : 'var(--text-secondary)',
                      backgroundColor: 'var(--bg-card)',
                      padding: '2px 6px',
                      borderRadius: 4,
                      flexShrink: 0
                    }}>
                      #{idx + 1}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: '0.84rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {p.title}
                      </div>
                      {!isMobile && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          {p.ml_id}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: 'var(--accent-blue)',
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      padding: '2px 8px',
                      borderRadius: 6
                    }}>
                      {total.toLocaleString()} v.
                    </span>
                    <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </span>
                  </div>
                </div>

                {/* Expanded Details Panel (Desplegable) */}
                {isExpanded && (
                  <div className="dashboard-product-details">
                    {isMobile && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'monospace', marginBottom: 8 }}>
                        {p.ml_id}
                      </div>
                    )}
                    {/* Visual proportion bar */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: 3 }}>
                        <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>
                          Mercado Libre: {meliVisits.toLocaleString()} ({meliPct.toFixed(0)}%)
                        </span>
                        <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
                          Tienda Web: {webVisits.toLocaleString()} ({webPct.toFixed(0)}%)
                        </span>
                      </div>
                      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: 'var(--bg-card)' }}>
                        <div style={{ width: `${meliPct}%`, backgroundColor: 'var(--accent-amber)' }} />
                        <div style={{ width: `${webPct}%`, backgroundColor: 'var(--accent-cyan)' }} />
                      </div>
                    </div>

                    {/* Breakdown metrics in 3 mini cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, textAlign: 'center', marginTop: 8 }}>
                      <div style={{ padding: '6px 4px', backgroundColor: 'var(--bg-card)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>ML</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-amber)' }}>{meliVisits.toLocaleString()}</div>
                      </div>
                      <div style={{ padding: '6px 4px', backgroundColor: 'var(--bg-card)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Web</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>{webVisits.toLocaleString()}</div>
                      </div>
                      <div style={{ padding: '6px 4px', backgroundColor: 'var(--bg-card)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Total</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{total.toLocaleString()}</div>
                      </div>
                    </div>

                    {p.ml_id && p.ml_id.startsWith('MLA') && (
                      <div style={{ marginTop: 8, textAlign: 'right' }}>
                        <a
                          href={`https://articulo.mercadolibre.com.ar/${p.ml_id.replace(/^MLA(\d+)/, 'MLA-$1')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: '0.72rem',
                            color: 'var(--accent-blue)',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          Ver en Mercado Libre <ExternalLink size={12} />
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Pagination controls */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 12 }}>
            {filteredAndSorted.length > displayLimit && (
              <button 
                type="button" 
                className="dashboard-pill"
                onClick={() => setDisplayLimit(prev => Math.min(prev + 10, filteredAndSorted.length))}
                style={{
                  backgroundColor: 'var(--bg-dark)', 
                  border: '1px solid var(--border-color)', 
                  color: 'var(--accent-blue)', 
                  cursor: 'pointer'
                }}
              >
                Ver más productos ({filteredAndSorted.length - displayLimit} restantes)
              </button>
            )}

            {displayLimit > 5 && (
              <button 
                type="button" 
                className="dashboard-pill"
                onClick={() => setDisplayLimit(5)}
                style={{
                  backgroundColor: 'var(--bg-dark)', 
                  border: '1px solid var(--border-color)', 
                  color: 'var(--text-secondary)', 
                  cursor: 'pointer'
                }}
              >
                Ver menos (top 5)
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="kpi-subtitle" style={{ margin: '25px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No hay productos que coincidan con la búsqueda o filtro.
        </p>
      )}
    </DashboardCollapsibleCard>
  )
}

// =============================================================================
// DOMAIN VISITS WIDGET (Concise list with visual proportion bars)
// =============================================================================
function DomainVisitsWidget({ visits = [] }) {
  const [displayLimit, setDisplayLimit] = useState(5)
  const isMobile = useIsMobile()
  const totalVisits = useMemo(() => visits.reduce((sum, d) => sum + (d.count || 0), 0), [visits])
  const maxCount = useMemo(() => Math.max(...visits.map(d => d.count || 0), 1), [visits])

  const visibleList = visits.slice(0, displayLimit)

  return (
    <DashboardCollapsibleCard
      title="Visitas por Sitio Web"
      icon={Globe}
      iconColor="var(--accent-cyan)"
      badge={isMobile ? `${totalVisits.toLocaleString()} v.` : `${visits.length} dominios (${totalVisits.toLocaleString()} v.)`}
      badgeColor="var(--accent-cyan)"
      badgeBg="rgba(6, 182, 212, 0.12)"
      defaultOpen={true}
      mobileDefaultOpen={false}
      storageKey="domainVisits"
    >
      {visits.length > 0 ? (
        <div>
          {visibleList.map((d, idx) => {
            const pctOfMax = ((d.count || 0) / maxCount) * 100
            const pctOfTotal = totalVisits > 0 ? (((d.count || 0) / totalVisits) * 100).toFixed(1) : 0
            return (
              <div key={idx} className="dashboard-compact-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, flexShrink: 0 }}>
                      #{idx + 1}
                    </span>
                    <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                      {d.domain}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{pctOfTotal}%</span>
                    <span style={{
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: 'var(--accent-cyan)',
                      backgroundColor: 'rgba(6, 182, 212, 0.1)',
                      padding: '2px 8px',
                      borderRadius: 6
                    }}>
                      {d.count.toLocaleString()}
                    </span>
                  </div>
                </div>
                {/* Visual proportion bar */}
                <div style={{ width: '100%', height: 4, backgroundColor: 'var(--bg-card)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${pctOfMax}%`, height: '100%', backgroundColor: 'var(--accent-cyan)', borderRadius: 2 }} />
                </div>
              </div>
            )
          })}

          {visits.length > 5 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 10 }}>
              {displayLimit < visits.length ? (
                <button
                  type="button"
                  className="dashboard-pill"
                  onClick={() => setDisplayLimit(prev => Math.min(prev + 10, visits.length))}
                  style={{
                    backgroundColor: 'var(--bg-dark)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--accent-cyan)',
                    cursor: 'pointer'
                  }}
                >
                  Ver más ({visits.length - displayLimit} restantes)
                </button>
              ) : (
                <button
                  type="button"
                  className="dashboard-pill"
                  onClick={() => setDisplayLimit(5)}
                  style={{
                    backgroundColor: 'var(--bg-dark)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  Ver menos (top 5)
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="kpi-subtitle" style={{ margin: '25px 0', textAlign: 'center' }}>No hay visitas registradas para este periodo</p>
      )}
    </DashboardCollapsibleCard>
  )
}

// =============================================================================
// COUNTRY VISITS WIDGET (Concise list with visual proportion bars)
// =============================================================================
function CountryVisitsWidget({ visits = [] }) {
  const [displayLimit, setDisplayLimit] = useState(5)
  const isMobile = useIsMobile()
  const totalVisits = useMemo(() => visits.reduce((sum, c) => sum + (c.count || 0), 0), [visits])
  const maxCount = useMemo(() => Math.max(...visits.map(c => c.count || 0), 1), [visits])

  const visibleList = visits.slice(0, displayLimit)

  return (
    <DashboardCollapsibleCard
      title={isMobile ? 'Origen Geográfico' : 'Origen Geográfico (Visitas Web)'}
      icon={MapPin}
      iconColor="var(--accent-blue)"
      badge={isMobile ? `${totalVisits.toLocaleString()} v.` : `${visits.length} países (${totalVisits.toLocaleString()} v.)`}
      badgeColor="var(--accent-blue)"
      badgeBg="rgba(59, 130, 246, 0.12)"
      defaultOpen={true}
      mobileDefaultOpen={false}
      storageKey="countryVisits"
    >
      {visits.length > 0 ? (
        <div>
          {visibleList.map((c, idx) => {
            const pctOfMax = ((c.count || 0) / maxCount) * 100
            const pctOfTotal = totalVisits > 0 ? (((c.count || 0) / totalVisits) * 100).toFixed(1) : 0
            return (
              <div key={idx} className="dashboard-compact-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, flexShrink: 0 }}>
                      #{idx + 1}
                    </span>
                    <span style={{ 
                      fontSize: '0.84rem', 
                      fontWeight: 600, 
                      color: 'var(--text-primary)', 
                      whiteSpace: 'nowrap', 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis' 
                    }}>
                      {c.country}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{pctOfTotal}%</span>
                    <span style={{
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: 'var(--accent-blue)',
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      padding: '2px 8px',
                      borderRadius: 6
                    }}>
                      {c.count.toLocaleString()}
                    </span>
                  </div>
                </div>
                {/* Visual proportion bar */}
                <div style={{ width: '100%', height: 4, backgroundColor: 'var(--bg-card)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${pctOfMax}%`, height: '100%', backgroundColor: 'var(--accent-blue)', borderRadius: 2 }} />
                </div>
              </div>
            )
          })}

          {visits.length > 5 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 10 }}>
              {displayLimit < visits.length ? (
                <button
                  type="button"
                  className="dashboard-pill"
                  onClick={() => setDisplayLimit(prev => Math.min(prev + 10, visits.length))}
                  style={{
                    backgroundColor: 'var(--bg-dark)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--accent-blue)',
                    cursor: 'pointer'
                  }}
                >
                  Ver más ({visits.length - displayLimit} restantes)
                </button>
              ) : (
                <button
                  type="button"
                  className="dashboard-pill"
                  onClick={() => setDisplayLimit(5)}
                  style={{
                    backgroundColor: 'var(--bg-dark)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  Ver menos (top 5)
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="kpi-subtitle" style={{ margin: '25px 0', textAlign: 'center' }}>No hay visitas registradas para este periodo</p>
      )}
    </DashboardCollapsibleCard>
  )
}

// =============================================================================
// LOW STOCK ALERT WIDGET (Collapsible alert card + Compact list)
// =============================================================================
function LowStockAlertWidget({ products = [] }) {
  const [displayLimit, setDisplayLimit] = useState(5)
  const isMobile = useIsMobile()
  if (!products || products.length === 0) return null

  const visibleList = products.slice(0, displayLimit)

  return (
    <div style={{ marginTop: '18px' }}>
      <DashboardCollapsibleCard
        title={isMobile ? 'Stock Crítico' : 'Alerta de Reposición: Stock Crítico'}
        icon={AlertTriangle}
        iconColor="var(--accent-red)"
        badge={`${products.length} productos`}
        badgeColor="var(--accent-red)"
        badgeBg="rgba(239, 68, 68, 0.12)"
        borderColor="rgba(239, 68, 68, 0.35)"
        defaultOpen={true}
        mobileDefaultOpen={false}
        storageKey="lowStock"
        extraHeaderActions={
          <a
            href="/inventory"
            className="dashboard-pill"
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#ffffff',
              backgroundColor: 'var(--accent-red)',
              borderRadius: 6,
              textDecoration: 'none',
              padding: '3px 8px'
            }}
            onClick={e => e.stopPropagation()}
          >
            Inventario ➔
          </a>
        }
      >
        <p className="page-subtitle" style={{ fontSize: '0.8rem', marginTop: 0, marginBottom: 10 }}>
          Los siguientes artículos alcanzaron o están por debajo del límite de stock mínimo definido:
        </p>
        
        <div>
          {visibleList.map((p) => (
            <div key={p.ml_id} className="dashboard-compact-item" style={{ borderLeft: '3px solid var(--accent-red)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ 
                    fontWeight: 600, 
                    fontSize: '0.84rem', 
                    color: 'var(--text-primary)', 
                    whiteSpace: 'nowrap', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis' 
                  }} title={p.title}>
                    {p.title}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'monospace', marginTop: 2 }}>
                    ID: {p.ml_id}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent-red)' }}>
                      Stock: {p.available_quantity}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                      mín: {p.min_stock || 3}
                    </div>
                  </div>
                  <span className="badge" style={{
                    fontSize: '0.68rem',
                    padding: '2px 6px',
                    backgroundColor: p.status === 'active' ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-dark)',
                    color: p.status === 'active' ? 'var(--accent-emerald)' : 'var(--text-secondary)'
                  }}>
                    {p.status}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {products.length > 5 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 10 }}>
              {displayLimit < products.length ? (
                <button
                  type="button"
                  className="dashboard-pill"
                  onClick={() => setDisplayLimit(prev => Math.min(prev + 10, products.length))}
                  style={{
                    backgroundColor: 'var(--bg-dark)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--accent-red)',
                    cursor: 'pointer'
                  }}
                >
                  Ver más ({products.length - displayLimit} restantes)
                </button>
              ) : (
                <button
                  type="button"
                  className="dashboard-pill"
                  onClick={() => setDisplayLimit(5)}
                  style={{
                    backgroundColor: 'var(--bg-dark)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  Ver menos (top 5)
                </button>
              )}
            </div>
          )}
        </div>
      </DashboardCollapsibleCard>
    </div>
  )
}
