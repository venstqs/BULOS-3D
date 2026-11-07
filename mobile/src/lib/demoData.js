// Generated from the data server's /api/state and /api/static (Naga site), so the on-phone
// demo shows the same water points, pipes and river as the live twin. Do not edit by hand.
export const STATIONS = [
  {
    "id": "IN-01",
    "name": "Mt. Isarog Communal Spring Intake",
    "kind": "SPRING_INTAKE",
    "owner": "City Water Office",
    "network": "LGU-LoRaWAN",
    "gateway": "LGU-GW-Isarog",
    "note": "Spring box on the forested Isarog slope feeding the upland gravity line. Supplemental Bulos edge node.",
    "lat": 13.639939,
    "lon": 123.29935,
    "elevation_m": 173.2,
    "chainage_m": 4665,
    "catchment_km2": 8.77,
    "population": 0,
    "aquifer": false,
    "sms": null,
    "base": {
      "turbidity": 0.8,
      "orp": 430,
      "ph": 7.44,
      "tds": 120,
      "temp": 21,
      "bio": 0.6
    },
    "valve": null,
    "tank": null
  },
  {
    "id": "AG-02",
    "name": "Agricultural Runoff Sentinel",
    "kind": "EXISTING_GOV_SENSOR",
    "owner": "Proposed partner: DOST Region V",
    "network": "Proposed LoRaWAN link",
    "gateway": "Proposed gateway",
    "note": "Proposed river station below the farm tributary. A real rollout would read a government sonde here; none is connected today.",
    "lat": 13.622367,
    "lon": 123.247165,
    "elevation_m": 34.8,
    "chainage_m": 13995,
    "catchment_km2": 18.24,
    "population": 0,
    "aquifer": false,
    "sms": "City ENRO duty officer",
    "base": {
      "turbidity": 2.2,
      "orp": 400,
      "ph": 7.29,
      "tds": 165,
      "temp": 24,
      "bio": 3.4
    },
    "valve": null,
    "tank": null
  },
  {
    "id": "KS-03",
    "name": "Barangay Communal Water Kiosk",
    "kind": "COMMUNAL_KIOSK",
    "owner": "Barangay Council",
    "network": "LGU-LoRaWAN",
    "gateway": "LGU-GW-Isarog",
    "note": "Creek intake -> cartridge filter -> 5,000 L tank -> 4 taps. 450 households.",
    "lat": 13.619753,
    "lon": 123.234808,
    "elevation_m": 27.9,
    "chainage_m": 17494,
    "catchment_km2": 27.61,
    "population": 2250,
    "aquifer": false,
    "sms": "Barangay Health Worker",
    "base": {
      "turbidity": 2,
      "orp": 410,
      "ph": 7.29,
      "tds": 170,
      "temp": 25,
      "bio": 3
    },
    "valve": {
      "model": "12 V DC normally-closed solenoid, 1\"",
      "relay": "GPIO 26"
    },
    "tank": {
      "capacity_l": 5000,
      "demand_lps": 0.3
    }
  },
  {
    "id": "MB-04",
    "name": "Solar-Pumped Shallow Well",
    "kind": "SOLAR_PUMP_WELL",
    "owner": "Barangay Water Association",
    "network": "LGU-LoRaWAN",
    "gateway": "LGU-GW-Naga",
    "note": "Riverbank shallow well; solar pump lifts to a 10,000 L elevated tank. Draws induced river infiltration, so it sees creek contamination.",
    "lat": 13.628554,
    "lon": 123.220435,
    "elevation_m": 16.5,
    "chainage_m": 21576,
    "catchment_km2": 29.63,
    "population": 1200,
    "aquifer": true,
    "sms": "Barangay water association",
    "base": {
      "turbidity": 0.6,
      "orp": 380,
      "ph": 7.1,
      "tds": 239,
      "temp": 25,
      "bio": 1.2
    },
    "valve": {
      "model": "Solar pump controller enable + 2\" NC solenoid",
      "relay": "GPIO 26 / GPIO 25"
    },
    "tank": {
      "capacity_l": 10000,
      "demand_lps": 0.6
    }
  },
  {
    "id": "RH-05",
    "name": "Rural Health Unit & School Intake",
    "kind": "CRITICAL_ENDPOINT",
    "owner": "City Health Office",
    "network": "LGU-LoRaWAN",
    "gateway": "LGU-GW-Naga",
    "note": "Clinic + elementary school on the city edge. Highest vulnerability (infants, patients, pupils).",
    "lat": 13.635508,
    "lon": 123.200509,
    "elevation_m": 8.4,
    "chainage_m": 26241,
    "catchment_km2": 30.16,
    "population": 650,
    "aquifer": false,
    "sms": "City Health Officer",
    "base": {
      "turbidity": 2.8,
      "orp": 395,
      "ph": 7.34,
      "tds": 190,
      "temp": 26,
      "bio": 4
    },
    "valve": {
      "model": "12 V DC normally-closed solenoid, 1\"",
      "relay": "GPIO 26"
    },
    "tank": {
      "capacity_l": 3000,
      "demand_lps": 0.12
    }
  }
];

export const PIPES = [
  {
    "id": "GL-1",
    "name": "Spring gravity line",
    "src": "IN-01",
    "dst": "KS-03",
    "length_m": 9857,
    "diameter_m": 0.1,
    "material": "HDPE",
    "static_head_m": 135.3,
    "note": "Isarog spring box to the barangay kiosk tank. Break-pressure tanks along the line."
  },
  {
    "id": "DM-2",
    "name": "Well distribution main",
    "src": "MB-04",
    "dst": "RH-05",
    "length_m": 3007,
    "diameter_m": 0.075,
    "material": "HDPE",
    "static_head_m": 8.1,
    "note": "Elevated tank at the solar well feeds the clinic and school by gravity."
  }
];

