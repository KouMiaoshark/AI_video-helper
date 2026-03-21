"""
OpenAI 兼容 Provider
适用于：SiliconFlow, DeepSeek, Groq, OpenRouter, 智谱, 以及任何 OpenAI 兼容 API
"""

import httpx
import base64
from typing import Optional

from app.providers.base import (
    BaseProvider,
    ImageGenRequest, ImageGenResponse,
    VideoGenRequest, VideoGenResponse,
    ScriptGenRequest, ScriptGenResponse,
    EnhanceRequest, EnhanceResponse,
    AudioGenRequest, AudioGenResponse,
)


class OpenAICompatibleProvider(BaseProvider):
    """
    通用 OpenAI 兼容 Provider
    支持文生图、文生脚本等功能
    """

    name = "openai_compatible"
    supported_tasks = ["image", "script", "enhance"]

    def __init__(self, name: str = "openai_compatible", api_key: str = "",
                 base_url: str = "", default_model: str = "", **kwargs):
        super().__init__(api_key, base_url, **kwargs)
        self.name = name
        self.default_model = default_model

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def _chat(self, messages: list[dict], model: Optional[str] = None,
                    temperature: float = 0.7, max_tokens: int = 4096) -> str:
        """通用 Chat Completion 调用"""
        model = model or self.default_model
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions",
                headers=self._headers(),
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]

    async def generate_image(self, req: ImageGenRequest) -> ImageGenResponse:
        """
        文生图：通过 OpenAI 兼容的图像生成 API
        使用 /images/generations 端点（标准格式）
        """
        model = req.model or self.default_model

        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.post(
                f"{self.base_url}/images/generations",
                headers=self._headers(),
                json={
                    "model": model,
                    "prompt": req.prompt,
                    "negative_prompt": req.negative_prompt,
                    "n": req.num_images,
                    "size": f"{req.width}x{req.height}",
                    "response_format": "b64_json",
                },
            )
            resp.raise_for_status()
            data = resp.json()

            # 从响应中提取图片
            seen = set()
            images = []
            for item in data.get("data", []):
                img = None
                if "b64_json" in item:
                    img = f"data:image/png;base64,{item['b64_json']}"
                elif "url" in item:
                    img = item["url"]
                if img and img not in seen:
                    seen.add(img)
                    images.append(img)

            # 如果 data 为空但有 choices（部分兼容 API 的返回格式），尝试从 choices 提取
            if not images and "choices" in data:
                import re
                content = data["choices"][0]["message"]["content"]
                url_patterns = [
                    r'https?://[^\s]+?\.(?:jpg|jpeg|png|gif|bmp|webp)(?:\?[^\s]*)?',
                    r'https?://[^\s]+?/image/[^\s]+',
                    r'https?://[^\s]*?(?:format=\.(?:jpg|jpeg|png|gif|webp))[^\s]*',
                ]
                for pattern in url_patterns:
                    for m in re.findall(pattern, content, re.IGNORECASE):
                        if m not in seen:
                            seen.add(m)
                            images.append(m)

                b64_pattern = r'data:image/(?:png|jpeg|jpg|gif);base64,([A-Za-z0-9+/=]+)'
                for b64 in re.findall(b64_pattern, content):
                    img = f"data:image/png;base64,{b64}"
                    if img not in seen:
                        seen.add(img)
                        images.append(img)

            if not images:
                raise Exception(f"API 未返回图片。响应: {str(data)[:300]}")

            return ImageGenResponse(
                images=images,
                model=model,
                provider=self.name,
            )

    async def generate_script(self, req: ScriptGenRequest) -> ScriptGenResponse:
        """脚本生成：通过 LLM 生成分镜脚本"""
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

        response_text = await self._chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.8,
        )

        # 解析 JSON 响应
        import json
        try:
            # 尝试提取 JSON（可能被 markdown 包裹）
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

    async def enhance_image(self, req: EnhanceRequest) -> EnhanceResponse:
        """
        图像增强：通过图像处理 API 或模型实现
        这里预留接口，具体实现取决于底层模型
        """
        # TODO: 接入具体的图像增强模型
        # 可以接入 Real-ESRGAN、CodeFormer 等
        return EnhanceResponse(
            image_url=req.image_url,
            provider=self.name,
        )

    async def generate_audio(self, req: AudioGenRequest) -> AudioGenResponse:
        """
        音频生成：通过 TTS API 实现
        """
        # TODO: 接入 TTS API
        raise NotImplementedError("音频生成功能待实现")
