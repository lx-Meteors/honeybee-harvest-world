"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "menu" | "playing" | "paused" | "finished" | "failed";
type ControlMode = "motion" | "touch";
type PlatformKind = "flower" | "gold" | "broken" | "bear";

type Platform = {
  id: number;
  x: number;
  y: number;
  width: number;
  kind: PlatformKind;
  used: boolean;
  breaking: number;
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

type GameState = {
  beeX: number;
  beeY: number;
  vx: number;
  vy: number;
  cameraY: number;
  honey: number;
  highest: number;
  platforms: Platform[];
  particles: Particle[];
  invincible: number;
  message: string;
  messageTimer: number;
  lastTime: number;
  finished: boolean;
};

const WIDTH = 390;
const HEIGHT = 780;
const GOAL = 1800;
const GRAVITY = 1080;
const JUMP_SPEED = 525;
const FLOOR_Y = HEIGHT - 96;

function buildPlatforms(): Platform[] {
  const list: Platform[] = [
    { id: 0, x: WIDTH / 2, y: 20, width: 118, kind: "flower", used: true, breaking: 0 },
  ];
  let y = 108;
  let x = WIDTH / 2;
  let id = 1;
  while (y < GOAL + 180) {
    const maxShift = y < 420 ? 92 : 128;
    x += (Math.random() - 0.5) * maxShift * 2;
    x = Math.max(62, Math.min(WIDTH - 62, x));
    const progress = y / GOAL;
    const roll = Math.random();
    let kind: PlatformKind = "flower";
    if (y > 260 && roll < 0.11 + progress * 0.08) kind = "broken";
    else if (y > 480 && roll < 0.18 + progress * 0.09) kind = "bear";
    else if (roll > 0.88) kind = "gold";
    list.push({
      id: id++,
      x,
      y,
      width: kind === "bear" ? 112 : 76 + Math.random() * 34,
      kind,
      used: false,
      breaking: 0,
    });
    y += 78 + Math.random() * 27;
  }
  return list;
}

function initialState(): GameState {
  return {
    beeX: WIDTH / 2,
    beeY: 54,
    vx: 0,
    vy: JUMP_SPEED,
    cameraY: 0,
    honey: 0,
    highest: 54,
    platforms: buildPlatforms(),
    particles: [],
    invincible: 0,
    message: "",
    messageTimer: 0,
    lastTime: 0,
    finished: false,
  };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function drawFlowerPlatform(
  ctx: CanvasRenderingContext2D,
  platform: Platform,
  screenY: number,
  time: number,
) {
  const { x, width, kind } = platform;
  const wobble = platform.breaking > 0 ? Math.sin(time * 0.07) * 4 : 0;
  ctx.save();
  ctx.translate(wobble, 0);

  ctx.strokeStyle = kind === "gold" ? "#d7a013" : "#559f58";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, screenY + 8);
  ctx.quadraticCurveTo(x + 11, screenY + 40, x - 3, screenY + 66);
  ctx.stroke();
  ctx.fillStyle = kind === "gold" ? "#ffe66a" : "#77c66f";
  ctx.beginPath();
  ctx.ellipse(x + 12, screenY + 37, 15, 7, -0.42, 0, Math.PI * 2);
  ctx.fill();

  const petalColor = kind === "broken" ? "#c7b5ad" : kind === "gold" ? "#ffe45a" : "#ff84ae";
  const petalEdge = kind === "broken" ? "#9e8a82" : kind === "gold" ? "#edab16" : "#e95f91";
  ctx.fillStyle = petalColor;
  ctx.strokeStyle = petalEdge;
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 7; i += 1) {
    const px = x - width / 2 + 10 + (i * (width - 20)) / 6;
    ctx.beginPath();
    ctx.ellipse(px, screenY, width / 8.3, 15, i % 2 ? 0.14 : -0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = kind === "gold" ? "#f4a70c" : kind === "broken" ? "#80716b" : "#ffc22b";
  roundedRect(ctx, x - width / 2, screenY - 7, width, 15, 8);
  ctx.fill();

  if (kind === "broken") {
    ctx.strokeStyle = "#66544e";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 10, screenY - 7);
    ctx.lineTo(x + 2, screenY);
    ctx.lineTo(x - 5, screenY + 8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBear(ctx: CanvasRenderingContext2D, x: number, y: number, size = 28) {
  ctx.save();
  ctx.translate(x, y - 31);
  ctx.fillStyle = "#875738";
  ctx.beginPath();
  ctx.arc(-16, -16, 10, 0, Math.PI * 2);
  ctx.arc(16, -16, 10, 0, Math.PI * 2);
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d8a376";
  ctx.beginPath();
  ctx.ellipse(0, 8, 14, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#30231d";
  ctx.beginPath();
  ctx.arc(-9, -5, 3, 0, Math.PI * 2);
  ctx.arc(9, -5, 3, 0, Math.PI * 2);
  ctx.arc(0, 6, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffc329";
  roundedRect(ctx, -20, 23, 40, 24, 7);
  ctx.fill();
  ctx.fillStyle = "#fff6d0";
  ctx.font = "900 11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("蜜", 0, 40);
  ctx.restore();
}

function drawBee(ctx: CanvasRenderingContext2D, x: number, y: number, vx: number, vy: number, time: number, blink: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.max(-0.24, Math.min(0.24, vx / 800)));
  if (blink && Math.floor(time / 90) % 2 === 0) ctx.globalAlpha = 0.38;

  const wing = 0.82 + Math.sin(time * 0.05) * 0.18;
  ctx.fillStyle = "rgba(239,252,255,.82)";
  ctx.strokeStyle = "rgba(92,155,173,.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-22, -2, 13 * wing, 25, -0.75, 0, Math.PI * 2);
  ctx.ellipse(22, -2, 13 * wing, 25, 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ffcb29";
  ctx.beginPath();
  ctx.ellipse(0, 4, 23, 29, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#403128";
  ctx.fillRect(-25, 1, 50, 8);
  ctx.fillRect(-22, 16, 44, 7);
  ctx.restore();
  ctx.fillStyle = "#ffdf62";
  ctx.beginPath();
  ctx.arc(0, -17, 21, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2f251f";
  ctx.beginPath();
  ctx.arc(-7, -19, 3.2, 0, Math.PI * 2);
  ctx.arc(7, -19, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2f251f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -15, 6, 0.1, Math.PI - 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-8, -34);
  ctx.quadraticCurveTo(-13, -46, -10, -51);
  ctx.moveTo(8, -34);
  ctx.quadraticCurveTo(13, -46, 10, -51);
  ctx.stroke();
  ctx.fillStyle = "#2f251f";
  ctx.beginPath();
  ctx.arc(-10, -51, 2.8, 0, Math.PI * 2);
  ctx.arc(10, -51, 2.8, 0, Math.PI * 2);
  ctx.fill();

  if (vy > 0) {
    ctx.fillStyle = "rgba(255,255,255,.5)";
    ctx.beginPath();
    ctx.arc(-7, 39, 3, 0, Math.PI * 2);
    ctx.arc(8, 46, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function GameCanvas({
  phase,
  controlMode,
  resetToken,
  onStats,
  onFinish,
  onFail,
}: {
  phase: Phase;
  controlMode: ControlMode;
  resetToken: number;
  onStats: (honey: number, height: number, message: string) => void;
  onFinish: (honey: number, height: number) => void;
  onFail: (honey: number, height: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(initialState());
  const phaseRef = useRef(phase);
  const frameRef = useRef(0);
  const orientationRef = useRef({ gamma: 0, baseline: 0, calibrated: false });
  const pointerRef = useRef({ active: false, x: WIDTH / 2 });
  const keysRef = useRef({ left: false, right: false });

  useEffect(() => {
    phaseRef.current = phase;
    stateRef.current.lastTime = 0;
  }, [phase]);

  useEffect(() => {
    stateRef.current = initialState();
    orientationRef.current.calibrated = false;
  }, [resetToken]);

  useEffect(() => {
    const orientation = (event: DeviceOrientationEvent) => {
      if (typeof event.gamma !== "number") return;
      const sensor = orientationRef.current;
      sensor.gamma = event.gamma;
      if (!sensor.calibrated) {
        sensor.baseline = event.gamma;
        sensor.calibrated = true;
      }
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") keysRef.current.left = true;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") keysRef.current.right = true;
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") keysRef.current.left = false;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") keysRef.current.right = false;
    };
    window.addEventListener("deviceorientation", orientation);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    return () => {
      window.removeEventListener("deviceorientation", orientation);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const burst = (state: GameState, x: number, y: number, color: string, count = 10) => {
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 35 + Math.random() * 80;
        state.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.65 + Math.random() * 0.35,
          color,
          size: 2 + Math.random() * 4,
        });
      }
    };

    const toScreenY = (worldY: number, cameraY: number) => FLOOR_Y - (worldY - cameraY);

    const drawBackground = (state: GameState, time: number) => {
      const progress = Math.min(1, state.cameraY / GOAL);
      const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      gradient.addColorStop(0, progress > 0.55 ? "#6ab8ee" : "#72d2ee");
      gradient.addColorStop(0.55, "#bcecdf");
      gradient.addColorStop(1, "#fff0a8");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      const cloudOffset = (state.cameraY * 0.48) % 170;
      ctx.fillStyle = "rgba(255,255,255,.62)";
      for (let i = -1; i < 7; i += 1) {
        const y = i * 170 + cloudOffset;
        const x = 25 + ((i * 97) % 285);
        ctx.beginPath();
        ctx.ellipse(x, y, 35, 15, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 31, y + 2, 27, 12, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 15, y - 10, 22, 17, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "rgba(255,246,182,.45)";
      for (let i = 0; i < 9; i += 1) {
        const x = 28 + i * 43;
        const y = (time * 0.018 + i * 101 + state.cameraY * 0.7) % HEIGHT;
        ctx.beginPath();
        ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }

      if (state.cameraY < 280) {
        ctx.fillStyle = "rgba(74,159,76,.28)";
        ctx.beginPath();
        ctx.moveTo(0, HEIGHT);
        ctx.quadraticCurveTo(80, HEIGHT - 150 + state.cameraY * 0.28, 170, HEIGHT);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(WIDTH, HEIGHT);
        ctx.quadraticCurveTo(WIDTH - 75, HEIGHT - 190 + state.cameraY * 0.28, WIDTH - 190, HEIGHT);
        ctx.closePath();
        ctx.fill();
      }
    };

    const draw = (state: GameState, time: number) => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      drawBackground(state, time);

      const visiblePlatforms = state.platforms.filter((p) => {
        const screenY = toScreenY(p.y, state.cameraY);
        return screenY > -100 && screenY < HEIGHT + 90 && p.breaking < 0.38;
      });
      for (const platform of visiblePlatforms) {
        const screenY = toScreenY(platform.y, state.cameraY);
        drawFlowerPlatform(ctx, platform, screenY, time);
        if (platform.kind === "bear") drawBear(ctx, platform.x, screenY);
      }

      for (const particle of state.particles) {
        ctx.globalAlpha = Math.max(0, particle.life);
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const beeScreenY = toScreenY(state.beeY, state.cameraY);
      drawBee(ctx, state.beeX, beeScreenY, state.vx, state.vy, time, state.invincible > 0);

      if (state.highest > GOAL - 280) {
        const hiveY = toScreenY(GOAL + 105, state.cameraY);
        if (hiveY > -100 && hiveY < HEIGHT + 100) {
          ctx.fillStyle = "#e99b13";
          ctx.beginPath();
          ctx.ellipse(WIDTH / 2, hiveY, 66, 72, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#b96a0d";
          ctx.lineWidth = 7;
          for (const offset of [-30, -10, 12, 34]) {
            ctx.beginPath();
            ctx.moveTo(WIDTH / 2 - 52, hiveY + offset);
            ctx.lineTo(WIDTH / 2 + 52, hiveY + offset);
            ctx.stroke();
          }
          ctx.fillStyle = "#4a2c16";
          ctx.beginPath();
          ctx.ellipse(WIDTH / 2, hiveY + 28, 19, 25, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,.88)";
          roundedRect(ctx, WIDTH / 2 - 58, hiveY - 112, 116, 34, 17);
          ctx.fill();
          ctx.fillStyle = "#87540c";
          ctx.font = "900 14px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("云上蜂巢", WIDTH / 2, hiveY - 90);
        }
      }
    };

    const update = (state: GameState, dt: number, time: number) => {
      state.invincible = Math.max(0, state.invincible - dt);
      state.messageTimer = Math.max(0, state.messageTimer - dt);
      if (state.messageTimer <= 0) state.message = "";

      let input = 0;
      if (keysRef.current.left) input -= 1;
      if (keysRef.current.right) input += 1;
      if (controlMode === "motion" && orientationRef.current.calibrated) {
        const raw = orientationRef.current.gamma - orientationRef.current.baseline;
        input = Math.abs(raw) < 4 ? 0 : Math.max(-1, Math.min(1, (raw - Math.sign(raw) * 4) / 18));
      } else if (pointerRef.current.active) {
        input = Math.max(-1, Math.min(1, (pointerRef.current.x - state.beeX) / 56));
      }

      const targetVx = input * 275;
      state.vx += (targetVx - state.vx) * Math.min(1, dt * 8);
      if (input === 0) state.vx *= Math.pow(0.88, dt * 60);

      const oldY = state.beeY;
      const oldFoot = oldY - 28;
      state.beeX += state.vx * dt;
      if (state.beeX < -24) state.beeX = WIDTH + 24;
      if (state.beeX > WIDTH + 24) state.beeX = -24;
      state.vy -= GRAVITY * dt;
      state.beeY += state.vy * dt;
      const newFoot = state.beeY - 28;

      if (state.vy < 0) {
        let landing: Platform | undefined;
        for (const platform of state.platforms) {
          if (platform.breaking >= 0.38) continue;
          const half = platform.width / 2 + 13;
          if (
            oldFoot >= platform.y &&
            newFoot <= platform.y &&
            state.beeX >= platform.x - half &&
            state.beeX <= platform.x + half
          ) {
            landing = platform;
            break;
          }
        }
        if (landing) {
          state.beeY = landing.y + 28;
          state.vy = JUMP_SPEED;
          const screenY = toScreenY(landing.y, state.cameraY);
          if (landing.kind === "broken") {
            landing.breaking = 0.01;
            state.message = "花朵碎了，快跳！";
            state.messageTimer = 0.9;
            burst(state, landing.x, screenY, "#c7aaa0", 13);
          } else if (landing.kind === "bear" && state.invincible <= 0) {
            const loss = Math.min(state.honey, Math.max(20, Math.round(state.honey * 0.3)));
            state.honey -= loss;
            state.invincible = 1.4;
            state.vx = state.beeX < landing.x ? -230 : 230;
            state.message = `偷蜜熊 -${loss}`;
            state.messageTimer = 1.1;
            burst(state, landing.x, screenY - 25, "#ffbd23", 15);
          } else if (!landing.used) {
            landing.used = true;
            const gain = landing.kind === "gold" ? 30 : 10;
            state.honey += gain;
            state.message = landing.kind === "gold" ? "金色花蜜 +30" : "采到花蜜 +10";
            state.messageTimer = 0.65;
            burst(state, landing.x, screenY, landing.kind === "gold" ? "#ffe052" : "#ff8db3", 10);
          }
        }
      }

      for (const platform of state.platforms) {
        if (platform.breaking > 0) platform.breaking += dt;
      }

      state.highest = Math.max(state.highest, state.beeY);
      const targetCamera = Math.max(0, state.highest - 350);
      state.cameraY += (targetCamera - state.cameraY) * Math.min(1, dt * 4.2);

      state.particles = state.particles
        .map((p) => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, vy: p.vy + 70 * dt, life: p.life - dt }))
        .filter((p) => p.life > 0);

      onStats(state.honey, state.highest, state.message);
      if (!state.finished && state.highest >= GOAL) {
        state.finished = true;
        onFinish(state.honey, state.highest);
      } else if (!state.finished && state.beeY < state.cameraY - 85) {
        state.finished = true;
        onFail(state.honey, state.highest);
      }

      void time;
    };

    const loop = (time: number) => {
      const state = stateRef.current;
      if (!state.lastTime) state.lastTime = time;
      const dt = Math.min(0.032, (time - state.lastTime) / 1000);
      state.lastTime = time;
      if (phaseRef.current === "playing") update(state, dt, time);
      draw(state, time);
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [controlMode, onFail, onFinish, onStats, resetToken]);

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
      aria-label="小蜜蜂踩着花朵向上跳的游戏画面"
      onPointerDown={(event) => {
        pointerRef.current.active = true;
        setPointer(event.clientX);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => pointerRef.current.active && setPointer(event.clientX)}
      onPointerUp={() => { pointerRef.current.active = false; }}
      onPointerCancel={() => { pointerRef.current.active = false; }}
    />
  );
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("menu");
  const [controlMode, setControlMode] = useState<ControlMode>("motion");
  const [resetToken, setResetToken] = useState(0);
  const [stats, setStats] = useState({ honey: 0, height: 0, message: "" });
  const [result, setResult] = useState({ honey: 0, height: 0 });
  const [motionUnavailable, setMotionUnavailable] = useState(false);
  const finishLock = useRef(false);

  const onStats = useCallback((honey: number, height: number, message: string) => {
    setStats((previous) => {
      if (previous.honey === honey && Math.floor(previous.height) === Math.floor(height) && previous.message === message) return previous;
      return { honey, height, message };
    });
  }, []);

  const onFinish = useCallback((honey: number, height: number) => {
    if (finishLock.current) return;
    finishLock.current = true;
    setResult({ honey, height });
    setPhase("finished");
  }, []);

  const onFail = useCallback((honey: number, height: number) => {
    if (finishLock.current) return;
    finishLock.current = true;
    setResult({ honey, height });
    setPhase("failed");
  }, []);

  const startGame = () => {
    finishLock.current = false;
    setStats({ honey: 0, height: 0, message: "" });
    setResetToken((value) => value + 1);
    setPhase("playing");
  };

  const requestMotion = async () => {
    try {
      const MotionEvent = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      if (typeof MotionEvent.requestPermission === "function") {
        const permission = await MotionEvent.requestPermission();
        if (permission !== "granted") throw new Error("denied");
      }
      setControlMode("motion");
      startGame();
    } catch {
      setMotionUnavailable(true);
      setControlMode("touch");
    }
  };

  const playTouch = () => {
    setControlMode("touch");
    startGame();
  };

  const stars = result.honey >= 180 ? 3 : result.honey >= 90 ? 2 : 1;

  return (
    <main className="page-shell">
      <section className="brand-panel" aria-label="游戏介绍">
        <div className="brand-mark"><span>蜜</span></div>
        <p className="eyebrow">HONEYBEE JUMP</p>
        <h1>小蜜蜂<br /><em>花间跳跃</em></h1>
        <p className="brand-copy">小蜜蜂会一直向上跳。左右晃动手机，让它稳稳踩住一朵又一朵花，飞回云上的蜂巢。</p>
        <div className="control-tip">
          <div className="phone-tilt" aria-hidden="true"><span>↔</span></div>
          <div><strong>只控制左右</strong><small>跳跃与上升完全自动</small></div>
        </div>
        <div className="legend">
          <span><i className="dot flower-dot" />踩花向上跳</span>
          <span><i className="dot bear-dot" />躲开偷蜜熊</span>
        </div>
      </section>

      <section className="game-phone">
        <GameCanvas
          phase={phase}
          controlMode={controlMode}
          resetToken={resetToken}
          onStats={onStats}
          onFinish={onFinish}
          onFail={onFail}
        />

        <header className="game-hud" aria-live="polite">
          <div className="hud-pill"><span className="honey-drop" /><b>{stats.honey}</b></div>
          <div className="distance-track"><span style={{ width: `${Math.min(100, (stats.height / GOAL) * 100)}%` }} /></div>
          <div className="hud-pill flower-pill"><span>↥</span><b>{Math.floor(stats.height)}m</b></div>
        </header>

        {stats.message && phase === "playing" && <div className="game-message">{stats.message}</div>}

        {phase === "menu" && (
          <div className="game-overlay intro-overlay">
            <div className="mini-logo">小蜜蜂 · 花间跳跃</div>
            <div className="hero-bee" aria-hidden="true"><span className="wing left" /><span className="wing right" /><b>●</b></div>
            <div className="intro-card">
              <p className="intro-kicker">踩住花朵，一路向上</p>
              <h2>小蜜蜂自动跳<br />你只管左右晃</h2>
              <div className="tilt-demo" aria-hidden="true"><span>🌸</span><b>↔</b><span>🌸</span></div>
              <button className="primary-button" onClick={requestMotion}>开启体感 · 起跳</button>
              <button className="text-button" onClick={playTouch}>触屏 / 电脑试玩</button>
              {motionUnavailable && <p className="permission-note">当前设备未开启体感，请使用触屏模式。</p>}
            </div>
          </div>
        )}

        {phase === "playing" && <button className="pause-button" onClick={() => setPhase("paused")} aria-label="暂停游戏">Ⅱ</button>}

        {phase === "paused" && (
          <div className="game-overlay pause-overlay">
            <div className="modal-card compact-card">
              <span className="modal-icon">🌸</span>
              <h2>停在花朵上</h2>
              <p>准备好再继续向上跳。</p>
              <button className="primary-button" onClick={() => setPhase("playing")}>继续跳跃</button>
              <button className="text-button" onClick={() => setPhase("menu")}>返回首页</button>
            </div>
          </div>
        )}

        {phase === "finished" && (
          <div className="game-overlay result-overlay">
            <div className="modal-card result-card">
              <p className="intro-kicker">抵达云上蜂巢！</p>
              <h2>跳跃成功</h2>
              <div className="stars" aria-label={`获得${stars}颗星`}>
                {[0, 1, 2].map((index) => <span key={index} className={index < stars ? "lit" : ""}>★</span>)}
              </div>
              <div className="score-number"><span className="honey-drop large" />{result.honey}</div>
              <div className="result-grid"><div><small>最高高度</small><strong>{Math.floor(result.height)}m</strong></div><div><small>成功到达</small><strong>蜂巢</strong></div></div>
              <button className="primary-button" onClick={startGame}>再跳一次</button>
              <button className="text-button" onClick={() => setPhase("menu")}>返回花园</button>
            </div>
          </div>
        )}

        {phase === "failed" && (
          <div className="game-overlay result-overlay">
            <div className="modal-card result-card">
              <span className="modal-icon">🍃</span>
              <p className="intro-kicker">没踩到花朵</p>
              <h2>再试一次吧</h2>
              <div className="result-grid fail-grid"><div><small>本次花蜜</small><strong>{result.honey}</strong></div><div><small>最高高度</small><strong>{Math.floor(result.height)}m</strong></div></div>
              <button className="primary-button" onClick={startGame}>重新起跳</button>
              <button className="text-button" onClick={() => setPhase("menu")}>返回花园</button>
            </div>
          </div>
        )}

        {phase === "playing" && controlMode === "touch" && <div className="touch-hint">按住画面左右移动，跳跃会自动进行</div>}
      </section>
    </main>
  );
}
