import bcrypt from "bcryptjs";
import { createSession } from "@/lib/auth";
import { createUser, findUserByEmail } from "@/lib/apps";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { name?: string; email?: string; password?: string }
    | null;

  if (!body?.name?.trim() || !body?.email?.trim() || !body?.password?.trim()) {
    return Response.json(
      { error: "Укажите имя, email и пароль." },
      { status: 400 },
    );
  }

  if (body.password.trim().length < 6) {
    return Response.json(
      { error: "Пароль должен содержать минимум 6 символов." },
      { status: 400 },
    );
  }

  if (await findUserByEmail(body.email)) {
    return Response.json(
      { error: "Пользователь с таким email уже существует." },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(body.password.trim(), 10);
  const user = await createUser({
    email: body.email,
    name: body.name,
    passwordHash,
  });

  await createSession(user);

  return Response.json({ user });
}
