import Link from "next/link";
import { notFound } from "next/navigation";
import { ExercisePlayer } from "@/components/exercise-player";
import { getCurrentUser } from "@/lib/auth";
import { getPublicAppBySlug } from "@/lib/apps";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const app = await getPublicAppBySlug(slug);

  if (!app) {
    notFound();
  }

  const canEditOwnedApp = Boolean(user && app.ownerId && user.id === app.ownerId);
  const editorHref = canEditOwnedApp
    ? `/edit/${app.id}`
    : `/create/${app.type}?from=${encodeURIComponent(app.slug)}`;
  const editorLabel = canEditOwnedApp ? "Редактировать" : "Открыть в редакторе";

  return (
    <main className="play-page">
      <div className="play-toolbar">
        <Link href="/">К каталогу</Link>
        <Link href={editorHref}>{editorLabel}</Link>
      </div>
      <ExercisePlayer draft={app.draft} fullscreen />
    </main>
  );
}
