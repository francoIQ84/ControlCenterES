import React, { useState, useEffect } from 'react'
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  X,
  Code,
  Package,
  Wrench,
  HelpCircle
} from 'lucide-react'

export default function ErrorModal({
  isOpen,
  onClose,
  errorData
}) {
  const [copied, setCopied] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  // Keyboard accessibility (ESC) and body scroll lock
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

  if (!isOpen || !errorData) return null

  const handleCopy = () => {
    if (!errorData.copyReport) return
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(errorData.copyReport)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = errorData.copyReport
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const {
    title = 'Atención requerida',
    userMessage = 'Ocurrió un error al procesar la solicitud.',
    actionRequired = 'Revisá los datos e intentá nuevamente.',
    techCode = 'ERROR',
    statusCode = 400,
    causeId,
    references = [],
    technicalSummary,
    rawJson,
    itemContext
  } = errorData

  const isWarning = statusCode < 500 && statusCode !== 401

  return (
    <div
      className="error-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="error-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="error-modal-header">
          <div className="error-modal-header-left">
            <div className={`error-icon-badge ${isWarning ? 'warning' : 'danger'}`}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="error-modal-subtitle">
                {statusCode >= 400 && statusCode < 500 ? 'Validación de Mercado Libre / Sistema' : 'Error del Servidor'}
              </div>
              <h3 className="error-modal-title">{title}</h3>
            </div>
          </div>
          <button
            type="button"
            className="error-modal-close-btn"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Optional Item / Product Context Banner */}
        {itemContext && (
          <div className="error-item-context">
            <div className="error-item-context-info">
              <Package size={15} className="error-item-icon" />
              <span className="error-item-name">{itemContext.title || 'Producto seleccionado'}</span>
            </div>
            <div className="error-item-badges">
              {itemContext.ml_id && (
                <span className="error-chip mla-chip">{itemContext.ml_id}</span>
              )}
              {itemContext.stock !== undefined && (
                <span className={`error-chip ${Number(itemContext.stock) <= 0 ? 'stock-zero' : 'stock-ok'}`}>
                  Stock: {itemContext.stock}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Modal Body: 50% User / 50% Technical */}
        <div className="error-modal-body">
          {/* SECTION 1: 50% PARA EL USUARIO */}
          <div className="error-section user-section">
            <div className="error-section-tag user-tag">
              <HelpCircle size={14} />
              <span>Para el usuario: Qué pasó y cómo resolverlo</span>
            </div>

            <div className="error-user-message-box">
              <div className="error-message-text">
                {userMessage}
              </div>

              {actionRequired && (
                <div className="error-action-card">
                  <div className="error-action-header">
                    <CheckCircle2 size={16} className="error-action-icon" />
                    <span className="error-action-title">¿Qué tenés que hacer?</span>
                  </div>
                  <div className="error-action-text">
                    {actionRequired}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SECTION 2: 50% PARA DEBUG / TÉCNICO */}
          <div className="error-section tech-section">
            <div className="error-tech-header">
              <div className="error-section-tag tech-tag">
                <Code size={14} />
                <span>Para debuggear fácil: Diagnóstico técnico</span>
              </div>
              <button
                type="button"
                className={`error-copy-btn ${copied ? 'copied' : ''}`}
                onClick={handleCopy}
                title="Copiar reporte completo para soporte o desarrollador"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? '¡Copiado!' : 'Copiar reporte'}</span>
              </button>
            </div>

            <div className="error-tech-card">
              <div className="error-tech-chips">
                <span className="tech-badge status">HTTP {statusCode}</span>
                <span className="tech-badge code">{techCode}</span>
                {causeId && (
                  <span className="tech-badge cause">cause_id: {causeId}</span>
                )}
                {references.length > 0 && (
                  <span className="tech-badge refs">ref: {references.join(', ')}</span>
                )}
              </div>

              {technicalSummary && (
                <div className="error-tech-summary">
                  <code>{technicalSummary}</code>
                </div>
              )}

              {/* Collapsible raw JSON */}
              {rawJson && (
                <div className="error-raw-accordion">
                  <button
                    type="button"
                    className="error-raw-toggle-btn"
                    onClick={() => setShowRaw(!showRaw)}
                  >
                    <span>{showRaw ? 'Ocultar JSON crudo de la API' : 'Ver respuesta JSON cruda (payload)'}</span>
                    {showRaw ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {showRaw && (
                    <pre className="error-raw-code">
                      <code>{rawJson}</code>
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="error-modal-footer">
          <div className="error-footer-hint">
            Presioná <kbd>ESC</kbd> o hacé clic afuera para cerrar
          </div>
          <button
            type="button"
            className="error-modal-action-btn"
            onClick={onClose}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
