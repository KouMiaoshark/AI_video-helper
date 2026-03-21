"""
TapNow Clone - Backend API Server
AI 视觉内容创作平台，支持多种 AI 模型提供商
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
import os

from app.routers import generation, config as config_router, upload as upload_router, assets as assets_router
from app.providers.base import load_config

app = FastAPI(
    title="TapNow Clone API",
    description="AI 视觉内容创作平台后端",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(generation.router, prefix="/api/generate", tags=["generation"])
app.include_router(config_router.router, prefix="/api/config", tags=["config"])
app.include_router(upload_router.router, prefix="/api", tags=["upload"])
app.include_router(assets_router.router, prefix="/api", tags=["assets"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


# Tapnow Studio 静态页面
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
VENDOR_DIR = os.path.join(STATIC_DIR, "vendor")

@app.get("/tapnow-studio.html")
async def serve_tapnow_studio():
    path = os.path.join(STATIC_DIR, "tapnow-studio.html")
    if os.path.isfile(path):
        return FileResponse(path, media_type="text/html")
    return {"error": "tapnow-studio.html not found"}

# Vendor 静态资源（本地化的 CDN 依赖）
if os.path.isdir(VENDOR_DIR):
    app.mount("/vendor", StaticFiles(directory=VENDOR_DIR), name="vendor")

# 托管前端静态文件
FRONTEND_DIST = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist"))

if os.path.isdir(FRONTEND_DIST):
    # 所有非 /api 的请求返回前端 index.html（SPA 路由）
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))

    print(f"[Frontend] 托管静态文件: {FRONTEND_DIST}")
else:
    print(f"[Frontend] 未找到前端构建产物: {FRONTEND_DIST}")
    print("[Frontend] 请先运行: cd frontend && npm run build")


@app.on_event("startup")
async def startup():
    load_config()


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000)
