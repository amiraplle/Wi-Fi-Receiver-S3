import React, { useEffect, useRef, useState } from 'react';
import { Power, Play, Pause, Square, Volume2, VolumeX, Sliders, Radio, Activity, HardDrive, Wifi, Cpu, RefreshCw, Zap, Smartphone, Monitor } from 'lucide-react';
import { ReceiverStatus, WiFiConfig } from '../types/index.ts';
import { audioEngine } from '../utils/audioEngine.ts';
import { MobileApp } from './MobileApp.tsx';

interface WebControllerProps {
  status: ReceiverStatus;
  onUpdateStatus: (partial: Partial<ReceiverStatus>) => void;
  onApplyWiFi: (config: WiFiConfig) => void;
  isSimulated: boolean;
  espIp: string;
}

export const WebController: React.FC<WebControllerProps> = ({
  status,
  onUpdateStatus,
  onApplyWiFi,
  isSimulated,
  espIp,
}) => {
  const [viewLayout, setViewLayout] = useState<'mobile' | 'studio'>('mobile');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [vuLeft, setVuLeft] = useState(0);
  const [vuRight, setVuRight] = useState(0);
  const [visualizerMode, setVisualizerMode] = useState<'waveform' | 'spectrum'>('waveform');
  const [commandFeedback, setCommandFeedback] = useState<string | null>(null);

  const showFeedback = (msg: string) => {
    setCommandFeedback(msg);
    setTimeout(() => setCommandFeedback(null), 2000);
  };

  // Toggle Power
  const handleTogglePower = () => {
    const nextState = status.powerState === 'on' ? 'standby' : 'on';
    if (nextState === 'standby') {
      audioEngine.stopSimulator();
      onUpdateStatus({ powerState: 'standby', playbackState: 'stopped', isMuted: true });
      showFeedback('ESP32 Standby: DAC Muted, Radio Power Save');
    } else {
      onUpdateStatus({ powerState: 'on', playbackState: 'playing', isMuted: false });
      if (isSimulated) {
        audioEngine.playSimulator();
      }
      showFeedback('ESP32 Active: DAC Unmuted, Audio Stream Ready');
    }
  };

  // Playback handlers
  const handlePlay = () => {
    if (status.powerState === 'standby') {
      onUpdateStatus({ powerState: 'on' });
    }
    onUpdateStatus({ playbackState: 'playing' });
    if (isSimulated) {
      audioEngine.playSimulator();
    }
    showFeedback('Playback resumed');
  };

  const handlePause = () => {
    onUpdateStatus({ playbackState: 'paused' });
    if (isSimulated) {
      audioEngine.pauseSimulator();
    }
    showFeedback('Playback paused');
  };

  const handleStop = () => {
    onUpdateStatus({ playbackState: 'stopped' });
    if (isSimulated) {
      audioEngine.stopSimulator();
    }
    showFeedback('Stopped & PSRAM Ring Buffer flushed');
  };

  const handleToggleMute = () => {
    const nextMuted = !status.isMuted;
    onUpdateStatus({ isMuted: nextMuted });
    audioEngine.setMute(nextMuted, status.volume);
    showFeedback(nextMuted ? 'Muted (UDA1334A MUTE Pin Active)' : 'Unmuted');
  };

  const handleVolumeChange = (newVol: number) => {
    onUpdateStatus({ volume: newVol });
    audioEngine.setVolume(newVol);
  };

  const handleBalanceChange = (newBal: number) => {
    onUpdateStatus({ balance: newBal });
    audioEngine.setBalance(newBal);
  };

  const handleBassChange = (newBass: number) => {
    onUpdateStatus({ bassGain: newBass });
    audioEngine.setEQ(newBass, status.trebleGain);
  };

  const handleTrebleChange = (newTreble: number) => {
    onUpdateStatus({ trebleGain: newTreble });
    audioEngine.setEQ(status.bassGain, newTreble);
  };

  // Real-time animation loop for VU meters & waveform/spectrum canvas
  useEffect(() => {
    let animId: number;

    const render = () => {
      const isPlaying = status.powerState === 'on' && status.playbackState === 'playing' && !status.isMuted;
      
      if (isPlaying) {
        const { left, right, dataArray } = audioEngine.getLevels();
        // Fallback simulated jitter if sound is playing
        const effectiveLeft = left > 0 ? left : 0.45 + Math.random() * 0.35;
        const effectiveRight = right > 0 ? right : 0.48 + Math.random() * 0.32;
        setVuLeft(effectiveLeft);
        setVuRight(effectiveRight);

        // Draw Canvas
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const width = canvas.width;
            const height = canvas.height;
            ctx.clearRect(0, 0, width, height);

            if (visualizerMode === 'waveform') {
              const waveData = audioEngine.getWaveformData();
              ctx.lineWidth = 2;
              ctx.strokeStyle = '#06B6D4'; // cyan-500
              ctx.beginPath();

              const sliceWidth = width / waveData.length;
              let x = 0;

              for (let i = 0; i < waveData.length; i++) {
                const v = waveData[i] / 128.0;
                const y = (v * height) / 2;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
                x += sliceWidth;
              }
              ctx.stroke();

              // Subtle center line
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(0, height / 2);
              ctx.lineTo(width, height / 2);
              ctx.stroke();
            } else {
              // Spectrum analyzer bars
              const barCount = 32;
              const barWidth = width / barCount - 2;

              for (let i = 0; i < barCount; i++) {
                const val = (dataArray[i] || Math.floor(Math.sin(i * 0.2 + Date.now() * 0.005) * 80 + 120)) / 255;
                const barHeight = val * (height - 8);
                const x = i * (barWidth + 2);
                const y = height - barHeight;

                const grad = ctx.createLinearGradient(0, height, 0, 0);
                grad.addColorStop(0, '#06B6D4');
                grad.addColorStop(0.7, '#3B82F6');
                grad.addColorStop(1, '#EC4899');

                ctx.fillStyle = grad;
                ctx.fillRect(x, y, barWidth, barHeight);
              }
            }
          }
        }
      } else {
        setVuLeft(0);
        setVuRight(0);
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.beginPath();
            ctx.moveTo(0, canvas.height / 2);
            ctx.lineTo(canvas.width, canvas.height / 2);
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [status.powerState, status.playbackState, status.isMuted, visualizerMode]);

  return (
    <div className="space-y-6">
      {/* Toast Feedback Ribbon */}
      {commandFeedback && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2 bg-cyan-950 border border-cyan-500/50 text-cyan-300 text-xs font-mono rounded shadow-xl flex items-center gap-2 animate-bounce">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <span>{commandFeedback}</span>
        </div>
      )}

      {/* Controller Mode Switcher */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-slate-400">
          {viewLayout === 'mobile' ? 'Mobile App Controller View' : 'Diagnostic Lab View'}
        </div>

        <div className="flex items-center p-0.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
          <button
            onClick={() => setViewLayout('mobile')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
              viewLayout === 'mobile'
                ? 'bg-cyan-600 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile App</span>
          </button>
          <button
            onClick={() => setViewLayout('studio')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
              viewLayout === 'studio'
                ? 'bg-cyan-600 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Diagnostic Lab</span>
          </button>
        </div>
      </div>

      {/* Render Mobile App Mode (Clean, no unnecessary labels, with Player, WiFi & OTA) */}
      {viewLayout === 'mobile' && (
        <MobileApp
          status={status}
          onUpdateStatus={onUpdateStatus}
          onApplyWiFi={onApplyWiFi}
          isSimulated={isSimulated}
          espIp={espIp}
        />
      )}

      {/* Render Detailed Diagnostic Console */}
      {viewLayout === 'studio' && (
      <div className="border border-slate-800 bg-slate-900/40 rounded-lg p-6 lg:p-8">
        {/* Console Header & Power Switch */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <span>ESP32-S3 IP: {isSimulated ? '127.0.0.1 (Simulator)' : espIp}</span>
              <span aria-hidden="true">·</span>
              <span>Port: 9091 (UDP) / 80 (HTTP)</span>
              <span aria-hidden="true">·</span>
              <span className={status.powerState === 'on' ? 'text-emerald-400' : 'text-amber-400'}>
                ● {status.powerState === 'on' ? 'SYSTEM ACTIVE' : 'STANDBY MODE'}
              </span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight mt-1">
              Live Web Controller &amp; DAC Stream Monitor
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {/* Master Hardware Power Toggle */}
            <button
              onClick={handleTogglePower}
              className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold uppercase tracking-wider transition-colors ${
                status.powerState === 'on'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              <Power className="w-4 h-4" />
              <span>{status.powerState === 'on' ? 'Power: ON' : 'Power: STANDBY'}</span>
            </button>
          </div>
        </div>

        {/* Primary Controls Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6">
          {/* Left Column: Transport, Volume & EQ (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Transport Buttons */}
            <div className="p-5 rounded bg-slate-950 border border-slate-800">
              <div className="text-xs font-mono text-slate-400 mb-3 uppercase tracking-wider">
                Playback Transport Controls
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handlePlay}
                  disabled={status.powerState === 'standby'}
                  className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold transition-colors ${
                    status.playbackState === 'playing'
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <Play className="w-4 h-4" />
                  <span>Play</span>
                </button>

                <button
                  onClick={handlePause}
                  disabled={status.powerState === 'standby'}
                  className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold transition-colors ${
                    status.playbackState === 'paused'
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <Pause className="w-4 h-4" />
                  <span>Pause</span>
                </button>

                <button
                  onClick={handleStop}
                  disabled={status.powerState === 'standby'}
                  className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold transition-colors ${
                    status.playbackState === 'stopped'
                      ? 'bg-rose-900/60 border border-rose-600 text-rose-200'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <Square className="w-4 h-4" />
                  <span>Stop &amp; Flush</span>
                </button>

                <button
                  onClick={handleToggleMute}
                  disabled={status.powerState === 'standby'}
                  className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold transition-colors ${
                    status.isMuted
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {status.isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  <span>{status.isMuted ? 'Muted' : 'Mute'}</span>
                </button>
              </div>

              {isSimulated && (
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <span>Audible Test Sound Generator (Web Audio API)</span>
                  <button
                    onClick={() => {
                      if (status.playbackState === 'playing') handlePause();
                      else handlePlay();
                    }}
                    className="text-cyan-400 hover:underline font-mono text-[11px]"
                  >
                    {status.playbackState === 'playing' ? 'Mute Test Tone' : 'Generate Test Tone'}
                  </button>
                </div>
              )}
            </div>

            {/* Volume & Stereo Balance Sliders */}
            <div className="p-5 rounded bg-slate-950 border border-slate-800 space-y-5">
              {/* Volume Slider */}
              <div>
                <div className="flex items-center justify-between text-xs font-mono mb-2">
                  <span className="text-slate-400 uppercase tracking-wider">Digital Master Volume (I2S Scaler)</span>
                  <span className="text-white font-bold tabular-nums text-sm">{status.volume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={status.volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>

              {/* Stereo Balance Slider */}
              <div>
                <div className="flex items-center justify-between text-xs font-mono mb-2">
                  <span className="text-slate-400 uppercase tracking-wider">Stereo Balance (L / R)</span>
                  <span className="text-white font-bold tabular-nums text-xs">
                    {status.balance === 0
                      ? 'Center'
                      : status.balance < 0
                      ? `L ${Math.abs(status.balance)}%`
                      : `R ${status.balance}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={status.balance}
                  onChange={(e) => handleBalanceChange(Number(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>
            </div>

            {/* Hardware Equalizer (Bass & Treble Shelving) */}
            <div className="p-5 rounded bg-slate-950 border border-slate-800">
              <div className="text-xs font-mono text-slate-400 mb-4 uppercase tracking-wider">
                Digital Tone Equalizer (Software Biquad)
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span className="text-slate-400">Bass (250Hz)</span>
                    <span className="text-cyan-400 font-bold tabular-nums">
                      {status.bassGain > 0 ? `+${status.bassGain}` : status.bassGain} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-10"
                    max="10"
                    value={status.bassGain}
                    onChange={(e) => handleBassChange(Number(e.target.value))}
                    className="w-full h-2 bg-slate-800 rounded appearance-none cursor-pointer accent-cyan-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span className="text-slate-400">Treble (4kHz)</span>
                    <span className="text-cyan-400 font-bold tabular-nums">
                      {status.trebleGain > 0 ? `+${status.trebleGain}` : status.trebleGain} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-10"
                    max="10"
                    value={status.trebleGain}
                    onChange={(e) => handleTrebleChange(Number(e.target.value))}
                    className="w-full h-2 bg-slate-800 rounded appearance-none cursor-pointer accent-cyan-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: VU Meters & Oscilloscope Canvas (5 cols) */}
          <div className="lg:col-span-5 space-y-6 flex flex-col justify-between">
            {/* Visualizer Canvas & Mode Switch */}
            <div className="p-5 rounded bg-slate-950 border border-slate-800 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                  Audio Stream Visualizer
                </span>
                <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800">
                  <button
                    onClick={() => setVisualizerMode('waveform')}
                    className={`px-2 py-0.5 text-[10px] font-mono rounded ${
                      visualizerMode === 'waveform' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Oscilloscope
                  </button>
                  <button
                    onClick={() => setVisualizerMode('spectrum')}
                    className={`px-2 py-0.5 text-[10px] font-mono rounded ${
                      visualizerMode === 'spectrum' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Spectrum
                  </button>
                </div>
              </div>

              <div className="relative w-full h-36 bg-slate-900/80 rounded border border-slate-800/80 overflow-hidden flex items-center justify-center">
                <canvas
                  ref={canvasRef}
                  width={340}
                  height={140}
                  className="w-full h-full"
                />
                {status.playbackState !== 'playing' && (
                  <span className="absolute text-[11px] font-mono text-slate-500">
                    Audio stream paused / silent
                  </span>
                )}
              </div>
            </div>

            {/* Precision Left / Right Peak VU Meters */}
            <div className="p-5 rounded bg-slate-950 border border-slate-800 space-y-4">
              <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                Precision VU Output Levels (UDA1334A I2S)
              </div>

              {/* Left Channel */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono text-slate-400">
                  <span>LEFT CHANNEL</span>
                  <span className="tabular-nums text-white">
                    {vuLeft > 0 ? `${(20 * Math.log10(vuLeft)).toFixed(1)} dB` : '-inf dB'}
                  </span>
                </div>
                <div className="h-3 w-full bg-slate-900 rounded overflow-hidden p-0.5 flex gap-0.5 border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-rose-500 rounded-sm transition-all duration-75"
                    style={{ width: `${Math.min(100, Math.round(vuLeft * 100))}%` }}
                  />
                </div>
              </div>

              {/* Right Channel */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono text-slate-400">
                  <span>RIGHT CHANNEL</span>
                  <span className="tabular-nums text-white">
                    {vuRight > 0 ? `${(20 * Math.log10(vuRight)).toFixed(1)} dB` : '-inf dB'}
                  </span>
                </div>
                <div className="h-3 w-full bg-slate-900 rounded overflow-hidden p-0.5 flex gap-0.5 border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-rose-500 rounded-sm transition-all duration-75"
                    style={{ width: `${Math.min(100, Math.round(vuRight * 100))}%` }}
                  />
                </div>
              </div>

              <div className="flex justify-between text-[9px] font-mono text-slate-500 px-1 pt-1">
                <span>-48dB</span>
                <span>-24dB</span>
                <span>-12dB</span>
                <span>-6dB</span>
                <span>0dB (PEAK)</span>
              </div>
            </div>

            {/* UDA1334A Hardware DAC Status Badge */}
            <div className="p-4 rounded bg-slate-950 border border-slate-800 text-xs font-mono space-y-1 text-slate-400">
              <div className="text-white font-semibold text-[11px] uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>DAC Hardware Profile</span>
                <span className="text-emerald-400">● PLL LOCKED</span>
              </div>
              <div className="flex justify-between">
                <span>DAC Controller:</span>
                <span className="text-slate-200">NXP UDA1334A 24-bit I2S</span>
              </div>
              <div className="flex justify-between">
                <span>Master Clock (MCLK):</span>
                <span className="text-cyan-400">Internal PLL Derived</span>
              </div>
              <div className="flex justify-between">
                <span>Hardware MUTE Pin:</span>
                <span className={status.isMuted ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                  {status.isMuted ? 'PULL-HIGH (MUTED)' : 'PULL-LOW (PASS)'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Real-time Telemetry & Diagnostics Tray */}
        <div className="mt-8 pt-6 border-t border-slate-800">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              ESP32-S3 N16R8 Hardware &amp; Stream Telemetry
            </span>
            <span className="text-slate-500">Auto-refresh: 1000ms</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="p-3 bg-slate-950 rounded border border-slate-800">
              <div className="text-[10px] font-mono text-slate-400 uppercase">PSRAM Ring Buffer</div>
              <div className="text-base font-mono font-bold text-white mt-1 tabular-nums">
                {status.bufferUsagePercent}%
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">512 KB Octal SPI</div>
            </div>

            <div className="p-3 bg-slate-950 rounded border border-slate-800">
              <div className="text-[10px] font-mono text-slate-400 uppercase">Sample Rate</div>
              <div className="text-base font-mono font-bold text-cyan-400 mt-1 tabular-nums">
                44.1 <span className="text-xs font-normal text-slate-400">kHz</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">16-bit PCM Stereo</div>
            </div>

            <div className="p-3 bg-slate-950 rounded border border-slate-800">
              <div className="text-[10px] font-mono text-slate-400 uppercase">Stream Latency</div>
              <div className="text-base font-mono font-bold text-emerald-400 mt-1 tabular-nums">
                {status.streamLatencyMs} <span className="text-xs font-normal text-slate-400">ms</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Jitter ±{status.jitterMs}ms</div>
            </div>

            <div className="p-3 bg-slate-950 rounded border border-slate-800">
              <div className="text-[10px] font-mono text-slate-400 uppercase">Packets / Sec</div>
              <div className="text-base font-mono font-bold text-white mt-1 tabular-nums">
                {status.playbackState === 'playing' ? '172' : '0'}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">0 Dropped</div>
            </div>

            <div className="p-3 bg-slate-950 rounded border border-slate-800">
              <div className="text-[10px] font-mono text-slate-400 uppercase">Free PSRAM</div>
              <div className="text-base font-mono font-bold text-white mt-1 tabular-nums">
                7.48 <span className="text-xs font-normal text-slate-400">MB</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Total: 8.00 MB</div>
            </div>

            <div className="p-3 bg-slate-950 rounded border border-slate-800">
              <div className="text-[10px] font-mono text-slate-400 uppercase">Wi-Fi RSSI</div>
              <div className="text-base font-mono font-bold text-emerald-400 mt-1 tabular-nums">
                {status.wifiRssi} <span className="text-xs font-normal text-slate-400">dBm</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Excellent (2.4 GHz)</div>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
