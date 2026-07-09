# Auth Operations

## Production invariants

- Deploy released images by digest. Do not reuse an existing version tag.
- Keep `env.autoMigrate: "false"`; the `auth-api-migrate` Helm hook owns DDL.
- Keep Redis enabled whenever the API has more than one replica.
- Keep `networkPolicy.enabled: true`. Add explicit `additionalApiEgress` rules
  only for an external storage endpoint that does not use TCP 443.
- Stakater Reloader must be installed for ExternalSecret changes to restart API,
  Redis, and bundled object storage consumers.
- The serving API currently requires the Postgres owner credential because realm
  creation performs schema DDL. Replacing it with a restricted runtime role
  requires moving realm provisioning behind a privileged migration controller.

## First install

1. Put independent random values of at least 32 characters in 1Password for
   `BETTER_AUTH_SECRET` and `SECRET_ENCRYPTION_KEY`.
2. Install or sync the chart. Confirm the `auth-api-migrate` job succeeds before
   the API rollout becomes ready.
3. On the first install only, read the generated temporary admin password from
   the migration job log. A repeated migration does not print another password;
   the completed job remains available for one hour.
4. Sign in to `/admin` and change the temporary password. The admin API remains
   blocked until this succeeds.
5. Confirm `/livez` and `/readyz`, then run one sign-in and logout per realm.

## Database migrations

The chart executes `bun src/migrate.ts` as a `post-install`/`pre-upgrade` hook.
The command takes a global advisory lock plus a per-realm advisory lock and is
safe to retry. Serving replicas must not run migrations in production.

Before upgrading:

1. Create a Postgres backup and record the currently deployed image digests.
2. Review schema and Better Auth release notes, especially RC upgrades.
3. Apply the release and wait for the migration job and API readiness.
4. Verify admin sign-in, hosted sign-in, token exchange, billing summary, and a
   small storage upload when storage is enabled.

Rollback application images only when the previous code is forward-compatible
with the migrated schema. Otherwise restore the pre-upgrade database backup.

## Secret rotation

Database, Redis, object-storage, email, billing, and social-provider credentials
can be rotated in their source system. Confirm ExternalSecret refresh, workload
restart, and `/readyz` after each credential, one at a time.

Rotating `BETTER_AUTH_SECRET` invalidates all realm sessions, login handoff
codes, and newly issued token signatures. Schedule it as a user-visible logout,
update the secret once, wait for every API replica to restart, and verify JWKS
and sign-in before continuing.

Do not replace `SECRET_ENCRYPTION_KEY` in place. It encrypts persisted delivery,
observability, social-provider, billing, and storage credentials. A rotation
requires a tested re-encryption migration while both old and new keys are
available. Until such a migration exists, restore this key from the secret
manager or backup if it is lost.

## Backup

Quiesce writes by scaling the API deployment to zero or placing the public route
in maintenance mode. Then create both backups in the same maintenance window:

```bash
pg_dump --format=custom --no-owner --file=auth.dump "$DATABASE_URL"
aws --endpoint-url "$AUTH_STORAGE_ENDPOINT" s3 sync \
  "s3://$AUTH_STORAGE_BUCKET" ./auth-object-backup
```

Encrypt the artifacts, store them outside the cluster, and record the release
image digests, chart version, timestamp, and `pg_restore --version`. Never put
database URLs, object-storage keys, or encryption keys in the backup manifest.

## Restore drill

Restore into a clean database and bucket, never over the only production copy:

```bash
createdb auth_restore
pg_restore --exit-on-error --no-owner --dbname "$RESTORE_DATABASE_URL" auth.dump
aws --endpoint-url "$RESTORE_STORAGE_ENDPOINT" s3 sync \
  ./auth-object-backup "s3://$RESTORE_STORAGE_BUCKET"
```

Deploy the recorded image digests against the restored resources with automatic
migration disabled. Verify row counts for project settings and each realm user
table, `/readyz`, admin sign-in, one realm sign-in, JWKS retrieval, entitlement
summary, and one restored object checksum. Destroy the drill environment only
after recording the result. Run this drill at least quarterly and before a
database major-version upgrade.

## NetworkPolicy exceptions

The API can reach DNS, the configured Postgres port, HTTPS, chart Redis, and
bundled RustFS. For an external S3 endpoint on another port, append a standard
NetworkPolicy egress rule, for example:

```yaml
networkPolicy:
  additionalApiEgress:
    - to:
        - ipBlock:
            cidr: 192.0.2.10/32
      ports:
        - protocol: TCP
          port: 9000
```

Keep the CIDR and port narrow. Do not disable the default-deny policy to solve a
single endpoint problem.
