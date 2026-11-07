# Build the Bulos 3D bench node

> **Status: not built.** This is a plan for a future prototype. No part of it has been assembled or tested.

A working model of one water point: a sensor sees dirty water, the valve closes by itself, and the live
digital twin reacts. Build time is about one afternoon once the parts arrive. The firmware has **not been
flashed on real hardware yet**, so expect some debugging. Order parts today.

## Parts

Prices are rough estimates, not quotes. Check Shopee, Lazada or a local electronics shop.

| Part | Purpose | Rough cost (PHP) |
|---|---|---|
| ESP32 DevKit v1 (30-pin) | Brain and Wi-Fi | 250–400 |
| Analog turbidity sensor (SEN0189 type) | Detects cloudy water | 500–900 |
| Analog TDS sensor module (optional) | Detects dissolved pollution | 350–700 |
| DS18B20 waterproof temperature probe + 4.7 kΩ resistor (optional) | Temperature correction | 80–150 |
| 1-channel relay board, 3.3 V logic compatible | Switches the valve | 60–120 |
| 12 V normally-closed **zero-pressure** solenoid valve, 1/2" | The intake valve | 400–900 |
| 12 V 2 A adapter | Powers the valve | 150–300 |
| 3 LEDs, 3 × 220 Ω, buzzer, 10 kΩ + 20 kΩ resistors, breadboard, jumper wires | Local warning and wiring | 200–300 |
| Two clear containers, tubing | Water model | 100–200 |
| **Total** | | **about 2,100–4,000** |

**Minimum version (about 1,400–2,300):** ESP32, turbidity sensor, relay, valve, adapter, LEDs. Set
`HAS_TDS` and `HAS_TEMP` to `false`.

**No valve in time?** A relay plus an LED still proves the loop, or use a small 12 V pump in place of the valve.

### Two traps

- **Valve type.** Ordinary solenoid valves need water pressure to open, so they stay shut on a gravity tank.
  Search for "zero pressure", "direct acting" or "direct lift".
- **Relay polarity.** Many relay boards switch on with a LOW signal. If the valve behaves backwards, set
  `RELAY_ACTIVE_HIGH = false` in the firmware.

## Wiring

| From | To |
|---|---|
| Turbidity VCC / GND | ESP32 **VIN (5 V)** / GND |
| Turbidity signal | 10 kΩ resistor to **GPIO 34**; 20 kΩ from GPIO 34 to GND (keeps the voltage safe for the ESP32) |
| TDS VCC / GND / signal | 3V3 / GND / **GPIO 33** |
| DS18B20 red / black / yellow | 3V3 / GND / **GPIO 4**, with 4.7 kΩ between yellow and 3V3 |
| Relay VCC / GND / IN | VIN / GND / **GPIO 26** |
| Relay COM and NO | In series with the 12 V supply and the valve |
| Green, yellow, red LED (each through 220 Ω) | **GPIO 18, 19, 23** to GND |
| Buzzer | **GPIO 27** to GND |

**Never connect 12 V to the ESP32.** Join all grounds except the 12 V valve circuit, which only passes through the relay.
Keep water and electronics apart, and use a low-voltage supply only.

## Software

1. Install the Arduino IDE, the ESP32 board package, and the **OneWire** and **DallasTemperature** libraries.
2. Open `firmware/bulos_bench_node/bulos_bench_node.ino`.
3. Edit `WIFI_SSID`, `WIFI_PASS`, and `SERVER` (use the Wi-Fi address that `npm run start:lan` prints, port 8000).
   The ESP32 only joins 2.4 GHz Wi-Fi.
4. Upload, then open Serial Monitor at 115200.

## Calibrate turbidity

1. Put the probe in clean water and note the volts: temporarily print `volts` from `sense()`. Set `CLEAR_VOLTS`.
2. Mix a dirty reference sample and set `DIRTY_VOLTS`. Set `DIRTY_NTU` to your best estimate of it.

This sensor is meant for cloudy water. It **cannot measure drinking-water levels near 1–5 NTU accurately**,
so treat readings as relative. Field units need a better probe.

## Demo

1. PC: `npm run start:lan`, then open the website.
2. Power the node with the probe in **clean** water for 15 seconds, so it learns its baseline.
3. KS-03 shows a **Real sensor** label. ORP and pH show "not fitted".
4. Stir in clay soil or a few drops of milk. **Never use real sewage or manure.**
5. Yellow LED, then after 15 seconds the red LED, buzzer and valve close. The dashboard shows the alert and
   the forecast changes downstream.
6. Press **Re-arm** while the water is dirty and it is refused. Change to clean water and it works.
7. Unplug the Wi-Fi router during a test: the valve still closes. Safety does not depend on the internet.

No hardware yet? Rehearse with `python -m backend.tools.fake_node` while the server is running.
