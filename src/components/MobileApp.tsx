import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  RotateCcw,
  RefreshCw,
  CheckCircle,
  Wifi,
  ArrowUpCircle,
  Activity,
  SlidersHorizontal,
  Server,
  Disc3,
  HardDrive
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
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'player' | 'hook' | 'tone' | 'wifi' | 'ota' | 'status'>('player');

  // Phone Hook form
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

  const isPowerOn = status.powerState === 'on';
  const isPlaying = isPowerOn && status.playbackState === 'playing' && !status.isMuted;

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
    if (preset === 'bass') { b = 6; t = 1; }
    else if (preset === 'vocal') { b = -2; t = 4; }
    else if (preset === 'club') { b = 5; t = 4; }
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
        nowPlayingTrack: 'Phone Audio Stream',
        nowPlayingArtist: `Host: ${phoneServerIp}:${phoneServerPort}`,
        nowPlayingApp: 'WiFiAudioStreaming v1.2',
        playbackState: 'playing',
        packetsReceivedPerSec: 184,
      });
      if (isSimulated) audioEngine.playSimulator();
      setActiveTab('player');
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

  return (
    <div className="w-full flex justify-center py-2 sm:py-6">
      {/* Container matching screenshot */}
      <div className="w-full max-w-[420px] bg-[#020712] text-slate-100 rounded-3xl border border-slate-800/90 shadow-[0_25px_60px_rgba(0,0,0,0.9)] flex flex-col min-h-[640px] overflow-hidden relative select-none">
        
        {/* Top Header matching screenshot */}
        <header className="px-6 pt-6 pb-4 flex items-center justify-between">
          <div>
            <div className="text-xl font-bold tracking-tight text-white leading-tight">ESP32-S3</div>
            <div className="text-xl font-bold tracking-tight text-white leading-tight">AudioLink</div>
          </div>

          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-cyan-800/60 bg-cyan-950/30 text-cyan-300 font-mono text-xs shadow-sm">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>{isSimulated ? 'Browser Simulator' : `Device: ${espIp}`}</span>
          </div>
        </header>

        {/* Screen Content */}
        <main className="flex-1 px-5 py-2 flex flex-col justify-between space-y-4">
          
          {/* ======================================================== */}
          {/* TAB 1: PLAYER SCREEN (EXACT MATCH TO USER SCREENSHOT)    */}
          {/* ======================================================== */}
          {activeTab === 'player' && (
            <div className="space-y-6 pt-2">
              
              {/* Track Title & Artist */}
              <div className="text-center space-y-1">
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  {status.nowPlayingTrack || 'Midnight City'}
                </h1>
                <p className="text-sm font-medium text-slate-400">
                  {status.nowPlayingArtist || 'M83'}
                </p>
              </div>

              {/* Hardware Volume Card */}
              <div className="bg-[#050f24] rounded-2xl p-4 border border-slate-800/80 space-y-3 shadow-inner">
                <div className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2 text-slate-300">
                    <button
                      onClick={handleToggleMute}
                      className="text-slate-400 hover:text-white transition-colors"
                      title="Toggle Mute"
                    >
                      {status.isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-slate-300" />}
                    </button>
                    <span className="font-semibold text-slate-300 text-xs tracking-wider">HARDWARE VOLUME</span>
                  </div>
                  <span className="font-bold text-[#00c5e0] text-sm tabular-nums">{status.volume}%</span>
                </div>

                <div className="relative flex items-center">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={status.volume}
                    onChange={(e) => handleVolume(Number(e.target.value))}
                    className="w-full h-1.5 bg-[#142342] rounded-lg appearance-none cursor-pointer accent-[#00c5e0]"
                  />
                </div>
              </div>

              {/* Transport Buttons: Stop, Large Cyan Play/Pause, Tone */}
              <div className="flex items-center justify-center gap-6 py-2">
                {/* Stop Button */}
                <button
                  onClick={handleStop}
                  className="w-14 h-14 rounded-full bg-[#0c1833] border border-slate-800/90 text-slate-300 flex items-center justify-center hover:bg-[#142347] active:scale-95 transition-all shadow-md"
                  title="Stop & Flush Buffer"
                >
                  <div className="w-4 h-4 rounded-sm bg-slate-300" />
                </button>

                {/* Big Glowing Cyan Play/Pause Button */}
                <button
                  onClick={handlePlayPause}
                  className="w-20 h-20 rounded-full bg-[#00c5e0] text-black flex items-center justify-center shadow-[0_0_30px_rgba(0,197,224,0.45)] hover:bg-[#22d8f0] active:scale-95 transition-all"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <div className="flex gap-1.5">
                      <div className="w-2 h-7 bg-black rounded-sm" />
                      <div className="w-2 h-7 bg-black rounded-sm" />
                    </div>
                  ) : (
                    <div className="w-0 h-0 border-y-[12px] border-y-transparent border-l-[20px] border-l-black ml-1.5" />
                  )}
                </button>

                {/* Tone / EQ Shortcut Button */}
                <button
                  onClick={() => setActiveTab('tone')}
                  className="w-14 h-14 rounded-full bg-[#0c1833] border border-slate-800/90 text-slate-300 flex items-center justify-center hover:bg-[#142347] active:scale-95 transition-all shadow-md"
                  title="Equalizer & Tone"
                >
                  <SlidersHorizontal className="w-5 h-5 text-slate-300" />
                </button>
              </div>

              {/* Android Audio Server Hook Card */}
              <div
                onClick={() => setActiveTab('hook')}
                className="cursor-pointer p-4 bg-[#031528] border border-cyan-800/50 rounded-2xl flex items-center justify-between transition-all hover:bg-[#051e38] shadow-md group"
              >
                <div className="flex items-center gap-3">
                  <div className="text-[#00c5e0] p-1 rounded-lg bg-cyan-950/60 border border-cyan-800/40">
                    <Server className="w-5 h-5 text-[#00c5e0]" />
                  </div>
                  <div>
                    <div className="font-bold text-white text-sm">Android Audio Server Hook</div>
                    <div className="text-xs text-[#00c5e0] font-mono mt-0.5">
                      Port 9090 &bull; Fast Registration
                    </div>
                  </div>
                </div>

                <div className="flex items-center text-xs font-semibold text-[#00c5e0] group-hover:translate-x-0.5 transition-transform font-mono">
                  Open &rarr;
                </div>
              </div>

            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: HOOK (PORT 9090 ANDROID SERVER)                   */}
          {/* ======================================================== */}
          {activeTab === 'hook' && (
            <div className="space-y-4 pt-2">
              <div className="p-4 bg-[#050f24] rounded-2xl border border-slate-800 space-y-1.5">
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <Server className="w-4 h-4 text-[#00c5e0]" />
                  <span>WiFiAudioStreaming Android Hook</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  When your Android phone says <strong className="text-amber-300 font-mono">&quot;Waiting for client on port 9090&quot;</strong>, enter its IP address below. The ESP32 will send the UDP registration beacon to trigger transmission!
                </p>
              </div>

              <form onSubmit={handleConnectPhoneServer} className="space-y-3.5 bg-[#050f24] p-4 rounded-2xl border border-slate-800">
                <div>
                  <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">
                    Phone IP Address
                  </label>
                  <input
                    type="text"
                    required
                    value={phoneServerIp}
                    onChange={(e) => setPhoneServerIp(e.target.value)}
                    placeholder="e.g. 192.168.254.113"
                    className="w-full px-3.5 py-2.5 text-xs font-mono bg-black/60 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-[#00c5e0]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">
                    Port
                  </label>
                  <input
                    type="number"
                    value={phoneServerPort}
                    onChange={(e) => setPhoneServerPort(e.target.value)}
                    placeholder="9090"
                    className="w-full px-3.5 py-2.5 text-xs font-mono bg-black/60 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-[#00c5e0]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isConnectingPhone}
                  className="w-full py-3 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all shadow-lg active:scale-[0.98]"
                >
                  {isConnectingPhone ? 'Linking to Phone...' : 'Link ESP32 to Phone Audio'}
                </button>
              </form>

              {phoneConnected && (
                <div className="p-3 bg-emerald-950/50 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 font-mono flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>Hooked to phone server! Audio playing through DAC.</span>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: TONE (EQUALIZER)                                  */}
          {/* ======================================================== */}
          {activeTab === 'tone' && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-[#00c5e0]" />
                  <span>Hardware Tone &amp; Equalizer</span>
                </div>
                <button
                  onClick={() => applyPreset('flat')}
                  className="text-xs text-[#00c5e0] font-mono flex items-center gap-1 hover:underline"
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
                        ? 'bg-[#00c5e0] text-black font-bold'
                        : 'bg-[#050f24] text-slate-400 border border-slate-800 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Bass Slider */}
              <div className="bg-[#050f24] p-3.5 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex justify-between text-xs font-mono text-slate-400">
                  <span>Bass Gain (Low-shelf)</span>
                  <span className="text-[#00c5e0] font-semibold">{status.bassGain > 0 ? `+${status.bassGain}` : status.bassGain} dB</span>
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
                  className="w-full h-1.5 bg-[#142342] rounded-lg appearance-none cursor-pointer accent-[#00c5e0]"
                />
              </div>

              {/* Treble Slider */}
              <div className="bg-[#050f24] p-3.5 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex justify-between text-xs font-mono text-slate-400">
                  <span>Treble Gain (High-shelf)</span>
                  <span className="text-[#00c5e0] font-semibold">{status.trebleGain > 0 ? `+${status.trebleGain}` : status.trebleGain} dB</span>
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
                  className="w-full h-1.5 bg-[#142342] rounded-lg appearance-none cursor-pointer accent-[#00c5e0]"
                />
              </div>

              {/* Balance Slider */}
              <div className="bg-[#050f24] p-3.5 rounded-2xl border border-slate-800 space-y-2">
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
                  className="w-full h-1.5 bg-[#142342] rounded-lg appearance-none cursor-pointer accent-[#00c5e0]"
                />
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 4: WI-FI SETUP                                       */}
          {/* ======================================================== */}
          {activeTab === 'wifi' && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <Wifi className="w-4 h-4 text-[#00c5e0]" />
                    <span>Wi-Fi Network Setup</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">Connect to your 2.4GHz home router.</p>
                </div>
                <button
                  onClick={handleScanWifi}
                  disabled={isScanning}
                  className="px-2.5 py-1 text-xs font-mono rounded-lg bg-[#050f24] border border-slate-800 text-[#00c5e0] flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin' : ''}`} />
                  <span>Scan</span>
                </button>
              </div>

              {scannedAps.length > 0 && (
                <div className="bg-[#050f24] rounded-2xl p-3 border border-slate-800 space-y-1.5">
                  <div className="text-[10px] font-mono text-slate-500 uppercase px-1">Nearby Networks</div>
                  {scannedAps.map((ap) => (
                    <div
                      key={ap.ssid}
                      onClick={() => setWifiSsid(ap.ssid)}
                      className="cursor-pointer p-2 rounded-xl bg-black/40 hover:bg-slate-800 flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Wifi className="w-3.5 h-3.5 text-[#00c5e0]" />
                        <span className="font-mono text-white">{ap.ssid}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">{ap.rssi} dBm</span>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleSaveWiFi} className="space-y-3 bg-[#050f24] p-4 rounded-2xl border border-slate-800">
                <div>
                  <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">SSID</label>
                  <input
                    type="text"
                    required
                    value={wifiSsid}
                    onChange={(e) => setWifiSsid(e.target.value)}
                    placeholder="2.4GHz Network Name"
                    className="w-full px-3 py-2 text-xs font-mono bg-black/60 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-[#00c5e0]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">Password</label>
                  <input
                    type="password"
                    value={wifiPassword}
                    onChange={(e) => setWifiPassword(e.target.value)}
                    placeholder="WPA2/WPA3 Password"
                    className="w-full px-3 py-2 text-xs font-mono bg-black/60 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-[#00c5e0]"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 text-xs font-semibold bg-[#00c5e0] hover:bg-[#22d8f0] text-black rounded-xl transition-all font-bold"
                >
                  Save &amp; Connect
                </button>
              </form>

              {wifiSaved && (
                <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-xl text-xs text-emerald-400 font-mono text-center flex items-center justify-center gap-1.5">
                  <CheckCircle className="w-4 h-4" />
                  <span>Wi-Fi Saved! ESP32-S3 reconnecting...</span>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 5: OTA UPDATE                                        */}
          {/* ======================================================== */}
          {activeTab === 'ota' && (
            <div className="space-y-4 pt-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <ArrowUpCircle className="w-4 h-4 text-[#00c5e0]" />
                  <span>Wireless OTA Update</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Upload compiled <strong className="text-white">firmware.bin</strong> over Wi-Fi without cables.
                </p>
              </div>

              <div className="border border-dashed border-slate-800 rounded-2xl p-6 text-center bg-[#050f24]">
                <input
                  type="file"
                  id="ota-input"
                  accept=".bin"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setOtaFile(e.target.files[0]);
                      setFlashSuccess(false);
                    }
                  }}
                  className="hidden"
                />
                <label htmlFor="ota-input" className="cursor-pointer flex flex-col items-center">
                  <ArrowUpCircle className="w-8 h-8 text-[#00c5e0] mb-2" />
                  <span className="text-xs font-semibold text-white">
                    {otaFile ? otaFile.name : 'Select firmware.bin'}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5">
                    {otaFile ? `${(otaFile.size / 1024).toFixed(0)} KB` : 'Touch to choose file'}
                  </span>
                </label>
              </div>

              {(isFlashing || flashSuccess) && (
                <div className="space-y-1.5 bg-[#050f24] p-3 rounded-xl border border-slate-800">
                  <div className="flex justify-between text-xs font-mono text-slate-400">
                    <span>{flashSuccess ? 'Flash Completed!' : 'Writing to OTA partition...'}</span>
                    <span>{otaProgress}%</span>
                  </div>
                  <div className="h-2 w-full bg-black rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-150 ${flashSuccess ? 'bg-emerald-400' : 'bg-[#00c5e0]'}`}
                      style={{ width: `${otaProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleStartOta}
                disabled={!otaFile || isFlashing}
                className="w-full py-2.5 text-xs font-semibold bg-[#00c5e0] hover:bg-[#22d8f0] text-black font-bold rounded-xl transition-all disabled:opacity-40"
              >
                {isFlashing ? 'Flashing...' : 'Start OTA Flash'}
              </button>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 6: STATUS & TELEMETRY                                */}
          {/* ======================================================== */}
          {activeTab === 'status' && (
            <div className="space-y-3 pt-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-[#00c5e0]" />
                <span>Live Hardware Telemetry</span>
              </h3>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-[#050f24] p-3 rounded-2xl border border-slate-800">
                  <div className="text-slate-500 text-[10px]">PSRAM OCTAL</div>
                  <div className="text-white font-bold text-sm">8 MB (~7.8 MB Free)</div>
                </div>
                <div className="bg-[#050f24] p-3 rounded-2xl border border-slate-800">
                  <div className="text-slate-500 text-[10px]">INTERNAL HEAP</div>
                  <div className="text-white font-bold text-sm">~290 KB Free</div>
                </div>
                <div className="bg-[#050f24] p-3 rounded-2xl border border-slate-800">
                  <div className="text-slate-500 text-[10px]">DAC DRIVER</div>
                  <div className="text-[#00c5e0] font-bold text-sm">UDA1334A I2S</div>
                </div>
                <div className="bg-[#050f24] p-3 rounded-2xl border border-slate-800">
                  <div className="text-slate-500 text-[10px]">AUDIO FORMAT</div>
                  <div className="text-white font-bold text-sm">44.1k 16-bit</div>
                </div>
                <div className="bg-[#050f24] p-3 rounded-2xl border border-slate-800">
                  <div className="text-slate-500 text-[10px]">CORE 0 (RECEIVER)</div>
                  <div className="text-white font-bold text-sm">UDP 9090 &bull; 9091</div>
                </div>
                <div className="bg-[#050f24] p-3 rounded-2xl border border-slate-800">
                  <div className="text-slate-500 text-[10px]">CORE 1 (I2S DMA)</div>
                  <div className="text-white font-bold text-sm">Real-Time DMA</div>
                </div>
              </div>
            </div>
          )}

        </main>

        {/* Bottom Navigation Bar (EXACT MATCH TO SCREENSHOT) */}
        <nav className="px-3 py-3 bg-[#020712] border-t border-slate-800/80 grid grid-cols-6 gap-1 z-30">
          {/* Player Tab */}
          <button
            onClick={() => setActiveTab('player')}
            className={`py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === 'player'
                ? 'bg-[#042136] text-[#00c5e0] font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Disc3 className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-medium">Player</span>
          </button>

          {/* Hook Tab */}
          <button
            onClick={() => setActiveTab('hook')}
            className={`py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === 'hook'
                ? 'bg-[#042136] text-[#00c5e0] font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-5 h-5" />
            <span className="text-[11px] font-medium">Hook</span>
          </button>

          {/* Tone Tab */}
          <button
            onClick={() => setActiveTab('tone')}
            className={`py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === 'tone'
                ? 'bg-[#042136] text-[#00c5e0] font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SlidersHorizontal className="w-5 h-5" />
            <span className="text-[11px] font-medium">Tone</span>
          </button>

          {/* Wi-Fi Tab */}
          <button
            onClick={() => setActiveTab('wifi')}
            className={`py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === 'wifi'
                ? 'bg-[#042136] text-[#00c5e0] font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wifi className="w-5 h-5" />
            <span className="text-[11px] font-medium">Wi-Fi</span>
          </button>

          {/* OTA Tab */}
          <button
            onClick={() => setActiveTab('ota')}
            className={`py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === 'ota'
                ? 'bg-[#042136] text-[#00c5e0] font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowUpCircle className="w-5 h-5" />
            <span className="text-[11px] font-medium">OTA</span>
          </button>

          {/* Status Tab */}
          <button
            onClick={() => setActiveTab('status')}
            className={`py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all ${
              activeTab === 'status'
                ? 'bg-[#042136] text-[#00c5e0] font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-5 h-5" />
            <span className="text-[11px] font-medium">Status</span>
          </button>
        </nav>

      </div>
    </div>
  );
};
