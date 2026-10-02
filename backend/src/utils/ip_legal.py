"""
Motor de Cálculo Legal de Propiedad Industrial (Argentina)
Cubre:
- Marcas (Ley 22.362 - DJUMT y Renovación Decenal)
- Patentes de Invención (Ley 24.481 - Vigencia 20 años y Anualidades)
- Modelos de Utilidad (Ley 24.481 - Vigencia 10 años y Anualidades)
- Modelos y Diseños Industriales (Decreto-Ley 6673/63 - Quinquenios y Renovación)
"""

from datetime import datetime
from typing import Dict, Any, Optional

def _parse_date(date_str: Optional[str]) -> Optional[datetime]:
    if not date_str:
        return None
    cleaned = str(date_str).strip().replace('Z', '')
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%Y/%m/%d', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M:%S.%f'):
        try:
            return datetime.strptime(cleaned.split('T')[0] if 'T' in cleaned else cleaned, fmt)
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(cleaned)
    except Exception:
        return None

def _format_date(dt: Optional[datetime]) -> str:
    return dt.strftime('%d/%m/%Y') if dt else 'N/A'

def calculate_trademark_legal_status(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calcula fechas estimadas de concesión, vencimiento de renovación (10 años)
    y estado legal de la DJUMT (Declaración Jurada de Uso de Medio Término).
    """
    res = dict(data)
    estado = (res.get('estado') or res.get('Estado') or '').strip().upper()
    fecha_ingreso_str = res.get('fecha_ingreso') or res.get('Fecha_Ingreso') or ''
    fecha_concesion_str = res.get('fecha_concesion') or res.get('fecha_concesion_estimada') or ''

    res['asset_type'] = 'marca'
    res['requiere_djumt'] = False
    res['djumt_codigo'] = 'NO_APLICA'
    res['djumt_mensaje'] = 'Marca no concedida o no requiere DJUMT'
    res['alerta_estado'] = 'VIGENTE'
    res['alerta_mensaje'] = 'Marca en trámite o concedida'

    dt_ingreso = _parse_date(fecha_ingreso_str)
    if not dt_ingreso:
        return res

    dt_concesion = _parse_date(fecha_concesion_str)
    if not dt_concesion:
        # Estimación: ingreso + 1 año
        try:
            dt_concesion = dt_ingreso.replace(year=dt_ingreso.year + 1)
        except ValueError:
            dt_concesion = dt_ingreso.replace(year=dt_ingreso.year + 1, day=28)

    res['fecha_concesion_estimada'] = _format_date(dt_concesion)

    try:
        dt_renovacion = dt_concesion.replace(year=dt_concesion.year + 10)
    except ValueError:
        dt_renovacion = dt_concesion.replace(year=dt_concesion.year + 10, day=28)

    res['fecha_vencimiento_10anos'] = _format_date(dt_renovacion)
    res['fecha_proximo_vencimiento'] = _format_date(dt_renovacion)

    is_concedida = (estado == 'C' or 'CONCEDIDA' in estado)
    now = datetime.now()

    if dt_ingreso.year >= 2013 and is_concedida:
        res['requiere_djumt'] = True
        try:
            dt_djumt_inicio = dt_concesion.replace(year=dt_concesion.year + 5)
            dt_djumt_fin = dt_concesion.replace(year=dt_concesion.year + 6)
        except ValueError:
            dt_djumt_inicio = dt_concesion.replace(year=dt_concesion.year + 5, day=28)
            dt_djumt_fin = dt_concesion.replace(year=dt_concesion.year + 6, day=28)

        res['fecha_limite_djumt_inicio'] = _format_date(dt_djumt_inicio)
        res['fecha_limite_djumt_fin'] = _format_date(dt_djumt_fin)

        if now < dt_djumt_inicio:
            res['djumt_codigo'] = 'PENDIENTE'
            res['djumt_mensaje'] = f"Vigente. Debe presentarse entre {dt_djumt_inicio.strftime('%m/%Y')} y {dt_djumt_fin.strftime('%m/%Y')}"
            res['alerta_estado'] = 'VIGENTE'
            res['alerta_mensaje'] = res['djumt_mensaje']
            res['fecha_proximo_vencimiento'] = _format_date(dt_djumt_inicio)
        elif dt_djumt_inicio <= now <= dt_djumt_fin:
            res['djumt_codigo'] = 'PRESENTAR_AHORA'
            res['djumt_mensaje'] = f"⚠️ ¡VENTANA ABIERTA! Presentar Declaración Jurada antes de {dt_djumt_fin.strftime('%d/%m/%Y')}"
            res['alerta_estado'] = 'PRESENTAR_AHORA'
            res['alerta_mensaje'] = res['djumt_mensaje']
            res['fecha_proximo_vencimiento'] = _format_date(dt_djumt_fin)
        else:
            res['djumt_codigo'] = 'EN_MORA'
            res['djumt_mensaje'] = f"🚨 VENCIDA (+6 años). Presentación extraordinaria con arancel de mora requerida antes de {dt_renovacion.strftime('%d/%m/%Y')}"
            res['alerta_estado'] = 'EN_MORA'
            res['alerta_mensaje'] = res['djumt_mensaje']
            res['fecha_proximo_vencimiento'] = _format_date(dt_renovacion)

    return res

def calculate_patent_legal_status(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Patentes de Invención (Ley 24.481):
    - Vigencia improrrogable: 20 años desde la fecha de presentación (ingreso).
    - Anualidades de mantenimiento: anuales a partir del 3° año de presentación.
    """
    res = dict(data)
    res['asset_type'] = 'patente'
    estado = (res.get('estado') or '').strip().upper()
    fecha_ingreso_str = res.get('fecha_ingreso') or ''
    anualidades_pagadas = int(res.get('anualidades_pagadas') or 0)

    dt_ingreso = _parse_date(fecha_ingreso_str)
    if not dt_ingreso:
        res['alerta_estado'] = 'EN_TRAMITE'
        res['alerta_mensaje'] = 'Fecha de ingreso pendiente de registro'
        return res

    # 20 Años improrrogables desde el ingreso
    try:
        dt_vencimiento_20 = dt_ingreso.replace(year=dt_ingreso.year + 20)
    except ValueError:
        dt_vencimiento_20 = dt_ingreso.replace(year=dt_ingreso.year + 20, day=28)

    res['fecha_vencimiento_10anos'] = _format_date(dt_vencimiento_20) # campo genérico max
    res['fecha_vencimiento_final'] = _format_date(dt_vencimiento_20)

    now = datetime.now()
    if now >= dt_vencimiento_20:
        res['alerta_estado'] = 'VENCIDO'
        res['alerta_mensaje'] = f'Patente expirada a los 20 años ({_format_date(dt_vencimiento_20)}). Pasó a dominio público.'
        res['fecha_proximo_vencimiento'] = _format_date(dt_vencimiento_20)
        return res

    # Cálculo de años transcurridos
    anios_transcurridos = now.year - dt_ingreso.year
    if (now.month, now.day) < (dt_ingreso.month, dt_ingreso.day):
        anios_transcurridos -= 1

    # Si ya se pagaron las 20 anualidades legales
    if anualidades_pagadas >= 20:
        res['proxima_anualidad'] = 20
        res['alerta_estado'] = 'VIGENTE'
        res['alerta_mensaje'] = f'Todas las anualidades completas (20 de 20 abonadas). Patente vigente hasta {_format_date(dt_vencimiento_20)}.'
        res['fecha_proximo_vencimiento'] = _format_date(dt_vencimiento_20)
        return res

    # Las anualidades se pagan a partir del 3° año
    siguiente_anualidad = max(3, anualidades_pagadas + 1)
    res['proxima_anualidad'] = siguiente_anualidad

    # Fecha límite de la próxima anualidad:
    # Si el activo tiene una fecha oficial de vencimiento explícitamente guardada y válida, la respetamos
    custom_venc = _parse_date(res.get('fecha_proximo_vencimiento'))
    if custom_venc and custom_venc > dt_ingreso:
        dt_limite_anualidad = custom_venc
    else:
        try:
            dt_limite_anualidad = dt_ingreso.replace(year=dt_ingreso.year + siguiente_anualidad)
        except ValueError:
            dt_limite_anualidad = dt_ingreso.replace(year=dt_ingreso.year + siguiente_anualidad, day=28)

    res['fecha_proximo_vencimiento'] = _format_date(dt_limite_anualidad)

    # Estado de alerta
    dias_restantes = (dt_limite_anualidad - now).days
    if dias_restantes < 0:
        res['alerta_estado'] = 'EN_MORA'
        res['alerta_mensaje'] = f'🚨 Anualidad N° {siguiente_anualidad} vencida hace {abs(dias_restantes)} días. Requiere pago con recargo o rehabilitación.'
    elif dias_restantes <= 60:
        res['alerta_estado'] = 'PRESENTAR_AHORA'
        res['alerta_mensaje'] = f'⚠️ Vence Anualidad N° {siguiente_anualidad} en {dias_restantes} días ({_format_date(dt_limite_anualidad)}).'
    else:
        res['alerta_estado'] = 'VIGENTE'
        res['alerta_mensaje'] = f'Al día ante el INPI ({anualidades_pagadas} anualidades abonadas). Próxima anualidad N° {siguiente_anualidad} vence el {_format_date(dt_limite_anualidad)}.'

    return res

def calculate_utility_model_legal_status(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Modelos de Utilidad (Ley 24.481):
    - Vigencia improrrogable: 10 años desde la fecha de presentación.
    - Anualidades de mantenimiento: anuales a partir del 3° año.
    """
    res = dict(data)
    res['asset_type'] = 'modelo_utilidad'
    fecha_ingreso_str = res.get('fecha_ingreso') or ''
    anualidades_pagadas = int(res.get('anualidades_pagadas') or 0)

    dt_ingreso = _parse_date(fecha_ingreso_str)
    if not dt_ingreso:
        res['alerta_estado'] = 'EN_TRAMITE'
        res['alerta_mensaje'] = 'Fecha de ingreso pendiente de registro'
        return res

    try:
        dt_vencimiento_10 = dt_ingreso.replace(year=dt_ingreso.year + 10)
    except ValueError:
        dt_vencimiento_10 = dt_ingreso.replace(year=dt_ingreso.year + 10, day=28)

    res['fecha_vencimiento_10anos'] = _format_date(dt_vencimiento_10)
    res['fecha_vencimiento_final'] = _format_date(dt_vencimiento_10)

    now = datetime.now()
    if now >= dt_vencimiento_10:
        res['alerta_estado'] = 'VENCIDO'
        res['alerta_mensaje'] = f'Modelo de Utilidad expirado a los 10 años ({_format_date(dt_vencimiento_10)}). Pasó a dominio público.'
        res['fecha_proximo_vencimiento'] = _format_date(dt_vencimiento_10)
        return res

    # Si ya se pagaron las 10 anualidades legales
    if anualidades_pagadas >= 10:
        res['proxima_anualidad'] = 10
        res['alerta_estado'] = 'VIGENTE'
        res['alerta_mensaje'] = f'Todas las anualidades completas (10 de 10 abonadas). Modelo vigente hasta {_format_date(dt_vencimiento_10)}.'
        res['fecha_proximo_vencimiento'] = _format_date(dt_vencimiento_10)
        return res

    siguiente_anualidad = max(3, anualidades_pagadas + 1)
    res['proxima_anualidad'] = siguiente_anualidad

    custom_venc = _parse_date(res.get('fecha_proximo_vencimiento'))
    if custom_venc and custom_venc > dt_ingreso:
        dt_limite_anualidad = custom_venc
    else:
        try:
            dt_limite_anualidad = dt_ingreso.replace(year=dt_ingreso.year + siguiente_anualidad)
        except ValueError:
            dt_limite_anualidad = dt_ingreso.replace(year=dt_ingreso.year + siguiente_anualidad, day=28)

    res['fecha_proximo_vencimiento'] = _format_date(dt_limite_anualidad)
    dias_restantes = (dt_limite_anualidad - now).days

    if dias_restantes < 0:
        res['alerta_estado'] = 'EN_MORA'
        res['alerta_mensaje'] = f'🚨 Anualidad N° {siguiente_anualidad} vencida hace {abs(dias_restantes)} días.'
    elif dias_restantes <= 60:
        res['alerta_estado'] = 'PRESENTAR_AHORA'
        res['alerta_mensaje'] = f'⚠️ Vence Anualidad N° {siguiente_anualidad} en {dias_restantes} días ({_format_date(dt_limite_anualidad)}).'
    else:
        res['alerta_estado'] = 'VIGENTE'
        res['alerta_mensaje'] = f'Al día ante el INPI ({anualidades_pagadas} anualidades abonadas). Próxima anualidad N° {siguiente_anualidad} vence el {_format_date(dt_limite_anualidad)}.'

    return res

def calculate_industrial_design_legal_status(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Modelos y Diseños Industriales (Decreto-Ley 6673/63):
    - Vigencia inicial: 5 años a partir de la fecha de depósito (ingreso).
    - Renovación: hasta 2 períodos consecutivos de 5 años cada uno (total máximo: 15 años).
    - La solicitud de renovación debe presentarse hasta 6 meses antes de la fecha de vencimiento del período.
    """
    res = dict(data)
    res['asset_type'] = 'diseno_industrial'
    fecha_ingreso_str = res.get('fecha_ingreso') or ''
    quinquenio = int(res.get('quinquenio_actual') or 1)
    if quinquenio not in (1, 2, 3):
        quinquenio = 1
    res['quinquenio_actual'] = quinquenio

    dt_ingreso = _parse_date(fecha_ingreso_str)
    if not dt_ingreso:
        res['alerta_estado'] = 'EN_TRAMITE'
        res['alerta_mensaje'] = 'Fecha de depósito pendiente'
        return res

    # Vencimiento definitivo (15 años)
    try:
        dt_vencimiento_final = dt_ingreso.replace(year=dt_ingreso.year + 15)
    except ValueError:
        dt_vencimiento_final = dt_ingreso.replace(year=dt_ingreso.year + 15, day=28)
    res['fecha_vencimiento_final'] = _format_date(dt_vencimiento_final)

    # Vencimiento del quinquenio actual
    anios_quinquenio = quinquenio * 5
    try:
        dt_vencimiento_quinquenio = dt_ingreso.replace(year=dt_ingreso.year + anios_quinquenio)
    except ValueError:
        dt_vencimiento_quinquenio = dt_ingreso.replace(year=dt_ingreso.year + anios_quinquenio, day=28)

    res['fecha_vencimiento_10anos'] = _format_date(dt_vencimiento_quinquenio)
    res['fecha_proximo_vencimiento'] = _format_date(dt_vencimiento_quinquenio)

    now = datetime.now()
    if now >= dt_vencimiento_final:
        res['alerta_estado'] = 'VENCIDO'
        res['alerta_mensaje'] = f'Diseño Industrial expirado a los 15 años máximos ({_format_date(dt_vencimiento_final)}). Dominio público.'
        return res

    if quinquenio == 3:
        # En el 3er quinquenio no hay más renovación posible
        dias_restantes = (dt_vencimiento_final - now).days
        if dias_restantes < 0:
            res['alerta_estado'] = 'VENCIDO'
            res['alerta_mensaje'] = f'Diseño expirado ({_format_date(dt_vencimiento_final)}).'
        else:
            res['alerta_estado'] = 'VIGENTE'
            res['alerta_mensaje'] = f'Último quinquenio (3/3). Vence definitivamente el {_format_date(dt_vencimiento_final)} (en {dias_restantes} días).'
        return res

    # Para quinquenio 1 o 2: se puede renovar. Ventana abre 6 meses antes (180 días aprox)
    dias_restantes = (dt_vencimiento_quinquenio - now).days
    if dias_restantes < 0:
        res['alerta_estado'] = 'EN_MORA'
        res['alerta_mensaje'] = f'🚨 Quinquenio {quinquenio}° vencido hace {abs(dias_restantes)} días. Requiere renovación urgente si aún se encuentra en plazo de gracia.'
    elif dias_restantes <= 180: # Últimos 6 meses: ventana de renovación
        res['alerta_estado'] = 'PRESENTAR_AHORA'
        res['alerta_mensaje'] = f'⚠️ ¡VENTANA DE RENOVACIÓN ABIERTA! Renovar para acceder al Quinquenio {quinquenio + 1}° antes de {_format_date(dt_vencimiento_quinquenio)}.'
    else:
        res['alerta_estado'] = 'VIGENTE'
        res['alerta_mensaje'] = f'Quinquenio {quinquenio}° vigente. Renovable a partir de los 6 meses previos al {_format_date(dt_vencimiento_quinquenio)}.'

    return res

def enrich_ip_asset_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Enrutador principal de enriquecimiento legal según el tipo de activo.
    """
    asset_type = (data.get('asset_type') or 'marca').strip().lower()
    if asset_type in ('patente', 'patente_invencion'):
        return calculate_patent_legal_status(data)
    elif asset_type in ('modelo_utilidad', 'utilidad'):
        return calculate_utility_model_status(data) if 'calculate_utility_model_status' in globals() else calculate_utility_model_legal_status(data)
    elif asset_type in ('diseno_industrial', 'modelo_industrial', 'diseno'):
        return calculate_industrial_design_legal_status(data)
    else:
        return calculate_trademark_legal_status(data)
