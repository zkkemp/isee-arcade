'use client';

import { useEffect, useRef } from 'react';
import { SPEED_SCALE } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import { startKingdomMusic } from '@/lib/kingdomMusic';
import { playSound } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';
import { GROUND_Y, HERO_H, LEVELS, WORLD_H, cameraTarget, cloneLevel, dampCamera, newHero, overlaps, questPace, questViewport, simulationSteps, stepEnemy, stepHero, type Enemy, type Hero, type QuestLevel, type Rect } from '@/lib/kingdomQuest';

type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Phase = 'map' | 'playing' | 'finale';
type State = {
  levelIndex: number; level: QuestLevel; hero: Hero; phase: Phase; camera: number; respawn: { x: number; y: number };
  coins: number; runes: number; hearts: number; banner: number; shake: number; finalT: number; particles: Particle[]; shownTip: boolean; combo: number; comboT: number;
};

function fresh(index = 0, phase: Phase = 'map', coins = 0, runes = 0): State {
  const level = cloneLevel(index);
  return { levelIndex: index, level, hero: newHero(), phase, camera: 0, respawn: { x: 76, y: GROUND_Y - HERO_H }, coins, runes, hearts: 3, banner: 2.8, shake: 0, finalT: 0, particles: [], shownTip: false, combo: 0, comboT: 0 };
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
    s.coins += 1; s.combo = s.comboT > 0 ? Math.min(8, s.combo + 1) : 1; s.comboT = 1.35;
    api.addScore(10 + (s.combo - 1) * 2); playSound('coin', s.combo); pushBurst(s, v.x + 7, v.y + 7, '#ffe16a', 6); return false;
  });
  s.level.runes = s.level.runes.filter((v) => {
    if (!overlaps(h, v)) return true;
    s.runes += 1; api.addScore(75); playSound('powerup'); pushBurst(s, v.x + 8, v.y + 10, '#91f8ff', 15); return false;
  });
  for (const power of s.level.powers) if (!power.used && overlaps(h, power)) {
    power.used = true;
    if (power.kind === 'bloom') { h.armour = true; api.setStatus('Sunbloom shield found!'); pushBurst(s, power.x + 10, power.y + 12, '#ffb7e4', 16); }
    else { h.star = 8; api.setStatus('Comet star — dash through danger!'); pushBurst(s, power.x + 10, power.y + 12, '#b8f8ff', 20); }
    api.addScore(50); playSound('powerup');
  }
}

function damage(s: State, api: GameCanvasProps['api'], label: string) {
  const h = s.hero;
  if (h.hurt > 0 || h.star > 0 || s.phase !== 'playing') return;
  if (h.armour) { h.armour = false; h.hurt = 1.3; h.vx = -h.facing * 150; h.vy = -260; api.setStatus('The Sunbloom shield protected you!'); playSound('brick'); pushBurst(s, h.x + h.w / 2, h.y + h.h / 2, '#ffb7e4'); return; }
  s.hearts -= 1; s.shake = 0.25; pushBurst(s, h.x + h.w / 2, h.y + h.h / 2, '#ff8c8c', 16);
  playSound(s.hearts <= 0 ? 'gameOver' : 'wrong');
  if (s.hearts <= 0) { s.hearts = 3; api.died(label); }
  else api.setStatus('Back to the last lantern!');
  h.x = s.respawn.x; h.y = s.respawn.y; h.vx = 0; h.vy = 0; h.hurt = 1.3;
}

function stomp(s: State, enemy: Enemy, api: GameCanvasProps['api']) {
  if (!enemy.alive) return;
  playSound('stomp');
  if (enemy.kind === 'sentinel') {
    enemy.hp -= 1; s.hero.vy = -405; s.hero.star = Math.max(s.hero.star, 0.25); pushBurst(s, enemy.x + enemy.w / 2, enemy.y + 14, '#bda7ff', 20); api.addScore(100);
    if (enemy.hp <= 0) { enemy.alive = false; s.level.goal.locked = false; api.setStatus('The Aurora Sentinel is restored! Reach the beacon.'); api.addScore(400); }
  } else { enemy.alive = false; s.hero.vy = -370; pushBurst(s, enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, '#b5f484', 10); api.addScore(25); }
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, color: string) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 18 * scale, 0, Math.PI * 2); ctx.arc(x + 22 * scale, y - 8 * scale, 24 * scale, 0, Math.PI * 2); ctx.arc(x + 50 * scale, y, 17 * scale, 0, Math.PI * 2); ctx.fill();
}

