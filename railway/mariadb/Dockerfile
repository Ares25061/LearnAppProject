FROM mariadb:11.4

COPY railway/mariadb/my.cnf /etc/mysql/conf.d/99-railway.cnf

ENV MARIADB_AUTO_UPGRADE=1 \
    MARIADB_INITDB_SKIP_TZINFO=1

EXPOSE 3306

HEALTHCHECK --start-period=30s --interval=15s --timeout=5s --retries=5 \
  CMD ["healthcheck.sh", "--su-mysql", "--connect", "--innodb_initialized"]
