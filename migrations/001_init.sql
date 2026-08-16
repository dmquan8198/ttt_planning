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
    CHECK (status IN ('0.backlog','1.ready_for_dev','2.in_test','3.ready_for_staging','4.done')),
  done_analyst BOOLEAN NOT NULL DEFAULT FALSE,
  done_dev BOOLEAN NOT NULL DEFAULT FALSE,
  done_uat BOOLEAN NOT NULL DEFAULT FALSE,
  done_staging BOOLEAN NOT NULL DEFAULT FALSE,
  start_date DATE NOT NULL,
  due_date DATE NOT NULL,
  date_overridden BOOLEAN NOT NULL DEFAULT FALSE,
  why TEXT,
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
