/**
 * Utility to parse and format system & Mercado Libre errors
 * Provides 50% user-friendly explanation (what happened + what to do)
 * and 50% technical debug information (error code, cause, status, references, raw JSON).
 */

export function parseAppError(errorInput, fallbackTitle = 'Error en la operación', itemContext = null) {
  let title = fallbackTitle
  let userMessage = 'Ocurrió un error inesperado al procesar la solicitud.'
  let actionRequired = 'Revisá los datos ingresados o intentá nuevamente más tarde.'
  let techCode = 'UNKNOWN_ERROR'
  let statusCode = 400
  let causeId = null
  let references = []
  let technicalSummary = ''
  let rawJson = ''

  try {
    // 1. Check if errorInput is already a structured object from backend
    const detail = errorInput?.detail !== undefined ? errorInput.detail : errorInput

    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      if (detail.user_title || detail.user_message) {
        title = detail.user_title || title
        userMessage = detail.user_message || userMessage
        actionRequired = detail.action_required || actionRequired
        techCode = detail.tech_code || techCode
        statusCode = detail.status_code || statusCode
        causeId = detail.cause_id || null
        references = Array.isArray(detail.references) ? detail.references : []
        technicalSummary = detail.technical_summary || `${techCode} (HTTP ${statusCode})`
        rawJson = detail.raw || JSON.stringify(detail, null, 2)

        return buildResult({
          title,
          userMessage,
          actionRequired,
          techCode,
          statusCode,
          causeId,
          references,
          technicalSummary,
          rawJson,
          itemContext
        })
      }
    }

    // 2. Extract string content from error
    let rawString = ''
    if (typeof detail === 'string') {
      rawString = detail
    } else if (typeof errorInput === 'string') {
      rawString = errorInput
    } else if (errorInput?.message) {
      rawString = errorInput.message
    } else {
      rawString = JSON.stringify(errorInput || {})
    }

    rawJson = rawString

    // 3. Try to detect embedded JSON (e.g., from Mercado Libre API response)
    let parsedJson = null
    const jsonMatch = rawString.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        parsedJson = JSON.parse(jsonMatch[0])
        rawJson = JSON.stringify(parsedJson, null, 2)
      } catch {
        // Not valid JSON, keep as raw string
      }
    }

    // Extract HTTP status code from text if present (e.g. "Error de Mercado Libre (400):")
    const statusMatch = rawString.match(/\((\d{3})\)/)
    if (statusMatch) {
      statusCode = parseInt(statusMatch[1], 10)
    }

    if (parsedJson) {
      const causes = Array.isArray(parsedJson.cause) ? parsedJson.cause : []
      const firstCause = causes[0] || {}

      techCode = firstCause.code || parsedJson.error || parsedJson.message || `HTTP_${statusCode}`
      causeId = firstCause.cause_id || null
      references = Array.isArray(firstCause.references) ? firstCause.references : []
      const apiMsg = firstCause.message || parsedJson.message || rawString

      const msgLower = String(apiMsg).toLowerCase()
      const refStrs = references.map(r => String(r).toLowerCase())

      // Smart Mapping of Common Errors:
      // Case A: Activating an item without stock (The user's exact case)
      if (techCode === 'item.status.invalid' && (msgLower.includes('without stock') || refStrs.includes('item.available_quantity'))) {
        title = 'No se puede activar: Sin stock'
        userMessage = 'Mercado Libre no permite activar una publicación con 0 unidades de stock disponible.'
        actionRequired = 'Cargale al menos 1 unidad de stock al producto en el inventario antes de activarlo.'
      }
      // Case B: General status transition not allowed
      else if (techCode === 'item.status.invalid') {
        title = 'Cambio de estado no permitido'
        userMessage = `Mercado Libre rechazó el cambio de estado: ${apiMsg}`
        actionRequired = 'Verificá que la publicación no esté finalizada o requiera validación directa en Mercado Libre.'
      }
      // Case C: Invalid price or below category minimum
      else if (String(techCode).toLowerCase().includes('price') || refStrs.some(r => r.includes('price'))) {
        title = 'Precio no permitido por Mercado Libre'
        userMessage = `El precio configurado no cumple con los requisitos mínimos de Mercado Libre: ${apiMsg}`
        actionRequired = 'Ajustá el precio del producto al valor mínimo permitido para su categoría.'
      }
      // Case D: Expired or invalid token (401)
      else if (statusCode === 401 || String(techCode).toLowerCase().includes('token') || msgLower.includes('unauthorized')) {
        title = 'Sesión de Mercado Libre expirada'
        userMessage = 'La conexión con tu cuenta de Mercado Libre ha vencido o requiere nuevos permisos.'
        actionRequired = 'Andá a Configuración > Mercado Libre para volver a vincular la cuenta.'
      }
      // Case E: Item not found (404)
      else if (statusCode === 404) {
        title = 'Publicación no encontrada'
        userMessage = 'La publicación no existe o fue eliminada definitivamente en Mercado Libre.'
        actionRequired = 'Verificá el código MLA de la publicación.'
      }
      // Case F: Generic validation error from MeLi
      else {
        title = 'Validación de Mercado Libre'
        userMessage = `Mercado Libre reportó una validación: ${apiMsg}`
        actionRequired = 'Revisá los datos ingresados para asegurarte de que cumplan con las políticas de Mercado Libre.'
      }

      technicalSummary = `HTTP ${statusCode} | Code: ${techCode}` +
        (causeId ? ` (cause_id: ${causeId})` : '') +
        (references.length > 0 ? ` | Ref: ${references.join(', ')}` : '')

    } else {
      // Plain text or network errors
      if (rawString.toLowerCase().includes('failed to fetch') || rawString.toLowerCase().includes('networkerror')) {
        title = 'Error de conexión'
        userMessage = 'No se pudo conectar con el servidor. Puede haber un microcorte o el servicio backend está reiniciando.'
        actionRequired = 'Verificá tu conexión a internet o reintentá la acción en unos instantes.'
        techCode = 'NETWORK_ERROR'
      } else {
        userMessage = rawString.length > 250 ? rawString.substring(0, 250) + '...' : rawString
        technicalSummary = `HTTP ${statusCode} | ${rawString.substring(0, 100)}`
      }
    }
  } catch (parseErr) {
    console.error('[errorParser] Error al parsear error:', parseErr)
    userMessage = String(errorInput?.message || errorInput || 'Error inesperado')
  }

  return buildResult({
    title,
    userMessage,
    actionRequired,
    techCode,
    statusCode,
    causeId,
    references,
    technicalSummary,
    rawJson,
    itemContext
  })
}

