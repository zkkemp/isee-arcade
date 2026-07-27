'use client';

import { useEffect, useRef } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import { useCanvasGame } from '@/lib/useCanvasGame';
import { PICTURES, boardLayout, cellAt, emptyPainting, isComplete, paintCell, progressFor, type PictureTemplate } from '@/lib/colorByNumber';
import { playSound } from '@/lib/sound';

type Mode = 'gallery' | 'paint';
type State = {
  mode: Mode; page: number; pictureIndex: number; painted: number[]; selected: number; zoom: number; panX: number; panY: number;
  draggingCell: number | null; wrong: { index: number; time: number } | null; complete: number; gateSent: boolean; completed: Set<string>;
};

const SAVE_KEY = 'isee-arcade:color-by-number:v1';
const FINISHED_KEY = 'isee-arcade:color-by-number:finished:v1';
const PER_PAGE = 8;

function safeLoadPicture(picture: PictureTemplate): number[] {
  if (typeof window === 'undefined') return emptyPainting(picture);
  try {
    const all = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? '{}') as Record<string, number[]>;
    const candidate = all[picture.id];
    return Array.isArray(candidate) && candidate.length === picture.cells.length && candidate.every((v) => Number.isInteger(v) && v >= -1 && v < picture.palette.length) ? candidate : emptyPainting(picture);
  } catch { return emptyPainting(picture); }
}
function savePicture(picture: PictureTemplate, painted: number[]) {
  try { const all = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? '{}') as Record<string, number[]>; all[picture.id] = painted; window.localStorage.setItem(SAVE_KEY, JSON.stringify(all)); } catch { /* optional local resume */ }
}
function loadFinished() {
  if (typeof window === 'undefined') return new Set<string>();
  try { const ids = JSON.parse(window.localStorage.getItem(FINISHED_KEY) ?? '[]'); return new Set(Array.isArray(ids) ? ids.filter((v): v is string => typeof v === 'string') : []); } catch { return new Set<string>(); }
}
function saveFinished(done: Set<string>) { try { window.localStorage.setItem(FINISHED_KEY, JSON.stringify([...done])); } catch { /* optional local resume */ } }
function fresh(): State { return { mode: 'gallery', page: 0, pictureIndex: 0, painted: [], selected: 0, zoom: 1, panX: 0, panY: 0, draggingCell: null, wrong: null, complete: 0, gateSent: false, completed: loadFinished() }; }

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 12) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function pageCount() { return Math.ceil(PICTURES.length / PER_PAGE); }
function galleryCardAt(x: number, y: number, width: number, height: number, page: number): number | null {
  const gap = 12; const cardW = (width - gap * 3) / 2; const cardH = (height - 126 - gap * 5) / 4;
  const col = Math.floor((x - gap) / (cardW + gap)); const row = Math.floor((y - 82) / (cardH + gap));
  if (col < 0 || col > 1 || row < 0 || row > 3 || x > gap + col * (cardW + gap) + cardW || y > 82 + row * (cardH + gap) + cardH) return null;
  const index = page * PER_PAGE + row * 2 + col; return index < PICTURES.length ? index : null;
}

function paletteIndexAt(x: number, y: number, width: number, height: number, picture: PictureTemplate): number | null {
  const perRow = Math.min(8, picture.palette.length); const size = Math.min(39, (width - 22) / perRow); const rows = Math.ceil(picture.palette.length / perRow); const top = height - rows * 47 - 8;
  const col = Math.floor((x - 11) / size); const row = Math.floor((y - top) / 47); const index = row * perRow + col;
  return col >= 0 && col < perRow && row >= 0 && row < rows && index < picture.palette.length ? index : null;
}

