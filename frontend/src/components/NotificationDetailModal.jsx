import React, { useState, useEffect } from 'react'
import {
  X,
  Receipt,
  Package,
  ShieldCheck,
  UserCheck,
  MessageSquare,
  ExternalLink,
  Copy,
  Check,
  Clock,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Trash2,
  ArrowRight,
  ShoppingBag,
  Mail,
  Phone,
  Globe,
  Tag,
  Store,
  DollarSign
} from 'lucide-react'

export default function NotificationDetailModal({
  notification,
  isOpen,
  onClose,
  onDismiss,
  onNavigate
}) {
  const [copiedKey, setCopiedKey] = useState(null)

  // Keyboard accessibility (Escape key) and body scroll lock for desktop / notebook / tablet
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen || !notification) return null

  const handleCopy = (text, key) => {
    if (!text) return
    navigator.clipboard?.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const category = notification.category || 'sales'
  const details = notification.details || {}
  const severity = notification.severity || 'info'

  // Helpers for category styling
  const getCategoryConfig = () => {
    switch (category) {
      case 'sales':
        return {
          icon: <Receipt size={18} />,
          name: 'Venta',
          color: 'var(--accent-blue)',
          bg: 'rgba(37, 99, 235, 0.12)',
          actionLabel: 'Ver detalle en Ventas'
        }
      case 'inventory':
        return {
          icon: <Package size={18} />,
          name: 'Inventario & Stock',
          color: severity === 'danger' ? 'var(--accent-red)' : '#f59e0b',
          bg: severity === 'danger' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
          actionLabel: 'Gestionar en Inventario'
        }
      case 'inpi':
        return {
          icon: <ShieldCheck size={18} />,
          name: 'Propiedad Industrial',
          color: severity === 'danger' ? 'var(--accent-red)' : '#f59e0b',
          bg: severity === 'danger' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
          actionLabel: 'Ver en Propiedad Industrial'
        }
      case 'leads':
        return {
          icon: <UserCheck size={18} />,
          name: 'Nuevo Lead',
          color: '#8b5cf6',
          bg: 'rgba(139, 92, 246, 0.12)',
          actionLabel: 'Ver en CRM & Clientes'
        }
      case 'whatsapp':
        return {
          icon: <MessageSquare size={18} />,
          name: 'WhatsApp',
          color: '#22c55e',
          bg: 'rgba(34, 197, 94, 0.12)',
          actionLabel: 'Abrir gestión WhatsApp'
        }
      default:
        return {
          icon: <AlertCircle size={18} />,
          name: 'Notificación',
          color: 'var(--accent-blue)',
          bg: 'rgba(37, 99, 235, 0.12)',
          actionLabel: 'Ver detalles'
        }
    }
  }

  const catConfig = getCategoryConfig()

  return (
    <div
      className="notif-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="notif-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle for touch / iPhone */}
        <div className="notif-modal-mobile-handle" />

        {/* Modal Header */}
        <div className="notif-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              className="notif-category-badge"
              style={{ backgroundColor: catConfig.bg, color: catConfig.color }}
            >
              {catConfig.icon}
              <span>{catConfig.name}</span>
            </span>

            {severity === 'danger' && (
              <span className="notif-severity-badge danger">
                <AlertTriangle size={12} /> Urgente
              </span>
            )}
            {severity === 'warning' && (
              <span className="notif-severity-badge warning">
                <AlertCircle size={12} /> Atención
              </span>
            )}
            {severity === 'info' && (
              <span className="notif-severity-badge info">
                <CheckCircle2 size={12} /> Info
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="btn-icon"
              onClick={onClose}
              title="Cerrar modal"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-hover)',
                border: '1px solid var(--border-color)',
                cursor: 'pointer'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="notif-modal-body">
          {/* Main Title & Time */}
          <div style={{ marginBottom: '14px' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: '1.35' }}>
              {notification.title}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              <Clock size={13} />
              <span>{notification.time}</span>
              {notification.is_read && (
                <span style={{ marginLeft: '6px', color: 'var(--accent-emerald)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <Check size={12} /> Leída
                </span>
              )}
            </div>
          </div>

          {/* Category-Specific Rich Details */}
          {category === 'sales' && (
            <div className="notif-sales-section">
              {/* Total Amount Hero Card */}
              {details.total_amount !== undefined && (
                <div className="notif-hero-card">
                  <div className="notif-hero-label">Monto Total de la Orden</div>
                  <div className="notif-hero-value">
                    ${Number(details.total_amount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="notif-hero-curr">{details.currency_id || 'ARS'}</span>
                  </div>
                </div>
              )}

              {/* Order Metadata Pills */}
              <div className="notif-meta-grid">
                <div className="notif-meta-item">
                  <span className="notif-meta-title">Plataforma</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.85rem' }}>
                    <Store size={14} style={{ color: 'var(--accent-blue)' }} />
                    <span>{details.platform || 'Mercado Libre'}</span>
                  </div>
                </div>

                <div className="notif-meta-item">
                  <span className="notif-meta-title">Estado de Pago</span>
                  <span className={`notif-status-chip ${details.payment_status === 'approved' ? 'green' : 'amber'}`}>
                    {details.payment_status === 'approved' ? 'Aprobado' : (details.payment_status || 'Pendiente')}
                  </span>
                </div>

                <div className="notif-meta-item">
                  <span className="notif-meta-title">Estado de Envío</span>
                  <span className="notif-status-chip blue">
                    {details.shipping_status === 'delivered' ? 'Entregado' : details.shipping_status === 'shipped' ? 'En camino' : (details.shipping_status || 'Pendiente de envío')}
                  </span>
                </div>

                {details.payment_method && (
                  <div className="notif-meta-item">
                    <span className="notif-meta-title">Método</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{details.payment_method}</span>
                  </div>
                )}
              </div>

              {/* Buyer & Order ID Card */}
              <div className="notif-info-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Datos del Comprador
                  </span>
                  {details.order_id && (
                    <button
                      type="button"
                      onClick={() => handleCopy(String(details.order_id), 'order_id')}
                      className="btn-notif-copy"
                      title="Copiar número de orden"
                    >
                      {copiedKey === 'order_id' ? <Check size={12} /> : <Copy size={12} />}
                      <span>#{details.order_id}</span>
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {details.buyer_name || 'Cliente'}
                </div>
                {details.buyer_nickname && details.buyer_nickname !== details.buyer_name && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Usuario: @{details.buyer_nickname}
                  </div>
                )}
              </div>

              {/* Items List */}
              {Array.isArray(details.items) && details.items.length > 0 && (
                <div style={{ marginTop: '14px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Productos de la orden ({details.items.length})
                  </span>
                  <div className="notif-items-list">
                    {details.items.map((itm, i) => (
                      <div key={i} className="notif-item-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                          <ShoppingBag size={16} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div className="notif-item-title">{itm.title}</div>
                            {itm.sku && <span className="notif-item-sku">SKU: {itm.sku}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
                          <span className="notif-qty-badge">{itm.quantity || 1} u.</span>
                          {itm.unit_price > 0 && (
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                              ${Number(itm.unit_price * (itm.quantity || 1)).toLocaleString('es-AR')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {category === 'inventory' && (
            <div className="notif-inventory-section">
              {/* Product Card with Thumbnail */}
              <div className="notif-product-card">
                {details.thumbnail ? (
                  <img
                    src={details.thumbnail}
                    alt={details.title}
                    className="notif-product-thumb"
                  />
                ) : (
                  <div className="notif-product-thumb-fallback">
                    <Package size={28} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="notif-product-title">{details.title || notification.title}</div>
                  {details.ml_id && (
                    <button
                      type="button"
                      onClick={() => handleCopy(details.ml_id, 'sku')}
                      className="btn-notif-copy"
                      style={{ marginTop: '4px' }}
                      title="Copiar ID / SKU"
                    >
                      {copiedKey === 'sku' ? <Check size={12} /> : <Copy size={12} />}
                      <span>ID: {details.ml_id}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Stock Status Box */}
              <div className={`notif-stock-box ${details.available_quantity === 0 ? 'out-of-stock' : 'low-stock'}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {details.available_quantity === 0 ? (
                    <AlertTriangle size={22} style={{ color: 'var(--accent-red)' }} />
                  ) : (
                    <AlertCircle size={22} style={{ color: '#f59e0b' }} />
                  )}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                      {details.available_quantity === 0
                        ? '¡Producto completamente agotado!'
                        : `Stock crítico: solo ${details.available_quantity} unidades restantes`}
                    </div>
                    <div style={{ fontSize: '0.78rem', opacity: 0.85, marginTop: '2px' }}>
                      {details.min_stock > 0
                        ? `El stock mínimo de seguridad fijado para este producto es de ${details.min_stock} u.`
                        : 'Se recomienda reponer unidades a la brevedad para no perder ventas.'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Prices Card */}
              <div className="notif-prices-grid">
                <div className="notif-price-pill">
                  <span className="notif-price-label">Precio ML</span>
                  <span className="notif-price-value">${Number(details.price || 0).toLocaleString('es-AR')}</span>
                </div>
                {details.price_web > 0 && (
                  <div className="notif-price-pill">
                    <span className="notif-price-label">Precio Web</span>
                    <span className="notif-price-value">${Number(details.price_web).toLocaleString('es-AR')}</span>
                  </div>
                )}
                {details.cost_price > 0 && (
                  <div className="notif-price-pill">
                    <span className="notif-price-label">Costo reposición</span>
                    <span className="notif-price-value">${Number(details.cost_price).toLocaleString('es-AR')}</span>
                  </div>
                )}
              </div>

              {details.permalink && (
                <div style={{ marginTop: '10px' }}>
                  <a
                    href={details.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="notif-external-link"
                  >
                    <span>Ver publicación en Mercado Libre</span>
                    <ExternalLink size={14} />
                  </a>
                </div>
              )}
            </div>
          )}

          {category === 'inpi' && (
            <div className="notif-inpi-section">
              <div className="notif-inpi-hero">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span className="notif-inpi-type-badge">
                    {details.asset_type === 'patente' ? '💡 Patente' : details.asset_type === 'modelo_utilidad' ? '⚙️ Modelo de Utilidad' : details.asset_type === 'diseno_industrial' ? '🎨 Diseño Industrial' : '🛡️ Marca Registrada'}
                  </span>
                  {details.acta && (
                    <button
                      type="button"
                      onClick={() => handleCopy(details.acta, 'acta')}
                      className="btn-notif-copy"
                      title="Copiar número de acta"
                    >
                      {copiedKey === 'acta' ? <Check size={12} /> : <Copy size={12} />}
                      <span>Acta #{details.acta}</span>
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {details.denominacion || notification.title}
                </div>
              </div>

              <div className={`notif-legal-alert-box ${details.alerta_codigo === 'EN_MORA' ? 'mora' : 'warning'}`}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <AlertTriangle size={20} style={{ color: details.alerta_codigo === 'EN_MORA' ? 'var(--accent-red)' : '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: '3px' }}>
                      {details.alerta_codigo === 'EN_MORA' ? 'Plazo Vencido (En Mora)' : 'Plazo Legal en Ventana'}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                      {details.alerta_mensaje || notification.message}
                    </div>
                    {details.fecha_vencimiento && (
                      <div style={{ marginTop: '6px', fontSize: '0.8rem', fontWeight: 600, color: details.alerta_codigo === 'EN_MORA' ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                        Fecha límite: {details.fecha_vencimiento}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="notif-inpi-details-grid">
                {details.clasificacion && (
                  <div className="notif-meta-item">
                    <span className="notif-meta-title">Clasificación</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{details.clasificacion}</span>
                  </div>
                )}
                {details.subtipo && (
                  <div className="notif-meta-item">
                    <span className="notif-meta-title">Subtipo</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{details.subtipo}</span>
                  </div>
                )}
                {details.fecha_concesion && (
                  <div className="notif-meta-item">
                    <span className="notif-meta-title">Concesión</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{details.fecha_concesion}</span>
                  </div>
                )}
                {details.inventores_disenadores && (
                  <div className="notif-meta-item" style={{ gridColumn: 'span 2' }}>
                    <span className="notif-meta-title">Inventores / Titulares</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{details.inventores_disenadores}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {category === 'leads' && (
            <div className="notif-lead-section">
              <div className="notif-lead-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <div className="notif-lead-avatar">
                    <UserCheck size={22} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                      {details.name || 'Nuevo Contacto'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {details.country || 'Argentina'}
                    </div>
                  </div>
                </div>

                <div className="notif-lead-contact-row">
                  <Mail size={16} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {details.email}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(details.email, 'email')}
                    className="btn-notif-copy"
                    title="Copiar correo"
                  >
                    {copiedKey === 'email' ? <Check size={12} /> : <Copy size={12} />}
                    <span>Copiar</span>
                  </button>
                  <a
                    href={`mailto:${details.email}`}
                    className="btn-notif-copy"
                    title="Enviar correo"
                  >
                    <ExternalLink size={12} />
                    <span>Escribir</span>
                  </a>
                </div>

                {details.source && (
                  <div style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Origen: <strong style={{ color: 'var(--text-primary)' }}>{details.source}</strong>
                  </div>
                )}
              </div>
            </div>
          )}

          {category === 'whatsapp' && (
            <div className="notif-whatsapp-section">
              <div className="notif-wa-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <div className="notif-wa-avatar">
                    <MessageSquare size={22} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                      +{details.sender}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#22c55e', fontWeight: 600 }}>
                      Requiere Atención Humana
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: '1.4' }}>
                  {notification.message || 'El cliente ha solicitado hablar con un asesor o el asistente automático se encuentra pausado para este chat.'}
                </div>

                {details.sender && (
                  <a
                    href={`https://wa.me/${String(details.sender).replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-notif-wa"
                  >
                    <Phone size={15} />
                    <span>Abrir Chat de WhatsApp</span>
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="notif-modal-footer">
          <button
            type="button"
            className="btn-notif-dismiss"
            onClick={() => onDismiss(notification.id)}
            title="Quitar esta notificación de mi lista"
          >
            <Trash2 size={15} />
            <span>Descartar alerta</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn-secondary notif-btn-mobile"
              onClick={onClose}
              style={{ fontSize: '0.85rem', padding: '8px 14px' }}
            >
              Cerrar
            </button>

            {notification.link && (
              <button
                type="button"
                className="btn-primary notif-btn-mobile"
                onClick={() => onNavigate(notification.link)}
                style={{ fontSize: '0.85rem', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span>{catConfig.actionLabel}</span>
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
