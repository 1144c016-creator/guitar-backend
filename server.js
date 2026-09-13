const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const TEAMS = ['紅組', '藍組', '綠組', '黃組'];

// 5 關卡防塞車路線
const TEAM_ROUTES = {
    '紅組': ["C", "Am", "G", "Em", "D"],
    '藍組': ["Am", "G", "Em", "D", "C"],
    '綠組': ["G", "Em", "D", "C", "Am"],
    '黃組': ["Em", "D", "C", "Am", "G"]
};

// 5 大關卡手機顯示提示
const HINTS_DB = {
    "C": "在活動範圍四處散落著船長的戰帖，請找到戰帖並與北商海盜的船長展開激烈的對決吧！（請先找到對應隊伍顏色的氣球，黏貼於非慣用邊肩膀上，每人一顆）",
    "Am": "請尋找美麗的變裝女僕，並完成女僕的需求。",
    "G": "請幫助藝術家完成作品。",
    "Em": "觀察四周張貼的新聞，並找到歌手。",
    "D": "請幫助解決藝術家的困難。"
};

const teams = {};

function initTeams() {
    TEAMS.forEach(team => {
        teams[team] = {
            players: [],
            activePlayers: [],
            isStarted: false,
            startTime: null,
            finishTimeSeconds: null,
            currentLevelIndex: 0,
            chords: TEAM_ROUTES[team],
            submissions: {},
            levelResult: null,
            wrongAttempts: 0
        };
    });
}
initTeams();

function cleanupGhostPlayers(teamName) {
    const t = teams[teamName];
    if (!t) return;
    const now = Date.now();
    const timeout = 180000; 

    const onlinePlayers = t.players.filter(p => (now - p.lastSeen) < timeout);
    if (onlinePlayers.length !== t.players.length) {
        t.players = onlinePlayers;
        const onlineIds = onlinePlayers.map(p => p.id);
        t.activePlayers = t.activePlayers.filter(id => onlineIds.includes(id));
        
        Object.keys(t.submissions).forEach(pId => {
            if (!onlineIds.includes(pId)) delete t.submissions[pId];
        });

        if (t.players.length === 0) {
            t.isStarted = false;
            t.currentLevelIndex = 0;
        }
    }
}

function getLeaderboard() {
    return Object.keys(teams).map(teamName => {
        const t = teams[teamName];
        return {
            team: teamName,
            memberCount: t.players.length,
            currentLevel: t.currentLevelIndex + 1,
            isFinished: t.currentLevelIndex >= t.chords.length,
            finishTimeSeconds: t.finishTimeSeconds || 0,
            wrongAttempts: t.wrongAttempts || 0
        };
    }).sort((a, b) => {
        if (a.isFinished && !b.isFinished) return -1;
        if (!a.isFinished && b.isFinished) return 1;
        if (a.isFinished && b.isFinished) return a.finishTimeSeconds - b.finishTimeSeconds;
        return b.currentLevel - a.currentLevel;
    });
}

app.get('/api/reset', (req, res) => {
    initTeams();
    res.json({ success: true, message: "所有關卡與隊伍資料已成功重置！" });
});

app.get('/api/assign-team', (req, res) => {
    const { existingPlayerId, existingTeam } = req.query;
    TEAMS.forEach(cleanupGhostPlayers);

    if (existingPlayerId) {
        for (const tName of TEAMS) {
            const existingPlayer = teams[tName].players.find(p => p.id === existingPlayerId);
            if (existingPlayer) {
                existingPlayer.lastSeen = Date.now();
                return res.json({
                    playerId: existingPlayer.id,
                    team: tName,
                    defaultName: existingPlayer.name,
                    chords: teams[tName].chords,
                    hints: teams[tName].chords.map(c => HINTS_DB[c])
                });
            }
        }

        if (existingTeam && teams[existingTeam]) {
            const defaultName = `隊員${teams[existingTeam].players.length + 1}`;
            teams[existingTeam].players.push({
                id: existingPlayerId,
                name: defaultName,
                isReady: false,
                lastSeen: Date.now()
            });
            return res.json({
                playerId: existingPlayerId,
                team: existingTeam,
                defaultName,
                chords: teams[existingTeam].chords,
                hints: teams[existingTeam].chords.map(c => HINTS_DB[c])
            });
        }
    }

    let minTeam = TEAMS[0];
    let minCount = teams[TEAMS[0]].players.length;

    TEAMS.forEach(team => {
        if (teams[team].players.length < minCount) {
            minCount = teams[team].players.length;
            minTeam = team;
        }
    });

    const playerId = 'player_' + Math.random().toString(36).substring(2, 11);
    const defaultName = `隊員${teams[minTeam].players.length + 1}`;
    teams[minTeam].players.push({
        id: playerId,
        name: defaultName,
        isReady: false,
        lastSeen: Date.now()
    });

    res.json({
        playerId,
        team: minTeam,
        defaultName,
        chords: teams[minTeam].chords,
        hints: teams[minTeam].chords.map(c => HINTS_DB[c])
    });
});

