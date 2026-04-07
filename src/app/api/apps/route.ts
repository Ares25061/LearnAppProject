import { getSession, unauthorized } from "@/lib/auth";
import { parseDraft } from "@/lib/exercise-definitions";
import { publishAnonymousApp, saveOwnedApp } from "@/lib/apps";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  const body = (await request.json().catch(() => null)) as
    | { id?: string | null; draft?: unknown; action?: string | null }
    | null;
  const action = body?.action === "publish" ? "publish" : "save";
  const draft = parseDraft(body?.draft);

  if (!draft) {
    return Response.json(
      { error: "Некорректная структура упражнения." },
      { status: 400 },
    );
  }

  if (!session && action !== "publish") {
    return unauthorized();
  }

  const app = session
    ? await saveOwnedApp({
        id: body?.id ?? null,
        ownerId: session.userId,
        draft,
      })
    : await publishAnonymousApp(draft);

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
