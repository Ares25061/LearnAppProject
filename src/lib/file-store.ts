import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StoredExercise } from "@/lib/types";

interface StoredUserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

interface FileStoreData {
  users: StoredUserRecord[];
  apps: StoredExercise[];
}

const STORE_DIRECTORY = path.join(process.cwd(), ".data");
const STORE_FILE = path.join(STORE_DIRECTORY, "learningapps-store.json");

const EMPTY_STORE: FileStoreData = {
  users: [],
  apps: [],
};

let writeQueue: Promise<void> = Promise.resolve();

async function ensureStoreDirectory() {
  await mkdir(STORE_DIRECTORY, { recursive: true });
}

export async function readFileStore(): Promise<FileStoreData> {
  await ensureStoreDirectory();

  try {
    const source = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(source) as Partial<FileStoreData>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      apps: Array.isArray(parsed.apps) ? parsed.apps : [],
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return structuredClone(EMPTY_STORE);
    }

    throw error;
  }
}

export async function writeFileStore(data: FileStoreData) {
  await ensureStoreDirectory();
  await writeFile(STORE_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function updateFileStore<T>(
  updater: (current: FileStoreData) => Promise<{ data: FileStoreData; result: T }> | { data: FileStoreData; result: T },
) {
  const resultPromise = writeQueue.then(async () => {
    const current = await readFileStore();
    const outcome = await updater(current);
    await writeFileStore(outcome.data);
    return outcome.result;
  });

  writeQueue = resultPromise.then(
    () => undefined,
    () => undefined,
  );

  return resultPromise;
}

export type { StoredUserRecord };
