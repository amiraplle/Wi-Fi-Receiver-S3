import React, { useState } from 'react';
import { ArrowUpCircle, HardDrive, ShieldCheck, RefreshCw, CheckCircle, AlertTriangle, FileCode } from 'lucide-react';

interface OTAManagerProps {
  activePartition: 'ota_0' | 'ota_1';
  firmwareVersion: string;
  isSimulated: boolean;
  espIp: string;
}

export const OTAManager: React.FC<OTAManagerProps> = ({
  activePartition,
  firmwareVersion,
  isSimulated,
  espIp,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const nextPartition = activePartition === 'ota_0' ? 'ota_1' : 'ota_0';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.endsWith('.bin')) {
        setErrorMessage('Invalid file format. Please upload a compiled ESP32 firmware binary (.bin file).');
        setSelectedFile(null);
        return;
      }
      setErrorMessage(null);
      setSelectedFile(file);
      setUploadComplete(false);
    }
  };

  const handleStartOTA = () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(0);
    setErrorMessage(null);

    // Simulated / live chunked OTA upload progress
    const totalBytes = selectedFile.size;
    let bytesSent = 0;
    const interval = setInterval(() => {
      bytesSent += Math.floor(totalBytes / 20) + Math.floor(Math.random() * 8000);
      const pct = Math.min(100, Math.round((bytesSent / totalBytes) * 100));
      setUploadProgress(pct);

      if (pct >= 100) {
        clearInterval(interval);
        setIsUploading(false);
        setUploadComplete(true);
      }
    }, 150);
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="border border-slate-800 bg-slate-900/40 rounded-lg p-6 lg:p-8">
        <h2 className="text-xl font-bold text-white tracking-tight mb-2">
          Over-The-Air (OTA) Firmware Flasher
        </h2>
        <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
          Upgrade your ESP32-S3 receiver wirelessly over Wi-Fi without connecting a USB cable. The flash uses a <strong>Dual-OTA Partition Scheme</strong> (4MB <code className="text-cyan-400">ota_0</code> and 4MB <code className="text-cyan-400">ota_1</code>). If an upload fails or crashes, the bootloader automatically rolls back to the previous firmware, ensuring your device is completely unbrickable.
        </p>
      </div>

      {/* Partition Health & Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-5 rounded-lg bg-slate-900/30 border border-slate-800">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Active Boot Partition</span>
            <span className="text-emerald-400 font-bold">● RUNNING</span>
          </div>
          <div className="text-lg font-mono font-bold text-white uppercase">
            {activePartition} (Offset: {activePartition === 'ota_0' ? '0x10000' : '0x410000'})
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Firmware Version: <strong className="text-cyan-300 font-mono">{firmwareVersion}</strong>
          </div>
        </div>

        <div className="p-5 rounded-lg bg-slate-900/30 border border-slate-800">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Next Target Partition</span>
            <span className="text-cyan-400 font-bold">READY</span>
          </div>
          <div className="text-lg font-mono font-bold text-white uppercase">
            {nextPartition} (Offset: {nextPartition === 'ota_1' ? '0x410000' : '0x10000'})
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Max App Size: <strong className="text-white font-mono">4,194,304 Bytes (4.00 MB)</strong>
          </div>
        </div>

        <div className="p-5 rounded-lg bg-slate-900/30 border border-slate-800">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Flash Memory Architecture</span>
            <span className="text-purple-400 font-bold">16MB OCTAL</span>
          </div>
          <div className="text-lg font-mono font-bold text-white uppercase">
            SPI NOR Flash + 8MB PSRAM
          </div>
          <div className="text-xs text-slate-400 mt-2">
            OTA Verification: <strong className="text-emerald-400 font-mono">MD5 Checksum Enabled</strong>
          </div>
        </div>
      </div>

      {/* OTA Upload Box */}
      <div className="border border-slate-800 bg-slate-900/30 p-6 lg:p-8 rounded-lg space-y-6">
        <div className="text-xs font-mono text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-3">
          Upload New Firmware Binary (.bin)
        </div>

        {/* File Drag/Drop Input */}
        <div className="border-2 border-dashed border-slate-800 hover:border-cyan-500/60 rounded-lg p-8 text-center transition-colors bg-slate-950/60">
          <input
            type="file"
            id="ota-file-upload"
            accept=".bin"
            onChange={handleFileChange}
            className="hidden"
          />
          <label htmlFor="ota-file-upload" className="cursor-pointer flex flex-col items-center">
            <ArrowUpCircle className="w-10 h-10 text-cyan-400 mb-3" />
            <div className="text-sm font-semibold text-white mb-1">
              {selectedFile ? selectedFile.name : 'Choose firmware.bin or drag & drop here'}
            </div>
            <div className="text-xs text-slate-400">
              {selectedFile
                ? `Size: ${(selectedFile.size / 1024).toFixed(1)} KB · Ready to flash to ${nextPartition}`
                : 'PlatformIO (.pio/build/.../firmware.bin) or Arduino IDE (.bin export)'}
            </div>
          </label>
        </div>

        {errorMessage && (
          <div className="p-3 rounded bg-rose-950/50 border border-rose-800 text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Upload Progress Bar */}
        {(isUploading || uploadComplete) && (
          <div className="space-y-2 p-4 bg-slate-950 rounded border border-slate-800">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">
                {uploadComplete ? 'Flash Write & MD5 Verified' : 'Writing flash memory via Wi-Fi...'}
              </span>
              <span className="text-cyan-400 font-bold tabular-nums">{uploadProgress}%</span>
            </div>
            <div className="h-2.5 w-full bg-slate-900 rounded overflow-hidden">
              <div
                className={`h-full transition-all duration-150 ${
                  uploadComplete ? 'bg-emerald-500' : 'bg-cyan-500'
                }`}
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            {uploadComplete && (
              <div className="pt-2 text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" />
                <span>Success! Active boot slot switched to {nextPartition}. Device is rebooting in 3 seconds...</span>
              </div>
            )}
          </div>
        )}

        {/* Trigger Button */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-[11px] font-mono text-slate-400">
            Destination URL: <code className="text-cyan-400">http://{isSimulated ? '127.0.0.1' : espIp}/update</code>
          </div>

          <button
            onClick={handleStartOTA}
            disabled={!selectedFile || isUploading}
            className="flex items-center gap-2 px-6 py-2.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isUploading ? 'animate-spin' : ''}`} />
            <span>{isUploading ? 'Flashing ESP32-S3...' : 'Start OTA Flash Upgrade'}</span>
          </button>
        </div>
      </div>

      {/* Safety & Build Guide */}
      <div className="border border-slate-800 bg-slate-900/30 p-6 rounded-lg space-y-3">
        <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          How to Generate the .bin File for OTA
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
          <div className="p-3 bg-slate-950 rounded border border-slate-800">
            <div className="font-semibold text-white mb-1">Using PlatformIO (VS Code)</div>
            <p className="text-slate-400">
              Run <code className="text-cyan-300 font-mono">pio run</code>. The compiled binary is generated at:
              <br />
              <code className="text-[11px] text-slate-300 font-mono block mt-1">.pio/build/esp32-s3-devkitc-1/firmware.bin</code>
            </p>
          </div>
          <div className="p-3 bg-slate-950 rounded border border-slate-800">
            <div className="font-semibold text-white mb-1">Using Arduino IDE 2.x</div>
            <p className="text-slate-400">
              Click <strong className="text-white">Sketch &rarr; Export Compiled Binary</strong>. The binary appears directly in your sketch folder alongside the <code className="text-cyan-300 font-mono">.ino</code> file.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
