# AI Homework Review

移动端优先的 AI 批改作业独立站 MVP。当前包含两条演示链路：

- 固定版式数学答题卡批改：首页直接体验，录入标准答案、上传答题卡图片并返回识别、判分和讲评结果。
- 班级单题批量批改：独立 `#/batch-review` 页面，上传整班同题 PDF 与评分标准材料，对自由排版过程题逐页输出老师批注风格结果。

## 目录结构

- `src/`: 前端页面、组件和 API 调用封装
- `shared/`: 前后端共用的答案解析与判分规则
- `api/`: 阿里云函数计算风格的 Hono API 骨架
- `public/test-sheets/`: Scheme B 测试答题卡素材
- `docs/`: 规格、计划和部署文档

## 本地开发

```bash
npm install
npm run dev
```

另开一个终端启动 API：

```bash
cd api
npm install
npm run dev
```

前端本地默认请求 `http://localhost:8787`。如果你要改成其他 API 地址，可复制根目录 `.env.example` 为 `.env` 并设置：

```bash
VITE_API_BASE_URL=http://localhost:8787
```

API 本地运行会直接读取 `api/.env`。当前真实链路建议使用：

- `OBJECT_STORE_DRIVER=oss`
- `OCR_AI_MODEL=qwen-vl-ocr-latest`
- `TEXT_AI_MODEL=gpt-5.4`
- `BATCH_VISION_AI_MODEL=qwen-vl-max-latest`

前端会先向服务端请求 STS 临时凭证，再直传 OSS；批改阶段仍由服务端调用 OCR 和讲评模型。
如果浏览器因 OSS CORS 或预检失败导致直传异常，当前前端会自动回退到后端代理上传，不影响完整验收。
`api/.env` 仅用于本地和云端部署，不应提交到 GitHub。

## 测试与构建

```bash
npm run test
npm run build
cd api && npm run test && npm run build
```

## 部署

- 前端：GitHub Pages
- 后端：阿里云函数计算

详细说明见 `docs/deployment/github-pages-and-aliyun.md`。

## 当前验收链路

1. 首页输入体验码 `demo-code`
2. 点击“填入演示答案”
3. 下载并上传 `public/test-sheets/scheme-b-filled.png`
4. 点击“开始体验”

当前仓库已验证过真实链路：

- 会话签发成功
- OSS STS 直传成功
- 阿里 OCR 识别成功
- `gpt-5.4` 讲评生成成功

批量批改链路新增依赖：

- `BATCH_VISION_AI_BASE_URL`
- `BATCH_VISION_AI_API_KEY`
- `BATCH_VISION_AI_MODEL`

推荐优先使用阿里多模态模型 `qwen-vl-max-latest`。
