"""
Anthropic Messages API 兼容 Provider
适用于：Nova AI (novai.su) 等使用 Anthropic API 格式的服务
"""

import httpx
import json
from typing import Optional

from app.providers.base import (
    BaseProvider,
    ImageGenRequest, ImageGenResponse,
    ScriptGenRequest, ScriptGenResponse,
)


class AnthropicCompatibleProvider(BaseProvider):
    """
    Anthropic Messages API 兼容 Provider
    支持文本生成（脚本生成等）
    """

    name = "anthropic_compatible"
    supported_tasks = ["script"]

    def __init__(self, name: str = "anthropic_compatible", api_key: str = "",
                 base_url: str = "", default_model: str = "", **kwargs):
        super().__init__(api_key, base_url, **kwargs)
        self.name = name
        self.default_model = default_model

    def _headers(self) -> dict:
        return {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }

    async def _messages(self, messages: list[dict], model: Optional[str] = None,
                        max_tokens: int = 4096, temperature: float = 0.7) -> str:
        """Anthropic Messages API 调用"""
        model = model or self.default_model
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{self.base_url}/v1/messages",
                headers=self._headers(),
                json={
                    "model": model,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "messages": messages,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            # Anthropic 响应格式: {"content": [{"type": "text", "text": "..."}]}
            for block in data.get("content", []):
                if block.get("type") == "text":
                    return block["text"]
            return ""

    async def generate_script(self, req: ScriptGenRequest) -> ScriptGenResponse:
        """脚本生成：通过 Anthropic Messages API"""
        style_map = {
            "commercial": "商业广告",
            "cinematic": "电影短片",
            "social": "社交媒体短视频",
        }
        length_map = {
            "short": "3-5个镜头，每个镜头5-10秒",
            "medium": "8-12个镜头，每个镜头5-15秒",
            "long": "15-25个镜头，每个镜头5-20秒",
        }

        prompt = f"""你是一位专业的视频脚本创作者。请为以下主题创作一个{style_map.get(req.style, '视频')}脚本。

主题：{req.topic}
风格：{style_map.get(req.style, req.style)}
长度要求：{length_map.get(req.length, req.length)}

请以 JSON 格式返回，结构如下：
{{
  "script": "完整的脚本文本（包含旁白、对话等）",
  "scenes": [
    {{
      "scene_num": 1,
      "description": "场景描述（画面内容）",
      "shot_type": "镜头类型（如：远景、中景、近景、特写）",
      "duration": 8,
      "camera_movement": "镜头运动（如：固定、平移、推拉）",
      "dialogue": "旁白或对话文本",
      "transition": "转场方式（如：切、淡入淡出、闪白）"
    }}
  ]
}}

只返回 JSON，不要其他内容。"""

        response_text = await self._messages(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.8,
        )

        try:
            text = response_text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                if text.endswith("```"):
                    text = text[:-3]
                text = text.strip()
            data = json.loads(text)
        except json.JSONDecodeError:
            data = {
                "script": response_text,
                "scenes": [{"scene_num": 1, "description": response_text,
                           "shot_type": "中景", "duration": 10}],
            }

        model = req.model or self.default_model
        return ScriptGenResponse(
            script=data.get("script", ""),
            scenes=data.get("scenes", []),
            model=model,
            provider=self.name,
        )

    async def generate_image(self, req: ImageGenRequest) -> ImageGenResponse:
        """
        图像生成：Anthropic 格式不原生支持图像生成
        如果 Nova AI 有专门的图像端点，需要单独实现
        """
        raise NotImplementedError(f"{self.name} 不支持图像生成（Anthropic API 格式不支持此功能）")
