# GitHub Pages 与阿里云部署说明

## 前端

1. 在 GitHub 仓库设置中启用 Pages。
2. 当前仓库已提交 `.env.production`，默认会把生产 API 指向已部署的函数地址；如果要换域名，只需更新该文件里的 `VITE_API_BASE_URL`。
3. 合并到 `main` 后，`.github/workflows/deploy-pages.yml` 会自动构建并发布 `dist/`。
4. 本地调试可复制仓库根目录 `.env.example` 为 `.env`，按需覆盖 `VITE_API_BASE_URL`。

## 后端

1. 进入 `api/`，复制 `api/.env.example` 为 `.env` 并补齐密钥与域名。
2. 运行 `npm install && npm run build`，会同时生成本地运行用的 `dist/` 和函数部署用的 `bundle/`。
3. 使用 Serverless Devs 或 FC 控制台读取 `api/s.yaml` 部署到阿里云函数计算；当前函数入口是 `bundle/index.handler`。
4. 生产环境建议配置 `OBJECT_STORE_DRIVER=oss`。
5. OSS 基础配置至少需要：
   - `OSS_BUCKET`
   - `OSS_REGION`
   - `OSS_ENDPOINT`
6. 本地开发的长期身份使用 `OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`。这对 AK/SK 对应的是一个 `RAM 用户`，它需要：
   - `sts:AssumeRole` 到 `OSS_STS_ROLE_ARN`
   - `oss:GetObject` 到 `acs:oss:*:*:<bucket>/uploads/*`
7. 前端直传使用 `RAM 角色`，由 `OSS_STS_ROLE_ARN` 指定。这个角色需要：
   - `oss:PutObject`
   - `oss:AbortMultipartUpload`
8. `RAM 角色` 的信任策略要允许上面的 `RAM 用户` 来扮演。
9. `OSS_ENDPOINT` 既可以配完整 bucket 域名，也可以配区域 endpoint。当前项目两种都兼容：
   - `https://ai-homework-review-dev-hz01.oss-cn-hangzhou.aliyuncs.com`
   - `oss-cn-hangzhou.aliyuncs.com`
10. `OSS_STS_ENDPOINT` 不是 OSS 域名，保持 `sts.cn-hangzhou.aliyuncs.com`。
11. OCR 识别配置 `OCR_AI_BASE_URL`、`OCR_AI_API_KEY`、`OCR_AI_MODEL`，推荐阿里 `qwen-vl-ocr-latest`。
12. 讲评文本配置 `TEXT_AI_BASE_URL`、`TEXT_AI_API_KEY`、`TEXT_AI_MODEL`，当前推荐 `gpt-5.4`。
13. 班级批量批改配置 `BATCH_VISION_AI_BASE_URL`、`BATCH_VISION_AI_API_KEY`、`BATCH_VISION_AI_MODEL`，当前推荐 `qwen-vl-max-latest`。
14. 如果文本模型网关要求流式补全，可额外配置 `TEXT_AI_STREAM=true`。
15. 将函数计算和前端域名加入 `ALLOWED_ORIGINS` 白名单。
16. `api/.env` 只用于本地开发和部署注入，不要提交到 GitHub。

## 联调建议

1. 本地前端运行 `npm run dev`，本地 API 运行 `npm --prefix api run dev`。
2. 前端默认请求 `http://localhost:8787`，因此本地联调时不必额外配置 `VITE_API_BASE_URL`。
3. 先验证 `/health` 和 `/auth/session`，再联调 `/uploads/policy`、上传目标和 `/grade`。
4. 当前首页会优先走真实接口，需要先填写体验码并上传答题卡图片。
5. `OBJECT_STORE_DRIVER=memory` 时，`/grade` 会在服务端把上传图片转成 data URL；`OBJECT_STORE_DRIVER=oss` 时，会给 OCR 模型传 OSS 签名图片地址。
6. 当前后端采用三类模型：
   - OCR：固定版式答题卡识别
   - Text：固定版式链路的讲评文本生成
   - Batch Vision：班级批量批改链路的多模态过程题评分
7. `npm --prefix api run dev` 和 `npm --prefix api run start` 都会自动读取 `api/.env`。
8. 当前真实验收推荐使用：
   - 体验码 `demo-code`
   - 演示答案按钮自动填充答案
   - 演示答题卡 `scheme-b-filled.png`
9. 班级批量批改页需要额外准备：
   - 一份“同一道题整班答案汇总 PDF”
   - 一份评分标准图片或 PDF
10. 浏览器若因 OSS CORS 或预检失败无法直传，前端会自动回退到后端 `/uploads/direct/*` 代理上传；若你希望始终走浏览器直传，需要在 OSS 上正确配置 CORS。
