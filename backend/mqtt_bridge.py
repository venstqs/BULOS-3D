"""
Optional MQTT bridge for the ChirpStack v4 MQTT integration (or any broker
that LGU / DOST LoRaWAN gateways forward to).

    pip install paho-mqtt
    MQTT_HOST=broker.lgu.local MQTT_PORT=1883 CHIRPSTACK_APP_ID=<uuid> \
        python -m uvicorn backend.main:app

Subscribes   application/+/device/+/event/up      -> ingest
Publishes    application/<app>/device/<devEui>/command/down  (valve commands)
"""
import json
import os

import paho.mqtt.client as mqtt

from . import ingest


class Bridge:
    def __init__(self, platform):
        self.p = platform
        self.app_id = os.getenv("CHIRPSTACK_APP_ID", "+")
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="bulos3d-twin")
        if os.getenv("MQTT_USER"):
            self.client.username_pw_set(os.getenv("MQTT_USER"), os.getenv("MQTT_PASS"))
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message

    def _on_connect(self, client, *_):
        client.subscribe("application/+/device/+/event/up")

    def _on_message(self, _client, _userdata, msg):
        try:
            sid, r, meta = ingest.from_chirpstack(json.loads(msg.payload))
            self.p.ingest_reading(sid, r, meta)
        except Exception as e:
            print("mqtt ingest error:", e)

    def publish_downlink(self, frame):
        topic = f"application/{self.app_id}/device/{frame['devEui'].lower()}/command/down"
        self.client.publish(topic, json.dumps(frame), qos=1)

    def start(self):
        self.client.connect(os.environ["MQTT_HOST"], int(os.getenv("MQTT_PORT", "1883")))
        self.client.loop_start()


def start(platform):
    b = Bridge(platform)
    b.start()
    platform.mqtt = b
    return b
