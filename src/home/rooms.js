// Drawing what you can see. Home is one small cave now (the hollow and the alcoves round it, no
// rooms behind walls), so there is nothing to cull by room: everything is shown and three.js culls
// each merged piece against the view. Kept as the scene's `cull` (key, enabled, showAll) for the
// code and the tests that ask it.

export class RoomCull {
  /** s: the HomeScene. */
  constructor(s) {
    this.s = s;
    this.groups = new Map([['camp', Object.values(s.cave.roomMeshes || {}).flat()]]);
    if (s.shell?.floorMesh) this.groups.set('bedroom', [s.shell.floorMesh]);
    this.key = 'camp';
    this.enabled = true;
  }

  update() { /* (one cave: always all of it) */ }

  /** Show everything. */
  showAll() { for (const list of this.groups.values()) for (const m of list) m.visible = true; }
}
