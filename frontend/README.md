# ControlCenterES - Frontend (React + Vite)

Este es el directorio del Frontend de la aplicación, construido con **React** y empaquetado usando **Vite**.

## Desarrollo Local (Modo Dev)

Para trabajar localmente (con auto-recarga cuando cambias código):

1. Abre una terminal en esta carpeta (`/frontend`).
2. Instala dependencias (solo la primera vez):
   `npm install`
3. Inicia el servidor de desarrollo:
   `npm run dev`

Esto levantará la interfaz de usuario. Asegúrate de tener el Backend (FastAPI) corriendo simultáneamente.

## Cómo Compilar (Para Producción)

Dado que React necesita compilarse (empaquetar los archivos JS y CSS) antes de subir a un servidor en producción, sigue estos pasos:

1. En la terminal dentro de esta carpeta (`/frontend`):
   `npm run build`
2. Vite creará automáticamente una carpeta llamada `dist/` con los archivos compilados estáticos (HTML, JS, CSS minificados).
3. Esos archivos de la carpeta `dist/` son los que debes copiar a tu servidor final (o configurar FastAPI / Nginx para que los sirva).
## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
