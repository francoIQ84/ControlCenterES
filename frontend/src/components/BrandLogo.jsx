import React, { useState } from 'react'
import { Zap } from 'lucide-react'

/**
 * Logo de la plataforma ControlCenter.
 *
 * Representa al PRODUCTO, no al inquilino. Va en las superficies de plataforma
 * —login, administración de clientes— y nunca en la barra lateral del panel,
 * que es el espacio de marca del negocio que lo está usando.
 *
 * Si el archivo no está presente cae a un logotipo tipográfico, para que un
 * asset faltante no deje un hueco roto en la pantalla de inicio de sesión.
 */
export default function BrandLogo({ height = 44, showTagline = false, style = {} }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...style }}>
        <Zap size={height * 0.6} style={{ color: 'var(--accent-blue)' }} />
        <span style={{ fontSize: height * 0.5, fontWeight: 800, letterSpacing: '-0.02em' }}>
          Control<span style={{ color: 'var(--accent-blue)' }}>Center</span>
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', ...style }}>
      <img
        src="/logo-controlcenter.png"
        alt="ControlCenter"
        onError={() => setFailed(true)}
        style={{ height, width: 'auto', maxWidth: '100%', objectFit: 'contain' }}
      />
      {showTagline && (
        <span style={{
          fontSize: '0.7rem', letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--text-secondary)', marginTop: 6, fontWeight: 600
        }}>
          Plataforma integrada de gestión
        </span>
      )}
    </div>
  )
}
