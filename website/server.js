const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const RedisStore = require("connect-redis").default;
const mysql = require('mysql2/promise');
const multer = require('multer');
const { initializeBot } = require('./bot/bot.js');

// --- Configuration ---
const app = express();
const port = 3000;
const Redis = require('ioredis');

// Redis Client
const redisClient = new Redis({
  host: 'redis',
  port: 6379
});

// Redis Store
const redisStore = new RedisStore({
  client: redisClient,
  prefix: 'alfapp:'
});

// Session Middleware
app.use(session({
  store: redisStore,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24
  }
}));

// MySQL Connection Pool
const dbPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    supportBigNumbers: true,
    bigNumberStrings: true
});

// Multer Storage Engine
const uploadDir = 'public/uploads';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir)
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname))
    }
});
const upload = multer({ storage: storage });


// Environment variables
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;
const DISCORD_ADMIN_BOT_CHANNEL = process.env.DISCORD_ADMIN_BOT_CHANNEL;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/js', express.static(path.join(__dirname, 'js')));


// --- Role Definitions ---
const { EmbedBuilder } = require('discord.js');


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));


// --- Role Definitions ---
const ROLES = {
    ADMIN: 'Admin',
    STAFF: 'Staff',
    CAPTAIN: 'Captain',
    MEMBER: 'Member',
    VIEWER: 'Viewer'
};

// --- STATIC DISCORD ROLE IDs ---
const DISCORD_ROLE_IDS = {
    ADMIN_ROLE_ID: '1438137785092542497', 
    STAFF_ROLE_ID: '1438132130000408719',
    CAPTAIN_ROLE_ID: '1438140784435269742'
};

// --- TEAM COLORS ---
const TEAM_COLORS = [
    '#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#9B59B6', '#F7A072',
    '#3498DB', '#2ECC71', '#F1C40F', '#E74C3C', '#1ABC9C', '#E67E22',
    '#54A0FF', '#576574', '#222F3E', '#FECA57', '#AEC6CF', '#B39EB5',
    '#FFDAB9', '#C1E1C1'
];

function getUserRole(userId, discordRoles) {
    if (!discordRoles || discordRoles.length === 0) return ROLES.VIEWER;
    if (discordRoles.includes(DISCORD_ROLE_IDS.ADMIN_ROLE_ID)) return ROLES.ADMIN;
    if (discordRoles.includes(DISCORD_ROLE_IDS.STAFF_ROLE_ID)) return ROLES.STAFF;
    if (discordRoles.includes(DISCORD_ROLE_IDS.CAPTAIN_ROLE_ID)) return ROLES.CAPTAIN;
    return ROLES.MEMBER; 
}

function checkAuth(req, res, next) {
    req.user = req.session.user || null;
    next();
}
app.use(checkAuth);

function requireRole(requiredRole) {
    return (req, res, next) => {
        const userRole = req.user ? req.user.role : ROLES.VIEWER;
        const roleHierarchy = [ROLES.VIEWER, ROLES.MEMBER, ROLES.CAPTAIN, ROLES.STAFF, ROLES.ADMIN];
        if (roleHierarchy.indexOf(userRole) >= roleHierarchy.indexOf(requiredRole)) {
            next();
        } else {
            if (!req.user) {
                return res.redirect('/login');
            }
            res.status(403).send(generateErrorPage('403 Forbidden', `You lack the required role (${requiredRole}) to access this page. Your role: ${userRole}.`));
        }
    };
}

function readTemplate(filename, replacements = {}) {
    try {
        const templatePath = path.join(__dirname, filename);
        let template = fs.readFileSync(templatePath, 'utf8'); 
        for (const key in replacements) {
            template = template.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), replacements[key]);
        }
        return template;
    } catch (e) {
        console.error(`Template file error (${filename}):`, e.message);
        return generateErrorPage('500 Server Error', `Could not load page content from template file: ${filename}.`);
    }
}

// --- MAIN ROUTES ---
app.get('/', (req, res) => {
    // The home page is now the public tournament bracket
    const pageHtml = readTemplate('public_bracket.html');
    res.send(pageHtml);
});

app.get('/staff', requireRole(ROLES.STAFF), (req, res) => {
    const pageHtml = readTemplate('staff_index.html', {
        USERNAME: req.user.username,
        USER_ROLE: req.user.role,
    });
    res.send(pageHtml);
});

app.get('/staff/teams', requireRole(ROLES.STAFF), (req, res) => {
    const pageHtml = readTemplate('staff_teams.html', {
        USERNAME: req.user.username,
        USER_ROLE: req.user.role,
    });
    res.send(pageHtml);
});

app.get('/staff/teams/edit/:teamId', requireRole(ROLES.STAFF), (req, res) => {
    const pageHtml = readTemplate('staff_teams_edit.html', {
        USERNAME: req.user.username,
        USER_ROLE: req.user.role,
        TEAM_ID: req.params.teamId
    });
    res.send(pageHtml);
});

app.get('/staff/matches', requireRole(ROLES.STAFF), (req, res) => {
    const pageHtml = readTemplate('staff_matches.html', {
        USERNAME: req.user.username,
        USER_ROLE: req.user.role,
    });
    res.send(pageHtml);
});

app.get('/admin/bracket/:tournamentId', requireRole(ROLES.ADMIN), (req, res) => {
    const tournamentId = req.params.tournamentId;
    const pageHtml = readTemplate('admin_bracket.html', {
        USERNAME: req.user.username,
        TOURNAMENT_ID: tournamentId 
    });
    res.send(pageHtml);
});

app.get('/admin/tournaments', requireRole(ROLES.ADMIN), (req, res) => {
    const pageHtml = readTemplate('admin_tournaments.html', {
        USERNAME: req.user.username,
        USER_ROLE: req.user.role,
    });
    res.send(pageHtml);
});

app.get('/admin/tournaments/:tournamentId', requireRole(ROLES.ADMIN), (req, res) => {
    const pageHtml = readTemplate('admin_tournament_details.html', {
        USERNAME: req.user.username,
        USER_ROLE: req.user.role,
        TOURNAMENT_ID: req.params.tournamentId
    });
    res.send(pageHtml);
});
// --- API ENDPOINTS ---

