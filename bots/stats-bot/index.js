require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const db = require('../../shared/database');
const axios = require('axios');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const ROBLOX_API_URL = 'https://apis.roblox.com/cloud/v2/universes';
const UNIVERSE_ID = process.env.ROBLOX_UNIVERSE_ID;
const API_KEY = process.env.ROBLOX_API_KEY;
const CREATOR_ROLE_ID = process.env.CREATOR_ROLE_ID;
const REPORT_WEBHOOK_URL = process.env.REPORT_WEBHOOK_URL;

const RANKS = [
    { tier: 1, name: 'Copper 5', mmrMin: 0, mmrMax: 200 },
    { tier: 2, name: 'Copper 4', mmrMin: 201, mmrMax: 400 },
    { tier: 3, name: 'Copper 3', mmrMin: 401, mmrMax: 600 },
    { tier: 4, name: 'Copper 2', mmrMin: 601, mmrMax: 800 },
    { tier: 5, name: 'Copper 1', mmrMin: 801, mmrMax: 1000 },
    { tier: 6, name: 'Bronze 5', mmrMin: 1001, mmrMax: 1200 },
    { tier: 7, name: 'Bronze 4', mmrMin: 1201, mmrMax: 1400 },
    { tier: 8, name: 'Bronze 3', mmrMin: 1401, mmrMax: 1600 },
    { tier: 9, name: 'Bronze 2', mmrMin: 1601, mmrMax: 1800 },
    { tier: 10, name: 'Bronze 1', mmrMin: 1801, mmrMax: 2000 },
    { tier: 11, name: 'Silver 5', mmrMin: 2001, mmrMax: 2200 },
    { tier: 12, name: 'Silver 4', mmrMin: 2201, mmrMax: 2400 },
    { tier: 13, name: 'Silver 3', mmrMin: 2401, mmrMax: 2600 },
    { tier: 14, name: 'Silver 2', mmrMin: 2601, mmrMax: 2800 },
    { tier: 15, name: 'Silver 1', mmrMin: 2801, mmrMax: 3000 },
    { tier: 16, name: 'Gold 5', mmrMin: 3001, mmrMax: 3200 },
    { tier: 17, name: 'Gold 4', mmrMin: 3201, mmrMax: 3400 },
    { tier: 18, name: 'Gold 3', mmrMin: 3401, mmrMax: 3600 },
    { tier: 19, name: 'Gold 2', mmrMin: 3601, mmrMax: 3800 },
    { tier: 20, name: 'Gold 1', mmrMin: 3801, mmrMax: 4000 },
    { tier: 21, name: 'Platinum 5', mmrMin: 4001, mmrMax: 4200 },
    { tier: 22, name: 'Platinum 4', mmrMin: 4201, mmrMax: 4400 },
    { tier: 23, name: 'Platinum 3', mmrMin: 4401, mmrMax: 4600 },
    { tier: 24, name: 'Platinum 2', mmrMin: 4601, mmrMax: 4800 },
    { tier: 25, name: 'Platinum 1', mmrMin: 4801, mmrMax: 5000 },
    { tier: 26, name: 'Emerald 5', mmrMin: 5001, mmrMax: 5200 },
    { tier: 27, name: 'Emerald 4', mmrMin: 5201, mmrMax: 5400 },
    { tier: 28, name: 'Emerald 3', mmrMin: 5401, mmrMax: 5600 },
    { tier: 29, name: 'Emerald 2', mmrMin: 5601, mmrMax: 5800 },
    { tier: 30, name: 'Emerald 1', mmrMin: 5801, mmrMax: 6000 },
    { tier: 31, name: 'Diamond 5', mmrMin: 6001, mmrMax: 6300 },
    { tier: 32, name: 'Diamond 4', mmrMin: 6301, mmrMax: 6600 },
    { tier: 33, name: 'Diamond 3', mmrMin: 6601, mmrMax: 6900 },
    { tier: 34, name: 'Diamond 2', mmrMin: 6901, mmrMax: 7200 },
    { tier: 35, name: 'Diamond 1', mmrMin: 7201, mmrMax: 7500 },
    { tier: 36, name: 'Champion', mmrMin: 7501, mmrMax: 10000 },
    { tier: 37, name: 'Top Champion', mmrMin: 10001, mmrMax: 999999 }
];

