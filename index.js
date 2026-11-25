/**
 * Computer-use bundle: observation tool, activity marker, banner, tool gate, command.
 *
 * - `look` tool (code-enforced UIA-first): reads a window's UIA tree via
 *   cua-driver WITHOUT a screenshot; falls back to a screenshot only when the
 *   tree has too few operable controls.
 * - Tool gate: computer-use tools (and `look`) are denied until the user runs
 *   `/computer-use` for that agent; re-locked on idle. Honors `toolGate`.
 * - Safety: "look before you leap" requires a recent observation before acting;
 *   `readOnly` blocks all actions.
 * - Configuration: see the exported `Config` (freshLookSeconds, overlay,
 *   cancelOnEsc, toolGate, readOnly).
 *
 * @module @acid-creator/dsh-computer-use
 */

import { writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const MARKER = join(tmpdir(), 'dsh-computer-use-activity')
const GATE_ERR = join(tmpdir(), 'dsh-computer-use-gate-error')
const COMPUTER_USE = /^mcp__(cua-driver-mcp|playwright)__/
const GATED = /^(look|mcp__(cua-driver-mcp|playwright)__)/
const BANNER = join(dirname(fileURLToPath(import.meta.url)), 'tools', 'banner.ps1')

const HINT =
  '用户接下来会要求你控制电脑和浏览器；请使用电脑操控工具（mcp__cua-driver-mcp__* / mcp__playwright__*）完成。'
const DENY =
  '电脑操控未解锁：请先使用 /computer-use 指令（或「+」菜单里的 computer-use）解锁，再操控电脑。'
const READONLY = '只读模式：当前只能观察，不能点击或输入。'
const OBSERVE =
  /^(look|mcp__cua-driver-mcp__(get_window_state|get_desktop_state|get_browser_state|list_windows|list_apps))$/
const ACT =
  /^mcp__cua-driver-mcp__(click|double_click|right_click|type_text|press_key|hotkey|scroll|drag|set_value|move|invoke_menu|run_steps|run_script)$/
const LOOK_FIRST = '动手前先看一眼：先用 look（或 get_window_state）观察目标窗口，再执行操作。'

const SETUP = join(tmpdir(), 'dsh-computer-use-setup')
const execFileAsync = promisify(execFile)

function setupStatus(text) { try { writeFileSync(SETUP, text) } catch {} }

async function hasBin(name) {
  try {
    await execFileAsync(process.platform === 'win32' ? 'where' : 'which', [name], { windowsHide: true, timeout: 15000 })
    return true
  } catch {
    return false
  }
}

async function runStep(ctx, label, cmd, args, timeout = 600000) {
  ctx.logger?.info?.('computer-use: ' + label)
  setupStatus(label)
  // shell:true so Windows resolves .cmd shims (npx, pip) instead of ENOENT.
  await execFileAsync(cmd, args, { shell: true, windowsHide: true, timeout, maxBuffer: 1 << 24 })
}

/** Install the two engines the bundle connects to, once, if they are missing. */
async function ensureEngines(ctx) {
  if (!(await hasBin('cua-driver'))) {
    const tries = [
      ['python', ['-m', 'pip', 'install', '--user', 'cua-driver']],
      ['py', ['-m', 'pip', 'install', '--user', 'cua-driver']],
      ['pip', ['install', '--user', 'cua-driver']],
    ]
    let installed = false
    for (const [cmd, args] of tries) {
      try { await runStep(ctx, '正在安装 cua-driver（' + cmd + ' pip）…', cmd, args); installed = true; break } catch {}
    }
    if (!installed) {
      ctx.logger?.warn?.('computer-use: 自动安装 cua-driver 失败，请手动执行 pip install cua-driver')
      setupStatus('cua-driver 安装失败，请手动执行 pip install cua-driver')
    } else if (!(await hasBin('cua-driver'))) {
      ctx.logger?.warn?.('computer-use: cua-driver 已装但不在 PATH，请把 pip 的 Scripts 目录加入 PATH')
      setupStatus('cua-driver 已装但不在 PATH')
    }
  }

  // Playwright + Chromium in the background (idempotent; never blocks startup).
  void (async () => {
    try {
      await runStep(ctx, '正在准备 Playwright（npx 拉取中）…', 'npx', ['-y', '@playwright/mcp@latest', '--version'], 180000)
      await runStep(ctx, '正在检查/安装 Playwright Chromium…', 'npx', ['playwright', 'install', 'chromium'], 900000)
      setupStatus('ready')
    } catch (e) {
      ctx.logger?.warn?.('computer-use: Playwright/Chromium 准备失败：' + String((e && e.message) || e))
      setupStatus('Playwright Chromium 准备失败，请手动执行 npx playwright install chromium')
    }
  })()
}

const DEFAULTS = {
  freshLookSeconds: 120,
  overlay: true,
  cancelOnEsc: true,
  toolGate: true,
  readOnly: false,
}

/** Mark a Config field volatile so editing it updates in place (no plugin restart). */
function vol(schema) {
  try { schema.meta.volatile = true } catch {}
  return schema
}

/** Read a config field, following a volatile field's live wrapper. */
function readCfg(value, fallback) {
  try {
    if (value !== null && typeof value === 'object' && typeof value.get === 'function') return value.get()
  } catch {}
  return value === undefined || value === null ? fallback : value
}

// Resolve the host's schema library when available; fall back to plain defaults.
let z = null
try {
  const mod = await import('@deepseek-ai/schemastery')
  z = mod.default ?? mod
} catch {}

export const Config = z
  ? z.object({
    freshLookSeconds: vol(z.number().default(120).description('动手前多久内必须观测过屏幕（秒），0 = 不检查')),
    overlay: vol(z.boolean().default(true).description('是否显示顶部「正在使用你的电脑」横幅')),
    cancelOnEsc: vol(z.boolean().default(true).description('按 Esc 是否取消/中断电脑操控')),
    toolGate: vol(z.boolean().default(true).description('是否默认锁定电脑操控工具，需 /computer-use 解锁')),
    readOnly: vol(z.boolean().default(false).description('只读模式：只允许观察，禁止点击/输入')),
  })
  : undefined

function mark(state) {
  try { writeFileSync(MARKER, state) } catch {}
}

function textOfContent(content) {
  if (!Array.isArray(content)) return ''
  return content.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n')
}

function imageOfContent(content) {
  if (!Array.isArray(content)) return null
  const img = content.find((b) => b && b.type === 'image' && b.attachment)
  return img ? img.attachment : null
}

/** Count UIA rows that carry actions (a rough "operable controls" measure). */
function countOperable(treeText) {
  if (!treeText) return 0
  let n = 0
  for (const line of String(treeText).split('\n')) {
    if (/\[\d+\]/.test(line) && /actions=\[/.test(line)) n++
  }
  return n
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 1_000_000) { reject(new Error('body too large')); req.destroy() }
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

/** Keep only known fields with the right type so the panel cannot corrupt the config. */
function sanitizePatch(patch) {
  const out = {}
  if (!patch || typeof patch !== 'object') return out
  if (typeof patch.freshLookSeconds === 'number' && patch.freshLookSeconds >= 0) {
    out.freshLookSeconds = Math.round(patch.freshLookSeconds)
  }
  for (const key of ['overlay', 'cancelOnEsc', 'toolGate', 'readOnly']) {
    if (typeof patch[key] === 'boolean') out[key] = patch[key]
  }
  return out
}

function makeLookTool(ctx) {
  return {
    name: 'look',
    description:
      '查看窗口：先读 UI Automation 控件树（纯文字，不截图）；只有可操作控件太少（默认少于 3 个）时才自动截图。日常观察优先用它。',
    parameters: {
      type: 'object',
      properties: {
        pid: { type: 'number', description: '目标进程 ID。' },
        window_id: { type: 'number', description: '目标窗口 ID。' },
        minControls: { type: 'number', description: '可操作控件少于该数量时才截图（默认 3）。' },
        maxElements: { type: 'number', description: '最多读取多少个控件树节点（默认 200）。' },
      },
      required: ['pid', 'window_id'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const parts = [{ type: 'text', text: String((value && value.text) || '') }]
        if (value && value.image) parts.push({ type: 'image', attachment: value.image })
        return parts
      },
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const threshold = args.minControls ?? 3
      const maxElements = args.maxElements ?? 200
      const makeCall = (includeScreenshot) => ({
        type: 'tool-call',
        id: 'look-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2),
        name: 'mcp__cua-driver-mcp__get_window_state',
        arguments: JSON.stringify({
          pid: args.pid,
          window_id: args.window_id,
          include_screenshot: includeScreenshot,
          max_elements: maxElements,
        }),
      })
      const run = async (includeScreenshot) => {
        const batch = await ctx.tools.execute({ calls: [makeCall(includeScreenshot)], signal: exec.signal, agent: exec.agent })
        const r = batch && batch.results && batch.results[0] && batch.results[0].result
        if (!r) throw new Error('look：cua-driver 没有返回结果')
        if (r.isError) throw new Error('look 失败：' + textOfContent(r.content))
        return r.content
      }

      const treeContent = await run(false)
      const treeText = textOfContent(treeContent)
      const controls = countOperable(treeText)
      if (controls >= threshold) {
        return { mode: 'tree', text: treeText, controls }
      }

      let text = treeText
      let image = null
      try {
        const shotContent = await run(true)
        text = textOfContent(shotContent) || treeText
        image = imageOfContent(shotContent)
      } catch {}
      const note = image
        ? ''
        : '\n\n[UIA 只有 ' + controls + ' 个可操作控件，不够；如需看画面请调用 get_window_state(include_screenshot:true) 或 get_desktop_state。]'
      return { mode: image ? 'image' : 'tree', text: text + note, controls, image: image || null }
    },
  }
}

export const name = 'computer-use-activity'
export const inject = ['tools']

export async function apply(ctx, config) {
  // Live config: volatile fields read through their wrapper; others follow the
  // panel's in-memory snapshot.
  const live = {}
  for (const key of Object.keys(DEFAULTS)) live[key] = readCfg(config && config[key], DEFAULTS[key])
  const readLive = (key) => {
    const raw = config && config[key]
    try {
      if (raw !== null && typeof raw === 'object' && typeof raw.get === 'function') return raw.get()
    } catch {}
    return live[key]
  }

  // One-time engine setup, so "install the plugin" is enough to use it.
  try {
    await ensureEngines(ctx)
  } catch (e) {
    ctx.logger?.warn?.('computer-use: 引擎自检失败：' + String((e && e.message) || e))
  }

  mark('idle')

  let child = null
  if (readLive('overlay')) {
    try {
      const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', BANNER]
      if (!readLive('cancelOnEsc')) args.push('-NoEsc')
      child = spawn('powershell', args, { stdio: 'ignore', windowsHide: true })
    } catch {}
  }
  ctx.effect(() => () => { try { if (child) child.kill() } catch {} })

  try {
    ctx.effect(() => ctx.tools.register(makeLookTool(ctx)))
  } catch (e) {
    try { writeFileSync(GATE_ERR, 'look 注册失败：' + String((e && e.message) || e)) } catch {}
  }

  const unlocked = new Set()
  const lastObserve = new Map()

  // Record fresh observations so the guard can require "look before you leap".
  ctx.on('tools/result', (exec, result) => {
    try {
      if (!exec || typeof exec.name !== 'string') return
      if (OBSERVE.test(exec.name) && result && result.isError !== true) lastObserve.set(exec.agent, Date.now())
    } catch {}
  })

  try {
    const disposeGuard = ctx.tools.guard((exec) => {
      try {
        if (!exec || typeof exec.name !== 'string' || !GATED.test(exec.name)) return undefined
        if (readLive('toolGate') && !unlocked.has(exec.agent)) return DENY
        if (readLive('readOnly') && ACT.test(exec.name)) return READONLY
        const fresh = Number(readLive('freshLookSeconds'))
        const freshMs = fresh > 0 ? fresh * 1000 : 0
        if (ACT.test(exec.name) && freshMs > 0) {
          const seen = lastObserve.get(exec.agent) || 0
          if (Date.now() - seen > freshMs) return LOOK_FIRST
        }
        return undefined
      } catch {
        return undefined
      }
    })
    ctx.effect(() => () => { try { disposeGuard() } catch {} })
  } catch (e) {
    try { writeFileSync(GATE_ERR, String((e && e.message) || e)) } catch {}
  }

  // Settings panel API: read/write the live config from the Web GUI.
  ctx.inject(['webServer'], (wc) => {
    let editor = undefined
    try { editor = ctx.get('configEditor') } catch {}
    let settings = undefined
    try { settings = ctx.get('settings') } catch {}
    const entry = ctx.fiber && ctx.fiber.entry
    const entryId = entry && entry.options ? entry.options.id : undefined
    try {
      return wc.webServer.register({
        kind: 'exact',
        path: '/api/computer-use/config',
        handler: async (req, res) => {
          try {
            if (req.method === 'GET' || req.method === 'HEAD') {
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
              res.end(JSON.stringify({ ok: true, config: live }))
              return
            }
            if (req.method === 'POST') {
              let patch
              try { patch = sanitizePatch(JSON.parse(await readBody(req))) } catch {
                res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
                res.end(JSON.stringify({ ok: false, error: '请求体不是合法 JSON' }))
                return
              }
              Object.assign(live, patch)
              let persisted = false
              let saveError = undefined
              if (settings && typeof settings.update === 'function' && entryId) {
                // Volatile fields update in place — no plugin restart, unlock preserved.
                try { await settings.update(entryId, patch); persisted = true } catch (e) { saveError = String((e && e.message) || e) }
              }
              if (!persisted && editor && entry) {
                // Fallback: persist through the config editor (restarts the plugin).
                try { await editor.edit(entry, (current) => ({ ...current, ...patch })); persisted = true; saveError = undefined } catch (e) { saveError = String((e && e.message) || e) }
              }
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ ok: true, config: live, persisted, ...(saveError === undefined ? {} : { saveError }) }))
              return
            }
            res.writeHead(405, { allow: 'GET, HEAD, POST' })
            res.end()
          } catch (e) {
            try {
              res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }))
            } catch {}
          }
        },
      })
    } catch (e) {
      ctx.logger?.warn?.('computer-use: 配置路由注册失败：' + String((e && e.message) || e))
      return undefined
    }
  })

  ctx.on('tools/pre-execute', async (exec, next) => {
    try {
      if (exec && typeof exec.name === 'string' && GATED.test(exec.name) && unlocked.has(exec.agent)) mark('busy')
    } catch {}
    return next()
  })

  ctx.on('agent/status', (payload) => {
    if (!payload) return
    if (payload.status === 'idle') {
      mark('idle')
      unlocked.delete(payload.agent)
    }
  })

  ctx.on('agent/disposed', ({ agent }) => { unlocked.delete(agent); lastObserve.delete(agent) })

  ctx.inject(['commands'], (cmdCtx) => cmdCtx.commands.register({
    name: 'computer-use',
    description: '控制电脑和浏览器',
    handler: ({ agent }) => {
      unlocked.add(agent)
      try {
        agent.inject({
          role: 'user',
          id: randomUUID(),
          content: [{ type: 'text', text: HINT }],
          source: { kind: 'computer-use' },
        })
      } catch {}
      return { kind: 'success', text: '已解锁电脑操控，请说出你的任务。' }
    },
  }))

  ctx.inject(['systemPrompt'], (spCtx) => {
    try {
      return spCtx.systemPrompt.section({
        name: 'computer-use-gate',
        order: 900,
        text: '电脑操控工具（mcp__cua-driver-mcp__*、mcp__playwright__*）默认不可用；只有当用户使用 /computer-use（或「+」菜单里的 computer-use）解锁后才能调用。不要在其他情况下主动尝试操控电脑或浏览器。',
      })
    } catch {
      return undefined
    }
  })

  ctx.inject(['systemPrompt'], (spCtx) => {
    try {
      return spCtx.systemPrompt.section({
        name: 'computer-use-observe',
        order: 901,
        text: '查看屏幕时优先用 look 工具（先读 UIA 控件树，够用就不截图，不够才自动截图）；也可以用 get_window_state(pid, window_id, include_screenshot:false) 只要控件树。树里有可操作的 element_token 时直接用它 click/type_text/press_key。只有需要像素/图片坐标或 look 提示 UIA 不够时，才用 include_screenshot:true 或 get_desktop_state 截整屏；画面没明显变化时不要重复截图。',
      })
    } catch {
      return undefined
    }
  })
}
