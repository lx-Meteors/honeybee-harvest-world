"""Generate the original AI-composed seamless background loop for the game.

The composition, melody, arrangement, and synthesized timbres in this file are
newly authored for 小蜜蜂采蜜世界. It uses no samples or source recordings.
"""

from __future__ import annotations

import math
import wave
from pathlib import Path

import numpy as np


SAMPLE_RATE = 24_000
BPM = 112
BEAT = 60 / BPM
BAR_BEATS = 4
BAR_COUNT = 8
DURATION = BEAT * BAR_BEATS * BAR_COUNT
FRAME_COUNT = round(SAMPLE_RATE * DURATION)
OUTPUT = Path(__file__).parents[1] / "public" / "sfx" / "ai-honey-garden-theme-v1.wav"

rng = np.random.default_rng(20260804)
mix = np.zeros(FRAME_COUNT, dtype=np.float64)


def hz(midi: int) -> float:
    return 440 * 2 ** ((midi - 69) / 12)


def add(signal: np.ndarray, start_beat: float) -> None:
    start = round(start_beat * BEAT * SAMPLE_RATE)
    indexes = (start + np.arange(signal.size)) % FRAME_COUNT
    np.add.at(mix, indexes, signal)


def envelope(length: int, attack: float, release: float, sustain: float = 1.0) -> np.ndarray:
    values = np.full(length, sustain, dtype=np.float64)
    attack_frames = min(length, max(1, round(attack * SAMPLE_RATE)))
    release_frames = min(length, max(1, round(release * SAMPLE_RATE)))
    values[:attack_frames] *= np.sin(np.linspace(0, math.pi / 2, attack_frames)) ** 2
    values[-release_frames:] *= np.cos(np.linspace(0, math.pi / 2, release_frames)) ** 2
    return values


def kalimba(start: float, midi: int, volume: float = 0.060, length_seconds: float = 0.72) -> None:
    length = round(length_seconds * SAMPLE_RATE)
    t = np.arange(length) / SAMPLE_RATE
    f = hz(midi)
    body = (
        np.sin(2 * math.pi * f * t)
        + 0.34 * np.sin(2 * math.pi * f * 2.01 * t + 0.24)
        + 0.12 * np.sin(2 * math.pi * f * 3.97 * t + 0.62)
    )
    sparkle = rng.normal(0, 1, length) * np.exp(-55 * t) * 0.045
    signal = (body * np.exp(-5.7 * t) + sparkle) * envelope(length, 0.004, 0.24) * volume
    add(signal, start)


def soft_pluck(start: float, midi: int, volume: float = 0.034, length_beats: float = 1.5) -> None:
    length = round(length_beats * BEAT * SAMPLE_RATE)
    t = np.arange(length) / SAMPLE_RATE
    f = hz(midi)
    phase_wobble = 0.018 * np.sin(2 * math.pi * 4.2 * t)
    signal = (
        np.sin(2 * math.pi * f * t + phase_wobble)
        + 0.21 * np.sin(2 * math.pi * f * 2 * t + 0.3)
        + 0.08 * np.sin(2 * math.pi * f * 3 * t + 0.8)
    )
    signal *= np.exp(-3.4 * t) * envelope(length, 0.012, 0.32) * volume
    add(signal, start)


def warm_pad(start: float, notes: list[int], volume: float = 0.011) -> None:
    length = round((BAR_BEATS * BEAT + 0.72) * SAMPLE_RATE)
    t = np.arange(length) / SAMPLE_RATE
    signal = np.zeros(length)
    for index, midi in enumerate(notes):
        f = hz(midi)
        drift = 0.0022 * np.sin(2 * math.pi * (0.15 + index * 0.025) * t + index)
        phase = 2 * math.pi * f * t + drift
        signal += np.sin(phase) + 0.10 * np.sin(phase * 2 + 0.5)
    signal /= max(1, len(notes))
    signal *= envelope(length, 0.34, 0.72, 0.82) * volume
    add(signal, start)


