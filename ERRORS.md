# TapNow Clone - 踩坑记录

> 记录开发过程中遇到的问题、原因和解决方案

---

## 1. start.sh 在 Windows 上无法运行
- **现象**：双击 start.sh 无反应
- **原因**：Windows 不支持 shell 脚本
- **解决**：改为 start.bat

## 2. .bat 中文编码乱码
- **现象**：bat 文件中的中文注释显示为乱码
- **原因**：Windows cmd 默认编码不是 UTF-8
- **解决**：bat 文件中全部换成英文

## 3. 缺少 python-multipart 依赖
- **现象**：后端启动报错 `Form data requires "python-multipart"`
- **原因**：FastAPI 文件上传需要该依赖
- **解决**：加入 requirements.txt

## 4. uvicorn reload=True 导致 Windows 双启动冲突
- **现象**：启动后出现两个进程，端口冲突
- **原因**：`uvicorn.run(reload=True)` 在 Windows 上会 fork 子进程
- **解决**：去掉 reload 参数

## 5. 路径解析在 Windows 上出错
- **现象**：找不到前端 dist 目录
- **原因**：Windows 路径分隔符和相对路径解析不同
- **解决**：使用 `os.path.normpath` + `os.path.abspath`

## 6. 后端未托管前端静态文件
- **现象**：访问 localhost:8000 返回 404
- **原因**：后端只注册了 API 路由，没有 SPA 路由
- **解决**：添加 catch-all 路由返回 index.html（SPA 路由）

## 7. tsconfig strict 模式下类型错误
- **现象**：`npm run build` 报大量类型错误
- **原因**：strict 模式要求所有类型显式声明
- **解决**：修复类型断言和可选链

## 8. Nova AI 图像生成走错端点
- **现象**：调用 `/images/generations` 返回错误
- **原因**：Nova AI 图像生成实际走 `/v1/chat/completions`，不是 `/images/generations`
- **解决**：generate_image 加回退逻辑：先试 /images/generations，失败走 /chat/completions

## 9. Nova AI image URL 提取失败
- **现象**：API 返回了图片但代码没提取到 URL
- **原因**：URL 中带 query string，正则没匹配到；重复 URL 没去重
- **解决**：修正正则支持 query string + 加 seen set 去重

## 10. Bltcy.ai `/images/edits` 返回 500
- **现象**：调用 `/images/edits` 返回 500，错误信息 `image is required`
- **原因**：`/images/edits` 是图片编辑接口，`image` 字段必填，不适合纯文生图
- **解决**：纯文生图改用 `/images/generations`（JSON 格式），图生图才用 `/images/edits`

## 11. 图片上传返回相对路径，后端下载失败
- **现象**：`Request URL is missing an 'http://' or 'https://' protocol`
- **原因**：上传返回 `/uploads/xxx.png`，后端 provider 下载时没有拼上 `http://127.0.0.1:8000` 前缀
- **解决**：检测到相对路径时自动拼接 `http://127.0.0.1:8000`

## 12. Windows 文件锁 - WinError 32
- **现象**：`[WinError 32] 另一个程序正在使用此文件，进程无法访问`
- **原因**：httpx 传文件句柄（`open(path, "rb")`）时还持有锁，Windows 上无法同时删除
- **解决**：先用 `with open()` 读到内存，关闭文件，再传 bytes 给 httpx

## 13. 删除 try/finally 后遗留语法错误
- **现象**：`SyntaxError: expected 'except' or 'finally' block` + 缩进错误
- **原因**：删 finally 块时没删干净 try 和修正缩进
- **解决**：重写整个代码块，去掉 try，直接顺序执行

## 14. start.bat 不自动 build 前端
- **现象**：pull 新代码后前端没更新
- **原因**：start.bat 只在 `dist` 不存在时才 build
- **解决**：去掉 `if not exist "dist"` 条件，每次启动都 build

## 15. Banana 节点硬编码 Provider
- **现象**：Banana 节点只能用 nova-ai，无法切换
- **原因**：`handleRun` 中 banana-output 的 provider 写死为 `nova-ai`
- **解决**：改为从 config 读取，加 Provider 下拉选择器，默认 bltcy

## 16. 上传路径缺少 /api 前缀，后端下载到 index.html
- **现象**：参考图传到 Bltcy.ai 完全不起作用，日志显示 `参考图: 458 bytes`（真实图片至少几十KB）
- **原因**：upload 路由返回 `/uploads/xxx.jpg`，但路由挂载在 `/api` 下。后端 provider 从 `http://127.0.0.1:8000/uploads/xxx.jpg` 下载时命中了 SPA catch-all 路由，下载到的是前端 `index.html`（458 bytes）
- **解决**：upload 返回改为 `/api/uploads/xxx.jpg`；provider 中加兼容逻辑：`/uploads/` → `/api/uploads/`

## 17. Bltcy.ai 模型名不对
- **现象**：`nano-banana-2-pro` 返回 503 "所有分组对于模型无可用渠道"
- **原因**：Bltcy.ai 上实际模型名是 `nano-banana-pro`，不是 `nano-banana-2-pro`。可用模型：`nano-banana`、`nano-banana-2`、`nano-banana-pro`
- **解决**：前端和后端默认模型改为 `nano-banana-pro`

## 18. Bltcy.ai `/images/edits` multipart 格式问题
- **现象**：图生图 API 返回 200 但生成的图没有参考图的影响
- **原因**：之前用 JSON 格式走 `/images/generations` 发图生图请求，Bltcy.ai 不支持。图生图必须走 `/images/edits` + multipart/form-data
- **解决**：按官方文档重写 bltcy_provider，统一走 `/images/edits` multipart 格式，image 字段传二进制文件

## 19. Bltcy.ai `/images/edits` 401 Unauthorized
- **现象**：API 返回 "令牌不合法"
- **原因**：pull 新代码后 `providers.json` 被覆盖，api_key 变回 `YOUR_API_KEY_HERE`
- **解决**：在前端 Settings Panel 重新填入 API Key 保存

---

## 教训总结

1. **Windows 文件系统不同于 Linux**：文件锁、路径分隔符、编码问题频繁出现
2. **API 文档要看全**：`/images/edits` 和 `/images/generations` 是不同的端点，用途不同
3. **删除代码要干净**：删 try/finally 要连 try 一起删，并检查缩进
4. **前端改动需要 build**：后端 serve 的是 dist/，源码改了不 build 不生效
5. **不要硬编码**：Provider、模型等配置应该可切换，不要写死
6. **路由前缀要对齐**：upload 路由挂在 `/api` 下，返回的 URL 也要带 `/api` 前缀，否则会命中 SPA catch-all
7. **458 bytes 不是图片**：下载文件大小异常小（< 1KB）时，大概率下载到的是 HTML 错误页面而不是目标文件
8. **模型名以 API 实际返回为准**：不要自己猜测模型名，以 API 返回的错误信息中列出的可用模型名为准
