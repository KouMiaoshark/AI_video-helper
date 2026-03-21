"""
API Provider 抽象层
所有 AI 模型通过统一接口接入，支持热切换
"""

from abc import ABC, abstractmethod
from typing import Optional, AsyncIterator
from pydantic import BaseModel
import json
import os


# ==================== 数据模型 ====================

class ImageGenRequest(BaseModel):
    prompt: str
    negative_prompt: str = ""
    width: int = 1024
    height: int = 1024
    num_images: int = 1
    model: Optional[str] = None  # 具体模型名，None 用默认
    image_url: Optional[str] = None  # 参考图（图生图）
    image_urls: Optional[list[str]] = None  # 多张参考图（图生图，nano-banana-pro 支持1-9张）
    image_size: Optional[str] = None  # 分辨率：1K / 2K / 4K
    aspect_ratio: Optional[str] = None  # 比例：1:1, 16:9, 4:3 等


class ImageGenResponse(BaseModel):
    images: list[str]  # base64 或 URL
    model: str
    provider: str


class VideoGenRequest(BaseModel):
    prompt: str
    image_url: Optional[str] = None  # 图生视频时的参考图
    duration: int = 5  # 秒
    model: Optional[str] = None


class VideoGenResponse(BaseModel):
    video_url: str
    model: str
    provider: str


class ScriptGenRequest(BaseModel):
    topic: str
    style: str = "commercial"  # commercial / cinematic / social
    length: str = "short"  # short / medium / long
    model: Optional[str] = None


class ScriptGenResponse(BaseModel):
    script: str
    scenes: list[dict]  # [{scene_num, description, shot_type, duration}]
    model: str
    provider: str


class EnhanceRequest(BaseModel):
    image_url: str
    mode: str = "upscale"  # upscale / denoise / sharpen
    scale: int = 2


class EnhanceResponse(BaseModel):
    image_url: str
    provider: str


class AudioGenRequest(BaseModel):
    text: str
    voice: str = "default"
    model: Optional[str] = None


class AudioGenResponse(BaseModel):
    audio_url: str
    provider: str


# ==================== Provider 基类 ====================

class BaseProvider(ABC):
    """所有 Provider 的基类"""

    name: str = "base"
    supported_tasks: list[str] = []

    def __init__(self, api_key: str, base_url: str, **kwargs):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.config = kwargs

    @abstractmethod
    async def generate_image(self, req: ImageGenRequest) -> ImageGenResponse:
        ...

    async def generate_video(self, req: VideoGenRequest) -> VideoGenResponse:
        raise NotImplementedError(f"{self.name} 不支持视频生成")

    async def generate_script(self, req: ScriptGenRequest) -> ScriptGenResponse:
        raise NotImplementedError(f"{self.name} 不支持脚本生成")

    async def enhance_image(self, req: EnhanceRequest) -> EnhanceResponse:
        raise NotImplementedError(f"{self.name} 不支持图像增强")

    async def generate_audio(self, req: AudioGenRequest) -> AudioGenResponse:
        raise NotImplementedError(f"{self.name} 不支持音频生成")


# ==================== Provider 注册表 ====================

class ProviderRegistry:
    """管理所有可用的 Provider 实例"""

    def __init__(self):
        self._providers: dict[str, BaseProvider] = {}
        self._task_defaults: dict[str, str] = {}  # task -> provider_name

    def register(self, provider: BaseProvider):
        self._providers[provider.name] = provider
        print(f"[Registry] 注册 Provider: {provider.name}")

    def set_default(self, task: str, provider_name: str):
        self._task_defaults[task] = provider_name

    def get_provider(self, task: str) -> BaseProvider:
        name = self._task_defaults.get(task)
        if not name:
            raise ValueError(f"没有为任务 '{task}' 配置默认 Provider")
        if name not in self._providers:
            raise ValueError(f"Provider '{name}' 未注册")
        return self._providers[name]

    def list_providers(self) -> list[dict]:
        return [
            {"name": p.name, "supported_tasks": p.supported_tasks}
            for p in self._providers.values()
        ]

    def list_tasks(self) -> dict:
        return dict(self._task_defaults)


# 全局注册表
registry = ProviderRegistry()


# ==================== 配置加载 ====================

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "config", "providers.json")


def load_config():
    """从 providers.json 加载配置并注册 Provider"""
    if not os.path.exists(CONFIG_PATH):
        print(f"[Config] 配置文件不存在: {CONFIG_PATH}，跳过加载")
        return

    with open(CONFIG_PATH, "r") as f:
        config = json.load(f)

    # 动态导入 provider 类
    provider_classes = {}
    try:
        from app.providers.openai_compatible import OpenAICompatibleProvider
        provider_classes["openai_compatible"] = OpenAICompatibleProvider
    except ImportError:
        pass
    try:
        from app.providers.anthropic_compatible import AnthropicCompatibleProvider
        provider_classes["anthropic_compatible"] = AnthropicCompatibleProvider
    except ImportError:
        pass
    try:
        from app.providers.bltcy_provider import BltcyProvider
        provider_classes["bltcy"] = BltcyProvider
    except ImportError:
        pass

    for name, settings in config.get("providers", {}).items():
        cls_name = settings.get("type", "openai_compatible")
        cls = provider_classes.get(cls_name)
        if cls:
            provider = cls(
                name=name,
                api_key=settings.get("api_key", ""),
                base_url=settings.get("base_url", ""),
                default_model=settings.get("default_model", ""),
            )
            registry.register(provider)

    for task, provider_name in config.get("defaults", {}).items():
        registry.set_default(task, provider_name)

    print(f"[Config] 加载了 {len(registry._providers)} 个 Provider")
