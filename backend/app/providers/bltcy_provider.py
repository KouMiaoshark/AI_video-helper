"""
Bltcy.ai 兼容 Provider
适用于 https://api.bltcy.ai
- 图像: nano-banana-2, nano-banana-pro, flux-1.1-pro, sdxl 等
- 音频: tts-1, tts-1-hd (OpenAI 兼容 /v1/audio/speech)
参考文档：https://wiki.bltcy.ai
"""

import httpx
import re
import base64
import json
from typing import Optional

from app.providers.base import (
    BaseProvider,
    ImageGenRequest, ImageGenResponse,
    AudioGenRequest, AudioGenResponse,
)


class BltcyProvider(BaseProvider):

    name = "bltcy"
    supported_tasks = ["image", "audio"]

    # 图像模型
    IMAGE_MODELS = ["gpt-image-2", "nano-banana-2", "nano-banana-pro", "flux-1.1-pro", "sdxl", "dall-e-3"]
    # 音频模型
    AUDIO_MODELS = ["tts-1", "tts-1-hd"]
    # 所有模型
    MODELS = IMAGE_MODELS + AUDIO_MODELS

    def __init__(self, name: str = "bltcy", api_key: str = "",
                 base_url: str = "", default_model: str = "", **kwargs):
        super().__init__(api_key, base_url, **kwargs)
        self.name = name
        self.default_model = default_model or "nano-banana-pro"

    @staticmethod
    def _extract_images(data: dict) -> list[str]:
        """从 API 响应中提取图片 URL/base64，兼容多种格式"""
        seen = set()
        images = []

        # 格式 1: OpenAI 标准 — data[].url / data[].b64_json
        for item in data.get("data", []):
            img = item.get("url") or (f"data:image/png;base64,{item['b64_json']}" if "b64_json" in item else None)
            if img and img not in seen:
                seen.add(img)
                images.append(img)

        # 格式 2: 直接 images 数组 — images[].url 或 images[]
        if not images:
            for item in data.get("images", []):
                img = item.get("url") if isinstance(item, dict) else item
                if isinstance(img, str) and img and img not in seen:
                    seen.add(img)
                    images.append(img)

        # 格式 3: output 字段 — output.images 或 output[].url
        if not images and "output" in data:
            output = data["output"]
            if isinstance(output, dict):
                for item in output.get("images", []):
                    img = item.get("url") if isinstance(item, dict) else item
                    if isinstance(img, str) and img and img not in seen:
                        seen.add(img)
                        images.append(img)
            elif isinstance(output, list):
                for item in output:
                    img = item.get("url") if isinstance(item, dict) else item
                    if isinstance(img, str) and img and img not in seen:
                        seen.add(img)
                        images.append(img)

        # 格式 4: result 字段
        if not images and "result" in data:
            result = data["result"]
            if isinstance(result, list):
                for item in result:
                    img = item.get("url") if isinstance(item, dict) else item
                    if isinstance(img, str) and img and img not in seen:
                        seen.add(img)
                        images.append(img)
            elif isinstance(result, dict):
                for item in result.get("images", []):
                    img = item.get("url") if isinstance(item, dict) else item
                    if isinstance(img, str) and img and img not in seen:
                        seen.add(img)
                        images.append(img)

        # 格式 5: choices[].message.content 中的 URL
        if not images and "choices" in data:
            content = data["choices"][0].get("message", {}).get("content", "")
            for m in re.findall(r'https?://[^\s"\'<>]+', content):
                if m not in seen:
                    seen.add(m)
                    images.append(m)

        # 格式 6: 直接顶层 URL 字段
        if not images:
            for key in ["url", "image_url", "image"]:
                val = data.get(key)
                if isinstance(val, str) and val and val not in seen:
                    seen.add(val)
                    images.append(val)

        return images

    async def generate_image(self, req: ImageGenRequest) -> ImageGenResponse:
        model = req.model or self.default_model

        # 合并参考图
        ref_urls = list(req.image_urls or [])
        if req.image_url:
            ref_urls.append(req.image_url)

        # 宽高比
        aspect = req.aspect_ratio or self._size_to_aspect(req.width, req.height)

        # nano-banana-pro 走 Gemini 官方端点（401/连接失败时回退到 Edits）
        if model == "nano-banana-pro":
            try:
                return await self._generate_gemini(req, ref_urls, aspect)
            except Exception as e:
                err_msg = str(e)
                if "401" in err_msg or "Unauthorized" in err_msg or "ConnectError" in err_msg:
                    print(f"[Bltcy/Gemini] 端点不可用 ({type(e).__name__})，回退到 Edits 端点")
                    return await self._generate_edits(req, ref_urls, aspect)
                raise

        # nano-banana-2 走 Edits 兼容端点
        if model == "nano-banana-2":
            return await self._generate_edits(req, ref_urls, aspect)

        # OpenAI GPT Image 系列走标准图片端点；有参考图时走 edits
        if model.startswith("gpt-image-"):
            return await self._generate_openai_image(req, ref_urls, aspect, model)

        # 其他模型（flux, sdxl, dall-e-3）走通用 OpenAI images/generations
        return await self._generate_generic(req, ref_urls, aspect, model)

    @staticmethod
    def _openai_image_size(aspect: Optional[str], image_size: Optional[str]) -> str:
        """把前端比例映射到 GPT Image 尺寸，保留 21:9 这类超宽比例。"""
        scale = {"1K": 1, "2K": 2, "4K": 3}.get(image_size or "1K", 1)
        base_sizes = {
            "3:1": (1536, 512),
            "1:3": (512, 1536),
            "21:9": (1344, 576),
            "16:9": (1024, 576),
            "4:3": (1024, 768),
            "3:4": (768, 1024),
            "9:16": (576, 1024),
            "1:1": (1024, 1024),
        }
        width, height = base_sizes.get(aspect or "1:1", base_sizes["1:1"])
        return f"{width * scale}x{height * scale}"

    async def _generate_openai_image(self, req: ImageGenRequest, ref_urls: list, aspect: Optional[str], model: str) -> ImageGenResponse:
        """GPT Image 系列：OpenAI 兼容 /images/generations 或 /images/edits。"""
        print(f"[Bltcy/GPTImage] 模型 {model}，{len(ref_urls)} 张参考图")
        size = self._openai_image_size(aspect, req.image_size)

        async with httpx.AsyncClient(timeout=180) as client:
            if ref_urls:
                multipart_fields = [
                    ("model", (None, model)),
                    ("prompt", (None, req.prompt)),
                    ("n", (None, str(req.num_images))),
                    ("size", (None, size)),
                    ("mentions", (None, json.dumps(req.mentions or [], ensure_ascii=False))),
                ]
                if aspect:
                    multipart_fields.append(("aspect_ratio", (None, aspect)))

                for i, url in enumerate(ref_urls):
                    if url.startswith("data:"):
                        header, b64_data = url.split(",", 1)
                        mime_type = header.split(";")[0].replace("data:", "")
                        img_bytes = base64.b64decode(b64_data)
                        ext_map = {"image/jpeg": ".jpg", "image/jpg": ".jpg", "image/webp": ".webp", "image/png": ".png"}
                        ext = ext_map.get(mime_type, ".png")
                        content_type = mime_type
                    else:
                        if url.startswith("/"):
                            url = f"http://127.0.0.1:8000{url}"
                            if "/uploads/" in url and "/api/uploads/" not in url:
                                url = url.replace("/uploads/", "/api/uploads/")
                        img_resp = await client.get(url)
                        img_resp.raise_for_status()
                        img_bytes = img_resp.content
                        content_type = img_resp.headers.get("content-type", "image/png")
                        if "jpeg" in content_type or "jpg" in content_type:
                            ext = ".jpg"
                        elif "webp" in content_type:
                            ext = ".webp"
                        else:
                            ext = ".png"

                    multipart_fields.append(("image", (f"ref_{i}{ext}", img_bytes, content_type)))

                endpoint = "/images/edits"
                print(f"[Bltcy/GPTImage] POST {endpoint} (multipart)")
                resp = await client.post(
                    f"{self.base_url}{endpoint}",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    files=multipart_fields,
                )
            else:
                body = {
                    "model": model,
                    "prompt": req.prompt,
                    "n": req.num_images,
                    "size": size,
                    "mentions": req.mentions or [],
                }
                if aspect:
                    body["aspect_ratio"] = aspect

                endpoint = "/images/generations"
                print(f"[Bltcy/GPTImage] POST {endpoint} (json)")
                resp = await client.post(
                    f"{self.base_url}{endpoint}",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )

            print(f"[Bltcy/GPTImage] 响应状态: {resp.status_code}")
            if resp.status_code >= 400:
                print(f"[Bltcy/GPTImage] 错误 {resp.status_code}: {resp.text[:500]}")
            resp.raise_for_status()

            data = resp.json()
            images = self._extract_images(data)
            print(f"[Bltcy/GPTImage] 提取到 {len(images)} 张图片")

            if not images:
                raise Exception(f"Bltcy GPT Image API 未返回图片。响应 keys: {list(data.keys())}, 样本: {str(data)[:500]}")

            return ImageGenResponse(images=images, model=model, provider=self.name)

    async def _generate_gemini(self, req: ImageGenRequest, ref_urls: list, aspect: Optional[str]) -> ImageGenResponse:
        """nano-banana-pro: Gemini 官方格式"""
        try:
            return await self._generate_gemini_inner(req, ref_urls, aspect)
        except Exception as e:
            print(f"[Bltcy/Gemini] 完整异常: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            raise

    async def _generate_gemini_inner(self, req: ImageGenRequest, ref_urls: list, aspect: Optional[str]) -> ImageGenResponse:
        """nano-banana-pro: Gemini 官方格式"""
        print(f"[Bltcy/Gemini] Pro 模式，{len(ref_urls)} 张参考图")

        # 构建 contents
        parts = []

        # 参考图作为 inlineData
        for url in ref_urls:
            if url.startswith("data:"):
                # base64 data URI：直接解析
                header, b64_data = url.split(",", 1)
                mime = header.split(";")[0].replace("data:", "")
                img_bytes = base64.b64decode(b64_data)
            else:
                if url.startswith("/"):
                    url = f"http://127.0.0.1:8000{url}"
                    if "/uploads/" in url and "/api/uploads/" not in url:
                        url = url.replace("/uploads/", "/api/uploads/")

                async with httpx.AsyncClient(timeout=60, trust_env=False) as dl_client:
                    img_resp = await dl_client.get(url)
                    img_resp.raise_for_status()

                content_type = img_resp.headers.get("content-type", "image/png")
                if "jpeg" in content_type or "jpg" in content_type:
                    mime = "image/jpeg"
                elif "webp" in content_type:
                    mime = "image/webp"
                else:
                    mime = "image/png"
                img_bytes = img_resp.content

            b64 = base64.b64encode(img_bytes).decode()
            parts.append({
                "inlineData": {
                    "data": b64,
                    "mimeType": mime,
                }
            })
            print(f"[Bltcy/Gemini]   参考图: {len(img_bytes)} bytes ({mime})")

        # 文本 prompt
        parts.append({"text": req.prompt})

        body = {
            "contents": [{"parts": parts, "role": "user"}],
            "generationConfig": {
                "responseModalities": ["IMAGE"],
            },
        }

        if aspect or req.image_size:
            image_config = {}
            if aspect:
                image_config["aspectRatio"] = aspect
            if req.image_size:
                image_config["imageSize"] = req.image_size
            body["generationConfig"]["imageConfig"] = image_config

        # Gemini 端点：/v1beta 是 Google 原生格式，Bltyc 代理同样适用
        base = self.base_url.rstrip("/")
        if base.endswith("/v1"):
            base = base[:-3]
        endpoint = f"{base}/v1beta/models/gemini-3-pro-image-preview:generateContent?key={self.api_key}"
        print(f"[Bltcy/Gemini] POST {endpoint}")

        async with httpx.AsyncClient(timeout=180, trust_env=False) as client:
            resp = await client.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )

            print(f"[Bltcy/Gemini] 响应状态: {resp.status_code}")
            resp_text = resp.text[:2000]
            print(f"[Bltcy/Gemini] 响应体: {resp_text}")

            if resp.status_code >= 400:
                print(f"[Bltcy/Gemini] 错误 {resp.status_code}: {resp_text}")
            resp.raise_for_status()

            data = resp.json()

            # 提取图片：Gemini 格式在 candidates[].content.parts[].inlineData
            images = []
            seen = set()
            for candidate in data.get("candidates", []):
                for part in candidate.get("content", {}).get("parts", []):
                    inline = part.get("inlineData", {})
                    if inline.get("data"):
                        mime = inline.get("mimeType", "image/png")
                        b64_data = inline["data"]
                        img_url = f"data:{mime};base64,{b64_data}"
                        if img_url not in seen:
                            seen.add(img_url)
                            images.append(img_url)

            if not images:
                raise Exception(f"Bltcy Gemini API 未返回图片。响应: {str(data)[:500]}")

            print(f"[Bltcy/Gemini] 返回 {len(images)} 张图片")
            return ImageGenResponse(images=images, model="nano-banana-pro", provider=self.name)

    async def _generate_edits(self, req: ImageGenRequest, ref_urls: list, aspect: Optional[str]) -> ImageGenResponse:
        """OpenAI Edits 兼容格式（nano-banana-2 / nano-banana-pro 回退）"""
        model = req.model or "nano-banana-2"
        print(f"[Bltcy/Edits] 模式，{len(ref_urls)} 张参考图，模型: {model}")

        async with httpx.AsyncClient(timeout=180) as client:
            if ref_urls:
                # === 图生图：/images/edits (multipart) ===
                multipart_fields = [
                    ("model", (None, model)),
                    ("prompt", (None, req.prompt)),
                    ("n", (None, str(req.num_images))),
                    ("response_format", (None, "url")),
                    ("mentions", (None, json.dumps(req.mentions or [], ensure_ascii=False))),
                ]
                if aspect:
                    multipart_fields.append(("aspect_ratio", (None, aspect)))
                if req.image_size:
                    multipart_fields.append(("image_size", (None, req.image_size)))

                for i, url in enumerate(ref_urls):
                    if url.startswith("data:"):
                        header, b64_data = url.split(",", 1)
                        mime_type = header.split(";")[0].replace("data:", "")
                        img_bytes = base64.b64decode(b64_data)
                        ext_map = {"image/jpeg": ".jpg", "image/jpg": ".jpg", "image/webp": ".webp", "image/png": ".png"}
                        ext = ext_map.get(mime_type, ".png")
                        content_type = mime_type
                    else:
                        if url.startswith("/"):
                            url = f"http://127.0.0.1:8000{url}"
                            if "/uploads/" in url and "/api/uploads/" not in url:
                                url = url.replace("/uploads/", "/api/uploads/")
                        img_resp = await client.get(url)
                        img_resp.raise_for_status()
                        img_bytes = img_resp.content
                        content_type = img_resp.headers.get("content-type", "image/png")
                        if "jpeg" in content_type or "jpg" in content_type:
                            ext = ".jpg"
                        elif "webp" in content_type:
                            ext = ".webp"
                        else:
                            ext = ".png"

                    multipart_fields.append(
                        ("image", (f"ref_{i}{ext}", img_bytes, content_type))
                    )

                endpoint = "/images/edits"
                print(f"[Bltcy/Edits] POST {endpoint} (multipart)")
                resp = await client.post(
                    f"{self.base_url}{endpoint}",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    files=multipart_fields,
                )
            else:
                # === 纯文生图：/images/generations (JSON) ===
                body = {
                    "model": model,
                    "prompt": req.prompt,
                    "n": req.num_images,
                    "response_format": "url",
                    "mentions": req.mentions or [],
                }
                if aspect:
                    body["aspect_ratio"] = aspect
                if req.image_size:
                    body["image_size"] = req.image_size

                endpoint = "/images/generations"
                print(f"[Bltcy/Edits] POST {endpoint} (json)")
                resp = await client.post(
                    f"{self.base_url}{endpoint}",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )

            print(f"[Bltcy/Edits] 响应状态: {resp.status_code}")
            if resp.status_code >= 400:
                print(f"[Bltcy/Edits] 错误 {resp.status_code}: {resp.text[:500]}")
            resp.raise_for_status()

            data = resp.json()
            print(f"[Bltcy/Edits] 响应 keys: {list(data.keys())}")

            # 提取图片（多格式兼容）
            images = self._extract_images(data)
            print(f"[Bltcy/Edits] 提取到 {len(images)} 张图片")

            if not images:
                raise Exception(f"Bltcy API 未返回图片。响应 keys: {list(data.keys())}, 样本: {str(data)[:500]}")

            return ImageGenResponse(images=images, model=model, provider=self.name)

    async def _generate_generic(self, req: ImageGenRequest, ref_urls: list, aspect: Optional[str], model: str) -> ImageGenResponse:
        """通用图像生成：flux, sdxl, dall-e-3 等走标准 /images/generations"""
        print(f"[Bltcy/Generic] 模型 {model}")

        size = f"{req.width}x{req.height}"
        if req.image_size:
            size_map = {"1K": "1024x1024", "2K": "2048x2048", "4K": "4096x4096"}
            size = size_map.get(req.image_size, size)

        body = {
            "model": model,
            "prompt": req.prompt,
            "n": req.num_images,
            "size": size,
            "response_format": "url",
            "mentions": req.mentions or [],
        }

        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.post(
                f"{self.base_url}/images/generations",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )

            if resp.status_code >= 400:
                print(f"[Bltcy/Generic] 错误 {resp.status_code}: {resp.text[:500]}")
            resp.raise_for_status()

            data = resp.json()
            images = self._extract_images(data)
            print(f"[Bltcy/Generic] 提取到 {len(images)} 张图片")

            if not images:
                raise Exception(f"API 未返回图片。响应 keys: {list(data.keys())}, 样本: {str(data)[:500]}")

            return ImageGenResponse(images=images, model=model, provider=self.name)

    @staticmethod
    def _size_to_aspect(width: int, height: int) -> Optional[str]:
        if width <= 0 or height <= 0:
            return None
        ratio = width / height
        candidates = {
            "1:1": 1.0, "1:3": 1/3, "3:1": 3.0, "2:3": 2/3, "3:2": 3/2, "3:4": 3/4,
            "4:3": 4/3, "4:5": 4/5, "5:4": 5/4,
            "9:16": 9/16, "16:9": 16/9, "21:9": 21/9,
        }
        return min(candidates, key=lambda k: abs(candidates[k] - ratio))

    async def generate_audio(self, req: AudioGenRequest) -> AudioGenResponse:
        """音频生成：OpenAI 兼容 TTS (/v1/audio/speech)"""
        model = req.model or "tts-1"
        voice = req.voice or "alloy"

        # bltcy TTS voices: alloy, echo, fable, onyx, nova, shimmer
        voice_map = {
            "default": "alloy",
            "male": "onyx",
            "female": "nova",
            "alloy": "alloy",
            "echo": "echo",
            "fable": "fable",
            "onyx": "onyx",
            "nova": "nova",
            "shimmer": "shimmer",
        }
        api_voice = voice_map.get(voice, voice)

        body = {
            "model": model,
            "input": req.text,
            "voice": api_voice,
            "response_format": "mp3",
        }

        print(f"[Bltcy/Audio] POST /audio/speech model={model} voice={api_voice}")

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{self.base_url}/audio/speech",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )

            if resp.status_code >= 400:
                print(f"[Bltcy/Audio] 错误 {resp.status_code}: {resp.text[:500]}")
            resp.raise_for_status()

            # 返回 base64 data URI
            audio_b64 = base64.b64encode(resp.content).decode()
            audio_url = f"data:audio/mp3;base64,{audio_b64}"

            print(f"[Bltcy/Audio] 生成成功，{len(resp.content)} bytes")
            return AudioGenResponse(audio_url=audio_url, provider=self.name)
