"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "menu" | "playing" | "paused" | "failed";
type ControlMode = "motion" | "touch";
type PlatformKind = "flower" | "broken" | "spring" | "moving" | "cloud" | "fading" | "windFlower";
type AirKind = "bear" | "web" | "blackHole" | "hornet" | "bat" | "rocket" | "bambooCopter" | "honeyJar" | "waxShield";
type SoundKind = "start" | "bounce" | "spring" | "break" | "honey" | "rocket" | "copter" | "shield" | "wind" | "shoot" | "hit" | "fail" | "empty" | "bearWarning" | "webWind" | "blackHole";
type IntroductionKind = "moving" | "fading" | "bear" | "hornet" | "web" | "bat" | "blackHole";

type Platform = {
  id: number;
  x: number;
  y: number;
  width: number;
  kind: PlatformKind;
  used: boolean;
  breaking: number;
  baseX?: number;
  range?: number;
  speed?: number;
  phase?: number;
  route?: "safe" | "risk";
};

type AirItem = { id: number; x: number; y: number; kind: AirKind; used: boolean; value?: number; strength?: number; baseX?: number; range?: number; speed?: number; phase?: number; audioPlayed?: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };
type PollenShot = { x: number; y: number; vy: number; life: number };

type GameState = {
  beeX: number;
  beeY: number;
  vx: number;
  vy: number;
  facing: -1 | 1;
  cameraY: number;
  honey: number;
  bonusHoney: number;
  highest: number;
  platforms: Platform[];
  airItems: AirItem[];
  particles: Particle[];
  shots: PollenShot[];
  generatedTo: number;
  lastPlatformX: number;
  routeDirection: number;
  routeStep: number;
  routePattern: number;
  sceneRemaining: number;
  sceneProgress: number;
  lastSpringStep: number;
  springTargetY: number;
  springTargetX: number;
  lastHazardStep: number;
  lastJarStep: number;
  introduced: Record<IntroductionKind, boolean>;
  nextShieldScore: number;
  nextWindFlowerScore: number;
  ammo: number;
  ammoProgress: number;
  shield: number;
  nextRocketY: number;
  rocketRecoveryY: number;
  rocketRecoveryX: number;
  nextCopterY: number;
  copterRecoveryY: number;
  copterRecoveryX: number;
  nextId: number;
  invincible: number;
  windTimer: number;
  rocketTimer: number;
  copterTimer: number;
  lastTime: number;
  ended: boolean;
};

const WIDTH = 540;
const HEIGHT = 720;
const PLATFORM_WIDTH = 78;
const FLOOR_Y = HEIGHT - 74;
const GRAVITY = 1070;
const JUMP_SPEED = 795;
const SPRING_SPEED = 1190;
const ROCKET_SPEED = 960;
const COPTER_SPEED = 860;
const HEIGHT_SCALE = 16;
const VIEW_SCALE = .72;
const ROCKET_INTERVAL_METERS = 450;
const ROCKET_INTERVAL_WORLD = ROCKET_INTERVAL_METERS * HEIGHT_SCALE;
const ROCKET_FLIGHT_TIME = 2.65;
const ROCKET_RECOVERY_DISTANCE = 2520;
const COPTER_INTERVAL_METERS = 320;
const COPTER_INTERVAL_WORLD = COPTER_INTERVAL_METERS * HEIGHT_SCALE;
const COPTER_FLIGHT_TIME = 1.45;
const COPTER_RECOVERY_DISTANCE = 1380;
const WIND_FLIGHT_TIME = .72;
const WIND_SPEED = 735;
const SFX_VOLUME = .66;
const MUSIC_VOLUME = .085;
const DANGER_MUSIC_VOLUME = .026;

let sharedAudioContext: AudioContext | null = null;
let activeBearDangerLoop: HTMLAudioElement | null = null;
let activeBlackHoleLoop: HTMLAudioElement | null = null;
let bearSynthTimer: number | null = null;
let backgroundMusic: HTMLAudioElement | null = null;
let synthMusicTimer: number | null = null;
let synthMusicStep = 0;
let bearDangerActive = false;
let blackHoleDangerActive = false;
const audioPools = new Map<SoundKind, HTMLAudioElement[]>();

const SOUND_FILES: Partial<Record<SoundKind, string>> = {
  start: "/sfx/start.ogg",
  bounce: "/sfx/bounce.ogg",
  spring: "/sfx/spring.ogg",
  break: "/sfx/break.ogg",
  honey: "/sfx/honey.ogg",
  shoot: "/sfx/shoot.ogg",
  hit: "/sfx/hit.ogg",
  fail: "/sfx/fail.ogg",
  empty: "/sfx/empty.ogg",
  bearWarning: "/sfx/monster-warning-v2.wav?v=20260804",
  webWind: "/sfx/web-wind.ogg",
  blackHole: "/sfx/black-hole-v2.wav?v=20260804",
};
const SOUND_MIX: Partial<Record<SoundKind, number>> = {
  bounce: .58,
  spring: .88,
  break: .76,
  honey: .78,
  bearWarning: 1,
  webWind: .68,
  blackHole: .72,
  fail: .82,
};

function playAudioFile(kind: SoundKind) {
  if (typeof window === "undefined") return false;
  const source = SOUND_FILES[kind];
  if (!source) return false;
  if (source.endsWith(".ogg") && !new Audio().canPlayType('audio/ogg; codecs="vorbis"')) return false;
  let pool = audioPools.get(kind);
  if (!pool) {
    pool = Array.from({ length: kind === "bounce" ? 4 : 2 }, () => {
      const audio = new Audio(source);
      audio.preload = "auto";
      audio.volume = SFX_VOLUME * (SOUND_MIX[kind] ?? .72);
      return audio;
    });
    audioPools.set(kind, pool);
  }
  const audio = pool.find((candidate) => candidate.paused || candidate.ended) ?? pool[0];
  audio.currentTime = 0;
  audio.volume = SFX_VOLUME * (SOUND_MIX[kind] ?? .72);
  audio.playbackRate = kind === "bounce"
    ? .94 + Math.random() * .1
    : kind === "spring" ? 1.02
      : 1;
  void audio.play().catch(() => playSynthSound(kind));
  return true;
}

function getGameAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedAudioContext || sharedAudioContext.state === "closed") sharedAudioContext = new AudioContextClass();
  if (sharedAudioContext.state === "suspended") void sharedAudioContext.resume();
  return sharedAudioContext;
}

function playSynthSound(kind: SoundKind) {
  const audio = getGameAudioContext();
  if (!audio) return;
  const tone = (from: number, to: number, duration: number, type: OscillatorType, volume: number, delay = 0) => {
    const start = audio.currentTime + delay;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
  };
  const noise = (duration: number, filterType: BiquadFilterType, from: number, to: number, volume: number, delay = 0, attack = .04) => {
    const start = audio.currentTime + delay;
    const frameCount = Math.ceil(audio.sampleRate * duration);
    const buffer = audio.createBuffer(1, frameCount, audio.sampleRate);
    const samples = buffer.getChannelData(0);
    let smoothed = 0;
    for (let i = 0; i < frameCount; i += 1) {
      smoothed = smoothed * .72 + (Math.random() * 2 - 1) * .28;
      samples[i] = smoothed;
    }
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    source.buffer = buffer;
    filter.type = filterType;
    filter.Q.value = filterType === "bandpass" ? 1.2 : .7;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(to, start + duration);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + attack);
    gain.gain.setValueAtTime(volume * .78, start + duration * .58);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audio.destination);
    source.start(start);
    source.stop(start + duration + .02);
  };

  if (kind === "start") {
    tone(392, 523, .16, "sine", .032);
    tone(523, 784, .2, "sine", .028, .1);
  } else if (kind === "bounce") {
    tone(175, 315, .09, "sine", .022);
    tone(350, 240, .055, "triangle", .009, .04);
  } else if (kind === "spring") {
    tone(165, 590, .25, "triangle", .045);
    tone(290, 870, .18, "sine", .03, .075);
    tone(520, 740, .12, "sine", .018, .18);
  } else if (kind === "break") {
    noise(.19, "bandpass", 1500, 240, .05, 0, .008);
    tone(145, 52, .18, "triangle", .032);
  }
  else if (kind === "honey") {
    tone(523, 784, .17, "sine", .038);
    tone(659, 1046, .2, "sine", .029, .08);
    tone(784, 1318, .17, "sine", .019, .16);
  } else if (kind === "shield") {
    tone(392, 784, .2, "sine", .038);
    tone(659, 1174, .25, "triangle", .025, .08);
  } else if (kind === "wind") {
    noise(.6, "bandpass", 480, 1700, .035, 0, .08);
    tone(420, 760, .34, "sine", .018, .04);
  } else if (kind === "rocket") {
    // A clean lift-off whoosh with a warm rising body, without the old harsh motor loop.
    noise(.92, "bandpass", 260, 980, .026, 0, .14);
    tone(92, 245, .72, "sine", .023, .02);
    tone(184, 490, .55, "sine", .011, .13);
  } else if (kind === "copter") {
    // A short, friendly three-note twirl. The visual already explains the propeller,
    // so the cue stays musical instead of imitating a mechanical rotor.
    tone(523, 659, .2, "sine", .021, 0);
    tone(659, 784, .2, "sine", .019, .1);
    tone(784, 1047, .24, "sine", .016, .2);
    noise(.42, "bandpass", 760, 1380, .007, .04, .1);
  } else if (kind === "shoot") {
    noise(.09, "highpass", 2200, 680, .025, 0, .005);
    tone(690, 280, .1, "triangle", .028);
  } else if (kind === "hit") {
    noise(.14, "bandpass", 720, 170, .04, 0, .006);
    tone(210, 480, .14, "triangle", .034);
  } else if (kind === "empty") tone(130, 104, .09, "sine", .014);
  else if (kind === "bearWarning") {
    noise(.95, "bandpass", 320, 125, .075, 0, .09);
    tone(92, 54, .82, "sawtooth", .05);
    tone(76, 47, .58, "triangle", .034, .24);
  } else if (kind === "webWind") {
    noise(1.35, "bandpass", 520, 1900, .07, 0, .16);
    noise(.95, "highpass", 1100, 3200, .025, .2, .12);
  } else {
    noise(.38, "lowpass", 520, 95, .05, 0, .02);
    tone(190, 48, .38, "sawtooth", .045);
    tone(112, 42, .34, "triangle", .024, .08);
  }
}

function playGameSound(kind: SoundKind) {
  if (!playAudioFile(kind)) playSynthSound(kind);
}

function unlockGameAudio() {
  const audio = getGameAudioContext();
  if (!audio) return;
  void audio.resume().then(() => {
    const buffer = audio.createBuffer(1, 1, audio.sampleRate);
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    source.start();
  }).catch(() => undefined);
}

function stopBearSynthLoop() {
  if (bearSynthTimer !== null && typeof window !== "undefined") window.clearInterval(bearSynthTimer);
  bearSynthTimer = null;
}

function startBearSynthLoop() {
  if (typeof window === "undefined" || bearSynthTimer !== null) return;
  playGameSound("bearWarning");
  bearSynthTimer = window.setInterval(() => playGameSound("bearWarning"), 920);
}

function syncDangerMusicVolume() {
  if (!backgroundMusic) return;
  backgroundMusic.volume = bearDangerActive || blackHoleDangerActive
    ? DANGER_MUSIC_VOLUME
    : MUSIC_VOLUME;
}

function setBearDangerSound(active: boolean) {
  bearDangerActive = active;
  syncDangerMusicVolume();
  if (!active && !activeBearDangerLoop && bearSynthTimer === null) return;
  if (active && !activeBearDangerLoop && typeof window !== "undefined") {
    const loop = new Audio("/sfx/monster-warning-v2.wav?v=20260804");
    loop.loop = true;
    loop.preload = "auto";
    loop.volume = Math.min(1, SFX_VOLUME * 1.28);
    void loop.play().then(stopBearSynthLoop).catch(startBearSynthLoop);
    activeBearDangerLoop = loop;
  } else if (!active && activeBearDangerLoop) {
    activeBearDangerLoop.pause();
    activeBearDangerLoop.currentTime = 0;
    activeBearDangerLoop = null;
    stopBearSynthLoop();
  } else if (!active) {
    stopBearSynthLoop();
  }
}

function setBlackHoleDangerSound(active: boolean) {
  blackHoleDangerActive = active;
  syncDangerMusicVolume();
  if (!active && !activeBlackHoleLoop) return;
  if (active && !activeBlackHoleLoop && typeof window !== "undefined") {
    const loop = new Audio("/sfx/black-hole-v2.wav?v=20260804");
    loop.loop = true;
    loop.preload = "auto";
    loop.volume = Math.min(1, SFX_VOLUME * 1.12);
    void loop.play().catch(() => playSynthSound("blackHole"));
    activeBlackHoleLoop = loop;
  } else if (!active && activeBlackHoleLoop) {
    activeBlackHoleLoop.pause();
    activeBlackHoleLoop.currentTime = 0;
    activeBlackHoleLoop = null;
  }
}

function stopSynthBackgroundMusic() {
  if (synthMusicTimer !== null && typeof window !== "undefined") window.clearInterval(synthMusicTimer);
  synthMusicTimer = null;
  synthMusicStep = 0;
}

function startSynthBackgroundMusic() {
  if (typeof window === "undefined" || synthMusicTimer !== null) return;
  const melody = [
    523.25, 0, 659.25, 783.99, 0, 659.25, 587.33, 0,
    493.88, 0, 587.33, 783.99, 0, 587.33, 493.88, 0,
    440, 0, 523.25, 659.25, 0, 523.25, 493.88, 0,
    440, 0, 523.25, 698.46, 0, 659.25, 523.25, 0,
  ];
  const playNote = () => {
    const audio = getGameAudioContext();
    if (!audio || audio.state !== "running") return;
    const now = audio.currentTime;
    const frequency = melody[synthMusicStep % melody.length];
    synthMusicStep += 1;
    if (!frequency) return;
    const gain = audio.createGain();
    const lead = audio.createOscillator();
    const glow = audio.createOscillator();
    lead.type = "sine";
    glow.type = "sine";
    lead.frequency.value = frequency;
    glow.frequency.value = frequency / 2;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.009, now + .018);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .54);
    lead.connect(gain);
    glow.connect(gain);
    gain.connect(audio.destination);
    lead.start(now);
    glow.start(now);
    lead.stop(now + .56);
    glow.stop(now + .56);
  };
  playNote();
  synthMusicTimer = window.setInterval(playNote, 312.5);
}

function prepareBackgroundMusic() {
  if (typeof window === "undefined") return null;
  if (!backgroundMusic) {
    backgroundMusic = new Audio("/sfx/flowerbed-fields.ogg?v=20260804");
    backgroundMusic.loop = true;
    backgroundMusic.preload = "auto";
    backgroundMusic.volume = MUSIC_VOLUME;
    backgroundMusic.load();
  }
  return backgroundMusic;
}