app.get('/api/staff/users', requireRole(ROLES.STAFF), async (req, res) => {
    const cacheKey = `cache:guild-members:${DISCORD_GUILD_ID}`;
    const cacheTTL = 30; // 30 seconds

    try {
        // 1. Try to get data from cache
        const cachedUsers = await redisClient.get(cacheKey);
        if (cachedUsers) {
            console.log('Serving users from cache.');
            return res.json(JSON.parse(cachedUsers));
        }

        // 2. If not in cache, fetch from Discord
        console.log('Fetching users from Discord API...');
        const bot = req.app.locals.bot;
        const guild = await bot.guilds.fetch(DISCORD_GUILD_ID);
        
        // Fetch all members. This can be slow and is the source of the timeout.
        await guild.members.fetch(); 

        const users = guild.members.cache.map(member => ({
            id: member.id,
            username: member.user.username,
            nickname: member.nickname || member.user.globalName || member.user.username,
            avatar: member.user.displayAvatarURL()
        }));

        // 3. Store in cache for future requests
        await redisClient.setex(cacheKey, cacheTTL, JSON.stringify(users));
        
        res.json(users);

    } catch (error) {
        console.error('Error fetching users:', error);
        // It's important to check the error type.
        // If it's a timeout, we might want to serve stale data if available,
        // but for now, we'll just return a standard error.
        if (error.code === 'GuildMembersTimeout') {
             res.status(504).json({ message: 'Fetching users from Discord timed out. Please try again in a moment.' });
        } else {
             res.status(500).json({ message: 'An error occurred while fetching users.' });
        }
    }
});

app.post('/api/staff/create-team', requireRole(ROLES.STAFF), async (req, res) => {
    const { teamName, captainId, roleColor } = req.body;
    if (!teamName || !captainId || !roleColor) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    // Validate if the roleColor is in the predefined TEAM_COLORS
    if (!TEAM_COLORS.includes(roleColor.toUpperCase())) {
        return res.status(400).json({ message: 'Invalid color. Please choose from the available colors.' });
    }

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();
        const bot = req.app.locals.bot;
        const guild = await bot.guilds.fetch(DISCORD_GUILD_ID);

        // Ensure the captain exists in the Users table
        const [captainUser] = await conn.execute('SELECT * FROM Users WHERE user_id = ?', [captainId]);
        if (captainUser.length === 0) {
            const member = await guild.members.fetch(captainId);
            if (member) {
                await conn.execute('INSERT INTO Users (user_id, username) VALUES (?, ?)', [member.id, member.user.username]);
            } else {
                throw new Error('Captain not found in Discord guild.');
            }
        }

        const [teamResult] = await conn.execute(
            'INSERT INTO Teams (team_name, captain_id) VALUES (?, ?)',
            [teamName, captainId]
        );
        const teamId = teamResult.insertId;

        await conn.execute(
            'INSERT INTO TeamMembers (team_id, user_id) VALUES (?, ?)',
            [teamId, captainId]
        );

        const newRole = await guild.roles.create({
            name: teamName,
            color: roleColor,
            hoist: true, // This displays role members separately
            permissions: [],
            reason: `Role for team ${teamName}`,
        });

        const newChannel = await guild.channels.create({
            name: teamName,
            type: 0, // GUILD_TEXT
            parent: '1438326158654574673',
            permissionOverwrites: [
                { id: guild.id, deny: ['ViewChannel'] },
                { id: newRole.id, allow: ['ViewChannel'] },
            ],
        });

        const newVoiceChannel = await guild.channels.create({
            name: `${teamName}-voice`,
            type: 2, // GUILD_VOICE
            parent: '1438912415852007474',
            permissionOverwrites: [
                { id: guild.id, deny: ['ViewChannel'] },
                { id: newRole.id, allow: ['ViewChannel', 'Connect', 'Speak'] },
            ],
        });

        // Update team with role and channel IDs
        await conn.execute(
            'UPDATE Teams SET role_id = ?, channel_id = ?, voice_channel_id = ? WHERE team_id = ?',
            [newRole.id, newChannel.id, newVoiceChannel.id, teamId]
        );

        const captain = await guild.members.fetch(captainId);
        await captain.roles.add(newRole);
        await captain.roles.add(DISCORD_ROLE_IDS.CAPTAIN_ROLE_ID);

        await conn.commit();

        // Send Discord notification
        try {
            const adminChannel = await req.app.locals.bot.channels.fetch(DISCORD_ADMIN_BOT_CHANNEL);
            if (adminChannel) {
                const captainMember = await guild.members.fetch(captainId);
                const embed = new EmbedBuilder()
                    .setColor(roleColor)
                    .setTitle('New Team Created!')
                    .addFields(
                        { name: 'Team Name', value: teamName, inline: true },
                        { name: 'Captain', value: `<@${captainMember.id}>`, inline: true },
                        { name: 'Created By', value: req.user.username, inline: false }
                    )
                    .setTimestamp();
                await adminChannel.send({ embeds: [embed] });
            }
        } catch (discordError) {
            console.error('Failed to send Discord notification:', discordError);
            // Don't fail the whole request if notification fails
        }
        
        res.json({ message: `Team ${teamName} created successfully!`, teamId });
    } catch (error) {
        await conn.rollback();
        console.error('Error creating team:', error);
        res.status(500).json({ message: 'Error creating team' });
    } finally {
        conn.release();
    }
});

app.get('/api/staff/teams', requireRole(ROLES.STAFF), async (req, res) => {
    try {
        const [teams] = await dbPool.query('SELECT team_id, team_name, captain_id, logo_url, role_id FROM Teams ORDER BY team_name');
        res.json(teams);
    } catch (error) {
        console.error('Error fetching teams:', error);
        res.status(500).json({ message: 'Error fetching teams' });
    }
});

app.get('/api/staff/teams/:id', requireRole(ROLES.STAFF), async (req, res) => {
    try {
        const [team] = await dbPool.query('SELECT * FROM Teams WHERE team_id = ?', [req.params.id]);
        if (team.length === 0) {
            return res.status(404).json({ message: 'Team not found' });
        }
        const [members] = await dbPool.query('SELECT user_id FROM TeamMembers WHERE team_id = ?', [req.params.id]);
        team[0].members = members.map(m => m.user_id);
        res.json(team[0]);
    } catch (error) {
        console.error('Error fetching team details:', error);
        res.status(500).json({ message: 'Error fetching team details' });
    }
});

app.get('/api/team-colors', checkAuth, (req, res) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Authentication required.' });
    }
    res.json(TEAM_COLORS);
});

app.get('/api/staff/all-captain-ids', requireRole(ROLES.STAFF), async (req, res) => {
    try {
        const [captainIds] = await dbPool.query('SELECT DISTINCT captain_id FROM Teams WHERE captain_id IS NOT NULL');
        res.json(captainIds.map(row => row.captain_id));
    } catch (error) {
        console.error('Error fetching all captain IDs:', error);
        res.status(500).json({ message: 'Error fetching all captain IDs' });
    }
});

