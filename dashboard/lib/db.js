import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = process.env.GAME_DB_PATH || './game.db';
const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    player_id      TEXT PRIMARY KEY,
    created_at     TEXT DEFAULT CURRENT_TIMESTAMP,
    credibility    INTEGER NOT NULL DEFAULT 5,
    game_over      INTEGER NOT NULL DEFAULT 0,
    game_over_at   TEXT,
    case_solved_at TEXT
  );

  CREATE TABLE IF NOT EXISTS station_opens (
    player_id  TEXT NOT NULL,
    station_id TEXT NOT NULL,
    opened_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, station_id)
  );

  CREATE TABLE IF NOT EXISTS stations_completed (
    player_id    TEXT NOT NULL,
    station_id   TEXT NOT NULL,
    completed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, station_id)
  );

  CREATE TABLE IF NOT EXISTS submit_attempts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id     TEXT NOT NULL,
    station_id    TEXT NOT NULL,
    answer        TEXT,
    correct       INTEGER NOT NULL,
    submitted_at  TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_attempts_player ON submit_attempts(player_id);

  CREATE TABLE IF NOT EXISTS hint_uses (
    player_id  TEXT NOT NULL,
    station_id TEXT NOT NULL,
    level      INTEGER NOT NULL,
    used_at    TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, station_id, level)
  );

  CREATE TABLE IF NOT EXISTS notes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id   TEXT NOT NULL,
    content     TEXT NOT NULL,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_notes_player ON notes(player_id);
