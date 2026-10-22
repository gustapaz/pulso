import { audible, stepDuration, wav, type Session } from "./model";
type Context = AudioContext | OfflineAudioContext;
function voice(
  ctx: Context,
  out: AudioNode,
  index: number,
  time: number,
  level: number,
) {
  const gain = ctx.createGain();
  gain.connect(out);
  const oscillator = ctx.createOscillator();
  if (index === 0 || index === 3) {
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(index === 0 ? 145 : 240, time);
    oscillator.frequency.exponentialRampToValueAtTime(
      index === 0 ? 42 : 85,
      time + 0.2,
    );
    gain.gain.setValueAtTime(level * 0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.38);
    oscillator.connect(gain);
    oscillator.start(time);
    oscillator.stop(time + 0.4);
  } else {
    const duration = index === 1 ? 0.18 : 0.065,
      buffer = ctx.createBuffer(
        1,
        Math.ceil(ctx.sampleRate * duration),
        ctx.sampleRate,
      ),
      data = buffer.getChannelData(0);
    // A seeded noise source keeps live playback and offline export repeatable.
    let seed = 3721;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = index === 1 ? 900 : 6500;
    noise.connect(filter);
    filter.connect(gain);
    gain.gain.setValueAtTime(level * (index === 1 ? 0.45 : 0.32), time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    noise.start(time);
    noise.stop(time + duration);
    if (index === 1) {
      oscillator.type = "triangle";
      oscillator.frequency.value = 175;
      const tone = ctx.createGain();
      tone.gain.setValueAtTime(level * 0.18, time);
      tone.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
      oscillator.connect(tone);
      tone.connect(out);
      oscillator.start(time);
      oscillator.stop(time + 0.12);
    }
  }
}
export class Engine {
  ctx: AudioContext | null = null;
  bus: GainNode | null = null;
  limiter: DynamicsCompressorNode | null = null;
  timer: ReturnType<typeof setInterval> | undefined;
  nextTime = 0;
  nextStep = 0;
  run = 0;
  async init() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const limiter = this.ctx.createDynamicsCompressor();
      this.limiter = limiter;
      limiter.threshold.value = -8;
      limiter.ratio.value = 12;
      limiter.connect(this.ctx.destination);
    }
    this.connectBus();
    await this.ctx.resume();
  }
  connectBus() {
    if (!this.bus && this.ctx && this.limiter) {
      this.bus = this.ctx.createGain();
      this.bus.connect(this.limiter);
    }
  }
  hit(index: number, session: Session) {
    if (this.ctx && this.bus)
      voice(
        this.ctx,
        this.bus,
        index,
        this.ctx.currentTime,
        ((session.tracks[index].volume / 100) * session.master) / 100,
      );
  }
  async start(read: () => Session, onStep: (s: number) => void) {
    await this.init();
    this.stop();
    this.connectBus();
    const run = ++this.run;
    this.nextTime = this.ctx!.currentTime + 0.06;
    this.nextStep = 0;
    const tick = () => {
      const ctx = this.ctx!;
      while (this.nextTime < ctx.currentTime + 0.1) {
        const s = read(),
          step = this.nextStep,
          time = this.nextTime;
        for (let i = 0; i < 4; i++)
          if (s.tracks[i].steps[step] && audible(s.tracks, i))
            voice(
              ctx,
              this.bus!,
              i,
              time,
              ((s.tracks[i].volume / 100) * s.master) / 100,
            );
        setTimeout(
          () => {
            if (this.run === run) onStep(step);
          },
          Math.max(0, (time - ctx.currentTime) * 1000),
        );
        this.nextTime += stepDuration(s.bpm, s.swing, step);
        this.nextStep = (step + 1) % 16;
      }
    };
    tick();
    this.timer = setInterval(tick, 25);
  }
  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.run++;
    this.bus?.disconnect();
    this.bus = null;
  }
  dispose() {
    this.stop();
    void this.ctx?.close();
  }
}
export async function renderWav(session: Session, bars: number) {
  const duration = (60 / session.bpm) * 4 * bars,
    ctx = new OfflineAudioContext(
      1,
      Math.ceil((duration + 0.5) * 44100),
      44100,
    ),
    limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.ratio.value = 12;
  limiter.connect(ctx.destination);
  let time = 0;
  for (let n = 0; n < bars * 16; n++) {
    const step = n % 16;
    session.tracks.forEach((t, i) => {
      if (t.steps[step] && audible(session.tracks, i))
        voice(ctx, limiter, i, time, ((t.volume / 100) * session.master) / 100);
    });
    time += stepDuration(session.bpm, session.swing, step);
  }
  const buffer = await ctx.startRendering();
  return wav(buffer.getChannelData(0), buffer.sampleRate);
}
