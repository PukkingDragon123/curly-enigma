// Mine rendering: lit voxel chunks, ore overlays, cracks, sprites, particles, debris,
// falling blocks and fluids. Everything samples the shared light-grid texture.
import * as THREE from 'three';
import { B, BLOCKS, ORES, isSolid } from './blocks.js';
import { F, CHUNK } from './MineWorld.js';
import { buildBlockAtlas, buildSpriteAtlas } from './MineArt.js';
import { LAYER_OUTLINE } from '../core/Engine.js';

const LIGHT_GLSL = /* glsl */`
uniform sampler2D lightMap;
uniform vec2 worldSize;
uniform vec3 ambient;
uniform vec4 xray;
uniform float xrayOn;
uniform float time;
vec3 lightAt(vec2 wp) {
  vec2 uv = vec2(wp.x / worldSize.x, -wp.y / worldSize.y);
  return texture2D(lightMap, uv).rgb * 2.0;
}
float xrayMask(vec2 wp) {
  if (xrayOn < 0.5) return 0.0;
  vec2 d = wp - xray.xy;
  float r = length(d);
  if (r > xray.w) return 0.0;
  float a = atan(d.y, d.x);
  float da = abs(mod(a - xray.z + 3.14159265, 6.2831853) - 3.14159265);
  return smoothstep(0.5, 0.36, da) * smoothstep(xray.w, xray.w - 1.2, r) * smoothstep(0.2, 0.9, r);
}
float glowOf(float a) { return a < 0.97 ? clamp((0.97 - a) / 0.42, 0.0, 1.0) : 0.0; }
`;

export function makeUniforms(world) {
  return {
    lightMap: { value: null },
    worldSize: { value: new THREE.Vector2(world.W, world.H) },
    ambient: { value: new THREE.Color(0.05, 0.045, 0.06) },
    time: { value: 0 },
    hits: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(-99, -99, -10, 0)) },
    xray: { value: new THREE.Vector4(0, 0, 0, 0) },
    xrayOn: { value: 0 },
  };
}

