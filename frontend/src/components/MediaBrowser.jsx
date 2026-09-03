import React, { useState, useEffect, useRef } from 'react'
import { Folder, File, Upload, Trash2, Copy, Plus, ChevronRight, Check, FileText, Loader2, X, Move } from 'lucide-react'

export default function MediaBrowser({ onSelectImage }) {
  const [currentPath, setCurrentPath] = useState("")
  const [directories, setDirectories] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Folder creation
  const [showFolderInput, setShowFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  
  // File upload state & progress
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null) // { current: 1, total: 3, filename: '' }
  
  // Drag & drop states
  const [isDraggingOverContainer, setIsDraggingOverContainer] = useState(false)
  const [dragTargetFolder, setDragTargetFolder] = useState(null) // path of folder being hovered
  const [draggedItem, setDraggedItem] = useState(null) // internal item being dragged: { type: 'file', path, name }
  const dragCounter = useRef(0)
  const fileInputRef = useRef(null)

  // Feedback notifications
  const [notification, setNotification] = useState(null) // { type: 'success' | 'error' | 'warning', message: '' }
  const notificationTimeoutRef = useRef(null)

  const showNotification = (type, message) => {
    if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current)
    setNotification({ type, message })
    notificationTimeoutRef.current = setTimeout(() => {
      setNotification(null)
    }, 4500)
  }

  const fetchMedia = () => {
    setLoading(true)
    fetch(`/api/media/list?path=${encodeURIComponent(currentPath)}`)
      .then(res => {
        if (!res.ok) throw new Error("Error listando el directorio")
        return res.json()
      })
      .then(data => {
        setDirectories(data.directories || [])
        setFiles(data.files || [])
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        showNotification('error', "No se pudieron cargar los archivos: " + err.message)
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
      return "El archivo es demasiado grande para el servidor (máximo 100MB)."
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
        showNotification('success', `Carpeta "${newFolderName.trim()}" creada con éxito.`)
        setNewFolderName("")
        setShowFolderInput(false)
        fetchMedia()
      } else {
        const errorMsg = await parseErrorResponse(res)
        showNotification('error', "Error al crear carpeta: " + errorMsg)
      }
    } catch(err) {
      showNotification('error', "Error de red: " + err.message)
    }
  }

  // Upload one or multiple files sequentially to a target folder
  const handleUploadFiles = async (fileList, targetFolder = currentPath) => {
    if (!fileList || fileList.length === 0) return
    const fileArray = Array.from(fileList)
    
    setUploading(true)
    let successCount = 0
    let errorCount = 0
    let lastError = ""

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i]
      setUploadProgress({
        current: i + 1,
        total: fileArray.length,
        filename: file.name
      })

      const formData = new FormData()
      formData.append("file", file)

      try {
        const res = await fetch(`/api/media/upload?path=${encodeURIComponent(targetFolder)}`, {
          method: 'POST',
          body: formData
        })

        if (res.ok) {
          successCount++
        } else {
          errorCount++
          lastError = await parseErrorResponse(res)
        }
      } catch (err) {
        errorCount++
        lastError = err.message
      }
    }

    setUploading(false)
    setUploadProgress(null)
    fetchMedia()

    if (errorCount === 0) {
      showNotification(
        'success',
        fileArray.length === 1
          ? `¡"${fileArray[0].name}" se subió correctamente!`
          : `¡${successCount} archivos subidos con éxito!`
      )
    } else if (successCount > 0) {
      showNotification(
        'warning',
        `Se subieron ${successCount} archivos. ${errorCount} no pudieron subirse: ${lastError}`
      )
    } else {
      showNotification('error', `Error al subir archivo(s): ${lastError}`)
    }
  }

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUploadFiles(e.target.files, currentPath)
    }
    e.target.value = ""
  }

  const handleDelete = async (path) => {
    if (!confirm("¿Estás seguro de que deseas borrar este elemento? Esto no se puede deshacer.")) return
    
    try {
      const res = await fetch(`/api/media/delete?path=${encodeURIComponent(path)}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        showNotification('success', "Elemento eliminado correctamente.")
        fetchMedia()
      } else {
        const errorMsg = await parseErrorResponse(res)
        showNotification('error', "Error al borrar: " + errorMsg)
      }
    } catch(err) {
      showNotification('error', "Error: " + err.message)
    }
  }

  const handleCopyUrl = (url) => {
    navigator.clipboard.writeText(url)
    showNotification('success', "¡Enlace copiado al portapapeles!")
  }

  // Move internal item to a folder
  const handleMoveItem = async (sourcePath, targetFolder) => {
    try {
      const res = await fetch('/api/media/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: sourcePath, target_path: targetFolder })
      })

      if (res.ok) {
        const data = await res.json()
        showNotification('success', data.message || "Elemento movido con éxito")
        fetchMedia()
      } else {
        const errorMsg = await parseErrorResponse(res)
        showNotification('error', "Error al mover: " + errorMsg)
      }
    } catch (err) {
      showNotification('error', "Error de red: " + err.message)
    }
  }

  // Helper to check if drag event contains files from the operating system
  const isFilesDragEvent = (e) => {
    if (!e.dataTransfer || !e.dataTransfer.types) return false
    return Array.from(e.dataTransfer.types).includes('Files')
  }

  // Main container Drag & Drop handlers
  const handleContainerDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (isFilesDragEvent(e)) {
      setIsDraggingOverContainer(true)
    }
  }

  const handleContainerDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (isFilesDragEvent(e)) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleContainerDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current <= 0) {
      setIsDraggingOverContainer(false)
      dragCounter.current = 0
    }
  }

  const handleContainerDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setIsDraggingOverContainer(false)
    setDragTargetFolder(null)

    if (isFilesDragEvent(e) && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files, currentPath)
    }
  }

  // Folder drop target handlers
  const handleFolderDragOver = (e, folderPath) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = draggedItem ? 'move' : 'copy'
    if (dragTargetFolder !== folderPath) {
      setDragTargetFolder(folderPath)
    }
  }

  const handleFolderDragLeave = (e, folderPath) => {
    e.preventDefault()
    e.stopPropagation()
    if (dragTargetFolder === folderPath) {
      setDragTargetFolder(null)
    }
  }

  const handleFolderDrop = (e, folderPath) => {
    e.preventDefault()
    e.stopPropagation()
    setDragTargetFolder(null)
    setIsDraggingOverContainer(false)
    dragCounter.current = 0

    // Check if OS files were dropped directly onto a folder card
    if (isFilesDragEvent(e) && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files, folderPath)
      return
    }

    // Check if an internal item was dropped onto the folder
    try {
      const rawData = e.dataTransfer.getData("application/json")
      if (rawData) {
        const item = JSON.parse(rawData)
        if (item && item.path) {
          handleMoveItem(item.path, folderPath)
        }
      }
    } catch(err) {
      console.error(err)
    }
  }

  // Internal item drag handlers (files)
  const handleItemDragStart = (e, fileItem) => {
    setDraggedItem(fileItem)
    e.dataTransfer.setData("application/json", JSON.stringify({
      type: 'media_file',
      path: fileItem.path,
      name: fileItem.name
    }))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleItemDragEnd = () => {
    setDraggedItem(null)
    setDragTargetFolder(null)
  }

  // Breadcrumbs parsing with drop support
  const renderBreadcrumbs = () => {
    const parts = currentPath.split("/").filter(Boolean)
    return (
      <div style={{display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem', marginBottom: 16, flexWrap: 'wrap'}}>
        <span 
          style={{
            cursor: 'pointer', 
            color: dragTargetFolder === "" ? 'var(--accent-emerald)' : 'var(--accent-blue)', 
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: 4,
            backgroundColor: dragTargetFolder === "" ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
            transition: 'all 0.15s'
          }} 
          onClick={() => setCurrentPath("")}
          onDragOver={(e) => handleFolderDragOver(e, "")}
          onDragLeave={(e) => handleFolderDragLeave(e, "")}
          onDrop={(e) => handleFolderDrop(e, "")}
          title="Arrastrá aquí para mover a Raíz"
        >
          Raíz
        </span>
        {parts.map((p, idx) => {
          const folderPath = parts.slice(0, idx + 1).join("/")
          const isTarget = dragTargetFolder === folderPath
          return (
            <React.Fragment key={folderPath}>
              <ChevronRight size={14} style={{color: 'var(--text-secondary)'}} />
              <span 
                style={{
                  cursor: idx === parts.length - 1 ? 'default' : 'pointer',
                  color: isTarget ? 'var(--accent-emerald)' : (idx === parts.length - 1 ? 'var(--text-primary)' : 'var(--accent-blue)'),
                  fontWeight: idx === parts.length - 1 ? 'bold' : 'normal',
                  padding: '2px 6px',
                  borderRadius: 4,
                  backgroundColor: isTarget ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                  transition: 'all 0.15s'
                }}
                onClick={() => idx !== parts.length - 1 && setCurrentPath(folderPath)}
                onDragOver={(e) => handleFolderDragOver(e, folderPath)}
                onDragLeave={(e) => handleFolderDragLeave(e, folderPath)}
                onDrop={(e) => handleFolderDrop(e, folderPath)}
                title={`Arrastrá aquí para mover a ${p}`}
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
    if (!bytes || bytes === 0) return '0 Bytes'
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
    <div 
      style={{display: 'flex', flexDirection: 'column', gap: 20, position: 'relative'}}
      onDragEnter={handleContainerDragEnter}
      onDragOver={handleContainerDragOver}
      onDragLeave={handleContainerDragLeave}
      onDrop={handleContainerDrop}
    >
      {/* Hidden file input supporting multiple files */}
      <input 
        ref={fileInputRef}
        type="file" 
        accept="image/*,.pdf,.doc,.docx,.zip,.txt,.mp4,.mov,.webm" 
        multiple 
        onChange={handleFileInputChange} 
        style={{display: 'none'}} 
        disabled={uploading} 
      />

      {/* Full-area Drop Overlay when dragging files from OS */}
      {isDraggingOverContainer && !dragTargetFolder && (
        <div style={{
          position: 'absolute',
          top: -10,
          left: -10,
          right: -10,
          bottom: -10,
          borderRadius: 12,
          border: '2px dashed var(--accent-blue)',
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          zIndex: 50,
          pointerEvents: 'none',
          animation: 'fadeIn 0.15s ease'
        }}>
          <div style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            backgroundColor: 'var(--accent-blue)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 10px 25px rgba(59, 130, 246, 0.45)',
            transform: 'scale(1.05)',
            transition: 'transform 0.2s'
          }}>
            <Upload size={36} />
          </div>
          <div style={{fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center'}}>
            Soltá tus archivos aquí para subirlos
          </div>
          <div style={{fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6}}>
            Destino: <strong style={{color: 'var(--accent-blue)'}}>{currentPath ? `/${currentPath}` : 'Raíz'}</strong>
          </div>
        </div>
      )}

      {/* Notifications banner */}
      {notification && (
        <div style={{
          padding: '10px 16px',
          borderRadius: 8,
          fontSize: '0.85rem',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: notification.type === 'error' 
            ? 'rgba(239, 68, 68, 0.15)' 
            : (notification.type === 'warning' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)'),
          color: notification.type === 'error' 
            ? 'var(--accent-red)' 
            : (notification.type === 'warning' ? 'var(--accent-amber)' : 'var(--accent-emerald)'),
          border: `1px solid ${notification.type === 'error' ? 'var(--accent-red)' : (notification.type === 'warning' ? 'var(--accent-amber)' : 'var(--accent-emerald)')}`,
          transition: 'all 0.2s ease'
        }}>
          <span>{notification.message}</span>
          <button 
            onClick={() => setNotification(null)} 
            style={{background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 2}}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Uploading progress indicator */}
      {uploading && uploadProgress && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid var(--accent-blue)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', fontWeight: 600}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-blue)'}}>
              <Loader2 size={16} style={{animation: 'spin 1s linear infinite'}} />
              <span>Subiendo archivos ({uploadProgress.current} de {uploadProgress.total})</span>
            </div>
            <span style={{color: 'var(--accent-blue)'}}>
              {Math.round((uploadProgress.current / uploadProgress.total) * 100)}%
            </span>
          </div>
          <div style={{width: '100%', height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden'}}>
            <div style={{
              width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
              height: '100%',
              backgroundColor: 'var(--accent-blue)',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
            Archivo actual: <strong>{uploadProgress.filename}</strong>
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div style={{display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', paddingBottom: 15}}>
        <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
          <button 
            type="button"
            className="btn"
            disabled={uploading}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            style={{
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
              opacity: uploading ? 0.7 : 1,
              border: 'none'
            }}
          >
            <Upload size={16} />
            {uploading ? "Subiendo..." : "Subir Archivo / PDF"}
          </button>

          <button 
            className="btn" 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              padding: '8px 14px',
              borderRadius: 6,
              fontSize: '0.9rem',
              cursor: 'pointer'
            }}
            onClick={() => setShowFolderInput(!showFolderInput)}
          >
            <Plus size={16} />
            Nueva Carpeta
          </button>
        </div>

        <div style={{fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6}}>
          <Move size={14} style={{opacity: 0.7}} />
          <span>Arrastrá y soltá archivos directamente aquí</span>
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

      {/* Migas de pan de navegación con soporte para soltar archivos */}
      {renderBreadcrumbs()}

      {loading ? <p>Cargando medios...</p> : (
        <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
          {/* Listado de Directorios */}
          {directories.length > 0 && (
            <div>
              <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 10}}>
                Carpetas {draggedItem ? '— Soltá un elemento sobre una carpeta para moverlo' : ''}
              </span>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 15}}>
                {directories.map(d => {
                  const isHovered = dragTargetFolder === d.path
                  return (
                    <div 
                      key={d.path} 
                      className="card"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 12,
                        cursor: 'pointer',
                        border: isHovered ? '2px dashed var(--accent-blue)' : '1px solid var(--border-color)',
                        borderRadius: 8,
                        transition: 'all 0.2s',
                        backgroundColor: isHovered ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-card)',
                        transform: isHovered ? 'scale(1.03)' : 'scale(1)',
                        position: 'relative'
                      }}
                      onClick={() => setCurrentPath(d.path)}
                      onDragOver={(e) => handleFolderDragOver(e, d.path)}
                      onDragLeave={(e) => handleFolderDragLeave(e, d.path)}
                      onDrop={(e) => handleFolderDrop(e, d.path)}
                    >
                      <div style={{display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden', flex: 1}}>
                        <Folder size={20} style={{color: isHovered ? 'var(--accent-blue)' : '#ffe600', flexShrink: 0}} />
                        <div style={{display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
                          <span style={{fontWeight: 500, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                            {d.name}
                          </span>
                          {isHovered && (
                            <span style={{fontSize: '0.7rem', color: 'var(--accent-blue)', fontWeight: 600}}>
                              {draggedItem ? `Mover aquí` : `Subir aquí`}
                            </span>
                          )}
                        </div>
                      </div>
                      <button 
                        className="btn-icon" 
                        style={{padding: 4, background: 'none', border: 'none', cursor: 'pointer'}}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(d.path)
                        }}
                        title="Eliminar carpeta"
                      >
                        <Trash2 size={16} style={{color: 'var(--accent-red)'}} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Listado de Archivos */}
          <div>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
              <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em'}}>
                Archivos y Multimedia ({files.length})
              </span>
              {files.length > 0 && (
                <span style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>
                  Podés arrastrar los archivos a cualquier carpeta
                </span>
              )}
            </div>
            
            {files.length === 0 ? (
              <div 
                style={{
                  textAlign: 'center', 
                  padding: '48px 20px', 
                  border: '2px dashed var(--border-color)', 
                  borderRadius: 12, 
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  backgroundColor: 'rgba(255,255,255,0.01)',
                  transition: 'all 0.2s'
                }}
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
              >
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px',
                  color: 'var(--accent-blue)'
                }}>
                  <Upload size={28} />
                </div>
                <div style={{fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4}}>
                  No hay archivos en esta carpeta
                </div>
                <div style={{fontSize: '0.85rem'}}>
                  Arrastrá y soltá tus fotos o documentos aquí, o hacé clic para explorar.
                </div>
              </div>
            ) : (
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 20}}>
                {files.map(f => {
                  const isBeingDragged = draggedItem && draggedItem.path === f.path
                  return (
                    <div 
                      key={f.path} 
                      className="card"
                      draggable={true}
                      onDragStart={(e) => handleItemDragStart(e, f)}
                      onDragEnd={handleItemDragEnd}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        border: '1px solid var(--border-color)',
                        borderRadius: 8,
                        overflow: 'hidden',
                        backgroundColor: 'var(--bg-card)',
                        transition: 'transform 0.2s, opacity 0.2s',
                        position: 'relative',
                        cursor: 'grab',
                        opacity: isBeingDragged ? 0.4 : 1,
                        transform: isBeingDragged ? 'scale(0.96)' : 'none'
                      }}
                      title="Hacé clic y arrastrá para mover a otra carpeta"
                    >
                      {/* Contenedor de Imagen o PDF */}
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
                        {f.file_type === 'pdf' || f.name.toLowerCase().endsWith('.pdf') ? (
                          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: '#e11d48'}}>
                            <FileText size={48} />
                            <span style={{fontSize: '0.7rem', fontWeight: 700, backgroundColor: '#ffe4e6', color: '#be123c', padding: '2px 8px', borderRadius: 4}}>PDF DOCUMENT</span>
                          </div>
                        ) : f.file_type === 'document' ? (
                          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: '#2563eb'}}>
                            <File size={48} />
                            <span style={{fontSize: '0.7rem', fontWeight: 700, backgroundColor: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 4}}>DOCUMENTO</span>
                          </div>
                        ) : (
                          <img 
                            src={f.url} 
                            alt={f.name} 
                            style={{maxHeight: '100%', maxWidth: '100%', objectFit: 'contain'}} 
                          />
                        )}
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
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