app.get('/api/teams', requireRole(ROLES.STAFF), async (req, res) => {
    try {
        const [teams] = await dbPool.query('SELECT team_id as id, team_name as name FROM Teams ORDER BY team_name');
        res.json(teams);
    } catch (error) {
        console.error('Error fetching teams:', error);
        res.status(500).json({ message: 'Error fetching teams' });
    }
});

app.get('/api/matchups', requireRole(ROLES.STAFF), async (req, res) => {
    try {
        const [matchups] = await dbPool.query(`
            SELECT 
                m.match_id,
                m.round_name,
                t1.team_name as team1_name,
                t2.team_name as team2_name,
                m.format
            FROM matchups m
            JOIN Teams t1 ON m.team_a_id = t1.team_id
            JOIN Teams t2 ON m.team_b_id = t2.team_id
            ORDER BY m.match_id DESC
        `);
        res.json(matchups);
    } catch (error) {
        console.error('Error fetching matchups:', error);
        res.status(500).json({ message: 'Error fetching matchups' });
    }
});

app.delete('/api/matchups/:id', requireRole(ROLES.STAFF), async (req, res) => {
    try {
        const [result] = await dbPool.query('DELETE FROM matchups WHERE match_id = ?', [req.params.id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Matchup not found' });
        }
        res.json({ message: 'Matchup deleted successfully' });
    } catch (error) {
        console.error('Error deleting matchup:', error);
        res.status(500).json({ message: 'Error deleting matchup' });
    }
});

app.post('/api/matchups', requireRole(ROLES.STAFF), async (req, res) => {
    const { team1, team2, bestOf, round } = req.body;

    if (!team1 || !team2 || !bestOf || !round) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    if (team1 === team2) {
        return res.status(400).json({ message: 'Teams cannot play against themselves' });
    }

    try {
        // Get active tournament
        const [tournaments] = await dbPool.query('SELECT tournament_id FROM Tournaments WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1');
        if (tournaments.length === 0) {
            return res.status(400).json({ message: 'No active tournament found' });
        }
        const tournamentId = tournaments[0].tournament_id;

        const format = `Bo${bestOf}`;

        await dbPool.execute(
            'INSERT INTO matchups (tournament_id, team_a_id, team_b_id, format, round_name) VALUES (?, ?, ?, ?, ?)',
            [tournamentId, team1, team2, format, round]
        );

        res.json({ message: 'Matchup created successfully' });
    } catch (error) {
        console.error('Error creating matchup:', error);
        res.status(500).json({ message: 'Error creating matchup' });
    }
});

// This is now public for the home page, but the admin page still requires ADMIN role.
app.get('/api/bracket/:tournamentId', async (req, res) => { // Renamed from /api/staff/bracket
    const { tournamentId } = req.params;
    try {
        const [matches] = await dbPool.query(
            `SELECT 
                m.match_id, m.round_name, m.winner_id,
                ta.team_id as team_a_id, ta.team_name as team_a_name, ta.logo_url as team_a_logo, ta.role_id as team_a_role_id,
                tb.team_id as team_b_id, tb.team_name as team_b_name, tb.logo_url as team_b_logo, tb.role_id as team_b_role_id
             FROM Matches m
             LEFT JOIN Teams ta ON m.team_a_id = ta.team_id
             LEFT JOIN Teams tb ON m.team_b_id = tb.team_id
             WHERE m.tournament_id = ?
             ORDER BY m.match_id`,
            [tournamentId]
        );

        // Transform data for brackets-viewer.js
        const participants = [];
        const teams = new Map();

        matches.forEach(m => {
            if (m.team_a_id && !teams.has(m.team_a_id)) {
                teams.set(m.team_a_id, { id: m.team_a_id, name: m.team_a_name });
            }
            if (m.team_b_id && !teams.has(m.team_b_id)) {
                teams.set(m.team_b_id, { id: m.team_b_id, name: m.team_b_name });
            }
        });

        teams.forEach(team => participants.push(team));

        const roundRobinMatches = matches.map(m => {
            let status = 4; // Running
            if (m.winner_id) {
                status = m.winner_id === m.team_a_id ? 1 : (m.winner_id === m.team_b_id ? 2 : 4); // Team 1 wins, Team 2 wins, or still Running
            }
            
            return {
                id: m.match_id,
                stage_id: 0, // All in one stage for single elimination
                group_id: 0,
                round_id: 0, // The library will calculate rounds based on match order and structure.
                opponent1: m.team_a_id ? { id: m.team_a_id, result: m.winner_id === m.team_a_id ? 'win' : (m.winner_id === m.team_b_id ? 'loss' : null) } : null,
                opponent2: m.team_b_id ? { id: m.team_b_id, result: m.winner_id === m.team_b_id ? 'win' : (m.winner_id === m.team_a_id ? 'loss' : null) } : null,
                status: status
            };
        });

        const bracketData = {
            participants: participants, // This was missing
            stages: [{
                id: 0,
                tournament_id: tournamentId,
                name: 'Main Bracket',
                type: 'single_elimination',
                settings: {
                    seedOrdering: ['natural'],
                    grandFinal: 'simple',
                    size: 16
                }
            }],
            matches: roundRobinMatches,
            matchGames: []
        };

        res.json(bracketData);
    } catch (error) {
        console.error('Error fetching bracket data:', error);
        res.status(500).json({ message: 'Error fetching bracket data' });
    }
});

app.get('/api/tournament/:tournamentId/bracket-data-jq', async (req, res) => {
    const { tournamentId } = req.params;
    try {
        const [matches] = await dbPool.query(
            `SELECT 
                m.match_id, m.round_name, m.winner_id,
                m.team_a_id, ta.team_name as team_a_name, ta.logo_url as team_a_logo,
                m.team_b_id, tb.team_name as team_b_name, tb.logo_url as team_b_logo
             FROM Matches m
             LEFT JOIN Teams ta ON m.team_a_id = ta.team_id
             LEFT JOIN Teams tb ON m.team_b_id = tb.team_id
             WHERE m.tournament_id = ?
             ORDER BY m.match_id`,
            [tournamentId]
        );

        if (matches.length === 0) {
            return res.json({ teams: [], results: [] });
        }

        // --- Data Transformation for jquery-bracket ---
        const bracketTeams = [];
        const bracketResults = [[], [], [], []]; // 4 rounds for a 16-team bracket

        const firstRoundMatches = matches.slice(0, 8);
        firstRoundMatches.forEach(match => {
            const teamA = match.team_a_id 
                ? { name: match.team_a_name, logo: match.team_a_logo } 
                : { name: 'TBD', logo: null };
            const teamB = match.team_b_id 
                ? { name: match.team_b_name, logo: match.team_b_logo } 
                : { name: 'TBD', logo: null };
            bracketTeams.push([teamA, teamB]);
        });

        // Correctly build results based on match index, not ID
        matches.forEach((match, index) => {
            let roundIndex;
            let matchIndexInRound;

            if (index < 8) { // Round 1
                roundIndex = 0;
                matchIndexInRound = index;
            } else if (index < 12) { // Quarterfinals
                roundIndex = 1;
                matchIndexInRound = index - 8;
            } else if (index < 14) { // Semifinals
                roundIndex = 2;
                matchIndexInRound = index - 12;
            } else if (index < 15) { // Finals
                roundIndex = 3;
                matchIndexInRound = index - 14;
            }

            if (roundIndex !== undefined) {
                let scoreA = null;
                let scoreB = null;
                if (match.winner_id && match.team_a_id && match.team_b_id) {
                    if (String(match.winner_id) === String(match.team_a_id)) {
                        scoreA = 1;
                        scoreB = 0;
                    } else if (String(match.winner_id) === String(match.team_b_id)) {
                        scoreA = 0;
                        scoreB = 1;
                    }
                }
                bracketResults[roundIndex][matchIndexInRound] = [scoreA, scoreB];
            }
        });
        
        // Fill any gaps in the results array with empty scores
        for (let i = 0; i < bracketResults.length; i++) {
            const roundMatchCount = 8 / Math.pow(2, i);
            for (let j = 0; j < roundMatchCount; j++) {
                if (!bracketResults[i][j]) {
                    bracketResults[i][j] = [null, null];
                }
            }
        }

        res.json({
            teams: bracketTeams,
            results: bracketResults
        });

    } catch (error) {
        console.error('Error fetching jquery-bracket data:', error);
        res.status(500).json({ message: 'Error fetching jquery-bracket data' });
    }
});

async function advanceWinner(matchId, winnerTeamId, conn) {
    try {
        // 1. Find the next match this winner should advance to
        const [matches] = await conn.execute(
            'SELECT winner_advances_to_match_id, winner_advances_to_slot FROM Matches WHERE match_id = ?',
            [matchId]
        );

        if (matches.length === 0 || !matches[0].winner_advances_to_match_id) {
            console.log(`Match ${matchId} is the final match or has no progression path.`);
            return; // No progression needed
        }

        const { winner_advances_to_match_id: nextMatchId, winner_advances_to_slot: nextSlot } = matches[0];

        // 2. Update the next match with the winner
        const fieldToUpdate = nextSlot === 'A' ? 'team_a_id' : 'team_b_id';
        
        await conn.execute(
            `UPDATE Matches SET ${fieldToUpdate} = ? WHERE match_id = ?`,
            [winnerTeamId, nextMatchId]
        );

        console.log(`Advanced winner of match ${matchId} (Team ${winnerTeamId}) to slot ${nextSlot} of match ${nextMatchId}.`);

    } catch (error) {
        console.error('Error in advanceWinner function:', error);
        // Re-throw the error to be caught by the calling transaction handler
        throw error;
    }
}

app.post('/api/admin/matches/:matchId/winner', requireRole(ROLES.STAFF), async (req, res) => {
    const { matchId } = req.params;
    const { winnerTeamId } = req.body;

    if (!winnerTeamId) {
        return res.status(400).json({ message: 'winnerTeamId is required.' });
    }

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();

        // Get the match details to determine the loser
        const [matches] = await conn.execute('SELECT team_a_id, team_b_id FROM Matches WHERE match_id = ?', [matchId]);
        if (matches.length === 0) {
            throw new Error('Match not found');
        }
        const { team_a_id, team_b_id } = matches[0];
        const loserTeamId = (String(team_a_id) === String(winnerTeamId)) ? team_b_id : team_a_id;

        // 1. Set the winner and loser for the current match
        await conn.execute('UPDATE Matches SET winner_id = ?, loser_id = ? WHERE match_id = ?', [winnerTeamId, loserTeamId, matchId]);

        // 2. Automatically advance the winner to the next match
        await advanceWinner(matchId, winnerTeamId, conn);

        await conn.commit();
        res.json({ message: `Winner for match ${matchId} set successfully. Bracket advanced.` });
    } catch (error) {
        await conn.rollback();
        console.error(`Error setting winner for match ${matchId}:`, error);
        res.status(500).json({ message: 'Failed to set winner and advance bracket.' });
    } finally {
        conn.release();
    }
});

