import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
import ssl
import re
import html as html_lib
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from src import database

router = APIRouter()

INPI_WS_URL = "https://ws.inpi.gob.ar/wsinpi.asmx"

def _call_soap_action(action: str, body_content: str) -> str:
    """Envía una petición SOAP 1.1 al Web Service del INPI."""
    soap_envelope = f"""<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    {body_content}
  </soap:Body>
</soap:Envelope>"""

    req = urllib.request.Request(
        INPI_WS_URL,
        data=soap_envelope.encode('utf-8'),
        headers={
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': f'"http://tempuri.org/{action}"'
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.read().decode('utf-8', errors='ignore')
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='ignore')
        raise HTTPException(
            status_code=502,
            detail=f"Respuesta de error de INPI (HTTP {e.code}): {err_body[:200]}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=504,
            detail=f"Error de comunicación con servicio INPI: {str(e)}"
        )

def _clean_tag(tag: str) -> str:
    """Remueve namespaces XML para facilitar la lectura de campos."""
    return tag.rsplit('}', 1)[-1]

def _enrich_marca_data(item: dict) -> dict:
    """
    Calcula fechas estimadas de concesión, vencimiento de renovación (10 años)
    y estado legal de la Declaración Jurada de Uso de Medio Término (DJUMT - Ley 22.362 / Res 183/18).
    """
    item_copy = dict(item)
    estado = (item_copy.get('Estado') or '').strip().upper()
    fecha_ingreso_str = item_copy.get('Fecha_Ingreso') or ''

    # Campos calculados por defecto
    item_copy['requiere_djumt'] = False
    item_copy['djumt_codigo'] = 'NO_APLICA'
    item_copy['djumt_mensaje'] = 'Marca no concedida o no requiere DJUMT'
    item_copy['fecha_concesion_estimada'] = 'N/A'
    item_copy['fecha_limite_djumt_inicio'] = 'N/A'
    item_copy['fecha_limite_djumt_fin'] = 'N/A'
    item_copy['fecha_vencimiento_10anos'] = 'N/A'

    if not fecha_ingreso_str:
        return item_copy

    try:
        # Parse ISO datetime
        dt_ingreso = datetime.fromisoformat(fecha_ingreso_str.replace('Z', ''))

        # En marcas concedidas en INPI (Estado == 'C' o 'CONCEDIDA'):
        # Estimación de concesión: dt_ingreso + 12 meses (según tramitación estándar del INPI)
        dt_concesion = dt_ingreso.replace(year=dt_ingreso.year + 1)
        item_copy['fecha_concesion_estimada'] = dt_concesion.strftime('%d/%m/%Y')

        # Vencimiento Decenal de la Marca (10 Años desde concesión)
        dt_renovacion = dt_concesion.replace(year=dt_concesion.year + 10)
        item_copy['fecha_vencimiento_10anos'] = dt_renovacion.strftime('%d/%m/%Y')

        # Ley 22.362 / Res INPI P-183/2018:
        # Marcas concedidas registradas a partir del 12 de enero de 2013 DEBEN presentar la DJUMT entre el 5° y 6° año de concedidas.
        if dt_ingreso.year >= 2013 and (estado == 'C' or 'CONCEDIDA' in estado):
            item_copy['requiere_djumt'] = True

            # Ventana de 5 a 6 años desde la concesión
            dt_djumt_inicio = dt_concesion.replace(year=dt_concesion.year + 5)
            dt_djumt_fin = dt_concesion.replace(year=dt_concesion.year + 6)

            item_copy['fecha_limite_djumt_inicio'] = dt_djumt_inicio.strftime('%d/%m/%Y')
            item_copy['fecha_limite_djumt_fin'] = dt_djumt_fin.strftime('%d/%m/%Y')

            now = datetime.now()

            if now < dt_djumt_inicio:
                item_copy['djumt_codigo'] = 'PENDIENTE'
                item_copy['djumt_mensaje'] = f"Vigente. Debe presentarse entre {dt_djumt_inicio.strftime('%m/%Y')} y {dt_djumt_fin.strftime('%m/%Y')}"
            elif dt_djumt_inicio <= now <= dt_djumt_fin:
                item_copy['djumt_codigo'] = 'PRESENTAR_AHORA'
                item_copy['djumt_mensaje'] = f"⚠️ ¡VENTANA ABIERTA! Presentar Declaración Jurada antes de {dt_djumt_fin.strftime('%d/%m/%Y')}"
            else:
                item_copy['djumt_codigo'] = 'EN_MORA'
                item_copy['djumt_mensaje'] = f"🚨 VENCIDA (+6 años). Presentación extraordinaria con arancel de mora requerida antes de {dt_renovacion.strftime('%d/%m/%Y')}"
    except Exception:
        pass

    return item_copy

def _parse_grilla_marcas(root_element) -> list:
    """Extrae la lista de objetos GrillaMarcas del XML de respuesta y enriquece con cálculos legales de DJUMT."""
    marcas = []
    for node in root_element.iter():
        if _clean_tag(node.tag) == "GrillaMarcas":
            marca_item = {}
            for child in node:
                field_name = _clean_tag(child.tag)
                marca_item[field_name] = child.text.strip() if child.text else ""
            enriched_item = _enrich_marca_data(marca_item)
            marcas.append(enriched_item)
    return marcas

@router.get("/consulta-denominacion")
def consulta_denominacion(denominacion: str = Query(..., description="Nombre o denominación a consultar en el INPI")):
    """
    Consulta marcas registradas o en trámite por Denominación en el INPI.
    """
    clean_denominacion = denominacion.strip()
    if not clean_denominacion:
        raise HTTPException(status_code=400, detail="Debe ingresar una denominación para consultar.")

    body_xml = f"""<ConsultaDenominacion xmlns="http://tempuri.org/">
      <Denominacion>{clean_denominacion}</Denominacion>
    </ConsultaDenominacion>"""

    raw_xml = _call_soap_action("ConsultaDenominacion", body_xml)

    try:
        root = ET.fromstring(raw_xml)
        total = 0
        estado_disponibilidad = "Desconocido"

        for node in root.iter():
            tag = _clean_tag(node.tag)
            if tag == "total" and node.text:
                try:
                    total = int(node.text)
                except ValueError:
                    pass
            elif tag == "estado" and node.text:
                estado_disponibilidad = node.text.strip()

        rows = _parse_grilla_marcas(root)

        return {
            "success": True,
            "query": clean_denominacion,
            "total": total if total else len(rows),
            "estado": estado_disponibilidad,
            "results": rows
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al procesar respuesta XML del INPI: {str(e)}")

@router.get("/consulta-cuit-titular")
def consulta_cuit_titular(
    cuit: Optional[str] = Query(None, description="CUIT del titular (solo números)"),
    titular: Optional[str] = Query(None, description="Nombre o Razón Social del titular")
):
    """
    Consulta marcas asociadas a un CUIT o Nombre de Titular en el INPI.
    """
    cuit_val = cuit.strip() if cuit else ""
    titular_val = titular.strip() if titular else ""

    if not cuit_val and not titular_val:
        raise HTTPException(status_code=400, detail="Debe proporcionar al menos CUIT o Nombre de Titular.")

    body_xml = f"""<ConsultaCuitOTitular xmlns="http://tempuri.org/">
      <cuit>{cuit_val}</cuit>
      <titular>{titular_val}</titular>
    </ConsultaCuitOTitular>"""

    raw_xml = _call_soap_action("ConsultaCuitOTitular", body_xml)

    try:
        root = ET.fromstring(raw_xml)
        total = 0

        for node in root.iter():
            tag = _clean_tag(node.tag)
            if tag == "total" and node.text:
                try:
                    total = int(node.text)
                except ValueError:
                    pass

        rows = _parse_grilla_marcas(root)

        return {
            "success": True,
            "cuit": cuit_val,
            "titular": titular_val,
            "total": total if total else len(rows),
            "results": rows
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al procesar respuesta XML del INPI: {str(e)}")

@router.get("/consulta-notificaciones")
def consulta_notificaciones(
    fecha_inicial: Optional[str] = Query(None, description="Fecha inicial AAAA-MM-DD"),
    fecha_final: Optional[str] = Query(None, description="Fecha final AAAA-MM-DD"),
    expediente: Optional[str] = Query(None, description="Número de expediente / acta"),
    direccion: Optional[str] = Query(None, description="Dirección"),
    tipo_notificacion: Optional[str] = Query(None, description="Tipo de notificación")
):
    """
    Consulta notificaciones del Boletín Oficial del INPI.
    """
    fi_val = fecha_inicial.strip() if fecha_inicial else ""
    ff_val = fecha_final.strip() if fecha_final else ""
    exp_val = expediente.strip() if expediente else ""
    dir_val = direccion.strip() if direccion else ""
    tn_val = tipo_notificacion.strip() if tipo_notificacion else ""

    body_xml = f"""<ConsultaNotificaciones xmlns="http://tempuri.org/">
      <fechaInicial>{fi_val}</fechaInicial>
      <fechafinal>{ff_val}</fechafinal>
      <expediente>{exp_val}</expediente>
      <direccion>{dir_val}</direccion>
      <tipoNotificacion>{tn_val}</tipoNotificacion>
    </ConsultaNotificaciones>"""

    raw_xml = _call_soap_action("ConsultaNotificaciones", body_xml)

    try:
        root = ET.fromstring(raw_xml)
        notificaciones = []

        for node in root.iter():
            if _clean_tag(node.tag) == "Notificaciones_Archivos":
                item = {}
                for child in node:
                    tag = _clean_tag(child.tag)
                    if tag != "Notificaciones_Cuit":
                        item[tag] = child.text.strip() if child.text else ""
                notificaciones.append(item)

        return {
            "success": True,
            "total": len(notificaciones),
            "results": notificaciones
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al procesar notificaciones del INPI: {str(e)}")

def _fetch_inpi_modelo(acta: str) -> Optional[dict]:
    """Consulta los datos oficiales de un Modelo o Diseño Industrial en el portal público del INPI."""
    clean_num = re.sub(r'[^0-9]', '', str(acta).strip())
    if not clean_num:
        raise HTTPException(status_code=400, detail="Debe ingresar un número de acta o expediente válido.")

    url = f"https://portaltramites.inpi.gob.ar/ModelosConsultas/Detalle?numero={clean_num}"
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=15, context=ctx) as res:
            raw_html = res.read().decode('utf-8', errors='ignore')
    except urllib.error.HTTPError as e:
        if e.code in (403, 404, 500):
            # El portal de INPI devuelve 403 o 500 cuando el acta no existe en el padrón
            return None
        raise HTTPException(status_code=502, detail=f"Error del portal INPI (HTTP {e.code})")
    except Exception as e:
        raise HTTPException(status_code=504, detail=f"No se pudo conectar con el portal de Modelos del INPI: {str(e)}")

    def extract_field(label: str) -> str:
        pattern = r'' + re.escape(label) + r'[:\s]*</h4>\s*</div>\s*<div[^>]*>\s*<h4[^>]*>(.*?)</h4>'
        m = re.search(pattern, raw_html, re.DOTALL | re.IGNORECASE)
        if m:
            clean = re.sub(r'<[^>]+>', ' ', m.group(1)).strip()
            return html_lib.unescape(clean)
        return ''

    naturaleza = extract_field('Naturaleza')
    if not naturaleza or 'ViewBag' in naturaleza:
        return None

    titulares = extract_field('Titulares')
    fecha_deposito = extract_field('Fecha Depósito')
    clase = extract_field('Clase/Subclase Internacional')
    prioridad = extract_field('Prioridad')
    resolucion = extract_field('Resolución')

    renovaciones = []
    renov_block = re.search(r'Plazos para presentar renovaciones:.*?</div>\s*<div[^>]*>(.*?)</div>', raw_html, re.DOTALL | re.IGNORECASE)
    if renov_block:
        h4s = re.findall(r'<h4[^>]*>(.*?)</h4>', renov_block.group(1), re.DOTALL | re.IGNORECASE)
        for h in h4s:
            cleaned = html_lib.unescape(re.sub(r'<[^>]+>', ' ', h).strip())
            if cleaned:
                renovaciones.append(re.sub(r'\s+', ' ', cleaned))

    img_match = re.search(r'(data:image/[a-zA-Z0-9\+\/\=]+;base64,[a-zA-Z0-9\+\/\=\r\n]+)', raw_html)
    image_url = img_match.group(1) if (img_match and len(img_match.group(1)) > 50) else None

    fecha_concesion = None
    f_match = re.search(r'(\d{2}/\d{2}/\d{4})', resolucion)
    if f_match:
        fecha_concesion = f_match.group(1)

    return {
        'acta': clean_num,
        'denominacion': naturaleza,
        'titulares': titulares,
        'fecha_ingreso': fecha_deposito,
        'fecha_concesion': fecha_concesion,
        'clasificacion': clase,
        'prioridad': prioridad,
        'estado': resolucion or 'Concedida',
        'renovaciones_oficiales': renovaciones,
        'image_url': image_url,
        'asset_type': 'diseno_industrial',
        'tipo_marca': 'Modelo / Diseño Industrial'
    }

def _fetch_patent_data(query: str) -> Optional[dict]:
    """
    Consulta datos oficiales de patentes y modelos de utilidad en Google Patents y catálogo oficial AR (Espacenet).
    Soporta formatos: AR123630A1, 123630, P210102691, etc.
    """
    clean_q = str(query).strip()
    if not clean_q:
        return None

    upper_q = clean_q.upper().replace(' ', '').replace('-', '').replace(':', '').replace('.', '')
    candidates = []

    if upper_q.startswith('AR'):
        candidates.append(upper_q)
        if not upper_q.endswith(('A1', 'A2', 'B1', 'B2', 'U1', 'U')):
            candidates.append(upper_q + 'A1')
            candidates.append(upper_q + 'B1')
            candidates.append(upper_q + 'U1')
    elif upper_q.startswith('P') and any(c.isdigit() for c in upper_q):
        candidates.append(f"AR{upper_q}A")
        candidates.append(f"AR{upper_q}")
        candidates.append(upper_q)
    else:
        digits = re.sub(r'[^0-9]', '', upper_q)
        if digits:
            candidates.append(f"AR{digits}A1")
            candidates.append(f"AR{digits}B1")
            candidates.append(f"AR{digits}U1")
            candidates.append(f"AR{digits}")
        candidates.append(upper_q)

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    for cand in candidates:
        url = f"https://patents.google.com/patent/{urllib.parse.quote(cand)}/es"
        req = urllib.request.Request(
            url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=9, context=ctx) as resp:
                if resp.status == 200:
                    raw_html = resp.read().decode('utf-8', errors='ignore')

                    # Título
                    title = ""
                    m_title = re.search(r'<meta\s+name=["\']DC\.title["\']\s+content=["\'](.*?)["\']', raw_html, re.I | re.DOTALL)
                    if m_title:
                        title = html_lib.unescape(m_title.group(1).strip())
                    if not title:
                        m_t = re.search(r'<title>(.*?)</title>', raw_html, re.I | re.DOTALL)
                        if m_t:
                            title = html_lib.unescape(m_t.group(1).split('-')[0].strip())

                    if not title or ('Google' in title and len(title) < 15):
                        continue

                    # Resumen técnico (Abstract)
                    abstract = ""
                    m_abs = re.search(r'<meta\s+name=["\']DC\.description["\']\s+content=["\'](.*?)["\']', raw_html, re.I | re.DOTALL)
                    if m_abs:
                        abstract = html_lib.unescape(m_abs.group(1).strip())

                    # Fechas
                    dates = re.findall(r'<meta\s+name=["\']DC\.date["\'](?:\s+scheme=["\'](.*?)["\'])?\s+content=["\'](.*?)["\']', raw_html, re.I)
                    date_sub = None
                    date_issue = None
                    for scheme, val in dates:
                        if scheme == 'dateSubmitted' or not date_sub:
                            date_sub = val
                        if scheme == 'issue' or (date_sub and val != date_sub):
                            date_issue = val

                    # Titulares e Inventores
                    contributor_tags = re.findall(r'<meta\s+name=["\']DC\.contributor["\'][^>]*>', raw_html, re.I)
                    inventors = []
                    assignees = []
                    for tag in contributor_tags:
                        m_c = re.search(r'content=["\'](.*?)["\']', tag)
                        m_s = re.search(r'scheme=["\'](.*?)["\']', tag)
                        c_val = html_lib.unescape(m_c.group(1).strip()) if m_c else ""
                        s_val = m_s.group(1).lower().strip() if m_s else ""
                        if c_val:
                            if s_val == 'inventor':
                                inventors.append(c_val)
                            else:
                                assignees.append(c_val)

                    # Solicitud y Publicación
                    app_num = None
                    m_app = re.search(r'<meta\s+name=["\']citation_patent_application_number["\']\s+content=["\'](.*?)["\']', raw_html, re.I)
                    if m_app:
                        app_num = m_app.group(1).strip().replace('AR:', '').replace(':', '')

                    pub_num = cand
                    m_pub = re.search(r'<meta\s+name=["\']citation_patent_publication_number["\']\s+content=["\'](.*?)["\']', raw_html, re.I)
                    if m_pub:
                        cleaned_pub = m_pub.group(1).strip().replace('AR:', '').replace(':', '')
                        pub_num = f"AR{cleaned_pub}" if not cleaned_pub.startswith('AR') else cleaned_pub

                    # Clasificación CIP / CPC
                    classifs = re.findall(r'<span itemprop=["\']Code["\']>([A-H][0-9]{2}[A-Z]\s*[0-9]+/[0-9]+)</span>', raw_html, re.I)
                    if not classifs:
                        classifs = re.findall(r'\b([A-H]\d{2}[A-Z]\s*\d+/\d+)\b', raw_html)

                    # Tipo de Activo
                    asset_type = 'patente'
                    if 'U' in cand or 'modelo de utilidad' in title.lower() or 'utility model' in title.lower():
                        asset_type = 'modelo_utilidad'

                    titulares_str = ", ".join(list(dict.fromkeys(assignees))) if assignees else ", ".join(list(dict.fromkeys(inventors)))
                    inventores_str = ", ".join(list(dict.fromkeys(inventors)))

                    return {
                        'found': True,
                        'source': 'Google Patents / Espacenet AR',
                        'asset_type': asset_type,
                        'acta': pub_num or cand,
                        'solicitud': app_num,
                        'denominacion': title,
                        'abstract': abstract,
                        'titulares': titulares_str,
                        'inventores_disenadores': inventores_str,
                        'fecha_ingreso': date_sub,
                        'fecha_concesion': date_issue,
                        'clasificacion': classifs[0] if classifs else None,
                        'estado': 'Concedida / Publicada' if date_issue else 'En Trámite',
                        'document_url': f"https://patents.google.com/patent/{cand}/es",
                        'espacenet_url': f"https://worldwide.espacenet.com/patent/search?q={urllib.parse.quote(cand)}"
                    }
        except Exception:
            continue

    return None

@router.get("/consulta-patente")
def consulta_patente(
    query: Optional[str] = Query(None, description="Término o número de patente/modelo a consultar"),
    q: Optional[str] = Query(None, description="Alias para query"),
    acta: Optional[str] = Query(None, description="Alias para número de acta")
):
    """
    Permite buscar una Patente o Modelo por un solo campo (N° de publicación, acta, expediente o código).
    Consulta fuentes oficiales (Google Patents / Espacenet AR) y como alternativa el portal de Modelos del INPI.
    """
    val_query = query if isinstance(query, str) else ""
    val_q = q if isinstance(q, str) else ""
    val_acta = acta if isinstance(acta, str) else ""
    search_term = (val_query or val_q or val_acta).strip()
    if not search_term:
        raise HTTPException(status_code=400, detail="Debe ingresar un término, número de acta o patente para buscar.")

    try:
        from src.utils import ip_legal

        # 1. Buscar en registros de patentes / modelos de utilidad (Google Patents / Espacenet AR)
        patent_data = _fetch_patent_data(search_term)
        if patent_data:
            enriched = ip_legal.enrich_ip_asset_data(patent_data)
            return {
                "success": True,
                "found": True,
                "source": patent_data.get('source', 'Google Patents / Espacenet'),
                "result": enriched
            }

        # 2. Si no se encontró en patentes y contiene dígitos, buscar en portal de Modelos/Diseños de INPI
        digits = re.sub(r'[^0-9]', '', search_term)
        if digits:
            inpi_modelo = _fetch_inpi_modelo(digits)
            if inpi_modelo:
                enriched = ip_legal.enrich_ip_asset_data(inpi_modelo)
                enriched['renovaciones_oficiales'] = inpi_modelo.get('renovaciones_oficiales', [])
                return {
                    "success": True,
                    "found": True,
                    "source": "INPI Argentina (Modelos y Diseños Oficial)",
                    "result": enriched
                }

        # 3. No encontrado en bases públicas online -> permitir incorporar trámite con ese solo campo
        suggested = {
            "acta": search_term,
            "denominacion": f"Trámite / Solicitud {search_term}",
            "asset_type": "patente",
            "fecha_ingreso": datetime.now().strftime('%Y-%m-%d'),
            "estado": "En Trámite"
        }
        enriched = ip_legal.enrich_ip_asset_data(suggested)
        return {
            "success": True,
            "found": False,
            "query": search_term,
            "message": f"No se encontraron antecedentes públicos online para '{search_term}'. Podés incorporarlo directamente para iniciar el seguimiento y cómputo legal.",
            "result": enriched
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error consultando patente o modelo: {str(e)}")

@router.get("/consulta-modelo")
def consulta_modelo(acta: str = Query(..., description="Número de acta o expediente del modelo o diseño industrial")):
    """
    Consulta en tiempo real los datos oficiales de un Modelo o Diseño Industrial en el portal del INPI.
    Si no se encuentra en Modelos, intenta consultar en bases de Patentes y Modelos de Utilidad.
    """
    clean_acta = acta if isinstance(acta, str) else ""
    clean_acta = clean_acta.strip()
    if not clean_acta:
        raise HTTPException(status_code=400, detail="Debe ingresar un número de acta o expediente.")

    try:
        from src.utils import ip_legal
        raw_data = _fetch_inpi_modelo(clean_acta)
        if raw_data:
            enriched = ip_legal.enrich_ip_asset_data(raw_data)
            enriched['renovaciones_oficiales'] = raw_data.get('renovaciones_oficiales', [])
            return {
                "success": True,
                "found": True,
                "source": "INPI Argentina (Modelos Oficial)",
                "result": enriched
            }

        # Fallback a Patentes / Modelos de Utilidad
        patent_data = _fetch_patent_data(clean_acta)
        if patent_data:
            enriched = ip_legal.enrich_ip_asset_data(patent_data)
            return {
                "success": True,
                "found": True,
                "source": patent_data.get('source', 'Google Patents / Espacenet'),
                "result": enriched
            }

        return {
            "success": False,
            "found": False,
            "message": f"No se encontró ningún Modelo o Diseño Industrial con el Acta / Número '{clean_acta}' en el INPI."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error consultando modelo en INPI: {str(e)}")

# --- Endpoints de Portafolio en Seguimiento ---
from pydantic import BaseModel
from src.utils import ip_legal

class AddMonitoredItem(BaseModel):
    Acta: Optional[str] = None
    acta: Optional[str] = None
    Denominacion: Optional[str] = None
    denominacion: Optional[str] = None
    Clase: Optional[int] = None
    clase: Optional[int] = None
    Tipo_Marca: Optional[str] = None
    tipo_marca: Optional[str] = None
    Titulares: Optional[str] = None
    titulares: Optional[str] = None
    Numero_Resolucion: Optional[str] = None
    numero_resolucion: Optional[str] = None
    Estado: Optional[str] = None
    estado: Optional[str] = None
    Fecha_Ingreso: Optional[str] = None
    fecha_ingreso: Optional[str] = None
    fecha_concesion: Optional[str] = None
    fecha_concesion_estimada: Optional[str] = None
    fecha_vencimiento_10anos: Optional[str] = None
    fecha_proximo_vencimiento: Optional[str] = None
    requiere_djumt: Optional[bool] = False
    djumt_codigo: Optional[str] = None
    djumt_mensaje: Optional[str] = None
    image_url: Optional[str] = None
    document_url: Optional[str] = None
    notes: Optional[str] = None
    # Nuevos campos de activos de PI:
    asset_type: Optional[str] = 'marca'
    subtipo: Optional[str] = None
    inventores_disenadores: Optional[str] = None
    clasificacion: Optional[str] = None
    quinquenio_actual: Optional[int] = 1
    anualidades_pagadas: Optional[int] = 0
    proxima_anualidad: Optional[int] = None
    alerta_estado: Optional[str] = None
    alerta_mensaje: Optional[str] = None

class UpdateMonitoredItem(BaseModel):
    denominacion: Optional[str] = None
    titulares: Optional[str] = None
    inventores_disenadores: Optional[str] = None
    clasificacion: Optional[str] = None
    estado: Optional[str] = None
    numero_resolucion: Optional[str] = None
    fecha_ingreso: Optional[str] = None
    fecha_concesion: Optional[str] = None
    fecha_proximo_vencimiento: Optional[str] = None
    quinquenio_actual: Optional[int] = None
    anualidades_pagadas: Optional[int] = None
    notes: Optional[str] = None
    image_url: Optional[str] = None
    document_url: Optional[str] = None
    alerta_estado: Optional[str] = None
    alerta_mensaje: Optional[str] = None

class UpdateImageItem(BaseModel):
    image_url: str

@router.get("/monitored")
def list_monitored_trademarks(asset_type: Optional[str] = Query(None, description="Filtrar por tipo: marca, patente, modelo_utilidad, diseno_industrial, all")):
    """
    Retorna el listado de activos de PI en seguimiento guardados en la base de datos.
    """
    try:
        items = database.get_all_monitored_trademarks(asset_type=asset_type)
        return {
            "success": True,
            "total": len(items),
            "results": items
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al consultar portafolio de activos: {str(e)}")

@router.get("/stats")
def get_ip_stats():
    """
    Retorna estadísticas agregadas del portafolio de Propiedad Industrial.
    """
    try:
        items = database.get_all_monitored_trademarks()
        counts = {
            "total": len(items),
            "marcas": sum(1 for i in items if (i.get('asset_type') or 'marca') == 'marca'),
            "patentes": sum(1 for i in items if i.get('asset_type') == 'patente'),
            "modelos_utilidad": sum(1 for i in items if i.get('asset_type') == 'modelo_utilidad'),
            "disenos_industriales": sum(1 for i in items if i.get('asset_type') == 'diseno_industrial'),
            "alertas_urgentes": sum(1 for i in items if (i.get('djumt_codigo') in ('PRESENTAR_AHORA', 'EN_MORA') or i.get('alerta_estado') in ('PRESENTAR_AHORA', 'EN_MORA')))
        }
        return {
            "success": True,
            "stats": counts
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al calcular estadísticas de PI: {str(e)}")

@router.post("/monitored")
def add_to_monitored(payload: AddMonitoredItem):
    """
    Agrega un activo de PI (marca, patente, modelo de utilidad, diseño industrial) al portafolio.
    """
    data = payload.dict(exclude_none=True)
    try:
        enriched = ip_legal.enrich_ip_asset_data(data)
        item_id = database.add_monitored_trademark(enriched)
        tipo_label = enriched.get('asset_type', 'activo').capitalize()
        return {
            "success": True,
            "id": item_id,
            "message": f"{tipo_label} agregado/a al seguimiento correctamente."
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar activo en seguimiento: {str(e)}")

@router.put("/monitored/{acta}")
def update_monitored(acta: str, payload: UpdateMonitoredItem):
    """
    Actualiza datos de un activo de PI (anualidades pagadas, renovación de quinquenio, notas, estado, etc.).
    """
    data = payload.dict(exclude_none=True)
    data['acta'] = acta
    try:
        # Obtener el registro previo para preservar asset_type y fecha_ingreso si no vienen
        existing_list = database.get_all_monitored_trademarks()
        existing = next((x for x in existing_list if str(x.get('acta')) == str(acta)), None)
        if existing:
            merged = dict(existing)
            merged.update(data)
            data = merged

        enriched = ip_legal.enrich_ip_asset_data(data)
        database.update_monitored_trademark(acta, enriched)
        return {
            "success": True,
            "message": f"Activo Acta {acta} actualizado correctamente."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar activo: {str(e)}")

@router.delete("/monitored/{acta}")
def remove_from_monitored(acta: str):
    """
    Elimina un activo del seguimiento diario.
    """
    try:
        database.delete_monitored_trademark(acta)
        return {
            "success": True,
            "message": f"Activo Acta {acta} eliminado del seguimiento."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al eliminar activo: {str(e)}")

@router.put("/monitored/{acta}/image")
def update_trademark_image(acta: str, payload: UpdateImageItem):
    """
    Actualiza la URL del logo o imagen para un activo.
    """
    try:
        database.update_monitored_trademark_image(acta, payload.image_url)
        return {
            "success": True,
            "message": "Imagen de activo actualizada correctamente."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar imagen: {str(e)}")

@router.post("/monitored/sync")
def sync_monitored_trademarks():
    """
    Re-consulta todas las marcas guardadas en el Web Service del INPI
    y actualiza su estado, número de resolución y alertas DJUMT.
    """
    try:
        tracked_list = database.get_all_monitored_trademarks()
        updated_count = 0

        for item in tracked_list:
            # Solo sincronizar marcas con el servicio web de Denominación
            if (item.get('asset_type') or 'marca') != 'marca':
                continue

            acta = item.get('acta')
            denominacion = item.get('denominacion')
            if not acta and not denominacion:
                continue

            body_xml = f"""<ConsultaDenominacion xmlns="http://tempuri.org/">
              <Denominacion>{denominacion}</Denominacion>
            </ConsultaDenominacion>"""

            try:
                raw_xml = _call_soap_action("ConsultaDenominacion", body_xml)
                root = ET.fromstring(raw_xml)
                rows = _parse_grilla_marcas(root)

                # Buscar la coincidencia por Acta exacto
                match = next((r for r in rows if str(r.get('Acta')) == str(acta)), None)
                if match:
                    database.update_monitored_trademark_data(acta, match)
                    updated_count += 1
            except Exception as item_err:
                print(f"[sync_monitored_trademarks] Error actualizando acta {acta}: {item_err}")

        return {
            "success": True,
            "total_monitored": len(tracked_list),
            "updated_count": updated_count,
            "message": f"Sincronizadas {updated_count} marcas con el INPI."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en la sincronización masiva: {str(e)}")


