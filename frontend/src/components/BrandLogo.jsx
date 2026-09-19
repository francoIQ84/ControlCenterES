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
 *
 * La altura viaja como variable CSS (`--brand-logo-base`) en lugar de aplicarse
 * directo al `style` de la imagen: así el media query de mobile puede achicarlo
 * un 20% sin pelearse contra un estilo inline, que siempre gana.
 */
export default function BrandLogo({ height = 44, showTagline = false, style = {} }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className="brand-logo brand-logo-fallback" style={{ '--brand-logo-base': `${height}px`, ...style }}>
        <Zap className="brand-logo-icon" style={{ color: 'var(--accent-blue)' }} />
        <span className="brand-logo-wordmark">
          Control<span style={{ color: 'var(--accent-blue)' }}>Center</span>
        </span>
      </div>
    )
  }

  return (
    <div className="brand-logo" style={{ '--brand-logo-base': `${height}px`, ...style }}>
      <img
        src="/logo-controlcenter.png"
        alt="ControlCenter"
        onError={() => setFailed(true)}
      />
      {showTagline && (
        <span className="brand-logo-tagline">
          Plataforma integrada de gestión
        </span>
      )}
    </div>
  )
}
