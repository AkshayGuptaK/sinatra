// src/lib/utils/fluidWebGL.ts

import {
  FLUID_PRESETS,
  type FluidStyle,
  type FluidStyleParams,
  VISUALIZER_TRANSFER_MAP,
} from "$lib/config/visualizer";
import type { SegmentAffectiveProfile } from "$lib/utils/visualizerPalette";
import type { DspVisualizerMetrics } from "$lib/core/dsp.svelte";

export interface FluidUpdateArgs {
  dsp: DspVisualizerMetrics;
  rms: number;
  profile: SegmentAffectiveProfile;
  isPlaying: boolean;
}

// ============================================================================
// GLSL Shaders (WebGL2 / ES 3.0)
// ============================================================================

const BASE_VS = `#version 300 es
  precision highp float;
  out vec2 vUv;
  void main() {
      float x = -1.0 + float((gl_VertexID & 1) << 2);
      float y = -1.0 + float((gl_VertexID & 2) << 1);
      vUv = vec2(x, y) * 0.5 + 0.5;
      gl_Position = vec4(x, y, 0.0, 1.0);
  }
  `;

const SPLAT_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uTarget;
  uniform vec2 uPoint;
  uniform vec3 uColor;
  uniform float uRadius; // Variance (sigma^2) in UV space: ~0.0008 - 0.0035
  uniform float uAspect;
  out vec4 fragColor;
  
  void main() {
      vec2 p = vUv - uPoint;
      p.x *= uAspect;
      float distSq = dot(p, p);
      float splat = exp(-distSq / max(uRadius, 0.00005));
      vec4 base = texture(uTarget, vUv);
      fragColor = base + vec4(uColor * splat, 0.0);
  }
  `;

const CURL_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uVelocity;
  uniform vec2 uTexelSize;
  out vec4 fragColor;
  
  void main() {
      float L = texture(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).y;
      float R = texture(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).y;
      float B = texture(uVelocity, vUv - vec2(0.0, uTexelSize.y)).x;
      float T = texture(uVelocity, vUv + vec2(0.0, uTexelSize.y)).x;
      float vorticity = R - L - T + B;
      fragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
  }
  `;

const VORTICITY_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uVelocity;
  uniform sampler2D uCurl;
  uniform vec2 uTexelSize;
  uniform float uCurlScale;
  uniform float uDt;
  uniform float uTime;
  out vec4 fragColor;
  
  // Subtle organic spatial noise to prevent symmetric artifacts
  float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  
  float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
      );
  }
  
  void main() {
      float L = texture(uCurl, vUv - vec2(uTexelSize.x, 0.0)).x;
      float R = texture(uCurl, vUv + vec2(uTexelSize.x, 0.0)).x;
      float B = texture(uCurl, vUv - vec2(0.0, uTexelSize.y)).x;
      float T = texture(uCurl, vUv + vec2(0.0, uTexelSize.y)).x;
      float C = texture(uCurl, vUv).x;
  
      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      force /= length(force) + 0.0001;
      force *= uCurlScale * C;
      force.y *= -1.0;
  
      // Gentle background ambient curl so smoke billows organically
      float n1 = noise(vUv * 4.5 + vec2(uTime * 0.15, -uTime * 0.1));
      float n2 = noise(vUv * 4.5 + vec2(-uTime * 0.12, uTime * 0.18));
      vec2 ambientDraft = (vec2(n1, n2) - 0.5) * 14.0;
  
      vec2 vel = texture(uVelocity, vUv).xy;
      vel += (force + ambientDraft) * uDt;
  
      // Soft wall containment near screen edges so plumes curl back inward
      vec2 edgeDist = min(vUv, 1.0 - vUv);
      float wallMask = smoothstep(0.01, 0.08, min(edgeDist.x, edgeDist.y));
      vel *= wallMask;
  
      fragColor = vec4(vel, 0.0, 1.0);
  }
  `;

const DIVERGENCE_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uVelocity;
  uniform vec2 uTexelSize;
  out vec4 fragColor;
  
  void main() {
      float L = texture(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).x;
      float R = texture(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).x;
      float B = texture(uVelocity, vUv - vec2(0.0, uTexelSize.y)).y;
      float T = texture(uVelocity, vUv + vec2(0.0, uTexelSize.y)).y;
  
      vec2 C = texture(uVelocity, vUv).xy;
      if (vUv.x - uTexelSize.x < 0.0) L = -C.x;
      if (vUv.x + uTexelSize.x > 1.0) R = -C.x;
      if (vUv.y - uTexelSize.y < 0.0) B = -C.y;
      if (vUv.y + uTexelSize.y > 1.0) T = -C.y;
  
      float div = 0.5 * (R - L + T - B);
      fragColor = vec4(div, 0.0, 0.0, 1.0);
  }
  `;

