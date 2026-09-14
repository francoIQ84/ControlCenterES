import React, { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Zap, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight, Sparkles, ArrowRight, ExternalLink, Image, Video, Truck, FileText, Tag, Type, BarChart3, Shield, Clock, Play, Check, X, Loader2, TrendingUp, AlertCircle, Info } from 'lucide-react'

const AREA_ICONS = {
  title: Type,
  description: FileText,
  photos: Image,
  attributes: Tag,
  shipping: Truck,
  video: Video,
  status: Shield,
}

const AREA_LABELS = {
  title: 'Título',
  description: 'Descripción',
  photos: 'Fotos',
  attributes: 'Ficha Técnica',
  shipping: 'Envío',
  video: 'Video',
  status: 'Estado',
}

function ScoreBadge({ score, size = 'md' }) {
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
  const bg = score >= 75 ? 'rgba(16,185,129,0.12)' : score >= 50 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)'
  const sizes = { sm: { w: 36, h: 36, font: '0.75rem' }, md: { w: 48, h: 48, font: '0.95rem' }, lg: { w: 72, h: 72, font: '1.4rem' } }
  const s = sizes[size] || sizes.md
  const circumference = 2 * Math.PI * 18
  const offset = circumference - (score / 100) * circumference

  return (
    <div style={{ position: 'relative', width: s.w, height: s.h, flexShrink: 0 }}>
      <svg width={s.w} height={s.h} viewBox="0 0 40 40" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="20" cy="20" r="18" fill="none" stroke={bg} strokeWidth="3" />
        <circle cx="20" cy="20" r="18" fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <span style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        fontSize: s.font, fontWeight: 700, color, lineHeight: 1,
      }}>{score}</span>
    </div>
  )
}

function SeverityChip({ severity }) {
  const map = {
    critical: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', icon: XCircle, label: 'Crítico' },
    high: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', icon: AlertTriangle, label: 'Alto' },
    medium: { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6', icon: Info, label: 'Medio' },
    low: { bg: 'rgba(107,114,128,0.12)', color: '#6b7280', icon: AlertCircle, label: 'Bajo' },
  }
  const s = map[severity] || map.low
  const Icon = s.icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
      borderRadius: 12, fontSize: '0.7rem', fontWeight: 600, backgroundColor: s.bg, color: s.color,
    }}>
      <Icon size={11} /> {s.label}
    </span>
  )
}

function AreaScoreBar({ area, score }) {
  const Icon = AREA_ICONS[area] || Tag
  const label = AREA_LABELS[area] || area
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8rem' }}>
      <Icon size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
      <span style={{ minWidth: 85, color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: 'var(--bg-secondary)', overflow: 'hidden' }}>
        <div style={{
          width: `${score}%`, height: '100%', borderRadius: 3, backgroundColor: color,
          transition: 'width 0.6s ease',
        }} />
      </div>
      <span style={{ minWidth: 28, textAlign: 'right', fontWeight: 600, color }}>{score}</span>
    </div>
  )
}


