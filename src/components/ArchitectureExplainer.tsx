import React from 'react';
import { Smartphone, Wifi, Cpu, Speaker, ArrowRight, ShieldCheck, Zap, HardDrive, Layers, Activity } from 'lucide-react';

interface ArchitectureExplainerProps {
  onGoToController: () => void;
  onGoToWiring: () => void;
  onGoToFirmware: () => void;
}

export const ArchitectureExplainer: React.FC<ArchitectureExplainerProps> = ({
  onGoToController,
  onGoToWiring,
  onGoToFirmware,
}) => {
  return (
    <div className="space-y-12">
      {/* Editorial Hero Banner */}
      <div className="border border-slate-800 rounded-lg p-8 bg-slate-900/40 relative overflow-hidden">
        <div className="max-w-3xl space-y-4">
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
            <span>ESP32-S3-WROOM-1</span>
            <span aria-hidden="true">·</span>
            <span>UDA1334A I2S DAC</span>
            <span aria-hidden="true">·</span>
            <span>WiFiAudioStreaming Android</span>
          </div>

          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight">
            WiFi Audio Streaming Receiver &amp; Real Web Controller
          </h1>

          <p className="text-sm lg:text-base text-slate-300 leading-relaxed">
            A complete, production-grade embedded project blueprint that turns an <strong>ESP32-S3 N16R8</strong> into an audiophile-grade wireless receiver for Marco Morosi's <span className="text-cyan-300 font-mono text-xs">WiFiAudioStreaming</span> Android app. Features uncompressed 16-bit PCM playback through a <strong>UDA1334A DAC</strong>, an interactive web controller, captive Wi-Fi portal, and over-the-air (OTA) updates.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={onGoToController}
              className="px-4 py-2 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded transition-colors whitespace-nowrap"
            >
              Launch Live Web Controller
            </button>
            <button
              onClick={onGoToWiring}
              className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition-colors whitespace-nowrap"
            >
              View Hardware Wiring
            </button>
            <button
              onClick={onGoToFirmware}
              className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition-colors whitespace-nowrap"
            >
              Get Ready-to-Flash Code
            </button>
          </div>
        </div>
      </div>

      {/* Direct Plain-English Answer: What Does All This Mean? */}
      <div>
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white tracking-tight">
            Understanding Your Requirements: Plain-English Breakdown
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Here is exactly how every component functions together seamlessly.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Card 1: ESP32-S3 N18R8 / N16R8 */}
          <div className="border border-slate-800 bg-slate-900/30 p-6 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-cyan-400 mb-3">
                <Cpu className="w-5 h-5" />
                <h3 className="text-sm font-semibold uppercase tracking-wide">
                  ESP32-S3 N16R8 (N18R8)
                </h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                <strong>N16</strong> designates <strong>16 MegaBytes of Quad/Octal SPI Flash</strong> (where firmware &amp; web assets live), and <strong>R8</strong> designates <strong>8 MegaBytes of Octal PSRAM</strong>.
              </p>
              <div className="text-xs text-slate-400 bg-slate-950 p-3 rounded border border-slate-800/80">
                <strong className="text-cyan-300 font-mono">Why 8MB PSRAM is vital:</strong> Standard ESP32 internal RAM (512KB) will choke and stutter when streaming continuous raw audio over Wi-Fi. The 8MB PSRAM gives us a massive 512KB–2MB circular ring buffer that completely absorbs Wi-Fi jitter and packet arrival bursts!
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/60 text-[11px] font-mono text-slate-400">
              Dual-core Xtensa LX7 @ 240MHz · 2.4GHz Wi-Fi
            </div>
          </div>

          {/* Card 2: Marco Morosi's WiFiAudioStreaming */}
          <div className="border border-slate-800 bg-slate-900/30 p-6 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-cyan-400 mb-3">
                <Smartphone className="w-5 h-5" />
                <h3 className="text-sm font-semibold uppercase tracking-wide">
                  WiFiAudioStreaming App
                </h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                An open-source Android application by Marco Morosi that captures your smartphone's internal system audio (Android 10+) or microphone and streams it in real time over local Wi-Fi.
              </p>
              <div className="text-xs text-slate-400 bg-slate-950 p-3 rounded border border-slate-800/80">
                <strong className="text-cyan-300 font-mono">Transmission Protocol:</strong> Sends uncompressed 16-bit PCM stereo audio (44.1kHz or 48kHz) via lightweight UDP datagrams to the ESP32's IP address on port <span className="font-mono text-amber-300">9091</span> with sub-40ms latency.
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/60 text-[11px] font-mono text-slate-400">
              Zero compression artifacts · Raw CD quality
            </div>
          </div>

          {/* Card 3: UDA1334A I2S Stereo DAC */}
          <div className="border border-slate-800 bg-slate-900/30 p-6 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-cyan-400 mb-3">
                <Speaker className="w-5 h-5" />
                <h3 className="text-sm font-semibold uppercase tracking-wide">
                  UDA1334A Stereo DAC
                </h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                A dedicated, high-fidelity I2S digital-to-analog converter with 96dB dynamic range and low distortion for 3.5mm line-out audio.
              </p>
              <div className="text-xs text-slate-400 bg-slate-950 p-3 rounded border border-slate-800/80">
                <strong className="text-cyan-300 font-mono">Integrated Internal PLL:</strong> Unlike older DACs requiring a Master Clock (MCLK), UDA1334A reconstructs its internal clock directly from the bit clock. You only need 3 I2S wires: <strong className="text-white">BCLK</strong>, <strong className="text-white">WSEL</strong>, and <strong className="text-white">DIN</strong>!
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/60 text-[11px] font-mono text-slate-400">
              3.5mm Stereo Jack · 3.3V Logic Level
            </div>
          </div>
        </div>
      </div>

      {/* End-to-End Signal Flow Architecture */}
      <div className="border border-slate-800 bg-slate-900/20 p-6 lg:p-8 rounded-lg">
        <h2 className="text-base font-bold text-white tracking-tight mb-2">
          End-to-End System Pipeline &amp; Signal Flow
        </h2>
        <p className="text-xs text-slate-400 mb-8 max-w-2xl">
          How an audio sample travels from your Android phone's media player through the Wi-Fi airwaves and dual-core FreeRTOS pipeline into the analog output.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 relative items-stretch">
          {/* Step 1 */}
          <div className="p-4 rounded bg-slate-950 border border-slate-800 flex flex-col">
            <div className="text-[11px] font-mono text-cyan-400 mb-1">01. Source</div>
            <div className="text-sm font-semibold text-white mb-2">Android Phone</div>
            <p className="text-xs text-slate-400 leading-relaxed flex-1">
              WiFiAudioStreaming captures internal audio stream at 44.1kHz / 16-bit PCM.
            </p>
            <div className="mt-3 text-[10px] font-mono text-slate-500">Android 10+ AudioRecord</div>
          </div>

          {/* Step 2 */}
          <div className="p-4 rounded bg-slate-950 border border-slate-800 flex flex-col">
            <div className="text-[11px] font-mono text-cyan-400 mb-1">02. Network</div>
            <div className="text-sm font-semibold text-white mb-2">Wi-Fi Router (UDP)</div>
            <p className="text-xs text-slate-400 leading-relaxed flex-1">
              Low-overhead UDP packets stream to ESP32 IP on port 9091 over 2.4GHz LAN.
            </p>
            <div className="mt-3 text-[10px] font-mono text-slate-500">&lt; 35ms transit latency</div>
          </div>

          {/* Step 3 */}
          <div className="p-4 rounded bg-slate-950 border border-cyan-800/60 bg-cyan-950/20 flex flex-col">
            <div className="text-[11px] font-mono text-cyan-300 mb-1">03. ESP32 Core 0</div>
            <div className="text-sm font-semibold text-white mb-2">Network &amp; PSRAM</div>
            <p className="text-xs text-slate-300 leading-relaxed flex-1">
              Core 0 UDP task ingests packets and deposits PCM samples into the 8MB Octal PSRAM circular ring buffer.
            </p>
            <div className="mt-3 text-[10px] font-mono text-cyan-400">Lock-free atomic pointers</div>
          </div>

          {/* Step 4 */}
          <div className="p-4 rounded bg-slate-950 border border-cyan-800/60 bg-cyan-950/20 flex flex-col">
            <div className="text-[11px] font-mono text-cyan-300 mb-1">04. ESP32 Core 1</div>
            <div className="text-sm font-semibold text-white mb-2">I2S DMA Driver</div>
            <p className="text-xs text-slate-300 leading-relaxed flex-1">
              Core 1 audio task extracts samples, applies digital volume &amp; EQ, and pushes to hardware I2S DMA.
            </p>
            <div className="mt-3 text-[10px] font-mono text-cyan-400">GPIO 4, 5, 6 I2S Philips</div>
          </div>

          {/* Step 5 */}
          <div className="p-4 rounded bg-slate-950 border border-slate-800 flex flex-col">
            <div className="text-[11px] font-mono text-cyan-400 mb-1">05. Output</div>
            <div className="text-sm font-semibold text-white mb-2">UDA1334A DAC</div>
            <p className="text-xs text-slate-400 leading-relaxed flex-1">
              Internal PLL generates clock, converting 16-bit I2S to line-level analog audio for headphones or amp.
            </p>
            <div className="mt-3 text-[10px] font-mono text-slate-500">96dB SNR · 3.5mm Output</div>
          </div>
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-slate-800 p-6 rounded-lg bg-slate-900/30">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Reliable Web Controller &amp; OTA Updates
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed mb-4">
            The ESP32 runs an asynchronous lightweight HTTP server that delivers a responsive web controller to any browser on your network. You can:
          </p>
          <ul className="text-xs text-slate-400 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 font-mono font-bold">✓</span>
              <span><strong>Manual Power Toggle:</strong> Standby vs active streaming, with hardware DAC mute pin control.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 font-mono font-bold">✓</span>
              <span><strong>Playback Controls:</strong> Play, Pause, Stop (buffer flush), Mute, Master Volume (0-100%), and Stereo Balance.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 font-mono font-bold">✓</span>
              <span><strong>Wi-Fi Setup Manager:</strong> Scan nearby SSIDs, configure DHCP/Static IP, and mDNS (<code className="text-cyan-300">esp32-audio.local</code>) with automatic fallback AP.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 font-mono font-bold">✓</span>
              <span><strong>Over-The-Air (OTA) Flashing:</strong> Upload new compiled <code className="text-cyan-300">.bin</code> firmware files directly from your browser without needing a USB cable.</span>
            </li>
          </ul>
        </div>

        <div className="border border-slate-800 p-6 rounded-lg bg-slate-900/30">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            Can I Make a Real Project with This?
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed mb-4">
            <strong>Yes! You have 100% of the deliverables right here:</strong>
          </p>
          <div className="space-y-3 text-xs text-slate-300">
            <div className="p-3 bg-slate-950 rounded border border-slate-800">
              <div className="font-semibold text-white mb-0.5">1. Complete Compilable Firmware</div>
              <p className="text-slate-400">Ready for both <strong>PlatformIO</strong> and <strong>Arduino IDE 2.x</strong> with dual-core FreeRTOS tasks, PSRAM memory allocation, and standard I2S drivers.</p>
            </div>
            <div className="p-3 bg-slate-950 rounded border border-slate-800">
              <div className="font-semibold text-white mb-0.5">2. Exact Wiring &amp; Pinout Diagram</div>
              <p className="text-slate-400">Pin-by-pin hookup guide between ESP32-S3 and UDA1334A with power decoupling advice.</p>
            </div>
            <div className="p-3 bg-slate-950 rounded border border-slate-800">
              <div className="font-semibold text-white mb-0.5">3. Live Working Web Controller</div>
              <p className="text-slate-400">You can use this app right now as the companion controller for your physical ESP32 or test it via the built-in browser audio engine.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
