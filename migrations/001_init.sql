CREATE TABLE IF NOT EXISTS phases (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  target_date DATE NOT NULL
);

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
  start_date DATE,
  due_date DATE,
  date_overridden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_phase ON tasks(phase_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON tasks(sprint_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_activity_logs_task ON activity_logs(task_id);
