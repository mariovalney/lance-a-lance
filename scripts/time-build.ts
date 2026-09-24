import { ALL_LESSONS } from "@/content/curriculum";
for (const ref of ALL_LESSONS) {
  if (!ref.meta.lesson) continue;
  const t = performance.now();
  for (let i = 0; i < 10; i++) ref.meta.lesson.build();
  console.log(ref.meta.id, ((performance.now() - t) / 10).toFixed(1), "ms");
}
