# dsh-computer-use

Codex-style **computer use** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): let an agent observe and operate the local desktop **and** a Chromium browser through two MCP tool sets.

- **Desktop control** via [Cua Driver](https://github.com/trycua/cua) — screenshot, click, type, scroll, keys, drag, list apps/windows, read the accessibility tree.
- **Browser automation** via [Playwright MCP](https://github.com/microsoft/playwright-mcp) — navigate, snapshot, click, type, screenshot.

Tools are exposed as `mcp__cua-driver-mcp__*` and `mcp__playwright__*`.

## Prerequisites

Install the two engines this bundle connects to (they are **not** bundled):

```powershell
# Desktop control (Windows/macOS/Linux)
pip install cua-driver

# Browser automation (downloads Playwright + Chromium on first run)
npx -y @playwright/mcp@latest --version
npx playwright install chromium
```

`cua-driver` must be on `PATH` (check with `cua-driver --version`).

> Telemetry: Cua Driver has content-free product telemetry on by default. Turn it off with `cua-driver telemetry disable`.

## Install

### Option A — one-liner from GitHub

In DeepSeek Harness, open **Plugins → Add plugin** and paste:

```
git+https://github.com/acid-creator/dsh-computer-use.git
```

Or ask the agent: *"install the bundle `git+https://github.com/acid-creator/dsh-computer-use.git`"*.

### Option B — Discover page (market index)

1. Enable the **Plugin market** bundle (Plugins → Experimental → Plugin market).
2. In **Settings → Plugins → Plugin indexes**, add:
   ```
   https://raw.githubusercontent.com/acid-creator/dsh-computer-use/main/market.json
   ```
3. Open the **Discover** tab, search for **Computer use**, and click **Install**.

## Usage

After installation, the agent gains two tool groups. Just describe what you want in plain language, for example:

- "Open Notepad and type a line" (desktop)
- "Open example.com and tell me the title" (browser)

Desktop control is **background-first** (it does not steal focus). Keep sensitive windows closed while the agent captures screenshots.

## Security

- The two engines run as **local processes**; they talk to DSH over stdio, not the network.
- The agent's conversation and tool results (including any screenshots you ask for) are sent to the model provider you configured in DSH.
- A desktop-control agent can see the screen and send input — use it only when you are comfortable with that. Revoke by turning the plugin off.

## Notes

- Requires DeepSeek Harness with the `dsh-mcp-client` plugin (ships with DSH).
- Tested on DSH `0.2.2-rc.5`. This is a configuration-only bundle: it wires up the engines, it does not reimplement them.

## License

[MIT](LICENSE)
