CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE modes (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

INSERT INTO modes (name) VALUES ('Ranked'), ('Unranked'), ('Quick'), ('Deathmatch') ON CONFLICT DO NOTHING;

CREATE TABLE players (
    roblox_id BIGINT PRIMARY KEY,
    username TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    platform TEXT DEFAULT 'PC',
    created_at TIMESTAMP DEFAULT NOW(),
    last_seen TIMESTAMP,
    claimed_by_discord_id TEXT,
    claimed_at TIMESTAMP,
    google_email TEXT
);

CREATE TABLE player_stats (
    roblox_id BIGINT PRIMARY KEY REFERENCES players(roblox_id) ON DELETE CASCADE,
    mmr INT DEFAULT 0,
    rank_tier INT DEFAULT 1,
    rank_name TEXT DEFAULT 'Copper 5',
    total_matches INT DEFAULT 0,
    total_wins INT DEFAULT 0,
    total_losses INT DEFAULT 0,
    total_kills INT DEFAULT 0,
    total_deaths INT DEFAULT 0,
    total_assists INT DEFAULT 0,
    total_headshots INT DEFAULT 0,
    total_abandons INT DEFAULT 0,
    total_reports_received INT DEFAULT 0,
    ranked_matches INT DEFAULT 0,
    ranked_wins INT DEFAULT 0,
    ranked_losses INT DEFAULT 0,
    ranked_kills INT DEFAULT 0,
    ranked_deaths INT DEFAULT 0,
    quick_matches INT DEFAULT 0,
    quick_wins INT DEFAULT 0,
    quick_losses INT DEFAULT 0,
    quick_kills INT DEFAULT 0,
    quick_deaths INT DEFAULT 0,
    dm_matches INT DEFAULT 0,
    dm_wins INT DEFAULT 0,
    dm_losses INT DEFAULT 0,
    dm_kills INT DEFAULT 0,
    dm_deaths INT DEFAULT 0,
    unranked_matches INT DEFAULT 0,
    unranked_wins INT DEFAULT 0,
    unranked_losses INT DEFAULT 0,
    unranked_kills INT DEFAULT 0,
    unranked_deaths INT DEFAULT 0,
    is_banned BOOLEAN DEFAULT FALSE,
    ban_reason TEXT,
    ban_expires TIMESTAMP,
    banned_by_discord_id TEXT
);

CREATE TABLE operator_stats (
    id SERIAL PRIMARY KEY,
    roblox_id BIGINT REFERENCES players(roblox_id) ON DELETE CASCADE,
    operator_name TEXT NOT NULL,
    kills INT DEFAULT 0,
    deaths INT DEFAULT 0,
    headshots INT DEFAULT 0,
    matches_played INT DEFAULT 0,
    wins INT DEFAULT 0,
    losses INT DEFAULT 0,
    UNIQUE(roblox_id, operator_name)
);

CREATE TABLE matches (
    match_id TEXT PRIMARY KEY,
    map_name TEXT NOT NULL,
    mode_name TEXT NOT NULL,
    started_at TIMESTAMP,
    ended_at TIMESTAMP DEFAULT NOW(),
    duration INT,
    winning_team TEXT
);

CREATE TABLE match_participants (
    id SERIAL PRIMARY KEY,
    match_id TEXT REFERENCES matches(match_id) ON DELETE CASCADE,
    roblox_id BIGINT REFERENCES players(roblox_id) ON DELETE CASCADE,
    operator_name TEXT,
    kills INT DEFAULT 0,
    deaths INT DEFAULT 0,
    assists INT DEFAULT 0,
    headshots INT DEFAULT 0,
    rp_change INT DEFAULT 0,
    team_won BOOLEAN DEFAULT FALSE,
    special_tags TEXT[] DEFAULT '{}',
    abandoned BOOLEAN DEFAULT FALSE,
    platform TEXT
);

CREATE TABLE reports (
    id SERIAL PRIMARY KEY,
    reporter_id BIGINT REFERENCES players(roblox_id) ON DELETE CASCADE,
    reported_id BIGINT REFERENCES players(roblox_id) ON DELETE CASCADE,
    match_id TEXT REFERENCES matches(match_id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    resolved BOOLEAN DEFAULT FALSE
);

CREATE TABLE discord_links (
    discord_id TEXT PRIMARY KEY,
    roblox_id BIGINT UNIQUE REFERENCES players(roblox_id) ON DELETE CASCADE,
    linked_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE bans (
    id SERIAL PRIMARY KEY,
    roblox_id BIGINT REFERENCES players(roblox_id) ON DELETE CASCADE,
    discord_id TEXT,
    banned_by_discord_id TEXT,
    reason TEXT,
    duration_seconds INT,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_player_stats_rank ON player_stats(rank_tier, mmr DESC);
CREATE INDEX idx_matches_ended_at ON matches(ended_at DESC);
CREATE INDEX idx_match_participants_roblox_id ON match_participants(roblox_id);
CREATE INDEX idx_reports_reported_id ON reports(reported_id);
