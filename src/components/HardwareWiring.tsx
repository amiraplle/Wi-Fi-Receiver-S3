import React, { useState } from 'react';
import { Cpu, Speaker, Zap, AlertTriangle, CheckCircle, Info } from 'lucide-react';

export const HardwareWiring: React.FC = () => {
  const [activePin, setActivePin] = useState<string | null>(null);

  const wiringConnections = [
    {
      espPin: 'GPIO 4',
      dacPin: 'BCLK',
      color: 'bg-amber-400 text-slate-950',
      type: 'I2S Bit Clock',
      description: 'Synchronizes each bit of PCM data transmitted to the DAC.',
      criticalNote: 'Clock frequency is 32 × 44,100Hz × 2 channels = 2.8224 MHz.',
    },
    {
      espPin: 'GPIO 5',
      dacPin: 'WSEL / WS / LRCK',
      color: 'bg-emerald-400 text-slate-950',
      type: 'I2S Word Select',
      description: 'Determines whether the incoming sample is for Left (Low) or Right (High) channel.',
      criticalNote: 'Toggles at sample rate: exactly 44,100 Hz.',
    },
    {
      espPin: 'GPIO 6',
      dacPin: 'DIN / DATA',
      color: 'bg-cyan-400 text-slate-950',
      type: 'I2S Serial Data',
      description: 'Streams the two’s-complement 16-bit audio data bits serially (MSB first).',
      criticalNote: 'Carries raw uncompressed audio samples directly from the DMA buffer.',
    },
    {
      espPin: 'GPIO 7',
      dacPin: 'MUTE',
      color: 'bg-purple-400 text-slate-950',
      type: 'Hardware Mute Control',
      description: 'Optional. Pulled LOW for normal audio, HIGH to silently mute the DAC.',
      criticalNote: 'Eliminates power-on pops and clicks during Wi-Fi connection and reboots.',
    },
    {
      espPin: '3V3 (3.3V)',
      dacPin: 'VIN / VDD',
      color: 'bg-rose-400 text-slate-950',
      type: 'Power Supply',
      description: 'Powers the digital and analog circuits of the UDA1334A.',
      criticalNote: 'Connect a 100µF capacitor across 3V3 and GND near DAC to filter Wi-Fi noise!',
    },
    {
      espPin: 'GND',
      dacPin: 'GND',
      color: 'bg-slate-400 text-slate-950',
      type: 'Common Ground',
      description: 'Common reference ground for both digital signals and analog audio output.',
      criticalNote: 'Keep wiring short (< 15cm) to prevent digital clock crosstalk.',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Overview Banner */}
      <div className="border border-slate-800 bg-slate-900/40 rounded-lg p-6 lg:p-8">
        <h2 className="text-xl font-bold text-white tracking-tight mb-2">
          ESP32-S3 to UDA1334A Hardware Wiring &amp; Pinout
        </h2>
        <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
          Wiring the UDA1334A to an ESP32-S3 is remarkably straightforward because the UDA1334A has an <strong>integrated Phase-Locked Loop (PLL)</strong>. You do <strong>not</strong> need to provide a Master Clock (MCLK) line. Only three I2S signal lines plus power are needed.
        </p>
      </div>

      {/* Pin Connection Table */}
      <div className="border border-slate-800 bg-slate-900/30 rounded-lg overflow-hidden">
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">
            Point-to-Point Wiring Matrix
          </div>
          <span className="text-[11px] font-mono text-cyan-400">Total wires: 5 (or 6 with MUTE)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase">
              <tr>
                <th className="p-4">ESP32-S3 Pin</th>
                <th className="p-4">UDA1334A Pin</th>
                <th className="p-4">Signal Type</th>
                <th className="p-4">Function &amp; Details</th>
                <th className="p-4">Engineering Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {wiringConnections.map((wire, idx) => (
                <tr
                  key={idx}
                  onMouseEnter={() => setActivePin(wire.dacPin)}
                  onMouseLeave={() => setActivePin(null)}
                  className={`hover:bg-slate-800/40 transition-colors ${
                    activePin === wire.dacPin ? 'bg-slate-800/60' : ''
                  }`}
                >
                  <td className="p-4 font-mono font-bold text-white">
                    <span className="px-2 py-1 bg-slate-950 border border-slate-800 rounded">
                      {wire.espPin}
                    </span>
                  </td>
                  <td className="p-4 font-mono font-bold">
                    <span className={`px-2 py-1 rounded text-[11px] font-semibold ${wire.color}`}>
                      {wire.dacPin}
                    </span>
                  </td>
                  <td className="p-4 font-mono text-cyan-400">{wire.type}</td>
                  <td className="p-4 text-slate-300 max-w-xs">{wire.description}</td>
                  <td className="p-4 text-slate-400 font-mono text-[11px]">{wire.criticalNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Critical Hardware Notes & Anti-Noise Best Practices */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: What to do with unconnected pins */}
        <div className="border border-slate-800 bg-slate-900/30 p-6 rounded-lg space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Info className="w-4 h-4 text-cyan-400" />
            Unconnected / Jumper Pins on UDA1334A
          </h3>
          <ul className="text-xs text-slate-300 space-y-3">
            <li className="p-3 bg-slate-950 rounded border border-slate-800">
              <div className="font-mono text-white font-semibold mb-1">MUTE Pin (Completely Optional):</div>
              <p className="text-slate-400">
                <strong className="text-emerald-400">You do NOT need to connect this pin.</strong> By default, UDA1334A breakout boards (like Adafruit / CJMCU) have an onboard pull-down resistor on MUTE. If left disconnected or connected to GND, the DAC remains permanently unmuted and plays audio normally. Digital volume attenuation and software mute (sending 0-value PCM frames) in the firmware handle muting without needing this wire.
              </p>
            </li>
            <li className="p-3 bg-slate-950 rounded border border-slate-800">
              <div className="font-mono text-white font-semibold mb-1">MCLK (Master Clock) Pin:</div>
              <p className="text-slate-400">
                <strong className="text-cyan-300">LEAVE UNCONNECTED.</strong> The UDA1334A has an internal PLL that locks to the BCLK and generates the 11.2896 MHz master clock automatically.
              </p>
            </li>
            <li className="p-3 bg-slate-950 rounded border border-slate-800">
              <div className="font-mono text-white font-semibold mb-1">DEEM (De-emphasis) Pin:</div>
              <p className="text-slate-400">
                Connect to <strong className="text-white">GND</strong> (or leave floating if your breakout has a default pull-down). Modern streams do not use 50/15µs pre-emphasis.
              </p>
            </li>
            <li className="p-3 bg-slate-950 rounded border border-slate-800">
              <div className="font-mono text-white font-semibold mb-1">I2S / MSB Mode Jumper:</div>
              <p className="text-slate-400">
                Ensure jumper is in <strong className="text-cyan-300">I2S</strong> position (Standard Philips I2S). Do not set to MSB-justified unless reconfigured in code.
              </p>
            </li>
          </ul>
        </div>

        {/* Right: Anti-Noise & Audio Decoupling */}
        <div className="border border-slate-800 bg-slate-900/30 p-6 rounded-lg space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            Eliminating Wi-Fi RF Buzz &amp; Ground Noise
          </h3>
          <div className="text-xs text-slate-300 space-y-3">
            <div className="p-3 bg-slate-950 rounded border border-slate-800">
              <div className="font-semibold text-white mb-1">1. Decoupling Capacitor on 3.3V Rail</div>
              <p className="text-slate-400">
                The ESP32-S3 Wi-Fi power amplifier draws current in rapid 500mA pulses during transmission. Solder a <strong>100µF electrolytic capacitor</strong> + <strong>0.1µF ceramic capacitor</strong> between the UDA1334A VIN and GND pins to guarantee dead-silent background noise.
              </p>
            </div>
            <div className="p-3 bg-slate-950 rounded border border-slate-800">
              <div className="font-semibold text-white mb-1">2. Short Signal Lead Lengths</div>
              <p className="text-slate-400">
                Keep the jumper wires between the ESP32 and UDA1334A under <strong>10 to 15 centimeters (4–6 inches)</strong>. High-frequency digital signals on BCLK can cause RF ringing if wires are too long.
              </p>
            </div>
            <div className="p-3 bg-slate-950 rounded border border-slate-800">
              <div className="font-semibold text-white mb-1">3. Clean 5V/3.3V Power Source</div>
              <p className="text-slate-400">
                Power your ESP32-S3 from a clean 5V USB wall adapter (at least 1.5A) or dedicated linear power supply rather than a noisy unshielded USB hub.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
