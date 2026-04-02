import { getSession } from "@/lib/auth";
import { persistForExport } from "@/lib/apps";
import { parseDraft } from "@/lib/exercise-definitions";
import { generateScormArchive } from "@/lib/scorm";
import { safeFilename } from "@/lib/utils";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  const body = (await request.json().catch(() => null)) as
    | { id?: string | null; draft?: unknown }
    | null;
  const draft = parseDraft(body?.draft);

  if (!draft) {
    return Response.json(
      { error: "Некорректная структура упражнения." },
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

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const playUrl = `${origin}/play/${app.slug}`;
  const archive = await generateScormArchive({
    title: draft.title,
    playUrl,
  });

  return new Response(new Uint8Array(archive), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeFilename(
        draft.title,
      )}.zip"`,
      "x-app-id": app.id,
      "x-app-slug": app.slug,
    },
  });
}
