"""
Generation API 路由
统一封装所有生成任务的 HTTP 接口
支持 per-request provider 选择
"""

from fastapi import APIRouter, HTTPException
from typing import Optional
from app.providers.base import (
    registry,
    ImageGenRequest, ImageGenResponse,
    VideoGenRequest, VideoGenResponse,
    ScriptGenRequest, ScriptGenResponse,
    EnhanceRequest, EnhanceResponse,
    AudioGenRequest, AudioGenResponse,
)

router = APIRouter()


def _get_provider(task: str, provider_name: Optional[str] = None):
    """获取 Provider，支持指定名称或使用默认"""
    if provider_name and provider_name in registry._providers:
        return registry._providers[provider_name]
    return registry.get_provider(task)


@router.post("/image", response_model=ImageGenResponse)
async def generate_image(req: ImageGenRequest, provider: Optional[str] = None):
    """文生图"""
    try:
        p = _get_provider("image", provider)
        return await p.generate_image(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/video", response_model=VideoGenResponse)
async def generate_video(req: VideoGenRequest, provider: Optional[str] = None):
    """文生视频 / 图生视频"""
    try:
        p = _get_provider("video", provider)
        return await p.generate_video(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/script", response_model=ScriptGenResponse)
async def generate_script(req: ScriptGenRequest, provider: Optional[str] = None):
    """脚本生成"""
    try:
        p = _get_provider("script", provider)
        return await p.generate_script(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/enhance", response_model=EnhanceResponse)
async def enhance_image(req: EnhanceRequest, provider: Optional[str] = None):
    """图像增强"""
    try:
        p = _get_provider("enhance", provider)
        return await p.enhance_image(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/audio", response_model=AudioGenResponse)
async def generate_audio(req: AudioGenRequest, provider: Optional[str] = None):
    """音频生成"""
    try:
        p = _get_provider("audio", provider)
        return await p.generate_audio(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
