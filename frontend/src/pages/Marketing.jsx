import React, { useState, useEffect } from 'react'
import { Megaphone, Sparkles, Calendar, Settings as SettingsIcon, Send, Video, Image as ImageIcon, Trash2, CheckCircle, Clock, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react'

export default function Marketing() {
  const [activeTab, setActiveTab] = useState('creator') // 'creator', 'calendar', 'automation', 'config'
  
  // Data states
  const [products, setProducts] = useState([])
  const [posts, setPosts] = useState([])
  const [loadingPosts, setLoadingPosts] = useState(false)

  // Creator state
  const [selectedProduct, setSelectedProduct] = useState('')
  const [objective, setObjective] = useState('promocional')
  const [tone, setTone] = useState('entusiasta')
  const [generating, setGenerating] = useState(false)
  const [generatedData, setGeneratedData] = useState(null)
  
  const [postTitle, setPostTitle] = useState('')
  const [postType, setPostType] = useState('post') // 'post', 'reel', 'story'
  const [platforms, setPlatforms] = useState({ instagram: true, facebook: true })
  const [caption, setCaption] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Config state
  const [metaConfig, setMetaConfig] = useState({
    meta_access_token: '',
    meta_instagram_account_id: '',
    meta_facebook_page_id: ''
  })
  const [savingConfig, setSavingConfig] = useState(false)

  useEffect(() => {
    fetchProducts()
    fetchPosts()
    fetchMetaConfig()
  }, [])

  const fetchProducts = () => {
    fetch('/api/inventory/')
      .then(r => r.ok ? r.json() : { products: [] })
      .then(data => setProducts(data.products || []))
      .catch(err => console.error(err))
  }

  const fetchPosts = () => {
    setLoadingPosts(true)
    fetch('/api/marketing/posts')
      .then(r => r.ok ? r.json() : { posts: [] })
      .then(data => setPosts(data.posts || []))
      .catch(err => console.error(err))
      .finally(() => setLoadingPosts(false))
  }

  const fetchMetaConfig = () => {
    fetch('/api/marketing/config')
      .then(r => r.ok ? r.json() : {})
      .then(data => setMetaConfig(data))
      .catch(err => console.error(err))
  }

  const handleGenerateAI = async () => {
    if (!selectedProduct) {
      alert("Por favor selecciona un producto del inventario para generar la publicación.")
      return
    }
    setGenerating(true)
    setGeneratedData(null)

    try {
      const res = await fetch('/api/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_ml_id: selectedProduct,
          objective,
          tone
        })
      })
      const data = await res.json()
      if (res.ok) {
        setGeneratedData(data)
        setPostTitle(data.title || '')
        setCaption(data.caption || '')
        const mainImg = data.images ? data.images.split(',')[0].trim() : ''
        setMediaUrl(mainImg)
      } else {
        alert("Error al generar contenido: " + (data.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleSavePost = async (statusOverride = null) => {
    if (!postTitle.trim() || !caption.trim()) {
      alert("Ingresa un título y el contenido (caption) para la publicación.")
      return
    }

    const selectedPlatforms = Object.keys(platforms).filter(k => platforms[k]).join(',')
    if (!selectedPlatforms) {
      alert("Selecciona al menos una red social destino (Instagram o Facebook).")
      return
    }

    const finalStatus = statusOverride || (scheduledAt ? 'scheduled' : 'draft')

    setSubmitting(true)
    try {
      const res = await fetch('/api/marketing/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_ml_id: selectedProduct || null,
          title: postTitle,
          post_type: postType,
          platforms: selectedPlatforms,
          caption,
          media_urls: mediaUrl,
          scheduled_at: scheduledAt || null,
          status: finalStatus
        })
      })
      const data = await res.json()
      if (res.ok) {
        alert(finalStatus === 'scheduled' ? "Publicación programada correctamente!" : "Borrador guardado con éxito")
        fetchPosts()
        if (finalStatus === 'scheduled') setActiveTab('calendar')
      } else {
        alert("Error: " + (data.detail || "No se pudo guardar la publicación"))
      }
    } catch(err) {
      alert("Error: " + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePublishNow = async (postId) => {
    if (!confirm("¿Deseas publicar esta entrada en tus redes sociales en este momento?")) return
    try {
      const res = await fetch(`/api/marketing/publish-now/${postId}`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        alert("¡Publicado con éxito! " + data.message)
        fetchPosts()
      } else {
        alert("Error al publicar: " + (data.detail || "Ocurrió un error en Meta API"))
        fetchPosts()
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    }
  }

  const handleDeletePost = async (postId) => {
    if (!confirm("¿Estás seguro de eliminar esta publicación?")) return
    try {
      const res = await fetch(`/api/marketing/posts/${postId}`, { method: 'DELETE' })
      if (res.ok) {
        fetchPosts()
      } else {
        alert("Error al eliminar")
      }
    } catch(err) {
      alert("Error: " + err.message)
    }
  }

  const handleSaveMetaConfig = async (e) => {
    e.preventDefault()
    setSavingConfig(true)
    try {
      const res = await fetch('/api/marketing/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metaConfig)
      })
      const data = await res.json()
      if (res.ok) {
        alert("Credenciales guardadas correctamente.")
      } else {
        alert("Error al guardar credenciales")
      }
    } catch(err) {
      alert("Error: " + err.message)
    } finally {
      setSavingConfig(false)
    }
  }

  return (
    <div>
      <div style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 5}}>
        <Megaphone size={28} style={{color: 'var(--accent-blue)'}} />
        <h1 className="page-title" style={{margin: 0}}>Marketing & Redes Sociales</h1>
      </div>
      <p className="page-subtitle" style={{marginBottom: 20}}>
        Generá Reels y publicaciones con IA (Gemini), programalos y publicalos automáticamente en Instagram y Facebook.
      </p>

      {/* Tabs Navigation */}
      <div style={{display: 'flex', gap: 10, marginBottom: 25, borderBottom: '1px solid var(--border-color)', pb: 10}}>
        <button 
          className="btn" 
          onClick={() => setActiveTab('creator')}
          style={{
            backgroundColor: activeTab === 'creator' ? 'var(--accent-blue)' : 'var(--bg-card)',
            color: activeTab === 'creator' ? '#fff' : 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <Sparkles size={16} /> Creador IA & Reels
        </button>
        <button 
          className="btn" 
          onClick={() => setActiveTab('calendar')}
          style={{
            backgroundColor: activeTab === 'calendar' ? 'var(--accent-blue)' : 'var(--bg-card)',
            color: activeTab === 'calendar' ? '#fff' : 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <Calendar size={16} /> Cola & Calendario ({posts.filter(p => p.status === 'scheduled').length})
        </button>
        <button 
          className="btn" 
          onClick={() => setActiveTab('config')}
          style={{
            backgroundColor: activeTab === 'config' ? 'var(--accent-blue)' : 'var(--bg-card)',
            color: activeTab === 'config' ? '#fff' : 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <SettingsIcon size={16} /> Configuración de Redes
        </button>
      </div>

      {/* TAB 1: Creador IA */}
      {activeTab === 'creator' && (
        <div style={{display: 'flex', gap: 25, flexWrap: 'wrap'}}>
          {/* Columna Izquierda: Generación & Ajustes */}
          <div className="card" style={{flex: 1, minWidth: 320}}>
            <h3 style={{marginTop: 0, marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8}}>
              <Sparkles size={18} style={{color: 'var(--accent-orange)'}} />
              1. Selección de Producto & IA
            </h3>

            <div style={{display: 'flex', flexDirection: 'column', gap: 15}}>
              <label style={{fontSize: '0.85rem', fontWeight: 600}}>Producto del Inventario *
                <select 
                  value={selectedProduct} 
                  onChange={e => setSelectedProduct(e.target.value)}
                  style={{width: '100%', marginTop: 5, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                >
                  <option value="">-- Selecciona un producto para promocionar --</option>
                  {products.map(p => (
                    <option key={p.ml_id} value={p.ml_id}>
                      {p.title} (${p.price_web > 0 ? p.price_web : p.price})
                    </option>
                  ))}
                </select>
              </label>

              <div style={{display: 'flex', gap: 15}}>
                <label style={{flex: 1, fontSize: '0.85rem'}}>Objetivo Campaña
                  <select value={objective} onChange={e => setObjective(e.target.value)} style={{width: '100%', marginTop: 5, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}>
                    <option value="promocional">Promocional / Ventas</option>
                    <option value="oferta">Descuento u Oferta</option>
                    <option value="educativo">Educativo / Tips Hidroponía</option>
                  </select>
                </label>

                <label style={{flex: 1, fontSize: '0.85rem'}}>Tono de Voz
                  <select value={tone} onChange={e => setTone(e.target.value)} style={{width: '100%', marginTop: 5, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}>
                    <option value="entusiasta">Entusiasta & Dinámico</option>
                    <option value="profesional">Profesional & Técnico</option>
                    <option value="divertido">Cercano & Divertido</option>
                  </select>
                </label>
              </div>

              <button 
                className="btn" 
                onClick={handleGenerateAI}
                disabled={generating || !selectedProduct}
                style={{backgroundColor: 'var(--accent-emerald)', color: '#fff', padding: '10px 15px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8}}
              >
                {generating ? <RefreshCw className="animate-spin" size={16} /> : <Sparkles size={16} />}
                {generating ? 'Generando copy con IA...' : '✨ Generar Publicación con Gemini IA'}
              </button>
            </div>

            <hr style={{margin: '25px 0', borderColor: 'var(--border-color)', opacity: 0.4}} />

            <h3 style={{marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8}}>
              <Send size={18} style={{color: 'var(--accent-blue)'}} />
              2. Configuración de Despacho
            </h3>

            <div style={{display: 'flex', flexDirection: 'column', gap: 15}}>
              <div style={{display: 'flex', gap: 15}}>
                <label style={{flex: 1, fontSize: '0.85rem'}}>Tipo de Formato
                  <select value={postType} onChange={e => setPostType(e.target.value)} style={{width: '100%', marginTop: 5, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}>
                    <option value="post">📷 Imagen / Publicación</option>
                    <option value="reel">🎬 Reel de 15-30s</option>
                    <option value="story">📲 Historia</option>
                  </select>
                </label>

                <div style={{flex: 1}}>
                  <span style={{fontSize: '0.85rem', display: 'block', marginBottom: 5}}>Redes Destino</span>
                  <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
                    <label style={{fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer'}}>
                      <input type="checkbox" checked={platforms.instagram} onChange={e => setPlatforms({...platforms, instagram: e.target.checked})} />
                      Instagram
                    </label>
                    <label style={{fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer'}}>
                      <input type="checkbox" checked={platforms.facebook} onChange={e => setPlatforms({...platforms, facebook: e.target.checked})} />
                      Facebook
                    </label>
                  </div>
                </div>
              </div>

              <label style={{fontSize: '0.85rem'}}>Programar Fecha y Hora (Opcional)
                <input 
                  type="datetime-local" 
                  value={scheduledAt} 
                  onChange={e => setScheduledAt(e.target.value)} 
                  style={{width: '100%', marginTop: 5, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                />
                <span style={{fontSize: '0.72rem', color: 'var(--text-secondary)'}}>Dejá en blanco para guardar como borrador o publicar manualmente.</span>
              </label>

              <div style={{display: 'flex', gap: 10, marginTop: 10}}>
                <button 
                  className="btn" 
                  onClick={() => handleSavePost('draft')}
                  disabled={submitting}
                  style={{flex: 1, backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)'}}
                >
                  💾 Guardar Borrador
                </button>
                <button 
                  className="btn" 
                  onClick={() => handleSavePost(scheduledAt ? 'scheduled' : 'draft')}
                  disabled={submitting}
                  style={{flex: 1, backgroundColor: 'var(--accent-blue)', color: '#fff'}}
                >
                  ⏰ {scheduledAt ? 'Programar Publicación' : 'Guardar en Cola'}
                </button>
              </div>
            </div>
          </div>

          {/* Columna Derecha: Previsualización */}
          <div className="card" style={{flex: 1, minWidth: 340}}>
            <h3 style={{marginTop: 0, marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8}}>
              <ImageIcon size={18} style={{color: 'var(--accent-emerald)'}} />
              Previsualización de Publicación
            </h3>

            <div style={{display: 'flex', flexDirection: 'column', gap: 15}}>
              <label style={{fontSize: '0.85rem', fontWeight: 600}}>Título Corto Sugerido
                <input 
                  type="text" 
                  value={postTitle} 
                  onChange={e => setPostTitle(e.target.value)} 
                  placeholder="ej. Oferta Especial: Kit Hidroponía" 
                  style={{width: '100%', marginTop: 5, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                />
              </label>

              <label style={{fontSize: '0.85rem', fontWeight: 600}}>URL de la Imagen o Video
                <input 
                  type="text" 
                  value={mediaUrl} 
                  onChange={e => setMediaUrl(e.target.value)} 
                  placeholder="https://ejemplo.com/foto.jpg" 
                  style={{width: '100%', marginTop: 5, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                />
              </label>

              <label style={{fontSize: '0.85rem', fontWeight: 600}}>Contenido / Caption (Texto + Hashtags)
                <textarea 
                  value={caption} 
                  onChange={e => setCaption(e.target.value)} 
                  rows={8}
                  placeholder="El texto generado por la IA aparecerá acá..."
                  style={{width: '100%', marginTop: 5, padding: 10, borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontFamily: 'sans-serif'}}
                />
              </label>

              {generatedData && generatedData.video_script_idea && (
                <div style={{padding: 12, backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 6}}>
                  <span style={{fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--accent-blue)', display: 'block', marginBottom: 4}}>
                    💡 Idea para grabar Reel (15s):
                  </span>
                  <p style={{fontSize: '0.8rem', margin: 0, color: 'var(--text-primary)', whiteSpace: 'pre-line'}}>
                    {generatedData.video_script_idea}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Cola & Calendario */}
      {activeTab === 'calendar' && (
        <div className="card">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
            <h3 style={{margin: 0}}>Publicaciones Programadas & Historial</h3>
            <button className="btn" onClick={fetchPosts} style={{backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)'}}>
              <RefreshCw size={14} /> Actualizar Listado
            </button>
          </div>

          {loadingPosts ? <p>Cargando publicaciones...</p> : (
            posts.length === 0 ? (
              <div style={{padding: 30, textAlign: 'center', color: 'var(--text-secondary)'}}>
                No tenés publicaciones agendadas por el momento. Creá una nueva desde la pestaña "Creador IA".
              </div>
            ) : (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{width: 50}}>Media</th>
                      <th>Título & Copy</th>
                      <th style={{width: 100}}>Formato</th>
                      <th style={{width: 120}}>Redes</th>
                      <th style={{width: 130}}>Programado para</th>
                      <th style={{width: 100}}>Estado</th>
                      <th style={{width: 130}}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map(p => (
                      <tr key={p.id}>
                        <td>
                          {p.media_urls ? (
                            <img src={p.media_urls.split(',')[0]} alt="" style={{width: 40, height: 40, objectFit: 'contain', borderRadius: 4, backgroundColor: '#fff'}} />
                          ) : (
                            <div style={{width: 40, height: 40, backgroundColor: 'var(--bg-dark)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                              <ImageIcon size={18} />
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{fontWeight: 600, fontSize: '0.85rem'}}>{p.title}</div>
                          <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)', maxLine: 2, lineClamp: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'}} title={p.caption}>
                            {p.caption}
                          </div>
                        </td>
                        <td>
                          <span style={{fontSize: '0.75rem', padding: '2px 6px', borderRadius: 4, backgroundColor: 'var(--bg-dark)', fontWeight: 600}}>
                            {p.post_type === 'reel' ? '🎬 Reel' : '📷 Post'}
                          </span>
                        </td>
                        <td>
                          <span style={{fontSize: '0.75rem', color: 'var(--accent-blue)'}}>{p.platforms}</span>
                        </td>
                        <td style={{fontSize: '0.78rem'}}>
                          {p.scheduled_at ? new Date(p.scheduled_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin fecha (Borrador)'}
                        </td>
                        <td>
                          <span style={{
                            fontSize: '0.75rem', 
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 4,
                            backgroundColor: p.status === 'published' ? 'rgba(16, 185, 129, 0.15)' : (p.status === 'scheduled' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)'),
                            color: p.status === 'published' ? '#10b981' : (p.status === 'scheduled' ? '#3b82f6' : '#ef4444')
                          }}>
                            {p.status === 'published' ? '✅ Publicado' : (p.status === 'scheduled' ? '⏰ Programado' : p.status)}
                          </span>
                        </td>
                        <td>
                          <div style={{display: 'flex', gap: 6}}>
                            {p.status !== 'published' && (
                              <button className="btn" style={{padding: '3px 8px', fontSize: '0.7rem', backgroundColor: 'var(--accent-emerald)', color: '#fff'}} onClick={() => handlePublishNow(p.id)} title="Publicar inmediatamente en Meta">
                                <Send size={12} /> Publicar
                              </button>
                            )}
                            <button className="btn-icon" onClick={() => handleDeletePost(p.id)} style={{color: '#ef4444'}} title="Eliminar">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}

      {/* TAB 3: Configuración de Redes */}
      {activeTab === 'config' && (
        <div className="card" style={{maxWidth: 650}}>
          <h3 style={{marginTop: 0, marginBottom: 10}}>Conexión con Meta API (Instagram & Facebook)</h3>
          <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20}}>
            Ingresá las credenciales de tu aplicación de Meta for Developers para habilitar la publicación directa y autónoma de publicaciones y Reels.
          </p>

          <form onSubmit={handleSaveMetaConfig} style={{display: 'flex', flexDirection: 'column', gap: 15}}>
            <label style={{fontSize: '0.85rem'}}>Meta Access Token (Token de acceso de página o usuario)
              <input 
                type="text" 
                value={metaConfig.meta_access_token} 
                onChange={e => setMetaConfig({...metaConfig, meta_access_token: e.target.value})} 
                placeholder="EAA..." 
                style={{width: '100%', marginTop: 5, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
              />
            </label>

            <label style={{fontSize: '0.85rem'}}>Instagram Business Account ID
              <input 
                type="text" 
                value={metaConfig.meta_instagram_account_id} 
                onChange={e => setMetaConfig({...metaConfig, meta_instagram_account_id: e.target.value})} 
                placeholder="178414..." 
                style={{width: '100%', marginTop: 5, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
              />
            </label>

            <label style={{fontSize: '0.85rem'}}>Facebook Page ID
              <input 
                type="text" 
                value={metaConfig.meta_facebook_page_id} 
                onChange={e => setMetaConfig({...metaConfig, meta_facebook_page_id: e.target.value})} 
                placeholder="102938..." 
                style={{width: '100%', marginTop: 5, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
              />
            </label>

            <button type="submit" className="btn" disabled={savingConfig} style={{backgroundColor: 'var(--accent-blue)', color: '#fff', alignSelf: 'flex-start', marginTop: 10}}>
              {savingConfig ? 'Guardando...' : '💾 Guardar Credenciales de Meta'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