function setBackgroundMusic(active: boolean) {
  if (typeof window === "undefined") return;
  if (active) {
    const music = prepareBackgroundMusic();
    if (!music) {
      startSynthBackgroundMusic();
      return;
    }
    syncDangerMusicVolume();
    void music.play().then(stopSynthBackgroundMusic).catch(startSynthBackgroundMusic);
  } else if (backgroundMusic) {
    backgroundMusic.pause();
    stopSynthBackgroundMusic();
  } else {
    stopSynthBackgroundMusic();
  }
}

function heightMeters(worldY: number) {
  return Math.max(0, (worldY - 48) / HEIGHT_SCALE);
}

function firstState(): GameState {
  return {
    beeX: WIDTH / 2,
    beeY: 48,
    vx: 0,
    vy: JUMP_SPEED,
    facing: 1,
    cameraY: 0,
    honey: 0,
    bonusHoney: 0,
    highest: 48,
    platforms: [{ id: 0, x: WIDTH / 2, y: 16, width: PLATFORM_WIDTH, kind: "flower", used: true, breaking: 0 }],
    airItems: [],
    particles: [],
    shots: [],
    generatedTo: 16,
    lastPlatformX: WIDTH / 2,
    routeDirection: -1,
    routeStep: 0,
    routePattern: -1,
    sceneRemaining: 0,
    sceneProgress: 0,
    lastSpringStep: -20,
    springTargetY: -1,
    springTargetX: WIDTH / 2,
    lastHazardStep: -20,
    lastJarStep: -20,
    introduced: {
      moving: false,
      fading: false,
      bear: false,
      hornet: false,
      web: false,
      bat: false,
      blackHole: false,
    },
    nextShieldScore: 600,
    nextWindFlowerScore: 350,
    ammo: 1,
    ammoProgress: 0,
    shield: 0,
    nextRocketY: 48 + ROCKET_INTERVAL_WORLD,
    rocketRecoveryY: 0,
    rocketRecoveryX: WIDTH / 2,
    nextCopterY: 48 + COPTER_INTERVAL_WORLD * .7,
    copterRecoveryY: 0,
    copterRecoveryX: WIDTH / 2,
    nextId: 1,
    invincible: 0,
    windTimer: 0,
    rocketTimer: 0,
    copterTimer: 0,
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

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function progressionStageAtHeight(meters: number) {
  return meters < 300 ? 0
    : meters < 650 ? 1
      : meters < 1000 ? 2
        : meters < 1450 ? 3
          : meters < 2100 ? 4
            : 5;
}

function linearDifficultyAtHeight(meters: number) {
  return clampNumber(meters / 3200, 0, 1);
}

function platformPlacementOverlaps(platforms: Platform[], x: number, y: number, width: number) {
  return platforms.some((platform) => (
    Math.abs(platform.y - y) < 34
    && Math.abs(platform.x - x) < (platform.width + width) / 2 + 22
  ));
}

function chooseRouteScene(state: GameState, stage: number) {
  // 0 密集恢复、1 双侧散点、2 移动花、3 空旷区、4 偏角落、
  // 5 常规散点、6 综合高难。场景交替形成局部波峰/波谷，整体难度仍随高度线性上升。
  const scenePools = [
    [0, 0, 0, 5, 5],
    [0, 0, 1, 1, 5, 5, 3],
    [0, 1, 1, 2, 2, 3, 5, 5],
    [0, 1, 2, 2, 3, 4, 5, 6],
    [0, 1, 2, 3, 3, 4, 5, 6, 6],
    [0, 1, 2, 3, 3, 4, 5, 6, 6, 6],
  ];
  const pool = scenePools[stage];
  let next = pool[Math.floor(Math.random() * pool.length)];
  for (let tries = 0; tries < 5 && next === state.routePattern; tries += 1) {
    next = pool[Math.floor(Math.random() * pool.length)];
  }
  state.routePattern = next;
  state.routeDirection = Math.random() < .5 ? -1 : 1;
  state.sceneRemaining = 1;
  state.sceneProgress = 0;
}

function horizontalReachForGap(gap: number, difficulty: number) {
  const discriminant = Math.max(0, JUMP_SPEED * JUMP_SPEED - 2 * GRAVITY * gap);
  const flightTime = (JUMP_SPEED + Math.sqrt(discriminant)) / GRAVITY;
  return clampNumber(flightTime * (220 + difficulty * 36), 138, 318);
}

function nextFieldX(state: GameState, y: number, difficulty: number, preferredRange?: [number, number]) {
  const minX = preferredRange?.[0] ?? 40;
  const maxX = preferredRange?.[1] ?? WIDTH - 40;
  const supports = state.platforms.filter((platform) => {
    const verticalGap = y - platform.y;
    return platform.kind !== "broken" && platform.breaking < .38 && verticalGap > 34 && verticalGap < 278;
  });
  const isReachable = (x: number) => supports.some((support) => {
    const verticalGap = y - support.y;
    return Math.abs(x - support.x) <= horizontalReachForGap(verticalGap, difficulty);
  });

  for (let tries = 0; tries < 12; tries += 1) {
    const candidate = randomBetween(minX, maxX);
    if (isReachable(candidate) && (tries > 6 || Math.abs(candidate - state.lastPlatformX) > 34)) return candidate;
  }
  if (supports.length === 0) return clampNumber(state.lastPlatformX + randomBetween(-120, 120), 40, WIDTH - 40);
  const support = supports[Math.floor(Math.random() * supports.length)];
  const reach = horizontalReachForGap(y - support.y, difficulty) * .9;
  return clampNumber(support.x + randomBetween(-reach, reach), 40, WIDTH - 40);
}

// Kept temporarily as a reference while the field generator is play-tested.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function generateWorldLegacy(state: GameState, targetY: number) {
  while (state.generatedTo < targetY) {
    const meters = heightMeters(state.generatedTo);
    const scoreAtHeight = meters + state.bonusHoney;
    const stage = scoreAtHeight < 300 ? 0 : scoreAtHeight < 600 ? 1 : scoreAtHeight < 1200 ? 2 : scoreAtHeight < 3000 ? 3 : scoreAtHeight < 4500 ? 4 : 5;
    const difficulty = [0, .18, .38, .62, .82, 1][stage];
    const step = state.routeStep;
    if (state.sceneRemaining <= 0) chooseRouteScene(state, stage);
    const scene = state.routePattern;
    const sceneStep = state.sceneProgress;
    const sceneGapRanges: Array<[number, number]> = [
      [66 + stage, 94 + stage * 2],
      [94 + stage * 2, 140 + stage * 3],
      [108 + stage * 2, 158 + stage * 3],
      [stage < 2 ? 176 + stage * 10 : 196 + stage * 4, stage < 2 ? 228 + stage * 10 : 246 + stage * 3],
      [112 + stage * 2, 164 + stage * 3],
      [72 + stage, 106 + stage * 2],
      [138 + stage * 3, 204 + stage * 4],
    ];
    const [gapMin, gapMax] = sceneGapRanges[scene];
    let gap = randomBetween(gapMin, Math.min(gapMax, 268));
    const springFlight = state.springTargetY > state.generatedTo;
    const springLanding = springFlight && state.generatedTo + gap >= state.springTargetY;
    if (springLanding) gap = state.springTargetY - state.generatedTo;
    const y = state.generatedTo + gap;
    const previousX = state.lastPlatformX;
    const cornerRange: [number, number] = state.routeDirection < 0 ? [40, 168] : [WIDTH - 168, WIDTH - 40];
    const preferredRange = scene === 4
      ? cornerRange
      : scene === 3 && Math.random() < .42
        ? (Math.random() < .5 ? [40, 182] as [number, number] : [WIDTH - 182, WIDTH - 40] as [number, number])
        : undefined;
    let x = nextFieldX(state, y, difficulty, preferredRange);

    let kind: PlatformKind = "flower";
    const springIntervals = [999, 21, 19, 17, 15, 14];
    const springReady = stage >= 1 && step - state.lastSpringStep >= springIntervals[stage];
    const rocketReady = y >= state.nextRocketY;
    const copterReady = y >= state.nextCopterY;
    const sceneSpring = scene === 5 && sceneStep >= 2 && Math.random() < .24;
    if ((sceneSpring || (springReady && scene !== 3 && sceneStep >= 2 && Math.random() < .2)) && !rocketReady && !copterReady && state.springTargetY <= state.generatedTo) {
      kind = "spring";
      state.lastSpringStep = step;
    } else if (meters > 120 && stage >= 1 && (scene === 2 || scene === 4) && Math.random() < .32) {
      kind = "cloud";
    } else if (stage >= 2 && scene === 1 && Math.random() < .18) {
      kind = "moving";
    } else if (stage >= 3 && scene === 6 && Math.random() < .22) {
      kind = "fading";
    }

    if (springLanding) {
      x = state.springTargetX;
      kind = stage >= 3 ? "cloud" : "flower";
      state.springTargetY = -1;
    }

    let width = Math.max(46, 80 - difficulty * 25 + randomBetween(-6, 7));
    if (scene === 0 || scene === 5) width += 4;
    if (scene === 3 || scene === 6) width -= 3;
    if (kind === "spring") width = Math.max(width, 76);
    if (kind === "cloud") width = Math.max(50, 72 - difficulty * 20 + Math.random() * 6);
    if (springLanding) width = 84;
    if (state.rocketRecoveryY > 0 && y >= state.rocketRecoveryY) {
      x = state.rocketRecoveryX;
      width = 88;
      kind = "flower";
      state.rocketRecoveryY = 0;
    } else if (state.copterRecoveryY > 0 && y >= state.copterRecoveryY) {
      x = state.copterRecoveryX;
      width = 84;
      kind = "flower";
      state.copterRecoveryY = 0;
    }
    state.platforms = state.platforms.filter((existing) => (
      existing.route !== "risk"
      || !platformPlacementOverlaps([existing], x, y, width)
    ));
    const platform: Platform = { id: state.nextId++, x, y, width, kind, used: false, breaking: 0 };
    if (kind === "moving" || kind === "cloud") {
      platform.baseX = x;
      platform.range = springLanding ? 38 : Math.min(82, 44 + difficulty * 38);
      platform.speed = 1 + difficulty * .45 + Math.random() * .5;
      platform.phase = Math.random() * Math.PI * 2;
    }
    if (kind === "spring") {
      state.springTargetY = y + randomBetween(570, 620);
      state.springTargetX = x;
    }
    state.platforms.push(platform);

    const extraCount = springLanding || meters < 80 ? 0
      : scene === 0 ? (Math.random() < .58 ? 2 : 1)
      : scene === 1 ? (Math.random() < .38 ? 2 : 1)
      : scene === 4 ? 1
      : scene === 5 ? (Math.random() < .48 ? 1 : 0)
      : scene === 2 ? (Math.random() < .56 ? 1 : 0)
      : scene === 6 ? (Math.random() < .46 ? 1 : 0)
      : (Math.random() < .1 ? 1 : 0);
    const makePrimaryBroken = meters > 110
      && kind === "flower"
      && extraCount > 0
      && Math.random() < [.18, .28, .36, .43, .5, .56][stage];
    let safeExtraAdded = false;
    for (let extraIndex = 0; extraIndex < extraCount; extraIndex += 1) {
      const extraRoll = Math.random();
      let extraKind: PlatformKind = "flower";
      const brokenRate = [.36, .5, .56, .61, .66, .7][stage];
      const normalRate = scene === 0 ? .78
        : scene === 1 ? .7
        : scene === 4 ? .52
        : scene === 5 ? .66
        : scene === 2 ? .45
        : scene === 6 ? .3
        : .22;
      const mustBeSafe = makePrimaryBroken && !safeExtraAdded;
      if (mustBeSafe || extraRoll < normalRate) extraKind = "flower";
      else if (meters > 90 && extraRoll < Math.max(normalRate, brokenRate)) extraKind = "broken";
      else if (stage >= 2 && extraRoll < brokenRate + .12) extraKind = Math.random() < .5 ? "moving" : "cloud";
      else if (stage >= 3 && extraRoll < brokenRate + .18) extraKind = "fading";
      const extraWidth = extraKind === "broken"
        ? Math.max(44, 62 - difficulty * 13)
        : Math.max(44, width - randomBetween(6, 14));
      let extraY = y + randomBetween(-48, 24);
      const forkRange: [number, number] | undefined = scene === 1
        ? (x < WIDTH / 2 ? [WIDTH / 2 + 24, WIDTH - 42] : [42, WIDTH / 2 - 24])
        : scene === 4 ? cornerRange : undefined;
      let extraX = extraKind === "broken"
        ? randomBetween(44, WIDTH - 44)
        : nextFieldX(state, extraY, difficulty, forkRange);
      let tries = 0;
      while (tries < 14 && platformPlacementOverlaps(state.platforms, extraX, extraY, extraWidth)) {
        extraY = y + randomBetween(-48, 24);
        extraX = extraKind === "broken"
          ? randomBetween(44, WIDTH - 44)
          : nextFieldX(state, extraY, difficulty, forkRange);
        tries += 1;
      }
      if (platformPlacementOverlaps(state.platforms, extraX, extraY, extraWidth)) continue;
      const extraPlatform: Platform = {
        id: state.nextId++,
        x: extraX,
        y: extraY,
        width: extraWidth,
        kind: extraKind,
        used: false,
        breaking: 0,
        route: extraKind === "broken" ? "risk" : undefined,
      };
      if (extraKind === "moving" || extraKind === "cloud") {
        extraPlatform.baseX = extraX;
        extraPlatform.range = 34 + difficulty * 38;
        extraPlatform.speed = .9 + difficulty * .45 + Math.random() * .4;
        extraPlatform.phase = Math.random() * Math.PI * 2;
      }
      state.platforms.push(extraPlatform);
      if (extraKind !== "broken") safeExtraAdded = true;
    }
    if (makePrimaryBroken && safeExtraAdded) {
      platform.kind = "broken";
      platform.route = "risk";
    }

    const addDangerOnlyBait = !springLanding
      && meters > 110
      && (scene === 6 || (scene === 3 && gap > 190))
      && Math.random() < .46;
    if (addDangerOnlyBait) {
      const baitY = state.generatedTo + gap * randomBetween(.38, .58);
      const baitWidth = Math.max(42, 58 - difficulty * 10);
      let baitX = randomBetween(46, WIDTH - 46);
      let tries = 0;
      while (tries < 12 && platformPlacementOverlaps(state.platforms, baitX, baitY, baitWidth)) {
        baitX = randomBetween(46, WIDTH - 46);
        tries += 1;
      }
      if (!platformPlacementOverlaps(state.platforms, baitX, baitY, baitWidth)) {
        state.platforms.push({
          id: state.nextId++,
          x: baitX,
          y: baitY,
          width: baitWidth,
          kind: "broken",
          used: false,
          breaking: 0,
          route: "risk",
        });
      }
    }

    const rewardStep = sceneStep >= 2 && (scene === 1 || scene === 3 || scene === 6 || Math.random() < .18);
    if (meters > 45 && rewardStep && step - state.lastJarStep >= Math.round(8 - difficulty) && !rocketReady && !copterReady) {
      const outward = x < WIDTH / 2 ? 1 : -1;
      const rewardRisk = scene === 3 || scene === 6;
      const jarX = Math.max(38, Math.min(WIDTH - 38, x + outward * (rewardRisk ? 76 : 48)));
      state.airItems.push({ id: state.nextId++, x: jarX, y: y + 48, kind: "honeyJar", used: false, value: rewardRisk ? 100 : 50 });
      state.lastJarStep = step;
    }

    const hazardGap = [11, 10, 9, 8, 7, 6][stage];
    const earlyHazard = meters > 90 && (
      (scene === 1 && sceneStep >= 2)
      || (scene === 0 && sceneStep >= 3 && Math.random() < .28)
      || (scene === 5 && sceneStep >= 3 && Math.random() < .2)
    );
    const routeHazard = earlyHazard || (
      stage >= 1 && (
        (scene === 2 && sceneStep >= 2)
        || (scene === 4 && sceneStep % 2 === 1)
        || (scene === 6 && sceneStep >= 1)
        || (scene === 3 && stage >= 3 && Math.random() < .25)
      )
    );
    if (!rocketReady && !copterReady && routeHazard && step - state.lastHazardStep >= hazardGap) {
      const webReady = meters > 160;
      const hazardRoll = Math.random();
      let hazardKind: AirKind = "bear";
      if (stage >= 3 && meters > 900 && hazardRoll < .14) hazardKind = "blackHole";
      else if (stage >= 2 && meters > 480 && hazardRoll < .33) hazardKind = "bat";
      else if (stage >= 1 && meters > 260 && hazardRoll < .52) hazardKind = "hornet";
      else if (webReady && (scene === 3 || scene === 6 || step % 3 === 0 || hazardRoll < .72)) hazardKind = "web";
      const corridorX = (previousX + x) / 2;
      const blocksCorridor = scene === 4 || scene === 6 || Math.random() < .62;
      let itemX = blocksCorridor ? corridorX + randomBetween(-30, 30) : randomBetween(52, WIDTH - 52);
      itemX = Math.max(44, Math.min(WIDTH - 44, itemX));
      const item: AirItem = { id: state.nextId++, x: itemX, y: state.generatedTo + gap * randomBetween(.44, .62), kind: hazardKind, used: false };
      if (hazardKind === "bear" || hazardKind === "hornet" || hazardKind === "bat") {
        item.baseX = itemX;
        item.range = hazardKind === "bear" ? 38 + difficulty * 34 : 54 + difficulty * 42;
        item.speed = hazardKind === "bear" ? .9 + difficulty * .4 : 1.35 + difficulty * .7;
        item.phase = Math.random() * Math.PI * 2;
      }
      state.airItems.push(item);
      state.lastHazardStep = step;
    }

    if (rocketReady && kind === "flower") {
      state.airItems.push({ id: state.nextId++, x, y: y + 57, kind: "rocket", used: false });
      state.rocketRecoveryY = y + ROCKET_RECOVERY_DISTANCE;
      state.rocketRecoveryX = Math.max(86, Math.min(WIDTH - 86, x));
      state.nextRocketY += ROCKET_INTERVAL_WORLD;
    } else if (copterReady && kind === "flower") {
      state.airItems.push({ id: state.nextId++, x, y: y + 48, kind: "bambooCopter", used: false });
      state.copterRecoveryY = y + COPTER_RECOVERY_DISTANCE;
      state.copterRecoveryX = Math.max(82, Math.min(WIDTH - 82, x));
      state.nextCopterY += COPTER_INTERVAL_WORLD;
    }

    state.generatedTo = y;
    state.lastPlatformX = x;
    state.routeStep += 1;
    state.sceneRemaining -= 1;
    state.sceneProgress += 1;
  }
}

function isLandingPlatform(platform: Platform) {
  return platform.kind !== "broken" && platform.breaking < .38;
}

function canJumpBetween(from: Platform, to: Platform, difficulty: number) {
  const verticalGap = to.y - from.y;
  if (verticalGap <= 34 || verticalGap >= 278) return false;
  const directDistance = Math.abs(to.x - from.x);
  const wrappedDistance = WIDTH - directDistance;
  const landingAllowance = Math.min(28, (from.width + to.width) * .18);
  return Math.min(directDistance, wrappedDistance) <= horizontalReachForGap(verticalGap, difficulty) + landingAllowance;
}

function reachablePlatforms(starts: Platform[], field: Platform[], difficulty: number) {
  const reachable = starts.filter(isLandingPlatform);
  const sorted = [...field].sort((a, b) => a.y - b.y);
  for (const candidate of sorted) {
    if (!isLandingPlatform(candidate)) continue;
    if (reachable.some((support) => canJumpBetween(support, candidate, difficulty))) reachable.push(candidate);
  }
  return reachable;
}

// Previous chunk-and-row generator kept for side-by-side tuning.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function generateWorldChunkedReference(state: GameState, targetY: number) {
  while (state.generatedTo < targetY) {
    const chunkBottom = state.generatedTo;
    const meters = heightMeters(chunkBottom);
    const stage = progressionStageAtHeight(meters);
    const difficulty = linearDifficultyAtHeight(meters);
    chooseRouteScene(state, stage);
    const scene = state.routePattern;
    const chunkHeight = randomBetween(760, 840);
    const chunkTop = chunkBottom + chunkHeight;
    const field: Platform[] = [];

    const pushPlatform = (x: number, y: number, width: number, kind: PlatformKind) => {
      const platform: Platform = {
        id: state.nextId++,
        x: clampNumber(x, width / 2 + 8, WIDTH - width / 2 - 8),
        y,
        width,
        kind,
        used: false,
        breaking: 0,
      };
      if (kind === "moving" || kind === "cloud") {
        platform.baseX = platform.x;
        platform.range = 34 + difficulty * 42;
        platform.speed = .9 + difficulty * .5 + Math.random() * .45;
        platform.phase = Math.random() * Math.PI * 2;
      }
      field.push(platform);
      return platform;
    };

    const addRecoveryPlatform = (recoveryY: number, recoveryX: number, clear: () => void) => {
      if (recoveryY <= 0 || recoveryY > chunkTop) return;
      const y = Math.max(chunkBottom + 62, recoveryY);
      field.splice(0, field.length, ...field.filter((platform) => !platformPlacementOverlaps([platform], recoveryX, y, 84)));
      pushPlatform(recoveryX, y, 84, "flower");
      clear();
    };

    addRecoveryPlatform(state.springTargetY, state.springTargetX, () => { state.springTargetY = -1; });
    addRecoveryPlatform(state.rocketRecoveryY, state.rocketRecoveryX, () => { state.rocketRecoveryY = 0; });
    addRecoveryPlatform(state.copterRecoveryY, state.copterRecoveryX, () => { state.copterRecoveryY = 0; });

    const zoneGapRanges: Array<[number, number]> = [
      [66 + difficulty * 18, 90 + difficulty * 24],
      [82 + difficulty * 26, 116 + difficulty * 36],
      [88 + difficulty * 28, 124 + difficulty * 40],
      [122 + difficulty * 24, 174 + difficulty * 56],
      [96 + difficulty * 28, 136 + difficulty * 42],
      [76 + difficulty * 22, 108 + difficulty * 34],
      [108 + difficulty * 28, 154 + difficulty * 54],
    ];
    const supports = state.platforms.filter((platform) => (
      isLandingPlatform(platform)
      && platform.y <= chunkBottom + 18
      && platform.y > chunkBottom - 320
    ));
    if (supports.length === 0) {
      supports.push({
        id: -1,
        x: state.lastPlatformX,
        y: chunkBottom,
        width: 72,
        kind: "flower",
        used: true,
        breaking: 0,
      });
    }

    let reachable = reachablePlatforms(supports, field, difficulty);
    const [gapMin, gapMax] = zoneGapRanges[scene];
    // 原版大多数高度只有一个平台；选择来自一次跳跃可跨过的前方2～3个平台，
    // 而不是在同一高度整齐摆放两三块平台。
    const optionBase = [1.34, 1.24, 1.16, 1.03, 1.12, 1.26, 1.06][scene];
    const minimumOptions = 1;
    const cornerSide = state.routeDirection < 0 ? -1 : 1;
    let rowY = chunkBottom + randomBetween(82, 112);
    let rowIndex = 0;

    const randomFieldX = (optionIndex: number) => {
      if (scene === 1 && Math.random() < .78) {
        const leftSide = (rowIndex + optionIndex) % 2 === 0;
        return leftSide ? randomBetween(42, 196) : randomBetween(WIDTH - 196, WIDTH - 42);
      }
      if (scene === 4 && Math.random() < .72) {
        return cornerSide < 0 ? randomBetween(42, 188) : randomBetween(WIDTH - 188, WIDTH - 42);
      }
      return randomBetween(42, WIDTH - 42);
    };

    while (rowY < chunkTop - 44 && rowIndex < 10) {
      const optionFloat = Math.max(1, optionBase - difficulty * .58);
      let safeCount = Math.floor(optionFloat) + (Math.random() < optionFloat % 1 ? 1 : 0);
      safeCount = clampNumber(safeCount, minimumOptions, 3);
      if (scene === 3 || scene === 6) safeCount = 1;

      const rowPlatforms: Platform[] = [];
      for (let optionIndex = 0; optionIndex < safeCount; optionIndex += 1) {
        const y = rowY + randomBetween(-20, 20);
        const sourcePool = reachable.filter((platform) => {
          const gap = y - platform.y;
          return gap > 38 && gap < 274;
        });
        if (sourcePool.length === 0) continue;

        const widthBonus = scene === 0 ? 8 : scene === 3 || scene === 6 ? -3 : 0;
        const width = Math.max(52, 92 - difficulty * 32 + widthBonus + randomBetween(-7, 7));
        let x = randomFieldX(optionIndex);
        let placed = false;
        for (let tries = 0; tries < 28; tries += 1) {
          const candidate: Platform = { id: -1, x, y, width, kind: "flower", used: false, breaking: 0 };
          const reachableFromField = sourcePool.some((source) => canJumpBetween(source, candidate, difficulty));
          const separatedFromRow = rowPlatforms.every((platform) => Math.abs(platform.x - x) > 104);
          if (reachableFromField && separatedFromRow && !platformPlacementOverlaps(field, x, y, width)) {
            placed = true;
            break;
          }
          x = randomFieldX(optionIndex + tries + 1);
        }

        if (!placed) {
          const source = sourcePool[Math.floor(Math.random() * sourcePool.length)];
          const reach = horizontalReachForGap(y - source.y, difficulty) * .72;
          for (let tries = 0; tries < 16; tries += 1) {
            x = clampNumber(source.x + randomBetween(-reach, reach), width / 2 + 8, WIDTH - width / 2 - 8);
            if (!platformPlacementOverlaps(field, x, y, width)) {
              placed = true;
              break;
            }
          }
        }
        if (!placed) continue;

        let kind: PlatformKind = "flower";
        const movingChance = scene === 2 ? .28 + difficulty * .18 : .025 + difficulty * .07;
        if (stage >= 1 && Math.random() < movingChance) kind = Math.random() < .56 ? "moving" : "cloud";
        else if (stage >= 3 && Math.random() < .025 + difficulty * .07) kind = "fading";
        const platform = pushPlatform(x, y, width, kind);
        rowPlatforms.push(platform);
      }

      reachable = reachablePlatforms(supports, field, difficulty);

      // 破碎花从开局即可出现，但只作为额外的诱导落点，绝不替换本行唯一的安全花。
      const brokenChance = .13 + difficulty * .27 + (scene === 6 ? .1 : 0);
      if (Math.random() < brokenChance) {
        const brokenWidth = Math.max(46, 64 - difficulty * 12 + randomBetween(-5, 5));
        for (let tries = 0; tries < 18; tries += 1) {
          const brokenX = randomBetween(brokenWidth / 2 + 8, WIDTH - brokenWidth / 2 - 8);
          const brokenY = rowY + randomBetween(-34, 34);
          if (!platformPlacementOverlaps(field, brokenX, brokenY, brokenWidth)) {
            pushPlatform(brokenX, brokenY, brokenWidth, "broken");
            break;
          }
        }
      }

      const nextGap = randomBetween(gapMin, gapMax);
      rowY += Math.min(246, nextGap);
      rowIndex += 1;
    }

    // 极端随机情况下补一组顶部出口；出口来自当前整个可达前沿，而非固定主路线。
    reachable = reachablePlatforms(supports, field, difficulty);
    const highestReachable = Math.max(...reachable.map((platform) => platform.y));
    if (highestReachable < chunkTop - 150) {
      const topY = Math.min(chunkTop - 72, highestReachable + randomBetween(118, 176));
      const sources = reachable.filter((platform) => topY - platform.y > 38 && topY - platform.y < 274);
      const source = sources[Math.floor(Math.random() * sources.length)];
      if (source) {
        const width = Math.max(56, 88 - difficulty * 28);
        const reach = horizontalReachForGap(topY - source.y, difficulty) * .7;
        const x = clampNumber(source.x + randomBetween(-reach, reach), width / 2 + 8, WIDTH - width / 2 - 8);
        pushPlatform(x, topY, width, "flower");
      }
    }

    if (meters < 120 && !field.some((platform) => platform.kind === "broken")) {
      const brokenWidth = 62;
      for (let tries = 0; tries < 20; tries += 1) {
        const x = randomBetween(42, WIDTH - 42);
        const y = randomBetween(chunkBottom + 150, chunkTop - 130);
        if (!platformPlacementOverlaps(field, x, y, brokenWidth)) {
          pushPlatform(x, y, brokenWidth, "broken");
          break;
        }
      }
    }

    reachable = reachablePlatforms(supports, field, difficulty);
    const safeField = field.filter((platform) => isLandingPlatform(platform) && reachable.some((reachablePlatform) => reachablePlatform.id === platform.id));
    const springIntervals = [14, 18, 17, 16, 15, 14];
    if (
      state.springTargetY <= chunkBottom
      && state.routeStep - state.lastSpringStep >= springIntervals[stage]
      && chunkTop < state.nextRocketY
      && chunkTop < state.nextCopterY
    ) {
      const springCandidates = safeField.filter((platform) => (
        platform.kind === "flower"
        && platform.y > chunkTop - 520
        && platform.y < chunkTop - 250
      ));
      const spring = springCandidates[Math.floor(Math.random() * springCandidates.length)];
      if (spring) {
        spring.kind = "spring";
        spring.width = Math.max(72, spring.width);
        state.springTargetY = spring.y + randomBetween(570, 610);
        state.springTargetX = spring.x;
        state.lastSpringStep = state.routeStep;
      }
    }

    const placeBoost = (kind: "rocket" | "bambooCopter", threshold: number) => {
      if (threshold > chunkTop) return false;
      const candidates = safeField.filter((platform) => platform.kind === "flower" && platform.y >= threshold - 180);
      const platform = candidates[Math.floor(Math.random() * candidates.length)];
      if (!platform) return false;
      state.airItems.push({
        id: state.nextId++,
        x: platform.x,
        y: platform.y + (kind === "rocket" ? 57 : 48),
        kind,
        used: false,
      });
      if (kind === "rocket") {
        state.rocketRecoveryY = platform.y + ROCKET_RECOVERY_DISTANCE;
        state.rocketRecoveryX = platform.x;
        state.nextRocketY += ROCKET_INTERVAL_WORLD;
      } else {
        state.copterRecoveryY = platform.y + COPTER_RECOVERY_DISTANCE;
        state.copterRecoveryX = platform.x;
        state.nextCopterY += COPTER_INTERVAL_WORLD;
      }
      return true;
    };
    const rocketPlaced = placeBoost("rocket", state.nextRocketY);
    if (!rocketPlaced) placeBoost("bambooCopter", state.nextCopterY);

    if (meters > 45 && safeField.length > 0 && Math.random() < .72) {
      const jarPlatform = safeField[Math.floor(Math.random() * safeField.length)];
      const value = scene === 3 || scene === 6 ? 100 : 50;
      state.airItems.push({
        id: state.nextId++,
        x: jarPlatform.x,
        y: jarPlatform.y + 48,
        kind: "honeyJar",
        used: false,
        value,
      });
    }

    const hazardChance = .08 + difficulty * .34 + (scene === 6 ? .12 : 0);
    const hazardCount = meters < 260 || scene === 3
      ? 0
      : Math.random() < hazardChance
        ? 1 + (difficulty > .72 && Math.random() < difficulty * .18 ? 1 : 0)
        : 0;
    for (let index = 0; index < hazardCount; index += 1) {
      const hazardRoll = Math.random();
      let kind: AirKind = "bear";
      if (stage >= 3 && meters > 900 && hazardRoll < .14) kind = "blackHole";
      else if (stage >= 2 && meters > 480 && hazardRoll < .34) kind = "bat";
      else if (stage >= 1 && meters > 260 && hazardRoll < .54) kind = "hornet";
      else if (meters > 420 && hazardRoll < .76) kind = "web";
      const lower = safeField[Math.floor(Math.random() * safeField.length)];
      const upperCandidates = lower
        ? safeField.filter((platform) => platform.y > lower.y + 54 && platform.y < lower.y + 250)
        : [];
      const upper = upperCandidates[Math.floor(Math.random() * upperCandidates.length)];
      const x = lower && upper
        ? clampNumber((lower.x + upper.x) / 2 + randomBetween(-42, 42), 48, WIDTH - 48)
        : randomBetween(48, WIDTH - 48);
      const item: AirItem = {
        id: state.nextId++,
        x,
        y: lower && upper ? (lower.y + upper.y) / 2 : randomBetween(chunkBottom + 150, chunkTop - 90),
        kind,
        used: false,
      };
      if (kind === "bear" || kind === "hornet" || kind === "bat") {
        item.baseX = x;
        item.range = kind === "bear" ? 38 + difficulty * 34 : 54 + difficulty * 42;
        item.speed = kind === "bear" ? .9 + difficulty * .4 : 1.35 + difficulty * .7;
        item.phase = Math.random() * Math.PI * 2;
      }
      state.airItems.push(item);
      state.lastHazardStep = state.routeStep;
    }

    state.platforms.push(...field);
    const topReachable = [...reachablePlatforms(supports, field, difficulty)].sort((a, b) => b.y - a.y)[0];
    if (topReachable) state.lastPlatformX = topReachable.x;
    state.generatedTo = chunkTop;
    state.routeStep += field.length;
    state.sceneRemaining = 0;
    state.sceneProgress = 0;
  }
}

