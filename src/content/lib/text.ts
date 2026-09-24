/** "É só uma." / "É só um." / "São 3." for tap-all prompts. */
export function countText(n: number, gender: "f" | "m" = "f"): string {
  if (n === 1) return gender === "f" ? "É só uma." : "É só um.";
  return `São ${n}.`;
}