app.put('/api/admin/matches/:matchId/assign-team', requireRole(ROLES.STAFF), async (req, res) => {
    const { matchId } = req.params;
    const { teamId, slot } = req.body; // teamId can now be null to clear a slot

    if (!slot) { // Only slot is strictly required now
        return res.status(400).json({ message: 'slot is required.' });
    }
    if (slot !== 'A' && slot !== 'B') {
        return res.status(400).json({ message: 'Slot must be either "A" or "B".' });
    }

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();

        const fieldToUpdate = slot === 'A' ? 'team_a_id' : 'team_b_id';
        
        const [result] = await conn.execute(
            `UPDATE Matches SET ${fieldToUpdate} = ? WHERE match_id = ?`,
            [teamId, matchId] // teamId can be null here
        );

        if (result.affectedRows === 0) {
            await conn.rollback();
            return res.status(404).json({ message: 'Match not found.' });
        }

        await conn.commit();
        res.json({ message: `Team ${teamId === null ? 'cleared' : teamId} assigned to slot ${slot} in match ${matchId} successfully.` });
    } catch (error) {
        await conn.rollback();
        console.error(`Error assigning team to match ${matchId}:`, error);
        res.status(500).json({ message: 'Failed to assign team to match.' });
    } finally {
        conn.release();
    }
});

// --- ADMIN TOURNAMENT ENDPOINTS ---

// GET all tournaments
app.get('/api/admin/tournaments', requireRole(ROLES.ADMIN), async (req, res) => {
    try {
        const [tournaments] = await dbPool.query('SELECT tournament_id, name, start_date, is_active FROM Tournaments ORDER BY start_date DESC');
        res.json(tournaments);
    } catch (error) {
        console.error('Error fetching tournaments:', error);
        res.status(500).json({ message: 'Error fetching tournaments' });
    }
});

