import React, { useState } from 'react';
import { GitBranch, Terminal, Download, Copy, Check, CheckCircle2, ArrowRight, ShieldCheck, Zap, Layers, RefreshCw, Cpu } from 'lucide-react';

export const GitHubPushSection: React.FC<{ onGoToFirmware: () => void }> = ({ onGoToFirmware }) => {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const flashCommand = `esptool.py --chip esp32s3 -b 921600 write_flash 0x0 merged.bin`;

  const gitPushSteps = `# 1. Initialize git repo in your project folder
git init
git add .
git commit -m "feat: complete ESP32-S3 N16R8 WiFi audio receiver with merged.bin CI"

# 2. Add your GitHub repository remote
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/esp32s3-wifi-audio-receiver.git

# 3. Push to trigger automatic PlatformIO + merged.bin build!
git push -u origin main`;

  return (
    <div className="space-y-8">
      {/* Banner */}
      <div className="border border-slate-800 bg-slate-900/40 rounded-lg p-6 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-2">
              <GitBranch className="w-4 h-4" />
              <span>CI/CD Automation Pipeline</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400">Single Flashable merged.bin Ready</span>
            </div>
            <h2 className="text-xl lg:text-2xl font-bold text-white tracking-tight">
              GitHub Direct Push &amp; Automatic <code className="text-cyan-400">merged.bin</code> Generator
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl mt-1 leading-relaxed">
              When you push this repository to GitHub, a <strong>GitHub Actions CI workflow</strong> automatically spins up Ubuntu, compiles your code with PlatformIO, and stitches all partitions into a single, unified <strong><code className="text-white">merged.bin</code></strong> file.
            </p>
          </div>

          <button
            onClick={onGoToFirmware}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded transition-colors whitespace-nowrap"
          >
            <span>Browse All Repo Files</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Visual Flash Map: Why merged.bin is amazing */}
      <div className="border border-slate-800 bg-slate-900/30 p-6 lg:p-8 rounded-lg space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          Inside <code className="text-cyan-300 font-mono">merged.bin</code>: Memory Layout (16MB Flash)
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
          Standard ESP32 builds produce 3 or 4 separate files (<code className="text-slate-200">bootloader.bin</code>, <code className="text-slate-200">partitions.bin</code>, <code className="text-slate-200">boot_app0.bin</code>, and <code className="text-slate-200">firmware.bin</code>) requiring tricky memory offset addresses. The CI pipeline stitches them into <strong>one single <code className="text-white">merged.bin</code></strong> flashed directly at <strong><code className="text-amber-400 font-mono">0x0</code></strong>:
        </p>

        {/* Memory Bar Diagram */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 pt-2 font-mono text-xs">
          <div className="p-3 bg-slate-950 border border-amber-500/40 rounded flex flex-col justify-between">
            <span className="text-[10px] text-amber-400 uppercase font-semibold">Offset: 0x0000</span>
            <span className="text-white font-bold my-1">bootloader.bin</span>
            <span className="text-[10px] text-slate-400">ESP32-S3 ROM bootloader</span>
          </div>

          <div className="p-3 bg-slate-950 border border-emerald-500/40 rounded flex flex-col justify-between">
            <span className="text-[10px] text-emerald-400 uppercase font-semibold">Offset: 0x8000</span>
            <span className="text-white font-bold my-1">partitions.bin</span>
            <span className="text-[10px] text-slate-400">16MB Dual OTA table</span>
          </div>

          <div className="p-3 bg-slate-950 border border-purple-500/40 rounded flex flex-col justify-between">
            <span className="text-[10px] text-purple-400 uppercase font-semibold">Offset: 0xe000</span>
            <span className="text-white font-bold my-1">boot_app0.bin</span>
            <span className="text-[10px] text-slate-400">OTA boot state selector</span>
          </div>

          <div className="p-3 bg-slate-950 border border-cyan-500/40 rounded flex flex-col justify-between">
            <span className="text-[10px] text-cyan-400 uppercase font-semibold">Offset: 0x10000</span>
            <span className="text-white font-bold my-1">firmware.bin</span>
            <span className="text-[10px] text-slate-400">Audio receiver app code</span>
          </div>
        </div>
      </div>

      {/* Two Execution Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 1: Git Push Commands */}
        <div className="border border-slate-800 bg-slate-900/30 p-6 rounded-lg flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                Step 1: Direct GitHub Push
              </span>
              <button
                onClick={() => copyToClipboard(gitPushSteps, 'git')}
                className="flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300"
              >
                {copiedCmd === 'git' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCmd === 'git' ? 'Copied!' : 'Copy Shell Script'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-300 mb-3">
              Push all files from the <strong>Firmware Code</strong> tab into your new GitHub repository:
            </p>
            <div className="p-4 bg-slate-950 rounded border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto leading-relaxed">
              <pre>{gitPushSteps}</pre>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/80 text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>GitHub Actions triggers automatically on push!</span>
          </div>
        </div>

        {/* Panel 2: Flashing merged.bin via 1 Command */}
        <div className="border border-slate-800 bg-slate-900/30 p-6 rounded-lg flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Step 2: Flash merged.bin with 1 Command
              </span>
              <button
                onClick={() => copyToClipboard(flashCommand, 'flash')}
                className="flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300"
              >
                {copiedCmd === 'flash' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCmd === 'flash' ? 'Copied!' : 'Copy Command'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-300 mb-3">
              Download the <code className="text-cyan-300 font-mono">merged.bin</code> artifact from your GitHub Actions run, plug in your ESP32-S3 over USB, and run:
            </p>
            <div className="p-4 bg-slate-950 rounded border border-slate-800 font-mono text-xs text-amber-300 overflow-x-auto">
              <code>{flashCommand}</code>
            </div>
            <div className="mt-3 text-xs text-slate-400 space-y-1">
              <div>• <strong>Offset:</strong> <code>0x0</code> (no separate partition math).</div>
              <div>• <strong>Baud Rate:</strong> <code>921600</code> for blazing-fast 10-second flashing.</div>
              <div>• <strong>Target Chip:</strong> <code>esp32s3</code> (N16R8 dual-core).</div>
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded border border-slate-800 text-[11px] text-slate-400">
            <strong className="text-white">Web Browser Flasher Alternative:</strong> You can also drag <code className="text-cyan-300 font-mono">merged.bin</code> into the online <a href="https://espressif.github.io/esptool-js/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline">Espressif Web Serial Flasher</a> to flash in Chrome or Edge without installing Python or esptool!
          </div>
        </div>
      </div>
    </div>
  );
};