function blockMaterial(U, map, { transparent = false, polygonOffset = 0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, map: { value: map } },
    vertexShader: /* glsl */`
      attribute float shade;
      attribute vec2 cell;
      uniform float time;
      uniform vec4 hits[4];
      varying vec2 vUv;
      varying float vShade;
      varying vec2 vWorld;
      void main() {
        vec3 p = position;
        for (int i = 0; i < 4; i++) {
          vec4 h = hits[i];
          if (h.w > 0.0 && abs(cell.x - h.x) < 0.1 && abs(cell.y - h.y) < 0.1) {
            float age = time - h.z;
            if (age >= 0.0 && age < 0.3) {
              float k = (1.0 - age / 0.3) * h.w;
              vec2 c = vec2(h.x + 0.5, -h.y - 0.5);
              p.xy = c + (p.xy - c) * (1.0 - 0.08 * k);
              p.x += sin(age * 80.0) * 0.05 * k;
              p.z += 0.05 * k;
            }
          }
        }
        vUv = uv;
        vShade = shade;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xy;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      ${LIGHT_GLSL}
      varying vec2 vUv;
      varying float vShade;
      varying vec2 vWorld;
      void main() {
        vec4 c = texture2D(map, vUv);
        if (c.a < 0.5) discard;
        float glow = glowOf(c.a);
        vec3 L = ambient + lightAt(vWorld);
        vec3 col = c.rgb * L * vShade + c.rgb * glow * 1.35;
        float xm = xrayMask(vWorld);
        if (xm > 0.0) {
          float scan = step(0.65, fract(vWorld.y * 5.0 - time * 2.5)) * 0.07;
          col = mix(col, vec3(0.02, 0.07, 0.1) + c.rgb * 0.1 + vec3(0.0, scan, scan * 1.3), xm * 0.82);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent,
    polygonOffset: polygonOffset !== 0,
    polygonOffsetFactor: polygonOffset,
    polygonOffsetUnits: polygonOffset,
  });
}

function oreMaterial(U, map) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, map: { value: map } },
    vertexShader: /* glsl */`
      attribute float shade;
      attribute vec2 cell;
      attribute float revealed;
      uniform float time;
      uniform vec4 hits[4];
      varying vec2 vUv;
      varying float vShade;
      varying vec2 vWorld;
      varying vec2 vCell;
      varying float vRev;
      void main() {
        vec3 p = position;
        for (int i = 0; i < 4; i++) {
          vec4 h = hits[i];
          if (h.w > 0.0 && abs(cell.x - h.x) < 0.1 && abs(cell.y - h.y) < 0.1) {
            float age = time - h.z;
            if (age >= 0.0 && age < 0.3) {
              float k = (1.0 - age / 0.3) * h.w;
              vec2 c = vec2(h.x + 0.5, -h.y - 0.5);
              p.xy = c + (p.xy - c) * (1.0 - 0.08 * k);
              p.x += sin(age * 80.0) * 0.05 * k;
              p.z += 0.05 * k;
            }
          }
        }
        vUv = uv; vShade = shade; vCell = cell; vRev = revealed;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xy;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      ${LIGHT_GLSL}
      varying vec2 vUv;
      varying float vShade;
      varying vec2 vWorld;
      varying vec2 vCell;
      varying float vRev;
      void main() {
        vec4 c = texture2D(map, vUv);
        if (c.a < 0.5) discard;
        float glow = glowOf(c.a);
        vec3 L = ambient + lightAt(vWorld);
        vec3 col = c.rgb * L * vShade + c.rgb * glow * 1.6;
        float lum = dot(c.rgb, vec3(0.3, 0.59, 0.11));
        float tw = pow(max(0.0, sin(time * 2.3 + vCell.x * 1.7 + vCell.y * 2.9 + vUv.x * 60.0)), 26.0);
        col += vec3(1.0, 0.97, 0.86) * tw * step(0.5, lum) * (0.35 + min(1.2, length(L)) * 0.8);
        float xm = xrayMask(vWorld);
        col += c.rgb * xm * 1.1 + vec3(0.1, 0.55, 0.65) * xm * 0.25;
        if (vRev > 0.5) col += vec3(0.04, 0.11, 0.13) * (0.6 + 0.4 * sin(time * 3.0 + vCell.x));
        gl_FragColor = vec4(col, 1.0);
      }`,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

// ---------------------------------------------------------------- quad builder
class QuadBuilder {
  constructor() { this.pos = []; this.uv = []; this.shade = []; this.cell = []; this.extra = []; this.idx = []; this.n = 0; }
  quad(p, uv, shade, cx, cy, extra = 0) {
    // p: 4 corners [x,y,z] CCW; uv: [u0,v0,u1,v1]; shade: number or [4] per-corner
    const [u0, v0, u1, v1] = uv;
    for (const c of p) this.pos.push(c[0], c[1], c[2]);
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    for (let k = 0; k < 4; k++) { this.shade.push(typeof shade === 'number' ? shade : shade[k]); this.cell.push(cx, cy); this.extra.push(extra); }
    const v = this.n * 4;
    this.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    this.n++;
  }
  geometry(extraName) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('shade', new THREE.Float32BufferAttribute(this.shade, 1));
    g.setAttribute('cell', new THREE.Float32BufferAttribute(this.cell, 2));
    if (extraName) g.setAttribute(extraName, new THREE.Float32BufferAttribute(this.extra, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------- sprite batch
export class SpriteBatch {
  constructor(U, map, cap = 1600, { additive = false, depthWrite = true } = {}) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 12);
    this.uv = new Float32Array(cap * 8);
    this.tint = new Float32Array(cap * 16);
    this.lit = new Float32Array(cap * 4);
    this.sway = new Float32Array(cap * 4);
    const idx = new Uint32Array(cap * 6);
    for (let i = 0; i < cap; i++) { const v = i * 4; idx.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6); }
    const g = new THREE.BufferGeometry();
    const mk = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', mk(this.pos, 3));
    g.setAttribute('uv', mk(this.uv, 2));
    g.setAttribute('tint', mk(this.tint, 4));
    g.setAttribute('lit', mk(this.lit, 1));
    g.setAttribute('sway', mk(this.sway, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { ...U, map: { value: map } },
      vertexShader: /* glsl */`
        attribute vec4 tint;
        attribute float lit;
        attribute float sway;
        uniform float time;
        varying vec2 vUv;
        varying vec4 vTint;
        varying float vLit;
        varying vec2 vWorld;
        void main() {
          vec3 p = position;
          p.x += sin(time * 1.7 + position.x * 1.9 + position.y * 1.3) * 0.07 * sway;
          vUv = uv; vTint = tint; vLit = lit;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorld = wp.xy;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D map;
        ${LIGHT_GLSL}
        varying vec2 vUv;
        varying vec4 vTint;
        varying float vLit;
        varying vec2 vWorld;
        void main() {
          vec4 c = texture2D(map, vUv);
          if (c.a < 0.5) discard;
          float glow = glowOf(c.a);
          vec3 L = mix(vec3(1.0), ambient + lightAt(vWorld), vLit);
          vec3 col = c.rgb * vTint.rgb * L + c.rgb * vTint.rgb * glow * 1.4;
          float xm = xrayMask(vWorld);
          col += c.rgb * xm * 0.4;
          gl_FragColor = vec4(col, vTint.a);
        }`,
      transparent: true,
      depthWrite,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.n = 0;
  }
  begin() { this.n = 0; }
  /**
   * Add a quad. x,y = world center; w,h size; uvr = [u0,v0,u1,v1]; opts: z, rot, flipX, flipY, tint [r,g,b,a], lit, sway, anchor ('center'|'bottom'|'top')
   */
  add(x, y, w, h, uvr, o = {}) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    const z = o.z ?? 0.1;
    let oy = 0;
    if (o.anchor === 'bottom') oy = h / 2;
    else if (o.anchor === 'top') oy = -h / 2;
    const hw = w / 2, hh = h / 2;
    const cs = Math.cos(o.rot || 0), sn = Math.sin(o.rot || 0);
    const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    for (let k = 0; k < 4; k++) {
      const [cx, cy] = corners[k];
      const yy = cy + oy;
      this.pos[i * 12 + k * 3] = x + cx * cs - yy * sn;
      this.pos[i * 12 + k * 3 + 1] = y + cx * sn + yy * cs;
      this.pos[i * 12 + k * 3 + 2] = z;
    }
    let [u0, v0, u1, v1] = uvr;
    if (o.flipX) [u0, u1] = [u1, u0];
    if (o.flipY) [v0, v1] = [v1, v0];
    this.uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
    const t = o.tint || [1, 1, 1, 1];
    for (let k = 0; k < 4; k++) {
      this.tint.set(t.length === 4 ? t : [t[0], t[1], t[2], 1], i * 16 + k * 4);
      this.lit[i * 4 + k] = o.lit ?? 1;
      // only the top vertices sway (or bottom for ceiling plants)
      const top = o.swayTop === false ? (k < 2 ? 1 : 0) : (k >= 2 ? 1 : 0);
      this.sway[i * 4 + k] = (o.sway || 0) * top;
    }
  }
  end() {
    const g = this.geo;
    for (const k of ['position', 'uv', 'tint', 'lit', 'sway']) g.attributes[k].needsUpdate = true;
    g.setDrawRange(0, this.n * 6);
  }
}

// ---------------------------------------------------------------- particles (square pixel points)
export class Particles {
  constructor(U, cap = 2500, additive = false) {
    this.cap = cap;
    this.p = []; // particle objects
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.uPx = { value: 300 };
    this.mat = new THREE.ShaderMaterial({
      uniforms: { ...U, pxScale: this.uPx, litMode: { value: additive ? 0 : 1 } },
      vertexShader: /* glsl */`
        attribute float size;
        attribute vec4 pcolor;
        uniform float pxScale;
        varying vec4 vCol;
        varying vec2 vWorld;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1.0, floor(size * pxScale / -mv.z + 0.5));
          vCol = pcolor;
          vWorld = (modelMatrix * vec4(position, 1.0)).xy;
        }`,
      fragmentShader: /* glsl */`
        ${LIGHT_GLSL}
        uniform float litMode;
        varying vec4 vCol;
        varying vec2 vWorld;
        void main() {
          vec3 L = litMode > 0.5 ? ambient * 2.0 + lightAt(vWorld) : vec3(1.0);
          gl_FragColor = vec4(vCol.rgb * L, vCol.a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }
  /** Spawn: {x,y,z,vx,vy,vz,life,size,color:[r,g,b],alpha,grav,drag,grow,fade} */
  spawn(o) {
    if (this.p.length >= this.cap) this.p.shift();
    this.p.push({ z: 0.2, vx: 0, vy: 0, vz: 0, grav: 0, drag: 0.5, grow: 0, alpha: 1, fade: true, ...o, t: 0 });
  }
  update(dt, collide) {
    const ps = this.p;
    let n = 0;
    for (let i = 0; i < ps.length; i++) {
      const q = ps[i];
      q.t += dt;
      if (q.t >= q.life) continue;
      q.vy -= q.grav * dt;
      const d = Math.max(0, 1 - q.drag * dt);
      q.vx *= d; q.vy *= d; q.vz *= d;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (collide && q.collide && collide(q)) { q.vy *= -0.2; q.vx *= 0.5; }
      q.size += q.grow * dt;
      ps[n++] = q;
    }
    ps.length = n;
    for (let i = 0; i < n; i++) {
      const q = ps[i];
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
      const k = q.t / q.life;
      const a = q.fade ? q.alpha * (1 - k * k) : q.alpha;
      const c = q.color;
      this.col[i * 4] = c[0]; this.col[i * 4 + 1] = c[1]; this.col[i * 4 + 2] = c[2]; this.col[i * 4 + 3] = a;
      this.size[i] = q.size;
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.pcolor.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- instanced cubes (debris & falling blocks)
function cubeMaterial(U, map) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, map: { value: map || null }, useMap: { value: map ? 1 : 0 } },
    vertexShader: /* glsl */`
      attribute vec4 tile;
      varying vec2 vUv;
      varying vec3 vColor;
      varying vec2 vWorld;
      varying float vShade;
      void main() {
        mat4 im = mat4(1.0);
        #ifdef USE_INSTANCING
          im = instanceMatrix;
        #endif
        vec4 wp = modelMatrix * im * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix * im) * normal);
        vShade = 0.55 + 0.45 * max(0.0, dot(n, normalize(vec3(0.25, 0.75, 0.6))));
        vColor = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vColor = instanceColor;
        #endif
        vUv = mix(tile.xy, tile.zw, uv);
        vWorld = (modelMatrix * im * vec4(0.0, 0.0, 0.0, 1.0)).xy;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      uniform float useMap;
      ${LIGHT_GLSL}
      varying vec2 vUv;
      varying vec3 vColor;
      varying vec2 vWorld;
      varying float vShade;
      void main() {
        vec3 base = vColor;
        float glow = 0.0;
        if (useMap > 0.5) { vec4 c = texture2D(map, vUv); base *= c.rgb; glow = glowOf(c.a); }
        vec3 L = ambient * 1.5 + lightAt(vWorld);
        gl_FragColor = vec4(base * L * vShade + base * glow * 1.3, 1.0);
      }`,
  });
}

