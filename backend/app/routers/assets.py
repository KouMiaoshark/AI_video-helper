"""
图片资产保存接口
将生成的图片保存到本地 "所有图片资产" 文件夹
支持收藏、删除、列出
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
import os
import uuid
import json
import httpx
from datetime import datetime

router = APIRouter()

# 图片资产目录
ASSETS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "所有图片资产")
FAVORITES_FILE = os.path.join(os.path.dirname(__file__), "..", "..", ".favorites.json")


class SaveImageRequest(BaseModel):
    image_url: str
    prompt: str = ""
    model: str = ""


class FavoritesRequest(BaseModel):
    favorites: List[str]


def _load_favorites() -> List[str]:
    if os.path.isfile(FAVORITES_FILE):
        try:
            with open(FAVORITES_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return []


def _save_favorites(favs: List[str]):
    with open(FAVORITES_FILE, "w", encoding="utf-8") as f:
        json.dump(favs, f, ensure_ascii=False)


@router.post("/save-image")
async def save_image(req: SaveImageRequest):
    """将图片 URL 下载并保存到本地资产文件夹"""
    os.makedirs(ASSETS_DIR, exist_ok=True)

    # 生成文件名：日期_随机ID
    date_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    short_id = uuid.uuid4().hex[:6]
    filename = f"{date_str}_{short_id}.png"
    filepath = os.path.join(ASSETS_DIR, filename)

    # 下载图片（支持 http URL 和 data URI）
    try:
        if req.image_url.startswith("data:"):
            # data URI: 直接解码 base64
            import base64
            header, data = req.image_url.split(",", 1)
            img_bytes = base64.b64decode(data)
            with open(filepath, "wb") as f:
                f.write(img_bytes)
        else:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.get(req.image_url)
                resp.raise_for_status()
                with open(filepath, "wb") as f:
                    f.write(resp.content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存图片失败: {str(e)}")

    # 返回本地访问 URL
    local_url = f"/api/assets/{filename}"

    return {
        "filename": filename,
        "path": filepath,
        "local_url": local_url,
        "prompt": req.prompt,
        "model": req.model,
    }


@router.get("/assets/{filename}")
async def get_asset(filename: str):
    """获取已保存的图片资产"""
    filepath = os.path.join(ASSETS_DIR, filename)
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="图片不存在")
    return FileResponse(filepath)


@router.delete("/assets/{filename}")
async def delete_asset(filename: str):
    """删除资产文件"""
    filepath = os.path.join(ASSETS_DIR, filename)
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="资产不存在")
    os.remove(filepath)
    # 同时从收藏中移除
    favs = _load_favorites()
    if filename in favs:
        favs.remove(filename)
        _save_favorites(favs)
    return {"deleted": filename}


@router.get("/assets")
async def list_assets():
    """列出所有已保存的图片资产"""
    os.makedirs(ASSETS_DIR, exist_ok=True)
    files = []
    for fn in sorted(os.listdir(ASSETS_DIR), reverse=True):
        full = os.path.join(ASSETS_DIR, fn)
        if os.path.isfile(full):
            files.append({
                "filename": fn,
                "url": f"/api/assets/{fn}",
                "size": os.path.getsize(full),
                "modified": os.path.getmtime(full),
            })
    return {"assets": files, "total": len(files)}


@router.get("/favorites")
async def get_favorites():
    """获取收藏列表"""
    return {"favorites": _load_favorites()}


@router.post("/favorites")
async def update_favorites(req: FavoritesRequest):
    """更新收藏列表"""
    _save_favorites(req.favorites)
    return {"favorites": req.favorites}
