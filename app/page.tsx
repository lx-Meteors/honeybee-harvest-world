"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "menu" | "playing" | "paused" | "failed";
type ControlMode = "motion" | "touch";
type PlatformKind = "flower" | "gold" | "broken" | "spring";
type AirKind = "bear" | "web" | "rocket";

type Platform = {
  id: number;
  x: number;
  y: number;
  width: number;
  kind: PlatformKind;
  used: boolean;
  breaking: number;
};

type AirItem = { id: number; x: number; y: number; kind: AirKind; used: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };

type GameState = {
  beeX: number;
  beeY: number;
  vx: number;
  vy: number;
  cameraY: number;
  honey: number;
  highest: number;
  heightRewarded: number;
  platforms: Platform[];
  airItems: AirItem[];
  particles: Particle[];
  generatedTo: number;
  lastPlatformX: number;
  nextId: number;
  invincible: number;
  webTimer: number;
  rocketTimer: number;
  message: string;
  messageTimer: number;
  lastTime: number;
  ended: boolean;
};

const WIDTH = 540;
const HEIGHT = 720;
const FLOOR_Y = HEIGHT - 74;
const GRAVITY = 1150;
const JUMP_SPEED = 505;
const SPRING_SPEED = 745;
const ROCKET_SPEED = 820;

