/**
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
    Serial.printf("[I2S] Driver install error: %d\n", err);
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
  json += "\"power\":" + String(state.powerOn ? "true" : "false") + ",";
  json += "\"playing\":" + String(state.isPlaying ? "true" : "false") + ",";
  json += "\"muted\":" + String(state.isMuted ? "true" : "false") + ",";
  json += "\"volume\":" + String(state.volume) + ",";
  json += "\"udpPort\":" + String(state.udpPort) + ",";
  json += "\"bufferPercent\":" + String(audioBuffer ? (audioBuffer->getFillRatio() * 100.0f) : 0.0f, 1) + ",";
  json += "\"packetsReceived\":" + String(state.packetsReceived) + ",";
  json += "\"packetsDropped\":" + String(state.packetsDropped) + ",";
  json += "\"isAp\":" + String(state.isApMode ? "true" : "false") + ",";
  json += "\"ip\":\"" + (state.isApMode ? WiFi.softAPIP().toString() : WiFi.localIP().toString()) + "\",";
  json += "\"freePsram\":" + String(ESP.getFreePsram()) + ",";
  json += "\"freeHeap\":" + String(ESP.getFreeHeap()) + "}";
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
      }
    }
    server.send(200, "application/json", "{\"success\":true}");
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

  // Captive Portal Redirection for Phones (Android generate_204, iOS hotspot-detect, Windows ncsi)
  server.on("/generate_204", handleRoot);
  server.on("/gen_204", handleRoot);
  server.on("/ncsi.txt", handleRoot);
  server.on("/hotspot-detect.html", handleRoot);
  server.onNotFound([]() {
    // If client was trying to access any outside site, redirect to our captive portal
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
      // Digital software volume attenuation
      int16_t* samples = (int16_t*)dmaBuffer;
      size_t sampleCount = bytesRead / 2;
      float volScale = (float)state.volume / 100.0f;

      for (size_t i = 0; i < sampleCount; i++) {
        samples[i] = (int16_t)(samples[i] * volScale);
      }

      // Stream directly to UDA1334A DAC via DMA
      i2s_write(I2S_PORT, dmaBuffer, bytesRead, &bytesWritten, portMAX_DELAY);
    } else {
      // Output silence when underrun
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
  Serial.printf("[UDP] Listening for WiFiAudioStreaming on port %u\n", state.udpPort);

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
  Serial.println("\n=======================================================");
  Serial.println("  ESP32-S3 Audio Streaming Receiver (UDA1334A)");
  Serial.println("  WiFiAudioStreaming Android Receiver (Marco Morosi)");
  Serial.println("=======================================================\n");

  // 1. Initialize PSRAM Ring Buffer
  audioBuffer = new PsramRingBuffer(RING_BUFFER_SIZE);

  // 2. Initialize UDA1334A I2S Peripheral
  setupI2S();

  // 3. Load Wi-Fi Configuration
  prefs.begin("audio-cfg", true);
  String ssid = prefs.getString("ssid", "");
  String pass = prefs.getString("pass", "");
  state.udpPort = prefs.getUShort("port", DEFAULT_UDP_PORT);
  prefs.end();

  bool connected = false;
  if (ssid.length() > 0) {
    Serial.printf("[WIFI] Connecting to saved network '%s'...\n", ssid.c_str());
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
      Serial.println("\n[WIFI] Connected successfully!");
      Serial.printf("[WIFI] IP Address: %s\n", WiFi.localIP().toString().c_str());

      if (MDNS.begin("wifimusic")) {
        Serial.println("[MDNS] Active: http://wifimusic.local");
        MDNS.addService("http", "tcp", 80);
        MDNS.addService("audio", "udp", state.udpPort);
      }
    }
  }

  // 4. Start Fallback AP if not connected
  if (!connected) {
    Serial.println("\n[WIFI] No valid network. Starting Captive Access Point 'ESP32-Audio-Setup'...");
    state.isApMode = true;

    WiFi.disconnect();
    WiFi.mode(WIFI_AP);
    IPAddress apIP(192, 168, 4, 1);
    IPAddress gateway(192, 168, 4, 1);
    IPAddress subnet(255, 255, 255, 0);
    WiFi.softAPConfig(apIP, gateway, subnet);
    WiFi.softAP("ESP32-Audio-Setup", "12345678");

    // Start DNS Server on port 53 to redirect all domains to 192.168.4.1 (Captive Portal)
    dnsServer.start(53, "*", apIP);
    Serial.printf("[WIFI] AP Ready! Connect to 'ESP32-Audio-Setup' (Password: 12345678)\n");
    Serial.printf("[WIFI] Open browser at: http://%s or http://wifimusic.local\n", apIP.toString().c_str());
  }

  // 5. Start Web Server
  setupWebServer();

  // 6. Spawn FreeRTOS Tasks
  xTaskCreatePinnedToCore(audioPlaybackTask, "AudioPlayback", 8192, NULL, 5, NULL, 1); // Core 1
  xTaskCreatePinnedToCore(udpReceiverTask,   "UdpReceiver",   8192, NULL, 4, NULL, 0); // Core 0

  Serial.println("[SYSTEM] Ready! Ready to receive audio stream.");
}

void loop() {
  if (state.isApMode) {
    dnsServer.processNextRequest();
  }
  server.handleClient();
  vTaskDelay(pdMS_TO_TICKS(5));
}
