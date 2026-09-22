CREATE TABLE IF NOT EXISTS phases (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  target_date DATE NOT NULL,
  -- (3) = millisecond precision, matching what round-trips through a JS
  -- Date/JSON on the client; without it, the DB keeps microsecond
  -- precision that the client can never send back exactly, and the
  -- PUT /api/phases/:id optimistic-concurrency check would falsely 409
  -- on every single save.
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

-- phases table predates updated_at; add it for the already-created prod
-- table (CREATE TABLE IF NOT EXISTS above is a no-op there). Needed for
-- optimistic-concurrency checks on PUT /api/phases/:id.
ALTER TABLE phases ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now();
-- also fixes the precision for rows created by an earlier version of this
-- migration that added the column without the (3) precision.
ALTER TABLE phases ALTER COLUMN updated_at TYPE TIMESTAMPTZ(3);

CREATE TABLE IF NOT EXISTS sprints (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  stt INTEGER,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  phase_id INTEGER REFERENCES phases(id) ON DELETE SET NULL,
  sprint_id INTEGER REFERENCES sprints(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT '0.backlog'
    CHECK (status IN ('0.backlog','1.in_analyst','2.ready_for_dev','3.in_test','4.ready_for_staging','5.done')),
  done_analyst BOOLEAN NOT NULL DEFAULT FALSE,
  done_dev BOOLEAN NOT NULL DEFAULT FALSE,
  done_uat BOOLEAN NOT NULL DEFAULT FALSE,
  done_staging BOOLEAN NOT NULL DEFAULT FALSE,
  start_date DATE NOT NULL,
  due_date DATE NOT NULL,
  date_overridden BOOLEAN NOT NULL DEFAULT FALSE,
  why TEXT,
  -- when the task most recently ENTERED each status (Backlog excluded — it
  -- has no "reached it" moment worth tracking). Re-entering a status
  -- overwrites its stamp with the latest time. Set server-side on the
  -- status-changing PUT/POST, never sent by the client.
  in_analyst_at TIMESTAMPTZ,
  ready_for_dev_at TIMESTAMPTZ,
  in_test_at TIMESTAMPTZ,
  ready_for_staging_at TIMESTAMPTZ,
  done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- tasks table predates why; add it for the already-created prod table
-- (CREATE TABLE IF NOT EXISTS above is a no-op there).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS why TEXT;

CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','editor','viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Google sign-in replaces the shared-password + name-dropdown login: email
-- is the actual identity key now (stable and unique, unlike a free-text
-- display name), while `name` is kept purely for activity-log attribution
-- text and is no longer required to be unique (two different Google
-- accounts can share a display name).
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_name_key;
ALTER TABLE users ALTER COLUMN name DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- backfill the 6 already-seeded rows (matched by their old name-based
-- identity) with the email each person actually signs in with via Google.
-- The 5 non-admin addresses are a best guess (username@gmail.com, matching
-- their existing naming convention) — if wrong, an admin can fix it once
-- that person's real Google account shows up as a new viewer-role row.
UPDATE users SET email='dmquan8198@gmail.com' WHERE name='quan.dang1' AND email IS NULL;
UPDATE users SET email='anh.nguyen80@gmail.com' WHERE name='anh.nguyen80' AND email IS NULL;
UPDATE users SET email='nghi.vo@gmail.com' WHERE name='nghi.vo' AND email IS NULL;
UPDATE users SET email='hung.le1@gmail.com' WHERE name='hung.le1' AND email IS NULL;
UPDATE users SET email='uyen.ly@gmail.com' WHERE name='uyen.ly' AND email IS NULL;
UPDATE users SET email='toan.han@gmail.com' WHERE name='toan.han' AND email IS NULL;

-- seed the current fixed name list with an initial role, keyed by email now
-- (only matters for a brand-new database — on an existing one, the UPDATEs
-- above already populated these emails, so every row here conflicts and is
-- skipped); ON CONFLICT DO NOTHING keeps this safe to re-run — it won't
-- reset a role an admin later changed through the Users page.
INSERT INTO users (email, name, role) VALUES
  ('dmquan8198@gmail.com', 'quan.dang1', 'admin'),
  ('anh.nguyen80@gmail.com', 'anh.nguyen80', 'editor'),
  ('nghi.vo@gmail.com', 'nghi.vo', 'editor'),
  ('hung.le1@gmail.com', 'hung.le1', 'editor'),
  ('uyen.ly@gmail.com', 'uyen.ly', 'editor'),
  ('toan.han@gmail.com', 'toan.han', 'editor')
ON CONFLICT (email) DO NOTHING;

-- AI-generated project assessments (weekly/sprint/phase narrative from an
-- LLM). Generating one (POST /generate) never writes here — it's a
-- read-like, unmetered-cost call the user can retry freely. A row is only
-- written when the user explicitly clicks "Lưu" on a result they already
-- see on screen.
CREATE TABLE IF NOT EXISTS ai_assessments (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  actor_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- the canonical team/role list (PO, ITBA, BE Dev, App Dev, Web Dev, Core,
-- ...) a task can need resource from. A real lookup table (not free-text
-- like `category`) because teams need proper add/rename/delete management
-- independent of whether any task currently uses them — a rename must
-- update every task using the old name, and a delete must be possible even
-- for a team with zero tasks assigned.
CREATE TABLE IF NOT EXISTS resource_roles (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO resource_roles (name) VALUES ('PO'), ('ITBA'), ('BE Dev'), ('App Dev'), ('Web Dev'), ('Core')
ON CONFLICT (name) DO NOTHING;

-- which teams a task needs (one task can need several). `role` stores the
-- team's name as text rather than a resource_roles.id FK so that renaming a
-- team (UPDATE ... SET role=$new WHERE role=$old) never has to touch this
-- table's key structure — see PUT /api/resource-roles/:id.
CREATE TABLE IF NOT EXISTS task_resource_roles (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  PRIMARY KEY (task_id, role)
);

CREATE INDEX IF NOT EXISTS idx_tasks_phase ON tasks(phase_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON tasks(sprint_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_activity_logs_task ON activity_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_ai_assessments_created ON ai_assessments(created_at);
CREATE INDEX IF NOT EXISTS idx_task_resource_roles_role ON task_resource_roles(role);

-- 'In Analyst' inserted as its own Kanban stage between Backlog and Ready
-- for Dev (business analysis previously only tracked via the separate
-- done_analyst boolean, not a status a task could actually sit in) — every
-- code from Ready for Dev onward shifts up by one. The CHECK constraint
-- must be dropped BEFORE renumbering existing rows on an already-existing
-- table (CREATE TABLE IF NOT EXISTS above is a no-op there, so the
-- ORIGINAL 5-value constraint is still the live one) — renumbering first
-- would have every renamed row transiently violate that still-active old
-- constraint. Re-added after with the final 6-value list. The UPDATE's
-- CASE targets are each other's non-overlapping old values, so it's a
-- no-op (WHERE matches nothing) once already applied, and safe to re-run.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

UPDATE tasks SET status = CASE status
  WHEN '4.done' THEN '5.done'
  WHEN '3.ready_for_staging' THEN '4.ready_for_staging'
  WHEN '2.in_test' THEN '3.in_test'
  WHEN '1.ready_for_dev' THEN '2.ready_for_dev'
  ELSE status
END
WHERE status IN ('4.done', '3.ready_for_staging', '2.in_test', '1.ready_for_dev');

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('0.backlog','1.in_analyst','2.ready_for_dev','3.in_test','4.ready_for_staging','5.done'));

-- per-status "entered at" stamps for the already-created prod table (the
-- CREATE TABLE above is a no-op there). Backfill only the stamp matching
-- each row's CURRENT status — there's no history to reconstruct the
-- earlier ones — using updated_at as the best available proxy for "when
-- it last moved". The IS NULL guard makes every backfill a no-op on
-- re-run and never clobbers a real stamp the app has since written.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS in_analyst_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ready_for_dev_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS in_test_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ready_for_staging_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ;

UPDATE tasks SET in_analyst_at        = updated_at WHERE status = '1.in_analyst'        AND in_analyst_at IS NULL;
UPDATE tasks SET ready_for_dev_at     = updated_at WHERE status = '2.ready_for_dev'     AND ready_for_dev_at IS NULL;
UPDATE tasks SET in_test_at           = updated_at WHERE status = '3.in_test'           AND in_test_at IS NULL;
UPDATE tasks SET ready_for_staging_at = updated_at WHERE status = '4.ready_for_staging' AND ready_for_staging_at IS NULL;
UPDATE tasks SET done_at              = updated_at WHERE status = '5.done'              AND done_at IS NULL;

-- Platform simplified down to just Web/App — 'BE' and 'App/Auto' (legacy
-- values; distinct from the 'BE Dev' resource_roles team, untouched here)
-- both fold into 'App'. No CHECK constraint on this column, so nothing
-- else needs migrating; the WHERE matches nothing once already applied,
-- safe to re-run.
UPDATE tasks SET platform = 'App' WHERE platform IN ('BE', 'App/Auto');

-- PIC (người phụ trách) list for subtasks below — a real lookup table the
-- user manages themselves (add/rename/delete via PUT/DELETE
-- /api/pics/:id), NOT the users/login table. subtasks.pic stores the
-- picked NAME as text rather than this table's id, same reasoning as
-- resource_roles/task_resource_roles: a rename is a plain text swap with
-- no FK churn on the subtasks it's already assigned to.
CREATE TABLE IF NOT EXISTS pics (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- one task's checklist of smaller units of work, each independently
-- assignable/trackable — deliberately a much lighter record than tasks
-- itself: only name is required, everything else (status/dates/pic) can
-- be filled in later or left blank. status is its own 3-value pipeline
-- (todo/wip/done), unrelated to the parent task's 6-stage one.
CREATE TABLE IF NOT EXISTS subtasks (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'wip', 'done')),
  start_date DATE,
  due_date DATE,
  pic TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);

-- one row per calendar night (Vietnam midnight — see src/lib/today.js),
-- captured by a scheduled job hitting POST /api/snapshots/run (see
-- src/routes/snapshots.js) so progress-over-time can be analyzed later
-- without replaying activity_logs. snapshot_date is UNIQUE so re-running
-- the same night (retry, manual re-run) overwrites rather than duplicates.
-- by_status/by_category/sprint_now/sprint_next are JSON blobs rather than
-- normalized columns since their shape (which statuses/categories exist,
-- which sprint is "current") changes over time as the project evolves —
-- normalizing would require a schema migration every time a category is
-- renamed or a sprint is added.
CREATE TABLE IF NOT EXISTS daily_snapshots (
  id SERIAL PRIMARY KEY,
  snapshot_date DATE UNIQUE NOT NULL,
  total_tasks INTEGER NOT NULL,
  completed_tasks INTEGER NOT NULL,
  completion_rate NUMERIC(5,2) NOT NULL,
  by_status JSONB NOT NULL,
  by_category JSONB NOT NULL,
  sprint_now JSONB,
  sprint_next JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quy trình vận hành (Operations/Ticket/Marketing SOP playbook), imported
-- from "[TTT] Operation.xlsx" (3 sheets: Vận hành, Xử lý ticket, Marketing
-- Overall) and kept editable here going forward. Deliberately flat/plain
-- text columns, not a normalized taxonomy with its own lookup tables —
-- group_name/category/pic are freeform (same "+ Thêm ... mới" convention
-- as tasks.category), and context/steps/stakeholders/reference are long
-- free text (the source sheet's cells are multi-paragraph, often with
-- embedded step numbering and links). steps is the column meant to matter
-- most for a future "AI suggests the right process" or chatbot feature —
-- kept as plain readable text rather than some structured step format, so
-- it can be handed to an LLM as-is with no lossy conversion needed.
CREATE TABLE IF NOT EXISTS sops (
  id SERIAL PRIMARY KEY,
  group_name TEXT NOT NULL,
  category TEXT,
  title TEXT NOT NULL,
  context TEXT,
  steps TEXT,
  next_action TEXT,
  timing TEXT,
  stakeholders TEXT,
  reference TEXT,
  pic TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sops_group ON sops(group_name);

-- timing started out as one free-text field mixing "how often" and "how
-- long it takes" (that's literally how the source Excel's Timing column
-- was written — e.g. "Quarterly" + "5-7 business days" in the same cell).
-- Split so each has its own column; timing keeps the frequency meaning.
ALTER TABLE sops ADD COLUMN IF NOT EXISTS duration TEXT;

-- one row per chatbot exchange (see src/routes/chatbot.js) — exists so
-- "what does the team actually ask" and "how well did the model answer"
-- are visible without re-reading LLM_DEBUG=1 terminal output, which
-- doesn't persist. actor_email/name are whatever the request carried
-- (same soft, unverified identity as everywhere else in this app — see
-- src/app.js's decodeActorHeader), nullable since the chatbot route itself
-- has no role gate. rating starts NULL (no feedback given yet, not
-- "neutral") and is filled in later by PATCH /api/chatbot/:id/rating from
-- the 👍/👎 under each reply in the widget — the cheap human-judged signal
-- this project uses instead of an LLM-graded eval loop, appropriate at a
-- 2-3-person internal-tool scale.
CREATE TABLE IF NOT EXISTS chatbot_logs (
  id SERIAL PRIMARY KEY,
  actor_email TEXT,
  actor_name TEXT,
  message TEXT NOT NULL,
  reply TEXT NOT NULL,
  prompt_chars INTEGER,
  latency_ms INTEGER,
  model TEXT,
  rating SMALLINT CHECK (rating IS NULL OR rating IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chatbot_logs_created_at ON chatbot_logs(created_at);

-- mode/tool_calls record HOW the reply was produced (see
-- src/routes/chatbot.js): 'tools' means the model looked data up via
-- chatbotTools.js's SQL-backed functions (accurate counts/filters, small
-- prompt); 'context_dump' means the older fallback that stuffs the whole
-- phase/sprint/task/SOP table into the prompt (still what Gemini uses,
-- since only Ollama has tool-calling wired up — see
-- llmClient.supportsTools). tool_calls is NULL for context_dump rows.
-- Both nullable so rows logged before this migration still read fine.
ALTER TABLE chatbot_logs ADD COLUMN IF NOT EXISTS mode TEXT;
ALTER TABLE chatbot_logs ADD COLUMN IF NOT EXISTS tool_calls JSONB;
