import { getSettings } from "@/lib/settings";

/** Small synthesized sound effects (Web Audio), no files needed. */
export type SoundName = "move" | "capture" | "check" | "correct" | "wrong" | "complete" | "tick" | "select";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface Tone {
  freq: number;
  start: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
}

function tones(list: Tone[]) {
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime + 0.01;
  for (const t of list) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = t.type ?? "sine";
    osc.frequency.setValueAtTime(t.freq, now + t.start);
    if (t.slideTo) osc.frequency.exponentialRampToValueAtTime(t.slideTo, now + t.start + t.dur);
    const peak = t.gain ?? 0.18;
    g.gain.setValueAtTime(0.0001, now + t.start);
    g.gain.exponentialRampToValueAtTime(peak, now + t.start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t.start + t.dur);
    osc.connect(g).connect(ac.destination);
    osc.start(now + t.start);
    osc.stop(now + t.start + t.dur + 0.02);
  }
}

/** A short wooden "tock": filtered noise burst. */
function knock(level = 0.5, pitch = 900) {
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime + 0.005;
  const len = Math.floor(ac.sampleRate * 0.06);
  const buffer = ac.createBuffer(1, len, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = pitch;
  filter.Q.value = 1.2;
  const g = ac.createGain();
  g.gain.value = level;
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(now);
}

export function playSound(name: SoundName): void {
  if (!getSettings().sound) return;
  switch (name) {
    case "select":
      return knock(0.18, 1400);
    case "move":
      return knock(0.55, 850);
    case "capture":
      knock(0.6, 700);
      return tones([{ freq: 220, start: 0.02, dur: 0.09, type: "triangle", gain: 0.08 }]);
    case "check":
      knock(0.5, 850);
      return tones([{ freq: 880, start: 0.03, dur: 0.12, type: "square", gain: 0.05 }]);
    case "tick":
      return tones([{ freq: 1320, start: 0, dur: 0.06, type: "sine", gain: 0.1 }]);
    case "correct":
      return tones([
        { freq: 660, start: 0, dur: 0.12, type: "sine", gain: 0.16 },
        { freq: 990, start: 0.09, dur: 0.18, type: "sine", gain: 0.14 },
      ]);
    case "wrong":
      return tones([{ freq: 220, start: 0, dur: 0.22, type: "sawtooth", gain: 0.06, slideTo: 150 }]);
    case "complete":
      return tones([
        { freq: 523, start: 0, dur: 0.16, gain: 0.14 },
        { freq: 659, start: 0.12, dur: 0.16, gain: 0.14 },
        { freq: 784, start: 0.24, dur: 0.16, gain: 0.14 },
        { freq: 1047, start: 0.36, dur: 0.35, gain: 0.15 },
      ]);
  }
}

/** Sound for a move by flags/SAN. */
export function moveSound(m: { captured?: string; san: string }): SoundName {
  if (m.san.includes("+") || m.san.includes("#")) return "check";
  return m.captured ? "capture" : "move";
}
