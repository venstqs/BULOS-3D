// Payload formatter for The Things Stack (TTN v3) and ChirpStack v4.
// Paste into the device profile / application "Uplink formatter" (JavaScript).
// Mirrors backend/edge.py decode_uplink and the firmware encodeUplink().

var STATES = ['NORMAL', 'SUSPECT', 'TRIPPED', 'MAINTENANCE', 'REMOTE_SHUT', 'PREEMPTIVE_SHUT'];

function u16(b, i) { return (b[i] << 8) | b[i + 1]; }
function s16(b, i) { var v = u16(b, i); return v > 0x7fff ? v - 0x10000 : v; }

function decode(bytes) {
  var v2 = bytes.length === 20 && bytes[0] === 2;
  if (!v2 && !(bytes.length === 18 && bytes[0] === 1)) return { errors: ['unexpected payload'] };
  var tank = u16(bytes, 16);
  var bio = v2 ? u16(bytes, 18) : 0xffff;
  return {
    data: {
      turbidity_ntu: u16(bytes, 1) / 10,
      orp_mv: s16(bytes, 3),
      ph: u16(bytes, 5) / 100,
      tds_ppm: u16(bytes, 7),
      temp_c: s16(bytes, 9) / 100,
      edge_state: STATES[bytes[11]] || 'NORMAL',
      valve_open: (bytes[12] & 1) === 1,
      alarm: (bytes[12] & 2) === 2,
      battery_v: u16(bytes, 13) / 1000,
      edge_risk: bytes[15] / 200,
      tank_pct: tank === 0xffff ? null : tank / 100,
      tlf_ppb: bio === 0xffff ? null : bio / 10,     // biological indicator (tryptophan-like fluorescence)
    },
  };
}

// TTN v3
function decodeUplink(input) { return decode(input.bytes); }
// ChirpStack v4 uses the same entry point name and input shape.
