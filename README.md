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
- **Consulta al Padrón AFIP en Tiempo Real (`PersonaServiceA5`)**: Al ingresar un CUIT, autocompleta la Razón Social y Domicilio Fiscal oficial.
- **Desglose de IVA 21%**: Generación correcta de campos `<AlicIva>`, `ImpNeto` e `ImpIVA` requeridos por la AFIP en Facturas A.
- **Factura B Automática (Consumidor Final)**: Fallback inteligente si el comprador no presenta CUIT.
- **Generación de PDF Oficial**: Descarga e impresión de comprobantes fiscales normativos.

---

### 5. 🤖 Asistente Virtual de WhatsApp con IA (Gemini)
- **Atención Automática 24/7**: Conexión nativa mediante pasarela Baileys Node.js (auto-hospedada, sin costos por mensaje de APIs oficiales).
- **Conocimiento del Negocio**: La IA consulta en tiempo real el inventario PostgreSQL para informar stock, precios y responder preguntas frecuentes.
- **Consulta de Pedidos**: Los clientes pueden preguntar por el estado de su pedido con su número de orden.
- **Sistema de Pausa Inteligente & Atención Humana (*Human Takeover*)**:
  - Si un vendedor responde manualmente desde el celular, el bot se pausa automáticamente para ese cliente por 24 horas.
  - Si el cliente pide hablar con una persona, Gemini deriva la atención y pausa las respuestas automáticas.
  - Comandos rápidos de chat: `#pausa` para pausar la IA, `#bot` para reactivarla.
  - Panel de control en tiempo real para visualizar y reanudar chats en atención humana.

---

### 6. 📢 Módulo de Marketing & Redes Sociales (Generador IA & Auto-Publicación)
- **Redacción de Contenido con IA (Gemini)**:
  - Selección de producto del inventario -> elección de objetivo (*Promocional*, *Oferta*, *Educativo*) y tono (*Entusiasta*, *Profesional*, *Divertido*).
  - La IA redacta el título, copy con emojis y hashtags, e incluye una **idea de guión de 15 segundos para grabar el Reel**.
- **Auto-Publicación Autónoma a Instagram & Facebook**:
  - Integración nativa con la **Meta Graph API** para publicar fotos y **Reels de Instagram** y posts de **Páginas de Facebook**.
- **Programador & Daemon en Segundo Plano (`scheduler.py`)**:
  - Hilo de ejecución exclusivo para Marketing (`marketing_publisher_loop`) que evalúa la cola de publicaciones **cada 30 segundos**. Al cumplirse la fecha/hora agendada, el sistema envía automáticamente el post a las redes sin demoras ni intervención manual.
- **Edición de Borradores e Historial**:
  - Permite cargar cualquier publicación (borrador, programada o fallida) en el formulario para modificar título, producto, texto, medio, formato o fecha antes de reprogramar o publicar.

#### 🔑 Guía de Obtención de Credenciales de Meta (Instagram & Facebook):
1. **Facebook Page ID**:
   - Ingresar a [Meta Graph API Explorer](https://developers.facebook.com/tools/explorer/).
   - En la consulta `me/accounts` -> Copiar la propiedad `"id"` de tu página de Facebook.
2. **Instagram Business Account ID**:
   - Tu cuenta de Instagram debe ser de tipo Profesional/Empresa vinculada a tu página de Facebook.
   - En Graph API Explorer, consultar `{TU_FACEBOOK_PAGE_ID}?fields=instagram_business_account`.
   - Copiar la propiedad `"id"` que aparece dentro de `instagram_business_account`.
3. **Page Access Token (Token de la Página)**:
   - En Graph API Explorer, agregar los permisos `pages_read_engagement`, `pages_manage_posts`, `pages_show_list` y `public_profile`.
   - En el selector desplegable **User or Page**, seleccionar la **Página de Facebook** (ej. *Hidroponía Rosario*) para obtener el Token directo de administración. Esto resuelve el error Meta `(#200) Requires both pages_read_engagement and pages_manage_posts`.
4. **Revisión de Uso de Datos (TOS / Data Use Checkup)**:
   - En el [Panel de Apps de Meta Developers](https://developers.facebook.com/apps/), confirmar y aceptar los Términos de Servicio de la App para evitar el rechazo `(#100) Apps in the GK only need to pass TOS check`.
5. Cargar el **Meta Access Token**, **Instagram Account ID** y **Facebook Page ID** en el panel administrativo (**Marketing > Configuración de Redes**).

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
- Generación mensual automática de un archivo `.zip` que incluye el dump completo de la base de datos PostgreSQL (`pg_dump`), credenciales `.env`, directorio de imágenes `uploads/` y facturas emitidas `invoices/`.
- Regla de retención de los 12 respaldos mensuales más recientes.

---

### 10. 🔐 Seguridad Criptográfica & Registro de Accesos
- Encriptación de contraseñas con el estándar **PBKDF2-HMAC-SHA256** (100.000 iteraciones + sal aleatoria).
- Registro de auditoría de inicio de sesión con geolocalización IP (País, Región y Ciudad).

---

## 🛠️ Arquitectura Técnica (Monorepo)

```
ControlCenterES/
├── backend/             # REST API con FastAPI (Python 3.12) + PostgreSQL + Scheduler
│   ├── src/
│   │   ├── api/         # Endpoints: inventory, sales, marketing, whatsapp, afip, etc.
│   │   ├── utils/       # social_publisher, invoice_gen, afip_ws, email_sender
│   │   ├── database.py  # Conexión PostgreSQL (psycopg2) y esquema de tablas
│   │   └── scheduler.py # Tareas en segundo plano (Meli sync, Marketing, Auto-Backups)
│   └── whatsapp/        # Pasarela Baileys Node.js para WhatsApp Gateway
├── frontend/            # Panel de Administración (React + Vite + Vanilla CSS)
│   └── src/
│       ├── pages/       # Dashboard, Inventory, Sales, Marketing, Settings, etc.
│       └── components/  # Layout, MediaBrowser, QR Modals, etc.
├── storefront/          # Tienda Web Pública (Next.js 16 + Tailwind CSS)
│   └── src/
│       ├── app/         # Catálogo, Detalle de Producto, Blog, Quiénes Somos
│       └── components/  # AddToCartButton, ProductDescription, LeadMagnetPopup
└── deploy_all.py        # Script de despliegue automatizado por SSH/SFTP al VPS
```

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
```

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

---
© 2026 ControlCenterES. Todos los derechos reservados.
