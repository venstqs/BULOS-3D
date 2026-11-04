/*
 * Bulos 3D bench node: the low-cost, buildable prototype.
 * ---------------------------------------------------------------------------
 * Proves the closed loop with parts a student team can buy locally:
 *   turbidity + TDS + temperature  ->  ESP32  ->  Wi-Fi  ->  Bulos 3D twin
 *   valve relay + status LEDs + buzzer, trips on its own with no connection.
 *
 * Board     : ESP32 DevKit v1, Arduino-ESP32 core 3.x
 * Libraries : OneWire, DallasTemperature (Arduino Library Manager).
 *             HTTPClient and WiFi come with the ESP32 core.
 * Wiring    : docs/bench-node.md
 *
 * Differences from the field design (firmware/bulos_edge_node):
 *   Wi-Fi + HTTP instead of LoRaWAN, so no gateway is needed on the bench.
 *   Fewer probes: readings it cannot make are simply left out, and the twin
 *   shows them as "not fitted".
 *   A short persistence time so the demo fits in a video.
 *
 * NOT YET FLASHED ON REAL HARDWARE. It has been checked against the server with
 * backend/tools/fake_node.py only. Calibrate before trusting any number.
 */
#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ---- edit these -----------------------------------------------------------
const char* WIFI_SSID  = "YOUR_WIFI";
const char* WIFI_PASS  = "YOUR_PASSWORD";
const char* SERVER     = "http://192.168.0.12:8000";   // PC running `npm run start:lan`
const char* NODE_KEY   = "";                           // only if BULOS_NODE_KEY is set on the server
const char* STATION_ID = "KS-03";                      // the water point this node takes over

const bool  HAS_TDS  = true;     // set false if that probe is not connected
const bool  HAS_TEMP = true;

// Turbidity calibration (see docs/bench-node.md): volts at the sensor in clear
// water, and the drop in volts for the "dirty" reference sample.
const float CLEAR_VOLTS  = 4.10;
const float DIRTY_VOLTS  = 2.80;
const float DIRTY_NTU    = 100.0;   // your reference sample
// ---------------------------------------------------------------------------

#define PIN_TURB     34   // through a 10k/20k divider: the sensor outputs up to ~4.5 V
#define PIN_TDS      33
#define PIN_ONEWIRE  4
#define PIN_RELAY    26   // HIGH = coil on = normally-closed valve OPEN
#define PIN_LED_G    18
#define PIN_LED_Y    19
#define PIN_LED_R    23
#define PIN_BUZZER   27

const uint32_t SAMPLE_MS      = 3000;
const uint32_t PERSISTENCE_MS = 15000;   // field design: 120 s. Short here for demos.
const float    SUSPECT_NTU    = 10.0;    // above baseline
const float    TRIP_NTU       = 25.0;    // above baseline
const float    TDS_JUMP       = 100.0;   // mg/L above baseline also counts

enum State { NORMAL, SUSPECT, TRIPPED, REMOTE_SHUT, PREEMPTIVE_SHUT };
const char* STATE_NAME[] = {"NORMAL", "SUSPECT", "TRIPPED", "REMOTE_SHUT", "PREEMPTIVE_SHUT"};

OneWire oneWire(PIN_ONEWIRE);
DallasTemperature ds18(&oneWire);

State state = NORMAL;
uint32_t suspectSince = 0, lastSample = 0;
float baseTurb = -1, baseTds = -1;        // learned from the first clean readings
int learned = 0;
float turb = 0, tds = 0, tempC = 25;

bool valveOpen() { return state == NORMAL || state == SUSPECT; }

void outputs() {
  digitalWrite(PIN_RELAY, valveOpen() ? HIGH : LOW);
  digitalWrite(PIN_LED_G, state == NORMAL);
  digitalWrite(PIN_LED_Y, state == SUSPECT);
  digitalWrite(PIN_LED_R, !valveOpen());
}

float medianMv(int pin) {
  int v[15];
  for (int i = 0; i < 15; i++) { v[i] = analogReadMilliVolts(pin); delay(3); }
  for (int i = 1; i < 15; i++) for (int j = i; j > 0 && v[j - 1] > v[j]; j--) { int t = v[j]; v[j] = v[j - 1]; v[j - 1] = t; }
  return v[7];
}

