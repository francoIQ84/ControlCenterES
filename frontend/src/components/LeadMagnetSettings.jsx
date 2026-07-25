import React, { useState, useEffect } from 'react'
import { Download, Mail, Send, Trash2, CheckCircle2, AlertCircle, FileText, Settings, Users, Sparkles } from 'lucide-react'
import MediaBrowser from './MediaBrowser'

export default function LeadMagnetSettings() {
  const [activeSubTab, setActiveSubTab] = useState("config") // "config", "leads", "smtp"
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Popup Config State
  const [leadConfig, setLeadConfig] = useState({
    enabled: true,
    show_on: "all",
    title: "¿Querés aprender hidroponía?",
    description: 'Descargá gratis la guía "Cómo empezar una huerta hidropónica en casa" (PDF de 15 páginas).',
    button_text: "Obtener guía gratis",
    pdf_url: "",
    delay_seconds: 5,
    email_subject: "🌱 Tu guía gratuita: Cómo empezar una huerta hidropónica en casa",
    email_body: "<h2>¡Hola {name}! Gracias por sumarte.</h2><p>Acá tenés tu guía para empezar tu huerta hidropónica en casa:</p>",
    smtp_host: "smtp.gmail.com",
    smtp_port: 587,
    smtp_user: "",
    smtp_password: "",
    smtp_sender_name: "Hidroponia Rosario"
  })

  // Leads state
  const [leads, setLeads] = useState([])
  const [leadsLoading, setLeadsLoading] = useState(false)

  // Media selector modal
  const [showMediaSelector, setShowMediaSelector] = useState(false)

  // Test email state
  const [testEmailAddress, setTestEmailAddress] = useState("")
  const [sendingTest, setSendingTest] = useState(false)

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/lead-popup')
      if (res.ok) {
        const data = await res.json()
        setLeadConfig(prev => ({ ...prev, ...data }))
      }
    } catch (err) {
      console.error("Error fetching lead popup config:", err)
    } finally {
      setLoading(false)
    }
  }

  const fetchLeads = async () => {
    setLeadsLoading(true)
    try {
      const res = await fetch('/api/settings/leads')
      if (res.ok) {
        const data = await res.json()
        setLeads(data || [])
      }
    } catch (err) {
      console.error("Error fetching leads:", err)
    } finally {
      setLeadsLoading(false)
    }
  }

  useEffect(() => {
    fetchConfig()
  }, [])

  useEffect(() => {
    if (activeSubTab === "leads") {
      fetchLeads()
    }
  }, [activeSubTab])

  const handleSaveConfig = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/settings/lead-popup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadConfig)
      })
      if (res.ok) {
        alert("Configuración de Pop-up y SMTP guardada correctamente.")
      } else {
        alert("Error al guardar la configuración.")
      }
    } catch (err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSendTestEmail = async (e) => {
    e.preventDefault()
    if (!testEmailAddress) {
      alert("Por favor ingresa una casilla de email de destino.")
      return
    }
    setSendingTest(true)
    try {
      const res = await fetch('/api/settings/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_email: testEmailAddress })
      })
      const data = await res.json()
      if (res.ok) {
        alert("¡Email de prueba enviado exitosamente a " + testEmailAddress + "!")
      } else {
        alert("Error al enviar email de prueba: " + (data.detail || "Verifica las credenciales SMTP"))
      }
    } catch (err) {
      alert("Error: " + err.message)
    } finally {
      setSendingTest(false)
    }
  }

  const handleDeleteLead = async (id) => {
    if (!window.confirm("¿Seguro que deseas eliminar este registro de lead?")) return
    try {
      const res = await fetch(`/api/settings/leads/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchLeads()
      }
    } catch (err) {
      alert("Error al eliminar lead: " + err.message)
    }
  }

  const handleExportCSV = () => {
    window.open('/api/settings/leads/export', '_blank')
  }

  if (loading) return <p>Cargando configuración de Lead Magnet...</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Sub tabs header */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--border-color)', paddingBottom: 10 }}>
        <button
          className="btn"
          style={{
            backgroundColor: activeSubTab === 'config' ? 'var(--accent-blue)' : 'transparent',
            color: activeSubTab === 'config' ? '#fff' : 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
          onClick={() => setActiveSubTab('config')}
        >
          <Sparkles size={16} /> Configuración del Pop-up
        </button>
        <button
          className="btn"
          style={{
            backgroundColor: activeSubTab === 'smtp' ? 'var(--accent-blue)' : 'transparent',
            color: activeSubTab === 'smtp' ? '#fff' : 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
          onClick={() => setActiveSubTab('smtp')}
        >
          <Mail size={16} /> Credenciales Email (Gmail / SMTP)
        </button>
        <button
          className="btn"
          style={{
            backgroundColor: activeSubTab === 'leads' ? 'var(--accent-blue)' : 'transparent',
            color: activeSubTab === 'leads' ? '#fff' : 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
          onClick={() => setActiveSubTab('leads')}
        >
          <Users size={16} /> Base de Suscriptores / Leads ({leads.length})
        </button>
      </div>

      {/* Subtab 1: Popup Config */}
      {activeSubTab === 'config' && (
        <form onSubmit={handleSaveConfig} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles style={{ color: '#eab308' }} /> Configuración del Lead Magnet Pop-up
          </h3>

          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={leadConfig.enabled}
                onChange={e => setLeadConfig({ ...leadConfig, enabled: e.target.checked })}
                style={{ width: 18, height: 18 }}
              />
              Activar Pop-up en la Web / Blog
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Mostrar en:</span>
              <select
                value={leadConfig.show_on}
                onChange={e => setLeadConfig({ ...leadConfig, show_on: e.target.value })}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-color)' }}
              >
                <option value="all">Toda la Web y Blog</option>
                <option value="blog">Solo en el Blog</option>
                <option value="store">Solo en la Tienda</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 15 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 5 }}>Título del Pop-up:</label>
              <input
                type="text"
                className="input-text"
                value={leadConfig.title}
                onChange={e => setLeadConfig({ ...leadConfig, title: e.target.value })}
                placeholder="¿Querés aprender hidroponía?"
                style={{ width: '100%', padding: 8 }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 5 }}>Texto del Botón:</label>
              <input
                type="text"
                className="input-text"
                value={leadConfig.button_text}
                onChange={e => setLeadConfig({ ...leadConfig, button_text: e.target.value })}
                placeholder="Obtener guía gratis"
                style={{ width: '100%', padding: 8 }}
                required
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 5 }}>Descripción / Texto secundario:</label>
            <textarea
              rows={2}
              className="input-text"
              value={leadConfig.description}
              onChange={e => setLeadConfig({ ...leadConfig, description: e.target.value })}
              placeholder="Descargá gratis la guía 'Cómo empezar una huerta hidropónica en casa' (PDF de 15 páginas)."
              style={{ width: '100%', padding: 8 }}
              required
            />
          </div>

          {/* Selector de Archivo PDF */}
          <div style={{ border: '1px dashed var(--border-color)', padding: 15, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.01)' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, marginBottom: 8, color: 'var(--accent-blue)' }}>
              📄 Archivo PDF a Enviar (Seleccionable desde el Gestor):
            </label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="input-text"
                value={leadConfig.pdf_url}
                onChange={e => setLeadConfig({ ...leadConfig, pdf_url: e.target.value })}
                placeholder="/uploads/guia-hidroponia.pdf"
                style={{ flex: 1, minWidth: 250, padding: 8 }}
              />
              <button
                type="button"
                className="btn"
                style={{ backgroundColor: 'var(--accent-blue)', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => setShowMediaSelector(true)}
              >
                <FileText size={16} /> Seleccionar de Archivos
              </button>
            </div>
            {leadConfig.pdf_url && (
              <p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: '#16a34a', fontWeight: 600 }}>
                ✓ Archivo seleccionado: {leadConfig.pdf_url}
              </p>
            )}
          </div>

          {/* Asunto y Contenido de Email */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15, borderTop: '1px solid var(--border-color)', paddingTop: 15 }}>
            <h4 style={{ margin: 0, fontSize: '1rem' }}>📧 Formato del Email Automático</h4>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 5 }}>Asunto del Email:</label>
              <input
                type="text"
                className="input-text"
                value={leadConfig.email_subject}
                onChange={e => setLeadConfig({ ...leadConfig, email_subject: e.target.value })}
                style={{ width: '100%', padding: 8 }}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 5 }}>Mensaje HTML (Podés usar la etiqueta {'{name}'}):</label>
              <textarea
                rows={4}
                className="input-text"
                value={leadConfig.email_body}
                onChange={e => setLeadConfig({ ...leadConfig, email_body: e.target.value })}
                style={{ width: '100%', padding: 8, fontFamily: 'monospace', fontSize: '0.85rem' }}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn" disabled={saving} style={{ backgroundColor: 'var(--accent-blue)', color: '#fff', padding: '10px 20px', alignSelf: 'flex-start' }}>
            {saving ? 'Guardando...' : 'Guardar Configuración del Pop-up'}
          </button>
        </form>
      )}

      {/* Subtab 2: SMTP Config */}
      {activeSubTab === 'smtp' && (
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Mail style={{ color: '#2563eb' }} /> Credenciales SMTP para Envío de Correos (Gmail / Propio)
          </h3>

          <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 15 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 5 }}>Servidor SMTP (Host):</label>
                <input
                  type="text"
                  className="input-text"
                  value={leadConfig.smtp_host}
                  onChange={e => setLeadConfig({ ...leadConfig, smtp_host: e.target.value })}
                  placeholder="smtp.gmail.com"
                  style={{ width: '100%', padding: 8 }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 5 }}>Puerto SMTP:</label>
                <input
                  type="number"
                  className="input-text"
                  value={leadConfig.smtp_port}
                  onChange={e => setLeadConfig({ ...leadConfig, smtp_port: parseInt(e.target.value) || 587 })}
                  placeholder="587"
                  style={{ width: '100%', padding: 8 }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 5 }}>Nombre de Remitente:</label>
                <input
                  type="text"
                  className="input-text"
                  value={leadConfig.smtp_sender_name}
                  onChange={e => setLeadConfig({ ...leadConfig, smtp_sender_name: e.target.value })}
                  placeholder="Hidroponia Rosario"
                  style={{ width: '100%', padding: 8 }}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 15 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 5 }}>Email de Remitente (Usuario SMTP):</label>
                <input
                  type="email"
                  className="input-text"
                  value={leadConfig.smtp_user}
                  onChange={e => setLeadConfig({ ...leadConfig, smtp_user: e.target.value })}
                  placeholder="hidroponiarosario@gmail.com"
                  style={{ width: '100%', padding: 8 }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 5 }}>
                  Contraseña de Aplicación (Gmail / SMTP):
                </label>
                <input
                  type="password"
                  className="input-text"
                  value={leadConfig.smtp_password}
                  onChange={e => setLeadConfig({ ...leadConfig, smtp_password: e.target.value })}
                  placeholder="Clave de 16 letras de Google"
                  style={{ width: '100%', padding: 8 }}
                  required
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  En Gmail, genera esta clave en Seguridad -&gt; Contraseñas de aplicaciones.
                </span>
              </div>
            </div>

            <button type="submit" className="btn" disabled={saving} style={{ backgroundColor: 'var(--accent-blue)', color: '#fff', padding: '10px 20px', alignSelf: 'flex-start' }}>
              {saving ? 'Guardando...' : 'Guardar Credenciales SMTP'}
            </button>
          </form>

          {/* Test Email Box */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 20 }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Send size={16} style={{ color: '#16a34a' }} /> Probar Envío de Email
            </h4>
            <form onSubmit={handleSendTestEmail} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="email"
                className="input-text"
                placeholder="Ingresá un mail para recibir la prueba..."
                value={testEmailAddress}
                onChange={e => setTestEmailAddress(e.target.value)}
                style={{ minWidth: 280, padding: 8 }}
                required
              />
              <button type="submit" className="btn" disabled={sendingTest} style={{ backgroundColor: '#16a34a', color: '#fff', padding: '8px 16px' }}>
                {sendingTest ? 'Enviando prueba...' : 'Enviar Mail de Prueba'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Subtab 3: Leads List */}
      {activeSubTab === 'leads' && (
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 15 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>📋 Base de Suscriptores y Leads Capturados</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Total de contactos capitalizados: <strong>{leads.length}</strong>
              </p>
            </div>

            <button
              className="btn"
              onClick={handleExportCSV}
              style={{ backgroundColor: '#16a34a', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Download size={16} /> Exportar a CSV / Excel
            </button>
          </div>

          {leadsLoading ? <p>Cargando lista de suscriptores...</p> : leads.length === 0 ? (
            <p style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-color)', borderRadius: 8 }}>
              Aún no hay leads registrados. Tan pronto como los visitantes completen el Pop-up, aparecerán acá.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: 'rgba(0,0,0,0.03)', textAlign: 'left', borderBottom: '2px solid var(--border-color)' }}>
                    <th style={{ padding: 10 }}>ID</th>
                    <th style={{ padding: 10 }}>Nombre</th>
                    <th style={{ padding: 10 }}>Email</th>
                    <th style={{ padding: 10 }}>País</th>
                    <th style={{ padding: 10 }}>PDF Enviado</th>
                    <th style={{ padding: 10 }}>Fecha Registro</th>
                    <th style={{ padding: 10, textAlign: 'center' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(l => (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: 10, fontWeight: 600 }}>#{l.id}</td>
                      <td style={{ padding: 10, fontWeight: 600 }}>{l.name || '-'}</td>
                      <td style={{ padding: 10, color: 'var(--accent-blue)' }}>{l.email}</td>
                      <td style={{ padding: 10 }}>{l.country || 'Argentina'}</td>
                      <td style={{ padding: 10, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{l.pdf_sent || 'Guía estándar'}</td>
                      <td style={{ padding: 10 }}>{new Date(l.created_at).toLocaleString()}</td>
                      <td style={{ padding: 10, textAlign: 'center' }}>
                        <button
                          className="btn-icon"
                          onClick={() => handleDeleteLead(l.id)}
                          title="Eliminar lead"
                        >
                          <Trash2 size={16} style={{ color: 'var(--accent-red)' }} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal selector de PDF */}
      {showMediaSelector && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyCenter: 'center', zIndex: 1000, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 850, maxHeight: '90vh', overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 15 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Seleccionar Archivo PDF del Gestor</h3>
              <button className="btn" style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }} onClick={() => setShowMediaSelector(false)}>✕</button>
            </div>
            <MediaBrowser
              onSelectImage={(url) => {
                setLeadConfig(prev => ({ ...prev, pdf_url: url }))
                setShowMediaSelector(false)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
