# Railway MariaDB Service

Этот сервис нужен вместо managed MySQL от Railway, когда у managed-плагина не хватает памяти при лимите 1 GB.

## Что внутри

- `Dockerfile` на базе `mariadb:11.4`
- `my.cnf` с более осторожными настройками памяти под небольшой Railway-инстанс
- healthcheck через `healthcheck.sh --connect --innodb_initialized`

## Как поднять в Railway

1. Создайте новый service из этого же репозитория.
2. В переменных service задайте:

```env
RAILWAY_DOCKERFILE_PATH=railway/mariadb/Dockerfile
MARIADB_DATABASE=learningapps
MARIADB_USER=app
MARIADB_PASSWORD=change-me
MARIADB_ROOT_PASSWORD=change-me-root
```

3. Подключите Volume к пути `/var/lib/mysql`.
4. В app service соберите `DATABASE_URL` через private domain этого DB service:

```env
DATABASE_URL=mysql://app:change-me@<db-private-domain>:3306/learningapps
```

5. В app service дополнительно задайте:

```env
DATABASE_POOL_LIMIT=2
DATABASE_POOL_MIN_IDLE=0
DATABASE_POOL_IDLE_TIMEOUT=60
```

## Что важно

- Этот контейнер не зависит от managed MySQL Railway.
- Конфиг рассчитан именно на малый memory budget, а не на высокую производительность.
- Если volume уже содержит старую БД, переменные `MARIADB_DATABASE` / `MARIADB_USER` / `MARIADB_PASSWORD` не пересоздадут пользователей автоматически задним числом.
