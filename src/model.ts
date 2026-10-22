export const instruments = [
  {
    name: "Bumbo",
    code: "BD",
    color: "#d4ff58",
    description: "O chão do seu groove",
  },
  {
    name: "Caixa",
    code: "SD",
    color: "#b0a1ef",
    description: "Textura e presença",
  },
  {
    name: "Chimbal",
    code: "HH",
    color: "#f0ae75",
    description: "Movimento nos detalhes",
  },
  {
    name: "Tom",
    code: "TM",
    color: "#85cece",
    description: "Um pouco de profundidade",
  },
] as const;
export type Track = {
  steps: boolean[];
  volume: number;
  muted: boolean;
  solo: boolean;
};
export type Session = {
  version: 1;
  name: string;
  bpm: number;
  swing: number;
  master: number;
  tracks: Track[];
};
export type Preset = {
  id: string;
  name: string;
  genre: string;
  bpm: number;
  swing: number;
  description: string;
  hits: number[][];
};
export const presets: Preset[] = [
  {
    id: "concreto",
    name: "Concreto",
    genre: "HOUSE",
    bpm: 120,
    swing: 0,
    description: "Quatro no chão. Um convite para não ficar parado.",
    hits: [
      [0, 4, 8, 12],
      [4, 12],
      [2, 6, 10, 14],
      [7, 15],
    ],
  },
  {
    id: "subsolo",
    name: "Subsolo",
    genre: "BOOM BAP",
    bpm: 88,
    swing: 24,
    description: "Uma batida torta, um fim de tarde sem pressa.",
    hits: [
      [0, 3, 8, 10],
      [4, 12],
      [0, 2, 4, 6, 8, 10, 12, 14],
      [11, 15],
    ],
  },
  {
    id: "orbita",
    name: "Órbita",
    genre: "BREAKBEAT",
    bpm: 132,
    swing: 8,
    description: "Percussões que encontram seu próprio caminho.",
    hits: [
      [0, 6, 10],
      [4, 11, 12],
      [0, 2, 3, 6, 8, 10, 14, 15],
      [5, 13],
    ],
  },
  {
    id: "mares",
    name: "Marés",
    genre: "DOWNTEMPO",
    bpm: 76,
    swing: 16,
    description: "Espaço entre as notas. Respire junto.",
    hits: [
      [0, 7, 10],
      [4, 12],
      [2, 6, 10, 14],
      [3, 11, 15],
    ],
  },
  {
    id: "circuito",
    name: "Circuito",
    genre: "TECHNO",
    bpm: 138,
    swing: 0,
    description: "Repetição, tensão e uma dose de eletricidade.",
    hits: [
      [0, 4, 8, 12],
      [4, 12, 15],
      [0, 2, 4, 6, 8, 10, 12, 14],
      [2, 7, 10, 13],
    ],
  },
  {
    id: "vazio",
    name: "Tela em branco",
    genre: "SEU RITMO",
    bpm: 110,
    swing: 0,
    description: "Dezesseis passos. Infinitas possibilidades.",
    hits: [[], [], [], []],
  },
];
export function fromPreset(p: Preset): Session {
  return {
    version: 1,
    name: p.name,
    bpm: p.bpm,
    swing: p.swing,
    master: 65,
    tracks: p.hits.map((h) => ({
      steps: Array.from({ length: 16 }, (_, i) => h.includes(i)),
      volume: 75,
      muted: false,
      solo: false,
    })),
  };
}
export function sanitize(value: unknown): Session {
  const v = value as Session;
  if (
    !v ||
    v.version !== 1 ||
    typeof v.name !== "string" ||
    !v.name.trim() ||
    v.name.length > 40 ||
    !Array.isArray(v.tracks) ||
    v.tracks.length !== 4
  )
    throw new Error(
      "Sessão inválida. Use um arquivo JSON exportado pelo Pulso.",
    );
  const valid = (n: unknown, min: number, max: number) =>
    typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
  if (
    !valid(v.bpm, 60, 180) ||
    !valid(v.swing, 0, 50) ||
    !valid(v.master, 0, 100)
  )
    throw new Error("Os controles da sessão estão fora do intervalo.");
  const tracks = v.tracks.map((t) => {
    if (
      !t ||
      !Array.isArray(t.steps) ||
      t.steps.length !== 16 ||
      t.steps.some((s) => typeof s !== "boolean") ||
      !valid(t.volume, 0, 100) ||
      typeof t.muted !== "boolean" ||
      typeof t.solo !== "boolean"
    )
      throw new Error("As pistas da sessão estão incompletas.");
    return {
      steps: [...t.steps],
      volume: t.volume,
      muted: t.muted,
      solo: t.solo,
    };
  });
  return {
    version: 1,
    name: v.name.trim(),
    bpm: v.bpm,
    swing: v.swing,
    master: v.master,
    tracks,
  };
}
export function audible(tracks: Track[], index: number) {
  return (
    !tracks[index].muted && (!tracks.some((t) => t.solo) || tracks[index].solo)
  );
}
export function stepDuration(bpm: number, swing: number, step: number) {
  return (60 / bpm / 4) * (1 + ((step % 2 === 0 ? 1 : -1) * swing) / 100);
}
export function wav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2),
    v = new DataView(buffer);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, buffer.byteLength - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) =>
    v.setInt16(
      44 + i * 2,
      Math.max(-1, Math.min(1, s)) * (s < 0 ? 32768 : 32767),
      true,
    ),
  );
  return buffer;
}