export default function ColorByNumber({ paused, input, api, restartToken, controlsInset }: GameCanvasProps) {
  const stateRef = useRef<State>(fresh()); const insetRef = useRef(controlsInset);
  useEffect(() => { stateRef.current = fresh(); }, [restartToken]);
  useEffect(() => { insetRef.current = controlsInset; }, [controlsInset]);
  const { canvasRef } = useCanvasGame({ active: !paused, step: (ctx, dt, cw, ch) => {
    const s = stateRef.current; const playH = Math.max(180, ch - insetRef.current); const pressed = input.consumePointerPress();
    if (s.wrong) s.wrong.time -= dt;
    if (s.complete > 0) {
      s.complete -= dt;
      if (s.complete <= .4 && !s.gateSent) {
        s.gateSent = true; api.requestGate(`${PICTURES[s.pictureIndex].name} completed`);
        const next = (s.pictureIndex + 1) % PICTURES.length; stateRef.current = { ...fresh(), page: Math.floor(next / PER_PAGE) };
      }
    }
    if (s.mode === 'gallery') {
      if (pressed && input.pointerX !== null && input.pointerY !== null) {
        const x = input.pointerX * cw; const y = input.pointerY * playH;
        if (y > playH - 42) {
          if (x < 84) s.page = Math.max(0, s.page - 1); else if (x > cw - 84) s.page = Math.min(pageCount() - 1, s.page + 1);
        } else {
          const selected = galleryCardAt(x, y, cw, playH, s.page);
          if (selected !== null) { const picture = PICTURES[selected]; s.mode = 'paint'; s.pictureIndex = selected; s.painted = safeLoadPicture(picture); s.selected = 0; s.zoom = 1; s.panX = 0; s.panY = 0; s.wrong = null; playSound('click'); }
        }
      }
      drawGallery(ctx, s, cw, playH); return;
    }
    const picture = PICTURES[s.pictureIndex];
    if (pressed && input.pointerX !== null && input.pointerY !== null) {
      const x = input.pointerX * cw; const y = input.pointerY * playH;
      if (y < 48 && x < 60) { s.mode = 'gallery'; s.draggingCell = null; playSound('click'); }
      else if (y >= 54 && y < 92 && x > cw - 180 && x < cw - 153) s.panX += 32;
      else if (y >= 54 && y < 92 && x >= cw - 153 && x < cw - 126) s.panY += 32;
      else if (y >= 54 && y < 92 && x >= cw - 126 && x < cw - 99) s.panY -= 32;
      else if (y >= 54 && y < 92 && x >= cw - 99 && x < cw - 72) s.panX -= 32;
      else if (y >= 54 && y < 92 && x >= cw - 68 && x < cw - 39) { s.zoom = Math.max(.8, s.zoom - .2); }
      else if (y >= 54 && y < 92 && x >= cw - 39 && x < cw - 9) { s.zoom = Math.min(2.2, s.zoom + .2); }
      else {
        const key = paletteIndexAt(x, y, cw, playH, picture);
        if (key !== null) { s.selected = key; s.draggingCell = null; playSound('click'); }
      }
    }
    const keyTap = input.consumeJump(); if (keyTap) s.selected = (s.selected + 1) % picture.palette.length;
    if (!input.pointerDown) s.draggingCell = null;
    if (input.pointerDown && input.pointerX !== null && input.pointerY !== null && s.complete <= 0) {
      const layout = boardLayout(cw, playH, picture, s.zoom, s.panX, s.panY); const index = cellAt(layout, picture, input.pointerX * cw, input.pointerY * playH);
      if (index !== null && index !== s.draggingCell) {
        s.draggingCell = index;
        const painted = paintCell(picture, s.painted, index, s.selected);
        if (painted.correct) {
          if (s.painted[index] !== s.selected) { s.painted = painted.next; savePicture(picture, s.painted); playSound('coin'); }
          if (isComplete(picture, s.painted)) { s.completed.add(picture.id); saveFinished(s.completed); s.complete = 2.15; api.addScore(300 + picture.palette.length * 20); api.setStatus(`${picture.name} finished perfectly!`); playSound('levelClear'); }
        } else { s.wrong = { index, time: .35 }; playSound('wrong'); }
      }
    }
    drawPaint(ctx, s, picture, cw, playH);
  }});
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-label="Color by Number painting game" />;
}

