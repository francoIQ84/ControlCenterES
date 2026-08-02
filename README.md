<p align="center">
  <img src="logos/controlcenter.png" alt="ControlCenter — Plataforma integrada de gestión" width="620">
</p>

# 🚀 ControlCenterES — E-Commerce ERP, CRM & AI Marketing Platform

**ControlCenterES** es un ecosistema omnicanal completo de gestión comercial (**ERP / CRM / TPV / Marketing IA**) diseñado para empresas, comerciantes y vendedores de **Mercado Libre** y **Tienda Web propia**. 

La plataforma centraliza en un único panel inteligente el inventario, las ventas omnicanal, la facturación electrónica oficial, la atención al cliente automatizada por WhatsApp con IA y la creación y publicación autónoma de campañas de marketing en redes sociales.

---

## 🌟 Visión Comercial: ¿En qué consiste y qué valor aporta?

En el comercio moderno, gestionar Mercado Libre, una tienda online propia, facturar en la AFIP/ARCA, responder WhatsApps 24/7 y crear contenido para redes sociales exige múltiples herramientas desconectadas y costosas suscripciones mensuales.

**ControlCenterES** unifica todo el ciclo de vida del negocio en una sola infraestructura auto-hospedada sin comisiones por venta:

1. **Sincronización Total con Mercado Libre & Tienda Web**: Control centralizado de stock, precios y márgenes de ganancia reales.
2. **Facturación Electrónica Automática ARCA / AFIP**: Emisión instantánea de Facturas A, B y C con validación en AFIP por CUIT.
3. **Atención al Cliente 24/7 con IA por WhatsApp**: Chatbot con **Google Gemini AI** que conoce tu catálogo, stock y pedidos, con pausa automática cuando interviene un vendedor humano.
4. **Generador y Programador de Marketing & Reels (IA)**: Redacción automática de publicaciones y guiones de Reels + auto-publicación autónoma a Instagram y Facebook via Meta Graph API.
5. **Tienda Online Pública (Storefront Next.js)**: Catálogo ultrarrápido optimizado para SEO y conversión.
6. **Custodia de Marcas (INPI)**: Alertas automáticas para proteger tu marca registrada frente a oposiciones.

---

## 💎 Catálogo de Funcionalidades (Features)

### 1. 📦 Gestión Avanzada de Inventario & Márgenes
- **Sincronización Bidireccional con Mercado Libre**: Sincronización en segundo plano de stock, precios y estado de publicaciones.
- **Creación de Productos Exclusivos Web (Locales)**: Alta de artículos con prefijo `LOCAL-` para vender únicamente en la tienda propia sin comisiones.
- **Cálculo de Márgenes Reales**: Carga de costo base, comisión de Mercado Libre y envío gratis para visualizar el margen neto (%) y ganancia exacta por unidad.
- **Destacados en Portada Web (`featured_order`)**: Selección interactiva y reordenamiento de productos prioritarios en la página principal.
- **Vistas Adaptativas de Inventario**: 
  - **Vista Comprimida (Por Defecto)**: Ultra legible, aprovecha el 100% del ancho de pantalla para nombres largos de productos, con insignias de categoría y marcas de modificación.
  - **Vista Detallada**: Despliegue de fotos secundarias, descripción web y vinculaciones.
- **Historial de Modificaciones**: Registro de la última fecha/hora de actualización y visor de valores anteriores (`ant: $...`).

---

### 2. 🛍️ Tienda Web Pública (Storefront Next.js 16)
- **Diseño Ultra Moderno & Responsivo**: Optimizado para dispositivos móviles y escritorio.
- **Ficha de Producto de Alta Conversión**:
  - Zona Superior (*Hero*): Galería de imágenes, precio, insignia de stock en vivo, selector de cantidad y botón prominente **`Agregar al Carrito`**.
  - Zona Inferior: Bloque de **Descripción del Producto** a pantalla completa con botón expandible interactivo **`Ver descripción completa ▼`** / **`Ver menos ▲`**.
- **Carrito & Pedidos por WhatsApp**: Envío directo de carritos de compra armados a la línea de WhatsApp del negocio.
- **Optimizada para SEO**: Títulos semánticos, meta-etiquetas y tiempos de carga instantáneos (Turbopack).

---