void sense() {
  float volts = medianMv(PIN_TURB) / 1000.0f * 1.5f;              // undo the 2/3 divider
  turb = (CLEAR_VOLTS - volts) / (CLEAR_VOLTS - DIRTY_VOLTS) * DIRTY_NTU;
  turb = max(0.1f, turb);
  if (HAS_TEMP) {
    ds18.requestTemperatures();
    float t = ds18.getTempCByIndex(0);
    if (t > -20 && t < 60) tempC = t;
  }
  if (HAS_TDS) {                                                   // DFRobot Gravity TDS formula
    float cv = (medianMv(PIN_TDS) / 1000.0f) / (1.0f + 0.02f * (tempC - 25.0f));
    tds = max(0.0f, (133.42f * cv * cv * cv - 255.86f * cv * cv + 857.39f * cv) * 0.5f);
  }
}

// Works with no connection at all: the safety decision never depends on the server.
void decide() {
  if (learned < 5) {                                               // first 15 s: learn clean water
    baseTurb = baseTurb < 0 ? turb : (baseTurb * learned + turb) / (learned + 1);
    baseTds  = baseTds  < 0 ? tds  : (baseTds  * learned + tds)  / (learned + 1);
    learned++;
    return;
  }
  if (!(state == NORMAL || state == SUSPECT)) return;              // stays closed until re-armed
  float excess = turb - baseTurb;
  bool tdsBad = HAS_TDS && (tds - baseTds) > TDS_JUMP;
  bool warn = excess > SUSPECT_NTU || tdsBad;
  bool bad  = excess > TRIP_NTU || tdsBad;
  if (!warn) { state = NORMAL; return; }
  if (state != SUSPECT) { state = SUSPECT; suspectSince = millis(); return; }
  if (bad && millis() - suspectSince >= PERSISTENCE_MS) {
    state = TRIPPED;
    tone(PIN_BUZZER, 2400, 1200);
    Serial.println("[TRIP] Intake closed by the node.");
  }
}

void command(const String& name) {
  Serial.println("[CMD] " + name);
  if (name == "SHUT") state = REMOTE_SHUT;
  else if (name == "PREEMPT_SHUT") state = PREEMPTIVE_SHUT;
  else if (name == "FORCE_REARM") state = NORMAL;
  else if (name == "CLEANED") learned = 0;                          // re-learn clean water
  else if (name == "REARM") {                                       // on-site safety interlock
    if (turb - baseTurb > SUSPECT_NTU) Serial.println("[INTERLOCK] Water still dirty; re-arm refused.");
    else state = NORMAL;
  }
}

void checkIn() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(String(SERVER) + "/api/node/reading");
  http.setTimeout(2500);
  http.addHeader("Content-Type", "application/json");
  if (strlen(NODE_KEY)) http.addHeader("X-Node-Key", NODE_KEY);
  String body = String("{\"station_id\":\"") + STATION_ID + "\",\"turbidity\":" + String(turb, 1);
  if (HAS_TDS)  body += ",\"tds\":" + String(tds, 0);
  if (HAS_TEMP) body += ",\"temp\":" + String(tempC, 1);
  body += String(",\"edge_state\":\"") + STATE_NAME[state] + "\",\"valve_open\":" + (valveOpen() ? "true" : "false");
  body += ",\"rssi\":" + String(WiFi.RSSI()) + "}";
  int code = http.POST(body);
  if (code == 200) {
    String res = http.getString();                 // {"ok":true,"commands":[{"cmd":"SHUT","arg":0}],...}
    int at = 0;
    while ((at = res.indexOf("\"cmd\":\"", at)) >= 0) {
      at += 7;
      command(res.substring(at, res.indexOf('"', at)));
    }
  } else {
    Serial.printf("[NET] server replied %d\n", code);
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_RELAY, OUTPUT);
  pinMode(PIN_LED_G, OUTPUT); pinMode(PIN_LED_Y, OUTPUT); pinMode(PIN_LED_R, OUTPUT);
  analogSetAttenuation(ADC_11db);
  ds18.begin();
  outputs();
  WiFi.begin(WIFI_SSID, WIFI_PASS);                // keeps retrying in the background
  Serial.printf("Bulos 3D bench node for %s. Keep the probe in clean water for 15 s.\n", STATION_ID);
}

void loop() {
  if (millis() - lastSample >= SAMPLE_MS) {
    lastSample = millis();
    sense();
    decide();
    outputs();
    checkIn();
    outputs();
    Serial.printf("turb %.1f NTU (base %.1f)  tds %.0f  %.1f C  %s  wifi=%d\n", turb, baseTurb, tds, tempC,
                  STATE_NAME[state], WiFi.status() == WL_CONNECTED);
  }
}
