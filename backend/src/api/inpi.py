import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
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

# --- Endpoints de Portafolio en Seguimiento ---
from pydantic import BaseModel

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
    fecha_concesion_estimada: Optional[str] = None
    fecha_vencimiento_10anos: Optional[str] = None
    requiere_djumt: Optional[bool] = False
    djumt_codigo: Optional[str] = None
    djumt_mensaje: Optional[str] = None
    image_url: Optional[str] = None
    notes: Optional[str] = None

class UpdateImageItem(BaseModel):
    image_url: str

@router.get("/monitored")
def list_monitored_trademarks():
    """
    Retorna el listado de marcas en seguimiento guardadas en la base de datos.
    """
    try:
        items = database.get_all_monitored_trademarks()
        return {
            "success": True,
            "total": len(items),
            "results": items
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al consultar portafolio de marcas: {str(e)}")

@router.post("/monitored")
def add_to_monitored(payload: AddMonitoredItem):
    """
    Agrega una marca al portafolio de seguimiento diario.
    """
    data = payload.dict(exclude_none=True)
    try:
        # Si la marca no tiene calculada la DJUMT, la calculamos antes de guardar
        enriched = _enrich_marca_data(data)
        item_id = database.add_monitored_trademark(enriched)
        return {
            "success": True,
            "id": item_id,
            "message": "Marca agregada al seguimiento diario correctamente."
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar marca en seguimiento: {str(e)}")

@router.delete("/monitored/{acta}")
def remove_from_monitored(acta: str):
    """
    Elimina una marca del seguimiento diario.
    """
    try:
        database.delete_monitored_trademark(acta)
        return {
            "success": True,
            "message": f"Marca Acta {acta} eliminada del seguimiento."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al eliminar marca: {str(e)}")

@router.put("/monitored/{acta}/image")
def update_trademark_image(acta: str, payload: UpdateImageItem):
    """
    Actualiza la URL del logo o imagen para una marca.
    """
    try:
        database.update_monitored_trademark_image(acta, payload.image_url)
        return {
            "success": True,
            "message": "Imagen de marca actualizada correctamente."
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
            acta = item.get('acta')
            denominacion = item.get('denominacion')
            if not acta and not denominacion:
                continue

            # Buscar en INPI por Denominacion
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
            "message": f"Sincronizadas {updated_count} de {len(tracked_list)} marcas con el INPI."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en la sincronización masiva: {str(e)}")

