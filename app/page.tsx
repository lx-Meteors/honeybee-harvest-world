"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "menu" | "playing" | "paused" | "finished";
type ControlMode = "motion" | "touch";
type ItemType = "flower" | "gold" | "broken" | "bear" | "web";

type Item = {
  id: number;
  type: ItemType;
  x: number;
  y: number;
  size: number;
  sway: number;
};

type GameState = {
  beeX: number;
  targetX: number;
  honey: number;
  flowers: number;
  combo: number;
  bestCombo: number;
  distance: number;
  speed: number;
  items: Item[];
  particles: Particle[];
  nextId: number;
  spawnTimer: number;
  invincible: number;
  slowed: number;
  elapsed: number;
  lastTime: number;
  message: string;
  messageTimer: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
};

const WIDTH = 390;
const HEIGHT = 780;
const GOAL = 1000;

function makeInitialState(): GameState {
  return {
    beeX: WIDTH / 2,
    targetX: WIDTH / 2,
    honey: 0,
    flowers: 0,
    combo: 0,
    bestCombo: 0,
    distance: 0,
    speed: 215,
    items: [],
    particles: [],
    nextId: 1,
    spawnTimer: 0,
    invincible: 0,
    slowed: 0,
    elapsed: 0,
    lastTime: 0,
    message: "",
    messageTimer: 0,
  };
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawFlower(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  gold = false,
  broken = false,
) {
  ctx.save();
  ctx.translate(x, y);
  const colors = gold
    ? ["#fff0a6", "#ffc928"]
    : broken
      ? ["#d8c8be", "#a99691"]
      : ["#fff3f7", "#ff7fa5"];
  for (let i = 0; i < 6; i += 1) {
    ctx.save();
    ctx.rotate((Math.PI * 2 * i) / 6);
    ctx.fillStyle = colors[i % 2];
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.45, size * 0.28, size * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = broken ? "#79685f" : "#ffb21a";
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
  ctx.fill();
  if (broken) {
    ctx.strokeStyle = "#6d5b55";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-size * 0.12, -size * 0.22);
    ctx.lineTo(size * 0.08, -size * 0.02);
    ctx.lineTo(-size * 0.03, size * 0.22);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBear(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#8b5a38";
  ctx.beginPath();
  ctx.arc(-size * 0.34, -size * 0.35, size * 0.22, 0, Math.PI * 2);
  ctx.arc(size * 0.34, -size * 0.35, size * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d7a374";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.16, size * 0.3, size * 0.23, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#33241f";
  ctx.beginPath();
  ctx.arc(-size * 0.18, -size * 0.08, 3.4, 0, Math.PI * 2);
  ctx.arc(size * 0.18, -size * 0.08, 3.4, 0, Math.PI * 2);
  ctx.arc(0, size * 0.11, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffc928";
  roundedRect(ctx, -size * 0.36, size * 0.43, size * 0.72, size * 0.44, 8);
  ctx.fill();
  ctx.fillStyle = "#fff8dc";
  ctx.font = `700 ${Math.max(11, size * 0.24)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("蜜", 0, size * 0.73);
  ctx.restore();
}

function drawWeb(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "rgba(255,255,255,.9)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i += 1) {
    const angle = (Math.PI * 2 * i) / 8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * size, Math.sin(angle) * size);
    ctx.stroke();
  }
  for (const ring of [0.38, 0.68, 1]) {
    ctx.beginPath();
    ctx.arc(0, 0, size * ring, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBee(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tilt: number,
  invincible: boolean,
  time: number,
) {
  ctx.save();
  ctx.translate(x, y + Math.sin(time * 0.008) * 3);
  ctx.rotate(tilt * 0.16);
  if (invincible && Math.floor(time / 80) % 2 === 0) ctx.globalAlpha = 0.42;

  const wingBeat = 0.88 + Math.sin(time * 0.04) * 0.18;
  ctx.fillStyle = "rgba(235, 251, 255, .82)";
  ctx.strokeStyle = "rgba(119, 174, 190, .5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-24, -7, 15 * wingBeat, 27, -0.68, 0, Math.PI * 2);
  ctx.ellipse(24, -7, 15 * wingBeat, 27, 0.68, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ffca28";
  ctx.beginPath();
  ctx.ellipse(0, 2, 25, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#45362c";
  ctx.fillRect(-27, -3, 54, 9);
  ctx.fillRect(-25, 16, 50, 8);
  ctx.restore();

  ctx.fillStyle = "#ffdd5d";
  ctx.beginPath();
  ctx.arc(0, -22, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#30251f";
  ctx.beginPath();
  ctx.arc(-8, -24, 3.5, 0, Math.PI * 2);
  ctx.arc(8, -24, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#30251f";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, -19, 7, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-10, -42);
  ctx.quadraticCurveTo(-16, -53, -12, -59);
  ctx.moveTo(10, -42);
  ctx.quadraticCurveTo(16, -53, 12, -59);
  ctx.stroke();
  ctx.fillStyle = "#30251f";
  ctx.beginPath();
  ctx.arc(-12, -59, 3, 0, Math.PI * 2);
  ctx.arc(12, -59, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function GameCanvas({
  phase,
  controlMode,
  onFinish,
  onStats,
  resetToken,
}: {
  phase: Phase;
  controlMode: ControlMode;
  onFinish: (honey: number, flowers: number, bestCombo: number) => void;
  onStats: (honey: number, flowers: number, distance: number, message: string) => void;
  resetToken: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(makeInitialState());
  const frameRef = useRef<number>(0);
  const orientationRef = useRef({ gamma: 0, baseline: 0, calibrated: false });
  const keysRef = useRef({ left: false, right: false });
  const pointerRef = useRef({ active: false, x: WIDTH / 2 });
  const phaseRef = useRef(phase);

  useEffect(() => {
    phaseRef.current = phase;
    stateRef.current.lastTime = 0;
  }, [phase]);

  useEffect(() => {
    stateRef.current = makeInitialState();
    orientationRef.current.calibrated = false;
  }, [resetToken]);

  useEffect(() => {
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (typeof event.gamma !== "number") return;
      const o = orientationRef.current;
      o.gamma = event.gamma;
      if (!o.calibrated) {
        o.baseline = event.gamma;
        o.calibrated = true;
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") keysRef.current.left = true;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") keysRef.current.right = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") keysRef.current.left = false;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") keysRef.current.right = false;
    };
    window.addEventListener("deviceorientation", onOrientation);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("deviceorientation", onOrientation);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const spawnBurst = (state: GameState, x: number, y: number, color: string, count = 9) => {
      for (let i = 0; i < count; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const force = 30 + Math.random() * 70;
        state.particles.push({
          x,
          y,
          vx: Math.cos(a) * force,
          vy: Math.sin(a) * force - 20,
          life: 0.65 + Math.random() * 0.35,
          color,
          size: 2 + Math.random() * 4,
        });
      }
    };

    const spawnRow = (state: GameState) => {
      const progress = Math.min(1, state.distance / GOAL);
      const lanes = [78, 156, 234, 312];
      const roll = Math.random();
      const obstacleChance = 0.18 + progress * 0.2;
      let type: ItemType = "flower";
      if (roll < obstacleChance * 0.36) type = "broken";
      else if (roll < obstacleChance * 0.64) type = "bear";
      else if (roll < obstacleChance) type = "web";
      else if (roll > 0.92) type = "gold";

      const lane = lanes[Math.floor(Math.random() * lanes.length)];
      state.items.push({
        id: state.nextId++,
        type,
        x: lane,
        y: -55,
        size: type === "bear" ? 42 : type === "web" ? 31 : 25,
        sway: Math.random() * Math.PI * 2,
      });

      if (type === "flower" && Math.random() > 0.52) {
        const second = lanes.filter((x) => Math.abs(x - lane) >= 70);
        state.items.push({
          id: state.nextId++,
          type: Math.random() > 0.86 ? "gold" : "flower",
          x: second[Math.floor(Math.random() * second.length)],
          y: -55,
          size: 25,
          sway: Math.random() * Math.PI * 2,
        });
      }
    };

    const drawBackground = (state: GameState, time: number) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      gradient.addColorStop(0, "#79d8f2");
      gradient.addColorStop(0.4, "#b8eddf");
      gradient.addColorStop(1, "#fff4b7");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      const scroll = (state.distance * 2.7) % 150;
      ctx.fillStyle = "rgba(255,255,255,.58)";
      for (let i = -1; i < 7; i += 1) {
        const y = i * 150 + scroll;
        ctx.beginPath();
        ctx.ellipse(42 + ((i * 83) % 290), y, 42, 18, 0, 0, Math.PI * 2);
        ctx.ellipse(76 + ((i * 83) % 290), y + 2, 31, 15, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "rgba(91,181,89,.28)";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(52, 0);
      ctx.bezierCurveTo(85, 170, 10, 325, 58, 505);
      ctx.bezierCurveTo(80, 610, 40, 700, 68, 780);
      ctx.lineTo(0, 780);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(WIDTH, 0);
      ctx.lineTo(WIDTH - 52, 0);
      ctx.bezierCurveTo(WIDTH - 85, 170, WIDTH - 10, 325, WIDTH - 58, 505);
      ctx.bezierCurveTo(WIDTH - 80, 610, WIDTH - 40, 700, WIDTH - 68, 780);
      ctx.lineTo(WIDTH, 780);
      ctx.closePath();
      ctx.fill();

      const flowerScroll = (state.distance * 5.1) % 95;
      for (let i = -1; i < 10; i += 1) {
        const y = i * 95 + flowerScroll;
        drawFlower(ctx, 21 + Math.sin(i * 2.1) * 6, y, 7, i % 4 === 0);
        drawFlower(ctx, WIDTH - 20 + Math.cos(i * 1.7) * 7, y + 38, 6, false);
      }

      ctx.fillStyle = "rgba(255,255,255,.22)";
      for (let i = 0; i < 7; i += 1) {
        const x = 55 + i * 47;
        const y = (time * 0.035 + i * 127) % HEIGHT;
        ctx.beginPath();
        ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const draw = (state: GameState, time: number) => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      drawBackground(state, time);

      for (const item of state.items) {
        if (item.type === "flower") drawFlower(ctx, item.x, item.y, item.size);
        else if (item.type === "gold") drawFlower(ctx, item.x, item.y, item.size, true);
        else if (item.type === "broken") drawFlower(ctx, item.x, item.y, item.size, false, true);
        else if (item.type === "bear") drawBear(ctx, item.x, item.y, item.size);
        else drawWeb(ctx, item.x, item.y, item.size);
      }

      for (const p of state.particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const tilt = (state.targetX - state.beeX) / 55;
      drawBee(ctx, state.beeX, HEIGHT - 112, tilt, state.invincible > 0, time);

      if (state.slowed > 0) {
        ctx.fillStyle = "rgba(255,255,255,.16)";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
      }
    };

    const update = (state: GameState, dt: number, time: number) => {
      state.elapsed += dt;
      state.invincible = Math.max(0, state.invincible - dt);
      state.slowed = Math.max(0, state.slowed - dt);
      state.messageTimer = Math.max(0, state.messageTimer - dt);
      if (state.messageTimer <= 0) state.message = "";

      let movement = 0;
      if (keysRef.current.left) movement -= 1;
      if (keysRef.current.right) movement += 1;

      if (controlMode === "motion" && orientationRef.current.calibrated) {
        const raw = orientationRef.current.gamma - orientationRef.current.baseline;
        const adjusted = Math.abs(raw) < 4 ? 0 : raw - Math.sign(raw) * 4;
        movement = Math.max(-1, Math.min(1, adjusted / 20));
        state.targetX += movement * 290 * dt;
      } else if (pointerRef.current.active) {
        state.targetX = pointerRef.current.x;
      } else if (movement !== 0) {
        state.targetX += movement * 300 * dt;
      }

      state.targetX = Math.max(50, Math.min(WIDTH - 50, state.targetX));
      state.beeX += (state.targetX - state.beeX) * Math.min(1, dt * 9.5);

      const effectiveSpeed = state.slowed > 0 ? state.speed * 0.55 : state.speed;
      state.distance = Math.min(GOAL, state.distance + dt * 15.2);
      state.speed = 215 + Math.min(80, state.distance * 0.075);
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnRow(state);
        state.spawnTimer = Math.max(0.34, 0.64 - state.distance / 4200) + Math.random() * 0.12;
      }

      const beeY = HEIGHT - 112;
      const remaining: Item[] = [];
      for (const item of state.items) {
        item.y += effectiveSpeed * dt;
        if (item.type === "gold") item.x += Math.sin(time * 0.004 + item.sway) * 0.42;
        const hitDistance = Math.hypot(item.x - state.beeX, item.y - beeY);
        const hitRadius = item.type === "bear" ? 46 : item.type === "web" ? 38 : 35;
        if (hitDistance < hitRadius && state.invincible <= 0) {
          if (item.type === "flower" || item.type === "gold") {
            const points = item.type === "gold" ? 50 : 10;
            const petals = item.type === "gold" ? 3 : 1;
            state.combo += 1;
            state.bestCombo = Math.max(state.bestCombo, state.combo);
            state.honey += points + Math.min(40, Math.floor(state.combo / 5) * 5);
            state.flowers += petals;
            state.message = item.type === "gold" ? "金色花蜜 +50" : state.combo >= 5 ? `${state.combo} 连采！` : "+10 花蜜";
            state.messageTimer = 0.65;
            spawnBurst(state, item.x, item.y, item.type === "gold" ? "#ffd84e" : "#ff8ab1", 11);
          } else if (item.type === "broken") {
            state.flowers = Math.max(0, state.flowers - 2);
            state.combo = 0;
            state.invincible = 0.8;
            state.message = "花朵破碎 -2";
            state.messageTimer = 1;
            spawnBurst(state, item.x, item.y, "#b49d92", 8);
          } else if (item.type === "bear") {
            const loss = Math.min(state.honey, Math.max(50, Math.min(300, Math.round(state.honey * 0.3))));
            state.honey -= loss;
            state.combo = 0;
            state.invincible = 1.5;
            state.message = `偷蜜熊 -${loss}`;
            state.messageTimer = 1.2;
            spawnBurst(state, item.x, item.y, "#ffbd21", 14);
          } else {
            state.combo = 0;
            state.slowed = 1.5;
            state.invincible = 0.65;
            state.message = "被蛛网缠住了！";
            state.messageTimer = 1.2;
          }
          continue;
        }
        if (item.y < HEIGHT + 80) remaining.push(item);
      }
      state.items = remaining;

      state.particles = state.particles
        .map((p) => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, vy: p.vy + 80 * dt, life: p.life - dt }))
        .filter((p) => p.life > 0);

      onStats(state.honey, state.flowers, state.distance, state.message);
      if (state.distance >= GOAL) onFinish(state.honey, state.flowers, state.bestCombo);
    };

    const loop = (time: number) => {
      const state = stateRef.current;
      if (!state.lastTime) state.lastTime = time;
      const dt = Math.min(0.034, (time - state.lastTime) / 1000);
      state.lastTime = time;
      if (phaseRef.current === "playing") update(state, dt, time);
      draw(state, time);
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [controlMode, onFinish, onStats, resetToken]);

  const setPointer = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    pointerRef.current.x = ((clientX - rect.left) / rect.width) * WIDTH;
  };

  return (
    <canvas
      ref={canvasRef}
      width={WIDTH}
      height={HEIGHT}
      className="game-canvas"
      aria-label="小蜜蜂采蜜游戏画面"
      onPointerDown={(event) => {
        pointerRef.current.active = true;
        setPointer(event.clientX);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (pointerRef.current.active) setPointer(event.clientX);
      }}
      onPointerUp={() => {
        pointerRef.current.active = false;
      }}
      onPointerCancel={() => {
        pointerRef.current.active = false;
      }}
    />
  );
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("menu");
  const [controlMode, setControlMode] = useState<ControlMode>("motion");
  const [resetToken, setResetToken] = useState(0);
  const [stats, setStats] = useState({ honey: 0, flowers: 0, distance: 0, message: "" });
  const [result, setResult] = useState({ honey: 0, flowers: 0, bestCombo: 0 });
  const [motionStatus, setMotionStatus] = useState<"idle" | "ready" | "unavailable">("idle");
  const finishLock = useRef(false);

  const onStats = useCallback((honey: number, flowers: number, distance: number, message: string) => {
    setStats((previous) => {
      if (
        previous.honey === honey &&
        previous.flowers === flowers &&
        Math.floor(previous.distance) === Math.floor(distance) &&
        previous.message === message
      ) return previous;
      return { honey, flowers, distance, message };
    });
  }, []);

  const onFinish = useCallback((honey: number, flowers: number, bestCombo: number) => {
    if (finishLock.current) return;
    finishLock.current = true;
    const finalHoney = honey + flowers * 10;
    setResult({ honey: finalHoney, flowers, bestCombo });
    setPhase("finished");
  }, []);

  const requestMotion = async () => {
    try {
      const OrientationEvent = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      if (typeof OrientationEvent === "undefined") throw new Error("unsupported");
      if (typeof OrientationEvent.requestPermission === "function") {
        const permission = await OrientationEvent.requestPermission();
        if (permission !== "granted") throw new Error("denied");
      }
      setMotionStatus("ready");
      setControlMode("motion");
      startGame();
    } catch {
      setMotionStatus("unavailable");
      setControlMode("touch");
    }
  };

  const startGame = () => {
    finishLock.current = false;
    setStats({ honey: 0, flowers: 0, distance: 0, message: "" });
    setResetToken((value) => value + 1);
    setPhase("playing");
  };

  const playTouch = () => {
    setControlMode("touch");
    startGame();
  };

  const stars = result.honey >= 900 ? 3 : result.honey >= 520 ? 2 : 1;

  return (
    <main className="page-shell">
      <section className="brand-panel" aria-label="游戏介绍">
        <div className="brand-mark"><span>蜜</span></div>
        <p className="eyebrow">HONEYBEE ADVENTURE</p>
        <h1>小蜜蜂<br /><em>采蜜世界</em></h1>
        <p className="brand-copy">左右晃动手机，穿过花海，把甜甜的花蜜安全送回家。</p>
        <div className="control-tip">
          <div className="phone-tilt" aria-hidden="true"><span>↔</span></div>
          <div><strong>体感控制</strong><small>向左或向右倾斜手机</small></div>
        </div>
        <div className="legend">
          <span><i className="dot flower-dot" />采花加蜜</span>
          <span><i className="dot bear-dot" />躲开偷蜜熊</span>
        </div>
      </section>

      <section className="game-phone">
        <GameCanvas
          phase={phase}
          controlMode={controlMode}
          onFinish={onFinish}
          onStats={onStats}
          resetToken={resetToken}
        />

        <header className="game-hud" aria-live="polite">
          <div className="hud-pill"><span className="honey-drop" /> <b>{stats.honey}</b></div>
          <div className="distance-track"><span style={{ width: `${Math.min(100, stats.distance / 10)}%` }} /></div>
          <div className="hud-pill flower-pill"><span>🌸</span> <b>{stats.flowers}</b></div>
        </header>

        {stats.message && phase === "playing" && <div className="game-message">{stats.message}</div>}

        {phase === "menu" && (
          <div className="game-overlay intro-overlay">
            <div className="mini-logo">小蜜蜂采蜜世界</div>
            <div className="hero-bee" aria-hidden="true"><span className="wing left" /><span className="wing right" /><b>●</b></div>
            <div className="intro-card">
              <p className="intro-kicker">准备好了吗？</p>
              <h2>晃动手机<br />飞进甜蜜花海</h2>
              <div className="tilt-demo" aria-hidden="true"><span>⌁</span><b>↔</b><span>⌁</span></div>
              <button className="primary-button" onClick={requestMotion}>开启体感 · 出发</button>
              <button className="text-button" onClick={playTouch}>触屏 / 电脑试玩</button>
              {motionStatus === "unavailable" && <p className="permission-note">当前设备未开启体感，已为你切换触屏模式。</p>}
            </div>
          </div>
        )}

        {phase === "playing" && (
          <button className="pause-button" onClick={() => setPhase("paused")} aria-label="暂停游戏">Ⅱ</button>
        )}

        {phase === "paused" && (
          <div className="game-overlay pause-overlay">
            <div className="modal-card compact-card">
              <span className="modal-icon">🍯</span>
              <h2>先歇一会儿</h2>
              <p>蜂蜜会在这里等你。</p>
              <button className="primary-button" onClick={() => setPhase("playing")}>继续采蜜</button>
              <button className="text-button" onClick={() => setPhase("menu")}>返回首页</button>
            </div>
          </div>
        )}

        {phase === "finished" && (
          <div className="game-overlay result-overlay">
            <div className="modal-card result-card">
              <p className="intro-kicker">平安回到蜂巢！</p>
              <h2>甜蜜大丰收</h2>
              <div className="stars" aria-label={`获得${stars}颗星`}>
                {[0, 1, 2].map((index) => <span key={index} className={index < stars ? "lit" : ""}>★</span>)}
              </div>
              <div className="score-number"><span className="honey-drop large" />{result.honey}</div>
              <div className="result-grid">
                <div><small>剩余花朵</small><strong>{result.flowers}</strong></div>
                <div><small>最高连采</small><strong>{result.bestCombo}</strong></div>
              </div>
              <button className="primary-button" onClick={startGame}>再飞一次</button>
              <button className="text-button" onClick={() => setPhase("menu")}>返回花园</button>
            </div>
          </div>
        )}

        {phase === "playing" && controlMode === "touch" && (
          <div className="touch-hint">按住并左右滑动</div>
        )}
      </section>
    </main>
  );
}
