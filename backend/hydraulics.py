"""
1-D channel hydraulics and contaminant transport along the DEM main stem.

Discharge  : Q = baseflow_yield * A  +  C * i * A / 3.6        (rational method)
Geometry   : width w = a * Q^b  (downstream hydraulic geometry, Leopold & Maddock)
Velocity   : Manning, wide rectangular channel
               Q = (1/n) w h^(5/3) S^(1/2)  ->  h,  v = Q / (w h)
Transport  : advection-dispersion with lateral (clean or loaded) inflow
               finite-volume, upwind advection, explicit dispersion,
               sub-stepped to satisfy CFL and diffusion limits
Dispersion : Fischer (1979) longitudinal coefficient  D = 0.011 v^2 w^2 / (h u*)

The same code runs twice: once as the "true" world (simulator) and once
inside the twin with its own (initially wrong, later calibrated) roughness.
"""
from __future__ import annotations

import math

import numpy as np

G = 9.81
BASEFLOW_YIELD = 0.025      # m3/s per km2, wet-tropics upland baseflow
RUNOFF_COEFF = 0.45         # forested/agricultural volcanic slopes
WIDTH_A, WIDTH_B = 3.2, 0.5


class Channel:
    def __init__(self, profile, manning_n=0.045):
        """profile: list of dict(s, z, area_km2, lat, lon) from Terrain.path_profile."""
        self.lat = np.array([p["lat"] for p in profile])
        self.lon = np.array([p["lon"] for p in profile])
        self.s = np.array([p["s"] for p in profile])
        self.z = np.array([p["z"] for p in profile])
        self.area = np.maximum(np.array([p["area_km2"] for p in profile], float), 0.02)
        self.n_cells = len(profile)
        self.dx = np.diff(self.s, append=self.s[-1] + (self.s[-1] - self.s[-2]))
        self.slope = self._smoothed_slope()
        self.base_n = manning_n
        self.n_mult = np.ones(self.n_cells)          # calibration multiplier on velocity
        self.update(0.0)

    def _smoothed_slope(self, half=3):
        out = np.empty(self.n_cells)
        for i in range(self.n_cells):
            a, b = max(0, i - half), min(self.n_cells - 1, i + half)
            out[i] = (self.z[a] - self.z[b]) / max(self.s[b] - self.s[a], 1.0)
        return np.clip(out, 0.0015, 0.35)

    def manning_n(self):
        # rougher boulder bed on steep reaches, smoother lowland channel
        return self.base_n * np.where(self.slope > 0.05, 1.15, np.where(self.slope < 0.005, 0.8, 1.0))

    def update(self, rain_mm_hr):
        self.rain = max(0.0, rain_mm_hr)
        self.Q = BASEFLOW_YIELD * self.area + RUNOFF_COEFF * self.rain * self.area / 3.6
        self.w = np.maximum(WIDTH_A * self.Q ** WIDTH_B, 1.2)
        n = self.manning_n()
        self.h = np.maximum((self.Q * n / (self.w * np.sqrt(self.slope))) ** 0.6, 0.05)
        self.v = np.clip(self.Q / (self.w * self.h), 0.05, 4.0) * self.n_mult
        u_star = np.sqrt(G * self.h * self.slope)
        self.D = np.clip(0.011 * self.v ** 2 * self.w ** 2 / (self.h * u_star), 0.5, 60.0)
        self.vol = self.w * self.h * self.dx

    def travel_time(self, i, j):
        """Advective travel time (s) from cell i to cell j (j > i)."""
        return float(np.sum(self.dx[i:j] / self.v[i:j]))

    def reach_summary(self, i, j):
        seg = slice(i, j)
        return dict(
            length_m=round(float(self.s[j] - self.s[i]), 1),
            drop_m=round(float(self.z[i] - self.z[j]), 1),
            slope=round(float((self.z[i] - self.z[j]) / max(self.s[j] - self.s[i], 1)), 4),
            mean_velocity_mps=round(float((self.s[j] - self.s[i]) / self.travel_time(i, j)), 2),
            discharge_m3s=round(float(self.Q[j]), 3),
            depth_m=round(float(np.mean(self.h[seg])), 2),
            width_m=round(float(np.mean(self.w[seg])), 1),
            travel_time_s=round(self.travel_time(i, j), 1),
        )


class Transport:
    """Concentrations of n_tracers along the channel (units per tracer, e.g. NTU-excess)."""

    def __init__(self, channel: Channel, n_tracers: int, decay_per_s=None):
        self.ch = channel
        self.c = np.zeros((n_tracers, channel.n_cells))
        self.decay = np.zeros(n_tracers) if decay_per_s is None else np.asarray(decay_per_s, float)

    def copy(self):
        t = Transport(self.ch, self.c.shape[0], self.decay)
        t.c = self.c.copy()
        return t

    def step(self, dt, lateral_conc=None, point_mass=None):
        """
        lateral_conc: (n_tracers, n_cells) concentration of lateral inflow (default clean)
        point_mass:   (n_tracers, n_cells) mass rate injected (units * m3/s)
        """
        ch = self.ch
        dt_max = min(float(np.min(ch.dx / ch.v)) * 0.9,
                     float(np.min(ch.dx ** 2 / (2 * ch.D))) * 0.9)
        n_sub = max(1, math.ceil(dt / dt_max))
        h = dt / n_sub
        q_lat = np.diff(ch.Q, prepend=ch.Q[0])            # lateral inflow per cell (m3/s)
        A_x = ch.w * ch.h                                 # cross-section area
        for _ in range(n_sub):
            c = self.c
            mass = c * ch.vol
            # advection (upwind, outflow at last cell)
            flux = ch.Q * c
            mass[:, 1:] += h * flux[:, :-1]
            mass -= h * flux
            # dispersion between neighbours
            grad = (c[:, 1:] - c[:, :-1]) / (0.5 * (ch.dx[1:] + ch.dx[:-1]))
            d_flux = 0.5 * (ch.D[1:] * A_x[1:] + ch.D[:-1] * A_x[:-1]) * grad
            mass[:, :-1] += h * d_flux
            mass[:, 1:] -= h * d_flux
            # lateral inflow brings water (dilution is automatic) and possibly load
            if lateral_conc is not None:
                mass += h * q_lat * lateral_conc
            if point_mass is not None:
                mass += h * point_mass
            self.c = np.maximum(mass / ch.vol, 0.0)
            self.c *= np.exp(-self.decay[:, None] * h)


# --------------------------------------------------------------- pipelines
def pipe_route(terrain, a, b, n=40):
    """Buried pipeline between two (lat, lon) points, following the DEM surface."""
    pts = []
    for k in range(n + 1):
        f = k / n
        lat, lon = a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f
        r, c = terrain.rc(lat, lon)
        pts.append((round(lon, 6), round(lat, 6), round(float(terrain.elev[r, c]), 1)))
    length = sum(math.hypot((q[0] - p[0]) * terrain.dx / terrain.step, (q[1] - p[1]) * terrain.dy / terrain.step)
                 for p, q in zip(pts, pts[1:])) * 1.10          # bends and fittings
    return pts, length


def hazen_williams_q(length_m, head_m, diameter_m, c):
    """Gravity flow (m3/s) in a full pipe: Q = 0.2785 C D^2.63 S^0.54 (SI units)."""
    if head_m <= 0 or length_m <= 0:
        return 0.0
    return 0.2785 * c * diameter_m ** 2.63 * (head_m / length_m) ** 0.54
