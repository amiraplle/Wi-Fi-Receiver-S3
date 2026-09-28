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

        <a
          href="https://github.com/marcomorosi06/WiFiAudioStreaming-Desktop"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          <span>WiFiAudioStreaming Project</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
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
