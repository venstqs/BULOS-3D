/*
 * Bulos 3D edge node — autonomous intake protection for a rural water point
 * ---------------------------------------------------------------------------
 * Board     : ESP32 DevKit v1 (ESP32-WROOM-32), Arduino-ESP32 core 3.x
 * LoRaWAN   : RAK3172 module (RUI3 AT firmware) on UART2, AS923-3 (Philippines)
 * GSM       : SIM800L on UART1 — SMS when the LoRaWAN backhaul is down
 * Probes    : turbidity (optical), ORP (Pt), pH (glass), TDS/EC, DS18B20 temp,
 *             tryptophan-like fluorescence (TLF) probe = biological (faecal) indicator
 * Actuator  : 12 V DC normally-CLOSED solenoid via opto-isolated relay
 *             (energised = open, so any power/MCU failure closes the intake)
 * Tank      : JSN-SR04T waterproof ultrasonic level sensor (optional)
 *
 * The decision logic is a line-for-line port of backend/edge.py, which the
 * digital twin's virtual field runs too — the dashboard and the field always
 * agree on what "risk", "drift" and "trip" mean.
 *
 * Libraries: OneWire, DallasTemperature (Arduino Library Manager)
 * NOTE: written against the parts listed above but not yet bench-flashed;
 *       verify the RAK3172 +EVT downlink format against your RUI3 version.
 */
#include <Arduino.h>
#include <Preferences.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <esp_task_wdt.h>

// ----------------------------------------------------------------- pins
#define PIN_TURB      34   // ADC1, via 10k/20k divider (sensor is 5 V)
#define PIN_ORP       35   // ADC1
#define PIN_PH        32   // ADC1
#define PIN_TDS       33   // ADC1
#define PIN_TLF       39   // ADC1 (VN), TLF fluorometer 0-2.5 V analog output
#define PIN_ONEWIRE   4
#define PIN_RELAY     26   // HIGH = coil energised = valve OPEN
#define PIN_LED_G     18
#define PIN_LED_A     19
#define PIN_LED_R     23
#define PIN_BUZZER    27
#define PIN_US_TRIG   13
#define PIN_US_ECHO   14
#define LORA_RX 16
#define LORA_TX 17
#define GSM_RX  25
#define GSM_TX  21

// ------------------------------------------------- shared with edge.py
const float RISK_SUSPECT  = 0.45f;
const float RISK_TRIP     = 0.60f;
const uint32_t PERSISTENCE_MS = 120000;
const uint32_t SAMPLE_MS      = 60000;     // 1 sample + uplink per minute
const int DRIFT_WINDOW        = 60;        // 60 min of 1-min samples

enum State : uint8_t { NORMAL, SUSPECT, TRIPPED, MAINTENANCE, REMOTE_SHUT, PREEMPTIVE_SHUT };
const char* STATE_NAME[] = {"NORMAL", "SUSPECT", "TRIPPED", "MAINTENANCE", "REMOTE_SHUT", "PREEMPTIVE_SHUT"};
enum Cmd : uint8_t { CMD_SHUT = 1, CMD_PREEMPT = 2, CMD_REARM = 3, CMD_FORCE_REARM = 4, CMD_CLEANED = 5, CMD_RAIN = 6 };

// ----------------------------------------------------------- station
const char* STATION_ID = "KS-03";
const char* SMS_NUMBER = "+639000000000";      // Barangay Health Worker (set at commissioning)
const bool  HAS_TANK   = true;
const float TANK_DEPTH_CM = 180.0f;            // sensor face to tank floor

struct Reading { float turb, orp, ph, tds, temp, bio; };
struct Sample  { uint32_t t; float turb, orp, tds; };

Preferences prefs;
OneWire oneWire(PIN_ONEWIRE);
DallasTemperature ds18(&oneWire);
HardwareSerial& Lora = Serial2;
HardwareSerial& Gsm  = Serial1;

