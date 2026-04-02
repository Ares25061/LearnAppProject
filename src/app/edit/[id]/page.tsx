import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { StudioEditor } from "@/components/studio-editor";
import { requireCurrentUser } from "@/lib/auth";
import { getOwnedApp } from "@/lib/apps";

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireCurrentUser();
  const app = getOwnedApp(id, user.id);

  if (!app) {
    notFound();
  }

  return (
    <div className="page-shell">
      <SiteHeader user={user} />
      <main className="page-content">
        <StudioEditor
          existingId={app.id}
          existingSlug={app.slug}
          initialDraft={app.draft}
          mode="edit"
          user={user}
        />
      </main>
    </div>
  );
}
