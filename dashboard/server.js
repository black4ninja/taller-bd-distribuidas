import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { STATIONS } from './lib/validators.js';
import { playerMiddleware } from './lib/player.js';
import {
  getCompletedStations,
  ALL_STATIONS,
  totalHintsUsed,
  elapsedSinceE1Open,
  getPlayer,
  deadlineRemainingSeconds,
  checkAndApplyTimeout,
  accelerateTime,
  DEADLINE_SECONDS
} from './lib/game-state.js';
import stationsRouter, { STATION_INTRO } from './routes/stations.js';
import hintsRouter from './routes/hints.js';
import solveRouter from './routes/solve.js';
import cheatsheetRouter from './routes/cheatsheet.js';
import searchRouter from './routes/search.js';
import mongoShellRouter from './routes/mongo-shell.js';
import notesRouter from './routes/notes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret';

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(SESSION_SECRET));
app.use(playerMiddleware);

app.get('/', (req, res) => {
  checkAndApplyTimeout(req.playerId);
  const player = getPlayer(req.playerId);
  if (player?.game_over) return res.render('game-over', { player });

  const completed = new Set(getCompletedStations(req.playerId));
  const allDone = ALL_STATIONS.every(s => completed.has(s));
  const stationsList = ALL_STATIONS.map(id => ({
    id,
    title: STATIONS[id].title,
    motor: STATION_INTRO[id].motor,
    completed: completed.has(id)
  }));
  const elapsedSec = elapsedSinceE1Open(req.playerId);
  res.render('index', {
    stations: stationsList,
    player,
    elapsed: elapsedSec != null ? Math.round(elapsedSec / 60) : 0,
    elapsedSec: elapsedSec ?? 0,
    hints: totalHintsUsed(req.playerId),
    completedCount: completed.size,
    canSolve: allDone
  });
});

app.get('/walkthrough', (req, res) => res.render('walkthrough'));
app.get('/caso',        (req, res) => res.render('caso'));

// Estado público del jugador (para refresco en cliente — credibilidad, tiempo, progreso, deadline)
app.get('/state', (req, res) => {
  checkAndApplyTimeout(req.playerId);
  const player = getPlayer(req.playerId);
  const completed = getCompletedStations(req.playerId);
  const elapsedSec = elapsedSinceE1Open(req.playerId);
  res.json({
    credibility: player?.credibility ?? 0,
    max_credibility: 5,
    game_over: !!player?.game_over,
    game_over_reason: player?.game_over_reason || null,
    case_solved_at: player?.case_solved_at || null,
    completed,
    all_completed: ALL_STATIONS.every(s => completed.includes(s)),
    hints_used: totalHintsUsed(req.playerId),
    elapsed_seconds: elapsedSec,
    elapsed_minutes: elapsedSec != null ? Math.round(elapsedSec / 60) : null,
    deadline_total_seconds: DEADLINE_SECONDS,
    deadline_remaining_seconds: elapsedSec == null ? DEADLINE_SECONDS : deadlineRemainingSeconds(req.playerId),
    deadline_started: elapsedSec != null
  });
});

// DEV: acelerar el tiempo (suma ms al offset del jugador)
app.post('/dev/accelerate', (req, res) => {
  const seconds = Math.max(1, Math.min(parseInt(req.body?.seconds, 10) || 300, 7200));
  accelerateTime(req.playerId, seconds * 1000);
  checkAndApplyTimeout(req.playerId);
  const player = getPlayer(req.playerId);
  res.json({
    ok: true,
    added_seconds: seconds,
    game_over: !!player?.game_over,
    game_over_reason: player?.game_over_reason || null,
    deadline_remaining_seconds: deadlineRemainingSeconds(req.playerId)
  });
});

app.use(stationsRouter);
app.use(hintsRouter);
app.use(solveRouter);
app.use(cheatsheetRouter);
app.use(searchRouter);
app.use(mongoShellRouter);
app.use(notesRouter);

app.use((req, res) => res.status(404).render('404'));

app.listen(PORT, () => {
  console.log(`[dashboard] escuchando en http://localhost:${PORT}`);
});
