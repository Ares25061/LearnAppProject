import bcrypt from "bcryptjs";
import { createSession } from "@/lib/auth";
import { findUserByEmail } from "@/lib/apps";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { email?: string; password?: string }
    | null;

  if (!body?.email?.trim() || !body?.password?.trim()) {
    return Response.json(
      { error: "Укажите email и пароль." },
      { status: 400 },
    );
  }

  const user = findUserByEmail(body.email);

  if (!user) {
    return Response.json(
      { error: "Пользователь не найден." },
      { status: 404 },
    );
  }

  const isValid = await bcrypt.compare(body.password, user.passwordHash);

  if (!isValid) {
    return Response.json({ error: "Неверный пароль." }, { status: 401 });
  }

  await createSession({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  });
}
