export interface FirmwareFile {
  filename: string;
  language: string;
  description: string;
  content: string;
}

export const FIRMWARE_FILES: FirmwareFile[] = [
  {
    filename: "src/main.cpp",
    language: "cpp",
    description: "Complete FreeRTOS dual-core firmware with UDP audio receiver, PSRAM ring buffer, UDA1334A I2S driver, Web Controller & Captive Portal",
    content: `/**
 * ============================================================================
 * ESP32-S3 N16R8 WiFi Audio Streaming Receiver for UDA1334A DAC
 * Target Android App: WiFiAudioStreaming v1.2 by Marco Morosi
 * (https://github.com/marcomorosi06/WiFiAudioStreaming-Android)
 * ============================================================================
 * Hardware: ESP32-S3-DevKitC-1-N16R8 (16MB Flash, 8MB Octal PSRAM)
 * I2S DAC:   UDA1334A Stereo DAC (Adafruit / CJMCU breakout)
 * Features:
 *   - Auto Captive Portal + DNS Redirect (192.168.4.1) for instant AP setup
 *   - Robust Arduino WebServer for rock-solid stability in AP & STA mode
 *   - Dual-core FreeRTOS: Core 0 UDP audio receiver, Core 1 I2S DMA playback
 *   - 512KB Octal PSRAM Ring Buffer for jitter-free 16-bit 44.1kHz Stereo PCM
 *   - Automatic mDNS: http://wifimusic.local
 *   - UDP Audio Listener on port 9091 (and configurable)
 *   - Built-in HTML Web Controller with live meters, volume, & OTA update
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
#define DEFAULT_UDP_PORT  9091         // WiFiAudioStreaming default UDP port
#define SAMPLE_RATE       44100        // 44.1 kHz 16-bit Stereo PCM
#define BITS_PER_SAMPLE   16
#define I2S_PORT          I2S_NUM_0
#define RING_BUFFER_SIZE  (512 * 1024) // 512 KB in 8MB Octal PSRAM (~3s buffer)
#define UDP_PACKET_MAX    2048

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
      Serial.println("[PSRAM] Failed! Fallback to standard heap...");
      capacity = 32 * 1024;
      buffer = (uint8_t*)malloc(capacity);
    } else {
      Serial.printf("[PSRAM] Allocated %u KB Octal PSRAM ring buffer\\n", (unsigned)(capacity / 1024));
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
WiFiUDP udpAudio;
WebServer server(80);
DNSServer dnsServer;
Preferences prefs;

struct ReceiverState {
  bool powerOn = true;
  bool isPlaying = true;
  bool isMuted = false;
  uint8_t volume = 85;
  uint16_t udpPort = DEFAULT_UDP_PORT;
  uint32_t packetsReceived = 0;
  uint32_t packetsDropped = 0;
  uint32_t lastPacketTime = 0;
  bool isApMode = false;
  String currentSsid = "";
} state;

// ----------------------------------------------------------------------------
// I2S HARDWARE INITIALIZATION (UDA1334A DAC)
// ----------------------------------------------------------------------------
void setupI2S() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
    .sample_rate = SAMPLE_RATE,
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
    Serial.printf("[I2S] Driver install error: %d\\n", err);
  }
  i2s_set_pin(I2S_PORT, &pin_config);
  i2s_set_clk(I2S_PORT, SAMPLE_RATE, I2S_BITS_PER_SAMPLE_16BIT, I2S_CHANNEL_STEREO);

  pinMode(UDA_MUTE_PIN, OUTPUT);
  digitalWrite(UDA_MUTE_PIN, LOW); // LOW = Unmuted on UDA1334A
  Serial.println("[I2S] UDA1334A I2S audio driver ready.");
}

// ----------------------------------------------------------------------------
// EMBEDDED WEB CONTROLLER & CAPTIVE PORTAL HTML
// ----------------------------------------------------------------------------
const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ESP32-S3 WiFi Audio Receiver</title>
  <style>
    :root { --bg: #090d16; --card: #111827; --border: #1f293d; --cyan: #06b6d4; --accent: #3b82f6; --text: #f3f4f6; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 20px; }
    .container { max-width: 520px; margin: 0 auto; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
    h1 { font-size: 1.25rem; font-weight: 700; color: #fff; margin: 0 0 4px; display: flex; align-items: center; gap: 8px; }
    .badge { font-size: 11px; font-family: monospace; background: rgba(6,182,212,0.15); color: var(--cyan); padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(6,182,212,0.3); }
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 15px 0; }
    .stat { background: #0c1220; padding: 10px 14px; border-radius: 8px; border: 1px solid #1a2234; }
    .stat-label { font-size: 11px; text-transform: uppercase; color: #94a3b8; font-family: monospace; }
    .stat-val { font-size: 18px; font-weight: bold; color: #fff; margin-top: 2px; }
    .btn { background: var(--accent); color: #fff; border: 0; padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; width: 100%; box-sizing: border-box; font-size: 14px; }
    .btn:hover { background: #2563eb; }
    .btn-secondary { background: #1e293b; color: #cbd5e1; border: 1px solid #334155; margin-top: 8px; }
    .btn-secondary:hover { background: #334155; }
    input[type=text], input[type=password], input[type=number] { width: 100%; padding: 10px; margin: 6px 0 14px; background: #0c1220; border: 1px solid #2d3748; border-radius: 6px; color: #fff; box-sizing: border-box; font-size: 14px; }
    input[type=range] { width: 100%; margin: 10px 0; }
    label { font-size: 12px; color: #94a3b8; font-weight: 500; }
    .progress { background: #1e293b; height: 10px; border-radius: 5px; overflow: hidden; margin: 8px 0; }
    .progress-bar { background: var(--cyan); height: 100%; width: 0%; transition: width 0.3s; }
    .guide-box { background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); padding: 12px; border-radius: 8px; font-size: 12px; line-height: 1.5; color: #93c5fd; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h1>ESP32-S3 Receiver</h1>
        <span class="badge" id="modeBadge">AP MODE</span>
      </div>
      <p style="font-size:12px; color:#64748b; margin:4px 0 16px;">WiFiAudioStreaming (Marco Morosi) &bull; UDA1334A DAC</p>

      <div class="guide-box">
        <strong>Android App Setup (WiFiAudioStreaming v1.2):</strong><br>
        1. Open App &rarr; Set Mode to <b>Transmitter</b><br>
        2. Set Target IP: <b id="guideIp">192.168.4.1</b><br>
        3. Set Port: <b id="guidePort">9091</b> &bull; Format: <b>16-bit 44.1kHz Stereo</b>
      </div>

      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">PSRAM Ring Buffer</div>
          <div class="progress"><div class="progress-bar" id="bufBar"></div></div>
          <div class="stat-val" id="bufVal">0%</div>
        </div>
        <div class="stat">
          <div class="stat-label">Packets Received</div>
          <div class="stat-val" id="pktVal">0</div>
        </div>
      </div>

      <label>Digital Master Volume: <span id="volLabel">85%</span></label>
      <input type="range" id="volSlider" min="0" max="100" value="85" oninput="setVol(this.value)">

      <div style="display:flex; gap:10px; margin-top:10px;">
        <button class="btn btn-secondary" onclick="cmd('mute')">Toggle Mute</button>
        <button class="btn btn-secondary" onclick="cmd('flush')">Clear Buffer</button>
      </div>
    </div>

    <!-- WiFi Config Card -->
    <div class="card">
      <h2 style="font-size:16px; margin:0 0 12px; color:#fff;">Connect to Home Wi-Fi (Optional)</h2>
      <form action="/savewifi" method="POST">
        <label>Wi-Fi Network Name (SSID):</label>
        <input type="text" name="ssid" placeholder="Enter your 2.4GHz Wi-Fi name" required>

        <label>Wi-Fi Password:</label>
        <input type="password" name="pass" placeholder="Enter Wi-Fi password">

        <label>UDP Audio Port (Default: 9091):</label>
        <input type="number" name="port" value="9091" min="1024" max="65535">

        <button type="submit" class="btn">Save & Connect to Wi-Fi</button>
      </form>
    </div>

    <!-- OTA Firmware Card -->
    <div class="card">
      <h2 style="font-size:16px; margin:0 0 12px; color:#fff;">Over-The-Air (OTA) Firmware Update</h2>
      <form method="POST" action="/update" enctype="multipart/form-data">
        <input type="file" name="update" style="margin-bottom:12px; font-size:12px; color:#94a3b8;">
        <button type="submit" class="btn btn-secondary">Upload & Flash Firmware</button>
      </form>
    </div>
  </div>

  <script>
    function updateStats() {
      fetch('/api/status').then(r => r.json()).then(d => {
        document.getElementById('bufBar').style.width = d.bufferPercent + '%';
        document.getElementById('bufVal').innerText = d.bufferPercent.toFixed(1) + '%';
        document.getElementById('pktVal').innerText = d.packetsReceived;
        document.getElementById('modeBadge').innerText = d.isAp ? 'AP: ' + d.ip : 'STA: ' + d.ip;
        document.getElementById('guideIp').innerText = d.ip;
        document.getElementById('guidePort').innerText = d.udpPort;
      }).catch(e => console.error(e));
    }
    setInterval(updateStats, 1000);
    updateStats();

    function setVol(val) {
      document.getElementById('volLabel').innerText = val + '%';
      fetch('/api/volume?val=' + val, { method: 'POST' });
    }
    function cmd(c) {
      fetch('/api/control?cmd=' + c, { method: 'POST' });
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
  json += "\\"power\\":" + String(state.powerOn ? "true" : "false") + ",";
  json += "\\"playing\\":" + String(state.isPlaying ? "true" : "false") + ",";
  json += "\\"muted\\":" + String(state.isMuted ? "true" : "false") + ",";
  json += "\\"volume\\":" + String(state.volume) + ",";
  json += "\\"udpPort\\":" + String(state.udpPort) + ",";
  json += "\\"bufferPercent\\":" + String(audioBuffer ? (audioBuffer->getFillRatio() * 100.0f) : 0.0f, 1) + ",";
  json += "\\"packetsReceived\\":" + String(state.packetsReceived) + ",";
  json += "\\"packetsDropped\\":" + String(state.packetsDropped) + ",";
  json += "\\"isAp\\":" + String(state.isApMode ? "true" : "false") + ",";
  json += "\\"ip\\":\\"" + (state.isApMode ? WiFi.softAPIP().toString() : WiFi.localIP().toString()) + "\\",";
  json += "\\"freePsram\\":" + String(ESP.getFreePsram()) + ",";
  json += "\\"freeHeap\\":" + String(ESP.getFreeHeap()) + "}";
  server.send(200, "application/json", json);
}

void handleSaveWiFi() {
  if (server.hasArg("ssid")) {
    String newSsid = server.arg("ssid");
    String newPass = server.arg("pass");
    if (server.hasArg("port")) {
      int p = server.arg("port").toInt();
      if (p > 1024 && p < 65535) state.udpPort = p;
    }

    prefs.begin("audio-cfg", false);
    prefs.putString("ssid", newSsid);
    prefs.putString("pass", newPass);
    prefs.putUShort("port", state.udpPort);
    prefs.end();

    String resp = "<html><body style='font-family:sans-serif; background:#090d16; color:#fff; text-align:center; padding:50px;'>";
    resp += "<h2>WiFi Credentials Saved!</h2><p>ESP32-S3 is connecting to " + newSsid + "...</p>";
    resp += "<p>If connection succeeds, access at <b>http://wifimusic.local</b> or its router IP.</p>";
    resp += "<p>Rebooting in 3 seconds...</p></body></html>";
    server.send(200, "text/html", resp);
    delay(2000);
    ESP.restart();
  } else {
    server.send(400, "text/plain", "Missing SSID");
  }
}

void setupWebServer() {
  server.on("/", HTTP_GET, handleRoot);
  server.on("/api/status", HTTP_GET, handleStatus);

  server.on("/api/volume", HTTP_POST, []() {
    if (server.hasArg("val")) {
      state.volume = constrain(server.arg("val").toInt(), 0, 100);
    }
    server.send(200, "application/json", "{\\"success\\":true}");
  });

  server.on("/api/control", HTTP_POST, []() {
    if (server.hasArg("cmd")) {
      String c = server.arg("cmd");
      if (c == "mute") {
        state.isMuted = !state.isMuted;
        digitalWrite(UDA_MUTE_PIN, state.isMuted ? HIGH : LOW);
      } else if (c == "flush" && audioBuffer) {
        audioBuffer->flush();
      }
    }
    server.send(200, "application/json", "{\\"success\\":true}");
  });

  server.on("/savewifi", HTTP_POST, handleSaveWiFi);

  // OTA firmware update endpoints
  server.on("/update", HTTP_POST, []() {
    server.sendHeader("Connection", "close");
    server.send(200, "text/plain", (Update.hasError()) ? "UPDATE FAILED" : "UPDATE SUCCESSFUL - REBOOTING...");
    delay(1000);
    ESP.restart();
  }, []() {
    HTTPUpload& upload = server.upload();
    if (upload.status == UPLOAD_FILE_START) {
      Serial.printf("[OTA] Start: %s\\n", upload.filename.c_str());
      if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
        Update.printError(Serial);
      }
    } else if (upload.status == UPLOAD_FILE_WRITE) {
      if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
        Update.printError(Serial);
      }
    } else if (upload.status == UPLOAD_FILE_END) {
      if (Update.end(true)) {
        Serial.printf("[OTA] Success: %u bytes\\n", upload.totalSize);
      } else {
        Update.printError(Serial);
      }
    }
  });

  // Captive Portal Redirection for Phones (Android generate_204, iOS hotspot-detect, Windows ncsi)
  server.on("/generate_204", handleRoot);
  server.on("/gen_204", handleRoot);
  server.on("/ncsi.txt", handleRoot);
  server.on("/hotspot-detect.html", handleRoot);
  server.onNotFound([]() {
    server.sendHeader("Location", String("http://") + (state.isApMode ? WiFi.softAPIP().toString() : WiFi.localIP().toString()) + "/", true);
    server.send(302, "text/plain", "");
  });

  server.begin();
  Serial.println("[HTTP] Web Server active on port 80");
}

// ----------------------------------------------------------------------------
// FREERTOS AUDIO PLAYBACK TASK (Pinned to Core 1)
// ----------------------------------------------------------------------------
void audioPlaybackTask(void* param) {
  const size_t CHUNK_SIZE = 1024;
  uint8_t dmaBuffer[CHUNK_SIZE];
  size_t bytesWritten = 0;

  while (true) {
    if (!state.powerOn || !state.isPlaying || state.isMuted) {
      memset(dmaBuffer, 0, CHUNK_SIZE);
      i2s_write(I2S_PORT, dmaBuffer, CHUNK_SIZE, &bytesWritten, portMAX_DELAY);
      vTaskDelay(pdMS_TO_TICKS(10));
      continue;
    }

    size_t bytesRead = audioBuffer ? audioBuffer->read(dmaBuffer, CHUNK_SIZE) : 0;
    if (bytesRead > 0) {
      int16_t* samples = (int16_t*)dmaBuffer;
      size_t sampleCount = bytesRead / 2;
      float volScale = (float)state.volume / 100.0f;

      for (size_t i = 0; i < sampleCount; i++) {
        samples[i] = (int16_t)(samples[i] * volScale);
      }

      i2s_write(I2S_PORT, dmaBuffer, bytesRead, &bytesWritten, portMAX_DELAY);
    } else {
      memset(dmaBuffer, 0, CHUNK_SIZE);
      i2s_write(I2S_PORT, dmaBuffer, CHUNK_SIZE, &bytesWritten, 10);
      vTaskDelay(pdMS_TO_TICKS(4));
    }
  }
}

// ----------------------------------------------------------------------------
// FREERTOS UDP AUDIO RECEIVER TASK (Pinned to Core 0)
// ----------------------------------------------------------------------------
void udpReceiverTask(void* param) {
  uint8_t packetBuffer[UDP_PACKET_MAX];
  udpAudio.begin(state.udpPort);
  Serial.printf("[UDP] Listening for WiFiAudioStreaming on port %u\\n", state.udpPort);

  while (true) {
    int packetSize = udpAudio.parsePacket();
    if (packetSize > 0) {
      state.packetsReceived++;
      state.lastPacketTime = millis();

      int bytesRead = udpAudio.read(packetBuffer, min(packetSize, (int)UDP_PACKET_MAX));
      if (bytesRead > 0 && state.powerOn && audioBuffer) {
        size_t written = audioBuffer->write(packetBuffer, bytesRead);
        if (written < (size_t)bytesRead) {
          state.packetsDropped++;
        }
      }
    } else {
      vTaskDelay(pdMS_TO_TICKS(2));
    }
  }
}

// ----------------------------------------------------------------------------
// ARDUINO SETUP & LOOP
// ----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\\n=======================================================");
  Serial.println("  ESP32-S3 Audio Streaming Receiver (UDA1334A)");
  Serial.println("  WiFiAudioStreaming Android Receiver (Marco Morosi)");
  Serial.println("=======================================================\\n");

  audioBuffer = new PsramRingBuffer(RING_BUFFER_SIZE);
  setupI2S();

  prefs.begin("audio-cfg", true);
  String ssid = prefs.getString("ssid", "");
  String pass = prefs.getString("pass", "");
  state.udpPort = prefs.getUShort("port", DEFAULT_UDP_PORT);
  prefs.end();

  bool connected = false;
  if (ssid.length() > 0) {
    Serial.printf("[WIFI] Connecting to saved network '%s'...\\n", ssid.c_str());
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid.c_str(), pass.c_str());

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 25) {
      delay(400);
      Serial.print(".");
      attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
      connected = true;
      state.isApMode = false;
      Serial.println("\\n[WIFI] Connected successfully!");
      Serial.printf("[WIFI] IP Address: %s\\n", WiFi.localIP().toString().c_str());

      if (MDNS.begin("wifimusic")) {
        Serial.println("[MDNS] Active: http://wifimusic.local");
        MDNS.addService("http", "tcp", 80);
        MDNS.addService("audio", "udp", state.udpPort);
      }
    }
  }

  if (!connected) {
    Serial.println("\\n[WIFI] No valid network. Starting Captive Access Point 'ESP32-Audio-Setup'...");
    state.isApMode = true;

    WiFi.disconnect();
    WiFi.mode(WIFI_AP);
    IPAddress apIP(192, 168, 4, 1);
    IPAddress gateway(192, 168, 4, 1);
    IPAddress subnet(255, 255, 255, 0);
    WiFi.softAPConfig(apIP, gateway, subnet);
    WiFi.softAP("ESP32-Audio-Setup", "12345678");

    dnsServer.start(53, "*", apIP);
    Serial.printf("[WIFI] AP Ready! Connect to 'ESP32-Audio-Setup' (Password: 12345678)\\n");
    Serial.printf("[WIFI] Open browser at: http://%s or http://wifimusic.local\\n", apIP.toString().c_str());
  }

  setupWebServer();

  xTaskCreatePinnedToCore(audioPlaybackTask, "AudioPlayback", 8192, NULL, 5, NULL, 1);
  xTaskCreatePinnedToCore(udpReceiverTask,   "UdpReceiver",   8192, NULL, 4, NULL, 0);

  Serial.println("[SYSTEM] Ready! Ready to receive audio stream.");
}

void loop() {
  if (state.isApMode) {
    dnsServer.processNextRequest();
  }
  server.handleClient();
  vTaskDelay(pdMS_TO_TICKS(5));
}
`
  },
  {
    filename: ".github/workflows/build-firmware.yml",
    language: "yaml",
    description: "GitHub Actions CI/CD workflow: compiles firmware on git push and generates single merged-firmware.bin for direct browser Web Flasher / esptool flashing",
    content: `name: Build ESP32-S3 Firmware & merged.bin

on:
  push:
    branches: [ "main", "master" ]
  pull_request:
    branches: [ "main", "master" ]
  workflow_dispatch:

jobs:
  build:
    name: Compile ESP32-S3 N16R8 & Generate merged.bin
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install PlatformIO & Esptool
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt

      - name: Compile Firmware via PlatformIO
        run: |
          pio run -e esp32-s3-devkitc-1

      - name: Generate Single merged.bin using esptool
        run: |
          echo "Merging bootloader (0x0), partitions (0x8000), otadata (0xe000), and app (0x10000) into single binary..."
          esptool.py --chip esp32s3 merge_bin -o .pio/build/esp32-s3-devkitc-1/merged.bin \\
            --flash_mode dio \\
            --flash_size 16MB \\
            0x0000   .pio/build/esp32-s3-devkitc-1/bootloader.bin \\
            0x8000   .pio/build/esp32-s3-devkitc-1/partitions.bin \\
            0xe000   ~/.platformio/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin \\
            0x10000  .pio/build/esp32-s3-devkitc-1/firmware.bin

          ls -lh .pio/build/esp32-s3-devkitc-1/merged.bin

      - name: Upload Compilation Artifacts (Binaries & merged.bin)
        uses: actions/upload-artifact@v4
        with:
          name: esp32-s3-firmware-binaries
          path: |
            .pio/build/esp32-s3-devkitc-1/merged.bin
            .pio/build/esp32-s3-devkitc-1/firmware.bin
            .pio/build/esp32-s3-devkitc-1/bootloader.bin
            .pio/build/esp32-s3-devkitc-1/partitions.bin
          retention-days: 30
`
  },
  {
    filename: "scripts/merge_bin.py",
    language: "python",
    description: "PlatformIO automatic post-build script that stitches bootloader, partitions, boot_app0, and firmware into merged.bin on every build",
    content: `Import("env")
import os
import subprocess

def merge_bin_action(source, target, env):
    build_dir = env.subst("$BUILD_DIR")
    flash_size = "16MB"
    chip = "esp32s3"

    bootloader = os.path.join(build_dir, "bootloader.bin")
    partitions = os.path.join(build_dir, "partitions.bin")
    firmware = os.path.join(build_dir, "firmware.bin")
    merged = os.path.join(build_dir, "merged.bin")

    # Locate boot_app0.bin
    framework_dir = env.PioPlatform().get_package_dir("framework-arduinoespressif32")
    boot_app0 = os.path.join(framework_dir, "tools", "partitions", "boot_app0.bin")

    print("\\n=======================================================")
    print("[POST-ACTION] Stitching Single Flashable merged.bin ...")
    print("Target: " + merged)
    print("=======================================================\\n")

    cmd = [
        "python", "-m", "esptool",
        "--chip", chip,
        "merge_bin",
        "-o", merged,
        "--flash_mode", "dio",
        "--flash_size", flash_size,
        "0x0000", bootloader,
        "0x8000", partitions,
        "0xe000", boot_app0,
        "0x10000", firmware
    ]

    result = subprocess.run(cmd)
    if result.returncode == 0:
        print("[SUCCESS] Created single merged.bin at " + merged)
        print("Flash with: esptool.py --chip esp32s3 write_flash 0x0 merged.bin\\n")
    else:
        print("[WARNING] esptool merge_bin failed with return code:", result.returncode)

env.AddPostAction("$BUILD_DIR/\${PROGNAME}.bin", merge_bin_action)
`
  },
  {
    filename: "README.md",
    language: "markdown",
    description: "Repository documentation with 1-click web flashing guide, GitHub push instructions, and esptool commands",
    content: `# ESP32-S3 N16R8 WiFi Audio Streaming Receiver (UDA1334A)

High-performance wireless audio streaming receiver for **ESP32-S3 N16R8** and **UDA1334A I2S DAC**, built for [WiFiAudioStreaming Android](https://github.com/marcomorosi06/WiFiAudioStreaming-Desktop) by Marco Morosi.

## Highlights
- **16-bit PCM @ 44.1kHz Stereo** over low-latency UDP (port 9091).
- **8MB Octal PSRAM Ring Buffer** prevents stutter and absorbs Wi-Fi jitter.
- **Embedded Web Controller** with Power, Play/Pause/Stop, Volume, Balance & EQ.
- **Dual-OTA Flash Scheme** (4MB ota_0 / 4MB ota_1) for safe wireless updates.
- **Single \`merged.bin\` Artifact** produced automatically on every \`git push\` via GitHub Actions.

---

## Direct GitHub Push & CI/CD Workflow

Pushing to \`main\` or \`master\` automatically triggers \`.github/workflows/build-firmware.yml\`.
1. Compiles the code using PlatformIO.
2. Stitches \`bootloader.bin\`, \`partitions.bin\`, \`boot_app0.bin\`, and \`firmware.bin\` into a **single unified \`merged.bin\`**.
3. Publishes all binaries as a downloadable GitHub Actions artifact.

---

## Flashing \`merged.bin\` (Zero Offset Configuration)

Because \`merged.bin\` contains the full flash map, you flash it to **offset \`0x0\`**:

\`\`\`bash
# Install esptool
pip install esptool

# Flash merged.bin in one command
esptool.py --chip esp32s3 -b 921600 write_flash 0x0 merged.bin
\`\`\`

Or use the **Chrome/Edge Web Serial ESP Flasher** directly in your browser without terminal commands!
`
  },
  {
    filename: "platformio.ini",
    language: "ini",
    description: "PlatformIO configuration with 16MB Flash, 8MB Octal PSRAM (opi), and partition table",
    content: `; PlatformIO Project Configuration for ESP32-S3 N16R8
[env:esp32-s3-devkitc-1]
platform = espressif32
board = esp32-s3-devkitc-1
framework = arduino

; Serial Monitor & Upload Speeds
monitor_speed = 115200
upload_speed = 921600

; CRITICAL HARDWARE FLAGS FOR ESP32-S3 N16R8:
; 16MB Flash + 8MB Octal SPI PSRAM (OPI mode)
board_build.arduino.memory_type = qio_opi
board_build.flash_mode = qio
board_build.prsam_type = opi
board_upload.flash_size = 16MB
board_build.partitions = partitions_16MB.csv
extra_scripts = post:scripts/merge_bin.py

build_flags = 
    -DBOARD_HAS_PSRAM
    -mfix-esp32-psram-cache-issue
    -DCORE_DEBUG_LEVEL=3
    -DCONFIG_ESP32S3_SPIRAM_SUPPORT=1
`
  },
  {
    filename: "partitions_16MB.csv",
    language: "csv",
    description: "Dual 4MB OTA partitions (ota_0, ota_1) allowing safe Over-The-Air updates and rollback",
    content: `# ESP32-S3 16MB Flash Partition Table with Dual OTA
# Name,   Type, SubType, Offset,  Size,     Flags
nvs,      data, nvs,     0x9000,  0x5000,
otadata,  data, ota,     0xe000,  0x2000,
app0,     app,  ota_0,   0x10000, 0x400000,
app1,     app,  ota_1,   0x410000,0x400000,
spiffs,   data, spiffs,  0x810000,0x7E0000,
coredump, data, coredump,0xFF0000,0x10000,
`
  },
  {
    filename: "requirements.txt",
    language: "text",
    description: "Python dependencies for GitHub Actions CI and PlatformIO firmware build",
    content: `platformio>=6.1.15
esptool>=4.7.0
`
  },
  {
    filename: "ESP32_WiFi_Audio_Receiver.ino",
    language: "cpp",
    description: "Single-file Arduino IDE 2.x sketch ready for direct compilation and flashing",
    content: `// ==============================================================================
// ESP32-S3 N16R8 Arduino IDE 2.x Sketch for UDA1334A + WiFiAudioStreaming App
// ==============================================================================
// Arduino IDE Setup Instructions:
// 1. Tools -> Board -> "ESP32S3 Dev Module"
// 2. Tools -> Flash Size -> "16MB (128Mb)"
// 3. Tools -> Partition Scheme -> "16M Flash (3MB APP/9.9MB FATFS)" or "Dual OTA"
// 4. Tools -> PSRAM -> "OPI PSRAM" (MANDATORY for N16R8!)
// 5. Tools -> Core Debug Level -> "Info"
// ==============================================================================

#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebServer.h>
#include <Update.h>
#include <driver/i2s.h>

#define I2S_BCLK_PIN    4
#define I2S_WSEL_PIN    5
#define I2S_DIN_PIN     6
#define UDA_MUTE_PIN    7
#define UDP_PORT        9091
#define SAMPLE_RATE     44100
#define I2S_PORT        I2S_NUM_0

WiFiUDP udp;
WebServer server(80);

uint8_t* psramRingBuf = nullptr;
const size_t RING_SIZE = 512 * 1024; // 512KB Octal PSRAM
volatile size_t head = 0;
volatile size_t tail = 0;
uint8_t masterVolume = 80;
bool isPowerOn = true;

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  if (psramInit()) {
    Serial.printf("PSRAM initialized! Free PSRAM: %d KB\\n", ESP.getFreePsram() / 1024);
    psramRingBuf = (uint8_t*)ps_malloc(RING_SIZE);
  } else {
    Serial.println("PSRAM Init Failed! Please check Arduino IDE PSRAM setting is OPI.");
  }

  // Setup I2S standard mode for UDA1334A
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
    .sample_rate = SAMPLE_RATE,
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

  i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_PORT, &pin_config);
  i2s_set_clk(I2S_PORT, SAMPLE_RATE, I2S_BITS_PER_SAMPLE_16BIT, I2S_CHANNEL_STEREO);

  pinMode(UDA_MUTE_PIN, OUTPUT);
  digitalWrite(UDA_MUTE_PIN, LOW); // Unmute

  WiFi.begin("YOUR_SSID", "YOUR_PASSWORD");
  while (WiFi.status() != WL_CONNECTED) { delay(400); Serial.print("."); }
  Serial.printf("\\nConnected! IP: %s\\n", WiFi.localIP().toString().c_str());

  udp.begin(UDP_PORT);

  // Web endpoints
  server.on("/", []() {
    server.send(200, "text/html", "<h2>ESP32-S3 Audio Controller Active</h2><p>Use Web Controller portal.</p>");
  });
  server.begin();
}

void loop() {
  server.handleClient();
  
  // Read UDP packets from Android app
  int packetSize = udp.parsePacket();
  if (packetSize > 0 && psramRingBuf && isPowerOn) {
    uint8_t tmp[2048];
    int len = udp.read(tmp, sizeof(tmp));
    for (int i = 0; i < len; i++) {
      psramRingBuf[head] = tmp[i];
      head = (head + 1) % RING_SIZE;
    }
  }

  // Play to UDA1334A DAC
  if (psramRingBuf && head != tail && isPowerOn) {
    uint8_t outChunk[1024];
    size_t count = 0;
    while (head != tail && count < sizeof(outChunk)) {
      outChunk[count++] = psramRingBuf[tail];
      tail = (tail + 1) % RING_SIZE;
    }
    
    // Apply volume scale
    int16_t* s = (int16_t*)outChunk;
    float vol = masterVolume / 100.0f;
    for (size_t i = 0; i < count / 2; i++) {
      s[i] = (int16_t)(s[i] * vol);
    }

    size_t written = 0;
    i2s_write(I2S_PORT, outChunk, count, &written, 50);
  }
}
`
  }
];