const CLEAR_PRESSURE_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uTexture;
  uniform float uValue;
  out vec4 fragColor;
  
  void main() {
      fragColor = uValue * texture(uTexture, vUv);
  }
  `;

const PRESSURE_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;
  uniform vec2 uTexelSize;
  out vec4 fragColor;
  
  void main() {
      float L = texture(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x;
      float R = texture(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
      float B = texture(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
      float T = texture(uPressure, vUv + vec2(0.0, uTexelSize.y)).x;
      float div = texture(uDivergence, vUv).x;
      float p = (L + R + B + T - div) * 0.25;
      fragColor = vec4(p, 0.0, 0.0, 1.0);
  }
  `;

const GRADIENT_SUB_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uVelocity;
  uniform sampler2D uPressure;
  uniform vec2 uTexelSize;
  out vec4 fragColor;
  
  void main() {
      float L = texture(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x;
      float R = texture(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
      float B = texture(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
      float T = texture(uPressure, vUv + vec2(0.0, uTexelSize.y)).x;
      vec2 vel = texture(uVelocity, vUv).xy;
      vel -= vec2(R - L, T - B) * 0.5;
      fragColor = vec4(vel, 0.0, 1.0);
  }
  `;

const ADVECT_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform vec2 uSimTexelSize; // Always 1.0 / simRes so velocity units match
  uniform float uDt;
  uniform float uDissipation;
  out vec4 fragColor;
  
  void main() {
      vec2 vel = texture(uVelocity, vUv).xy;
      vec2 coord = vUv - uDt * vel * uSimTexelSize;
      fragColor = uDissipation * texture(uSource, coord);
  }
  `;

const COMPOSITE_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uDye;
  uniform vec2 uDyeTexelSize;
  uniform float uEdgeSharpness;
  out vec4 fragColor;
  
  void main() {
      vec3 c = texture(uDye, vUv).rgb;
  
      // Spatial gradient for silky rim-lighting / 3D filament contours
      vec3 cR = texture(uDye, vUv + vec2(uDyeTexelSize.x * 2.0, 0.0)).rgb;
      vec3 cT = texture(uDye, vUv + vec2(0.0, uDyeTexelSize.y * 2.0)).rgb;
      float lumC = dot(c, vec3(0.299, 0.587, 0.114));
      float lumR = dot(cR, vec3(0.299, 0.587, 0.114));
      float lumT = dot(cT, vec3(0.299, 0.587, 0.114));
  
      vec2 grad = vec2(lumR - lumC, lumT - lumC) * 18.0;
      vec3 normal = normalize(vec3(-grad.x, -grad.y, 1.0));
      vec3 lightDir = normalize(vec3(0.35, 0.65, 0.7));
      float rim = pow(clamp(1.0 - normal.z, 0.0, 1.0), 1.6);
      float spec = pow(max(dot(normal, lightDir), 0.0), 12.0);
  
      vec3 fluid = c;
  
      // Add silky backlit filament edge sheen
      fluid += c * rim * 1.15 + vec3(spec * (0.06 + uEdgeSharpness * 0.25) * clamp(lumC * 2.0, 0.0, 1.0));
  
      // Liquid / Oil mode: apply smoothstep thresholding to simulate surface tension
      if (uEdgeSharpness > 0.01) {
          float density = length(fluid);
          float edge = smoothstep(0.08 * uEdgeSharpness, 0.35, density);
          fluid = mix(fluid, fluid * edge * 1.25, uEdgeSharpness);
      }
  
      // Filmic ACES / Reinhard Tone-Mapping (prevents white blowout while keeping rich saturation)
      vec3 toneMapped = (fluid * (2.51 * fluid + 0.03)) / (fluid * (2.43 * fluid + 0.59) + 0.14);
  
      // Deep charcoal void background (#07080c) blended with subtle vignette
      vec2 vigUv = vUv * (1.0 - vUv.yx);
      float vig = pow(vigUv.x * vigUv.y * 15.0, 0.18);
      vec3 bgVoid = vec3(0.024, 0.027, 0.042);
  
      float alpha = clamp(length(toneMapped) * 2.4, 0.0, 1.0);
      vec3 finalColor = mix(bgVoid, toneMapped * vig, alpha);
  
      fragColor = vec4(finalColor, 1.0);
  }
  `;

const PARTICLE_UPDATE_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uParticleTex;
  uniform sampler2D uVelocityTex;
  uniform vec2 uSimTexelSize;
  uniform float uDt;
  uniform float uTime;
  uniform vec2 uEmitterCenter;
  out vec4 fragColor;
  
  float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  
  void main() {
      vec4 pData = texture(uParticleTex, vUv);
      vec2 pos = pData.xy;
      float life = pData.z - uDt * 0.22;
  
      // Sample velocity in grid units and convert to UV displacement (matches dye advection!)
      vec2 vel = texture(uVelocityTex, pos).xy;
      pos += vel * uDt * uSimTexelSize;
  
      // Respawn particle inside active fluid zone when lifespan expires or off-screen
      if (pos.x < 0.02 || pos.x > 0.98 || pos.y < 0.02 || pos.y > 0.98 || life <= 0.0) {
          float seed = uTime * 1.37 + vUv.x * 19.1 + vUv.y * 47.3;
          float angle = hash(vUv + seed) * 6.2831853;
          float radius = sqrt(hash(vUv * 2.1 - seed)) * 0.28;
          pos = uEmitterCenter + vec2(cos(angle), sin(angle)) * radius;
          pos = clamp(pos, vec2(0.05), vec2(0.95));
          life = 0.4 + hash(pos + uTime) * 0.6;
      }
  
      fragColor = vec4(pos, life, pData.w);
  }
  `;

const PARTICLE_RENDER_VS = `#version 300 es
  precision highp float;
  uniform sampler2D uParticleTex;
  uniform sampler2D uDyeTex;
  uniform float uPointSize;
  uniform float uTreble;
  uniform float uParticleDensity;
  out vec4 vColor;
  
  void main() {
      int id = gl_VertexID;
      int texDim = 160;
      ivec2 coord = ivec2(id % texDim, id / texDim);
      vec4 pData = texelFetch(uParticleTex, coord, 0);
      vec2 pos = pData.xy;
      float life = pData.z;
      float phase = pData.w;
  
      gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
  
      // Sample dye color at particle position
      vec3 dye = texture(uDyeTex, pos).rgb;
      float lum = dot(dye, vec3(0.299, 0.587, 0.114));
  
      // Smooth fade-in and fade-out over particle life
      float lifeFade = sin(clamp(life, 0.0, 1.0) * 3.14159265);
  
      // Individual particle size variation + treble shimmer boost
      float sizeVar = 0.6 + phase * 1.1;
      gl_PointSize = uPointSize * sizeVar * (1.0 + uTreble * 2.2);
  
      // Particles trapped in dense smoke glow brightly; stray particles stay subtle
      float alpha = clamp(lum * 2.8, 0.03, 0.9) * lifeFade * uParticleDensity * (0.4 + uTreble * 0.8);
      vec3 sparkColor = mix(dye * 1.8, vec3(1.0, 0.97, 0.92), 0.35 + uTreble * 0.45);
      vColor = vec4(sparkColor, alpha);
  }
  `;

const PARTICLE_RENDER_FS = `#version 300 es
  precision mediump float;
  in vec4 vColor;
  out vec4 fragColor;
  
  void main() {
      vec2 coord = gl_PointCoord - vec2(0.5);
      float distSq = dot(coord, coord);
      if (distSq > 0.25) discard;
      float falloff = exp(-distSq * 14.0);
      fragColor = vec4(vColor.rgb, vColor.a * falloff);
  }
  `;

// ============================================================================
// Framebuffer Helpers
// ============================================================================

interface FboAttachment {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  width: number;
  height: number;
}

class DoubleFbo {
  read: FboAttachment;
  write: FboAttachment;

  constructor(read: FboAttachment, write: FboAttachment) {
    this.read = read;
    this.write = write;
  }

  swap() {
    const tmp = this.read;
    this.read = this.write;
    this.write = tmp;
  }
}

// ============================================================================
// Main WebGL2 Fluid & Particle Renderer
// ============================================================================

export class FluidRenderer {
  private gl: WebGL2RenderingContext;
  private dummyVao: WebGLVertexArrayObject;

  // Shader Programs
  private splatProg!: WebGLProgram;
  private curlProg!: WebGLProgram;
  private vorticityProg!: WebGLProgram;
  private divergenceProg!: WebGLProgram;
  private clearPressureProg!: WebGLProgram;
  private pressureProg!: WebGLProgram;
  private gradientSubProg!: WebGLProgram;
  private advectProg!: WebGLProgram;
  private compositeProg!: WebGLProgram;
  private particleUpdateProg!: WebGLProgram;
  private particleRenderProg!: WebGLProgram;

  // FBO Buffers
  private velocity!: DoubleFbo;
  private dye!: DoubleFbo;
  private pressure!: DoubleFbo;
  private divergence!: FboAttachment;
  private curl!: FboAttachment;
  private particles!: DoubleFbo;

  // Grid Dimensions
  private simRes = 256;
  private dyeRes = 1024;
  private particleRes = 160; // 25,600 particles

  // Animation & Interpolation State
  private styleParams: FluidStyleParams;
  private currentColors: { rgb: [number, number, number]; weight: number }[] =
    [];
  private currentArousal = 0.35;
  private lastTime = performance.now();
  private animTime = 0;
  private latestTreble = 0;
  private hasSeededInitialPlume = false;

  constructor(
    private canvas: HTMLCanvasElement,
    stylePreset: FluidStyle = "smoke"
  ) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      powerPreference: "high-performance",
    });

    if (!gl) {
      throw new Error("WebGL2 is not supported on this device.");
    }

    this.gl = gl;
    this.styleParams = FLUID_PRESETS[stylePreset] ?? FLUID_PRESETS.smoke;

    gl.getExtension("EXT_color_buffer_float");
    gl.getExtension("OES_texture_float_linear");

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Failed to create WebGL2 VAO");
    this.dummyVao = vao;
    gl.bindVertexArray(this.dummyVao);

    this.initPrograms();
    this.initBuffers();
    this.initParticles();
    this.resize();
  }

  // --------------------------------------------------------------------------
  // Program Initialization
  // --------------------------------------------------------------------------

  private createProgram(vsSource: string, fsSource: string): WebGLProgram {
    const gl = this.gl;
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(vs);
      gl.deleteShader(vs);
      throw new Error(`VS compile error: ${err}`);
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(fs);
      gl.deleteShader(fs);
      throw new Error(`FS compile error: ${err}`);
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const err = gl.getProgramInfoLog(prog);
      throw new Error(`Program link error: ${err}`);
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }

  private initPrograms() {
    this.splatProg = this.createProgram(BASE_VS, SPLAT_FS);
    this.curlProg = this.createProgram(BASE_VS, CURL_FS);
    this.vorticityProg = this.createProgram(BASE_VS, VORTICITY_FS);
    this.divergenceProg = this.createProgram(BASE_VS, DIVERGENCE_FS);
    this.clearPressureProg = this.createProgram(BASE_VS, CLEAR_PRESSURE_FS);
    this.pressureProg = this.createProgram(BASE_VS, PRESSURE_FS);
    this.gradientSubProg = this.createProgram(BASE_VS, GRADIENT_SUB_FS);
    this.advectProg = this.createProgram(BASE_VS, ADVECT_FS);
    this.compositeProg = this.createProgram(BASE_VS, COMPOSITE_FS);
    this.particleUpdateProg = this.createProgram(BASE_VS, PARTICLE_UPDATE_FS);
    this.particleRenderProg = this.createProgram(
      PARTICLE_RENDER_VS,
      PARTICLE_RENDER_FS
    );
  }

  // --------------------------------------------------------------------------
  // Buffer Allocations
  // --------------------------------------------------------------------------

  private createFboAttachment(
    w: number,
    h: number,
    linear = true
  ): FboAttachment {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const filter = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      w,
      h,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null
    );

    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      tex,
      0
    );
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return { fbo, tex, width: w, height: h };
  }

  private createDoubleFbo(w: number, h: number, linear = true): DoubleFbo {
    return new DoubleFbo(
      this.createFboAttachment(w, h, linear),
      this.createFboAttachment(w, h, linear)
    );
  }

  private initBuffers() {
    this.velocity = this.createDoubleFbo(this.simRes, this.simRes, true);
    this.pressure = this.createDoubleFbo(this.simRes, this.simRes, false);
    this.dye = this.createDoubleFbo(this.dyeRes, this.dyeRes, true);
    this.divergence = this.createFboAttachment(this.simRes, this.simRes, false);
    this.curl = this.createFboAttachment(this.simRes, this.simRes, false);
    this.particles = this.createDoubleFbo(
      this.particleRes,
      this.particleRes,
      false
    );
  }

  private initParticles() {
    const gl = this.gl;
    const count = this.particleRes * this.particleRes;
    const initialData = new Float32Array(count * 4);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 0.35;
      initialData[i * 4 + 0] = 0.5 + Math.cos(angle) * r; // X
      initialData[i * 4 + 1] = 0.5 + Math.sin(angle) * r; // Y
      initialData[i * 4 + 2] = Math.random(); // Lifespan [0, 1]
      initialData[i * 4 + 3] = Math.random(); // Size/Shimmer Phase
    }

    for (const attach of [this.particles.read, this.particles.write]) {
      gl.bindTexture(gl.TEXTURE_2D, attach.tex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA32F,
        this.particleRes,
        this.particleRes,
        0,
        gl.RGBA,
        gl.FLOAT,
        initialData
      );
    }
  }

  public setStylePreset(preset: FluidStyle) {
    if (FLUID_PRESETS[preset]) {
      this.styleParams = FLUID_PRESETS[preset];
    }
  }

  public resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  // --------------------------------------------------------------------------
  // Update & Multi-Jet Splat Injection
  // --------------------------------------------------------------------------

  public update(args: FluidUpdateArgs) {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.025);
    this.lastTime = now;

    const { dsp, rms, profile, isPlaying } = args;
    this.latestTreble = dsp.trebleEnergy ?? 0;

    // 1. Smoothly interpolate segment colors and arousal (2-second exponential ease)
    const lerpFactor = 1.0 - Math.exp(-dt / 0.65);
    this.currentArousal +=
      (profile.arousalScore - this.currentArousal) * lerpFactor;

    if (this.currentColors.length === 0 && profile.colors.length > 0) {
      this.currentColors = profile.colors.map((c) => ({
        rgb: [...c.rgb],
        weight: c.weight,
      }));
    } else if (profile.colors.length > 0) {
      for (let i = 0; i < profile.colors.length; i++) {
        const target = profile.colors[i];
        if (!this.currentColors[i]) {
          this.currentColors[i] = {
            rgb: [...target.rgb],
            weight: target.weight,
          };
        } else {
          this.currentColors[i].rgb[0] +=
            (target.rgb[0] - this.currentColors[i].rgb[0]) * lerpFactor;
          this.currentColors[i].rgb[1] +=
            (target.rgb[1] - this.currentColors[i].rgb[1]) * lerpFactor;
          this.currentColors[i].rgb[2] +=
            (target.rgb[2] - this.currentColors[i].rgb[2]) * lerpFactor;
          this.currentColors[i].weight +=
            (target.weight - this.currentColors[i].weight) * lerpFactor;
        }
      }
      if (this.currentColors.length > profile.colors.length) {
        this.currentColors.length = profile.colors.length;
      }
    }

    const aspect = this.canvas.width / Math.max(1, this.canvas.height);

    // Seed an initial aesthetic smoke bloom on first mount so paused view isn't empty black
    if (!this.hasSeededInitialPlume && this.currentColors.length > 0) {
      this.seedInitialPlume(aspect);
      this.hasSeededInitialPlume = true;
    }

    // When paused, allow fluid to gently coast with very slow ambient drift
    const simDt = isPlaying ? dt : dt * 0.12;
    this.animTime += simDt * (0.7 + this.currentArousal * 0.8);

    if (isPlaying) {
      this.injectAudioJets(dsp, Math.max(0.12, rms), aspect);
    }

    // Step Navier-Stokes solver and passive particles
    this.stepSimulation(simDt, isPlaying ? dsp.spectralFlux : 0);
    this.updateParticles(simDt);
  }

  /**
   * Injects opposing, weaving ribbon jets whose colors & volumes are proportional
   * to the segment's dominant emotions.
   */
  private injectAudioJets(
    dsp: DspVisualizerMetrics,
    rms: number,
    aspect: number
  ) {
    // Always use at least 2 counter-flowing streams so even a single-emotion segment
    // produces colliding, swirling ribbons rather than a single one-way puff
    const palette =
      this.currentColors.length > 0
        ? this.currentColors
        : [{ rgb: [0.06, 0.72, 0.5] as [number, number, number], weight: 1.0 }];

    const jets =
      palette.length === 1
        ? [
            { rgb: palette[0].rgb, weight: 0.55 },
            {
              rgb: [
                Math.min(1, palette[0].rgb[0] * 1.25 + 0.08),
                Math.min(1, palette[0].rgb[1] * 0.9 + 0.05),
                Math.min(1, palette[0].rgb[2] * 1.2 + 0.1),
              ] as [number, number, number],
              weight: 0.45,
            },
          ]
        : palette;

    const numJets = jets.length;
    const bassKick = VISUALIZER_TRANSFER_MAP.bassToImpulse(dsp.bassImpulse);
    const midEnergy =
      ((dsp.bands[2] ?? 0) + (dsp.bands[3] ?? 0) + (dsp.bands[4] ?? 0)) / 3;

    // Crisp filament radius (sigma^2 in UV space): ~0.0012 to 0.0032
    const baseSigmaSq = 0.0011 + rms * 0.0018;

    for (let i = 0; i < numJets; i++) {
      const jet = jets[i];
      const baseAngle = (i * 2.0 * Math.PI) / numJets + this.animTime * 0.38;

      // Lissajous-style orbital path so jets weave around the canvas
      const orbitR = 0.24 + 0.08 * Math.sin(this.animTime * 0.7 + i * 2.1);
      const x = 0.5 + Math.cos(baseAngle) * orbitR;
      const y = 0.5 + Math.sin(baseAngle * 1.3 + i) * orbitR;

      // Aim jet across the center with tangential curl + midrange melodic wave
      const toCenterX = 0.5 - x;
      const toCenterY = 0.5 - y;
      const tangentX = -toCenterY;
      const tangentY = toCenterX;

      const waveAngle =
        Math.sin(this.animTime * 2.4 + i * 1.7) * (0.55 + midEnergy * 0.9);
      const dirX =
        toCenterX * Math.cos(waveAngle) + tangentX * Math.sin(waveAngle);
      const dirY =
        toCenterY * Math.cos(waveAngle) + tangentY * Math.sin(waveAngle);
      const dirLen = Math.hypot(dirX, dirY) || 1.0;

      // Velocity in simulation grid units (160 - 650 units/sec)
      const speed =
        (160.0 + rms * 260.0 + bassKick * 12.0) * (0.65 + jet.weight * 0.7);
      const velX = (dirX / dirLen) * speed;
      const velY = (dirY / dirLen) * speed;

      const jetRadius = baseSigmaSq * (0.7 + jet.weight * 0.6);

      // 1. Splat Velocity Momentum
      this.splat(
        this.velocity.read.tex,
        this.velocity.write.fbo,
        this.simRes,
        this.simRes,
        [x, y],
        [velX, velY, 0.0],
        jetRadius * 1.4,
        aspect
      );
      this.velocity.swap();

      // 2. Splat Emotion Dye
      const intensity =
        (0.14 + rms * 0.24 + dsp.bassImpulse * 0.28) * (0.5 + jet.weight * 0.8);
      const dyeRgb: [number, number, number] = [
        jet.rgb[0] * intensity,
        jet.rgb[1] * intensity,
        jet.rgb[2] * intensity,
      ];

      this.splat(
        this.dye.read.tex,
        this.dye.write.fbo,
        this.dyeRes,
        this.dyeRes,
        [x, y],
        dyeRgb,
        jetRadius,
        aspect
      );
      this.dye.swap();
    }

    // 3. On strong bass kicks, fire a central shear vortex burst
    if (dsp.bassImpulse > 0.18) {
      const kickAngle = this.animTime * 3.1;
      const kickSpeed = dsp.bassImpulse * 420.0;
      const cx = 0.5 + Math.cos(kickAngle) * 0.06;
      const cy = 0.5 + Math.sin(kickAngle) * 0.06;

      this.splat(
        this.velocity.read.tex,
        this.velocity.write.fbo,
        this.simRes,
        this.simRes,
        [cx, cy],
        [
          -Math.sin(kickAngle) * kickSpeed,
          Math.cos(kickAngle) * kickSpeed,
          0.0,
        ],
        0.0035,
        aspect
      );
      this.velocity.swap();
    }
  }

  /**
   * Seeds an initial ribbon swirl so the visualizer looks alive immediately on open.
   */
  private seedInitialPlume(aspect: number) {
    const colA = this.currentColors[0]?.rgb ?? [0.96, 0.62, 0.04];
    const colB = this.currentColors[1]?.rgb ?? [0.66, 0.33, 0.97];

    for (let step = 0; step < 12; step++) {
      const t = step / 12;
      const angle = t * Math.PI * 2;
      const x1 = 0.32 + Math.cos(angle) * 0.12;
      const y1 = 0.45 + Math.sin(angle) * 0.12;
      const x2 = 0.68 - Math.cos(angle) * 0.12;
      const y2 = 0.55 - Math.sin(angle) * 0.12;

      this.splat(
        this.velocity.read.tex,
        this.velocity.write.fbo,
        this.simRes,
        this.simRes,
        [x1, y1],
        [280, 120, 0],
        0.0025,
        aspect
      );
      this.velocity.swap();
      this.splat(
        this.dye.read.tex,
        this.dye.write.fbo,
        this.dyeRes,
        this.dyeRes,
        [x1, y1],
        [colA[0] * 0.35, colA[1] * 0.35, colA[2] * 0.35],
        0.002,
        aspect
      );
      this.dye.swap();

      this.splat(
        this.velocity.read.tex,
        this.velocity.write.fbo,
        this.simRes,
        this.simRes,
        [x2, y2],
        [-280, -120, 0],
        0.0025,
        aspect
      );
      this.velocity.swap();
      this.splat(
        this.dye.read.tex,
        this.dye.write.fbo,
        this.dyeRes,
        this.dyeRes,
        [x2, y2],
        [colB[0] * 0.35, colB[1] * 0.35, colB[2] * 0.35],
        0.002,
        aspect
      );
      this.dye.swap();

      this.stepSimulation(0.016, 0.2);
    }
  }

  // --------------------------------------------------------------------------
  // Core Navier-Stokes Passes
  // --------------------------------------------------------------------------

  private splat(
    sourceTex: WebGLTexture,
    destFbo: WebGLFramebuffer,
    w: number,
    h: number,
    point: [number, number],
    color: [number, number, number],
    radius: number,
    aspect: number
  ) {
    const gl = this.gl;
    gl.viewport(0, 0, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, destFbo);
    gl.useProgram(this.splatProg);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTex);
    gl.uniform1i(gl.getUniformLocation(this.splatProg, "uTarget"), 0);
    gl.uniform2f(
      gl.getUniformLocation(this.splatProg, "uPoint"),
      point[0],
      point[1]
    );
    gl.uniform3f(
      gl.getUniformLocation(this.splatProg, "uColor"),
      color[0],
      color[1],
      color[2]
    );
    gl.uniform1f(gl.getUniformLocation(this.splatProg, "uRadius"), radius);
    gl.uniform1f(gl.getUniformLocation(this.splatProg, "uAspect"), aspect);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private stepSimulation(dt: number, spectralFlux: number) {
    const gl = this.gl;
    const simTexel = [1.0 / this.simRes, 1.0 / this.simRes];

    // --- A. Curl Pass ---
    gl.viewport(0, 0, this.simRes, this.simRes);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.curl.fbo);
    gl.useProgram(this.curlProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(gl.getUniformLocation(this.curlProg, "uVelocity"), 0);
    gl.uniform2f(
      gl.getUniformLocation(this.curlProg, "uTexelSize"),
      simTexel[0],
      simTexel[1]
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // --- B. Vorticity Confinement (Curling Smoke Tendrils) ---
    const fluxBoost = VISUALIZER_TRANSFER_MAP.fluxToVorticity(spectralFlux);
    const totalVorticity =
      (12.0 + this.currentArousal * 26.0 + fluxBoost) *
      this.styleParams.vorticityMultiplier;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.write.fbo);
    gl.useProgram(this.vorticityProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(gl.getUniformLocation(this.vorticityProg, "uVelocity"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.curl.tex);
    gl.uniform1i(gl.getUniformLocation(this.vorticityProg, "uCurl"), 1);
    gl.uniform2f(
      gl.getUniformLocation(this.vorticityProg, "uTexelSize"),
      simTexel[0],
      simTexel[1]
    );
    gl.uniform1f(
      gl.getUniformLocation(this.vorticityProg, "uCurlScale"),
      totalVorticity
    );
    gl.uniform1f(gl.getUniformLocation(this.vorticityProg, "uDt"), dt);
    gl.uniform1f(
      gl.getUniformLocation(this.vorticityProg, "uTime"),
      this.animTime
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.velocity.swap();

    // --- C. Divergence Pass ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.divergence.fbo);
    gl.useProgram(this.divergenceProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(gl.getUniformLocation(this.divergenceProg, "uVelocity"), 0);
    gl.uniform2f(
      gl.getUniformLocation(this.divergenceProg, "uTexelSize"),
      simTexel[0],
      simTexel[1]
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // --- D. Dissipate Previous Pressure (0.8) to prevent pressure lock ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pressure.write.fbo);
    gl.useProgram(this.clearPressureProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.tex);
    gl.uniform1i(gl.getUniformLocation(this.clearPressureProg, "uTexture"), 0);
    gl.uniform1f(gl.getUniformLocation(this.clearPressureProg, "uValue"), 0.8);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.pressure.swap();

    // --- E. Jacobi Pressure Solve (22 Iterations) ---
    gl.useProgram(this.pressureProg);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.divergence.tex);
    gl.uniform1i(gl.getUniformLocation(this.pressureProg, "uDivergence"), 1);
    gl.uniform2f(
      gl.getUniformLocation(this.pressureProg, "uTexelSize"),
      simTexel[0],
      simTexel[1]
    );

    for (let i = 0; i < 22; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.pressure.write.fbo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.tex);
      gl.uniform1i(gl.getUniformLocation(this.pressureProg, "uPressure"), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.pressure.swap();
    }

    // --- F. Subtract Pressure Gradient ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.write.fbo);
    gl.useProgram(this.gradientSubProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(gl.getUniformLocation(this.gradientSubProg, "uVelocity"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.tex);
    gl.uniform1i(gl.getUniformLocation(this.gradientSubProg, "uPressure"), 1);
    gl.uniform2f(
      gl.getUniformLocation(this.gradientSubProg, "uTexelSize"),
      simTexel[0],
      simTexel[1]
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.velocity.swap();

    // --- G. Velocity Advection ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.write.fbo);
    gl.useProgram(this.advectProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(gl.getUniformLocation(this.advectProg, "uVelocity"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(gl.getUniformLocation(this.advectProg, "uSource"), 1);
    gl.uniform2f(
      gl.getUniformLocation(this.advectProg, "uSimTexelSize"),
      simTexel[0],
      simTexel[1]
    );
    gl.uniform1f(gl.getUniformLocation(this.advectProg, "uDt"), dt);
    gl.uniform1f(
      gl.getUniformLocation(this.advectProg, "uDissipation"),
      this.styleParams.viscosity
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.velocity.swap();

    // --- H. High-Resolution Dye Advection (Uses uSimTexelSize for true speed!) ---
    gl.viewport(0, 0, this.dyeRes, this.dyeRes);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.dye.write.fbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(gl.getUniformLocation(this.advectProg, "uVelocity"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.tex);
    gl.uniform1i(gl.getUniformLocation(this.advectProg, "uSource"), 1);
    gl.uniform2f(
      gl.getUniformLocation(this.advectProg, "uSimTexelSize"),
      simTexel[0],
      simTexel[1]
    );
    gl.uniform1f(gl.getUniformLocation(this.advectProg, "uDt"), dt);
    gl.uniform1f(
      gl.getUniformLocation(this.advectProg, "uDissipation"),
      this.styleParams.dyeDissipation
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.dye.swap();
  }

  private updateParticles(dt: number) {
    const gl = this.gl;
    gl.viewport(0, 0, this.particleRes, this.particleRes);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.particles.write.fbo);
    gl.useProgram(this.particleUpdateProg);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.particles.read.tex);
    gl.uniform1i(
      gl.getUniformLocation(this.particleUpdateProg, "uParticleTex"),
      0
    );

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(
      gl.getUniformLocation(this.particleUpdateProg, "uVelocityTex"),
      1
    );

    gl.uniform2f(
      gl.getUniformLocation(this.particleUpdateProg, "uSimTexelSize"),
      1.0 / this.simRes,
      1.0 / this.simRes
    );
    gl.uniform1f(gl.getUniformLocation(this.particleUpdateProg, "uDt"), dt);
    gl.uniform1f(
      gl.getUniformLocation(this.particleUpdateProg, "uTime"),
      this.animTime
    );
    gl.uniform2f(
      gl.getUniformLocation(this.particleUpdateProg, "uEmitterCenter"),
      0.5 + Math.cos(this.animTime * 0.5) * 0.12,
      0.5 + Math.sin(this.animTime * 0.5) * 0.12
    );

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.particles.swap();
  }

  // --------------------------------------------------------------------------
  // Output Rendering (Composite & Particles)
  // --------------------------------------------------------------------------

  public draw(trebleOverride?: number) {
    const gl = this.gl;
    this.resize();

    const trebleEnergy = trebleOverride ?? this.latestTreble;

    // 1. Composite Silky Dye Layer to Screen Canvas
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);

    gl.useProgram(this.compositeProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.tex);
    gl.uniform1i(gl.getUniformLocation(this.compositeProg, "uDye"), 0);
    gl.uniform2f(
      gl.getUniformLocation(this.compositeProg, "uDyeTexelSize"),
      1.0 / this.dyeRes,
      1.0 / this.dyeRes
    );
    gl.uniform1f(
      gl.getUniformLocation(this.compositeProg, "uEdgeSharpness"),
      this.styleParams.edgeSharpness
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. Additive Stardust Particle Pass
    const effectiveDensity =
      this.styleParams.particleDensity * (0.25 + this.currentArousal * 0.75);
    if (effectiveDensity > 0.01) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

      const sparkle = VISUALIZER_TRANSFER_MAP.trebleToSparkle(trebleEnergy);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      gl.useProgram(this.particleRenderProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.particles.read.tex);
      gl.uniform1i(
        gl.getUniformLocation(this.particleRenderProg, "uParticleTex"),
        0
      );

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.dye.read.tex);
      gl.uniform1i(
        gl.getUniformLocation(this.particleRenderProg, "uDyeTex"),
        1
      );

      gl.uniform1f(
        gl.getUniformLocation(this.particleRenderProg, "uPointSize"),
        2.0 * dpr * sparkle.sizeMultiplier
      );
      gl.uniform1f(
        gl.getUniformLocation(this.particleRenderProg, "uTreble"),
        trebleEnergy
      );
      gl.uniform1f(
        gl.getUniformLocation(this.particleRenderProg, "uParticleDensity"),
        effectiveDensity * sparkle.alphaMultiplier
      );

      const totalParticles = this.particleRes * this.particleRes;
      gl.drawArrays(gl.POINTS, 0, totalParticles);

      gl.disable(gl.BLEND);
    }
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  public destroy() {
    const gl = this.gl;
    const deleteDouble = (dfbo: DoubleFbo) => {
      gl.deleteFramebuffer(dfbo.read.fbo);
      gl.deleteFramebuffer(dfbo.write.fbo);
      gl.deleteTexture(dfbo.read.tex);
      gl.deleteTexture(dfbo.write.tex);
    };

    deleteDouble(this.velocity);
    deleteDouble(this.dye);
    deleteDouble(this.pressure);
    deleteDouble(this.particles);

    gl.deleteFramebuffer(this.divergence.fbo);
    gl.deleteTexture(this.divergence.tex);
    gl.deleteFramebuffer(this.curl.fbo);
    gl.deleteTexture(this.curl.tex);

    const progs = [
      this.splatProg,
      this.curlProg,
      this.vorticityProg,
      this.divergenceProg,
      this.clearPressureProg,
      this.pressureProg,
      this.gradientSubProg,
      this.advectProg,
      this.compositeProg,
      this.particleUpdateProg,
      this.particleRenderProg,
    ];
    for (const p of progs) gl.deleteProgram(p);
    gl.deleteVertexArray(this.dummyVao);
  }
}
