import React, { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, BookOpen, UserCheck, Eye, EyeOff, Save, Image as ImageIcon, Search, Check, Sparkles } from 'lucide-react'
import MediaBrowser from '../components/MediaBrowser'

export default function BlogCMS() {
  const [activeTab, setActiveTab] = useState('blog') // 'blog' o 'about'
  
  // Blog state
  const [posts, setPosts] = useState([])
  const [loadingPosts, setLoadingPosts] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  
  // Blog Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingPost, setEditingPost] = useState(null)
  const [showMediaModal, setShowMediaModal] = useState(false)
  const [mediaTargetField, setMediaTargetField] = useState('cover') // 'cover' o 'content'
  
  // Form fields
  const [formTitle, setFormTitle] = useState('')
  const [formSlug, setFormSlug] = useState('')
  const [formCategory, setFormCategory] = useState('Guía de Uso')
  const [formSummary, setFormSummary] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formCoverImage, setFormCoverImage] = useState('')
  const [formPublishedAt, setFormPublishedAt] = useState('')
  const [formIsPublished, setFormIsPublished] = useState(1)
  const [formAuthor, setFormAuthor] = useState('Equipo Hidroponia Rosario')
  const [savingPost, setSavingPost] = useState(false)

  // About Us state
  const [cmsConfig, setCmsConfig] = useState({
    about_us_enabled: true,
    blog_enabled: true,
    about_us_title: 'Sobre Nosotros',
    about_us_content: '',
    about_us_images: ''
  })
  const [savingConfig, setSavingConfig] = useState(false)
  const [showAboutMediaModal, setShowAboutMediaModal] = useState(false)

  useEffect(() => {
    fetchPosts()
    fetchCmsConfig()
  }, [])

  const fetchPosts = () => {
    setLoadingPosts(true)
    fetch('/api/blog')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setPosts(data)
        setLoadingPosts(false)
      })
      .catch(err => {
        console.error(err)
        setLoadingPosts(false)
      })
  }

  const fetchCmsConfig = () => {
    fetch('/api/settings/cms-config')
      .then(res => res.json())
      .then(data => {
        if (data) setCmsConfig(prev => ({ ...prev, ...data }))
      })
      .catch(err => console.error(err))
  }

  const handleSaveCmsConfig = (e) => {
    e.preventDefault()
    setSavingConfig(true)
    fetch('/api/settings/cms-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cmsConfig)
    })
      .then(res => res.json())
      .then(() => {
        setSavingConfig(false)
        alert('Configuración de CMS guardada con éxito')
      })
      .catch(err => {
        console.error(err)
        setSavingConfig(false)
        alert('Error al guardar la configuración')
      })
  }

  const openNewPostModal = () => {
    setEditingPost(null)
    setFormTitle('')
    setFormSlug('')
    setFormCategory('Guía de Uso')
    setFormSummary('')
    setFormContent('')
    setFormCoverImage('')
    const todayStr = new Date().toISOString().slice(0, 16)
    setFormPublishedAt(todayStr)
    setFormIsPublished(1)
    setFormAuthor('Equipo Hidroponia Rosario')
    setShowModal(true)
  }

  const openEditPostModal = (post) => {
    setEditingPost(post)
    setFormTitle(post.title || '')
    setFormSlug(post.slug || '')
    setFormCategory(post.category || 'Guía de Uso')
    setFormSummary(post.summary || '')
    setFormContent(post.content || '')
    setFormCoverImage(post.cover_image || '')
    const pubDate = post.published_at ? new Date(post.published_at).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16)
    setFormPublishedAt(pubDate)
    setFormIsPublished(post.is_published ?? 1)
    setFormAuthor(post.author || 'Equipo Hidroponia Rosario')
    setShowModal(true)
  }

  const handleSavePost = (e) => {
    e.preventDefault()
    if (!formTitle.trim() || !formContent.trim()) {
      alert('El título y el contenido son obligatorios.')
      return
    }
    setSavingPost(true)

    const payload = {
      title: formTitle,
      slug: formSlug,
      category: formCategory,
      summary: formSummary,
      content: formContent,
      cover_image: formCoverImage,
      published_at: formPublishedAt,
      is_published: formIsPublished,
      author: formAuthor
    }

    const url = editingPost ? `/api/blog/${editingPost.id}` : '/api/blog'
    const method = editingPost ? 'PUT' : 'POST'

    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(data => {
        setSavingPost(false)
        if (data.id) {
          setShowModal(false)
          fetchPosts()
        } else {
          alert('Error al guardar el artículo')
        }
      })
      .catch(err => {
        console.error(err)
        setSavingPost(false)
        alert('Error al conectar con el servidor')
      })
  }

  const handleDeletePost = (post) => {
    if (!window.confirm(`¿Estás seguro de eliminar el artículo "${post.title}"?`)) return
    fetch(`/api/blog/${post.id}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(() => fetchPosts())
      .catch(err => console.error(err))
  }

  const filteredPosts = posts.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (p.summary && p.summary.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesCategory = categoryFilter === 'ALL' || p.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  const categoriesList = Array.from(new Set(posts.map(p => p.category).filter(Boolean)))

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25, flexWrap: 'wrap', gap: 15 }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <BookOpen size={28} style={{ color: 'var(--accent-blue)' }} /> Contenido Web & Blog Informativo
          </h1>
          <p style={{ margin: '5px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Gestiona dinámicamente tus artículos explicativos, guías de cultivo, tutoriales de uso y la sección Quiénes Somos.
          </p>
        </div>

        {/* Pestañas de navegación */}
        <div style={{ display: 'flex', gap: 10, backgroundColor: 'var(--bg-card)', padding: 4, borderRadius: 8, border: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setActiveTab('blog')}
            className="btn"
            style={{
              backgroundColor: activeTab === 'blog' ? 'var(--accent-blue)' : 'transparent',
              color: activeTab === 'blog' ? '#fff' : 'var(--text-primary)',
              padding: '6px 16px',
              fontSize: '0.85rem',
              borderRadius: 6
            }}
          >
            <BookOpen size={15} style={{ marginRight: 6 }} /> Blog Informativo ({posts.length})
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className="btn"
            style={{
              backgroundColor: activeTab === 'about' ? 'var(--accent-blue)' : 'transparent',
              color: activeTab === 'about' ? '#fff' : 'var(--text-primary)',
              padding: '6px 16px',
              fontSize: '0.85rem',
              borderRadius: 6
            }}
          >
            <UserCheck size={15} style={{ marginRight: 6 }} /> Quiénes Somos
          </button>
        </div>
      </div>

      {/* PESTAÑA 1: BLOG INFORMATIVO */}
      {activeTab === 'blog' && (
        <div>
          {/* Barra de Controles */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 15 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', minWidth: 260 }}>
                <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Buscar artículos..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px 7px 34px', fontSize: '0.85rem', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
                />
              </div>

              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                style={{ padding: '7px 12px', fontSize: '0.85rem', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
              >
                <option value="ALL">Todas las categorías</option>
                {categoriesList.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <button
              onClick={openNewPostModal}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: '0.88rem', fontWeight: 600 }}
            >
              <Plus size={18} /> + Nuevo Artículo Informativo
            </button>
          </div>

          {/* Tabla de Artículos */}
          {loadingPosts ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando artículos informativos...</div>
          ) : filteredPosts.length === 0 ? (
            <div style={{ padding: 50, textAlign: 'center', backgroundColor: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-color)' }}>
              <Sparkles size={40} style={{ color: 'var(--accent-blue)', marginBottom: 12 }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>No hay artículos creados todavía</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '8px 0 15px 0' }}>
                Crea guías de uso, tutoriales y conceptos explicativos para tus clientes.
              </p>
              <button onClick={openNewPostModal} className="btn btn-primary" style={{ padding: '8px 18px' }}>
                <Plus size={16} style={{ marginRight: 6 }} /> Crear primer artículo
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', backgroundColor: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-color)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.02)', textAlign: 'left' }}>
                    <th style={{ padding: '12px 15px' }}>Portada</th>
                    <th style={{ padding: '12px 15px' }}>Título & Resumen</th>
                    <th style={{ padding: '12px 15px' }}>Categoría</th>
                    <th style={{ padding: '12px 15px' }}>Fecha Publicación</th>
                    <th style={{ padding: '12px 15px' }}>Estado</th>
                    <th style={{ padding: '12px 15px', textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPosts.map(post => (
                    <tr key={post.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '10px 15px', width: 70 }}>
                        <img
                          src={post.cover_image || 'https://via.placeholder.com/60'}
                          alt={post.title}
                          style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-color)' }}
                        />
                      </td>
                      <td style={{ padding: '10px 15px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{post.title}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 3 }}>
                          URL: /blog/{post.slug}
                        </div>
                      </td>
                      <td style={{ padding: '10px 15px' }}>
                        <span style={{ padding: '3px 8px', borderRadius: 4, backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#2563eb', fontSize: '0.75rem', fontWeight: 600 }}>
                          {post.category}
                        </span>
                      </td>
                      <td style={{ padding: '10px 15px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        {post.published_at ? new Date(post.published_at).toLocaleDateString('es-AR', { dateStyle: 'medium' }) : 'Inmediata'}
                      </td>
                      <td style={{ padding: '10px 15px' }}>
                        {post.is_published === 1 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent-emerald)', fontSize: '0.8rem', fontWeight: 600 }}>
                            <Eye size={14} /> Publicado
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600 }}>
                            <EyeOff size={14} /> Borrador
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 15px', textAlign: 'right' }}>
                        <button onClick={() => openEditPostModal(post)} className="btn" style={{ padding: '4px 8px', marginRight: 6, fontSize: '0.8rem' }} title="Editar">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDeletePost(post)} className="btn" style={{ padding: '4px 8px', color: 'var(--accent-red)', fontSize: '0.8rem' }} title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA 2: QUIÉNES SOMOS */}
      {activeTab === 'about' && (
        <form onSubmit={handleSaveCmsConfig} style={{ backgroundColor: 'var(--bg-card)', padding: 25, borderRadius: 10, border: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 20 }}>Configuración de "Quiénes Somos"</h2>
          
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="checkbox"
              id="about_us_enabled"
              checked={cmsConfig.about_us_enabled}
              onChange={e => setCmsConfig({ ...cmsConfig, about_us_enabled: e.target.checked })}
              style={{ width: 18, height: 18 }}
            />
            <label htmlFor="about_us_enabled" style={{ fontSize: '0.92rem', fontWeight: 600, cursor: 'pointer' }}>
              Mostrar el menú "Quiénes Somos" en la barra de navegación de la tienda web
            </label>
          </div>

          <div style={{ marginBottom: 15 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: '0.85rem' }}>Título de la sección</label>
            <input
              type="text"
              value={cmsConfig.about_us_title}
              onChange={e => setCmsConfig({ ...cmsConfig, about_us_title: e.target.value })}
              style={{ width: '100%', padding: '8px 12px', fontSize: '0.9rem', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
            />
          </div>

          <div style={{ marginBottom: 15 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: '0.85rem' }}>Historia / Texto Institucional (Soporta salto de línea y párrafos)</label>
            <textarea
              rows={8}
              value={cmsConfig.about_us_content}
              onChange={e => setCmsConfig({ ...cmsConfig, about_us_content: e.target.value })}
              placeholder="Escribe la historia de tu empresa, experiencia en hidroponia, misión y valores..."
              style={{ width: '100%', padding: '10px 12px', fontSize: '0.9rem', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
            />
          </div>

          <div style={{ marginBottom: 25 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: '0.85rem' }}>Fotos del Local / Equipo (URLs separadas por comas)</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="text"
                value={cmsConfig.about_us_images}
                onChange={e => setCmsConfig({ ...cmsConfig, about_us_images: e.target.value })}
                placeholder="https://...1.jpg, https://...2.jpg"
                style={{ flex: 1, padding: '8px 12px', fontSize: '0.88rem', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
              />
              <button
                type="button"
                className="btn"
                onClick={() => setShowAboutMediaModal(true)}
                style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
              >
                <ImageIcon size={16} /> Seleccionar Imagen
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={savingConfig}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', fontSize: '0.9rem', fontWeight: 600 }}
          >
            <Save size={18} /> {savingConfig ? 'Guardando...' : 'Guardar Cambios de Quiénes Somos'}
          </button>
        </form>
      )}

      {/* MODAL CREAR/EDITAR ARTÍCULO */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 10, width: '100%', maxWidth: 800, maxHeight: '90vh', overflowY: 'auto', padding: 25, border: '1px solid var(--border-color)' }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '1.3rem', fontWeight: 700 }}>
              {editingPost ? 'Editar Artículo Informativo' : 'Crear Nuevo Artículo Informativo'}
            </h2>

            <form onSubmit={handleSavePost}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, marginBottom: 15 }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 5 }}>Título del Artículo *</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    placeholder="Ej: Guía de uso: Cómo medir el pH digitalmente"
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 5 }}>Categoría</label>
                  <select
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  >
                    <option value="Guía de Uso">Guía de Uso de Producto</option>
                    <option value="Conceptos">Conceptos de Cultivo</option>
                    <option value="Tutorial">Tutorial Paso a Paso</option>
                    <option value="Consejos">Consejos & Mantenimiento</option>
                    <option value="General">General</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 15 }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 5 }}>Imagen de Portada</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    type="text"
                    value={formCoverImage}
                    onChange={e => setFormCoverImage(e.target.value)}
                    placeholder="https://..."
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setMediaTargetField('cover')
                      setShowMediaModal(true)
                    }}
                    style={{ padding: '8px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    <ImageIcon size={16} /> Galería
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: 15 }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 5 }}>Breve Resumen / Extracto</label>
                <textarea
                  rows={2}
                  value={formSummary}
                  onChange={e => setFormSummary(e.target.value)}
                  placeholder="Resumen corto explicativo para la tarjeta del blog..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
                />
              </div>

              <div style={{ marginBottom: 15 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Cuerpo Completo del Artículo *</label>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setMediaTargetField('content')
                      setShowMediaModal(true)
                    }}
                    style={{ padding: '3px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <ImageIcon size={14} /> Insertar Imagen de Galería
                  </button>
                </div>
                <textarea
                  rows={10}
                  value={formContent}
                  onChange={e => setFormContent(e.target.value)}
                  placeholder="Redacta la guía o concepto. Puedes incluir texto explicativo, pasos (1, 2, 3) y URLs de imágenes..."
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, marginBottom: 20 }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 5 }}>Fecha de Publicación</label>
                  <input
                    type="datetime-local"
                    value={formPublishedAt}
                    onChange={e => setFormPublishedAt(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 5 }}>Estado de Visibilidad</label>
                  <select
                    value={formIsPublished}
                    onChange={e => setFormIsPublished(parseInt(e.target.value, 10))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  >
                    <option value={1}>Eye Publicado en el sitio web</option>
                    <option value={0}>EyeOff Borrador / Oculto</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border-color)', paddingTop: 15 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowModal(false)}
                  style={{ padding: '8px 16px' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingPost}
                  style={{ padding: '8px 20px', fontWeight: 600 }}
                >
                  {savingPost ? 'Guardando...' : (editingPost ? 'Guardar Cambios' : 'Publicar Artículo')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL SELECCION MULTIMEDIA BLOG */}
      {showMediaModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: 20 }}>
          <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 10, width: '100%', maxWidth: 750, maxHeight: '85vh', overflowY: 'auto', padding: 20, border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Seleccionar Imagen de Galería</h3>
              <button className="btn" onClick={() => setShowMediaModal(false)}>Cerrar</button>
            </div>
            <MediaBrowser onSelectImage={(url) => {
              if (mediaTargetField === 'cover') {
                setFormCoverImage(url)
              } else {
                setFormContent(prev => prev + `\n\n![Imagen](${url})\n\n`)
              }
              setShowMediaModal(false)
            }} />
          </div>
        </div>
      )}

      {/* MODAL SELECCION MULTIMEDIA ABOUT */}
      {showAboutMediaModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: 20 }}>
          <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 10, width: '100%', maxWidth: 750, maxHeight: '85vh', overflowY: 'auto', padding: 20, border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Seleccionar Imagen para Quiénes Somos</h3>
              <button className="btn" onClick={() => setShowAboutMediaModal(false)}>Cerrar</button>
            </div>
            <MediaBrowser onSelectImage={(url) => {
              setCmsConfig(prev => ({
                ...prev,
                about_us_images: prev.about_us_images ? `${prev.about_us_images}, ${url}` : url
              }))
              setShowAboutMediaModal(false)
            }} />
          </div>
        </div>
      )}
    </div>
  )
}
