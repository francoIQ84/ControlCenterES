import os
import shutil
import time
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from pydantic import BaseModel

from src import tenancy

router = APIRouter()

# Raíz de todo lo subido. Se sigue sirviendo entera como estático en
# /uploads, porque las URLs de imágenes de productos, logos y artículos del
# blog apuntan ahí y están guardadas en la base.
UPLOAD_DIR = Path("uploads").resolve()

#: Carpeta bajo la cual vive el material de cada inquilino que no es el
#: Maestro: uploads/t/{tenant_id}/...
TENANT_SUBDIR = "t"


def get_tenant_root() -> Path:
    """Raíz del gestor de archivos para el inquilino activo.

    El Tenant Maestro se queda en `uploads/` a secas y NO se migra a una
    subcarpeta: las rutas de sus imágenes ya están escritas en products_cache,
    web_config y blog_posts. Moverlas rompería el catálogo y la web pública de
    la operación que hoy está andando.

    Los demás inquilinos viven cada uno en `uploads/t/{tenant_id}/`, que es lo
    que impide que el explorador de archivos de uno liste, mueva o borre los
    archivos de otro.
    """
    tenant_id = tenancy.get_current_tenant_id()
    if tenant_id == tenancy.MASTER_TENANT_ID:
        return UPLOAD_DIR

    root = (UPLOAD_DIR / TENANT_SUBDIR / tenant_id).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def get_safe_path(relative_path: str = "") -> Path:
    """Resuelve una ruta relativa dentro del espacio del inquilino activo.

    La comprobación se hace contra la raíz del inquilino, no contra
    `uploads/`: si se hiciera contra `uploads/` un `../` bien puesto llevaría
    a la carpeta de otro negocio y la validación lo daría por bueno.

    También se cambió `startswith` por comparación de rutas reales. Con
    `startswith`, un directorio hermano llamado `uploads_backup` pasaba el
    control por ser prefijo de texto de `uploads`.
    """
    root = get_tenant_root()
    clean_rel = (relative_path or "").replace("\\", "/").strip("/")
    target = (root / clean_rel).resolve()

    try:
        target.relative_to(root)
    except ValueError:
        raise HTTPException(
            status_code=403,
            detail="Acceso denegado: Ruta fuera de límites permitidos.")
    return target


def to_public_url(absolute: Path) -> str:
    """URL pública de un archivo, relativa al montaje estático /uploads."""
    return "/uploads/" + os.path.relpath(absolute, UPLOAD_DIR).replace("\\", "/")


def to_browser_path(absolute: Path, root: Path = None) -> str:
    """Ruta tal como la maneja el explorador: relativa a la raíz del inquilino.

    Es la que viaja en `path` de vuelta a la API, así que tiene que estar
    expresada en el mismo marco que espera `get_safe_path`.

    `root` se puede pasar para no resolverlo de nuevo en cada elemento de un
    listado: `get_tenant_root()` crea el directorio si falta, y hacer ese
    syscall una vez por archivo no tiene ningún sentido.
    """
    return os.path.relpath(absolute, root or get_tenant_root()).replace("\\", "/")

class FolderRequest(BaseModel):
    name: str
    path: str = ""

class MoveRequest(BaseModel):
    source_path: str
    target_path: str = ""

@router.get("/list")
def list_media(path: str = ""):
    target_dir = get_safe_path(path)
    
    if not target_dir.exists():
        raise HTTPException(status_code=404, detail="El directorio especificado no existe.")
    if not target_dir.is_dir():
        raise HTTPException(status_code=400, detail="La ruta especificada no es un directorio.")
        
    directories = []
    files = []
    root = get_tenant_root()
    is_master_root = (target_dir == UPLOAD_DIR)

    for entry in os.scandir(target_dir):
        # `uploads/t` es el contenedor de los demás inquilinos. El Maestro
        # tiene su material en la raíz, así que sin este salto vería —y podría
        # borrar— las carpetas de todos sus clientes desde el explorador.
        if is_master_root and entry.is_dir() and entry.name == TENANT_SUBDIR:
            continue

        rel_path = to_browser_path(Path(entry.path), root)
        if entry.is_dir():
            directories.append({
                "name": entry.name,
                "path": rel_path
            })
        elif entry.is_file():
            # Get stats
            stat = entry.stat()
            mtime = datetime.fromtimestamp(stat.st_mtime).isoformat()
            size = stat.st_size
            
            # Check allowed file types
            lower_name = entry.name.lower()
            is_image = lower_name.endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'))
            is_video = lower_name.endswith(('.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'))
            is_pdf = lower_name.endswith('.pdf')
            is_doc = lower_name.endswith(('.doc', '.docx', '.zip', '.txt'))
            
            if is_image or is_video or is_pdf or is_doc:
                file_type = "image" if is_image else ("video" if is_video else ("pdf" if is_pdf else "document"))
                files.append({
                    "name": entry.name,
                    "path": rel_path,
                    "url": to_public_url(Path(entry.path)),
                    "size": size,
                    "date": mtime,
                    "file_type": file_type
                })
                
    # Sort files by modification date (newest first)
    files.sort(key=lambda x: x['date'], reverse=True)
    # Sort directories alphabetically
    directories.sort(key=lambda x: x['name'].lower())
    
    return {
        "current_path": path.strip("/"),
        "directories": directories,
        "files": files
    }

