# 发布到 GitHub（作者操作指南）

仓库名当前假设为 `dsh-computer-use`、用户名 `acid-creator`，可按需替换。

## 一次性：首次推送

1. 装 Git：https://git-scm.com/ （或用 GitHub Desktop）。
2. 在 GitHub 新建仓库：名称 `dsh-computer-use`，Public，**不要**勾选初始化 README/LICENSE/.gitignore。
3. 在本目录（`dsh-computer-use`）打开 PowerShell，执行：

```powershell
git init
git add .
git commit -m "dsh-computer-use v1.0.0"
git branch -M main
git remote add origin https://github.com/acid-creator/dsh-computer-use.git
git push -u origin main
```

## 第二步：把 commit 填进 market.json

`market.json` 里的 `"commit": "<COMMIT_SHA>"` 必须替换成真实 commit。在本目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\release.ps1
```

再提交一次：

```powershell
git add market.json
git commit -m "publish: pin commit in market.json"
git push
```

> `release.ps1` 会自动读取 `git rev-parse HEAD` 并更新 `market.json` 的 commit 和 publishTimestamp。

## 给用户的两条安装说明（放进 README 即可）

- **一键 Git 直装**：插件页 → 添加插件 → `git+https://github.com/acid-creator/dsh-computer-use.git`
- **Discover 页**：用户先启用「插件市场」bundle，再在设置里加索引 `https://raw.githubusercontent.com/acid-creator/dsh-computer-use/main/market.json`，然后到发现页安装。

## 发布新版本

1. 改 `package.json` 的 `version`（如 `1.0.1`）。
2. `git add . && git commit && git push`
3. 运行 `release.ps1`，再 `git add market.json && git commit && git push`。