def bass(start: float, midi: int, volume: float = 0.040) -> None:
    length = round(1.65 * BEAT * SAMPLE_RATE)
    t = np.arange(length) / SAMPLE_RATE
    f = hz(midi)
    signal = (np.sin(2 * math.pi * f * t) + 0.12 * np.sin(4 * math.pi * f * t + 0.2))
    signal *= envelope(length, 0.018, 0.42) * volume
    add(signal, start)


def shaker(start: float, accent: float = 1.0) -> None:
    length = round(0.10 * SAMPLE_RATE)
    t = np.arange(length) / SAMPLE_RATE
    noise = rng.normal(0, 1, length)
    noise[1:] -= noise[:-1] * 0.91
    noise *= np.exp(-38 * t) * 0.0048 * accent
    add(noise, start)


def soft_pop(start: float, volume: float = 0.012) -> None:
    length = round(0.16 * SAMPLE_RATE)
    t = np.arange(length) / SAMPLE_RATE
    sweep = 118 * np.exp(-9 * t) + 74
    phase = 2 * math.pi * np.cumsum(sweep) / SAMPLE_RATE
    signal = np.sin(phase) * np.exp(-25 * t) * volume
    add(signal, start)


# Original bright D-major progression; each entry is (pad chord, bass root).
progression = [
    ([50, 57, 61, 64], 38),  # Dmaj9
    ([49, 57, 61, 64], 37),  # A/C# colour
    ([47, 54, 57, 62], 35),  # Bm7
    ([43, 50, 54, 57], 31),  # Gmaj9
    ([45, 52, 55, 59], 33),  # Em7
    ([45, 52, 57, 62], 33),  # A7sus/Em colour
    ([42, 50, 54, 57], 30),  # D/F# colour
    ([45, 52, 56, 61], 33),  # A7
]

# Newly written two-bar call-and-response phrases. None are derived from the
# previous CC0 track; rests keep the loop relaxed rather than overly busy.
melody = [
    [74, None, 78, 81, 78, None, 76, None],
    [73, 76, None, 81, None, 78, 76, None],
    [71, None, 74, 78, 76, None, 74, None],
    [71, 74, 79, None, 78, 74, None, 71],
    [76, None, 79, 83, None, 81, 79, None],
    [73, 76, 81, None, 78, None, 76, 73],
    [74, None, 78, 81, 83, None, 81, 78],
    [76, 73, None, 69, 71, 73, 74, None],
]

for bar, ((chord, root), phrase) in enumerate(zip(progression, melody, strict=True)):
    bar_start = bar * BAR_BEATS
    warm_pad(bar_start, chord)
    bass(bar_start, root)
    bass(bar_start + 2, root + (7 if bar not in {2, 4} else 3), 0.032)
    for chord_beat in (0, 1.5, 2.5):
        for note_index, note in enumerate(chord[1:]):
            soft_pluck(bar_start + chord_beat + note_index * 0.035, note + 12, 0.018)
    for step, note in enumerate(phrase):
        if note is not None:
            kalimba(bar_start + step / 2, note, 0.052 if step else 0.061)
    for half_beat in range(1, 8):
        shaker(bar_start + half_beat / 2, 1.18 if half_beat in {2, 6} else 0.82)
    soft_pop(bar_start, 0.010)
    soft_pop(bar_start + 2, 0.007)

# Small high-register answers create a floating garden feeling.
for beat_position, note in [(3.25, 86), (11.5, 88), (19.25, 85), (27.5, 86)]:
    kalimba(beat_position, note, 0.023, 0.92)

# Circular echoes make the file loop seamlessly while retaining clear attacks.
mix += np.roll(mix, round(0.29 * SAMPLE_RATE)) * 0.095
mix += np.roll(mix, round(0.58 * SAMPLE_RATE)) * 0.042

# Remove DC, gently saturate, and leave headroom for game sound effects.
mix -= np.mean(mix)
mix = np.tanh(mix * 1.42)
peak = float(np.max(np.abs(mix)))
mix = mix / peak * 0.72
pcm = np.int16(np.clip(mix, -1, 1) * 32767)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(OUTPUT), "wb") as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(SAMPLE_RATE)
    output.writeframes(pcm.tobytes())

print(f"Generated {OUTPUT} ({DURATION:.2f}s, {OUTPUT.stat().st_size / 1024:.0f} KiB)")
