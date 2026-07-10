# ControlCenterES

ControlCenterES es una plataforma avanzada para la gestión de publicaciones, ventas e inventario sincronizada directamente con la API de Mercado Libre.

La aplicación utiliza una arquitectura moderna separada en backend y frontend.

## Arquitectura

- **Backend:** FastAPI (Python) + PostgreSQL (`psycopg2`)
- **Frontend:** React + Vite + Vanilla CSS
- **Integraciones:** API oficial de Mercado Libre

## Requisitos Previos

- Python 3.10+
- Node.js y npm (para el frontend)
- Servidor PostgreSQL instalado y corriendo

## Instalación y Configuración

### 1. Base de Datos
Asegurate de tener una instancia de PostgreSQL en ejecución. Por defecto, la aplicación intentará conectarse a `postgresql://postgres:postgres@localhost:5432/controlcenter`. Podés sobreescribir esta URL creando una variable de entorno `DATABASE_URL`.

### 2. Backend (FastAPI)
Instalar las dependencias de Python y activar el entorno virtual:
```bash
# Crear entorno virtual (si no existe)
python -m venv venv

# Activar entorno virtual (PowerShell)
.\venv\Scripts\Activate.ps1

# Instalar requerimientos
pip install -r requirements.txt
```

### 3. Frontend (React)
Navegar a la carpeta del frontend e instalar las dependencias de Node:
```bash
cd frontend
npm install
```

## Ejecución del Proyecto (Desarrollo)

Dado que el frontend y backend corren de forma independiente, necesitas levantar ambos servicios.

**Para el Backend:**
Ubicado en la carpeta raíz del proyecto y con el entorno virtual activado:
```bash
python main.py
```
*(El backend API se levantará en `https://localhost:8088`)*

**Para el Frontend:**
Abre una nueva ventana de terminal, navega a la carpeta `frontend` y ejecuta:
```bash
npm run dev
```
*(El frontend UI se levantará típicamente en `http://localhost:5173`)*

## Compilación (Producción)

Si querés preparar la aplicación para llevarla a un servidor en **producción**, Python no requiere compilarse, pero React sí. Para compilar el frontend:

```bash
cd frontend
npm run build
```
Esto va a crear una carpeta `dist/` dentro de `frontend/` con todos los archivos estáticos listos y minificados para que los sirva tu servidor web definitivo (como Nginx, Apache, o incluso montarlo directamente en FastAPI).

## Funcionalidades
- Sincronización automática de publicaciones activas/pausadas.
- Sincronización del historial de ventas y métricas (18 meses).
- Cálculo real de márgenes de ganancia mediante carga de costos locales.
- Gestión avanzada y métricas del cliente (historial de facturación).
- Tema de interfaz Daylight Premium personalizable y responsivo.
