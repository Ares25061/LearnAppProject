import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { StudioEditor } from "@/components/studio-editor";
import {
  createDefaultDraft,
  isExerciseTypeId,
} from "@/lib/exercise-definitions";
import { getCurrentUser } from "@/lib/auth";
import type { AnyExerciseDraft } from "@/lib/types";

export default async function CreatePage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;

  if (!isExerciseTypeId(type)) {
    notFound();
  }

  const user = await getCurrentUser();

  return (
    <div className="page-shell">
      <SiteHeader user={user} />
      <main className="page-content">
        <StudioEditor
          initialDraft={createDefaultDraft(type) as AnyExerciseDraft}
          mode="create"
          user={user}
        />
      </main>
    </div>
  );
}
