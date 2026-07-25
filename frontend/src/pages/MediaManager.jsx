import React from 'react'
import MediaBrowser from '../components/MediaBrowser'

export default function MediaManager() {
  return (
    <div>
      <h1 className="page-title">Gestor de Archivos y Multimedia</h1>
      <p className="page-subtitle">Sube y organiza tus imágenes, archivos PDF y documentos para la tienda, el blog y captación de leads.</p>
      
      <div className="card" style={{padding: 20}}>
        <MediaBrowser />
      </div>
    </div>
  )
}
