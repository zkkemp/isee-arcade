'use client';

import { useEffect, useRef } from 'react';
import { SPEED_SCALE } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import { useCanvasGame } from '@/lib/useCanvasGame';
import { GROUND_Y, HERO_H, LEVELS, WORLD_H, cloneLevel, newHero, overlaps, stepEnemy, stepHero, type Enemy, type Hero, type QuestLevel, type Rect } from '@/lib/kingdomQuest';

type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Phase = 'map' | 'playing' | 'finale';
type State = {
  levelIndex: number; level: QuestLevel; hero: Hero; phase: Phase; camera: number; respawn: { x: number; y: number };
  coins: number; runes: number; hearts: number; portalCooldown: number; banner: number; shake: number; finalT: number; particles: Particle[]; shownTip: boolean;
};

const VIEW_W = 512;
const VIEW_H = 360;

function fresh(index = 0, phase: Phase = 'map', coins = 0, runes = 0): State {
  const level = cloneLevel(index);
  return { levelIndex: index, level, hero: newHero(), phase, camera: 0, respawn: { x: 76, y: GROUND_Y - HERO_H }, coins, runes, hearts: 3, portalCooldown: 0, banner: 2.8, shake: 0, finalT: 0, particles: [], shownTip: false };
}

function pushBurst(s: State, x: number, y: number, color: string, count = 9) {
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    s.particles.push({ x, y, vx: Math.cos(a) * (35 + Math.random() * 75), vy: Math.sin(a) * (35 + Math.random() * 75) - 60, life: 0.45 + Math.random() * 0.35, color });
  }
  if (s.particles.length > 100) s.particles.splice(0, s.particles.length - 100);
}

function collectAll(s: State, api: GameCanvasProps['api']) {
  const h = s.hero;
  s.level.coins = s.level.coins.filter((v) => {
    if (!overlaps(h, v)) return true;
    s.coins += 1; api.addScore(10); pushBurst(s, v.x + 7, v.y + 7, '#ffe16a', 6); return false;
  });
  s.level.runes = s.level.runes.filter((v) => {
    if (!overlaps(h, v)) return true;
    s.runes += 1; api.addScore(75); pushBurst(s, v.x + 8, v.y + 10, '#91f8ff', 15); return false;
  });
  for (const power of s.level.powers) if (!power.used && overlaps(h, power)) {
    power.used = true;
    if (power.kind === 'bloom') { h.armour = true; api.setStatus('Sunbloom shield found!'); pushBurst(s, power.x + 10, power.y + 12, '#ffb7e4', 16); }
    else { h.star = 8; api.setStatus('Comet star — dash through danger!'); pushBurst(s, power.x + 10, power.y + 12, '#b8f8ff', 20); }
    api.addScore(50);
  }
}

function damage(s: State, api: GameCanvasProps['api'], label: string) {
  const h = s.hero;
  if (h.hurt > 0 || h.star > 0 || s.phase !== 'playing') return;
  if (h.armour) { h.armour = false; h.hurt = 1.3; h.vx = -h.facing * 150; h.vy = -260; api.setStatus('The Sunbloom shield protected you!'); pushBurst(s, h.x + h.w / 2, h.y + h.h / 2, '#ffb7e4'); return; }
  s.hearts -= 1; s.shake = 0.25; pushBurst(s, h.x + h.w / 2, h.y + h.h / 2, '#ff8c8c', 16);
  if (s.hearts <= 0) { s.hearts = 3; api.died(label); }
  else api.setStatus('Back to the last lantern!');
  h.x = s.respawn.x; h.y = s.respawn.y; h.vx = 0; h.vy = 0; h.hurt = 1.3;
}

function stomp(s: State, enemy: Enemy, api: GameCanvasProps['api']) {
  if (!enemy.alive) return;
  if (enemy.kind === 'sentinel') {
    enemy.hp -= 1; s.hero.vy = -405; s.hero.star = Math.max(s.hero.star, 0.25); pushBurst(s, enemy.x + enemy.w / 2, enemy.y + 14, '#bda7ff', 20); api.addScore(100);
    if (enemy.hp <= 0) { enemy.alive = false; s.level.goal.locked = false; api.setStatus('The Aurora Sentinel is restored! Reach the beacon.'); api.addScore(400); }
  } else { enemy.alive = false; s.hero.vy = -370; pushBurst(s, enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, '#b5f484', 10); api.addScore(25); }
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, color: string) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 18 * scale, 0, Math.PI * 2); ctx.arc(x + 22 * scale, y - 8 * scale, 24 * scale, 0, Math.PI * 2); ctx.arc(x + 50 * scale, y, 17 * scale, 0, Math.PI * 2); ctx.fill();
}

