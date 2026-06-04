require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const db = require('../../shared/database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

const PORT = process.env.DASHBOARD_PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({ secret: process.env.SESSION_SECRET || 'secret', resave: false, saveUninitialized: false, cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } }));

function requireAuth(req, res, next) {
    if (req.session.isAdmin) return next();
    res.redirect('/login');
}

app.get('/login', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><title>Admin Login</title><style>body{background:#1a1a2e;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}.box{background:#16213e;padding:40px;border-radius:10px;text-align:center}input{width:100%;padding:10px;margin:10px 0}button{background:#e94560;color:#fff;padding:10px;border:none;width:100%}</style></head><body><div class="box"><h2>Admin Login</h2><form method="POST"><input type="password" name="key" placeholder="Admin Key" required><button type="submit">Login</button></form></div></body></html>`);
});

app.post('/login', (req, res) => {
    if (req.body.key === ADMIN_KEY) {
        req.session.isAdmin = true;
        res.redirect('/');
    } else {
        res.redirect('/login?error=1');
    }
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });
app.get('/', requireAuth, (req, res) => res.sendFile(__dirname + '/public/admin.html'));

app.get('/api/player/:username', requireAuth, async (req, res) => {
    const result = await db.query('SELECT * FROM players WHERE username ILIKE $1', [req.params.username]);
    if (result.rows.length === 0) return res.json({ error: 'Not found' });
    const stats = await db.query('SELECT * FROM player_stats WHERE roblox_id = $1', [result.rows[0].roblox_id]);
    res.json({ player: result.rows[0], stats: stats.rows[0] || {} });
});

app.get('/api/live-matches', requireAuth, async (req, res) => {
    const matches = await db.query(`SELECT DISTINCT m.match_id, m.map_name, m.mode_name, json_agg(json_build_object('username', p.username, 'kills', mp.kills, 'deaths', mp.deaths)) as players FROM matches m JOIN match_participants mp ON m.match_id = mp.match_id JOIN players p ON mp.roblox_id = p.roblox_id WHERE m.ended_at > NOW() - INTERVAL '1 hour' GROUP BY m.match_id`);
    res.json(matches.rows);
});

app.post('/api/ban', requireAuth, async (req, res) => {
    const { robloxId, duration, reason } = req.body;
    const durationMap = { '1h': 3600, '6h': 21600, '12h': 43200, '1d': 86400, '3d': 259200, '7d': 604800, 'perm': 0 };
    const seconds = durationMap[duration];
    if (!seconds) return res.status(400).json({ error: 'Invalid duration' });
    const expiresAt = seconds === 0 ? null : new Date(Date.now() + seconds * 1000);
    await db.query('INSERT INTO bans (roblox_id, reason, duration_seconds, expires_at) VALUES ($1, $2, $3, $4)', [robloxId, reason, seconds, expiresAt]);
    await db.query('UPDATE player_stats SET is_banned = TRUE, ban_reason = $1, ban_expires = $2 WHERE roblox_id = $3', [reason, expiresAt, robloxId]);
    res.json({ success: true });
});

app.get('/api/leaderboard', async (req, res) => {
    const result = await db.query('SELECT p.username, ps.rank_name, ps.mmr, ps.total_kills FROM player_stats ps JOIN players p ON ps.roblox_id = p.roblox_id ORDER BY ps.mmr DESC LIMIT 100');
    res.json(result.rows);
});

io.on('connection', (socket) => {
    const sendMatches = async () => {
        const result = await db.query(`SELECT DISTINCT m.match_id, m.map_name, m.mode_name, json_agg(json_build_object('username', p.username, 'kills', mp.kills, 'deaths', mp.deaths)) as players FROM matches m JOIN match_participants mp ON m.match_id = mp.match_id JOIN players p ON mp.roblox_id = p.roblox_id WHERE m.ended_at > NOW() - INTERVAL '1 hour' GROUP BY m.match_id LIMIT 20`);
        socket.emit('live-matches', result.rows);
    };
    sendMatches();
    const interval = setInterval(sendMatches, 5000);
    socket.on('disconnect', () => clearInterval(interval));
});

server.listen(PORT, () => console.log(`✅ Dashboard on port ${PORT}`));
