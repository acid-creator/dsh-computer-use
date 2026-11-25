window.__ModuleLoader__.load({
  id: '@acid-creator/dsh-computer-use',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const API = '/api/computer-use/config'

    function Row({ label, children }) {
      return h('div', {
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, padding: '12px 0', borderBottom: '1px solid rgba(127,127,127,.18)',
        },
      }, h('span', { style: { fontSize: 13 } }, label), children)
    }

    function Toggle({ on, onChange }) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': on,
        onClick: () => onChange(!on),
        style: {
          minWidth: 52, padding: '4px 10px', borderRadius: 999,
          border: '1px solid rgba(127,127,127,.4)',
          background: on ? '#2563eb' : 'rgba(127,127,127,.18)',
          color: on ? '#fff' : 'inherit', cursor: 'pointer', fontSize: 12,
        },
      }, on ? '开' : '关')
    }

    function Section() {
      const [cfg, setCfg] = React.useState(null)
      const [msg, setMsg] = React.useState('')

      React.useEffect(() => {
        let alive = true
        fetch(API, { credentials: 'same-origin' })
          .then((r) => r.json())
          .then((j) => { if (alive) { if (j.ok) setCfg(j.config); else setMsg('读取失败') } })
          .catch(() => { if (alive) setMsg('读取失败') })
        return () => { alive = false }
      }, [])

      const save = async (patch) => {
        setMsg('保存中…')
        try {
          const r = await fetch(API, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(patch),
          })
          const j = await r.json()
          if (j.ok) {
            setCfg(j.config)
            setMsg(j.persisted ? '已保存' : '已应用（未能写回配置文件，重启后可能还原）')
          } else {
            setMsg('保存失败：' + (j.error || '未知错误'))
          }
        } catch (e) {
          setMsg('保存失败：' + String(e))
        }
      }

      if (!cfg) return h('div', { style: { padding: 16, color: 'inherit', opacity: 0.7 } }, msg || '加载中…')

      const setNum = (value) => setCfg({ ...cfg, freshLookSeconds: Number(value) })

      return h('div', { style: { padding: '8px 4px' } },
        h('h3', { style: { margin: '0 0 4px' } }, '电脑操作'),
        h('p', { style: { margin: '0 0 12px', opacity: 0.6, fontSize: 12 } },
          '门控、只读和观测窗口立即生效；横幅与按 Esc 取消在插件重载后生效。'),
        h(Row, { label: '默认锁定（需 /computer-use 解锁）' },
          h(Toggle, { on: !!cfg.toolGate, onChange: (v) => save({ toolGate: v }) })),
        h(Row, { label: '只读模式（只许看，不许动）' },
          h(Toggle, { on: !!cfg.readOnly, onChange: (v) => save({ readOnly: v }) })),
        h(Row, { label: '显示顶部横幅' },
          h(Toggle, { on: !!cfg.overlay, onChange: (v) => save({ overlay: v }) })),
        h(Row, { label: '按 Esc 取消' },
          h(Toggle, { on: !!cfg.cancelOnEsc, onChange: (v) => save({ cancelOnEsc: v }) })),
        h(Row, { label: '动手前必须观测（秒，0 = 不检查）' },
          h('input', {
            type: 'number', min: 0, value: cfg.freshLookSeconds,
            onChange: (e) => setNum(e.target.value),
            onBlur: (e) => save({ freshLookSeconds: Number(e.target.value) }),
            style: { width: 80, padding: '4px 6px', borderRadius: 6, border: '1px solid rgba(127,127,127,.4)' },
          })),
        h('div', { style: { marginTop: 12, fontSize: 12, color: msg.startsWith('保存失败') ? '#dc2626' : '#16a34a' } }, msg),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', function* () {
          yield ctx.slots.register({
            name: 'settings.section',
            id: 'computer-use',
            order: 60,
            label: () => '电脑操作',
          }, Section)
        })
      },
    }
  },
})
