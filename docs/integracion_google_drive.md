# ☁️ Guía de Integración con Google Drive

Esta guía detalla paso a paso cómo vincular **ControlCenterES** con tu cuenta de **Google Drive** para que todos los respaldos (base de datos PostgreSQL y archivos multimedia) se suban automáticamente a la nube.

---

## 🌟 Dos Modos de Integración: ¿Cuál elegir?

| Método | Recomendado Para | Espacio Disponible | Dificultad |
| :--- | :--- | :--- | :--- |
| **Opción B (OAuth 2.0 - Cuenta Personal)** ⭐ | Cuentas `@gmail.com` habituales | **15 GB a 2 TB** (tu cuota de usuario) | Sencillo (1 clic una vez creado el ID) |
| **Opción A (Cuenta de Servicio / Service Account)** | Google Workspace con **Unidades Compartidas** | Cuota de la unidad compartida | Requiere compartir carpetas |

> [!WARNING]
> **¿Por qué la Cuenta de Servicio (Service Account) falla en cuentas `@gmail.com` personales?**
> Google asigna **0 bytes de almacenamiento propio** a las Cuentas de Servicio. Si intentás subir un archivo a una carpeta de tu cuenta personal `@gmail.com` usando una Service Account, Google la rechaza con el error `storageQuotaExceeded (cuota de Service Account excedida)`.
> 
> **Para cuentas personales `@gmail.com`, utilizá SIEMPRE la Opción B (OAuth 2.0)**.

---

## 🚀 Opción B (Recomendada): Conexión con Cuenta Personal (OAuth 2.0)

Con esta opción, conectás tu propia cuenta de Google (`francoag84@gmail.com`) con un solo clic. Los backups se almacenarán usando el espacio disponible de tu cuenta.

### Paso 1: Habilitar Google Drive API en Google Cloud Console