export default function MeliOptimizer() {
  const [loading, setLoading] = useState(false)
  const [auditing, setAuditing] = useState(false)
  const [optimizing, setOptimizing] = useState(null) // ml_id or 'all'
  const [applying, setApplying] = useState(null)
  const [auditData, setAuditData] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [optimizationResult, setOptimizationResult] = useState(null)
  const [notification, setNotification] = useState(null)
  const [filter, setFilter] = useState('all') // all, critical, needs_work, good

  const showNotif = useCallback((msg, type = 'success') => {
    setNotification({ msg, type })
    setTimeout(() => setNotification(null), 4000)
  }, [])

  // Load cached audits on mount
  useEffect(() => {
    loadCachedAudits()
  }, [])

  const loadCachedAudits = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/meli-optimizer/audits/cached')
      if (res.ok) {
        const data = await res.json()
        if (data.results && data.results.length > 0) {
          setAuditData(data)
        }
      }
    } catch (e) {
      console.error('Error loading cached audits:', e)
    }
    setLoading(false)
  }

  const runAudit = async () => {
    setAuditing(true)
    setSelectedItem(null)
    setOptimizationResult(null)
    try {
      const res = await fetch('/api/meli-optimizer/audit')
      if (res.ok) {
        const data = await res.json()
        setAuditData(data)
        showNotif(`Auditoría completada: ${data.total} publicaciones analizadas, score promedio: ${data.avg_score}/100`)
      } else {
        const err = await res.json().catch(() => ({}))
        showNotif(err.detail || 'Error en la auditoría', 'error')
      }
    } catch (e) {
      showNotif('Error de conexión', 'error')
    }
    setAuditing(false)
  }

  const optimizeItem = async (ml_id) => {
    setOptimizing(ml_id)
    try {
      const res = await fetch(`/api/meli-optimizer/optimize/${ml_id}`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setOptimizationResult(data)
        showNotif('Optimización generada por IA exitosamente')
      } else {
        const err = await res.json().catch(() => ({}))
        showNotif(err.detail || 'Error al optimizar', 'error')
      }
    } catch (e) {
      showNotif('Error de conexión', 'error')
    }
    setOptimizing(null)
  }

  const applyOptimization = async (ml_id) => {
    setApplying(ml_id)
    try {
      const body = optimizationResult ? {
        optimized_title: optimizationResult.optimized_title,
        optimized_description: optimizationResult.optimized_description,
        suggested_attributes: optimizationResult.suggested_attributes,
      } : {}
      const res = await fetch(`/api/meli-optimizer/apply/${ml_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          showNotif(`Cambios aplicados: ${data.applied?.join(', ') || 'ninguno'}`)
          setOptimizationResult(prev => prev ? { ...prev, status: 'applied' } : null)
        } else {
          showNotif(`Error: ${data.errors?.join(', ') || 'desconocido'}`, 'error')
        }
      } else {
        const err = await res.json().catch(() => ({}))
        showNotif(err.detail || 'Error al aplicar', 'error')
      }
    } catch (e) {
      showNotif('Error de conexión', 'error')
    }
    setApplying(null)
  }

  const optimizeAll = async () => {
    setOptimizing('all')
    try {
      const res = await fetch('/api/meli-optimizer/optimize-all', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        showNotif(`${data.total_optimized} publicaciones optimizadas con IA`)
      } else {
        showNotif('Error en optimización masiva', 'error')
      }
    } catch (e) {
      showNotif('Error de conexión', 'error')
    }
    setOptimizing(null)
  }

  const results = auditData?.results || []
  const filtered = results.filter(r => {
    if (filter === 'critical') return r.score < 40
    if (filter === 'needs_work') return r.score >= 40 && r.score < 75
    if (filter === 'good') return r.score >= 75
    return true
  })

  const criticalCount = results.filter(r => r.score < 40).length
  const needsWorkCount = results.filter(r => r.score >= 40 && r.score < 75).length
  const goodCount = results.filter(r => r.score >= 75).length

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Notification Toast */}
      {notification && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '12px 20px',
          borderRadius: 12, fontSize: '0.85rem', fontWeight: 600,
          backgroundColor: notification.type === 'error' ? '#fef2f2' : '#f0fdf4',
          color: notification.type === 'error' ? '#dc2626' : '#16a34a',
          border: `1px solid ${notification.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', animation: 'slideIn 0.3s ease',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {notification.type === 'error' ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
          {notification.msg}
        </div>
      )}

      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={24} style={{ color: '#8b5cf6' }} />
            Optimizador IA de Publicaciones
          </h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Audita y optimiza tus publicaciones de Mercado Libre con Inteligencia Artificial para maximizar visibilidad y ventas
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={runAudit} disabled={auditing}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px',
              borderRadius: 10, border: 'none', fontSize: '0.85rem', fontWeight: 600,
              backgroundColor: '#8b5cf6', color: '#fff', cursor: auditing ? 'wait' : 'pointer',
              opacity: auditing ? 0.7 : 1, transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(139,92,246,0.3)',
            }}>
            {auditing ? <Loader2 size={16} className="animate-spin" /> : <BarChart3 size={16} />}
            {auditing ? 'Auditando...' : '🔬 Auditar Publicaciones'}
          </button>
          {results.length > 0 && (
            <button onClick={optimizeAll} disabled={optimizing === 'all'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px',
                borderRadius: 10, border: 'none', fontSize: '0.85rem', fontWeight: 600,
                background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: '#fff',
                cursor: optimizing === 'all' ? 'wait' : 'pointer',
                opacity: optimizing === 'all' ? 0.7 : 1, transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
              }}>
              {optimizing === 'all' ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
              {optimizing === 'all' ? 'Optimizando...' : '⚡ Optimizar Todo con IA'}
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {auditData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div style={{
            padding: '20px', borderRadius: 14, background: 'var(--card-bg)', border: '1px solid var(--border-color)',
            display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <ScoreBadge score={auditData.avg_score} size="lg" />
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Score Promedio</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{auditData.avg_score}/100</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{auditData.total} publicaciones</div>
            </div>
          </div>

          <div onClick={() => setFilter(filter === 'critical' ? 'all' : 'critical')}
            style={{
              padding: '20px', borderRadius: 14, background: filter === 'critical' ? 'rgba(239,68,68,0.08)' : 'var(--card-bg)',
              border: `1px solid ${filter === 'critical' ? 'rgba(239,68,68,0.3)' : 'var(--border-color)'}`,
              cursor: 'pointer', transition: 'all 0.2s',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <XCircle size={18} style={{ color: '#ef4444' }} />
              <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600, textTransform: 'uppercase' }}>Críticas</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#ef4444' }}>{criticalCount}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Score &lt; 40</div>
          </div>

          <div onClick={() => setFilter(filter === 'needs_work' ? 'all' : 'needs_work')}
            style={{
              padding: '20px', borderRadius: 14, background: filter === 'needs_work' ? 'rgba(245,158,11,0.08)' : 'var(--card-bg)',
              border: `1px solid ${filter === 'needs_work' ? 'rgba(245,158,11,0.3)' : 'var(--border-color)'}`,
              cursor: 'pointer', transition: 'all 0.2s',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <AlertTriangle size={18} style={{ color: '#f59e0b' }} />
              <span style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600, textTransform: 'uppercase' }}>A Mejorar</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f59e0b' }}>{needsWorkCount}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Score 40-74</div>
          </div>

          <div onClick={() => setFilter(filter === 'good' ? 'all' : 'good')}
            style={{
              padding: '20px', borderRadius: 14, background: filter === 'good' ? 'rgba(16,185,129,0.08)' : 'var(--card-bg)',
              border: `1px solid ${filter === 'good' ? 'rgba(16,185,129,0.3)' : 'var(--border-color)'}`,
              cursor: 'pointer', transition: 'all 0.2s',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <CheckCircle2 size={18} style={{ color: '#10b981' }} />
              <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600, textTransform: 'uppercase' }}>Buenas</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#10b981' }}>{goodCount}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Score ≥ 75</div>
          </div>
        </div>
      )}

      {/* Main Content: List + Detail Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedItem ? '1fr 1fr' : '1fr', gap: 20 }}>
        {/* Listings Table */}
        <div style={{ borderRadius: 14, background: 'var(--card-bg)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>
              📋 Publicaciones {filter !== 'all' && `(${filter === 'critical' ? 'Críticas' : filter === 'needs_work' ? 'A Mejorar' : 'Buenas'})`}
            </h3>
            {filter !== 'all' && (
              <button onClick={() => setFilter('all')} style={{
                padding: '4px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
                background: 'transparent', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text-secondary)',
              }}>
                Ver todas
              </button>
            )}
          </div>

          {loading && !auditData ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
              <p>Cargando datos...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
              {results.length === 0 ? (
                <>
                  <Sparkles size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                  <p style={{ fontWeight: 600, margin: '0 0 6px' }}>Sin datos de auditoría</p>
                  <p style={{ fontSize: '0.8rem' }}>Hacé clic en "Auditar Publicaciones" para analizar tus publicaciones de Mercado Libre</p>
                </>
              ) : (
                <p>No hay publicaciones con el filtro seleccionado</p>
              )}
            </div>
          ) : (
            <div style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
              {filtered.map((item, idx) => (
                <div key={item.ml_id || idx}
                  onClick={() => { setSelectedItem(item); setOptimizationResult(null) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
                    borderBottom: '1px solid var(--border-color)',
                    cursor: 'pointer', transition: 'background 0.15s',
                    backgroundColor: selectedItem?.ml_id === item.ml_id ? 'rgba(139,92,246,0.06)' : 'transparent',
                  }}
                  onMouseOver={e => { if (selectedItem?.ml_id !== item.ml_id) e.currentTarget.style.backgroundColor = 'rgba(139,92,246,0.03)' }}
                  onMouseOut={e => { if (selectedItem?.ml_id !== item.ml_id) e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <ScoreBadge score={item.score} size="sm" />
                  {item.thumbnail && (
                    <img src={item.thumbnail} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {item.title || item.ml_id}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                      <span>{item.ml_id}</span>
                      {item.issues?.length > 0 && (
                        <span style={{ color: '#ef4444' }}>⚠ {item.issues.length} problemas</span>
                      )}
                      {item.opportunities?.length > 0 && (
                        <span style={{ color: '#f59e0b' }}>💡 {item.opportunities.length} mejoras</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedItem && (
          <div style={{
            borderRadius: 14, background: 'var(--card-bg)', border: '1px solid var(--border-color)',
            overflow: 'hidden', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto',
          }}>
            {/* Detail Header */}
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'linear-gradient(135deg, rgba(139,92,246,0.05) 0%, rgba(59,130,246,0.03) 100%)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <ScoreBadge score={selectedItem.score} size="md" />
                <div>
                  <h3 style={{ margin: '0 0 2px', fontSize: '0.9rem', fontWeight: 700 }}>{selectedItem.title}</h3>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span>{selectedItem.ml_id}</span>
                    {selectedItem.permalink && (
                      <a href={selectedItem.permalink} target="_blank" rel="noopener noreferrer"
                        style={{ color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: 2 }}>
                        Ver en ML <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedItem(null)} style={{
                padding: 4, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)',
              }}>
                <X size={18} />
              </button>
            </div>

            {/* Score Breakdown */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>
                Desglose de Calidad
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedItem.details && Object.entries(selectedItem.details).map(([area, data]) => (
                  <AreaScoreBar key={area} area={area} score={data.score || 0} />
                ))}
              </div>
            </div>

            {/* Issues */}
            {selectedItem.issues?.length > 0 && (
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '0.8rem', fontWeight: 700, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={14} /> Problemas Detectados ({selectedItem.issues.length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedItem.issues.map((issue, i) => (
                    <div key={i} style={{
                      padding: '8px 12px', borderRadius: 8, fontSize: '0.78rem',
                      backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.1)',
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                    }}>
                      <SeverityChip severity={issue.severity} />
                      <span style={{ flex: 1 }}>{issue.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Opportunities */}
            {selectedItem.opportunities?.length > 0 && (
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '0.8rem', fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TrendingUp size={14} /> Oportunidades de Mejora ({selectedItem.opportunities.length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedItem.opportunities.map((opp, i) => (
                    <div key={i} style={{
                      padding: '8px 12px', borderRadius: 8, fontSize: '0.78rem',
                      backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.1)',
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                    }}>
                      <SeverityChip severity={opp.severity} />
                      <span style={{ flex: 1 }}>{opp.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => optimizeItem(selectedItem.ml_id)}
                disabled={optimizing === selectedItem.ml_id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
                  borderRadius: 10, border: 'none', fontSize: '0.82rem', fontWeight: 600,
                  background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff',
                  cursor: optimizing === selectedItem.ml_id ? 'wait' : 'pointer',
                  opacity: optimizing === selectedItem.ml_id ? 0.7 : 1,
                  boxShadow: '0 4px 12px rgba(139,92,246,0.3)',
                }}>
                {optimizing === selectedItem.ml_id ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {optimizing === selectedItem.ml_id ? 'Generando...' : '✨ Optimizar con IA'}
              </button>

              {optimizationResult && optimizationResult.ml_id === selectedItem.ml_id && optimizationResult.status !== 'applied' && (
                <button onClick={() => applyOptimization(selectedItem.ml_id)}
                  disabled={applying === selectedItem.ml_id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
                    borderRadius: 10, border: 'none', fontSize: '0.82rem', fontWeight: 600,
                    backgroundColor: '#10b981', color: '#fff',
                    cursor: applying === selectedItem.ml_id ? 'wait' : 'pointer',
                    opacity: applying === selectedItem.ml_id ? 0.7 : 1,
                    boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                  }}>
                  {applying === selectedItem.ml_id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  {applying === selectedItem.ml_id ? 'Aplicando...' : '🚀 Aplicar Cambios en ML'}
                </button>
              )}
            </div>

            {/* Optimization Result / Diff */}
            {optimizationResult && optimizationResult.ml_id === selectedItem.ml_id && (
              <div style={{ padding: '16px 20px' }}>
                <h4 style={{ margin: '0 0 14px', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={16} style={{ color: '#8b5cf6' }} />
                  Resultado de la Optimización IA
                  {optimizationResult.status === 'applied' && (
                    <span style={{
                      padding: '2px 10px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 600,
                      backgroundColor: 'rgba(16,185,129,0.12)', color: '#10b981',
                    }}>✅ Aplicado</span>
                  )}
                </h4>

                {/* Title Diff */}
                {optimizationResult.optimized_title && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Type size={12} /> TÍTULO
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{
                        padding: '8px 12px', borderRadius: 8, fontSize: '0.8rem',
                        backgroundColor: 'rgba(239,68,68,0.06)', borderLeft: '3px solid #ef4444',
                        textDecoration: optimizationResult.current_title !== optimizationResult.optimized_title ? 'line-through' : 'none',
                        opacity: 0.7,
                      }}>
                        <span style={{ fontSize: '0.65rem', color: '#ef4444', fontWeight: 700 }}>ANTES: </span>
                        {optimizationResult.current_title || selectedItem.title}
                      </div>
                      <div style={{
                        padding: '8px 12px', borderRadius: 8, fontSize: '0.8rem',
                        backgroundColor: 'rgba(16,185,129,0.06)', borderLeft: '3px solid #10b981',
                        fontWeight: 600,
                      }}>
                        <span style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 700 }}>DESPUÉS: </span>
                        {optimizationResult.optimized_title}
                      </div>
                    </div>
                  </div>
                )}

                {/* Description Diff */}
                {optimizationResult.optimized_description && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <FileText size={12} /> DESCRIPCIÓN
                    </div>
                    <div style={{
                      padding: '10px 14px', borderRadius: 8, fontSize: '0.78rem', lineHeight: 1.6,
                      backgroundColor: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.15)',
                      maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap',
                    }}>
                      {optimizationResult.optimized_description}
                    </div>
                  </div>
                )}

                {/* Suggested Attributes */}
                {optimizationResult.suggested_attributes?.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Tag size={12} /> ATRIBUTOS SUGERIDOS
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {optimizationResult.suggested_attributes.map((attr, i) => (
                        <span key={i} style={{
                          padding: '4px 10px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600,
                          backgroundColor: 'rgba(59,130,246,0.08)', color: '#3b82f6',
                          border: '1px solid rgba(59,130,246,0.15)',
                        }}>
                          {attr.id}: {attr.value_name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Manual Suggestions */}
                {optimizationResult.manual_suggestions?.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      💡 SUGERENCIAS ADICIONALES
                    </div>
                    <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {optimizationResult.manual_suggestions.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
