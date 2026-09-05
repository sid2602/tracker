# 11. Periodic SQLite Backups with Ofelia

Date: 2026-09-05

## Status

Proposed

## Context

The "Signal Expense Tracker" uses SQLite as its primary database. As a personal finance tool, data durability is critical. If the Raspberry Pi experiences SD card corruption or accidental data loss occurs, the user needs a way to restore the database. 

Since the application runs entirely within a Docker Compose environment, we need a backup strategy that:
1. Does not pollute the application's TypeScript codebase with infrastructure concerns (separation of concerns).
2. Works reliably with SQLite (meaning it should use SQLite's native `.backup` mechanism to ensure consistency rather than a blind file copy).
3. Is lightweight enough to run on a Raspberry Pi alongside the existing containers.

## Decision

We will use **Ofelia**, a Docker-native job scheduler, to perform periodic backups of the SQLite database.

Specifically:
1. We will add an `ofelia` service to `docker-compose.yml` that has access to the Docker socket (`/var/run/docker.sock`).
2. We will add the `sqlite3` CLI tool to the runtime stage of our application's `Dockerfile`. This is a very small package (~1-2MB) that provides the `sqlite3` command-line utility.
3. We will configure Ofelia using Docker labels attached to our `worker` service in `docker-compose.yml`. This allows Ofelia to execute an `ofelia.job-exec` command on a schedule (e.g., daily at 3:00 AM).
4. The scheduled command will run `sqlite3 /app/data/expenses.db ".backup '/app/data/backup_expenses_\$(date +%F).db'"` directly inside the `worker` container, saving the backup alongside the original database in the bound `./data` volume.

## Consequences

- **Positive:** Backups are automated and strictly separated from the application logic. The configuration is highly visible in `docker-compose.yml`.
- **Positive:** Using the SQLite `.backup` API guarantees that backups are consistent, even if a write transaction is occurring concurrently.
- **Negative:** We introduce a new container (`ofelia`) into the stack, consuming a minimal amount of additional RAM on the Pi.
- **Negative:** We must install `sqlite3` in our production Node.js Docker image, slightly increasing its size.
- **Negative:** Security context: The `ofelia` container requires access to `/var/run/docker.sock`. In a personal/isolated Raspberry Pi environment, this is an acceptable risk, but it does give the Ofelia container root-equivalent control over Docker.
