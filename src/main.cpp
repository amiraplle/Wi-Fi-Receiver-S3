/**
 * ============================================================================
 * ESP32-S3 N16R8 WiFi Audio Streaming Receiver for UDA1334A DAC
 * Compatible with Marco Morosi's WiFiAudioStreaming Android App
 * ============================================================================
 * Board: ESP32-S3-DevKitC-1-N16R8 (16MB Flash, 8MB Octal PSRAM)
 * I2S DAC: UDA1334A Stereo DAC (Adafruit / CJMCU breakout)
 * Protocol: UDP Raw 16-bit PCM Audio Stream (Port 9091) + HTTP Web Controller + OTA
 * ============================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <ESPmDNS.h>
#include <ESPAsyncWebServer.h>
#include <AsyncTCP.h>
#include <Update.h>
#include <Preferences.h>
#include <driver/i2s_std.h>
#include <esp_dsp.h>

// ----------------------------------------------------------------------------
// PIN CONFIGURATION FOR UDA1334A & ESP32-S3
// ----------------------------------------------------------------------------
// NOTE: UDA1334A features an integrated internal PLL, so MCLK is NOT required!
#define I2S_BCLK_PIN      GPIO_NUM_4   // UDA1334A BCLK (Bit Clock)
#define I2S_WSEL_PIN      GPIO_NUM_5   // UDA1334A WSEL (Word Select / LRCK)
#define I2S_DIN_PIN       GPIO_NUM_6   // UDA1334A DIN  (Data In)
#define UDA_MUTE_PIN      GPIO_NUM_7   // UDA1334A MUTE (Active High/Low selectable)
#define STATUS_LED_PIN    GPIO_NUM_48  // ESP32-S3 onboard RGB / Status LED

// ----------------------------------------------------------------------------
// AUDIO & NETWORK PARAMETERS
// ----------------------------------------------------------------------------
#define UDP_STREAM_PORT   9091         // Default port for WiFiAudioStreaming
#define SAMPLE_RATE       44100        // 44.1 kHz default (also supports 48 kHz)
#define BITS_PER_SAMPLE   16           // 16-bit PCM
#define NUM_CHANNELS      2            // Stereo (Left + Right)
#define RING_BUFFER_SIZE  (512 * 1024) // 512 KB in Octal PSRAM (~3 seconds buffer!)
#define UDP_PACKET_BUFFER 2048

// ----------------------------------------------------------------------------
// CIRCULAR RING BUFFER (PSRAM)
// ----------------------------------------------------------------------------
class PsramRingBuffer {
private:
  uint8_t* buffer;
  size_t capacity;
  volatile size_t head;
  volatile size_t tail;
  portMUX_TYPE spinlock = portMUX_INITIALIZER_UNLOCKED;

public:
  PsramRingBuffer(size_t size) : capacity(size), head(0), tail(0) {
    // Allocate in high-speed 8MB Octal PSRAM
    buffer = (uint8_t*)ps_malloc(capacity);
    if (!buffer) {
      Serial.println("[ERROR] Failed to allocate Ring Buffer in PSRAM!");
    } else {
      Serial.printf("[INIT] Allocated %d KB Ring Buffer in Octal PSRAM\n", capacity / 1024);
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
AsyncWebServer webServer(80);
AsyncWebSocket ws("/ws");
Preferences prefs;
i2s_chan_handle_t tx_chan = nullptr;

struct {
  bool powerOn = true;
  bool isPlaying = true;
  bool isMuted = false;
  uint8_t volume = 80;        // 0 - 100
  int8_t balance = 0;         // -50 (L) to +50 (R)
  int8_t bassGain = 0;        // dB
  int8_t trebleGain = 0;      // dB
  uint32_t packetsReceived = 0;
  uint32_t packetsDropped = 0;
  uint32_t lastPacketTime = 0;
} receiverState;

// ----------------------------------------------------------------------------
// I2S INITIALIZATION (ESP-IDF 5.x / Arduino ESP32 3.x API)
// ----------------------------------------------------------------------------
void setupI2S() {
  i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
  chan_cfg.dma_desc_num = 8;
  chan_cfg.dma_frame_num = 512;
  ESP_ERROR_CHECK(i2s_new_channel(&chan_cfg, &tx_chan, NULL));

  i2s_std_config_t std_cfg = {
    .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(SAMPLE_RATE),
    .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO),
    .gpio_cfg = {
      .mclk = I2S_GPIO_UNUSED,   // Not needed by UDA1334A
      .bclk = (gpio_num_t)I2S_BCLK_PIN,
      .ws   = (gpio_num_t)I2S_WSEL_PIN,
      .dout = (gpio_num_t)I2S_DIN_PIN,
      .din  = I2S_GPIO_UNUSED,
      .invert_flags = {
        .mclk_inv = false,
        .bclk_inv = false,
        .ws_inv   = false,
      },
    },
  };

  ESP_ERROR_CHECK(i2s_channel_init_std_mode(tx_chan, &std_cfg));
  ESP_ERROR_CHECK(i2s_channel_enable(tx_chan));

  pinMode(UDA_MUTE_PIN, OUTPUT);
  digitalWrite(UDA_MUTE_PIN, LOW); // Unmute UDA1334A
  Serial.println("[INIT] UDA1334A I2S driver initialized successfully.");
}

// ----------------------------------------------------------------------------
// FREERTOS AUDIO PLAYBACK TASK (Pinned to Core 1)
// ----------------------------------------------------------------------------
void audioPlaybackTask(void* param) {
  const size_t CHUNK_SIZE = 1024;
  uint8_t dmaBuffer[CHUNK_SIZE];
  size_t bytesWritten = 0;

  while (true) {
    if (!receiverState.powerOn || !receiverState.isPlaying || receiverState.isMuted) {
      // Clear DMA with zeros to prevent hum/clicks
      memset(dmaBuffer, 0, CHUNK_SIZE);
      i2s_channel_write(tx_chan, dmaBuffer, CHUNK_SIZE, &bytesWritten, portMAX_DELAY);
      vTaskDelay(pdMS_TO_TICKS(10));
      continue;
    }

    // Read from PSRAM ring buffer
    size_t bytesRead = audioBuffer->read(dmaBuffer, CHUNK_SIZE);
    if (bytesRead > 0) {
      // Apply software digital volume attenuation
      int16_t* samples = (int16_t*)dmaBuffer;
      size_t sampleCount = bytesRead / 2;
      float volScale = (float)receiverState.volume / 100.0f;

      for (size_t i = 0; i < sampleCount; i += 2) {
        // Left channel
        samples[i] = (int16_t)(samples[i] * volScale);
        // Right channel
        samples[i + 1] = (int16_t)(samples[i + 1] * volScale);
      }

      // Output to UDA1334A DAC via DMA
      i2s_channel_write(tx_chan, dmaBuffer, bytesRead, &bytesWritten, portMAX_DELAY);
    } else {
      // Buffer underrun: output silence to avoid buzzing
      memset(dmaBuffer, 0, CHUNK_SIZE);
      i2s_channel_write(tx_chan, dmaBuffer, CHUNK_SIZE, &bytesWritten, 10);
      vTaskDelay(pdMS_TO_TICKS(5));
    }
  }
}

// ----------------------------------------------------------------------------
// FREERTOS UDP AUDIO RECEIVER TASK (Pinned to Core 0)
// ----------------------------------------------------------------------------
void udpReceiverTask(void* param) {
  uint8_t packetBuffer[UDP_PACKET_BUFFER];
  udpAudio.begin(UDP_STREAM_PORT);
  Serial.printf("[INIT] UDP Audio listener active on port %d\n", UDP_STREAM_PORT);

  while (true) {
    int packetSize = udpAudio.parsePacket();
    if (packetSize > 0) {
      receiverState.packetsReceived++;
      receiverState.lastPacketTime = millis();

      int bytesRead = udpAudio.read(packetBuffer, min(packetSize, (int)UDP_PACKET_BUFFER));
      if (bytesRead > 0 && receiverState.powerOn) {
        size_t written = audioBuffer->write(packetBuffer, bytesRead);
        if (written < (size_t)bytesRead) {
          receiverState.packetsDropped++;
        }
      }
    } else {
      vTaskDelay(pdMS_TO_TICKS(2));
    }
  }
}

// ----------------------------------------------------------------------------
// WEB SERVER & OTA ROUTES
// ----------------------------------------------------------------------------
void setupWebServer() {
  // REST API status
  webServer.on("/api/status", HTTP_GET, [](AsyncWebServerRequest *request) {
    String json = "{";
    json += "\"power\":" + String(receiverState.powerOn ? "true" : "false") + ",";
    json += "\"playing\":" + String(receiverState.isPlaying ? "true" : "false") + ",";
    json += "\"muted\":" + String(receiverState.isMuted ? "true" : "false") + ",";
    json += "\"volume\":" + String(receiverState.volume) + ",";
    json += "\"bufferPercent\":" + String(audioBuffer->getFillRatio() * 100.0f, 1) + ",";
    json += "\"packetsReceived\":" + String(receiverState.packetsReceived) + ",";
    json += "\"packetsDropped\":" + String(receiverState.packetsDropped) + ",";
    json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
    json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
    json += "\"freePsram\":" + String(ESP.getFreePsram()) + ",";
    json += "\"freeHeap\":" + String(ESP.getFreeHeap()) + "}";
    request->send(200, "application/json", json);
  });

  // REST API controls
  webServer.on("/api/power", HTTP_POST, [](AsyncWebServerRequest *request) {
    if (request->hasParam("state", true)) {
      receiverState.powerOn = (request->getParam("state", true)->value() == "1");
      digitalWrite(UDA_MUTE_PIN, receiverState.powerOn ? LOW : HIGH);
    }
    request->send(200, "application/json", "{\"success\":true}");
  });

  webServer.on("/api/volume", HTTP_POST, [](AsyncWebServerRequest *request) {
    if (request->hasParam("val", true)) {
      receiverState.volume = constrain(request->getParam("val", true)->value().toInt(), 0, 100);
    }
    request->send(200, "application/json", "{\"success\":true}");
  });

  webServer.on("/api/playback", HTTP_POST, [](AsyncWebServerRequest *request) {
    if (request->hasParam("cmd", true)) {
      String cmd = request->getParam("cmd", true)->value();
      if (cmd == "play") receiverState.isPlaying = true;
      else if (cmd == "pause") receiverState.isPlaying = false;
      else if (cmd == "stop") { receiverState.isPlaying = false; audioBuffer->flush(); }
      else if (cmd == "mute") receiverState.isMuted = !receiverState.isMuted;
    }
    request->send(200, "application/json", "{\"success\":true}");
  });

  // OTA Firmware Update Handler
  webServer.on("/update", HTTP_POST, [](AsyncWebServerRequest *request) {
    bool shouldReboot = !Update.hasError();
    AsyncWebServerResponse *response = request->beginResponse(200, "text/plain", shouldReboot ? "OK" : "FAIL");
    response->addHeader("Connection", "close");
    request->send(response);
    if (shouldReboot) {
      delay(500);
      ESP.restart();
    }
  }, [](AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final) {
    if (!index) {
      Serial.printf("[OTA] Update Start: %s\n", filename.c_str());
      if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
        Update.printError(Serial);
      }
    }
    if (!Update.hasError()) {
      if (Update.write(data, len) != len) {
        Update.printError(Serial);
      }
    }
    if (final) {
      if (Update.end(true)) {
        Serial.printf("[OTA] Update Success: %u bytes written\n", index + len);
      } else {
        Update.printError(Serial);
      }
    }
  });

  webServer.begin();
  Serial.println("[INIT] HTTP Web Controller & OTA Server running on port 80");
}

// ----------------------------------------------------------------------------
// ARDUINO MAIN SETUP & LOOP
// ----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("==================================================");
  Serial.println("ESP32-S3 WiFi Audio Receiver (WiFiAudioStreaming)");
  Serial.println("Hardware: ESP32-S3 N16R8 (16MB Flash, 8MB PSRAM)");
  Serial.println("DAC: UDA1334A Stereo I2S");
  Serial.println("==================================================");

  // Initialize Octal PSRAM ring buffer
  audioBuffer = new PsramRingBuffer(RING_BUFFER_SIZE);

  // Initialize I2S peripheral for UDA1334A
  setupI2S();

  // Load WiFi credentials from NVS
  prefs.begin("wifi-config", false);
  String ssid = prefs.getString("ssid", "YOUR_WIFI_SSID");
  String pass = prefs.getString("pass", "YOUR_WIFI_PASSWORD");
  prefs.end();

  // Connect to Local WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), pass.c_str());
  Serial.print("[WIFI] Connecting to ");
  Serial.println(ssid);

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 20) {
    delay(500);
    Serial.print(".");
    tries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] Connected!");
    Serial.printf("[WIFI] IP Address: %s\n", WiFi.localIP().toString().c_str());

    // Register zero-config .local domain: http://wifimusic.local
    if (MDNS.begin("wifimusic")) {
      Serial.println("[MDNS] Active! Access web controller at: http://wifimusic.local");
      MDNS.addService("http", "tcp", 80);
      MDNS.addService("audio", "udp", UDP_STREAM_PORT);
    }
  } else {
    Serial.println("\n[WIFI] Connection failed. Starting Fallback AP 'ESP32-Audio-Setup'...");
    WiFi.mode(WIFI_AP);
    WiFi.softAP("ESP32-Audio-Setup", "12345678");
    Serial.printf("[WIFI] AP IP: %s\n", WiFi.softAPIP().toString().c_str());
  }

  // Setup Web Controller and OTA endpoints
  setupWebServer();

  // Spawn FreeRTOS pinned tasks
  xTaskCreatePinnedToCore(audioPlaybackTask, "AudioPlayback", 8192, NULL, 5, NULL, 1); // Core 1
  xTaskCreatePinnedToCore(udpReceiverTask,   "UdpReceiver",   8192, NULL, 4, NULL, 0); // Core 0

  Serial.println("[SYSTEM] Ready! Stream phone audio from WiFiAudioStreaming app.");
}

void loop() {
  vTaskDelay(pdMS_TO_TICKS(1000));
}
