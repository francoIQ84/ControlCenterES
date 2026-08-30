import React, { useEffect, useState } from 'react'
import {
  Building2, Plus, RefreshCw, ShieldCheck, X, Copy, Check,
  Sliders, Edit3, CheckCircle2, Zap, AlertCircle, CreditCard,
  QrCode, ExternalLink, Send, History, Calendar, DollarSign, Phone, Mail,
  Layers, Package, FileText, HardDrive, Sparkles, ChevronDown, ChevronUp
} from 'lucide-react'
import { useTenant } from '../TenantContext'
import BrandLogo from '../components/BrandLogo'

const ALL_MODULES = [
  { id: 'dashboard', label: 'Métricas', desc: 'Panel principal y estadísticas de ventas' },
  { id: 'inventory', label: 'Inventario', desc: 'Gestión de productos, stock y sincronización MeLi' },
  { id: 'sales', label: 'Ventas', desc: 'Control de pedidos, mostrador y cobros' },
  { id: 'billing', label: 'Facturación AFIP', desc: 'Emisión electrónica de facturas y CAE' },
  { id: 'expenses', label: 'Finanzas', desc: 'Gastos fijos, variables, ingresos y balances' },
  { id: 'customers', label: 'Clientes & CRM', desc: 'Base de datos unificada, consultas y contactos' },
  { id: 'media', label: 'Archivos', desc: 'Gestor multimedia y documentos' },
  { id: 'settings', label: 'Configuración', desc: 'Ajustes del sistema e integraciones' },
  { id: 'marketing', label: 'Marketing & Redes', desc: 'Generador IA, campañas y redes sociales' },
  { id: 'whatsapp', label: 'WhatsApp Bot', desc: 'Respuestas automáticas e historial' },
  { id: 'inpi', label: 'Propiedad Industrial', desc: 'Monitoreo de marcas y alertas INPI' },
  { id: 'storefront', label: 'Tienda Web', desc: 'Catálogo online y e-commerce propio' },
  { id: 'blog', label: 'Blog & Web', desc: 'Gestor de artículos y contenidos web' },
]

const DEFAULT_MODULES = ['dashboard', 'inventory', 'sales', 'customers',
  'expenses', 'media', 'settings']

const PLAN_PRESETS = {
  starter: {
    id: 'starter',
    label: 'Starter (Básico)',
    badgeColor: 'var(--accent-blue)',
    defaultPrice: 35000,
    limits: [
      'Hasta 150 productos',
      'Hasta 500 ventas / mes',
      '1 GB Almacenamiento'
    ],
    features: ['Catálogo & Stock', 'Ventas & Clientes', 'Gastos & Balances', 'Panel de Métricas'],
    description: 'Gestión esencial: Métricas, Inventario, Ventas, Clientes, Finanzas y Ajustes.',
    modules: ['dashboard', 'inventory', 'sales', 'customers', 'expenses', 'settings']
  },
  pro: {
    id: 'pro',
    label: 'Pro (Intermedio)',
    badgeColor: '#8b5cf6',
    defaultPrice: 65000,
    limits: [
      'Hasta 1.000 productos',
      'Hasta 3.000 facturas / mes',
      '5 GB Almacenamiento'
    ],
    features: ['Todo lo de Starter', 'Facturación Electrónica AFIP', 'Marketing IA & Redes', 'Bot de WhatsApp'],
    description: 'Incluye Facturación AFIP, Archivos, Marketing & Redes y WhatsApp Bot.',
    modules: ['dashboard', 'inventory', 'sales', 'billing', 'expenses', 'customers', 'media', 'settings', 'marketing', 'whatsapp']
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise (Full)',
    badgeColor: 'var(--accent-emerald)',
    defaultPrice: 190000,
    limits: [
      'Productos ilimitados',
      'Ventas y facturas ilimitadas',
      '20 GB Almacenamiento'
    ],
    features: ['Todo lo de Pro', 'Tienda Web E-commerce', 'Blog & Artículos Web', 'Monitoreo INPI Marcas'],
    description: 'Acceso total con Tienda Web, Blog y Monitoreo de Marcas en INPI.',
    modules: ['dashboard', 'inventory', 'sales', 'billing', 'expenses', 'customers', 'media', 'settings', 'inpi', 'marketing', 'whatsapp', 'storefront', 'blog']
  },
  custom: {
    id: 'custom',
    label: 'Personalizado',
    badgeColor: '#f59e0b',
    defaultPrice: 50000,
    limits: [
      'Límites a medida',
      'Módulos seleccionados',
      'Capacidad flexible'
    ],
    features: ['Configuración modular acordada'],
    description: 'Selección manual de módulos y precio acordado con el cliente.',
    modules: []
  }
}

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

