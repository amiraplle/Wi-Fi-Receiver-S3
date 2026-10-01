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
        <div className="space-y-1.5 text-xs text-slate-300">
          <div className="text-emerald-400 font-mono font-bold uppercase tracking-wider">
            Direct Phone AP Mode (No Home Wi-Fi Router Required!)
          </div>
          <p className="leading-relaxed">
            When you power on the ESP32-S3, it immediately broadcasts an Access Point named <strong className="text-white font-mono">ESP32-Audio-Setup</strong> (password: <code className="text-amber-300">12345678</code>). Connect your phone to this Wi-Fi.
          </p>
          <div className="p-3 bg-slate-900/90 rounded border border-emerald-500/20 space-y-1">
            <strong className="text-amber-300 font-mono">If phone shows &quot;Waiting for client on port 9090&quot;:</strong>
            <p className="text-slate-300">
              The phone is running as the audio host server! Open <strong className="text-cyan-300">http://192.168.4.1</strong> on your phone browser, enter your phone&apos;s IP (e.g. <code className="text-cyan-200">192.168.4.2</code>), and tap <strong className="text-emerald-400">&quot;Connect ESP32 to Phone Audio Server&quot;</strong>. The ESP32 will immediately hook onto your phone stream!
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Step 1 */}
        <div className="p-4 bg-slate-950 rounded border border-slate-800 space-y-2">
          <div className="text-xs font-mono text-cyan-400 font-bold">STEP 01</div>
          <div className="text-sm font-semibold text-white">App Mode</div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Open the app and select <strong className="text-slate-200">Transmitter Mode</strong>.
          </p>
          <div className="text-[11px] font-mono text-slate-500 pt-1">
            Port: 9090 or 9091
          </div>
        </div>

        {/* Step 2 */}
        <div className="p-4 bg-slate-950 rounded border border-slate-800 space-y-2">
          <div className="text-xs font-mono text-cyan-400 font-bold">STEP 02</div>
          <div className="text-sm font-semibold text-white">Audio Source</div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Choose <strong className="text-slate-200">Internal Audio</strong> (Android 10+) to capture Spotify/YouTube/Media.
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
            Target IP: <strong className="text-cyan-300">192.168.4.1</strong> (in AP mode) or <strong className="text-cyan-300">wifimusic.local</strong>.
          </p>
          <div className="text-[11px] font-mono text-slate-500 pt-1">
            Port: 9090 (TCP/UDP) or 9091
          </div>
        </div>

        {/* Step 4 */}
        <div className="p-4 bg-slate-950 rounded border border-slate-800 space-y-2">
          <div className="text-xs font-mono text-cyan-400 font-bold">STEP 04</div>
          <div className="text-sm font-semibold text-white">Audio Format & Rate</div>
          <p className="text-xs text-slate-400 leading-relaxed">
            In app settings, check <strong className="text-slate-200">Sample Rate: 48000 Hz</strong> (App default) and <strong className="text-slate-200">Stereo 16-bit PCM</strong>.
          </p>
          <div className="text-[11px] font-mono text-slate-500 pt-1">
            ESP32 synced to 48kHz I2S
          </div>
        </div>
      </div>

      {/* Noise & Crackle Fix Guide */}
      <div className="p-4 bg-amber-950/20 border border-amber-500/30 rounded-lg space-y-3 text-xs text-slate-300">
        <div className="flex items-center gap-2 text-amber-400 font-mono font-bold uppercase tracking-wider">
          <AlertCircle className="w-4 h-4" />
          <span>Why Was It Noisy? Solutions Applied in Updated Firmware:</span>
        </div>
        <ul className="list-disc list-inside space-y-2 text-slate-300 pl-1 leading-relaxed">
          <li>
            <strong className="text-white">Sample Rate Mismatch (48kHz vs 44.1kHz):</strong> Android systems natively capture audio at <strong>48,000 Hz</strong>. If the DAC ran at 44,100 Hz, the audio drifted out of sync, causing rapid buffer underflows (static/crackling). The firmware is now set to <strong>48,000 Hz</strong> by default, matching Android.
          </li>
          <li>
            <strong className="text-white">10-Byte WFAS Header Stripping:</strong> Marco Morosi&apos;s v2 protocol prepends each UDP audio packet with a 10-byte header (<code className="text-cyan-300">0x57 0x46 0x02 0x00 ...</code>). The updated firmware strips this 10-byte header so raw metadata numbers are no longer sent to the DAC as audio noise.
          </li>
          <li>
            <strong className="text-white">PCM 4-Byte Frame Alignment:</strong> 16-bit stereo requires strict 4-byte sample alignment (2 bytes Left + 2 bytes Right). The firmware now guarantees 4-byte boundaries, preventing channel phase inversion and hash distortion.
          </li>
          <li>
            <strong className="text-white">Jitter Pre-buffering:</strong> A 16 KB jitter buffer absorbs Wi-Fi bursts, eliminating stutter and dropouts on 2.4 GHz networks.
          </li>
        </ul>
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