/**
 * Video-matched scatter-field generator.
 *
 * The reference run does not read as a route made of rows. It starts with
 * roughly 15–20 visible boards, then steadily thins to 5–8 boards, mixing
 * short clusters with open pockets. Every platform is selected from a recent
 * reachable frontier, so the field stays possible without drawing a single
 * obvious zig-zag path through the screen.
 */
function generateWorld(state: GameState, targetY: number) {
  while (state.generatedTo < targetY) {
    const segmentBottom = state.generatedTo;
    // All unlocks use the same value the player sees: climbed height plus
    // collected honey and monster rewards. This keeps content from lagging
    // hundreds of points behind the HUD score.
    const meters = heightMeters(segmentBottom) + state.bonusHoney;
    const stage = progressionStageAtHeight(meters);
    const difficulty = linearDifficultyAtHeight(meters);
    const segmentHeight = randomBetween(900, 1080);
    const segmentTop = segmentBottom + segmentHeight;
    const field: Platform[] = [];

    // 0 dense pocket, 1 normal scatter, 2 sparse pocket, 3 edge pocket,
    // 4 moving-board pocket. Never repeat a sparse pocket directly.
    const profileRoll = Math.random();
    let profile = 1;
    // The opening must teach steering before asking for precision. Sparse and
    // edge-biased fields therefore unlock gradually instead of being selected
    // by the global difficulty value during the first few hundred points.
    if (profileRoll < .27 - difficulty * .1) profile = 0;
    else if (meters > 1500 && profileRoll < .38 + difficulty * .08) profile = 2;
    else if (meters > 1100 && profileRoll < .5 + difficulty * .08) profile = 3;
    else if (meters > 800 && profileRoll < .66 + difficulty * .08) profile = 4;
    if (profile === 2 && state.routePattern === 2) profile = Math.random() < .5 ? 0 : 1;
    state.routePattern = profile;

    const pushPlatform = (x: number, y: number, width: number, kind: PlatformKind) => {
      const platform: Platform = {
        id: state.nextId++,
        x: clampNumber(x, width / 2 + 7, WIDTH - width / 2 - 7),
        y,
        width,
        kind,
        used: false,
        breaking: 0,
      };
      if (kind === "moving" || kind === "cloud") {
        platform.baseX = platform.x;
        platform.range = 38 + difficulty * 44;
        platform.speed = .82 + difficulty * .52 + Math.random() * .34;
        platform.phase = Math.random() * Math.PI * 2;
      }
      field.push(platform);
      return platform;
    };

    const addRecoveryPlatform = (recoveryY: number, recoveryX: number, clear: () => void) => {
      if (recoveryY <= 0 || recoveryY > segmentTop) return;
      const y = Math.max(segmentBottom + 60, recoveryY);
      field.splice(0, field.length, ...field.filter((platform) => (
        Math.abs(platform.y - y) >= 42
        || Math.abs(platform.x - recoveryX) >= (platform.width + 78) / 2 + 18
      )));
      pushPlatform(recoveryX, y, PLATFORM_WIDTH, "flower");
      clear();
    };

    addRecoveryPlatform(state.springTargetY, state.springTargetX, () => { state.springTargetY = -1; });
    addRecoveryPlatform(state.rocketRecoveryY, state.rocketRecoveryX, () => { state.rocketRecoveryY = 0; });
    addRecoveryPlatform(state.copterRecoveryY, state.copterRecoveryX, () => { state.copterRecoveryY = 0; });

    const supports = state.platforms.filter((platform) => (
      isLandingPlatform(platform)
      && platform.y <= segmentBottom + 24
      && platform.y > segmentBottom - 380
    ));
    if (supports.length === 0) {
      supports.push({
        id: -1,
        x: state.lastPlatformX,
        y: segmentBottom,
        width: PLATFORM_WIDTH,
        kind: "flower",
        used: true,
        breaking: 0,
      });
    }

    const reachableNow = () => reachablePlatforms(supports, field, difficulty);
    // Route geometry uses its own slow, continuous ramp. At 277 points the
    // player is still in the generous opening band; the largest gaps only
    // arrive after several thousand points.
    const routeProgress = clampNumber(meters / 3200, 0, 1);
    const profileGapScale = profile === 0 ? .8 : profile === 2 ? 1.08 : profile === 3 ? 1.02 : profile === 4 ? .94 : 1;
    const baseGapMin = (46 + routeProgress * 48) * profileGapScale;
    const baseGapMax = (66 + routeProgress * 76) * profileGapScale;
    const maxRouteGap = (78 + routeProgress * 74) * (profile === 2 ? 1.04 : 1);
    let y = segmentBottom + randomBetween(baseGapMin, baseGapMax);
    let mainCount = 0;

    const randomScatterX = () => {
      if (profile === 3 && Math.random() < .78) {
        const left = Math.random() < .5;
        return left ? randomBetween(34, 166) : randomBetween(WIDTH - 166, WIDTH - 34);
      }
      return randomBetween(34, WIDTH - 34);
    };

    // Only progression platforms count toward this guard. Previously branch
    // and broken decorations consumed the same limit, ending generation early
    // and leaving the rest of a segment as an impossible empty screen.
    while (y < segmentTop - 46 && mainCount < 30) {
      const reachable = reachableNow();
      const sourcePool = reachable.filter((platform) => {
        const gap = y - platform.y;
        return gap > 34 && gap < 284;
      });
      const width = PLATFORM_WIDTH;
      let x = randomScatterX();
      let placed = false;

      for (let tries = 0; tries < 34; tries += 1) {
        const candidate: Platform = { id: -1, x, y, width, kind: "flower", used: false, breaking: 0 };
        const hasEntrance = sourcePool.some((source) => canJumpBetween(source, candidate, difficulty));
        const doesNotTraceLast = mainCount < 2 || Math.abs(x - state.lastPlatformX) > 28 || tries > 14;
        if (hasEntrance && doesNotTraceLast && !platformPlacementOverlaps(field, x, y, width)) {
          placed = true;
          break;
        }
        x = randomScatterX();
      }

      if (!placed && sourcePool.length > 0) {
        const source = sourcePool[Math.floor(Math.random() * sourcePool.length)];
        const reach = horizontalReachForGap(y - source.y, difficulty) * .76;
        for (let tries = 0; tries < 18; tries += 1) {
          x = clampNumber(source.x + randomBetween(-reach, reach), width / 2 + 7, WIDTH - width / 2 - 7);
          if (!platformPlacementOverlaps(field, x, y, width)) {
            placed = true;
            break;
          }
        }
      }

      if (!placed) {
        const highest = [...reachable].sort((a, b) => b.y - a.y)[0];
        if (!highest) break;
        y = highest.y + randomBetween(maxRouteGap * .72, maxRouteGap * .92);
        continue;
      }

      let kind: PlatformKind = "flower";
      const movingRate = profile === 4 ? .34 + difficulty * .15 : .025 + difficulty * .11;
      if (meters >= 250 && !state.introduced.moving) {
        kind = "moving";
        state.introduced.moving = true;
      } else if (meters >= state.nextWindFlowerScore) {
        kind = "windFlower";
        state.nextWindFlowerScore += randomBetween(480, 680);
      } else if (meters >= 250 && Math.random() < movingRate) {
        kind = "moving";
        state.introduced.moving = true;
      } else if (meters >= 1200 && (!state.introduced.fading || Math.random() < .025 + difficulty * .1)) {
        kind = "fading";
        state.introduced.fading = true;
      }
      const main = pushPlatform(x, y, width, kind);
      state.lastPlatformX = main.x;
      mainCount += 1;

      // Alternate landing points are offset in both axes, never visually stacked.
      const branchChance = profile === 0
        ? .58 - routeProgress * .22
        : profile === 2 ? .08
          : .42 - routeProgress * .2;
      if (Math.random() < branchChance) {
        const branchY = y + randomBetween(38, 74);
        const branchWidth = PLATFORM_WIDTH;
        const branchSources = reachableNow().filter((platform) => {
          const gap = branchY - platform.y;
          return gap > 34 && gap < 284;
        });
        for (let tries = 0; tries < 24; tries += 1) {
          const branchX = randomScatterX();
          const candidate: Platform = { id: -1, x: branchX, y: branchY, width: branchWidth, kind: "flower", used: false, breaking: 0 };
          const separate = Math.abs(branchX - x) > 116;
          if (
            separate
            && branchSources.some((source) => canJumpBetween(source, candidate, difficulty))
            && !platformPlacementOverlaps(field, branchX, branchY, branchWidth)
          ) {
            const branchMoving = meters > 650 && profile === 4 && Math.random() < .38;
            pushPlatform(branchX, branchY, branchWidth, branchMoving ? "moving" : "flower");
            break;
          }
        }
      }

      // Broken boards are tempting extra targets from the beginning, as in the
      // reference, but never replace the only reachable solid board.
      if (Math.random() < .2 + difficulty * .17) {
        const brokenWidth = PLATFORM_WIDTH;
        for (let tries = 0; tries < 18; tries += 1) {
          const brokenX = randomBetween(34, WIDTH - 34);
          const brokenY = y + randomBetween(-44, 66);
          if (!platformPlacementOverlaps(field, brokenX, brokenY, brokenWidth)) {
            pushPlatform(brokenX, brokenY, brokenWidth, "broken");
            break;
          }
        }
      }

      let nextGap = randomBetween(baseGapMin, baseGapMax);
      if (profile === 0 && Math.random() < .32) nextGap *= randomBetween(.65, .82);
      if (profile === 2 && Math.random() < .42) nextGap *= randomBetween(1.08, 1.22);
      y += clampNumber(nextGap, 42, maxRouteGap);
    }

    // Audit the upper end of every segment. Keep inserting reachable solid
    // landings until no unplayable blank band remains. This also makes segment
    // boundaries invisible to the player instead of producing random cliffs.
    let reachable = reachableNow();
    const coverageTargetY = segmentTop - 42;
    for (let guard = 0; guard < 18; guard += 1) {
      const source = [...reachable].sort((a, b) => b.y - a.y)[0];
      if (!source || coverageTargetY - source.y <= maxRouteGap) break;

      const remaining = coverageTargetY - source.y;
      const bridgeGap = Math.min(
        remaining,
        randomBetween(maxRouteGap * .7, maxRouteGap * .88),
      );
      const bridgeY = source.y + bridgeGap;
      const bridgeWidth = PLATFORM_WIDTH;
      const reach = horizontalReachForGap(bridgeGap, difficulty) * .68;
      let placed = false;

      for (let tries = 0; tries < 28; tries += 1) {
        const bridgeX = clampNumber(
          source.x + randomBetween(-reach, reach),
          bridgeWidth / 2 + 7,
          WIDTH - bridgeWidth / 2 - 7,
        );
        if (!platformPlacementOverlaps(field, bridgeX, bridgeY, bridgeWidth)) {
          pushPlatform(bridgeX, bridgeY, bridgeWidth, "flower");
          placed = true;
          break;
        }
      }

      if (!placed) break;
      reachable = reachableNow();
    }

    reachable = reachableNow();
    const safeField = field.filter((platform) => (
      isLandingPlatform(platform)
      && reachable.some((reachablePlatform) => reachablePlatform.id === platform.id)
    ));

    // Springs are visible from the opening screen and recur more often than
    // powered flight, matching the reference video's readable risk/reward mix.
    const springIntervals = [10, 12, 13, 14, 14, 15];
    if (
      state.springTargetY <= segmentBottom
      && state.routeStep - state.lastSpringStep >= springIntervals[stage]
      && segmentTop < state.nextRocketY
      && segmentTop < state.nextCopterY
    ) {
      const springCandidates = safeField.filter((platform) => (
        platform.kind === "flower"
        && platform.y > segmentBottom + 170
        && platform.y < segmentTop - 270
      ));
      const spring = springCandidates[Math.floor(Math.random() * springCandidates.length)];
      if (spring) {
        spring.kind = "spring";
        spring.width = PLATFORM_WIDTH;
        state.springTargetY = spring.y + randomBetween(610, 660);
        state.springTargetX = clampNumber(spring.x + randomBetween(-92, 92), 54, WIDTH - 54);
        state.lastSpringStep = state.routeStep;
      }
    }

    const placeBoost = (kind: "rocket" | "bambooCopter", threshold: number) => {
      const thresholdScore = heightMeters(threshold);
      if (meters < thresholdScore) return false;
      const candidates = safeField.filter((platform) => (
        platform.kind === "flower"
        && platform.y > segmentBottom + 110
        && platform.y < segmentTop - 110
      ));
      const platform = candidates[Math.floor(Math.random() * candidates.length)];
      if (!platform) return false;
      state.airItems.push({
        id: state.nextId++,
        x: platform.x,
        y: platform.y + (kind === "rocket" ? 54 : 45),
        kind,
        used: false,
      });
      if (kind === "rocket") {
        state.rocketRecoveryY = platform.y + ROCKET_RECOVERY_DISTANCE;
        state.rocketRecoveryX = clampNumber(platform.x + randomBetween(-90, 90), 54, WIDTH - 54);
        state.nextRocketY += ROCKET_INTERVAL_WORLD;
      } else {
        state.copterRecoveryY = platform.y + COPTER_RECOVERY_DISTANCE;
        state.copterRecoveryX = clampNumber(platform.x + randomBetween(-80, 80), 54, WIDTH - 54);
        state.nextCopterY += COPTER_INTERVAL_WORLD;
      }
      return true;
    };
    const rocketPlaced = placeBoost("rocket", state.nextRocketY);
    if (!rocketPlaced) placeBoost("bambooCopter", state.nextCopterY);

    const firstJarDue = state.lastJarStep < 0;
    if (meters > 55 && safeField.length > 0 && (firstJarDue || Math.random() < .24)) {
      const jarPlatform = safeField[Math.floor(Math.random() * safeField.length)];
      if (!state.airItems.some((item) => Math.abs(item.y - jarPlatform.y) < 90)) {
        state.airItems.push({
          id: state.nextId++,
          x: jarPlatform.x,
          y: jarPlatform.y + 45,
          kind: "honeyJar",
          used: false,
          value: profile === 2 ? 100 : 50,
        });
        state.lastJarStep = state.routeStep;
      }
    }

    if (meters >= state.nextShieldScore && safeField.length > 0) {
      const shieldCandidates = safeField.filter((platform) => (
        platform.kind === "flower"
        && !state.airItems.some((item) => Math.abs(item.y - platform.y) < 100)
      ));
      const shieldPlatform = shieldCandidates[Math.floor(Math.random() * shieldCandidates.length)];
      if (shieldPlatform) {
        state.airItems.push({
          id: state.nextId++,
          x: shieldPlatform.x,
          y: shieldPlatform.y + 46,
          kind: "waxShield",
          used: false,
        });
        state.nextShieldScore += randomBetween(680, 900);
      }
    }

    // Every core hazard is guaranteed once inside an early score window. Later
    // appearances remain random. Sparse pockets never carry a hazard, so an
    // open jump and a lethal object cannot be combined in the same segment.
    const enoughRoomSinceHazard = state.routeStep - state.lastHazardStep > Math.round(13 - difficulty * 3);
    const hazardUnlocks: Array<[IntroductionKind, number]> = [
      ["bear", 450],
      ["hornet", 700],
      ["web", 950],
      ["bat", 1200],
      ["blackHole", 1500],
    ];
    const forcedKind = hazardUnlocks.find(([kind, threshold]) => meters >= threshold && !state.introduced[kind])?.[0];
    const firstBlackHole = forcedKind === "blackHole";
    const profileAllowsHazard = profile !== 2 && (!firstBlackHole || profile === 0);
    const hazardChance = meters < 450 || !profileAllowsHazard
      ? 0
      : .18 + difficulty * .28;
    if (enoughRoomSinceHazard && (forcedKind !== undefined || Math.random() < hazardChance) && safeField.length >= 4 && profileAllowsHazard) {
      const hazardRoll = Math.random();
      let kind: IntroductionKind = forcedKind ?? "bear";
      if (!forcedKind) {
        if (meters >= 1500 && hazardRoll < .12) kind = "blackHole";
        else if (meters >= 1200 && hazardRoll < .36) kind = "bat";
        else if (meters >= 700 && hazardRoll < .61) kind = "hornet";
        else if (meters >= 950 && hazardRoll < .78) kind = "web";
      }
      const ordered = [...safeField].sort((a, b) => a.y - b.y);
      const lowerIndex = Math.floor(randomBetween(1, Math.max(2, ordered.length - 2)));
      const lower = ordered[Math.min(lowerIndex, ordered.length - 2)];
      const upper = ordered.slice(lowerIndex + 1).find((platform) => (
        platform.y > lower.y + 64 && platform.y < lower.y + 250
      ));
      if (lower && upper) {
        const item: AirItem = {
          id: state.nextId++,
          x: kind === "blackHole" && !state.introduced.blackHole
            ? clampNumber((lower.x + upper.x) / 2, 200, WIDTH - 200)
            : clampNumber((lower.x + upper.x) / 2 + randomBetween(-56, 56), 48, WIDTH - 48),
          y: (lower.y + upper.y) / 2 + randomBetween(-18, 18),
          kind,
          used: false,
          strength: kind === "blackHole" && !state.introduced.blackHole ? .7 : 1,
        };
        if (kind === "bear" || kind === "hornet" || kind === "bat") {
          item.baseX = item.x;
          item.range = kind === "bear" ? 34 + difficulty * 28 : 48 + difficulty * 38;
          item.speed = kind === "bear" ? .82 + difficulty * .38 : 1.08 + difficulty * .62;
          item.phase = Math.random() * Math.PI * 2;
        }
        state.airItems.push(item);
        state.introduced[kind] = true;
        state.lastHazardStep = state.routeStep;
      }
    }

    state.platforms.push(...field);
    const topReachable = [...reachableNow()].sort((a, b) => b.y - a.y)[0];
    if (topReachable) state.lastPlatformX = topReachable.x;
    state.generatedTo = segmentTop;
    state.routeStep += field.length;
    state.sceneRemaining = 0;
    state.sceneProgress = 0;
  }
}