export class CubeSwarm {
  constructor(U, cap, map = null) {
    this.cap = cap;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const tiles = new Float32Array(cap * 4);
    for (let i = 0; i < cap; i++) tiles.set([0, 0, 1, 1], i * 4);
    geo.setAttribute('tile', new THREE.InstancedBufferAttribute(tiles, 4));
    this.tiles = geo.attributes.tile;
    this.mesh = new THREE.InstancedMesh(geo, cubeMaterial(U, map), cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.s = new THREE.Vector3();
    this.p = new THREE.Vector3();
    this.c = new THREE.Color();
  }
  set(i, x, y, z, rx, ry, rz, size, color, tile) {
    this.e.set(rx, ry, rz);
    this.q.setFromEuler(this.e);
    this.s.set(size, size, size);
    this.p.set(x, y, z);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(i, this.m);
    if (color !== undefined) { this.c.setHex(color); this.mesh.setColorAt(i, this.c); }
    if (tile) this.tiles.setXYZW(i, tile[0], tile[1], tile[2], tile[3]);
  }
  commit(n) {
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.tiles.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- the renderer
export class MineRenderer {
  constructor(scene3, world, lighting) {
    this.scene = scene3;
    this.w = world;
    this.L = lighting;
    this.U = makeUniforms(world);
    this.U.lightMap.value = lighting.tex;
    this.blockAtlas = buildBlockAtlas();
    this.spriteAtlas = buildSpriteAtlas();
    this.matBlock = blockMaterial(this.U, this.blockAtlas.tex);
    this.matOre = oreMaterial(this.U, this.spriteAtlas.tex);
    this.matOverlay = blockMaterial(this.U, this.blockAtlas.tex, { transparent: true, polygonOffset: -2 });
    this.chunks = new Map();
    this.root = new THREE.Group();
    scene3.add(this.root);

    this.sprites = new SpriteBatch(this.U, this.spriteAtlas.tex, 2200);
    this.glowSprites = new SpriteBatch(this.U, this.spriteAtlas.tex, 400, { additive: true, depthWrite: false });
    this.sprites.mesh.renderOrder = 2;
    this.glowSprites.mesh.renderOrder = 5;
    this.root.add(this.sprites.mesh, this.glowSprites.mesh);

    this.dust = new Particles(this.U, 2200, false);
    this.glow = new Particles(this.U, 1600, true);
    this.dust.points.renderOrder = 6;
    this.glow.points.renderOrder = 7;
    this.root.add(this.dust.points, this.glow.points);

    this.debris = new CubeSwarm(this.U, 700);
    this.debris.mesh.layers.enable(LAYER_OUTLINE);
    this.root.add(this.debris.mesh);
    this.fallers = new CubeSwarm(this.U, 96, this.blockAtlas.tex);
    this.fallers.mesh.layers.enable(LAYER_OUTLINE);
    this.root.add(this.fallers.mesh);

    // overlays: cracks + selection
    this.overlay = new THREE.Mesh(new THREE.BufferGeometry(), this.matOverlay);
    this.overlay.renderOrder = 3;
    this.overlay.frustumCulled = false;
    this.root.add(this.overlay);
    this.selMat = new THREE.MeshBasicMaterial({ map: this.blockAtlas.tex, transparent: true, depthTest: true, color: 0xffffff, alphaTest: 0.5 });
    this.sel = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 1.06), this.selMat);
    const su = this.blockAtlas.uv(this.blockAtlas.selIdx);
    const uvs = this.sel.geometry.attributes.uv;
    uvs.setXY(0, su[0], su[3]); uvs.setXY(1, su[2], su[3]); uvs.setXY(2, su[0], su[1]); uvs.setXY(3, su[2], su[1]);
    this.sel.renderOrder = 8;
    this.root.add(this.sel);

    // fluids
    this.fluidGeo = new THREE.BufferGeometry();
    this.fluidMat = new THREE.ShaderMaterial({
      uniforms: { ...this.U },
      vertexShader: /* glsl */`
        attribute vec3 fdata;
        uniform float time;
        varying vec3 vData;
        varying vec2 vWorld;
        void main() {
          vec3 p = position;
          if (fdata.y > 0.5) p.y += sin(time * (fdata.x > 1.5 ? 1.2 : 2.6) + p.x * 2.3) * (fdata.x > 1.5 ? 0.025 : 0.035);
          vData = fdata;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorld = wp.xy;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        ${LIGHT_GLSL}
        varying vec3 vData;
        varying vec2 vWorld;
        void main() {
          vec3 col; float a;
          if (vData.x < 1.5) {
            vec3 L = ambient + lightAt(vWorld);
            float surf = smoothstep(0.85, 1.0, vData.z);
            float ripple = 0.5 + 0.5 * sin(vWorld.x * 6.0 + time * 1.7) * sin(vWorld.y * 5.0 - time * 1.3);
            col = vec3(0.14, 0.38, 0.82) * (L * 0.85 + 0.05) + vec3(0.25, 0.5, 0.7) * L * (surf * 0.8 + ripple * 0.12);
            a = 0.56 + surf * 0.2;
            if (vData.y > 0.5 && vData.z > 0.0) {}
          } else {
            float n = sin(vWorld.x * 2.7 + time * 1.1) * sin(vWorld.y * 3.1 - time * 0.8) * 0.5 + 0.5;
            float n2 = sin(vWorld.x * 7.0 - time * 2.0 + vWorld.y * 4.0) * 0.5 + 0.5;
            col = mix(vec3(0.85, 0.2, 0.04), vec3(1.0, 0.72, 0.18), n * 0.7 + n2 * 0.3) * 1.25;
            a = 0.96;
          }
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.fluidMesh = new THREE.Mesh(this.fluidGeo, this.fluidMat);
    this.fluidMesh.renderOrder = 9;
    this.fluidMesh.frustumCulled = false;
    this.root.add(this.fluidMesh);
  }

  tileUV(blockId, variant) {
    const list = this.blockAtlas.index[blockId] || this.blockAtlas.index[B.STONE];
    return this.blockAtlas.uv(list[variant % list.length]);
  }

  // ------------------------------------------------------------ chunks
  buildChunk(cx, cy) {
    const w = this.w;
    const key = cx + ',' + cy;
    const old = this.chunks.get(key);
    if (old) {
      this.root.remove(old.block, old.ore);
      old.block.geometry.dispose();
      old.ore.geometry.dispose();
    }
    const qb = new QuadBuilder();
    const qo = new QuadBuilder();
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const sx = w.shaftX;
    for (let y = y0; y < Math.min(w.H, y0 + CHUNK); y++) {
      for (let x = x0; x < Math.min(w.W, x0 + CHUNK); x++) {
        if (x < 0 || y < 0) continue;
        const i = w.idx(x, y);
        const b = w.block[i];
        const X0 = x, X1 = x + 1, Y0 = -y - 1, Y1 = -y;
        if (isSolid(b)) {
          const uv = this.tileUV(b, w.variant[i]);
          qb.quad([[X0, Y0, 0.5], [X1, Y0, 0.5], [X1, Y1, 0.5], [X0, Y1, 0.5]], uv, 1, x, y);
          if (!w.solid(x, y - 1)) qb.quad([[X0, Y1, 0.5], [X1, Y1, 0.5], [X1, Y1, -0.5], [X0, Y1, -0.5]], uv, 0.92, x, y);
          if (!w.solid(x, y + 1)) qb.quad([[X0, Y0, -0.5], [X1, Y0, -0.5], [X1, Y0, 0.5], [X0, Y0, 0.5]], uv, 0.5, x, y);
          if (!w.solid(x - 1, y)) qb.quad([[X0, Y0, -0.5], [X0, Y0, 0.5], [X0, Y1, 0.5], [X0, Y1, -0.5]], uv, 0.7, x, y);
          if (!w.solid(x + 1, y)) qb.quad([[X1, Y0, 0.5], [X1, Y0, -0.5], [X1, Y1, -0.5], [X1, Y1, 0.5]], uv, 0.66, x, y);
          if (w.ore[i]) {
            const exposed = w.exposed(x, y);
            if (exposed || (w.flags[i] & F.REVEALED)) {
              const tiles = this.spriteAtlas.ore[w.ore[i]];
              if (tiles) {
                const ouv = this.spriteAtlas.uv(tiles[(x + y) & 1]);
                qo.quad([[X0, Y0, 0.503], [X1, Y0, 0.503], [X1, Y1, 0.503], [X0, Y1, 0.503]], ouv, 1, x, y, exposed ? 0 : 1);
              }
            }
          }
        } else {
          const bb = x === sx ? B.TIMBER : (w.back[i] || B.STONE);
          const uv = this.tileUV(bb, w.variant[i] + 1);
          const base = x === sx ? 0.42 : 0.27;
          // corner occlusion: back-wall corners tucked against solid rock are darker
          const S = (dx, dy) => (w.solid(x + dx, y + dy) ? 1 : 0);
          const ao = (a, b, c) => base * (1 - 0.22 * (a + b) - 0.12 * (a && b ? 1 : c));
          const l = S(-1, 0), r = S(1, 0), u = S(0, -1), d = S(0, 1);
          const sh = [ao(l, d, S(-1, 1)), ao(r, d, S(1, 1)), ao(r, u, S(1, -1)), ao(l, u, S(-1, -1))];
          qb.quad([[X0, Y0, -0.5], [X1, Y0, -0.5], [X1, Y1, -0.5], [X0, Y1, -0.5]], uv, sh, x, y);
        }
      }
    }
    const block = new THREE.Mesh(qb.geometry(), this.matBlock);
    const ore = new THREE.Mesh(qo.geometry('revealed'), this.matOre);
    block.frustumCulled = false;
    ore.frustumCulled = false;
    block.renderOrder = 0;
    ore.renderOrder = 1;
    this.root.add(block, ore);
    this.chunks.set(key, { block, ore });
  }

  /** Build/refresh chunks around the camera. Limit rebuilds per frame. */
  updateChunks(cx0, cy0, cx1, cy1, maxBuilds = 8) {
    let built = 0;
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        if (cx < 0 || cy < 0 || cx * CHUNK >= this.w.W || cy * CHUNK >= this.w.H) continue;
        const key = cx + ',' + cy;
        if (!this.chunks.has(key) || this.w.dirty.has(key)) {
          if (built >= maxBuilds && this.chunks.has(key)) continue;
          this.buildChunk(cx, cy);
          this.w.dirty.delete(key);
          built++;
        }
      }
    // hide far chunks (keep them cached)
    for (const [key, ch] of this.chunks) {
      const [cx, cy] = key.split(',').map(Number);
      const vis = cx >= cx0 - 1 && cx <= cx1 + 1 && cy >= cy0 - 1 && cy <= cy1 + 1;
      ch.block.visible = vis;
      ch.ore.visible = vis;
    }
  }

  // ------------------------------------------------------------ cracks overlay
  updateOverlay(damaged, target) {
    const qb = new QuadBuilder();
    const w = this.w;
    const cs = this.blockAtlas.crackStart;
    for (const i of damaged) {
      const x = i % w.W, y = Math.floor(i / w.W);
      const max = w.maxHp(x, y);
      if (!max || !isFinite(max) || !BLOCKS[w.block[i]] || !isSolid(w.block[i])) continue;
      const k = 1 - w.hp[i] / max;
      if (k <= 0.02 && !w.stress[i]) continue;
      const stage = Math.min(4, Math.floor((w.stress[i] ? Math.max(k, 0.7) : k) * 5));
      const uv = this.blockAtlas.uv(cs + stage);
      const X0 = x, X1 = x + 1, Y0 = -y - 1, Y1 = -y;
      qb.quad([[X0, Y0, 0.506], [X1, Y0, 0.506], [X1, Y1, 0.506], [X0, Y1, 0.506]], uv, 1, x, y);
    }
    this.overlay.geometry.dispose();
    this.overlay.geometry = qb.geometry();
    if (target) {
      this.sel.visible = true;
      this.sel.position.set(target.x + 0.5, -target.y - 0.5, target.solid ? 0.52 : 0.0);
      this.selMat.color.setHex(target.ok ? 0xffffff : 0xff6a5a);
      this.selMat.opacity = 0.55 + Math.sin(performance.now() / 160) * 0.25;
    } else this.sel.visible = false;
  }

  // ------------------------------------------------------------ fluids
  updateFluids(x0, y0, x1, y1) {
    const w = this.w;
    const pos = [], fd = [], idx = [];
    let n = 0;
    for (let y = Math.max(0, y0); y <= Math.min(w.H - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(w.W - 1, x1); x++) {
        const i = w.idx(x, y);
        const f = w.fluid[i];
        if (f < 0.02) continue;
        const t = w.ftype[i];
        const above = y > 0 && w.fluid[i - w.W] > 0.02 && w.ftype[i - w.W] === t;
        const lvl = above ? 1 : Math.min(1, f);
        const X0 = x, X1 = x + 1, Y0 = -y - 1, Y1 = -y - 1 + lvl;
        const z = 0.32;
        pos.push(X0, Y0, z, X1, Y0, z, X1, Y1, z, X0, Y1, z);
        const top = above ? 0 : 1;
        fd.push(t, 0, 0, t, 0, 0, t, top, 1, t, top, 1);
        const v = n * 4;
        idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
        n++;
      }
    this.fluidGeo.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('fdata', new THREE.Float32BufferAttribute(fd, 3));
    g.setIndex(idx);
    this.fluidGeo = g;
    this.fluidMesh.geometry = g;
  }

  setHit(slot, x, y, t, strength = 1) {
    this.U.hits.value[slot % 4].set(x, y, t, strength);
  }

  dispose() {
    for (const ch of this.chunks.values()) { ch.block.geometry.dispose(); ch.ore.geometry.dispose(); }
    this.chunks.clear();
  }
}
