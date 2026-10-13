// Dev-only scene (?scene=showroom): character lineup + every item icon, for art review.
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { makeCharacter, randomSpec, playerSpec, makeChicken, SPECIES, makePaw } from '../gfx/characters.js';
import { ITEMS } from '../data/items.js';
import { iconURL, weaponIconURL } from '../gfx/PixelArt.js';
import { WEAPON_TYPES, METALS } from '../data/weapons.js';
import { el } from '../core/util.js';

export default class ShowroomScene extends Scene {
  async enter(params) {
    this.hud = 'none';
    this.scene.background = new THREE.Color(0x2a2030);
    this.zoom = parseFloat(params.zoom) || 4.5;
    const cam = new THREE.OrthographicCamera(-8, 8, this.zoom, -this.zoom, 0.1, 100);
    cam.position.set(10 + (parseFloat(params.cx) || 0), 6, 14);
    cam.lookAt(parseFloat(params.cx) || 0, 0.6, 0);
    this.camera = cam;
    this.scene.add(new THREE.HemisphereLight(0xfff0dd, 0x403050, 1.6));
    const dl = new THREE.DirectionalLight(0xffffff, 1.6);
    dl.position.set(3, 6, 4);
    this.scene.add(dl);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(30, 0.2, 30), new THREE.MeshLambertMaterial({ color: 0x5a4030 }));
    floor.position.y = -0.1;
    this.scene.add(floor);
    this.rigs = [];
    const states = ['idle', 'walk', 'wave', 'cheer', 'talk', 'dig', 'laugh', 'sit'];
    const list = [playerSpec()];
    for (let i = 0; i < 23; i++) list.push(randomSpec(1000 + i * 17 + (parseInt(params.seed, 10) || 0), i < SPECIES.length ? { species: SPECIES[i] } : {}));
    list.forEach((spec, i) => {
      const rig = makeCharacter(spec);
      const col = i % 8, row = Math.floor(i / 8);
      rig.root.position.set((col - 3.5) * 1.9, 0, (row - 1) * 2.6);
      rig.face(0.6, true);
      const st = params.anim || states[i % states.length];
      if (st === 'talk') { rig.play('idle'); rig.talkT = 999; } else rig.play(st);
      this.scene.add(rig.root);
      this.rigs.push(rig);
    });
    const hen = makeChicken({ hat: 'straw' });
    hen.root.position.set(6.8, 0, 3);
    this.scene.add(hen.root);
    this.rigs.push(hen);
    const paw = makePaw(1, { scale: 1 });
    paw.position.set(-7, 0.8, 3);
    paw.rotation.y = 0.8;
    this.scene.add(paw);

    if (params.icons !== '0') {
      const wrap = el('div', { style: { position: 'absolute', left: '8px', bottom: '8px', right: '8px', display: 'flex', flexWrap: 'wrap', gap: '2px', background: 'rgba(0,0,0,.5)', padding: '4px', maxHeight: '45vh', overflow: 'auto' } });
      for (const id of Object.keys(ITEMS)) wrap.append(el('img', { class: 'pix', src: iconURL(id), title: id, style: { width: '32px', height: '32px', background: '#e8d2a2' } }));
      for (const t of Object.keys(WEAPON_TYPES)) for (const m of ['iron', 'gold', 'mithril']) wrap.append(el('img', { class: 'pix', src: weaponIconURL(t, m, m === 'mithril' ? 'bioxide' : null), title: t + ' ' + m, style: { width: '32px', height: '32px', background: '#e8d2a2' } }));
      this.game.ui.world.append(wrap);
    }
  }
  update(dt) {
    super.update(dt);
    for (const r of this.rigs) r.update(dt);
  }
  onResize(w, h) {
    const a = w / h;
    this.camera.left = -this.zoom * a; this.camera.right = this.zoom * a; this.camera.top = this.zoom; this.camera.bottom = -this.zoom;
    this.camera.updateProjectionMatrix();
  }
}
