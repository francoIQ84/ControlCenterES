import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  RefreshCw, Zap, CheckCircle2, AlertTriangle, XCircle, ChevronDown,
  ChevronRight, Sparkles, ArrowRight, ExternalLink, Image, Video, Truck,
  FileText, Tag, Type, BarChart3, Shield, Clock, Play, Check, X, Loader2,
  TrendingUp, AlertCircle, Info, Search, CheckSquare, Square, SlidersHorizontal,
  Layers, Filter
} from 'lucide-react'

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

function StatusBadge({ status, catalog }) {
  const isAct = !status || status === 'active'
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: '0.68rem',
        fontWeight: 600,
        backgroundColor: isAct ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
        color: isAct ? '#10b981' : '#f59e0b',
        border: `1px solid ${isAct ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`,
        flexShrink: 0,
      }}>
        <span style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: isAct ? '#10b981' : '#f59e0b',
        }} />
        {isAct ? 'Activa' : 'Pausada'}
      </span>
      {catalog && (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 7px',
          borderRadius: 6,
          fontSize: '0.68rem',
          fontWeight: 700,
          backgroundColor: 'rgba(59,130,246,0.12)',
          color: '#3b82f6',
          border: '1px solid rgba(59,130,246,0.25)',
          flexShrink: 0,
        }}>
          📘 Catálogo ML
        </span>
      )}
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
  const [optimizing, setOptimizing] = useState(null) // ml_id or 'batch' or 'all'
  const [applying, setApplying] = useState(null)
  const [auditData, setAuditData] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [optimizationResult, setOptimizationResult] = useState(null)
  const [notification, setNotification] = useState(null)

  // Filters & Search & Selection
  const [filter, setFilter] = useState('all') // all, critical, needs_work, good
  const [statusFilter, setStatusFilter] = useState('all') // all, active, paused
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [showOptimizeModal, setShowOptimizeModal] = useState(false)

  const showNotif = useCallback((msg, type = 'success') => {
    setNotification({ msg, type })
    setTimeout(() => setNotification(null), 4500)
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

  const [refreshingQuality, setRefreshingQuality] = useState(false)

  const refreshItemQuality = async (ml_id) => {
    if (!ml_id) return
    setRefreshingQuality(true)
    try {
      const res = await fetch(`/api/meli-optimizer/audit/${ml_id}`)
      if (res.ok) {
        const updatedAudit = await res.json()
        setSelectedItem(updatedAudit)
        setAuditData(prev => {
          if (!prev || !prev.results) return prev
          const newResults = prev.results.map(r => r.ml_id === ml_id ? updatedAudit : r)
          const scores = newResults.map(r => r.score || 0)
          const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
          return { ...prev, results: newResults, avg_score: avg }
        })
        showNotif(`¡Calidad actualizada!: ${updatedAudit.score}/100`)
      } else {
        showNotif('Error al refrescar calidad', 'error')
      }
    } catch (e) {
      showNotif('Error de conexión', 'error')
    }
    setRefreshingQuality(false)
  }

  const optimizeItem = async (ml_id) => {
    setOptimizing(ml_id)
    try {
      const res = await fetch(`/api/meli-optimizer/optimize/${ml_id}`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setOptimizationResult(data)
        if (data.updated_audit) {
          setSelectedItem(data.updated_audit)
          setAuditData(prev => {
            if (!prev || !prev.results) return prev
            const newResults = prev.results.map(r => r.ml_id === ml_id ? data.updated_audit : r)
            const scores = newResults.map(r => r.score || 0)
            const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
            return { ...prev, results: newResults, avg_score: avg }
          })
        }
        const proj = data.projected_score || data.score_before
        const diff = proj - (data.score_before || 0)
        showNotif(`¡Optimización generada! Calidad proyectada: ${proj}/100${diff > 0 ? ` (+${diff} pts)` : ''}`)
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
          const appliedList = data.applied?.length ? data.applied.join(', ') : 'ficha técnica actualizada'
          showNotif(`¡Cambios aplicados exitosamente! (${appliedList})`)
          setOptimizationResult(prev => prev ? { ...prev, status: 'applied' } : null)
          if (data.updated_audit) {
            setSelectedItem(data.updated_audit)
            setAuditData(prev => {
              if (!prev || !prev.results) return prev
              const updatedResults = prev.results.map(r => r.ml_id === ml_id ? data.updated_audit : r)
              const scores = updatedResults.map(r => r.score || 0)
              const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
              return { ...prev, results: updatedResults, avg_score: avg }
            })
          } else {
            await refreshItemQuality(ml_id)
          }
        } else {
          showNotif(`Error: ${data.errors?.join('; ') || 'No se pudieron aplicar los cambios'}`, 'error')
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

  // Optimized batch action with selectable criteria
  const optimizeBatch = async ({ status = null, ml_ids = null, max_score = 80, desc = '' } = {}) => {
    setOptimizing('batch')
    setShowOptimizeModal(false)
    try {
      const res = await fetch('/api/meli-optimizer/optimize-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ml_ids, max_score })
      })
      if (res.ok) {
        const data = await res.json()
        showNotif(`Optimización finalizada: ${data.total_optimized || 0} publicaciones procesadas con IA`)
        setSelectedIds([])
        await loadCachedAudits()
      } else {
        const err = await res.json().catch(() => ({}))
        showNotif(err.detail || 'Error en optimización masiva', 'error')
      }
    } catch (e) {
      showNotif('Error de conexión', 'error')
    }
    setOptimizing(null)
  }

  // Base list
  const results = auditData?.results || []

  // Global counts for metrics
  const criticalCount = results.filter(r => r.score < 40).length
  const needsWorkCount = results.filter(r => r.score >= 40 && r.score < 75).length
  const goodCount = results.filter(r => r.score >= 75).length

  // Status-based counts
  const activeCount = results.filter(r => (r.status || 'active') === 'active').length
  const pausedCount = results.filter(r => r.status === 'paused').length
  const activeNeedingWork = results.filter(r => (r.status || 'active') === 'active' && r.score < 80).length
  const allNeedingWork = results.filter(r => r.score < 80).length

  // Filtered list based on Score + Status + Search
  const filtered = useMemo(() => {
    return results.filter(r => {
      // 1. Score filter
      if (filter === 'critical' && r.score >= 40) return false
      if (filter === 'needs_work' && (r.score < 40 || r.score >= 75)) return false
      if (filter === 'good' && r.score < 75) return false

      // 2. Status filter
      const itemStatus = r.status || 'active'
      if (statusFilter === 'active' && itemStatus !== 'active') return false
      if (statusFilter === 'paused' && itemStatus !== 'paused') return false

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchTitle = (r.title || '').toLowerCase().includes(q)
        const matchId = (r.ml_id || '').toLowerCase().includes(q)
        if (!matchTitle && !matchId) return false
      }

      return true
    })
  }, [results, filter, statusFilter, searchQuery])

  // Selection handlers
  const toggleSelect = (mlId, e) => {
    e?.stopPropagation()
    setSelectedIds(prev =>
      prev.includes(mlId) ? prev.filter(id => id !== mlId) : [...prev, mlId]
    )
  }

  const toggleSelectAllVisible = () => {
    const visibleIds = filtered.map(item => item.ml_id).filter(Boolean)
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id))
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !visibleIds.includes(id)))
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...visibleIds])))
    }
  }

  const selectOnlyActiveNeedingWork = () => {
    const ids = results
      .filter(r => (r.status || 'active') === 'active' && r.score < 80)
      .map(r => r.ml_id)
      .filter(Boolean)
    setSelectedIds(ids)
    showNotif(`${ids.length} publicaciones activas (< 80) seleccionadas`)
  }

  const visibleIds = filtered.map(item => item.ml_id).filter(Boolean)
  const isAllVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id))

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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={runAudit} disabled={auditing || optimizing}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
              borderRadius: 10, border: 'none', fontSize: '0.85rem', fontWeight: 600,
              backgroundColor: '#8b5cf6', color: '#fff', cursor: auditing ? 'wait' : 'pointer',
              opacity: auditing ? 0.7 : 1, transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(139,92,246,0.3)',
            }}>
            {auditing ? <Loader2 size={16} className="animate-spin" /> : <BarChart3 size={16} />}
            {auditing ? 'Auditando...' : '🔬 Auditar Publicaciones'}
          </button>

          {results.length > 0 && (
            selectedIds.length > 0 ? (
              <button
                onClick={() => optimizeBatch({ ml_ids: selectedIds, desc: 'seleccionadas' })}
                disabled={Boolean(optimizing)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
                  borderRadius: 10, border: 'none', fontSize: '0.85rem', fontWeight: 700,
                  background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: '#fff',
                  cursor: optimizing ? 'wait' : 'pointer',
                  opacity: optimizing ? 0.7 : 1, transition: 'all 0.2s',
                  boxShadow: '0 4px 14px rgba(236,72,153,0.35)',
                }}>
                {optimizing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                {optimizing ? 'Optimizando...' : `⚡ Optimizar Seleccionadas (${selectedIds.length})`}
              </button>
            ) : (
              <button
                onClick={() => setShowOptimizeModal(true)}
                disabled={Boolean(optimizing)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
                  borderRadius: 10, border: 'none', fontSize: '0.85rem', fontWeight: 700,
                  background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: '#fff',
                  cursor: optimizing ? 'wait' : 'pointer',
                  opacity: optimizing ? 0.7 : 1, transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
                }}>
                {optimizing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                {optimizing ? 'Optimizando...' : '⚡ Elegir qué Optimizar con IA'}
              </button>
            )
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

      {/* Action Banner when items are selected */}
      {selectedIds.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          marginBottom: 16,
          backgroundColor: 'rgba(139,92,246,0.08)',
          borderRadius: 12,
          border: '1px solid rgba(139,92,246,0.25)',
          flexWrap: 'wrap',
          gap: 12,
          animation: 'fadeIn 0.2s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              backgroundColor: '#8b5cf6', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <CheckSquare size={16} />
            </div>
            <div>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#8b5cf6' }}>
                {selectedIds.length} {selectedIds.length === 1 ? 'publicación seleccionada' : 'publicaciones seleccionadas'}
              </span>
              <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                para optimización con IA
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setSelectedIds([])}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                fontSize: '0.78rem',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <X size={13} /> Deseleccionar todo
            </button>
            <button
              onClick={() => optimizeBatch({ ml_ids: selectedIds, desc: 'seleccionadas' })}
              disabled={Boolean(optimizing)}
              style={{
                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                color: '#fff',
                border: 'none',
                padding: '7px 16px',
                borderRadius: 8,
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: optimizing ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 10px rgba(139,92,246,0.3)'
              }}
            >
              {optimizing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              {optimizing ? 'Optimizando...' : `Optimizar ${selectedIds.length} seleccionadas`}
            </button>
          </div>
        </div>
      )}

      {/* Main Content: List + Detail Panel */}
      <div className="meli-opt-grid" style={{ display: 'grid', gridTemplateColumns: selectedItem ? '1fr 1fr' : '1fr', gap: 20 }}>
        {/* Listings Table */}
        <div style={{ borderRadius: 14, background: 'var(--card-bg)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          
          {/* Header toolbar with filters and search */}
          <div style={{
            padding: '14px 18px', borderBottom: '1px solid var(--border-color)',
            display: 'flex', flexDirection: 'column', gap: 12
          }}>
            {/* Row 1: Title and Score filter tag */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>
                  📋 Publicaciones ({filtered.length})
                </h3>
                {filter !== 'all' && (
                  <span style={{
                    fontSize: '0.72rem', padding: '2px 8px', borderRadius: 6,
                    backgroundColor: filter === 'critical' ? 'rgba(239,68,68,0.12)' : filter === 'needs_work' ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)',
                    color: filter === 'critical' ? '#ef4444' : filter === 'needs_work' ? '#f59e0b' : '#10b981',
                    fontWeight: 600
                  }}>
                    {filter === 'critical' ? 'Solo Críticas' : filter === 'needs_work' ? 'Solo A Mejorar' : 'Solo Buenas'}
                  </span>
                )}
              </div>

              {/* Status filter pills: Todas, Activas, Pausadas */}
              <div style={{
                display: 'flex',
                background: 'var(--bg-secondary)',
                padding: 3,
                borderRadius: 9,
                border: '1px solid var(--border-color)',
                gap: 2
              }}>
                <button
                  onClick={() => setStatusFilter('all')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 7,
                    border: 'none',
                    fontSize: '0.75rem',
                    fontWeight: statusFilter === 'all' ? 700 : 500,
                    background: statusFilter === 'all' ? 'var(--card-bg)' : 'transparent',
                    color: statusFilter === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    boxShadow: statusFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  Todas ({results.length})
                </button>
                <button
                  onClick={() => setStatusFilter('active')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 7,
                    border: 'none',
                    fontSize: '0.75rem',
                    fontWeight: statusFilter === 'active' ? 700 : 500,
                    background: statusFilter === 'active' ? 'rgba(16,185,129,0.15)' : 'transparent',
                    color: statusFilter === 'active' ? '#10b981' : 'var(--text-secondary)',
                    boxShadow: statusFilter === 'active' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: 'all 0.15s'
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10b981' }} />
                  Activas ({activeCount})
                </button>
                <button
                  onClick={() => setStatusFilter('paused')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 7,
                    border: 'none',
                    fontSize: '0.75rem',
                    fontWeight: statusFilter === 'paused' ? 700 : 500,
                    background: statusFilter === 'paused' ? 'rgba(245,158,11,0.15)' : 'transparent',
                    color: statusFilter === 'paused' ? '#f59e0b' : 'var(--text-secondary)',
                    boxShadow: statusFilter === 'paused' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: 'all 0.15s'
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                  Pausadas ({pausedCount})
                </button>
              </div>
            </div>

            {/* Row 2: Search input and Selection Quick Actions */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Search bar */}
              <div style={{
                position: 'relative',
                flex: '1 1 220px',
                display: 'flex',
                alignItems: 'center'
              }}>
                <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Buscar por título o MLA..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 30px 7px 30px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                    outline: 'none'
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: 8,
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: 2
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Master Select button */}
              <button
                onClick={toggleSelectAllVisible}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: isAllVisibleSelected ? 'rgba(139,92,246,0.12)' : 'var(--bg-secondary)',
                  color: isAllVisibleSelected ? '#8b5cf6' : 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
                title={isAllVisibleSelected ? 'Deseleccionar visibles' : 'Seleccionar todas las visibles'}
              >
                {isAllVisibleSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                {isAllVisibleSelected ? 'Deseleccionar visibles' : 'Marcar visibles'}
              </button>

              {/* Shortcut: select active needing work */}
              <button
                onClick={selectOnlyActiveNeedingWork}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(16,185,129,0.3)',
                  background: 'rgba(16,185,129,0.06)',
                  color: '#10b981',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5
                }}
                title="Selecciona todas las publicaciones activas con score menor a 80"
              >
                <CheckCircle2 size={13} /> Marcar Activas (&lt; 80)
              </button>

              {filter !== 'all' && (
                <button onClick={() => setFilter('all')} style={{
                  padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-color)',
                  background: 'transparent', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text-secondary)',
                }}>
                  Limpiar score
                </button>
              )}
            </div>
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
                <p>No hay publicaciones que coincidan con los filtros seleccionados</p>
              )}
            </div>
          ) : (
            <div style={{ maxHeight: 'calc(100vh - 360px)', overflowY: 'auto' }}>
              {filtered.map((item, idx) => {
                const isSelected = selectedIds.includes(item.ml_id)
                const isPanelActive = selectedItem?.ml_id === item.ml_id
                return (
                  <div key={item.ml_id || idx}
                    onClick={() => { setSelectedItem(item); setOptimizationResult(null) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px',
                      borderBottom: '1px solid var(--border-color)',
                      cursor: 'pointer', transition: 'background 0.15s',
                      backgroundColor: isSelected
                        ? 'rgba(139,92,246,0.09)'
                        : isPanelActive
                        ? 'rgba(139,92,246,0.04)'
                        : 'transparent',
                    }}
                    onMouseOver={e => {
                      if (!isSelected && !isPanelActive) {
                        e.currentTarget.style.backgroundColor = 'rgba(139,92,246,0.025)'
                      }
                    }}
                    onMouseOut={e => {
                      if (!isSelected && !isPanelActive) {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }
                    }}
                  >
                    {/* Multi-select checkbox */}
                    <div
                      onClick={(e) => toggleSelect(item.ml_id, e)}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        border: isSelected ? '2px solid #8b5cf6' : '2px solid var(--border-color)',
                        backgroundColor: isSelected ? '#8b5cf6' : 'var(--bg-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: '#fff',
                        flexShrink: 0,
                        transition: 'all 0.15s ease',
                      }}
                      title={isSelected ? 'Deseleccionar' : 'Seleccionar para optimizar'}
                    >
                      {isSelected && <Check size={14} strokeWidth={3} />}
                    </div>

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
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 3 }}>
                        <StatusBadge status={item.status} catalog={item.catalog_listing} />
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
                )
              })}
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
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <StatusBadge status={selectedItem.status} catalog={selectedItem.catalog_listing} />
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => refreshItemQuality(selectedItem.ml_id)}
                  disabled={refreshingQuality}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                    borderRadius: 8, border: '1px solid var(--border-color)',
                    background: 'var(--card-bg)', color: 'var(--text-primary)',
                    fontSize: '0.74rem', fontWeight: 600, cursor: refreshingQuality ? 'wait' : 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                  }}
                  title="Re-auditar y refrescar calidad de esta publicación desde Mercado Libre"
                >
                  <RefreshCw size={13} className={refreshingQuality ? 'animate-spin' : ''} style={{ color: '#8b5cf6' }} />
                  {refreshingQuality ? 'Refrescando...' : 'Refrescar Calidad'}
                </button>
                <button onClick={() => setSelectedItem(null)} style={{
                  padding: 6, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)',
                }}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Catalog Info Banner */}
            {selectedItem.catalog_listing && (
              <div style={{
                margin: '12px 18px 0',
                padding: '12px 16px',
                borderRadius: 10,
                backgroundColor: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.25)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                fontSize: '0.78rem',
                color: 'var(--text-primary)',
              }}>
                <Info size={18} style={{ color: '#3b82f6', flexShrink: 0, marginTop: 1 }} />
                <div style={{ lineHeight: 1.45 }}>
                  <strong style={{ color: '#3b82f6' }}>Publicación de Catálogo ML:</strong>{' '}
                  El título, fotos y descripción oficiales son fijados por el catálogo de Mercado Libre y no se pueden cambiar por API.
                  Para ganar la <strong>Buy Box</strong> y superar a otros vendedores, la IA optimiza la <strong>Ficha Técnica (atributos)</strong> y condiciones de despacho.
                </div>
              </div>
            )}

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

                {/* Projected Quality Improvement Card */}
                <div style={{
                  marginBottom: 18,
                  padding: '14px 18px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(16,185,129,0.08) 100%)',
                  border: '1px solid rgba(139,92,246,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  flexWrap: 'wrap'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>CALIDAD ACTUAL</div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: selectedItem.score >= 75 ? '#10b981' : selectedItem.score >= 50 ? '#f59e0b' : '#ef4444' }}>
                        {selectedItem.score}/100
                      </div>
                    </div>
                    <ArrowRight size={18} style={{ color: '#8b5cf6' }} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 700 }}>PROYECTADA CON IA</div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981' }}>
                        {optimizationResult.projected_score || Math.min(100, (selectedItem.score || 60) + 20)}/100
                      </div>
                    </div>
                    <div style={{
                      padding: '4px 10px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
                      backgroundColor: 'rgba(16,185,129,0.15)', color: '#10b981'
                    }}>
                      +{Math.max(0, (optimizationResult.projected_score || (selectedItem.score + 20)) - selectedItem.score)} pts
                    </div>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                    {optimizationResult.status === 'applied' ? (
                      <span style={{ color: '#10b981', fontWeight: 700 }}>✅ Cambios aplicados en Mercado Libre</span>
                    ) : (
                      <span>Hacé clic en <strong>"Aplicar Cambios en ML"</strong> para guardar esta calidad</span>
                    )}
                  </div>
                </div>

                {/* Title Diff */}
                {optimizationResult.optimized_title && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Type size={12} /> TÍTULO</span>
                      {selectedItem.catalog_listing ? (
                        <span style={{ fontSize: '0.7rem', color: '#3b82f6', fontWeight: 600 }}>
                          (Fijado por Catálogo ML — no modificable)
                        </span>
                      ) : selectedItem.sold_quantity > 0 ? (
                        <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 600 }}>
                          (Fijo por ML: {selectedItem.sold_quantity} ventas concretadas)
                        </span>
                      ) : null}
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
                {optimizationResult.optimized_description && !selectedItem.catalog_listing && (
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

      {/* Modal: Elegir qué optimizar */}
      {showOptimizeModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: 16,
            animation: 'fadeIn 0.2s ease',
          }}
          onClick={() => setShowOptimizeModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: 16,
              width: '100%',
              maxWidth: 540,
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: 'calc(90vh - 40px)',
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(59,130,246,0.04) 100%)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
                }}>
                  <Zap size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Elegir qué optimizar con IA</h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Seleccioná el grupo de publicaciones que querés optimizar
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowOptimizeModal(false)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--text-secondary)', padding: 6, borderRadius: 8,
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Option 1: Solo Activas con mejoras */}
              <div
                onClick={() => optimizeBatch({ status: 'active', max_score: 80, desc: 'activas con mejoras' })}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  border: '2px solid rgba(16,185,129,0.4)',
                  backgroundColor: 'rgba(16,185,129,0.05)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
                onMouseOver={e => e.currentTarget.style.borderColor = '#10b981'}
                onMouseOut={e => e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)'}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  backgroundColor: 'rgba(16,185,129,0.15)', color: '#10b981',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <CheckCircle2 size={22} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      Solo Activas con mejoras
                    </span>
                    <span style={{
                      fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                      backgroundColor: 'rgba(16,185,129,0.2)', color: '#10b981'
                    }}>
                      ⭐ RECOMENDADO
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 8px', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Optimiza únicamente las publicaciones activas a la venta que tengan margen de mejora en título, descripción o ficha técnica (Score &lt; 80).
                  </p>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#10b981' }}>
                    🎯 {activeNeedingWork} publicaciones encontradas
                  </div>
                </div>
              </div>

              {/* Option 2: Solo Críticas */}
              <div
                onClick={() => optimizeBatch({ max_score: 40, desc: 'críticas' })}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  border: '1px solid rgba(239,68,68,0.25)',
                  backgroundColor: 'rgba(239,68,68,0.03)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
                onMouseOver={e => e.currentTarget.style.borderColor = '#ef4444'}
                onMouseOut={e => e.currentTarget.style.borderColor = 'rgba(239,68,68,0.25)'}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <XCircle size={22} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      Solo Críticas (Score &lt; 40)
                    </span>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#ef4444' }}>
                      {criticalCount} publicaciones
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Prioriza las publicaciones con problemas graves (título incorrecto, sin descripción, penalizadas por ML).
                  </p>
                </div>
              </div>

              {/* Option 3: Solo A Mejorar */}
              <div
                onClick={() => optimizeBatch({ max_score: 75, desc: 'a mejorar' })}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  border: '1px solid rgba(245,158,11,0.25)',
                  backgroundColor: 'rgba(245,158,11,0.03)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
                onMouseOver={e => e.currentTarget.style.borderColor = '#f59e0b'}
                onMouseOut={e => e.currentTarget.style.borderColor = 'rgba(245,158,11,0.25)'}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  backgroundColor: 'rgba(245,158,11,0.12)', color: '#f59e0b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <AlertTriangle size={22} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      Solo "A Mejorar" (Score 40 a 74)
                    </span>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#f59e0b' }}>
                      {needsWorkCount} publicaciones
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Publicaciones en nivel intermedio que pueden alcanzar score 80+ optimizando palabras clave y ficha técnica.
                  </p>
                </div>
              </div>

              {/* Option 4: Todas las mejorables */}
              <div
                onClick={() => optimizeBatch({ max_score: 80, desc: 'todas las mejorables' })}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'rgba(255,255,255,0.02)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
                onMouseOver={e => e.currentTarget.style.borderColor = '#8b5cf6'}
                onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  backgroundColor: 'rgba(139,92,246,0.12)', color: '#8b5cf6',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <Zap size={22} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      Todas las mejorables (Activas + Pausadas)
                    </span>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#8b5cf6' }}>
                      {allNeedingWork} publicaciones
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Optimiza todo el catálogo completo con score menor a 80 sin discriminar si está activo o pausado.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-secondary)',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap'
            }}>
              <span>💡 También podés marcar casillas en la lista para elegir exactamente cuáles optimizar.</span>
              <button
                onClick={() => setShowOptimizeModal(false)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: 'var(--card-bg)',
                  color: 'var(--text-primary)',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cerrar y elegir a mano
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
        @media (max-width: 900px) {
          .meli-opt-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
