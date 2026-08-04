"""Generate original looping warning effects for the honeybee game."""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path


SAMPLE_RATE = 24_000
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "sfx"


def write_loop(name: str, duration: float, sample_fn) -> None:
    frame_count = round(SAMPLE_RATE * duration)
    samples = [sample_fn(index / SAMPLE_RATE, duration) for index in range(frame_count)]
    peak = max(abs(sample) for sample in samples) or 1
    gain = 0.86 / peak
    pcm = b"".join(struct.pack("<h", round(max(-1, min(1, sample * gain)) * 32767)) for sample in samples)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUTPUT / name), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(SAMPLE_RATE)
        audio.writeframes(pcm)


def periodic_noise(phase: float) -> float:
    return (
        math.sin(phase * 113 + 0.4)
        + 0.72 * math.sin(phase * 197 + 1.8)
        + 0.5 * math.sin(phase * 331 + 2.6)
        + 0.34 * math.sin(phase * 487 + 0.9)
    ) / 2.56


def monster_warning(t: float, duration: float) -> float:
    phase = 2 * math.pi * t / duration
    breath = 0.52 + 0.28 * (1 + math.sin(phase * 2 - 0.7))
    wobble = 3.6 * math.sin(phase * 2) + 1.4 * math.sin(phase * 5)
    throat = math.sin(phase * 144 + wobble)
    growl = 0.48 * math.sin(phase * 288 + wobble * 0.62)
    call = math.sin(phase * 432 + 2.2 * math.sin(phase * 3))
    rasp = periodic_noise(phase) * (0.34 + 0.18 * math.sin(phase * 2) ** 2)
    pulse = max(0, math.sin(phase * 2 - 0.5)) ** 5
    return breath * (0.48 * throat + 0.2 * growl + 0.14 * call + 0.16 * rasp) + pulse * 0.18


def black_hole(t: float, duration: float) -> float:
    phase = 2 * math.pi * t / duration
    orbit = math.sin(phase * 3)
    rumble = math.sin(phase * 120 + 2.4 * orbit)
    sub = math.sin(phase * 72 - 1.5 * math.sin(phase * 2))
    vortex = periodic_noise(phase + 0.16 * math.sin(phase * 3))
    spiral = math.sin(phase * 360 + 8 * math.sin(phase)) * (0.4 + 0.25 * orbit**2)
    inhale = 0.58 + 0.22 * math.sin(phase - 1.1)
    return inhale * (0.35 * rumble + 0.25 * sub + 0.26 * vortex + 0.14 * spiral)


if __name__ == "__main__":
    write_loop("monster-warning-v2.wav", 2.4, monster_warning)
    write_loop("black-hole-v2.wav", 3.2, black_hole)