function buildResult(data) {
  const timestamp = new Date().toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'medium'
  })

  // Pre-generate clear text summary ready to be copied to clipboard
  const lines = [
    '========================================',
    '🚨 REPORTE DE ERROR - CONTROL CENTER',
    `📅 Fecha: ${timestamp}`,
  ]

  if (data.itemContext) {
    if (data.itemContext.title) lines.push(`📦 Producto: ${data.itemContext.title}`)
    if (data.itemContext.ml_id) lines.push(`🆔 ID: ${data.itemContext.ml_id}`)
    if (data.itemContext.stock !== undefined) lines.push(`📊 Stock actual: ${data.itemContext.stock}`)
  }

  lines.push('----------------------------------------')
  lines.push('👤 PARA EL USUARIO:')
  lines.push(`• Problema: ${data.userMessage}`)
  lines.push(`• Qué hacer: ${data.actionRequired}`)
  lines.push('----------------------------------------')
  lines.push('🛠️ DETALLES TÉCNICOS (DEBUG):')
  lines.push(`• Código: ${data.techCode}`)
  lines.push(`• HTTP Status: ${data.statusCode}`)
  if (data.causeId) lines.push(`• Cause ID: ${data.causeId}`)
  if (data.references?.length > 0) lines.push(`• Referencias: ${data.references.join(', ')}`)
  if (data.technicalSummary) lines.push(`• Resumen: ${data.technicalSummary}`)

  if (data.rawJson) {
    lines.push('• Payload crudo:')
    lines.push(data.rawJson)
  }
  lines.push('========================================')

  return {
    ...data,
    timestamp,
    copyReport: lines.join('\n')
  }
}
