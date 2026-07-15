-- Optional Postgres history table (brief's option A). The dashboard currently
-- runs option B: snapshots are banked as committed JSON (data/snapshots.json)
-- so no DB/infra is required. Keep this for a future migration to Postgres —
-- the JSON store mirrors these columns exactly (platform, metric, value, date).

create table if not exists social_snapshots (
  id            bigint generated always as identity primary key,
  platform      text        not null,
  metric        text        not null,
  value         numeric     not null,
  snapshot_date date        not null default (now() at time zone 'utc')::date,
  captured_at   timestamptz not null default now(),
  unique (platform, metric, snapshot_date)
);

create index if not exists social_snapshots_lookup
  on social_snapshots (platform, metric, snapshot_date desc);