function drawSky(ctx: CanvasRenderingContext2D, biome: QuestLevel['biome'], camera: number, time: number) {
  const palette = biome === 'meadow' ? ['#7fd9f6', '#ddf9ff', '#7fcf83'] : biome === 'cavern' ? ['#33275e', '#875070', '#362b46'] : ['#171a52', '#6953a3', '#302260'];
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H); g.addColorStop(0, palette[0]); g.addColorStop(0.7, palette[1]); g.addColorStop(1, palette[2]); ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (biome === 'meadow') {
    for (let i = -1; i < 6; i += 1) drawCloud(ctx, i * 160 - (camera * 0.12) % 160 + 60, 62 + (i % 2) * 38, 0.85, 'rgba(255,255,255,.72)');
    ctx.fillStyle = '#75bd75'; for (let i = -1; i < 8; i += 1) { const x = i * 110 - (camera * 0.25) % 110; ctx.beginPath(); ctx.arc(x, 337, 72, Math.PI, 0); ctx.fill(); }
  } else if (biome === 'cavern') {
    ctx.fillStyle = '#e37b79'; ctx.globalAlpha = .33; for (let i = 0; i < 26; i += 1) { const x = (i * 83 - camera * .18) % 560; ctx.beginPath(); ctx.arc(x, 70 + (i * 47) % 205, 3 + (i % 4), 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1;
    ctx.fillStyle = '#1d1937'; for (let i = -1; i < 9; i += 1) { const x = i * 80 - (camera * .22) % 80; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 35, 120 + (i % 3) * 30); ctx.lineTo(x + 70, 0); ctx.fill(); }
  } else {
    ctx.fillStyle = '#fff6bf'; for (let i = 0; i < 55; i += 1) { const x = (i * 91 - camera * .06) % 520; const y = (i * 37) % 235 + 8; const r = 0.8 + (i % 3) * .6 + Math.sin(time * 3 + i) * .3; ctx.fillRect(x, y, r, r); }
    ctx.fillStyle = '#4b3584'; for (let i = -1; i < 8; i += 1) { const x = i * 110 - (camera * .18) % 110; ctx.fillRect(x, 190, 74, 150); ctx.fillStyle = '#8c7aca'; ctx.fillRect(x + 12, 210, 14, 22); ctx.fillStyle = '#4b3584'; }
  }
}

function drawPlatform(ctx: CanvasRenderingContext2D, r: Rect, biome: QuestLevel['biome']) {
  const top = biome === 'meadow' ? '#9ce76e' : biome === 'cavern' ? '#f1996e' : '#aa9ae9'; const body = biome === 'meadow' ? '#6ca955' : biome === 'cavern' ? '#6b405a' : '#4f478f';
  ctx.fillStyle = body; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.fillStyle = top; ctx.fillRect(r.x, r.y, r.w, 5); ctx.fillStyle = 'rgba(255,255,255,.16)'; for (let x = r.x + 10; x < r.x + r.w; x += 28) ctx.fillRect(x, r.y + 9, 10, 2);
}

