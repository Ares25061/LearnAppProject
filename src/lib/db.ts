import "server-only";
import { createPool, type Pool } from "mariadb";

let database: Pool | null = null;
let databasePromise: Promise<Pool> | null = null;

function parsePoolLimit() {
  const configured = Number.parseInt(
    process.env.DATABASE_POOL_LIMIT?.trim() ?? "4",
    10,
  );

  if (Number.isNaN(configured) || configured < 1) {
    return 4;
  }

  return configured;
}

function parsePoolMinimumIdle(connectionLimit: number) {
  const configured = Number.parseInt(
    process.env.DATABASE_POOL_MIN_IDLE?.trim() ?? "0",
    10,
  );

  if (Number.isNaN(configured) || configured < 0) {
    return 0;
  }

  return Math.min(configured, connectionLimit);
}

function parsePoolIdleTimeout() {
  const configured = Number.parseInt(
    process.env.DATABASE_POOL_IDLE_TIMEOUT?.trim() ?? "60",
    10,
  );

  if (Number.isNaN(configured) || configured < 1) {
    return 60;
  }

  return configured;
}

function resolveDatabaseConfig() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL не задан. Укажите MySQL-строку подключения в переменных окружения.",
    );
  }

  const parsed = new URL(databaseUrl);

  if (parsed.protocol !== "mysql:") {
    throw new Error("DATABASE_URL должен начинаться с mysql://");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));

  if (!databaseName) {
    throw new Error("DATABASE_URL должен содержать имя базы данных.");
  }

  return {
    host: parsed.hostname,
    port: parsed.port ? Number.parseInt(parsed.port, 10) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: databaseName,
  };
}

async function initialize(pool: Pool) {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(191) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS apps (
      id VARCHAR(64) PRIMARY KEY,
      slug VARCHAR(191) NOT NULL UNIQUE,
      owner_id VARCHAR(64) NULL,
      title VARCHAR(255) NOT NULL,
      type VARCHAR(64) NOT NULL,
      draft_json LONGTEXT NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL,
      INDEX idx_apps_owner_id (owner_id, updated_at),
      CONSTRAINT fk_apps_owner_id
        FOREIGN KEY (owner_id) REFERENCES users(id)
        ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function getDb() {
  if (database) {
    return database;
  }

  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = (async () => {
    const config = resolveDatabaseConfig();
    const connectionLimit = parsePoolLimit();
    const pool = createPool({
      ...config,
      charset: "utf8mb4",
      connectionLimit,
      minimumIdle: parsePoolMinimumIdle(connectionLimit),
      idleTimeout: parsePoolIdleTimeout(),
      acquireTimeout: 10000,
      keepAliveDelay: 10000,
    });

    try {
      await pool.query("SELECT 1");
      await initialize(pool);
      database = pool;
      return pool;
    } catch (error) {
      databasePromise = null;
      await pool.end().catch(() => undefined);
      throw error;
    }
  })();

  return databasePromise;
}
