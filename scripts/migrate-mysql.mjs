import { createPool } from "mariadb";

function resolveDatabaseUrl(value, fallbackKeys = []) {
  if (value?.trim()) {
    return value.trim();
  }

  for (const key of fallbackKeys) {
    const candidate = process.env[key]?.trim();

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function parseDatabaseUrl(databaseUrl) {
  const parsed = new URL(databaseUrl);

  if (parsed.protocol !== "mysql:") {
    throw new Error("Строка подключения должна начинаться с mysql://");
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));

  if (!database) {
    throw new Error("В строке подключения отсутствует имя базы данных.");
  }

  return {
    host: parsed.hostname,
    port: parsed.port ? Number.parseInt(parsed.port, 10) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
    charset: "utf8mb4",
    connectionLimit: 2,
    ssl: false,
  };
}

async function ensureSchema(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(191) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
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

async function fetchRows(pool, sql) {
  const rows = await pool.query(sql);
  return Array.isArray(rows) ? rows : [];
}

async function migrateUsers(sourcePool, targetConnection) {
  const users = await fetchRows(
    sourcePool,
    "SELECT id, email, name, password_hash, created_at FROM users ORDER BY created_at ASC",
  );

  for (const user of users) {
    await targetConnection.query(
      `
        INSERT INTO users (id, email, name, password_hash, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          email = VALUES(email),
          name = VALUES(name),
          password_hash = VALUES(password_hash),
          created_at = VALUES(created_at)
      `,
      [user.id, user.email, user.name, user.password_hash, user.created_at],
    );
  }

  return users.length;
}

async function migrateApps(sourcePool, targetConnection) {
  const apps = await fetchRows(
    sourcePool,
    `
      SELECT id, slug, owner_id, title, type, draft_json, created_at, updated_at
      FROM apps
      ORDER BY created_at ASC
    `,
  );

  for (const app of apps) {
    await targetConnection.query(
      `
        INSERT INTO apps (id, slug, owner_id, title, type, draft_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          slug = VALUES(slug),
          owner_id = VALUES(owner_id),
          title = VALUES(title),
          type = VALUES(type),
          draft_json = VALUES(draft_json),
          created_at = VALUES(created_at),
          updated_at = VALUES(updated_at)
      `,
      [
        app.id,
        app.slug,
        app.owner_id,
        app.title,
        app.type,
        app.draft_json,
        app.created_at,
        app.updated_at,
      ],
    );
  }

  return apps.length;
}

async function readCounts(pool) {
  const [usersResult] = await pool.query("SELECT COUNT(*) AS count FROM users");
  const [appsResult] = await pool.query("SELECT COUNT(*) AS count FROM apps");

  return {
    users: Number(usersResult.count),
    apps: Number(appsResult.count),
  };
}

async function main() {
  const sourceUrl = resolveDatabaseUrl(process.argv[2], [
    "SOURCE_DATABASE_URL",
    "DATABASE_URL",
  ]);
  const targetUrl = resolveDatabaseUrl(process.argv[3], ["TARGET_DATABASE_URL"]);

  if (!sourceUrl || !targetUrl) {
    throw new Error(
      "Укажите source и target mysql:// URL аргументами или через SOURCE_DATABASE_URL / TARGET_DATABASE_URL.",
    );
  }

  const sourcePool = createPool(parseDatabaseUrl(sourceUrl));
  const targetPool = createPool(parseDatabaseUrl(targetUrl));
  let targetConnection;

  try {
    await sourcePool.query("SELECT 1");
    targetConnection = await targetPool.getConnection();
    await targetConnection.beginTransaction();
    await ensureSchema(targetConnection);

    const migratedUsers = await migrateUsers(sourcePool, targetConnection);
    const migratedApps = await migrateApps(sourcePool, targetConnection);

    await targetConnection.commit();
    targetConnection.release();
    targetConnection = null;

    const targetCounts = await readCounts(targetPool);

    console.log(
      JSON.stringify(
        {
          migratedUsers,
          migratedApps,
          targetCounts,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (targetConnection) {
      await targetConnection.rollback().catch(() => undefined);
      targetConnection.release();
    }

    throw error;
  } finally {
    await sourcePool.end().catch(() => undefined);
    await targetPool.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
