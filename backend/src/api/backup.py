import os
import sys
import json
import shutil
import hashlib
import zipfile
import subprocess
import platform
from datetime import datetime
import urllib.parse
from typing import Optional
from src.utils.dates import ARGENTINA_TZ, get_now_ar, get_now_ar_iso
from fastapi import APIRouter, HTTPException, File, UploadFile, Depends
from fastapi.responses import FileResponse, RedirectResponse
from src.api.auth import verify_session, require_platform_admin

router = APIRouter()
protected_router = APIRouter(dependencies=[Depends(verify_session), Depends(require_platform_admin)])

# ---------------------------------------------------------------------------
# Keys de configuración de plataforma (developer / infra)
# ---------------------------------------------------------------------------
_PLATFORM_SETTINGS_KEYS = [
    "meli_app_id", "meli_client_id", "meli_client_secret",
    "meta_app_id", "meta_app_secret",
    "tiendanube_client_id", "tn_client_id",
    "tiendanube_client_secret", "tn_client_secret",
    "gemini_api_key",
    "google_drive_folder_id",
    "google_oauth_client_id",
    "google_oauth_client_secret",
    "public_base_url",
]

BASE_DIR = os.path.realpath(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))
BACKUP_DIR = os.path.join(BASE_DIR, "backups")

# Directories/files to include in the backup beyond the DB dump.
# Each entry is (source_path_relative_to_cwd, arcname_prefix_in_zip).
_EXTRA_DIRS = [
    (os.path.join(BASE_DIR, "invoices"), "invoices"),
    (os.path.join(BASE_DIR, "data/afip"), "data/afip"),
    (os.path.join(BASE_DIR, "whatsapp/auth_state"), "whatsapp/auth_state"),
]

_EXTRA_FILES = [
    (os.path.join(BASE_DIR, "whatsapp/contacts_cache.json"), "whatsapp/contacts_cache.json"),
]


def _get_service_account_path() -> str:
    """Busca service_account.json en las ubicaciones habituales."""
    for p in [
        os.path.join(BASE_DIR, "service_account.json"),
        "service_account.json",
        "/var/www/controlcenter/backend/service_account.json",
        os.path.join(os.getcwd(), "service_account.json"),
    ]:
        if os.path.exists(p):
            return p
    return os.path.join(BASE_DIR, "service_account.json")


def _export_platform_config() -> dict:
    """Lee las credenciales de plataforma del Master Tenant y las devuelve
    como diccionario para incluirlas en el backup.

    Esto permite restaurar toda la configuración de desarrollador sin
    tener que re-ingresar manualmente cada API key, client ID, etc.
    """
    from src import database, tenancy
    config: dict = {"_meta": {
        "exported_at": get_now_ar_iso(),
        "description": "Configuración de plataforma (developer/infra). "
                       "Generada automáticamente por el sistema de backup.",
    }}
    try:
        with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
            for key in _PLATFORM_SETTINGS_KEYS:
                val = database.get_setting(key, None)
                if val is not None:
                    config[key] = val
    except Exception as e:
        config["_export_error"] = str(e)
    return config


def _restore_platform_config(config: dict) -> list:
    """Restaura las credenciales de plataforma al Master Tenant.
    Devuelve una lista de las keys restauradas."""
    from src import database, tenancy
    restored = []
    skip_keys = {"_meta", "_export_error"}
    with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
        for key, val in config.items():
            if key in skip_keys:
                continue
            try:
                database.set_setting(key, val)
                restored.append(key)
            except Exception as e:
                print(f"[Restore] Error restaurando setting '{key}': {e}")
    return restored


def get_db_url():
    from src.database import DB_URL
    return DB_URL


