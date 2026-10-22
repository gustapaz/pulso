import { test } from "node:test";
import assert from "node:assert/strict";
import {
  presets,
  fromPreset,
  sanitize,
  audible,
  stepDuration,
  wav,
} from "../src/model.ts";
test("todos os grooves têm sessões válidas e independentes", () => {
  for (const p of presets) {
    const a = fromPreset(p),
      b = fromPreset(p);
    assert.deepEqual(sanitize(a), a);
    a.tracks[0].steps[0] = !a.tracks[0].steps[0];
    assert.notDeepEqual(a, b);
  }
});
test("importação recusa dados inválidos sem aceitar pistas incompletas", () => {
  for (const value of [
    null,
    {},
    { ...fromPreset(presets[0]), bpm: 0 },
    { ...fromPreset(presets[0]), tracks: [] },
  ])
    assert.throws(() => sanitize(value));
  const s = fromPreset(presets[0]);
  s.tracks[0].steps[1] = 1 as unknown as boolean;
  assert.throws(() => sanitize(s));
});
test("solo respeita mute e silencia outras pistas", () => {
  const s = fromPreset(presets[0]);
  assert.equal(audible(s.tracks, 0), true);
  s.tracks[1].solo = true;
  assert.equal(audible(s.tracks, 0), false);
  assert.equal(audible(s.tracks, 1), true);
  s.tracks[1].muted = true;
  assert.equal(audible(s.tracks, 1), false);
});
test("swing preserva duração de cada par e do compasso", () => {
  for (const bpm of [60, 120, 180])
    for (const swing of [0, 24, 50]) {
      let total = 0;
      for (let i = 0; i < 16; i++) total += stepDuration(bpm, swing, i);
      assert.ok(Math.abs(total - 240 / bpm) < 1e-9);
      assert.ok(stepDuration(bpm, swing, 0) >= stepDuration(bpm, swing, 1));
    }
});
test("WAV contém PCM mono, duração e clipping corretos", () => {
  const b = wav(new Float32Array([-2, 0, 2]), 44100),
    v = new DataView(b);
  assert.equal(new TextDecoder().decode(b.slice(0, 4)), "RIFF");
  assert.equal(v.getUint32(40, true), 6);
  assert.equal(v.getUint32(24, true), 44100);
  assert.equal(v.getInt16(44, true), -32768);
  assert.equal(v.getInt16(48, true), 32767);
});