function PlanBadge({ planId }) {
  if (planId === 'master') {
    return (
      <span style={{
        padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem',
        fontWeight: 700, backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)',
        display: 'inline-flex', alignItems: 'center', gap: 4
      }}>
        <Zap size={12} /> Master (Full)
      </span>
    )
  }
  const preset = PLAN_PRESETS[planId] || PLAN_PRESETS.custom
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem',
      fontWeight: 700, backgroundColor: `${preset.badgeColor}20`, color: preset.badgeColor,
      display: 'inline-flex', alignItems: 'center', gap: 4
    }}>
      {preset.label.split(' ')[0]}
    </span>
  )
}

function DueDateBadge({ dateStr, isMaster }) {
  if (isMaster) {
    return <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Permanente</span>
  }
  if (!dateStr) {
    return <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Sin vencimiento</span>
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDate = new Date(dateStr + 'T00:00:00')
  const diffDays = Math.round((dueDate - today) / (1000 * 60 * 60 * 24))
  const formattedDate = dueDate.toLocaleDateString('es-AR')

  if (diffDays > 5) {
    return (
      <span style={{
        padding: '3px 8px', borderRadius: '10px', fontSize: '0.75rem',
        backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-emerald)', fontWeight: 600
      }}>
        {formattedDate} ({diffDays}d)
      </span>
    )
  }
  if (diffDays >= 0) {
    return (
      <span style={{
        padding: '3px 8px', borderRadius: '10px', fontSize: '0.75rem',
        backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#d97706', fontWeight: 700
      }}>
        {diffDays === 0 ? '¡Vence Hoy!' : `Vence en ${diffDays}d`} ({formattedDate})
      </span>
    )
  }
  return (
    <span style={{
      padding: '3px 8px', borderRadius: '10px', fontSize: '0.75rem',
      backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-red)', fontWeight: 700
    }}>
      Vencido hace {Math.abs(diffDays)}d ({formattedDate})
    </span>
  )
}

