# ControlCenterES

ControlCenterES es una plataforma avanzada para la gestión de publicaciones, ventas e inventario sincronizada directamente con la API de Mercado Libre.

La aplicación utiliza una arquitectura moderna separada en backend, frontend administrativo y un storefront público.

## Arquitectura (Monorepo)

- **Backend (`/backend`):** FastAPI (Python) + PostgreSQL (`psycopg2`)
- **Frontend Admin (`/frontend`):** React + Vite + Vanilla CSS
- **Storefront Público (`/storefront`):** Next.js + React + Tailwind CSS
- **Integraciones:** API oficial de Mercado Libre

## Requisitos Previos

- Python 3.10+
- Node.js y npm (para los proyectos React)
- Servidor PostgreSQL instalado y corriendo

## Instalación y Configuración

### 1. Base de Datos
Asegurate de tener una instancia de PostgreSQL en ejecución. Por defecto, la aplicación intentará conectarse a `postgresql://postgres:postgres@localhost:5432/controlcenter`. Podés sobreescribir esta URL creando una variable de entorno `DATABASE_URL` en el archivo `.env` dentro de `backend/`.

### 2. Backend (FastAPI)
Instalar las dependencias de Python y activar el entorno virtual (desde la carpeta raíz):
```powershell
# Activar entorno virtual existente
.\venv\Scripts\Activate.ps1

# Ingresar a backend e instalar requerimientos
cd backend
pip install -r requirements.txt
```

### 3. Frontends (Node.js)
Navegar a las carpetas respectivas e instalar dependencias:
```bash
# Para el panel de administración
cd frontend
npm install

# Para la tienda pública
cd ../storefront
npm install
```

## Ejecución del Proyecto (Desarrollo)

Para tener el proyecto funcionando completamente, es necesario levantar los tres servicios simultáneamente (necesitarás 3 ventanas de terminal abiertas).

### Terminal 1: Backend
Activa el entorno virtual, entra a la carpeta `backend` y ejecuta el servidor de Python:
```powershell
.\venv\Scripts\Activate.ps1
cd backend
python main.py
```
*(El backend API se levantará en `http://localhost:8090`)*

### Terminal 2: Frontend Administrativo
Entra a la carpeta `frontend` y ejecuta el entorno de Vite:
```powershell
cd frontend
npm run dev
```
*(El panel de control se levantará típicamente en `http://localhost:5173`)*

### Terminal 3: Storefront
Entra a la carpeta `storefront` y ejecuta el servidor de Next.js:
```powershell
cd storefront
npm run dev
```
*(La tienda pública se levantará típicamente en `http://localhost:3000`)*

## Funcionalidades
- Sincronización en segundo plano de publicaciones activas/pausadas y órdenes de ventas.
- Cálculo real de márgenes de ganancia mediante carga de costos locales.
- Gestión avanzada y métricas del cliente (historial de facturación).
- Tema de interfaz Daylight Premium personalizable y responsivo.
- Gestor de imágenes integrado por carpetas y selector de galería en inventario.
- Creación de productos exclusivos para la Tienda Web (locales) o para simular en Mercado Libre.

## Documentación de Nuevas Características

### 1. Gestor de Medios (Imágenes)
El proyecto cuenta con un gestor de imágenes unificado accesible desde la barra lateral ("Imágenes").
- **Almacenamiento:** Las imágenes subidas se guardan físicamente en la carpeta `backend/uploads/`.
- **Organización:** Soporta la creación de subcarpetas jerárquicas e indica el tamaño y la fecha exacta de subida (ordenando por fecha descendente).
- **Ruta Estática:** FastAPI expone de forma recursiva y segura este directorio en la ruta web `/uploads`. Cualquier imagen cargada es accesible públicamente mediante URLs absolutas (ej. `http://localhost:8090/uploads/carpeta/imagen.jpg`).
- **Prevención de Traversal:** Cuenta con una función de validación de rutas `get_safe_path` en `backend/src/api/media.py` que bloquea peticiones maliciosas que busquen navegar fuera del directorio de subidas.

### 2. Sincronización en Segundo Plano (Background Scheduler)
Al arrancar el servidor backend, se levanta de manera automática un hilo demonio (`scheduler.py`) que ejecuta sincronizaciones periódicas con Mercado Libre sin bloquear el servidor web.
- **Intervalo:** Se ejecuta cada **15 minutos**.
- **Acciones:**
  - Si el sistema está conectado en Modo Real, descarga e indexa las últimas 100 ventas/órdenes y actualiza los precios y stock del inventario.
  - Si está en Modo Demo, recarga las órdenes ficticias y las publicaciones simuladas de demostración para mantener el entorno activo.
- **Configuración:** Para ajustar el intervalo de sincronización, podés modificar el parámetro `time.sleep(900)` al final del bucle en `backend/src/scheduler.py`.

### 3. Creación de Productos (Locales vs. Mercado Libre)
Se ha implementado el botón "+ Agregar Producto" en la sección de Inventario para dar de alta artículos directamente:
- **Productos Locales (Solo Web):** Generan un identificador con prefijo `LOCAL-` y estado `local`. Estos productos no se sincronizan a la API de Mercado Libre al modificarlos y sirven para ventas exclusivas en el Storefront.
- **Publicaciones Mercado Libre:**
  - **En Modo Demo:** Simula la publicación inmediata creando un identificador ficticio `MLAxxx` con enlace demo en Mercado Libre.
  - **En Modo Real:** La aplicación despliega un aviso recomendando crear el artículo de forma nativa en Mercado Libre para garantizar la categorización apropiada y posterior sincronización.