// POST create new tournament
app.post('/api/admin/tournaments', requireRole(ROLES.ADMIN), async (req, res) => {
    const { name, start_date, is_active } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Tournament name is required.' });
    }

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();

        const [result] = await conn.execute(
            'INSERT INTO Tournaments (name, start_date, is_active) VALUES (?, ?, ?)',
            [name, start_date || null, is_active]
        );
        const tournamentId = result.insertId;

        // --- Create 15 placeholder matches for a 16-team single-elimination bracket ---
        const matchesToInsert = [];

        // Round 1 (8 matches)
        for (let i = 1; i <= 8; i++) {
            matchesToInsert.push({
                round_name: 'Round 1',
                winner_advances_to_match_id: Math.ceil(i / 2) + 8, // Matches 9-12
                winner_advances_to_slot: i % 2 !== 0 ? 'A' : 'B'
            });
        }

        // Quarterfinals (4 matches)
        for (let i = 1; i <= 4; i++) {
            matchesToInsert.push({
                round_name: 'Quarterfinals',
                winner_advances_to_match_id: Math.ceil(i / 2) + 12, // Matches 13-14
                winner_advances_to_slot: i % 2 !== 0 ? 'A' : 'B'
            });
        }

        // Semifinals (2 matches)
        for (let i = 1; i <= 2; i++) {
            matchesToInsert.push({
                round_name: 'Semifinals',
                winner_advances_to_match_id: 15, // Final match
                winner_advances_to_slot: i % 2 !== 0 ? 'A' : 'B'
            });
        }

        // Finals (1 match)
        matchesToInsert.push({
            round_name: 'Finals',
            winner_advances_to_match_id: null,
            winner_advances_to_slot: null
        });

        // Insert matches in order to get correct match_id for winner_advances_to_match_id
        const insertedMatchIds = [];
        for (const matchData of matchesToInsert) {
            const [matchResult] = await conn.execute(
                'INSERT INTO Matches (tournament_id, round_name, format, team_a_id, team_b_id) VALUES (?, ?, ?, NULL, NULL)',
                [tournamentId, matchData.round_name, 'Bo3'] // Default format to Bo3
            );
            insertedMatchIds.push(matchResult.insertId);
        }

        // Now update winner_advances_to_match_id using the actual inserted IDs
        for (let i = 0; i < matchesToInsert.length; i++) {
            const matchData = matchesToInsert[i];
            const currentMatchId = insertedMatchIds[i];

            if (matchData.winner_advances_to_match_id !== null) {
                const nextMatchDbId = insertedMatchIds[matchData.winner_advances_to_match_id - 1]; // Adjust index
                await conn.execute(
                    'UPDATE Matches SET winner_advances_to_match_id = ?, winner_advances_to_slot = ? WHERE match_id = ?',
                    [nextMatchDbId, matchData.winner_advances_to_slot, currentMatchId]
                );
            }
        }

        await conn.commit();
        res.status(201).json({ message: 'Tournament created successfully with bracket!', tournament_id: tournamentId });
    } catch (error) {
        await conn.rollback();
        console.error('Error creating tournament and bracket:', error);
        res.status(500).json({ message: 'Error creating tournament and bracket' });
    } finally {
        conn.release();
    }
});

// GET single tournament details
app.get('/api/admin/tournaments/:tournamentId', requireRole(ROLES.ADMIN), async (req, res) => {
    const { tournamentId } = req.params;
    try {
        const [tournaments] = await dbPool.query('SELECT tournament_id, name, start_date, is_active FROM Tournaments WHERE tournament_id = ?', [tournamentId]);
        if (tournaments.length === 0) {
            return res.status(404).json({ message: 'Tournament not found.' });
        }
        res.json(tournaments[0]);
    } catch (error) {
        console.error('Error fetching tournament details:', error);
        res.status(500).json({ message: 'Error fetching tournament details' });
    }
});

// PUT update tournament
app.put('/api/admin/tournaments/:tournamentId', requireRole(ROLES.ADMIN), async (req, res) => {
    const { tournamentId } = req.params;
    const { name, start_date, is_active } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Tournament name is required.' });
    }
    try {
        const [result] = await dbPool.execute(
            'UPDATE Tournaments SET name = ?, start_date = ?, is_active = ? WHERE tournament_id = ?',
            [name, start_date || null, is_active, tournamentId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Tournament not found.' });
        }
        res.json({ message: 'Tournament updated successfully!' });
    } catch (error) {
        console.error('Error updating tournament:', error);
        res.status(500).json({ message: 'Error updating tournament' });
    }
});