export default function Tenants() {
  const { isPlatformAdmin, loading: tenantLoading } = useTenant()
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // UI States
  const [showPlansBanner, setShowPlansBanner] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingTenant, setEditingTenant] = useState(null)
  const [billingTenant, setBillingTenant] = useState(null)
  const [created, setCreated] = useState(null)
  const [copied, setCopied] = useState(false)

  // Creation Form
  const [form, setForm] = useState({
    slug: '', name: '', cuit: '', plan_id: 'starter',
    plan_price: 35000, billing_cycle: 'monthly',
    admin_email: '', admin_phone: '', next_billing_date: '',
    admin_username: 'admin', admin_password: '', admin_full_name: 'Administrador',
    active_modules: PLAN_PRESETS.starter.modules,
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  // Edit / Upgrade / Downgrade Form
  const [editForm, setEditForm] = useState({
    slug: '', name: '', cuit: '', plan_id: 'starter',
    plan_price: 35000, billing_cycle: 'monthly',
    admin_email: '', admin_phone: '', next_billing_date: '',
    status: 'active', active_modules: [],
  })
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState(null)
  const [editSuccess, setEditSuccess] = useState(false)

  // Payment Link & History Modal State
  const [paymentLinkData, setPaymentLinkData] = useState(null)
  const [loadingLink, setLoadingLink] = useState(false)
  const [paymentHistory, setPaymentHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [activeBillingTab, setActiveBillingTab] = useState('link')

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

  // Presets selector for creation
  const handleSelectCreationPlan = (planId) => {
    const preset = PLAN_PRESETS[planId]
    if (preset && planId !== 'custom') {
      setForm(f => ({
        ...f,
        plan_id: planId,
        plan_price: preset.defaultPrice,
        active_modules: [...preset.modules]
      }))
    } else {
      setForm(f => ({ ...f, plan_id: 'custom' }))
    }
  }

  const toggleModuleCreation = (id) => {
    setForm(f => {
      const next = f.active_modules.includes(id)
        ? f.active_modules.filter(m => m !== id)
        : [...f.active_modules, id]
      return {
        ...f,
        active_modules: next,
        plan_id: 'custom'
      }
    })
  }

  // Presets selector for edit modal
  const handleSelectEditPlan = (planId) => {
    const preset = PLAN_PRESETS[planId]
    if (preset && planId !== 'custom') {
      setEditForm(f => ({
        ...f,
        plan_id: planId,
        plan_price: f.billing_cycle === 'annual' ? preset.defaultPrice * 10 : preset.defaultPrice,
        active_modules: [...preset.modules]
      }))
    } else {
      setEditForm(f => ({ ...f, plan_id: 'custom' }))
    }
  }

  const toggleModuleEdit = (id) => {
    setEditForm(f => {
      const next = f.active_modules.includes(id)
        ? f.active_modules.filter(m => m !== id)
        : [...f.active_modules, id]
      return {
        ...f,
        active_modules: next,
        plan_id: 'custom'
      }
    })
  }

  const openEditModal = (t) => {
    setEditingTenant(t)
    setEditError(null)
    setEditSuccess(false)
    setEditForm({
      slug: t.slug,
      name: t.name,
      cuit: t.cuit || '',
      plan_id: t.plan_id || 'starter',
      plan_price: t.plan_price || (PLAN_PRESETS[t.plan_id]?.defaultPrice || 35000),
      billing_cycle: t.billing_cycle || 'monthly',
      admin_email: t.admin_email || '',
      admin_phone: t.admin_phone || '',
      next_billing_date: t.next_billing_date || '',
      status: t.status || 'active',
      active_modules: t.active_modules || [],
    })
  }

  const openBillingModal = async (t) => {
    setBillingTenant(t)
    setPaymentLinkData(null)
    setActiveBillingTab('link')
    generatePaymentLinkForTenant(t.slug)
    fetchPaymentHistoryForTenant(t.slug)
  }

  const generatePaymentLinkForTenant = async (slug) => {
    setLoadingLink(true)
    try {
      const res = await fetch(`/api/tenants/${slug}/generate-payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      if (res.ok) {
        setPaymentLinkData(await res.json())
      }
    } catch (e) {
      console.error("Error generating payment link:", e)
    } finally {
      setLoadingLink(false)
    }
  }

  const fetchPaymentHistoryForTenant = async (slug) => {
    setLoadingHistory(true)
    try {
      const res = await fetch(`/api/tenants/${slug}/payments`)
      if (res.ok) {
        const data = await res.json()
        setPaymentHistory(data.payments || [])
      }
    } catch (e) {
      console.error("Error fetching payment history:", e)
    } finally {
      setLoadingHistory(false)
    }
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
        setForm({
          slug: '', name: '', cuit: '', admin_password: '',
          admin_email: '', admin_phone: '', next_billing_date: '',
          plan_price: 35000, billing_cycle: 'monthly',
          plan_id: 'starter', active_modules: PLAN_PRESETS.starter.modules
        })
        fetchTenants()
      } else {
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

  const handleUpdateTenant = async (e) => {
    e.preventDefault()
    if (!editingTenant) return
    setSavingEdit(true)
    setEditError(null)
    try {
      const res = await fetch(`/api/tenants/${editingTenant.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      const body = await res.json()
      if (res.ok) {
        setEditSuccess(true)
        setTimeout(() => {
          setEditingTenant(null)
          setEditSuccess(false)
        }, 1200)
        fetchTenants()
      } else {
        const detail = body.detail
        setEditError(Array.isArray(detail)
          ? detail.map(d => d.msg).join(' · ')
          : (detail || `HTTP ${res.status}`))
      }
    } catch (err) {
      setEditError(err.message)
    } finally {
      setSavingEdit(false)
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

  if (tenantLoading) return <div className="card" style={{ padding: 30, textAlign: 'center' }}>Cargando…</div>

  if (!isPlatformAdmin) {
    return (
      <div className="card" style={{ padding: '30px', textAlign: 'center' }}>
        <ShieldCheck size={36} style={{ color: 'var(--text-secondary)', marginBottom: 10 }} />
        <h3 style={{ margin: '0 0 6px' }}>Sección de plataforma</h3>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          La administración de negocios está reservada a la cuenta de plataforma.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <BrandLogo height={34} style={{ marginBottom: 10, alignItems: 'flex-start' }} />
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Building2 size={26} /> Negocios & Suscripciones
          </h1>
          <p className="page-subtitle">
            Alta, administración, planes, límites de uso y cobros automáticos de suscripción con Mercado Pago.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-icon"
            onClick={() => setShowPlansBanner(!showPlansBanner)}
            title="Ver comparativa de planes y límites"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
          >
            <Layers size={16} />
            {showPlansBanner ? 'Ocultar Planes' : 'Ver Planes & Límites'}
            {showPlansBanner ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button className="btn-icon" onClick={fetchTenants} title="Actualizar">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className="btn" onClick={() => { setShowForm(!showForm); setCreated(null); setEditingTenant(null); setBillingTenant(null) }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} /> Nuevo negocio
          </button>
        </div>
      </div>

      {/* BANNER COMPARATIVO DE PLANES Y LÍMITES */}
      {showPlansBanner && (
        <div className="card" style={{ marginTop: 16, backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.05rem' }}>
              <Layers size={18} style={{ color: 'var(--accent-blue)' }} />
              Estructura Oficial de Planes, Precios y Recursos
            </h3>
            <button className="btn-icon" onClick={() => setShowPlansBanner(false)}>
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            {/* Starter */}
            <div style={{
              backgroundColor: 'var(--bg-card)', border: '1px solid rgba(37, 99, 235, 0.3)',
              borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, color: 'var(--accent-blue)', fontSize: '1.1rem' }}>
                  🥉 Starter
                </span>
                <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>
                  $35.000 <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>/mes</span>
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '4px 0 12px' }}>
                Para negocios iniciales que buscan ordenar stock y caja.
              </div>
              <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Package size={14} style={{ color: 'var(--accent-blue)' }} /> Hasta 150 productos
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FileText size={14} style={{ color: 'var(--accent-blue)' }} /> Hasta 500 ventas / mes
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <HardDrive size={14} style={{ color: 'var(--accent-blue)' }} /> 1 GB Almacenamiento
                </div>
              </div>
              <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: 10, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <strong>Incluye:</strong> Métricas, Inventario, Ventas, Clientes, Finanzas y Ajustes.
              </div>
            </div>

            {/* Pro */}
            <div style={{
              backgroundColor: 'var(--bg-card)', border: '2px solid #8b5cf6',
              borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', position: 'relative'
            }}>
              <div style={{
                position: 'absolute', top: -10, right: 14, backgroundColor: '#8b5cf6', color: '#fff',
                fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '10px'
              }}>
                MÁS POPULAR
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, color: '#8b5cf6', fontSize: '1.1rem' }}>
                  🥈 Pro
                </span>
                <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>
                  $65.000 <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>/mes</span>
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '4px 0 12px' }}>
                Para comercios activos con facturación fiscal y automatizaciones.
              </div>
              <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Package size={14} style={{ color: '#8b5cf6' }} /> Hasta 1.000 productos
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FileText size={14} style={{ color: '#8b5cf6' }} /> Hasta 3.000 facturas / mes
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <HardDrive size={14} style={{ color: '#8b5cf6' }} /> 5 GB Almacenamiento
                </div>
              </div>
              <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: 10, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <strong>Incluye:</strong> Todo Starter + Facturación AFIP, Marketing IA, WhatsApp Bot y Archivos.
              </div>
            </div>

            {/* Enterprise */}
            <div style={{
              backgroundColor: 'var(--bg-card)', border: '1px solid rgba(16, 185, 129, 0.4)',
              borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, color: 'var(--accent-emerald)', fontSize: '1.1rem' }}>
                  🥇 Enterprise
                </span>
                <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>
                  $190.000 <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>/mes</span>
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '4px 0 12px' }}>
                Para empresas grandes, distribuidoras y marcas consolidadas.
              </div>
              <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={14} style={{ color: 'var(--accent-emerald)' }} /> <strong>Productos ilimitados</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={14} style={{ color: 'var(--accent-emerald)' }} /> <strong>Ventas y facturas ilimitadas</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <HardDrive size={14} style={{ color: 'var(--accent-emerald)' }} /> 20 GB Almacenamiento
                </div>
              </div>
              <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: 10, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <strong>Incluye:</strong> Todo Pro + Tienda Web E-commerce, Blog y Monitoreo de Marcas en INPI.
              </div>
            </div>
          </div>
        </div>
      )}

      {created && (
        <div className="card" style={{ marginTop: 16, borderLeft: '4px solid var(--accent-emerald)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ margin: '0 0 8px' }}>Negocio creado con éxito</h3>
              <p style={{ margin: '0 0 4px' }}>
                <strong>{created.tenant.name}</strong> quedó registrado en estado de prueba (trial).
              </p>
              <p style={{ margin: '0 0 4px', fontSize: '0.9rem' }}>
                Acceso al subdominio: <code>{created.url}</code>
              </p>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                Usuario <code>{created.admin_username}</code> · Contraseña <code>{created.password}</code>
              </p>
              <p style={{ margin: '10px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Guardá la contraseña ahora: no vuelve a mostrarse en claro.
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

      {/* FORMULARIO DE ALTA DE NEGOCIO */}
      {showForm && (
        <form className="card" style={{ marginTop: 16 }} onSubmit={handleCreate}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Plus size={20} /> Alta de Nuevo Negocio
            </h3>
            <button type="button" className="btn-icon" onClick={() => setShowForm(false)}>
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <label>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Subdominio exclusivo</span>
              <input required value={form.slug} placeholder="acme"
                     onChange={e => setForm({ ...form, slug: e.target.value })}
                     style={{ width: '100%' }} />
              <small style={{ color: 'var(--text-secondary)' }}>
                {form.slug ? `${form.slug}.controlcenter.app` : 'ej: miempresa'}
              </small>
            </label>
            <label>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Razón Social / Nombre</span>
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
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Email para avisos de cobro</span>
              <input type="email" value={form.admin_email} placeholder="admin@cliente.com"
                     onChange={e => setForm({ ...form, admin_email: e.target.value })}
                     style={{ width: '100%' }} />
            </label>
            <label>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>WhatsApp para recordatorios</span>
              <input value={form.admin_phone} placeholder="5493415555555"
                     onChange={e => setForm({ ...form, admin_phone: e.target.value })}
                     style={{ width: '100%' }} />
            </label>
            <label>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Ciclo de Cobro</span>
              <select value={form.billing_cycle} style={{ width: '100%' }}
                      onChange={e => setForm({ ...form, billing_cycle: e.target.value })}>
                <option value="monthly">Mensual</option>
                <option value="annual">Anual (10 cuotas)</option>
              </select>
            </label>
            <label>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Precio del Plan ($ ARS)</span>
              <input type="number" step="1000" value={form.plan_price}
                     onChange={e => setForm({ ...form, plan_price: parseFloat(e.target.value) || 0 })}
                     style={{ width: '100%' }} />
            </label>
            <label>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Fecha límite de prueba (Vencimiento)</span>
              <input type="date" value={form.next_billing_date}
                     onChange={e => setForm({ ...form, next_billing_date: e.target.value })}
                     style={{ width: '100%' }} />
            </label>
            <label>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Usuario admin inicial</span>
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

          {/* Selector de Planes Rápidos con Límites */}
          <div style={{ marginTop: 20 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Elegir Nivel de Plan y Recursos</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 8 }}>
              {Object.values(PLAN_PRESETS).filter(p => p.id !== 'custom').map(p => {
                const isSelected = form.plan_id === p.id
                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelectCreationPlan(p.id)}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      border: `2px solid ${isSelected ? p.badgeColor : 'var(--border-color)'}`,
                      backgroundColor: isSelected ? `${p.badgeColor}15` : 'var(--bg-secondary)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: isSelected ? p.badgeColor : 'var(--text-primary)' }}>
                        {p.label}
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '0.85rem', color: isSelected ? p.badgeColor : 'var(--text-primary)' }}>
                        ${p.defaultPrice.toLocaleString('es-AR')}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {p.limits.map((l, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Check size={12} style={{ color: p.badgeColor }} /> {l}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Toggles de Módulos */}
          <div style={{ marginTop: 18 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Módulos activos ({form.active_modules.length} seleccionados):</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginTop: 8 }}>
              {ALL_MODULES.map(m => {
                const on = form.active_modules.includes(m.id)
                return (
                  <div
                    key={m.id}
                    onClick={() => toggleModuleCreation(m.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      border: `1px solid ${on ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                      backgroundColor: on ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                      userSelect: 'none'
                    }}
                  >
                    <input type="checkbox" checked={on} onChange={() => {}} style={{ cursor: 'pointer' }} />
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: on ? 'var(--accent-blue)' : 'var(--text-primary)' }}>
                      {m.label}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {formError && (
            <p style={{ color: 'var(--accent-red)', marginTop: 14, fontSize: '0.85rem' }}>
              {formError}
            </p>
          )}

          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? 'Creando…' : 'Crear negocio'}
            </button>
            <button className="btn-icon" type="button" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* MODAL DE EDICIÓN / UPGRADE / DOWNGRADE DE PLAN */}
      {editingTenant && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: '16px'
        }}>
          <div className="card" style={{
            maxWidth: '720px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
            borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.35)', padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sliders size={22} style={{ color: 'var(--accent-blue)' }} />
                  Gestionar Plan & Recursos: <span>{editingTenant.name}</span>
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Subdominio: <code>{editingTenant.slug}.controlcenter.app</code>
                </p>
              </div>
              <button className="btn-icon" onClick={() => setEditingTenant(null)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdateTenant}>
              {/* Datos Generales */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
                <label>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Razón Social</span>
                  <input
                    required
                    value={editForm.name}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </label>
                <label>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>CUIT</span>
                  <input
                    value={editForm.cuit}
                    placeholder="30-..."
                    onChange={e => setEditForm({ ...editForm, cuit: e.target.value })}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </label>
                <label>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Estado de la Cuenta</span>
                  <select
                    value={editForm.status}
                    disabled={editingTenant.plan_id === 'master'}
                    onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                    style={{ width: '100%', marginTop: 4 }}
                  >
                    <option value="active">Activo</option>
                    <option value="trial">Prueba (Trial)</option>
                    <option value="suspended">Suspendido</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </label>
                <label>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Email para avisos</span>
                  <input
                    type="email"
                    value={editForm.admin_email}
                    placeholder="contacto@cliente.com"
                    onChange={e => setEditForm({ ...editForm, admin_email: e.target.value })}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </label>
                <label>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>WhatsApp para avisos</span>
                  <input
                    value={editForm.admin_phone}
                    placeholder="549..."
                    onChange={e => setEditForm({ ...editForm, admin_phone: e.target.value })}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </label>
                <label>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Ciclo de Cobro</span>
                  <select
                    value={editForm.billing_cycle}
                    onChange={e => setEditForm({ ...editForm, billing_cycle: e.target.value })}
                    style={{ width: '100%', marginTop: 4 }}
                  >
                    <option value="monthly">Mensual</option>
                    <option value="annual">Anual</option>
                  </select>
                </label>
                <label>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Precio Cuota ($ ARS)</span>
                  <input
                    type="number"
                    step="1000"
                    value={editForm.plan_price}
                    onChange={e => setEditForm({ ...editForm, plan_price: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </label>
                <label>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Próximo Vencimiento</span>
                  <input
                    type="date"
                    value={editForm.next_billing_date}
                    onChange={e => setEditForm({ ...editForm, next_billing_date: e.target.value })}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </label>
              </div>

              {/* Selector de Upgrade / Downgrade con Presets y Límites */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                    Nivel de Plan (Upgrade / Downgrade)
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Al cambiar el plan se actualizan sus módulos y límites automáticamente
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                  {Object.values(PLAN_PRESETS).filter(p => p.id !== 'custom').map(p => {
                    const isSelected = editForm.plan_id === p.id
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => handleSelectEditPlan(p.id)}
                        style={{
                          padding: '10px',
                          borderRadius: '10px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          border: `2px solid ${isSelected ? p.badgeColor : 'var(--border-color)'}`,
                          backgroundColor: isSelected ? `${p.badgeColor}15` : 'var(--bg-secondary)',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: isSelected ? p.badgeColor : 'var(--text-primary)' }}>
                            {p.label.split(' ')[0]}
                          </div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isSelected ? p.badgeColor : 'var(--text-secondary)' }}>
                            ${p.defaultPrice.toLocaleString('es-AR')}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                          {p.limits[0]} · {p.limits[1]}
                        </div>
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => handleSelectEditPlan('custom')}
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      border: `2px solid ${editForm.plan_id === 'custom' ? '#f59e0b' : 'var(--border-color)'}`,
                      backgroundColor: editForm.plan_id === 'custom' ? '#f59e0b15' : 'var(--bg-secondary)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: '0.85rem', color: editForm.plan_id === 'custom' ? '#f59e0b' : 'var(--text-primary)' }}>
                      Personalizado
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                      Límites & Módulos a medida
                    </div>
                  </button>
                </div>
              </div>

              {/* Lista Detallada de Módulos */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                    Módulos Habilitados ({editForm.active_modules.length}/{ALL_MODULES.length})
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn-icon"
                      style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                      onClick={() => setEditForm(f => ({ ...f, active_modules: ALL_MODULES.map(m => m.id), plan_id: 'enterprise' }))}
                    >
                      Marcar todos
                    </button>
                    <button
                      type="button"
                      className="btn-icon"
                      style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                      onClick={() => setEditForm(f => ({ ...f, active_modules: DEFAULT_MODULES, plan_id: 'starter' }))}
                    >
                      Básico
                    </button>
                  </div>
                </div>

                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 8, maxHeight: '240px', overflowY: 'auto', padding: '4px'
                }}>
                  {ALL_MODULES.map(m => {
                    const active = editForm.active_modules.includes(m.id)
                    return (
                      <div
                        key={m.id}
                        onClick={() => toggleModuleEdit(m.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          padding: '10px 12px',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          border: `1px solid ${active ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                          backgroundColor: active ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-secondary)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => {}}
                          style={{ marginTop: 2, cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: active ? 'var(--accent-blue)' : 'var(--text-primary)' }}>
                            {m.label}
                          </div>
                          <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.3 }}>
                            {m.desc}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {editError && (
                <div style={{
                  marginTop: 14, padding: '10px 14px', borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-red)',
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem'
                }}>
                  <AlertCircle size={16} />
                  <span>{editError}</span>
                </div>
              )}

              {editSuccess && (
                <div style={{
                  marginTop: 14, padding: '10px 14px', borderRadius: '8px',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-emerald)',
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 600
                }}>
                  <CheckCircle2 size={16} />
                  <span>¡Plan y suscripción actualizados correctamente!</span>
                </div>
              )}

              <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setEditingTenant(null)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={savingEdit}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {savingEdit ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
                  {savingEdit ? 'Guardando…' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE LINK DE PAGO & HISTORIAL DE SUSCRIPCIONES */}
      {billingTenant && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: '16px'
        }}>
          <div className="card" style={{
            maxWidth: '620px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
            borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.35)', padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CreditCard size={22} style={{ color: 'var(--accent-emerald)' }} />
                  Cobro de Suscripción: <span>{billingTenant.name}</span>
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Plan: <strong>{billingTenant.plan_id?.toUpperCase()}</strong> · Vencimiento: <DueDateBadge dateStr={billingTenant.next_billing_date} />
                </p>
              </div>
              <button className="btn-icon" onClick={() => setBillingTenant(null)}>
                <X size={20} />
              </button>
            </div>

            {/* Tabs Modal */}
            <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border-color)', marginBottom: 18 }}>
              <button
                type="button"
                className={`btn-icon ${activeBillingTab === 'link' ? 'active' : ''}`}
                style={{
                  borderRadius: 0, borderBottom: activeBillingTab === 'link' ? '2px solid var(--accent-emerald)' : 'none',
                  color: activeBillingTab === 'link' ? 'var(--accent-emerald)' : 'var(--text-secondary)',
                  fontWeight: 600, padding: '8px 14px'
                }}
                onClick={() => setActiveBillingTab('link')}
              >
                Link de Pago Mercado Pago
              </button>
              <button
                type="button"
                className={`btn-icon ${activeBillingTab === 'history' ? 'active' : ''}`}
                style={{
                  borderRadius: 0, borderBottom: activeBillingTab === 'history' ? '2px solid var(--accent-emerald)' : 'none',
                  color: activeBillingTab === 'history' ? 'var(--accent-emerald)' : 'var(--text-secondary)',
                  fontWeight: 600, padding: '8px 14px'
                }}
                onClick={() => setActiveBillingTab('history')}
              >
                Historial de Cobros ({paymentHistory.length})
              </button>
            </div>

            {activeBillingTab === 'link' && (
              <div>
                {loadingLink ? (
                  <div style={{ textAlign: 'center', padding: '30px' }}>
                    <RefreshCw size={28} className="animate-spin" style={{ color: 'var(--accent-emerald)', margin: '0 auto 10px' }} />
                    <p>Generando link de pago en Mercado Pago...</p>
                  </div>
                ) : paymentLinkData ? (
                  <div>
                    <div style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)',
                      padding: '16px', borderRadius: '12px', marginBottom: 18
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Monto a Cobrar</div>
                          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>
                            ${paymentLinkData.amount?.toLocaleString('es-AR')} ARS
                          </div>
                        </div>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {billingTenant.billing_cycle === 'annual' ? 'Ciclo Anual' : 'Ciclo Mensual'}
                        </span>
                      </div>
                    </div>

                    {/* QR Code & Link */}
                    <div style={{ textAlign: 'center', marginBottom: 18 }}>
                      <img
                        src={paymentLinkData.qr_code_url}
                        alt="QR de Pago"
                        style={{ width: '180px', height: '180px', borderRadius: '12px', margin: '0 auto', border: '1px solid var(--border-color)' }}
                      />
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '8px 0 0' }}>
                        Escaneá con la app de Mercado Pago para pagar al instante
                      </p>
                    </div>

                    <label style={{ display: 'block', marginBottom: 16 }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Link directo de Checkout Pro:</span>
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <input
                          readOnly
                          value={paymentLinkData.init_point}
                          style={{ width: '100%', fontSize: '0.85rem' }}
                        />
                        <button
                          type="button"
                          className="btn-icon"
                          title="Copiar link"
                          onClick={() => {
                            navigator.clipboard.writeText(paymentLinkData.init_point)
                            setCopied(true)
                            setTimeout(() => setCopied(false), 2000)
                          }}
                        >
                          {copied ? <Check size={18} /> : <Copy size={18} />}
                        </button>
                        <a
                          href={paymentLinkData.init_point}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-icon"
                          title="Abrir en Mercado Pago"
                          style={{ display: 'inline-flex', alignItems: 'center' }}
                        >
                          <ExternalLink size={18} />
                        </a>
                      </div>
                    </label>

                    {/* Botón para enviar por WhatsApp */}
                    {billingTenant.admin_phone && (
                      <div style={{ marginTop: 16 }}>
                        <a
                          href={`https://wa.me/${billingTenant.admin_phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                            `Hola ${billingTenant.name}, te compartimos el link para abonar la suscripción de ControlCenterES (${billingTenant.plan_id?.toUpperCase()}): ${paymentLinkData.init_point}`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn"
                          style={{
                            width: '100%',
                            backgroundColor: '#25D366',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            padding: '10px'
                          }}
                        >
                          <Send size={18} />
                          Enviar Link por WhatsApp ({billingTenant.admin_phone})
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    <p style={{ color: 'var(--accent-red)' }}>No se pudo generar el link de pago.</p>
                    <button className="btn" onClick={() => generatePaymentLinkForTenant(billingTenant.slug)}>
                      Reintentar
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeBillingTab === 'history' && (
              <div>
                {loadingHistory ? (
                  <p style={{ textAlign: 'center', padding: '20px' }}>Cargando pagos recibidos...</p>
                ) : paymentHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                    <History size={36} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                    <p>Todavía no hay pagos registrados para este negocio.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Monto</th>
                          <th>Período Cubierto</th>
                          <th>Comprobante MP</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentHistory.map(p => (
                          <tr key={p.id}>
                            <td>{new Date(p.created_at).toLocaleDateString('es-AR')}</td>
                            <td><strong>${p.amount?.toLocaleString('es-AR')} {p.currency}</strong></td>
                            <td style={{ fontSize: '0.78rem' }}>
                              {p.period_start} al {p.period_end}
                            </td>
                            <td><code>{p.mp_payment_id || '—'}</code></td>
                            <td><StatusBadge status="active" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 20, textAlign: 'right' }}>
              <button className="btn-icon" onClick={() => setBillingTenant(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TABLA PRINCIPAL DE NEGOCIOS */}
      <div className="card" style={{ marginTop: 16 }}>
        {error && <p style={{ color: 'var(--accent-red)' }}>{error}</p>}
        {loading && !tenants.length ? <p>Cargando negocios…</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Negocio</th>
                  <th>Subdominio</th>
                  <th>Plan Actual</th>
                  <th>Vencimiento</th>
                  <th>Módulos</th>
                  <th>Contacto</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map(t => {
                  const isMaster = t.plan_id === 'master'
                  return (
                    <tr key={t.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <strong>{t.name}</strong>
                          {isMaster && (
                            <span title="Operación principal de plataforma" style={{ color: 'var(--accent-emerald)', display: 'inline-flex' }}>
                              <ShieldCheck size={16} />
                            </span>
                          )}
                        </div>
                        {t.cuit && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>CUIT: {t.cuit}</div>}
                      </td>
                      <td>
                        <code>{t.slug}</code>
                      </td>
                      <td>
                        <PlanBadge planId={t.plan_id} />
                      </td>
                      <td>
                        <DueDateBadge dateStr={t.next_billing_date} isMaster={isMaster} />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => openEditModal(t)}
                          title="Ver y configurar módulos"
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                            fontSize: '0.8rem', color: 'var(--accent-blue)', fontWeight: 600,
                            display: 'inline-flex', alignItems: 'center', gap: 4
                          }}
                        >
                          {(t.active_modules || []).length} módulos
                          <Sliders size={13} />
                        </button>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.75rem' }}>
                          {t.admin_phone ? <div>📞 {t.admin_phone}</div> : null}
                          {t.admin_email ? <div style={{ color: 'var(--text-secondary)' }}>✉️ {t.admin_email}</div> : null}
                          {!t.admin_phone && !t.admin_email && <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                        </div>
                      </td>
                      <td><StatusBadge status={t.status} /></td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          {!isMaster && (
                            <button
                              className="btn-icon"
                              onClick={() => openBillingModal(t)}
                              title="Cobro & Link de Mercado Pago"
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '5px 10px', fontSize: '0.8rem', fontWeight: 600,
                                color: 'var(--accent-emerald)'
                              }}
                            >
                              <CreditCard size={14} /> Cobro MP
                            </button>
                          )}

                          <button
                            className="btn-icon"
                            onClick={() => openEditModal(t)}
                            title="Editar Negocio, Plan y Módulos"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '5px 10px', fontSize: '0.8rem', fontWeight: 600
                            }}
                          >
                            <Edit3 size={14} /> Editar
                          </button>

                          {!isMaster && (
                            t.status === 'suspended' ? (
                              <button
                                className="btn-icon"
                                onClick={() => changeStatus(t.slug, 'active')}
                                style={{ color: 'var(--accent-emerald)', padding: '5px 8px' }}
                                title="Reactivar suscripción"
                              >
                                Reactivar
                              </button>
                            ) : (
                              <button
                                className="btn-icon"
                                onClick={() => changeStatus(t.slug, 'suspended')}
                                style={{ color: '#f59e0b', padding: '5px 8px' }}
                                title="Suspender temporalmente"
                              >
                                Suspender
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!tenants.length && !loading && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Todavía no hay negocios dados de alta.
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
