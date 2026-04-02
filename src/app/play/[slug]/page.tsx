import Link from "next/link";
import { notFound } from "next/navigation";
import { ExercisePlayer } from "@/components/exercise-player";
import { getPublicAppBySlug } from "@/lib/apps";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const app = getPublicAppBySlug(slug);

  if (!app) {
    notFound();
  }

  return (
    <main className="play-page">
      <div className="play-toolbar">
        <Link href="/">К каталогу</Link>
        <Link href={`/edit/${app.id}`}>Редактировать</Link>
      </div>
      <ExercisePlayer draft={app.draft} fullscreen />
    </main>
  );
}
