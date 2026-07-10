import React from 'react'
import MediaBrowser from '../components/MediaBrowser'

export default function MediaManager() {
  return (
    <div>
      <h1 className="page-title">Gestor de Imágenes</h1>
      <p className="page-subtitle">Sube y organiza tus imágenes en carpetas para usarlas en la tienda.</p>
      
      <div className="card" style={{padding: 20}}>
        <MediaBrowser />
      </div>
    </div>
  )
}
