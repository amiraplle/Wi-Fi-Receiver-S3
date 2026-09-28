import React, { useState } from 'react';
import { Wifi, Signal, Shield, Key, Globe, CheckCircle, RefreshCw, AlertCircle, Server } from 'lucide-react';
import { WiFiConfig, WiFiNetwork } from '../types/index.ts';

interface WiFiManagerProps {
  currentSsid: string;
  currentIp: string;
  onApplyWiFi: (config: WiFiConfig) => void;
  isSimulated: boolean;
}

export const WiFiManager: React.FC<WiFiManagerProps> = ({
  currentSsid,
  currentIp,
  onApplyWiFi,
  isSimulated,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState(currentSsid || 'Studio-WiFi-5G');
  const [password, setPassword] = useState('MySecurePassword123');
  const [useStaticIp, setUseStaticIp] = useState(false);
  const [ipAddress, setIpAddress] = useState(currentIp || '192.168.1.120');
  const [gateway, setGateway] = useState('192.168.1.1');
  const [subnet, setSubnet] = useState('255.255.255.0');
  const [dns, setDns] = useState('8.8.8.8');
  const [hostname, setHostname] = useState('wifimusic');
  const [apFallback, setApFallback] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const scannedNetworks: WiFiNetwork[] = [
    { ssid: 'Studio-WiFi-5G', rssi: -48, channel: 6, security: 'WPA2', isCurrent: true },
    { ssid: 'Home-Audio-Net', rssi: -62, channel: 1, security: 'WPA2' },
    { ssid: 'IoT-Sensors-Guest', rssi: -75, channel: 11, security: 'WPA3' },
    { ssid: 'Office_Mesh_Ext', rssi: -82, channel: 3, security: 'WPA2' },
  ];

  const handleScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
    }, 1200);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onApplyWiFi({
      ssid: selectedNetwork,
      password,
      useStaticIp,
      ip: ipAddress,
      gateway,
      subnet,
      dns,
      hostname,
      apModeFallback: apFallback,
      apSsid: 'ESP32-Audio-Setup',
      apPassword: 'password1234',
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border border-slate-800 bg-slate-900/40 rounded-lg p-6 lg:p-8">
        <h2 className="text-xl font-bold text-white tracking-tight mb-2">
          Wi-Fi Network Configuration &amp; Captive Portal
        </h2>
        <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
          Configure how the ESP32-S3 connects to your local wireless LAN. Credentials are stored securely in non-volatile flash storage (NVS Preferences). If connection to the router fails, the ESP32 automatically spawns an Access Point (SoftAP) so you can reconfigure it from your phone without re-flashing.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: WiFi Scanner (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="border border-slate-800 bg-slate-900/30 p-5 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                Available 2.4 GHz Networks
              </span>
              <button
                onClick={handleScan}
                disabled={isScanning}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? 'Scanning...' : 'Scan'}</span>
              </button>
            </div>

            <div className="space-y-2">
              {scannedNetworks.map((net) => (
                <div
                  key={net.ssid}
                  onClick={() => setSelectedNetwork(net.ssid)}
                  className={`p-3 rounded border text-xs cursor-pointer transition-colors flex items-center justify-between ${
                    selectedNetwork === net.ssid
                      ? 'border-cyan-500 bg-cyan-950/30 text-white'
                      : 'border-slate-800/80 bg-slate-950 hover:bg-slate-800/40 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Signal
                      className={`w-4 h-4 ${
                        net.rssi > -60
                          ? 'text-emerald-400'
                          : net.rssi > -75
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    />
                    <div>
                      <div className="font-semibold">{net.ssid}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Channel {net.channel} · {net.security}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {net.rssi} dBm
                    </div>
                    {net.isCurrent && (
                      <span className="text-[9px] font-mono text-cyan-400 uppercase">
                        Active
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* mDNS Hostname & Fallback AP note */}
          <div className="border border-slate-800 bg-slate-900/30 p-5 rounded-lg space-y-3">
            <div className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              Zero-Configuration mDNS
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Once connected, you can access this web controller in any browser on your network by visiting:
            </p>
            <div className="p-3 bg-slate-950 rounded border border-slate-800 font-mono text-cyan-300 text-xs flex items-center justify-between">
              <span>http://{hostname}.local</span>
              <span className="text-[10px] text-slate-500">mDNS Active</span>
            </div>
          </div>
        </div>

        {/* Right Column: Connection Form (7 cols) */}
        <div className="lg:col-span-7">
          <form onSubmit={handleSave} className="border border-slate-800 bg-slate-900/30 p-6 rounded-lg space-y-6">
            <div className="text-xs font-mono text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-3">
              Network Authentication &amp; IP Settings
            </div>

            {/* SSID */}
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1">
                Target Wi-Fi SSID
              </label>
              <input
                type="text"
                required
                value={selectedNetwork}
                onChange={(e) => setSelectedNetwork(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-700 rounded text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1">
                Wi-Fi Password (WPA2-PSK)
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-700 rounded text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Hostname */}
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1">
                mDNS Hostname
              </label>
              <div className="flex items-center">
                <input
                  type="text"
                  required
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-700 rounded-l text-white focus:outline-none focus:border-cyan-500"
                />
                <span className="px-3 py-2 text-xs font-mono bg-slate-900 border border-l-0 border-slate-700 rounded-r text-slate-400">
                  .local
                </span>
              </div>
            </div>

            {/* DHCP or Static IP toggle */}
            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 mb-4">
                <input
                  type="checkbox"
                  checked={useStaticIp}
                  onChange={(e) => setUseStaticIp(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-cyan-600 focus:ring-0"
                />
                <span>Assign Static IP Address (Recommended for zero-jitter UDP streaming)</span>
              </label>

              {useStaticIp && (
                <div className="grid grid-cols-2 gap-4 p-4 bg-slate-950 rounded border border-slate-800">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Static IP</label>
                    <input
                      type="text"
                      value={ipAddress}
                      onChange={(e) => setIpAddress(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-700 rounded text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Gateway</label>
                    <input
                      type="text"
                      value={gateway}
                      onChange={(e) => setGateway(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-700 rounded text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Subnet Mask</label>
                    <input
                      type="text"
                      value={subnet}
                      onChange={(e) => setSubnet(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-700 rounded text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">DNS Server</label>
                    <input
                      type="text"
                      value={dns}
                      onChange={(e) => setDns(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-700 rounded text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Fallback AP */}
            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={apFallback}
                  onChange={(e) => setApFallback(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-cyan-600 focus:ring-0"
                />
                <span>Enable Fallback Access Point (&quot;ESP32-Audio-Setup&quot; @ 192.168.4.1)</span>
              </label>
            </div>

            <div className="pt-4 flex items-center justify-between border-t border-slate-800">
              {savedSuccess ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
                  <CheckCircle className="w-4 h-4" />
                  <span>Wi-Fi Credentials Saved to NVS! Reconnecting...</span>
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 font-mono">
                  Changes take effect immediately on ESP32-S3
                </div>
              )}

              <button
                type="submit"
                className="px-5 py-2 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded transition-colors whitespace-nowrap"
              >
                Save &amp; Connect
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
