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

// Injects velocity momentum or colored dye into a target texture at a specific point on the canvas
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

// Computes curl of the velocity vector field
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

// Injects rotational force back into the velocity field so eddies don't die out due to numerical dissipation
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

// Computes divergence of the velocity vector field
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

// Scales down the existing pressure texture by a factor
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

// Builds a pressure field that counteracts compression, ensuring the fluid behaves like an incompressible physical substance
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

// Produces a divergence-free velocity field
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

// Carries the fluid and dye smoothly across the grid
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

// Composites the raw dye texture onto the screen with lighting, edge sharpening, tone mapping, and background blending
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

// Makes particles move as passive tracers carried along by the fluid currents
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

// Renders the particles as glowing, additive points
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

export {
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
};
