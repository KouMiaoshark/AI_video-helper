# TapNow Clone - AI 视觉内容创作平台

本项目是一个本地运行的 AI 创作工具。目前主要完善了网页生图页面，并接入了节点创作页面，支持通过节点式工作流组织图片、视频、脚本等生成流程。

默认生图 API 来自柏拉图中转站 API。首次运行前需要完成 API 令牌配置。

## 架构

```
tapnow-clone/
├── frontend/          # React + TypeScript + React Flow
│   ├── src/
│   │   ├── api/       # API 客户端
│   │   ├── store/     # Zustand 状态管理
│   │   └── components/# UI 组件
│   └── package.json
├── backend/           # Python FastAPI
│   ├── app/
│   │   ├── providers/ # AI 模型 Provider 抽象层
│   │   └── routers/   # API 路由
│   ├── config/
│   │   └── providers.json  # API 配置文件
│   └── requirements.txt
├── 第一次启动.bat       # Windows 首次初始化启动
├── start.bat          # Windows 日常启动
├── start.sh           # 终端启动（macOS / Linux）
└── start.command      # Finder 双击启动（macOS）
```

## 快速启动

### 1. Windows 启动

第一次运行时，双击：

```bat
第一次启动.bat
```

以后再次运行时，直接双击：

```bat
start.bat
```

### 2. 配置 API

默认生图 API 使用柏拉图中转站 API。请在后端配置文件中填入你的 API Key，并按需选择令牌分组。

配置示例图：

![API 配置图](docs/api-config.jpg)

`backend/config/providers.json` 示例：

```json
{
  "providers": {
    "bltcy": {
      "type": "openai_compatible",
      "api_key": "你的KEY",
      "base_url": "https://你的柏拉图中转站地址/v1",
      "default_model": "gemini-2.5-flash-image-preview"
    }
  },
  "defaults": {
    "image": "bltcy"
  }
}
```

### 3. macOS / Linux 启动

终端启动：

```bash
chmod +x start.sh start.command
./start.sh
```

如果你想像 Windows 一样在 macOS 上双击启动，第一次执行完上面的 `chmod` 后，可以直接在 Finder 中双击 `start.command`。

也可以手动启动：

```bash
# 后端
cd backend && python3 main.py

# 前端（另一个终端）
cd frontend && npm run dev
```

### 4. 访问

- **前端**：http://localhost:3000
- **后端 API 文档**：http://localhost:8000/docs

## 支持的节点类型

| 节点 | 功能 | API 端点 |
|------|------|----------|
| 📝 文本输入 | 输入提示词 | — |
| 🖼️ 图片输入 | 上传参考图 | — |
| 🎨 图像生成 | 文生图 | POST /api/generate/image |
| 🎬 视频生成 | 文/图生视频 | POST /api/generate/video |
| 📜 脚本生成 | AI 分镜脚本 | POST /api/generate/script |
| ✨ 图像增强 | 超分/降噪 | POST /api/generate/enhance |
| 🔊 音频生成 | TTS 配音 | POST /api/generate/audio |

## 添加新的 Provider

只要 API 兼容 OpenAI 格式，直接在 `providers.json` 添加即可：

```json
{
  "my_provider": {
    "type": "openai_compatible",
    "api_key": "xxx",
    "base_url": "https://api.example.com/v1",
    "default_model": "some-model"
  }
}
```

## 使用方式

1. 从左侧面板拖拽节点到画布
2. 点击节点，在右侧面板配置参数
3. 连线节点定义数据流
4. 点击「运行节点」执行生成任务

## 开源协议与第三方代码说明

本项目包含不同来源的代码，因此按代码来源分别适用不同开源协议：

- `studio` 页面接入自第三方项目 [Tapnow-Studio--](https://github.com/zhengxinlan1995-code/Tapnow-Studio--)。本仓库中与该 `studio` 页面相关的代码，以及基于该页面进行修改后的代码，按照 GNU General Public License v3.0 (GPLv3) 协议开源。
- 除上述 `studio` 页面及其修改代码以外，本项目其余由 AI 辅助编写的代码按照 Apache License 2.0 协议开源。

使用、修改或分发本项目时，请根据对应代码来源遵守相应协议条款。