function drawSky(ctx: CanvasRenderingContext2D, biome: QuestLevel['biome'], camera: number, time: number, viewW: number, viewH: number, panorama: HTMLImageElement | null) {
  const palette = biome === 'meadow' ? ['#7fd9f6', '#ddf9ff', '#7fcf83'] : biome === 'cavern' ? ['#33275e', '#875070', '#362b46'] : ['#171a52', '#6953a3', '#302260'];
  const g = ctx.createLinearGradient(0, 0, 0, viewH); g.addColorStop(0, palette[0]); g.addColorStop(0.7, palette[1]); g.addColorStop(1, palette[2]); ctx.fillStyle = g; ctx.fillRect(0, 0, viewW, viewH);
  if (biome === 'meadow') {
    if (panorama) {
      const sourceW = Math.min(panorama.width, panorama.height * (viewW / viewH));
      const travel = Math.max(0, panorama.width - sourceW);
      const sx = travel ? (camera * 0.055) % travel : 0;
      ctx.drawImage(panorama, sx, 0, sourceW, panorama.height, 0, 0, viewW, viewH);
      ctx.fillStyle = 'rgba(70,178,229,.12)'; ctx.fillRect(0, 0, viewW, viewH);
    } else {
      for (let i = -1; i < Math.ceil(viewW / 150) + 2; i += 1) drawCloud(ctx, i * 160 - (camera * 0.12) % 160 + 60, 62 + (i % 2) * 38, 0.85, 'rgba(255,255,255,.72)');
      ctx.fillStyle = '#75bd75'; for (let i = -1; i < Math.ceil(viewW / 100) + 2; i += 1) { const x = i * 110 - (camera * 0.25) % 110; ctx.beginPath(); ctx.arc(x, viewH - 47, 72, Math.PI, 0); ctx.fill(); }
    }
  } else if (biome === 'cavern') {
    ctx.fillStyle = '#ffb070'; ctx.globalAlpha = .32; for (let i = 0; i < 34; i += 1) { const x = ((i * 83 - camera * .18) % (viewW + 80) + viewW + 80) % (viewW + 80) - 40; ctx.beginPath(); ctx.arc(x, 70 + (i * 47) % 225, 3 + (i % 4), 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1;
    ctx.fillStyle = '#1d1937'; for (let i = -1; i < Math.ceil(viewW / 75) + 2; i += 1) { const x = i * 80 - (camera * .22) % 80; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 35, 120 + (i % 3) * 30); ctx.lineTo(x + 70, 0); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,115,82,.22)'; ctx.fillRect(0, viewH - 42, viewW, 42);
  } else {
    ctx.fillStyle = '#fff6bf'; for (let i = 0; i < 70; i += 1) { const x = ((i * 91 - camera * .06) % (viewW + 20) + viewW + 20) % (viewW + 20); const y = (i * 37) % 255 + 8; const r = 0.8 + (i % 3) * .6 + Math.sin(time * 3 + i) * .3; ctx.fillRect(x, y, r, r); }
    ctx.fillStyle = '#4b3584'; for (let i = -1; i < Math.ceil(viewW / 100) + 2; i += 1) { const x = i * 110 - (camera * .18) % 110; ctx.fillRect(x, 190, 74, viewH - 190); ctx.fillStyle = '#8c7aca'; ctx.fillRect(x + 12, 210, 14, 22); ctx.fillStyle = '#4b3584'; }
  }
  const vignette = ctx.createLinearGradient(0, 0, 0, viewH); vignette.addColorStop(0, 'rgba(255,255,255,.04)'); vignette.addColorStop(.72, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(12,10,35,.24)'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, viewW, viewH);
}

function drawPlatform(ctx: CanvasRenderingContext2D, r: Rect, biome: QuestLevel['biome']) {
  const top = biome === 'meadow' ? '#9ce76e' : biome === 'cavern' ? '#f1996e' : '#aa9ae9'; const body = biome === 'meadow' ? '#6ca955' : biome === 'cavern' ? '#6b405a' : '#4f478f';
  ctx.fillStyle = '#241d42'; ctx.fillRect(r.x + 3, r.y + 4, r.w, r.h);
  ctx.fillStyle = body; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.fillStyle = top; ctx.fillRect(r.x, r.y, r.w, 6);
  ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(r.x, r.y + 6, r.w, 2);
  for (let x = r.x + 8; x < r.x + r.w; x += 24) {
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x, r.y + 12, 9, 3);
    ctx.fillStyle = 'rgba(22,22,55,.16)'; ctx.fillRect(x + 5, r.y + 21, 13, 3);
  }
}

function drawHero(ctx: CanvasRenderingContext2D, h: Hero, time: number) {
  const stride = h.grounded ? Math.sin(time * 17 + h.x / 11) * Math.min(3, Math.abs(h.vx) / 62) : 0;
  const bob = h.grounded ? Math.abs(stride) * -.35 : -1;
  ctx.save(); ctx.translate(Math.round(h.x + h.w / 2), Math.round(h.y + h.h / 2 + bob)); if (h.facing < 0) ctx.scale(-1, 1);
  if (h.hurt > 0 && Math.floor(h.hurt * 14) % 2 === 0) ctx.globalAlpha = .42;
  if (h.star > 0) {
    ctx.strokeStyle = '#d6ffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 19 + Math.sin(time * 18) * 2, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 4; i += 1) { const a = time * 4 + i * Math.PI / 2; ctx.fillStyle = i % 2 ? '#fff19a' : '#8cf6ff'; ctx.fillRect(Math.cos(a) * 18 - 1, Math.sin(a) * 18 - 1, 3, 3); }
  }
  // Original Lantern Keeper sprite: scarf, star cap, satchel, and bright boots.
  ctx.fillStyle = '#e85f64'; ctx.fillRect(-10, -5, 5, 13); ctx.fillRect(-13, -2, 6, 4);
  ctx.fillStyle = h.armour ? '#f3a6d8' : '#3f67dd'; ctx.fillRect(-9, -5, 18, 15);
  ctx.fillStyle = h.armour ? '#fff0fb' : '#7fa4ff'; ctx.fillRect(-8, -4, 16, 3);
  ctx.fillStyle = '#7b4e2c'; ctx.fillRect(-10, 1, 4, 8); ctx.fillStyle = '#ffd766'; ctx.fillRect(-9, 3, 2, 3);
  ctx.fillStyle = '#f5c39e'; ctx.fillRect(-7, -15, 14, 12);
  ctx.fillStyle = '#20285c'; ctx.fillRect(-9, -18, 18, 6); ctx.fillRect(-7, -20, 12, 3);
  ctx.fillStyle = '#ffc857'; ctx.fillRect(-10, -21, 14, 5); ctx.fillRect(1, -24, 4, 4);
  ctx.fillStyle = '#172048'; ctx.fillRect(2, -11, 3, 3); ctx.fillStyle = '#fff'; ctx.fillRect(3, -11, 1, 1);
  ctx.fillStyle = '#ffe27d'; ctx.fillRect(-8 + stride, 10, 7, 5); ctx.fillRect(2 - stride, 10, 7, 5);
  ctx.fillStyle = '#4b3268'; ctx.fillRect(-8 + stride, 14, 8, 3); ctx.fillRect(2 - stride, 14, 8, 3);
  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, time: number) {
  if (!e.alive) return; ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
  if (e.kind === 'mossling') { ctx.fillStyle = '#243c35'; ctx.beginPath(); ctx.ellipse(0, 7, 14, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#5a914e'; ctx.beginPath(); ctx.arc(0, 1, 13, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#b7ec72'; ctx.fillRect(-11, -11, 22, 8); ctx.fillStyle = '#d8ff94'; ctx.fillRect(-7, -14, 5, 5); ctx.fillRect(3, -15, 6, 6); ctx.fillStyle = '#172b35'; ctx.fillRect(-5, 0, 3, 4); ctx.fillRect(4, 0, 3, 4); }
  else if (e.kind === 'emberbat') { const wing = Math.sin(time * 11) * 5; ctx.fillStyle = '#6c294e'; ctx.beginPath(); ctx.moveTo(-17, 1); ctx.lineTo(-5, -10-wing); ctx.lineTo(0, 3); ctx.lineTo(6, -10-wing); ctx.lineTo(17, 1); ctx.lineTo(6, 9); ctx.lineTo(0, 13); ctx.lineTo(-6, 9); ctx.fill(); ctx.fillStyle = '#f47f83'; ctx.fillRect(-5, -4, 10, 13); ctx.fillStyle = '#fff0b2'; ctx.fillRect(-3, 0, 2, 3); ctx.fillRect(2, 0, 2, 3); }
  else { ctx.shadowColor = '#8c7cff'; ctx.shadowBlur = 10; ctx.fillStyle = '#5e4d9a'; ctx.fillRect(-20, -15, 40, 35); ctx.shadowBlur = 0; ctx.fillStyle = '#b9abff'; ctx.fillRect(-15, -21, 30, 12); ctx.fillStyle = '#f9dc72'; ctx.fillRect(-5, -8, 10, 7); ctx.strokeStyle = '#d9d2ff'; ctx.lineWidth = 2; ctx.strokeRect(-21, -16, 42, 37); ctx.fillStyle = '#392d68'; ctx.fillRect(-15, 21, 10, 5); ctx.fillRect(5, 21, 10, 5); }
  ctx.restore();
}

function drawMap(
  ctx: CanvasRenderingContext2D,
  s: State,
  pulse: number,
  keyArt: HTMLImageElement | null,
  viewW: number,
  viewH: number,
) {
  if (keyArt) {
    const sourceW = Math.min(keyArt.width, keyArt.height * viewW / viewH);
    ctx.drawImage(keyArt, (keyArt.width - sourceW) / 2, 0, sourceW, keyArt.height, 0, 0, viewW, viewH);
    const shade = ctx.createLinearGradient(0, 0, 0, viewH);
    shade.addColorStop(0, 'rgba(17,24,61,.28)');
    shade.addColorStop(0.42, 'rgba(17,24,61,.5)');
    shade.addColorStop(1, 'rgba(17,18,48,.9)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, viewW, viewH);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, viewH);
    g.addColorStop(0, '#182951');
    g.addColorStop(1, '#5a4588');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);
  }
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  for (let i = 0; i < 46; i += 1) ctx.fillRect((i * 113) % viewW, (i * 53) % 225, 2, 2);
  ctx.fillStyle = '#f4d66d'; ctx.font = `900 ${viewW < 340 ? 23 : 30}px ui-rounded,system-ui`; ctx.textAlign = 'center'; ctx.fillText('KINGDOM QUEST', viewW / 2, 38);
  ctx.fillStyle = '#d8eaff'; ctx.font = `${viewW < 340 ? 11 : 14}px system-ui`; ctx.fillText('Sixteen realms. Lost runes. One brave keeper.', viewW / 2, 58);
  const colors = ['#86d974', '#ef936e', '#ad9cff'];
  const gridLeft = Math.max(30, viewW * .11); const gridSpan = (viewW - gridLeft * 2) / 3;
  const nodes = LEVELS.map((level, i) => {
    const row = Math.floor(i / 4); const logicalColumn = i % 4; const column = row % 2 ? 3 - logicalColumn : logicalColumn;
    return { x: gridLeft + column * gridSpan, y: 172 + row * 48, color: colors[['meadow', 'cavern', 'citadel'].indexOf(level.biome)] };
  });
  ctx.strokeStyle = 'rgba(244,214,109,.72)'; ctx.lineWidth = 3; ctx.beginPath(); nodes.forEach((node, i) => { if (i === 0) ctx.moveTo(node.x, node.y); else ctx.lineTo(node.x, node.y); }); ctx.stroke();
  nodes.forEach((n, i) => {
    const open = i <= s.levelIndex; const current = i === s.levelIndex; const radius = 13 + (current ? Math.sin(pulse * 5) * 1.5 : 0);
    ctx.fillStyle = open ? n.color : '#53607e'; ctx.beginPath(); ctx.arc(n.x, n.y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff1a8'; ctx.lineWidth = current ? 3 : 1; ctx.stroke();
    ctx.fillStyle = '#111737'; ctx.font = `900 ${viewW < 340 ? 8 : 9}px system-ui`; ctx.fillText(String(i + 1), n.x, n.y + 3);
  });
  const l = s.level; ctx.fillStyle = '#fff8cf'; ctx.font = `bold ${viewW < 340 ? 16 : 18}px system-ui`; ctx.fillText(l.name, viewW / 2, 89);
  ctx.fillStyle = 'rgba(12,17,45,.72)'; ctx.beginPath(); ctx.roundRect(12, 101, viewW - 24, 42, 12); ctx.fill();
  ctx.fillStyle = '#e2edff'; ctx.font = `${viewW < 340 ? 10 : 12}px system-ui`; ctx.fillText(l.tip.length > 56 && viewW < 340 ? `${l.tip.slice(0, 53)}…` : l.tip, viewW / 2, 126);
  ctx.fillStyle = '#f4d66d'; ctx.font = 'bold 14px system-ui'; ctx.fillText('JUMP TO ENTER', viewW / 2, viewH - 15);
}

export default function KingdomQuest({ paused, input, api, restartToken, difficulty }: GameCanvasProps) {
  const stateRef = useRef<State>(fresh()); const elapsedRef = useRef(0);
  const keyArtRef = useRef<HTMLImageElement | null>(null);
  const panoramaRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => { stateRef.current = fresh(); }, [restartToken, difficulty]);
  useEffect(() => {
    const keyArt = new Image(); const panorama = new Image();
    keyArt.src = '/assets/coin-runner-v3/kingdom-quest-key-art.webp';
    panorama.src = '/assets/coin-runner-v3/skybound-kingdom.png';
    keyArt.onload = () => { keyArtRef.current = keyArt; };
    panorama.onload = () => { panoramaRef.current = panorama; };
    return () => { keyArtRef.current = null; panoramaRef.current = null; };
  }, []);
  useEffect(() => {
    if (paused) return;
    let stop: (() => void) | null = null;
    const begin = () => { stop ??= startKingdomMusic(); };
    window.addEventListener('pointerdown', begin, { once: true });
    window.addEventListener('keydown', begin, { once: true });
    return () => { window.removeEventListener('pointerdown', begin); window.removeEventListener('keydown', begin); stop?.(); };
  }, [paused]);
  const { canvasRef } = useCanvasGame({ active: !paused, step: (ctx, dt, cw, ch) => {
    const s = stateRef.current; elapsedRef.current += dt; const time = elapsedRef.current;
    const viewport = questViewport(cw, ch); const viewW = viewport.w; const viewH = viewport.h; const scale = viewport.scale;
    const ox = (cw - viewW * scale) / 2; const oy = (ch - viewH * scale) / 2;
    const jump = input.consumeJump();
    ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#0b102c'; ctx.fillRect(0, 0, cw, ch);
    ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale);
    if (s.phase === 'map') {
      drawMap(ctx, s, time, keyArtRef.current, viewW, viewH);
      if (jump) { s.phase = 'playing'; s.banner = 2.6; playSound('pass'); api.setStatus(`${s.level.name}: ${s.level.tip}`); }
      ctx.restore(); return;
    }
    if (s.phase === 'finale') {
      drawSky(ctx, 'citadel', 0, time, viewW, viewH, null); ctx.fillStyle = '#fff5bb'; ctx.font = `900 ${viewW < 350 ? 25 : 34}px ui-rounded,system-ui`; ctx.textAlign = 'center'; ctx.fillText('THE LANTERN SHINES!', viewW / 2, 115);
      ctx.fillStyle = '#dce9ff'; ctx.font = `${viewW < 350 ? 13 : 18}px system-ui`; ctx.fillText(`${s.runes} runes · ${s.coins} sun-coins`, viewW / 2, 160); ctx.fillText('Every realm glows again.', viewW / 2, 190);
      for (let i = 0; i < 40; i += 1) { ctx.fillStyle = ['#ffda68', '#95f3ff', '#f4a6df'][i % 3]; ctx.fillRect((i * 67 + time * 30) % viewW, 220 + (i * 37) % 110, 4, 4); }
      ctx.fillStyle = '#fff5bb'; ctx.font = 'bold 15px system-ui'; ctx.fillText('Restart for a new quest', viewW / 2, viewH - 25); ctx.restore(); return;
    }
    const h = s.hero; const speed = questPace(s.levelIndex, SPEED_SCALE[difficulty]);
    h.hurt = Math.max(0, h.hurt - dt); h.star = Math.max(0, h.star - dt); s.banner = Math.max(0, s.banner - dt); s.shake = Math.max(0, s.shake - dt); s.comboT = Math.max(0, s.comboT - dt); if (!s.comboT) s.combo = 0; s.finalT += dt;
    const beforeBottom = h.y + h.h; const wasGrounded = h.grounded; let landed = false;
    const slices = simulationSteps(dt);
    slices.forEach((slice, index) => {
      const result = stepHero(h, s.level.platforms, { left: input.held.left, right: input.held.right, jumpPressed: jump && index === 0, jumpHeld: input.jumpHeld }, slice);
      landed ||= result.landed;
      for (const enemy of s.level.enemies) stepEnemy(enemy, slice, speed);
      if (s.level.boss) stepEnemy(s.level.boss, slice, speed);
    });
    if (jump && wasGrounded && h.vy < 0) playSound('jump');
    if (landed && !wasGrounded) playSound('land');
    h.x = Math.max(0, Math.min(s.level.width - h.w, h.x));
    const threats = [...s.level.enemies, ...(s.level.boss ? [s.level.boss] : [])];
    for (const enemy of threats) if (enemy.alive && overlaps(h, enemy)) { if ((h.star > 0 || (h.vy > 70 && beforeBottom <= enemy.y + 10))) stomp(s, enemy, api); else damage(s, api, enemy.kind === 'sentinel' ? 'The Sentinel stopped the quest' : 'A realm creature bumped you'); }
    collectAll(s, api);
    for (const cp of s.level.checkpoints) if (!cp.hit && overlaps(h, cp)) { cp.hit = true; s.respawn = { x: cp.x - 14, y: GROUND_Y - HERO_H }; api.setStatus('Lantern lit — checkpoint saved!'); playSound('powerup'); pushBurst(s, cp.x + 9, cp.y + 12, '#ffe16a', 14); }
    if (h.y > WORLD_H + 60) damage(s, api, 'You fell beyond the realm');
    if (!s.level.goal.locked && overlaps(h, s.level.goal)) {
      pushBurst(s, s.level.goal.x + 17, s.level.goal.y + 18, '#ffe16a', 36); api.addScore(200 + s.level.coins.length * 5); playSound('levelClear');
      if (s.levelIndex === LEVELS.length - 1) { s.phase = 'finale'; api.requestGate('Aurora Crown restored'); }
      else { const next = s.levelIndex + 1; stateRef.current = fresh(next, 'map', s.coins, s.runes); api.requestGate(`${s.level.name} restored`); ctx.restore(); return; }
    }
    s.camera = dampCamera(s.camera, cameraTarget(h.x, viewW, s.level.width), dt);
    drawSky(ctx, s.level.biome, s.camera, time, viewW, viewH, s.level.biome === 'meadow' ? panoramaRef.current : null);
    ctx.save(); ctx.translate(-s.camera + (Math.random() - .5) * s.shake * 18, 0);
    for (const platform of s.level.platforms) drawPlatform(ctx, platform, s.level.biome);
    for (const c of s.level.coins) { const spin = .25 + Math.abs(Math.sin(time * 5 + c.x)) * .75; ctx.save(); ctx.translate(c.x + 6.5, c.y + 6.5); ctx.scale(spin, 1); ctx.shadowColor = '#ffe36f'; ctx.shadowBlur = 7; ctx.fillStyle = '#ffc83d'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#fff9ca'; ctx.fillRect(-1, -4, 2, 8); ctx.restore(); }
    for (const r of s.level.runes) { ctx.shadowColor = '#8df6ff'; ctx.shadowBlur = 10; ctx.fillStyle = '#8df6ff'; ctx.beginPath(); ctx.moveTo(r.x + 8, r.y); ctx.lineTo(r.x + 16, r.y + 10); ctx.lineTo(r.x + 8, r.y + 20); ctx.lineTo(r.x, r.y + 10); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.fillRect(r.x + 7, r.y + 5, 2, 9); }
    for (const power of s.level.powers) if (!power.used) { const pulse = 10 + Math.sin(time * 7) * 2; ctx.shadowColor = power.kind === 'bloom' ? '#ffb7e4' : '#c7fbff'; ctx.shadowBlur = 12; ctx.fillStyle = power.kind === 'bloom' ? '#ffb7e4' : '#c7fbff'; ctx.beginPath(); ctx.arc(power.x + 10, power.y + 11, pulse, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.fillRect(power.x + 9, power.y + 5, 2, 12); }
    for (const cp of s.level.checkpoints) { ctx.fillStyle = '#4a3d67'; ctx.fillRect(cp.x + 8, cp.y, 3, 56); ctx.fillStyle = cp.hit ? '#ffe068' : '#8f9bb5'; ctx.beginPath(); ctx.arc(cp.x + 9, cp.y + 7, cp.hit ? 9 : 6, 0, Math.PI * 2); ctx.fill(); }
    for (const enemy of threats) drawEnemy(ctx, enemy, time); drawHero(ctx, h, time);
    ctx.fillStyle = s.level.goal.locked ? '#6b587c' : '#7f5539'; ctx.fillRect(s.level.goal.x + 12, s.level.goal.y, 6, 82); ctx.fillStyle = s.level.goal.locked ? '#b49ec9' : '#fff5ab'; ctx.beginPath(); ctx.moveTo(s.level.goal.x + 18, s.level.goal.y + 4); ctx.lineTo(s.level.goal.x + 47, s.level.goal.y + 16); ctx.lineTo(s.level.goal.x + 18, s.level.goal.y + 29); ctx.fill(); ctx.shadowColor = '#fff5ab'; ctx.shadowBlur = s.level.goal.locked ? 0 : 12; ctx.beginPath(); ctx.arc(s.level.goal.x + 15, s.level.goal.y + 5, 7, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    for (const part of s.particles) { part.life -= dt; part.x += part.vx * dt; part.y += part.vy * dt; part.vy += 120 * dt; if (part.life > 0) { ctx.globalAlpha = Math.min(1, part.life * 2); ctx.fillStyle = part.color; ctx.fillRect(part.x, part.y, 3, 3); } } ctx.globalAlpha = 1; s.particles = s.particles.filter((v) => v.life > 0);
    ctx.restore();
    // HUD remains in screen coordinates while the world scrolls underneath.
    const hudW = Math.min(viewW - 20, 245); ctx.fillStyle = 'rgba(11,18,48,.84)'; ctx.beginPath(); ctx.roundRect(10, 10, hudW, 50, 12); ctx.fill();
    ctx.fillStyle = '#fff7c0'; ctx.font = `bold ${viewW < 340 ? 12 : 14}px system-ui`; ctx.textAlign = 'left'; ctx.fillText(`${s.level.name}  ${s.levelIndex + 1}/${LEVELS.length}`, 19, 29);
    ctx.fillStyle = '#fff'; ctx.font = '13px system-ui'; ctx.fillText(`♥${s.hearts}   ◉${s.coins}   ◇${s.runes}${s.combo > 1 ? `   ×${s.combo}` : ''}`, 19, 49);
    if (s.level.boss?.alive) { const bossW = Math.min(170, viewW - 20); const bossX = viewW - bossW - 10; ctx.fillStyle = 'rgba(30,20,60,.82)'; ctx.beginPath(); ctx.roundRect(bossX, 67, bossW, 32, 10); ctx.fill(); ctx.fillStyle = '#e3d8ff'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`SENTINEL  ${'✦'.repeat(s.level.boss.hp)}`, bossX + bossW / 2, 87); }
    if (s.banner > 0) { const bannerW = Math.min(viewW - 24, 390); const bx = (viewW - bannerW) / 2; ctx.fillStyle = 'rgba(21,25,58,.86)'; ctx.beginPath(); ctx.roundRect(bx, 75, bannerW, 52, 13); ctx.fill(); ctx.fillStyle = '#fff6ba'; ctx.font = `bold ${viewW < 340 ? 11 : 14}px system-ui`; ctx.textAlign = 'center'; const tip = viewW < 340 && s.level.tip.length > 46 ? `${s.level.tip.slice(0, 43)}…` : s.level.tip; ctx.fillText(tip, viewW / 2, 105); }
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
