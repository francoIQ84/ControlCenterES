import React, { useState } from 'react'
import { Lock, User, AlertCircle, Eye, EyeOff } from 'lucide-react'

export default function Login() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      
      const data = await res.json()
      if (res.ok && data.token) {
        localStorage.setItem('adminToken', data.token)
        localStorage.setItem('adminUsername', data.username)
        localStorage.setItem('adminFullName', data.full_name)
        // Redirect to dashboard
        window.location.href = '/'
      } else {
        setError(data.detail || "Usuario o contraseña incorrectos.")
      }
    } catch(err) {
      setError("Error de conexión con el servidor.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-dark)',
      padding: 20
    }}>
      <div className="card" style={{
        width: 400,
        maxWidth: '100%',
        padding: 35,
        border: '1px solid var(--border-color)',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
        borderRadius: 16,
        backgroundColor: 'var(--bg-card)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)'
      }}>
        <div style={{textAlign: 'center', marginBottom: 25}}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 60,
            height: 60,
            borderRadius: '50%',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            color: 'var(--accent-blue)',
            marginBottom: 15
          }}>
            <Lock size={28} />
          </div>
          <h2 style={{margin: 0, fontSize: '1.8rem', fontWeight: 700}}>ControlCenterES</h2>
          <p style={{color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 5}}>Inicia sesión con tu cuenta de administrador</p>
        </div>

        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--accent-red)',
            color: 'var(--accent-red)',
            padding: '12px 15px',
            borderRadius: 8,
            fontSize: '0.85rem',
            marginBottom: 20
          }}>
            <AlertCircle size={16} style={{flexShrink: 0}} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: 15}}>
          <div>
            <label style={{fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 8}}>Usuario</label>
            <div style={{position: 'relative'}}>
              <input 
                type="text" 
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Ingresa tu usuario"
                style={{
                  width: '100%', 
                  padding: '12px 12px 12px 12px',
                  backgroundColor: 'var(--bg-dark)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  fontSize: '1rem'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 8}}>Contraseña</label>
            <div style={{position: 'relative'}}>
              <input 
                type={showPassword ? "text" : "password"} 
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%', 
                  padding: '12px 40px 12px 12px',
                  backgroundColor: 'var(--bg-dark)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  fontSize: '1rem'
                }}
              />
              <button 
                type="button"
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center'
                }}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            className="btn"
            disabled={loading}
            style={{
              padding: '12px',
              fontSize: '1rem',
              fontWeight: 600,
              backgroundColor: 'var(--accent-blue)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'opacity 0.2s',
              marginTop: 15
            }}
          >
            {loading ? "Iniciando sesión..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  )
}
