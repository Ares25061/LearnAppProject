import "server-only";
import { nanoid } from "nanoid";
import type { UpsertResult } from "mariadb";
import { getDb } from "@/lib/db";
import { parseDraft } from "@/lib/exercise-definitions";
import type { AnyExerciseDraft, PublicUser, StoredExercise } from "@/lib/types";

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
}

interface AppRow {
  id: string;
  slug: string;
  owner_id: string | null;
  title: string;
  type: string;
  draft_json: string;
  created_at: string;
  updated_at: string;
}

function toPublicUser(row: Pick<UserRow, "id" | "email" | "name">): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
  };
}

function rowToExercise(row: AppRow | undefined): StoredExercise | null {
  if (!row) {
    return null;
  }

  try {
    const parsed = JSON.parse(row.draft_json) as unknown;
    const draft = parseDraft(parsed);

    if (!draft) {
      return null;
    }

    return {
      id: row.id,
      slug: row.slug,
      ownerId: row.owner_id,
      title: row.title,
      type: draft.type,
      draft,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

export async function findUserByEmail(email: string) {
  const db = await getDb();
  const rows = await db.query<UserRow[]>(
    "SELECT * FROM users WHERE email = ? LIMIT 1",
    [email.toLocaleLowerCase("en-US")],
  );
  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    ...toPublicUser(row),
    passwordHash: row.password_hash,
  };
}

export async function createUser(input: {
  email: string;
  name: string;
  passwordHash: string;
}) {
  const db = await getDb();
  const now = new Date().toISOString();
  const userId = nanoid(16);
  const email = input.email.toLocaleLowerCase("en-US");

  await db.query<UpsertResult>(
    `
      INSERT INTO users (id, email, name, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    [userId, email, input.name.trim(), input.passwordHash, now],
  );

  return {
    id: userId,
    email,
    name: input.name.trim(),
  } satisfies PublicUser;
}

export async function listAppsByOwner(ownerId: string) {
  const db = await getDb();
  const rows = await db.query<AppRow[]>(
    "SELECT * FROM apps WHERE owner_id = ? ORDER BY updated_at DESC",
    [ownerId],
  );

  return rows
    .map((row) => rowToExercise(row))
    .filter((row): row is StoredExercise => Boolean(row));
}

export async function getOwnedApp(id: string, ownerId: string) {
  const db = await getDb();
  const rows = await db.query<AppRow[]>(
    "SELECT * FROM apps WHERE id = ? AND owner_id = ? LIMIT 1",
    [id, ownerId],
  );

  return rowToExercise(rows[0]);
}

export async function getPublicAppBySlug(slug: string) {
  const db = await getDb();
  const rows = await db.query<AppRow[]>(
    "SELECT * FROM apps WHERE slug = ? LIMIT 1",
    [slug],
  );

  return rowToExercise(rows[0]);
}

async function insertApp(ownerId: string | null, draft: AnyExerciseDraft) {
  const db = await getDb();
  const id = nanoid(12);
  const slug = nanoid(11).toLocaleLowerCase("en-US");
  const now = new Date().toISOString();

  await db.query<UpsertResult>(
    `
      INSERT INTO apps (id, slug, owner_id, title, type, draft_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [id, slug, ownerId, draft.title, draft.type, JSON.stringify(draft), now, now],
  );

  return getPublicAppBySlug(slug);
}

export async function saveOwnedApp(input: {
  ownerId: string;
  draft: AnyExerciseDraft;
  id?: string | null;
}) {
  const db = await getDb();
  const now = new Date().toISOString();

  if (input.id) {
    const existingRows = await db.query<AppRow[]>(
      "SELECT * FROM apps WHERE id = ? AND owner_id = ? LIMIT 1",
      [input.id, input.ownerId],
    );
    const existing = existingRows[0];

    if (existing) {
      await db.query<UpsertResult>(
        `
          UPDATE apps
          SET title = ?, type = ?, draft_json = ?, updated_at = ?
          WHERE id = ? AND owner_id = ?
        `,
        [
          input.draft.title,
          input.draft.type,
          JSON.stringify(input.draft),
          now,
          input.id,
          input.ownerId,
        ],
      );

      return getOwnedApp(input.id, input.ownerId);
    }
  }

  return insertApp(input.ownerId, input.draft);
}

export async function publishAnonymousApp(draft: AnyExerciseDraft) {
  return insertApp(null, draft);
}

export async function persistForExport(input: {
  ownerId: string | null;
  draft: AnyExerciseDraft;
  id?: string | null;
}) {
  return input.ownerId
    ? saveOwnedApp({
        ownerId: input.ownerId,
        draft: input.draft,
        id: input.id,
      })
    : publishAnonymousApp(input.draft);
}
