/**
 * Smoke test: DB init, model/participant/video rows, assignment, rating, metrics.
 * Run: npm run smoke  (from human/ui)
 */
import fs from "fs";
import path from "path";
import { randomUUID, randomBytes } from "crypto";

process.chdir(path.resolve(__dirname, ".."));
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || "smoke-session-secret-at-least-32-chars!!";
process.env.DATA_DIR =
  process.env.DATA_DIR || path.join(process.cwd(), "..", "data-smoke");

async function main() {
  // Wipe smoke data dir for clean run
  const data = process.env.DATA_DIR!;
  fs.rmSync(data, { recursive: true, force: true });
  fs.mkdirSync(path.join(data, "media"), { recursive: true });

  const { getDb, nowIso, resetDbForTests } = await import("../src/lib/db");
  resetDbForTests();
  const { mediaPath } = await import("../src/lib/paths");
  const { randomOrder, mapChoiceToModelScore } = await import(
    "../src/lib/blinding"
  );
  const { computeWinRates } = await import("../src/lib/metrics-winrate");
  const { computeElo, GOLD_ELO } = await import("../src/lib/metrics-elo");
  const { HARDCODED_MODELS } = await import("../src/lib/constants");
  const { ensureAssignments } = await import("../src/lib/assignments");

  console.log("dataDir", data);
  const db = getDb();

  const modelId = HARDCODED_MODELS[0].id;
  const participantId = randomUUID();
  const passkey = randomBytes(6).toString("hex");
  db.prepare(
    `INSERT INTO participants (id, display_name, email, passkey, is_admin, active, created_at)
     VALUES (?, ?, ?, ?, 0, 1, ?)`
  ).run(
    participantId,
    "smoke-grader",
    `smoke-${participantId.slice(0, 8)}@example.com`,
    passkey,
    nowIso()
  );

  const taskId = "e222075d-5d62-4757-ae3c-e34b0846583b";
  const goldId = randomUUID();
  const sampleId = randomUUID();

  for (const [vid, isGold] of [
    [goldId, 1],
    [sampleId, 0],
  ] as const) {
    const dest = mediaPath(vid);
    fs.writeFileSync(dest, Buffer.from("fake-mp4-bytes"));
    db.prepare(
      `INSERT INTO videos
        (video_id, task_id, is_gold, model_id, cost_usd, seed, original_name, media_path, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      vid,
      taskId,
      isGold,
      isGold ? null : modelId,
      isGold ? 0 : 12.5,
      isGold ? 0 : 1,
      "smoke.mp4",
      dest,
      nowIso()
    );
  }

  const progress = ensureAssignments(participantId);
  if (!progress) throw new Error("ensureAssignments returned null");

  const order = randomOrder();
  const comparisonId = progress.comparison.id;
  db.prepare("UPDATE comparisons SET order_shown = ? WHERE id = ?").run(
    JSON.stringify(order),
    comparisonId
  );

  const modelSide = order[0] === "model" ? "a" : "b";
  const mapped = mapChoiceToModelScore(modelSide as "a" | "b", order);
  if (mapped.score !== 1) throw new Error("mapChoiceToModelScore failed");

  db.prepare(
    `INSERT INTO ratings
      (id, comparison_id, participant_id, video_id_model, video_id_gold,
       label, score, failure_tags, justification, seconds_spent, qc_flag, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(
    randomUUID(),
    comparisonId,
    participantId,
    sampleId,
    goldId,
    mapped.label,
    mapped.score,
    "[]",
    "word ".repeat(50).trim(),
    200,
    nowIso()
  );
  db.prepare("UPDATE comparisons SET status = 'done' WHERE id = ?").run(
    comparisonId
  );

  const win = computeWinRates([
    { score: 1, modelId, taskId, videoIdModel: sampleId },
  ]);
  const elo = computeElo([{ modelId, score: 1, taskId }]);

  console.log("video_id_gold", goldId);
  console.log("video_id_model", sampleId);
  console.log(
    "win_rate_paper",
    win.find((w) => w.taskId === "all")?.win_rate_paper
  );
  console.log("elo", elo[0]?.elo, "(gold anchor", GOLD_ELO + ")");
  console.log("SMOKE OK");
  resetDbForTests();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
