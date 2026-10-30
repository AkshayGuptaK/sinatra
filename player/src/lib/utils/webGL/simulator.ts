import {
  BASE_VS,
  SPLAT_FS,
  CURL_FS,
  VORTICITY_FS,
  DIVERGENCE_FS,
  CLEAR_PRESSURE_FS,
  PRESSURE_FS,
  GRADIENT_SUB_FS,
  ADVECT_FS,
  COMPOSITE_FS,
  PARTICLE_UPDATE_FS,
  PARTICLE_RENDER_FS,
  PARTICLE_RENDER_VS,
} from "$lib/utils/webGL/shaders";

// ============================================================================
// Internal Framebuffer Helpers
// ============================================================================

interface FboAttachment {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  width: number;
  height: number;
}

class DoubleFbo {
  constructor(public read: FboAttachment, public write: FboAttachment) {}

  swap() {
    const tmp = this.read;
    this.read = this.write;
    this.write = tmp;
  }
}

// ============================================================================
// LAYER 1: FluidSimulationEngine (WebGL2 Shader & Buffer Pipeline)
// ============================================================================

export class FluidSimulationEngine {
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

  // Framebuffer Attachments
  private velocity!: DoubleFbo;
  private dye!: DoubleFbo;
  private pressure!: DoubleFbo;
  private divergence!: FboAttachment;
  private curl!: FboAttachment;
  private particles!: DoubleFbo;

  // Resolutions
  readonly simRes = 256;
  readonly dyeRes = 1024;
  readonly particleRes = 160; // 25,600 particles

  constructor(private canvas: HTMLCanvasElement) {
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
  // Program & Buffer Setup
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

  private initBuffers() {
    this.velocity = new DoubleFbo(
      this.createFboAttachment(this.simRes, this.simRes, true),
      this.createFboAttachment(this.simRes, this.simRes, true)
    );
    this.pressure = new DoubleFbo(
      this.createFboAttachment(this.simRes, this.simRes, false),
      this.createFboAttachment(this.simRes, this.simRes, false)
    );
    this.dye = new DoubleFbo(
      this.createFboAttachment(this.dyeRes, this.dyeRes, true),
      this.createFboAttachment(this.dyeRes, this.dyeRes, true)
    );
    this.divergence = this.createFboAttachment(this.simRes, this.simRes, false);
    this.curl = this.createFboAttachment(this.simRes, this.simRes, false);
    this.particles = new DoubleFbo(
      this.createFboAttachment(this.particleRes, this.particleRes, false),
      this.createFboAttachment(this.particleRes, this.particleRes, false)
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

  // --------------------------------------------------------------------------
  // Canvas Geometry & Sizing
  // --------------------------------------------------------------------------

  public resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  public getAspect(): number {
    return this.canvas.width / Math.max(1, this.canvas.height);
  }

  // --------------------------------------------------------------------------
  // Splatting Primitives
  // --------------------------------------------------------------------------

  private splatInternal(
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

  public splatVelocity(
    point: [number, number],
    velocity: [number, number],
    radius: number,
    aspect: number
  ) {
    this.splatInternal(
      this.velocity.read.tex,
      this.velocity.write.fbo,
      this.simRes,
      this.simRes,
      point,
      [velocity[0], velocity[1], 0.0],
      radius,
      aspect
    );
    this.velocity.swap();
  }

  public splatDye(
    point: [number, number],
    color: [number, number, number],
    radius: number,
    aspect: number
  ) {
    this.splatInternal(
      this.dye.read.tex,
      this.dye.write.fbo,
      this.dyeRes,
      this.dyeRes,
      point,
      color,
      radius,
      aspect
    );
    this.dye.swap();
  }

  // --------------------------------------------------------------------------
  // Simulation Steps
  // --------------------------------------------------------------------------

  public step(
    dt: number,
    time: number,
    totalVorticity: number,
    viscosity: number,
    dyeDissipation: number
  ) {
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

    // --- B. Vorticity Confinement ---
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
    gl.uniform1f(gl.getUniformLocation(this.vorticityProg, "uTime"), time);
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

    // --- D. Clear Pressure (Damp Previous Guess) ---
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
      viscosity
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.velocity.swap();

    // --- H. High-Resolution Dye Advection ---
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
      dyeDissipation
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.dye.swap();
  }

  public updateParticles(
    dt: number,
    time: number,
    emitterCenter: [number, number]
  ) {
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
    gl.uniform1f(gl.getUniformLocation(this.particleUpdateProg, "uTime"), time);
    gl.uniform2f(
      gl.getUniformLocation(this.particleUpdateProg, "uEmitterCenter"),
      emitterCenter[0],
      emitterCenter[1]
    );

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.particles.swap();
  }

  // --------------------------------------------------------------------------
  // Output Rendering
  // --------------------------------------------------------------------------

  public render(
    edgeSharpness: number,
    particleDensity: number,
    trebleEnergy: number,
    pointSize: number
  ) {
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
    gl.uniform2f(
      gl.getUniformLocation(this.compositeProg, "uDyeTexelSize"),
      1.0 / this.dyeRes,
      1.0 / this.dyeRes
    );
    gl.uniform1f(
      gl.getUniformLocation(this.compositeProg, "uEdgeSharpness"),
      edgeSharpness
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. Additive Stardust Particle Pass
    if (particleDensity > 0.01) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

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
        pointSize
      );
      gl.uniform1f(
        gl.getUniformLocation(this.particleRenderProg, "uTreble"),
        trebleEnergy
      );
      gl.uniform1f(
        gl.getUniformLocation(this.particleRenderProg, "uParticleDensity"),
        particleDensity
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
