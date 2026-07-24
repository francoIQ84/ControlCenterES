import React, { useState, useEffect } from 'react'
import { Folder, File, Upload, Trash2, Copy, Plus, ChevronRight, CornerDownRight, Check } from 'lucide-react'

export default function MediaBrowser({ onSelectImage }) {
  const [currentPath, setCurrentPath] = useState("")
  const [directories, setDirectories] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Folder creation
  const [showFolderInput, setShowFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  
  // File upload state
  const [uploading, setUploading] = useState(false)

  const fetchMedia = () => {
    setLoading(true)
    fetch(`/api/media/list?path=${currentPath}`)
      .then(res => {
        if (!res.ok) throw new Error("Error listing directory")
        return res.json()
      })
      .then(data => {
        setDirectories(data.directories || [])
        setFiles(data.files || [])
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchMedia()
  }, [currentPath])

  // Helper to safely extract error message from HTTP responses (JSON or HTML)
  const parseErrorResponse = async (res) => {
    try {
      const contentType = res.headers.get("content-type") || ""
      if (contentType.includes("application/json")) {
        const errorData = await res.json()
        return errorData.detail || errorData.message || `Error (${res.status})`
      }
    } catch (e) {
      // JSON parse failed
    }
    if (res.status === 413) {
      return "El archivo es demasiado grande para el servidor (máximo 50MB)."
    }
    return `Error del servidor (Código ${res.status})`
  }

  const handleCreateFolder = async (e) => {
    e.preventDefault()
    if (!newFolderName.trim()) return
    
    try {
      const res = await fetch('/api/media/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim(), path: currentPath })
      })
      
      if (res.ok) {
        setNewFolderName("")
        setShowFolderInput(false)
        fetchMedia()
      } else {
        const errorMsg = await parseErrorResponse(res)
        alert("Error: " + errorMsg)
      }
    } catch(err) {
      alert("Error: " + err.message)
    }
  }

  const handleUpload = async (e) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    
    setUploading(true)
    const formData = new FormData()
    formData.append("file", fileList[0])
    
    try {
      const res = await fetch(`/api/media/upload?path=${currentPath}`, {
        method: 'POST',
        body: formData
      })
      
      if (res.ok) {
        fetchMedia()
      } else {
        const errorMsg = await parseErrorResponse(res)
        alert("Error de subida: " + errorMsg)
      }
    } catch(err) {
      alert("Error: " + err.message)
    } finally {
      setUploading(false)
      // reset file input
      e.target.value = ""
    }
  }

  const handleDelete = async (path) => {
    if (!confirm("¿Estás seguro de que deseas borrar este elemento? Esto no se puede deshacer.")) return
    
    try {
      const res = await fetch(`/api/media/delete?path=${encodeURIComponent(path)}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        fetchMedia()
      } else {
        const errorMsg = await parseErrorResponse(res)
        alert("Error al borrar: " + errorMsg)
      }
    } catch(err) {
      alert("Error: " + err.message)
    }
  }

  const handleCopyUrl = (url) => {
    navigator.clipboard.writeText(url)
    alert("¡Enlace copiado al portapapeles!")
  }

  // Breadcrumbs parsing
  const renderBreadcrumbs = () => {
    const parts = currentPath.split("/").filter(Boolean)
    return (
      <div style={{display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.9rem', marginBottom: 20, flexWrap: 'wrap'}}>
        <span 
          style={{cursor: 'pointer', color: 'var(--accent-blue)', fontWeight: 600}} 
          onClick={() => setCurrentPath("")}
        >
          Raíz
        </span>
        {parts.map((p, idx) => {
          const folderPath = parts.slice(0, idx + 1).join("/")
          return (
            <React.Fragment key={folderPath}>
              <ChevronRight size={14} style={{color: 'var(--text-secondary)'}} />
              <span 
                style={{
                  cursor: idx === parts.length - 1 ? 'default' : 'pointer',
                  color: idx === parts.length - 1 ? 'var(--text-primary)' : 'var(--accent-blue)',
                  fontWeight: idx === parts.length - 1 ? 'bold' : 'normal'
                }}
                onClick={() => idx !== parts.length - 1 && setCurrentPath(folderPath)}
              >
                {p}
              </span>
            </React.Fragment>
          )
        })}
      </div>
    )
  }

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateStr) => {
    try {
      return new Date(dateStr).toLocaleString()
    } catch(e) {
      return dateStr
    }
  }

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
      {/* Barra de Acciones */}
      <div style={{display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', paddingBottom: 15}}>
        <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: 'var(--accent-blue)',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: 6,
            fontSize: '0.9rem',
            cursor: uploading ? 'not-allowed' : 'pointer',
            fontWeight: 500,
            opacity: uploading ? 0.7 : 1
          }}>
            <Upload size={16} />
            {uploading ? "Subiendo..." : "Subir Imagen"}
            <input type="file" accept="image/*" onChange={handleUpload} style={{display: 'none'}} disabled={uploading} />
          </label>

          <button 
            className="btn" 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)'
            }}
            onClick={() => setShowFolderInput(!showFolderInput)}
          >
            <Plus size={16} />
            Nueva Carpeta
          </button>
        </div>
      </div>

      {/* Input de nueva carpeta */}
      {showFolderInput && (
        <form onSubmit={handleCreateFolder} className="card" style={{display: 'flex', gap: 10, padding: 15, alignItems: 'center', maxWidth: 400}}>
          <input 
            type="text" 
            placeholder="Nombre de la carpeta..."
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            style={{flex: 1, padding: 6}}
            autoFocus
          />
          <button type="submit" className="btn" style={{padding: '6px 12px'}}>Crear</button>
          <button type="button" className="btn" style={{backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '6px 12px'}} onClick={() => setShowFolderInput(false)}>Cancelar</button>
        </form>
      )}

      {/* Migas de pan de navegación */}
      {renderBreadcrumbs()}

      {loading ? <p>Cargando medios...</p> : (
        <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
          {/* Listado de Directorios */}
          {directories.length > 0 && (
            <div>
              <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 10}}>Carpetas</span>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 15}}>
                {directories.map(d => (
                  <div 
                    key={d.path} 
                    className="card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 12,
                      cursor: 'pointer',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      transition: 'all 0.2s',
                      backgroundColor: 'var(--bg-card)'
                    }}
                    onClick={() => setCurrentPath(d.path)}
                  >
                    <div style={{display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden'}}>
                      <Folder size={20} style={{color: '#ffe600', flexShrink: 0}} />
                      <span style={{fontWeight: 500, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{d.name}</span>
                    </div>
                    <button 
                      className="btn-icon" 
                      style={{padding: 4}}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(d.path)
                      }}
                      title="Eliminar carpeta"
                    >
                      <Trash2 size={16} style={{color: 'var(--accent-red)'}} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Listado de Archivos */}
          <div>
            <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 10}}>Imágenes</span>
            
            {files.length === 0 ? (
              <div style={{textAlign: 'center', padding: 40, border: '2px dashed var(--border-color)', borderRadius: 12, color: 'var(--text-secondary)'}}>
                <File size={32} style={{margin: '0 auto 10px', opacity: 0.5}} />
                No hay imágenes en esta carpeta.
              </div>
            ) : (
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 20}}>
                {files.map(f => (
                  <div 
                    key={f.path} 
                    className="card"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      overflow: 'hidden',
                      backgroundColor: 'var(--bg-card)',
                      transition: 'transform 0.2s',
                      position: 'relative'
                    }}
                  >
                    {/* Contenedor de Imagen */}
                    <div style={{
                      height: 140, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      backgroundColor: '#fff',
                      padding: 10,
                      borderBottom: '1px solid var(--border-color)',
                      position: 'relative'
                    }}>
                      <img 
                        src={f.url} 
                        alt={f.name} 
                        style={{maxHeight: '100%', maxWidth: '100%', objectFit: 'contain'}} 
                      />
                    </div>

                    {/* Info */}
                    <div style={{padding: 10, display: 'flex', flexDirection: 'column', gap: 4}}>
                      <div 
                        style={{
                          fontSize: '0.8rem', 
                          fontWeight: 600, 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          whiteSpace: 'nowrap'
                        }}
                        title={f.name}
                      >
                        {f.name}
                      </div>
                      <div style={{fontSize: '0.7rem', color: 'var(--text-secondary)'}}>
                        {formatDate(f.date)}
                      </div>
                      <div style={{fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 500}}>
                        {formatSize(f.size)}
                      </div>
                    </div>

                    {/* Acciones */}
                    <div style={{
                      display: 'flex', 
                      borderTop: '1px solid var(--border-color)',
                      backgroundColor: 'rgba(0,0,0,0.02)'
                    }}>
                      {onSelectImage ? (
                        <button 
                          style={{
                            flex: 2, 
                            border: 'none', 
                            background: 'none', 
                            padding: '8px', 
                            fontSize: '0.8rem', 
                            fontWeight: 600, 
                            color: 'var(--accent-blue)', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4
                          }}
                          onClick={() => onSelectImage(f.url)}
                        >
                          <Check size={14} /> Seleccionar
                        </button>
                      ) : (
                        <button 
                          style={{
                            flex: 1, 
                            border: 'none', 
                            background: 'none', 
                            padding: '8px', 
                            fontSize: '0.8rem', 
                            color: 'var(--text-primary)', 
                            cursor: 'pointer',
                            borderRight: '1px solid var(--border-color)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          onClick={() => handleCopyUrl(f.url)}
                          title="Copiar URL directa de imagen"
                        >
                          <Copy size={14} />
                        </button>
                      )}
                      <button 
                        style={{
                          flex: 1, 
                          border: 'none', 
                          background: 'none', 
                          padding: '8px', 
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        onClick={() => handleDelete(f.path)}
                        title="Borrar archivo"
                      >
                        <Trash2 size={14} style={{color: 'var(--accent-red)'}} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
