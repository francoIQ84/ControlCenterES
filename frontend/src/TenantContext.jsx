import React, { createContext, useContext, useEffect, useState } from 'react'

/**
 * Contexto del inquilino activo.
 *
 * Consulta /api/tenants/me una vez por sesión de panel y expone:
 *   - tenant: datos del inquilino (nombre, plan, estado, si es el maestro)
 *   - hasModule(nombre): si el módulo está contratado en el plan
 *   - isPlatformAdmin: si la sesión pertenece al Tenant Maestro
 *   - isSimpleView: si la vista simplificada está activa (default: true)
 *   - toggleViewMode(): alterna entre vista simple y completa
 *
 * Los permisos de usuario (RBAC) y los módulos contratados son dos filtros
 * distintos y se aplican los dos: el permiso dice qué puede hacer *esta
 * persona*, el módulo dice qué contrató *el negocio*. Un cajero sin permiso de
 * finanzas no ve Finanzas aunque el plan la incluya; y nadie ve Facturación si
 * el plan no la tiene, por más que sea administrador.
 */

const TenantContext = createContext(null)

const FALLBACK = {
  tenant: null,
  loading: true,
  error: null,
  hasModule: () => true,
  isPlatformAdmin: false,
  isSimpleView: true,
  toggleViewMode: () => {},
  refresh: () => {},
}

export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('viewMode') || 'simple'
    } catch { return 'simple' }
  })

  const isSimpleView = viewMode === 'simple'

  const toggleViewMode = () => {
    setViewMode(prev => {
      const next = prev === 'simple' ? 'full' : 'simple'
      try { localStorage.setItem('viewMode', next) } catch {}
      return next
    })
  }

  const load = async () => {
    const token = localStorage.getItem('adminToken')
    if (!token) {
      setLoading(false)
      return
    }
    try {
      const res = await fetch('/api/tenants/me')
      if (res.ok) {
        setTenant(await res.json())
        setError(null)
      } else {
        // Backend anterior a la migración multi-tenant: no es un error para el
        // usuario, simplemente no hay gating de módulos que aplicar.
        setError(`HTTP ${res.status}`)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Personalización visual del inquilino sobre las variables CSS existentes.
  useEffect(() => {
    const color = tenant?.settings?.primary_color
    if (color) {
      document.documentElement.style.setProperty('--accent-blue', color)
    }
    if (tenant?.name) {
      document.title = `${tenant.name} — ControlCenter`
    }
  }, [tenant])

  /**
   * Mientras no se conozcan los módulos (cargando, backend viejo o
   * tenant_settings vacío) devuelve true: nunca se esconde funcionalidad que
   * hoy está en uso por no saber todavía si corresponde.
   */
  const hasModule = (name) => {
    const modules = tenant?.settings?.active_modules
    if (!Array.isArray(modules) || modules.length === 0) return true
    return modules.includes(name)
  }

  return (
    <TenantContext.Provider value={{
      tenant,
      loading,
      error,
      hasModule,
      isPlatformAdmin: Boolean(tenant?.is_master),
      isSimpleView,
      toggleViewMode,
      refresh: load,
    }}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  return useContext(TenantContext) || FALLBACK
}

export default TenantContext

