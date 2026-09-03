import os
import sys
import json
import shutil
import hashlib
import zipfile
import subprocess
import platform
from datetime import datetime
from fastapi import APIRouter, HTTPException, File, UploadFile
from fastapi.responses import FileResponse

router = APIRouter()

BACKUP_DIR = "backups"

# Directories/files to include in the backup beyond the DB dump.
# Each entry is (source_path_relative_to_cwd, arcname_prefix_in_zip).
_EXTRA_DIRS = [
    ("uploads", "uploads"),
    ("invoices", "invoices"),
    ("data/afip", "data/afip"),
    ("whatsapp/auth_state", "whatsapp/auth_state"),
]

_EXTRA_FILES = [
    ("whatsapp/contacts_cache.json", "whatsapp/contacts_cache.json"),
]


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


def prune_old_auto_backups(max_keep: int = 12):
    """Keeps only the max_keep (default 12 = 1 year) most recent automatic backups."""
    if not os.path.exists(BACKUP_DIR):
        return
    auto_files = []
    for f in os.listdir(BACKUP_DIR):
        if f.startswith("backup_auto_") and f.endswith(".zip"):
            filepath = os.path.join(BACKUP_DIR, f)
            stat = os.stat(filepath)
            auto_files.append((filepath, stat.st_ctime))

    # Sort oldest first
    auto_files.sort(key=lambda x: x[1])

    # Delete oldest if count exceeds max_keep
    while len(auto_files) > max_keep:
        oldest_path, _ = auto_files.pop(0)
        try:
            os.remove(oldest_path)
            print(f"[Backup] Purged old automatic backup: {oldest_path}")
        except Exception as e:
            print(f"[Backup] Error deleting old backup {oldest_path}: {e}")


def run_backup_dump(is_auto: bool = False):
    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    prefix = "backup_auto_" if is_auto else "backup_"
    backup_filename = f"{prefix}{timestamp}.zip"
    backup_path = os.path.join(BACKUP_DIR, backup_filename)

    db_url = get_db_url()
    sql_filename = f"database_{timestamp}.sql"
    sql_path = os.path.join(BACKUP_DIR, sql_filename)

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

        # El .env NO se incluye a propósito. Contiene la cadena de conexión a la
        # base y la clave maestra de cifrado de credenciales; empaquetarlo junto
        # al volcado convierte cualquier copia del respaldo en un compromiso
        # total, y anula el cifrado en reposo de tenant_integrations (el dato
        # cifrado y su llave viajarían en el mismo archivo).

        # 2) Extra directories (uploads, invoices, AFIP certs, WA session)
        for src_dir, arc_prefix in _EXTRA_DIRS:
            _add_directory_to_zip(zipf, src_dir, arc_prefix, manifest_files)

        # 3) Extra individual files
        for src_path, arcname in _EXTRA_FILES:
            _add_file_to_zip(zipf, src_path, arcname, manifest_files)

        # 4) Build and embed the manifest
        manifest = {
            "version": "2.0",
            "created_at": datetime.now().isoformat(),
            "type": "auto" if is_auto else "manual",
            "system": {
                "python": platform.python_version(),
                "os": f"{platform.system()} {platform.release()}",
                "pg_version": _pg_version_short(),
            },
            "contents": {
                "database": True,
                "uploads": os.path.isdir("uploads"),
                "invoices": os.path.isdir("invoices"),
                "afip_certs": os.path.isdir("data/afip"),
                "whatsapp_session": os.path.isdir("whatsapp/auth_state"),
                "whatsapp_contacts": os.path.isfile("whatsapp/contacts_cache.json"),
            },
            "files_count": len(manifest_files),
            "files": manifest_files,
        }
        zipf.writestr("backup_manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))

    # Clean up temporary SQL dump
    if os.path.exists(sql_path):
        os.remove(sql_path)

    if is_auto:
        prune_old_auto_backups(max_keep=12)

    return backup_filename


def check_and_run_monthly_auto_backup():
    """Checks if a monthly automatic backup is due and runs it if needed."""
    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        now = datetime.now()

        auto_backups = []
        for f in os.listdir(BACKUP_DIR):
            if f.startswith("backup_auto_") and f.endswith(".zip"):
                filepath = os.path.join(BACKUP_DIR, f)
                stat = os.stat(filepath)
                auto_backups.append(datetime.fromtimestamp(stat.st_ctime))

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

@router.post("/create")
def create_backup():
    try:
        backup_filename = run_backup_dump(is_auto=False)
        return {"status": "success", "filename": backup_filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
def list_backups():
    if not os.path.exists(BACKUP_DIR):
        return []

    backups = []
    for f in os.listdir(BACKUP_DIR):
        if f.endswith('.zip'):
            filepath = os.path.join(BACKUP_DIR, f)
            stat = os.stat(filepath)
            b_type = "auto" if f.startswith("backup_auto_") else "manual"

            # Try to read manifest for contents summary
            contents = None
            try:
                with zipfile.ZipFile(filepath, 'r') as zf:
                    if "backup_manifest.json" in zf.namelist():
                        manifest = json.loads(zf.read("backup_manifest.json"))
                        contents = manifest.get("contents")
            except Exception:
                pass

            backups.append({
                "filename": f,
                "size_bytes": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                "type": b_type,
                "contents": contents,
            })

    backups.sort(key=lambda x: x["created_at"], reverse=True)
    return backups


@router.get("/contents/{filename}")
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


@router.get("/download/{filename}")
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


@router.post("/restore")
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

    # Find the SQL dump file
    sql_files = [n for n in names if n.endswith('.sql')]
    if not sql_files:
        os.remove(tmp_path)
        raise HTTPException(status_code=400,
                            detail="El backup no contiene un volcado de base de datos (.sql)")

    # --- 1. Pre-restore safety snapshot ---
    pre_restore_file = None
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

        # --- 5. Restore individual files ---
        extra_files = [
            ("whatsapp/contacts_cache.json", "whatsapp/contacts_cache.json"),
        ]
        for src_rel, dest_rel in extra_files:
            src_full = os.path.join(extract_dir, src_rel)
            if os.path.isfile(src_full):
                os.makedirs(os.path.dirname(dest_rel), exist_ok=True)
                shutil.copy2(src_full, dest_rel)
                restore_log["files_restored"].append(dest_rel)

        # --- 6. Restart services ---
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


@router.get("/disk-space")
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
