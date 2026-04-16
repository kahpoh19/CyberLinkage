"""个人信息路由"""

import os
import shutil
from datetime import datetime
from typing import List, Optional
from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.user import User, UserDocument
from routers.auth import require_user

router = APIRouter(prefix="/api/profile", tags=["个人信息"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
AVATAR_DIR = os.path.join(UPLOAD_DIR, "avatars")
DOC_DIR = os.path.join(UPLOAD_DIR, "documents")
def _avatar_path(user: User) -> Path | None:
    if not user.avatar:
        return None
    # user.avatar 形如 /uploads/avatars/xxx.png
    return Path(__file__).resolve().parents[1] / user.avatar.lstrip("/")

os.makedirs(AVATAR_DIR, exist_ok=True)
os.makedirs(DOC_DIR, exist_ok=True)


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    role: Optional[str] = None

class ProfileResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    display_name: Optional[str]
    avatar: Optional[str]
    font_size: int = 14
    font_family: str = "default"
    theme: str = "light"

    class Config:
        from_attributes = True


class DocumentItem(BaseModel):
    id: int
    filename: str
    filepath: str
    uploaded_at: datetime

    class Config:
        from_attributes = True


def _serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "display_name": user.display_name,
        "avatar": user.avatar,
        "font_size": getattr(user, "font_size", 14) or 14,
        "font_family": getattr(user, "font_family", "default") or "default",
        "theme": getattr(user, "theme", "light") or "light",
    }


@router.get("/me", response_model=ProfileResponse)
def get_profile(user: User = Depends(require_user)):
    return _serialize_user(user)


@router.patch("/me", response_model=ProfileResponse)
def update_profile(
    req: ProfileUpdate,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    if req.display_name is not None:
        user.display_name = req.display_name
    if req.role in ("student", "teacher"):
        user.role = req.role

    db.commit()
    db.refresh(user)
    return _serialize_user(user)


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
        raise HTTPException(400, "只支持图片格式")

    filename = f"{user.id}_{int(datetime.utcnow().timestamp())}{ext}"
    filepath = os.path.join(AVATAR_DIR, filename)

    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    user.avatar = f"/uploads/avatars/{filename}"
    db.commit()
    db.refresh(user)
    return {"avatar": user.avatar}

@router.delete("/avatar")
def delete_avatar(
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    if not user.avatar:
        raise HTTPException(404, "当前没有头像")

    avatar_path = _avatar_path(user)
    if avatar_path and avatar_path.exists():
        avatar_path.unlink()

    user.avatar = None
    db.commit()
    db.refresh(user)
    return {"ok": True}

@router.post("/documents", response_model=DocumentItem)
async def upload_document(
    file: UploadFile = File(...),
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    filename = f"{user.id}_{int(datetime.utcnow().timestamp())}_{file.filename}"
    filepath = os.path.join(DOC_DIR, filename)

    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    doc = UserDocument(
        user_id=user.id,
        filename=file.filename,
        filepath=f"/uploads/documents/{filename}",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/documents", response_model=List[DocumentItem])
def get_documents(
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    return db.query(UserDocument).filter(
        UserDocument.user_id == user.id
    ).order_by(UserDocument.uploaded_at.desc()).all()


@router.delete("/documents/{doc_id}")
def delete_document(
    doc_id: int,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    doc = db.query(UserDocument).filter(
        UserDocument.id == doc_id,
        UserDocument.user_id == user.id,
    ).first()
    if not doc:
        raise HTTPException(404, "文件不存在")
    if os.path.exists(doc.filepath.lstrip("/")):
        os.remove(doc.filepath.lstrip("/"))
    db.delete(doc)
    db.commit()
    return {"ok": True}