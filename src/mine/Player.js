// The mole in the mine: AABB platformer physics in grid space (y grows downward),
// wall climbing, swimming, lava, ice, webs, and the voxel character + held tool.
import * as THREE from 'three';
import { makeCharacter, playerSpec, uniqueMaterial } from '../gfx/characters.js';
import { VoxelGrid, voxelMesh } from '../gfx/Voxel.js';
import { B, BLOCKS } from './blocks.js';
import { F } from './MineWorld.js';
import { clamp } from '../core/util.js';
import { M } from './micro.js';

const STEP = 7; // pixels the mole steps up without jumping

export const P_W = 0.62;
export const P_H = 0.84;
const GRAV = 27;

export class Player {
  constructor(scene3, world, state) {
    this.w = world;
    this.state = state;
    this.x = world.spawn.x;
    this.y = world.spawn.y + 0.5 - P_H / 2;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.climbing = false;
    this.inWater = false;
    this.inLava = false;
    this.wall = 0;
    this.facing = 1;
    this.fallStart = this.y;
    this.hurtT = 0;
    this.stepT = 0;
    this.action = null; // 'swing' | 'chisel' | 'brush' | 'drill' | 'xray'
    this.actionT = 0;
    this.knock = { x: 0, y: 0 };
    this.rig = makeCharacter(playerSpec(), { kind: 'basic', scale: 0.6 });
    this.mat = uniqueMaterial(this.rig, 'basic');
    this.rig.root.position.z = 0;
    scene3.add(this.rig.root);
    this.tools = buildToolModels();
    this.heldKind = null;
  }

  get cx() { return this.x; }
  get cy() { return this.y; }
  get feetY() { return this.y + P_H / 2; }

  hold(kind) {
    if (this.heldKind === kind) return;
    this.heldKind = kind;
    const obj = kind && this.tools[kind] ? this.tools[kind] : null;
    if (obj) obj.traverse((o) => { if (o.isMesh) o.material = this.mat; });
    this.rig.holdItem(obj, 'R');
  }

  // ---------------------------------------------------------------- pixel collision
  /** Any solid pixel in the inclusive pixel rect? */
  rectSolid(x0, y0, x1, y1) {
    const w = this.w;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (w.psolid(x, y)) return true;
    return false;
  }
  box(x, y) {
    return [Math.floor((x - P_W / 2) * M + 0.001), Math.floor((y - P_H / 2) * M + 0.001), Math.ceil((x + P_W / 2) * M - 0.001) - 1, Math.ceil((y + P_H / 2) * M - 0.001) - 1];
  }
  overlapsSolid(x, y) {
    const [x0, y0, x1, y1] = this.box(x, y);
    return this.rectSolid(x0, y0, x1, y1);
  }

  moveX(dx) {
    this.wall = 0;
    if (!dx) return;
    const dir = Math.sign(dx);
    let left = Math.abs(dx) * M;
    while (left > 0) {
      const step = Math.min(1, left);
      left -= step;
      const nx = this.x + (dir * step) / M;
      const [x0, y0, x1, y1] = this.box(nx, this.y);
      const col = dir > 0 ? x1 : x0;
      if (!this.rectSolid(col, y0, col, y1)) { this.x = nx; continue; }
      // a low bump at the feet? step up onto it
      if (this.onGround || this.climbing) {
        let top = y0;
        while (top <= y1 && !this.w.psolid(col, top)) top++;
        const h = y1 - top + 1;
        if (h <= STEP && !this.rectSolid(x0, y0 - h, x1, y1 - h)) { this.x = nx; this.y -= h / M; this.stepped = true; continue; }
      }
      this.vx = 0;
      this.wall = dir;
      break;
    }
  }

  moveY(dy) {
    if (!dy) return false;
    const dir = Math.sign(dy);
    let left = Math.abs(dy) * M;
    while (left > 0) {
      const step = Math.min(1, left);
      left -= step;
      const ny = this.y + (dir * step) / M;
      const [x0, y0, x1, y1] = this.box(this.x, ny);
      const row = dir > 0 ? y1 : y0;
      if (!this.rectSolid(x0, row, x1, row)) { this.y = ny; continue; }
      if (dir > 0) return true;
      this.vy = 0;
      return false;
    }
    return false;
  }

