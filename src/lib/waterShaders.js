// Water and rain shaders shared by the 3D views.
export const NOISE = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
`;

export const RIBBON_VERT = `
attribute float aS; varying vec2 vUv; varying float vS;
void main(){ vUv=uv; vS=aS; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;

export const RIVER_FRAG = `
precision highp float;
uniform float uTime; uniform float uFlow; uniform sampler2D uField; uniform vec3 uTint; uniform float uUseField;
varying vec2 vUv; varying float vS;
${NOISE}
void main(){
  vec4 f = texture2D(uField, vec2(vS, 0.5));
  vec3 water = mix(uTint, f.rgb, uUseField);
  float dirty = f.a * uUseField;
  float across = abs(vUv.y - 0.5) * 2.0;
  vec2 q = vec2(vUv.x * 2.4 - uTime * uFlow, vUv.y * 2.6);
  float n = noise(q * 2.0) * 0.6 + noise(q * 5.0 + 3.1) * 0.4;
  float streak = smoothstep(0.58, 0.78, n);
  vec3 c = mix(water * 0.72, water, 1.0 - across * 0.7);
  c = mix(c, vec3(1.0), streak * (0.3 - 0.16 * dirty));
  float pulse = 0.5 + 0.5 * sin(uTime * 3.2 - vUv.x * 1.6);
  c += vec3(0.45, 0.06, 0.02) * dirty * pulse * 0.55;
  // Clean water takes a natural deep tone; pollution keeps its full colour so it stands out
  c = mix(c, c * vec3(0.5, 0.72, 0.8) + vec3(0.03, 0.05, 0.06), (1.0 - dirty) * uUseField);
  gl_FragColor = vec4(c, smoothstep(1.0, 0.6, across) * mix(0.78, 1.0, dirty));
}`;

/** A round pipe seen from above, with pulses of water moving along it. */
export const PIPE_FRAG = `
precision highp float;
uniform float uTime; uniform float uFlow; uniform vec3 uTint;
varying vec2 vUv;
void main(){
  float a = abs(vUv.y - 0.5) * 2.0;
  float round_ = sqrt(max(0.0, 1.0 - a * a));
  vec3 c = mix(vec3(0.12, 0.2, 0.42), vec3(0.74, 0.84, 0.97), round_ * round_);
  float band = smoothstep(0.03, 0.0, abs(fract(vUv.x * 0.09) - 0.5));
  c = mix(c, vec3(0.28, 0.36, 0.52), band * 0.7);
  float p = fract(vUv.x * 0.32 - uTime * uFlow * 0.55);
  float pulse = smoothstep(0.2, 0.0, abs(p - 0.5)) * step(0.001, uFlow) * round_;
  c = mix(c, uTint, pulse);
  gl_FragColor = vec4(c, smoothstep(1.0, 0.86, a));
}`;

export const RAIN_VERT = `
attribute float aSeed; uniform float uTime; uniform float uTop; varying float vA;
void main(){
  vec3 p = position;
  p.y = mod(p.y - uTime * (7.0 + aSeed * 3.0), uTop);
  vA = smoothstep(0.0, 0.6, p.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

export const RAIN_FRAG = `
precision highp float; uniform float uAmount; varying float vA;
void main(){ gl_FragColor = vec4(0.82, 0.9, 1.0, 0.55 * uAmount * vA); }`;

/** Write the river's colour along its length into a 256-pixel RGBA strip. Returns the last dirty pixel, or -1. */
export function paintRiver(px, field) {
  const n = field.turb.length;
  let lastDirty = -1;
  for (let i = 0; i < 256; i += 1) {
    const k = Math.min(n - 1, Math.round((i / 255) * (n - 1)));
    const t = Math.min(1, (field.turb[k] ?? 0) / 30);
    const o = Math.min(1, (field.orp[k] ?? 0) / 150);
    px.set([
      Math.min(255, (0.23 + 0.5 * t + 0.34 * o) * 255),
      Math.max(0, (0.66 - 0.32 * t - 0.46 * o) * 255),
      Math.max(0, (1 - 0.8 * t - 0.68 * o) * 255),
      Math.max(t, o) * 255,
    ], i * 4);
    if ((field.turb[k] ?? 0) > 3 || (field.orp[k] ?? 0) > 25) lastDirty = i;
  }
  return lastDirty;
}