app.get('/api/status', (req, res) => {
    const { team, playerId } = req.query;
    TEAMS.forEach(cleanupGhostPlayers);

    const teamCounts = {};
    Object.keys(teams).forEach(t => teamCounts[t] = teams[t].players.length);

    let teamData = null;
    if (team && teams[team]) {
        const t = teams[team];
        
        let p = t.players.find(x => x.id === playerId);
        if (p) {
            p.lastSeen = Date.now();
        } else if (playerId) {
            p = { id: playerId, name: `隊員${t.players.length + 1}`, isReady: false, lastSeen: Date.now() };
            t.players.push(p);
        }

        const readyCount = t.players.filter(x => x.isReady).length;
        const totalLobbyPlayers = t.players.length;
        const allReady = totalLobbyPlayers > 0 && readyCount === totalLobbyPlayers;
        const activeList = t.activePlayers.length > 0 ? t.activePlayers : t.players.map(x => x.id);

        const submittedCount = Object.keys(t.submissions).length;
        if (t.isStarted && activeList.length > 0 && submittedCount >= activeList.length && !t.levelResult) {
            const wrongPlayerNames = [];
            activeList.forEach(pId => {
                const sub = t.submissions[pId];
                const playerObj = t.players.find(x => x.id === pId);
                const pName = playerObj ? `${team}-${playerObj.name}` : pId;
                if (!sub || !sub.isCorrect) {
                    wrongPlayerNames.push(pName);
                }
            });

            if (wrongPlayerNames.length === 0) {
                t.levelResult = { status: 'passed', wrongPlayers: [] };
            } else {
                t.wrongAttempts += 1;
                t.levelResult = { status: 'failed', wrongPlayers: wrongPlayerNames };
            }
        }

        teamData = {
            playersList: t.players.map(x => ({ id: x.id, fullName: `${team}-${x.name}`, isReady: x.isReady })),
            totalPlayers: activeList.length,
            submittedCount: submittedCount,
            totalLobbyPlayers: totalLobbyPlayers,
            readyCount: readyCount,
            allReady: allReady,
            isMyReady: p ? p.isReady : false,
            playerIndex: activeList.indexOf(playerId),
            isStarted: t.isStarted,
            currentLevelIndex: t.currentLevelIndex,
            chords: t.chords,
            hints: t.chords.map(c => HINTS_DB[c]),
            hasSubmitted: !!t.submissions[playerId],
            levelResult: t.levelResult
        };
    }

    res.json({ teamCounts, teamData, leaderboard: getLeaderboard() });
});

app.post('/api/action', (req, res) => {
    const { playerId, team, action, data } = req.body;
    const teamData = teams[team];
    if (!teamData) return res.status(400).json({ error: "小隊不存在" });

    if (action === 'update_name') {
        const player = teamData.players.find(p => p.id === playerId);
        if (player && data && data.customName) {
            player.name = data.customName.trim().substring(0, 10);
        }
        return res.json({ success: true });
    }

    if (action === 'toggle_ready') {
        const player = teamData.players.find(p => p.id === playerId);
        if (player) player.isReady = !!(data && data.isReady);
        return res.json({ success: true });
    }

    if (action === 'start_game') {
        if (!teamData.isStarted) {
            teamData.isStarted = true;
            teamData.startTime = Date.now();
            teamData.activePlayers = teamData.players.map(p => p.id);
            teamData.submissions = {};
            teamData.levelResult = null;
        }
        return res.json({ success: true });
    }

    if (action === 'submit_answer') {
        teamData.submissions[playerId] = {
            isCorrect: !!(data && data.isCorrect),
            userInput: data ? data.userInput : {}
        };
        return res.json({ success: true });
    }

    if (action === 'retry_level') {
        teamData.submissions = {};
        teamData.levelResult = null;
        return res.json({ success: true });
    }

    if (action === 'next_level') {
        if (teamData.levelResult && teamData.levelResult.status === 'passed') {
            teamData.currentLevelIndex += 1;
            teamData.submissions = {};
            teamData.levelResult = null;
            teamData.activePlayers = teamData.players.map(p => p.id);

            if (teamData.currentLevelIndex >= teamData.chords.length && !teamData.finishTimeSeconds) {
                teamData.finishTimeSeconds = Math.floor((Date.now() - teamData.startTime) / 1000);
            }
        }
        return res.json({ success: true });
    }

    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🎸 Server running on port ${PORT}`));