  touchingWall(side) {
    const [x0, y0, x1, y1] = this.box(this.x, this.y);
    const col = side > 0 ? x1 + 2 : x0 - 2;
    let n = 0, tot = 0;
    for (let y = y0 + 3; y <= y1 - 3; y++) { tot++; if (this.w.psolid(col, y) || this.w.psolid(col - side, y)) n++; }
    return n >= tot * 0.35;
  }

  groundBlock() {
    const [x0, , x1, y1] = this.box(this.x, this.y);
    const w = this.w;
    for (let dy = 1; dy <= 3; dy++) for (let x = x0; x <= x1; x++) { const m = w.pmat(x, y1 + dy); if (m && m !== 255) return m >= 128 ? w.back[w.idx(Math.floor(this.x), Math.floor(this.y))] || B.STONE : m; }
    return B.AIR;
  }

  /** Returns events: {landed, fallDamage, splash} */
  update(dt, input, mods) {
    const w = this.w;
    const st = this.state;
    const ev = {};
    const ax = mods.frozen ? 0 : input.axisX();
    const up = !mods.frozen && input.isDown('KeyW', 'ArrowUp', 'Space');
    const upPressed = !mods.frozen && input.pressed('KeyW', 'ArrowUp', 'Space');
    const down = !mods.frozen && input.isDown('KeyS', 'ArrowDown');
    const run = input.isDown('ShiftLeft', 'ShiftRight');
    const boots = st.equipped('boots');
    const cellI = w.idx(clamp(Math.floor(this.x), 0, w.W - 1), clamp(Math.floor(this.y), 0, w.H - 1));
    const fl = w.fluid[cellI], ft = w.ftype[cellI];
    const wasWater = this.inWater;
    this.inWater = fl > 0.35 && ft === 1;
    this.inLava = fl > 0.25 && ft === 2;
    if (this.inWater && !wasWater && this.vy > 2) ev.splash = true;
    const web = (w.flags[cellI] & F.WEB) !== 0;

    let speed = (run ? 5.6 : 3.9) * (mods.speed || 1);
    if (this.inWater || this.inLava) speed *= 0.55;
    if (web) speed *= 0.35;
    if (mods.exhausted) speed *= 0.6;
    const ground = this.onGround ? this.groundBlock() : B.AIR;
    const slippery = this.onGround && BLOCKS[ground]?.slippery && !(boots && boots.grip);
    const accel = slippery ? 6 : this.onGround ? 38 : 16;
    const target = ax * speed;
    this.vx += clamp(target - this.vx, -accel * dt, accel * dt);
    if (Math.abs(this.knock.x) > 0.01) { this.vx += this.knock.x; this.knock.x = 0; }
    if (ax) this.facing = ax;

    // climbing (moles grip dirt walls)
    const wallL = this.touchingWall(-1), wallR = this.touchingWall(1);
    const pressingWall = (ax < 0 && wallL) || (ax > 0 && wallR);
    const climbSpeed = 2.7 * (boots?.climb || 1) * (mods.exhausted ? 0.5 : 1);
    this.climbing = false;
    if (!this.inWater && !this.inLava && (wallL || wallR) && up && (!this.onGround || pressingWall || !upPressed)) {
      if (pressingWall || !this.onGround) {
        this.climbing = true;
        this.vy = -climbSpeed;
      }
    }
    if (!this.climbing) {
      if (this.inWater) {
        this.vy += GRAV * 0.22 * dt;
        this.vy *= Math.max(0, 1 - 3.5 * dt);
        if (up) this.vy = Math.max(this.vy - 22 * dt, -3.4);
        if (down) this.vy = Math.min(this.vy + 10 * dt, 3);
      } else if (this.inLava) {
        this.vy += GRAV * 0.1 * dt;
        this.vy *= Math.max(0, 1 - 5 * dt);
        if (up) this.vy = Math.max(this.vy - 18 * dt, -2.8);
      } else {
        this.vy += GRAV * dt;
        if ((wallL || wallR) && down && this.vy > 1.4) this.vy = 1.4; // slide
      }
      if (upPressed && this.onGround && !this.inWater) {
        this.vy = -8.3 * (mods.jump || 1);
        ev.jump = true;
      }
    }
    if (this.knock.y) { this.vy += this.knock.y; this.knock.y = 0; }
    this.vy = Math.min(this.vy, 17);

    // integrate with substeps
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(this.vx), Math.abs(this.vy)) * dt / 0.35));
    const sdt = dt / steps;
    const wasGround = this.onGround;
    let landed = false;
    for (let s = 0; s < steps; s++) {
      this.moveX(this.vx * sdt);
      const fallV = this.vy;
      const l = this.moveY(this.vy * sdt);
      if (l) {
        landed = true;
        if (!wasGround && fallV > 13.5 && !this.inWater) ev.fallDamage = (fallV - 13.5) * 2.4;
        if (!wasGround && fallV > 4) ev.landed = fallV;
        this.vy = 0;
      }
    }
    this.onGround = landed || (this.vy >= 0 && this.solidBelow());
    if (this.onGround && this.vy > 0) this.vy = 0;
    if (this.onGround && wasGround && !ev.jump && this.vy >= 0 && !this.climbing) this.snapDown();
    // un-stick if something filled our space (sand, rubble, a fallen chunk): rise out of it
    if (this.overlapsSolid(this.x, this.y)) {
      let freed = false;
      for (let h = 1; h <= 40 && !freed; h++) {
        for (const dx of [0, -1, 1, -2, 2]) {
          const nx = this.x + (dx * h * 0.25) / M, ny = this.y - h / M;
          if (!this.overlapsSolid(nx, ny)) { this.x = nx; this.y = ny; freed = true; ev.buried = h; break; }
        }
      }
    }
    this.x = clamp(this.x, 1 + P_W / 2, w.W - 1 - P_W / 2);
    this.y = clamp(this.y, 1 + P_H / 2, w.H - 1 - P_H / 2);
    ev.climbing = this.climbing;
    ev.web = web;
    return ev;
  }

  solidBelow() {
    const [x0, , x1, y1] = this.box(this.x, this.y);
    return this.rectSolid(x0 + 1, y1 + 1, x1 - 1, y1 + 1);
  }

  /** Walking down a gentle slope: glue the feet to the floor instead of hopping. */
  snapDown() {
    const [x0, , x1, y1] = this.box(this.x, this.y);
    if (this.rectSolid(x0 + 1, y1 + 1, x1 - 1, y1 + 1)) return;
    for (let h = 1; h <= STEP; h++) {
      if (this.rectSolid(x0 + 1, y1 + h + 1, x1 - 1, y1 + h + 1)) { this.y += h / M; return; }
    }
  }

  /** Update visuals (animation, tint from light). */
  updateVisual(dt, lightRGB, ambient, aimDir) {
    const rig = this.rig;
    const root = rig.root;
    root.position.set(this.x, -(this.y + P_H / 2) + 0.01, 0.05);
    // face toward aim while working, otherwise movement direction
    const face = this.action ? Math.sign(aimDir || this.facing) || this.facing : this.facing;
    rig.face(face > 0 ? 1.05 : -1.05);
    if (this.action === 'swing') rig.play('swing');
    else if (this.action === 'chisel') rig.play('chisel');
    else if (this.action === 'brush') rig.play('brush');
    else if (this.action === 'drill') rig.play('drill');
    else if (this.action === 'xray') rig.play('carry');
    else if (this.hurtT > 0) rig.play('hurt');
    else if (this.climbing) rig.play('climb', 1.2);
    else if (this.inWater || this.inLava) rig.play('swim');
    else if (!this.onGround) rig.play(this.vy < 0 ? 'jump' : 'fall');
    else if (Math.abs(this.vx) > 0.4) rig.play(Math.abs(this.vx) > 4.6 ? 'run' : 'walk', Math.min(1.6, Math.abs(this.vx) / 3.5));
    else rig.play('idle');
    rig.update(dt);
    const flash = this.hurtT > 0 && Math.sin(this.hurtT * 40) > 0 ? 1.8 : 1;
    this.mat.color.setRGB(
      clamp((ambient.r * 2.2 + lightRGB[0] * 1.15) * flash, 0.08, 1.6),
      clamp((ambient.g * 2.2 + lightRGB[1] * 1.15) * (this.hurtT > 0 ? 0.6 : 1), 0.08, 1.6),
      clamp((ambient.b * 2.2 + lightRGB[2] * 1.15) * (this.hurtT > 0 ? 0.6 : 1), 0.08, 1.6),
    );
    if (this.hurtT > 0) this.hurtT -= dt;
  }

  /** World position of the helmet lamp (grid coords). */
  lampPos() {
    return { x: this.x + this.facing * 0.15, y: this.y - P_H * 0.35 };
  }
}

