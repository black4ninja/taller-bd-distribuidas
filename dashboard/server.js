import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProgress, allCompleted, elapsedMinutes, totalHintsUsed } from './lib/progress.js';
import { STATIONS } from './lib/validators.js';
import stationsRouter, { STATION_INTRO } from './routes/stations.js';
import hintsRouter from './routes/hints.js';
import solveRouter from './routes/solve.js';
import cheatsheetRouter from './routes/cheatsheet.js';
import searchRouter from './routes/search.js';

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

app.get('/', (req, res) => {
  const progress = getProgress(req);
  const stationsList = ['E1', 'E2', 'E3', 'E4'].map(id => ({
    id,
    title: STATIONS[id].title,
    motor: STATION_INTRO[id].motor,
    completed: progress.completed.includes(id)
  }));
  res.render('index', {
    stations: stationsList,
    progress,
    elapsed: elapsedMinutes(progress),
    hints: totalHintsUsed(progress),
    canSolve: allCompleted(progress)
  });
});

app.get('/walkthrough', (req, res) => {
  res.render('walkthrough');
});

app.get('/progress', (req, res) => {
  const progress = getProgress(req);
  res.json({
    ...progress,
    elapsedMinutes: elapsedMinutes(progress),
    totalHintsUsed: totalHintsUsed(progress),
    allCompleted: allCompleted(progress)
  });
});

app.use(stationsRouter);
app.use(hintsRouter);
app.use(solveRouter);
app.use(cheatsheetRouter);
app.use(searchRouter);

app.use((req, res) => {
  res.status(404).render('404');
});

app.listen(PORT, () => {
  console.log(`[dashboard] escuchando en http://localhost:${PORT}`);
});
