import "server-only";
import { nanoid } from "nanoid";
import type { UpsertResult } from "mariadb";
import { getDb } from "@/lib/db";
import { parseDraft } from "@/lib/exercise-definitions";
import {
  readFileStore,
  updateFileStore,
  type StoredUserRecord,
} from "@/lib/file-store";
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

let preferFileStoreForPrimaryPersistence = false;
let hasLoggedFileStoreFallback = false;

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

function fileUserToAuthUser(row: StoredUserRecord | undefined) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
  };
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "";
  }

  return typeof error.code === "string" ? error.code : "";
}

function getErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") {
    return "";
  }

  if ("sqlMessage" in error && typeof error.sqlMessage === "string") {
    return error.sqlMessage;
  }

  if ("message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "";
}

function isUnsupportedDbAuthError(error: unknown) {
  const directCode = getErrorCode(error);
  const directMessage = getErrorMessage(error);
  const nestedCause =
    error && typeof error === "object" && "cause" in error ? error.cause : null;
  const causeCode = getErrorCode(nestedCause);
  const causeMessage = getErrorMessage(nestedCause);
  const combinedMessage = `${directMessage}\n${causeMessage}`.toLowerCase();

  return (
    directCode === "ER_AUTHENTICATION_PLUGIN_NOT_SUPPORTED" ||
    causeCode === "ER_AUTHENTICATION_PLUGIN_NOT_SUPPORTED" ||
    combinedMessage.includes("auth_gssapi_client")
  );
}

