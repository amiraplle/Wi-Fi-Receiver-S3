import React from 'react';
import { Smartphone, CheckCircle, Radio, Settings, AlertCircle, ExternalLink } from 'lucide-react';

export const AndroidSetupGuide: React.FC = () => {
  return (
    <div className="border border-slate-800 bg-slate-900/30 p-6 lg:p-8 rounded-lg space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="text-xs font-mono text-cyan-400 uppercase tracking-wider mb-1 flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            Android App Integration Guide
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">
            Configuring Marco Morosi&apos;s WiFiAudioStreaming App
          </h3>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="https://github.com/marcomorosi06/WiFiAudioStreaming-Android/releases/download/v1.2/wifi-audio-streaming-v1.2.apk"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded text-xs font-mono transition-colors"
          >
            <span>Download APK v1.2</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a
            href="https://github.com/marcomorosi06/WiFiAudioStreaming-Android"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-slate-300 transition-colors"
          >
            <span>GitHub Repo</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* AP Mode Direct Connect Highlight */}
      <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-lg flex items-start gap-3">
        <Radio className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs text-slate-300">
          <div className="text-emerald-400 font-mono font-bold uppercase tracking-wider">
            Direct Phone AP Mode (No Home Wi-Fi Router Required!)
          </div>
          <p className="leading-relaxed">
            When you power on the ESP32-S3, it immediately broadcasts an Access Point named <strong className="text-white font-mono">ESP32-Audio-Setup</strong> (password: <code className="text-amber-300">12345678</code>). Connect your phone to this Wi-Fi.
            The Captive Portal pop-up will open automatically, or visit <strong className="text-cyan-300">http://192.168.4.1</strong> in Chrome. In the <strong>WiFiAudioStreaming v1.2 Android app</strong>, simply point your stream to IP <strong className="text-cyan-300 font-mono">192.168.4.1</strong> port <strong className="text-amber-300 font-mono">9091</strong>!
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Step 1 */}
        <div className="p-4 bg-slate-950 rounded border border-slate-800 space-y-2">
          <div className="text-xs font-mono text-cyan-400 font-bold">STEP 01</div>
          <div className="text-sm font-semibold text-white">App Mode</div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Open the app and select <strong className="text-slate-200">Transmitter Mode</strong> (or Server/Streamer).
          </p>
          <div className="text-[11px] font-mono text-slate-500 pt-1">
            Setting: Mode = Transmitter
          </div>
        </div>

        {/* Step 2 */}
        <div className="p-4 bg-slate-950 rounded border border-slate-800 space-y-2">
          <div className="text-xs font-mono text-cyan-400 font-bold">STEP 02</div>
          <div className="text-sm font-semibold text-white">Audio Source</div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Choose <strong className="text-slate-200">Internal Audio</strong> (Android 10+) to capture Spotify/YouTube or <strong className="text-slate-200">Microphone</strong>.
          </p>
          <div className="text-[11px] font-mono text-slate-500 pt-1">
            AudioPlaybackCapture API
          </div>
        </div>

        {/* Step 3 */}
        <div className="p-4 bg-slate-950 rounded border border-slate-800 space-y-2">
          <div className="text-xs font-mono text-cyan-400 font-bold">STEP 03</div>
          <div className="text-sm font-semibold text-white">Destination Target</div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Enter <strong className="text-cyan-300">wifimusic.local</strong> (or your ESP32 IP) and set Port to <strong className="text-amber-300">9091</strong>.
          </p>
          <div className="text-[11px] font-mono text-slate-500 pt-1">
            Zero-Config mDNS hostname
          </div>
        </div>

        {/* Step 4 */}
        <div className="p-4 bg-slate-950 rounded border border-slate-800 space-y-2">
          <div className="text-xs font-mono text-cyan-400 font-bold">STEP 04</div>
          <div className="text-sm font-semibold text-white">Audio Format</div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Select <strong className="text-slate-200">16-bit PCM, 44100 Hz, Stereo</strong>. Hit Start Streaming on your phone!
          </p>
          <div className="text-[11px] font-mono text-slate-500 pt-1">
            No lossy re-encoding
          </div>
        </div>
      </div>

      {/* Router / Network Notice */}
      <div className="p-4 bg-slate-950/70 border border-slate-800 rounded flex items-start gap-3 text-xs text-slate-300">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-white font-mono">Wi-Fi Router Requirement:</strong> Ensure that your smartphone and the ESP32-S3 are connected to the same local Wi-Fi network (2.4 GHz). Also verify that &quot;AP Isolation&quot; or &quot;Client Isolation&quot; is disabled in your router settings so devices can exchange UDP datagrams freely.
        </div>
      </div>
    </div>
  );
};
