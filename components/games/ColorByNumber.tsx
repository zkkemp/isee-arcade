'use client';

import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import { useCanvasGame } from '@/lib/useCanvasGame';
import {
  PICTURES,
  availableColors,
  boardLayout,
  cellAt,
  emptyPainting,
  isComplete,
  paintCell,
  paletteLayout,
  progressFor,
  remainingByColor,
  type PictureTemplate,
} from '@/lib/colorByNumber';
import { playSound } from '@/lib/sound';
import { profileStorageSuffix } from '@/lib/profiles';

type Mode = 'gallery' | 'paint';
type State = {
  mode: Mode; page: number; pictureIndex: number; painted: number[]; selected: number; zoom: number; panX: number; panY: number;
  draggingCell: number | null; wrong: { index: number; time: number } | null; complete: number; gateSent: boolean; completed: Set<string>;
  viewW: number; viewH: number;
};
type Point = { x: number; y: number };
type Pinch = { distance: number; cellX: number; cellY: number };

const SAVE_KEY = 'isee-arcade:color-by-number:v1';
const FINISHED_KEY = 'isee-arcade:color-by-number:finished:v1';
const PER_PAGE = 6;

function key(base: string): string {
  return `${base}${profileStorageSuffix()}`;
}

function queueSync(): void {
  void import('@/lib/cloudSync')
    .then(({ queueCloudSync }) => queueCloudSync())
    .catch(() => undefined);
}

function safeLoadPicture(picture: PictureTemplate): number[] {
  if (typeof window === 'undefined') return emptyPainting(picture);
  try {
    const raw = window.localStorage.getItem(key(SAVE_KEY)) ?? window.localStorage.getItem(SAVE_KEY);
    const all = JSON.parse(raw ?? '{}') as Record<string, number[]>;
    const candidate = all[picture.id];
    return Array.isArray(candidate) && candidate.length === picture.cells.length && candidate.every((v) => Number.isInteger(v) && v >= -1 && v < picture.palette.length) ? candidate : emptyPainting(picture);
  } catch { return emptyPainting(picture); }
}
function savePicture(picture: PictureTemplate, painted: number[]) {
  try {
    const storageKey = key(SAVE_KEY);
    const fallback = window.localStorage.getItem(SAVE_KEY);
    const all = JSON.parse(window.localStorage.getItem(storageKey) ?? fallback ?? '{}') as Record<string, number[]>;
    all[picture.id] = painted;
    window.localStorage.setItem(storageKey, JSON.stringify(all));
    queueSync();
  } catch { /* optional local resume */ }
}
function loadFinished() {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const raw = window.localStorage.getItem(key(FINISHED_KEY)) ?? window.localStorage.getItem(FINISHED_KEY);
    const ids = JSON.parse(raw ?? '[]');
    return new Set(Array.isArray(ids) ? ids.filter((v): v is string => typeof v === 'string') : []);
  } catch { return new Set<string>(); }
}
function saveFinished(done: Set<string>) {
  try {
    window.localStorage.setItem(key(FINISHED_KEY), JSON.stringify([...done]));
    queueSync();
  } catch { /* optional local resume */ }
}
function fresh(): State { return { mode: 'gallery', page: 0, pictureIndex: 0, painted: [], selected: 0, zoom: 1, panX: 0, panY: 0, draggingCell: null, wrong: null, complete: 0, gateSent: false, completed: loadFinished(), viewW: 1, viewH: 1 }; }

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 12) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function pageCount() { return Math.ceil(PICTURES.length / PER_PAGE); }
function galleryLayout(width: number, height: number) {
  const gap = 12;
  const header = 96;
  const footer = 68;
  const cardW = (width - gap * 3) / 2;
  const cardH = (height - header - footer - gap * 4) / 3;
  return { gap, header, footer, cardW, cardH };
}
function galleryCardAt(x: number, y: number, width: number, height: number, page: number): number | null {
  const { gap, header, cardW, cardH } = galleryLayout(width, height);
  const col = Math.floor((x - gap) / (cardW + gap)); const row = Math.floor((y - header) / (cardH + gap));
  if (col < 0 || col > 1 || row < 0 || row > 2 || x > gap + col * (cardW + gap) + cardW || y > header + row * (cardH + gap) + cardH) return null;
  const index = page * PER_PAGE + row * 2 + col; return index < PICTURES.length ? index : null;
}

