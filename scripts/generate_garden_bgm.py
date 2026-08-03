"""Generate the original seamless background loop used by the game."""

from __future__ import annotations

import math
import wave
from pathlib import Path

import numpy as np


SAMPLE_RATE = 22_050
BPM = 96
BEAT_SECONDS = 60 / BPM
BAR_BEATS = 4
BAR_COUNT = 8
DURATION = BEAT_SECONDS * BAR_BEATS * BAR_COUNT
FRAME_COUNT = round(SAMPLE_RATE * DURATION)
OUTPUT = Path(__file__).parents[1] / "public" / "sfx" / "garden-flight-theme.wav"

rng = np.random.default_rng(20260803)
mix = np.zeros(FRAME_COUNT, dtype=np.float64)


def frequency(midi_note: int) -> float:
    return 440 * 2 ** ((midi_note - 69) / 12)


def place(signal: np.ndarray, start_seconds: float) -> None:
    start = round(start_seconds * SAMPLE_RATE)
    indexes = (start + np.arange(signal.size)) % FRAME_COUNT
    np.add.at(mix, indexes, signal)


def envelope(length: int, attack: float, release: float) -> np.ndarray:
    values = np.ones(length)
    attack_frames = max(1, round(attack * SAMPLE_RATE))
    release_frames = max(1, round(release * SAMPLE_RATE))
    values[:attack_frames] = np.sin(np.linspace(0, math.pi / 2, attack_frames)) ** 2
    values[-release_frames:] *= np.cos(np.linspace(0, math.pi / 2, release_frames)) ** 2
    return values


def add_pad(start_beat: float, midi_note: int, volume: float = 0.026) -> None:
    duration = BAR_BEATS * BEAT_SECONDS + 0.55
    length = round(duration * SAMPLE_RATE)
    t = np.arange(length) / SAMPLE_RATE
    f = frequency(midi_note)
    slow_drift = 1 + 0.0015 * np.sin(2 * math.pi * 0.18 * t)
    phase = 2 * math.pi * f * np.cumsum(slow_drift) / SAMPLE_RATE
    tone = np.sin(phase) + 0.18 * np.sin(phase * 2 + 0.4) + 0.07 * np.sin(phase * 3 + 1.1)
    tone *= envelope(length, 0.32, 0.72) * volume
    place(tone, start_beat * BEAT_SECONDS)


def add_bass(start_beat: float, midi_note: int) -> None:
    duration = 1.55 * BEAT_SECONDS
    length = round(duration * SAMPLE_RATE)
    t = np.arange(length) / SAMPLE_RATE
    phase = 2 * math.pi * frequency(midi_note) * t
    tone = np.sin(phase) + 0.1 * np.sin(phase * 2)
    tone *= envelope(length, 0.035, 0.45) * 0.055
    place(tone, start_beat * BEAT_SECONDS)


def add_kalimba(start_beat: float, midi_note: int, volume: float = 0.07) -> None:
    duration = 0.9
    length = round(duration * SAMPLE_RATE)
    t = np.arange(length) / SAMPLE_RATE
    f = frequency(midi_note)
    decay = np.exp(-5.4 * t)
    tone = (
        np.sin(2 * math.pi * f * t)
        + 0.32 * np.sin(2 * math.pi * f * 2.01 * t + 0.3)
        + 0.11 * np.sin(2 * math.pi * f * 3.98 * t + 0.9)
    )
    click = rng.normal(0, 1, length) * np.exp(-42 * t) * 0.035
    tone = (tone * decay + click) * envelope(length, 0.006, 0.26) * volume
    place(tone, start_beat * BEAT_SECONDS)


def add_shaker(start_beat: float, volume: float = 0.0065) -> None:
    duration = 0.11
    length = round(duration * SAMPLE_RATE)
    noise = rng.normal(0, 1, length)
    noise[1:] -= noise[:-1] * 0.86
    noise *= np.exp(-31 * np.arange(length) / SAMPLE_RATE) * volume
    place(noise, start_beat * BEAT_SECONDS)


chords = [
    ([48, 55, 59, 64], 36),  # Cmaj7
    ([47, 55, 59, 62], 43),  # G/B
    ([45, 52, 55, 60], 45),  # Am7
    ([41, 48, 52, 57], 41),  # Fmaj7
    ([48, 55, 59, 64], 36),
    ([40, 47, 50, 55], 40),  # Em7
    ([41, 48, 52, 57], 41),
    ([43, 50, 53, 59], 43),  # G7
]

melody = [
    [72, None, 76, 79, None, 76, 74, None],
    [71, None, 74, 79, None, 74, 71, None],
    [69, None, 72, 76, None, 72, 71, None],
    [69, None, 72, 77, None, 76, 72, None],
    [72, None, 76, 79, 81, None, 79, None],
    [71, None, 74, 79, None, 76, 74, None],
    [69, None, 72, 77, 76, None, 72, None],
    [71, None, 74, 79, 77, 74, 71, None],
]

for bar, ((pad_notes, root), notes) in enumerate(zip(chords, melody, strict=True)):
    bar_start = bar * BAR_BEATS
    for index, note in enumerate(pad_notes):
        add_pad(bar_start, note, 0.022 if index < 2 else 0.018)
    add_bass(bar_start, root)
    add_bass(bar_start + 2, root + (7 if bar not in {2, 5} else 3))
    for step, note in enumerate(notes):
        if note is not None:
            add_kalimba(bar_start + step / 2, note, 0.062 if step else 0.071)
    for half_beat in range(1, 8, 2):
        add_shaker(bar_start + half_beat / 2)

# A pair of very soft chimes marks the two halves without turning the loop into a jingle.
add_kalimba(0, 84, 0.028)
add_kalimba(16, 86, 0.024)

# Circular echoes keep the file seamless at its loop boundary.
mix += np.roll(mix, round(0.31 * SAMPLE_RATE)) * 0.105
mix += np.roll(mix, round(0.62 * SAMPLE_RATE)) * 0.045

# Gentle saturation and conservative loudness leave space for gameplay effects.
mix -= np.mean(mix)
mix = np.tanh(mix * 1.35)
peak = np.max(np.abs(mix))
mix = mix / peak * 0.68
pcm = np.int16(np.clip(mix, -1, 1) * 32767)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(OUTPUT), "wb") as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(SAMPLE_RATE)
    output.writeframes(pcm.tobytes())

print(f"Generated {OUTPUT} ({DURATION:.1f}s, {OUTPUT.stat().st_size / 1024:.0f} KiB)")
