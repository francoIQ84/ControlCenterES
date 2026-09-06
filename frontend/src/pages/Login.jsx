import React, { useState, useEffect } from 'react'
import { User, AlertCircle, Eye, EyeOff, ShieldCheck, Mail, ArrowLeft, RefreshCw, CheckCircle2 } from 'lucide-react'
import BrandLogo from '../components/BrandLogo'

export default function Login() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [successMsg, setSuccessMsg] = useState("")

  // 2FA state
  const [step, setStep] = useState("credentials") // "credentials" | "2fa"
  const [tempToken, setTempToken] = useState("")
  const [maskedEmail, setMaskedEmail] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [resendCountdown, setResendCountdown] = useState(0)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    let timer = null
    if (resendCountdown > 0) {
      timer = setInterval(() => {
        setResendCountdown(prev => (prev > 0 ? prev - 1 : 0))
      }, 1000)
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [resendCountdown])

  const handleSubmitCredentials = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccessMsg("")
    
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      
      const data = await res.json()
      
      if (res.ok) {
        if (data.requires_2fa) {
          setTempToken(data.temp_token)
          setMaskedEmail(data.masked_email || "tu correo")
          setStep("2fa")
          setOtpCode("")
          setResendCountdown(60)
          setSuccessMsg("Código de seguridad enviado con éxito.")
        } else if (data.token) {
          localStorage.setItem('adminToken', data.token)
          localStorage.setItem('adminUsername', data.username)
          localStorage.setItem('adminFullName', data.full_name)
          localStorage.setItem('justLoggedIn', 'true')
          window.location.href = '/'
        }
      } else {
        setError(data.detail || "Usuario o contraseña incorrectos.")
      }
    } catch(err) {
      setError("Error de conexión con el servidor.")
    } finally {
      setLoading(false)
    }
  }

  const handleVerify2FA = async (e) => {
    e.preventDefault()
    if (!otpCode || otpCode.trim().length < 6) {
      setError("Por favor ingresa el código numérico de 6 dígitos.")
      return
    }

    setLoading(true)
    setError("")
    setSuccessMsg("")

    try {
      const res = await fetch('/api/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temp_token: tempToken, code: otpCode.trim() })
      })

      const data = await res.json()
      if (res.ok && data.token) {
        localStorage.setItem('adminToken', data.token)
        localStorage.setItem('adminUsername', data.username)
        localStorage.setItem('adminFullName', data.full_name)
        localStorage.setItem('justLoggedIn', 'true')
        window.location.href = '/'
      } else {
        setError(data.detail || "Código incorrecto o expirado.")
      }
    } catch(err) {
      setError("Error de conexión con el servidor.")
    } finally {
      setLoading(false)
    }
  }

  const handleResend2FA = async () => {
    if (resendCountdown > 0 || resending) return
    setResending(true)
    setError("")
    setSuccessMsg("")

    try {
      const res = await fetch('/api/auth/resend-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temp_token: tempToken })
      })
      const data = await res.json()
      if (res.ok) {
        setResendCountdown(60)
        setSuccessMsg(data.message || "Nuevo código enviado con éxito.")
      } else {
        setError(data.detail || "No se pudo reenviar el código.")
      }
    } catch(err) {
      setError("Error al conectar con el servidor para reenviar código.")
    } finally {
      setResending(false)
    }
  }

  const handleBackToCredentials = () => {
    setStep("credentials")
    setOtpCode("")
    setError("")
    setSuccessMsg("")
    setTempToken("")
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
        width: 420,
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
          <BrandLogo height={52} showTagline style={{marginBottom: 18, width: '100%'}} />
          {step === "credentials" ? (
            <p style={{color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 5}}>
              Inicia sesión con tu cuenta de administrador
            </p>
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginTop: 5}}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: 20,
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                color: 'var(--accent-blue)',
                fontSize: '0.8rem',
                fontWeight: 600
              }}>
                <ShieldCheck size={16} /> Doble Factor de Seguridad (2FA)
              </div>
              <p style={{color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '4px 0 0 0'}}>
                Ingresa el código de 6 dígitos que enviamos a:
              </p>
              <div style={{
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 2
              }}>
                <Mail size={15} style={{color: 'var(--accent-blue)'}} />
                <span>{maskedEmail}</span>
              </div>
            </div>
          )}
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

        {successMsg && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid var(--accent-emerald)',
            color: 'var(--accent-emerald)',
            padding: '12px 15px',
            borderRadius: 8,
            fontSize: '0.85rem',
            marginBottom: 20
          }}>
            <CheckCircle2 size={16} style={{flexShrink: 0}} />
            <span>{successMsg}</span>
          </div>
        )}

        {step === "credentials" ? (
          <form onSubmit={handleSubmitCredentials} style={{display: 'flex', flexDirection: 'column', gap: 15}}>
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
        ) : (
          <form onSubmit={handleVerify2FA} style={{display: 'flex', flexDirection: 'column', gap: 18}}>
            <div>
              <label style={{fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 8, textAlign: 'center'}}>
                Código de Verificación
              </label>
              <input 
                type="text" 
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                value={otpCode}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setOtpCode(val)
                }}
                placeholder="••••••"
                style={{
                  width: '100%', 
                  padding: '14px 12px',
                  backgroundColor: 'var(--bg-dark)',
                  color: 'var(--accent-blue)',
                  border: '2px solid var(--accent-blue)',
                  borderRadius: 10,
                  fontSize: '1.6rem',
                  fontWeight: 700,
                  letterSpacing: '8px',
                  textAlign: 'center',
                  outline: 'none'
                }}
              />
              <p style={{fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: 8}}>
                El código es de 6 dígitos numéricos y vence en 10 minutos.
              </p>
            </div>

            <button 
              type="submit" 
              className="btn"
              disabled={loading || otpCode.length < 6}
              style={{
                padding: '12px',
                fontSize: '1rem',
                fontWeight: 600,
                backgroundColor: 'var(--accent-blue)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: (loading || otpCode.length < 6) ? 'not-allowed' : 'pointer',
                opacity: (loading || otpCode.length < 6) ? 0.6 : 1,
                transition: 'opacity 0.2s'
              }}
            >
              {loading ? "Verificando..." : "Verificar y Acceder"}
            </button>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 5,
              fontSize: '0.85rem'
            }}>
              <button
                type="button"
                onClick={handleBackToCredentials}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  padding: '4px 0'
                }}
              >
                <ArrowLeft size={16} /> Volver
              </button>

              <button
                type="button"
                onClick={handleResend2FA}
                disabled={resendCountdown > 0 || resending}
                style={{
                  background: 'none',
                  border: 'none',
                  color: resendCountdown > 0 ? 'var(--text-secondary)' : 'var(--accent-blue)',
                  cursor: resendCountdown > 0 ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 0'
                }}
              >
                <RefreshCw size={14} className={resending ? "animate-spin" : ""} />
                {resendCountdown > 0 ? `Reenviar en ${resendCountdown}s` : "Reenviar código"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

