import * as THREE from 'three';
import { PALETTE, hexToRgb01 } from './palette.js';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAG = (n) => /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tUI;
uniform vec3 palette[${n}];
uniform float exposure;
uniform float ditherAmount;
uniform float quantize;
uniform float time;
uniform float grain;
uniform float vignette;
uniform float fade;      // scene only, toward black
uniform float fadeAll;   // scene and UI, toward black
uniform vec3 tint;
uniform float tintAmount;
uniform vec2 resolution;
uniform float drunk;     // 0..1: wobble + double vision on the scene (not the UI)
uniform float haze;      // 0..1: smoky warm haze over the scene
uniform float pixelSize; // scene pixels are this many UI pixels wide (chunkier look)
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  const float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return m[i.x + i.y * 4] / 16.0;
}
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec3 raw;
  if (drunk > 0.001) {
    vec2 uv = vUv + vec2(sin(vUv.y * 7.0 + time * 1.3), cos(vUv.x * 5.0 + time * 1.05)) * 0.007 * drunk;
    vec2 ghost = vec2(sin(time * 0.71), cos(time * 0.53)) * vec2(0.018, 0.008) * drunk;
    raw = mix(texture(tScene, uv).rgb, texture(tScene, uv + ghost).rgb, 0.45 * min(1.0, drunk * 1.4));
  } else {
    raw = texture(tScene, vUv).rgb;
  }
  vec3 c = toSRGB(aces(raw * exposure));
  c = mix(c, vec3(0.42, 0.36, 0.32), haze * 0.35 * (0.8 + 0.2 * sin(time * 0.9 + vUv.y * 3.0)));
  // film look: vignette and animated grain (dark corners, crawling noise)
  vec2 d = (vUv - 0.5) * vec2(resolution.x / resolution.y, 1.0);
  c *= 1.0 - vignette * dot(d, d) * 1.6;
  vec2 px = floor(gl_FragCoord.xy / pixelSize);
  c += (hash(px + floor(time * 24.0) * 17.0) - 0.5) * grain;
  c *= 1.0 - fade;
  c = mix(c, tint, tintAmount);
  vec3 outc = c;
  if (quantize > 0.5) {
    c += (bayer4(px) - 0.5) * ditherAmount;
    float bd = 1e9;
    for (int i = 0; i < ${n}; i++) {
      vec3 d = c - palette[i];
      float dist = dot(d * d, vec3(0.30, 0.59, 0.11));
      if (dist < bd) { bd = dist; outc = palette[i]; }
    }
  }
  vec4 ui = texture(tUI, vUv);
  outc = mix(outc, ui.rgb, step(0.5, ui.a));
  gl_FragColor = vec4(outc * (1.0 - fadeAll), 1.0);
}`;

/**
 * Renders a scene at a low internal resolution, snaps it to the palette with ordered
 * dithering, overlays the pixel UI on the same grid, and lets the browser upscale the
 * canvas with nearest-neighbour at an integer scale.
 */
export class PixelRenderer {
  constructor({ container = document.body, targetHeight = 360 } = {}) {
    this.targetHeight = targetHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap; // hard-edged shadows
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'game';
    container.appendChild(this.canvas);

    this.sceneTarget = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
    });

    this.uiCanvas = document.createElement('canvas');
    this.uiTexture = new THREE.CanvasTexture(this.uiCanvas);
    this.uiTexture.minFilter = THREE.NearestFilter;
    this.uiTexture.magFilter = THREE.NearestFilter;
    this.uiTexture.generateMipmaps = false;

    this.post = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.sceneTarget.texture },
        tUI: { value: this.uiTexture },
        palette: { value: PALETTE.map((h) => new THREE.Vector3(...hexToRgb01(h))) },
        exposure: { value: 1.0 },
        ditherAmount: { value: 0.045 },
        quantize: { value: 1 },
        time: { value: 0 },
        grain: { value: 0.045 },
        vignette: { value: 0.55 },
        fade: { value: 0 },
        fadeAll: { value: 0 },
        tint: { value: new THREE.Vector3(0.35, 0.02, 0.03) },
        tintAmount: { value: 0 },
        resolution: { value: new THREE.Vector2(1, 1) },
        drunk: { value: 0 },
        haze: { value: 0 },
        pixelSize: { value: 1 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG(PALETTE.length),
      depthTest: false,
      depthWrite: false,
    });
    // The upscale pass is a bare mesh (not a Scene) so scene inspectors only see the game scene.
    this.postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    this.postQuad.frustumCulled = false;
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.width = 0;
    this.height = 0;
    this.scale = 1;
    this.pixelSize = 1;
    this.onResize = null;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Pick an integer scale so the internal height lands near targetHeight and fills the window. */
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const devW = Math.floor(window.innerWidth * dpr);
    const devH = Math.floor(window.innerHeight * dpr);
    const scale = Math.max(1, Math.floor(devH / this.targetHeight));
    const w = Math.max(64, Math.floor(devW / scale));
    const h = Math.max(36, Math.floor(devH / scale));
    this.scale = scale;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${(w * scale) / dpr}px`;
    this.canvas.style.height = `${(h * scale) / dpr}px`;
    this.sceneTarget.setSize(Math.ceil(w / this.pixelSize), Math.ceil(h / this.pixelSize));
    this.post.uniforms.resolution.value.set(w, h);
    this.uiCanvas.width = w;
    this.uiCanvas.height = h;
    this.uiTexture.dispose(); // size changed: reallocate on next upload
    this.uiTexture.needsUpdate = true;
    this.onResize?.(w, h);
  }

  /** Convert a mouse event to internal pixel coordinates. */
  toPixel(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: Math.floor(((clientX - r.left) / r.width) * this.width),
      y: Math.floor(((clientY - r.top) / r.height) * this.height),
    };
  }

  /** Render the 3D scene with chunkier pixels (n UI pixels per scene pixel); the UI stays sharp. */
  setPixelSize(n) {
    if (n === this.pixelSize) return;
    this.pixelSize = n;
    this.post.uniforms.pixelSize.value = n;
    this.sceneTarget.setSize(Math.ceil(this.width / n), Math.ceil(this.height / n));
  }

  render(scene, camera) {
    const r = this.renderer;
    this.post.uniforms.time.value = performance.now() / 1000;
    r.setRenderTarget(this.sceneTarget);
    r.clear();
    r.render(scene, camera);
    this.uiTexture.needsUpdate = true;
    r.setRenderTarget(null);
    r.render(this.postQuad, this.postCamera);
  }
}
