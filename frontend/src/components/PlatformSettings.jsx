import React, { useState, useEffect } from 'react'
import {
  Key, Globe, Server, ShieldCheck, CheckCircle2, XCircle,
  RefreshCw, Copy, ExternalLink, Save, Upload, Sparkles, Check, Info
} from 'lucide-react'

export default function PlatformSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState({
    meli_app_id: '',
    has_meli_client_secret: false,
    meli_client_secret: '',
    meta_app_id: '',
    has_meta_app_secret: false,
    meta_app_secret: '',
    tiendanube_client_id: '',
    has_tiendanube_client_secret: false,
    tiendanube_client_secret: '',
    has_gemini_api_key: false,
    gemini_api_key: '',
    google_drive_folder_id: '',
    has_service_account: false,
    service_account_email: '',
    public_base_url: 'https://es.focalserver.com',
    redirect_uris: {
      mercadolibre: '',
      meta: '',
      tiendanube: ''
    }
  })

  const [copiedKey, setCopiedKey] = useState(null)
  const [testResults, setTestResults] = useState({})
  const [testingService, setTestingService] = useState(null)
  const [uploadingSa, setUploadingSa] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const fetchCredentials = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/platform/credentials')
      if (res.ok) {
        const d = await res.json()
        setData({
          meli_app_id: d.meli_app_id || '',
          has_meli_client_secret: Boolean(d.has_meli_client_secret),
          meli_client_secret: d.has_meli_client_secret ? '••••••••••••••••' : '',
          meta_app_id: d.meta_app_id || '',
          has_meta_app_secret: Boolean(d.has_meta_app_secret),
          meta_app_secret: d.has_meta_app_secret ? '••••••••••••••••' : '',
          tiendanube_client_id: d.tiendanube_client_id || '',
          has_tiendanube_client_secret: Boolean(d.has_tiendanube_client_secret),
          tiendanube_client_secret: d.has_tiendanube_client_secret ? '••••••••••••••••' : '',
          has_gemini_api_key: Boolean(d.has_gemini_api_key),
          gemini_api_key: d.has_gemini_api_key ? '••••••••••••••••' : '',
          google_drive_folder_id: d.google_drive_folder_id || '',
          has_service_account: Boolean(d.has_service_account),
          service_account_email: d.service_account_email || '',
          public_base_url: d.public_base_url || 'https://es.focalserver.com',
          redirect_uris: d.redirect_uris || {}
        })
      } else {
        const err = await res.json().catch(() => ({}))
        alert('Error al cargar credenciales de plataforma: ' + (err.detail || res.statusText))
      }
    } catch (e) {
      alert('Error de conexión: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCredentials()
  }, [])

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaveSuccess(false)
    try {
      const res = await fetch('/api/platform/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meli_app_id: data.meli_app_id,
          meli_client_secret: data.meli_client_secret,
          meta_app_id: data.meta_app_id,
          meta_app_secret: data.meta_app_secret,
          tiendanube_client_id: data.tiendanube_client_id,
          tiendanube_client_secret: data.tiendanube_client_secret,
          gemini_api_key: data.gemini_api_key,
          google_drive_folder_id: data.google_drive_folder_id,
          public_base_url: data.public_base_url
        })
      })
      const result = await res.json()
      if (res.ok) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 4000)
        fetchCredentials()
      } else {
        alert('Error al guardar: ' + (result.detail || 'Error en backend'))
      }
    } catch (err) {
      alert('Error de conexión: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleTestService = async (service) => {
    setTestingService(service)
    setTestResults(prev => ({ ...prev, [service]: null }))
    try {
      const res = await fetch(`/api/platform/test/${service}`, { method: 'POST' })
      const resData = await res.json()
      setTestResults(prev => ({ ...prev, [service]: resData }))
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [service]: { success: False, message: 'Error al contactar backend: ' + err.message }
      }))
    } finally {
      setTestingService(null)
    }
  }

  const handleUploadServiceAccount = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingSa(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/platform/upload-service-account', {
        method: 'POST',
        body: formData
      })
      const resData = await res.json()
      if (res.ok) {
        alert('✅ ' + resData.message)
        fetchCredentials()
      } else {
        alert('❌ Error: ' + (resData.detail || 'No se pudo cargar el archivo'))
      }
    } catch (err) {
      alert('Error de conexión: ' + err.message)
    } finally {
      setUploadingSa(false)
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto 10px auto' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Cargando credenciales de plataforma...</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Banner Explicativo */}
      <div style={{
        backgroundColor: 'rgba(59, 130, 246, 0.08)',
        border: '1px solid rgba(59, 130, 246, 0.25)',
        borderRadius: 12,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14
      }}>
        <ShieldCheck size={26} style={{ color: 'var(--accent-blue)', flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 4 }}>
            Panel de Infraestructura y Desarrollador (Master Tenant)
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Estas credenciales pertenecen a tus cuentas de desarrollador (Mercado Libre DevCenter, Meta for Developers, Tiendanube Partners, Google AI Studio y Google Cloud).
            Todos los tenants de la plataforma utilizarán estas APIs globales para conectarse en 1 clic sin tener que ingresar claves técnicas.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave}>
        {/* Dominio Base del SaaS */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.1rem' }}>
            <Globe size={20} style={{ color: 'var(--accent-blue)' }} />
            Dominio Raíz del SaaS (Base URL)
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 15 }}>
            La URL pública base donde está hosteado el sistema. Se utiliza para generar los endpoints de redirección OAuth para todos los tenants.
          </p>

          <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>URL Pública del Servidor
            <input
              type="text"
              value={data.public_base_url}
              onChange={e => setData({ ...data, public_base_url: e.target.value })}
              placeholder="https://es.focalserver.com"
              style={{
                width: '100%',
                marginTop: 6,
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-dark)',
                color: 'var(--text-primary)'
              }}
            />
          </label>
        </div>

        {/* Cuadrícula de Integraciones */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20, marginBottom: 20 }}>
          
          {/* Mercado Libre Developer */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🟡</span> Mercado Libre Developers
              </h4>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 12,
                backgroundColor: data.meli_app_id && data.has_meli_client_secret ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: data.meli_app_id && data.has_meli_client_secret ? '#22c55e' : '#ef4444'
              }}>
                {data.meli_app_id && data.has_meli_client_secret ? 'Configurado' : 'Incompleto'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              <label style={{ fontSize: '0.8rem' }}>MELI_APP_ID (Client ID)
                <input
                  type="text"
                  value={data.meli_app_id}
                  onChange={e => setData({ ...data, meli_app_id: e.target.value })}
                  placeholder="Ej: 521873289123891"
                  style={{ width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
              </label>

              <label style={{ fontSize: '0.8rem' }}>MELI_CLIENT_SECRET
                <input
                  type="password"
                  value={data.meli_client_secret}
                  onChange={e => setData({ ...data, meli_client_secret: e.target.value })}
                  placeholder="Secreto de la app"
                  style={{ width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
              </label>

              <div style={{ backgroundColor: 'var(--bg-dark)', padding: 10, borderRadius: 6, border: '1px solid var(--border-color)', marginTop: 4 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                  URI de redireccionamiento para Mercado Libre DevCenter:
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <code style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{data.redirect_uris.mercadolibre}</code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(data.redirect_uris.mercadolibre, 'meli')}
                    className="btn-icon"
                    title="Copiar URI"
                    style={{ padding: 4 }}
                  >
                    {copiedKey === 'meli' ? <Check size={14} style={{ color: '#22c55e' }} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 15, paddingTop: 12, borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                type="button"
                className="btn"
                onClick={() => handleTestService('mercadolibre')}
                disabled={testingService === 'mercadolibre'}
                style={{ fontSize: '0.8rem', padding: '6px 12px' }}
              >
                {testingService === 'mercadolibre' ? <RefreshCw className="animate-spin" size={13} /> : '🔍 Probar App'}
              </button>
              {testResults.mercadolibre && (
                <span style={{ fontSize: '0.75rem', color: testResults.mercadolibre.success ? '#22c55e' : '#ef4444' }}>
                  {testResults.mercadolibre.success ? '✅' : '❌'} {testResults.mercadolibre.message}
                </span>
              )}
            </div>
          </div>

          {/* Meta for Developers (Facebook & Instagram) */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🔵</span> Meta for Developers (FB & IG)
              </h4>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 12,
                backgroundColor: data.meta_app_id && data.has_meta_app_secret ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: data.meta_app_id && data.has_meta_app_secret ? '#22c55e' : '#ef4444'
              }}>
                {data.meta_app_id && data.has_meta_app_secret ? 'Configurado' : 'Incompleto'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              <label style={{ fontSize: '0.8rem' }}>META_APP_ID
                <input
                  type="text"
                  value={data.meta_app_id}
                  onChange={e => setData({ ...data, meta_app_id: e.target.value })}
                  placeholder="Ej: 1501170757754593"
                  style={{ width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
              </label>

              <label style={{ fontSize: '0.8rem' }}>META_APP_SECRET
                <input
                  type="password"
                  value={data.meta_app_secret}
                  onChange={e => setData({ ...data, meta_app_secret: e.target.value })}
                  placeholder="App Secret de Meta"
                  style={{ width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
              </label>

              <div style={{ backgroundColor: 'var(--bg-dark)', padding: 10, borderRadius: 6, border: '1px solid var(--border-color)', marginTop: 4 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                  URI de redirección válida para Facebook Login:
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <code style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{data.redirect_uris.meta}</code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(data.redirect_uris.meta, 'meta')}
                    className="btn-icon"
                    title="Copiar URI"
                    style={{ padding: 4 }}
                  >
                    {copiedKey === 'meta' ? <Check size={14} style={{ color: '#22c55e' }} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 15, paddingTop: 12, borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                type="button"
                className="btn"
                onClick={() => handleTestService('meta')}
                disabled={testingService === 'meta'}
                style={{ fontSize: '0.8rem', padding: '6px 12px' }}
              >
                {testingService === 'meta' ? <RefreshCw className="animate-spin" size={13} /> : '🔍 Probar App'}
              </button>
              {testResults.meta && (
                <span style={{ fontSize: '0.75rem', color: testResults.meta.success ? '#22c55e' : '#ef4444' }}>
                  {testResults.meta.success ? '✅' : '❌'} {testResults.meta.message}
                </span>
              )}
            </div>
          </div>

          {/* Tiendanube Partners */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>☁️</span> Tiendanube Partners
              </h4>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 12,
                backgroundColor: data.tiendanube_client_id && data.has_tiendanube_client_secret ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: data.tiendanube_client_id && data.has_tiendanube_client_secret ? '#22c55e' : '#ef4444'
              }}>
                {data.tiendanube_client_id && data.has_tiendanube_client_secret ? 'Configurado' : 'Incompleto'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              <label style={{ fontSize: '0.8rem' }}>TIENDANUBE_CLIENT_ID
                <input
                  type="text"
                  value={data.tiendanube_client_id}
                  onChange={e => setData({ ...data, tiendanube_client_id: e.target.value })}
                  placeholder="Client ID de la app"
                  style={{ width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
              </label>

              <label style={{ fontSize: '0.8rem' }}>TIENDANUBE_CLIENT_SECRET
                <input
                  type="password"
                  value={data.tiendanube_client_secret}
                  onChange={e => setData({ ...data, tiendanube_client_secret: e.target.value })}
                  placeholder="Client Secret de la app"
                  style={{ width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
              </label>

              <div style={{ backgroundColor: 'var(--bg-dark)', padding: 10, borderRadius: 6, border: '1px solid var(--border-color)', marginTop: 4 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                  URL de redirección para Portal de Partners:
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <code style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{data.redirect_uris.tiendanube}</code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(data.redirect_uris.tiendanube, 'tiendanube')}
                    className="btn-icon"
                    title="Copiar URI"
                    style={{ padding: 4 }}
                  >
                    {copiedKey === 'tiendanube' ? <Check size={14} style={{ color: '#22c55e' }} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 15, paddingTop: 12, borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                type="button"
                className="btn"
                onClick={() => handleTestService('tiendanube')}
                disabled={testingService === 'tiendanube'}
                style={{ fontSize: '0.8rem', padding: '6px 12px' }}
              >
                {testingService === 'tiendanube' ? <RefreshCw className="animate-spin" size={13} /> : '🔍 Verificar'}
              </button>
              {testResults.tiendanube && (
                <span style={{ fontSize: '0.75rem', color: testResults.tiendanube.success ? '#22c55e' : '#ef4444' }}>
                  {testResults.tiendanube.success ? '✅' : '❌'} {testResults.tiendanube.message}
                </span>
              )}
            </div>
          </div>

          {/* Google Gemini AI */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} style={{ color: '#a855f7' }} /> Google Gemini AI
              </h4>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 12,
                backgroundColor: data.has_gemini_api_key ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: data.has_gemini_api_key ? '#22c55e' : '#ef4444'
              }}>
                {data.has_gemini_api_key ? 'Configurado' : 'Falta Key'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                Utilizada para generación de copys publicitarios, descripciones de productos, reels y respuestas de comentarios en redes y WhatsApp.
              </p>

              <label style={{ fontSize: '0.8rem' }}>GEMINI_API_KEY
                <input
                  type="password"
                  value={data.gemini_api_key}
                  onChange={e => setData({ ...data, gemini_api_key: e.target.value })}
                  placeholder="AIzaSy..."
                  style={{ width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
              </label>
            </div>

            <div style={{ marginTop: 15, paddingTop: 12, borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                type="button"
                className="btn"
                onClick={() => handleTestService('gemini')}
                disabled={testingService === 'gemini'}
                style={{ fontSize: '0.8rem', padding: '6px 12px' }}
              >
                {testingService === 'gemini' ? <RefreshCw className="animate-spin" size={13} /> : '✨ Probar Gemini API'}
              </button>
              {testResults.gemini && (
                <span style={{ fontSize: '0.75rem', color: testResults.gemini.success ? '#22c55e' : '#ef4444' }}>
                  {testResults.gemini.success ? '✅' : '❌'} {testResults.gemini.message}
                </span>
              )}
            </div>
          </div>

          {/* Google Drive Backups */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>💾</span> Google Drive Backups
              </h4>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 12,
                backgroundColor: data.has_service_account && data.google_drive_folder_id ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: data.has_service_account && data.google_drive_folder_id ? '#22c55e' : '#ef4444'
              }}>
                {data.has_service_account && data.google_drive_folder_id ? 'Activo' : 'Incompleto'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              <label style={{ fontSize: '0.8rem' }}>GOOGLE_DRIVE_FOLDER_ID
                <input
                  type="text"
                  value={data.google_drive_folder_id}
                  onChange={e => setData({ ...data, google_drive_folder_id: e.target.value })}
                  placeholder="ID de carpeta de Drive"
                  style={{ width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
              </label>

              <div style={{ backgroundColor: 'var(--bg-dark)', padding: 10, borderRadius: 6, border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Archivo <code>service_account.json</code>:
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: data.has_service_account ? '#22c55e' : '#ef4444', marginBottom: 6 }}>
                  {data.has_service_account ? `✅ Presente (${data.service_account_email})` : '❌ No encontrado'}
                </div>
                <label className="btn" style={{ fontSize: '0.75rem', padding: '4px 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Upload size={13} />
                  {uploadingSa ? 'Subiendo...' : 'Actualizar service_account.json'}
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleUploadServiceAccount}
                    style={{ display: 'none' }}
                    disabled={uploadingSa}
                  />
                </label>
              </div>
            </div>

            <div style={{ marginTop: 15, paddingTop: 12, borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                type="button"
                className="btn"
                onClick={() => handleTestService('google_drive')}
                disabled={testingService === 'google_drive'}
                style={{ fontSize: '0.8rem', padding: '6px 12px' }}
              >
                {testingService === 'google_drive' ? <RefreshCw className="animate-spin" size={13} /> : '🔍 Probar Acceso'}
              </button>
              {testResults.google_drive && (
                <span style={{ fontSize: '0.75rem', color: testResults.google_drive.success ? '#22c55e' : '#ef4444' }}>
                  {testResults.google_drive.success ? '✅' : '❌'} {testResults.google_drive.message}
                </span>
              )}
            </div>
          </div>

        </div>

        {/* Barra de Guardado Principal */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <button
            type="submit"
            className="btn"
            disabled={saving}
            style={{
              padding: '10px 24px',
              fontSize: '0.95rem',
              backgroundColor: 'var(--accent-blue)',
              color: '#fff',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              borderRadius: 8
            }}
          >
            {saving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
            {saving ? 'Guardando credenciales...' : 'Guardar Credenciales de Plataforma'}
          </button>

          {saveSuccess && (
            <span style={{ color: '#22c55e', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={16} /> ¡Credenciales guardadas exitosamente en el Master Tenant!
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