### 4. Seguridad de Acceso y Gestión de Usuarios (Login)
Para restringir el acceso al panel administrativo en un entorno público (como un VPS), la plataforma implementa una pantalla de inicio de sesión protegida y un sistema de control de usuarios.

- **Credenciales Iniciales por Defecto:**
  - **Usuario:** `admin`
  - **Contraseña:** `admin123`
  - *(Se recomienda cambiar la clave o crear un nuevo usuario y borrar este desde el panel una vez montado en el VPS)*
- **Criptografía Segura:** Las contraseñas de los usuarios son encriptadas en la base de datos utilizando el estándar criptográfico **PBKDF2-HMAC-SHA256** con una sal aleatoria única de 32 caracteres por usuario y 100,000 iteraciones, previniendo ataques de diccionario.
- **Panel CRUD Integrado:** En la sección **Configuración > Gestión de Usuarios**, los administradores pueden crear nuevos accesos, modificar claves (lo cual invalida sesiones activas para esa cuenta) o eliminar usuarios (evitando la auto-eliminación).
- **Historial de Auditoría con Geolocalización:** En **Configuración > Seguridad & Accesos** se registra el historial de accesos fallidos y exitosos, capturando la dirección IP del visitante y resolviendo su ubicación geográfica (País, Región y Ciudad) utilizando el servicio de `ip-api.com`. Las conexiones locales se detectan de forma segura y se registran como "Red Local".

## Despliegue en Servidor VPS (Ubuntu 22.04 / 1GB RAM)

Esta sección documenta la arquitectura de despliegue configurada para correr el proyecto en un servidor VPS con recursos limitados (1GB RAM, 1 vCPU).

### 1. Configuración de Memoria de Intercambio (SWAP)
Debido a la limitación de 1GB de RAM física, es crucial habilitar un archivo SWAP para evitar caídas por falta de memoria (OOM Killer) durante la compilación de Node/Next.js y el funcionamiento de la base de datos PostgreSQL.
Se configuraron **2GB de SWAP** ejecutando:
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2. Entorno de Node.js y Python
* **Node.js 20:** Next.js requiere Node.js `>= 20.9.0`. Se actualizó la versión del sistema agregando el repositorio oficial de NodeSource (v20) para compilar y ejecutar el Storefront de forma óptima.
* **Python 3.12 + Venv:** Se configuró un entorno virtual en `/var/www/controlcenter/backend/venv` y se instalaron las dependencias requeridas en `requirements.txt` (incluyendo `python-multipart` y `cryptography`).

### 3. Base de Datos (PostgreSQL)
Se instaló y habilitó el motor PostgreSQL localmente.
* **Usuario:** `postgres`
* **Contraseña:** `postgres`
* **Base de Datos:** `controlcenter`
* *Nota: Las tablas de la base de datos se inicializan y actualizan automáticamente al arrancar el backend de FastAPI.*

### 4. Servidor Web y Proxy Inverso (Nginx)
Nginx actúa como servidor web estático para la interfaz del Panel de Administración y como proxy inverso para direccionar el tráfico. Ambos dominios y subdominios corren sobre el **puerto estándar 80**, lo que evita bloqueos de red externos:

* **Storefront Next.js (Tienda Pública):**
  * Dominios: `hidroponiarosario.com.ar`, `www.hidroponiarosario.com.ar`, `hidroponiarosario.com`, `www.hidroponiarosario.com`.
  * Redirecciona internamente a `http://127.0.0.1:3000`.
* **Panel de Administración (Admin + API):**
  * Dominios: `admin.hidroponiarosario.com.ar`, `admin.hidroponiarosario.com`.
  * Sirve de forma estática la carpeta compilada `/var/www/controlcenter/admin`.
  * Redirecciona las peticiones de `/api/*` al backend de FastAPI (`http://127.0.0.1:8090/api/*`).
  * Expone el directorio estático de uploads de imágenes en `/uploads`.


### 5. Configuración de Servicios del Sistema (Systemd)
Para asegurar que la aplicación **se levante sola si se cae el VPS o si ocurre algún error/cuelgue inesperado**, se configuraron servicios de Systemd (`systemd`) que administran el ciclo de vida de los procesos y los inician automáticamente tras un reinicio.

#### Servicio Backend (`/etc/systemd/system/controlcenter-backend.service`):
```ini
[Unit]
Description=ControlCenterES Backend API
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/controlcenter/backend
ExecStart=/var/www/controlcenter/backend/venv/bin/python main.py
Restart=always
RestartSec=5
Environment=DATABASE_URL=postgresql://postgres:postgres@localhost:5432/controlcenter

[Install]
WantedBy=multi-user.target
```

#### Servicio Storefront (`/etc/systemd/system/controlcenter-storefront.service`):
```ini
[Unit]
Description=ControlCenterES Next.js Storefront
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/controlcenter/storefront
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

#### Comandos de administración:
```bash
# Recargar systemd tras cambios
sudo systemctl daemon-reload

# Habilitar inicio automático en el arranque del VPS
sudo systemctl enable controlcenter-backend
sudo systemctl enable controlcenter-storefront

# Controlar los servicios (start, stop, restart, status)
sudo systemctl restart controlcenter-backend
sudo systemctl restart controlcenter-storefront
sudo systemctl status controlcenter-backend
sudo systemctl status controlcenter-storefront
```