Reading base = {2.0f, 410.0f, 7.30f, 170.0f, 24.6f, 3.0f};  // learned at commissioning (BASELINE cmd)
struct Cal { float ph7_mv, ph4_mv, orp_off_mv, tlf_zero_mv, tlf_ppb_per_mv; } cal = {1500.0f, 2030.0f, 0.0f, 120.0f, 0.05f};

State state = NORMAL;
uint32_t suspectSince = 0;
float rainMmHr = 0;
float risk = 0;
Sample win[DRIFT_WINDOW];
int winCount = 0, winHead = 0;
uint32_t lastSample = 0;
uint16_t battMv = 4000;

// ======================================================== sensing
float readMv(int pin, int n = 15) {             // median of n calibrated mV reads
  int v[25];
  for (int i = 0; i < n; i++) { v[i] = analogReadMilliVolts(pin); delay(4); }
  for (int i = 1; i < n; i++) for (int j = i; j > 0 && v[j - 1] > v[j]; j--) { int t = v[j]; v[j] = v[j - 1]; v[j - 1] = t; }
  return v[n / 2];
}

Reading sense() {
  Reading r;
  ds18.requestTemperatures();
  r.temp = ds18.getTempCByIndex(0);
  if (r.temp < -20 || r.temp > 60) r.temp = 25.0f;

  // Turbidity: DFRobot SEN0189 curve, valid 2.5–4.2 V at 5 V supply; undo the 2/3 divider
  float v = readMv(PIN_TURB) / 1000.0f * 1.5f;
  r.turb = (v >= 4.2f) ? 0.5f : (v <= 2.5f ? 3000.0f : -1120.4f * v * v + 5742.3f * v - 4352.9f);
  r.turb = max(0.05f, r.turb);

  // ORP: front-end outputs 2.0 V at 0 mV; 1 mV per mV, plus single-point offset (Zobell / 225 mV std)
  r.orp = (readMv(PIN_ORP) - 2000.0f) + cal.orp_off_mv;

  // pH: two-point calibration (pH 7 / pH 4 buffers), Nernst slope temperature-compensated
  float slope = (cal.ph4_mv - cal.ph7_mv) / 3.0f;                      // mV per pH at cal temp (25 °C)
  slope *= (r.temp + 273.15f) / 298.15f;
  r.ph = 7.0f - (readMv(PIN_PH) - cal.ph7_mv) / slope;

  // TDS: DFRobot Gravity TDS, temperature-compensated to 25 °C
  float cv = (readMv(PIN_TDS) / 1000.0f) / (1.0f + 0.02f * (r.temp - 25.0f));
  r.tds = max(0.0f, (133.42f * cv * cv * cv - 255.86f * cv * cv + 857.39f * cv) * 0.5f);

  // Biological indicator: TLF fluorometer, two-point calibration (blank + tryptophan standard)
  r.bio = max(0.0f, (readMv(PIN_TLF) - cal.tlf_zero_mv) * cal.tlf_ppb_per_mv);
  return r;
}

