import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

let database: Database.Database | null = null;

function resolveDatabasePath() {
  const appRoot = /* turbopackIgnore: true */ process.cwd();
  const configuredPath = process.env.DATABASE_PATH?.trim();

  if (configuredPath) {
    if (path.isAbsolute(configuredPath)) {
      return configuredPath;
    }

    return path.resolve(appRoot, configuredPath);
  }

  const railwayVolumeMountPath = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();

  if (railwayVolumeMountPath) {
    return path.join(railwayVolumeMountPath, "learningapps-studio.sqlite");
  }

  return path.join(appRoot, "data", "learningapps-studio.sqlite");
}

function initialize(db: Database.Database) {
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      draft_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_apps_owner_id
      ON apps(owner_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_apps_slug
      ON apps(slug);
  `);
}

export function getDb() {
  if (database) {
    return database;
  }

  const databasePath = resolveDatabasePath();
  const dataDirectory = path.dirname(databasePath);

  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }

  database = new Database(databasePath);
  initialize(database);
  return database;
}
