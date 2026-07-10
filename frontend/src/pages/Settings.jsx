import React, { useState, useEffect } from 'react'

export default function Settings() {
  const [config, setConfig] = useState({ client_id: '', client_secret: '', redirect_uri: '', demo_mode: true })
  const [status, setStatus] = useState({ is_authenticated: false, user_id: null })
  const [code, setCode] = useState("")

  useEffect(() => {
    fetch('/api/settings/config').then(r=>r.json()).then(setConfig)
    fetch('/api/settings/status').then(r=>r.json()).then(setStatus)
  }, [])

  const handleSave = async () => {
    await fetch('/api/settings/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    alert("Configuración guardada")
    window.location.reload()
  }

  const handleAuth = () => {
    const url = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${config.client_id}&redirect_uri=${config.redirect_uri}`
    window.open(url, '_blank')
  }

  const handleCode = async () => {
    try {
      const res = await fetch('/api/settings/exchange-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      })
      if(res.ok) {
        alert("Autenticación exitosa")
        window.location.reload()
      } else {
        const errorData = await res.json()
        alert("Error de autenticación: " + (errorData.detail || "Error desconocido"))
      }
    } catch(e) {
      alert("Error: " + e.message)
    }
  }

  return (
    <div>
      <h1 className="page-title">Configuración</h1>
      <p className="page-subtitle">Ajustes del sistema y conexión con Mercado Libre.</p>

      <div style={{display: 'flex', gap: 20, alignItems: 'flex-start'}}>
        <div className="card" style={{flex: 1}}>
          <h3>API de Mercado Libre</h3>
          <div style={{display: 'flex', flexDirection: 'column', gap: 15}}>
            <label>App ID (Client ID)
              <input type="text" value={config.client_id} onChange={e => setConfig({...config, client_id: e.target.value})} style={{width: '100%', marginTop: 5}}/>
            </label>
            <label>Client Secret
              <input type="password" value={config.client_secret} onChange={e => setConfig({...config, client_secret: e.target.value})} style={{width: '100%', marginTop: 5}}/>
            </label>
            <label>Redirect URI
              <input type="text" value={config.redirect_uri} onChange={e => setConfig({...config, redirect_uri: e.target.value})} style={{width: '100%', marginTop: 5}}/>
            </label>
            <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: 'pointer', marginTop: 5}}>
              <input type="checkbox" checked={config.demo_mode} onChange={e => setConfig({...config, demo_mode: e.target.checked})} style={{width: 'auto'}}/>
              Activar Modo Demo (Datos de prueba ficticios)
            </label>
            <button className="btn" onClick={handleSave}>Guardar API Config</button>
          </div>
        </div>

        <div className="card" style={{flex: 1}}>
          <h3>Estado de Conexión</h3>
          {status.is_authenticated ? (
            <div style={{color: 'var(--accent-emerald)', fontWeight: 'bold'}}>
              ✓ Conectado a Mercado Libre (Usuario ID: {status.user_id})
            </div>
          ) : (
            <div style={{color: 'var(--accent-red)', fontWeight: 'bold'}}>
              ✗ No autenticado
            </div>
          )}

          <div style={{marginTop: 20}}>
            <p style={{fontSize: '0.9rem'}}>1. Haz clic aquí para autorizar la app:</p>
            <button className="btn" style={{backgroundColor: '#ffe600', color: '#333'}} onClick={handleAuth}>
              Autorizar en Mercado Libre
            </button>
            
            <p style={{fontSize: '0.9rem', marginTop: 20}}>2. Pega el código de la URL (TG-xxx):</p>
            <div style={{display: 'flex', gap: 10}}>
              <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="TG-..." style={{flex: 1}}/>
              <button className="btn" onClick={handleCode}>Vincular</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