### 3. 🛒 Ventas, TPV (Punto de Venta) & Cobro con QR Mercado Pago
- **Sincronización de Órdenes Mercado Libre**: Carga automática de compradores, montos, comisión e impuestos.
- **Punto de Venta Mostrador (Venta Local)**: Registro rápido de ventas presenciales con buscador dinámico de artículos.
- **Escáner de Código de Barras & QR**: Compatible con lectores USB/Bluetooth y cámara de smartphone para autocompletar productos.
- **Terminal de Cobro Dinámico Mercado Pago**:
  - Generación en pantalla de **Código QR de cobro de 300x300 px** para escanear en el acto desde la App de Mercado Pago.
  - Enlaces de pago directos y botón de compartir cobro por WhatsApp.

---

### 4. 🧾 Facturación Electrónica Oficial ARCA (ex AFIP)
- **Soporte Multicondición Fiscal**:
  - **Monotributo**: Emisión de **Factura C (`COD. 011`)**.
  - **Responsable Inscripto**: Emisión de **Factura B (`COD. 006`)** a Consumidores Finales y **Factura A (`COD. 001`)** a CUITs.
- **Consulta al Padrón AFIP en Tiempo Real (`PersonaServiceA5`)**: Al ingresar un CUIT, autocompleta la Razón Social, Domicilio Fiscal y la **Condición frente al IVA del Comprador**.
- **Selector de Condición IVA del Comprador**: Permite visualizar y seleccionar la condición frente al IVA (`IVA Exento`, `Responsable Inscripto`, `Responsable Monotributo`, `Consumidor Final`) para imprimirla en la factura.
- **Inclusión Automática del Servicio de Envío Mercado Libre**: Obtención automática del costo de envío abonado por el comprador en ML e inclusión como ítem de servicio adicional (`Servicio de Envío Mercado Libre`) en la factura.
- **Vista Previa de Corroboración Previa**: Desglose de ítems, precios, costo de envío y total final en la ventana modal antes de confirmar la emisión.
- **Desglose de IVA 21%**: Generación correcta de campos `<AlicIva>`, `ImpNeto` e `ImpIVA` requeridos por la AFIP en Facturas A.
- **Factura B Automática (Consumidor Final)**: Fallback inteligente si el comprador no presenta CUIT.
- **Generación de PDF Oficial**: Descarga e impresión de comprobantes fiscales normativos.

---

### 5. 🔑 Configuración de la Clave de API de Google Gemini (Google AI Studio / Google Cloud)

Para habilitar la **generación de contenido con IA**, el **Generador de Videos & Reels**, la **atención al cliente por WhatsApp** y las **respuestas automáticas en redes**, se requiere configurar una API Key de Gemini:

