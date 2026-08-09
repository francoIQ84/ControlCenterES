import React, { useState, useEffect } from 'react'
import {
  MessageSquare, Sparkles, RefreshCw, CheckCircle, Clock, AlertCircle,
  Settings, Play, Send, Search, Filter, HelpCircle, ShieldAlert, Zap, Edit3, X, Eye
} from 'lucide-react'

export default function MeliQuestions() {
  const [questions, setQuestions] = useState([])
  const [stats, setStats] = useState({ total: 0, answered: 0, pending: 0, failed: 0, avg_response_ms: 0 })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  
  // Filter states
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  
  // Settings modal states
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState({ enabled: true, mode: 'auto', prompt_custom: '' })
  const [savingSettings, setSavingSettings] = useState(false)

  // Tester state inside settings modal
  const [testQuestionText, setTestQuestionText] = useState('¿Tienen stock en color negro y hacen envíos a Rosario?')
  const [testItemId, setTestItemId] = useState('MLA1001')
  const [testingAi, setTestingAi] = useState(false)
  const [testResult, setTestResult] = useState(null)

  // Manual editing / answer modal
  const [selectedQuestion, setSelectedQuestion] = useState(null)
  const [manualAnswerText, setManualAnswerText] = useState('')
  const [answering, setAnswering] = useState(false)

  const fetchQuestions = async () => {
    setLoading(true)
    try {
      let url = `/api/meli/questions?limit=50&offset=0`
      if (statusFilter !== 'ALL') url += `&status=${statusFilter}`
      if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`

      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setQuestions(data.questions || [])
        setStats(data.stats || { total: 0, answered: 0, pending: 0, failed: 0, avg_response_ms: 0 })
      }
    } catch (e) {
      console.error("Error cargando preguntas de MeLi:", e)
    } finally {
      setLoading(false)
    }
  }

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/meli/questions/settings')
      if (res.ok) {
        const data = await res.json()
        setSettings(data)
      }
    } catch (e) {
      console.error("Error cargando configuración:", e)
    }
  }

  useEffect(() => {
    fetchQuestions()
    fetchSettings()
  }, [statusFilter])

  const handleSyncNow = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/meli/questions/sync', { method: 'POST' })
      if (res.ok) {
        setTimeout(() => {
          fetchQuestions()
          setSyncing(false)
        }, 2000)
      } else {
        setSyncing(false)
      }
    } catch (e) {
      console.error("Error al sincronizar preguntas:", e)
      setSyncing(false)
    }
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const res = await fetch('/api/meli/questions/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      if (res.ok) {
        alert("Configuración guardada correctamente")
        setShowSettings(false)
      } else {
        alert("Error al guardar la configuración")
      }
    } catch (e) {
      alert("Error de conexión al guardar configuración")
    } finally {
      setSavingSettings(false)
    }
  }

  const handleRunAiTest = async () => {
    if (!testQuestionText.trim()) return
    setTestingAi(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/meli/questions/test-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_text: testQuestionText,
          item_id: testItemId
        })
      })
      if (res.ok) {
        const data = await res.json()
        setTestResult(data)
      }
    } catch (e) {
      console.error("Error ejecutando prueba de IA:", e)
    } finally {
      setTestingAi(false)
    }
  }

  const handleOpenAnswerModal = (q) => {
    setSelectedQuestion(q)
    setManualAnswerText(q.answer_text || '')
  }

  const handleSendAnswer = async () => {
    if (!selectedQuestion || !manualAnswerText.trim()) return
    setAnswering(true)
    try {
      const res = await fetch(`/api/meli/questions/${selectedQuestion.question_id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer_text: manualAnswerText })
      })
      if (res.ok) {
        alert("¡Respuesta enviada a Mercado Libre con éxito!")
        setSelectedQuestion(null)
        fetchQuestions()
      } else {
        const err = await res.json()
        alert(`Error al enviar respuesta: ${err.detail || 'Ocurrió un error'}`)
      }
    } catch (e) {
      alert("Error de conexión al enviar respuesta")
    } finally {
      setAnswering(false)
    }
  }

  const getStatusBadge = (qStatus) => {
    switch (qStatus) {
      case 'ANSWERED_AUTO':
        return (
          <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Sparkles size={12} /> Respondido por Gemini
          </span>
        )
      case 'ANSWERED_MANUAL':
        return (
          <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle size={12} /> Respondido Manual
          </span>
        )
      case 'PENDING_APPROVAL':
        return (
          <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Clock size={12} /> Pendiente de Aprobación
          </span>
        )
      case 'NEEDS_REVIEW':
        return (
          <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ShieldAlert size={12} /> Bloqueado por Guardrail
          </span>
        )
      case 'ERROR':
        return (
          <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <AlertCircle size={12} /> Error al enviar
          </span>
        )
      default:
        return (
          <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, backgroundColor: 'rgba(107, 114, 128, 0.15)', color: '#6b7280' }}>
            {qStatus}
          </span>
        )
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* HEADER PAGE */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <MessageSquare className="text-yellow-500" size={28} />
            Preguntas Mercado Libre (Gemini AI)
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted, #9ca3af)', fontSize: '0.9rem' }}>
            Respuesta autónoma pre-venta en segundos conectada con tu inventario real.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            style={{
              padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border-color, #374151)',
              backgroundColor: 'var(--bg-card, #1f2937)', color: 'var(--text-main, #f3f4f6)',
              cursor: syncing ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem',
              display: 'flex', alignItems: 'center', gap: 8
            }}
          >
            <RefreshCw size={16} className={syncing ? 'spin' : ''} />
            {syncing ? 'Comprobando...' : 'Comprobar Pendientes'}
          </button>

          <button
            onClick={() => setShowSettings(true)}
            style={{
              padding: '9px 16px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#ffffff',
              cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
              display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 12px rgba(245, 158, 11, 0.25)'
            }}
          >
            <Settings size={16} />
            Configurar Auto-Responder
          </button>
        </div>
      </div>

      {/* METRICS METRIC CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ padding: 18, borderRadius: 12, backgroundColor: 'var(--bg-card, #1f2937)', border: '1px solid var(--border-color, #374151)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #9ca3af)', fontWeight: 600, marginBottom: 6 }}>TOTAL PREGUNTAS</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{stats.total || 0}</div>
        </div>

        <div style={{ padding: 18, borderRadius: 12, backgroundColor: 'var(--bg-card, #1f2937)', border: '1px solid var(--border-color, #374151)' }}>
          <div style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} /> RESPONDIDAS POR IA
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981' }}>{stats.answered || 0}</div>
        </div>

        <div style={{ padding: 18, borderRadius: 12, backgroundColor: 'var(--bg-card, #1f2937)', border: '1px solid var(--border-color, #374151)' }}>
          <div style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={14} /> PENDIENTES
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b' }}>{stats.pending || 0}</div>
        </div>

        <div style={{ padding: 18, borderRadius: 12, backgroundColor: 'var(--bg-card, #1f2937)', border: '1px solid var(--border-color, #374151)' }}>
          <div style={{ fontSize: '0.8rem', color: '#3b82f6', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={14} /> TIEMPO PROMEDIO
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#3b82f6' }}>
            {stats.avg_response_ms ? `${(stats.avg_response_ms / 1000).toFixed(1)}s` : 'Instantáneo'}
          </div>
        </div>
      </div>

      {/* SEARCH AND TAB FILTERS */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'var(--bg-card, #1f2937)', borderRadius: 8, padding: '4px 8px', border: '1px solid var(--border-color, #374151)' }}>
          {['ALL', 'ANSWERED_AUTO', 'PENDING_APPROVAL', 'NEEDS_REVIEW', 'ERROR'].map(fKey => (
            <button
              key={fKey}
              onClick={() => setStatusFilter(fKey)}
              style={{
                padding: '6px 14px', borderRadius: 6, border: 'none',
                backgroundColor: statusFilter === fKey ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                color: statusFilter === fKey ? '#f59e0b' : 'var(--text-muted, #9ca3af)',
                fontWeight: statusFilter === fKey ? 700 : 500, fontSize: '0.8rem', cursor: 'pointer'
              }}
            >
              {fKey === 'ALL' && 'Todas'}
              {fKey === 'ANSWERED_AUTO' && 'IA Auto'}
              {fKey === 'PENDING_APPROVAL' && 'Pendientes'}
              {fKey === 'NEEDS_REVIEW' && 'Guardrail'}
              {fKey === 'ERROR' && 'Errores'}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', width: 300 }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            type="text"
            placeholder="Buscar por pregunta, usuario o título..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchQuestions()}
            style={{
              width: '100%', padding: '8px 12px 8px 34px', borderRadius: 8,
              border: '1px solid var(--border-color, #374151)', backgroundColor: 'var(--bg-card, #1f2937)',
              color: 'var(--text-main, #f3f4f6)', fontSize: '0.85rem'
            }}
          />
        </div>
      </div>

      {/* DATA TABLE */}
      <div style={{ backgroundColor: 'var(--bg-card, #1f2937)', borderRadius: 12, border: '1px solid var(--border-color, #374151)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Cargando historial de preguntas...</div>
        ) : questions.length === 0 ? (
          <div style={{ padding: 50, textAlign: 'center' }}>
            <HelpCircle size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <p style={{ margin: 0, fontWeight: 600, fontSize: '1rem' }}>No se encontraron preguntas en el sistema</p>
            <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: '0.85rem' }}>
              Las preguntas nuevas ingresadas en Mercado Libre se registrarán y responderán automáticamente aquí.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color, #374151)', backgroundColor: 'rgba(0,0,0,0.15)', color: '#9ca3af' }}>
                  <th style={{ padding: '12px 16px' }}>Publicación / Comprador</th>
                  <th style={{ padding: '12px 16px' }}>Pregunta</th>
                  <th style={{ padding: '12px 16px' }}>Respuesta Gemini AI</th>
                  <th style={{ padding: '12px 16px' }}>Estado</th>
                  <th style={{ padding: '12px 16px' }}>Tiempo</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id || q.question_id} style={{ borderBottom: '1px solid var(--border-color, #374151)' }}>
                    <td style={{ padding: '14px 16px', maxW: 240 }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-main, #f3f4f6)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
                        {q.item_title || q.item_id}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
                        Usuario: <span style={{ color: '#f59e0b', fontWeight: 600 }}>@{q.buyer_nickname || q.buyer_id || 'Comprador'}</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>
                        {q.item_id}
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px', maxWidth: 280 }}>
                      <div style={{ fontStyle: 'italic', color: '#e5e7eb', backgroundColor: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: 8, borderLeft: '3px solid #f59e0b' }}>
                        "{q.question_text}"
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px', maxWidth: 350 }}>
                      {q.answer_text ? (
                        <div>
                          <div style={{ color: '#10b981', fontWeight: 500 }}>{q.answer_text}</div>
                          {q.ai_model_used && (
                            <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Sparkles size={10} /> {q.ai_model_used}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Sin respuesta generada</span>
                      )}
                      {q.error_message && (
                        <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: 4 }}>
                          ⚠️ {q.error_message}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      {getStatusBadge(q.status)}
                    </td>

                    <td style={{ padding: '14px 16px', fontSize: '0.8rem', color: '#9ca3af' }}>
                      {q.response_time_ms ? `${(q.response_time_ms / 1000).toFixed(1)}s` : '-'}
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleOpenAnswerModal(q)}
                        style={{
                          padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-color, #374151)',
                          backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b',
                          fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6
                        }}
                      >
                        <Edit3 size={13} /> {q.status === 'PENDING_APPROVAL' ? 'Revisar / Enviar' : 'Editar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL CONFIGURACION AUTO-RESPONDER */}
      {showSettings && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card, #1f2937)', borderRadius: 16,
            maxWidth: 650, width: '100%', maxHeight: '90vh', overflowY: 'auto',
            border: '1px solid var(--border-color, #374151)', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Settings className="text-yellow-500" size={22} />
                Ajustes de Auto-Responder (Gemini AI)
              </h2>
              <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {/* TOGGLE ACTIVADO */}
            <div style={{ padding: 16, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color, #374151)', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Auto-Responder Activo</div>
                <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Responde preguntas de Mercado Libre automáticamente con la IA.</div>
              </div>
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                style={{ width: 20, height: 20, cursor: 'pointer', accentColor: '#f59e0b' }}
              />
            </div>

            {/* MODO AUTO VS BORRADOR */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', marginBottom: 8 }}>Modo de Respuesta</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div
                  onClick={() => setSettings({ ...settings, mode: 'auto' })}
                  style={{
                    padding: 14, borderRadius: 10, cursor: 'pointer',
                    border: settings.mode === 'auto' ? '2px solid #f59e0b' : '1px solid var(--border-color, #374151)',
                    backgroundColor: settings.mode === 'auto' ? 'rgba(245, 158, 11, 0.1)' : 'transparent'
                  }}
                >
                  <div style={{ fontWeight: 700, color: settings.mode === 'auto' ? '#f59e0b' : 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Zap size={16} /> 100% Automático
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 4 }}>
                    Publica la respuesta inmediatamente en Mercado Libre sin espera.
                  </div>
                </div>

                <div
                  onClick={() => setSettings({ ...settings, mode: 'draft' })}
                  style={{
                    padding: 14, borderRadius: 10, cursor: 'pointer',
                    border: settings.mode === 'draft' ? '2px solid #f59e0b' : '1px solid var(--border-color, #374151)',
                    backgroundColor: settings.mode === 'draft' ? 'rgba(245, 158, 11, 0.1)' : 'transparent'
                  }}
                >
                  <div style={{ fontWeight: 700, color: settings.mode === 'draft' ? '#f59e0b' : 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={16} /> Modo Borrador / Supervisado
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 4 }}>
                    Genera la sugerencia y la guarda en la tabla para que la apruebes.
                  </div>
                </div>
              </div>
            </div>

            {/* INSTRUCCIÓN PERSONALIZADA PROMPT */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', marginBottom: 6 }}>
                Instrucciones Personalizadas de Marca (Prompt)
              </label>
              <textarea
                rows={3}
                placeholder="Ejemplo: Sos el asistente de Ventas de Electrónica Pro. Responde siempre con tono cordial, recordá que ofrecemos cuotas sin interés y garantía oficial."
                value={settings.prompt_custom || ''}
                onChange={(e) => setSettings({ ...settings, prompt_custom: e.target.value })}
                style={{
                  width: '100%', padding: 12, borderRadius: 8,
                  border: '1px solid var(--border-color, #374151)', backgroundColor: 'rgba(0,0,0,0.2)',
                  color: 'var(--text-main, #f3f4f6)', fontSize: '0.85rem'
                }}
              />
            </div>

            {/* TESTER SIMULADOR DE GEMINI AI */}
            <div style={{ padding: 16, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-color, #374151)', marginBottom: 24 }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={16} className="text-yellow-500" /> Probar Gemini AI en Vivo
              </div>
              <input
                type="text"
                value={testQuestionText}
                onChange={(e) => setTestQuestionText(e.target.value)}
                placeholder="Escribí una pregunta de prueba..."
                style={{
                  width: '100%', padding: 8, borderRadius: 6, marginBottom: 10,
                  border: '1px solid var(--border-color, #374151)', backgroundColor: 'var(--bg-card, #1f2937)',
                  color: '#fff', fontSize: '0.85rem'
                }}
              />
              <button
                onClick={handleRunAiTest}
                disabled={testingAi}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: 'none',
                  backgroundColor: '#3b82f6', color: '#fff', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer'
                }}
              >
                {testingAi ? 'Generando respuesta...' : 'Simular Respuesta'}
              </button>

              {testResult && (
                <div style={{ marginTop: 12, padding: 12, borderRadius: 8, backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  <div style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 700 }}>Respuesta Generada ({testResult.ai_model_used}):</div>
                  <div style={{ fontSize: '0.85rem', margin: '4px 0 0', color: '#fff' }}>"{testResult.generated_answer}"</div>
                </div>
              )}
            </div>

            {/* ACCIONES FOOTER */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                onClick={() => setShowSettings(false)}
                style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid var(--border-color, #374151)', backgroundColor: 'transparent', color: '#9ca3af', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                style={{ padding: '10px 20px', borderRadius: 8, border: 'none', backgroundColor: '#f59e0b', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                {savingSettings ? 'Guardando...' : 'Guardar Ajustes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RESPUESTA MANUAL / EDICIÓN */}
      {selectedQuestion && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card, #1f2937)', borderRadius: 16,
            maxWidth: 550, width: '100%', border: '1px solid var(--border-color, #374151)', padding: 24
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem' }}>Responder Pregunta MeLi</h3>
              <button onClick={() => setSelectedQuestion(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.03)' }}>
              <div style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600 }}>
                Pregunta de @{selectedQuestion.buyer_nickname || 'Comprador'}:
              </div>
              <div style={{ fontSize: '0.9rem', fontStyle: 'italic', margin: '4px 0 0' }}>
                "{selectedQuestion.question_text}"
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 6 }}>
                Tu Respuesta (se enviará a Mercado Libre):
              </label>
              <textarea
                rows={4}
                value={manualAnswerText}
                onChange={(e) => setManualAnswerText(e.target.value)}
                style={{
                  width: '100%', padding: 12, borderRadius: 8,
                  border: '1px solid var(--border-color, #374151)', backgroundColor: 'rgba(0,0,0,0.2)',
                  color: '#fff', fontSize: '0.9rem'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                onClick={() => setSelectedQuestion(null)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-color, #374151)', backgroundColor: 'transparent', color: '#9ca3af', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSendAnswer}
                disabled={answering || !manualAnswerText.trim()}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', backgroundColor: '#10b981', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Send size={14} />
                {answering ? 'Publicando en MeLi...' : 'Publicar Respuesta'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
