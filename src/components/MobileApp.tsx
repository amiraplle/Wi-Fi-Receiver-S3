import React, { useState, useEffect, useRef } from 'react';
import {
  Power,
  Play,
  Pause,
  Square,
  Volume2,
  VolumeX,
  Sliders,
  Wifi,
  ArrowUpCircle,
  Radio,
  Cast,
  Disc3,
  CheckCircle,
  Link,
  Info,
  Server,
  Activity,
  Layers,
  Sparkles,
  RefreshCw,
  Zap,
  SlidersHorizontal,
  Smartphone,
  Cpu,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import { ReceiverStatus, WiFiConfig } from '../types/index.ts';
import { audioEngine } from '../utils/audioEngine.ts';

interface MobileAppProps {
  status: ReceiverStatus;
  onUpdateStatus: (partial: Partial<ReceiverStatus>) => void;
  onApplyWiFi: (config: WiFiConfig) => void;
  isSimulated: boolean;
  espIp: string;
}

export const MobileApp: React.FC<MobileAppProps> = ({
  status,
  onUpdateStatus,
  onApplyWiFi,
  isSimulated,
  espIp,
}) => {
  // Mobile app bottom navigation screens
  const [activeTab, setActiveTab] = useState<'player' | 'connect' | 'eq' | 'wifi' | 'ota' | 'status'>('player');

  // Phone audio server manual handshake inputs
  const [phoneServerIp, setPhoneServerIp] = useState('192.168.254.113');
  const [phoneServerPort, setPhoneServerPort] = useState('9090');
  const [isConnectingPhone, setIsConnectingPhone] = useState(false);
  const [phoneConnected, setPhoneConnected] = useState(false);

  // WiFi Setup Form
  const [wifiSsid, setWifiSsid] = useState(status.wifiSsid);
  const [wifiPassword, setWifiPassword] = useState('');
  const [useStatic, setUseStatic] = useState(false);
  const [staticIp, setStaticIp] = useState(status.ipAddress);
  const [wifiSaved, setWifiSaved] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedAps, setScannedAps] = useState<Array<{ ssid: string; rssi: number; secure: boolean }>>([
    { ssid: 'GFiber_2.4_Coverage_AECD9', rssi: -48, secure: true },
    { ssid: 'Studio-WiFi-5G', rssi: -62, secure: true },
    { ssid: 'IoT-Devices-Home', rssi: -71, secure: true },
  ]);

  // OTA Update
  const [otaFile, setOtaFile] = useState<File | null>(null);
  const [otaProgress, setOtaProgress] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);
  const [flashSuccess, setFlashSuccess] = useState(false);

  // EQ Presets
  const [activePreset, setActivePreset] = useState<'flat' | 'bass' | 'vocal' | 'club'>('flat');

  // Canvas visualizer reference
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const isPowerOn = status.powerState === 'on';
  const isPlaying = isPowerOn && status.playbackState === 'playing' && !status.isMuted;

  // Toggle Power
  const handleTogglePower = () => {
    const next = isPowerOn ? 'standby' : 'on';
    if (next === 'standby') {
      audioEngine.stopSimulator();
      onUpdateStatus({ powerState: 'standby', playbackState: 'stopped', isMuted: true });
    } else {
      onUpdateStatus({ powerState: 'on', playbackState: 'playing', isMuted: false });
      if (isSimulated) audioEngine.playSimulator();
    }
  };

  // Play / Pause
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

  const applyPreset = (preset: 'flat' | 'bass' | 'vocal' | 'club') => {
    setActivePreset(preset);
    let b = 0;
    let t = 0;
    if (preset === 'bass') {
      b = 6;
      t = 1;
    } else if (preset === 'vocal') {
      b = -2;
      t = 4;
    } else if (preset === 'club') {
      b = 5;
      t = 4;
    }
    onUpdateStatus({ bassGain: b, trebleGain: t });
    audioEngine.setEQ(b, t);
  };

  const handleConnectPhoneServer = (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnectingPhone(true);
    setTimeout(() => {
      setIsConnectingPhone(false);
      setPhoneConnected(true);
      onUpdateStatus({
        nowPlayingTrack: 'Streaming from Android',
        nowPlayingArtist: `Host: ${phoneServerIp}:${phoneServerPort}`,
        nowPlayingApp: 'WiFiAudioStreaming v1.2',
        playbackState: 'playing',
        packetsReceivedPerSec: 184,
      });
      if (isSimulated) audioEngine.playSimulator();
    }, 600);
  };

  const handleScanWifi = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      setScannedAps([
        { ssid: 'GFiber_2.4_Coverage_AECD9', rssi: -45, secure: true },
        { ssid: 'Studio-WiFi-5G', rssi: -58, secure: true },
        { ssid: 'Office-Net-Mesh', rssi: -65, secure: true },
        { ssid: 'Guest-Access-2.4', rssi: -72, secure: false },
      ]);
    }, 1200);
  };

  const handleSaveWiFi = (e: React.FormEvent) => {
    e.preventDefault();
    onApplyWiFi({
      ssid: wifiSsid,
      password: wifiPassword,
      useStaticIp: useStatic,
      ip: staticIp,
      gateway: '192.168.1.1',
      subnet: '255.255.255.0',
      dns: '8.8.8.8',
      hostname: 'wifimusic',
      apModeFallback: true,
      apSsid: 'ESP32-Audio-Setup',
      apPassword: 'password1234',
    });
    setWifiSaved(true);
    setTimeout(() => setWifiSaved(false), 3500);
  };

  const handleStartOta = () => {
    if (!otaFile) return;
    setIsFlashing(true);
    setOtaProgress(0);
    const total = otaFile.size;
    let sent = 0;
    const interval = setInterval(() => {
      sent += Math.floor(total / 14) + 8000;
      const pct = Math.min(100, Math.round((sent / total) * 100));
      setOtaProgress(pct);

      if (pct >= 100) {
        clearInterval(interval);
        setIsFlashing(false);
        setFlashSuccess(true);
      }
    }, 100);
  };

  // Canvas visualizer animation
  useEffect(() => {
    let animId: number;
    const render = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const width = canvas.width;
          const height = canvas.height;
          ctx.clearRect(0, 0, width, height);

          if (isPlaying) {
            const waveData = audioEngine.getWaveformData();
            ctx.lineWidth = 2.5;
            const grad = ctx.createLinearGradient(0, 0, width, 0);
            grad.addColorStop(0, '#06b6d4');
            grad.addColorStop(0.5, '#3b82f6');
            grad.addColorStop(1, '#10b981');
            ctx.strokeStyle = grad;
            ctx.beginPath();

            const sliceWidth = width / (waveData.length || 64);
            let x = 0;
            for (let i = 0; i < (waveData.length || 64); i++) {
              const v = (waveData[i] || (Math.sin(i * 0.2 + Date.now() * 0.008) * 35 + 128)) / 128.0;
              const y = (v * height) / 2;
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
              x += sliceWidth;
            }
            ctx.stroke();
          } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, height / 2);
            ctx.lineTo(width, height / 2);
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
    <div className="w-full flex justify-center py-2 sm:py-6">
      {/* Native Mobile Web App Container */}
      <div className="w-full max-w-md bg-slate-950 text-slate-100 rounded-3xl border border-slate-800 shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex flex-col min-h-[760px] max-h-[880px] overflow-hidden relative select-none">
        
        {/* Top App Header */}
        <header className="sticky top-0 z-30 px-5 py-3.5 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                isPowerOn
                  ? 'bg-emerald-400 shadow-[0_0_10px_#10b981]'
                  : 'bg-slate-600'
              }`}
            />
            <div>
              <div className="text-xs font-bold tracking-tight text-white flex items-center gap-1.5 font-mono">
                <span>{phoneConnected ? 'STREAMING ACTIVE' : 'ESP32-S3 RECEIVER'}</span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                {isSimulated ? 'Local Simulator' : `IP: ${status.ipAddress}`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-cyan-400 px-2 py-0.5 rounded-full bg-cyan-950/70 border border-cyan-800/50">
              {status.wifiSsid || 'AP Mode'}
            </span>
            <button
              onClick={handleTogglePower}
              className={`p-2 rounded-full transition-all ${
                isPowerOn
                  ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
              title="Power State"
            >
              <Power className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Scrollable Screen Content Area */}
        <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          
          {/* ======================================================== */}
          {/* SCREEN 1: NOW PLAYING / LIVE STREAM PLAYER */}
          {/* ======================================================== */}
          {activeTab === 'player' && (
            <div className="space-y-4">
              {/* Artwork Card */}
              <div className="relative rounded-2xl overflow-hidden aspect-square border border-slate-800 bg-gradient-to-b from-slate-900 to-black shadow-xl group">
                <img
                  src={status.albumArtUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80'}
                  alt="Streaming Album Art"
                  className={`w-full h-full object-cover transition-transform duration-700 ${
                    isPlaying ? 'scale-105' : 'scale-100 opacity-60 grayscale'
                  }`}
                />

                {/* Status Badges */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-[11px] font-medium text-white shadow-lg">
                  <Cast className={`w-3.5 h-3.5 ${isPlaying ? 'text-cyan-400 animate-pulse' : 'text-slate-400'}`} />
                  <span>WiFiAudioStreaming v1.2</span>
                </div>

                <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-[10px] font-mono text-cyan-300">
                  <span>PSRAM Buffer: {status.bufferUsagePercent}%</span>
                </div>

                <div className="absolute bottom-3 left-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/80 backdrop-blur-md border border-slate-700/80 text-[10px] font-mono text-slate-300">
                  <span>UDA1334A &bull; 16-bit 44.1kHz</span>
                </div>
              </div>

              {/* Real-time Waveform Canvas */}
              <div className="bg-slate-900/90 rounded-2xl p-2.5 border border-slate-800/80">
                <div className="flex justify-between items-center px-1 mb-1 text-[10px] font-mono text-slate-400">
                  <span>I2S DMA AUDIO STREAM</span>
                  <span className={isPlaying ? 'text-emerald-400' : 'text-slate-500'}>
                    {isPlaying ? '● 44,100 Hz' : 'IDLE'}
                  </span>
                </div>
                <canvas
                  ref={canvasRef}
                  width={340}
                  height={42}
                  className="w-full h-10 rounded bg-black/50"
                />
              </div>

              {/* Track Metadata */}
              <div className="text-center px-2 space-y-0.5">
                <h2 className="text-base font-bold text-white tracking-tight truncate">
                  {isPowerOn ? status.nowPlayingTrack : 'Receiver in Standby'}
                </h2>
                <p className="text-xs text-slate-400 font-mono truncate">
                  {isPowerOn ? status.nowPlayingArtist : 'Tap power icon to activate'}
                </p>
              </div>

              {/* Master Hardware Volume Slider */}
              <div className="bg-slate-900/80 rounded-2xl p-3.5 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2 text-slate-300">
                    <button
                      onClick={handleToggleMute}
                      className={`p-1 rounded transition-colors ${
                        status.isMuted ? 'text-rose-400 bg-rose-950/50' : 'text-slate-400 hover:text-white'
                      }`}
                      title="Toggle Mute"
                    >
                      {status.isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <span className="font-semibold uppercase text-slate-400 text-[11px]">Hardware Volume</span>
                  </div>
                  <span className="font-bold text-cyan-400">{status.volume}%</span>
                </div>

                <input
                  type="range"
                  min="0"
                  max="100"
                  value={status.volume}
                  onChange={(e) => handleVolume(Number(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>

              {/* Transport Buttons */}
              <div className="flex items-center justify-center gap-5 pt-1">
                <button
                  onClick={handleStop}
                  disabled={!isPowerOn}
                  className="p-3.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-white active:scale-95 transition-all disabled:opacity-40"
                  title="Stop & Flush Buffer"
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>

                <button
                  onClick={handlePlayPause}
                  className={`p-4 rounded-full shadow-lg active:scale-95 transition-all ${
                    isPlaying
                      ? 'bg-cyan-500 text-slate-950 shadow-cyan-500/30'
                      : 'bg-white text-slate-950 hover:bg-slate-200'
                  }`}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6 fill-current" />
                  ) : (
                    <Play className="w-6 h-6 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('eq')}
                  className="p-3.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-white active:scale-95 transition-all"
                  title="Equalizer"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Android Connect Pill */}
              <div
                onClick={() => setActiveTab('connect')}
                className="cursor-pointer p-3 bg-cyan-950/30 border border-cyan-800/40 rounded-2xl flex items-center justify-between text-xs transition-colors hover:bg-cyan-950/50"
              >
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-cyan-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-white">Android Audio Server Hook</div>
                    <div className="text-[10px] text-cyan-300 font-mono">Port 9090 &bull; Fast Registration</div>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-cyan-400">Open &rarr;</span>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* SCREEN 2: PHONE HOOK (PORT 9090) */}
          {/* ======================================================== */}
          {activeTab === 'connect' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-1">
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <Server className="w-4 h-4 text-cyan-400" />
                  <span>WiFiAudioStreaming Android Hook</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  When your Android phone displays <strong className="text-amber-300 font-mono">&quot;Waiting for client on port 9090&quot;</strong>, enter its IP address below. The ESP32 will send the UDP registration beacon to trigger transmission!
                </p>
              </div>

              <form onSubmit={handleConnectPhoneServer} className="space-y-3.5 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
                <div>
                  <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">
                    Phone IP Address (From Android App)
                  </label>
                  <input
                    type="text"
                    required
                    value={phoneServerIp}
                    onChange={(e) => setPhoneServerIp(e.target.value)}
                    placeholder="e.g. 192.168.254.113"
                    className="w-full px-3.5 py-2.5 text-xs font-mono bg-black/60 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">
                    Audio Port
                  </label>
                  <input
                    type="number"
                    value={phoneServerPort}
                    onChange={(e) => setPhoneServerPort(e.target.value)}
                    placeholder="9090"
                    className="w-full px-3.5 py-2.5 text-xs font-mono bg-black/60 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isConnectingPhone}
                  className="w-full py-3 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 active:scale-[0.98]"
                >
                  <Link className="w-4 h-4" />
                  <span>{isConnectingPhone ? 'Connecting to Phone...' : 'Connect ESP32 to Phone Audio'}</span>
                </button>
              </form>

              {phoneConnected && (
                <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/40 rounded-2xl text-xs text-emerald-400 font-mono flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>Connected to phone audio server! Now playing through UDA1334A DAC.</span>
                </div>
              )}

              <div className="p-3.5 bg-slate-900/60 rounded-2xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div className="font-semibold text-slate-300">Direct Broadcast Stream (Port 9091):</div>
                <div>If your app broadcasts outbound UDP packets, stream directly to ESP32 IP: <code className="text-cyan-300 font-mono">{status.ipAddress}</code> on port <code className="text-amber-300 font-mono">9090</code> or <code className="text-amber-300 font-mono">9091</code>.</div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* SCREEN 3: EQUALIZER & TONE */}
          {/* ======================================================== */}
          {activeTab === 'eq' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-white flex items-center gap-1.5">
                  <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
                  <span>Hardware Tone &amp; EQ</span>
                </div>
                <button
                  onClick={() => applyPreset('flat')}
                  className="text-xs text-cyan-400 font-mono flex items-center gap-1 hover:underline"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>

              {/* Presets */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'flat', label: 'Flat' },
                  { id: 'bass', label: 'Bass+' },
                  { id: 'vocal', label: 'Vocal' },
                  { id: 'club', label: 'Club' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p.id as any)}
                    className={`py-2 rounded-xl text-xs font-mono font-medium transition-colors ${
                      activePreset === p.id
                        ? 'bg-cyan-600 text-white font-bold'
                        : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Bass Slider */}
              <div className="bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex justify-between text-xs font-mono text-slate-400">
                  <span>Bass Gain (Low-shelf)</span>
                  <span className="text-cyan-400 font-semibold">{status.bassGain > 0 ? `+${status.bassGain}` : status.bassGain} dB</span>
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

              {/* Treble Slider */}
              <div className="bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex justify-between text-xs font-mono text-slate-400">
                  <span>Treble Gain (High-shelf)</span>
                  <span className="text-cyan-400 font-semibold">{status.trebleGain > 0 ? `+${status.trebleGain}` : status.trebleGain} dB</span>
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

              {/* Balance Slider */}
              <div className="bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex justify-between text-xs font-mono text-slate-400">
                  <span>Stereo Balance</span>
                  <span className="text-white">
                    {status.balance === 0 ? 'Center' : status.balance < 0 ? `L ${Math.abs(status.balance)}%` : `R ${status.balance}%`}
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

          {/* ======================================================== */}
          {/* SCREEN 4: WI-FI SETUP */}
          {/* ======================================================== */}
          {activeTab === 'wifi' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <Wifi className="w-4 h-4 text-cyan-400" />
                    <span>Wi-Fi Network Setup</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">Join your 2.4GHz home router.</p>
                </div>
                <button
                  onClick={handleScanWifi}
                  disabled={isScanning}
                  className="px-2.5 py-1 text-xs font-mono rounded-lg bg-slate-900 border border-slate-800 text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin' : ''}`} />
                  <span>Scan</span>
                </button>
              </div>

              {/* Scanned SSIDs list */}
              {scannedAps.length > 0 && (
                <div className="bg-slate-900/70 rounded-2xl p-3 border border-slate-800 space-y-1.5">
                  <div className="text-[10px] font-mono text-slate-500 uppercase px-1">Nearby Networks</div>
                  {scannedAps.map((ap) => (
                    <div
                      key={ap.ssid}
                      onClick={() => setWifiSsid(ap.ssid)}
                      className="cursor-pointer p-2 rounded-xl bg-black/40 hover:bg-slate-800 flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="font-mono text-white">{ap.ssid}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">{ap.rssi} dBm</span>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleSaveWiFi} className="space-y-3.5 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
                <div>
                  <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">
                    Network Name (SSID)
                  </label>
                  <input
                    type="text"
                    required
                    value={wifiSsid}
                    onChange={(e) => setWifiSsid(e.target.value)}
                    placeholder="Enter 2.4GHz SSID"
                    className="w-full px-3.5 py-2.5 text-xs font-mono bg-black/60 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">
                    Wi-Fi Password
                  </label>
                  <input
                    type="password"
                    value={wifiPassword}
                    onChange={(e) => setWifiPassword(e.target.value)}
                    placeholder="WPA2/WPA3 Password"
                    className="w-full px-3.5 py-2.5 text-xs font-mono bg-black/60 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={useStatic}
                      onChange={(e) => setUseStatic(e.target.checked)}
                      className="rounded bg-black border-slate-700 text-cyan-500 focus:ring-0"
                    />
                    <span>Use Static IP Address</span>
                  </label>
                </div>

                {useStatic && (
                  <div>
                    <input
                      type="text"
                      placeholder="192.168.1.120"
                      value={staticIp}
                      onChange={(e) => setStaticIp(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs font-mono bg-black/60 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-3 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl transition-all shadow-lg shadow-cyan-950/50"
                >
                  Save Wi-Fi &amp; Connect
                </button>
              </form>

              {wifiSaved && (
                <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-2xl text-xs text-emerald-400 font-mono text-center flex items-center justify-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Wi-Fi Saved! ESP32-S3 reconnecting...</span>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* SCREEN 5: OTA FIRMWARE UPDATER */}
          {/* ======================================================== */}
          {activeTab === 'ota' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <ArrowUpCircle className="w-4 h-4 text-cyan-400" />
                  <span>Wireless OTA Update</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Flash compiled <strong className="text-white">firmware.bin</strong> wirelessly without USB cables.
                </p>
              </div>

              <div className="border border-dashed border-slate-800 rounded-2xl p-6 text-center bg-slate-900/60">
                <input
                  type="file"
                  id="mobile-ota-input"
                  accept=".bin"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setOtaFile(e.target.files[0]);
                      setFlashSuccess(false);
                    }
                  }}
                  className="hidden"
                />
                <label htmlFor="mobile-ota-input" className="cursor-pointer flex flex-col items-center">
                  <ArrowUpCircle className="w-9 h-9 text-cyan-400 mb-2" />
                  <span className="text-xs font-semibold text-white">
                    {otaFile ? otaFile.name : 'Select firmware.bin'}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5">
                    {otaFile ? `${(otaFile.size / 1024).toFixed(0)} KB` : 'Touch to browse firmware file'}
                  </span>
                </label>
              </div>

              {(isFlashing || flashSuccess) && (
                <div className="space-y-1.5 bg-slate-900 p-3.5 rounded-2xl border border-slate-800">
                  <div className="flex justify-between text-xs font-mono text-slate-400">
                    <span>{flashSuccess ? 'Flash Completed!' : 'Writing to OTA partition...'}</span>
                    <span>{otaProgress}%</span>
                  </div>
                  <div className="h-2 w-full bg-black rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-150 ${flashSuccess ? 'bg-emerald-400' : 'bg-cyan-400'}`}
                      style={{ width: `${otaProgress}%` }}
                    />
                  </div>
                  {flashSuccess && (
                    <div className="text-[11px] text-emerald-400 font-mono pt-1 text-center">
                      Rebooting into fresh firmware...
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleStartOta}
                disabled={!otaFile || isFlashing}
                className="w-full py-3 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl transition-all disabled:opacity-40 shadow-lg shadow-cyan-950/50"
              >
                {isFlashing ? 'Flashing firmware...' : 'Start OTA Flash'}
              </button>
            </div>
          )}

          {/* ======================================================== */}
          {/* SCREEN 6: LIVE HARDWARE STATUS & DIAGNOSTICS */}
          {/* ======================================================== */}
          {activeTab === 'status' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span>Live ESP32-S3 Diagnostics</span>
              </h3>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
                  <div className="text-slate-500 text-[10px]">PSRAM OCTAL</div>
                  <div className="text-white font-bold text-sm">8 MB (~7.8 MB Free)</div>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
                  <div className="text-slate-500 text-[10px]">INTERNAL HEAP</div>
                  <div className="text-white font-bold text-sm">~290 KB Free</div>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
                  <div className="text-slate-500 text-[10px]">DAC DRIVER</div>
                  <div className="text-cyan-400 font-bold text-sm">UDA1334A I2S</div>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
                  <div className="text-slate-500 text-[10px]">AUDIO STREAM</div>
                  <div className="text-white font-bold text-sm">44.1 kHz 16-bit</div>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
                  <div className="text-slate-500 text-[10px]">CORE 0 (RECEIVER)</div>
                  <div className="text-white font-bold text-sm">TCP/UDP 9090 &bull; 9091</div>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
                  <div className="text-slate-500 text-[10px]">CORE 1 (I2S DMA)</div>
                  <div className="text-white font-bold text-sm">Real-Time DMA</div>
                </div>
              </div>

              <div className="p-3.5 bg-slate-900/80 rounded-2xl border border-slate-800 text-[11px] text-slate-400 space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span>mDNS Hostname:</span>
                  <span className="text-cyan-300">wifimusic.local</span>
                </div>
                <div className="flex justify-between">
                  <span>I2S Pins:</span>
                  <span className="text-slate-200">BCK=5, WS=6, DOUT=4, MUTE=7</span>
                </div>
                <div className="flex justify-between">
                  <span>Active Partition:</span>
                  <span className="text-emerald-400">ota_0 (Dual OTA enabled)</span>
                </div>
              </div>
            </div>
          )}

        </main>

        {/* Mobile App Bottom Navigation Bar */}
        <nav className="sticky bottom-0 z-30 pt-2 pb-3 px-2 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/80 grid grid-cols-6 gap-0.5">
          <button
            onClick={() => setActiveTab('player')}
            className={`py-1.5 rounded-xl text-[9px] font-medium flex flex-col items-center gap-1 transition-all ${
              activeTab === 'player'
                ? 'text-cyan-400 font-bold bg-cyan-950/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Disc3 className={`w-4 h-4 ${isPlaying ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Player</span>
          </button>

          <button
            onClick={() => setActiveTab('connect')}
            className={`py-1.5 rounded-xl text-[9px] font-medium flex flex-col items-center gap-1 transition-all ${
              activeTab === 'connect'
                ? 'text-cyan-400 font-bold bg-cyan-950/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Hook</span>
          </button>

          <button
            onClick={() => setActiveTab('eq')}
            className={`py-1.5 rounded-xl text-[9px] font-medium flex flex-col items-center gap-1 transition-all ${
              activeTab === 'eq'
                ? 'text-cyan-400 font-bold bg-cyan-950/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Tone</span>
          </button>

          <button
            onClick={() => setActiveTab('wifi')}
            className={`py-1.5 rounded-xl text-[9px] font-medium flex flex-col items-center gap-1 transition-all ${
              activeTab === 'wifi'
                ? 'text-cyan-400 font-bold bg-cyan-950/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wifi className="w-4 h-4" />
            <span>Wi-Fi</span>
          </button>

          <button
            onClick={() => setActiveTab('ota')}
            className={`py-1.5 rounded-xl text-[9px] font-medium flex flex-col items-center gap-1 transition-all ${
              activeTab === 'ota'
                ? 'text-cyan-400 font-bold bg-cyan-950/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowUpCircle className="w-4 h-4" />
            <span>OTA</span>
          </button>

          <button
            onClick={() => setActiveTab('status')}
            className={`py-1.5 rounded-xl text-[9px] font-medium flex flex-col items-center gap-1 transition-all ${
              activeTab === 'status'
                ? 'text-cyan-400 font-bold bg-cyan-950/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Status</span>
          </button>
        </nav>

      </div>
    </div>
  );
};
