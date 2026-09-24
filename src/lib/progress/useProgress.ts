import { useContext } from "react";
import { ProgressContext, type ProgressContextValue } from "@/lib/progress/context";

export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress must be used inside ProgressProvider");
  return ctx;
}