`);

// Migración idempotente: agrega columnas nuevas si la tabla players ya existía sin ellas
const cols = db.prepare("PRAGMA table_info(players)").all().map(r => r.name);
if (!cols.includes('game_over_at'))     db.exec('ALTER TABLE players ADD COLUMN game_over_at TEXT');
if (!cols.includes('game_over_reason')) db.exec("ALTER TABLE players ADD COLUMN game_over_reason TEXT");
if (!cols.includes('time_offset_ms'))   db.exec('ALTER TABLE players ADD COLUMN time_offset_ms INTEGER NOT NULL DEFAULT 0');
if (!cols.includes('elapsed_at_end_seconds')) db.exec('ALTER TABLE players ADD COLUMN elapsed_at_end_seconds INTEGER');
if (!cols.includes('started_at'))             db.exec('ALTER TABLE players ADD COLUMN started_at TEXT');
if (!cols.includes('case_json'))              db.exec('ALTER TABLE players ADD COLUMN case_json TEXT');
// Ataques pedagógicos (E2 Mongo, E3 Redis)
for (const s of ['e2', 'e3']) {
  if (!cols.includes(`attack_${s}_state`))         db.exec(`ALTER TABLE players ADD COLUMN attack_${s}_state TEXT`);
  if (!cols.includes(`attack_${s}_scheduled_at`))  db.exec(`ALTER TABLE players ADD COLUMN attack_${s}_scheduled_at TEXT`);
  if (!cols.includes(`attack_${s}_activated_at`))  db.exec(`ALTER TABLE players ADD COLUMN attack_${s}_activated_at TEXT`);
  if (!cols.includes(`attack_${s}_defenses`))      db.exec(`ALTER TABLE players ADD COLUMN attack_${s}_defenses TEXT`);
  if (!cols.includes(`attack_${s}_resolved_at`))   db.exec(`ALTER TABLE players ADD COLUMN attack_${s}_resolved_at TEXT`);
  if (!cols.includes(`attack_${s}_quiz_failed`))   db.exec(`ALTER TABLE players ADD COLUMN attack_${s}_quiz_failed TEXT`);
}

export const stmts = {
  ensurePlayer:        db.prepare('INSERT OR IGNORE INTO players (player_id) VALUES (?)'),
  getPlayer:           db.prepare('SELECT * FROM players WHERE player_id = ?'),
  // Toma 2 params: (?1 = elapsed seconds para congelar al hacer game over, ?2 = player_id)
  decrementCredibility:db.prepare(`
    UPDATE players SET
      credibility = MAX(0, credibility - 1),
      game_over = CASE WHEN credibility - 1 <= 0 THEN 1 ELSE 0 END,
      game_over_at = CASE WHEN credibility - 1 <= 0 AND game_over_at IS NULL THEN CURRENT_TIMESTAMP ELSE game_over_at END,
      game_over_reason = CASE WHEN credibility - 1 <= 0 AND game_over_reason IS NULL THEN 'credibility' ELSE game_over_reason END,
      elapsed_at_end_seconds = CASE WHEN credibility - 1 <= 0 AND elapsed_at_end_seconds IS NULL THEN ? ELSE elapsed_at_end_seconds END
    WHERE player_id = ?
  `),
  // Toma 2 params: (?1 = elapsed seconds para congelar, ?2 = player_id)
  triggerTimeout: db.prepare(`
    UPDATE players SET
      game_over = 1,
      game_over_at = COALESCE(game_over_at, CURRENT_TIMESTAMP),
      game_over_reason = COALESCE(game_over_reason, 'timeout'),
      elapsed_at_end_seconds = COALESCE(elapsed_at_end_seconds, ?)
    WHERE player_id = ? AND game_over = 0
  `),
  bumpTimeOffset: db.prepare(`
    UPDATE players SET time_offset_ms = time_offset_ms + ? WHERE player_id = ?
  `),
  startGame: db.prepare(`
    UPDATE players SET started_at = COALESCE(started_at, CURRENT_TIMESTAMP)
    WHERE player_id = ?
  `),
  setCaseJson: db.prepare('UPDATE players SET case_json = ? WHERE player_id = ?'),
  getCaseJson: db.prepare('SELECT case_json FROM players WHERE player_id = ?'),
  // Toma 2 params: (?1 = elapsed seconds para congelar, ?2 = player_id)
  markCaseSolved:      db.prepare(`
    UPDATE players SET
      case_solved_at = COALESCE(case_solved_at, CURRENT_TIMESTAMP),
      elapsed_at_end_seconds = COALESCE(elapsed_at_end_seconds, ?)
    WHERE player_id = ?
  `),

  recordOpen:          db.prepare('INSERT OR IGNORE INTO station_opens (player_id, station_id) VALUES (?, ?)'),
  getOpen:             db.prepare('SELECT opened_at FROM station_opens WHERE player_id = ? AND station_id = ?'),

  markComplete:        db.prepare('INSERT OR IGNORE INTO stations_completed (player_id, station_id) VALUES (?, ?)'),
  getCompletedList:    db.prepare('SELECT station_id, completed_at FROM stations_completed WHERE player_id = ?'),
  isComplete:          db.prepare('SELECT 1 AS yes FROM stations_completed WHERE player_id = ? AND station_id = ?'),

  recordAttempt:       db.prepare('INSERT INTO submit_attempts (player_id, station_id, answer, correct) VALUES (?, ?, ?, ?)'),
  countAttempts:       db.prepare('SELECT COUNT(*) AS n FROM submit_attempts WHERE player_id = ?'),
  countFailedAttempts: db.prepare('SELECT COUNT(*) AS n FROM submit_attempts WHERE player_id = ? AND correct = 0'),

  markHint:            db.prepare('INSERT OR IGNORE INTO hint_uses (player_id, station_id, level) VALUES (?, ?, ?)'),
  getHintsUsed:        db.prepare('SELECT station_id, level, used_at FROM hint_uses WHERE player_id = ?'),

  listNotes:           db.prepare('SELECT id, content, created_at, updated_at FROM notes WHERE player_id = ? ORDER BY id DESC'),
  addNote:             db.prepare('INSERT INTO notes (player_id, content) VALUES (?, ?)'),
  updateNote:          db.prepare('UPDATE notes SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND player_id = ?'),
  deleteNote:          db.prepare('DELETE FROM notes WHERE id = ? AND player_id = ?'),

  // Ataques (E2)
  scheduleAttack_E2:   db.prepare("UPDATE players SET attack_e2_state = 'pending', attack_e2_scheduled_at = ? WHERE player_id = ? AND attack_e2_state IS NULL"),
  activateAttack_E2:   db.prepare("UPDATE players SET attack_e2_state = 'active', attack_e2_activated_at = ? WHERE player_id = ? AND attack_e2_state IN ('pending')"),
  setDefenses_E2:      db.prepare('UPDATE players SET attack_e2_defenses = ? WHERE player_id = ?'),
  setQuizFailed_E2:    db.prepare('UPDATE players SET attack_e2_quiz_failed = ? WHERE player_id = ?'),
  resolveAttack_E2:    db.prepare('UPDATE players SET attack_e2_state = ?, attack_e2_resolved_at = ? WHERE player_id = ?'),
  resetAttack_E2:      db.prepare('UPDATE players SET attack_e2_state = NULL, attack_e2_scheduled_at = NULL, attack_e2_activated_at = NULL, attack_e2_defenses = NULL, attack_e2_resolved_at = NULL, attack_e2_quiz_failed = NULL WHERE player_id = ?'),
  // Ataques (E3)
  scheduleAttack_E3:   db.prepare("UPDATE players SET attack_e3_state = 'pending', attack_e3_scheduled_at = ? WHERE player_id = ? AND attack_e3_state IS NULL"),
  activateAttack_E3:   db.prepare("UPDATE players SET attack_e3_state = 'active', attack_e3_activated_at = ? WHERE player_id = ? AND attack_e3_state IN ('pending')"),
  setDefenses_E3:      db.prepare('UPDATE players SET attack_e3_defenses = ? WHERE player_id = ?'),
  setQuizFailed_E3:    db.prepare('UPDATE players SET attack_e3_quiz_failed = ? WHERE player_id = ?'),
  resolveAttack_E3:    db.prepare('UPDATE players SET attack_e3_state = ?, attack_e3_resolved_at = ? WHERE player_id = ?'),
  resetAttack_E3:      db.prepare('UPDATE players SET attack_e3_state = NULL, attack_e3_scheduled_at = NULL, attack_e3_activated_at = NULL, attack_e3_defenses = NULL, attack_e3_resolved_at = NULL, attack_e3_quiz_failed = NULL WHERE player_id = ?')
};

export default db;
