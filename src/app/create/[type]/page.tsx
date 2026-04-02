import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { StudioEditor } from "@/components/studio-editor";
import {
  createDefaultDraft,
  isExerciseTypeId,
} from "@/lib/exercise-definitions";
import { getCurrentUser } from "@/lib/auth";
import { getPublicAppBySlug } from "@/lib/apps";
import type { AnyExerciseDraft } from "@/lib/types";

export default async function CreatePage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { type } = await params;
  const { from } = await searchParams;

  if (!isExerciseTypeId(type)) {
    notFound();
  }

  const user = await getCurrentUser();
  const sourceSlug = typeof from === "string" ? from.trim() : "";
  const sourceApp = sourceSlug ? await getPublicAppBySlug(sourceSlug) : null;
  const initialDraft =
    sourceApp && sourceApp.draft.type === type
      ? sourceApp.draft
      : (createDefaultDraft(type) as AnyExerciseDraft);

  return (
    <div className="page-shell">
      <SiteHeader user={user} />
      <main className="page-content">
        <StudioEditor
          initialDraft={initialDraft}
          mode="create"
          user={user}
        />
      </main>
    </div>
  );
}
