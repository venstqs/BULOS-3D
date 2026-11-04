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
    "lat": 13.661667,
    "lon": 123.336667,
    "elevation_m": 506.8,
    "chainage_m": 4194,
    "catchment_km2": 2.78,
    "population": 0,
    "aquifer": false,
    "sms": null,
    "base": {
      "turbidity": 0.8,
      "orp": 430,
      "ph": 7.44,
      "tds": 120,
      "temp": 21,
      "bio": 0.5
    },
    "valve": null,
    "tank": null
  },
  {
    "id": "AG-02",
    "name": "Agricultural Runoff Sentinel",
    "kind": "EXISTING_GOV_SENSOR",
    "owner": "DOST Region V (Bicol)",
    "network": "DOST-LoRaWAN",
    "gateway": "DOST-GW-Bicol",
    "note": "Existing government water-quality sonde below the farm tributary. Ingested, not owned.",
    "lat": 13.629167,
    "lon": 123.275,
    "elevation_m": 81.2,
    "chainage_m": 12872,
    "catchment_km2": 14.47,
    "population": 0,
    "aquifer": false,
    "sms": "City ENRO duty officer",
    "base": {
      "turbidity": 2.2,
      "orp": 400,
      "ph": 7.29,
      "tds": 164,
      "temp": 24,
      "bio": 3.5
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
    "lat": 13.618333,
    "lon": 123.2525,
    "elevation_m": 43.8,
    "chainage_m": 16290,
    "catchment_km2": 17.4,
    "population": 2250,
    "aquifer": false,
    "sms": "Barangay Health Worker",
    "base": {
      "turbidity": 1.9,
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
    "lat": 13.6275,
    "lon": 123.228333,
    "elevation_m": 19.2,
    "chainage_m": 20123,
    "catchment_km2": 28.58,
    "population": 1200,
    "aquifer": true,
    "sms": "Barangay water association",
    "base": {
      "turbidity": 0.5,
      "orp": 380,
      "ph": 7.1,
      "tds": 239,
      "temp": 25,
      "bio": 1.1
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
    "lat": 13.63,
    "lon": 123.196667,
    "elevation_m": 8.2,
    "chainage_m": 24792,
    "catchment_km2": 32.62,
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
    "length_m": 11335,
    "diameter_m": 0.1,
    "material": "HDPE",
    "static_head_m": 453,
    "note": "Isarog spring box to the barangay kiosk tank. Break-pressure tanks along the line."
  },
  {
    "id": "DM-2",
    "name": "Well distribution main",
    "src": "MB-04",
    "dst": "RH-05",
    "length_m": 3781,
    "diameter_m": 0.075,
    "material": "HDPE",
    "static_head_m": 11,
    "note": "Elevated tank at the solar well feeds the clinic and school by gravity."
  }
];

export const REACHES = [
  {
    "reach": "IN-01→AG-02",
    "length_m": 8678.3,
    "drop_m": 425.6,
    "slope": 0.049,
    "mean_velocity_mps": 1.11,
    "discharge_m3s": 0.362,
    "depth_m": 0.11,
    "width_m": 1.4,
    "travel_time_s": 7784.9,
    "velocity_factor": 1
  },
  {
    "reach": "AG-02→KS-03",
    "length_m": 3418,
    "drop_m": 37.4,
    "slope": 0.0109,
    "mean_velocity_mps": 0.97,
    "discharge_m3s": 0.435,
    "depth_m": 0.22,
    "width_m": 2,
    "travel_time_s": 3525.4,
    "velocity_factor": 1
  },
  {
    "reach": "KS-03→MB-04",
    "length_m": 3832.2,
    "drop_m": 24.6,
    "slope": 0.0064,
    "mean_velocity_mps": 0.83,
    "discharge_m3s": 0.714,
    "depth_m": 0.27,
    "width_m": 2.3,
    "travel_time_s": 4619.1,
    "velocity_factor": 1
  },
  {
    "reach": "MB-04→RH-05",
    "length_m": 4669.8,
    "drop_m": 11,
    "slope": 0.0024,
    "mean_velocity_mps": 0.75,
    "discharge_m3s": 0.816,
    "depth_m": 0.36,
    "width_m": 2.8,
    "travel_time_s": 6196.1,
    "velocity_factor": 1
  }
];

export const CHANNEL = {"chainage_m":[0,478,878,1317,1756,2156,2595,3034,3394,3794,4194,4684,5084,5523,6001,6409,6853,7331,7809,8248,8648,9048,9526,9965,10404,10804,11246,11646,12084,12563,12962,13441,14051,14453,14853,15371,15849,16290,16690,17171,17649,18049,18452,18890,19371,19810,20252,20691,21130,21608,22089,22528,23009,23538,24016,24534,25014,25378,25783,26227,26669,27076,27476,27954],"elev_m":[1852.3,1565.2,1405.7,1282.1,1131.2,902.9,792.7,710.5,621.2,553.9,506.8,446,420.5,367.8,344,316.9,291.9,269.9,247.8,229.9,207,198.2,177.2,157.6,143.5,133.4,123.6,114.7,102.7,85.8,80.1,71.9,63.6,58,54.7,53.1,47.4,43.8,37.6,36.6,30.9,29.7,29.6,27,26.8,21,16.5,19.9,16.5,15.3,15.1,14.1,12.1,10.7,10.2,8.8,7.7,7.1,6.8,6.3,5.6,5.4,5,4.2],"velocity_mps":[0.05,0.09,0.17,0.21,0.24,0.25,0.51,0.59,0.63,0.67,1.02,1.03,1,1.18,1.06,1.04,1.02,1.22,1.19,1.23,1.18,1.09,1.19,1.2,1.11,1.06,1.09,1.02,1.21,1.17,1.03,1.13,1.14,0.81,0.81,0.96,0.92,0.76,0.91,0.86,0.6,0.68,0.61,0.65,0.93,0.9,0.66,0.66,0.85,0.66,0.66,0.67,0.9,0.67,0.77,0.78,0.78,0.7,0.75,0.75,0.75,0.75,0.76,0.76],"discharge_m3s":[0.001,0.005,0.01,0.012,0.014,0.015,0.031,0.035,0.038,0.04,0.069,0.076,0.08,0.099,0.102,0.107,0.115,0.172,0.176,0.179,0.189,0.205,0.207,0.226,0.229,0.248,0.256,0.261,0.346,0.355,0.362,0.372,0.378,0.403,0.407,0.413,0.431,0.435,0.443,0.45,0.457,0.463,0.501,0.684,0.691,0.704,0.715,0.724,0.732,0.74,0.746,0.753,0.755,0.804,0.807,0.811,0.817,0.818,1.387,1.392,1.406,1.408,1.438,1.447]};

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
    "name": "DOST-ASTI automated rain gauge (Naga City)",
    "lat": 13.626,
    "lon": 123.26
  }
};
