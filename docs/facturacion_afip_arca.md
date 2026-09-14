# 🧾 Guía de Facturación Electrónica Oficial ARCA / AFIP

Esta guía documenta el funcionamiento, configuración y resolución de incidencias del módulo de **Facturación Electrónica Oficial de AFIP / ARCA** en **ControlCenterES**.

---

## 🎯 Tipos de Comprobantes Soportados

El sistema detecta automáticamente la condición fiscal configurada y la del comprador para emitir el comprobante correspondiente:

| Tipo Comprobante | Código AFIP | Emisor | Receptor | IVA |
| :--- | :---: | :--- | :--- | :--- |
| **Factura A** | `001` | Responsable Inscripto | CUIT (Responsable Inscripto / Monotributo) | Discrimina IVA 21% (`AlicIva`, `ImpNeto`, `ImpIVA`) |
| **Factura B** | `006` | Responsable Inscripto | Consumidor Final / DNI | IVA incluido sin discriminar |
| **Factura C** | `011` | Monotributista | Consumidor Final / CUIT / DNI | No discrimina IVA (`ImpNeto` = `ImpTotal`) |

---

## ⚡ Facturación Masiva (Emisión por Lotes)

En la pantalla de **Ventas**, podés seleccionar múltiples órdenes no facturadas y emitirlas en lote de forma secuencial.

### Características del Motor de Emisión por Lote:
1. **Correlatividad Estricta**: Consulta a AFIP el último número autorizado (`FECompUltimoAutorizado`) por cada punto de venta y comprobante, garantizando una numeración consecutiva oficial sin saltos ni duplicados.
2. **Desglose de Ítems Individuales**: Cada factura toma los artículos, precios, cantidades y costos de envío exactos de esa orden.
3. **Pacing Preventivo**: Aplica un intervalo de `0.3s` entre llamadas para no saturar los servicios web de WSFE ni la subida a Mercado Libre.
4. **Reintento Inteligente**: Si alguna venta llegara a fallar (por datos faltantes del comprador o microcortes de AFIP), la ventana de resultados ofrece el botón:
   > **`⚡ Reintentar fallidas (X)`**
   Permite reprocesar automáticamente las órdenes pendientes sin necesidad de buscarlas o seleccionarlas una por una.

---

## 🔐 Autenticación WSAA & Caché Multi-Nivel de Tickets de Acceso (TA)

### El Error `El CEE ya posee un TA valido para el acceso al WSN solicitado`
- **¿Qué es el TA?**: Es el Ticket de Acceso entregado por el Web Service de Autenticación de AFIP (**WSAA**), compuesto por un `Token` y un `Sign` criptográfico. Tiene una vigencia oficial de hasta **12 horas**.
- **Causa del error**: Si un sistema solicita un nuevo ticket en cada comprobante dentro de una ráfaga de pocos segundos, AFIP bloquea las peticiones por seguridad (`ns1:coe.alreadyAuthenticated`).

### Arquitectura de Solución Implementada:
ControlCenterES implementa un **Caché Persistente en 3 Niveles**:
1. **Memoria RAM (`_WSAA_MEMORY_CACHE`)**: Acceso instantáneo en **0 ms** durante ciclos continuos de facturación masiva.
2. **Archivo JSON en Disco (`data/afip/ta_cache_{cuit}_{service}_{env}.json`)**: Persiste el ticket ante reinicios del backend o de los workers de Uvicorn.
3. **Base de Datos PostgreSQL (`settings`)**: Respaldo distribuido y auto-recuperación automática si el archivo físico es eliminado.

### Auto-Healing (Auto-Reparación):
- Si AFIP responde que ya existe un TA activo, el sistema localiza el ticket vigente en caché y lo reutiliza de inmediato.
- Si WSFE alguna vez rechaza un token (código 1000 o sesión revocada), `create_invoice()` invalida automáticamente la caché y solicita un nuevo TA con `force_refresh=True` de manera transparente para el usuario.

---

## 📎 Adjunto Automático en Mercado Libre

Si la venta proviene de **Mercado Libre**:
1. El backend genera el PDF oficial con diseño profesional e información fiscal (CAE, Código de Barras, Vencimiento CAE).
2. Se comunica con la API de Mercado Libre (`/orders/{order_id}/invoices`) y sube el PDF directamente.
3. El comprador recibe la notificación oficial de Mercado Libre indicándole que su factura ya se encuentra disponible para descarga.
