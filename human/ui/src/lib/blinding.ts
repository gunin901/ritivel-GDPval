export type SideRole = "model" | "gold";
export type OrderShown = [SideRole, SideRole];

export function randomOrder(): OrderShown {
  return Math.random() < 0.5 ? ["model", "gold"] : ["gold", "model"];
}

export function videoIdForSide(
  side: "A" | "B",
  order: OrderShown,
  goldId: string,
  modelId: string
): string {
  const role = side === "A" ? order[0] : order[1];
  return role === "gold" ? goldId : modelId;
}

/** Map UI choice (A/tie/B) to model-vs-gold score. */
export function mapChoiceToModelScore(
  choice: "a" | "tie" | "b",
  order: OrderShown
): { label: "better" | "tie" | "worse"; score: number } {
  if (choice === "tie") return { label: "tie", score: 0.5 };
  const picked = choice === "a" ? order[0] : order[1];
  if (picked === "model") return { label: "better", score: 1 };
  return { label: "worse", score: 0 };
}
