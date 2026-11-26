#!/usr/bin/env bash
# Turns on server-side protection for your Firebase project's data, so a bad deploy,
# a bug or an accidental bulk delete can always be undone. Run once per project.
#
#   scripts/setup-backups.sh <project-id> [bucket-name]
#
# Status: steps 1-2 use flags checked against the gcloud docs. Steps 3-4 (Storage) and the
# restore command printed at the end have NOT been run or checked against a real project;
# confirm them with `gcloud storage buckets update --help` before relying on them.
#
# Needs: gcloud (https://cloud.google.com/sdk) signed in with owner access, and the
# Blaze plan. Firestore and Storage must already be enabled.
set -euo pipefail

PROJECT="${1:?usage: setup-backups.sh <project-id> [bucket-name]}"
BUCKET="${2:-${PROJECT}.firebasestorage.app}"
DB="(default)"

echo "==> Project: $PROJECT   Storage bucket: $BUCKET"
command -v gcloud >/dev/null || { echo "gcloud is not installed"; exit 1; }

echo "==> 1/4 Firestore point-in-time recovery (restore to any minute in the last 7 days)"
gcloud firestore databases update --database="$DB" --project="$PROJECT" --enable-pitr

echo "==> 2/4 Firestore daily backup, kept 14 weeks, the maximum"
if gcloud firestore backups schedules list --database="$DB" --project="$PROJECT" --format="value(name)" | grep -q .; then
  echo "    a backup schedule already exists, leaving it as is"
else
  gcloud firestore backups schedules create --database="$DB" --project="$PROJECT" --recurrence=daily --retention=98d
fi

echo "==> 3/4 Storage object versioning (overwritten or deleted files stay recoverable)"
gcloud storage buckets update "gs://$BUCKET" --project="$PROJECT" --versioning

echo "==> 4/4 Storage soft delete (deleted files kept 30 days)"
gcloud storage buckets update "gs://$BUCKET" --project="$PROJECT" --soft-delete-duration=30d

echo
echo "Done. To restore Firestore to a point in time:"
echo "  gcloud firestore databases clone --source-database=projects/$PROJECT/databases/$DB \\"
echo "    --destination-database=restored --snapshot-time=<RFC3339 time> --project=$PROJECT"