// DELETE tournament
app.delete('/api/admin/tournaments/:tournamentId', requireRole(ROLES.ADMIN), async (req, res) => {
    const { tournamentId } = req.params;
    try {
        const [result] = await dbPool.execute('DELETE FROM Tournaments WHERE tournament_id = ?', [tournamentId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Tournament not found.' });
        }
        res.json({ message: 'Tournament deleted successfully!' });
    } catch (error) {
        console.error('Error deleting tournament:', error);
        res.status(500).json({ message: 'Error deleting tournament' });
    }
});

app.get('/api/admin/tournaments/:tournamentId/teams', requireRole(ROLES.STAFF), async (req, res) => {
    const { tournamentId } = req.params;
    try {
        const [teams] = await dbPool.query(
            `SELECT t.team_id, t.team_name, t.logo_url 
             FROM Teams t
             JOIN TournamentTeams tt ON t.team_id = tt.team_id
             WHERE tt.tournament_id = ?`,
            [tournamentId]
        );
        res.json(teams);
    } catch (error) {
        console.error('Error fetching teams for tournament:', error);
        res.status(500).json({ message: 'Error fetching teams for tournament' });
    }
});

// POST add team to tournament
app.post('/api/admin/tournaments/:tournamentId/teams', requireRole(ROLES.ADMIN), async (req, res) => {
    const { tournamentId } = req.params;
    const { team_id } = req.body;
    if (!team_id) {
        return res.status(400).json({ message: 'Team ID is required.' });
    }
    try {
        // Check if the team is already in the tournament
        const [existing] = await dbPool.query(
            'SELECT * FROM TournamentTeams WHERE tournament_id = ? AND team_id = ?',
            [tournamentId, team_id]
        );
        if (existing.length > 0) {
            return res.status(409).json({ message: 'Team already in this tournament.' });
        }

        await dbPool.execute(
            'INSERT INTO TournamentTeams (tournament_id, team_id) VALUES (?, ?)',
            [tournamentId, team_id]
        );
        res.status(201).json({ message: 'Team added to tournament successfully!' });
    } catch (error) {
        console.error('Error adding team to tournament:', error);
        res.status(500).json({ message: 'Error adding team to tournament' });
    }
});

// DELETE remove team from tournament
app.delete('/api/admin/tournaments/:tournamentId/teams/:teamId', requireRole(ROLES.ADMIN), async (req, res) => {
    const { tournamentId, teamId } = req.params;
    try {
        const [result] = await dbPool.execute(
            'DELETE FROM TournamentTeams WHERE tournament_id = ? AND team_id = ?',
            [tournamentId, teamId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Team not found in this tournament.' });
        }
        res.json({ message: 'Team removed from tournament successfully!' });
    } catch (error) {
        console.error('Error removing team from tournament:', error);
        res.status(500).json({ message: 'Error removing team from tournament' });
    }
});

// New API endpoint to clear all team assignments for a tournament
app.delete('/api/admin/tournaments/:tournamentId/matches/teams', requireRole(ROLES.ADMIN), async (req, res) => {
    const { tournamentId } = req.params;
    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();
        const [result] = await conn.execute(
            'UPDATE Matches SET team_a_id = NULL, team_b_id = NULL, winner_id = NULL, loser_id = NULL WHERE tournament_id = ?',
            [tournamentId]
        );
        await conn.commit();
        res.json({ message: `All team assignments for tournament ${tournamentId} cleared successfully.` });
    } catch (error) {
        await conn.rollback();
        console.error('Error clearing all team assignments:', error);
        res.status(500).json({ message: 'Error clearing all team assignments.' });
    } finally {
        conn.release();
    }
});

// New API endpoint to get all matches for a tournament
app.get('/api/tournament/:tournamentId/matches', async (req, res) => {
    const { tournamentId } = req.params;
    try {
        const [matches] = await dbPool.query(
            `SELECT match_id, team_a_id, team_b_id, round_name, winner_advances_to_match_id, winner_advances_to_slot
             FROM Matches
             WHERE tournament_id = ?
             ORDER BY match_id`,
            [tournamentId]
        );
        res.json(matches);
    } catch (error) {
        console.error('Error fetching matches for tournament:', error);
        res.status(500).json({ message: 'Error fetching matches for tournament' });
    }
});

app.get('/api/matches/:matchId', requireRole(ROLES.STAFF), async (req, res) => {
    const { matchId } = req.params;
    let conn;
    try {
        conn = await dbPool.getConnection();
        const [matches] = await conn.execute(
            `SELECT m.match_id, m.team_a_id, m.team_b_id, 
                    tA.team_name as team_a_name, tA.captain_id as team_a_captain_id,
                    tB.team_name as team_b_name, tB.captain_id as team_b_captain_id
             FROM Matches m
             LEFT JOIN Teams tA ON m.team_a_id = tA.team_id
             LEFT JOIN Teams tB ON m.team_b_id = tB.team_id
             WHERE m.match_id = ?`,
            [matchId]
        );

        if (matches.length === 0) {
            return res.status(404).json({ message: 'Match not found.' });
        }
        res.json(matches[0]);
    } catch (error) {
        console.error(`Error fetching details for match ${matchId}:`, error);
        res.status(500).json({ message: 'Error fetching match details.' });
    } finally {
        if (conn) conn.release();
    }
});

// New API endpoint to get the active tournament ID
app.get('/api/tournaments/active', async (req, res) => {
    try {
        const [tournaments] = await dbPool.query(
            'SELECT tournament_id FROM Tournaments WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1'
        );
        if (tournaments.length > 0) {
            res.json({ tournament_id: tournaments[0].tournament_id });
        } else {
            res.json({ tournament_id: null, message: 'No active tournament found.' });
        }
    } catch (error) {
        console.error('Error fetching active tournament:', error);
        res.status(500).json({ message: 'Error fetching active tournament' });
    }
});

app.post('/api/matches/:matchId/start-pick-ban', requireRole(ROLES.STAFF), async (req, res) => {
    const { matchId } = req.params;
    const bot = req.app.locals.bot;

    if (!bot.startPickBan) {
        console.error('Bot is not ready or pick/ban function is not available.');
        return res.status(500).json({ message: 'Bot is not ready or pick/ban function is not available.' });
    }

    try {
        // Intentionally not awaiting this. The bot will handle the process asynchronously.
        // The web request should return immediately to not time out.
        bot.startPickBan(matchId, req.user);
        
        res.json({ message: 'Pick/ban process initiated in Discord.' });
    } catch (error) {
        console.error(`Error starting pick/ban for match ${matchId}:`, error);
        res.status(500).json({ message: 'Failed to start pick/ban process.' });
    }
});

app.post('/api/matches/:matchId/start-pick-ban', requireRole(ROLES.STAFF), async (req, res) => {
    const { matchId } = req.params;
    const bot = req.app.locals.bot;

    if (!bot.startPickBan) {
        console.error('Bot is not ready or pick/ban function is not available.');
        return res.status(500).json({ message: 'Bot is not ready or pick/ban function is not available.' });
    }

    try {
        // Intentionally not awaiting this. The bot will handle the process asynchronously.
        // The web request should return immediately to not time out.
        bot.startPickBan(matchId, req.user);
        
        res.json({ message: 'Pick/ban process initiated in Discord.' });
    } catch (error) {
        console.error(`Error starting pick/ban for match ${matchId}:`, error);
        res.status(500).json({ message: 'Failed to start pick/ban process.' });
    }
});

// --- CAPTAIN ENDPOINTS ---
app.post('/api/captain/team/color', requireRole(ROLES.CAPTAIN), async (req, res) => {
    const { newColor } = req.body;
    const captainUserId = req.user.userId;

    if (!newColor) {
        return res.status(400).json({ message: 'New color is required.' });
    }

    // Validate if the newColor is in the predefined TEAM_COLORS
    if (!TEAM_COLORS.includes(newColor.toUpperCase())) {
        return res.status(400).json({ message: 'Invalid color. Please choose from the available colors.' });
    }

    let conn;
    try {
        conn = await dbPool.getConnection();
        // Find the team where the current user is the captain
        const [teams] = await conn.execute('SELECT team_id, team_name, role_id FROM Teams WHERE captain_id = ?', [captainUserId]);

        if (teams.length === 0) {
            return res.status(404).json({ message: 'You are not a captain of any team.' });
        }
        if (teams.length > 1) {
            // This scenario should ideally not happen if a user can only captain one team
            console.warn(`User ${captainUserId} is captain of multiple teams. Using the first one found.`);
        }

        const team = teams[0];
        const { team_id, team_name, role_id } = team;

        if (!role_id) {
            return res.status(500).json({ message: `Team ${team_name} does not have an associated Discord role.` });
        }

        const bot = req.app.locals.bot;
        const guild = await bot.guilds.fetch(DISCORD_GUILD_ID);
        const discordRole = await guild.roles.fetch(role_id);

        if (!discordRole) {
            return res.status(404).json({ message: `Discord role with ID ${role_id} not found for team ${team_name}.` });
        }

        // Update the Discord role color
        await discordRole.edit({ color: newColor }, `Team color updated by captain ${req.user.username}`);

        // Send Discord notification
        try {
            const adminChannel = await req.app.locals.bot.channels.fetch(DISCORD_ADMIN_BOT_CHANNEL);
            if (adminChannel) {
                const embed = new EmbedBuilder()
                    .setColor(newColor)
                    .setTitle('Team Color Updated!')
                    .addFields(
                        { name: 'Team Name', value: team_name, inline: true },
                        { name: 'Captain', value: `<@${captainUserId}>`, inline: true },
                        { name: 'New Color', value: newColor, inline: false }
                    )
                    .setTimestamp();
                await adminChannel.send({ embeds: [embed] });
            }
        } catch (discordError) {
            console.error('Failed to send Discord notification for team color update:', discordError);
        }

        res.json({ message: `Team ${team_name} color updated successfully to ${newColor}.` });

    } catch (error) {
        console.error('Error updating team color:', error);
        res.status(500).json({ message: 'Error updating team color.' });
    } finally {
        if (conn) conn.release();
    }
});

app.get('/api/discord/role/:roleId', requireRole(ROLES.STAFF), async (req, res) => {
    const { roleId } = req.params;
    try {
        const bot = req.app.locals.bot;
        const guild = await bot.guilds.fetch(DISCORD_GUILD_ID);
        const role = await guild.roles.fetch(roleId);

        if (!role) {
            return res.status(404).json({ message: 'Discord role not found' });
        }

        // Discord role colors are integers, convert to hex for client-side
        const hexColor = '#' + role.color.toString(16).padStart(6, '0').toUpperCase();
        res.json({ id: role.id, name: role.name, color: hexColor });

    } catch (error) {
        console.error(`Error fetching Discord role ${roleId}:`, error);
        res.status(500).json({ message: 'Error fetching Discord role' });
    }
});

app.put('/api/staff/teams/:id', requireRole(ROLES.STAFF), upload.single('logo'), async (req, res) => {
    const { teamName, captainId, members, roleColor } = req.body;
    const teamId = req.params.id;
    let logoUrl = req.body.existingLogo || null;

    if (req.file) {
        logoUrl = `/public/uploads/${req.file.filename}`;
    }

    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();

        // Get old team data before updating
        const [oldTeams] = await conn.execute('SELECT * FROM Teams WHERE team_id = ?', [teamId]);
        if (oldTeams.length === 0) {
            await conn.rollback();
            return res.status(404).json({ message: 'Team not found' });
        }
        const oldTeam = oldTeams[0];
        const { team_name: oldTeamName, role_id: oldRoleId, channel_id: oldChannelId, captain_id: oldCaptainId } = oldTeam;

        const bot = req.app.locals.bot;
        const guild = await bot.guilds.fetch(DISCORD_GUILD_ID);

        // If team name is changing, update Discord objects
        if (oldTeamName !== teamName) {
            // Update Role
            if (oldRoleId) {
                try {
                    const role = await guild.roles.fetch(oldRoleId);
                    if (role) {
                        await role.edit({ name: teamName }, 'Team name updated via website');
                    }
                } catch (err) {
                    console.error(`Could not find or edit role ${oldRoleId}:`, err);
                }
            }

            // Update Channel
            if (oldChannelId) {
                try {
                    const channel = await guild.channels.fetch(oldChannelId);
                    if (channel) {
                        await channel.edit({ name: teamName }, 'Team name updated via website');
                    }
                } catch (err) {
                    console.error(`Could not find or edit channel ${oldChannelId}:`, err);
                }
            }
        }

        // If role color is changing, update Discord role
        let oldRoleColor = null;
        if (oldRoleId) {
            try {
                const role = await guild.roles.fetch(oldRoleId);
                if (role) {
                    oldRoleColor = '#' + role.color.toString(16).padStart(6, '0').toUpperCase();
                }
            } catch (err) {
                console.error(`Could not fetch old role color for ${oldRoleId}:`, err);
            }
        }

        if (roleColor) { // Only validate if roleColor is provided in the request
            if (!TEAM_COLORS.includes(roleColor.toUpperCase())) {
                await conn.rollback();
                return res.status(400).json({ message: 'Invalid color. Please choose from the available colors.' });
            }
        }

        if (oldRoleId && roleColor && roleColor.toUpperCase() !== oldRoleColor) {
            try {
                const role = await guild.roles.fetch(oldRoleId);
                if (role) {
                    await role.edit({ color: roleColor }, 'Team color updated via website');
                }
            } catch (err) {
                console.error(`Could not find or edit role color for ${oldRoleId}:`, err);
            }
        }

        // Ensure all members exist in the Users table
        const memberIds = JSON.parse(members);
        for (const userId of memberIds) {
            const [user] = await conn.execute('SELECT * FROM Users WHERE user_id = ?', [userId]);
            if (user.length === 0) {
                const member = await guild.members.fetch(userId);
                if (member) {
                    await conn.execute('INSERT INTO Users (user_id, username) VALUES (?, ?)', [member.id, member.user.username]);
                } else {
                    console.warn(`User with ID ${userId} not found in the guild. Skipping.`);
                }
            }
        }

        await conn.execute(
            'UPDATE Teams SET team_name = ?, captain_id = ?, logo_url = ? WHERE team_id = ?',
            [teamName, captainId, logoUrl, teamId]
        );

        await conn.execute('DELETE FROM TeamMembers WHERE team_id = ?', [teamId]);
        
        const memberValues = memberIds.map(userId => [teamId, userId]);
        if (memberValues.length > 0) {
            await conn.query('INSERT INTO TeamMembers (team_id, user_id) VALUES ?', [memberValues]);
        }
        
        await conn.commit();

        // Send Discord notification for update
        try {
            const adminChannel = await req.app.locals.bot.channels.fetch(DISCORD_ADMIN_BOT_CHANNEL);
            if (adminChannel) {
                const changes = [];
                if (oldTeamName !== teamName) {
                    changes.push(`**Name:** "${oldTeamName}" -> "${teamName}"`);
                }
                if (oldCaptainId.toString() !== captainId) {
                    changes.push(`**Captain:** <@${oldCaptainId}> -> <@${captainId}>`);
                }
                if (roleColor && roleColor.toUpperCase() !== oldRoleColor) {
                    changes.push(`**Color:** ${oldRoleColor || 'Default'} -> ${roleColor}`);
                }
                // A more complex diff could be done for members if needed

                const embed = new EmbedBuilder()
                    .setColor('#0099ff') // Blue for update
                    .setTitle('Team Updated')
                    .addFields(
                        { name: 'Team', value: teamName, inline: true },
                        { name: 'Updated By', value: req.user.username, inline: true }
                    )
                    .setTimestamp();

                if (changes.length > 0) {
                    embed.setDescription(changes.join('\n'));
                } else {
                    embed.setDescription('Logo or member list was updated.');
                }

                await adminChannel.send({ embeds: [embed] });
            }
        } catch (discordError) {
            console.error('Failed to send Discord notification for team update:', discordError);
        }

        res.json({ message: 'Team updated successfully' });
    } catch (error) {
        await conn.rollback();
        console.error('Error updating team:', error);
        res.status(500).json({ message: 'Error updating team' });
    } finally {
        conn.release();
    }
});

