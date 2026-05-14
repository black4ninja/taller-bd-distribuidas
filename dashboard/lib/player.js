import { ensurePlayer, newPlayerId, getPlayer } from './game-state.js';

const COOKIE_NAME = 'tbd_player';
const COOKIE_MAX_AGE = 6 * 60 * 60 * 1000; // 6h

// Express middleware: garantiza req.playerId + req.player en cada request.
export function playerMiddleware(req, res, next) {
  let pid = req.signedCookies?.[COOKIE_NAME];
  if (!pid) {
    pid = newPlayerId();
    ensurePlayer(pid);
    res.cookie(COOKIE_NAME, pid, {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE
    });
  } else {
    ensurePlayer(pid); // por si el row de la BD fue borrado pero queda la cookie
  }
  req.playerId = pid;
  req.player = getPlayer(pid);
  next();
}

export { COOKIE_NAME };
