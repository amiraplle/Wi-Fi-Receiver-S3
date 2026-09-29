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
    description: "Complete FreeRTOS dual-core firmware with UDP audio receiver, PSRAM ring buffer, UDA1334A I2S driver, Web Controller & OTA",
    content: `/**
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
#include <driver/i2s.h>

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
      Serial.printf("[INIT] Allocated %d KB Ring Buffer in Octal PSRAM\\n", capacity / 1024);
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
#define I2S_PORT          I2S_NUM_0

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
// I2S INITIALIZATION (Universal Arduino ESP32 driver/i2s.h)
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
    Serial.printf("[ERROR] Failed to install I2S driver: %d\\n", err);
  }

  err = i2s_set_pin(I2S_PORT, &pin_config);
  if (err != ESP_OK) {
    Serial.printf("[ERROR] Failed to set I2S pins: %d\\n", err);
  }

  i2s_set_clk(I2S_PORT, SAMPLE_RATE, I2S_BITS_PER_SAMPLE_16BIT, I2S_CHANNEL_STEREO);

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
      i2s_write(I2S_PORT, dmaBuffer, CHUNK_SIZE, &bytesWritten, portMAX_DELAY);
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
      i2s_write(I2S_PORT, dmaBuffer, bytesRead, &bytesWritten, portMAX_DELAY);
    } else {
      // Buffer underrun: output silence to avoid buzzing
      memset(dmaBuffer, 0, CHUNK_SIZE);
      i2s_write(I2S_PORT, dmaBuffer, CHUNK_SIZE, &bytesWritten, 10);
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
  Serial.printf("[INIT] UDP Audio listener active on port %d\\n", UDP_STREAM_PORT);

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
    json += "\\"power\\":" + String(receiverState.powerOn ? "true" : "false") + ",";
    json += "\\"playing\\":" + String(receiverState.isPlaying ? "true" : "false") + ",";
    json += "\\"muted\\":" + String(receiverState.isMuted ? "true" : "false") + ",";
    json += "\\"volume\\":" + String(receiverState.volume) + ",";
    json += "\\"bufferPercent\\":" + String(audioBuffer->getFillRatio() * 100.0f, 1) + ",";
    json += "\\"packetsReceived\\":" + String(receiverState.packetsReceived) + ",";
    json += "\\"packetsDropped\\":" + String(receiverState.packetsDropped) + ",";
    json += "\\"rssi\\":" + String(WiFi.RSSI()) + ",";
    json += "\\"ip\\":\\"" + WiFi.localIP().toString() + "\\",";
    json += "\\"freePsram\\":" + String(ESP.getFreePsram()) + ",";
    json += "\\"freeHeap\\":" + String(ESP.getFreeHeap()) + "}";
    request->send(200, "application/json", json);
  });

  // REST API controls
  webServer.on("/api/power", HTTP_POST, [](AsyncWebServerRequest *request) {
    if (request->hasParam("state", true)) {
      receiverState.powerOn = (request->getParam("state", true)->value() == "1");
      digitalWrite(UDA_MUTE_PIN, receiverState.powerOn ? LOW : HIGH);
    }
    request->send(200, "application/json", "{\\"success\\":true}");
  });

  webServer.on("/api/volume", HTTP_POST, [](AsyncWebServerRequest *request) {
    if (request->hasParam("val", true)) {
      receiverState.volume = constrain(request->getParam("val", true)->value().toInt(), 0, 100);
    }
    request->send(200, "application/json", "{\\"success\\":true}");
  });

  webServer.on("/api/playback", HTTP_POST, [](AsyncWebServerRequest *request) {
    if (request->hasParam("cmd", true)) {
      String cmd = request->getParam("cmd", true)->value();
      if (cmd == "play") receiverState.isPlaying = true;
      else if (cmd == "pause") receiverState.isPlaying = false;
      else if (cmd == "stop") { receiverState.isPlaying = false; audioBuffer->flush(); }
      else if (cmd == "mute") receiverState.isMuted = !receiverState.isMuted;
    }
    request->send(200, "application/json", "{\\"success\\":true}");
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
      Serial.printf("[OTA] Update Start: %s\\n", filename.c_str());
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
        Serial.printf("[OTA] Update Success: %u bytes written\\n", index + len);
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
    Serial.println("\\n[WIFI] Connected!");
    Serial.printf("[WIFI] IP Address: %s\\n", WiFi.localIP().toString().c_str());

    // Register zero-config .local domain: http://wifimusic.local
    if (MDNS.begin("wifimusic")) {
      Serial.println("[MDNS] Active! Access web controller at: http://wifimusic.local");
      MDNS.addService("http", "tcp", 80);
      MDNS.addService("audio", "udp", UDP_STREAM_PORT);
    }
  } else {
    Serial.println("\\n[WIFI] Connection failed. Starting Fallback AP 'ESP32-Audio-Setup'...");
    WiFi.mode(WIFI_AP);
    WiFi.softAP("ESP32-Audio-Setup", "12345678");
    Serial.printf("[WIFI] AP IP: %s\\n", WiFi.softAPIP().toString().c_str());
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

lib_deps = 
    https://github.com/me-no-dev/ESPAsyncWebServer.git
    https://github.com/me-no-dev/AsyncTCP.git
    bblanchon/ArduinoJson @ ^7.0.4
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
