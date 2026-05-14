import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { STATIONS } from './lib/validators.js';
import { playerMiddleware, COOKIE_NAME } from './lib/player.js';
import {
  getCompletedStations,
  ALL_STATIONS,
  totalHintsUsed,
  elapsedSinceStart,
  getPlayer,
  deadlineRemainingSeconds,
  checkAndApplyTimeout,
  accelerateTime,
  startGame,
  isGameStarted,
  newPlayerId,
  ensurePlayer,
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
  if (!player?.started_at) return res.render('welcome', { player });

  const completed = new Set(getCompletedStations(req.playerId));
  const allDone = ALL_STATIONS.every(s => completed.has(s));
  const stationsList = ALL_STATIONS.map(id => ({
    id,
    title: STATIONS[id].title,
    motor: STATION_INTRO[id].motor,
    completed: completed.has(id)
  }));
  const elapsedSec = elapsedSinceStart(req.playerId);
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

// Inicia el juego (set started_at) — el reloj de 2h empieza aquí
app.post('/start-game', (req, res) => {
  startGame(req.playerId);
  res.json({ ok: true, redirect: '/' });
});

// Nuevo juego post game-over: genera nuevo player_id y arranca
app.post('/new-game', (req, res) => {
  const pid = newPlayerId();
  ensurePlayer(pid);
  startGame(pid);
  res.cookie(COOKIE_NAME, pid, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 6 * 60 * 60 * 1000
  });
  res.json({ ok: true, redirect: '/' });
});

app.get('/walkthrough', (req, res) => res.render('walkthrough'));
app.get('/caso',        (req, res) => res.render('caso'));

// Estado público del jugador (para refresco en cliente — credibilidad, tiempo, progreso, deadline)
app.get('/state', (req, res) => {
  checkAndApplyTimeout(req.playerId);
  const player = getPlayer(req.playerId);
  const completed = getCompletedStations(req.playerId);
  const started = !!player?.started_at;
  const elapsedSec = started ? elapsedSinceStart(req.playerId) : null;
  res.json({
    started,
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
    deadline_remaining_seconds: started ? deadlineRemainingSeconds(req.playerId) : null,
    deadline_started: started
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
