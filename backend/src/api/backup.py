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

@router.post("/create")
def create_backup():
    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"backup_{timestamp}.zip"
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
            backups.append({
                "filename": f,
                "size_bytes": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat()
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
