# dsh-computer-use

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 增加 Codex 风格的**电脑操作（computer use）**能力：让 agent 观察并操作本机**桌面**和 **Chromium 浏览器**。

- **桌面控制**：[Cua Driver](https://github.com/trycua/cua) — 截图、点击、输入、滚动、按键、拖拽、列出应用/窗口、读取无障碍树。
- **浏览器控制**：[Playwright MCP](https://github.com/microsoft/playwright-mcp) — 导航、快照、点击、输入、截图。

工具以 `mcp__cua-driver-mcp__*` 和 `mcp__playwright__*` 的名字出现。

## 前置依赖（已自动安装）

两个引擎**不需要手动装**：插件首次激活时会自动检查并补装。

- **`cua-driver`（桌面引擎）**：缺失时自动 `pip install cua-driver`（当前进程会等它装完，通常几十秒）。如果 pip 装完仍不在 PATH，日志会提示你把 pip 的 Scripts 目录加入 PATH。
- **Playwright + Chromium（浏览器引擎）**：**后台**准备，不阻塞启动（首次可能下载一会儿）。

如果自动安装失败（例如机器上没有 Python 或 npx），可以手动执行：

```powershell
pip install cua-driver
npx -y @playwright/mcp@latest --version
npx playwright install chromium
```

安装进度会写到 `%TEMP%\dsh-computer-use-setup`，也可以在 DSH 日志里看到 `computer-use:` 开头的行。

> 遥测：Cua Driver 默认开启无内容的产品遥测，可用 `cua-driver telemetry disable` 关闭。

## 安装

### 方式一：从 GitHub 一行安装

在 DeepSeek Harness 里打开 **插件 → 添加插件**，粘贴：

```
git+https://github.com/acid-creator/dsh-computer-use.git
```

也可以直接对 agent 说：*「安装这个 bundle：git+https://github.com/acid-creator/dsh-computer-use.git」*。

### 方式二：从 Discover 市场页安装

1. 启用 **插件市场** bundle（插件 → 实验性 → 插件市场）。
2. 在 **设置 → 插件 → 插件索引** 里添加：
   ```
   https://raw.githubusercontent.com/acid-creator/dsh-computer-use/main/market.json
   ```
3. 打开 **Discover** 页，搜索 **电脑操作**，点安装。

## 使用

安装后，agent 会多出两套工具。**默认是锁定的**——需要先在输入框的「+ → 指令」里选 **computer-use**（或输入 `/computer-use`）解锁，agent 才会真正操控电脑。解锁后直接说你要做什么，例如：

- 「打开记事本，输入一行字」（桌面）
- 「打开 example.com 并告诉我标题」（浏览器）

桌面控制**默认在后台进行**，不抢焦点。截图期间请关掉敏感窗口。

### `look` 工具：先看控件树，少截图

`look(pid, window_id)` 会先读窗口的 UI Automation 控件树（纯文字，**不截图**）；只有当可操作控件太少（默认少于 3 个）时才自动截图。这样省视觉 token、也省时间。日常观察优先用它。

### 顶部横幅（自动显示 / 隐藏，按 Esc 取消）

插件会自动拉起一个置顶的胶囊横幅：**「DeepSeek Harness 正在使用你的电脑 · 按 Esc 取消」**。agent 操控时出现，任务结束（转 idle）自动隐藏。

- **按 Esc 取消**：立即结束 cua-driver 进程（中断当前会话）并隐藏横幅。插件仍然装着，DSH 会重连一个新会话，下次照常可用。
- 横幅**点击穿透**、不抢焦点，也不进 Alt+Tab。
- 它读取 `%TEMP%\dsh-computer-use-activity` 标记（`busy` = 正在操控，`idle` = 空闲）。

### 安全闸

- **看前先动**：已解锁时，`click` / `type_text` / `press_key` 等动作要求**最近 120 秒内观测过**目标窗口，否则会被拦下，提示先用 `look` 看一眼。
- **只读模式**：`readOnly: true` 时只允许观察，禁止点击/输入。

## 配置

在 profile 的 `cordis.patch.yml` 里按 id 覆盖（不用改源码）：

```yaml
- id: computer-use-activity
  config:
    freshLookSeconds: 120   # 动手前多久内必须观测过屏幕（秒），0 = 不检查
    overlay: true           # 是否显示顶部横幅
    cancelOnEsc: true       # 按 Esc 是否取消（false 时不装键盘钩子）
    toolGate: true          # 是否默认锁定、需 /computer-use 解锁
    readOnly: false         # 只读：只允许观察，禁止点击/输入
```

## 安全

- 两个引擎作为**本地进程**运行，通过 stdio 和 DSH 通信，不联网。
- agent 的对话和工具结果（包括截图）会发给你在 DSH 里配置的模型服务商。
- 桌控 agent 能看屏幕、发输入——只在你接受这一点时使用。关闭插件即可收回权限。

## 说明

- 需要带 `dsh-mcp-client` 插件的 DeepSeek Harness（DSH 自带）。
- 在 DSH `0.2.2-rc.5` 上测试过。本包是**配置型 bundle + 一个小 Host 插件**：它负责接线和门控，不重新实现两个引擎。

## 许可

[MIT](LICENSE)
