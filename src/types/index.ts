export interface ReceiverStatus {
  powerState: 'on' | 'standby';
  playbackState: 'playing' | 'paused' | 'stopped';
  isMuted: boolean;
  volume: number; // 0 - 100
  balance: number; // -50 (Left) to +50 (Right)
  bassGain: number; // -10 to +10 dB
  trebleGain: number; // -10 to +10 dB
  gainBoost: number; // 0 to 12 dB
  sampleRate: number; // 44100 or 48000
  bitDepth: number; // 16
  channels: number; // 2
  bufferUsagePercent: number; // 0 - 100
  bufferBytesAllocated: number;
  packetsReceivedPerSec: number;
  droppedPackets: number;
  streamLatencyMs: number;
  jitterMs: number;
  wifiSsid: string;
  wifiRssi: number; // dBm
  ipAddress: string;
  macAddress: string;
  uptimeSeconds: number;
  freePsramBytes: number;
  totalPsramBytes: number;
  freeHeapBytes: number;
  cpuCore0Load: number; // %
  cpuCore1Load: number; // %
  activePartition: 'ota_0' | 'ota_1';
  firmwareVersion: string;
  deviceModel: string;
  mdnsHost: string; // e.g. "wifimusic.local"
  nowPlayingTrack: string;
  nowPlayingArtist: string;
  nowPlayingApp: string; // e.g. "Spotify", "YouTube Music", "SoundCloud"
  albumArtUrl: string;
}

export interface WiFiNetwork {
  ssid: string;
  rssi: number;
  channel: number;
  security: 'WPA2' | 'WPA3' | 'Open';
  isCurrent?: boolean;
}

export interface WiFiConfig {
  ssid: string;
  password: string;
  useStaticIp: boolean;
  ip: string;
  gateway: string;
  subnet: string;
  dns: string;
  hostname: string;
  apModeFallback: boolean;
  apSsid: string;
  apPassword: string;
}

export interface DacPinConfig {
  bclkPin: number; // Bit Clock (BCK)
  wselPin: number; // Word Select (LRCK/WS)
  dinPin: number;  // Data In (DIN)
  mutePin: number; // Optional mute pin
  deemphPin: number; // De-emphasis pin
  i2sPort: number; // 0 or 1
  mclkRequired: boolean; // false for UDA1334A (Internal PLL)
}