#### A. ¿Cómo obtener tu API Key de Gemini (Gratis)?
1. Ingresá a [Google AI Studio (aistudio.google.com)](https://aistudio.google.com/).
2. Inicia sesión con tu cuenta de Google o Google Cloud.
3. Hacé clic en **Get API key** -> **Create API key in new project**.
4. Copiá la clave alfanumérica generada (empieza con `AIzaSy...`).

*(Opcional para Google Veo)*: Si tu cuenta de Google Cloud / AI Studio tiene habilitado acceso a modelos de video como **Google Veo (`veo-2.0-generate-video`)** o **Imagen Video (`imagen-3.0-generate-002`)**, la misma clave te permitirá generar animaciones fotorrealistas de IA.

#### B. ¿Dónde cargar la API Key en ControlCenterES?
1. En el panel administrativo, ir a **Ajustes de WhatsApp / Chatbot** o a la pestaña **Marketing & Redes Sociales**.
2. En el campo **Gemini API Key**, pegá tu clave `AIzaSy...`.
3. Guardá los cambios. El sistema la validará y la utilizará automáticamente para Gemini 3.6 Flash, Veo y el Chatbot.

---

### 6. 🎬 Generador de Videos & Reels por IA (10 a 30 segundos HD)
#### A. ¿Cómo operar el Generador de Videos?
1. Ir a **Marketing & Redes Sociales** -> pestaña **Creador IA & Reels**.
2. **Seleccionar un producto** del inventario (se cargarán automáticamente sus fotos HD y su precio).
3. **Escribir un Prompt / Instrucción breve para el video** (ej: *"Resaltar oferta de primavera, 15% OFF en efectivo y envío gratis a Rosario"*).
4. **Elegir el Generador de Video IA**:
   - 🌟 **Google Veo 3.1 Fast (SDK google-genai / Google AI Studio)**: Utiliza el modelo oficial **`veo-3.1-fast-generate-preview`** para generar Reels cinematográficos HD de 8 segundos en formato vertical 9:16 (1080x1920).
   - 🎬 **Gemini IA + Comercial HD (Gratis & 0 Costo de Servidor)**: Gemini 3.6 Flash redacta el guión comercial y el motor visual ensambla las fotos HD del producto, marca "Hidroponía Rosario", precio animado, badges de oferta y transiciones fluidas a 60 FPS en formato compatible **MP4 (H.264)**.
   - 🎨 **Pollinations AI Generativo (Gratis)**: Clips animados de código abierto sin límite de cuota.
5. Presionar **`🎬 Generar y Previsualizar Reel con IA`**.

---

#### B. 🎥 Configuración de Google Veo 3.1 & Facturación Pay-As-You-Go

Para utilizar la generación de videos fotorrealistas con **Google Veo 3.1** desde la API Key de Gemini:

1. **Requisito de Facturación en Google AI Studio**:
   - En [Google AI Studio (aistudio.google.com)](https://aistudio.google.com/), los modelos de texto e imagen (Gemini 2.5/3.6 Flash) tienen un nivel gratuito (Free Tier).
   - Los modelos de generación de video de alto consumo (**Google Veo 3.1**) requieren habilitar la facturación **Pay-As-You-Go (Pago por uso)** en tu proyecto.
2. **$300 USD de Crédito Gratuito de Regalo**:
   - Al hacer clic en **`Set up billing`** en Google AI Studio y vincular tu cuenta, Google otorga **$300 USD en créditos gratuitos** (Prueba de 90 días en Google Cloud).
   - Este crédito inicial cubre entre **1.500 y 2.000 videos Reels con Veo 3.1** sin pagar nada de tu bolsillo.
3. **Costo Estimado por Video (luego de consumir los $300 de regalo)**:
   - Un video Reel de 8 segundos generado con `veo-3.1-fast-generate-preview` cuesta aprox **$0.10 a $0.15 USD** (15 centavos de dólar).
4. **Modelos Veo 3.1 Oficiales Configurados**:
   - `veo-3.1-fast-generate-preview` (Rápido, ideal para Reels).
   - `veo-3.1-generate-preview` (Alta calidad cinematográfica).
   - `veo-3.1-lite-generate-preview` (Ultra liviano).

---

#### C. 🚀 Publicación en Instagram Reels & Corrección de Errores de Meta (Código 2207085):
- **Codificación MP4 / H.264 + AAC Automática**: Meta Graph API exige que los Reels estén comprimidos en códec **H.264 (video) + AAC (audio)** dentro de un contenedor `.mp4`. El backend convierte automáticamente cualquier video subido en formato WebM o códec no estándar mediante `ffmpeg` antes de enviar la orden a Meta.
- **Convertidor de URLs a HTTPS Públicas**: Meta rechaza URLs relativas (`/uploads/...`) o puertos locales SSH. El backend transforma automáticamente las rutas internas a URLs absolutas seguras bajo el dominio `https://admin.hidroponiarosario.com.ar/uploads/...`.
- **Privacidad del Usuario**: La URL de tu servidor VPS es utilizada **exclusivamente por la API en segundo plano** para que los servidores de Meta descarguen el video. **Los usuarios finales en Instagram o Facebook jamás ven este link**, ya que consumen el Reel publicado nativamente en la red social.
- **Reproductor en Pantalla & Miniaturas HTML5**:
  - En las tablas de publicaciones y comentarios, los videos Reels muestran una miniatura con fotograma real precargado (`preload="metadata"`) e insignia `🎬`.
  - El botón de envío muestra retroalimentación en vivo (**`⏳ Publicando... Esperá`**) previniendo dobles clics.

---

### 7. 🖼️ Gestión de Imágenes HD de Mercado Libre y Subida desde la PC

- **Alta Calidad HD de Mercado Libre (`-O.jpg`)**: El sistema convierte automáticamente las miniaturas de Mercado Libre (`-I.jpg` de baja resolución) a la versión original de máxima calidad (`-O.jpg`, 1200x1200px+) y fuerza protocolo seguro `https://`.
- **Galería de Selección del Producto**: Al elegir un producto en Marketing, podés hacer clic en cualquiera de sus fotos HD para usarla en el post.
- **Subida de Archivos de Video & Fotos desde la PC (`📁 Subir de la PC`)**: Podés hacer clic en el botón de carga y seleccionar cualquier foto (`.png`, `.jpg`, `.webp`) o **video (`.mp4`, `.webm`, `.mov`, `.avi`, `.mkv`)** desde tu computadora para adjuntarlo directamente a la publicación.

---

### 8. 📢 Módulo de Marketing, Redes Sociales & Inbox Unificado
- **Redacción de Contenido con IA (Gemini)**: Selección de objetivo y tono para redactar títulos, copys y hashtags.
- **Auto-Publicación Autónoma a Instagram & Facebook**: Integración nativa con Meta Graph API. Si se intenta publicar una imagen en formato Reel, el sistema la adapta automáticamente como Post de Foto en Instagram sin dar error.
- **💬 Inbox Unificado de Comentarios (Social Inbox)**: Centralización de comentarios de Instagram y Facebook con sugerencias inteligentes por Gemini IA.
- **Programador & Daemon en Segundo Plano (`scheduler.py`)**: Evaluación de la cola cada 30 segundos.

---

#### 📘 Guía Completa Paso a Paso desde Cero: Configuración e Integración con Meta API (Instagram & Facebook)

Esta guía detalla el proceso completo paso a paso para configurar tu entorno desde cero hasta dejar operativas las publicaciones autónomas y la lectura/respuesta de comentarios.

**Datos del negocio de ejemplo:**
- **Página de Facebook**: *Hidroponía Rosario*
- **Cuenta Profesional de Instagram**: `@hidroponia_rosario`

---

##### 1️⃣ PASO 1: Vincular Instagram Profesional con la Fan Page en Meta Business Suite
1. Ir a [business.facebook.com](https://business.facebook.com) e iniciar sesión con la cuenta de Facebook administradora de la página *Hidroponía Rosario*.
2. Asegurarse de que la cuenta `@hidroponia_rosario` sea de tipo **Profesional / Empresa / Creador** (si es cuenta personal, en la app móvil de Instagram ir a `Configuración > Tipo de cuenta > Cambiar a cuenta profesional`).
3. En **Meta Business Suite**:
   - Ir a **Configuración del Negocio** -> **Cuentas de Instagram** -> **Agregar**.
   - Iniciar sesión con `@hidroponia_rosario` y confirmar la vinculación a la página *Hidroponía Rosario*.

---

##### 2️⃣ PASO 2: Crear la Aplicación en Meta for Developers
1. Ingresar al portal [developers.facebook.com](https://developers.facebook.com) e iniciar sesión.
2. Hacer clic en **Mis Apps** (arriba a la derecha) -> **Crear App**.
3. Seleccionar el tipo de aplicación:
   - Elegir **Otros** -> Siguiente -> Seleccionar **Negocio (Business)**.
4. Asignar un nombre a la app (ej: `ControlCenter ES Integration`) y asociarla al Portafolio Comercial del negocio (*Hidroponía Rosario*).
5. Hacer clic en **Crear App**.

---

##### 3️⃣ PASO 3: Otorgar Permisos y Generar el Access Token en Graph API Explorer
1. Ir a la herramienta [Meta Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. En la esquina superior derecha:
   - **Meta App**: Seleccionar la app recién creada (`ControlCenter ES Integration`).
   - **User or Page**: Seleccionar **User Token**.
3. En el panel lateral derecho **Permisos (Permissions)**, agregar los **7 permisos indispensables**:
   - 📘 **Para Facebook**: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_engagement`.
   - 📸 **Para Instagram**: `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`.
4. Hacer clic en el botón azul **Generate Access Token**. Se abrirá una ventana emergente de Facebook para autorizar a la página *Hidroponía Rosario* e Instagram `@hidroponia_rosario`.
5. Una vez autorizado, en el desplegable **User or Page**, seleccionar directamente la **Página de Facebook (Hidroponía Rosario)** para obtener el Token de administración directo de la página.

---

##### 4️⃣ PASO 4: Obtener los Identificadores Únicos (`FACEBOOK_PAGE_ID` e `INSTAGRAM_ACCOUNT_ID`)

###### A. Obtener el `FACEBOOK_PAGE_ID`:
En la consulta del Explorer, escribir:
```http
GET /me/accounts
```
Hacer clic en **Submit**. En la respuesta JSON, buscar la página *Hidroponía Rosario* y copiar el valor numérico de `"id"` (ej: `102938475612345`). Este es tu **Facebook Page ID**.

###### B. Obtener el `INSTAGRAM_ACCOUNT_ID`:
En la barra del Explorer, realizar la consulta enviando el ID de tu página de Facebook recién obtenido:
```http
GET /102938475612345?fields=instagram_business_account
```
Hacer clic en **Submit**. La API responderá con:
```json
{
  "instagram_business_account": {
    "id": "17841400012345678"
  },
  "id": "102938475612345"
}
```
Copiar el valor numérico dentro de `instagram_business_account.id` (ej: `17841400012345678`). Este es tu **Instagram Business Account ID**.

---

##### 5️⃣ PASO 5: Generar un Token de Larga Duración (Long-Lived Page Access Token - 60 Días / Perpetuo)
Los tokens generados en el Explorer vencen en 2 horas. Para usarlos en producción:
1. Ir al panel de la App en Developers -> **Configuración de la App > Básica**.
2. Copiar el **App ID** y la **Clave Secreta de la App (App Secret)**.
3. En la barra de direcciones del navegador o postman, realizar la consulta reemplazando los valores:
   ```http
   GET https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id={APP_ID}&client_secret={APP_SECRET}&fb_exchange_token={USER_ACCESS_TOKEN_DEL_EXPLORER}
   ```
4. La respuesta entregará un `access_token` de larga duración válido por **60 días**.
5. *(Recomendado para Token Perpetuo)*: Crear un **System User** (Usuario de Sistema) en Meta Business Settings -> Usuarios de Sistema -> Generar Token permanente.

---

##### 6️⃣ PASO 6: Cargar las Credenciales en el Panel de ControlCenterES
1. Ingresar al panel de **ControlCenterES** -> **Marketing & Redes Sociales**.
2. Ir a la pestaña **`⚙️ Configuración de Redes`**.
3. Completar los 3 campos:
   - **Meta Access Token**: Pegar el Token de Larga Duración (empieza con `EAA...`).
   - **Instagram Business Account ID**: Pegar el ID numérico de Instagram (`17841400012345678`).
   - **Facebook Page ID**: Pegar el ID numérico de Facebook (`102938475612345`).
4. Presionar **`💾 Guardar Credenciales de Meta`**.

---

##### 7️⃣ PASO 7: Mecánica de Funcionamiento y Verificación

- **Publicación en Facebook**:
  - Llamada directa (1 paso): `POST /{PAGE_ID}/feed`, `/{PAGE_ID}/photos` o `/{PAGE_ID}/videos`.
- **Publicación en Instagram (Fotos & Reels)**:
  - Proceso de 2 pasos con Polling de estado:
    1. **Crear Contenedor**: `POST /{INSTAGRAM_ACCOUNT_ID}/media` (recibe `CREATION_ID`).
    2. **Polling de Estado**: `GET /{CREATION_ID}?fields=status_code,status` hasta recibir `"FINISHED"`.
    3. **Publicar**: `POST /{INSTAGRAM_ACCOUNT_ID}/media_publish`.
- **Inbox de Comentarios & Asistente IA**:
  - `GET /comments`: Consulta publicaciones y comentarios recibidos en Instagram y Facebook.
  - `POST /comments/reply`: Responde directamente al comentario en Meta API (`/{comment_id}/replies`).
  - `POST /comments/ai-suggest`: Genera respuestas personalizadas con Gemini IA.

---

### 7. 🧲 Captación de Leads, Email Marketing & Pop-up Magnet
- **Pop-up Captador Dinámico (`LeadMagnetPopup.tsx`)**: Formulario con Glassmorphism para captar Nombre, Email y País.
- **Envío Automático de PDFs por SMTP (Gmail)**: Entrega en segundo plano de catálogos o guías gratuitas al suscribirse.
- **Exportación a CSV / Excel**: Descarga de listas de contactos en un clic para importar en Mailchimp, Meta Ads o envíos masivos.

---

### 8. 🛡️ Monitoreo de Marcas & Propiedad Industrial (INPI)
- Custodia diaria automática de marcas registradas contra el Boletín Oficial del INPI (Argentina) para detectar solicitudes conflictivas de terceros y prevenir oposiciones.

---

### 9. 💾 Respaldos Automáticos Mensuales & Retención Anual
- Generación mensual automática de un archivo `.zip` que incluye el dump completo de la base de datos PostgreSQL (`pg_dump`), el directorio de imágenes `uploads/` y las facturas emitidas `invoices/`.
- Regla de retención de los 12 respaldos mensuales más recientes.
- **Reservado a la administración de la plataforma.** El volcado abarca la base completa —es decir, los datos de *todos* los inquilinos—, por lo que el módulo exige `require_platform_admin` y no el permiso `settings`: de lo contrario el administrador de cualquier cliente podría descargarse la información de los demás.
- El archivo `.env` **no** se incluye en el `.zip`. Contiene la cadena de conexión a la base y la clave maestra de cifrado; empaquetarlo junto al volcado anularía el cifrado en reposo, porque el dato cifrado y su llave viajarían en el mismo archivo.

---

### 10. 🔐 Seguridad Criptográfica & Registro de Accesos
- Encriptación de contraseñas con el estándar **PBKDF2-HMAC-SHA256** (100.000 iteraciones + sal aleatoria).
- Cifrado de credenciales de integraciones con **AES-256-GCM**. Se usa GCM y no CBC porque además de confidencialidad aporta autenticación: un ciphertext alterado en la base falla al descifrar en lugar de devolver datos corruptos en silencio. El `tenant_id` viaja como *Additional Authenticated Data*, de modo que un blob copiado de la fila de un inquilino a la de otro no descifra.
- Aislamiento de datos entre inquilinos con **Row Level Security** de PostgreSQL (ver sección 11).
- Registro de auditoría de inicio de sesión con geolocalización IP (País, Región y Ciudad).

---

### 11. 🏢 Arquitectura Multi-Tenant (SaaS B2B)

La plataforma opera sobre un modelo **Shared Database / Shared Schema**: todos los inquilinos comparten la misma base de datos y el aislamiento lo garantiza el motor, no la aplicación.

#### A. Por qué el aislamiento vive en la base y no en el código
El backend no usa ORM: son alrededor de **242 sentencias SQL escritas a mano**. Filtrarlas una por una habría equivalido a reescribir el sistema, y cualquier olvido sería una fuga de datos entre clientes. En su lugar:

1. El middleware `TenantResolver` deduce el inquilino del subdominio y lo publica en un `ContextVar` (el equivalente de `AsyncLocalStorage` en Python).
2. `database.get_connection()` emite `SET app.current_tenant` al abrir cada conexión.
3. Las políticas **RLS** de PostgreSQL filtran todas las consultas contra esa variable de sesión.

El SQL existente quedó intacto y no hay forma de "olvidarse" el filtro, porque no lo aplica el código sino el motor.

#### B. Resolución de inquilinos
- **Subdominios dinámicos**: `{slug}.controlcenter.app`. El dominio base se configura con `TENANT_BASE_DOMAINS`.
- **Tenant Maestro**: cuando el host no identifica a ningún inquilino (dominio apex, IP, `localhost`, subdominio reservado), la petición resuelve al Tenant Maestro. Esto es lo que permitió migrar sin interrumpir la operación original.
- **Webhooks entrantes**: un aviso de venta de Mercado Libre llega con un `ml_user_id` y sin subdominio. La función `app_resolve_tenant_by_account()` —`SECURITY DEFINER`, deliberadamente angosta: recibe proveedor e identificador de cuenta y devuelve un UUID— es lo único autorizado a mirar filas de todos los inquilinos.
- **Suscripciones**: un inquilino en estado `suspended` o `cancelled` recibe 403 antes de que la petición llegue a la aplicación.

#### C. Esquema núcleo
- `tenants`: id, slug, name, cuit, status, plan_id. Es el registro de ruteo y **la única tabla sin RLS**, porque hay que consultarla antes de saber quién es el inquilino; se protege por permisos (`GRANT`), no por políticas.
- `tenant_settings`: logo, color corporativo, moneda, zona horaria y `active_modules` (JSONB).
- `tenant_integrations`: credenciales cifradas con AES-256 por proveedor (`mercadolibre`, `mercadopago`, `afip`, `meta`, `google`, `whatsapp`), más el identificador público de la cuenta para resolver webhooks.

#### D. Rol de aplicación de mínimo privilegio
PostgreSQL **ignora RLS por completo para superusuarios**, así que conectar como `postgres` volvería las políticas puramente decorativas. La aplicación usa el rol `controlcenter_app`, creado `NOSUPERUSER` y `NOBYPASSRLS`, sin privilegios de DDL: si fuera dueño de las tablas podría saltarse sus propias políticas.

Todas las tablas llevan además `FORCE ROW LEVEL SECURITY`, indispensable porque sin él el dueño de una tabla evade sus propias políticas.

#### E. Modularidad por plan
`tenant_settings.active_modules` define qué contrató cada negocio. El panel aplica **dos filtros independientes**: el permiso RBAC dice qué puede hacer *esa persona*, y el módulo dice qué contrató *el negocio*. Un cajero sin permiso de finanzas no ve Finanzas aunque el plan la incluya; y nadie ve Facturación si el plan no la tiene, por más administrador que sea.

#### F. Estado de la transición
El sistema opera en modo **fail-open**: si algún proceso no propaga contexto de inquilino, cae al Tenant Maestro y se comporta igual que antes de la migración. Una vez que todo lo que corre fuera del ciclo HTTP propague contexto —el scheduler ya lo hace, iterando inquilinos activos con `tenant_context()`—, se cierra con una sola sentencia y sin tocar código:

```sql
ALTER DATABASE controlcenter RESET app.default_tenant;
```

A partir de ahí, una consulta sin inquilino explícito no lee ni escribe nada, en lugar de caer al maestro.

---

## 🛠️ Arquitectura Técnica (Monorepo)

```
ControlCenterES/
├── backend/             # REST API con FastAPI (Python 3.12) + PostgreSQL + Scheduler
│   ├── src/
│   │   ├── api/         # Endpoints: inventory, sales, marketing, whatsapp, afip, etc.
│   │   │   ├── tenants.py       # API de plataforma: alta y gestión de inquilinos
│   │   │   └── integrations.py  # Credenciales externas cifradas por inquilino
│   │   ├── utils/       # social_publisher, invoice_gen, afip_ws, email_sender
│   │   │   └── crypto.py        # Cifrado AES-256-GCM de credenciales
│   │   ├── database.py  # Conexión PostgreSQL (psycopg2) y esquema de tablas
│   │   ├── tenancy.py   # Contexto de inquilino, resolución de subdominios, planes
│   │   ├── middleware.py# TenantResolver (ASGI puro)
│   │   ├── integrations.py # Almacenamiento y lectura de credenciales por inquilino
│   │   └── scheduler.py # Tareas en segundo plano, una pasada por inquilino activo
│   ├── migrations/      # Migraciones SQL idempotentes + runner + README operativo
│   ├── tests/           # Integración (requieren PostgreSQL)
│   │   └── unit/        # Unitarios con unittest, sin base de datos
│   └── whatsapp/        # Pasarela Baileys Node.js para WhatsApp Gateway
├── frontend/            # Panel de Administración (React + Vite + Vanilla CSS)
│   └── src/
│       ├── TenantContext.jsx # Inquilino activo, módulos contratados, marca visual
│       ├── pages/       # Dashboard, Inventory, Sales, Marketing, Tenants, etc.
│       └── components/  # Layout, MediaBrowser, QR Modals, etc.
├── storefront/          # Tienda Web Pública (Next.js 16 + Tailwind CSS)
│   └── src/
│       ├── app/         # Catálogo, Detalle de Producto, Blog, Quiénes Somos
│       └── components/  # AddToCartButton, ProductDescription, LeadMagnetPopup
└── deploy_all.py        # Script de despliegue automatizado por SSH/SFTP al VPS
```

### Middleware ASGI puro, no `BaseHTTPMiddleware`

`TenantResolver` está escrito como middleware ASGI de bajo nivel a propósito. `BaseHTTPMiddleware` ejecuta la aplicación descendente en otra tarea de anyio, y los `ContextVar` fijados en `dispatch()` no siempre llegan hasta el endpoint. Un middleware ASGI puro corre en la misma tarea, así que el contexto de inquilino llega intacto a `database.get_connection()` — que es de lo que depende todo el aislamiento.

---

## 🚀 Guía de Instalación y Ejecución Local

### Requisitos Previos
- Python 3.10+
- Node.js 20+
- PostgreSQL corriendo localmente

### 1. Clonar el repositorio y configurar variables de entorno
Crear un archivo `.env` dentro de `backend/`:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/controlcenter

# Dominios bajo los cuales {slug}.dominio identifica a un inquilino.
# Admite varios separados por coma. Por defecto: controlcenter.app
TENANT_BASE_DOMAINS=controlcenter.app

# Solo para desarrollo local: permite elegir el inquilino con el header
# X-Tenant-Slug, porque no hay DNS de subdominios. NUNCA habilitar en un
# despliegue expuesto a internet: cualquiera podría elegir qué inquilino leer.
TENANT_TRUST_HEADER=1
```

Las credenciales de integraciones se cifran con una clave maestra que **no debe versionarse**. Generarla con:

```powershell
cd backend
python -m src.utils.crypto --generate-key
```

y exportar el resultado como variable de entorno del servicio:

```env
CREDENTIALS_ENCRYPTION_KEY=<clave generada>
```

Sin ella, la API de integraciones responde `503` en lugar de guardar secretos en claro. **Si se pierde, las credenciales cifradas de todos los inquilinos son irrecuperables** y hay que volver a cargarlas a mano.

### 1.b Aplicar las migraciones

El esquema multi-tenant se aplica con un runner idempotente y reversible:

```powershell
cd backend
python -m migrations.run_migration --dry-run   # aplica todo y revierte: no deja rastro
python -m migrations.run_migration --apply     # aplica y confirma
python -m migrations.run_migration --verify    # audita el aislamiento
```

El procedimiento completo para producción —incluido el orden que importa, la activación del rol de mínimo privilegio y la marcha atrás— está en [`backend/migrations/README.md`](backend/migrations/README.md).

### 2. Levantar el Backend (FastAPI)
```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```
*(Se ejecutará en `http://localhost:8090`)*

### 3. Levantar el Panel de Administración (Frontend)
```powershell
cd frontend
npm install
npm run dev
```
*(Se ejecutará en `http://localhost:5173`)*

### 4. Levantar la Tienda Web (Storefront Next.js)
```powershell
cd storefront
npm install
npm run dev
```
*(Se ejecutará en `http://localhost:3000`)*

---

## 🌐 Despliegue en Servidor VPS (Producción)

El proyecto incluye el script de automatización **`python deploy_all.py`**, el cual compila los activos estáticos del frontend, los sube mediante SFTP/SSH al servidor VPS, compila el Storefront Next.js en el VPS y reinicia los servicios de `systemd`:

- `controlcenter-backend.service` (Puerto 8090)
- `controlcenter-storefront.service` (Puerto 3000)
- `controlcenter-whatsapp.service` (Puerto 8091)
- Nginx como Reverse Proxy (HTTPS / Certbot)

### Migraciones: se suben, no se ejecutan

`deploy_all.py` copia el directorio `migrations/` al servidor pero **nunca corre una migración solo**. Aplicar cambios de esquema sobre una base con operación activa es una decisión deliberada, no un efecto secundario de desplegar.

Un detalle de secuencia que importa: esquema y código **no son intercambiables en ninguna de las dos direcciones**. El código anterior falla contra el esquema migrado (`ON CONFLICT (ml_id)` deja de encontrar un índice único al volverse compuesto) y el código nuevo falla contra el esquema anterior (la columna `tenant_id` todavía no existe). Por eso una migración de este tipo exige una ventana corta: desplegar, migrar de inmediato y reiniciar.

### Subdominios en producción

Para que `{slug}.controlcenter.app` resuelva hacen falta dos cosas además del despliegue:

1. Un registro **DNS wildcard** `*.controlcenter.app` apuntando al VPS.
2. Nginx configurado para servir ese subdominio (y el certificado wildcard correspondiente).

Mientras no existan, el sistema sigue funcionando con normalidad a través del dominio actual: el host no identifica a ningún inquilino y la petición resuelve al Tenant Maestro.

---

## 🧪 Pruebas

```powershell
cd backend

# Unitarios: sin base de datos, ~100 tests en menos de un segundo
python -m unittest discover -s tests/unit -t .

# Integración: exigen PostgreSQL y el rol de aplicación
$env:APP_DB_PASSWORD="..."
python -m migrations.test_isolation      # demuestra la fuga, no que las políticas existan
python -m tests.test_multitenancy        # alta, aislamiento, cifrado, webhooks, planes
```

Los tests unitarios usan `unittest` de la biblioteca estándar para no sumar dependencias. Las pruebas de integración crean un inquilino descartable y lo eliminan al terminar.

`test_isolation` es deliberadamente empírica: comprueba que un inquilino **no puede leer ni escribir** los datos de otro, en vez de limitarse a verificar que las políticas RLS estén declaradas. También detecta el caso en que la aplicación conecta con un rol que evade RLS, situación en la que el aislamiento sería sólo aparente.

---
© 2026 ControlCenterES. Todos los derechos reservados.
