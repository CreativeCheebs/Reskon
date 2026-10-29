-- auth.db: accounts and login sessions. Each user's own data lives in a
-- separate SQLite file (user.db_file), with the ordinary JitterBug schema.

CREATE TABLE user (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,          -- lower case
  password_hash TEXT NOT NULL,                 -- bcrypt
  is_admin      INTEGER NOT NULL DEFAULT 0,
  db_file       TEXT NOT NULL UNIQUE,          -- relative to the data directory
  created_at    TEXT NOT NULL,
  disabled_at   TEXT                           -- disabled users cannot sign in; data is kept
);

CREATE TABLE login_session (
  token_hash   TEXT PRIMARY KEY,               -- sha256 of the cookie value; the token itself is never stored
  user_id      INTEGER NOT NULL REFERENCES user(id),
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  user_agent   TEXT
);
CREATE INDEX login_session_user ON login_session(user_id);