function drawPlatform(ctx: CanvasRenderingContext2D, p: Platform, sy: number, time: number) {
  const shake = p.breaking > 0 ? Math.sin(time * 0.09) * 5 : 0;
  ctx.save();
  if (p.kind === "fading") ctx.globalAlpha = Math.max(.12, 1 - p.breaking * 2.7);
  ctx.translate(shake, 0);
  if (p.kind === "cloud") {
    const cloudFill = ctx.createLinearGradient(0, sy - 10, 0, sy + 10);
    cloudFill.addColorStop(0, "#ffffff");
    cloudFill.addColorStop(1, "#bfe8f5");
    ctx.fillStyle = "rgba(58,111,138,.16)";
    ctx.beginPath();
    ctx.ellipse(p.x, sy + 7, p.width * .48, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cloudFill;
    ctx.strokeStyle = "#477c98";
    ctx.lineWidth = 2;
    roundedRect(ctx, p.x - p.width * .48, sy - 3, p.width * .96, 13, 7);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(p.x - p.width * .2, sy - 3, p.width * .18, 7, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + p.width * .05, sy - 6, p.width * .22, 9, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + p.width * .28, sy - 2, p.width * .15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.86)";
    ctx.beginPath();
    ctx.ellipse(p.x - p.width * .12, sy - 5, p.width * .18, 2.5, -.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const broken = p.kind === "broken";
  const moving = p.kind === "moving";
  const fading = p.kind === "fading";
  const windFlower = p.kind === "windFlower";
  const outline = "#403b38";
  const board = broken ? "#9a765c" : moving ? "#39aee1" : windFlower ? "#67d3c1" : fading ? "#fffdf7" : "#ff8fb1";
  const boardLight = broken ? "#cfad91" : moving ? "#9fe5ff" : windFlower ? "#cafff3" : fading ? "#ffffff" : "#ffd0df";
  const center = broken ? "#6c5040" : moving ? "#ffd34d" : windFlower ? "#fff0a2" : fading ? "#efcad8" : "#f5ae29";

  ctx.fillStyle = "rgba(62,48,38,.16)";
  ctx.beginPath();
  ctx.ellipse(p.x, sy + 5.5, p.width * .48, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.2;
  if (broken) {
    const half = p.width * .42;
    ctx.fillStyle = board;
    roundedRect(ctx, p.x - p.width * .49, sy - 5, half, 11, 5);
    ctx.fill();
    ctx.stroke();
    roundedRect(ctx, p.x + p.width * .07, sy - 5, half, 11, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = boardLight;
    roundedRect(ctx, p.x - p.width * .42, sy - 2.5, p.width * .2, 2.5, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p.x - 4, sy - 6);
    ctx.lineTo(p.x + 2, sy - 1);
    ctx.lineTo(p.x - 2, sy + 6);
    ctx.moveTo(p.x + 4, sy - 5);
    ctx.lineTo(p.x - 1, sy);
    ctx.lineTo(p.x + 4, sy + 5);
    ctx.stroke();
  } else {
    ctx.fillStyle = board;
    roundedRect(ctx, p.x - p.width / 2, sy - 5.5, p.width, 12, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = boardLight;
    roundedRect(ctx, p.x - p.width * .37, sy - 3.3, p.width * .37, 2.7, 2);
    ctx.fill();
    ctx.fillStyle = center;
    ctx.beginPath();
    ctx.ellipse(p.x, sy, Math.min(14, p.width * .18), 4.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = moving ? "#177ead" : windFlower ? "#278f82" : fading ? "#d8a9ba" : "#d76289";
    ctx.lineWidth = 1.2;
    for (const offset of [-.3, .3]) {
      ctx.beginPath();
      ctx.moveTo(p.x + p.width * offset, sy - 3.4);
      ctx.quadraticCurveTo(p.x + p.width * offset * .82, sy, p.x + p.width * offset, sy + 3.8);
      ctx.stroke();
    }
  }
  if (p.kind === "spring") {
    const baseY = sy - 7;
    const spacing = 4.05;
    const turns = 5;
    const topY = baseY - (turns - 1) * spacing;
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "#343434";
    ctx.lineWidth = 2.05;
    for (let i = 0; i < turns; i += 1) {
      const y = baseY - i * spacing;
      const radiusX = 14.5 - i * .65;
      ctx.beginPath();
      ctx.ellipse(p.x, y, radiusX, 2.35, -.035, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(p.x - 14, baseY);
    ctx.lineTo(p.x - 11.5, topY);
    ctx.moveTo(p.x + 14, baseY);
    ctx.lineTo(p.x + 11.5, topY);
    ctx.stroke();
    ctx.restore();
  }
  if (windFlower) {
    const drift = Math.sin(time * .006) * 3;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.lineWidth = 2.1;
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i += 1) {
      const rise = (time * .045 + i * 14) % 38;
      const windY = sy - 9 - rise;
      ctx.globalAlpha = .32 + (1 - rise / 38) * .55;
      ctx.beginPath();
      ctx.moveTo(p.x - 14 + drift, windY);
      ctx.bezierCurveTo(p.x - 3, windY - 5, p.x + 5, windY + 5, p.x + 15 - drift, windY - 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawRedFuzzFallback(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  ctx.save();
  ctx.translate(x, y + Math.sin(time * .006) * 3);
  ctx.rotate(Math.sin(time * .004) * .035);
  ctx.fillStyle = "#e84a42";
  ctx.strokeStyle = "#332d2a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, 27, 23, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  for (let index = 0; index < 12; index += 1) {
    const angle = index / 12 * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * 25, Math.sin(angle) * 21);
    ctx.lineTo(Math.cos(angle) * 32, Math.sin(angle) * 28);
    ctx.stroke();
  }
  ctx.fillStyle = "#fff2c9";
  ctx.strokeStyle = "#332d2a";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(-8, -3, 10, 0, Math.PI * 2);
  ctx.arc(10, -1, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#2c2826";
  ctx.beginPath();
  ctx.arc(-6, -2, 4, 0, Math.PI * 2);
  ctx.arc(11, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-6, 12);
  ctx.quadraticCurveTo(1, 17, 8, 11);
  ctx.stroke();
  ctx.fillStyle = "#f2b52b";
  ctx.beginPath();
  ctx.ellipse(-9, 27, 5, 7, 0, 0, Math.PI * 2);
  ctx.ellipse(9, 27, 5, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawDoodleMonsterSprite(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  time: number,
  size = 78,
) {
  ctx.save();
  ctx.translate(x, y + Math.sin(time * .006 + x * .02) * 4);
  ctx.rotate(Math.sin(time * .004 + x) * .035);
  ctx.shadowColor = "rgba(57,46,40,.18)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 3;
  const scale = size / Math.max(image.naturalWidth, image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
}

function drawWeb(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * .00045);
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 42);
  glow.addColorStop(0, "rgba(57,28,72,.76)");
  glow.addColorStop(1, "rgba(131,73,154,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(69,43,83,.94)";
  ctx.lineWidth = 3;
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
  ctx.fillStyle = "#321f3c";
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(x + 28, y - 30);
  ctx.fillStyle = "#df4939";
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "900 16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("!", 0, 6);
  ctx.restore();
}

function drawBlackHole(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * .001);
  const glow = ctx.createRadialGradient(0, 0, 5, 0, 0, 48);
  glow.addColorStop(0, "#05030c");
  glow.addColorStop(.35, "#17102d");
  glow.addColorStop(.66, "rgba(108,67,177,.88)");
  glow.addColorStop(1, "rgba(125,93,193,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 48, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 5;
  for (let ring = 0; ring < 3; ring += 1) {
    ctx.strokeStyle = ring === 0 ? "#9f7bea" : ring === 1 ? "#5b3f99" : "rgba(213,180,255,.55)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 35 + ring * 6, 13 + ring * 4, ring * .55, .15, Math.PI * 1.65);
    ctx.stroke();
  }
  ctx.fillStyle = "#030209";
  ctx.beginPath();
  ctx.ellipse(0, 0, 24, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHornet(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  ctx.save();
  ctx.translate(x, y + Math.sin(time * .012) * 3);
  const flap = .45 + Math.abs(Math.sin(time * .05)) * .45;
  ctx.fillStyle = "rgba(225,247,255,.82)";
  ctx.strokeStyle = "#42382e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-17, -10, 15, 7 * flap, -.45, 0, Math.PI * 2);
  ctx.ellipse(17, -10, 15, 7 * flap, .45, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f5b91f";
  ctx.strokeStyle = "#362c26";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 1, 24, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#342a25";
  ctx.fillRect(-8, -20, 7, 42);
  ctx.fillRect(9, -20, 7, 42);
  ctx.restore();
  ctx.fillStyle = "#d74b45";
  ctx.beginPath();
  ctx.moveTo(-23, 1);
  ctx.lineTo(-34, 7);
  ctx.lineTo(-24, 11);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-7, -5, 4.5, 0, Math.PI * 2);
  ctx.arc(7, -5, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#201b19";
  ctx.beginPath();
  ctx.arc(-6, -4, 2.5, 0, Math.PI * 2);
  ctx.arc(6, -4, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBat(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  ctx.save();
  ctx.translate(x, y + Math.sin(time * .008) * 5);
  const flap = Math.sin(time * .018) * 8;
  ctx.fillStyle = "#52406e";
  ctx.strokeStyle = "#2c2338";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-5, -4);
  ctx.quadraticCurveTo(-31, -26 - flap, -40, 4);
  ctx.quadraticCurveTo(-27, -4, -21, 15 + flap * .35);
  ctx.quadraticCurveTo(-12, 6, -4, 7);
  ctx.moveTo(5, -4);
  ctx.quadraticCurveTo(31, -26 - flap, 40, 4);
  ctx.quadraticCurveTo(27, -4, 21, 15 + flap * .35);
  ctx.quadraticCurveTo(12, 6, 4, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#372b49";
  ctx.beginPath();
  ctx.ellipse(0, 2, 14, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-9, -12);
  ctx.lineTo(-5, -26);
  ctx.lineTo(1, -13);
  ctx.moveTo(9, -12);
  ctx.lineTo(5, -26);
  ctx.lineTo(-1, -13);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffdf4d";
  ctx.beginPath();
  ctx.arc(-5, -3, 2.3, 0, Math.PI * 2);
  ctx.arc(5, -3, 2.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBambooCopter(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, attached = false) {
  ctx.save();
  ctx.translate(x, y + (attached ? -39 : Math.sin(time * .009) * 3));
  ctx.strokeStyle = "#49392c";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(0, 12);
  ctx.stroke();
  ctx.fillStyle = "#e5a72a";
  ctx.beginPath();
  ctx.ellipse(0, 12, 9, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const spin = time * .025;
  ctx.rotate(spin);
  ctx.fillStyle = "#73c66e";
  ctx.beginPath();
  ctx.ellipse(-21, 0, 22, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(21, 0, 22, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawRocket(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  ctx.save();
  ctx.translate(x, y + Math.sin(time * 0.006) * 4);
  ctx.rotate(0.18);
  ctx.fillStyle = "#fff8dc";
  ctx.strokeStyle = "#493a30";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -35);
  ctx.quadraticCurveTo(25, -10, 14, 24);
  ctx.lineTo(-14, 24);
  ctx.quadraticCurveTo(-25, -10, 0, -35);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f07a5c";
  ctx.beginPath();
  ctx.moveTo(-14, 10);
  ctx.lineTo(-27, 27);
  ctx.lineTo(-10, 22);
  ctx.moveTo(14, 10);
  ctx.lineTo(27, 27);
  ctx.lineTo(10, 22);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#74c9df";
  ctx.strokeStyle = "#493a30";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, -8, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f5b526";
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.quadraticCurveTo(9, 14, 0, 19);
  ctx.quadraticCurveTo(-9, 14, 0, 4);
  ctx.fill();
  ctx.fillStyle = "#ffb31d";
  ctx.beginPath();
  ctx.moveTo(-8, 25);
  ctx.lineTo(0, 48 + Math.sin(time * 0.025) * 8);
  ctx.lineTo(8, 25);
  ctx.fill();
  ctx.fillStyle = "#fff4a8";
  ctx.beginPath();
  ctx.moveTo(-4, 26);
  ctx.lineTo(0, 40 + Math.sin(time * .03) * 5);
  ctx.lineTo(4, 26);
  ctx.fill();
  ctx.restore();
}

function drawHoneyJar(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, value = 20) {
  ctx.save();
  ctx.translate(x, y + Math.sin(time * .006 + x) * 3);
  const glow = ctx.createRadialGradient(0, 3, 2, 0, 3, 34);
  glow.addColorStop(0, "rgba(255,226,91,.55)");
  glow.addColorStop(1, "rgba(255,207,52,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 3, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff5ce";
  ctx.strokeStyle = "#4a392c";
  ctx.lineWidth = 2.6;
  roundedRect(ctx, -17, -18, 34, 39, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f6b91f";
  roundedRect(ctx, -13, -5, 26, 22, 7);
  ctx.fill();
  ctx.fillStyle = "#8b5830";
  roundedRect(ctx, -19, -23, 38, 8, 4);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.beginPath();
  ctx.ellipse(-7, -10, 3, 7, .25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff8dc";
  ctx.font = "900 11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`+${value}`, 0, 10);
  ctx.fillStyle = "#7a4c16";
  ctx.font = "900 10px sans-serif";
  ctx.fillText("蜂蜜", 0, 34);
  ctx.restore();
}

function drawWaxShield(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, attached = false) {
  ctx.save();
  ctx.translate(x, y + (attached ? 0 : Math.sin(time * .006 + x) * 3));
  const pulse = 1 + Math.sin(time * .008) * (attached ? .025 : .05);
  ctx.scale(pulse, pulse);

  if (attached) {
    const aura = ctx.createRadialGradient(-9, -19, 4, 0, -5, 59);
    aura.addColorStop(0, "rgba(255,255,223,.34)");
    aura.addColorStop(.62, "rgba(255,220,70,.19)");
    aura.addColorStop(1, "rgba(255,176,18,0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.ellipse(0, -7, 55, 61, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,239,118,.13)";
    ctx.strokeStyle = "rgba(255,250,205,.98)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(0, -7, 47, 54, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#f1ae18";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(-4, -9, 42, Math.PI * 1.08, Math.PI * 1.72);
    ctx.stroke();

    ctx.globalAlpha = .72;
    ctx.strokeStyle = "#ffd84d";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      const angle = time * .0015 + i * Math.PI / 2;
      const hx = Math.cos(angle) * 43;
      const hy = -7 + Math.sin(angle) * 49;
      ctx.beginPath();
      for (let side = 0; side < 6; side += 1) {
        const a = side * Math.PI / 3;
        const px = hx + Math.cos(a) * 5;
        const py = hy + Math.sin(a) * 5;
        if (side === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // A small, unmistakable shield badge stays attached to the bubble.
    ctx.translate(35, 29);
    ctx.fillStyle = "#f5b51d";
    ctx.strokeStyle = "#fff9d4";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(11, -7);
    ctx.lineTo(9, 5);
    ctx.quadraticCurveTo(6, 13, 0, 16);
    ctx.quadraticCurveTo(-6, 13, -9, 5);
    ctx.lineTo(-11, -7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-5, 1);
    ctx.lineTo(-1, 6);
    ctx.lineTo(6, -3);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const glow = ctx.createRadialGradient(0, -2, 3, 0, 0, 40);
  glow.addColorStop(0, "rgba(255,251,201,.95)");
  glow.addColorStop(.55, "rgba(255,211,58,.42)");
  glow.addColorStop(1, "rgba(255,178,18,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 40, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(157,231,255,.48)";
  ctx.strokeStyle = "#fffbea";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, -2, 29, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#e59a11";
  ctx.lineWidth = 2;
  ctx.stroke();

  const shieldGradient = ctx.createLinearGradient(0, -23, 0, 23);
  shieldGradient.addColorStop(0, "#ffe76a");
  shieldGradient.addColorStop(1, "#f2a716");
  ctx.fillStyle = shieldGradient;
  ctx.strokeStyle = "#704416";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, -21);
  ctx.lineTo(19, -14);
  ctx.lineTo(16, 7);
  ctx.quadraticCurveTo(11, 21, 0, 26);
  ctx.quadraticCurveTo(-11, 21, -16, 7);
  ctx.lineTo(-19, -14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#fffbea";
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(-2, 7);
  ctx.lineTo(10, -7);
  ctx.stroke();

  ctx.fillStyle = "rgba(92,58,16,.86)";
  roundedRect(ctx, -25, 31, 50, 18, 9);
  ctx.fill();
  ctx.fillStyle = "#fff8d9";
  ctx.font = "900 12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("护盾", 0, 40);

  ctx.fillStyle = "rgba(255,255,255,.82)";
  ctx.beginPath();
  ctx.ellipse(-10, -13, 5, 9, -.65, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBee(ctx: CanvasRenderingContext2D, x: number, y: number, vx: number, vy: number, time: number, blink: boolean, rocket: boolean, facing: -1 | 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.max(-0.22, Math.min(0.22, vx / 900)));
  ctx.scale(facing, 1);
  const stretch = rocket ? 1.1 : vy > 120 ? 1.035 : vy < -120 ? .97 : .92;
  ctx.scale(2 - stretch, stretch);
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
  const beat = 0.86 + Math.sin(time * 0.052) * 0.15;
  ctx.fillStyle = "rgba(239,252,255,.9)";
  ctx.strokeStyle = "rgba(61,111,126,.52)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-23, -3, 13 * beat, 25, -0.72, 0, Math.PI * 2);
  ctx.ellipse(23, -3, 13 * beat, 25, 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ef6f51";
  ctx.beginPath();
  ctx.moveTo(-13, -2);
  ctx.quadraticCurveTo(-34 - vx * .035, 3, -42 - vx * .05, 16);
  ctx.quadraticCurveTo(-25, 12, -9, 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffcb29";
  ctx.strokeStyle = "#45372d";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 3, 23, 29, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#45372d";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-18, 5);
  ctx.quadraticCurveTo(-29, 8, -31, 17);
  ctx.moveTo(18, 5);
  ctx.quadraticCurveTo(29, 8, 31, 17);
  ctx.moveTo(-10, 27);
  ctx.lineTo(-12, 36);
  ctx.lineTo(-20, 38);
  ctx.moveTo(10, 27);
  ctx.lineTo(12, 36);
  ctx.lineTo(20, 38);
  ctx.stroke();
  ctx.fillStyle = "#ffdf62";
  ctx.beginPath();
  ctx.arc(-31, 18, 4, 0, Math.PI * 2);
  ctx.arc(31, 18, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#403128";
  ctx.fillRect(-25, 0, 50, 8);
  ctx.fillRect(-22, 15, 44, 7);
  ctx.restore();
  ctx.fillStyle = "#ffdf62";
  ctx.strokeStyle = "#45372d";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, -18, 21, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f6bd28";
  ctx.beginPath();
  ctx.moveTo(-6, -38);
  ctx.quadraticCurveTo(0, -47, 6, -38);
  ctx.quadraticCurveTo(0, -41, -6, -38);
  ctx.fill();
  ctx.strokeStyle = "#45372d";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-9, -36);
  ctx.quadraticCurveTo(-16, -48, -21, -44);
  ctx.moveTo(9, -36);
  ctx.quadraticCurveTo(16, -48, 21, -44);
  ctx.stroke();
  ctx.fillStyle = "#45372d";
  ctx.beginPath();
  ctx.arc(-21, -44, 3, 0, Math.PI * 2);
  ctx.arc(21, -44, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2f251f";
  ctx.beginPath();
  ctx.arc(-7, -20, 3, 0, Math.PI * 2);
  ctx.arc(7, -20, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.beginPath();
  ctx.arc(-8, -21, 1.1, 0, Math.PI * 2);
  ctx.arc(6, -21, 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(242,108,104,.62)";
  ctx.beginPath();
  ctx.arc(-13, -13, 4, 0, Math.PI * 2);
  ctx.arc(13, -13, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2f251f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -16, 6, 0.1, Math.PI - 0.1);
  ctx.stroke();
  if (rocket) {
    ctx.fillStyle = "rgba(74,139,160,.78)";
    ctx.strokeStyle = "#45372d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(-8, -21, 8, 6, 0, 0, Math.PI * 2);
    ctx.ellipse(8, -21, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -21);
    ctx.lineTo(0, -21);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBeeSprite(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, vx: number, vy: number, time: number, blink: boolean, rocket: boolean, facing: -1 | 1) {
  ctx.save();
  ctx.translate(x, y + Math.sin(time * .018) * 1.2);
  ctx.rotate(Math.max(-.11, Math.min(.11, vx / 1800)) + Math.sin(time * .008) * .012);
  ctx.scale(facing, 1);
  if (blink && Math.floor(time / 90) % 2 === 0) ctx.globalAlpha = .34;

  const wingBeat = Math.sin(time * .11);
  const wingLift = .5 + wingBeat * .5;
  ctx.save();
  ctx.strokeStyle = `rgba(238,251,255,${.3 + wingLift * .28})`;
  ctx.lineWidth = 3.2;
  ctx.lineCap = "round";
  for (let trail = 0; trail < 3; trail += 1) {
    const trailY = 7 + trail * 10;
    const trailLength = 14 + Math.abs(vx) * .035 + trail * 5;
    ctx.globalAlpha = .22 - trail * .045;
    ctx.beginPath();
    ctx.moveTo(-36, trailY);
    ctx.lineTo(-36 - trailLength, trailY + 4);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "rgba(235,250,255,.74)";
  ctx.strokeStyle = "rgba(76,132,154,.42)";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(-18, -13, 9 + wingLift * 3, 27, -1.02 - wingBeat * .34, 0, Math.PI * 2);
  ctx.ellipse(8, -16, 8 + wingLift * 3, 25, .92 + wingBeat * .3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.38)";
  ctx.beginPath();
  ctx.ellipse(-20, -17, 4, 14, -1.02 - wingBeat * .34, 0, Math.PI * 2);
  ctx.ellipse(10, -19, 4, 13, .92 + wingBeat * .3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (rocket) {
    const flame = 30 + Math.sin(time * .032) * 8;
    const fire = ctx.createLinearGradient(0, 28, 0, 28 + flame);
    fire.addColorStop(0, "rgba(255,238,106,.95)");
    fire.addColorStop(.45, "rgba(255,144,32,.9)");
    fire.addColorStop(1, "rgba(241,73,43,0)");
    ctx.fillStyle = fire;
    ctx.beginPath();
    ctx.moveTo(-9, 25);
    ctx.quadraticCurveTo(-6, 40, 0, 28 + flame);
    ctx.quadraticCurveTo(7, 40, 10, 25);
    ctx.fill();
  }
  const height = 78;
  const width = height * (image.naturalWidth / image.naturalHeight);
  ctx.shadowColor = "rgba(80,54,24,.22)";
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 5;
  ctx.drawImage(image, -width / 2, -height + 31, width, height);
  ctx.restore();
}

function GameCanvas({ phase, controlMode, resetToken, onStats, onFail, onMotionDetected }: {
  phase: Phase;
  controlMode: ControlMode;
  resetToken: number;
  onStats: (honey: number, height: number, ammo: number) => void;
  onFail: (honey: number) => void;
  onMotionDetected: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(firstState());
  const phaseRef = useRef(phase);
  const frameRef = useRef(0);
  const beeImageRef = useRef<HTMLImageElement | null>(null);
  const redMonsterImageRef = useRef<HTMLImageElement | null>(null);
  const purpleMonsterImageRef = useRef<HTMLImageElement | null>(null);
  const blueMonsterImageRef = useRef<HTMLImageElement | null>(null);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  const orientationRef = useRef({ tilt: 0, baseline: 0, calibrated: false, reported: false });
  const pointerRef = useRef({ active: false, x: WIDTH / 2, startX: WIDTH / 2, startTime: 0, moved: false });
  const keysRef = useRef({ left: false, right: false });

  useEffect(() => {
    phaseRef.current = phase;
    stateRef.current.lastTime = 0;
    if (phase !== "playing") {
      setBearDangerSound(false);
      setBlackHoleDangerSound(false);
    }
  }, [phase]);
  useEffect(() => {
    stateRef.current = firstState();
    generateWorld(stateRef.current, HEIGHT * 2);
    orientationRef.current.calibrated = false;
    orientationRef.current.reported = false;
  }, [resetToken]);
  useEffect(() => {
    const beeImage = new Image();
    const redMonsterImage = new Image();
    const purpleMonsterImage = new Image();
    const blueMonsterImage = new Image();
    const backgroundImage = new Image();
    const markBeeReady = () => {
      if (beeImage.naturalWidth > 0) beeImageRef.current = beeImage;
    };
    beeImage.decoding = "async";
    beeImage.fetchPriority = "high";
    beeImage.onload = markBeeReady;
    beeImage.src = "/bee-character-flying-final-v2.png?v=20260731";
    redMonsterImage.src = "/monster-red-fuzz.png?v=20260730b";
    purpleMonsterImage.src = "/monster-purple-jelly.png?v=20260730b";
    blueMonsterImage.src = "/monster-blue-cyclops.png?v=20260730b";
    backgroundImage.src = "/game-background-long.png";
    if (beeImage.complete) markBeeReady();
    void beeImage.decode().then(markBeeReady).catch(() => undefined);
    redMonsterImage.onload = () => { redMonsterImageRef.current = redMonsterImage; };
    purpleMonsterImage.onload = () => { purpleMonsterImageRef.current = purpleMonsterImage; };
    blueMonsterImage.onload = () => { blueMonsterImageRef.current = blueMonsterImage; };
    backgroundImage.onload = () => { backgroundImageRef.current = backgroundImage; };
    return () => {
      beeImageRef.current = null;
      redMonsterImageRef.current = null;
      purpleMonsterImageRef.current = null;
      blueMonsterImageRef.current = null;
      backgroundImageRef.current = null;
    };
  }, []);

  useEffect(() => {
    const orientation = (event: DeviceOrientationEvent) => {
      if (typeof event.gamma !== "number" || typeof event.beta !== "number") return;
      const angle = screen.orientation?.angle ?? (typeof window.orientation === "number" ? window.orientation : 0);
      let tilt = event.gamma;
      if (angle === 90) tilt = event.beta;
      else if (angle === -90 || angle === 270) tilt = -event.beta;
      else if (angle === 180) tilt = -event.gamma;
      const sensor = orientationRef.current;
      sensor.tilt = tilt;
      if (!sensor.calibrated) { sensor.baseline = tilt; sensor.calibrated = true; }
      if (!sensor.reported) {
        sensor.reported = true;
        onMotionDetected();
      }
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
    window.addEventListener("deviceorientationabsolute", orientation as EventListener);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("deviceorientation", orientation);
      window.removeEventListener("deviceorientationabsolute", orientation as EventListener);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onMotionDetected]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const screenY = (worldY: number, cameraY: number) => FLOOR_Y - (worldY - cameraY) * VIEW_SCALE;
    const burst = (state: GameState, x: number, y: number, color: string, count = 10) => {
      for (let i = 0; i < count; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const speed = 35 + Math.random() * 85;
        state.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .6 + Math.random() * .4, color, size: 2 + Math.random() * 4 });
      }
    };

    const drawBackground = (state: GameState) => {
      const backgroundImage = backgroundImageRef.current;
      if (!backgroundImage) {
        const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
        gradient.addColorStop(0, "#78cff1");
        gradient.addColorStop(.55, "#c9f2df");
        gradient.addColorStop(1, "#fff2ac");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        return;
      }

      const tileHeight = WIDTH * (backgroundImage.naturalHeight / backgroundImage.naturalWidth);
      const tileWorldHeight = tileHeight / VIEW_SCALE;
      const firstTile = Math.floor((state.cameraY - 180) / tileWorldHeight) - 1;
      for (let index = firstTile; index < firstTile + 5; index += 1) {
        const worldBottom = index * tileWorldHeight;
        const worldTop = worldBottom + tileWorldHeight;
        const topY = FLOOR_Y - (worldTop - state.cameraY) * VIEW_SCALE;
        ctx.save();
        if (Math.abs(index) % 2 === 1) {
          ctx.translate(0, topY + tileHeight);
          ctx.scale(1, -1);
          ctx.drawImage(backgroundImage, 0, 0, WIDTH, tileHeight);
        } else {
          ctx.drawImage(backgroundImage, 0, topY, WIDTH, tileHeight);
        }
        ctx.restore();
      }
      ctx.fillStyle = "rgba(255,255,255,.06)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    };

    const draw = (state: GameState, time: number) => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      drawBackground(state);
      for (const p of state.platforms) {
        const sy = screenY(p.y, state.cameraY);
        if (sy > -70 && sy < HEIGHT + 60 && p.breaking < .38) drawPlatform(ctx, p, sy, time);
      }
      for (const item of state.airItems) {
        if (item.used) continue;
        const sy = screenY(item.y, state.cameraY);
        if (sy < -70 || sy > HEIGHT + 70) continue;
        if (item.kind === "bear") {
          const redMonsterImage = redMonsterImageRef.current;
          if (redMonsterImage) drawDoodleMonsterSprite(ctx, redMonsterImage, item.x, sy, time, 60);
          else drawRedFuzzFallback(ctx, item.x, sy, time);
        }
        else if (item.kind === "web") drawWeb(ctx, item.x, sy, time);
        else if (item.kind === "blackHole") drawBlackHole(ctx, item.x, sy, time);
        else if (item.kind === "hornet") {
          const purpleMonsterImage = purpleMonsterImageRef.current;
          if (purpleMonsterImage) drawDoodleMonsterSprite(ctx, purpleMonsterImage, item.x, sy, time, 58);
          else drawHornet(ctx, item.x, sy, time);
        }
        else if (item.kind === "bat") {
          const blueMonsterImage = blueMonsterImageRef.current;
          if (blueMonsterImage) drawDoodleMonsterSprite(ctx, blueMonsterImage, item.x, sy, time, 60);
          else drawBat(ctx, item.x, sy, time);
        }
        else if (item.kind === "rocket") drawRocket(ctx, item.x, sy, time);
        else if (item.kind === "bambooCopter") drawBambooCopter(ctx, item.x, sy, time);
        else if (item.kind === "waxShield") drawWaxShield(ctx, item.x, sy, time);
        else drawHoneyJar(ctx, item.x, sy, time, item.value);
      }
      for (const p of state.particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const shot of state.shots) {
        const sy = screenY(shot.y, state.cameraY);
        const glow = ctx.createRadialGradient(shot.x, sy, 1, shot.x, sy, 14);
        glow.addColorStop(0, "#fffbe0");
        glow.addColorStop(.35, "#ffd12f");
        glow.addColorStop(1, "rgba(255,175,18,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(shot.x, sy, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffb316";
        ctx.beginPath();
        ctx.ellipse(shot.x, sy, 5, 9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const beeImage = beeImageRef.current;
      const beeY = screenY(state.beeY, state.cameraY);
      if (beeImage) drawBeeSprite(ctx, beeImage, state.beeX, beeY, state.vx, state.vy, time, state.invincible > 0, state.rocketTimer > 0, state.facing);
      else {
        // Do not flash the retired code-drawn bee while the real sprite is decoding.
        ctx.save();
        ctx.globalAlpha = 0.18 + Math.sin(time * 7) * 0.05;
        ctx.fillStyle = "#ffd84a";
        ctx.beginPath();
        ctx.ellipse(state.beeX, beeY, 22, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (state.shield > 0) drawWaxShield(ctx, state.beeX, beeY - 2, time, true);
      if (state.copterTimer > 0) drawBambooCopter(ctx, state.beeX, beeY, time, true);
    };

    const update = (state: GameState, dt: number) => {
      state.invincible = Math.max(0, state.invincible - dt);
      state.windTimer = Math.max(0, state.windTimer - dt);
      state.rocketTimer = Math.max(0, state.rocketTimer - dt);
      state.copterTimer = Math.max(0, state.copterTimer - dt);
      for (const item of state.airItems) {
        const sy = screenY(item.y, state.cameraY);
        if (!item.used && !item.audioPlayed && item.kind === "bear" && sy > -190 && sy < -72) {
          item.audioPlayed = true;
        } else if (!item.used && !item.audioPlayed && item.kind === "web" && sy > -75 && sy < 85) {
          item.audioPlayed = true;
          playGameSound("webWind");
        } else if (!item.used && !item.audioPlayed && item.kind === "blackHole" && sy > -100 && sy < 100) {
          item.audioPlayed = true;
        }
      }
      const bearDangerActive = state.airItems.some((item) => {
        if (item.used || (item.kind !== "bear" && item.kind !== "hornet" && item.kind !== "bat")) return false;
        const sy = screenY(item.y, state.cameraY);
        const notSafelyPassed = item.y > state.beeY - 90;
        return sy > -215 && sy < HEIGHT + 70 && notSafelyPassed;
      });
      setBearDangerSound(bearDangerActive);
      const blackHoleDangerActive = state.airItems.some((item) => {
        if (item.used || item.kind !== "blackHole") return false;
        const sy = screenY(item.y, state.cameraY);
        const notSafelyPassed = item.y > state.beeY - 110;
        return sy > -150 && sy < HEIGHT + 80 && notSafelyPassed;
      });
      setBlackHoleDangerSound(blackHoleDangerActive);
      const now = state.lastTime / 1000;
      for (const p of state.platforms) {
        if ((p.kind === "moving" || p.kind === "cloud") && p.baseX !== undefined) {
          p.x = Math.max(50, Math.min(WIDTH - 50, p.baseX + Math.sin(now * (p.speed ?? 1) + (p.phase ?? 0)) * (p.range ?? 45)));
        }
      }
      for (const item of state.airItems) {
        if ((item.kind === "bear" || item.kind === "hornet" || item.kind === "bat") && item.baseX !== undefined) {
          item.x = Math.max(42, Math.min(WIDTH - 42, item.baseX + Math.sin(now * (item.speed ?? 1) + (item.phase ?? 0)) * (item.range ?? 38)));
        }
      }

      let input = 0;
      if (keysRef.current.left) input -= 1;
      if (keysRef.current.right) input += 1;
      if (controlMode === "motion" && orientationRef.current.calibrated) {
        const raw = orientationRef.current.tilt - orientationRef.current.baseline;
        input = Math.abs(raw) < 2.2 ? 0 : Math.max(-1, Math.min(1, (raw - Math.sign(raw) * 2.2) / 15));
      } else if (pointerRef.current.active) input = Math.max(-1, Math.min(1, (pointerRef.current.x - state.beeX) / 58));
      const horizontalLimit = 345;
      const targetVx = input * horizontalLimit;
      state.vx += (targetVx - state.vx) * Math.min(1, dt * 13);
      if (input === 0) state.vx *= Math.pow(.9, dt * 60);
      if (state.vx > 32) state.facing = 1;
      else if (state.vx < -32) state.facing = -1;

      for (const item of state.airItems) {
        if (item.used || item.kind !== "blackHole") continue;
        const dx = item.x - state.beeX;
        const dy = item.y - state.beeY;
        const distance = Math.max(28, Math.hypot(dx, dy));
        if (distance < 150) {
          const pull = (1 - distance / 150) * 260 * (item.strength ?? 1);
          state.vx += dx / distance * pull * dt;
          state.vy += dy / distance * pull * .45 * dt;
        }
      }

      const oldFoot = state.beeY - 27;
      state.beeX += state.vx * dt;
      if (state.beeX < -25) state.beeX = WIDTH + 25;
      if (state.beeX > WIDTH + 25) state.beeX = -25;
      if (state.rocketTimer > 0) state.vy = ROCKET_SPEED;
      else if (state.copterTimer > 0) state.vy = COPTER_SPEED;
      else if (state.windTimer > 0) state.vy = WIND_SPEED;
      else state.vy -= GRAVITY * dt;
      state.beeY += state.vy * dt;
      const newFoot = state.beeY - 27;

      if (state.rocketTimer <= 0 && state.copterTimer <= 0 && state.vy < 0) {
        const landing = state.platforms.find((p) => {
          if (p.breaking >= .38) return false;
          const half = p.width / 2 + 11;
          return oldFoot >= p.y && newFoot <= p.y && state.beeX >= p.x - half && state.beeX <= p.x + half;
        });
        if (landing) {
          const sy = screenY(landing.y, state.cameraY);
          if (landing.kind === "broken") {
            if (state.shield > 0) {
              state.shield = 0;
              state.beeY = landing.y + 27;
              state.vy = JUMP_SPEED;
              landing.kind = "flower";
              landing.used = true;
              playGameSound("shield");
              burst(state, landing.x, sy, "#ffd84d", 20);
            } else {
              landing.breaking = .01;
              playGameSound("break");
              burst(state, landing.x, sy, "#c7aaa0", 13);
            }
          } else {
            state.beeY = landing.y + 27;
            state.vy = landing.kind === "spring" ? SPRING_SPEED : landing.kind === "windFlower" ? WIND_SPEED : JUMP_SPEED;
            if (landing.kind === "windFlower") state.windTimer = WIND_FLIGHT_TIME;
            if (landing.kind === "fading") landing.breaking = .01;
            if (!landing.used && landing.kind === "spring") {
              playGameSound("spring");
              burst(state, landing.x, sy, "#fff0a0", 15);
            } else if (!landing.used && landing.kind === "windFlower") {
              playGameSound("wind");
              burst(state, landing.x, sy, "#c9fff0", 18);
            } else playGameSound("bounce");
            landing.used = true;
          }
        }
      }

      const beeScreenY = screenY(state.beeY, state.cameraY);
      for (const shot of state.shots) {
        shot.y += shot.vy * dt;
        shot.life -= dt;
        for (const item of state.airItems) {
          const isShootableMonster = item.kind === "bear" || item.kind === "hornet" || item.kind === "bat";
          if (item.used || !isShootableMonster || Math.hypot(item.x - shot.x, item.y - shot.y) > 36) continue;
          item.used = true;
          shot.life = 0;
          state.bonusHoney += 100;
          playGameSound("hit");
          burst(state, item.x, screenY(item.y, state.cameraY), "#ffd12f", 20);
          break;
        }
      }
      state.shots = state.shots.filter((shot) => shot.life > 0 && shot.y < state.cameraY + HEIGHT * 1.5);
      for (const item of state.airItems) {
        if (item.used) continue;
        const sy = screenY(item.y, state.cameraY);
        const hitRadius = item.kind === "honeyJar" ? 37
          : item.kind === "rocket" || item.kind === "bambooCopter" ? 43
          : item.kind === "waxShield" ? 36
          : item.kind === "blackHole" ? 31
          : item.kind === "bear" ? 38
          : 35;
        if (Math.hypot(item.x - state.beeX, sy - beeScreenY) > hitRadius) continue;
        if (item.kind === "honeyJar") {
          item.used = true;
          const value = item.value ?? 20;
          state.bonusHoney += value;
          state.ammoProgress += 1;
          if (state.ammoProgress >= 3) {
            state.ammoProgress -= 3;
            state.ammo = Math.min(2, state.ammo + 1);
          }
          playGameSound("honey");
          burst(state, item.x, sy, "#ffd34d", 18);
        } else if (item.kind === "waxShield") {
          item.used = true;
          state.shield = 1;
          state.invincible = .55;
          playGameSound("shield");
          burst(state, item.x, sy, "#ffe36a", 22);
        } else if (item.kind === "rocket") {
          item.used = true;
          state.rocketTimer = ROCKET_FLIGHT_TIME;
          state.copterTimer = 0;
          state.windTimer = 0;
          state.vy = ROCKET_SPEED;
          playGameSound("rocket");
          burst(state, item.x, sy, "#ffb62b", 18);
        } else if (item.kind === "bambooCopter") {
          item.used = true;
          state.copterTimer = COPTER_FLIGHT_TIME;
          state.windTimer = 0;
          state.vy = COPTER_SPEED;
          playGameSound("copter");
          burst(state, item.x, sy, "#8dd477", 18);
        } else if (item.kind === "bear" || item.kind === "hornet" || item.kind === "bat") {
          const stomped = state.vy < 0 && state.beeY > item.y + 18;
          if (stomped) {
            item.used = true;
            state.bonusHoney += 100;
            state.vy = JUMP_SPEED * .9;
            playGameSound("hit");
            burst(state, item.x, sy, "#ffbd23", 20);
          } else if (state.shield > 0) {
            state.shield = 0;
            state.invincible = 1.1;
            item.used = true;
            state.vy = Math.max(state.vy, JUMP_SPEED * .72);
            playGameSound("shield");
            burst(state, item.x, sy, "#ffe36a", 24);
          } else {
            state.ended = true;
            state.honey = Math.floor(heightMeters(state.highest)) + state.bonusHoney;
            playGameSound("fail");
            onFail(state.honey);
            break;
          }
        } else if (item.kind === "blackHole") {
          state.ended = true;
          state.honey = Math.floor(heightMeters(state.highest)) + state.bonusHoney;
          playGameSound("fail");
          onFail(state.honey);
          break;
        } else if (item.kind === "web") {
          state.ended = true;
          state.honey = Math.floor(heightMeters(state.highest)) + state.bonusHoney;
          playGameSound("fail");
          onFail(state.honey);
          break;
        }
      }

      for (const p of state.platforms) if (p.breaking > 0) p.breaking += dt;
      state.highest = Math.max(state.highest, state.beeY);
      state.honey = Math.floor(heightMeters(state.highest)) + state.bonusHoney;
      const targetCamera = Math.max(0, state.highest - 300);
      state.cameraY += (targetCamera - state.cameraY) * Math.min(1, dt * 4.4);
      generateWorld(state, state.cameraY + HEIGHT * 2.5);
      state.platforms = state.platforms.filter((p) => p.y > state.cameraY - 180);
      state.airItems = state.airItems.filter((item) => item.y > state.cameraY - 180);
      state.particles = state.particles.map((p) => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, vy: p.vy + 70 * dt, life: p.life - dt })).filter((p) => p.life > 0);
      onStats(state.honey, heightMeters(state.highest), state.ammo);
      if (!state.ended && state.beeY < state.cameraY - 95) {
        state.ended = true;
        playGameSound("fail");
        onFail(state.honey);
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
    return () => {
      cancelAnimationFrame(frameRef.current);
      setBearDangerSound(false);
      setBlackHoleDangerSound(false);
    };
  }, [controlMode, onFail, onStats, resetToken]);

  const setPointer = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    pointerRef.current.x = (clientX - rect.left) / rect.width * WIDTH;
  };
  const firePollen = () => {
    const state = stateRef.current;
    if (phaseRef.current !== "playing" || state.ammo <= 0) {
      if (phaseRef.current === "playing") {
        playGameSound("empty");
      }
      return;
    }
    state.ammo -= 1;
    state.shots.push({ x: state.beeX, y: state.beeY + 30, vy: 650, life: 1.25 });
    playGameSound("shoot");
  };
  return <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="game-canvas" aria-label="无限向上的小蜜蜂花台跳跃游戏" onPointerDown={(event) => {
    setPointer(event.clientX);
    pointerRef.current = { ...pointerRef.current, active: true, startX: event.clientX, startTime: performance.now(), moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }} onPointerMove={(event) => {
    if (!pointerRef.current.active) return;
    if (Math.abs(event.clientX - pointerRef.current.startX) > 12) pointerRef.current.moved = true;
    setPointer(event.clientX);
  }} onPointerUp={() => {
    const pointer = pointerRef.current;
    if (!pointer.moved && performance.now() - pointer.startTime < 240) firePollen();
    pointer.active = false;
  }} onPointerCancel={() => { pointerRef.current.active = false; }} />;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("menu");
  const [controlMode, setControlMode] = useState<ControlMode>("motion");
  const [resetToken, setResetToken] = useState(0);
  const [stats, setStats] = useState({ honey: 0, height: 0, ammo: 1 });
  const [result, setResult] = useState({ honey: 0 });
  const [best, setBest] = useState(0);
  const [motionUnavailable, setMotionUnavailable] = useState(false);
  const [motionNotice, setMotionNotice] = useState("");
  const finishLock = useRef(false);
  const motionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    prepareBackgroundMusic();
    const timer = window.setTimeout(() => setBest(Number(localStorage.getItem("honeybee-harvest-v3") || 0)), 500);
    return () => {
      window.clearTimeout(timer);
      if (motionTimerRef.current) window.clearTimeout(motionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setBackgroundMusic(phase === "playing");
  }, [phase]);

  useEffect(() => () => setBackgroundMusic(false), []);

  const onMotionDetected = useCallback(() => {
    if (motionTimerRef.current) window.clearTimeout(motionTimerRef.current);
    motionTimerRef.current = null;
    setMotionUnavailable(false);
    setMotionNotice("体感已连接 · 左右晃动手机");
  }, []);

  const onStats = useCallback((honey: number, height: number, ammo: number) => {
    setStats((old) => old.honey === honey && Math.floor(old.height) === Math.floor(height) && old.ammo === ammo ? old : { honey, height, ammo });
  }, []);
  const onFail = useCallback((honey: number) => {
    if (finishLock.current) return;
    finishLock.current = true;
    const nextBest = Math.max(best, honey);
    setBest(nextBest);
    localStorage.setItem("honeybee-harvest-v3", String(nextBest));
    setResult({ honey });
    setPhase("failed");
  }, [best]);
  const startGame = () => {
    unlockGameAudio();
    setBackgroundMusic(true);
    playGameSound("start");
    finishLock.current = false;
    setStats({ honey: 0, height: 0, ammo: 1 });
    setResetToken((value) => value + 1);
    setPhase("playing");
  };
  const requestMotion = async () => {
    unlockGameAudio();
    setBackgroundMusic(true);
    setMotionUnavailable(false);
    setMotionNotice("");
    try {
      if (!window.isSecureContext) throw new Error("secure-context");
      if (!("DeviceOrientationEvent" in window)) throw new Error("unsupported");
      type PermissionEvent = { requestPermission?: () => Promise<"granted" | "denied"> };
      const orientationEvent = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & PermissionEvent;
      const motionEvent = window.DeviceMotionEvent as typeof DeviceMotionEvent & PermissionEvent;
      const requests: Promise<"granted" | "denied">[] = [];
      if (typeof orientationEvent.requestPermission === "function") requests.push(orientationEvent.requestPermission());
      if (typeof motionEvent?.requestPermission === "function") requests.push(motionEvent.requestPermission());
      const permissions = await Promise.all(requests);
      if (permissions.some((permission) => permission !== "granted")) throw new Error("denied");
      setControlMode("motion");
      setMotionNotice("正在连接体感…");
      startGame();
      motionTimerRef.current = window.setTimeout(() => {
        setMotionUnavailable(true);
        setMotionNotice("没有收到体感数据，请确认浏览器已允许动作与方向访问");
      }, 2600);
    } catch {
      setBackgroundMusic(false);
      setMotionUnavailable(false);
      setMotionNotice("");
      setControlMode("touch");
      startGame();
    }
  };

  return (
    <main className="page-shell">
      <section className="brand-panel" aria-label="游戏介绍">
        <div className="brand-mark"><span>蜜</span></div>
        <p className="eyebrow">ENDLESS HONEY JUMP</p>
        <h1>小蜜蜂<br /><em>无限采蜜</em></h1>
        <p className="brand-copy">自动飞跃、左右操控。花台会逐渐变少、变窄，避开裂花和涂鸦怪，冲击更高采蜜值。</p>
        <div className="score-rule"><span>🏆</span><div><strong>采蜜值就是唯一成绩</strong><small>向上攀升和蜂蜜罐都会加分</small></div></div>
        <div className="control-tip"><div className="phone-tilt" aria-hidden="true"><span>↔</span></div><div><strong>只控制左右</strong><small>跳跃与上升完全自动</small></div></div>
        <div className="legend"><span><i className="dot flower-dot" />粉花安全</span><span><i className="dot bear-dot" />涂鸦怪危险</span></div>
      </section>

      <section className="game-phone">
        <GameCanvas phase={phase} controlMode={controlMode} resetToken={resetToken} onStats={onStats} onFail={onFail} onMotionDetected={onMotionDetected} />
        <header className="game-hud" aria-live="polite">
          <div className="hud-pill score-pill"><span className="honey-drop" /><span><small>采蜜值</small><b>{stats.honey}</b></span></div>
        </header>

        {phase === "menu" && <div className="game-overlay intro-overlay">
          <div className="cover-frame cover-frame-v2">
            <div className="cover-logo-v2" role="img" aria-label="小蜜蜂采蜜世界，飞过花园，收集甜甜蜂蜜" />
            <div className="cover-actions">
              <button className="cover-primary" onClick={requestMotion}>开始采蜜</button>
            </div>
            <div className="cover-motion-v2" aria-label="左右晃动控制方向">
              <span>←</span><i>☝</i><span>→</span>
              <b>左右晃动控制方向</b>
            </div>
          </div>
        </div>}
        {phase === "playing" && <button className="pause-button" onClick={() => setPhase("paused")} aria-label="暂停游戏">Ⅱ</button>}
        {phase === "paused" && <div className="game-overlay pause-overlay"><div className="modal-card compact-card"><span className="modal-icon">🌼</span><p className="intro-kicker">休息一下</p><h2>采蜜暂停</h2><p>当前采蜜值已为你保留。</p><button className="primary-button" onClick={() => setPhase("playing")}>继续采蜜</button><button className="text-button" onClick={() => setPhase("menu")}>返回首页</button></div></div>}
        {phase === "failed" && <div className="game-overlay result-overlay result-overlay-v2">
          <div className="result-float-layer" aria-hidden="true">
            <i className="result-float result-drop float-one" />
            <i className="result-float result-petal float-two" />
            <i className="result-float result-spark float-three" />
            <i className="result-float result-drop float-four" />
            <i className="result-float result-petal float-five" />
            <i className="result-float result-spark float-six" />
          </div>
          <div className="result-hero-v3" aria-hidden="true" />
          <div className="result-sheet result-sheet-v2">
            <h2>{result.honey >= best ? "刷新最高纪录！" : "这次飞得不错！"}</h2>
            <p className="result-copy">{result.honey >= best ? "新的采蜜纪录已经写进蜂巢荣誉榜。" : "花园上空还有更多蜂蜜，休息一下再出发。"}</p>
            <div className="result-main-score">
              <small>本次采蜜值</small>
              <strong><span className="honey-drop large" />{result.honey}</strong>
            </div>
            <div className="result-stats">
              <div><small>最高纪录</small><strong>{best}</strong></div>
            </div>
            <button className="result-leaderboard" type="button" data-leaderboard-entry>
              <span aria-hidden="true">♛</span><b>排行榜</b><i aria-hidden="true">›</i>
            </button>
            <div className="result-actions">
              <button className="result-primary" onClick={startGame}>再飞一次</button>
              <button className="result-secondary" onClick={() => setPhase("menu")}>返回花园</button>
            </div>
          </div>
        </div>}
        {phase === "playing" && controlMode === "touch" && <div className="touch-hint">按住拖动控制左右</div>}
        {phase === "playing" && controlMode === "motion" && <div className="touch-hint">晃动控制左右</div>}
        {phase === "playing" && controlMode === "motion" && motionNotice && <div className={`motion-status${motionUnavailable ? " is-error" : ""}`}><span />{motionNotice}</div>}
      </section>
    </main>
  );
}
