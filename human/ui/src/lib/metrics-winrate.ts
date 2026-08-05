export type WinRateInput = {
  score: number;
  modelId: string;
  taskId: string;
  videoIdModel: string;
};

export type WinRateRow = {
  modelId: string;
  taskId: string;
  n: number;
  wins: number;
  ties: number;
  losses: number;
  win_rate_paper: number;
  win_rate_wins_only: number;
  win_rate_half: number;
};

function emptyBucket(modelId: string, taskId: string): WinRateRow {
  return {
    modelId,
    taskId,
    n: 0,
    wins: 0,
    ties: 0,
    losses: 0,
    win_rate_paper: 0,
    win_rate_wins_only: 0,
    win_rate_half: 0,
  };
}

function finalize(b: WinRateRow): WinRateRow {
  if (b.n === 0) return b;
  b.win_rate_paper = (b.wins + b.ties) / b.n;
  b.win_rate_wins_only = b.wins / b.n;
  b.win_rate_half = (b.wins + 0.5 * b.ties) / b.n;
  return b;
}

/** Paper-style win rates per model×task and model×all. */
export function computeWinRates(rows: WinRateInput[]): WinRateRow[] {
  const map = new Map<string, WinRateRow>();

  const bump = (modelId: string, taskId: string, score: number) => {
    const key = `${modelId}::${taskId}`;
    let b = map.get(key);
    if (!b) {
      b = emptyBucket(modelId, taskId);
      map.set(key, b);
    }
    b.n += 1;
    if (score >= 1) b.wins += 1;
    else if (score <= 0) b.losses += 1;
    else b.ties += 1;
  };

  for (const r of rows) {
    if (!r.modelId) continue;
    bump(r.modelId, r.taskId, r.score);
    bump(r.modelId, "all", r.score);
  }

  return [...map.values()].map(finalize);
}
