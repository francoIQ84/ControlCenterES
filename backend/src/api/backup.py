import os
import shutil
import zipfile
import subprocess
from datetime import datetime
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter()

BACKUP_DIR = "backups"

def get_db_url():
    from src.database import DB_URL
    return DB_URL

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
        
    with zipfile.ZipFile(backup_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        zipf.write(sql_path, arcname=sql_filename)
        
        if os.path.exists(".env"):
            zipf.write(".env", arcname=".env")
            
        if os.path.exists("uploads"):
            for root, dirs, files in os.walk("uploads"):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.join("uploads", os.path.relpath(file_path, "uploads"))
                    zipf.write(file_path, arcname=arcname)
                    
        if os.path.exists("invoices"):
            for root, dirs, files in os.walk("invoices"):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.join("invoices", os.path.relpath(file_path, "invoices"))
                    zipf.write(file_path, arcname=arcname)
                    
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
            backups.append({
                "filename": f,
                "size_bytes": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                "type": b_type
            })
            
    backups.sort(key=lambda x: x["created_at"], reverse=True)
    return backups

@router.get("/download/{filename}")
def download_backup(filename: str):
    filepath = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(filepath) or not filename.endswith('.zip'):
        raise HTTPException(status_code=404, detail="Backup not found")
        
    return FileResponse(
        path=filepath, 
        filename=filename, 
        media_type='application/zip'
    )

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
