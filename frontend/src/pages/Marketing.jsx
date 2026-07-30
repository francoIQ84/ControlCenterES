import React, { useState, useEffect } from 'react'
import { Megaphone, Sparkles, Calendar, Settings as SettingsIcon, Send, Video, Image as ImageIcon, Trash2, CheckCircle, Clock, AlertCircle, RefreshCw, ExternalLink, MessageSquare } from 'lucide-react'

const toHighResMlImage = (url) => {
  if (!url) return ''
  let clean = url.trim().replace(/-[IVECN]\.(jpg|jpeg|png|webp)/i, '-O.$1')
  if (clean.startsWith('http://')) {
    clean = 'https://' + clean.slice(7)
  }
  return clean
}

const isVideoUrl = (url) => {
  if (!url) return false
  const lower = url.toLowerCase().split('?')[0]
  return lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.webm') || lower.endsWith('.avi')
}

export default function Marketing() {
  const [activeTab, setActiveTab] = useState('creator') // 'creator', 'calendar', 'comments', 'config'
  
  // Data states
  const [products, setProducts] = useState([])
  const [posts, setPosts] = useState([])
  const [loadingPosts, setLoadingPosts] = useState(false)

  // Creator state
  const [selectedProduct, setSelectedProduct] = useState('')
  const [productImages, setProductImages] = useState([])
  const [uploadingFile, setUploadingFile] = useState(false)
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
  const [editingPostId, setEditingPostId] = useState(null)

  // Config state
  const [metaConfig, setMetaConfig] = useState({
    meta_access_token: '',
    meta_instagram_account_id: '',
    meta_facebook_page_id: ''
  })
  const [savingConfig, setSavingConfig] = useState(false)

  // Comments / Inbox state
  const [commentsData, setCommentsData] = useState({ instagram: [], facebook: [] })
  const [loadingComments, setLoadingComments] = useState(false)
  const [replyInputs, setReplyInputs] = useState({})
  const [replyingId, setReplyingId] = useState(null)
  const [suggestingId, setSuggestingId] = useState(null)

  useEffect(() => {
    fetchProducts()
    fetchPosts()
    fetchMetaConfig()
  }, [])

  useEffect(() => {
    if (!selectedProduct) {
      setProductImages([])
      return
    }
    const curr = products.find(p => p.ml_id === selectedProduct)
    if (curr) {
      const rawList = curr.images ? curr.images.split(',') : (curr.thumbnail ? [curr.thumbnail] : [])
      const cleanList = rawList.map(u => toHighResMlImage(u.trim())).filter(Boolean)
      setProductImages(cleanList)
      if (cleanList.length > 0 && !mediaUrl) {
        setMediaUrl(cleanList[0])
      }
    } else {
      setProductImages([])
    }
  }, [selectedProduct, products])

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingFile(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData
      })
      const data = await res.json()
      if (res.ok && data.url) {
        setMediaUrl(data.url)
      } else {
        alert("Error al subir archivo: " + (data.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error de conexión al subir archivo: " + err.message)
    } finally {
      setUploadingFile(false)
      e.target.value = ''
    }
  }

  const fetchComments = () => {
    setLoadingComments(true)
    fetch('/api/marketing/comments')
      .then(r => r.ok ? r.json() : { data: { instagram: [], facebook: [] } })
      .then(res => setCommentsData(res.data || { instagram: [], facebook: [] }))
      .catch(err => console.error(err))
      .finally(() => setLoadingComments(false))
  }

  const handleReplyComment = async (platform, commentId) => {
    const message = replyInputs[commentId]
    if (!message || !message.trim()) {
      alert("Por favor ingresa un texto de respuesta.")
      return
    }

    setReplyingId(commentId)
    try {
      const res = await fetch('/api/marketing/comments/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          comment_id: commentId,
          message: message.trim()
        })
      })
      const data = await res.json()
      if (res.ok) {
        alert("¡Respuesta enviada exitosamente a la red social!")
        setReplyInputs(prev => ({ ...prev, [commentId]: '' }))
        fetchComments()
      } else {
        alert("Error al responder: " + (data.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setReplyingId(null)
    }
  }

  const handleAISuggestReply = async (commentText, postContext, authorName, commentId) => {
    setSuggestingId(commentId)
    try {
      const res = await fetch('/api/marketing/comments/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment_text: commentText,
          post_context: postContext,
          author_name: authorName
        })
      })
      const data = await res.json()
      if (res.ok && data.suggested_reply) {
        setReplyInputs(prev => ({ ...prev, [commentId]: data.suggested_reply }))
      } else {
        alert("Error al generar sugerencia: " + (data.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setSuggestingId(null)
    }
  }

  const handleResetForm = () => {
    setEditingPostId(null)
    setSelectedProduct('')
    setPostTitle('')
    setPostType('post')
    setPlatforms({ instagram: true, facebook: true })
    setCaption('')
    setMediaUrl('')
    setScheduledAt('')
    setGeneratedData(null)
  }

  const handleEditPost = (p) => {
    setEditingPostId(p.id)
    setSelectedProduct(p.product_ml_id || '')
    setPostTitle(p.title || '')
    setPostType(p.post_type || 'post')
    const pStr = (p.platforms || '').toLowerCase()
    setPlatforms({
      instagram: pStr.includes('instagram'),
      facebook: pStr.includes('facebook')
    })
    setCaption(p.caption || '')
    setMediaUrl(p.media_urls || '')
    if (p.scheduled_at) {
      try {
        const d = new Date(p.scheduled_at)
        const isoStr = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16)
        setScheduledAt(isoStr)
      } catch(e) {
        setScheduledAt('')
      }
    } else {
      setScheduledAt('')
    }
    setActiveTab('creator')
  }

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
        const mainImg = data.images ? toHighResMlImage(data.images.split(',')[0].trim()) : ''
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
          id: editingPostId,
          product_ml_id: selectedProduct || null,
          title: postTitle.trim(),
          post_type: postType,
          platforms: selectedPlatforms,
          caption: caption.trim(),
          media_urls: mediaUrl.trim(),
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          status: finalStatus
        })
      })
      const data = await res.json()
      if (res.ok) {
        alert(editingPostId ? "Publicación actualizada correctamente." : "Publicación guardada en la cola.")
        handleResetForm()
        fetchPosts()
        setActiveTab('calendar')
      } else {
        alert("Error al guardar: " + (data.detail || "Error desconocido"))
      }
    } catch(err) {
      alert("Error de conexión: " + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePublishNow = async (postId) => {
    if (!confirm("¿Deseas publicar este contenido INMEDIATAMENTE en tus redes sociales?")) return
    try {
      const res = await fetch(`/api/marketing/publish-now/${postId}`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        alert("¡Publicado con éxito! " + data.message)
        fetchPosts()
      } else {
        alert("Error al publicar: " + (data.detail || "Error desconocido"))
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
        Generá Reels y publicaciones con IA (Gemini), programalos y responde comentarios de Instagram y Facebook.
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
          onClick={() => { setActiveTab('comments'); fetchComments(); }}
          style={{
            backgroundColor: activeTab === 'comments' ? 'var(--accent-blue)' : 'var(--bg-card)',
            color: activeTab === 'comments' ? '#fff' : 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <MessageSquare size={16} /> 💬 Inbox de Comentarios
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
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15}}>
              <h3 style={{margin: 0, display: 'flex', alignItems: 'center', gap: 8}}>
                <Sparkles size={18} style={{color: 'var(--accent-orange)'}} />
                {editingPostId ? `✏️ Editando Publicación #${editingPostId}` : '1. Selección de Producto & IA'}
              </h3>
              {editingPostId && (
                <button className="btn" onClick={handleResetForm} style={{padding: '3px 8px', fontSize: '0.75rem', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)'}}>
                  ❌ Cancelar Edición
                </button>
              )}
            </div>

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

              {productImages.length > 0 && (
                <div style={{marginTop: -5, marginBottom: 5}}>
                  <div style={{fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6}}>
                    🖼️ Fotos HD del producto ({productImages.length}) - Clic para elegir:
                  </div>
                  <div style={{display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6}}>
                    {productImages.map((imgUrl, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => setMediaUrl(imgUrl)}
                        style={{
                          border: mediaUrl === imgUrl ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
                          borderRadius: 6,
                          cursor: 'pointer',
                          overflow: 'hidden',
                          backgroundColor: '#111',
                          padding: 2,
                          flexShrink: 0
                        }}
                        title="Usar esta foto HD para la publicación"
                      >
                        <img src={imgUrl} alt="" style={{width: 48, height: 48, objectFit: 'cover', borderRadius: 4}} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

              {generatedData?.video_script_idea && (
                <div style={{backgroundColor: 'var(--bg-dark)', padding: 12, borderRadius: 8, border: '1px dashed var(--accent-orange)'}}>
                  <div style={{fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-orange)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6}}>
                    <Video size={14} /> Idea de Guión para Reel (15 segs):
                  </div>
                  <div style={{fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-line'}}>
                    {generatedData.video_script_idea}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Columna Derecha: Previsualización & Programación */}
          <div className="card" style={{flex: 1.2, minWidth: 340}}>
            <h3 style={{marginTop: 0, marginBottom: 15}}>2. Detalle y Programación</h3>
            
            <div style={{display: 'flex', flexDirection: 'column', gap: 15}}>
              <label style={{fontSize: '0.85rem'}}>Título Interno / Campaña *
                <input 
                  type="text" 
                  value={postTitle} 
                  onChange={e => setPostTitle(e.target.value)} 
                  placeholder="Ej: Promo Fertilizantes Hidroponía Primavera"
                  style={{width: '100%', marginTop: 5, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                />
              </label>

              <div style={{display: 'flex', gap: 15}}>
                <label style={{flex: 1, fontSize: '0.85rem'}}>Tipo de Publicación
                  <select value={postType} onChange={e => setPostType(e.target.value)} style={{width: '100%', marginTop: 5, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}>
                    <option value="post">📷 Foto / Post Feed</option>
                    <option value="reel">🎬 Reel de Instagram / Video</option>
                  </select>
                </label>

                <div style={{flex: 1, fontSize: '0.85rem'}}>
                  <div>Redes Destino</div>
                  <div style={{display: 'flex', gap: 12, marginTop: 8}}>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', cursor: 'pointer'}}>
                      <input type="checkbox" checked={platforms.instagram} onChange={e => setPlatforms({...platforms, instagram: e.target.checked})} /> Instagram
                    </label>
                    <label style={{display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', cursor: 'pointer'}}>
                      <input type="checkbox" checked={platforms.facebook} onChange={e => setPlatforms({...platforms, facebook: e.target.checked})} /> Facebook
                    </label>
                  </div>
                </div>
              </div>

              {postType === 'reel' && mediaUrl && !isVideoUrl(mediaUrl) && (
                <div style={{fontSize: '0.76rem', color: 'var(--accent-orange)', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(245, 158, 11, 0.3)'}}>
                  💡 <strong>Nota sobre Reels:</strong> Los Reels en Instagram requieren un archivo de <strong>VIDEO (.MP4 / .MOV)</strong>. Dado que seleccionaste una imagen estática, el sistema la publicará automáticamente como <strong>Foto en el Feed de Instagram</strong> sin dar error.
                </div>
              )}

              <label style={{fontSize: '0.85rem'}}>Texto de la Publicación (Caption & Hashtags) *
                <textarea 
                  rows={6}
                  value={caption} 
                  onChange={e => setCaption(e.target.value)} 
                  placeholder="El contenido redactado aparecerá aquí..."
                  style={{width: '100%', marginTop: 5, padding: '10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontFamily: 'inherit'}}
                />
              </label>

              <div>
                <label style={{fontSize: '0.85rem', fontWeight: 600}}>URL o Archivo de Imagen / Video *</label>
                <div style={{display: 'flex', gap: 8, marginTop: 5}}>
                  <input 
                    type="text" 
                    value={mediaUrl} 
                    onChange={e => setMediaUrl(toHighResMlImage(e.target.value))} 
                    placeholder="https://... o seleccioná un archivo de la PC" 
                    style={{flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                  />
                  <label className="btn" style={{backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', fontSize: '0.8rem'}}>
                    {uploadingFile ? <RefreshCw className="animate-spin" size={14} /> : <ImageIcon size={14} />}
                    {uploadingFile ? 'Subiendo...' : '📁 Subir de la PC'}
                    <input type="file" accept="image/*,video/*" onChange={handleFileUpload} style={{display: 'none'}} />
                  </label>
                </div>
              </div>

              {mediaUrl && (
                <div style={{padding: 10, borderRadius: 8, backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                  <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 6, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <span>🖼️ Vista Previa del Medio:</span>
                    {mediaUrl.includes('-O.') && <span style={{color: 'var(--accent-emerald)', fontWeight: 600, fontSize: '0.72rem'}}>✨ Calidad HD MercadoLibre (-O.jpg)</span>}
                    {mediaUrl.startsWith('/uploads/') && <span style={{color: 'var(--accent-blue)', fontWeight: 600, fontSize: '0.72rem'}}>📁 Archivo Subido de la PC</span>}
                  </div>
                  {isVideoUrl(mediaUrl) ? (
                    <video src={mediaUrl} controls style={{maxHeight: 180, maxWidth: '100%', borderRadius: 6}} />
                  ) : (
                    <img 
                      src={toHighResMlImage(mediaUrl)} 
                      alt="Previsualización de la publicación" 
                      onError={(e) => { e.target.onerror = null; e.target.src = mediaUrl; }}
                      style={{maxHeight: 180, maxWidth: '100%', objectFit: 'contain', borderRadius: 6, backgroundColor: '#111'}} 
                    />
                  )}
                </div>
              )}

              <label style={{fontSize: '0.85rem'}}>Fecha y Hora de Publicación (Opcional - Dejar vacío para borrador)
                <input 
                  type="datetime-local" 
                  value={scheduledAt} 
                  onChange={e => setScheduledAt(e.target.value)} 
                  style={{width: '100%', marginTop: 5, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)'}}
                />
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

                {scheduledAt && (
                  <button 
                    className="btn" 
                    onClick={() => handleSavePost('scheduled')}
                    disabled={submitting}
                    style={{flex: 1, backgroundColor: 'var(--accent-blue)', color: '#fff'}}
                  >
                    ⏰ Programar Envío
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Cola y Calendario */}
      {activeTab === 'calendar' && (
        <div className="card">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15}}>
            <h3 style={{margin: 0}}>Cola de Publicaciones ({posts.length})</h3>
            <button className="btn" onClick={fetchPosts} style={{padding: '5px 10px', fontSize: '0.8rem', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 5}}>
              <RefreshCw className={loadingPosts ? "animate-spin" : ""} size={14} /> Actualizar
            </button>
          </div>

          {loadingPosts ? (
            <div style={{textAlign: 'center', padding: 30}}>Cargando publicaciones...</div>
          ) : (
            posts.length === 0 ? (
              <div style={{textAlign: 'center', padding: 30, color: 'var(--text-secondary)'}}>
                No hay publicaciones agendadas o creadas.
              </div>
            ) : (
              <div style={{overflowX: 'auto'}}>
                <table className="table" style={{width: '100%', fontSize: '0.85rem'}}>
                  <thead>
                    <tr>
                      <th style={{width: 60}}>Medio</th>
                      <th>Título / Copy</th>
                      <th>Tipo</th>
                      <th>Redes</th>
                      <th>Programado</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map(p => (
                      <tr key={p.id}>
                        <td>
                          {p.media_urls ? (
                            <img src={toHighResMlImage(p.media_urls.split(',')[0])} alt="" style={{width: 40, height: 40, objectFit: 'contain', borderRadius: 4, backgroundColor: '#fff'}} />
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
                          <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                            <button className="btn" style={{padding: '3px 8px', fontSize: '0.7rem', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)'}} onClick={() => handleEditPost(p)} title="Editar Borrador / Publicación">
                              ✏️ Editar
                            </button>
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

      {/* TAB 3: Inbox de Comentarios */}
      {activeTab === 'comments' && (
        <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <h3 style={{margin: 0, display: 'flex', alignItems: 'center', gap: 8}}>
              <MessageSquare size={20} style={{color: 'var(--accent-blue)'}} />
              Inbox de Comentarios (Instagram & Facebook)
            </h3>
            <button 
              className="btn" 
              onClick={fetchComments}
              disabled={loadingComments}
              style={{backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 6}}
            >
              <RefreshCw className={loadingComments ? "animate-spin" : ""} size={14} />
              {loadingComments ? 'Sincronizando...' : 'Actualizar Comentarios'}
            </button>
          </div>

          {loadingComments ? (
            <div style={{textAlign: 'center', padding: 40, color: 'var(--text-secondary)'}}>
              <RefreshCw className="animate-spin" size={24} style={{marginBottom: 10}} />
              <div>Obteniendo comentarios de Instagram y Facebook...</div>
            </div>
          ) : (
            (!commentsData.instagram?.length && !commentsData.facebook?.length) ? (
              <div className="card" style={{textAlign: 'center', padding: 40, color: 'var(--text-secondary)'}}>
                <MessageSquare size={36} style={{marginBottom: 10, opacity: 0.5}} />
                <h4>No se encontraron comentarios recientes</h4>
                <p style={{fontSize: '0.85rem'}}>Verificá que tus publicaciones tengan comentarios o que tus credenciales de Meta incluyan permisos de lectura de comentarios.</p>
              </div>
            ) : (
              <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
                {/* Section Instagram */}
                {commentsData.instagram?.length > 0 && (
                  <div>
                    <h4 style={{marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8, color: '#e1306c'}}>
                      📸 Instagram ({commentsData.instagram.reduce((acc, p) => acc + (p.comments?.length || 0), 0)} comentarios)
                    </h4>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 15}}>
                      {commentsData.instagram.map((post, pIdx) => (
                        <div key={`ig-${pIdx}`} className="card" style={{padding: 15, borderLeft: '4px solid #e1306c'}}>
                          {/* Post Header */}
                          <div style={{display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border-color)'}}>
                            {post.media_url ? (
                              <img src={post.media_url} alt="" style={{width: 44, height: 44, objectFit: 'cover', borderRadius: 6}} />
                            ) : (
                              <div style={{width: 44, height: 44, backgroundColor: 'var(--bg-dark)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                <ImageIcon size={20} />
                              </div>
                            )}
                            <div style={{flex: 1}}>
                              <div style={{fontSize: '0.85rem', fontWeight: 600, maxLine: 1, lineClamp: 1, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden'}}>
                                {post.caption || 'Publicación sin título'}
                              </div>
                              <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>
                                {post.timestamp ? new Date(post.timestamp).toLocaleString('es-AR') : ''}
                              </div>
                            </div>
                            {post.permalink && (
                              <a href={post.permalink} target="_blank" rel="noreferrer" className="btn-icon" style={{color: 'var(--accent-blue)'}} title="Ver en Instagram">
                                <ExternalLink size={16} />
                              </a>
                            )}
                          </div>

                          {/* Comments List */}
                          <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                            {post.comments.map((c) => (
                              <div key={c.id} style={{backgroundColor: 'var(--bg-dark)', padding: 12, borderRadius: 8}}>
                                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 4}}>
                                  <span style={{fontWeight: 700, fontSize: '0.82rem', color: 'var(--accent-blue)'}}>
                                    @{c.username || 'usuario'}
                                  </span>
                                  <span style={{fontSize: '0.72rem', color: 'var(--text-secondary)'}}>
                                    {c.timestamp ? new Date(c.timestamp).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                                  </span>
                                </div>
                                <div style={{fontSize: '0.85rem', marginBottom: 10, color: 'var(--text-primary)'}}>
                                  {c.text}
                                </div>

                                {/* Existing Replies */}
                                {c.replies?.data?.map(rep => (
                                  <div key={rep.id} style={{marginLeft: 15, padding: '6px 10px', backgroundColor: 'var(--bg-card)', borderRadius: 6, marginBottom: 8, borderLeft: '2px solid var(--accent-emerald)', fontSize: '0.8rem'}}>
                                    <strong style={{color: 'var(--accent-emerald)'}}>@{rep.username || 'Tu cuenta'}:</strong> {rep.text}
                                  </div>
                                ))}

                                {/* Reply Input Box */}
                                <div style={{display: 'flex', gap: 8, marginTop: 8}}>
                                  <input 
                                    type="text" 
                                    placeholder={`Responder a @${c.username || 'usuario'}...`}
                                    value={replyInputs[c.id] || ''}
                                    onChange={e => setReplyInputs({ ...replyInputs, [c.id]: e.target.value })}
                                    style={{flex: 1, padding: '6px 10px', fontSize: '0.82rem', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                                  />
                                  <button 
                                    className="btn" 
                                    onClick={() => handleAISuggestReply(c.text, post.caption, c.username, c.id)}
                                    disabled={suggestingId === c.id}
                                    style={{padding: '4px 8px', fontSize: '0.75rem', backgroundColor: 'var(--bg-card)', color: 'var(--accent-orange)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 4}}
                                    title="Sugerir respuesta con Gemini IA"
                                  >
                                    <Sparkles size={12} />
                                    {suggestingId === c.id ? 'IA...' : 'Sugerir IA'}
                                  </button>
                                  <button 
                                    className="btn" 
                                    onClick={() => handleReplyComment('instagram', c.id)}
                                    disabled={replyingId === c.id || !replyInputs[c.id]}
                                    style={{padding: '4px 10px', fontSize: '0.75rem', backgroundColor: 'var(--accent-blue)', color: '#fff', display: 'flex', alignItems: 'center', gap: 4}}
                                  >
                                    <Send size={12} />
                                    {replyingId === c.id ? 'Enviando...' : 'Responder'}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Section Facebook */}
                {commentsData.facebook?.length > 0 && (
                  <div>
                    <h4 style={{marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8, color: '#1877f2'}}>
                      📘 Facebook ({commentsData.facebook.reduce((acc, p) => acc + (p.comments?.length || 0), 0)} comentarios)
                    </h4>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 15}}>
                      {commentsData.facebook.map((post, pIdx) => (
                        <div key={`fb-${pIdx}`} className="card" style={{padding: 15, borderLeft: '4px solid #1877f2'}}>
                          {/* Post Header */}
                          <div style={{display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border-color)'}}>
                            {post.picture ? (
                              <img src={post.picture} alt="" style={{width: 44, height: 44, objectFit: 'cover', borderRadius: 6}} />
                            ) : (
                              <div style={{width: 44, height: 44, backgroundColor: 'var(--bg-dark)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                <ImageIcon size={20} />
                              </div>
                            )}
                            <div style={{flex: 1}}>
                              <div style={{fontSize: '0.85rem', fontWeight: 600, maxLine: 1, lineClamp: 1, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden'}}>
                                {post.message || 'Publicación de Facebook'}
                              </div>
                              <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>
                                {post.created_time ? new Date(post.created_time).toLocaleString('es-AR') : ''}
                              </div>
                            </div>
                            {post.permalink && (
                              <a href={post.permalink} target="_blank" rel="noreferrer" className="btn-icon" style={{color: 'var(--accent-blue)'}} title="Ver en Facebook">
                                <ExternalLink size={16} />
                              </a>
                            )}
                          </div>

                          {/* Comments List */}
                          <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                            {post.comments.map((c) => (
                              <div key={c.id} style={{backgroundColor: 'var(--bg-dark)', padding: 12, borderRadius: 8}}>
                                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 4}}>
                                  <span style={{fontWeight: 700, fontSize: '0.82rem', color: '#1877f2'}}>
                                    {c.from?.name || 'Usuario de Facebook'}
                                  </span>
                                  <span style={{fontSize: '0.72rem', color: 'var(--text-secondary)'}}>
                                    {c.created_time ? new Date(c.created_time).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                                  </span>
                                </div>
                                <div style={{fontSize: '0.85rem', marginBottom: 10, color: 'var(--text-primary)'}}>
                                  {c.message}
                                </div>

                                {/* Existing Replies */}
                                {c.comments?.data?.map(rep => (
                                  <div key={rep.id} style={{marginLeft: 15, padding: '6px 10px', backgroundColor: 'var(--bg-card)', borderRadius: 6, marginBottom: 8, borderLeft: '2px solid var(--accent-emerald)', fontSize: '0.8rem'}}>
                                    <strong style={{color: 'var(--accent-emerald)'}}>{rep.from?.name || 'Página'}:</strong> {rep.message}
                                  </div>
                                ))}

                                {/* Reply Input Box */}
                                <div style={{display: 'flex', gap: 8, marginTop: 8}}>
                                  <input 
                                    type="text" 
                                    placeholder={`Responder a ${c.from?.name || 'usuario'}...`}
                                    value={replyInputs[c.id] || ''}
                                    onChange={e => setReplyInputs({ ...replyInputs, [c.id]: e.target.value })}
                                    style={{flex: 1, padding: '6px 10px', fontSize: '0.82rem', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)'}}
                                  />
                                  <button 
                                    className="btn" 
                                    onClick={() => handleAISuggestReply(c.message, post.message, c.from?.name, c.id)}
                                    disabled={suggestingId === c.id}
                                    style={{padding: '4px 8px', fontSize: '0.75rem', backgroundColor: 'var(--bg-card)', color: 'var(--accent-orange)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 4}}
                                    title="Sugerir respuesta con Gemini IA"
                                  >
                                    <Sparkles size={12} />
                                    {suggestingId === c.id ? 'IA...' : 'Sugerir IA'}
                                  </button>
                                  <button 
                                    className="btn" 
                                    onClick={() => handleReplyComment('facebook', c.id)}
                                    disabled={replyingId === c.id || !replyInputs[c.id]}
                                    style={{padding: '4px 10px', fontSize: '0.75rem', backgroundColor: 'var(--accent-blue)', color: '#fff', display: 'flex', alignItems: 'center', gap: 4}}
                                  >
                                    <Send size={12} />
                                    {replyingId === c.id ? 'Enviando...' : 'Responder'}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {/* TAB 4: Configuración de Redes */}
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