function paintToolbar(width: number) {
  const left = 12;
  const gap = 7;
  const itemWidth = (width - left * 2 - gap * 4) / 5;
  return Array.from({ length: 5 }, (_, index) => ({
    x: left + index * (itemWidth + gap),
    y: 59,
    width: itemWidth,
    height: 38,
  }));
}

function paletteIndexAt(x: number, y: number, width: number, height: number, visible: readonly number[]): number | null {
  const key = paletteLayout(width, height, visible.length);
  const col = Math.floor((x - key.left) / key.size); const row = Math.floor((y - key.top) / key.rowHeight); const slot = row * key.perRow + col;
  return col >= 0 && col < key.perRow && row >= 0 && row < key.rows && slot < visible.length ? visible[slot] : null;
}

export default function ColorByNumber({ paused, input, api, restartToken, controlsInset }: GameCanvasProps) {
  const stateRef = useRef<State>(fresh()); const insetRef = useRef(controlsInset);
  const pointersRef = useRef(new Map<number, Point>());
  const pinchRef = useRef<Pinch | null>(null);
  const panningPointerRef = useRef<number | null>(null);
  const lastPanPointRef = useRef<Point | null>(null);
  useEffect(() => { stateRef.current = fresh(); }, [restartToken]);
  useEffect(() => { insetRef.current = controlsInset; }, [controlsInset]);

  const chooseNextColor = (picture: PictureTemplate, preferred: number) => {
    const visible = availableColors(picture, stateRef.current.painted);
    if (visible.length === 0) return;
    stateRef.current.selected = visible.includes(preferred)
      ? preferred
      : (visible.find((color) => color > preferred) ?? visible[0]);
  };

  const openPicture = (index: number) => {
    const s = stateRef.current;
    const normalized = (index + PICTURES.length) % PICTURES.length;
    const picture = PICTURES[normalized];
    s.mode = 'paint';
    s.pictureIndex = normalized;
    s.page = Math.floor(normalized / PER_PAGE);
    s.painted = safeLoadPicture(picture);
    s.zoom = 1;
    s.panX = 0;
    s.panY = 0;
    s.wrong = null;
    s.draggingCell = null;
    s.complete = 0;
    s.gateSent = false;
    chooseNextColor(picture, 0);
    playSound('click');
  };

  const paintAt = (x: number, y: number) => {
    const s = stateRef.current; if (s.mode !== 'paint' || s.complete > 0) return;
    const picture = PICTURES[s.pictureIndex];
    const layout = boardLayout(s.viewW, s.viewH, picture, s.zoom, s.panX, s.panY);
    const index = cellAt(layout, picture, x, y);
    if (index === null || index === s.draggingCell) return;
    s.draggingCell = index;
    const result = paintCell(picture, s.painted, index, s.selected);
    if (!result.correct) { s.wrong = { index, time: .35 }; playSound('wrong'); return; }
    if (s.painted[index] === s.selected) return;
    s.painted = result.next; savePicture(picture, s.painted); playSound('coin');
    chooseNextColor(picture, s.selected);
    if (isComplete(picture, s.painted)) {
      s.completed.add(picture.id); saveFinished(s.completed); s.complete = 2.15;
      api.addScore(300 + picture.palette.length * 20);
      api.setStatus(`${picture.name} finished perfectly!`); playSound('levelClear');
    }
  };

  const canvasPoint = (event: ReactPointerEvent<HTMLCanvasElement> | ReactWheelEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / Math.max(1, rect.width) * stateRef.current.viewW,
      y: (event.clientY - rect.top) / Math.max(1, rect.height) * stateRef.current.viewH,
    };
  };

  const zoomAround = (nextZoom: number, focus: Point) => {
    const s = stateRef.current; if (s.mode !== 'paint') return;
    const picture = PICTURES[s.pictureIndex];
    const oldLayout = boardLayout(s.viewW, s.viewH, picture, s.zoom, s.panX, s.panY);
    const cellX = (focus.x - oldLayout.x) / oldLayout.cell;
    const cellY = (focus.y - oldLayout.y) / oldLayout.cell;
    s.zoom = Math.max(.68, Math.min(8, nextZoom));
    const centered = boardLayout(s.viewW, s.viewH, picture, s.zoom, 0, 0);
    s.panX = focus.x - centered.x - cellX * centered.cell;
    s.panY = focus.y - centered.y - cellY * centered.cell;
  };

  const activatePoint = (point: Point) => {
    const s = stateRef.current;
    if (s.mode === 'gallery') {
      const gallery = galleryLayout(s.viewW, s.viewH);
      if (point.y > s.viewH - gallery.footer) {
        if (point.x < s.viewW * .42) {
          if (s.page > 0) {
            s.page -= 1;
            playSound('click');
          }
        } else if (point.x > s.viewW * .58) {
          if (s.page < pageCount() - 1) {
            s.page += 1;
            playSound('click');
          }
        }
        return;
      }
      const selected = galleryCardAt(point.x, point.y, s.viewW, s.viewH, s.page);
      if (selected !== null) openPicture(selected);
      return;
    }
    const picture = PICTURES[s.pictureIndex];
    if (point.y < 50 && point.x < 104) { s.mode = 'gallery'; s.draggingCell = null; playSound('click'); return; }
    if (point.y >= 56 && point.y <= 101) {
      const toolbar = paintToolbar(s.viewW);
      const tool = toolbar.findIndex(
        (item) =>
          point.x >= item.x &&
          point.x <= item.x + item.width &&
          point.y >= item.y &&
          point.y <= item.y + item.height,
      );
      if (tool === 0) openPicture(s.pictureIndex - 1);
      else if (tool === 1) {
        s.zoom = 1;
        s.panX = 0;
        s.panY = 0;
        playSound('click');
      } else if (tool === 2) zoomAround(s.zoom / 1.3, { x: s.viewW / 2, y: s.viewH / 2 });
      else if (tool === 3) zoomAround(s.zoom * 1.3, { x: s.viewW / 2, y: s.viewH / 2 });
      else if (tool === 4) openPicture(s.pictureIndex + 1);
      return;
    }
    const visible = availableColors(picture, s.painted);
    const key = paletteIndexAt(point.x, point.y, s.viewW, s.viewH, visible);
    if (key !== null) { s.selected = key; s.draggingCell = null; playSound('click'); return; }
    paintAt(point.x, point.y);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (paused) return;
    event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = canvasPoint(event); pointersRef.current.set(event.pointerId, point);
    const s = stateRef.current;
    if (s.mode !== 'paint') { activatePoint(point); return; }
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const layout = boardLayout(s.viewW, s.viewH, PICTURES[s.pictureIndex], s.zoom, s.panX, s.panY);
      pinchRef.current = {
        distance: Math.max(12, Math.hypot(a.x - b.x, a.y - b.y)),
        cellX: (center.x - layout.x) / layout.cell,
        cellY: (center.y - layout.y) / layout.cell,
      };
      s.draggingCell = null; return;
    }
    if (event.button !== 0 || event.shiftKey) {
      panningPointerRef.current = event.pointerId; lastPanPointRef.current = point; s.draggingCell = null; return;
    }
    activatePoint(point);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const point = canvasPoint(event); pointersRef.current.set(event.pointerId, point);
    const s = stateRef.current;
    if (pointersRef.current.size >= 2 && pinchRef.current && s.mode === 'paint') {
      const [a, b] = [...pointersRef.current.values()];
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const distance = Math.max(12, Math.hypot(a.x - b.x, a.y - b.y));
      const oldZoom = s.zoom;
      s.zoom = Math.max(.68, Math.min(8, s.zoom * distance / pinchRef.current.distance));
      const centered = boardLayout(s.viewW, s.viewH, PICTURES[s.pictureIndex], s.zoom, 0, 0);
      s.panX = center.x - centered.x - pinchRef.current.cellX * centered.cell;
      s.panY = center.y - centered.y - pinchRef.current.cellY * centered.cell;
      if (s.zoom !== oldZoom) pinchRef.current.distance = distance;
      const currentLayout = boardLayout(s.viewW, s.viewH, PICTURES[s.pictureIndex], s.zoom, s.panX, s.panY);
      pinchRef.current.cellX = (center.x - currentLayout.x) / currentLayout.cell;
      pinchRef.current.cellY = (center.y - currentLayout.y) / currentLayout.cell;
      return;
    }
    if (panningPointerRef.current === event.pointerId && lastPanPointRef.current) {
      s.panX += point.x - lastPanPointRef.current.x; s.panY += point.y - lastPanPointRef.current.y;
      lastPanPointRef.current = point; return;
    }
    if (pointersRef.current.size === 1) paintAt(point.x, point.y);
  };

  const endPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId); stateRef.current.draggingCell = null;
    if (panningPointerRef.current === event.pointerId) { panningPointerRef.current = null; lastPanPointRef.current = null; }
    if (pointersRef.current.size < 2) pinchRef.current = null;
  };

  const { canvasRef } = useCanvasGame({ active: !paused, step: (ctx, dt, cw, ch) => {
    const s = stateRef.current; const playH = Math.max(180, ch - insetRef.current);
    s.viewW = cw; s.viewH = playH;
    if (s.wrong) s.wrong.time -= dt;
    if (s.complete > 0) {
      s.complete -= dt;
      if (s.complete <= .4 && !s.gateSent) {
        s.gateSent = true; api.requestGate(`${PICTURES[s.pictureIndex].name} completed`);
        const next = (s.pictureIndex + 1) % PICTURES.length; stateRef.current = { ...fresh(), page: Math.floor(next / PER_PAGE) };
      }
    }
    if (s.mode === 'gallery') { drawGallery(ctx, s, cw, playH); return; }
    const picture = PICTURES[s.pictureIndex];
    const keyTap = input.consumeJump();
    if (keyTap) {
      const visible = availableColors(picture, s.painted);
      if (visible.length > 0) s.selected = visible[(visible.indexOf(s.selected) + 1) % visible.length];
    }
    drawPaint(ctx, s, picture, cw, playH);
  }});
  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-20 h-full w-full touch-none"
      aria-label="Color by Number painting game"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onContextMenu={(event) => event.preventDefault()}
      onWheel={(event) => {
        if (stateRef.current.mode !== 'paint') return;
        event.preventDefault();
        const point = canvasPoint(event);
        zoomAround(stateRef.current.zoom * Math.exp(-event.deltaY * .0015), point);
      }}
    />
  );
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
  drawBackground(ctx, width, height);
  ctx.fillStyle = '#fff7cf';
  ctx.font = `900 ${Math.max(22, Math.min(30, width * .044))}px "Avenir Next", system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText('COLOR BY NUMBER STUDIO', width / 2, 35);
  ctx.fillStyle = '#d9eaff';
  ctx.font = `700 ${Math.max(11, Math.min(14, width * .021))}px "Avenir Next", system-ui`;
  ctx.fillText('42 detailed pictures · tap one to open it', width / 2, 59);
  ctx.fillStyle = 'rgba(255,255,255,.48)';
  ctx.font = `800 ${Math.max(9, Math.min(11, width * .017))}px "Avenir Next", system-ui`;
  ctx.fillText(`${s.completed.size} finished · progress saves automatically`, width / 2, 78);

  const { gap, header, footer, cardW, cardH } = galleryLayout(width, height);
  for (let slot = 0; slot < PER_PAGE; slot += 1) {
    const index = s.page * PER_PAGE + slot;
    if (index >= PICTURES.length) break;
    const picture = PICTURES[index];
    const col = slot % 2;
    const row = Math.floor(slot / 2);
    const x = gap + col * (cardW + gap);
    const y = header + row * (cardH + gap);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.24)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 7;
    ctx.fillStyle = 'rgba(11,19,48,.91)';
    rounded(ctx, x, y, cardW, cardH, 15);
    ctx.fill();
    ctx.restore();
    ctx.save();
    rounded(ctx, x + 5, y + 5, cardW - 10, cardH - 48, 11);
    ctx.clip();
    ctx.fillStyle = '#f8fbff';
    ctx.fillRect(x + 5, y + 5, cardW - 10, cardH - 48);
    drawThumbnail(ctx, picture, x + 5, y + 5, cardW - 10, cardH - 48);
    ctx.restore();
    if (s.completed.has(picture.id)) {
      ctx.fillStyle = '#8cf1b5';
      ctx.beginPath();
      ctx.arc(x + cardW - 18, y + 18, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#153c35';
      ctx.font = '900 13px "Avenir Next", system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('✓', x + cardW - 18, y + 23);
    }
    ctx.fillStyle = '#fff7dc';
    ctx.font = `900 ${Math.max(11, Math.min(14, cardW * .075))}px "Avenir Next", system-ui`;
    ctx.textAlign = 'left';
    ctx.fillText(picture.name, x + 10, y + cardH - 26);
    ctx.fillStyle = '#9ccdf1';
    ctx.font = `800 ${Math.max(8, Math.min(10, cardW * .052))}px "Avenir Next", system-ui`;
    ctx.fillText(
      `${picture.category.toUpperCase()} · ${picture.cells.length.toLocaleString()} CELLS`,
      x + 10,
      y + cardH - 10,
    );
  }

  const footerY = height - footer + 8;
  ctx.fillStyle = 'rgba(7,13,34,.92)';
  rounded(ctx, 10, footerY, width - 20, footer - 16, 15);
  ctx.fill();
  const buttonW = width * .34;
  ctx.fillStyle = s.page === 0 ? 'rgba(255,255,255,.08)' : 'rgba(143,200,255,.18)';
  rounded(ctx, 18, footerY + 7, buttonW, footer - 30, 11);
  ctx.fill();
  ctx.fillStyle = s.page === pageCount() - 1 ? 'rgba(255,255,255,.08)' : 'rgba(114,230,194,.18)';
  rounded(ctx, width - 18 - buttonW, footerY + 7, buttonW, footer - 30, 11);
  ctx.fill();
  ctx.fillStyle = '#eaf4ff';
  ctx.font = `900 ${Math.max(10, Math.min(13, width * .021))}px "Avenir Next", system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText('‹  PREVIOUS', 18 + buttonW / 2, footerY + 30);
  ctx.fillText('NEXT  ›', width - 18 - buttonW / 2, footerY + 30);
  const dots = pageCount();
  for (let page = 0; page < dots; page += 1) {
    ctx.fillStyle = page === s.page ? '#ffe37a' : 'rgba(255,255,255,.22)';
    ctx.beginPath();
    ctx.arc(width / 2 + (page - (dots - 1) / 2) * 9, footerY + 25, page === s.page ? 3.5 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.font = '800 9px "Avenir Next", system-ui';
  ctx.fillText(`PAGE ${s.page + 1} OF ${pageCount()}`, width / 2, footerY + 42);
}

function drawPaint(ctx: CanvasRenderingContext2D, s: State, picture: PictureTemplate, width: number, height: number) {
  ctx.fillStyle = '#f3f5f9'; ctx.fillRect(0, 0, width, height);
  const visible = availableColors(picture, s.painted);
  const remaining = remainingByColor(picture, s.painted);
  const layout = boardLayout(width, height, picture, s.zoom, s.panX, s.panY);
  const key = paletteLayout(width, height, visible.length);
  const fraction = progressFor(picture, s.painted);
  const pct = Math.round(fraction * 100);
  const filledCount = Math.round(fraction * picture.cells.length);

  ctx.fillStyle = '#17223e'; ctx.fillRect(0, 0, width, 108);
  ctx.font = '900 15px ui-rounded, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff'; ctx.fillText('‹ GALLERY', 14, 27);
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff5c7'; ctx.fillText(picture.name, width / 2, 29);
  ctx.textAlign = 'right'; ctx.fillStyle = '#86efc2'; ctx.fillText(`${pct}%`, width - 18, 29);
  ctx.fillStyle = 'rgba(255,255,255,.16)'; rounded(ctx, 14, 38, width - 28, 7, 4); ctx.fill();
  if (fraction > 0) { ctx.fillStyle = '#35d39a'; rounded(ctx, 14, 38, (width - 28) * fraction, 7, 4); ctx.fill(); }
  ctx.fillStyle = 'rgba(226,238,255,.62)';
  ctx.font = '800 9px "Avenir Next", system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(
    `${filledCount.toLocaleString()} / ${picture.cells.length.toLocaleString()} cells  ·  ${visible.length} colors left`,
    width / 2,
    55,
  );

  const toolbar = paintToolbar(width);
  const toolLabels = ['‹ PICTURE', 'FIT', '− ZOOM', '+ ZOOM', 'PICTURE ›'];
  toolbar.forEach((tool, index) => {
    ctx.fillStyle = index === 1 ? '#eaf5ff' : 'rgba(255,255,255,.1)';
    rounded(ctx, tool.x, tool.y, tool.width, tool.height, 9);
    ctx.fill();
    ctx.fillStyle = index === 1 ? '#17223e' : '#eef6ff';
    ctx.font = `900 ${Math.max(8, Math.min(11, tool.width * .11))}px "Avenir Next", system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(toolLabels[index], tool.x + tool.width / 2, tool.y + 24);
  });

  // The art lives on a clean white sheet, while clipping protects the header
  // and live palette. This prevents pale colors from blending into the app's
  // decorative background and keeps a zoomed canvas from covering controls.
  ctx.save(); ctx.beginPath(); ctx.rect(0, 108, width, Math.max(1, key.top - 114)); ctx.clip();
  ctx.shadowColor = 'rgba(15,23,42,.18)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 5;
  ctx.fillStyle = '#ffffff'; rounded(ctx, layout.x - 8, layout.y - 8, layout.width + 16, layout.height + 16, 7); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  for (let r = 0; r < picture.rows; r += 1) for (let c = 0; c < picture.cols; c += 1) {
    const index = r * picture.cols + c; const x = layout.x + c * layout.cell; const y = layout.y + r * layout.cell; const filled = s.painted[index] === picture.cells[index];
    ctx.fillStyle = filled ? picture.palette[picture.cells[index]].hex : '#ffffff'; ctx.fillRect(x, y, layout.cell + .25, layout.cell + .25);
    if (!filled) {
      ctx.save();
      ctx.globalAlpha = picture.cells[index] === s.selected ? .2 : .055;
      ctx.fillStyle = picture.palette[picture.cells[index]].hex;
      ctx.fillRect(x + .5, y + .5, layout.cell - 1, layout.cell - 1);
      ctx.restore();
    }
    ctx.strokeStyle = s.wrong?.index === index && s.wrong.time > 0 ? '#ef315f' : filled ? 'rgba(255,255,255,.36)' : '#cbd1dc';
    ctx.lineWidth = s.wrong?.index === index ? 2.5 : .75; ctx.strokeRect(x, y, layout.cell, layout.cell);
    if (!filled && layout.cell >= 8) {
      ctx.fillStyle = picture.cells[index] === s.selected ? '#382c64' : '#778092'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.max(7, layout.cell * .44)}px ui-rounded, system-ui`;
      ctx.fillText(String(picture.cells[index] + 1), x + layout.cell / 2, y + layout.cell / 2 + .5);
    }
  }
  ctx.restore();

  ctx.fillStyle = '#e9edf4'; ctx.fillRect(0, key.top - 4, width, height - key.top + 4);
  for (let slot = 0; slot < visible.length; slot += 1) {
    const color = visible[slot]; const col = slot % key.perRow; const row = Math.floor(slot / key.perRow);
    const x = key.left + col * key.size; const y = key.top + row * key.rowHeight;
    ctx.fillStyle = color === s.selected ? '#17223e' : '#ffffff'; rounded(ctx, x + 2, y + 2, key.size - 5, 46, 10); ctx.fill();
    ctx.fillStyle = picture.palette[color].hex; rounded(ctx, x + 7, y + 7, key.size - 15, 32, 7); ctx.fill();
    ctx.fillStyle = color === s.selected ? '#ffffff' : '#182036'; ctx.font = '900 14px ui-rounded, system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(color + 1), x + key.size / 2, y + 23);
    ctx.fillStyle = color === s.selected ? '#fff4a6' : '#4c566b'; ctx.font = '800 9px system-ui';
    ctx.fillText(`${remaining[color]} left`, x + key.size / 2, y + 44);
  }
  if (visible.length === 0 && s.complete <= 0) {
    ctx.fillStyle = '#17223e'; ctx.font = '900 18px ui-rounded, system-ui'; ctx.textAlign = 'center';
    ctx.fillText('All colors complete!', width / 2, height - 31);
  }
  if (s.complete > 0) { ctx.fillStyle = 'rgba(12,17,53,.74)'; ctx.fillRect(0, 0, width, height); ctx.fillStyle = '#fff4a6'; ctx.font = '900 29px ui-rounded, system-ui'; ctx.textAlign = 'center'; ctx.fillText('PICTURE PERFECT!', width / 2, height / 2 - 8); ctx.fillStyle = '#d9f5ff'; ctx.font = '16px system-ui'; ctx.fillText('Every numbered cell is exactly right.', width / 2, height / 2 + 22); }
}