function drawHero(ctx: CanvasRenderingContext2D, h: Hero, time: number) {
  const bob = h.grounded ? Math.sin(time * 13 + h.x / 15) * Math.min(1.5, Math.abs(h.vx) / 100) : 0;
  ctx.save(); ctx.translate(h.x + h.w / 2, h.y + h.h / 2 + bob); if (h.facing < 0) ctx.scale(-1, 1);
  if (h.star > 0) { ctx.strokeStyle = '#d6ffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 19 + Math.sin(time * 18) * 3, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = h.armour ? '#f9b6df' : '#4e6ff2'; ctx.fillRect(-9, -5, 18, 16); ctx.fillStyle = '#f5c39e'; ctx.fillRect(-7, -15, 14, 12); ctx.fillStyle = '#182052'; ctx.fillRect(-9, -18, 18, 6); ctx.fillStyle = '#ffc857'; ctx.fillRect(-10, -21, 14, 5); ctx.fillStyle = '#172048'; ctx.fillRect(2, -11, 2.8, 2.8); ctx.fillStyle = '#ffe27d'; ctx.fillRect(-7, 11, 6, 4); ctx.fillRect(3, 11, 6, 4); ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, time: number) {
  if (!e.alive) return; ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
  if (e.kind === 'mossling') { ctx.fillStyle = '#537c4b'; ctx.beginPath(); ctx.arc(0, 2, 13, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#b7ec72'; ctx.fillRect(-10, -12, 20, 8); ctx.fillStyle = '#21343b'; ctx.fillRect(-5, 0, 3, 3); ctx.fillRect(4, 0, 3, 3); }
  else if (e.kind === 'emberbat') { ctx.fillStyle = '#f47f83'; ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(-4, -8 - Math.sin(time * 9) * 4); ctx.lineTo(0, 4); ctx.lineTo(5, -8 - Math.sin(time * 9) * 4); ctx.lineTo(16, 0); ctx.lineTo(5, 8); ctx.lineTo(0, 12); ctx.lineTo(-5, 8); ctx.fill(); ctx.fillStyle = '#fff0b2'; ctx.fillRect(-2, 1, 4, 3); }
  else { ctx.fillStyle = '#5e4d9a'; ctx.fillRect(-20, -15, 40, 35); ctx.fillStyle = '#b9abff'; ctx.fillRect(-15, -21, 30, 12); ctx.fillStyle = '#f9dc72'; ctx.fillRect(-5, -8, 10, 7); ctx.strokeStyle = '#d9d2ff'; ctx.lineWidth = 2; ctx.strokeRect(-21, -16, 42, 37); }
  ctx.restore();
}

function drawMap(
  ctx: CanvasRenderingContext2D,
  s: State,
  pulse: number,
  keyArt: HTMLImageElement | null,
) {
  if (keyArt) {
    ctx.drawImage(keyArt, 0, 0, VIEW_W, VIEW_H);
    const shade = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    shade.addColorStop(0, 'rgba(17,24,61,.28)');
    shade.addColorStop(0.42, 'rgba(17,24,61,.5)');
    shade.addColorStop(1, 'rgba(17,18,48,.9)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#182951');
    g.addColorStop(1, '#5a4588');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  for (let i = 0; i < 46; i += 1) ctx.fillRect((i * 113) % VIEW_W, (i * 53) % 225, 2, 2);
  ctx.fillStyle = '#f4d66d'; ctx.font = 'bold 30px system-ui'; ctx.textAlign = 'center'; ctx.fillText('KINGDOM QUEST', VIEW_W / 2, 42); ctx.fillStyle = '#d8eaff'; ctx.font = '14px system-ui'; ctx.fillText('The Lantern Keeper needs three lost realm runes.', VIEW_W / 2, 63);
  const colors = ['#86d974', '#ef936e', '#ad9cff'];
  const nodes = LEVELS.map((level, i) => ({ x: 94 + (i % 3) * 162, y: 168 + Math.floor(i / 3) * 100, label: level.name, color: colors[['meadow', 'cavern', 'citadel'].indexOf(level.biome)] }));
  ctx.strokeStyle = '#d9c777'; ctx.lineWidth = 5; ctx.beginPath(); nodes.forEach((node, i) => { if (i === 0) ctx.moveTo(node.x, node.y); else ctx.lineTo(node.x, node.y); }); ctx.stroke();
  nodes.forEach((n, i) => { const open = i <= s.levelIndex; ctx.fillStyle = open ? n.color : '#53607e'; ctx.beginPath(); ctx.arc(n.x, n.y, 27 + (i === s.levelIndex ? Math.sin(pulse * 5) * 2 : 0), 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff1a8'; ctx.lineWidth = i === s.levelIndex ? 4 : 1; ctx.stroke(); ctx.fillStyle = '#eff8ff'; ctx.font = 'bold 11px system-ui'; const words = n.label.split(' '); ctx.fillText(words[0], n.x, n.y + 43); ctx.fillText(words.slice(1).join(' '), n.x, n.y + 56); });
  const l = s.level; ctx.fillStyle = '#fff8cf'; ctx.font = 'bold 18px system-ui'; ctx.fillText(l.name, VIEW_W / 2, 88); ctx.fillStyle = '#e2edff'; ctx.font = '13px system-ui'; ctx.fillText(l.tip, VIEW_W / 2, 108); ctx.fillStyle = '#f4d66d'; ctx.font = 'bold 15px system-ui'; ctx.fillText('Press Jump / tap JUMP to enter', VIEW_W / 2, 350);
}

export default function KingdomQuest({ paused, input, api, restartToken, difficulty, controlsInset }: GameCanvasProps) {
  const stateRef = useRef<State>(fresh()); const insetRef = useRef(controlsInset); const elapsedRef = useRef(0);
  const keyArtRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => { stateRef.current = fresh(); }, [restartToken, difficulty]);
  useEffect(() => { insetRef.current = controlsInset; }, [controlsInset]);
  useEffect(() => {
    const image = new Image();
    image.src = '/assets/coin-runner-v3/kingdom-quest-key-art.webp';
    image.onload = () => { keyArtRef.current = image; };
    return () => { keyArtRef.current = null; };
  }, []);
  const { canvasRef } = useCanvasGame({ active: !paused, step: (ctx, dt, cw, ch) => {
    const s = stateRef.current; elapsedRef.current += dt; const time = elapsedRef.current; const playH = Math.max(120, ch - insetRef.current); const scale = Math.min(cw / VIEW_W, playH / VIEW_H); const ox = (cw - VIEW_W * scale) / 2; const oy = Math.max(0, (playH - VIEW_H * scale) / 2);
    const jump = input.consumeJump();
    ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale);
    if (s.phase === 'map') { drawMap(ctx, s, time, keyArtRef.current); if (jump) { s.phase = 'playing'; s.banner = 2.6; api.setStatus(`${s.level.name}: ${s.level.tip}`); } ctx.restore(); return; }
    if (s.phase === 'finale') { drawSky(ctx, 'citadel', 0, time); ctx.fillStyle = '#fff5bb'; ctx.font = 'bold 34px system-ui'; ctx.textAlign = 'center'; ctx.fillText('THE LANTERN SHINES!', VIEW_W / 2, 115); ctx.fillStyle = '#dce9ff'; ctx.font = '19px system-ui'; ctx.fillText(`You restored ${s.runes} realm runes and gathered ${s.coins} sun-coins.`, VIEW_W / 2, 160); ctx.fillText('The three realms glow together again.', VIEW_W / 2, 193); for (let i = 0; i < 40; i += 1) { ctx.fillStyle = ['#ffda68', '#95f3ff', '#f4a6df'][i % 3]; ctx.fillRect((i * 67 + time * 30) % VIEW_W, 220 + (i * 37) % 110, 4, 4); } ctx.fillStyle = '#fff5bb'; ctx.font = 'bold 16px system-ui'; ctx.fillText('Press Restart to begin a new quest.', VIEW_W / 2, 330); ctx.restore(); return; }
    const h = s.hero; const speed = SPEED_SCALE[difficulty];
    h.hurt = Math.max(0, h.hurt - dt); h.star = Math.max(0, h.star - dt); s.portalCooldown = Math.max(0, s.portalCooldown - dt); s.banner = Math.max(0, s.banner - dt); s.shake = Math.max(0, s.shake - dt); s.finalT += dt;
    const beforeBottom = h.y + h.h; stepHero(h, s.level.platforms, { left: input.held.left, right: input.held.right, jumpPressed: jump, jumpHeld: input.jumpHeld }, dt);
    h.x = Math.max(0, Math.min(s.level.width - h.w, h.x));
    for (const enemy of s.level.enemies) stepEnemy(enemy, dt, speed); if (s.level.boss) stepEnemy(s.level.boss, dt, speed);
    const threats = [...s.level.enemies, ...(s.level.boss ? [s.level.boss] : [])];
    for (const enemy of threats) if (enemy.alive && overlaps(h, enemy)) { if ((h.star > 0 || (h.vy > 70 && beforeBottom <= enemy.y + 10))) stomp(s, enemy, api); else damage(s, api, enemy.kind === 'sentinel' ? 'The Sentinel stopped the quest' : 'A realm creature bumped you'); }
    collectAll(s, api);
    for (const cp of s.level.checkpoints) if (!cp.hit && overlaps(h, cp)) { cp.hit = true; s.respawn = { x: cp.x - 14, y: GROUND_Y - HERO_H }; api.setStatus('Lantern lit — checkpoint saved!'); pushBurst(s, cp.x + 9, cp.y + 12, '#ffe16a', 14); }
    for (const gate of s.level.portals) if (s.portalCooldown <= 0 && overlaps(h, gate)) { h.x = gate.toX; h.y = gate.toY; h.vx = 0; h.vy = 0; s.portalCooldown = .9; s.camera = Math.max(0, h.x - 180); pushBurst(s, h.x + 12, h.y + 16, '#bd9fff', 20); api.setStatus(`${gate.label} whisked you away!`); }
    if (h.y > WORLD_H + 60) damage(s, api, 'You fell beyond the realm');
    if (!s.level.goal.locked && overlaps(h, s.level.goal)) { pushBurst(s, s.level.goal.x + 17, s.level.goal.y + 18, '#ffe16a', 36); api.addScore(200 + s.level.coins.length * 5); if (s.levelIndex === LEVELS.length - 1) { s.phase = 'finale'; api.requestGate('Aurora Spire restored'); } else { const next = s.levelIndex + 1; stateRef.current = fresh(next, 'map', s.coins, s.runes); api.requestGate(`${s.level.name} restored`); ctx.restore(); return; } }
    s.camera += ((h.x - VIEW_W * .42) - s.camera) * Math.min(1, dt * 5); s.camera = Math.max(0, Math.min(s.level.width - VIEW_W, s.camera));
    drawSky(ctx, s.level.biome, s.camera, time);
    ctx.save(); ctx.translate(-s.camera + (Math.random() - .5) * s.shake * 18, 0);
    for (const platform of s.level.platforms) drawPlatform(ctx, platform, s.level.biome);
    for (const c of s.level.coins) { ctx.fillStyle = '#ffe36f'; ctx.beginPath(); ctx.arc(c.x + 6.5, c.y + 6.5, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff9ca'; ctx.fillRect(c.x + 5, c.y + 2, 2, 9); }
    for (const r of s.level.runes) { ctx.fillStyle = '#8df6ff'; ctx.beginPath(); ctx.moveTo(r.x + 8, r.y); ctx.lineTo(r.x + 16, r.y + 10); ctx.lineTo(r.x + 8, r.y + 20); ctx.lineTo(r.x, r.y + 10); ctx.fill(); }
    for (const power of s.level.powers) if (!power.used) { ctx.fillStyle = power.kind === 'bloom' ? '#ffb7e4' : '#c7fbff'; ctx.beginPath(); ctx.arc(power.x + 10, power.y + 11, 10, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(power.x + 9, power.y + 5, 2, 12); }
    for (const portal of s.level.portals) { const alpha = s.portalCooldown > .5 ? .45 : .85; ctx.strokeStyle = `rgba(222,184,255,${alpha})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(portal.x + 15, portal.y + 22, 13, 20, 0, 0, Math.PI * 2); ctx.stroke(); }
    for (const cp of s.level.checkpoints) { ctx.fillStyle = '#4a3d67'; ctx.fillRect(cp.x + 8, cp.y, 3, 56); ctx.fillStyle = cp.hit ? '#ffe068' : '#8f9bb5'; ctx.beginPath(); ctx.arc(cp.x + 9, cp.y + 7, cp.hit ? 9 : 6, 0, Math.PI * 2); ctx.fill(); }
    for (const enemy of threats) drawEnemy(ctx, enemy, time); drawHero(ctx, h, time);
    ctx.fillStyle = s.level.goal.locked ? '#6b587c' : '#f4d66d'; ctx.fillRect(s.level.goal.x, s.level.goal.y, 30, 82); ctx.fillStyle = s.level.goal.locked ? '#b49ec9' : '#fff5ab'; ctx.beginPath(); ctx.arc(s.level.goal.x + 15, s.level.goal.y + 10, 16, 0, Math.PI * 2); ctx.fill();
    for (const part of s.particles) { part.life -= dt; part.x += part.vx * dt; part.y += part.vy * dt; part.vy += 120 * dt; if (part.life > 0) { ctx.globalAlpha = Math.min(1, part.life * 2); ctx.fillStyle = part.color; ctx.fillRect(part.x, part.y, 3, 3); } } ctx.globalAlpha = 1; s.particles = s.particles.filter((v) => v.life > 0);
    ctx.restore();
    // HUD stays in screen coordinates inside the logical canvas.
    ctx.fillStyle = 'rgba(20,25,55,.72)'; ctx.fillRect(10, 10, 218, 48); ctx.fillStyle = '#fff7c0'; ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'left'; ctx.fillText(`${s.level.name}  •  ${s.levelIndex + 1}/${LEVELS.length}`, 19, 29); ctx.fillStyle = '#fff'; ctx.font = '14px system-ui'; ctx.fillText(`♥ ${'♥'.repeat(s.hearts)}   ◉ ${s.coins}   ◇ ${s.runes}`, 19, 49);
    if (s.level.boss?.alive) { ctx.fillStyle = 'rgba(30,20,60,.72)'; ctx.fillRect(335, 12, 160, 34); ctx.fillStyle = '#e3d8ff'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`AURORA SENTINEL  ${'✦'.repeat(s.level.boss.hp)}`, 415, 33); }
    if (s.banner > 0) { ctx.fillStyle = 'rgba(21,25,58,.8)'; ctx.fillRect(80, 72, 352, 48); ctx.fillStyle = '#fff6ba'; ctx.font = 'bold 18px system-ui'; ctx.textAlign = 'center'; ctx.fillText(s.level.tip, VIEW_W / 2, 102); }
    ctx.restore();
  }});
  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full touch-none"
      aria-label="Kingdom Quest platform adventure"
    />
  );
}
