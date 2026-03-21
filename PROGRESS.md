# TapNow Clone - 项目进度

> 更新时间：2026-03-21 17:10

## 项目概述
- **名称**：TapNow Clone - AI 视觉内容创作平台
- **仓库**：https://github.com/KouMiaoshark/miclaw_ai（私有）
- **技术栈**：React + TypeScript + React Flow + Tailwind CSS + Zustand（前端），Python FastAPI（后端）
- **架构**：后端托管前端静态文件，单端口 8000
- **启动方式**：Windows 双击 `start.bat`（自动 build 前端 + 启动后端）

---

## 已实现功能 ✅

### 画布与节点系统
- [x] 节点式画布编辑器（React Flow）
- [x] 左侧节点面板（拖拽添加节点 + 可折叠/展开）
- [x] 顶部工具栏（导出/导入工作流、撤销/重做、清空画布、API Config）
- [x] 7 种节点类型：文本输入、图片输入、图像生成、视频生成、脚本生成、图像增强、音频生成
- [x] Banana 节点（专属生图，支持 Provider 选择 + 参考图）
- [x] **节点内联配置**（v0.3.0）：移除右侧属性面板，所有配置直接嵌入节点卡片
- [x] **右键菜单**（v0.4.0）：画布右键添加节点/清空，节点右键删除/复制/运行
- [x] **撤销/重做**（v0.4.0）：Ctrl+Z/Y，50步历史，工具栏按钮
- [x] **键盘快捷键**（v0.4.0）：Del删除、Ctrl+D复制
- [x] **工作流导入/导出**（v0.4.0）：JSON格式保存/加载画布状态

### 图片功能
- [x] 图片上传（拖拽/点击上传，上传后预览）
- [x] 图片点击放大灯箱预览

### API 与 Provider 系统
- [x] API 配置页面（Modal 弹窗，管理 Provider 和任务默认值）
- [x] OpenAI 兼容 Provider 抽象层（providers.json 配置）
- [x] Bltcy.ai 专用 Provider（multipart/form-data `/images/edits` + JSON `/images/generations`）
- [x] Anthropic 兼容 Provider
- [x] 支持 per-node Provider 选择
- [x] 预设系统（SiliconFlow、DeepSeek、Groq、Gemini、OpenRouter、Nova AI、Bltcy）

### 文件与后端
- [x] 文件上传后端（/api/upload）
- [x] 后端托管前端静态文件（单端口方案）
- [x] 热配置更新（Settings 面板 Save 后自动重载）

### 节点配置表单
- [x] 图像生成：Prompt、Negative Prompt、Width/Height、Provider/Model
- [x] 视频生成：Prompt、Duration（3/5/10/15秒）、Provider/Model
- [x] 脚本生成：Topic、Style（Commercial/Cinematic/Social）、Length
- [x] 音频生成：Text、Voice（Default/Male/Female）、Provider/Model
- [x] 图像增强：Image URL、Enhance Mode（Upscale/Denoise/Sharpen）
- [x] Banana 生图：Provider 选择、Model（nano-banana-2/nano-banana-pro）、数量、Prompt、参考图上传（1-9张）

### 结果展示
- [x] 图片结果：网格展示 + 灯箱预览
- [x] 视频结果：内嵌播放器
- [x] 音频结果：内嵌播放器
- [x] 脚本结果：文本 + 分镜列表

### 数据流系统
- [x] **节点间数据流传递**（v0.4.0）：连线后自动将上游输出填充到下游配置
  - 图像/图片→视频(参考图)、图像/图片→增强(图片URL)
  - 文本→图像(提示词)、文本→脚本(主题)、文本→音频(文本)
  - 节点完成后自动 propagate 到所有下游
  - 数据流连接状态指示器

---

## 已配置的 API 供应商

| 供应商 | Base URL | 类型 | 默认用途 | 默认模型 |
|--------|----------|------|----------|----------|
| bltcy | https://api.bltcy.ai/v1 | bltcy（专用） | image（图像生成） | nano-banana-pro |
| siliconflow | https://api.siliconflow.cn/v1 | openai_compatible | video/enhance/audio | stabilityai/stable-diffusion-xl-base-1.0 |
| deepseek | https://api.deepseek.com | openai_compatible | script | deepseek-chat |
| nova-ai | https://once.novai.su/v1 | openai_compatible | - | claude-opus-4-6 |

