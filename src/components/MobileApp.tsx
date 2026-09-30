import React, { useState } from 'react';
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
  Sparkles
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
  const [activeScreen, setActiveScreen] = useState<'player' | 'connect' | 'tone' | 'wifi' | 'ota' | 'status'>('player');

  // Phone audio server manual handshake inputs
  const [phoneServerIp, setPhoneServerIp] = useState('192.168.4.2');
  const [phoneServerPort, setPhoneServerPort] = useState('9090');
  const [isConnectingPhone, setIsConnectingPhone] = useState(false);
  const [phoneConnected, setPhoneConnected] = useState(false);

  // WiFi Setup Form
  const [wifiSsid, setWifiSsid] = useState(status.wifiSsid);
  const [wifiPassword, setWifiPassword] = useState('MyWiFiPassword123');
  const [useStatic, setUseStatic] = useState(false);
  const [staticIp, setStaticIp] = useState(status.ipAddress);
  const [wifiSaved, setWifiSaved] = useState(false);

  // OTA Update
  const [otaFile, setOtaFile] = useState<File | null>(null);
  const [otaProgress, setOtaProgress] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);
  const [flashSuccess, setFlashSuccess] = useState(false);

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

  const handleConnectPhoneServer = (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnectingPhone(true);
    setTimeout(() => {
      setIsConnectingPhone(false);
      setPhoneConnected(true);
      onUpdateStatus({
        nowPlayingTrack: 'Phone Audio Stream',
        nowPlayingArtist: `Host: ${phoneServerIp}:${phoneServerPort}`,
        nowPlayingApp: 'WiFiAudioStreaming v1.2',
        playbackState: 'playing',
      });
      if (isSimulated) audioEngine.playSimulator();
    }, 800);
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
    setTimeout(() => setWifiSaved(false), 3000);
  };

  const handleStartOta = () => {
    if (!otaFile) return;
    setIsFlashing(true);
    setOtaProgress(0);
    const total = otaFile.size;
    let sent = 0;
    const interval = setInterval(() => {
      sent += Math.floor(total / 12) + 8000;
      const pct = Math.min(100, Math.round((sent / total) * 100));
      setOtaProgress(pct);

      if (pct >= 100) {
        clearInterval(interval);
        setIsFlashing(false);
        setFlashSuccess(true);
      }
    }, 120);
  };

  return (
    <div className="flex justify-center items-center py-2 px-2">
      {/* Mobile Device Frame */}
      <div className="w-full max-w-[390px] bg-slate-950 border-4 border-slate-800/80 rounded-[44px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col h-[740px] relative select-none">
        
        {/* Dynamic Island / Speaker Notch */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center">
          <div className="h-4.5 w-24 bg-black rounded-full border border-slate-800/60 flex items-center justify-between px-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-800" />
            <span className="w-2 h-2 rounded-full bg-cyan-500/80 animate-pulse" />
          </div>
        </div>

        {/* Mobile Status Header Bar */}
        <div className="pt-8 px-5 pb-3 bg-slate-900/90 border-b border-slate-800/70 flex items-center justify-between z-20">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                isPowerOn ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-slate-600'
              }`}
            />
            <span className="text-xs font-mono font-bold text-white tracking-tight">
              {phoneConnected ? 'STREAMING ACTIVE' : 'ESP32-S3 RECEIVER'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-800/50">
              {status.ipAddress}
            </span>
            <button
              onClick={handleTogglePower}
              className={`p-1.5 rounded-full transition-all ${
                isPowerOn
                  ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                  : 'bg-slate-800 text-slate-500 hover:text-slate-300'
              }`}
              title="Power On / Standby"
            >
              <Power className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Scrollable / Flexible App Content Area */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          
          {/* ======================================================== */}
          {/* SCREEN 1: NOW PLAYING / LIVE STREAM PLAYER */}
          {/* ======================================================== */}
          {activeScreen === 'player' && (
            <div className="flex flex-col h-full justify-between space-y-4">
              {/* Album Art / Audio Stream Visual Display */}
              <div className="relative rounded-3xl overflow-hidden shadow-2xl aspect-square border border-slate-800/80 bg-gradient-to-b from-slate-900 to-black group">
                <img
                  src={status.albumArtUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&auto=format&fit=crop&q=80'}
                  alt="Streaming Stream"
                  className={`w-full h-full object-cover transition-transform duration-700 ${
                    isPlaying ? 'scale-105' : 'scale-100 opacity-60 grayscale'
                  }`}
                />

                {/* Cast Badge */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[11px] font-medium text-white shadow-lg">
                  <Cast className={`w-3.5 h-3.5 ${isPlaying ? 'text-cyan-400 animate-pulse' : 'text-slate-400'}`} />
                  <span>WiFiAudioStreaming v1.2</span>
                </div>

                {/* Live Buffer Tag */}
                <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-mono text-cyan-300">
                  <span>PSRAM: {status.bufferUsagePercent}%</span>
                </div>

                {/* Dac Tag */}
                <div className="absolute bottom-3 left-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900/90 border border-slate-700 text-[10px] font-mono text-slate-300">
                  <span>UDA1334A &bull; 16-bit 44.1kHz</span>
                </div>
              </div>

              {/* Track / Stream Status Information */}
              <div className="text-center px-2 space-y-1">
                <div className="text-base font-bold text-white tracking-tight truncate">
                  {isPowerOn
                    ? status.nowPlayingTrack || 'WiFi Audio Stream'
                    : 'Receiver in Standby'}
                </div>
                <div className="text-xs text-slate-400 font-mono truncate">
                  {isPowerOn
                    ? status.nowPlayingArtist || 'Port 9090 / 9091 Ready'
                    : 'Tap power icon to wake'}
                </div>
              </div>

              {/* Master Volume Slider with Haptic Look */}
              <div className="bg-slate-900/80 rounded-2xl p-3.5 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <button
                    onClick={handleToggleMute}
                    className={`p-1.5 rounded-lg transition-colors ${
                      status.isMuted ? 'text-rose-400 bg-rose-950/40' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {status.isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <span className="font-mono text-white text-xs font-bold tabular-nums">
                    VOLUME: {status.volume}%
                  </span>
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

              {/* Primary Transport Buttons */}
              <div className="flex items-center justify-center gap-5 pt-1">
                <button
                  onClick={handleStop}
                  disabled={!isPowerOn}
                  className="p-3 rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-white active:scale-95 transition-all disabled:opacity-40"
                  title="Flush PSRAM Ring Buffer"
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
                  onClick={() => setActiveScreen('tone')}
                  className="p-3 rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-white active:scale-95 transition-all"
                  title="Equalizer"
                >
                  <Sliders className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* SCREEN 2: CONNECT TO PHONE AUDIO SERVER (PORT 9090) */}
          {/* ======================================================== */}
          {activeScreen === 'connect' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-cyan-400" />
                  Phone Audio Server Hookup
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  When your Android app says <span className="text-amber-300 font-mono font-semibold">&quot;Waiting for client on port 9090&quot;</span>, enter your phone&apos;s IP to connect the ESP32.
                </p>
              </div>

              <form onSubmit={handleConnectPhoneServer} className="space-y-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
                <div>
                  <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">
                    Phone IP Address
                  </label>
                  <input
                    type="text"
                    required
                    value={phoneServerIp}
                    onChange={(e) => setPhoneServerIp(e.target.value)}
                    placeholder="e.g. 192.168.4.2"
                    className="w-full px-3 py-2 text-xs font-mono bg-black/60 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">
                    Target Port
                  </label>
                  <input
                    type="number"
                    value={phoneServerPort}
                    onChange={(e) => setPhoneServerPort(e.target.value)}
                    placeholder="9090"
                    className="w-full px-3 py-2 text-xs font-mono bg-black/60 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isConnectingPhone}
                  className="w-full py-2.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50"
                >
                  <Link className="w-3.5 h-3.5" />
                  <span>{isConnectingPhone ? 'Connecting to Phone...' : 'Connect ESP32 to Phone Audio'}</span>
                </button>
              </form>

              {phoneConnected && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-xs text-emerald-400 font-mono flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>Hooked to phone audio server! Now stream music from your phone.</span>
                </div>
              )}

              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div className="font-semibold text-slate-300">Alternate Push Stream (UDP):</div>
                <div>If your app transmits outbound UDP, stream directly to IP: <code className="text-cyan-300 font-mono">{status.ipAddress}</code> on port <code className="text-amber-300 font-mono">9090</code> or <code className="text-amber-300 font-mono">9091</code>.</div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* SCREEN 3: TONE & EQUALIZER */}
          {/* ======================================================== */}
          {activeScreen === 'tone' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  Hardware EQ & Balance
                </h3>
                <button
                  onClick={() => setActiveScreen('player')}
                  className="text-xs text-cyan-400 font-mono hover:underline"
                >
                  Back to Player
                </button>
              </div>

              {/* Bass Slider */}
              <div className="bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex justify-between text-xs font-mono text-slate-400">
                  <span>Bass Gain</span>
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
                  <span>Treble Gain</span>
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
          {activeScreen === 'wifi' && (
            <form onSubmit={handleSaveWiFi} className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                  <Wifi className="w-4 h-4 text-cyan-400" />
                  Home Wi-Fi Network Setup
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Connect ESP32-S3 to home router. Access later at <strong className="text-cyan-300">http://wifimusic.local</strong>.
                </p>
              </div>

              <div className="space-y-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
                <div>
                  <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">
                    Wi-Fi Network Name (SSID)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter your 2.4GHz Wi-Fi"
                    value={wifiSsid}
                    onChange={(e) => setWifiSsid(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-black/60 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">
                    Wi-Fi Password
                  </label>
                  <input
                    type="password"
                    placeholder="Wi-Fi Password"
                    value={wifiPassword}
                    onChange={(e) => setWifiPassword(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-black/60 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
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
                    <span>Assign Static IP Address</span>
                  </label>
                </div>

                {useStatic && (
                  <div>
                    <input
                      type="text"
                      placeholder="192.168.1.120"
                      value={staticIp}
                      onChange={(e) => setStaticIp(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono bg-black/60 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl transition-colors shadow-lg shadow-cyan-950/50"
                >
                  Save Wi-Fi &amp; Connect
                </button>
              </div>

              {wifiSaved && (
                <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-xl text-xs text-emerald-400 font-mono text-center flex items-center justify-center gap-1.5">
                  <CheckCircle className="w-4 h-4" />
                  <span>Wi-Fi Saved! ESP32-S3 is connecting...</span>
                </div>
              )}
            </form>
          )}

          {/* ======================================================== */}
          {/* SCREEN 5: OTA FIRMWARE UPDATER */}
          {/* ======================================================== */}
          {activeScreen === 'ota' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                  <ArrowUpCircle className="w-4 h-4 text-cyan-400" />
                  Wireless OTA Update
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Flash newly built firmware (.bin) directly over Wi-Fi without cables.
                </p>
              </div>

              <div className="border border-dashed border-slate-800 rounded-2xl p-5 text-center bg-slate-900/60">
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
                  <ArrowUpCircle className="w-8 h-8 text-cyan-400 mb-2" />
                  <span className="text-xs font-semibold text-white">
                    {otaFile ? otaFile.name : 'Select firmware.bin'}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5">
                    {otaFile ? `${(otaFile.size / 1024).toFixed(0)} KB` : 'Touch to browse firmware file'}
                  </span>
                </label>
              </div>

              {(isFlashing || flashSuccess) && (
                <div className="space-y-1.5 bg-slate-900 p-3 rounded-xl border border-slate-800">
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
                className="w-full py-2.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl transition-colors disabled:opacity-40 shadow-lg shadow-cyan-950/50"
              >
                {isFlashing ? 'Flashing firmware...' : 'Start OTA Flash'}
              </button>
            </div>
          )}

          {/* ======================================================== */}
          {/* SCREEN 6: LIVE HARDWARE STATUS & DIAGNOSTICS */}
          {/* ======================================================== */}
          {activeScreen === 'status' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-cyan-400" />
                Live ESP32-S3 Telemetry
              </h3>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-slate-500 text-[10px]">PSRAM OCTAL</div>
                  <div className="text-white font-bold text-sm">8 MB (7.8 MB Free)</div>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-slate-500 text-[10px]">FLASH MEMORY</div>
                  <div className="text-white font-bold text-sm">16 MB QIO</div>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-slate-500 text-[10px]">DAC CHIP</div>
                  <div className="text-cyan-400 font-bold text-sm">UDA1334A I2S</div>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-slate-500 text-[10px]">SAMPLE RATE</div>
                  <div className="text-white font-bold text-sm">44.1 kHz Stereo</div>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-slate-500 text-[10px]">CORE 0 (RECEIVER)</div>
                  <div className="text-white font-bold text-sm">TCP/UDP 9090 &bull; 9091</div>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-slate-500 text-[10px]">CORE 1 (I2S DMA)</div>
                  <div className="text-white font-bold text-sm">Real-Time DMA</div>
                </div>
              </div>

              <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1 font-mono">
                <div className="flex justify-between">
                  <span>mDNS Hostname:</span>
                  <span className="text-cyan-300">wifimusic.local</span>
                </div>
                <div className="flex justify-between">
                  <span>Active Partition:</span>
                  <span className="text-emerald-400">ota_0 (Dual OTA enabled)</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Mobile App Bottom Navigation Bar */}
        <div className="pt-2 pb-5 px-3 bg-slate-900/95 border-t border-slate-800/80 grid grid-cols-5 gap-1 z-20">
          <button
            onClick={() => setActiveScreen('player')}
            className={`py-1.5 rounded-xl text-[10px] font-medium flex flex-col items-center gap-1 transition-colors ${
              activeScreen === 'player' || activeScreen === 'tone'
                ? 'text-cyan-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Disc3 className={`w-4 h-4 ${isPlaying ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Player</span>
          </button>

          <button
            onClick={() => setActiveScreen('connect')}
            className={`py-1.5 rounded-xl text-[10px] font-medium flex flex-col items-center gap-1 transition-colors ${
              activeScreen === 'connect'
                ? 'text-cyan-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Phone Hook</span>
          </button>

          <button
            onClick={() => setActiveScreen('wifi')}
            className={`py-1.5 rounded-xl text-[10px] font-medium flex flex-col items-center gap-1 transition-colors ${
              activeScreen === 'wifi'
                ? 'text-cyan-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wifi className="w-4 h-4" />
            <span>Wi-Fi</span>
          </button>

          <button
            onClick={() => setActiveScreen('ota')}
            className={`py-1.5 rounded-xl text-[10px] font-medium flex flex-col items-center gap-1 transition-colors ${
              activeScreen === 'ota'
                ? 'text-cyan-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowUpCircle className="w-4 h-4" />
            <span>OTA</span>
          </button>

          <button
            onClick={() => setActiveScreen('status')}
            className={`py-1.5 rounded-xl text-[10px] font-medium flex flex-col items-center gap-1 transition-colors ${
              activeScreen === 'status'
                ? 'text-cyan-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Status</span>
          </button>
        </div>

        {/* Home Indicator Bar */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-32 h-1 bg-slate-700/60 rounded-full pointer-events-none" />
      </div>
    </div>
  );
};
