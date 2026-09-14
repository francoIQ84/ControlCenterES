# ☁️ Guía de Integración con Google Drive (Google Cloud Service Account)

Esta guía detalla paso a paso cómo vincular **ControlCenterES** con tu cuenta de **Google Drive** para que todos los respaldos (backups de base de datos PostgreSQL y archivos) se suban automáticamente a la nube.

---

## 📋 ¿Cómo funciona?

El sistema utiliza una **Cuenta de Servicio (Service Account)** de Google Cloud en lugar de un inicio de sesión interactivo de usuario. 
Esto permite que:
- Los respaldos se suban de manera autónoma en segundo plano (incluso de noche o por tareas programadas).
- No expire la sesión ni requiera volver a iniciar sesión cada semana.
- La aplicación solo tenga acceso a la carpeta específica de Drive que vos decidas compartirle, manteniendo el resto de tu Google Drive 100% privado y seguro.

---

## 🛠️ Paso 1: Habilitar Google Drive API en Google Cloud Console

1. Ingresá a [Google Cloud Console](https://console.cloud.google.com/) con tu cuenta de Google / Gmail.
2. Si no tenés un proyecto creado:
   - Hacé clic arriba a la izquierda en el selector de proyectos.
   - Presioná **"Nuevo proyecto"**.
   - Nombre sugerido: `ControlCenter Backups` (o el nombre de tu empresa).
   - Hacé clic en **Crear** y asegúrate de tenerlo seleccionado en la barra superior.
3. En el menú de navegación lateral (icono de 3 líneas ☰), andá a:
   **APIs y servicios** > **Biblioteca**.
4. En el buscador escribí: **`Google Drive API`**.
5. Hacé clic en el resultado **Google Drive API** y presioná el botón azul **Habilitar**.

---

## 🔑 Paso 2: Crear la Cuenta de Servicio y Descargar el Archivo JSON

1. En el menú lateral, andá a **APIs y servicios** > **Credenciales**.
2. En la parte superior hacé clic en **`+ CREAR CREDENCIALES`** y elegí **"Cuenta de servicio"**.
3. Completá los datos básicos:
   - **Nombre de la cuenta de servicio**: `backup-bot` (o `controlcenter-backups`).
   - **ID de la cuenta de servicio**: Se genera automáticamente.
   - **Descripción**: `Subida automática de respaldos ControlCenterES`.
4. Hacé clic en **Crear y continuar** y luego en **Listo** (no es necesario otorgar roles de proyecto aquí).
5. Volverás a la lista de "Cuentas de servicio". Hacé clic sobre el correo electrónico de la cuenta que acabás de crear. 
   - El correo tiene un formato similar a:
     ```text
     backup-bot@tu-proyecto-123456.iam.gserviceaccount.com
     ```
   > 📌 **Copiá este correo electrónico**: Lo necesitarás en el Paso 3 para compartirle la carpeta.
6. Hacé clic en la pestaña superior **Claves** (Keys).
7. Hacé clic en **Agregar clave** > **Crear clave nueva**.
8. Seleccioná el formato **JSON** y presioná **Crear**.
9. Automáticamente se descargará a tu computadora un archivo `.json` con tus credenciales seguras.

---

## 📁 Paso 3: Crear la Carpeta de Destino en Google Drive y Compartirla

1. Abrí [Google Drive](https://drive.google.com/) con tu cuenta de Google habitual.
2. Creá una carpeta nueva donde quieras almacenar los backups (ej: `Respaldos ControlCenter`).
3. Entrá a la carpeta y observá la URL en la barra de direcciones de tu navegador:
   ```text
   https://drive.google.com/drive/folders/1A2B3C4D5E6F7G8H9I_xyz
   ```
   - El código alfanumérico que aparece **después de `/folders/`** es el **ID de la Carpeta Destino**. Copialo.
4. **Compartir la carpeta con la Cuenta de Servicio**:
   - Hacé clic derecho sobre la carpeta > **Compartir** > **Compartir** (o el botón Compartir arriba a la derecha).
   - En el campo para agregar personas, pegá el **correo de la Service Account** que copiaste en el Paso 2 (ej: `backup-bot@tu-proyecto-123456.iam.gserviceaccount.com`).
   - Asignale el rol de **Editor**.
   - Desmarcá la opción *"Notificar a los usuarios"* (las cuentas de servicio no tienen buzón de entrada).
   - Presioná **Compartir**.

---

## ⚙️ Paso 4: Cargar la Configuración en ControlCenterES

1. Ingresá a tu panel de **ControlCenterES**.
2. Andá a **Configuración** > sección **Respaldos & Google Drive** (o pestaña de Base de Datos).
3. Marcá la casilla:
   - `[x] Activar subida automática a Google Drive`
4. En **ID de la Carpeta Destino**:
   - Pegá el identificador copiado en el Paso 3 (ej: `1A2B3C4D5E6F7G8H9I_xyz`).
5. En **JSON de Google Cloud Service Account**:
   - Abrí el archivo `.json` descargado en el Paso 2 con el Bloc de notas o cualquier editor de texto.
   - Copiá **todo el texto completo** (incluyendo las llaves `{` y `}`).
   - Pegalo dentro del cuadro de texto.
6. Hacé clic en **Guardar Configuración**.

---

## 🧪 Verificación del Funcionamiento

1. En la misma pantalla de Respaldos, hacé clic en **`📦 Generar Respaldo Manual Ahora`**.
2. El sistema creará el archivo comprimido `.zip` con la base de datos PostgreSQL y los archivos del sistema.
3. Si la integración está configurada, el sistema subirá automáticamente una copia a Google Drive en segundo plano.
4. Abrí tu carpeta en Google Drive y corroborá que el archivo de respaldo aparezca subido correctamente.