function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const bg = ctx.createLinearGradient(0, 0, width, height); bg.addColorStop(0, '#202957'); bg.addColorStop(.5, '#442d66'); bg.addColorStop(1, '#1c4d5c'); ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 40; i += 1) { const x = (i * 97) % width; const y = (i * 61) % height; ctx.beginPath(); ctx.arc(x, y, 1 + i % 3, 0, Math.PI * 2); ctx.fill(); }
}

function drawThumbnail(ctx: CanvasRenderingContext2D, picture: PictureTemplate, x: number, y: number, w: number, h: number) {
  const cell = Math.min((w - 16) / picture.cols, (h - 30) / picture.rows); const ox = x + (w - picture.cols * cell) / 2; const oy = y + 10 + (h - 24 - picture.rows * cell) / 2;
  for (let r = 0; r < picture.rows; r += 1) for (let c = 0; c < picture.cols; c += 1) { ctx.fillStyle = picture.palette[picture.cells[r * picture.cols + c]].hex; ctx.fillRect(ox + c * cell, oy + r * cell, Math.ceil(cell) + .4, Math.ceil(cell) + .4); }
}

function drawGallery(ctx: CanvasRenderingContext2D, s: State, width: number, height: number) {
  drawBackground(ctx, width, height); ctx.fillStyle = '#fff7cf'; ctx.font = '900 25px ui-rounded, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('COLOR BY NUMBER', width / 2, 34); ctx.fillStyle = '#d9eaff'; ctx.font = '13px system-ui'; ctx.fillText('Choose a picture — every color has a numbered home.', width / 2, 56);
  const gap = 12; const cardW = (width - gap * 3) / 2; const cardH = (height - 126 - gap * 5) / 4;
  for (let slot = 0; slot < PER_PAGE; slot += 1) {
    const index = s.page * PER_PAGE + slot; if (index >= PICTURES.length) break; const picture = PICTURES[index]; const col = slot % 2; const row = Math.floor(slot / 2); const x = gap + col * (cardW + gap); const y = 82 + row * (cardH + gap);
    ctx.fillStyle = 'rgba(13,18,48,.78)'; rounded(ctx, x, y, cardW, cardH); ctx.fill(); drawThumbnail(ctx, picture, x, y, cardW, cardH - 25);
    if (s.completed.has(picture.id)) { ctx.fillStyle = '#8cf1b5'; ctx.beginPath(); ctx.arc(x + cardW - 16, y + 16, 10, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#153c35'; ctx.font = 'bold 13px system-ui'; ctx.fillText('✓', x + cardW - 16, y + 21); }
    ctx.fillStyle = '#fff7dc'; ctx.font = '800 12px ui-rounded, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(picture.name, x + 9, y + cardH - 8); ctx.textAlign = 'right'; ctx.fillStyle = '#b8d6ff'; ctx.fillText(picture.category.toUpperCase(), x + cardW - 9, y + cardH - 8);
  }
  ctx.fillStyle = 'rgba(7,10,30,.74)'; rounded(ctx, 10, height - 42, width - 20, 31, 13); ctx.fill(); ctx.fillStyle = '#dbeaff'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`‹  PAGE ${s.page + 1} OF ${pageCount()}  ›     ${s.completed.size}/${PICTURES.length} PERFECT`, width / 2, height - 21);
}

function drawPaint(ctx: CanvasRenderingContext2D, s: State, picture: PictureTemplate, width: number, height: number) {
  drawBackground(ctx, width, height); const layout = boardLayout(width, height, picture, s.zoom, s.panX, s.panY); const pct = Math.round(progressFor(picture, s.painted) * 100);
  ctx.fillStyle = 'rgba(8,12,38,.84)'; rounded(ctx, 9, 8, width - 18, 40, 13); ctx.fill(); ctx.font = '900 15px ui-rounded, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff5c7'; ctx.fillText('‹ GALLERY', 18, 33); ctx.textAlign = 'center'; ctx.fillText(picture.name, width / 2, 33); ctx.textAlign = 'right'; ctx.fillStyle = '#a9f5d1'; ctx.fillText(`${pct}%`, width - 20, 33);
  ctx.fillStyle = 'rgba(8,12,38,.74)'; rounded(ctx, width - 180, 54, 171, 38, 11); ctx.fill(); ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#dbeaff'; ctx.fillText(`◀  ▲  ▼  ▶    −  +`, width - 94, 79);
  const keyRows = Math.ceil(picture.palette.length / 8); const keyTop = height - keyRows * 47 - 8;
  // Zoomed artwork stays inside its own viewport, leaving the navigation and
  // color key continuously available instead of letting pixels cover controls.
  ctx.save(); ctx.beginPath(); ctx.rect(0, 96, width, Math.max(1, keyTop - 106)); ctx.clip();
  ctx.fillStyle = '#fff9e7'; rounded(ctx, layout.x - 4, layout.y - 4, layout.width + 8, layout.height + 8, 6); ctx.fill();
  for (let r = 0; r < picture.rows; r += 1) for (let c = 0; c < picture.cols; c += 1) {
    const index = r * picture.cols + c; const x = layout.x + c * layout.cell; const y = layout.y + r * layout.cell; const filled = s.painted[index] === picture.cells[index];
    ctx.fillStyle = filled ? picture.palette[picture.cells[index]].hex : '#fffaf0'; ctx.fillRect(x, y, layout.cell + .25, layout.cell + .25);
    if (!filled && picture.cells[index] === s.selected) { ctx.fillStyle = 'rgba(255,212,69,.35)'; ctx.fillRect(x + .5, y + .5, layout.cell - 1, layout.cell - 1); }
    ctx.strokeStyle = s.wrong?.index === index && s.wrong.time > 0 ? '#ff4d78' : filled ? 'rgba(255,255,255,.25)' : 'rgba(58,48,91,.20)'; ctx.lineWidth = s.wrong?.index === index ? 2 : .7; ctx.strokeRect(x, y, layout.cell, layout.cell);
    if (!filled && layout.cell >= 11) { ctx.fillStyle = picture.cells[index] === s.selected ? '#5a3f79' : '#8d8094'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `800 ${Math.max(8, layout.cell * .52)}px ui-rounded, system-ui`; ctx.fillText(String(picture.cells[index] + 1), x + layout.cell / 2, y + layout.cell / 2 + .5); }
  }
  ctx.restore();
  const perRow = Math.min(8, picture.palette.length); const size = Math.min(39, (width - 22) / perRow); const top = keyTop;
  for (let i = 0; i < picture.palette.length; i += 1) { const col = i % perRow; const row = Math.floor(i / perRow); const x = 11 + col * size; const y = top + row * 47; ctx.fillStyle = i === s.selected ? '#fff3a7' : 'rgba(255,255,255,.2)'; rounded(ctx, x - 2, y - 2, size - 3, 42, 9); ctx.fill(); ctx.fillStyle = picture.palette[i].hex; rounded(ctx, x + 2, y + 2, size - 11, 33, 7); ctx.fill(); ctx.fillStyle = '#1b1837'; ctx.font = '900 14px ui-rounded, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), x + (size - 11) / 2 + 2, y + 19); if (i === s.selected) { ctx.fillStyle = '#fff7ce'; ctx.font = 'bold 9px system-ui'; ctx.fillText(picture.palette[i].name, x + (size - 11) / 2 + 2, y + 48); } }
  if (s.complete > 0) { ctx.fillStyle = 'rgba(12,17,53,.74)'; ctx.fillRect(0, 0, width, height); ctx.fillStyle = '#fff4a6'; ctx.font = '900 29px ui-rounded, system-ui'; ctx.textAlign = 'center'; ctx.fillText('PICTURE PERFECT!', width / 2, height / 2 - 8); ctx.fillStyle = '#d9f5ff'; ctx.font = '16px system-ui'; ctx.fillText('Every numbered cell is exactly right.', width / 2, height / 2 + 22); }
}
