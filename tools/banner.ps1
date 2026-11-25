<#
  banner.ps1 - topmost "DeepSeek Harness is using your computer" banner.

  Shows a click-through, always-on-top rounded banner at the top of the primary
  screen WHILE a computer-use tool is running, and hides it when the agent's
  turn finishes (auto). Press Esc at any time to cancel: it terminates the
  cua-driver MCP process and hides the banner.

  It reads the activity marker that the bundle's Host plugin writes to
  %TEMP%\dsh-computer-use-activity ("busy" / "idle").

  Usage:
    powershell -ExecutionPolicy Bypass -File .\tools\banner.ps1
    powershell -ExecutionPolicy Bypass -File .\tools\banner.ps1 -DryRun   # log only

  Keep it running in the background while you use computer use.
  This file is ASCII-only; the on-screen Chinese is embedded as \u escapes.
#>
param(
  [switch]$DryRun,
  [switch]$NoEsc,
  [string]$Text = ''
)

$ErrorActionPreference = 'Stop'

$logPath = Join-Path $PSScriptRoot 'panic.log'
$markerPath = Join-Path $env:TEMP 'dsh-computer-use-activity'
$dry = if ($DryRun) { 'true' } else { 'false' }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$csharp = @'
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class ComputerUseBanner {
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int VK_ESCAPE = 0x1B;
    private const int LLKHF_INJECTED = 0x10;
    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_TRANSPARENT = 0x20;
    private const int WS_EX_TOOLWINDOW = 0x80;
    private const int WS_EX_NOACTIVATE = 0x08000000;

    private const string DefaultText =
        "DeepSeek Harness \u6B63\u5728\u4F7F\u7528\u4F60\u7684\u7535\u8111 " +
        "\u00B7 \u6309 Esc \u53D6\u6D88";

    private const string DefaultTextNoEsc =
        "DeepSeek Harness \u6B63\u5728\u4F7F\u7528\u4F60\u7684\u7535\u8111";

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct KBDLLHOOKSTRUCT { public uint vkCode; public uint scanCode; public uint flags; public uint time; public IntPtr dwExtraInfo; }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);
    [DllImport("user32.dll")]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);
    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    private static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")]
    private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    private static LowLevelKeyboardProc _proc = HookCallback;
    private static IntPtr _hookID = IntPtr.Zero;
    private static readonly object Gate = new object();
    private static DateTime _lastFire = DateTime.MinValue;
    private static bool _dry = false;
    private static bool _esc = true;
    private static string _logPath = null;
    private static string _markerPath = null;
    private static Form _form = null;

    public static void Run(bool dry, string logPath, string markerPath, string text, bool esc) {
        _dry = dry;
        _esc = esc;
        _logPath = logPath;
        _markerPath = markerPath;
        string shown = string.IsNullOrEmpty(text) ? (_esc ? DefaultText : DefaultTextNoEsc) : text;

        var form = new Form();
        form.FormBorderStyle = FormBorderStyle.None;
        form.TopMost = true;
        form.ShowInTaskbar = false;
        form.StartPosition = FormStartPosition.Manual;
        form.Size = new Size(520, 46);
        var screen = Screen.PrimaryScreen.Bounds;
        form.Location = new Point((screen.Width - form.Width) / 2, 36);
        form.BackColor = Color.FromArgb(24, 29, 39);
        form.Region = new Region(RoundedRect(new Rectangle(0, 0, form.Width, form.Height), form.Height / 2));
        form.Visible = false;
        form.Paint += (s, e) => Draw(e.Graphics, shown, form);
        _form = form;

        form.HandleCreated += (s, e) => {
            try {
                int ex = GetWindowLong(form.Handle, GWL_EXSTYLE);
                SetWindowLong(form.Handle, GWL_EXSTYLE, ex | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE);
            } catch { }
            if (_esc) {
                _hookID = SetWindowsHookEx(WH_KEYBOARD_LL, _proc, IntPtr.Zero, 0);
                if (_hookID == IntPtr.Zero) {
                    try { File.AppendAllText(_logPath, DateTime.Now.ToString("s") + " hook install failed err=" + Marshal.GetLastWin32Error() + Environment.NewLine); } catch { }
                }
            }
        };

        var timer = new System.Windows.Forms.Timer { Interval = 500 };
        timer.Tick += (s, e) => Poll();
        timer.Start();

        var _ = form.Handle; // force handle creation now (styles + hook)

        Application.Run();
    }

    private static GraphicsPath RoundedRect(Rectangle r, int radius) {
        var path = new GraphicsPath();
        int d = radius * 2;
        path.AddArc(r.X, r.Y, d, d, 180, 90);
        path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static void Draw(Graphics g, string text, Form f) {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

        var full = new Rectangle(0, 0, f.Width, f.Height);
        using (var path = RoundedRect(full, f.Height / 2))
        using (var bg = new SolidBrush(Color.FromArgb(24, 29, 39))) {
            g.FillPath(bg, path);
        }

        var inset = new Rectangle(0, 0, f.Width - 1, f.Height - 1);
        using (var bpath = RoundedRect(inset, (f.Height - 1) / 2))
        using (var pen = new Pen(Color.FromArgb(58, 74, 96), 1f)) {
            g.DrawPath(pen, bpath);
        }

        using (var dot = new SolidBrush(Color.FromArgb(52, 211, 122))) {
            g.FillEllipse(dot, 19, (f.Height - 12) / 2, 12, 12);
        }

        using (var font = new Font("Microsoft YaHei", 11f, FontStyle.Bold))
        using (var sf = new StringFormat { LineAlignment = StringAlignment.Center, Alignment = StringAlignment.Near, Trimming = StringTrimming.EllipsisCharacter })
        using (var txt = new SolidBrush(Color.FromArgb(244, 246, 250))) {
            g.DrawString(text, font, txt, new RectangleF(44, 0, f.Width - 56, f.Height), sf);
        }
    }

    private static void Poll() {
        bool busy = false;
        try {
            if (File.Exists(_markerPath)) busy = File.ReadAllText(_markerPath).Trim() == "busy";
        } catch { }
        try {
            if (_form != null && _form.Visible != busy) _form.Visible = busy;
        } catch { }
    }

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0 && wParam.ToInt32() == WM_KEYDOWN) {
            KBDLLHOOKSTRUCT kb = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
            // Only a real (physical) Esc cancels. Synthetic Esc injected by the
            // agent itself (e.g. cua-driver press_key) must pass through untouched.
            if (kb.vkCode == VK_ESCAPE && (kb.flags & LLKHF_INJECTED) == 0) {
                Fire();
            }
        }
        return CallNextHookEx(_hookID, nCode, wParam, lParam);
    }

    private static void Fire() {
        lock (Gate) {
            var now = DateTime.UtcNow;
            if ((now - _lastFire).TotalMilliseconds < 250) return;
            _lastFire = now;
        }
        StopControl();
        try { File.WriteAllText(_markerPath, "idle"); } catch { }
        try { if (_form != null) _form.Visible = false; } catch { }
    }

    private static void StopControl() {
        try {
            var killed = new System.Text.StringBuilder();
            foreach (var p in Process.GetProcessesByName("cua-driver")) {
                try {
                    killed.Append(p.Id).Append(',');
                    if (!_dry) p.Kill();
                } catch { }
            }
            try { File.AppendAllText(_logPath, DateTime.Now.ToString("s") + " fired dry=" + _dry + " killed=" + killed.ToString() + Environment.NewLine); } catch { }
        } catch { }
    }
}
'@
Add-Type -TypeDefinition $csharp -ReferencedAssemblies @('System.Windows.Forms', 'System.Drawing')

[ComputerUseBanner]::Run($DryRun, $logPath, $markerPath, $Text, (-not $NoEsc))