float tankPct() {
  if (!HAS_TANK) return -1;
  digitalWrite(PIN_US_TRIG, LOW); delayMicroseconds(2);
  digitalWrite(PIN_US_TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(PIN_US_TRIG, LOW);
  unsigned long us = pulseIn(PIN_US_ECHO, HIGH, 30000);
  if (!us) return -1;
  float cm = us * 0.0343f / 2.0f;
  return constrain(100.0f * (TANK_DEPTH_CM - cm) / TANK_DEPTH_CM, 0.0f, 100.0f);
}

// =================================================== edge.py port
float clamp01(float x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

float surrogateRisk(const Reading& r, bool useTurb) {
  float k_turb = useTurb ? clamp01((r.turb - base.turb) / 20.0f) : 0;
  float k_orp  = clamp01((base.orp - r.orp) / 200.0f);
  float k_ph   = clamp01((fabsf(r.ph - base.ph) - 0.2f) / 0.8f);
  float k_tds  = clamp01((r.tds - base.tds) / 200.0f);
  float k_rain = clamp01(rainMmHr / 40.0f);
  float k_bio  = clamp01((r.bio - base.bio) / 15.0f);
  float pClean = (1 - 0.55f * k_turb) * (1 - 0.60f * k_orp) * (1 - 0.25f * k_ph) * (1 - 0.30f * k_tds)
               * (1 - 0.20f * k_rain) * (1 - 0.70f * k_bio);
  float faecal = max(min(k_turb, k_orp), min(k_bio, max(k_turb, k_orp)));
  return clamp01(1 - pClean + 0.30f * faecal);
}

bool driftCheck() {
  if (winCount < 8) return false;
  int first = (winHead - winCount + DRIFT_WINDOW) % DRIFT_WINDOW;
  uint32_t t0 = win[first].t;
  uint32_t span = win[(winHead - 1 + DRIFT_WINDOW) % DRIFT_WINDOW].t - t0;
  if (span < 45UL * 60000UL) return false;
  double sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  float orpDev = 0, tdsDev = 0, lastTurb = 0;
  for (int i = 0; i < winCount; i++) {
    const Sample& s = win[(first + i) % DRIFT_WINDOW];
    double x = (s.t - t0) / 60000.0, y = s.turb;
    sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y;
    orpDev = max(orpDev, fabsf(s.orp - base.orp));
    tdsDev = max(tdsDev, fabsf(s.tds - base.tds));
    lastTurb = s.turb;
  }
  double n = winCount;
  double cxx = sxx - sx * sx / n, cxy = sxy - sx * sy / n, cyy = syy - sy * sy / n;
  if (cxx <= 0 || cyy <= 0) return false;
  double slope = cxy / cxx, r2 = (cxy * cxy) / (cxx * cyy);
  return (lastTurb - base.turb) > 3.0f && slope > 0.005 && slope < 0.3 && r2 > 0.8
         && orpDev < 40.0f && tdsDev < 25.0f && rainMmHr < 2.0f;
}

bool valveOpen() { return state != TRIPPED && state != REMOTE_SHUT && state != PREEMPTIVE_SHUT; }

void applyOutputs() {
  digitalWrite(PIN_RELAY, valveOpen() ? HIGH : LOW);
  bool maint = state == MAINTENANCE || state == SUSPECT;
  digitalWrite(PIN_LED_G, state == NORMAL);
  digitalWrite(PIN_LED_A, maint);
  digitalWrite(PIN_LED_R, !valveOpen());
}

void sendSms(const char* msg) {                  // SIM800L text mode
  Gsm.println("AT+CMGF=1"); delay(300);
  Gsm.printf("AT+CMGS=\"%s\"\r", SMS_NUMBER); delay(300);
  Gsm.print(msg); Gsm.write(26); delay(3000);
}

void logEvent(const char* kind, const char* msg) {
  Serial.printf("[%s] %s\n", kind, msg);
}

void step(const Reading& r) {
  win[winHead] = {millis(), r.turb, r.orp, r.tds};
  winHead = (winHead + 1) % DRIFT_WINDOW;
  if (winCount < DRIFT_WINDOW) winCount++;

  bool drift = driftCheck();
  risk = surrogateRisk(r, state != MAINTENANCE && !drift);
  float fullRisk = surrogateRisk(r, true);
  if (state == TRIPPED || state == REMOTE_SHUT || state == PREEMPTIVE_SHUT) return;

  if (drift && fullRisk >= RISK_SUSPECT * 0.5f) {
    if (state != MAINTENANCE) {
      state = MAINTENANCE;
      logEvent("MAINTENANCE", "Optical drift signature. Valve kept OPEN; lens cleaning requested.");
    }
    if (risk < RISK_SUSPECT) return;
  }
  if (risk < RISK_SUSPECT) {
    if (state != MAINTENANCE) state = NORMAL;
    return;
  }
  if (state != SUSPECT) {
    state = SUSPECT;
    suspectSince = millis();
    logEvent("SUSPECT", "Risk above suspect level; verifying persistence.");
    return;
  }
  if (risk >= RISK_TRIP && millis() - suspectSince >= PERSISTENCE_MS) {
    state = TRIPPED;
    char msg[160];
    snprintf(msg, sizeof msg, "Bulos %s: intake CLOSED automatically (turbidity %.0f NTU, ORP %.0f mV). Serving stored water. Do not drink untreated water.",
             STATION_ID, r.turb, r.orp);
    logEvent("AUTO_TRIP", msg);
    tone(PIN_BUZZER, 2400, 1500);
    sendSms(msg);                                // works even with no LoRaWAN coverage
  }
}

bool handleCommand(uint8_t cmd, uint8_t arg, const Reading& r) {
  switch (cmd) {
    case CMD_RAIN:    rainMmHr = arg; return true;
    case CMD_CLEANED: winCount = 0; if (state == MAINTENANCE) state = NORMAL; return true;
    case CMD_SHUT:    state = REMOTE_SHUT; return true;
    case CMD_PREEMPT: state = PREEMPTIVE_SHUT; return true;
    case CMD_REARM:
      if (surrogateRisk(r, !driftCheck()) >= RISK_SUSPECT) { logEvent("INTERLOCK", "Re-arm refused: water still contaminated."); return false; }
      state = NORMAL; return true;
    case CMD_FORCE_REARM: state = NORMAL; logEvent("REARM", "Interlock BYPASSED by authorised technician."); return true;
  }
  return false;
}

// ============================================= LoRaWAN (RAK3172 AT)
void encodeUplink(const Reading& r, uint8_t* b) {          // == backend/edge.py encode_uplink (v2, 20 bytes)
  float tp = tankPct();
  uint16_t turb = (uint16_t)(constrain(r.turb, 0.0f, 6553.0f) * 10);
  int16_t orp = (int16_t)lroundf(r.orp);
  uint16_t ph = (uint16_t)(constrain(r.ph, 0.0f, 14.0f) * 100);
  uint16_t tds = (uint16_t)constrain(r.tds, 0.0f, 65535.0f);
  int16_t temp = (int16_t)lroundf(r.temp * 100);
  uint16_t tank = tp < 0 ? 0xFFFF : (uint16_t)(tp * 100);
  uint16_t bio = (uint16_t)(constrain(r.bio, 0.0f, 6500.0f) * 10);
  b[0] = 2;
  b[1] = turb >> 8; b[2] = turb;
  b[3] = (uint16_t)orp >> 8; b[4] = orp;
  b[5] = ph >> 8; b[6] = ph;
  b[7] = tds >> 8; b[8] = tds;
  b[9] = (uint16_t)temp >> 8; b[10] = temp;
  b[11] = state;
  b[12] = (valveOpen() ? 1 : 0) | (state == TRIPPED ? 2 : 0);
  b[13] = battMv >> 8; b[14] = battMv;
  b[15] = (uint8_t)(clamp01(risk) * 200);
  b[16] = tank >> 8; b[17] = tank;
  b[18] = bio >> 8; b[19] = bio;
}

void loraSend(const uint8_t* b, int n) {
  char hex[2 * 20 + 1];
  for (int i = 0; i < n; i++) sprintf(hex + 2 * i, "%02X", b[i]);
  Lora.printf("AT+SEND=10:%s\r\n", hex);
}

// Downlinks arrive as e.g. "+EVT:RX_1:-70:8:UNICAST:10:0219" -> port 10, hex payload last
void pollLora(const Reading& r) {
  static String line;
  while (Lora.available()) {
    char c = Lora.read();
    if (c != '\n') { line += c; continue; }
    line.trim();
    int p = line.indexOf(":10:");
    if (line.startsWith("+EVT:RX") && p > 0) {
      String hex = line.substring(line.lastIndexOf(':') + 1);
      uint8_t cmd = strtoul(hex.substring(0, 2).c_str(), nullptr, 16);
      uint8_t arg = hex.length() >= 4 ? strtoul(hex.substring(2, 4).c_str(), nullptr, 16) : 0;
      bool ok = handleCommand(cmd, arg, r);
      Serial.printf("[DOWNLINK] cmd=%u arg=%u -> %s\n", cmd, arg, ok ? "OK" : "REFUSED");
      applyOutputs();
    }
    line = "";
  }
}

// ======================================================== commissioning
void handleSerial(const Reading& r) {
  if (!Serial.available()) return;
  String s = Serial.readStringUntil('\n');
  s.trim(); s.toUpperCase();
  if (s == "BASELINE") {                       // after 1 h of known-clean water
    base = r;
    prefs.putBytes("base", &base, sizeof base);
    Serial.println("Baseline stored.");
  } else if (s == "CAL PH7") { cal.ph7_mv = readMv(PIN_PH); prefs.putBytes("cal", &cal, sizeof cal); }
  else if (s == "CAL PH4") { cal.ph4_mv = readMv(PIN_PH); prefs.putBytes("cal", &cal, sizeof cal); }
  else if (s == "CAL TLF0") { cal.tlf_zero_mv = readMv(PIN_TLF); prefs.putBytes("cal", &cal, sizeof cal); }   // blank (DI water)
  else if (s == "SHUT") handleCommand(CMD_SHUT, 0, r);
  else if (s == "REARM") handleCommand(CMD_REARM, 0, r);
  else if (s == "FORCE_REARM") handleCommand(CMD_FORCE_REARM, 0, r);
  else if (s == "CLEANED") handleCommand(CMD_CLEANED, 0, r);
  else Serial.println("Commands: BASELINE | CAL PH7 | CAL PH4 | CAL TLF0 | SHUT | REARM | FORCE_REARM | CLEANED");
  applyOutputs();
}

// ================================================================ main
Reading last;

void setup() {
  pinMode(PIN_RELAY, OUTPUT);
  digitalWrite(PIN_RELAY, LOW);                // start CLOSED until first good reading
  pinMode(PIN_LED_G, OUTPUT); pinMode(PIN_LED_A, OUTPUT); pinMode(PIN_LED_R, OUTPUT);
  pinMode(PIN_US_TRIG, OUTPUT); pinMode(PIN_US_ECHO, INPUT);
  Serial.begin(115200);
  Lora.begin(115200, SERIAL_8N1, LORA_RX, LORA_TX);
  Gsm.begin(9600, SERIAL_8N1, GSM_RX, GSM_TX);
  analogSetAttenuation(ADC_11db);
  ds18.begin();

  prefs.begin("bulos", false);
  prefs.getBytes("base", &base, sizeof base);
  prefs.getBytes("cal", &cal, sizeof cal);

  esp_task_wdt_config_t wdt = {.timeout_ms = 30000, .idle_core_mask = 0, .trigger_panic = true};
  esp_task_wdt_reconfigure(&wdt);
  esp_task_wdt_add(NULL);

  Lora.print("AT+NJM=1\r\n"); delay(200);      // OTAA; keys provisioned once with AT+DEVEUI/APPEUI/APPKEY
  Lora.print("AT+BAND=10\r\n"); delay(200);    // AS923-3
  Lora.print("AT+JOIN=1:0:10:8\r\n");
  last = sense();
  applyOutputs();
  Serial.printf("Bulos 3D edge node %s ready.\n", STATION_ID);
}

void loop() {
  esp_task_wdt_reset();
  pollLora(last);
  handleSerial(last);
  if (millis() - lastSample >= SAMPLE_MS || lastSample == 0) {
    lastSample = millis();
    last = sense();
    State before = state;
    step(last);
    applyOutputs();
    uint8_t payload[20];
    encodeUplink(last, payload);
    loraSend(payload, sizeof payload);
    Serial.printf("turb %.1f NTU  orp %.0f mV  pH %.2f  tds %.0f  TLF %.1f ppb  risk %.2f  %s%s\n",
                  last.turb, last.orp, last.ph, last.tds, last.bio, risk, STATE_NAME[state], before != state ? "  (changed)" : "");
  }
  delay(50);
}
