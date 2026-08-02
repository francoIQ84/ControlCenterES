import React, { useEffect, useState } from 'react'
import { Building2, Plus, RefreshCw, ShieldCheck, X, Copy, Check } from 'lucide-react'
import { useTenant } from '../TenantContext'
import BrandLogo from '../components/BrandLogo'

/**
 * Panel de administración de la plataforma: alta y gestión de inquilinos.
 *
 * Solo visible para el Tenant Maestro. El backend lo exige igual con
 * require_platform_admin: esconder el menú no es un control de acceso.
 */

const ALL_MODULES = [
  { id: 'dashboard', label: 'Métricas' },
  { id: 'inventory', label: 'Inventario' },
  { id: 'sales', label: 'Ventas' },
  { id: 'billing', label: 'Facturación AFIP' },
  { id: 'expenses', label: 'Finanzas' },
  { id: 'customers', label: 'Clientes' },
  { id: 'media', label: 'Archivos' },
  { id: 'settings', label: 'Configuración' },
  { id: 'inpi', label: 'Propiedad Industrial' },
  { id: 'marketing', label: 'Marketing & Redes' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'storefront', label: 'Tienda Web' },
  { id: 'blog', label: 'Blog' },
]

const DEFAULT_MODULES = ['dashboard', 'inventory', 'sales', 'customers',
  'expenses', 'media', 'settings']

const STATUS_STYLE = {
  active: { bg: 'rgba(16, 185, 129, 0.12)', color: 'var(--accent-emerald)', label: 'Activo' },
  trial: { bg: 'rgba(37, 99, 235, 0.12)', color: 'var(--accent-blue)', label: 'Prueba' },
  suspended: { bg: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', label: 'Suspendido' },
  cancelled: { bg: 'rgba(239, 68, 68, 0.12)', color: 'var(--accent-red)', label: 'Cancelado' },
}

function StatusBadge({ status }) {
  const style = STATUS_STYLE[status] || STATUS_STYLE.cancelled
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem',
      fontWeight: 700, backgroundColor: style.bg, color: style.color,
    }}>{style.label}</span>
  )
}

