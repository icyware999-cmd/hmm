require('dotenv').config();
const express = require('express');
const db = require('../shared/database');

const app = express();
const PORT = process.env.PUBLIC_TRACKER_PORT || 3001;

app.use(express.json());
app.use(express.static('public'));

app.get('/api/player/:username', async (req, res) => {
    const result = await db.query('SELECT * FROM players WHERE username ILIKE $1', [req.params.username]);
    if (result.rows.length === 0) return res.json({ error: 'Player not found' });
    const player = result.rows[0];
    const stats = await db.query('SELECT * FROM player_stats WHERE roblox_id = $1', [player.roblox_id]);
    const matches = await db.query(`SELECT m.map_name, m.mode_name, m.ended_at, mp.kills, mp.deaths, mp.assists, mp.special_tags FROM match_participants mp JOIN matches m ON mp.match_id = m.match_id WHERE mp.roblox_id = $1 ORDER BY m.ended_at DESC LIMIT 20`, [player.roblox_id]);
    const kd = stats.rows[0]?.total_deaths > 0 ? (stats.rows[0].total_kills / stats.rows[0].total_deaths).toFixed(2) : '0';
    res.json({ player, stats: stats.rows[0] || {}, kd, recentMatches: matches.rows });
});

app.get('/api/leaderboard', async (req, res) => {
    const result = await db.query('SELECT p.username, ps.rank_name, ps.mmr, ps.total_kills FROM player_stats ps JOIN players p ON ps.roblox_id = p.roblox_id ORDER BY ps.mmr DESC LIMIT 100');
    res.json(result.rows);
});

app.get('/', (req, res) => res.sendFile(__dirname + '/public/tracker.html'));

app.listen(PORT, () => console.log(`✅ Public tracker on port ${PORT}`));
