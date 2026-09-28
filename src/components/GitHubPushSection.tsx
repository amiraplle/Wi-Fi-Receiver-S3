import React, { useState } from 'react';
import { GitBranch, Terminal, Download, Copy, Check, CheckCircle2, ArrowRight, ShieldCheck, Zap, Layers, RefreshCw, Cpu, FolderArchive, ExternalLink, HelpCircle } from 'lucide-react';
import JSZip from 'jszip';
import { FIRMWARE_FILES } from '../data/firmwareCode.ts';

export const GitHubPushSection: React.FC<{ onGoToFirmware: () => void }> = ({ onGoToFirmware }) => {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState(false);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const handleDownloadFullZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();

      // Add all firmware, CI/CD workflow, partition table, platformio.ini, scripts, and readme
      FIRMWARE_FILES.forEach((f) => {
        zip.file(f.filename, f.content);
      });

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'esp32s3-wifiaudio-receiver-repo.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to create zip:', err);
    } finally {
      setIsZipping(false);
    }
  };

  const flashCommand = `esptool.py --chip esp32s3 -b 921600 write_flash 0x0 merged.bin`;

  const gitPushSteps = `# 1. Download & Unzip this project on your PC
cd esp32s3-wifiaudio-receiver-repo

# 2. Initialize your git repository
git init
git add .
git commit -m "feat: complete ESP32-S3 N16R8 WiFi audio receiver with merged.bin CI"

# 3. Create a repo on github.com, then link & push:
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/esp32s3-wifi-audio-receiver.git
git push -u origin main`;

  return (
    <div className="space-y-8">
      {/* Banner with Clear Explainer */}
      <div className="border border-slate-800 bg-slate-900/40 rounded-lg p-6 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-2">
              <GitBranch className="w-4 h-4" />
              <span>GitHub CI/CD Automation Pipeline</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400">Automatic merged.bin Build</span>
            </div>
            <h2 className="text-xl lg:text-2xl font-bold text-white tracking-tight">
              Why Hasn't GitHub Built Anything Yet?
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl mt-1 leading-relaxed">
              GitHub does not automatically know about your local project until you <strong>create a repository under your own GitHub account and push the code files</strong>. As soon as you push, GitHub Actions automatically starts an Ubuntu runner, compiles PlatformIO, and builds <strong><code className="text-cyan-400">merged.bin</code></strong>!
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadFullZip}
              disabled={isZipping}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-lg transition-colors whitespace-nowrap"
            >
              <FolderArchive className="w-4 h-4" />
              <span>{isZipping ? 'Packing Zip...' : '1-Click Download Repository (.zip)'}</span>
            </button>
            <button
              onClick={onGoToFirmware}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors whitespace-nowrap"
            >
              <span>View Source Files</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 3 Step Visual Guide to see GitHub Build */}
      <div className="border border-slate-800 bg-slate-900/30 p-6 rounded-lg space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          3 Steps to Trigger the GitHub Actions Build
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Step 1 */}
          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-cyan-400 font-bold">STEP 01</span>
              <Download className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <div className="text-sm font-semibold text-white">Download &amp; Unzip</div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Click the green button above to download <code className="text-slate-300">esp32s3-wifiaudio-receiver-repo.zip</code> containing all code, <code className="text-cyan-300">.github/workflows</code>, and scripts.
            </p>
          </div>

          {/* Step 2 */}
          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-cyan-400 font-bold">STEP 02</span>
              <GitBranch className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <div className="text-sm font-semibold text-white">Push to your GitHub</div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Create a new repo on <a href="https://github.com/new" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline">github.com/new</a> and run <code className="text-cyan-300">git push -u origin main</code> in the folder.
            </p>
          </div>

          {/* Step 3 */}
          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-emerald-400 font-bold">STEP 03</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-sm font-semibold text-white">Watch GitHub Build</div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Open the <strong>Actions</strong> tab on your GitHub repo. You will see <code className="text-white">Build ESP32-S3 Firmware &amp; merged.bin</code> running live and producing your artifact!
            </p>
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
                Shell Commands to Push
              </span>
              <button
                onClick={() => copyToClipboard(gitPushSteps, 'git')}
                className="flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300"
              >
                {copiedCmd === 'git' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCmd === 'git' ? 'Copied!' : 'Copy Script'}</span>
              </button>
            </div>
            <div className="p-4 bg-slate-950 rounded border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto leading-relaxed">
              <pre>{gitPushSteps}</pre>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/80 text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>GitHub Actions triggers automatically the moment git push finishes!</span>
          </div>
        </div>

        {/* Panel 2: Flashing merged.bin via 1 Command */}
        <div className="border border-slate-800 bg-slate-900/30 p-6 rounded-lg flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                After Build: Flash merged.bin in 1 Step
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
              Under your GitHub repo's <strong>Actions</strong> tab, click the completed workflow run, download the <code className="text-cyan-300 font-mono">esp32-s3-firmware-binaries</code> artifact, plug in your ESP32-S3 over USB, and run:
            </p>
            <div className="p-4 bg-slate-950 rounded border border-slate-800 font-mono text-xs text-amber-300 overflow-x-auto">
              <code>{flashCommand}</code>
            </div>
            <div className="mt-3 text-xs text-slate-400 space-y-1">
              <div>• <strong>Offset:</strong> <code>0x0</code> (no separate partition math).</div>
              <div>• <strong>Baud Rate:</strong> <code>921600</code> (super fast 10-second flash).</div>
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded border border-slate-800 text-[11px] text-slate-400">
            <strong className="text-white">Or Flash in Browser without Terminal:</strong> You can drag <code className="text-cyan-300 font-mono">merged.bin</code> into the <a href="https://espressif.github.io/esptool-js/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline">Espressif Web Serial Flasher</a> in Google Chrome / Microsoft Edge!
          </div>
        </div>
      </div>
    </div>
  );
};
