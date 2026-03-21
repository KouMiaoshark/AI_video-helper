"""
Config API 路由
查看和管理 Provider 配置
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import json
import os

from app.providers.base import registry, load_config, CONFIG_PATH

router = APIRouter()


@router.get("/providers")
async def list_providers():
    """列出所有已注册的 Provider"""
    return {
        "providers": registry.list_providers(),
        "defaults": registry.list_tasks(),
    }


@router.get("/status")
async def config_status():
    """配置文件状态"""
    return {
        "config_path": os.path.abspath(CONFIG_PATH),
        "exists": os.path.exists(CONFIG_PATH),
        "providers_count": len(registry._providers),
    }


@router.get("/raw")
async def get_raw_config():
    """获取原始配置内容（用于前端填充表单）"""
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r") as f:
            return json.load(f)
    return {
        "providers": {},
        "defaults": {
            "image": "",
            "video": "",
            "script": "",
            "enhance": "",
            "audio": "",
        }
    }


class ProviderConfig(BaseModel):
    type: str = "openai_compatible"
    api_key: str
    base_url: str
    default_model: str = ""


class ConfigUpdate(BaseModel):
    providers: Optional[dict[str, ProviderConfig]] = None
    defaults: Optional[dict[str, str]] = None


@router.post("/update")
async def update_config(update: ConfigUpdate):
    """更新配置（写入 providers.json 并重新加载）"""
    # 读取现有配置
    existing = {"providers": {}, "defaults": {}}
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r") as f:
            existing = json.load(f)

    # 合并更新
    if update.providers:
        for name, cfg in update.providers.items():
            existing["providers"][name] = cfg.model_dump()
    if update.defaults:
        existing["defaults"].update(update.defaults)

    # 写入
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        json.dump(existing, f, indent=2, ensure_ascii=False)

    # 重新加载
    registry._providers.clear()
    registry._task_defaults.clear()
    load_config()

    return {"status": "updated", "providers": registry.list_providers()}


@router.post("/reload")
async def reload_config():
    """重新加载配置文件"""
    registry._providers.clear()
    registry._task_defaults.clear()
    load_config()
    return {"status": "reloaded", "providers": registry.list_providers()}
