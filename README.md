# TapNow Clone - AI 视觉内容创作平台

本地运行的 AI 创作工具，支持节点式工作流编辑。

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
└── start.sh           # 一键启动
```

## 快速启动

### 1. 配置 API

编辑 `backend/config/providers.json`，填入你的 API Key：

```json
{
  "providers": {
    "siliconflow": {
      "type": "openai_compatible",
      "api_key": "你的KEY",
      "base_url": "https://api.siliconflow.cn/v1",
      "default_model": "stabilityai/stable-diffusion-xl-base-1.0"
    },
    "deepseek": {
      "type": "openai_compatible",
      "api_key": "你的KEY",
      "base_url": "https://api.deepseek.com",
      "default_model": "deepseek-chat"
    }
  },
  "defaults": {
    "image": "siliconflow",
    "script": "deepseek"
  }
}
```

### 2. 启动

```bash
chmod +x start.sh
./start.sh
```

或手动启动：

```bash
# 后端
cd backend && python3 main.py

# 前端（另一个终端）
cd frontend && npm run dev
```

### 3. 访问

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
