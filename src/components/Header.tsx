import React from 'react';
import { Wifi, Radio, Server, Sliders, Cpu, ArrowUpCircle } from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isSimulated: boolean;
  setIsSimulated: (val: boolean) => void;
  espIp: string;
  setEspIp: (ip: string) => void;
  deviceConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isSimulated,
  setIsSimulated,
  espIp,
  setEspIp,
  deviceConnected,
}) => {
  const [showConnectModal, setShowConnectModal] = React.useState(false);
  const [tempIp, setTempIp] = React.useState(espIp);

  const navLinks = [
    { id: 'explainer', label: 'Architecture & Guide' },
    { id: 'controller', label: 'Web Controller' },
    { id: 'github', label: 'GitHub & merged.bin' },
    { id: 'wiring', label: 'Hardware Wiring' },
    { id: 'wifi', label: 'WiFi Setup' },
    { id: 'firmware', label: 'Firmware Code' },
    { id: 'ota', label: 'OTA Updater' },
  ];

  return (
    <>
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3">
          <a
            href="#home"
            onClick={(e) => { e.preventDefault(); setActiveTab('explainer'); }}
            className="text-lg font-bold tracking-tight text-white hover:text-cyan-400 transition-colors"
          >
            ESP32-S3 AudioLink
          </a>
        </div>

        {/* Zone 2: 4-6 clean text navigation links */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-400">
          {navLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => setActiveTab(link.id)}
              className={`transition-colors text-xs uppercase tracking-wider ${
                activeTab === link.id
                  ? 'text-cyan-400 font-semibold border-b border-cyan-400 pb-0.5'
                  : 'hover:text-slate-200'
              }`}
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1-2 primary actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowConnectModal(true)}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-mono font-medium rounded border transition-colors whitespace-nowrap ${
              deviceConnected
                ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/50'
                : isSimulated
                ? 'border-cyan-500/40 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/50'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                deviceConnected ? 'bg-emerald-400 animate-pulse' : isSimulated ? 'bg-cyan-400' : 'bg-amber-400'
              }`}
            />
            <span>{isSimulated ? 'Browser Simulator' : `Device: ${espIp}`}</span>
          </button>
        </div>
      </header>

      {/* Target Device IP Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-2">Connect to ESP32-S3 Device</h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Toggle between the built-in browser hardware simulator or target your physical ESP32-S3 N16R8 on your local Wi-Fi network.
            </p>

            <div className="space-y-4">
              <div className="flex items-center gap-2 p-1 bg-slate-950 rounded border border-slate-800">
                <button
                  onClick={() => setIsSimulated(true)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                    isSimulated ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Browser Web Audio Mode
                </button>
                <button
                  onClick={() => setIsSimulated(false)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                    !isSimulated ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Physical ESP32 Device
                </button>
              </div>

              {!isSimulated && (
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">
                    ESP32 Local IP or mDNS Hostname
                  </label>
                  <input
                    type="text"
                    value={tempIp}
                    onChange={(e) => setTempIp(e.target.value)}
                    placeholder="wifimusic.local or 192.168.1.120"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                  <span className="block mt-1 text-[11px] text-slate-500">
                    Find this IP on your router dashboard or Serial Monitor (115200 baud).
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowConnectModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setEspIp(tempIp);
                  setShowConnectModal(false);
                }}
                className="px-4 py-2 text-xs font-medium bg-cyan-600 text-white rounded hover:bg-cyan-500 transition-colors"
              >
                Save &amp; Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
