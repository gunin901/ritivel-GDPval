/**
 * Task reference materials hosted on S3 (private bucket; signed at request time).
 * Keys are relative to the bucket (include media/ prefix).
 */
export type TaskReferenceAsset = {
  id: string;
  label: string;
  /** S3 object key */
  key: string;
  kind: "pdf" | "zip" | "video" | "audio" | "other";
};

export type TaskReferenceBundle = {
  taskId: string;
  /** Primary links shown under the task brief */
  highlights: TaskReferenceAsset[];
  /** Full gallery (e.g. every Goodsin reel clip) */
  gallery: TaskReferenceAsset[];
};

const GREEN = "e222075d-5d62-4757-ae3c-e34b0846583b";
const GOODSIN = "75401f7c-396d-406d-b08e-938874ad1045";

const GOODSIN_REEL_FILES: { name: string; kind: TaskReferenceAsset["kind"] }[] =
  [
    { name: "logos.mp4", kind: "video" },
    { name: "logo_2.mp4", kind: "video" },
    { name: "CastleExplosion(TyFlow+Phoenix).mp4", kind: "video" },
    { name: "BuildingExplosion+Destruction(TyFlow+Phoenix).mp4", kind: "video" },
    { name: "Helicopter_DustSim(TyFlow+Phoenix).mp4", kind: "video" },
    { name: "Shores_Comp_04222020.mp4", kind: "video" },
    { name: "Boat_OceanSim_w_Tentacles(TyFlow+Phoenix).mp4", kind: "video" },
    { name: "TheShining_LiquidSim(Phoenix+3dsMax).mp4", kind: "video" },
    { name: "Skull_Liquid+ParticleTest(TyFlow+Phoenix).mp4", kind: "video" },
    { name: "Skeleton_ParticleGrowthTest(TyFlow).mp4", kind: "video" },
    { name: "Head_ClothTest(TyFlow).mp4", kind: "video" },
    { name: "4 Rooms(rotoScopingTest_AfterEffects).mp4", kind: "video" },
    { name: "monkey.mp4", kind: "video" },
    { name: "Mountain Audio - Electricity.mp3", kind: "audio" },
    { name: "ExplosionFire PS01_92.wav", kind: "audio" },
    { name: "LargeMultiImpactsW PE280701.wav", kind: "audio" },
  ];

function goodsinReelKey(name: string): string {
  return `media/tasks/${GOODSIN}/references/reel-footage/${name}`;
}

export function getTaskReferenceBundle(
  taskId: string
): TaskReferenceBundle | null {
  if (taskId === GREEN) {
    const pdf: TaskReferenceAsset = {
      id: "green-script",
      label: "GreenEnergy-30_Script.pdf",
      key: `media/tasks/${GREEN}/references/GreenEnergy-30_Script.pdf`,
      kind: "pdf",
    };
    return { taskId, highlights: [pdf], gallery: [] };
  }

  if (taskId === GOODSIN) {
    const zip: TaskReferenceAsset = {
      id: "goodsin-reel-zip",
      label: "reel footage.zip (all clips)",
      key: `media/tasks/${GOODSIN}/references/reel-footage.zip`,
      kind: "zip",
    };
    const gallery: TaskReferenceAsset[] = GOODSIN_REEL_FILES.map((f) => ({
      id: `goodsin-${f.name}`,
      label: f.name,
      key: goodsinReelKey(f.name),
      kind: f.kind,
    }));
    return { taskId, highlights: [zip], gallery };
  }

  return null;
}
