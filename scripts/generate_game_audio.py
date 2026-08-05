"""Generate original looping warning effects for the honeybee game."""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path


SAMPLE_RATE = 24_000
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "sfx"


def write_loop(name: str, duration: float, sample_fn, target_peak: float = 0.86) -> None:
    frame_count = round(SAMPLE_RATE * duration)
    samples = [sample_fn(index / SAMPLE_RATE, duration) for index in range(frame_count)]
    peak = max(abs(sample) for sample in samples) or 1
    gain = target_peak / peak
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
    # Keep most energy in the 160-620 Hz range so the warning stays clear on
    # small phone speakers. The old loop concentrated too much energy below
    # 100 Hz and was easily masked by the background music.
    pulse = 0.42 + 0.58 * max(0, math.sin(phase * 4 - 0.35)) ** 2
    wobble = 3.4 * math.sin(phase * 2) + 1.2 * math.sin(phase * 5)
    throat = math.sin(phase * 330 + wobble)
    mid_growl = math.sin(phase * 700 + wobble * 0.72)
    alarm_call = math.sin(phase * 980 + 6.2 * math.sin(phase * 2))
    rasp = periodic_noise(phase) * (0.28 + 0.2 * pulse)
    return pulse * (0.34 * throat + 0.3 * mid_growl + 0.25 * alarm_call + 0.11 * rasp)


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
    write_loop("monster-warning-v3.wav", 2.0, monster_warning, target_peak=0.96)
    write_loop("black-hole-v2.wav", 3.2, black_hole)