### Bltcy.ai API 知识
- 地址：`https://api.bltcy.ai/v1`
- 认证：Bearer token
- **官方文档**：https://gpt-best.apifox.cn/api-420361517（Edits 格式）、api-406882253（Gemini 官方格式）
- **文生图/图生图统一走**：`POST /v1/images/edits`（multipart/form-data）
  - model：`nano-banana-2` 或 `nano-banana-pro`（以 API 返回的可用模型名为准）
  - image：二进制文件，支持多图（同一字段名传多个文件）
  - prompt：必填
  - response_format：`url` 或 `b64_json`
  - aspect_ratio：可选（1:1、2:3、3:2 等）
  - image_size：1K/2K/4K（仅 nano-banana 支持）
- 可用模型：`nano-banana`、`nano-banana-2`、`nano-banana-pro`
- 注意：`/images/edits` 的 image 字段是**必填**的（纯文生图可不传）

### Nova AI API 知识
- 地址：`https://once.novai.su/v1`
- 认证：Bearer token
- 所有模型走 `/v1/chat/completions`（OpenAI 兼容格式）
- 文本模型：claude-opus-4-6, gemini-2.5-pro 等
- 图像模型：nano-banana（通过 chat completions 返回图片 URL）
- 视频模型：veo_3_1

---

## 待实现 ⏳

### 高优先级
- [ ] 工作流模板系统（预设：文生视频、批量生图等）
- [ ] 历史记录/项目管理

### 中优先级
- [ ] 视频生成 Provider（接入实际 API）
- [ ] 音频生成 Provider（接入实际 TTS API）
- [ ] 图像增强 Provider（接入 Real-ESRGAN 等）

### 低优先级
- [ ] 更多节点类型
- [ ] 工作流分享（在线链接）
- [ ] 用户系统

---

## 版本记录

| 版本 | 日期 | 内容 |
|------|------|------|
| v0.1.0 | 2026-03-20 | 基础框架搭建 |
| v0.1.1 | 2026-03-20 | 节点 Provider 选择 + 视频/音频配置 |
| v0.1.2 | 2026-03-20 | Anthropic 兼容 Provider + Nova AI 预设 |
| v0.1.3 | 2026-03-20 | Nova AI 图像生成修复 + 回退逻辑 |
| v0.1.4 | 2026-03-20 | Nova AI image URL regex 修复 + 去重 |
| v0.1.5 | 2026-03-20 | Banana 节点 + Nova AI 专属生图 + 画廊预览 |
| v0.1.6 | 2026-03-20 | 图片点击放大灯箱预览 |
| v0.1.7 | 2026-03-20 | 移除 chat completions 回退，只走 images/generations |
| v0.2.0 | 2026-03-20 | Bltcy.ai Provider 接入 + Banana 节点支持 Provider 选择 + 参考图上传 |
| v0.2.1 | 2026-03-20 | Bltcy Provider 按官方文档重写（/images/edits multipart）+ 模型名修正 nano-banana-pro |
| v0.2.2 | 2026-03-20 | 修复上传路径缺少 /api 前缀导致参考图下载到 index.html 的 bug |
| v0.3.0 | 2026-03-21 | 节点内联配置 - 移除右侧属性面板，所有配置嵌入节点卡片（参考图、提示词、模型、比例、数量、尺寸等） |
| v0.3.1 | 2026-03-21 | Banana aspect_ratio 参数修复 + 左侧面板折叠 + 资产页面滚动修复 |
| v0.4.0 | 2026-03-21 | 节点间数据流传递 + 右键菜单 + 撤销/重做 + 工作流导入导出 + 键盘快捷键 |

---

## GitHub 协作模式
- BOOST 给 token → 我改代码 + 推送 → BOOST pull → BOOST 删 token
- 推送完本地清理 token，不存储
