import { getSession, unauthorized } from "@/lib/auth";
import { parseDraft } from "@/lib/exercise-definitions";
import { saveOwnedApp } from "@/lib/apps";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return unauthorized();
  }

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

  const app = saveOwnedApp({
    id: body?.id ?? null,
    ownerId: session.userId,
    draft,
  });

  if (!app) {
    return Response.json(
      { error: "Не удалось сохранить упражнение." },
      { status: 500 },
    );
  }

  return Response.json({
    app: {
      id: app.id,
      slug: app.slug,
    },
  });
}
