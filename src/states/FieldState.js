import { STATES } from '../core/constants.js';
import { loadEnemy } from '../core/Data.js';
import { COLORS, text, sprite, isoTop, isoCenter } from '../core/draw.js';
import { DIRS, FACE_STEP } from '../core/grid.js';

// 探索。リズム入力は受け付けない（憲法③）
export class FieldState {
  name = STATES.FIELD;
  pausable = true;

  constructor(game) {
    this.game = game;
    this.session = game.session;
    this.map = game.session.map;
    this.move = null;
    this.bumpArmed = false;
    this.enemyDefs = {};
  }

  get p() {
    return this.session.player;
  }

  enter() {
    for (const enc of this.map.encounters) {
      loadEnemy(enc.enemy).then(({ def }) => { this.enemyDefs[enc.id] = def; });
    }
  }

  isFloor(i, j) {
    return this.map.floor[j]?.[i] === '#';
  }

  encounterAt(i, j) {
    return this.map.encounters.find((e) => e.actors.some((a) => a.at[0] === i && a.at[1] === j));
  }

  walkable(i, j) {
    return this.isFloor(i, j) && !this.encounterAt(i, j);
  }

  update(dt, presses) {
    for (const { btn } of presses) {
      if (btn === 'pause' || btn === 'start') { this.game.pause(); return; }
      if (btn === 'a' && !this.move) {
        const d = FACE_STEP[this.p.dir];
        const enc = this.encounterAt(this.p.i + d.di, this.p.j + d.dj);
        if (enc) { this.trigger(enc); return; }
      }
      if (DIRS[btn]) this.bumpArmed = true;
    }

    if (this.move) {
      this.move.t += dt / this.game.config.field.moveSecPerTile;
      if (this.move.t < 1) return;
      [this.p.i, this.p.j] = this.move.to;
      this.move = null;
    }

    const btn = Object.keys(DIRS).find((b) => this.game.input.isDown(b));
    if (!btn) return;
    const d = DIRS[btn];
    this.p.dir = d.face;
    const ni = this.p.i + d.di;
    const nj = this.p.j + d.dj;
    if (this.walkable(ni, nj)) {
      this.move = { from: [this.p.i, this.p.j], to: [ni, nj], t: 0 };
      this.bumpArmed = true;
      this.game.sfx.play('step');
      return;
    }
    const enc = this.encounterAt(ni, nj);
    if (enc && this.bumpArmed) this.trigger(enc);
  }

  trigger(enc) {
    this.bumpArmed = false;
    this.game.sfx.play('confirm');
    this.game.runEncounter(enc);
  }

  render(g) {
    const { config, assets } = this.game;
    const W = config.screen.width;
    const H = config.screen.height;
    const floorDef = assets.def('floor');
    const floorImg = assets.get('floor', 'default');
    const tile = floorDef.tile;

    let pi = this.p.i;
    let pj = this.p.j;
    let bob = 0;
    if (this.move) {
      const t = Math.min(1, this.move.t);
      pi = this.move.from[0] + (this.move.to[0] - this.move.from[0]) * t;
      pj = this.move.from[1] + (this.move.to[1] - this.move.from[1]) * t;
      bob = -Math.round(Math.abs(Math.sin(t * Math.PI)) * 3);
    }
    // プレイヤーが画面の中ほどに来るようにカメラを合わせる
    const ox = Math.round(W / 2 - (pi - pj) * tile[0] / 2);
    const oy = Math.round(232 - tile[1] / 2 - (pi + pj) * tile[1] / 2);

    g.fillStyle = '#12142a';
    g.fillRect(0, 0, W, H);

    const rows = this.map.floor.length;
    const cols = this.map.floor[0].length;
    for (let s = 0; s <= rows + cols - 2; s++) {
      for (let i = 0; i < cols; i++) {
        const j = s - i;
        if (j < 0 || j >= rows || !this.isFloor(i, j)) continue;
        const p = isoTop(i, j, ox, oy, tile);
        if (p.x < -tile[0] || p.x > W + tile[0] || p.y > H || p.y < -floorDef.size[1]) continue;
        sprite(g, floorImg, floorDef, p.x, p.y);
      }
    }

    const people = [{ sprite: 'player', frame: this.p.dir, palette: null, i: pi, j: pj, bob }];
    for (const enc of this.map.encounters) {
      const def = this.enemyDefs[enc.id];
      if (!def) continue;
      for (const a of enc.actors) {
        const actor = def.actors.find((x) => x.id === a.id);
        people.push({ sprite: actor.sprite, frame: a.dir, palette: actor.palette, i: a.at[0], j: a.at[1], bob: 0 });
      }
    }
    people.sort((a, b) => a.i + a.j - (b.i + b.j));
    for (const c of people) {
      const def = assets.def(c.sprite);
      const pos = isoCenter(c.i, c.j, ox, oy, tile);
      g.fillStyle = 'rgba(11,12,24,0.45)';
      g.beginPath();
      g.ellipse(pos.x, pos.y, 22, 8, 0, 0, Math.PI * 2);
      g.fill();
      sprite(g, assets.get(c.sprite, c.frame, c.palette), def, pos.x, pos.y + c.bob);
    }

    g.fillStyle = 'rgba(11,12,24,0.55)';
    g.fillRect(0, 0, W, 26);
    text(g, this.map.name, 8, 5);
    text(g, '十字：いどう　A：はなす', W - 8, 5, { align: 'right', color: COLORS.muted });
  }
}
