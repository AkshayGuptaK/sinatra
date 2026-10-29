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
  // Full-screen triangle covering [-1, 1] without vertex buffer
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
  uniform float uRadius;
  uniform float uAspect;
  out vec4 fragColor;
  
  void main() {
      vec2 p = vUv - uPoint;
      p.x *= uAspect;
      float distSq = dot(p, p);
      float splat = exp(-distSq / max(uRadius, 0.0001));
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
      float curl = (R - L) - (T - B);
      fragColor = vec4(curl * 0.5, 0.0, 0.0, 1.0);
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
  out vec4 fragColor;
  
  void main() {
      float L = texture(uCurl, vUv - vec2(uTexelSize.x, 0.0)).x;
      float R = texture(uCurl, vUv + vec2(uTexelSize.x, 0.0)).x;
      float B = texture(uCurl, vUv - vec2(0.0, uTexelSize.y)).x;
      float T = texture(uCurl, vUv + vec2(0.0, uTexelSize.y)).x;
      float C = texture(uCurl, vUv).x;
  
      vec2 force = vec2(abs(T) - abs(B), abs(R) - abs(L));
      float len = length(force) + 0.00001;
      force = (force / len) * vec2(1.0, -1.0) * C * uCurlScale;
  
      vec2 vel = texture(uVelocity, vUv).xy;
      fragColor = vec4(vel + force * uDt, 0.0, 1.0);
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
      float div = 0.5 * ((R - L) + (T - B));
      fragColor = vec4(div, 0.0, 0.0, 1.0);
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
  uniform vec2 uTexelSize;
  uniform float uDt;
  uniform float uDissipation;
  out vec4 fragColor;
  
  void main() {
      vec2 vel = texture(uVelocity, vUv).xy;
      vec2 coord = vUv - vel * uDt * uTexelSize;
      fragColor = uDissipation * texture(uSource, coord);
  }
  `;

const COMPOSITE_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uDye;
  uniform float uEdgeSharpness;
  out vec4 fragColor;
  
  void main() {
      vec4 dye = texture(uDye, vUv);
      float density = length(dye.rgb);
  
      // Liquid/Oil mode: apply smoothstep thresholding to simulate surface tension
      vec3 fluid = dye.rgb;
      if (uEdgeSharpness > 0.01) {
          float edge = smoothstep(0.12 * uEdgeSharpness, 0.38, density);
          fluid = mix(fluid, fluid * edge, uEdgeSharpness);
      }
  
      // Reinhard Tone-Mapping prevents luminance blowout on overlapping plumes
      vec3 toneMapped = fluid / (1.0 + fluid * 0.45);
  
      // Deep charcoal background void (#07080c)
      vec3 bgVoid = vec3(0.027, 0.031, 0.047);
      vec3 finalColor = mix(bgVoid, toneMapped, clamp(density * 1.8, 0.0, 1.0));
      fragColor = vec4(finalColor, 1.0);
  }
  `;

const PARTICLE_UPDATE_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uParticleTex;
  uniform sampler2D uVelocityTex;
  uniform float uDt;
  uniform float uTime;
  out vec4 fragColor;
  
  float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  
  void main() {
      vec4 pData = texture(uParticleTex, vUv);
      vec2 pos = pData.xy;
      float life = pData.z - uDt * 0.25;
  
      // Sample velocity from fluid grid
      vec2 vel = texture(uVelocityTex, pos).xy;
      pos += vel * uDt * 0.35;
  
      // Respawn particle if it leaves canvas bounds or lifespan ends
      if (pos.x < 0.01 || pos.x > 0.99 || pos.y < 0.01 || pos.y > 0.99 || life <= 0.0) {
          float seed = uTime + vUv.x * 17.0 + vUv.y * 31.0;
          pos = vec2(0.5 + (hash(vUv + seed) - 0.5) * 0.4, 0.5 + (hash(vUv - seed) - 0.5) * 0.4);
          life = 0.5 + hash(pos + uTime) * 0.5;
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
      int texDim = 160; // 160 x 160 = 25,600 particles
      ivec2 coord = ivec2(id % texDim, id / texDim);
      vec4 pData = texelFetch(uParticleTex, coord, 0);
      vec2 pos = pData.xy;
  
      gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
  
      // Dye color at particle position
      vec3 dye = texture(uDyeTex, pos).rgb;
      float lum = dot(dye, vec3(0.299, 0.587, 0.114));
  
      gl_PointSize = uPointSize * (1.0 + uTreble * 2.4);
  
      // Alpha shimmer scales with treble transients and dye presence
      float alpha = clamp(lum * 2.6 + 0.08, 0.0, 0.85) * uParticleDensity * (0.35 + uTreble * 0.65);
      vec3 sparkColor = mix(vec3(0.9, 0.95, 1.0), dye * 1.6, clamp(lum * 1.8, 0.0, 1.0));
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
      float falloff = smoothstep(0.25, 0.02, distSq);
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
  private currentArousal = 0.2;
  private lastTime = performance.now();
  private animTime = 0;

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

    // WebGL2 Float Buffer Support
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
      initialData[i * 4 + 0] = Math.random(); // X [0, 1]
      initialData[i * 4 + 1] = Math.random(); // Y [0, 1]
      initialData[i * 4 + 2] = Math.random(); // Lifespan [0, 1]
      initialData[i * 4 + 3] = Math.random(); // Phase
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
    const width = Math.floor(this.canvas.clientWidth * dpr);
    const height = Math.floor(this.canvas.clientHeight * dpr);

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  // --------------------------------------------------------------------------
  // Update & Splat Injection
  // --------------------------------------------------------------------------

  public update(args: FluidUpdateArgs) {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.033);
    this.lastTime = now;
    if (args.isPlaying) this.animTime += dt;

    const { dsp, rms, profile, isPlaying } = args;

    // 1. Smoothly interpolate segment colors and arousal (2-second exponential ease)
    const lerpFactor = 1.0 - Math.exp(-dt / 0.7);
    this.currentArousal +=
      (profile.arousalScore - this.currentArousal) * lerpFactor;

    if (this.currentColors.length === 0) {
      this.currentColors = profile.colors.map((c) => ({
        rgb: [...c.rgb],
        weight: c.weight,
      }));
    } else {
      // Re-balance or smoothly adjust active palette weights
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

    if (!isPlaying) return;

    // 2. Audio-to-Physics Transfer
    const impulseForce = VISUALIZER_TRANSFER_MAP.bassToImpulse(dsp.bassImpulse);
    const emissionRadius = VISUALIZER_TRANSFER_MAP.rmsToEmissionRadius(rms);
    const flowSpeed = VISUALIZER_TRANSFER_MAP.rmsToFlowSpeed(rms);

    const aspect = this.canvas.width / (this.canvas.height || 1);
    const numEmitters = Math.max(1, this.currentColors.length);

    // 3. Inject dye & velocity at proportional emitter coordinates
    for (let i = 0; i < numEmitters; i++) {
      const col = this.currentColors[i] ?? this.currentColors[0];
      const angleOffset = (i * 2.0 * Math.PI) / numEmitters;
      const orbitSpeed = 0.45 * flowSpeed;
      const orbitRadius = 0.16 + rms * 0.12;

      // Emitter position drifts smoothly with melody/mid-bands
      const midDrift = (dsp.bands[2] - dsp.bands[3]) * 0.1;
      const x =
        0.5 +
        Math.cos(this.animTime * orbitSpeed + angleOffset + midDrift) *
          orbitRadius;
      const y =
        0.5 +
        Math.sin(this.animTime * orbitSpeed + angleOffset) *
          (orbitRadius / aspect);

      // Radial outward momentum vector
      const dirX = (x - 0.5) * (4.0 + impulseForce);
      const dirY = (y - 0.5) * (4.0 + impulseForce);

      // Splat velocity
      this.splat(
        this.velocity.read.tex,
        this.velocity.write.fbo,
        this.simRes,
        this.simRes,
        [x, y],
        [dirX, dirY, 0.0],
        emissionRadius * 0.65,
        aspect
      );
      this.velocity.swap();

      // Splat dye with proportional mass
      const dyeAmount = (0.8 + rms * 1.5) * col.weight;
      const rgbDye: [number, number, number] = [
        col.rgb[0] * dyeAmount,
        col.rgb[1] * dyeAmount,
        col.rgb[2] * dyeAmount,
      ];

      this.splat(
        this.dye.read.tex,
        this.dye.write.fbo,
        this.dyeRes,
        this.dyeRes,
        [x, y],
        rgbDye,
        emissionRadius,
        aspect
      );
      this.dye.swap();
    }

    // 4. Step Fluid Physics Simulation
    this.stepSimulation(dt, dsp.spectralFlux);

    // 5. Advect Lagrangian Dust Particles
    this.updateParticles(dt);
  }

  // --------------------------------------------------------------------------
  // Simulation Steps
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
    const texel = [1.0 / this.simRes, 1.0 / this.simRes];

    // --- A. Curl Pass ---
    gl.viewport(0, 0, this.simRes, this.simRes);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.curl.fbo);
    gl.useProgram(this.curlProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(gl.getUniformLocation(this.curlProg, "uVelocity"), 0);
    gl.uniform2f(
      gl.getUniformLocation(this.curlProg, "uTexelSize"),
      texel[0],
      texel[1]
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // --- B. Vorticity Confinement (Curling Tendrils) ---
    const fluxTurbulence =
      VISUALIZER_TRANSFER_MAP.fluxToVorticity(spectralFlux);
    const totalVorticity =
      (2.0 + this.currentArousal * 28.0 + fluxTurbulence) *
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
      texel[0],
      texel[1]
    );
    gl.uniform1f(
      gl.getUniformLocation(this.vorticityProg, "uCurlScale"),
      totalVorticity
    );
    gl.uniform1f(gl.getUniformLocation(this.vorticityProg, "uDt"), dt);
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
      texel[0],
      texel[1]
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // --- D. Pressure Solve (18 Jacobi Iterations) ---
    gl.useProgram(this.pressureProg);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.divergence.tex);
    gl.uniform1i(gl.getUniformLocation(this.pressureProg, "uDivergence"), 1);
    gl.uniform2f(
      gl.getUniformLocation(this.pressureProg, "uTexelSize"),
      texel[0],
      texel[1]
    );

    for (let i = 0; i < 18; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.pressure.write.fbo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.tex);
      gl.uniform1i(gl.getUniformLocation(this.pressureProg, "uPressure"), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.pressure.swap();
    }

    // --- E. Gradient Subtraction ---
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
      texel[0],
      texel[1]
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.velocity.swap();

    // --- F. Velocity Advection ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.write.fbo);
    gl.useProgram(this.advectProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(gl.getUniformLocation(this.advectProg, "uVelocity"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(gl.getUniformLocation(this.advectProg, "uSource"), 1);
    gl.uniform2f(
      gl.getUniformLocation(this.advectProg, "uTexelSize"),
      texel[0],
      texel[1]
    );
    gl.uniform1f(gl.getUniformLocation(this.advectProg, "uDt"), dt);
    gl.uniform1f(
      gl.getUniformLocation(this.advectProg, "uDissipation"),
      this.styleParams.viscosity
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.velocity.swap();

    // --- G. Dye Advection (High-Res Mesh) ---
    const dyeTexel = [1.0 / this.dyeRes, 1.0 / this.dyeRes];
    gl.viewport(0, 0, this.dyeRes, this.dyeRes);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.dye.write.fbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(gl.getUniformLocation(this.advectProg, "uVelocity"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.tex);
    gl.uniform1i(gl.getUniformLocation(this.advectProg, "uSource"), 1);
    gl.uniform2f(
      gl.getUniformLocation(this.advectProg, "uTexelSize"),
      dyeTexel[0],
      dyeTexel[1]
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

    gl.uniform1f(gl.getUniformLocation(this.particleUpdateProg, "uDt"), dt);
    gl.uniform1f(
      gl.getUniformLocation(this.particleUpdateProg, "uTime"),
      this.animTime
    );

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.particles.swap();
  }

  // --------------------------------------------------------------------------
  // Output Rendering (Composite & Particles)
  // --------------------------------------------------------------------------

  public draw(trebleEnergy = 0) {
    const gl = this.gl;
    this.resize();

    // 1. Composite Dye Layer to Screen Canvas
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);

    gl.useProgram(this.compositeProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.tex);
    gl.uniform1i(gl.getUniformLocation(this.compositeProg, "uDye"), 0);
    gl.uniform1f(
      gl.getUniformLocation(this.compositeProg, "uEdgeSharpness"),
      this.styleParams.edgeSharpness
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. Additive Stardust Particle Pass
    if (this.styleParams.particleDensity > 0.01) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // Additive luminous blend

      const sparkle = VISUALIZER_TRANSFER_MAP.trebleToSparkle(trebleEnergy);

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
        1.8 * sparkle.sizeMultiplier
      );
      gl.uniform1f(
        gl.getUniformLocation(this.particleRenderProg, "uTreble"),
        trebleEnergy
      );
      gl.uniform1f(
        gl.getUniformLocation(this.particleRenderProg, "uParticleDensity"),
        this.styleParams.particleDensity * sparkle.alphaMultiplier
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
