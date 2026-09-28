import React, { useState } from 'react';
import { ReceiverStatus, WiFiConfig } from './types/index.ts';
import { Header } from './components/Header.tsx';
import { ArchitectureExplainer } from './components/ArchitectureExplainer.tsx';
import { WebController } from './components/WebController.tsx';
import { HardwareWiring } from './components/HardwareWiring.tsx';
import { WiFiManager } from './components/WiFiManager.tsx';
import { OTAManager } from './components/OTAManager.tsx';
import { FirmwareCodeViewer } from './components/FirmwareCodeViewer.tsx';
import { AndroidSetupGuide } from './components/AndroidSetupGuide.tsx';
import { GitHubPushSection } from './components/GitHubPushSection.tsx';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('explainer');
  const [isSimulated, setIsSimulated] = useState<boolean>(true);
  const [espIp, setEspIp] = useState<string>('192.168.1.120');

  const [status, setStatus] = useState<ReceiverStatus>({
    powerState: 'on',
    playbackState: 'playing',
    isMuted: false,
    volume: 82,
    balance: 0,
    bassGain: 2,
    trebleGain: 1,
    gainBoost: 0,
    sampleRate: 44100,
    bitDepth: 16,
    channels: 2,
    bufferUsagePercent: 64,
    bufferBytesAllocated: 524288,
    packetsReceivedPerSec: 172,
    droppedPackets: 0,
    streamLatencyMs: 32,
    jitterMs: 2,
    wifiSsid: 'Studio-WiFi-5G',
    wifiRssi: -52,
    ipAddress: '192.168.1.120',
    macAddress: '84:F7:03:5B:9A:1C',
    uptimeSeconds: 14208,
    freePsramBytes: 7847936, // ~7.48 MB
    totalPsramBytes: 8388608, // 8 MB
    freeHeapBytes: 290816,
    cpuCore0Load: 18,
    cpuCore1Load: 34,
    activePartition: 'ota_0',
    firmwareVersion: 'v2.4.0-stable',
    deviceModel: 'ESP32-S3-WROOM-1 (N16R8 Octal SPI)',
    mdnsHost: 'wifimusic.local',
    nowPlayingTrack: 'Midnight City',
    nowPlayingArtist: 'M83',
    nowPlayingApp: 'Spotify',
    albumArtUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&auto=format&fit=crop&q=80',
  });

  const handleUpdateStatus = (partial: Partial<ReceiverStatus>) => {
    setStatus((prev) => ({ ...prev, ...partial }));
  };

  const handleApplyWiFi = (config: WiFiConfig) => {
    setStatus((prev) => ({
      ...prev,
      wifiSsid: config.ssid,
      ipAddress: config.useStaticIp ? config.ip : prev.ipAddress,
    }));
    if (config.useStaticIp) {
      setEspIp(config.ip);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Bar Contract (3 zones) */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isSimulated={isSimulated}
        setIsSimulated={setIsSimulated}
        espIp={espIp}
        setEspIp={setEspIp}
        deviceConnected={!isSimulated}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Sub-navigation tabs on mobile */}
        <div className="flex lg:hidden overflow-x-auto pb-4 mb-6 gap-2 border-b border-slate-800">
          {[
            { id: 'explainer', label: 'Architecture' },
            { id: 'controller', label: 'Web Controller' },
            { id: 'github', label: 'GitHub & merged.bin' },
            { id: 'wiring', label: 'Wiring & Pinout' },
            { id: 'wifi', label: 'Wi-Fi Setup' },
            { id: 'firmware', label: 'Firmware Code' },
            { id: 'ota', label: 'OTA Updater' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-mono rounded whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-cyan-600 text-white font-semibold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Architecture & Plain-English Explainer */}
        {activeTab === 'explainer' && (
          <div className="space-y-12">
            <ArchitectureExplainer
              onGoToController={() => setActiveTab('controller')}
              onGoToWiring={() => setActiveTab('wiring')}
              onGoToFirmware={() => setActiveTab('firmware')}
            />
            <AndroidSetupGuide />
          </div>
        )}

        {/* Tab 2: Live Web Controller */}
        {activeTab === 'controller' && (
          <div className="space-y-8">
            <WebController
              status={status}
              onUpdateStatus={handleUpdateStatus}
              onApplyWiFi={handleApplyWiFi}
              isSimulated={isSimulated}
              espIp={espIp}
            />
            <AndroidSetupGuide />
          </div>
        )}

        {/* Tab: GitHub Direct Push & merged.bin Pipeline */}
        {activeTab === 'github' && (
          <div className="space-y-8">
            <GitHubPushSection onGoToFirmware={() => setActiveTab('firmware')} />
          </div>
        )}

        {/* Tab 3: Hardware Wiring & Pinout */}
        {activeTab === 'wiring' && (
          <div className="space-y-8">
            <HardwareWiring />
          </div>
        )}

        {/* Tab 4: Wi-Fi Setup & Network Configuration */}
        {activeTab === 'wifi' && (
          <div className="space-y-8">
            <WiFiManager
              currentSsid={status.wifiSsid}
              currentIp={status.ipAddress}
              onApplyWiFi={handleApplyWiFi}
              isSimulated={isSimulated}
            />
          </div>
        )}

        {/* Tab 5: Complete Compilable Firmware Code */}
        {activeTab === 'firmware' && (
          <div className="space-y-8">
            <FirmwareCodeViewer />
          </div>
        )}

        {/* Tab 6: Over-The-Air (OTA) Flasher */}
        {activeTab === 'ota' && (
          <div className="space-y-8">
            <OTAManager
              activePartition={status.activePartition}
              firmwareVersion={status.firmwareVersion}
              isSimulated={isSimulated}
              espIp={espIp}
            />
          </div>
        )}
      </main>

      {/* Clean Editorial Footer (No generic AI slop or fake telemetry tickers) */}
      <footer className="border-t border-slate-800 bg-slate-950 py-6 px-6 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300">ESP32-S3 AudioLink Suite</span>
            <span aria-hidden="true">·</span>
            <span>Target: ESP32-S3-DevKitC-1 N16R8</span>
            <span aria-hidden="true">·</span>
            <span>DAC: UDA1334A I2S</span>
          </div>

          <div className="flex items-center gap-4 text-[11px] font-mono text-slate-400">
            <span>Protocol: UDP 16-bit PCM @ 44.1kHz</span>
            <span aria-hidden="true">·</span>
            <span>Compatible with WiFiAudioStreaming Android</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