@router.post("/folder")
def create_folder(payload: FolderRequest):
    # Validate folder name
    clean_name = "".join(c for c in payload.name if c.isalnum() or c in (' ', '-', '_')).strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Nombre de carpeta inválido.")
        
    target_dir = get_safe_path(payload.path)
    new_folder = target_dir / clean_name
    
    if new_folder.exists():
        raise HTTPException(status_code=400, detail="La carpeta ya existe.")
        
    try:
        new_folder.mkdir(parents=True, exist_ok=True)
        return {"success": True, "message": f"Carpeta '{clean_name}' creada con éxito"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al crear carpeta: {str(e)}")

@router.post("/upload")
async def upload_file(path: str = "", file: UploadFile = File(...)):
    # Validate allowed extensions
    allowed_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v', '.pdf', '.doc', '.docx', '.zip', '.txt')
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Tipo de archivo no permitido. Solo se permiten imágenes, videos (mp4, mov, webm, avi), PDF y documentos.")
        
    target_dir = get_safe_path(path)
    # Ensure directory exists
    target_dir.mkdir(parents=True, exist_ok=True)
    
    # Save file with safe name
    safe_filename = "".join(c for c in file.filename if c.isalnum() or c in ('.', '-', '_')).strip()
    dest_path = target_dir / safe_filename
    
    # Append timestamp if file already exists to prevent overwriting
    if dest_path.exists():
        name, extension = os.path.splitext(safe_filename)
        safe_filename = f"{name}_{int(time.time())}{extension}"
        dest_path = target_dir / safe_filename
        
    try:
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return {
            "success": True,
            "filename": safe_filename,
            "url": to_public_url(dest_path)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar archivo: {str(e)}")

@router.delete("/delete")
def delete_item(path: str = Query(...)):
    target = get_safe_path(path)
    
    if not target.exists():
        raise HTTPException(status_code=404, detail="El archivo o carpeta no existe.")
        
    try:
        if target.is_dir():
            shutil.rmtree(target)
            msg = "Carpeta borrada"
        else:
            target.unlink()
            msg = "Archivo borrado"
        return {"success": True, "message": msg}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al borrar: {str(e)}")

@router.post("/move")
def move_item(payload: MoveRequest):
    source = get_safe_path(payload.source_path)
    target_dir = get_safe_path(payload.target_path)
    
    if not source.exists():
        raise HTTPException(status_code=404, detail="El archivo o carpeta de origen no existe.")
    if not target_dir.exists() or not target_dir.is_dir():
        raise HTTPException(status_code=400, detail="La carpeta de destino no existe.")
        
    dest = target_dir / source.name
    if dest.resolve() == source.resolve():
        return {"success": True, "message": "El elemento ya está en esa ubicación."}
        
    # Prevent moving directory into itself or its children
    if source.is_dir() and str(dest.resolve()).startswith(str(source.resolve())):
        raise HTTPException(status_code=400, detail="No se puede mover una carpeta dentro de sí misma.")
    
    # If destination already exists, rename with timestamp
    if dest.exists():
        stem = dest.stem
        suffix = dest.suffix
        dest = target_dir / f"{stem}_{int(time.time())}{suffix}"
        
    try:
        shutil.move(str(source), str(dest))
        return {"success": True, "message": f"'{source.name}' movido con éxito"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al mover: {str(e)}")

