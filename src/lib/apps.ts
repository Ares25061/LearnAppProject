import "server-only";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { parseDraft } from "@/lib/exercise-definitions";
import type { PublicUser, StoredExercise, AnyExerciseDraft } from "@/lib/types";

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

export function findUserByEmail(email: string) {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.toLocaleLowerCase("en-US")) as UserRow | undefined;

  if (!row) {
    return null;
  }

  return {
    ...toPublicUser(row),
    passwordHash: row.password_hash,
  };
}

export function createUser(input: {
  email: string;
  name: string;
  passwordHash: string;
}) {
  const db = getDb();
  const now = new Date().toISOString();
  const userId = nanoid(16);
  const email = input.email.toLocaleLowerCase("en-US");

  db.prepare(
    `
      INSERT INTO users (id, email, name, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
  ).run(userId, email, input.name.trim(), input.passwordHash, now);

  return {
    id: userId,
    email,
    name: input.name.trim(),
  } satisfies PublicUser;
}

export function listAppsByOwner(ownerId: string) {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM apps WHERE owner_id = ? ORDER BY updated_at DESC")
    .all(ownerId) as AppRow[];

  return rows
    .map((row) => rowToExercise(row))
    .filter((row): row is StoredExercise => Boolean(row));
}

export function getOwnedApp(id: string, ownerId: string) {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM apps WHERE id = ? AND owner_id = ?")
    .get(id, ownerId) as AppRow | undefined;

  return rowToExercise(row);
}

export function getPublicAppBySlug(slug: string) {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM apps WHERE slug = ?")
    .get(slug) as AppRow | undefined;

  return rowToExercise(row);
}

function insertApp(ownerId: string | null, draft: AnyExerciseDraft) {
  const db = getDb();
  const id = nanoid(12);
  const slug = nanoid(11).toLocaleLowerCase("en-US");
  const now = new Date().toISOString();

  db.prepare(
    `
      INSERT INTO apps (id, slug, owner_id, title, type, draft_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(id, slug, ownerId, draft.title, draft.type, JSON.stringify(draft), now, now);

  return getPublicAppBySlug(slug);
}

export function saveOwnedApp(input: {
  ownerId: string;
  draft: AnyExerciseDraft;
  id?: string | null;
}) {
  const db = getDb();
  const now = new Date().toISOString();

  if (input.id) {
    const existing = db
      .prepare("SELECT * FROM apps WHERE id = ? AND owner_id = ?")
      .get(input.id, input.ownerId) as AppRow | undefined;

    if (existing) {
      db.prepare(
        `
          UPDATE apps
          SET title = ?, type = ?, draft_json = ?, updated_at = ?
          WHERE id = ? AND owner_id = ?
        `,
      ).run(
        input.draft.title,
        input.draft.type,
        JSON.stringify(input.draft),
        now,
        input.id,
        input.ownerId,
      );

      return getOwnedApp(input.id, input.ownerId);
    }
  }

  return insertApp(input.ownerId, input.draft);
}

export function publishAnonymousApp(draft: AnyExerciseDraft) {
  return insertApp(null, draft);
}

export function persistForExport(input: {
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