def _pg_version_short() -> str:
    """Return the major PostgreSQL server version, e.g. '16'."""
    try:
        result = subprocess.run(
            ["psql", get_db_url(), "-tAc", "SHOW server_version;"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10,
        )
        if result.returncode == 0:
            return result.stdout.decode().strip().split(".")[0]
    except Exception:
        pass
    return "unknown"


def _file_checksum(path: str) -> str:
    """SHA-256 of a file, hex-encoded."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _add_directory_to_zip(zipf: zipfile.ZipFile, src_dir: str, arc_prefix: str,
                          manifest_files: list):
    """Recursively add *src_dir* to the ZIP under *arc_prefix*."""
    if not os.path.isdir(src_dir):
        return
    for root, _dirs, files in os.walk(src_dir):
        for fname in files:
            file_path = os.path.join(root, fname)
            arcname = os.path.join(arc_prefix, os.path.relpath(file_path, src_dir))
            zipf.write(file_path, arcname=arcname)
            manifest_files.append({
                "path": arcname,
                "size": os.path.getsize(file_path),
                "sha256": _file_checksum(file_path),
            })


def _add_file_to_zip(zipf: zipfile.ZipFile, src_path: str, arcname: str,
                     manifest_files: list):
    """Add a single file to the ZIP."""
    if not os.path.isfile(src_path):
        return
    zipf.write(src_path, arcname=arcname)
    manifest_files.append({
        "path": arcname,
        "size": os.path.getsize(src_path),
        "sha256": _file_checksum(src_path),
    })


def prune_old_backups(min_retention_days: int = 60, max_auto_keep: int = 12):
    """Garantiza que ningún respaldo (sistema ni medios) se elimine antes de 60 días.
    
    Para respaldos automáticos, conserva como mínimo los últimos max_auto_keep (12 meses).
    Los respaldos manuales nunca se eliminan automáticamente.
    """
    if not os.path.exists(BACKUP_DIR):
        return
    now = datetime.now(ARGENTINA_TZ)

    groups = {}
    for f in os.listdir(BACKUP_DIR):
        if f.endswith('.zip') and not f.startswith('_restore_'):
            group_id = f.replace('.zip', '').replace('_media', '')
            filepath = os.path.join(BACKUP_DIR, f)
            stat = os.stat(filepath)
            ctime = datetime.fromtimestamp(stat.st_ctime, tz=ARGENTINA_TZ)

            if group_id not in groups:
                groups[group_id] = {
                    "id": group_id,
                    "created_at": ctime,
                    "is_auto": "auto_" in group_id,
                    "files": []
                }
            groups[group_id]["files"].append(filepath)

    # Solo depurar respaldos automáticos viejos que superen 60 días y el cupo
    auto_groups = [g for g in groups.values() if g["is_auto"]]
    auto_groups.sort(key=lambda x: x["created_at"])  # Más viejos primero

    while len(auto_groups) > max_auto_keep:
        oldest = auto_groups.pop(0)
        age_days = (now - oldest["created_at"]).days
        if age_days < min_retention_days:
            break
        for fpath in oldest["files"]:
            try:
                os.remove(fpath)
                print(f"[Backup] Purged old backup file: {fpath} ({age_days} days old)")
            except Exception as e:
                print(f"[Backup] Error deleting {fpath}: {e}")


def run_backup_dump(is_auto: bool = False):
    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = get_now_ar().strftime("%Y%m%d_%H%M%S")
    prefix = "backup_auto_" if is_auto else "backup_"
    backup_filename = f"{prefix}{timestamp}.zip"
    backup_path = os.path.join(BACKUP_DIR, backup_filename)

    media_filename = f"{prefix}{timestamp}_media.zip"
    media_path = os.path.join(BACKUP_DIR, media_filename)

    db_url = get_db_url()
    sql_filename = f"database_{timestamp}.sql"
    sql_path = os.path.join(BACKUP_DIR, sql_filename)

    try:
        process = subprocess.run(
            ["pg_dump", db_url, "-f", sql_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        if process.returncode != 0:
            print("pg_dump error:", process.stderr.decode())
            raise Exception("Failed to dump database. Ensure pg_dump is installed.")

        # -- Build the ZIP with manifest ------------------------------------------
        manifest_files: list = []

        with zipfile.ZipFile(backup_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # 1) Database dump
            zipf.write(sql_path, arcname=sql_filename)
            manifest_files.append({
                "path": sql_filename,
                "size": os.path.getsize(sql_path),
                "sha256": _file_checksum(sql_path),
            })

            # 2) Extra directories (invoices, AFIP certs, WA session)
            for src_dir, arc_prefix in _EXTRA_DIRS:
                _add_directory_to_zip(zipf, src_dir, arc_prefix, manifest_files)

            # 3) Extra individual files
            for src_path, arcname in _EXTRA_FILES:
                _add_file_to_zip(zipf, src_path, arcname, manifest_files)

            # 4) Platform / developer config export
            has_platform_config = False
            try:
                platform_config = _export_platform_config()
                platform_json = json.dumps(platform_config, indent=2, ensure_ascii=False)
                zipf.writestr("platform_config.json", platform_json)
                has_platform_config = bool(
                    set(platform_config.keys()) - {"_meta", "_export_error"}
                )
                manifest_files.append({
                    "path": "platform_config.json",
                    "size": len(platform_json.encode("utf-8")),
                    "sha256": hashlib.sha256(platform_json.encode("utf-8")).hexdigest(),
                })
                print(f"[Backup] Configuración de plataforma exportada ({len(platform_config) - 1} keys).")
            except Exception as e:
                print(f"[Backup] No se pudo exportar config de plataforma: {e}")

            # 5) service_account.json (Google Drive / API credentials)
            has_service_account = False
            sa_path = _get_service_account_path()
            if os.path.isfile(sa_path):
                _add_file_to_zip(zipf, sa_path, "service_account.json", manifest_files)
                has_service_account = True
                print("[Backup] service_account.json incluido en el respaldo.")

            # 6) Build and embed the manifest
            manifest = {
                "version": "2.1",
                "created_at": get_now_ar_iso(),
                "type": "auto" if is_auto else "manual",
                "system": {
                    "python": platform.python_version(),
                    "os": f"{platform.system()} {platform.release()}",
                    "pg_version": _pg_version_short(),
                },
                "contents": {
                    "database": True,
                    "invoices": os.path.isdir(os.path.join(BASE_DIR, "invoices")),
                    "afip_certs": os.path.isdir(os.path.join(BASE_DIR, "data/afip")),
                    "whatsapp_session": os.path.isdir(os.path.join(BASE_DIR, "whatsapp/auth_state")),
                    "whatsapp_contacts": os.path.isfile(os.path.join(BASE_DIR, "whatsapp/contacts_cache.json")),
                    "platform_config": has_platform_config,
                    "service_account": has_service_account,
                },
                "files_count": len(manifest_files),
                "files": manifest_files,
            }
            zipf.writestr("backup_manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))

        # -- Build the Media ZIP --
        uploads_dir = os.path.join(BASE_DIR, "uploads")
        if not os.path.isdir(uploads_dir) and os.path.isdir("uploads"):
            uploads_dir = "uploads"

        if os.path.isdir(uploads_dir):
            with zipfile.ZipFile(media_path, 'w', zipfile.ZIP_DEFLATED) as zipm:
                media_manifest_files = []
                _add_directory_to_zip(zipm, uploads_dir, "uploads", media_manifest_files)
                
                media_manifest = {
                    "version": "2.0",
                    "created_at": datetime.now().isoformat(),
                    "type": "auto" if is_auto else "manual",
                    "is_media_only": True,
                    "contents": {
                        "uploads": True,
                    },
                    "files_count": len(media_manifest_files),
                    "files": media_manifest_files,
                }
                zipm.writestr("backup_manifest.json", json.dumps(media_manifest, indent=2, ensure_ascii=False))
    finally:
        # Clean up temporary SQL dump safely
        if os.path.exists(sql_path):
            try:
                os.remove(sql_path)
            except Exception:
                pass

    # -- Upload to Google Drive if configured for the platform --
    try:
        from src.utils import google_drive
        from src import database, tenancy
        with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
            folder_id = (os.getenv("GOOGLE_DRIVE_FOLDER_ID") or database.get_setting("google_drive_folder_id", "")).strip()

        print(f"[Backup] Intentando subida de respaldo a Google Drive...")
        file_id = google_drive.upload_file(backup_path, backup_filename, folder_id=folder_id or None)
        if file_id:
            print(f"[Backup] Subida de sistema a Google Drive exitosa. ID: {file_id}")
            if os.path.exists(media_path):
                print(f"[Backup] Subiendo medios a Google Drive...")
                media_file_id = google_drive.upload_file(media_path, media_filename, folder_id=folder_id or None)
                if media_file_id:
                    print(f"[Backup] Subida de medios a Google Drive exitosa. ID: {media_file_id}")
        else:
            print("[Backup] Subida a Google Drive omitida o fallida (ver logs de Google Drive).")
    except Exception as e:
        print(f"[Backup] Error al procesar integración con Google Drive: {e}")

    if is_auto:
        prune_old_backups(min_retention_days=60, max_auto_keep=12)

    return backup_filename


def check_and_run_monthly_auto_backup():
    """Checks if a monthly automatic backup is due and runs it if needed."""
    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        now = get_now_ar()

        auto_backups = []
        for f in os.listdir(BACKUP_DIR):
            if f.startswith("backup_auto_") and f.endswith(".zip"):
                filepath = os.path.join(BACKUP_DIR, f)
                stat = os.stat(filepath)
                auto_backups.append(datetime.fromtimestamp(stat.st_ctime, tz=ARGENTINA_TZ))

        needs_backup = False
        if not auto_backups:
            needs_backup = True
        else:
            latest_backup = max(auto_backups)
            if (now.year > latest_backup.year) or (now.month > latest_backup.month) or ((now - latest_backup).days >= 30):
                needs_backup = True

        if needs_backup:
            print("[Backup] Ejecutando respaldo automático mensual...")
            filename = run_backup_dump(is_auto=True)
            print(f"[Backup] Respaldo automático mensual creado: {filename}")
    except Exception as e:
        print(f"[Backup] Error en comprobación de respaldo automático: {e}")


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@protected_router.post("/create")
def create_backup():
    try:
        backup_filename = run_backup_dump(is_auto=False)
        return {"status": "success", "filename": backup_filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@protected_router.get("/list")
def list_backups():
    if not os.path.exists(BACKUP_DIR):
        return []

    groups = {}
    for f in os.listdir(BACKUP_DIR):
        if f.endswith('.zip') and not f.startswith('_restore_'):
            filepath = os.path.join(BACKUP_DIR, f)
            stat = os.stat(filepath)
            
            group_id = f.replace('.zip', '').replace('_media', '')
            is_media = f.endswith('_media.zip')
            b_type = "auto" if "auto_" in f else "manual"
            file_created_at = datetime.fromtimestamp(stat.st_ctime, tz=ARGENTINA_TZ).isoformat()

            # Try to read manifest for contents summary and original timestamp
            contents = None
            manifest_created_at = None
            try:
                with zipfile.ZipFile(filepath, 'r') as zf:
                    if "backup_manifest.json" in zf.namelist():
                        manifest = json.loads(zf.read("backup_manifest.json"))
                        contents = manifest.get("contents")
                        manifest_created_at = manifest.get("created_at")
            except Exception:
                pass

            effective_created_at = manifest_created_at or file_created_at

            if group_id not in groups:
                groups[group_id] = {
                    "id": group_id,
                    "created_at": effective_created_at,
                    "type": b_type,
                    "main_file": None,
                    "media_file": None,
                }

            file_data = {
                "filename": f,
                "size_bytes": stat.st_size,
                "contents": contents,
            }
            
            if is_media:
                groups[group_id]["media_file"] = file_data
            else:
                groups[group_id]["main_file"] = file_data
                groups[group_id]["created_at"] = effective_created_at

    backups = list(groups.values())
    backups.sort(key=lambda x: x["created_at"], reverse=True)
    return backups


@protected_router.get("/contents/{filename}")
def get_backup_contents(filename: str):
    """Preview the contents of a backup ZIP without extracting it."""
    if not filename.endswith('.zip'):
        raise HTTPException(status_code=404, detail="Backup not found")

    backup_root = os.path.realpath(BACKUP_DIR)
    filepath = os.path.realpath(os.path.join(backup_root, filename))
    if os.path.commonpath([backup_root, filepath]) != backup_root:
        raise HTTPException(status_code=404, detail="Backup not found")
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Backup not found")

    try:
        with zipfile.ZipFile(filepath, 'r') as zf:
            names = zf.namelist()
            if "backup_manifest.json" in names:
                manifest = json.loads(zf.read("backup_manifest.json"))
                return {
                    "has_manifest": True,
                    "manifest": manifest,
                }
            else:
                # Legacy backup without manifest — infer contents from filenames
                has_sql = any(n.endswith(".sql") for n in names)
                has_uploads = any(n.startswith("uploads/") for n in names)
                has_invoices = any(n.startswith("invoices/") for n in names)
                has_afip = any(n.startswith("data/afip/") for n in names)
                has_wa = any(n.startswith("whatsapp/auth_state/") for n in names)
                has_wa_contacts = "whatsapp/contacts_cache.json" in names
                return {
                    "has_manifest": False,
                    "inferred_contents": {
                        "database": has_sql,
                        "uploads": has_uploads,
                        "invoices": has_invoices,
                        "afip_certs": has_afip,
                        "whatsapp_session": has_wa,
                        "whatsapp_contacts": has_wa_contacts,
                    },
                    "files_count": len(names),
                    "file_list": names[:200],  # cap to avoid huge responses
                }
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="El archivo no es un ZIP válido")


@protected_router.get("/download/{filename}")
def download_backup(filename: str):
    # `filename` viene de la URL: sin normalizar, un nombre como
    # "../../otro/archivo.zip" se escapaba de BACKUP_DIR y servía cualquier .zip
    # del disco. Se resuelve la ruta y se verifica que caiga dentro del
    # directorio de respaldos.
    if not filename.endswith('.zip'):
        raise HTTPException(status_code=404, detail="Backup not found")

    backup_root = os.path.realpath(BACKUP_DIR)
    filepath = os.path.realpath(os.path.join(backup_root, filename))
    if os.path.commonpath([backup_root, filepath]) != backup_root:
        raise HTTPException(status_code=404, detail="Backup not found")

    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Backup not found")

    return FileResponse(
        path=filepath,
        filename=os.path.basename(filepath),
        media_type='application/zip'
    )


@protected_router.post("/upload-to-drive/{backup_id}")
def upload_backup_to_drive(backup_id: str):
    """Sube un respaldo existente (sistema y medios) a Google Drive bajo demanda."""
    from src.utils import google_drive
    from src import database, tenancy

    clean_id = os.path.basename(backup_id).replace('.zip', '').replace('_media', '')
    main_filename = f"{clean_id}.zip"
    media_filename = f"{clean_id}_media.zip"

    backup_root = os.path.realpath(BACKUP_DIR)
    main_path = os.path.realpath(os.path.join(backup_root, main_filename))
    media_path = os.path.realpath(os.path.join(backup_root, media_filename))

    if os.path.commonpath([backup_root, main_path]) != backup_root or not os.path.isfile(main_path):
        raise HTTPException(status_code=404, detail=f"No se encontró el archivo principal de respaldo: {main_filename}")

    with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
        folder_id = (os.getenv("GOOGLE_DRIVE_FOLDER_ID") or database.get_setting("google_drive_folder_id", "")).strip()

    try:
        main_file_id = google_drive.upload_file(main_path, main_filename, folder_id=folder_id or None, raise_on_error=True)
    except Exception as e:
        err_msg = str(e)
        if "storageQuotaExceeded" in err_msg or "Service Accounts do not have storage quota" in err_msg:
            detail = (
                "Google Drive rechazó la subida (cuota de Service Account excedida). "
                "Las cuentas de servicio tienen 0 GB de cuota en 'Mi Unidad' personal de Gmail. "
                "Para solucionarlo, vinculá tu cuenta personal con Google Drive OAuth 2.0 desde la tarjeta de Google Drive."
            )
        elif "File not found" in err_msg or "notFound" in err_msg:
            detail = f"La carpeta de Google Drive '{folder_id}' no fue encontrada o la cuenta conectada no tiene permisos sobre ella."
        else:
            detail = f"Error al subir a Google Drive: {err_msg}"
        raise HTTPException(status_code=400, detail=detail)

    media_file_id = None
    if os.path.isfile(media_path):
        try:
            media_file_id = google_drive.upload_file(media_path, media_filename, folder_id=folder_id or None, raise_on_error=True)
        except Exception as e:
            print(f"[Backup] Error subiendo archivo de medios a Google Drive: {e}")

    return {
        "status": "success",
        "message": "Respaldo subido exitosamente a Google Drive.",
        "main_file_id": main_file_id,
        "media_file_id": media_file_id
    }


@protected_router.delete("/{backup_id}")
def delete_backup(backup_id: str):
    """Elimina un respaldo del servidor (tanto el archivo de sistema como el de medios)."""
    clean_id = os.path.basename(backup_id).replace('.zip', '').replace('_media', '')
    main_filename = f"{clean_id}.zip"
    media_filename = f"{clean_id}_media.zip"

    backup_root = os.path.realpath(BACKUP_DIR)
    main_path = os.path.realpath(os.path.join(backup_root, main_filename))
    media_path = os.path.realpath(os.path.join(backup_root, media_filename))

    deleted = []
    if os.path.isfile(main_path):
        os.remove(main_path)
        deleted.append(main_filename)
    if os.path.isfile(media_path):
        os.remove(media_path)
        deleted.append(media_filename)

    if not deleted:
        raise HTTPException(status_code=404, detail="Respaldo no encontrado")

    return {"success": True, "deleted": deleted, "message": f"Respaldo '{clean_id}' eliminado exitosamente."}


@protected_router.post("/restore")
async def restore_backup(file: UploadFile = File(...)):
    """Restore the system from a backup ZIP.

    Steps:
    1. Save the uploaded ZIP to a temporary location
    2. Validate it contains a SQL dump
    3. Create a pre-restore safety snapshot
    4. Restore the database
    5. Extract all asset directories (uploads, invoices, AFIP, WhatsApp)
    6. Restart services
    """
    if not file.filename or not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="El archivo debe ser un .zip")

    os.makedirs(BACKUP_DIR, exist_ok=True)
    tmp_path = os.path.join(BACKUP_DIR, f"_restore_upload_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip")

    # Save uploaded file to disk
    try:
        with open(tmp_path, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)  # 1 MB chunks
                if not chunk:
                    break
                out.write(chunk)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar archivo: {e}")

    # Validate ZIP
    try:
        with zipfile.ZipFile(tmp_path, 'r') as zf:
            names = zf.namelist()
    except zipfile.BadZipFile:
        os.remove(tmp_path)
        raise HTTPException(status_code=400, detail="El archivo no es un ZIP válido")

    # Check if this is a media-only backup
    is_media_only = False
    try:
        with zipfile.ZipFile(tmp_path, 'r') as zf:
            if "backup_manifest.json" in names:
                manifest = json.loads(zf.read("backup_manifest.json"))
                if manifest.get("is_media_only"):
                    is_media_only = True
    except Exception:
        pass
        
    has_uploads = any(n.startswith("uploads/") for n in names)
    
    # Find the SQL dump file
    sql_files = [n for n in names if n.endswith('.sql')]
    if not sql_files:
        if has_uploads and not any(n.startswith("invoices/") or n.startswith("data/afip/") for n in names):
            is_media_only = True
            
        if not is_media_only:
            os.remove(tmp_path)
            raise HTTPException(status_code=400,
                                detail="El backup no contiene un volcado de base de datos (.sql) ni es un respaldo exclusivo de medios.")

    # --- 1. Pre-restore safety snapshot ---
    pre_restore_file = None
    if not is_media_only:
        try:
            pre_restore_file = run_backup_dump(is_auto=False)
            print(f"[Restore] Pre-restore snapshot created: {pre_restore_file}")
        except Exception as e:
            print(f"[Restore] Warning: could not create pre-restore snapshot: {e}")

    restore_log = {
        "pre_restore_backup": pre_restore_file,
        "database_restored": False,
        "directories_restored": [],
        "files_restored": [],
        "services_restarted": False,
        "errors": [],
    }

    extract_dir = os.path.join(BACKUP_DIR, "_restore_extract")
    try:
        # --- 2. Extract the ZIP ---
        with zipfile.ZipFile(tmp_path, 'r') as zf:
            zf.extractall(extract_dir)

        # --- 3. Restore the database ---
        if not is_media_only:
            sql_path = os.path.join(extract_dir, sql_files[0])
            db_url = get_db_url()

            process = subprocess.run(
                ["psql", db_url, "-f", sql_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=300,
            )
            if process.returncode != 0:
                stderr = process.stderr.decode()
                # psql often returns warnings that aren't fatal; only treat as
                # error if the exit code is non-zero AND there's an ERROR line.
                error_lines = [l for l in stderr.split('\n') if 'ERROR' in l.upper()]
                if error_lines:
                    restore_log["errors"].append(f"psql errors: {'; '.join(error_lines[:5])}")
                else:
                    # Non-fatal warnings (e.g. "role already exists"), consider OK
                    pass
            restore_log["database_restored"] = True

        # --- 4. Restore asset directories ---
        dirs_to_restore = [
            ("uploads", "uploads"),
            ("invoices", "invoices"),
            ("data/afip", "data/afip"),
            ("whatsapp/auth_state", "whatsapp/auth_state"),
        ]
        if is_media_only:
            dirs_to_restore = [("uploads", "uploads")]
            
        for src_rel, dest_rel in dirs_to_restore:
            src_full = os.path.join(extract_dir, src_rel)
            if os.path.isdir(src_full):
                os.makedirs(dest_rel, exist_ok=True)
                # Copy tree contents, overwriting existing files
                for root, dirs, files in os.walk(src_full):
                    rel_root = os.path.relpath(root, src_full)
                    dest_root = os.path.join(dest_rel, rel_root)
                    os.makedirs(dest_root, exist_ok=True)
                    for fname in files:
                        src_file = os.path.join(root, fname)
                        dest_file = os.path.join(dest_root, fname)
                        shutil.copy2(src_file, dest_file)
                restore_log["directories_restored"].append(dest_rel)

        # --- 5. Restore specific individual files ---
        if not is_media_only:
            files_to_restore = [
                ("whatsapp/contacts_cache.json", "whatsapp/contacts_cache.json"),
                ("service_account.json", "service_account.json"),
            ]
            for src_rel, dest_rel in files_to_restore:
                src_full = os.path.join(extract_dir, src_rel)
                if os.path.isfile(src_full):
                    os.makedirs(os.path.dirname(dest_rel), exist_ok=True)
                    shutil.copy2(src_full, dest_rel)
                    restore_log["files_restored"].append(dest_rel)

            # --- 5b. Restore platform developer config ---
            platform_config_path = os.path.join(extract_dir, "platform_config.json")
            if os.path.isfile(platform_config_path):
                try:
                    with open(platform_config_path, "r", encoding="utf-8") as pcf:
                        platform_data = json.load(pcf)
                    restored_keys = _restore_platform_config(platform_data)
                    restore_log["platform_config_restored"] = restored_keys
                    print(f"[Restore] Configuración de plataforma restaurada: {len(restored_keys)} keys.")
                except Exception as e:
                    restore_log["errors"].append(f"Error restaurando config de plataforma: {e}")
                    print(f"[Restore] Error restaurando platform_config.json: {e}")

        # --- 6. Restart services ---
        if not is_media_only:
            if sys.platform == "linux":
                services = [
                    "controlcenter-backend",
                    "controlcenter-whatsapp",
                    "controlcenter-storefront",
                ]
                for svc in services:
                    try:
                        subprocess.run(
                            ["systemctl", "restart", svc],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=30,
                        )
                    except Exception as e:
                        restore_log["errors"].append(f"Error restarting {svc}: {e}")
                restore_log["services_restarted"] = True

    except Exception as e:
        restore_log["errors"].append(str(e))
        raise HTTPException(status_code=500,
                            detail={"message": f"Error durante la restauración: {e}",
                                    "restore_log": restore_log})
    finally:
        # Clean up
        if os.path.isdir(extract_dir):
            shutil.rmtree(extract_dir, ignore_errors=True)
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return {
        "status": "success",
        "message": "Restauración completada exitosamente",
        "restore_log": restore_log,
    }


@protected_router.get("/disk-space")
def get_disk_space():
    try:
        total, used, free = shutil.disk_usage("/")
        return {
            "total_gb": round(total / (1024**3), 2),
            "used_gb": round(used / (1024**3), 2),
            "free_gb": round(free / (1024**3), 2),
            "percent_used": round((used / total) * 100, 1) if total > 0 else 0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Google Drive OAuth 2.0 & Integración
# ---------------------------------------------------------------------------

@protected_router.get("/google-drive/status")
def get_google_drive_status():
    """Consulta el estado de vinculación con Google Drive."""
    from src.utils import google_drive
    from src import database, tenancy

    with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
        folder_id = (os.getenv("GOOGLE_DRIVE_FOLDER_ID") or database.get_setting("google_drive_folder_id", "")).strip()
        client_id = (os.getenv("GOOGLE_OAUTH_CLIENT_ID") or database.get_setting("google_oauth_client_id", "")).strip()
        client_secret = (os.getenv("GOOGLE_OAUTH_CLIENT_SECRET") or database.get_setting("google_oauth_client_secret", "")).strip()
        refresh_token = (database.get_setting("google_oauth_refresh_token", "") or "").strip()
        user_email = (database.get_setting("google_oauth_user_email", "") or "").strip()

    service_client, auth_mode = google_drive.get_drive_service()
    connected = service_client is not None

    if connected and auth_mode == "oauth" and not user_email:
        profile = google_drive.get_user_profile(service_client)
        if profile.get("success") and profile.get("email"):
            user_email = profile["email"]
            with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
                database.set_setting("google_oauth_user_email", user_email)

    return {
        "connected": connected,
        "auth_mode": auth_mode,  # 'oauth', 'service_account', 'none'
        "user_email": user_email,
        "folder_id": folder_id,
        "has_client_credentials": bool(client_id and client_secret),
        "is_oauth_configured": bool(refresh_token),
    }


@protected_router.get("/google-drive/auth-url")
def get_google_drive_auth_url():
    """Genera la URL de consentimiento para conectar Google Drive vía OAuth 2.0."""
    from src.utils import google_drive
    from src import database, tenancy

    with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
        client_id = (os.getenv("GOOGLE_OAUTH_CLIENT_ID") or database.get_setting("google_oauth_client_id", "")).strip()
        client_secret = (os.getenv("GOOGLE_OAUTH_CLIENT_SECRET") or database.get_setting("google_oauth_client_secret", "")).strip()
        public_url = (os.getenv("PUBLIC_BASE_URL") or database.get_setting("public_base_url", "https://es.focalserver.com")).strip().rstrip("/")

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=400,
            detail="Faltan credenciales de Google OAuth. Configura GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET en Configuración > Plataforma."
        )

    redirect_uri = f"{public_url}/api/backup/google-drive/callback"
    auth_url = google_drive.get_auth_url(client_id, redirect_uri)
    return {"auth_url": auth_url, "redirect_uri": redirect_uri}


@router.get("/google-drive/callback")
def google_drive_oauth_callback(
    code: Optional[str] = None,
    error: Optional[str] = None,
    state: Optional[str] = None
):
    """Callback público invocado por Google tras la autorización del usuario."""
    if error:
        return RedirectResponse(url=f"/settings?tab=backups&gdrive_error={urllib.parse.quote(error)}")

    if not code:
        return RedirectResponse(url="/settings?tab=backups&gdrive_error=no_code_provided")

    from src.utils import google_drive
    from src import database, tenancy

    with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
        client_id = (os.getenv("GOOGLE_OAUTH_CLIENT_ID") or database.get_setting("google_oauth_client_id", "")).strip()
        client_secret = (os.getenv("GOOGLE_OAUTH_CLIENT_SECRET") or database.get_setting("google_oauth_client_secret", "")).strip()
        public_url = (os.getenv("PUBLIC_BASE_URL") or database.get_setting("public_base_url", "https://es.focalserver.com")).strip().rstrip("/")

    redirect_uri = f"{public_url}/api/backup/google-drive/callback"

    tokens = google_drive.exchange_code_for_tokens(code, client_id, client_secret, redirect_uri)
    if "error" in tokens:
        err_detail = tokens.get("error_description") or tokens.get("error")
        return RedirectResponse(url=f"/settings?tab=backups&gdrive_error={urllib.parse.quote(str(err_detail))}")

    refresh_token = tokens.get("refresh_token")
    access_token = tokens.get("access_token")

    with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
        if refresh_token:
            database.set_setting("google_oauth_refresh_token", refresh_token)
        if access_token:
            database.set_setting("google_oauth_access_token", access_token)

    # Consultar perfil del usuario para obtener su email
    try:
        service_client, _ = google_drive.get_drive_service()
        if service_client:
            profile = google_drive.get_user_profile(service_client)
            if profile.get("success") and profile.get("email"):
                with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
                    database.set_setting("google_oauth_user_email", profile["email"])
    except Exception as e:
        print(f"[Google Drive Callback] Error al obtener perfil: {e}")

    return RedirectResponse(url="/settings?tab=backups&gdrive_connected=true")


@protected_router.post("/google-drive/disconnect")
def disconnect_google_drive():
    """Desvincula la cuenta personal de Google Drive eliminando los tokens guardados."""
    from src import database, tenancy

    with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
        database.delete_setting("google_oauth_refresh_token")
        database.delete_setting("google_oauth_access_token")
        database.delete_setting("google_oauth_user_email")

    return {"success": True, "message": "Cuenta de Google Drive desvinculada exitosamente."}


# ---------------------------------------------------------------------------
# Incluir rutas protegidas en el router principal
# ---------------------------------------------------------------------------
router.include_router(protected_router)
