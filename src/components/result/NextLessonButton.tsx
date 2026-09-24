import type { FC } from "react";
import { ArrowRight } from "lucide-react";
import type { LessonRef } from "@/content/curriculum";
import { Button } from "@/components/ui/button";

interface NextLessonButtonProps {
  next: LessonRef;
  onNext: (ref: LessonRef) => void;
}

export const NextLessonButton: FC<NextLessonButtonProps> = ({ next, onNext }) => (
  <Button className="h-12 w-full rounded-xl text-base font-bold" onClick={() => onNext(next)}>
    <span className="truncate">Próxima: {next.meta.title}</span>
    <ArrowRight className="!h-4 !w-4 shrink-0" />
  </Button>
);
