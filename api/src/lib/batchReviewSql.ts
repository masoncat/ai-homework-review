export const CREATE_BATCH_REVIEW_TASKS_SQL = `
CREATE TABLE IF NOT EXISTS batch_review_tasks (
  id VARCHAR(64) PRIMARY KEY,
  session_invite_code VARCHAR(64) NOT NULL,
  parent_task_id VARCHAR(64) NULL,
  retry_from_task_id VARCHAR(64) NULL,
  status VARCHAR(32) NOT NULL,
  answer_pdf_object_key VARCHAR(255) NOT NULL,
  rubric_object_key VARCHAR(255) NOT NULL,
  total_pages INT NOT NULL DEFAULT 0,
  processed_pages INT NOT NULL DEFAULT 0,
  succeeded_pages INT NOT NULL DEFAULT 0,
  failed_pages INT NOT NULL DEFAULT 0,
  pending_pages INT NOT NULL DEFAULT 0,
  summary_json JSON NOT NULL,
  last_error_message TEXT NULL,
  worker_id VARCHAR(128) NULL,
  locked_at DATETIME NULL,
  queued_at DATETIME NOT NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
)
`;

export const CREATE_BATCH_REVIEW_TASK_PAGES_SQL = `
CREATE TABLE IF NOT EXISTS batch_review_task_pages (
  id VARCHAR(96) PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  page_no INT NOT NULL,
  status VARCHAR(32) NOT NULL,
  answer_image_object_key VARCHAR(255) NULL,
  answer_image_url TEXT NULL,
  score DECIMAL(4, 1) NULL,
  level VARCHAR(32) NULL,
  summary TEXT NULL,
  result_json JSON NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  UNIQUE KEY batch_review_task_pages_task_page_unique (task_id, page_no)
)
`;

export const CREATE_BATCH_REVIEW_NOTIFICATIONS_SQL = `
CREATE TABLE IF NOT EXISTS batch_review_notifications (
  id VARCHAR(64) PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  session_invite_code VARCHAR(64) NOT NULL,
  type VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
)
`;

export const CREATE_BATCH_REVIEW_TASK_EVENTS_SQL = `
CREATE TABLE IF NOT EXISTS batch_review_task_events (
  id VARCHAR(64) PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  payload_json JSON NOT NULL,
  created_at DATETIME NOT NULL
)
`;