function getRankFromMMR(mmr) {
    for (let i = RANKS.length - 1; i >= 0; i--) {
        if (mmr >= RANKS[i].mmrMin) return RANKS[i];
    }
    return RANKS[0];
}

async function getOrCreatePlayer(robloxId, username) {
    let result = await db.query('SELECT * FROM players WHERE roblox_id = $1', [robloxId]);
    if (result.rows.length === 0) {
        await db.query('INSERT INTO players (roblox_id, username, display_name) VALUES ($1, $2, $2)', [robloxId, username]);
        await db.query('INSERT INTO player_stats (roblox_id) VALUES ($1)', [robloxId]);
    }
    return { roblox_id: robloxId, username };
}

async function sendWebhook(content) {
    if (!REPORT_WEBHOOK_URL) return;
    try { await axios.post(REPORT_WEBHOOK_URL, { content }); } catch(e) {}
}

client.once('ready', async () => {
    console.log(`✅ Stats Bot logged in as ${client.user.tag}`);
    
    const commands = [
        new SlashCommandBuilder().setName('stats').setDescription('Check a player\'s stats').addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true)),
        new SlashCommandBuilder().setName('connect').setDescription('Connect Discord to Roblox').addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true)),
        new SlashCommandBuilder().setName('ban').setDescription('[Owner] Ban a player').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)).addStringOption(opt => opt.setName('duration').setDescription('1h,6h,12h,1d,3d,7d,perm').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(true)),
        new SlashCommandBuilder().setName('live').setDescription('[Owner] Show live matches'),
        new SlashCommandBuilder().setName('playerinfo').setDescription('[Owner] Player details').addStringOption(opt => opt.setName('username').setDescription('Roblox username').setRequired(true))
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_STATS_BOT_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands.map(c => c.toJSON()) });
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    
    if (interaction.commandName === 'stats') {
        await interaction.deferReply();
        const username = interaction.options.getString('username');
        try {
            const robloxRes = await axios.get(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}`);
            if (robloxRes.data.data.length === 0) return interaction.editReply('❌ User not found');
            const user = robloxRes.data.data[0];
            await getOrCreatePlayer(user.id, user.name);
            const stats = await db.query('SELECT * FROM player_stats WHERE roblox_id = $1', [user.id]);
            const stat = stats.rows[0] || {};
            const rank = getRankFromMMR(stat.mmr || 0);
            const kd = stat.total_deaths > 0 ? (stat.total_kills / stat.total_deaths).toFixed(2) : '0';
            const embed = new EmbedBuilder().setTitle(`📊 ${user.name}'s Stats`).setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=420&height=420&format=png`).setColor(0x2b2d31).addFields(
                { name: '🏆 Rank', value: rank.name, inline: true },
                { name: '📈 MMR', value: String(stat.mmr || 0), inline: true },
                { name: '📊 K/D', value: kd, inline: true },
                { name: '🏅 Wins', value: String(stat.total_wins || 0), inline: true },
                { name: '💀 Kills', value: String(stat.total_kills || 0), inline: true },
                { name: '⚠️ Reports', value: String(stat.total_reports_received || 0), inline: true }
            );
            await interaction.editReply({ embeds: [embed] });
        } catch(e) { await interaction.editReply('❌ Error fetching stats'); }
    }
    
    else if (interaction.commandName === 'connect') {
        await interaction.deferReply({ ephemeral: true });
        const username = interaction.options.getString('username');
        try {
            const robloxRes = await axios.get(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}`);
            if (robloxRes.data.data.length === 0) return interaction.editReply({ content: '❌ User not found', ephemeral: true });
            const user = robloxRes.data.data[0];
            await getOrCreatePlayer(user.id, user.name);
            await db.query('INSERT INTO discord_links (discord_id, roblox_id, linked_at) VALUES ($1, $2, NOW()) ON CONFLICT (discord_id) DO UPDATE SET roblox_id = $2, linked_at = NOW()', [interaction.user.id, user.id]);
            await interaction.editReply({ content: `✅ Connected **${user.name}** to your Discord!`, ephemeral: true });
        } catch(e) { await interaction.editReply({ content: '❌ Error connecting', ephemeral: true }); }
    }
    
    else if (interaction.commandName === 'ban') {
        if (!interaction.member.roles.cache.has(CREATOR_ROLE_ID)) return interaction.reply({ content: '❌ No permission', ephemeral: true });
        await interaction.deferReply();
        const targetUser = interaction.options.getUser('user');
        const durationStr = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason');
        const durationMap = { '1h': 3600, '6h': 21600, '12h': 43200, '1d': 86400, '3d': 259200, '7d': 604800, 'perm': 0 };
        const seconds = durationMap[durationStr];
        if (!seconds) return interaction.editReply('❌ Invalid duration');
        const link = await db.query('SELECT roblox_id FROM discord_links WHERE discord_id = $1', [targetUser.id]);
        if (link.rows.length === 0) return interaction.editReply('❌ User not connected');
        const expiresAt = seconds === 0 ? null : new Date(Date.now() + seconds * 1000);
        await db.query('INSERT INTO bans (roblox_id, discord_id, banned_by_discord_id, reason, duration_seconds, expires_at) VALUES ($1, $2, $3, $4, $5, $6)', [link.rows[0].roblox_id, targetUser.id, interaction.user.id, reason, seconds, expiresAt]);
        await db.query('UPDATE player_stats SET is_banned = TRUE, ban_reason = $1, ban_expires = $2 WHERE roblox_id = $3', [reason, expiresAt, link.rows[0].roblox_id]);
        await sendWebhook(`🔨 **BAN** | ${targetUser.tag} banned for ${durationStr}\n📝 Reason: ${reason}`);
        await interaction.editReply(`✅ Banned ${targetUser.tag} for ${durationStr}`);
    }
    
    else if (interaction.commandName === 'live') {
        if (!interaction.member.roles.cache.has(CREATOR_ROLE_ID)) return interaction.reply({ content: '❌ No permission', ephemeral: true });
        await interaction.deferReply();
        const matches = await db.query(`SELECT DISTINCT m.match_id, m.map_name, m.mode_name, json_agg(json_build_object('username', p.username, 'kills', mp.kills, 'deaths', mp.deaths)) as players FROM matches m JOIN match_participants mp ON m.match_id = mp.match_id JOIN players p ON mp.roblox_id = p.roblox_id WHERE m.ended_at > NOW() - INTERVAL '1 hour' GROUP BY m.match_id LIMIT 20`);
        if (matches.rows.length === 0) return interaction.editReply('📭 No active matches');
        let desc = '';
        for (const m of matches.rows) {
            desc += `**${m.map_name}** (${m.mode_name}) - ${m.players.length} players\n`;
            for (const p of m.players.slice(0, 5)) desc += `  • ${p.username} - ${p.kills}/${p.deaths}\n`;
            desc += '\n';
        }
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🎮 Live Matches').setDescription(desc).setColor(0x2b2d31)] });
    }
    
    else if (interaction.commandName === 'playerinfo') {
        if (!interaction.member.roles.cache.has(CREATOR_ROLE_ID)) return interaction.reply({ content: '❌ No permission', ephemeral: true });
        await interaction.deferReply();
        const username = interaction.options.getString('username');
        try {
            const robloxRes = await axios.get(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}`);
            if (robloxRes.data.data.length === 0) return interaction.editReply('❌ User not found');
            const user = robloxRes.data.data[0];
            const stats = await db.query('SELECT * FROM player_stats WHERE roblox_id = $1', [user.id]);
            const stat = stats.rows[0] || {};
            const rank = getRankFromMMR(stat.mmr || 0);
            const embed = new EmbedBuilder().setTitle(`🔍 ${user.name}`).setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=420&height=420&format=png`).setColor(0x2b2d31).addFields(
                { name: '🏆 Rank', value: rank.name, inline: true },
                { name: '📈 MMR', value: String(stat.mmr || 0), inline: true },
                { name: '⚠️ Reports', value: String(stat.total_reports_received || 0), inline: true },
                { name: '🚫 Banned', value: stat.is_banned ? 'Yes' : 'No', inline: true }
            );
            await interaction.editReply({ embeds: [embed] });
        } catch(e) { await interaction.editReply('❌ Error'); }
    }
});

client.login(process.env.DISCORD_STATS_BOT_TOKEN);
