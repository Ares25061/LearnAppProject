import { getSession } from "@/lib/auth";
import { persistForExport } from "@/lib/apps";
import { parseDraft } from "@/lib/exercise-definitions";
import { getPublicAppOrigin } from "@/lib/public-origin";
import { ScormArchiveError, generateScormArchive } from "@/lib/scorm";
import { safeFilename } from "@/lib/utils";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  const body = (await request.json().catch(() => null)) as
    | { id?: string | null; draft?: unknown; variant?: string | null }
    | null;
  const draft = parseDraft(body?.draft);
  const variant = body?.variant === "scorm3" ? "scorm3" : "scorm1";

  if (!draft) {
    return Response.json(
      { error: "Не удалось распознать структуру упражнения." },
      { status: 400 },
    );
  }

  const app = await persistForExport({
    id: body?.id ?? null,
    ownerId: session?.userId ?? null,
    draft,
  });

  if (!app) {
    return Response.json(
      { error: "Не удалось подготовить упражнение к экспорту." },
      { status: 500 },
    );
  }

  try {
    const origin = variant === "scorm1" ? getPublicAppOrigin(request) : null;
    const archive = await generateScormArchive({
      draft,
      title: draft.title,
      playUrl: origin ? `${origin}/play/${app.slug}` : null,
      variant,
    });

    return new Response(new Uint8Array(archive), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeFilename(
          draft.title,
        )}${variant === "scorm3" ? "-autonomous-scorm" : ""}.zip"`,
        "x-app-id": app.id,
        "x-app-slug": app.slug,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Не удалось собрать SCORM-архив.";

    return Response.json(
      { error: message },
      { status: error instanceof ScormArchiveError ? error.status : 500 },
    );
  }
}
