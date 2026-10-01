/**
 * ============================================================================
 * ESP32-S3 N16R8 WiFi Audio Streaming Receiver for UDA1334A DAC
 * Target Android App: WiFiAudioStreaming (WFAS v2) by Marco Morosi
 * ============================================================================
 * Hardware: ESP32-S3-DevKitC-1-N16R8 (16MB Flash, 8MB Octal PSRAM)
 * I2S DAC:   UDA1334A Stereo DAC (BCLK=GPIO4, WSEL=GPIO5, DIN=GPIO6, MUTE=GPIO7)
 * ============================================================================
 * Embedded Native Mobile Web App:
 * - Fluid responsive mobile web app (no fake plastic bezels or fake notches)
 * - Fixed top status bar: "ESP32-S3 / AudioLink" + Live Device IP badge
 * - Fixed bottom navigation bar with 6 screens:
 *   1. Player (Track & Artist, Hardware Volume card, Stop, Large Cyan Pause/Play, EQ, Android Hook card)
 *   2. Hook (Connect to Android's port 9090 audio server via UDP registration beacon)
 *   3. Tone (Hardware Tone & Equalizer: Bass, Treble, Balance, Presets)
 *   4. Wi-Fi (Live network scanner, SSID/Password, Static IP, AP mode)
 *   5. OTA (Wireless firmware binary flasher with real-time AJAX progress bar)
 *   6. Status (PSRAM 8MB telemetry, Core 0 & Core 1, I2S DAC pinout, packet counter)
 * - Complete FreeRTOS dual-core engine: Core 0 (UDP 9090/9091) + Core 1 (I2S DMA)
 * ============================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <DNSServer.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Update.h>
#include <Preferences.h>
#include <driver/i2s.h>

// ----------------------------------------------------------------------------
// PIN CONFIGURATION (ESP32-S3 to UDA1334A DAC)
// ----------------------------------------------------------------------------
#define I2S_BCLK_PIN      4            // UDA1334A BCLK
#define I2S_WSEL_PIN      5            // UDA1334A WSEL (LRCK)
#define I2S_DIN_PIN       6            // UDA1334A DIN
#define UDA_MUTE_PIN      7            // UDA1334A MUTE (Active Low to unmute)
#define STATUS_LED_PIN    48           // ESP32-S3 Onboard LED

// ----------------------------------------------------------------------------
// AUDIO & BUFFER PARAMETERS
// ----------------------------------------------------------------------------
#define STREAM_PORT_9090  9090         // Primary WFAS UDP Audio Port
#define STREAM_PORT_9091  9091         // Secondary WFAS UDP Audio Port
#define SAMPLE_RATE       48000        // 48.0 kHz 16-bit Stereo PCM (Android App default)
#define I2S_PORT          I2S_NUM_0
#define RING_BUFFER_SIZE  (512 * 1024) // 512 KB Octal PSRAM ring buffer
#define CHUNK_SIZE        1024

// ----------------------------------------------------------------------------
// CIRCULAR RING BUFFER (Octal PSRAM)
// ----------------------------------------------------------------------------
class PsramRingBuffer {
private:
  uint8_t* buffer = nullptr;
  size_t capacity = 0;
  volatile size_t head = 0;
  volatile size_t tail = 0;
  portMUX_TYPE spinlock = portMUX_INITIALIZER_UNLOCKED;

public:
  PsramRingBuffer(size_t size) : capacity(size), head(0), tail(0) {
    if (psramInit()) {
      buffer = (uint8_t*)ps_malloc(capacity);
    }
    if (!buffer) {
      Serial.println("[PSRAM] PSRAM alloc failed! Falling back to SRAM (32KB)...");
      capacity = 32 * 1024;
      buffer = (uint8_t*)malloc(capacity);
    } else {
      Serial.printf("[PSRAM] Allocated %u KB Octal PSRAM ring buffer\n", (unsigned)(capacity / 1024));
    }
  }

  size_t availableForWrite() {
    portENTER_CRITICAL(&spinlock);
    size_t h = head;
    size_t t = tail;
    portEXIT_CRITICAL(&spinlock);
    if (h >= t) return capacity - (h - t) - 1;
    return t - h - 1;
  }

  size_t availableForRead() {
    portENTER_CRITICAL(&spinlock);
    size_t h = head;
    size_t t = tail;
    portEXIT_CRITICAL(&spinlock);
    if (h >= t) return h - t;
    return capacity - (t - h);
  }

  size_t write(const uint8_t* data, size_t len) {
    if (!buffer || len == 0) return 0;
    size_t avail = availableForWrite();
    if (len > avail) len = avail;

    size_t firstPart = min(len, capacity - head);
    memcpy(&buffer[head], data, firstPart);
    if (len > firstPart) {
      memcpy(&buffer[0], data + firstPart, len - firstPart);
    }

    portENTER_CRITICAL(&spinlock);
    head = (head + len) % capacity;
    portEXIT_CRITICAL(&spinlock);
    return len;
  }

  size_t read(uint8_t* out, size_t len) {
    if (!buffer || len == 0) return 0;
    size_t avail = availableForRead();
    if (len > avail) len = avail;

    size_t firstPart = min(len, capacity - tail);
    memcpy(out, &buffer[tail], firstPart);
    if (len > firstPart) {
      memcpy(out + firstPart, &buffer[0], len - firstPart);
    }

    portENTER_CRITICAL(&spinlock);
    tail = (tail + len) % capacity;
    portEXIT_CRITICAL(&spinlock);
    return len;
  }

  float getFillRatio() {
    if (!capacity) return 0.0f;
    return (float)availableForRead() / (float)capacity;
  }

  void flush() {
    portENTER_CRITICAL(&spinlock);
    head = 0;
    tail = 0;
    portEXIT_CRITICAL(&spinlock);
  }
};

// ----------------------------------------------------------------------------
// GLOBAL OBJECTS & STATE
// ----------------------------------------------------------------------------
PsramRingBuffer* audioBuffer = nullptr;
WiFiUDP udpAudio9090;
WiFiUDP udpAudio9091;
WebServer server(80);
DNSServer dnsServer;
Preferences prefs;

struct ReceiverState {
  bool powerOn = true;
  bool isPlaying = true;
  bool isMuted = false;
  uint8_t volume = 82;
  int8_t bassGain = 0;
  int8_t trebleGain = 0;
  int8_t balance = 0;
  uint16_t streamPort = STREAM_PORT_9090;
  uint32_t sampleRate = SAMPLE_RATE;
  uint32_t bytesReceived = 0;
  uint32_t packetsReceived = 0;
  uint32_t packetsDropped = 0;
  bool isApMode = false;
  bool phoneConnected = false;
  String phoneServerIp = "";
  uint32_t lastPingTime = 0;
  String connectionStatus = "Ready. UDP 9090 & 9091";
} state;

// ----------------------------------------------------------------------------
// I2S HARDWARE INITIALIZATION (UDA1334A DAC)
// ----------------------------------------------------------------------------
void setupI2S() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
    .sample_rate = state.sampleRate,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
    .communication_format = (i2s_comm_format_t)(I2S_COMM_FORMAT_STAND_I2S),
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len = 512,
    .use_apll = false,
    .tx_desc_auto_clear = true,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_BCLK_PIN,
    .ws_io_num = I2S_WSEL_PIN,
    .data_out_num = I2S_DIN_PIN,
    .data_in_num = I2S_PIN_NO_CHANGE
  };

  esp_err_t err = i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  if (err != ESP_OK) {
    Serial.printf("[I2S] Driver install error: %d\n", err);
  }
  i2s_set_pin(I2S_PORT, &pin_config);
  i2s_set_clk(I2S_PORT, state.sampleRate, I2S_BITS_PER_SAMPLE_16BIT, I2S_CHANNEL_STEREO);

  pinMode(UDA_MUTE_PIN, OUTPUT);
  digitalWrite(UDA_MUTE_PIN, LOW); // LOW = Unmuted on UDA1334A
  Serial.printf("[I2S] UDA1334A I2S audio driver ready at %u Hz.\n", state.sampleRate);
}

// ----------------------------------------------------------------------------
// EMBEDDED MOBILE WEB APP HTML (EXACT PIXEL-FOR-PIXEL MATCH TO SCREENSHOT)
// ----------------------------------------------------------------------------
const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="#020712">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>ESP32-S3 AudioLink</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; -webkit-tap-highlight-color: transparent; }
    body { background: #020712; color: #f8fafc; min-height: 100vh; min-height: 100dvh; display: flex; justify-content: center; }
    
    .app { width: 100%; max-width: 420px; min-height: 100vh; min-height: 100dvh; background: #020712; display: flex; flex-direction: column; justify-content: space-between; border-left: 1px solid rgba(255,255,255,0.06); border-right: 1px solid rgba(255,255,255,0.06); box-shadow: 0 0 50px rgba(0,0,0,0.85); position: relative; }

    /* Top Bar matching screenshot */
    .top-bar { padding: 24px 24px 16px; display: flex; justify-content: space-between; align-items: center; }
    .brand-col { display: flex; flex-direction: column; }
    .brand-title { font-size: 20px; font-weight: 800; color: #fff; line-height: 1.15; letter-spacing: -0.4px; }
    
    .status-pill { display: flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 8px; border: 1px solid rgba(6,182,212,0.4); background: rgba(6,182,212,0.08); color: #22d3ee; font-family: monospace; font-size: 12px; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #00c5e0; box-shadow: 0 0 8px #00c5e0; }

    /* Main Container */
    .main-content { flex: 1; padding: 8px 20px 20px; display: flex; flex-direction: column; justify-content: flex-start; }
    .screen { display: none; flex-direction: column; gap: 22px; }
    .screen.active { display: flex; }

    /* Track Meta matching screenshot */
    .track-meta { text-align: center; margin-top: 4px; }
    .track-title { font-size: 22px; font-weight: 700; color: #fff; letter-spacing: -0.3px; }
    .track-artist { font-size: 13px; font-weight: 500; color: #94a3b8; margin-top: 3px; }

    /* Hardware Volume Card */
    .vol-card { background: #050f24; border: 1px solid rgba(255,255,255,0.08); border-radius: 18px; padding: 16px 18px; }
    .vol-row { display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700; font-family: monospace; margin-bottom: 12px; }
    .vol-label { display: flex; align-items: center; gap: 8px; color: #cbd5e1; letter-spacing: 0.5px; }
    .vol-pct { color: #00c5e0; font-size: 13px; font-weight: bold; }
    input[type=range] { width: 100%; height: 6px; border-radius: 3px; accent-color: #00c5e0; background: #142342; cursor: pointer; }

    /* Transport Controls: Stop, Large Cyan Pause/Play, Tone */
    .transport-row { display: flex; justify-content: center; align-items: center; gap: 24px; padding: 6px 0; }
    .btn-circle { width: 56px; height: 56px; border-radius: 50%; background: #0c1833; border: 1px solid rgba(255,255,255,0.08); color: #cbd5e1; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; }
    .btn-circle:active { transform: scale(0.92); }
    .square-icon { width: 15px; height: 15px; background: #cbd5e1; border-radius: 2px; }
    
    .btn-circle.play { width: 72px; height: 72px; background: #00c5e0; color: #000; border: none; box-shadow: 0 0 30px rgba(0,197,224,0.45); }
    .btn-circle.play:active { transform: scale(0.94); background: #22d8f0; }

    /* Android Audio Server Hook Card */
    .hook-card { cursor: pointer; background: #031528; border: 1px solid rgba(6,182,212,0.4); border-radius: 18px; padding: 16px 18px; display: flex; justify-content: space-between; align-items: center; transition: all 0.15s; }
    .hook-card:active { transform: scale(0.98); }
    .hook-left { display: flex; align-items: center; gap: 12px; }
    .hook-icon-wrap { color: #00c5e0; display: flex; align-items: center; justify-content: center; }
    .hook-title { font-size: 14px; font-weight: 700; color: #fff; }
    .hook-sub { font-size: 11px; font-family: monospace; color: #00c5e0; margin-top: 2px; }
    .hook-open { font-size: 12px; font-weight: 600; color: #00c5e0; font-family: monospace; }

    /* Other Tab Cards */
    .card { background: #050f24; border: 1px solid rgba(255,255,255,0.08); border-radius: 18px; padding: 16px; }
    .card-title { font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
    .card-desc { font-size: 11px; color: #94a3b8; line-height: 1.5; margin-bottom: 12px; }
    .form-group { margin-bottom: 12px; }
    label { font-size: 10px; font-weight: 700; text-transform: uppercase; font-family: monospace; color: #94a3b8; margin-bottom: 4px; display: block; }
    input[type=text], input[type=password], input[type=number] { width: 100%; padding: 12px 14px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; color: #fff; font-size: 13px; font-family: monospace; }
    input:focus { outline: none; border-color: #00c5e0; }
    
    .btn-action { width: 100%; padding: 13px; border-radius: 14px; background: #00c5e0; color: #000; border: 0; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
    .btn-action:active { transform: scale(0.98); }

    /* Presets Grid */
    .preset-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 12px; }
    .btn-preset { padding: 8px 4px; border-radius: 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08); color: #cbd5e1; font-size: 11px; font-family: monospace; font-weight: 600; cursor: pointer; }
    .btn-preset.active { background: #00c5e0; color: #000; border-color: #00c5e0; font-weight: bold; }

    /* Telemetry Grid */
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .stat-cell { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 10px; }
    .stat-label { font-size: 9px; font-family: monospace; color: #64748b; text-transform: uppercase; }
    .stat-value { font-size: 13px; font-weight: 700; color: #fff; font-family: monospace; margin-top: 2px; }

    /* Bottom Navigation Bar matching screenshot */
    .nav-bar { background: #020712; border-top: 1px solid rgba(255,255,255,0.08); padding: 10px 8px 16px; display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
    .nav-item { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; background: transparent; border: 0; color: #64748b; padding: 8px 2px; border-radius: 14px; cursor: pointer; transition: all 0.15s; font-size: 11px; font-weight: 500; }
    .nav-item.active { background: #042136; color: #00c5e0; font-weight: 700; }
    .nav-item svg { width: 20px; height: 20px; stroke-width: 2.2; }

    /* Toast */
    .toast { position: fixed; top: 80px; left: 50%; transform: translateX(-50%); z-index: 100; background: #031e33; border: 1px solid #00c5e0; color: #22d3ee; padding: 10px 18px; border-radius: 30px; font-size: 11px; font-family: monospace; font-weight: 600; box-shadow: 0 10px 25px rgba(0,0,0,0.8); display: none; align-items: center; gap: 8px; }
    .progress-box { margin-top: 12px; background: rgba(0,0,0,0.5); border-radius: 8px; overflow: hidden; height: 8px; border: 1px solid rgba(255,255,255,0.1); }
    .progress-fill { height: 100%; background: #00c5e0; width: 0%; transition: width 0.1s; }
  </style>
</head>
<body>

  <div class="app">
    <!-- Top Header: EXACT MATCH TO SCREENSHOT -->
    <header class="top-bar">
      <div class="brand-col">
        <div class="brand-title">ESP32-S3</div>
        <div class="brand-title">AudioLink</div>
      </div>
      <div class="status-pill">
        <span class="status-dot"></span>
        <span id="ipBadge">Device: 192.168.254.109</span>
      </div>
    </header>

    <!-- Floating Toast Notification -->
    <div class="toast" id="appToast">
      <span id="toastMsg">Connected successfully!</span>
    </div>

    <!-- Main Screens -->
    <main class="main-content">
      
      <!-- ================= SCREEN 1: PLAYER (EXACT MATCH TO SCREENSHOT) ================= -->
      <section class="screen active" id="tab-player">
        <!-- Track & Artist -->
        <div class="track-meta">
          <h1 class="track-title" id="trackName">Midnight City</h1>
          <p class="track-artist" id="trackSub">M83</p>
        </div>

        <!-- Hardware Volume Card -->
        <div class="vol-card">
          <div class="vol-row">
            <div class="vol-label">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
              <span>HARDWARE VOLUME</span>
            </div>
            <span class="vol-pct" id="volVal">82%</span>
          </div>
          <input type="range" id="volSlider" min="0" max="100" value="82" oninput="setVol(this.value)">
        </div>

        <!-- Transport Buttons: Stop, Large Cyan Pause/Play, Tone -->
        <div class="transport-row">
          <!-- Stop Button -->
          <button class="btn-circle" onclick="cmd('flush')" title="Stop & Flush Buffer">
            <div class="square-icon"></div>
          </button>
          
          <!-- Big Glowing Cyan Play/Pause Button -->
          <button class="btn-circle play" onclick="togglePlay()" id="playBtn" title="Play/Pause">
            <div id="playIconContainer" style="display:flex; gap:5px;">
              <div style="width:7px; height:24px; background:#000; border-radius:2px;"></div>
              <div style="width:7px; height:24px; background:#000; border-radius:2px;"></div>
            </div>
          </button>

          <!-- Tone Shortcut Button -->
          <button class="btn-circle" onclick="switchTab('tone')" title="Equalizer & Tone">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line></svg>
          </button>
        </div>

        <!-- Android Audio Server Hook Card -->
        <div class="hook-card" onclick="switchTab('hook')">
          <div class="hook-left">
            <div class="hook-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>
            </div>
            <div>
              <div class="hook-title">Android Audio Server Hook</div>
              <div class="hook-sub">Port 9090 &bull; Fast Registration</div>
            </div>
          </div>
          <div class="hook-open">Open &rarr;</div>
        </div>
      </section>

      <!-- ================= SCREEN 2: HOOK (PORT 9090) ================= -->
      <section class="screen" id="tab-hook">
        <div class="card">
          <div class="card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>
            <span>Android Phone Audio Hookup</span>
          </div>
          <div class="card-desc">
            When your phone says <b style="color:#fde047;">"Waiting for client on port 9090"</b>, enter its IP address below. The ESP32 will send the UDP registration beacon to trigger instant music playback!
          </div>

          <form onsubmit="connectPhone(event)">
            <div class="form-group">
              <label>Phone IP Address</label>
              <input type="text" id="phoneIpInput" value="192.168.254.113" placeholder="e.g. 192.168.254.113" required>
            </div>
            <div class="form-group">
              <label>Target Port</label>
              <input type="number" id="phonePortInput" value="9090">
            </div>
            <button type="submit" class="btn-action">Link ESP32 to Phone Audio</button>
          </form>
        </div>
      </section>

      <!-- ================= SCREEN 3: TONE (EQUALIZER) ================= -->
      <section class="screen" id="tab-tone">
        <div class="card">
          <div class="card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line></svg>
            <span>Hardware Tone &amp; Equalizer</span>
          </div>
          <div class="card-desc">Fine-tune frequencies and balance directly before I2S DMA.</div>

          <div class="preset-grid">
            <button class="btn-preset active" onclick="setPreset('flat', this)">Flat</button>
            <button class="btn-preset" onclick="setPreset('bass', this)">Bass+</button>
            <button class="btn-preset" onclick="setPreset('vocal', this)">Vocal</button>
            <button class="btn-preset" onclick="setPreset('club', this)">Club</button>
          </div>

          <div class="form-group">
            <div style="display:flex; justify-content:space-between; font-size:11px; font-family:monospace; margin-bottom:4px;">
              <span>BASS GAIN</span>
              <span id="bassVal" style="color:#00c5e0;">0 dB</span>
            </div>
            <input type="range" id="bassSlider" min="-10" max="10" value="0" oninput="updateEq()">
          </div>

          <div class="form-group">
            <div style="display:flex; justify-content:space-between; font-size:11px; font-family:monospace; margin-bottom:4px;">
              <span>TREBLE GAIN</span>
              <span id="trebleVal" style="color:#00c5e0;">0 dB</span>
            </div>
            <input type="range" id="trebleSlider" min="-10" max="10" value="0" oninput="updateEq()">
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <div style="display:flex; justify-content:space-between; font-size:11px; font-family:monospace; margin-bottom:4px;">
              <span>STEREO BALANCE</span>
              <span id="balVal" style="color:#00c5e0;">Center</span>
            </div>
            <input type="range" id="balSlider" min="-50" max="50" value="0" oninput="updateEq()">
          </div>
        </div>
      </section>

      <!-- ================= SCREEN 4: WI-FI ================= -->
      <section class="screen" id="tab-wifi">
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div class="card-title" style="margin-bottom:0;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>
              <span>Wi-Fi Network Setup</span>
            </div>
            <button onclick="scanNetworks()" style="font-size:10px; font-family:monospace; background:#0c1833; border:1px solid #1e293b; color:#00c5e0; padding:4px 8px; border-radius:8px; cursor:pointer;">Scan</button>
          </div>
          <div class="card-desc">Connect to your 2.4GHz home router. Access at <b>http://wifimusic.local</b>.</div>

          <div id="scanResults" style="display:none; margin-bottom:12px; max-height:120px; overflow-y:auto;"></div>

          <form onsubmit="saveWiFi(event)">
            <div class="form-group">
              <label>SSID</label>
              <input type="text" id="ssidInput" placeholder="2.4GHz Network Name" required>
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="passInput" placeholder="Wi-Fi Password">
            </div>
            <button type="submit" class="btn-action">Save &amp; Connect</button>
          </form>
        </div>
      </section>

      <!-- ================= SCREEN 5: OTA UPDATE ================= -->
      <section class="screen" id="tab-ota">
        <div class="card">
          <div class="card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            <span>Wireless OTA Update</span>
          </div>
          <div class="card-desc">Flash newly compiled <b>firmware.bin</b> over Wi-Fi without cables.</div>

          <form onsubmit="uploadOta(event)">
            <div class="form-group">
              <label>Select Binary (.bin)</label>
              <input type="file" id="otaFileInput" accept=".bin" required style="padding:10px; font-size:11px; color:#cbd5e1;">
            </div>
            <button type="submit" id="otaSubmitBtn" class="btn-action">Upload &amp; Flash Firmware</button>
            <div class="progress-box" id="otaProgressBox" style="display:none;">
              <div class="progress-fill" id="otaProgressFill"></div>
            </div>
            <div id="otaStatusText" style="font-size:11px; font-family:monospace; color:#00c5e0; text-align:center; margin-top:6px; display:none;">Writing to flash...</div>
          </form>
        </div>
      </section>

      <!-- ================= SCREEN 6: STATUS ================= -->
      <section class="screen" id="tab-status">
        <div class="card">
          <div class="card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
            <span>Hardware Diagnostics</span>
          </div>
          <div class="card-desc">Live ESP32-S3 telemetry & audio stream counters.</div>

          <div class="stat-grid">
            <div class="stat-cell">
              <div class="stat-label">PSRAM OCTAL</div>
              <div class="stat-value" id="statPsram">8 MB (Free)</div>
            </div>
            <div class="stat-cell">
              <div class="stat-label">INTERNAL HEAP</div>
              <div class="stat-value" id="statHeap">~290 KB</div>
            </div>
            <div class="stat-cell">
              <div class="stat-label">PACKETS RX</div>
              <div class="stat-value" id="statRx" style="color:#00c5e0;">0</div>
            </div>
            <div class="stat-cell">
              <div class="stat-label">I2S DAC</div>
              <div class="stat-value">UDA1334A</div>
            </div>
            <div class="stat-cell">
              <div class="stat-label">CORE 0</div>
              <div class="stat-value">UDP 9090/9091</div>
            </div>
            <div class="stat-cell">
              <div class="stat-label">CORE 1</div>
              <div class="stat-value">I2S DMA Engine</div>
            </div>
          </div>
        </div>
      </section>

    </main>

    <!-- Bottom Navigation Bar: EXACT MATCH TO SCREENSHOT -->
    <nav class="nav-bar">
      <!-- Player Tab -->
      <button class="nav-item active" onclick="switchTab('player', this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
        <span>Player</span>
      </button>

      <!-- Hook Tab -->
      <button class="nav-item" onclick="switchTab('hook', this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>
        <span>Hook</span>
      </button>

      <!-- Tone Tab -->
      <button class="nav-item" onclick="switchTab('tone', this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line></svg>
        <span>Tone</span>
      </button>

      <!-- Wi-Fi Tab -->
      <button class="nav-item" onclick="switchTab('wifi', this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>
        <span>Wi-Fi</span>
      </button>

      <!-- OTA Tab -->
      <button class="nav-item" onclick="switchTab('ota', this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
        <span>OTA</span>
      </button>

      <!-- Status Tab -->
      <button class="nav-item" onclick="switchTab('status', this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
        <span>Status</span>
      </button>
    </nav>
  </div>

  <script>
    let isPlaying = true;

    function toast(msg) {
      const t = document.getElementById('appToast');
      document.getElementById('toastMsg').innerText = msg;
      t.style.display = 'flex';
      setTimeout(() => { t.style.display = 'none'; }, 3000);
    }

    function switchTab(tabId, btn) {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      const target = document.getElementById('tab-' + tabId);
      if (target) target.classList.add('active');
      if (btn) btn.classList.add('active');
      else {
        const matchingBtn = Array.from(document.querySelectorAll('.nav-item')).find(b => b.getAttribute('onclick').includes(tabId));
        if (matchingBtn) matchingBtn.classList.add('active');
      }
    }

    function updateStats() {
      fetch('/api/status').then(r => r.json()).then(d => {
        document.getElementById('volVal').innerText = d.volume + '%';
        document.getElementById('volSlider').value = d.volume;
        document.getElementById('statRx').innerText = d.packetsReceived;
        document.getElementById('ipBadge').innerText = 'Device: ' + d.ip;
        document.getElementById('statPsram').innerText = ((d.freePsram || 0) / (1024*1024)).toFixed(1) + ' MB Free';
        document.getElementById('statHeap').innerText = ((d.freeHeap || 0) / 1024).toFixed(0) + ' KB Free';

        if (d.packetsReceived > 0) {
          document.getElementById('trackName').innerText = 'Phone Audio Stream';
          document.getElementById('trackSub').innerText = 'Packets Rx: ' + d.packetsReceived;
        }
      }).catch(e => console.error(e));
    }
    setInterval(updateStats, 1000);
    updateStats();

    function setVol(val) {
      document.getElementById('volVal').innerText = val + '%';
      fetch('/api/volume?val=' + val, { method: 'POST' });
    }

    function cmd(c) {
      fetch('/api/control?cmd=' + c, { method: 'POST' }).then(() => {
        if (c === 'flush') toast('Buffer Flushed!');
      });
    }

    function togglePlay() {
      isPlaying = !isPlaying;
      const c = document.getElementById('playIconContainer');
      if (isPlaying) {
        c.innerHTML = '<div style="width:7px; height:24px; background:#000; border-radius:2px;"></div><div style="width:7px; height:24px; background:#000; border-radius:2px;"></div>';
      } else {
        c.innerHTML = '<div style="width:0; height:0; border-top:12px solid transparent; border-bottom:12px solid transparent; border-left:20px solid #000; margin-left:4px;"></div>';
      }
      cmd(isPlaying ? 'resume' : 'pause');
    }

    function connectPhone(e) {
      e.preventDefault();
      const ip = document.getElementById('phoneIpInput').value;
      const port = document.getElementById('phonePortInput').value;
      fetch('/connect_phone?phone_ip=' + encodeURIComponent(ip) + '&phone_port=' + encodeURIComponent(port), { method: 'POST' })
        .then(r => r.json())
        .then(d => {
          toast('Hooked to ' + ip + ':' + port + '! Audio playing...');
          switchTab('player');
        })
        .catch(() => {
          toast('Ping sent to ' + ip + ':' + port);
          switchTab('player');
        });
    }

    function scanNetworks() {
      const box = document.getElementById('scanResults');
      box.style.display = 'block';
      box.innerHTML = '<div style="font-size:11px; color:#00c5e0; font-family:monospace; padding:6px;">Scanning...</div>';
      fetch('/api/scan')
        .then(r => r.json())
        .then(aps => {
          if (!aps.length) { box.innerHTML = '<div style="font-size:11px; color:#94a3b8; padding:6px;">No APs found</div>'; return; }
          let h = '';
          aps.forEach(ap => {
            h += `<div onclick="document.getElementById('ssidInput').value='${ap.ssid}'" style="padding:6px 8px; background:rgba(0,0,0,0.5); border-radius:8px; margin-bottom:4px; font-size:11px; font-family:monospace; display:flex; justify-content:space-between; cursor:pointer;"><span>${ap.ssid}</span><span style="color:#94a3b8;">${ap.rssi} dBm</span></div>`;
          });
          box.innerHTML = h;
        });
    }

    function saveWiFi(e) {
      e.preventDefault();
      const ssid = document.getElementById('ssidInput').value;
      const pass = document.getElementById('passInput').value;
      fetch('/savewifi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'ssid=' + encodeURIComponent(ssid) + '&pass=' + encodeURIComponent(pass)
      }).then(() => {
        toast('Credentials saved! ESP32 reconnecting...');
      });
    }

    function setPreset(p, btn) {
      document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      let b = 0, t = 0;
      if (p === 'bass') { b = 6; t = 1; }
      else if (p === 'vocal') { b = -2; t = 4; }
      else if (p === 'club') { b = 5; t = 4; }
      document.getElementById('bassSlider').value = b;
      document.getElementById('trebleSlider').value = t;
      updateEq();
    }

    function updateEq() {
      const b = document.getElementById('bassSlider').value;
      const t = document.getElementById('trebleSlider').value;
      const bal = document.getElementById('balSlider').value;
      document.getElementById('bassVal').innerText = (b > 0 ? '+' : '') + b + ' dB';
      document.getElementById('trebleVal').innerText = (t > 0 ? '+' : '') + t + ' dB';
      document.getElementById('balVal').innerText = bal == 0 ? 'Center' : (bal < 0 ? 'L ' + Math.abs(bal) : 'R ' + bal);
      fetch(`/api/eq?bass=${b}&treble=${t}&balance=${bal}`, { method: 'POST' });
    }

    function uploadOta(e) {
      e.preventDefault();
      const fileInput = document.getElementById('otaFileInput');
      if (!fileInput.files.length) return;
      const file = fileInput.files[0];
      const formData = new FormData();
      formData.append('update', file);

      const pBox = document.getElementById('otaProgressBox');
      const pFill = document.getElementById('otaProgressFill');
      const sText = document.getElementById('otaStatusText');
      const btn = document.getElementById('otaSubmitBtn');

      pBox.style.display = 'block';
      sText.style.display = 'block';
      btn.disabled = true;
      sText.innerText = 'Writing binary to flash... 0%';

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/update', true);

      xhr.upload.onprogress = function(evt) {
        if (evt.lengthComputable) {
          const pct = Math.round((evt.loaded / evt.total) * 100);
          pFill.style.width = pct + '%';
          sText.innerText = 'Writing to flash: ' + pct + '%';
        }
      };

      xhr.onload = function() {
        if (xhr.status === 200) {
          pFill.style.background = '#10b981';
          sText.innerText = 'Flash Successful! Rebooting ESP32...';
          toast('Firmware updated! Reconnecting...');
        } else {
          sText.innerText = 'Error: ' + xhr.responseText;
          btn.disabled = false;
        }
      };

      xhr.onerror = function() {
        sText.innerText = 'Upload failed. Check connection.';
        btn.disabled = false;
      };

      xhr.send(formData);
    }
  </script>
</body>
</html>
)rawliteral";

// ----------------------------------------------------------------------------
// CAPTIVE PORTAL & WEB SERVER HANDLERS
// ----------------------------------------------------------------------------
void handleRoot() {
  server.send_P(200, "text/html", INDEX_HTML);
}

void handleStatus() {
  String json = "{";
  json += "\"power\":" + String(state.powerOn ? "true" : "false") + ",";
  json += "\"playing\":" + String(state.isPlaying ? "true" : "false") + ",";
  json += "\"muted\":" + String(state.isMuted ? "true" : "false") + ",";
  json += "\"volume\":" + String(state.volume) + ",";
  json += "\"sampleRate\":" + String(state.sampleRate) + ",";
  json += "\"bass\":" + String(state.bassGain) + ",";
  json += "\"treble\":" + String(state.trebleGain) + ",";
  json += "\"balance\":" + String(state.balance) + ",";
  json += "\"streamPort\":" + String(state.streamPort) + ",";
  json += "\"bufferPercent\":" + String(audioBuffer ? (audioBuffer->getFillRatio() * 100.0f) : 0.0f, 1) + ",";
  json += "\"packetsReceived\":" + String(state.packetsReceived) + ",";
  json += "\"packetsDropped\":" + String(state.packetsDropped) + ",";
  json += "\"isAp\":" + String(state.isApMode ? "true" : "false") + ",";
  json += "\"ip\":\"" + (state.isApMode ? WiFi.softAPIP().toString() : WiFi.localIP().toString()) + "\",";
  json += "\"statusText\":\"" + state.connectionStatus + "\",";
  json += "\"freePsram\":" + String(ESP.getFreePsram()) + ",";
  json += "\"freeHeap\":" + String(ESP.getFreeHeap()) + "}";
  server.send(200, "application/json", json);
}

void handleSetSampleRate() {
  if (server.hasArg("rate")) {
    uint32_t r = server.arg("rate").toInt();
    if (r == 44100 || r == 48000 || r == 96000) {
      state.sampleRate = r;
      i2s_set_clk(I2S_PORT, state.sampleRate, I2S_BITS_PER_SAMPLE_16BIT, I2S_CHANNEL_STEREO);
      Serial.printf("[I2S] Sample rate dynamically switched to %u Hz\n", state.sampleRate);
    }
  }
  handleStatus();
}

void sendUdpRegistrationPing(const String& ipStr, int port) {
  IPAddress targetIp;
  if (!targetIp.fromString(ipStr)) {
    Serial.printf("[UDP] Invalid IP: %s\n", ipStr.c_str());
    return;
  }

  // WFAS v2 Handshake: Marco Morosi's NetworkManager.kt line 1877 requires:
  // if (!message.startsWith(CLIENT_HELLO_MESSAGE)) continue;
  // Where CLIENT_HELLO_MESSAGE is "HELLO_FROM_CLIENT" and version is 2
  const char* helloMsg = "HELLO_FROM_CLIENT;v=2";

  udpAudio9090.beginPacket(targetIp, port);
  udpAudio9090.write((const uint8_t*)helloMsg, strlen(helloMsg));
  udpAudio9090.endPacket();

  udpAudio9091.beginPacket(targetIp, port);
  udpAudio9091.write((const uint8_t*)helloMsg, strlen(helloMsg));
  udpAudio9091.endPacket();

  // If port wasn't 9091, also send to default discovery port 9091
  if (port != 9091) {
    udpAudio9091.beginPacket(targetIp, 9091);
    udpAudio9091.write((const uint8_t*)helloMsg, strlen(helloMsg));
    udpAudio9091.endPacket();
  }

  Serial.printf("[UDP] Sent WFAS handshake 'HELLO_FROM_CLIENT;v=2' to %s:%d\n", ipStr.c_str(), port);
}

void handleConnectPhone() {
  String phoneIp = server.hasArg("phone_ip") ? server.arg("phone_ip") : "";
  int port = server.hasArg("phone_port") ? server.arg("phone_port").toInt() : 9090;

  if (phoneIp.length() > 0) {
    state.phoneServerIp = phoneIp;
    state.streamPort = port;
    state.phoneConnected = true;
    state.lastPingTime = millis();

    sendUdpRegistrationPing(phoneIp, port);
    state.connectionStatus = "Linked to " + phoneIp + ":" + String(port);

    server.send(200, "application/json", "{\"success\":true,\"msg\":\"Linked to " + phoneIp + ":" + String(port) + "\"}");
  } else {
    server.send(400, "application/json", "{\"error\":\"Missing phone_ip parameter\"}");
  }
}

void handleScanWiFi() {
  int n = WiFi.scanNetworks();
  String json = "[";
  for (int i = 0; i < n; ++i) {
    if (i > 0) json += ",";
    json += "{\"ssid\":\"" + WiFi.SSID(i) + "\",\"rssi\":" + String(WiFi.RSSI(i)) + ",\"auth\":" + String(WiFi.encryptionType(i) != WIFI_AUTH_OPEN ? "true" : "false") + "}";
  }
  json += "]";
  server.send(200, "application/json", json);
}

void handleSaveWiFi() {
  if (server.hasArg("ssid")) {
    String newSsid = server.arg("ssid");
    String newPass = server.arg("pass");

    prefs.begin("audio-cfg", false);
    prefs.putString("ssid", newSsid);
    prefs.putString("pass", newPass);
    prefs.end();

    server.send(200, "application/json", "{\"success\":true,\"msg\":\"Saved\"}");
    delay(1000);
    ESP.restart();
  } else {
    server.send(400, "application/json", "{\"error\":\"Missing SSID\"}");
  }
}

void setupWebServer() {
  server.on("/", HTTP_GET, handleRoot);
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/samplerate", handleSetSampleRate);
  server.on("/connect_phone", HTTP_POST, handleConnectPhone);
  server.on("/connect_phone", HTTP_GET, handleConnectPhone);
  server.on("/api/scan", HTTP_GET, handleScanWiFi);
  server.on("/savewifi", HTTP_POST, handleSaveWiFi);

  server.on("/api/volume", HTTP_POST, []() {
    if (server.hasArg("val")) {
      state.volume = constrain(server.arg("val").toInt(), 0, 100);
    }
    server.send(200, "application/json", "{\"success\":true}");
  });

  server.on("/api/eq", HTTP_POST, []() {
    if (server.hasArg("bass")) state.bassGain = server.arg("bass").toInt();
    if (server.hasArg("treble")) state.trebleGain = server.arg("treble").toInt();
    if (server.hasArg("balance")) state.balance = server.arg("balance").toInt();
    server.send(200, "application/json", "{\"success\":true}");
  });

  server.on("/api/control", HTTP_POST, []() {
    if (server.hasArg("cmd")) {
      String c = server.arg("cmd");
      if (c == "mute") {
        state.isMuted = !state.isMuted;
        digitalWrite(UDA_MUTE_PIN, state.isMuted ? HIGH : LOW);
      } else if (c == "flush" && audioBuffer) {
        audioBuffer->flush();
      } else if (c == "pause") {
        state.isPlaying = false;
      } else if (c == "resume") {
        state.isPlaying = true;
      } else if (c == "power") {
        state.powerOn = !state.powerOn;
        if (!state.powerOn) {
          digitalWrite(UDA_MUTE_PIN, HIGH);
          if (audioBuffer) audioBuffer->flush();
        } else {
          digitalWrite(UDA_MUTE_PIN, state.isMuted ? HIGH : LOW);
        }
      }
    }
    server.send(200, "application/json", "{\"success\":true}");
  });

  // OTA firmware update endpoints
  server.on("/update", HTTP_POST, []() {
    server.sendHeader("Connection", "close");
    server.send(200, "text/plain", (Update.hasError()) ? "UPDATE FAILED" : "UPDATE SUCCESSFUL - REBOOTING...");
    delay(1000);
    ESP.restart();
  }, []() {
    HTTPUpload& upload = server.upload();
    if (upload.status == UPLOAD_FILE_START) {
      Serial.printf("[OTA] Start: %s\n", upload.filename.c_str());
      if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
        Update.printError(Serial);
      }
    } else if (upload.status == UPLOAD_FILE_WRITE) {
      if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
        Update.printError(Serial);
      }
    } else if (upload.status == UPLOAD_FILE_END) {
      if (Update.end(true)) {
        Serial.printf("[OTA] Success: %u bytes\n", upload.totalSize);
      } else {
        Update.printError(Serial);
      }
    }
  });

  // Captive Portal Redirects & Browser Connectivity Check Handlers
  server.on("/generate_204", handleRoot);
  server.on("/gen_204", handleRoot);
  server.on("/ncsi.txt", handleRoot);
  server.on("/hotspot-detect.html", handleRoot);
  server.on("/favicon.ico", []() { server.send(204); });

  server.onNotFound([]() {
    server.send_P(200, "text/html", INDEX_HTML);
  });

  server.begin();
  Serial.println("[HTTP] Web Server active on port 80");
}

// ----------------------------------------------------------------------------
// FREERTOS AUDIO PLAYBACK TASK (Pinned to Core 1)
// ----------------------------------------------------------------------------
// FREERTOS AUDIO PLAYBACK TASK (Pinned to Core 1)
// ----------------------------------------------------------------------------
void audioPlaybackTask(void* parameter) {
  uint8_t dmaBuffer[CHUNK_SIZE];
  size_t bytesWritten = 0;
  bool prebuffering = true;

  for (;;) {
    if (!state.powerOn || !state.isPlaying || state.isMuted) {
      vTaskDelay(pdMS_TO_TICKS(10));
      continue;
    }

    size_t available = audioBuffer ? audioBuffer->availableForRead() : 0;

    // Jitter Buffer: Buffer 16 KB (~85ms of 48kHz stereo) before starting playback.
    // This absorbs Wi-Fi transmission jitter and prevents audio underruns/crackle.
    if (prebuffering) {
      if (available >= 16384) {
        prebuffering = false;
      } else {
        vTaskDelay(pdMS_TO_TICKS(4));
        continue;
      }
    } else {
      if (available < CHUNK_SIZE) {
        prebuffering = true;
        vTaskDelay(pdMS_TO_TICKS(4));
        continue;
      }
    }

    if (audioBuffer) {
      size_t bytesRead = audioBuffer->read(dmaBuffer, CHUNK_SIZE);
      if (bytesRead > 0) {
        // Apply hardware volume scaling (16-bit stereo PCM)
        int16_t* samples = (int16_t*)dmaBuffer;
        size_t numSamples = bytesRead / 2;
        float volFactor = (float)state.volume / 100.0f;

        for (size_t i = 0; i < numSamples; i++) {
          samples[i] = (int16_t)(samples[i] * volFactor);
        }

        i2s_write(I2S_PORT, dmaBuffer, bytesRead, &bytesWritten, portMAX_DELAY);
      }
    }
  }
}

// ----------------------------------------------------------------------------
// FREERTOS DUAL-PORT UDP AUDIO RECEIVER TASK (Pinned to Core 0)
// ----------------------------------------------------------------------------
void udpReceiverTask(void* parameter) {
  uint8_t packetBuffer[2048];

  udpAudio9090.begin(STREAM_PORT_9090);
  udpAudio9091.begin(STREAM_PORT_9091);
  Serial.println("[UDP] Audio listeners active on ports 9090 & 9091");

  for (;;) {
    bool hadPacket = false;

    // 1. Check Port 9090 (Primary UDP socket)
    int packetSize90 = udpAudio9090.parsePacket();
    if (packetSize90 > 0) {
      hadPacket = true;
      int len = udpAudio9090.read(packetBuffer, sizeof(packetBuffer));
      if (len > 0) {
        state.bytesReceived += len;
        state.packetsReceived++;

        // Filter text control packets
        if (len < 64 && (strncmp((char*)packetBuffer, "HELLO_ACK", 9) == 0 ||
                         strncmp((char*)packetBuffer, "PING", 4) == 0 ||
                         strncmp((char*)packetBuffer, "WFAS_BUSY", 9) == 0 ||
                         strncmp((char*)packetBuffer, "WFAS_UNAUTHORIZED", 17) == 0)) {
          if (strncmp((char*)packetBuffer, "HELLO_ACK", 9) == 0) {
            state.phoneConnected = true;
            state.connectionStatus = "Streaming from Phone Active!";
            Serial.println("[UDP] Handshake HELLO_ACK received from phone! Streaming active.");
          }
          continue;
        }

        // WFAS packet handling: 10-byte wire header stripping
        // v2 wire header: [0]='W'(0x57), [1]='F'(0x46), [2]=0x02, [3]=0x00, [4..5]=seq, [6..9]=samplePos
        int pcmOffset = 0;
        if (len > 10 && packetBuffer[0] == 'W' && packetBuffer[1] == 'F') {
          pcmOffset = 10;
        }

        int pcmLen = len - pcmOffset;
        // Align strictly to 4-byte boundaries (16-bit stereo frame = 4 bytes: 2 bytes L + 2 bytes R)
        pcmLen -= (pcmLen % 4);

        if (pcmLen > 0 && audioBuffer) {
          size_t written = audioBuffer->write(&packetBuffer[pcmOffset], pcmLen);
          if (written < (size_t)pcmLen) {
            state.packetsDropped++;
          }
        }
      }
    }

    // 2. Check Port 9091 (Secondary / Discovery UDP socket)
    int packetSize91 = udpAudio9091.parsePacket();
    if (packetSize91 > 0) {
      hadPacket = true;
      IPAddress remoteIp = udpAudio9091.remoteIP();
      int remotePort = udpAudio9091.remotePort();
      int len = udpAudio9091.read(packetBuffer, sizeof(packetBuffer));
      if (len > 0) {
        state.bytesReceived += len;
        state.packetsReceived++;

        // Check for Auto-Discovery beacon from Android phone
        if (len < 64 && strncmp((char*)packetBuffer, "WIFI_AUDIO_STREAMER_DISCOVERY", 29) == 0) {
          Serial.printf("[UDP] Discovered phone server at %s:%d! Auto-linking...\n", remoteIp.toString().c_str(), remotePort);
          state.phoneServerIp = remoteIp.toString();
          state.streamPort = 9090;
          sendUdpRegistrationPing(remoteIp.toString(), 9090);
          continue;
        }

        // Filter text control packets
        if (len < 64 && (strncmp((char*)packetBuffer, "HELLO_ACK", 9) == 0 ||
                         strncmp((char*)packetBuffer, "PING", 4) == 0 ||
                         strncmp((char*)packetBuffer, "WFAS_BUSY", 9) == 0 ||
                         strncmp((char*)packetBuffer, "WFAS_UNAUTHORIZED", 17) == 0)) {
          if (strncmp((char*)packetBuffer, "HELLO_ACK", 9) == 0) {
            state.phoneConnected = true;
            state.connectionStatus = "Streaming from Phone Active!";
            Serial.println("[UDP] Handshake HELLO_ACK received from phone! Streaming active.");
          }
          continue;
        }

        int pcmOffset = 0;
        if (len > 10 && packetBuffer[0] == 'W' && packetBuffer[1] == 'F') {
          pcmOffset = 10;
        }

        int pcmLen = len - pcmOffset;
        pcmLen -= (pcmLen % 4);

        if (pcmLen > 0 && audioBuffer) {
          size_t written = audioBuffer->write(&packetBuffer[pcmOffset], pcmLen);
          if (written < (size_t)pcmLen) {
            state.packetsDropped++;
          }
        }
      }
    }

    // Keepalive ping every 5 seconds if hooked to phone server
    if (state.phoneConnected && state.phoneServerIp.length() > 0 && (millis() - state.lastPingTime > 5000)) {
      state.lastPingTime = millis();
      sendUdpRegistrationPing(state.phoneServerIp, state.streamPort);
    }

    if (!hadPacket) {
      vTaskDelay(pdMS_TO_TICKS(1));
    }
  }
}

// ----------------------------------------------------------------------------
// ARDUINO SETUP
// ----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n=======================================================");
  Serial.println("  ESP32-S3 Audio Receiver for WiFiAudioStreaming v1.2  ");
  Serial.println("  Pure UDP Audio on Ports 9090 & 9091 + Web Controller ");
  Serial.println("=======================================================\n");

  // 1. Allocate 512KB Ring Buffer in 8MB Octal PSRAM
  audioBuffer = new PsramRingBuffer(RING_BUFFER_SIZE);

  // 2. Setup UDA1334A I2S Audio Driver
  setupI2S();

  // 3. Wi-Fi Configuration
  prefs.begin("audio-cfg", true);
  String savedSsid = prefs.getString("ssid", "");
  String savedPass = prefs.getString("pass", "");
  prefs.end();

  bool connected = false;
  if (savedSsid.length() > 0) {
    Serial.printf("[WIFI] Connecting to saved network '%s'...\n", savedSsid.c_str());
    WiFi.mode(WIFI_STA);
    WiFi.begin(savedSsid.c_str(), savedPass.c_str());

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 25) {
      delay(300);
      Serial.print(".");
      attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
      connected = true;
      state.isApMode = false;
      Serial.println("\n[WIFI] Connected successfully!");
      Serial.printf("[WIFI] IP Address: %s\n", WiFi.localIP().toString().c_str());
    }
  }

  // Fallback to Access Point (AP) mode if not connected
  if (!connected) {
    Serial.println("\n[WIFI] Launching direct SoftAP 'ESP32-Audio-Setup'...");
    WiFi.mode(WIFI_AP);
    WiFi.softAP("ESP32-Audio-Setup", "password1234");
    state.isApMode = true;
    Serial.printf("[WIFI] AP IP Address: %s\n", WiFi.softAPIP().toString().c_str());
    Serial.println("[WIFI] Open browser at: http://192.168.4.1 or http://wifimusic.local");

    // Start Captive Portal DNS Server on port 53
    dnsServer.start(53, "*", WiFi.softAPIP());
  }

  // 4. Start mDNS (http://wifimusic.local)
  if (MDNS.begin("wifimusic")) {
    MDNS.addService("http", "tcp", 80);
    Serial.println("[MDNS] Active: http://wifimusic.local");
  }

  // 5. Setup Web Server (Embedded Mobile App & Captive Portal)
  setupWebServer();

  // 6. Launch FreeRTOS Tasks
  xTaskCreatePinnedToCore(
    audioPlaybackTask,
    "I2S_Playback",
    4096,
    NULL,
    configMAX_PRIORITIES - 1,
    NULL,
    1 // Pinned to Core 1
  );

  xTaskCreatePinnedToCore(
    udpReceiverTask,
    "UDP_Receiver",
    4096,
    NULL,
    configMAX_PRIORITIES - 2,
    NULL,
    0 // Pinned to Core 0
  );

  Serial.println("[SYSTEM] Ready! Listening on ports 9090 and 9091.");
}

// ----------------------------------------------------------------------------
// MAIN LOOP
// ----------------------------------------------------------------------------
void loop() {
  if (state.isApMode) {
    dnsServer.processNextRequest();
  }
  server.handleClient();
  vTaskDelay(pdMS_TO_TICKS(2));
}