function firstState(): GameState {
  return {
    beeX: WIDTH / 2,
    beeY: 48,
    vx: 0,
    vy: JUMP_SPEED,
    cameraY: 0,
    honey: 0,
    highest: 48,
    heightRewarded: 0,
    platforms: [{ id: 0, x: WIDTH / 2, y: 16, width: 130, kind: "flower", used: true, breaking: 0 }],
    airItems: [],
    particles: [],
    generatedTo: 16,
    lastPlatformX: WIDTH / 2,
    nextId: 1,
    invincible: 0,
    webTimer: 0,
    rocketTimer: 0,
    message: "",
    messageTimer: 0,
    lastTime: 0,
    ended: false,
  };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function generateWorld(state: GameState, targetY: number) {
  while (state.generatedTo < targetY) {
    const difficulty = Math.min(1, state.generatedTo / 9000);
    const gap = 54 + Math.random() * (24 + difficulty * 13);
    const y = state.generatedTo + gap;
    const maxShift = 130 + difficulty * 40;
    let x = state.lastPlatformX + (Math.random() - 0.5) * maxShift * 2;
    x = Math.max(66, Math.min(WIDTH - 66, x));

    const roll = Math.random();
    let kind: PlatformKind = "flower";
    if (y > 350 && roll < 0.08 + difficulty * 0.09) kind = "broken";
    else if (y > 520 && roll < 0.13 + difficulty * 0.06) kind = "spring";
    else if (roll > 0.92) kind = "gold";
    const width = Math.max(78, 116 - difficulty * 24 + Math.random() * 22);
    state.platforms.push({ id: state.nextId++, x, y, width, kind, used: false, breaking: 0 });

    if (Math.random() < 0.34) {
      const side = x < WIDTH / 2 ? 1 : -1;
      const secondX = Math.max(62, Math.min(WIDTH - 62, x + side * (145 + Math.random() * 85)));
      state.platforms.push({
        id: state.nextId++,
        x: secondX,
        y: y + (Math.random() - 0.5) * 18,
        width: Math.max(76, width - 6),
        kind: Math.random() < 0.1 ? "broken" : "flower",
        used: false,
        breaking: 0,
      });
    }

    const obstacleRoll = Math.random();
    if (y > 260 && obstacleRoll < 0.18 + difficulty * 0.12) {
      const kind: AirKind = obstacleRoll < 0.085 ? "bear" : "web";
      let itemX = 58 + Math.random() * (WIDTH - 116);
      if (Math.abs(itemX - x) < 92) itemX = itemX < WIDTH / 2 ? Math.max(50, itemX - 125) : Math.min(WIDTH - 50, itemX + 125);
      state.airItems.push({ id: state.nextId++, x: itemX, y: y + gap * 0.48, kind, used: false });
    }
    if (y > 700 && Math.floor(y / 1100) > Math.floor(state.generatedTo / 1100)) {
      state.airItems.push({ id: state.nextId++, x: 75 + Math.random() * (WIDTH - 150), y: y + 26, kind: "rocket", used: false });
    }

    state.generatedTo = y;
    state.lastPlatformX = x;
  }
}

function drawPlatform(ctx: CanvasRenderingContext2D, p: Platform, sy: number, time: number) {
  const shake = p.breaking > 0 ? Math.sin(time * 0.09) * 5 : 0;
  ctx.save();
  ctx.translate(shake, 0);
  ctx.strokeStyle = p.kind === "gold" ? "#c99410" : "#4f9954";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(p.x, sy + 7);
  ctx.quadraticCurveTo(p.x + 9, sy + 28, p.x - 2, sy + 48);
  ctx.stroke();
  ctx.fillStyle = p.kind === "gold" ? "#ffe66d" : "#72c56f";
  ctx.beginPath();
  ctx.ellipse(p.x + 11, sy + 30, 13, 6, -0.4, 0, Math.PI * 2);
  ctx.fill();

  const petal = p.kind === "broken" ? "#c8b4ab" : p.kind === "gold" ? "#ffe35a" : "#ff82ad";
  const edge = p.kind === "broken" ? "#917c74" : p.kind === "gold" ? "#e3a515" : "#e65e8e";
  ctx.fillStyle = petal;
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i += 1) {
    const px = p.x - p.width / 2 + 10 + (i * (p.width - 20)) / 6;
    ctx.beginPath();
    ctx.ellipse(px, sy, p.width / 8.5, 13, i % 2 ? 0.12 : -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = p.kind === "gold" ? "#f0aa10" : p.kind === "broken" ? "#7d6d67" : "#ffc229";
  roundedRect(ctx, p.x - p.width / 2, sy - 6, p.width, 13, 7);
  ctx.fill();
  if (p.kind === "broken") {
    ctx.strokeStyle = "#5e4c46";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x - 9, sy - 6);
    ctx.lineTo(p.x + 2, sy);
    ctx.lineTo(p.x - 5, sy + 7);
    ctx.stroke();
  }
  if (p.kind === "spring") {
    ctx.strokeStyle = "#54606b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 12; i += 1) {
      const px = p.x - 15 + i * 2.5;
      const py = sy - 9 - (i % 2 ? 10 : 0);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = "#697784";
    roundedRect(ctx, p.x - 19, sy - 23, 38, 5, 3);
    ctx.fill();
  }
  ctx.restore();
}

function drawBear(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#89593a";
  ctx.beginPath();
  ctx.arc(-17, -18, 10, 0, Math.PI * 2);
  ctx.arc(17, -18, 10, 0, Math.PI * 2);
  ctx.arc(0, 0, 29, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d8a477";
  ctx.beginPath();
  ctx.ellipse(0, 8, 15, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#30231d";
  ctx.beginPath();
  ctx.arc(-9, -6, 3, 0, Math.PI * 2);
  ctx.arc(9, -6, 3, 0, Math.PI * 2);
  ctx.arc(0, 6, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffc429";
  roundedRect(ctx, -20, 22, 40, 24, 7);
  ctx.fill();
  ctx.fillStyle = "#fff7d4";
  ctx.font = "900 11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("蜜", 0, 39);
  ctx.restore();
}

function drawWeb(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "rgba(255,255,255,.94)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i += 1) {
    const angle = (Math.PI * 2 * i) / 8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * 30, Math.sin(angle) * 30);
    ctx.stroke();
  }
  for (const r of [11, 21, 30]) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRocket(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  ctx.save();
  ctx.translate(x, y + Math.sin(time * 0.006) * 4);
  ctx.rotate(0.18);
  ctx.fillStyle = "#f2f4f0";
  ctx.beginPath();
  ctx.moveTo(0, -35);
  ctx.quadraticCurveTo(25, -10, 14, 24);
  ctx.lineTo(-14, 24);
  ctx.quadraticCurveTo(-25, -10, 0, -35);
  ctx.fill();
  ctx.fillStyle = "#ef5b4d";
  ctx.beginPath();
  ctx.moveTo(-14, 10);
  ctx.lineTo(-27, 27);
  ctx.lineTo(-10, 22);
  ctx.moveTo(14, 10);
  ctx.lineTo(27, 27);
  ctx.lineTo(10, 22);
  ctx.fill();
  ctx.fillStyle = "#59b7dd";
  ctx.beginPath();
  ctx.arc(0, -8, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffb31d";
  ctx.beginPath();
  ctx.moveTo(-8, 25);
  ctx.lineTo(0, 48 + Math.sin(time * 0.025) * 8);
  ctx.lineTo(8, 25);
  ctx.fill();
  ctx.restore();
}

function drawBee(ctx: CanvasRenderingContext2D, x: number, y: number, vx: number, time: number, blink: boolean, rocket: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.max(-0.22, Math.min(0.22, vx / 900)));
  if (blink && Math.floor(time / 90) % 2 === 0) ctx.globalAlpha = 0.36;
  if (rocket) {
    const flame = 34 + Math.sin(time * 0.03) * 9;
    ctx.fillStyle = "rgba(255,128,20,.82)";
    ctx.beginPath();
    ctx.moveTo(-10, 27);
    ctx.lineTo(0, 27 + flame);
    ctx.lineTo(10, 27);
    ctx.fill();
  }
  const beat = 0.85 + Math.sin(time * 0.05) * 0.16;
  ctx.fillStyle = "rgba(240,253,255,.84)";
  ctx.strokeStyle = "rgba(86,151,170,.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-23, -3, 13 * beat, 25, -0.72, 0, Math.PI * 2);
  ctx.ellipse(23, -3, 13 * beat, 25, 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffcb29";
  ctx.beginPath();
  ctx.ellipse(0, 3, 23, 29, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#403128";
  ctx.fillRect(-25, 0, 50, 8);
  ctx.fillRect(-22, 15, 44, 7);
  ctx.restore();
  ctx.fillStyle = "#ffdf62";
  ctx.beginPath();
  ctx.arc(0, -18, 21, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2f251f";
  ctx.beginPath();
  ctx.arc(-7, -20, 3, 0, Math.PI * 2);
  ctx.arc(7, -20, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2f251f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -16, 6, 0.1, Math.PI - 0.1);
  ctx.stroke();
  ctx.restore();
}

function GameCanvas({ phase, controlMode, resetToken, onStats, onFail }: {
  phase: Phase;
  controlMode: ControlMode;
  resetToken: number;
  onStats: (honey: number, height: number, message: string) => void;
  onFail: (honey: number, height: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(firstState());
  const phaseRef = useRef(phase);
  const frameRef = useRef(0);
  const orientationRef = useRef({ gamma: 0, baseline: 0, calibrated: false });
  const pointerRef = useRef({ active: false, x: WIDTH / 2 });
  const keysRef = useRef({ left: false, right: false });

  useEffect(() => { phaseRef.current = phase; stateRef.current.lastTime = 0; }, [phase]);
  useEffect(() => { stateRef.current = firstState(); generateWorld(stateRef.current, HEIGHT * 2); orientationRef.current.calibrated = false; }, [resetToken]);

  useEffect(() => {
    const orientation = (event: DeviceOrientationEvent) => {
      if (typeof event.gamma !== "number") return;
      const sensor = orientationRef.current;
      sensor.gamma = event.gamma;
      if (!sensor.calibrated) { sensor.baseline = event.gamma; sensor.calibrated = true; }
    };
    const down = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") keysRef.current.left = true;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") keysRef.current.right = true;
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") keysRef.current.left = false;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") keysRef.current.right = false;
    };
    window.addEventListener("deviceorientation", orientation);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("deviceorientation", orientation);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const screenY = (worldY: number, cameraY: number) => FLOOR_Y - (worldY - cameraY);
    const burst = (state: GameState, x: number, y: number, color: string, count = 10) => {
      for (let i = 0; i < count; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const speed = 35 + Math.random() * 85;
        state.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .6 + Math.random() * .4, color, size: 2 + Math.random() * 4 });
      }
    };

    const drawBackground = (state: GameState, time: number) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      gradient.addColorStop(0, "#71c9ed");
      gradient.addColorStop(.62, "#c9eee0");
      gradient.addColorStop(1, "#fff0aa");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      const offset = (state.cameraY * .42) % 170;
      ctx.fillStyle = "rgba(255,255,255,.58)";
      for (let i = -1; i < 6; i += 1) {
        const y = i * 170 + offset;
        const x = 32 + ((i * 119) % 390);
        ctx.beginPath();
        ctx.ellipse(x, y, 38, 15, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 34, y + 2, 28, 12, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 15, y - 10, 22, 16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(255,247,190,.45)";
      for (let i = 0; i < 12; i += 1) {
        const x = 24 + i * 46;
        const y = (time * .018 + i * 81 + state.cameraY * .7) % HEIGHT;
        ctx.beginPath();
        ctx.arc(x, y, 2 + i % 3, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const draw = (state: GameState, time: number) => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      drawBackground(state, time);
      for (const p of state.platforms) {
        const sy = screenY(p.y, state.cameraY);
        if (sy > -70 && sy < HEIGHT + 60 && p.breaking < .38) drawPlatform(ctx, p, sy, time);
      }
      for (const item of state.airItems) {
        if (item.used) continue;
        const sy = screenY(item.y, state.cameraY);
        if (sy < -70 || sy > HEIGHT + 70) continue;
        if (item.kind === "bear") drawBear(ctx, item.x, sy);
        else if (item.kind === "web") drawWeb(ctx, item.x, sy);
        else drawRocket(ctx, item.x, sy, time);
      }
      for (const p of state.particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      drawBee(ctx, state.beeX, screenY(state.beeY, state.cameraY), state.vx, time, state.invincible > 0, state.rocketTimer > 0);
    };

    const update = (state: GameState, dt: number) => {
      state.invincible = Math.max(0, state.invincible - dt);
      state.webTimer = Math.max(0, state.webTimer - dt);
      state.rocketTimer = Math.max(0, state.rocketTimer - dt);
      state.messageTimer = Math.max(0, state.messageTimer - dt);
      if (state.messageTimer <= 0) state.message = "";

      let input = 0;
      if (keysRef.current.left) input -= 1;
      if (keysRef.current.right) input += 1;
      if (controlMode === "motion" && orientationRef.current.calibrated) {
        const raw = orientationRef.current.gamma - orientationRef.current.baseline;
        input = Math.abs(raw) < 4 ? 0 : Math.max(-1, Math.min(1, (raw - Math.sign(raw) * 4) / 18));
      } else if (pointerRef.current.active) input = Math.max(-1, Math.min(1, (pointerRef.current.x - state.beeX) / 62));
      const horizontalLimit = state.webTimer > 0 ? 105 : 300;
      const targetVx = input * horizontalLimit;
      state.vx += (targetVx - state.vx) * Math.min(1, dt * (state.webTimer > 0 ? 3 : 8));
      if (input === 0) state.vx *= Math.pow(.88, dt * 60);

      const oldFoot = state.beeY - 27;
      state.beeX += state.vx * dt;
      if (state.beeX < -25) state.beeX = WIDTH + 25;
      if (state.beeX > WIDTH + 25) state.beeX = -25;
      if (state.rocketTimer > 0) state.vy = ROCKET_SPEED;
      else state.vy -= GRAVITY * dt;
      state.beeY += state.vy * dt;
      const newFoot = state.beeY - 27;

      if (state.rocketTimer <= 0 && state.vy < 0) {
        const landing = state.platforms.find((p) => {
          if (p.breaking >= .38) return false;
          const half = p.width / 2 + 13;
          return oldFoot >= p.y && newFoot <= p.y && state.beeX >= p.x - half && state.beeX <= p.x + half;
        });
        if (landing) {
          state.beeY = landing.y + 27;
          state.vy = landing.kind === "spring" ? SPRING_SPEED : JUMP_SPEED;
          const sy = screenY(landing.y, state.cameraY);
          if (landing.kind === "broken") {
            landing.breaking = .01;
            state.message = "碎花！马上离开";
            state.messageTimer = .9;
            burst(state, landing.x, sy, "#c7aaa0", 13);
          } else if (!landing.used) {
            landing.used = true;
            const gain = landing.kind === "gold" ? 35 : landing.kind === "spring" ? 20 : 10;
            state.honey += gain;
            state.message = landing.kind === "spring" ? "弹簧花！超级跳跃" : landing.kind === "gold" ? "金色花蜜 +35" : "采蜜 +10";
            state.messageTimer = .75;
            burst(state, landing.x, sy, landing.kind === "gold" ? "#ffe052" : "#ff8db3", 11);
          }
        }
      }

      const beeScreenY = screenY(state.beeY, state.cameraY);
      for (const item of state.airItems) {
        if (item.used || state.invincible > 0 && item.kind !== "rocket") continue;
        const sy = screenY(item.y, state.cameraY);
        if (Math.hypot(item.x - state.beeX, sy - beeScreenY) > (item.kind === "rocket" ? 43 : 48)) continue;
        if (item.kind === "rocket") {
          item.used = true;
          state.rocketTimer = 1.35;
          state.vy = ROCKET_SPEED;
          state.honey += 60;
          state.message = "火箭加速！+60";
          state.messageTimer = 1.2;
          burst(state, item.x, sy, "#ffb62b", 18);
        } else if (item.kind === "bear") {
          const loss = Math.min(state.honey, Math.max(20, Math.round(state.honey * .3)));
          state.honey -= loss;
          state.invincible = 1.25;
          state.vx = state.beeX < item.x ? -260 : 260;
          state.message = `偷蜜熊 -${loss}`;
          state.messageTimer = 1.1;
          burst(state, item.x, sy, "#ffbd23", 15);
        } else {
          state.webTimer = 1.4;
          state.invincible = .8;
          state.vy *= .52;
          state.message = "蜘蛛网减速！";
          state.messageTimer = 1.1;
        }
      }

      for (const p of state.platforms) if (p.breaking > 0) p.breaking += dt;
      state.highest = Math.max(state.highest, state.beeY);
      const newHeightReward = Math.floor(state.highest / 25);
      if (newHeightReward > state.heightRewarded) {
        state.honey += newHeightReward - state.heightRewarded;
        state.heightRewarded = newHeightReward;
      }
      const targetCamera = Math.max(0, state.highest - 300);
      state.cameraY += (targetCamera - state.cameraY) * Math.min(1, dt * 4.4);
      generateWorld(state, state.cameraY + HEIGHT * 1.8);
      state.platforms = state.platforms.filter((p) => p.y > state.cameraY - 180);
      state.airItems = state.airItems.filter((item) => item.y > state.cameraY - 180);
      state.particles = state.particles.map((p) => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, vy: p.vy + 70 * dt, life: p.life - dt })).filter((p) => p.life > 0);
      onStats(state.honey, state.highest, state.message);
      if (!state.ended && state.beeY < state.cameraY - 95) {
        state.ended = true;
        onFail(state.honey, state.highest);
      }
    };

    const loop = (time: number) => {
      const state = stateRef.current;
      if (!state.lastTime) state.lastTime = time;
      const dt = Math.min(.032, (time - state.lastTime) / 1000);
      state.lastTime = time;
      if (phaseRef.current === "playing") update(state, dt);
      draw(state, time);
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [controlMode, onFail, onStats, resetToken]);

  const setPointer = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    pointerRef.current.x = (clientX - rect.left) / rect.width * WIDTH;
  };
  return <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="game-canvas" aria-label="无限向上的小蜜蜂花台跳跃游戏" onPointerDown={(event) => { pointerRef.current.active = true; setPointer(event.clientX); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => pointerRef.current.active && setPointer(event.clientX)} onPointerUp={() => { pointerRef.current.active = false; }} onPointerCancel={() => { pointerRef.current.active = false; }} />;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("menu");
  const [controlMode, setControlMode] = useState<ControlMode>("motion");
  const [resetToken, setResetToken] = useState(0);
  const [stats, setStats] = useState({ honey: 0, height: 0, message: "" });
  const [result, setResult] = useState({ honey: 0, height: 0 });
  const [best, setBest] = useState(0);
  const [motionUnavailable, setMotionUnavailable] = useState(false);
  const finishLock = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setBest(Number(localStorage.getItem("honeybee-best") || 0)), 500);
    return () => window.clearTimeout(timer);
  }, []);

  const onStats = useCallback((honey: number, height: number, message: string) => {
    setStats((old) => old.honey === honey && Math.floor(old.height) === Math.floor(height) && old.message === message ? old : { honey, height, message });
  }, []);
  const onFail = useCallback((honey: number, height: number) => {
    if (finishLock.current) return;
    finishLock.current = true;
    const nextBest = Math.max(best, honey);
    setBest(nextBest);
    localStorage.setItem("honeybee-best", String(nextBest));
    setResult({ honey, height });
    setPhase("failed");
  }, [best]);
  const startGame = () => {
    finishLock.current = false;
    setStats({ honey: 0, height: 0, message: "" });
    setResetToken((value) => value + 1);
    setPhase("playing");
  };
  const requestMotion = async () => {
    try {
      const MotionEvent = DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };
      if (typeof MotionEvent.requestPermission === "function" && await MotionEvent.requestPermission() !== "granted") throw new Error("denied");
      setControlMode("motion");
      startGame();
    } catch { setMotionUnavailable(true); setControlMode("touch"); }
  };
  const playTouch = () => { setControlMode("touch"); startGame(); };

  return (
    <main className="page-shell">
      <section className="brand-panel" aria-label="游戏介绍">
        <div className="brand-mark"><span>蜜</span></div>
        <p className="eyebrow">ENDLESS HONEY JUMP</p>
        <h1>小蜜蜂<br /><em>无限采蜜</em></h1>
        <p className="brand-copy">没有终点，只有更高。踩住密集花台不断向上，借助弹簧和火箭刷新你的最高采蜜值。</p>
        <div className="control-tip"><div className="phone-tilt" aria-hidden="true"><span>↔</span></div><div><strong>只控制左右</strong><small>跳跃与上升完全自动</small></div></div>
        <div className="legend"><span><i className="dot flower-dot" />花台与弹簧</span><span><i className="dot bear-dot" />空中障碍</span></div>
      </section>

      <section className="game-phone">
        <GameCanvas phase={phase} controlMode={controlMode} resetToken={resetToken} onStats={onStats} onFail={onFail} />
        <header className="game-hud" aria-live="polite">
          <div className="hud-pill"><span className="honey-drop" /><b>{stats.honey}</b></div>
          <div className="best-score">最高 {Math.max(best, stats.honey)}</div>
          <div className="hud-pill flower-pill"><span>↥</span><b>{Math.floor(stats.height)}m</b></div>
        </header>
        {stats.message && phase === "playing" && <div className="game-message">{stats.message}</div>}

        {phase === "menu" && <div className="game-overlay intro-overlay">
          <div className="mini-logo">小蜜蜂 · 无限采蜜</div>
          <div className="hero-bee" aria-hidden="true"><span className="wing left" /><span className="wing right" /><b>●</b></div>
          <div className="intro-card"><p className="intro-kicker">无限高度 · 挑战最高分</p><h2>踩花向上跳<br />弹簧火箭来助力</h2><div className="tilt-demo" aria-hidden="true"><span>🌸</span><b>↔</b><span>🚀</span></div><button className="primary-button" onClick={requestMotion}>开启体感 · 起跳</button><button className="text-button" onClick={playTouch}>触屏 / 电脑试玩</button>{motionUnavailable && <p className="permission-note">当前设备未开启体感，请使用触屏模式。</p>}</div>
        </div>}
        {phase === "playing" && <button className="pause-button" onClick={() => setPhase("paused")} aria-label="暂停游戏">Ⅱ</button>}
        {phase === "paused" && <div className="game-overlay pause-overlay"><div className="modal-card compact-card"><span className="modal-icon">🌸</span><h2>暂停采蜜</h2><p>准备好再继续挑战高度。</p><button className="primary-button" onClick={() => setPhase("playing")}>继续跳跃</button><button className="text-button" onClick={() => setPhase("menu")}>返回首页</button></div></div>}
        {phase === "failed" && <div className="game-overlay result-overlay"><div className="modal-card result-card"><span className="modal-icon">🍯</span><p className="intro-kicker">本次采蜜结束</p><h2>{result.honey >= best ? "新的最高纪录！" : "再向上挑战"}</h2><div className="score-number"><span className="honey-drop large" />{result.honey}</div><div className="result-grid"><div><small>最高高度</small><strong>{Math.floor(result.height)}m</strong></div><div><small>最高采蜜</small><strong>{best}</strong></div></div><button className="primary-button" onClick={startGame}>重新挑战</button><button className="text-button" onClick={() => setPhase("menu")}>返回花园</button></div></div>}
        {phase === "playing" && controlMode === "touch" && <div className="touch-hint">按住画面左右移动</div>}
      </section>
    </main>
  );
}
