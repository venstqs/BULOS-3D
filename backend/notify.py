"""
SMS advisories. Off-grid residents do not need a smartphone or data plan.

Provider is chosen by environment:
  SEMAPHORE_API_KEY  -> Semaphore (PH SMS gateway, https://semaphore.co), real texts
  (unset)            -> outbox only: messages are logged and shown in the dashboard

Recipients map a role (as named in config.STATIONS[*].sms) to phone numbers:
  BULOS_SMS_RECIPIENTS='{"Barangay Health Worker": ["09171234567"]}'
The edge nodes also carry a GSM module and send their own trip SMS when the
LoRaWAN backhaul is down (see firmware).
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.parse
import urllib.request
from collections import deque

API_KEY = os.getenv("SEMAPHORE_API_KEY")
SENDER = os.getenv("SEMAPHORE_SENDER", "BULOS3D")
RECIPIENTS = json.loads(os.getenv("BULOS_SMS_RECIPIENTS", "{}"))


class Notifier:
    def __init__(self):
        self.outbox = deque(maxlen=100)
        self.provider = "semaphore" if API_KEY else "outbox"

    def send(self, role, message):
        text = f"[Bulos 3D] {message}"[:450]
        numbers = RECIPIENTS.get(role, [])
        rec = dict(t=time.time(), role=role, numbers=len(numbers), message=text,
                   provider=self.provider, status="queued")
        self.outbox.appendleft(rec)
        if self.provider == "semaphore" and numbers:
            threading.Thread(target=self._semaphore, args=(rec, numbers, text), daemon=True).start()
        else:
            rec["status"] = "logged (no SMS provider configured)" if self.provider == "outbox" else "no recipients"
        return rec

    @staticmethod
    def _semaphore(rec, numbers, text):
        data = urllib.parse.urlencode(dict(apikey=API_KEY, number=",".join(numbers),
                                           message=text, sendername=SENDER)).encode()
        try:
            with urllib.request.urlopen("https://api.semaphore.co/api/v4/messages", data=data, timeout=15) as r:
                rec["status"] = f"sent ({r.status})"
        except Exception as e:
            rec["status"] = f"failed: {e}"