app.delete('/api/staff/teams/:id', requireRole(ROLES.ADMIN), async (req, res) => {
    const teamId = req.params.id;
    const conn = await dbPool.getConnection();
    try {
        await conn.beginTransaction();

        // Get team name and captain_id before deleting
        const [team] = await conn.execute('SELECT team_name, captain_id, role_id, channel_id FROM Teams WHERE team_id = ?', [teamId]);
        if (team.length === 0) {
            await conn.rollback(); // Rollback if team not found
            return res.status(404).json({ message: 'Team not found' });
        }
        const { team_name: teamName, captain_id: captainId, role_id: roleId, channel_id: channelId, voice_channel_id: voiceChannelId } = team[0];

        // Delete the team from the database
        await conn.execute('DELETE FROM Teams WHERE team_id = ?', [teamId]);

        // Find and delete the Discord role
        const bot = req.app.locals.bot;
        const guild = await bot.guilds.fetch(DISCORD_GUILD_ID);
        if (roleId) {
            try {
                const role = await guild.roles.fetch(roleId);
                if (role) {
                    await role.delete('Team deleted from the website').catch(err => console.error(`Could not delete role ${teamName}:`, err));
                }
            } catch (err) {
                console.error(`Could not find role ${roleId} to delete:`, err);
            }
        }
        
        // Also delete the team text channel
        if (channelId) {
            try {
                const channel = await guild.channels.fetch(channelId);
                if (channel) {
                    await channel.delete('Team deleted from the website').catch(err => console.error(`Could not delete text channel ${teamName}:`, err));
                }
            } catch (err) {
                console.error(`Could not find text channel ${channelId} to delete:`, err);
            }
        }

        // Also delete the team voice channel
        if (voiceChannelId) {
            try {
                const voiceChannel = await guild.channels.fetch(voiceChannelId);
                if (voiceChannel) {
                    await voiceChannel.delete('Team deleted from the website').catch(err => console.error(`Could not delete voice channel ${teamName}:`, err));
                }
            } catch (err) {
                console.error(`Could not find voice channel ${voiceChannelId} to delete:`, err);
            }
        }

        // Remove captain role from the former captain
        if (captainId) {
            try {
                const captain = await guild.members.fetch(String(captainId));
                // Check if the user is a captain of another team before removing the role
                const [captainTeams] = await conn.execute('SELECT * FROM Teams WHERE captain_id = ?', [captainId]);
                if (captainTeams.length === 0) {
                    await captain.roles.remove(DISCORD_ROLE_IDS.CAPTAIN_ROLE_ID, 'Team deleted');
                }
            } catch (err) {
                console.error(`Could not remove captain role from user ${captainId}:`, err);
            }
        }

        await conn.commit();

        // Send Discord notification for delete
        try {
            const adminChannel = await req.app.locals.bot.channels.fetch(DISCORD_ADMIN_BOT_CHANNEL);
            if (adminChannel) {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000') // Red for delete
                    .setTitle('Team Deleted')
                    .addFields(
                        { name: 'Team Name', value: teamName, inline: true },
                        { name: 'Deleted By', value: req.user.username, inline: true }
                    )
                    .setTimestamp();
                await adminChannel.send({ embeds: [embed] });
            }
        } catch (discordError) {
            console.error('Failed to send Discord notification for team deletion:', discordError);
        }

        res.json({ message: `Team ${teamName} deleted successfully` });
    } catch (error) {
        await conn.rollback();
        console.error('Error deleting team:', error);
        res.status(500).json({ message: 'Error deleting team' });
    } finally {
        conn.release();
    }
});


