# Cloud Run 构建失败（Buildpacks export EOF）

## 现象

Cloud Build 日志里出现 `gcr.io/k8s-skaffold/pack`、`google.nodejs.runtime`，`npm run build` 已成功，但在 **EXPORTING** 阶段报错：

```text
failed to export: ... Get "http://%2Fvar%2Frun%2Fdocker.sock/...": EOF
```

这是 Buildpacks 在 Cloud Build 上导出镜像时的已知不稳定问题，与应用代码无关。

## 推荐做法：改用仓库内 Docker + `cloudbuild.yaml`

本仓库已包含：

- `Dockerfile`（Next.js `standalone`）
- `cloudbuild.yaml`（`docker build` → push → `gcloud run deploy`）

### 在 Google Cloud Console 中切换（只需做一次）

1. 打开 [Cloud Run](https://console.cloud.google.com/run) → 选择服务 **portfolio-tracker**。
2. **持续部署** → **修改持续部署**（或重新连接 GitHub 时的构建配置）。
3. **构建类型** 选其一：
   - **Cloud Build 配置文件**：`cloudbuild.yaml`（推荐，含自动 deploy），或
   - **Dockerfile**：根目录 `Dockerfile`（若控制台不提供 yaml 选项）。
4. 保存并 **重新运行** 一次部署（或推送新 commit）。

切换后，日志里应出现 `gcr.io/cloud-builders/docker` 和 `docker build`，而不再是 `pack` / `buildpacks/builder`。

### 本地验证 Docker 镜像（可选）

```bash
docker build -t portfolio-tracker:test .
docker run --rm -p 8080:8080 -e NEXT_PUBLIC_SUPABASE_URL=... portfolio-tracker:test
```

## 若仍使用 Buildpacks

不建议；若必须临时重试，可在 Cloud Build 历史里 **重新运行** 构建（有时是瞬时 EOF），但问题常会复发。长期请改用 Docker 方案。
