import { notFound } from "next/navigation";
import { ExercisePlayer } from "@/components/exercise-player";
import { getPublicAppBySlug } from "@/lib/apps";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const app = await getPublicAppBySlug(slug);

  if (!app) {
    notFound();
  }

  return (
    <main className="play-page play-page--board">
      <ExercisePlayer boardOnly draft={app.draft} fullscreen />
    </main>
  );
}
