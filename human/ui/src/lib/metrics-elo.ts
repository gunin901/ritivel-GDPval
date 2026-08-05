export const GOLD_ELO = 1000;

export type EloInput = {
  modelId: string;
  score: number;
  taskId: string;
};

export type EloRow = {
  modelId: string;
  elo: number;
  n: number;
};

/**
 * Bradley-Terry style Elo with gold anchored at GOLD_ELO.
 * score 1 = model win, 0.5 = tie, 0 = gold win.
 */
export function computeElo(rows: EloInput[], k = 24): EloRow[] {
  const elo = new Map<string, number>();
  const n = new Map<string, number>();

  const expected = (a: number, b: number) =>
    1 / (1 + Math.pow(10, (b - a) / 400));

  for (const r of rows) {
    if (!r.modelId) continue;
    const m = elo.get(r.modelId) ?? GOLD_ELO;
    const g = GOLD_ELO;
    const exp = expected(m, g);
    const actual = r.score;
    const next = m + k * (actual - exp);
    elo.set(r.modelId, next);
    n.set(r.modelId, (n.get(r.modelId) ?? 0) + 1);
  }

  return [...elo.entries()]
    .map(([modelId, value]) => ({
      modelId,
      elo: Math.round(value * 10) / 10,
      n: n.get(modelId) ?? 0,
    }))
    .sort((a, b) => b.elo - a.elo);
}