export default function Tenants() {
  const { isPlatformAdmin, loading: tenantLoading } = useTenant()
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [created, setCreated] = useState(null)
  const [copied, setCopied] = useState(false)

  const [form, setForm] = useState({
    slug: '', name: '', cuit: '', plan_id: 'starter',
    admin_username: 'admin', admin_password: '', admin_full_name: 'Administrador',
    active_modules: DEFAULT_MODULES,
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const fetchTenants = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tenants/')
      if (res.ok) {
        setTenants(await res.json())
        setError(null)
      } else {
        const body = await res.json().catch(() => ({}))
        setError(body.detail || `HTTP ${res.status}`)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (isPlatformAdmin) fetchTenants() }, [isPlatformAdmin])

  const toggleModule = (id) => {
    setForm(f => ({
      ...f,
      active_modules: f.active_modules.includes(id)
        ? f.active_modules.filter(m => m !== id)
        : [...f.active_modules, id],
    }))
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch('/api/tenants/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const body = await res.json()
      if (res.ok) {
        setCreated({ ...body, password: form.admin_password })
        setShowForm(false)
        setForm(f => ({ ...f, slug: '', name: '', cuit: '', admin_password: '' }))
        fetchTenants()
      } else {
        // FastAPI devuelve los errores de validación como lista de objetos
        const detail = body.detail
        setFormError(Array.isArray(detail)
          ? detail.map(d => d.msg).join(' · ')
          : (detail || `HTTP ${res.status}`))
      }
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (slug, status) => {
    const res = await fetch(`/api/tenants/${slug}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      alert(body.detail || 'No se pudo cambiar el estado')
    }
    fetchTenants()
  }

  if (tenantLoading) return <div className="card">Cargando…</div>

  if (!isPlatformAdmin) {
    return (
      <div className="card" style={{ padding: '30px', textAlign: 'center' }}>
        <ShieldCheck size={36} style={{ color: 'var(--text-secondary)', marginBottom: 10 }} />
        <h3 style={{ margin: '0 0 6px' }}>Sección de plataforma</h3>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          La administración de inquilinos está reservada a la cuenta de plataforma.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          {/* Superficie de plataforma: acá manda la marca del producto, no la
              del inquilino que esté operando. */}
          <BrandLogo height={34} style={{ marginBottom: 10, alignItems: 'flex-start' }} />
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Building2 size={26} /> Inquilinos
          </h1>
          <p className="page-subtitle">
            Alta y administración de los negocios que operan sobre la plataforma.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-icon" onClick={fetchTenants} title="Actualizar">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className="btn" onClick={() => { setShowForm(!showForm); setCreated(null) }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} /> Nuevo inquilino
          </button>
        </div>
      </div>

      {created && (
        <div className="card" style={{ marginTop: 16, borderLeft: '4px solid var(--accent-emerald)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ margin: '0 0 8px' }}>Inquilino creado</h3>
              <p style={{ margin: '0 0 4px' }}>
                <strong>{created.tenant.name}</strong> quedó en estado de prueba.
              </p>
              <p style={{ margin: '0 0 4px', fontSize: '0.9rem' }}>
                Acceso: <code>{created.url}</code>
              </p>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                Usuario <code>{created.admin_username}</code> · contraseña <code>{created.password}</code>
              </p>
              <p style={{ margin: '10px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Guardá la contraseña ahora: no vuelve a mostrarse. Para que el
                subdominio resuelva, el DNS debe apuntar al servidor.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-icon" title="Copiar los datos de acceso"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${created.url}\nUsuario: ${created.admin_username}\nContraseña: ${created.password}`)
                  setCopied(true); setTimeout(() => setCopied(false), 2000)
                }}>
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
              <button className="btn-icon" onClick={() => setCreated(null)}><X size={18} /></button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <form className="card" style={{ marginTop: 16 }} onSubmit={handleCreate}>
          <h3 style={{ marginTop: 0 }}>Nuevo inquilino</h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <label>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Subdominio</span>
              <input required value={form.slug} placeholder="acme"
                     onChange={e => setForm({ ...form, slug: e.target.value })}
                     style={{ width: '100%' }} />
              <small style={{ color: 'var(--text-secondary)' }}>
                {form.slug ? `${form.slug}.controlcenter.app` : 'minúsculas, números y guiones'}
              </small>
            </label>
            <label>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Razón social</span>
              <input required value={form.name} placeholder="Acme SRL"
                     onChange={e => setForm({ ...form, name: e.target.value })}
                     style={{ width: '100%' }} />
            </label>
            <label>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>CUIT</span>
              <input value={form.cuit} placeholder="30-11111111-7"
                     onChange={e => setForm({ ...form, cuit: e.target.value })}
                     style={{ width: '100%' }} />
            </label>
            <label>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Plan</span>
              <select value={form.plan_id} style={{ width: '100%' }}
                      onChange={e => setForm({ ...form, plan_id: e.target.value })}>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </label>
            <label>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Usuario administrador</span>
              <input required value={form.admin_username} style={{ width: '100%' }}
                     onChange={e => setForm({ ...form, admin_username: e.target.value })} />
            </label>
            <label>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Contraseña inicial</span>
              <input required type="text" minLength={8} value={form.admin_password}
                     placeholder="mínimo 8 caracteres" style={{ width: '100%' }}
                     onChange={e => setForm({ ...form, admin_password: e.target.value })} />
            </label>
          </div>

          <div style={{ marginTop: 18 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Módulos contratados</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {ALL_MODULES.map(m => {
                const on = form.active_modules.includes(m.id)
                return (
                  <button type="button" key={m.id} onClick={() => toggleModule(m.id)}
                    style={{
                      padding: '5px 12px', borderRadius: 14, fontSize: '0.78rem',
                      fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${on ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                      backgroundColor: on ? 'var(--accent-blue)' : 'transparent',
                      color: on ? '#fff' : 'var(--text-secondary)',
                    }}>{m.label}</button>
                )
              })}
            </div>
          </div>

          {formError && (
            <p style={{ color: 'var(--accent-red)', marginTop: 14, fontSize: '0.85rem' }}>
              {formError}
            </p>
          )}

          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? 'Creando…' : 'Crear inquilino'}
            </button>
            <button className="btn-icon" type="button" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        {error && <p style={{ color: 'var(--accent-red)' }}>{error}</p>}
        {loading && !tenants.length ? <p>Cargando inquilinos…</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Inquilino</th><th>Subdominio</th><th>CUIT</th>
                  <th>Plan</th><th>Módulos</th><th>Estado</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map(t => (
                  <tr key={t.id}>
                    <td><strong>{t.name}</strong></td>
                    <td><code>{t.slug}</code></td>
                    <td>{t.cuit || '—'}</td>
                    <td>{t.plan_id}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {(t.active_modules || []).length} módulos
                    </td>
                    <td><StatusBadge status={t.status} /></td>
                    <td>
                      {t.plan_id === 'master' ? (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          Operación propia
                        </span>
                      ) : t.status === 'suspended' ? (
                        <button className="btn-icon" onClick={() => changeStatus(t.slug, 'active')}>
                          Reactivar
                        </button>
                      ) : (
                        <button className="btn-icon" onClick={() => changeStatus(t.slug, 'suspended')}>
                          Suspender
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!tenants.length && !loading && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Todavía no hay inquilinos dados de alta.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
