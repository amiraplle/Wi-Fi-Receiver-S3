import React, { useState } from 'react';
import { Copy, Check, Download, FileCode, HardDrive, Terminal, Sparkles } from 'lucide-react';
import { FIRMWARE_FILES, FirmwareFile } from '../data/firmwareCode.ts';

export const FirmwareCodeViewer: React.FC = () => {
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  const activeFile = FIRMWARE_FILES[selectedFileIdx];

  const handleCopy = () => {
    navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadFile = () => {
    const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = activeFile.filename.split('/').pop() || 'firmware_file.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border border-slate-800 bg-slate-900/40 rounded-lg p-6 lg:p-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight mb-2">
            Production-Grade ESP32-S3 Firmware Source Code
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            100% production-ready, compilable C++ code. Configured specifically for the <strong>ESP32-S3 N16R8</strong> with <strong>8MB Octal PSRAM ring buffer</strong>, FreeRTOS dual-core task pinning, modern <strong>ESP-IDF 5.x / Arduino 3.x I2S std driver</strong>, AsyncWebServer, and native OTA.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded transition-colors whitespace-nowrap"
          >
            {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied to Clipboard!' : 'Copy Code'}</span>
          </button>
          <button
            onClick={handleDownloadFile}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Download File</span>
          </button>
        </div>
      </div>

      {/* Code Editor Container */}
      <div className="border border-slate-800 bg-slate-950 rounded-lg overflow-hidden shadow-2xl">
        {/* File Tabs */}
        <div className="flex flex-wrap items-center border-b border-slate-800 bg-slate-900/80 px-2 pt-2 gap-1">
          {FIRMWARE_FILES.map((file, idx) => (
            <button
              key={file.filename}
              onClick={() => setSelectedFileIdx(idx)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-mono rounded-t transition-colors ${
                selectedFileIdx === idx
                  ? 'bg-slate-950 text-cyan-400 border-t-2 border-cyan-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>{file.filename}</span>
            </button>
          ))}
        </div>

        {/* File Description Banner */}
        <div className="px-5 py-2.5 bg-slate-900/50 border-b border-slate-800/80 text-xs font-mono text-slate-400 flex items-center justify-between">
          <span>{activeFile.description}</span>
          <span className="text-slate-500 text-[11px] uppercase">
            {activeFile.language.toUpperCase()}
          </span>
        </div>

        {/* Source Code Content */}
        <div className="relative p-5 overflow-x-auto max-h-[550px] font-mono text-xs leading-relaxed text-slate-300">
          <pre>
            <code>{activeFile.content}</code>
          </pre>
        </div>
      </div>

      {/* Flashing Instructions for Beginners & Pros */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-slate-800 bg-slate-900/30 p-6 rounded-lg space-y-3">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            Flashing with PlatformIO (Recommended)
          </div>
          <ol className="text-xs text-slate-300 space-y-2 list-decimal list-inside leading-relaxed">
            <li>Create a new PlatformIO project targeting <code className="text-cyan-300 font-mono">ESP32-S3-DevKitC-1</code>.</li>
            <li>Replace <code className="text-cyan-300 font-mono">platformio.ini</code> and <code className="text-cyan-300 font-mono">src/main.cpp</code> with the code above.</li>
            <li>Connect your ESP32-S3 via USB cable to your PC.</li>
            <li>Run <code className="text-cyan-300 font-mono">pio run -t upload</code> to flash both code &amp; partition table.</li>
            <li>Open Serial Monitor (<code className="text-cyan-300 font-mono">pio device monitor -b 115200</code>) to see the device IP address!</li>
          </ol>
        </div>

        <div className="border border-slate-800 bg-slate-900/30 p-6 rounded-lg space-y-3">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-purple-400" />
            Flashing with Arduino IDE 2.x
          </div>
          <ol className="text-xs text-slate-300 space-y-2 list-decimal list-inside leading-relaxed">
            <li>Install the latest <strong>esp32 by Espressif</strong> board package (v3.0.0 or higher).</li>
            <li>Select Board: <code className="text-cyan-300 font-mono">ESP32S3 Dev Module</code>.</li>
            <li><strong>CRITICAL:</strong> Set <code className="text-cyan-300 font-mono">PSRAM &rarr; OPI PSRAM</code> (required for N16R8!).</li>
            <li>Set <code className="text-cyan-300 font-mono">Flash Size &rarr; 16MB</code> and <code className="text-cyan-300 font-mono">Partition Scheme &rarr; 16M Flash (Dual OTA)</code>.</li>
            <li>Paste <code className="text-cyan-300 font-mono">ESP32_WiFi_Audio_Receiver.ino</code>, set your Wi-Fi SSID, and hit Upload.</li>
          </ol>
        </div>
      </div>
    </div>
  );
};
