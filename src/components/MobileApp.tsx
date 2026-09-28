import React, { useState } from 'react';
import { Power, Play, Pause, Square, Volume2, VolumeX, Sliders, Wifi, ArrowUpCircle, Music2, Cast, Disc3, CheckCircle, ExternalLink } from 'lucide-react';
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
  const [activeScreen, setActiveScreen] = useState<'player' | 'wifi' | 'ota' | 'tone'>('player');

  // WiFi Form States
  const [wifiSsid, setWifiSsid] = useState(status.wifiSsid);
  const [wifiPassword, setWifiPassword] = useState('MyWiFiPassword123');
  const [useStatic, setUseStatic] = useState(false);
  const [staticIp, setStaticIp] = useState(status.ipAddress);
  const [wifiSaved, setWifiSaved] = useState(false);

  // OTA Form States
  const [otaFile, setOtaFile] = useState<File | null>(null);
  const [otaProgress, setOtaProgress] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);
  const [flashSuccess, setFlashSuccess] = useState(false);

  const isPowerOn = status.powerState === 'on';
  const isPlaying = isPowerOn && status.playbackState === 'playing' && !status.isMuted;

  // Curated demo tracks resembling real Cast playback
  const sampleTracks = [
    {
      title: 'Midnight City',
      artist: 'M83',
      app: 'Spotify',
      art: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&auto=format&fit=crop&q=80',
    },
    {
      title: 'Starboy (feat. Daft Punk)',
      artist: 'The Weeknd',
      app: 'YouTube Music',
      art: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=80',
    },
    {
      title: 'Get Lucky',
      artist: 'Daft Punk · Pharrell',
      app: 'SoundCloud',
      art: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&auto=format&fit=crop&q=80',
    },
  ];

  const handleNextTrackSim = () => {
    const currentIdx = sampleTracks.findIndex((t) => t.title === status.nowPlayingTrack);
    const nextIdx = (currentIdx + 1) % sampleTracks.length;
    const next = sampleTracks[nextIdx];
    onUpdateStatus({
      nowPlayingTrack: next.title,
      nowPlayingArtist: next.artist,
      nowPlayingApp: next.app,
      albumArtUrl: next.art,
    });
  };

  // Transport handlers
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
    setTimeout(() => setWifiSaved(false), 2500);
  };

  const handleStartOta = () => {
    if (!otaFile) return;
    setIsFlashing(true);
    setOtaProgress(0);

    const total = otaFile.size;
    let sent = 0;
    const interval = setInterval(() => {
      sent += Math.floor(total / 15) + 5000;
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
    <div className="max-w-sm mx-auto w-full">
      {/* Smartphone Card Frame */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col justify-between min-h-[640px]">
        {/* Top Bar with .local Domain Direct Bookmark */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isPowerOn ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-slate-600'
              }`}
            />
            {/* Always accessible .local link: http://wifimusic.local */}
            <a
              href="http://wifimusic.local"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono font-semibold text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
              title="Open http://wifimusic.local in your browser"
            >
              <span>wifimusic.local</span>
            </a>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-400">
              {status.wifiRssi} dBm
            </span>
            <button
              onClick={handleTogglePower}
              className={`p-2 rounded-full transition-all ${
                isPowerOn
                  ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                  : 'bg-slate-800 text-slate-500 hover:text-slate-300'
              }`}
              title="Power On / Standby"
            >
              <Power className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* View Switcher: NOW PLAYING SCREEN (Cast / TV Style) */}
        {activeScreen === 'player' && (
          <div className="flex-1 flex flex-col justify-between py-4 space-y-5">
            {/* Album Art Card with Cast Badge */}
            <div className="relative rounded-2xl overflow-hidden shadow-2xl aspect-square border border-slate-800 bg-slate-950 group">
              <img
                src={status.albumArtUrl || sampleTracks[0].art}
                alt="Album Cover"
                className={`w-full h-full object-cover transition-transform duration-700 ${
                  isPlaying ? 'scale-105' : 'scale-100 opacity-70 grayscale-30'
                }`}
              />

              {/* Cast & Source Overlay Badge */}
              <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/80 backdrop-blur-md border border-slate-700/60 text-[11px] font-medium text-white shadow-lg">
                <Cast className={`w-3.5 h-3.5 ${isPlaying ? 'text-cyan-400 animate-pulse' : 'text-slate-400'}`} />
                <span>{status.nowPlayingApp || 'Phone Audio'}</span>
              </div>

              {/* Quick Track Switcher (Simulator Demo) */}
              {isSimulated && (
                <button
                  onClick={handleNextTrackSim}
                  className="absolute bottom-3 right-3 px-2 py-1 rounded-md bg-slate-950/80 backdrop-blur-md border border-slate-700/60 text-[10px] font-mono text-cyan-300 hover:bg-slate-900 transition-colors"
                  title="Switch track metadata demo"
                >
                  Next Track ↷
                </button>
              )}
            </div>

            {/* Track Info (Big Title + Artist) */}
            <div className="text-center px-2 space-y-1">
              <div className="text-lg font-bold text-white tracking-tight truncate">
                {isPowerOn
                  ? status.nowPlayingTrack || 'Live Android Audio'
                  : 'Device in Standby'}
              </div>
              <div className="text-xs text-slate-400 font-medium truncate">
                {isPowerOn
                  ? status.nowPlayingArtist || 'Streaming via UDP 9091'
                  : 'Tap power to activate'}
              </div>
            </div>

            {/* Clean Volume Slider */}
            <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <button
                  onClick={handleToggleMute}
                  className={`p-1.5 rounded-lg transition-colors ${
                    status.isMuted ? 'text-rose-400 bg-rose-950/40' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {status.isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
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
                className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-6 pt-1">
              <button
                onClick={handleStop}
                disabled={!isPowerOn}
                className="p-3.5 rounded-full bg-slate-950 border border-slate-800 text-slate-400 hover:text-white active:scale-95 transition-all disabled:opacity-40"
                title="Stop & Flush Ring Buffer"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>

              <button
                onClick={handlePlayPause}
                className={`p-5 rounded-full shadow-lg active:scale-95 transition-all ${
                  isPlaying
                    ? 'bg-cyan-500 text-slate-950 shadow-cyan-500/30'
                    : 'bg-white text-slate-950 hover:bg-slate-200'
                }`}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-7 h-7 fill-current" />
                ) : (
                  <Play className="w-7 h-7 fill-current ml-0.5" />
                )}
              </button>

              <button
                onClick={() => setActiveScreen('tone')}
                className="p-3.5 rounded-full bg-slate-950 border border-slate-800 text-slate-400 hover:text-white active:scale-95 transition-all"
                title="Audio Equalizer"
              >
                <Sliders className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* View Switcher: TONE / EQUALIZER */}
        {activeScreen === 'tone' && (
          <div className="flex-1 flex flex-col justify-between py-4 space-y-4">
            <div className="text-sm font-bold text-white tracking-tight">Audio Tone Settings</div>

            {/* Bass */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex justify-between text-xs font-mono text-slate-400">
                <span>Bass</span>
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

            {/* Treble */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex justify-between text-xs font-mono text-slate-400">
                <span>Treble</span>
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

            {/* Balance */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
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

            <button
              onClick={() => setActiveScreen('player')}
              className="w-full py-2.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {/* View Switcher: WIFI SETUP */}
        {activeScreen === 'wifi' && (
          <form onSubmit={handleSaveWiFi} className="flex-1 flex flex-col justify-between py-4 space-y-4">
            <div>
              <div className="text-sm font-bold text-white tracking-tight">WiFi Network Setup</div>
              <div className="text-xs text-cyan-400 font-mono mt-1">
                Domain: http://wifimusic.local
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <input
                  type="text"
                  required
                  placeholder="WiFi SSID"
                  value={wifiSsid}
                  onChange={(e) => setWifiSsid(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <input
                  type="password"
                  required
                  placeholder="WiFi Password"
                  value={wifiPassword}
                  onChange={(e) => setWifiPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={useStatic}
                    onChange={(e) => setUseStatic(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-0"
                  />
                  <span>Assign Static IP</span>
                </label>
              </div>

              {useStatic && (
                <div>
                  <input
                    type="text"
                    placeholder="192.168.1.120"
                    value={staticIp}
                    onChange={(e) => setStaticIp(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}
            </div>

            {wifiSaved && (
              <div className="p-2.5 bg-emerald-950/60 border border-emerald-800 rounded-xl text-xs text-emerald-400 font-mono text-center flex items-center justify-center gap-1.5">
                <CheckCircle className="w-4 h-4" />
                <span>Saved &amp; Reconnecting!</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl transition-colors"
            >
              Save WiFi Settings
            </button>
          </form>
        )}

        {/* View Switcher: OTA UPDATER */}
        {activeScreen === 'ota' && (
          <div className="flex-1 flex flex-col justify-between py-4 space-y-4">
            <div>
              <div className="text-sm font-bold text-white tracking-tight">Wireless OTA Update</div>
              <div className="text-xs text-slate-400 font-mono mt-0.5">
                Current: {status.firmwareVersion} ({status.activePartition})
              </div>
            </div>

            {/* File selection box */}
            <div className="border border-dashed border-slate-800 rounded-2xl p-5 text-center bg-slate-950">
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
                  {otaFile ? `${(otaFile.size / 1024).toFixed(0)} KB` : 'Touch to choose file'}
                </span>
              </label>
            </div>

            {(isFlashing || flashSuccess) && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono text-slate-400">
                  <span>{flashSuccess ? 'Complete' : 'Writing flash...'}</span>
                  <span>{otaProgress}%</span>
                </div>
                <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-150 ${flashSuccess ? 'bg-emerald-400' : 'bg-cyan-400'}`}
                    style={{ width: `${otaProgress}%` }}
                  />
                </div>
                {flashSuccess && (
                  <div className="text-xs text-emerald-400 text-center font-mono pt-1">
                    Rebooting into new firmware...
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleStartOta}
              disabled={!otaFile || isFlashing}
              className="w-full py-2.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl transition-colors disabled:opacity-40"
            >
              {isFlashing ? 'Flashing...' : 'Start OTA Flash'}
            </button>
          </div>
        )}

        {/* Bottom App Navigation Bar */}
        <div className="pt-3.5 border-t border-slate-800/80 grid grid-cols-3 gap-2">
          <button
            onClick={() => setActiveScreen('player')}
            className={`py-2 rounded-xl text-xs font-medium flex flex-col items-center gap-1 transition-colors ${
              activeScreen === 'player' || activeScreen === 'tone'
                ? 'bg-slate-800 text-cyan-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Disc3 className={`w-4 h-4 ${isPlaying ? 'animate-spin' : ''}`} />
            <span>Now Playing</span>
          </button>

          <button
            onClick={() => setActiveScreen('wifi')}
            className={`py-2 rounded-xl text-xs font-medium flex flex-col items-center gap-1 transition-colors ${
              activeScreen === 'wifi'
                ? 'bg-slate-800 text-cyan-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wifi className="w-4 h-4" />
            <span>WiFi Setup</span>
          </button>

          <button
            onClick={() => setActiveScreen('ota')}
            className={`py-2 rounded-xl text-xs font-medium flex flex-col items-center gap-1 transition-colors ${
              activeScreen === 'ota'
                ? 'bg-slate-800 text-cyan-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowUpCircle className="w-4 h-4" />
            <span>OTA Update</span>
          </button>
        </div>
      </div>
    </div>
  );
};
