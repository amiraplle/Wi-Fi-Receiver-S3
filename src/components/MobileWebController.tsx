import React, { useEffect, useRef, useState } from 'react';
import { Power, Play, Pause, Square, Volume2, VolumeX, Sliders, Wifi, Radio, ChevronUp, ChevronDown } from 'lucide-react';
import { ReceiverStatus } from '../types/index.ts';
import { audioEngine } from '../utils/audioEngine.ts';

interface MobileWebControllerProps {
  status: ReceiverStatus;
  onUpdateStatus: (partial: Partial<ReceiverStatus>) => void;
  isSimulated: boolean;
  espIp: string;
}

export const MobileWebController: React.FC<MobileWebControllerProps> = ({
  status,
  onUpdateStatus,
  isSimulated,
  espIp,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [vuLeft, setVuLeft] = useState(0);
  const [vuRight, setVuRight] = useState(0);
  const [showEq, setShowEq] = useState(false);

  const isPowerOn = status.powerState === 'on';
  const isPlaying = isPowerOn && status.playbackState === 'playing' && !status.isMuted;

  // Power switch
  const handleTogglePower = () => {
    const nextState = isPowerOn ? 'standby' : 'on';
    if (nextState === 'standby') {
      audioEngine.stopSimulator();
      onUpdateStatus({ powerState: 'standby', playbackState: 'stopped', isMuted: true });
    } else {
      onUpdateStatus({ powerState: 'on', playbackState: 'playing', isMuted: false });
      if (isSimulated) audioEngine.playSimulator();
    }
  };

  const handlePlayPause = () => {
    if (!isPowerOn) {
      onUpdateStatus({ powerState: 'on', playbackState: 'playing' });
      if (isSimulated) audioEngine.playSimulator();
      return;
    }
    if (status.playbackState === 'playing') {
      onUpdateStatus({ playbackState: 'paused' });
      if (isSimulated) audioEngine.pauseSimulator();
    } else {
      onUpdateStatus({ playbackState: 'playing' });
      if (isSimulated) audioEngine.playSimulator();
    }
  };

  const handleStop = () => {
    onUpdateStatus({ playbackState: 'stopped' });
    if (isSimulated) audioEngine.stopSimulator();
  };

  const handleToggleMute = () => {
    const nextMuted = !status.isMuted;
    onUpdateStatus({ isMuted: nextMuted });
    audioEngine.setMute(nextMuted, status.volume);
  };

  const handleVolume = (v: number) => {
    onUpdateStatus({ volume: v });
    audioEngine.setVolume(v);
  };

  // Real-time Visualizer Animation
  useEffect(() => {
    let animId: number;

    const render = () => {
      if (isPlaying) {
        const { left, right } = audioEngine.getLevels();
        const effL = left > 0 ? left : 0.4 + Math.random() * 0.4;
        const effR = right > 0 ? right : 0.42 + Math.random() * 0.38;
        setVuLeft(effL);
        setVuRight(effR);

        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            const waveData = audioEngine.getWaveformData();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = '#22d3ee'; // cyan-400
            ctx.beginPath();

            const sliceWidth = w / waveData.length;
            let x = 0;

            for (let i = 0; i < waveData.length; i++) {
              const v = waveData[i] / 128.0;
              const y = (v * h) / 2;
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
              x += sliceWidth;
            }
            ctx.stroke();
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
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
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
  }, [isPlaying]);

  return (
    <div className="max-w-md mx-auto w-full">
      {/* Phone Case Container */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
        {/* Device Status Bar */}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isPowerOn ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-slate-600'
              }`}
            />
            <span className="font-mono text-white font-medium">
              {isSimulated ? 'ESP32 (Sim)' : espIp}
            </span>
          </div>

          <button
            onClick={handleTogglePower}
            className={`p-2 rounded-full transition-all ${
              isPowerOn
                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300'
            }`}
            title="Power On / Standby"
          >
            <Power className="w-5 h-5" />
          </button>
        </div>

        {/* Dynamic Display / Visualizer Glass */}
        <div className="relative bg-slate-950 rounded-2xl p-5 border border-slate-800/80 overflow-hidden flex flex-col justify-between h-44">
          <div className="flex items-center justify-between z-10">
            <div>
              <div className="text-white text-base font-bold tracking-tight">
                {isPowerOn ? (isPlaying ? 'WiFi Audio Streaming' : 'Ready / Paused') : 'Standby'}
              </div>
              <div className="text-xs text-slate-500 font-mono mt-0.5">
                {isPowerOn ? '44.1 kHz · 16-bit PCM · UDA1334A' : 'Device in low-power standby'}
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 bg-slate-900/90 px-2.5 py-1 rounded-full border border-slate-800">
              <Wifi className="w-3.5 h-3.5 text-cyan-400" />
              <span>{status.wifiRssi} dBm</span>
            </div>
          </div>

          {/* Oscilloscope Waveform */}
          <canvas
            ref={canvasRef}
            width={380}
            height={90}
            className="w-full h-16 my-auto opacity-80"
          />

          {/* Dual Stereo VU Bars */}
          <div className="space-y-1.5 z-10">
            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-cyan-400 rounded-full transition-all duration-75"
                style={{ width: `${Math.round(vuLeft * 100)}%` }}
              />
            </div>
            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-cyan-400 rounded-full transition-all duration-75"
                style={{ width: `${Math.round(vuRight * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Volume Slider Knob Row */}
        <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <button
              onClick={handleToggleMute}
              className={`p-1.5 rounded-lg transition-colors ${
                status.isMuted ? 'text-rose-400 bg-rose-950/40' : 'text-slate-400 hover:text-white'
              }`}
            >
              {status.isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <span className="font-mono text-white text-sm font-semibold tabular-nums">
              {status.volume}%
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="100"
            value={status.volume}
            onChange={(e) => handleVolume(Number(e.target.value))}
            className="w-full h-3 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
        </div>

        {/* Main Touch Playback Controls */}
        <div className="flex items-center justify-center gap-6 py-2">
          {/* Stop Button */}
          <button
            onClick={handleStop}
            disabled={!isPowerOn}
            className="p-4 rounded-full bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 active:scale-95 transition-all disabled:opacity-40"
          >
            <Square className="w-5 h-5 fill-current" />
          </button>

          {/* Big Play / Pause Touch Button */}
          <button
            onClick={handlePlayPause}
            className={`p-6 rounded-full shadow-lg active:scale-95 transition-all ${
              isPlaying
                ? 'bg-cyan-500 text-slate-950 shadow-cyan-500/30'
                : 'bg-white text-slate-950 hover:bg-slate-200'
            }`}
          >
            {isPlaying ? (
              <Pause className="w-8 h-8 fill-current" />
            ) : (
              <Play className="w-8 h-8 fill-current ml-0.5" />
            )}
          </button>

          {/* Equalizer Toggle */}
          <button
            onClick={() => setShowEq(!showEq)}
            className={`p-4 rounded-full border transition-all active:scale-95 ${
              showEq
                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Sliders className="w-5 h-5" />
          </button>
        </div>

        {/* Expandable Tone Sliders (Bass / Treble / Balance) */}
        {showEq && (
          <div className="bg-slate-950 rounded-2xl p-5 border border-slate-800/80 space-y-4 animate-in fade-in duration-200">
            {/* Bass */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono text-slate-400">
                <span>Bass</span>
                <span className="text-cyan-400 font-semibold">
                  {status.bassGain > 0 ? `+${status.bassGain}` : status.bassGain} dB
                </span>
              </div>
              <input
                type="range"
                min="-10"
                max="10"
                value={status.bassGain}
                onChange={(e) => {
                  const b = Number(e.target.value);
                  onUpdateStatus({ bassGain: b });
                  audioEngine.setEQ(b, status.trebleGain);
                }}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            {/* Treble */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono text-slate-400">
                <span>Treble</span>
                <span className="text-cyan-400 font-semibold">
                  {status.trebleGain > 0 ? `+${status.trebleGain}` : status.trebleGain} dB
                </span>
              </div>
              <input
                type="range"
                min="-10"
                max="10"
                value={status.trebleGain}
                onChange={(e) => {
                  const t = Number(e.target.value);
                  onUpdateStatus({ trebleGain: t });
                  audioEngine.setEQ(status.bassGain, t);
                }}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            {/* Balance */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono text-slate-400">
                <span>Balance</span>
                <span className="text-white">
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
                onChange={(e) => {
                  const bal = Number(e.target.value);
                  onUpdateStatus({ balance: bal });
                  audioEngine.setBalance(bal);
                }}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
