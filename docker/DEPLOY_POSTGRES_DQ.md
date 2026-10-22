# Deploy OpenMetadata 1.12.13 with DQ Backend

The Compose stack runs the DQ API in a dedicated container. A one-shot
`dq-migrate` container applies DQ migrations before `dq-rule-backend` starts.
Both OpenMetadata and DQ use `openmetadata_db`; DQ owns only these tables:

- `dq_schema_migrations`
- `dq_rules`
- `nt_rule_configs`

The same Compose file also starts a fresh PostgreSQL container, Elasticsearch,
OpenMetadata migration/server 1.12.13, and ingestion/Airflow 1.12.13.

## 0. Remove the old 2.0.2 test stack

Run this from the old Compose directory. Back up first unless its metadata can
be discarded:

```bash
docker exec openmetadata_postgresql pg_dumpall -U postgres > openmetadata-2.0.2-backup.sql
OLD_PROJECT=$(docker inspect openmetadata_server --format '{{ index .Config.Labels "com.docker.compose.project" }}')
docker compose -p "$OLD_PROJECT" -f docker-compose-postgres.yml down --remove-orphans
```

The old file bind-mounted PostgreSQL at `./docker-volume/db-data-postgres`.
Rename that directory instead of deleting it, then let the new stack create an
empty database:

```bash
mv docker-volume/db-data-postgres docker-volume/db-data-postgres-2.0.2-backup
```

Do not restore a 2.0.2 database into OpenMetadata 1.12.13. Do not run a global
`docker volume prune`; remove only an old volume after verifying its exact name.

## 1. Prepare configuration

Copy `.env.postgres.example` to `.env.postgres` and replace `BOT_TOKEN`, image
names, and the public CORS origin. Keep `DB_HOST=postgresql` and
`AIRFLOW_DB_HOST=postgresql`. DQ reuses OpenMetadata's `openmetadata_db`, while
Airflow uses the separately initialized `airflow_db`.

Never commit the real environment file.

## 2. Back up the OpenMetadata database

The new Compose project uses a named PostgreSQL volume. The DQ migration is
transactional, but this repository does not provide automatic down migrations.

## 3. Build the DQ image

First build the customized OpenMetadata distribution and server image from
the repository root (the full package command includes the customized UI):

```bash
mvn -DskipTests clean package
docker build -f docker/development/Dockerfile \
  -t your-registry/openmetadata-server:1.12.13-dq .
```

Then build the dedicated DQ image:

From the repository root:

```bash
docker compose --env-file docker/.env.postgres \
  -f docker/docker-compose.yml build dq-rule-backend
```

For a registry deployment, tag/push the resulting image and set
`DQ_BACKEND_IMAGE` to that immutable tag on the VPS.

## 4. Test only the DQ migration

Run the one-shot service and inspect the three DQ tables before starting the
API:

```bash
docker compose --env-file docker/.env.postgres \
  -f docker/docker-compose.yml run --rm dq-migrate

docker compose --env-file docker/.env.postgres \
  -f docker/docker-compose.yml run --rm dq-migrate \
  python scripts/migrate_database.py --check
```

Running the migration again is safe; already applied migration files are
skipped based on `dq_schema_migrations`.

Confirm the result in `openmetadata_db`:

```sql
SELECT version, applied_at FROM dq_schema_migrations ORDER BY version;
SELECT tablename
FROM pg_catalog.pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('dq_schema_migrations', 'dq_rules', 'nt_rule_configs')
ORDER BY tablename;
```

## 5. Start the complete stack

```bash
docker compose --env-file docker/.env.postgres \
  -p openmetadata-dq -f docker/docker-compose.yml up -d --build
```

`dq-rule-backend` starts only after OpenMetadata is healthy and `dq-migrate`
has exited successfully.

Verify:

```bash
docker compose --env-file docker/.env.postgres \
  -f docker/docker-compose.yml ps

curl http://127.0.0.1:8000/api/v1/health
```

On the Rule Recommender page, configure the DQ API URL as
`https://<dq-api-host>/api/v1` (or the VPS address and published port during
testing). The URL is evaluated by the user's browser, so the internal Docker
hostname `dq-rule-backend` must not be used there.

If `BOT_TOKEN` came from the deleted 2.0.2 database and is rejected, create or
reissue a bot token on the fresh 1.12.13 instance, update `.env.postgres`, and
recreate only `dq-rule-backend`.
