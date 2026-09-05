# 12. Cloud Backups with Rclone

Date: 2026-09-05

## Status

Proposed

## Context

We have successfully implemented periodic local backups of the SQLite database using Ofelia (ADR 0011). However, keeping backups on the same physical device (Raspberry Pi) does not protect against hardware failure (e.g., SD card corruption) or physical loss. 

The user requested the ability to sync these backups to a cloud storage provider (like Google Drive). We need a solution that supports various cloud providers, is secure, and runs transparently within our Docker Compose environment without adding dependencies to the main TypeScript application.

## Decision

We will integrate **Rclone** into the Docker Compose stack to handle cloud synchronization.

1. We will add a new service `rclone` using the official `rclone/rclone` image.
2. The service will run a dummy command (`tail -f /dev/null`) to stay alive in the background.
3. We will mount the local `./data` directory (read-only) and a `./rclone.conf` file into the `rclone` container.
4. We will use **Ofelia** (our existing job scheduler) via Docker labels on the `rclone` service to execute a synchronization command (e.g., `rclone copy /data cloud_remote:/SignalTrackerBackups`) daily at 4:00 AM (one hour after the local backup).
5. We will create a placeholder `rclone.conf` file. The user will be responsible for running `rclone config` to generate the actual authentication tokens for their chosen cloud provider (e.g., Google Drive) and specifying their chosen remote name.

## Consequences

- **Positive:** True off-site disaster recovery is achieved.
- **Positive:** High flexibility. The user can switch to any of the 70+ cloud providers supported by Rclone by simply updating `rclone.conf`.
- **Positive:** Clean architecture. The main application is entirely unaware of the cloud sync process.
- **Negative:** Slightly increased resource usage (one additional lightweight container).
- **Negative:** Requires manual one-time setup by the user to authenticate via OAuth and populate `rclone.conf`.