async function withPersistence<T>(
  dbAction: () => Promise<T>,
  fileAction: () => Promise<T>,
) {
  if (preferFileStoreForPrimaryPersistence) {
    return fileAction();
  }

  try {
    return await dbAction();
  } catch (error) {
    if (isUnsupportedDbAuthError(error)) {
      preferFileStoreForPrimaryPersistence = true;
    }

    if (!hasLoggedFileStoreFallback) {
      hasLoggedFileStoreFallback = true;
      const nestedCause =
        error && typeof error === "object" && "cause" in error ? error.cause : null;
      const reason =
        getErrorMessage(nestedCause) ||
        getErrorMessage(error) ||
        getErrorCode(nestedCause) ||
        getErrorCode(error);
      console.warn(
        reason
          ? `Primary database unavailable, using file store fallback: ${reason}`
          : "Primary database unavailable, using file store fallback.",
      );
    }

    return fileAction();
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase("en-US");
}

export async function findUserByEmail(email: string) {
  return withPersistence(
    async () => {
      const db = await getDb();
      const rows = await db.query<UserRow[]>(
        "SELECT * FROM users WHERE email = ? LIMIT 1",
        [normalizeEmail(email)],
      );
      const row = rows[0];

      if (!row) {
        return null;
      }

      return {
        ...toPublicUser(row),
        passwordHash: row.password_hash,
      };
    },
    async () => {
      const store = await readFileStore();
      return fileUserToAuthUser(
        store.users.find((item) => item.email === normalizeEmail(email)),
      );
    },
  );
}

export async function createUser(input: {
  email: string;
  name: string;
  passwordHash: string;
}) {
  return withPersistence(
    async () => {
      const db = await getDb();
      const now = new Date().toISOString();
      const userId = nanoid(16);
      const email = normalizeEmail(input.email);

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
    },
    async () =>
      updateFileStore(async (current) => {
        const email = normalizeEmail(input.email);
        const existing = current.users.find((item) => item.email === email);
        if (existing) {
          throw new Error("Пользователь с такой почтой уже существует.");
        }

        const nextUser: StoredUserRecord = {
          id: nanoid(16),
          email,
          name: input.name.trim(),
          passwordHash: input.passwordHash,
          createdAt: new Date().toISOString(),
        };

        return {
          data: {
            ...current,
            users: [...current.users, nextUser],
          },
          result: {
            id: nextUser.id,
            email: nextUser.email,
            name: nextUser.name,
          } satisfies PublicUser,
        };
      }),
  );
}

export async function listAppsByOwner(ownerId: string) {
  return withPersistence(
    async () => {
      const db = await getDb();
      const rows = await db.query<AppRow[]>(
        "SELECT * FROM apps WHERE owner_id = ? ORDER BY updated_at DESC",
        [ownerId],
      );

      return rows
        .map((row) => rowToExercise(row))
        .filter((row): row is StoredExercise => Boolean(row));
    },
    async () => {
      const store = await readFileStore();
      return store.apps
        .filter((app) => app.ownerId === ownerId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
  );
}

export async function getOwnedApp(id: string, ownerId: string) {
  return withPersistence(
    async () => {
      const db = await getDb();
      const rows = await db.query<AppRow[]>(
        "SELECT * FROM apps WHERE id = ? AND owner_id = ? LIMIT 1",
        [id, ownerId],
      );

      return rowToExercise(rows[0]);
    },
    async () => {
      const store = await readFileStore();
      return (
        store.apps.find((app) => app.id === id && app.ownerId === ownerId) ?? null
      );
    },
  );
}

export async function getPublicAppBySlug(slug: string) {
  return withPersistence(
    async () => {
      const db = await getDb();
      const rows = await db.query<AppRow[]>(
        "SELECT * FROM apps WHERE slug = ? LIMIT 1",
        [slug],
      );

      return rowToExercise(rows[0]);
    },
    async () => {
      const store = await readFileStore();
      return store.apps.find((app) => app.slug === slug) ?? null;
    },
  );
}

async function insertAppDb(ownerId: string | null, draft: AnyExerciseDraft) {
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

async function insertAppFile(ownerId: string | null, draft: AnyExerciseDraft) {
  return updateFileStore(async (current) => {
    const now = new Date().toISOString();
    const nextApp: StoredExercise = {
      id: nanoid(12),
      slug: nanoid(11).toLocaleLowerCase("en-US"),
      ownerId,
      title: draft.title,
      type: draft.type,
      draft,
      createdAt: now,
      updatedAt: now,
    };

    return {
      data: {
        ...current,
        apps: [...current.apps, nextApp],
      },
      result: nextApp,
    };
  });
}

async function insertApp(ownerId: string | null, draft: AnyExerciseDraft) {
  return withPersistence(
    () => insertAppDb(ownerId, draft),
    () => insertAppFile(ownerId, draft),
  );
}

export async function saveOwnedApp(input: {
  ownerId: string;
  draft: AnyExerciseDraft;
  id?: string | null;
}) {
  return withPersistence(
    async () => {
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

      return insertAppDb(input.ownerId, input.draft);
    },
    async () => {
      if (input.id) {
        return updateFileStore(async (current) => {
          const existingIndex = current.apps.findIndex(
            (app) => app.id === input.id && app.ownerId === input.ownerId,
          );

          if (existingIndex === -1) {
            const now = new Date().toISOString();
            const created: StoredExercise = {
              id: nanoid(12),
              slug: nanoid(11).toLocaleLowerCase("en-US"),
              ownerId: input.ownerId,
              title: input.draft.title,
              type: input.draft.type,
              draft: input.draft,
              createdAt: now,
              updatedAt: now,
            };

            return {
              data: {
                ...current,
                apps: [...current.apps, created],
              },
              result: created,
            };
          }

          const existing = current.apps[existingIndex];
          const updated: StoredExercise = {
            ...existing,
            title: input.draft.title,
            type: input.draft.type,
            draft: input.draft,
            updatedAt: new Date().toISOString(),
          };
          const apps = [...current.apps];
          apps[existingIndex] = updated;

          return {
            data: {
              ...current,
              apps,
            },
            result: updated,
          };
        });
      }

      return insertAppFile(input.ownerId, input.draft);
    },
  );
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