export const REACHES = [
  {
    "reach": "IN-01→AG-02",
    "length_m": 9330.1,
    "drop_m": 138.4,
    "slope": 0.0148,
    "mean_velocity_mps": 0.95,
    "discharge_m3s": 0.456,
    "depth_m": 0.2,
    "width_m": 1.9,
    "travel_time_s": 9803.1,
    "velocity_factor": 1
  },
  {
    "reach": "AG-02→KS-03",
    "length_m": 3498.8,
    "drop_m": 6.9,
    "slope": 0.002,
    "mean_velocity_mps": 0.67,
    "discharge_m3s": 0.69,
    "depth_m": 0.33,
    "width_m": 2.3,
    "travel_time_s": 5191.6,
    "velocity_factor": 1
  },
  {
    "reach": "KS-03→MB-04",
    "length_m": 4081.9,
    "drop_m": 11.4,
    "slope": 0.0028,
    "mean_velocity_mps": 0.75,
    "discharge_m3s": 0.741,
    "depth_m": 0.35,
    "width_m": 2.7,
    "travel_time_s": 5461.4,
    "velocity_factor": 1
  },
  {
    "reach": "MB-04→RH-05",
    "length_m": 4665,
    "drop_m": 8.1,
    "slope": 0.0017,
    "mean_velocity_mps": 0.71,
    "discharge_m3s": 0.754,
    "depth_m": 0.38,
    "width_m": 2.8,
    "travel_time_s": 6582.9,
    "velocity_factor": 1
  }
];

export const CHANNEL = {"chainage_m":[0,466,933,1400,1866,2332,2799,3266,3732,4198,4665,5248,5715,6181,6648,7114,7581,8047,8514,8980,9447,9913,10380,10846,11313,11779,12246,12712,13179,13645,14112,14578,15161,15628,16094,16561,17027,17494,17960,18427,18893,19360,19826,20293,20759,21226,21692,22159,22625,23092,23558,24025,24491,25074,25541,26008,26474,26940,27407,27874,28340,28806,29273,29740],"elev_m":[336.1,316.1,291,270.5,253.7,240.2,229.4,216.3,202.4,189,173.2,154.9,141.8,129.5,118.9,111.7,103.1,94,87.9,82.1,76.3,69.7,63.1,57.7,55,52,47.9,44.6,40.8,36.7,34.5,33.4,32.8,31.1,29.6,29.1,28.4,27.9,27.3,24.8,21.6,20.2,19.7,18.9,17.3,16.6,16.5,16.2,15.5,14.9,13.7,11.7,10.3,9.9,9.6,8.9,8.1,7.5,7,6.7,6.4,5.9,4.4,3.2],"velocity_mps":[0.99,0.99,1.22,1.16,1.09,1.02,1.03,1.07,1.09,1.12,1.15,1.11,1.12,1.09,1.01,0.99,1.07,1.03,0.94,0.94,0.97,0.99,0.98,0.87,0.77,0.84,0.86,0.84,0.86,0.84,0.77,0.6,0.71,0.78,0.67,0.62,0.65,0.65,0.83,0.89,0.84,0.69,0.66,0.79,0.77,0.66,0.66,0.66,0.67,0.69,0.86,0.89,0.69,0.67,0.67,0.69,0.67,0.67,0.75,0.75,0.75,0.82,0.91,0.89],"discharge_m3s":[0.104,0.108,0.17,0.173,0.177,0.179,0.181,0.192,0.205,0.207,0.219,0.228,0.243,0.256,0.261,0.268,0.35,0.355,0.362,0.363,0.372,0.378,0.388,0.405,0.412,0.419,0.434,0.438,0.445,0.451,0.456,0.458,0.463,0.468,0.501,0.503,0.686,0.69,0.69,0.702,0.714,0.723,0.724,0.727,0.74,0.741,0.741,0.742,0.752,0.754,0.754,0.754,0.754,0.754,0.754,0.754,0.754,0.754,1.386,1.388,1.403,1.406,1.406,1.406]};

export const STATIC = {
  "site": {
    "id": "naga",
    "title": "Naga City, Camarines Sur",
    "subtitle": "Mt. Isarog west slope → Naga City"
  },
  "pnsdw": {
    "turbidity_ntu": 5,
    "ph_min": 6.5,
    "ph_max": 8.5,
    "tds_mgL": 600
  },
  "thresholds": {
    "suspect": 0.45,
    "trip": 0.6,
    "persistence_s": 120
  },
  "scenarios": {
    "MONSOON": "Monsoon cloudburst: 45 mm/hr for 1 h over the catchment (runoff + farm first-flush)",
    "SEPTIC": "Septic tank / piggery lagoon failure on the farm tributary (dry weather, 30 min release)",
    "BIOFOULING": "Biofilm growing on the KS-03 turbidity optics (sensor fault, water is clean)",
    "RESET": "Clear all events (dry season baseline)"
  },
  "task_kinds": {
    "LENS_CLEAN": "Clean turbidity probe",
    "PH_CAL": "Calibrate pH probe",
    "FILTER": "Replace cartridge filter",
    "SOLAR": "Inspect solar panel and battery",
    "TANK": "Clean and disinfect storage tank",
    "CUSTOM": "Custom task"
  },
  "heat_indices": [
    "risk",
    "turbidity",
    "ph",
    "tds",
    "bio"
  ],
  "bio_alert_ppb": 10,
  "rain_gauge": {
    "id": "ARG-NAGA",
    "name": "Simulated rain gauge (Naga City)",
    "lat": 13.626,
    "lon": 123.26
  }
};
