import React, { useState, useEffect } from 'react'
import {
  HardDrive, Cloud, Download, Trash2, RefreshCw, Upload,
  AlertTriangle, CheckCircle2, Shield, Info, Database, FolderArchive,
  Lock, MessageSquare, BookOpen, Settings, ExternalLink
} from 'lucide-react'
import { formatDateTimeAR } from '../utils/dateUtils'

export default function GlobalBackups() {
  const [backups, setBackups] = useState([])
  const [backupsLoading, setBackupsLoading] = useState(true)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [uploadingToDrive, setUploadingToDrive] = useState({})
  const [diskSpace, setDiskSpace] = useState(null)

  // Google Drive state
  const [gdriveStatus, setGdriveStatus] = useState({
    connected: false,
    auth_mode: 'none',
    user_email: '',
    folder_id: '',
    is_oauth_configured: false,
    has_client_credentials: false,
  })
  const [gdriveStatusLoading, setGdriveStatusLoading] = useState(false)
  const [connectingGDrive, setConnectingGDrive] = useState(false)

  // Restore state
  const [restoreFile, setRestoreFile] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreResult, setRestoreResult] = useState(null)

  const fetchBackups = async () => {
    setBackupsLoading(true)
    try {
      const res = await fetch('/api/backup/list')
      if (res.ok) {
        const data = await res.json()
        setBackups(data || [])
      } else {
        const err = await res.json().catch(() => ({}))
        console.error('Error cargando respaldos globales:', err)
      }
    } catch (e) {
      console.error('Error de red al listar respaldos:', e)
    } finally {
      setBackupsLoading(false)
    }
  }

  const fetchDiskSpace = async () => {
    try {
      const res = await fetch('/api/backup/disk-space')
      if (res.ok) {
        const data = await res.json()
        setDiskSpace(data)
      }
    } catch (e) {
      console.error('Error obteniendo espacio en disco:', e)
    }
  }

  const fetchGdriveStatus = async () => {
    setGdriveStatusLoading(true)
    try {
      const res = await fetch('/api/backup/google-drive/status')
      if (res.ok) {
        const data = await res.json()
        if (data && !data.detail) {
          setGdriveStatus(data)
        }
      }
    } catch (e) {
      console.error('Error al consultar estado de Google Drive:', e)
    } finally {
      setGdriveStatusLoading(false)
    }
  }

  useEffect(() => {
    fetchBackups()
    fetchDiskSpace()
    fetchGdriveStatus()

    // Detectar retorno de Google OAuth
    const params = new URLSearchParams(window.location.search)
    if (params.get('gdrive_connected')) {
      alert('✅ ¡Cuenta de Google Drive vinculada con éxito!\nTus respaldos ahora se sincronizan en tu Google Drive personal sin límite de cuota.')
      window.history.replaceState({}, '', window.location.pathname + '?tab=backups')
      fetchGdriveStatus()
    } else if (params.get('gdrive_error')) {
      alert('⚠️ Error al vincular Google Drive:\n' + params.get('gdrive_error'))
      window.history.replaceState({}, '', window.location.pathname + '?tab=backups')
    }
  }, [])

  const handleConnectGDrive = async () => {
    setConnectingGDrive(true)
    try {
      const res = await fetch('/api/backup/google-drive/auth-url')
      const data = await res.json()
      if (res.ok && data.auth_url) {
        window.location.href = data.auth_url
      } else {
        alert('⚠️ ' + (data.detail || 'No se pudo generar la URL de autorización. Verificá las credenciales en Integraciones Globales.'))
      }
    } catch (e) {
      alert('Error de conexión: ' + e.message)
    } finally {
      setConnectingGDrive(false)
    }
  }

  const handleDisconnectGDrive = async () => {
    if (!window.confirm('¿Deseás desvincular tu cuenta personal de Google Drive?')) return
    try {
      const res = await fetch('/api/backup/google-drive/disconnect', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        alert('✅ ' + (data.message || 'Cuenta de Google Drive desvinculada.'))
        fetchGdriveStatus()
      } else {
        alert('Error: ' + (data.detail || 'No se pudo desvincular'))
      }
    } catch (e) {
      alert('Error de conexión: ' + e.message)
    }
  }

  const handleCreateBackup = async () => {
    setCreatingBackup(true)
    try {
      const res = await fetch('/api/backup/create', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        alert('✅ Respaldo global creado con éxito:\n' + data.filename)
        fetchBackups()
        fetchDiskSpace()
      } else {
        alert('Error al crear respaldo: ' + (data.detail || 'Error desconocido'))
      }
    } catch (e) {
      alert('Error de conexión: ' + e.message)
    } finally {
      setCreatingBackup(false)
    }
  }

  const handleUploadToDrive = async (backupId) => {
    if (!window.confirm(`¿Deseás subir el respaldo ${backupId} a Google Drive ahora?`)) return
    setUploadingToDrive(prev => ({ ...prev, [backupId]: true }))
    try {
      const res = await fetch(`/api/backup/upload-to-drive/${backupId}`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        alert('✅ Respaldo subido con éxito a Google Drive:\n' + (data.message || 'Subida completada'))
      } else {
        alert('⚠️ ' + (data.detail || 'Error al subir a Google Drive'))
      }
    } catch (e) {
      alert('Error de conexión: ' + e.message)
    } finally {
      setUploadingToDrive(prev => ({ ...prev, [backupId]: false }))
    }
  }

  const handleDownloadBackup = (filename) => {
    try {
      const token = localStorage.getItem('adminToken')
      const downloadUrl = `/api/backup/download/${encodeURIComponent(filename)}${token ? `?token=${encodeURIComponent(token)}` : ''}`
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (e) {
      alert('Error al iniciar la descarga: ' + e.message)
    }
  }

  const handleDeleteBackup = async (backupId) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar el respaldo '${backupId}'?\nEsta acción borrará los archivos de sistema y medios asociados en el servidor.`)) return
    try {
      const res = await fetch(`/api/backup/${backupId}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        fetchBackups()
        fetchDiskSpace()
      } else {
        alert('Error al eliminar: ' + (data.detail || 'Error desconocido'))
      }
    } catch (e) {
      alert('Error de conexión: ' + e.message)
    }
  }

  const handleRestore = async () => {
    if (!restoreFile) return
    if (!window.confirm('⚠️ ATENCIÓN: Esto reemplazará TODOS los datos actuales del sistema (toda la base de datos de PostgreSQL con todos los inquilinos, archivos, certificados, sesión de WhatsApp) con los del respaldo seleccionado.\n\n¿Estás seguro de continuar?')) return
    if (!window.confirm('🔴 ÚLTIMA CONFIRMACIÓN: Esta acción NO se puede deshacer (se creará un respaldo de seguridad automático antes de restaurar).\n\n¿Confirmar restauración total?')) return

    setRestoring(true)
    setRestoreResult(null)
    try {
      const formData = new FormData()
      formData.append('file', restoreFile)
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (res.ok) {
        setRestoreResult({ success: true, ...data })
        fetchBackups()
        fetchDiskSpace()
      } else {
        setRestoreResult({ success: false, error: data.detail?.message || data.detail || 'Error desconocido' })
      }
    } catch (e) {
      setRestoreResult({ success: false, error: e.message })
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* HEADER BANNER */}
      <div className="card" style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        padding: '20px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 10 }}>
            <HardDrive size={22} style={{ color: 'var(--accent-blue)' }} />
            Respaldos Globales de Plataforma & Google Drive
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Herramienta exclusiva de Desarrollador / Owner. Realiza copias completas de toda la base de datos (todos los inquilinos), archivos multimedia y sincronización automática a tu Google Drive.
          </p>
        </div>

        {/* DISK SPACE WIDGET */}
        {diskSpace && (
          <div style={{
            backgroundColor: 'var(--bg-dark)',
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            padding: '10px 16px',
            minWidth: 220
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
              <span>Disco en Servidor:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{diskSpace.free_gb} GB libres</strong>
            </div>
            <div style={{ width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: `${diskSpace.percent_used}%`,
                height: '100%',
                backgroundColor: diskSpace.percent_used > 85 ? 'var(--accent-red)' : 'var(--accent-blue)',
                borderRadius: 3
              }} />
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4, textAlign: 'right' }}>
              {diskSpace.used_gb} GB usados de {diskSpace.total_gb} GB ({diskSpace.percent_used}%)
            </div>
          </div>
        )}
      </div>

      {/* GOOGLE DRIVE INTEGRATION CARD */}
      <div className="card" style={{
        backgroundColor: 'var(--bg-dark)',
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        padding: '20px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.05rem' }}>
            <Cloud size={20} style={{ color: '#0284c7' }} />
            Integración con Google Drive (Respaldos en la Nube del Desarrollador)
          </h3>
          <span style={{
            fontSize: '0.78rem',
            fontWeight: 700,
            padding: '4px 12px',
            borderRadius: 14,
            backgroundColor: gdriveStatus.is_oauth_configured ? 'rgba(34, 197, 94, 0.15)' : (gdriveStatus.auth_mode === 'service_account' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(156, 163, 175, 0.15)'),
            color: gdriveStatus.is_oauth_configured ? '#22c55e' : (gdriveStatus.auth_mode === 'service_account' ? '#3b82f6' : 'var(--text-secondary)')
          }}>
            {gdriveStatus.is_oauth_configured ? `🟢 Conectado vía OAuth: ${gdriveStatus.user_email || 'Personal'}` : (gdriveStatus.auth_mode === 'service_account' ? '🔵 Service Account (Workspace)' : '⚪ No Conectado')}
          </span>
        </div>

        {gdriveStatus.is_oauth_configured ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              Tus respaldos del sistema y archivos multimedia se sincronizan directamente con tu cuenta personal de Google Drive (<strong>{gdriveStatus.user_email}</strong>) utilizando tu almacenamiento propio sin límite de cuota.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                📁 Destino: <strong>{gdriveStatus.folder_id ? `Carpeta (${gdriveStatus.folder_id})` : 'Raíz de tu Google Drive'}</strong>
              </span>
              <button
                type="button"
                onClick={handleDisconnectGDrive}
                className="btn"
                style={{ fontSize: '0.75rem', padding: '4px 10px', color: '#ef4444', borderColor: '#ef4444', backgroundColor: 'transparent' }}
              >
                Desvincular cuenta
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
              Vincula tu cuenta personal de Google Drive (<strong>@gmail.com</strong>) en 1 clic. Tus respaldos se guardarán automáticamente en tu nube personal sin el bloqueo de cuota que impone Google a las Service Accounts.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleConnectGDrive}
                disabled={connectingGDrive}
                className="btn"
                style={{
                  padding: '8px 16px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  backgroundColor: '#0284c7',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <Cloud size={16} /> {connectingGDrive ? 'Conectando...' : 'Conectar cuenta de Google Drive con 1 Clic'}
              </button>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                ¿Necesitás cambiar el Client ID / Secret? Podés editarlo en la solapa <strong>Integraciones Globales</strong>.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* SCHEDULED AUTOMATIC BACKUPS INFO */}
      <div style={{
        backgroundColor: 'rgba(59, 130, 246, 0.08)',
        border: '1px solid rgba(59, 130, 246, 0.25)',
        borderRadius: 8,
        padding: '16px 20px',
        fontSize: '0.88rem',
        lineHeight: 1.5
      }}>
        <div style={{ fontWeight: 700, color: 'var(--accent-blue)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          🕒 Respaldos Automáticos Programados Activos
        </div>
        <div style={{ marginBottom: 10, color: 'var(--text-primary)' }}>
          El sistema ejecuta un respaldo automático completo del sistema <strong>1 vez al mes</strong> y conserva <strong>1 año de historial (los últimos 12 respaldos automáticos)</strong>. Los respaldos manuales se conservan indefinidamente.
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          <strong>📦 Contenido incluido en cada respaldo global:</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {[
              { icon: '🗄️', label: 'Base de datos completa (todos los inquilinos)' },
              { icon: '🖼️', label: 'Imágenes y archivos (uploads/)' },
              { icon: '🧾', label: 'Facturas PDF (invoices/)' },
              { icon: '🔐', label: 'Certificados AFIP/ARCA (.crt, .key)' },
              { icon: '💬', label: 'Sesión de WhatsApp (auth_state/)' },
              { icon: '📇', label: 'Contactos WhatsApp (contacts_cache)' },
              { icon: '⚙️', label: 'Configuración de plataforma (API keys e infra)' },
              { icon: '🔑', label: 'service_account.json' },
            ].map((item, i) => (
              <span key={i} style={{
                padding: '3px 10px',
                borderRadius: 6,
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                fontSize: '0.76rem',
                whiteSpace: 'nowrap'
              }}>
                {item.icon} {item.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* BACKUP LIST CARD */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0 }}>Historial de Respaldos Globales</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Archivos ZIP completos generados en el servidor, listos para descargar o sincronizar bajo demanda a Google Drive.
            </p>
          </div>

          <button
            className="btn"
            onClick={handleCreateBackup}
            disabled={creatingBackup}
            style={{
              backgroundColor: 'var(--accent-emerald)',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontWeight: 600,
              padding: '8px 18px',
              borderRadius: 8
            }}
          >
            {creatingBackup ? (
              <>
                <RefreshCw size={16} className="spin" /> Creando respaldo global (puede demorar)...
              </>
            ) : (
              <>
                <span>💾</span> Crear Nuevo Respaldo Manual Completo
              </>
            )}
          </button>
        </div>

        {backupsLoading ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>Cargando respaldos globales...</p>
        ) : (
          <table className="mobile-cards data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '12px 10px' }}>Archivo</th>
                <th style={{ textAlign: 'left', padding: '12px 10px' }}>Tipo</th>
                <th style={{ textAlign: 'left', padding: '12px 10px' }}>Contenido</th>
                <th style={{ textAlign: 'left', padding: '12px 10px' }}>Fecha</th>
                <th style={{ textAlign: 'left', padding: '12px 10px' }}>Tamaño</th>
                <th style={{ textAlign: 'left', padding: '12px 10px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {backups.map(b => {
                const isAuto = b.type === 'auto' || b.id.includes('auto_')
                const c = b.main_file?.contents || {}
                return (
                  <tr key={b.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td data-label="Archivo" style={{ padding: '12px 10px', fontSize: '0.82rem', fontWeight: 600 }}>
                      {b.id}
                    </td>
                    <td data-label="Tipo" style={{ padding: '12px 10px', fontSize: '0.82rem' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '0.73rem',
                        fontWeight: '600',
                        backgroundColor: isAuto ? 'rgba(139, 92, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        color: isAuto ? 'var(--accent-purple)' : 'var(--accent-emerald)',
                        border: `1px solid ${isAuto ? 'rgba(139, 92, 246, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
                      }}>
                        {isAuto ? 'Automático' : 'Manual'}
                      </span>
                    </td>
                    <td data-label="Contenido" style={{ padding: '12px 10px', fontSize: '0.82rem' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {c.database !== false && <span title="Base de datos (todos los tenants)" style={{ cursor: 'default' }}>🗄️</span>}
                        {b.media_file && <span title="Uploads (imágenes, PDFs)" style={{ cursor: 'default' }}>🖼️</span>}
                        {c.invoices && <span title="Facturas" style={{ cursor: 'default' }}>🧾</span>}
                        {c.afip_certs && <span title="Certificados AFIP/ARCA" style={{ cursor: 'default' }}>🔐</span>}
                        {c.whatsapp_session && <span title="Sesión WhatsApp" style={{ cursor: 'default' }}>💬</span>}
                        {c.whatsapp_contacts && <span title="Contactos WhatsApp" style={{ cursor: 'default' }}>📇</span>}
                        {c.platform_config && <span title="Config Plataforma (Developer)" style={{ cursor: 'default' }}>⚙️</span>}
                        {c.service_account && <span title="Service Account (Google)" style={{ cursor: 'default' }}>🔑</span>}
                        {!b.main_file?.contents && <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }} title="Backup legacy sin manifiesto">v1</span>}
                      </div>
                    </td>
                    <td data-label="Fecha" style={{ padding: '12px 10px', fontSize: '0.82rem' }}>
                      {formatDateTimeAR(b.created_at)}
                    </td>
                    <td data-label="Tamaño" style={{ padding: '12px 10px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      {b.main_file && <div>Sis: {(b.main_file.size_bytes / (1024 * 1024)).toFixed(2)} MB</div>}
                      {b.media_file && <div style={{ color: 'var(--text-secondary)' }}>Med: {(b.media_file.size_bytes / (1024 * 1024)).toFixed(2)} MB</div>}
                    </td>
                    <td data-label="Acciones" style={{ padding: '12px 10px', fontSize: '0.82rem', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {b.main_file && (
                        <button
                          onClick={() => handleDownloadBackup(b.main_file.filename)}
                          className="btn"
                          style={{ padding: '4px 8px', fontSize: '0.73rem', backgroundColor: 'var(--accent-blue)', color: '#fff', border: 'none', cursor: 'pointer' }}
                          title="Descargar Sistema Completo (SQL + Configs)"
                        >
                          ⬇ Sist.
                        </button>
                      )}
                      {b.media_file && (
                        <button
                          onClick={() => handleDownloadBackup(b.media_file.filename)}
                          className="btn"
                          style={{ padding: '4px 8px', fontSize: '0.73rem', backgroundColor: 'var(--accent-purple)', color: '#fff', border: 'none', cursor: 'pointer' }}
                          title="Descargar Archivos Multimedia (Uploads)"
                        >
                          ⬇ Med.
                        </button>
                      )}
                      <button
                        onClick={() => handleUploadToDrive(b.id)}
                        disabled={uploadingToDrive[b.id]}
                        className="btn"
                        style={{
                          padding: '4px 8px',
                          fontSize: '0.73rem',
                          backgroundColor: '#0284c7',
                          color: '#fff',
                          border: 'none',
                          cursor: uploadingToDrive[b.id] ? 'not-allowed' : 'pointer'
                        }}
                        title="Subir este respaldo a Google Drive"
                      >
                        {uploadingToDrive[b.id] ? '⏳ Subiendo...' : '☁️ Drive'}
                      </button>
                      <button
                        onClick={() => handleDeleteBackup(b.id)}
                        className="btn"
                        style={{
                          padding: '4px 8px',
                          fontSize: '0.73rem',
                          backgroundColor: 'rgba(239, 68, 68, 0.15)',
                          color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          cursor: 'pointer'
                        }}
                        title="Eliminar este respaldo del servidor"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {backups.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No hay respaldos globales creados aún.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* RESTORE SYSTEM CARD */}
      <div className="card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <RefreshCw size={18} style={{ color: 'var(--accent-red)' }} />
          Restaurar Sistema Completo desde Respaldo Global
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '6px 0 16px' }}>
          Sube un archivo ZIP de respaldo para restaurar íntegramente el sistema: base de datos completa de PostgreSQL, configuraciones de inquilinos, archivos, certificados AFIP y sesión de WhatsApp.
        </p>

        {/* Warning Alert */}
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 8,
          padding: '14px 18px',
          marginBottom: 18,
          fontSize: '0.84rem',
          lineHeight: 1.5,
        }}>
          <strong style={{ color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={16} /> Advertencias críticas para la plataforma:
          </strong>
          <ul style={{ margin: '8px 0 0 18px', padding: 0, color: 'var(--text-secondary)' }}>
            <li>Al restaurar el <strong>ZIP del sistema</strong>, esta acción <strong>reemplaza todos los datos actuales</strong> de la base de datos (afecta a todos los inquilinos).</li>
            <li>Si subís un <strong>ZIP de medios</strong> (fotos/reels), solo se agregarán o actualizarán las imágenes, <strong>sin reiniciar la base de datos</strong>.</li>
            <li>Se crea automáticamente un punto de restauración previo antes de aplicar los cambios.</li>
          </ul>
        </div>

        {/* File Input */}
        <div style={{
          border: '2px dashed var(--border-color)',
          borderRadius: 10,
          padding: '25px 20px',
          textAlign: 'center',
          marginBottom: 18,
          backgroundColor: restoreFile ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-dark)',
          transition: 'all 0.2s ease',
        }}>
          <input
            type="file"
            accept=".zip"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) setRestoreFile(f)
            }}
            id="global-restore-file-input"
            style={{ display: 'none' }}
          />
          <label htmlFor="global-restore-file-input" style={{ cursor: 'pointer', display: 'block' }}>
            {restoreFile ? (
              <div>
                <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>📦</div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{restoreFile.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  {(restoreFile.size / (1024 * 1024)).toFixed(2)} MB — Clic para cambiar archivo
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>📁</div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Clic aquí para seleccionar archivo ZIP de respaldo</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>o arrastra y soltá el archivo aquí</div>
              </div>
            )}
          </label>
        </div>

        {restoreFile && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={handleRestore}
              disabled={restoring}
              className="btn"
              style={{
                backgroundColor: 'var(--accent-red)',
                color: '#fff',
                padding: '8px 20px',
                fontWeight: 600,
                fontSize: '0.88rem'
              }}
            >
              {restoring ? 'Restaurando sistema (no cierres esta ventana)...' : '🔄 Confirmar y Restaurar Sistema'}
            </button>
            <button
              onClick={() => setRestoreFile(null)}
              className="btn"
              style={{ fontSize: '0.85rem' }}
            >
              Cancelar
            </button>
          </div>
        )}

        {restoreResult && (
          <div style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 8,
            backgroundColor: restoreResult.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${restoreResult.success ? '#22c55e' : '#ef4444'}`,
            fontSize: '0.85rem'
          }}>
            {restoreResult.success ? (
              <span style={{ color: '#22c55e', fontWeight: 600 }}>✅ {restoreResult.message}</span>
            ) : (
              <span style={{ color: '#ef4444', fontWeight: 600 }}>❌ Error al restaurar: {restoreResult.error}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
