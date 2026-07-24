from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import re
from src import database
from src.api.auth import verify_session, require_permission

router = APIRouter()

class BlogPostReq(BaseModel):
    title: str
    slug: Optional[str] = None
    category: Optional[str] = "General"
    summary: Optional[str] = ""
    content: str
    cover_image: Optional[str] = ""
    published_at: Optional[str] = None
    is_published: Optional[int] = 1
    author: Optional[str] = "Equipo Hidroponia Rosario"

def generate_slug(text: str) -> str:
    slug = text.lower()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'[\s-]+', '-', slug).strip('-')
    return slug or "articulo"

@router.get("")
def list_blog_posts(_=Depends(verify_session)):
    return database.get_all_blog_posts(is_published_only=False)

@router.get("/{post_id}")
def get_blog_post(post_id: int, _=Depends(verify_session)):
    post = database.get_blog_post_by_id(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Artículo no encontrado")
    return post

@router.post("")
def create_blog_post(req: BlogPostReq, _=Depends(verify_session), _2=Depends(require_permission("settings"))):
    slug = req.slug.strip() if req.slug and req.slug.strip() else generate_slug(req.title)
    
    # Check if slug exists
    existing = database.get_blog_post_by_slug(slug)
    if existing:
        import time
        slug = f"{slug}-{int(time.time())}"
        
    created = database.create_blog_post(
        title=req.title.strip(),
        slug=slug,
        category=req.category.strip() if req.category else "General",
        summary=req.summary.strip() if req.summary else "",
        content=req.content.strip(),
        cover_image=req.cover_image.strip() if req.cover_image else "",
        published_at=req.published_at,
        is_published=req.is_published if req.is_published is not None else 1,
        author=req.author.strip() if req.author else "Equipo Hidroponia Rosario"
    )
    return created

@router.put("/{post_id}")
def update_blog_post(post_id: int, req: BlogPostReq, _=Depends(verify_session), _2=Depends(require_permission("settings"))):
    existing = database.get_blog_post_by_id(post_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Artículo no encontrado")
        
    slug = req.slug.strip() if req.slug and req.slug.strip() else generate_slug(req.title)
    
    updated = database.update_blog_post(
        post_id=post_id,
        title=req.title.strip(),
        slug=slug,
        category=req.category.strip() if req.category else "General",
        summary=req.summary.strip() if req.summary else "",
        content=req.content.strip(),
        cover_image=req.cover_image.strip() if req.cover_image else "",
        published_at=req.published_at,
        is_published=req.is_published if req.is_published is not None else 1,
        author=req.author.strip() if req.author else "Equipo Hidroponia Rosario"
    )
    return updated

@router.delete("/{post_id}")
def delete_blog_post(post_id: int, _=Depends(verify_session), _2=Depends(require_permission("settings"))):
    existing = database.get_blog_post_by_id(post_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Artículo no encontrado")
    database.delete_blog_post(post_id)
    return {"status": "ok", "message": "Artículo eliminado"}
