#!/usr/bin/env bash
# Nightly database backup, plus a weekly archive of the receipts volume.
# Installed by deploy docs as a root cron job:
#
#   /etc/cron.d/ride-monitor-backup:
#   30 3 * * * sysadmin /home/sysadmin/ride-monitor/scripts/backup-db.sh >> /home/sysadmin/backups/backup.log 2>&1
#
# Self-hosting the database makes this disk the whole business's single copy;
# these dumps (kilobytes at current scale) are the difference between an
# annoyance and a catastrophe. Copy them somewhere off this machine too —
# rclone to any object storage is the easy answer.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%F)"

mkdir -p "$BACKUP_DIR"
cd "$APP_DIR"

docker compose exec -T db pg_dump -U postgres -Fc ride_monitor \
  > "$BACKUP_DIR/ride_monitor_${STAMP}.dump"

# Receipts change rarely; archive weekly (Sunday) if the volume exists yet.
if [ "$(date +%u)" = "7" ]; then
  volume="$(basename "$APP_DIR")_receipts"
  if docker volume inspect "$volume" >/dev/null 2>&1; then
    docker run --rm -v "$volume":/r:ro -v "$BACKUP_DIR":/b alpine \
      tar czf "/b/receipts_${STAMP}.tgz" -C /r .
  fi
fi

find "$BACKUP_DIR" -name 'ride_monitor_*.dump' -mtime "+$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'receipts_*.tgz' -mtime "+60" -delete

echo "$(date -Is) backup ok: ride_monitor_${STAMP}.dump ($(du -h "$BACKUP_DIR/ride_monitor_${STAMP}.dump" | cut -f1))"