// ---------------------------------------------------------------- held tool models
function buildToolModels() {
  const s = 1 / 16 * 0.6;
  const mk = (g, pivot) => {
    const m = voxelMesh(g, { pivot, scale: s, kind: 'basic', shade: true });
    m.material = m.material; // shared basic material is fine (tinted via the rig material below)
    return m;
  };
  const tools = {};
  const wood = 0x8a5a32;
  // pickaxe: handle along the arm (pointing down from the paw), head at the end
  const pick = new VoxelGrid(13, 16, 3);
  pick.box(6, 0, 1, 1, 14, 1, wood);
  pick.box(1, 13, 1, 11, 2, 1, 0xa0a6ae);
  pick.box(0, 12, 1, 2, 2, 1, 0x8a9098);
  pick.box(11, 12, 1, 2, 2, 1, 0x8a9098);
  tools.pick = wrap(mk(pick, [6.5, 0, 1.5]), -Math.PI / 2);
  const chisel = new VoxelGrid(3, 9, 3);
  chisel.box(1, 0, 1, 1, 4, 1, wood);
  chisel.box(1, 4, 1, 1, 5, 1, 0xb0b6be);
  chisel.set(1, 8, 1, 0xe0e6ee);
  tools.chisel = wrap(mk(chisel, [1.5, 0, 1.5]), -Math.PI / 2);
  const brush = new VoxelGrid(5, 10, 3);
  brush.box(2, 0, 1, 1, 6, 1, 0xc9a06a);
  brush.box(0, 6, 0, 5, 4, 3, 0x6a5a4a);
  brush.box(0, 9, 0, 5, 1, 3, 0xe8dcc8);
  tools.brush = wrap(mk(brush, [2.5, 0, 1.5]), -Math.PI / 2);
  const drill = new VoxelGrid(7, 14, 7);
  drill.box(1, 0, 1, 5, 6, 5, 0xb08a3a);
  drill.box(2, 6, 2, 3, 3, 3, 0x8a8f96);
  drill.box(3, 9, 3, 1, 5, 1, 0xd0d6de);
  drill.box(2, 9, 3, 3, 2, 1, 0xa0a6ae);
  tools.drill = wrap(mk(drill, [3.5, 0, 3.5]), -Math.PI / 2);
  const xr = new VoxelGrid(7, 9, 7);
  xr.box(2, 0, 2, 3, 5, 3, 0x5a5a62);
  xr.box(1, 5, 1, 5, 3, 5, 0x8a8f96);
  xr.box(2, 8, 2, 3, 1, 3, 0x7fe7ff);
  tools.xray = wrap(mk(xr, [3.5, 0, 3.5]), -Math.PI / 2);
  return tools;
}
function wrap(mesh, rotX) {
  const g = new THREE.Group();
  mesh.rotation.x = rotX;
  g.add(mesh);
  return g;
}
