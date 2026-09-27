import { createContext, useContext } from "react";
import { xpFor } from "@/lib/progress/scoring";

/** Whether the lesson being played had been completed before: then every exercise earns half the XP. */
export const RepeatContext = createContext(false);

/** The XP some points are worth in this run, for the "+N XP" the screens show. */
export function useXpFor(): (points: number) => number {
  const repeat = useContext(RepeatContext);
  return (points) => xpFor(points, repeat);
}
