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
*(El backend API se levantará en `https://localhost:8088`)*

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
- Sincronización automática de publicaciones activas/pausadas.
- Sincronización del historial de ventas y métricas (18 meses).
- Cálculo real de márgenes de ganancia mediante carga de costos locales.
- Gestión avanzada y métricas del cliente (historial de facturación).
- Tema de interfaz Daylight Premium personalizable y responsivo.