// --- DISCORD AUTH ENDPOINTS ---
app.get('/login', (req, res) => {
    const url = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&scope=identify%20guilds.members.read`;
    res.redirect(url);
});

// Pass configuration to the bot via app.locals
app.locals.config = {
    DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET,
    DISCORD_REDIRECT_URI,
    DISCORD_GUILD_ID,
    DISCORD_ADMIN_BOT_CHANNEL,
    DISCORD_BOT_TOKEN,
    DISCORD_ROLE_IDS,
    TEAM_COLORS
};

// Initialize and start the bot. The bot will start the express server.
initializeBot(app, dbPool, port);

app.get('/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send(generateErrorPage('Login Failed', 'Missing authorization code.'));
    }
    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: DISCORD_REDIRECT_URI,
                scope: 'identify guilds.members.read',
            }).toString(),
        });
        const { access_token } = await tokenResponse.json();
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` },
        });
        const discordUser = await userResponse.json();
        const guildMemberResponse = await fetch(`https://discord.com/api/users/@me/guilds/${DISCORD_GUILD_ID}/member`, {
            headers: { Authorization: `Bearer ${access_token}` },
        });
        const guildMember = await guildMemberResponse.json();
        if (!guildMember || !guildMember.roles) {
             return res.status(403).send(generateErrorPage('Access Denied', 'You must be a member of the required Discord server to log in.'));
        }
        const userRole = getUserRole(discordUser.id, guildMember.roles); 
        req.session.user = { 
            userId: discordUser.id, 
            username: discordUser.username,
            role: userRole,
            discordRoles: guildMember.roles || [] 
        };
        res.redirect('/'); 
    } catch (error) {
        console.error('Discord OAuth Error:', error);
        res.status(500).send(generateErrorPage('Authentication Error', 'Login failed due to an external error.'));
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).send(generateErrorPage('Logout Failed', 'Could not log you out due to a server error.'));
        }
        res.redirect('/');
    });
});

// --- GENERIC HTML HELPERS ---
function generateErrorPage(title, message, link = '/') {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>${title}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style> body { background-color: #1f2937; color: #f9fafb; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: sans-serif; } .card { background-color: #374151; padding: 2rem; border-radius: 0.5rem; text-align: center; } </style>
        </head>
        <body>
            <div class="card">
                <h1 class="text-3xl font-bold mb-4 text-red-500">${title}</h1>
                <p class="text-lg mb-6">${message}</p>
                <a href="${link}" class="text-indigo-400 hover:text-indigo-300">${link === '/login' ? 'Try Discord Login' : 'Go Home'}</a>
            </div>
        </body>
        </html>
    `;
}