"""
文件上传路由
处理图片等资源的上传和访问
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
import os
import uuid
import shutil

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """上传文件，返回可访问的 URL"""
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    # 生成唯一文件名
    ext = os.path.splitext(file.filename)[1] if file.filename else ".png"
    filename = f"{uuid.uuid4().hex[:12]}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    return {
        "filename": filename,
        "url": f"/api/uploads/{filename}",
        "size": os.path.getsize(filepath),
    }


@router.get("/uploads/{filename}")
async def get_uploaded_file(filename: str):
    """获取上传的文件"""
    filepath = os.path.join(UPLOAD_DIR, filename)
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath)
