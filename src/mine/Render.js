// Mine rendering: the pixel terrain (Terrain.js), sprites, particles, small chip cubes,
// the target marker and fluids. Everything samples the shared light-grid texture.
import * as THREE from 'three';
import { buildSpriteAtlas32 } from './MineSprites.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { Terrain, LIGHT_GLSL } from './Terrain.js';
import { M } from './micro.js';

export function makeUniforms(world) {
  return {
    lightMap: { value: null },
    worldSize: { value: new THREE.Vector2(world.W, world.H) },
    ambient: { value: new THREE.Color(0.05, 0.045, 0.06) },
    time: { value: 0 },
    xray: { value: new THREE.Vector4(0, 0, 0, 0) },
    xrayOn: { value: 0 },
  };
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
  constructor(scene3, world, lighting, opts = {}) {
    this.scene = scene3;
    this.w = world;
    this.L = lighting;
    this.U = makeUniforms(world);
    this.U.lightMap.value = lighting.tex;
    this.spriteAtlas = buildSpriteAtlas32();
    this.root = new THREE.Group();
    scene3.add(this.root);
    this.terrain = new Terrain(this.root, world, this.U, { growth: opts.growth, speck: opts.speck });

    this.sprites = new SpriteBatch(this.U, this.spriteAtlas.tex, 2200);
    this.glowSprites = new SpriteBatch(this.U, this.spriteAtlas.tex, 400, { additive: true, depthWrite: false });
    this.sprites.mesh.renderOrder = 2;
    this.sprites.mesh.layers.enable(LAYER_OUTLINE);
    this.glowSprites.mesh.renderOrder = 5;
    this.root.add(this.sprites.mesh, this.glowSprites.mesh);

    this.dust = new Particles(this.U, 2600, false);
    this.glow = new Particles(this.U, 1800, true);
    this.dust.points.renderOrder = 6;
    this.glow.points.renderOrder = 7;
    this.root.add(this.dust.points, this.glow.points);

    // tiny chips (single pixels and crumbs) as instanced cubes
    this.debris = new CubeSwarm(this.U, 900);
    this.debris.mesh.layers.enable(LAYER_OUTLINE);
    this.root.add(this.debris.mesh);

    // target marker: a little pixel reticle on the rock where the tool will land
    const c = document.createElement('canvas');
    c.width = c.height = 11;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    for (const [x, y, w, h] of [[4, 0, 3, 3], [4, 8, 3, 3], [0, 4, 3, 3], [8, 4, 3, 3]]) g.fillRect(x, y, w, h);
    g.fillStyle = '#fff';
    for (const [x, y, w, h] of [[5, 0, 1, 3], [5, 8, 1, 3], [0, 5, 3, 1], [8, 5, 3, 1]]) g.fillRect(x, y, w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    this.markerMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
    this.marker = new THREE.Mesh(new THREE.PlaneGeometry(11 / M, 11 / M), this.markerMat);
    this.marker.renderOrder = 20;
    this.marker.visible = false;
    this.root.add(this.marker);

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
          vec2 px = floor(vWorld * 32.0);
          if (vData.x < 1.5) {
            vec3 L = ambient + lightAt(vWorld);
            float surf = smoothstep(0.9, 1.0, vData.z);
            float ripple = 0.5 + 0.5 * sin(px.x * 0.19 + time * 1.7) * sin(px.y * 0.16 - time * 1.3);
            col = vec3(0.12, 0.34, 0.78) * (L * 0.85 + 0.05) + vec3(0.25, 0.5, 0.7) * L * (surf * 0.9 + step(0.8, ripple) * 0.12);
            a = 0.58 + surf * 0.25;
          } else {
            float n = sin(px.x * 0.085 + time * 1.1) * sin(px.y * 0.097 - time * 0.8) * 0.5 + 0.5;
            float n2 = sin(px.x * 0.22 - time * 2.0 + px.y * 0.125) * 0.5 + 0.5;
            col = mix(vec3(0.85, 0.2, 0.04), vec3(1.0, 0.72, 0.18), floor((n * 0.7 + n2 * 0.3) * 4.0) / 4.0) * 1.25;
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

  /** Point the reticle at a pixel (or hide it). */
  setMarker(px, py, ok = true) {
    if (px === null || px === undefined) { this.marker.visible = false; return; }
    this.marker.visible = true;
    this.marker.position.set((px + 0.5) / M, -(py + 0.5) / M, 0.56);
    this.markerMat.color.setHex(ok ? 0xffffff : 0xff6a5a);
    this.markerMat.opacity = 0.65 + Math.sin(performance.now() / 140) * 0.25;
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
        const X0 = x, X1 = x + 1, Y0 = -y - 1, Y1 = -y - 1 + Math.round(lvl * M) / M;
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

  dispose() {
    this.terrain.dispose();
    this.spriteAtlas.tex.dispose();
    this.L.tex.dispose();
    this.fluidGeo.dispose();
    this.markerMat.map.dispose();
  }
}