1. Ingresá a [Google Cloud Console](https://console.cloud.google.com/) con tu cuenta de Google / Gmail.
2. Si no tenés un proyecto creado:
   - Hacé clic arriba a la izquierda en el selector de proyectos > **"Nuevo proyecto"**.
   - Nombre sugerido: `ControlCenter Backups`.
   - Hacé clic en **Crear** y asegúrate de tenerlo seleccionado en la barra superior.
3. En el menú lateral (☰), andá a **APIs y servicios** > **Biblioteca**.
4. Buscá **`Google Drive API`**, hacé clic y presioná **Habilitar**.

---

### Paso 2: Configurar la Pantalla de Consentimiento OAuth (OAuth consent screen)

1. En el menú lateral, andá a **APIs y servicios** > **Pantalla de consentimiento de OAuth**.
2. Seleccioná el tipo de usuario: **Externo** y presioná **Crear**.
3. Completá los campos obligatorios:
   - **Nombre de la aplicación**: `ControlCenter Backups`
   - **Correo electrónico de asistencia al usuario**: Tu correo de Gmail.
   - **Información de contacto del desarrollador**: Tu correo de Gmail.
4. Hacé clic en **Guardar y continuar**.
5. En la sección **Permisos (Scopes)**:
   - Hacé clic en **Agregar o quitar permisos**.
   - En el filtro buscá `drive.file` o seleccioná:
     `https://www.googleapis.com/auth/drive.file` *(Ver, crear y editar los archivos de Google Drive que hayas abierto o creado con esta app)*.
   - Presioná **Actualizar** y luego **Guardar y continuar**.
6. En la sección **Usuarios de prueba (Test users)** *(Muy importante mientras la app esté en modo prueba)*:
   - Hacé clic en **+ ADD USERS**.
   - Ingresá tu correo de Google (ej: `francoag84@gmail.com`).
   - Presioná **Guardar y continuar** y luego **Volver al panel**.

---

### Paso 3: Crear el ID de Cliente OAuth 2.0

1. En el menú lateral, andá a **APIs y servicios** > **Credenciales**.
2. En la parte superior, hacé clic en **`+ CREAR CREDENCIALES`** y elegí **"ID de cliente de OAuth"**.
3. En **Tipo de aplicación**, seleccioná **"Aplicación web"**.
4. En **Nombre**, ingresá: `ControlCenter Web`.
5. En **URIs de redireccionamiento autorizados** (Authorized redirect URIs):
   - Hacé clic en **+ AGREGAR URI**.
   - Pegá exactamente la siguiente URL:
     ```text
     https://admin.hidroponiarosario.com/api/backup/google-drive/callback
     ```
   *(Si estás probando en desarrollo local, podés agregar también: `http://localhost:8000/api/backup/google-drive/callback`)*.
6. Hacé clic en **Crear**.
7. Aparecerá una ventana con:
   - **ID de cliente** (termina en `.apps.googleusercontent.com`).
   - **Secreto de cliente**.
   - Copiá ambos valores.

---

### Paso 4: Cargar las Credenciales en ControlCenterES

1. Ingresá a tu panel de **ControlCenterES**: `https://admin.hidroponiarosario.com`.
2. Dirigite a **Configuración** > sección **Configuración de Plataforma**.
3. Buscá la tarjeta **"Google Drive (OAuth 2.0 & Respaldos)"**:
   - Pegá tu **Google OAuth Client ID**.
   - Pegá tu **Google OAuth Client Secret**.
   - *(Opcional)* Si querés que los backups vayan a una carpeta específica, creá una carpeta en tu Google Drive y pegá el ID de la carpeta en **Google Drive Folder ID** (si lo dejás vacío, se subirán directamente a la raíz de tu Drive).
4. Hacé clic en **"Guardar Configuración de Plataforma"**.

---

### Paso 5: Conectar con 1 Clic

1. En el menú de **Configuración**, andá a la sección/pestaña **"Respaldos de Base de Datos"**.
2. Verás el panel de Google Drive con un botón azul:
   **`🔗 Conectar con Google Drive`**.
3. Hacé clic en el botón. Te redirigirá a la pantalla oficial de inicio de sesión de Google.
4. Seleccioná tu cuenta de Google.
   > ℹ️ *Si Google muestra una pantalla diciendo "Google no verificó esta app", hacé clic en "Configuración avanzada" (o Advanced) y luego en "Ir a ControlCenter Backups (no seguro)". Esto es normal en aplicaciones privadas en modo testing.*
5. Concedé los permisos solicitados y presioná **Continuar**.
6. Google te redirigirá automáticamente a ControlCenterES con un mensaje de éxito:
   > ✅ **¡Google Drive conectado exitosamente con tu cuenta personal!**
7. Verás la tarjeta en verde indicando: **Conectado con cuenta personal (`tu-correo@gmail.com`)**.

---

### Paso 6: Generar y Probar un Respaldo

1. En la pantalla de **Respaldos**, hacé clic en el botón **`📦 Generar Respaldo Manual Ahora`**.
2. El sistema creará el archivo comprimido del sistema (`.zip`) y automáticamente lo subirá a tu Google Drive personal.
3. También podés hacer clic en el botón **`☁️ Subir a Drive`** en la tabla de respaldos existentes para subir cualquiera de los backups previos.

---

## 🏢 Opción A (Avanzada): Cuenta de Servicio (Service Account)

> ⚠️ **Aviso:** Esta opción requiere que cuentes con una **Unidad Compartida (Shared Drive)** de Google Workspace institucional/empresarial. En cuentas `@gmail.com` gratuitas normales o carpetas compartidas personales no funcionará por limitaciones de cuota de Google.

1. En Google Cloud Console, andá a **APIs y servicios** > **Credenciales** > **Crear credenciales** > **Cuenta de servicio**.
2. Creá la cuenta de servicio y descargá su clave privada en formato `.json`.
3. En Google Drive, creá una carpeta dentro de una **Unidad Compartida**.
4. Compartí esa carpeta con el correo de la cuenta de servicio (ej: `bot@proyecto.iam.gserviceaccount.com`) dándole rol de **Editor**.
5. En ControlCenterES, pegá el contenido completo del JSON en el campo correspondiente y guardá.
