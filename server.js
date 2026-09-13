const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 管理員帳號密碼
const ADMIN_USER = '0921';
const ADMIN_PASS = '1144c016';

// 全局遊戲開始狀態與廣播訊息
let isGameGlobalStarted = false;
let globalBroadcast = { id: 0, message: "" };

const TEAMS = ['紅組', '藍組', '綠組', '黃組'];

// 各組 5 關錯開分流路線
const TEAM_ROUTES = {
    '紅組': ["C", "Am", "G", "Em", "D"],
    '藍組': ["Am", "G", "Em", "D", "C"],
    '綠組': ["G", "Em", "D", "C", "Am"],
    '黃組': ["Em", "D", "C", "Am", "G"]
};

// 5 大關卡完整資料庫
const CHORDS_INFO = {
    "C": {
        title: "北商海盜的戰帖",
        hint: "在活動範圍四處散落著船長的戰帖，請找到戰帖並與北商海盜的船長展開激烈的對決吧！（請先找到對應隊伍顏色的氣球，並黏貼在非慣用邊的肩上，組員每人一顆。）"
    },
    "Am": {
        title: "偶然的邂逅",
        hint: "請尋找美麗的變裝女僕，並完成女僕的需求。"
    },
    "G": {
        title: "流浪的旅行商人",
        hint: "請幫助藝術家完成作品。"
    },
    "Em": {
        title: "旅行商人的誹聞",
        hint: "觀察四周張貼的新聞，並找到歌手。"
    },
    "D": {
        title: "藝術家的苦衷",
        hint: "請幫助解決藝術家的困難。"
    }
};

let teams = {};

function initTeams() {
    teams = {};
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

// 自動清理超過 3 分鐘斷線的幽靈隊員
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

function getTotalPlayersCount() {
    let total = 0;
    TEAMS.forEach(t => total += teams[t].players.length);
    return total;
}

function getLeaderboard() {
    return Object.keys(teams).map(teamName => {
        const t = teams[teamName];
        return {
            team: teamName,
            memberCount: t.players.length,
            currentLevel: t.currentLevelIndex + 1,
            isFinished: t.currentLevelIndex >= t.chords.length,
            finishTimeSeconds: t.finishTimeSeconds || (t.startTime ? Math.floor((Date.now() - t.startTime) / 1000) : 0),
            wrongAttempts: t.wrongAttempts || 0
        };
    }).sort((a, b) => {
        if (a.isFinished && !b.isFinished) return -1;
        if (!a.isFinished && b.isFinished) return 1;
        if (a.isFinished && b.isFinished) return a.finishTimeSeconds - b.finishTimeSeconds;
        return b.currentLevel - a.currentLevel;
    });
}

function getAdminDashboardData() {
    return Object.keys(teams).map(tName => {
        const t = teams[tName];
        const currentChord = t.chords[t.currentLevelIndex] || null;
        const currentInfo = currentChord ? CHORDS_INFO[currentChord] : { title: "已完成所有關卡", hint: "" };
        const activeCount = t.activePlayers.length > 0 ? t.activePlayers.length : t.players.length;

        let elapsed = 0;
        if (t.finishTimeSeconds) {
            elapsed = t.finishTimeSeconds;
        } else if (t.startTime) {
            elapsed = Math.floor((Date.now() - t.startTime) / 1000);
        }

        return {
            team: tName,
            isStarted: t.isStarted,
            isFinished: t.currentLevelIndex >= t.chords.length,
            currentLevelIndex: t.currentLevelIndex,
            currentChord: currentChord || 'END',
            levelTitle: currentInfo.title,
            totalPlayers: t.players.length,
            activeCount: activeCount,
            readyCount: t.players.filter(p => p.isReady).length,
            submittedCount: Object.keys(t.submissions).length,
            wrongAttempts: t.wrongAttempts,
            elapsedSeconds: elapsed,
            players: t.players.map(p => ({
                id: p.id,
                name: p.name,
                isReady: p.isReady,
                hasSubmitted: !!t.submissions[p.id]
            }))
        };
    });
}

// ---------------- API 路由 ----------------

// 管理員登入
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        return res.json({ success: true, message: "管理員登入成功" });
    }
    return res.status(401).json({ success: false, error: "管理員帳號或密碼錯誤！" });
});

// 管理員廣播發送
app.post('/api/admin/broadcast', (req, res) => {
    const { message } = req.body;
    globalBroadcast = {
        id: Date.now(),
        message: message ? message.trim() : ""
    };
    res.json({ success: true, broadcast: globalBroadcast });
});

// 管理員強制跳關
app.post('/api/admin/force-pass', (req, res) => {
    const { team } = req.body;
    const t = teams[team];
    if (!t) return res.status(400).json({ error: "小隊不存在" });

    if (!t.isStarted) {
        t.isStarted = true;
        t.startTime = Date.now();
    }

    if (t.currentLevelIndex < t.chords.length) {
        t.currentLevelIndex += 1;
        t.submissions = {};
        t.levelResult = null;
        t.activePlayers = t.players.map(p => p.id);

        if (t.currentLevelIndex >= t.chords.length && !t.finishTimeSeconds) {
            t.finishTimeSeconds = Math.floor((Date.now() - t.startTime) / 1000);
        }
    }

    res.json({ success: true, message: `${team} 已強制通關目前關卡` });
});

// 👑【新增功能】管理員自由調動單一隊員至另一組
app.post('/api/admin/move-player', (req, res) => {
    const { playerId, targetTeam } = req.body;
    if (!TEAMS.includes(targetTeam)) return res.status(400).json({ error: "無效的目標小隊" });

    let foundPlayer = null;
    let oldTeam = null;

    TEAMS.forEach(tName => {
        const idx = teams[tName].players.findIndex(p => p.id === playerId);
        if (idx !== -1) {
            foundPlayer = teams[tName].players.splice(idx, 1)[0];
            oldTeam = tName;
            teams[tName].activePlayers = teams[tName].activePlayers.filter(id => id !== playerId);
            delete teams[tName].submissions[playerId];
        }
    });

    if (!foundPlayer) return res.status(404).json({ error: "找不到該隊員" });

    foundPlayer.isReady = false;
    teams[targetTeam].players.push(foundPlayer);
    
    if (teams[targetTeam].isStarted) {
        teams[targetTeam].activePlayers.push(foundPlayer.id);
    }

    res.json({ success: true, message: `成功將 ${foundPlayer.name} 從 ${oldTeam} 移動至 ${targetTeam}` });
});

// 👑【新增功能】管理員踢出 / 刪除單一隊員
app.post('/api/admin/kick-player', (req, res) => {
    const { playerId } = req.body;
    let found = false;
    TEAMS.forEach(tName => {
        const idx = teams[tName].players.findIndex(p => p.id === playerId);
        if (idx !== -1) {
            teams[tName].players.splice(idx, 1);
            teams[tName].activePlayers = teams[tName].activePlayers.filter(id => id !== playerId);
            delete teams[tName].submissions[playerId];
            found = true;
        }
    });
    res.json({ success: found, message: found ? "已成功移除該隊員" : "找不到該隊員" });
});

// 👑【新增功能】一鍵自動平分人數 (Rebalance)
app.post('/api/admin/rebalance-teams', (req, res) => {
    let allPlayers = [];
    TEAMS.forEach(tName => {
        allPlayers.push(...teams[tName].players);
        teams[tName].players = [];
        teams[tName].activePlayers = [];
        teams[tName].submissions = {};
        teams[tName].isStarted = false;
        teams[tName].currentLevelIndex = 0;
    });

    allPlayers.forEach((player, idx) => {
        const targetTeam = TEAMS[idx % TEAMS.length];
        player.isReady = false;
        teams[targetTeam].players.push(player);
    });

    res.json({ success: true, message: `已將全場 ${allPlayers.length} 名隊員均勻分配至 4 個小隊！` });
});

// 管理員切換全局遊戲開關
app.post('/api/admin/toggle-global-start', (req, res) => {
    const { action } = req.body;
    if (action === 'start') {
        isGameGlobalStarted = true;
    } else if (action === 'stop') {
        isGameGlobalStarted = false;
    } else {
        isGameGlobalStarted = !isGameGlobalStarted;
    }
    res.json({ success: true, isGameGlobalStarted });
});

// 全局重置 API
app.get('/api/reset', (req, res) => {
    initTeams();
    isGameGlobalStarted = false;
    globalBroadcast = { id: 0, message: "" };
    res.json({ success: true, message: "所有小隊與遊戲資料已成功重置！" });
});

// 分配與驗證隊伍 API
app.get('/api/assign-team', (req, res) => {
    const { existingPlayerId, existingTeam } = req.query;
    TEAMS.forEach(cleanupGhostPlayers);

    if (!isGameGlobalStarted && !existingPlayerId) {
        return res.status(403).json({ error: "GAME_NOT_STARTED", message: "遊戲尚未由管理員開啟，請稍後！" });
    }

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
                    chordsInfo: teams[tName].chords.map(c => CHORDS_INFO[c]),
                    isGameGlobalStarted
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
                chordsInfo: teams[existingTeam].chords.map(c => CHORDS_INFO[c]),
                isGameGlobalStarted
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
        chordsInfo: teams[minTeam].chords.map(c => CHORDS_INFO[c]),
        isGameGlobalStarted
    });
});

// 狀態輪詢 API
app.get('/api/status', (req, res) => {
    const { team, playerId } = req.query;
    TEAMS.forEach(cleanupGhostPlayers);

    // 檢查玩家是否被管理員調動至其他組別
    let actualTeam = team;
    if (playerId) {
        for (const tName of TEAMS) {
            if (teams[tName].players.some(p => p.id === playerId)) {
                actualTeam = tName;
                break;
            }
        }
    }

    const teamCounts = {};
    Object.keys(teams).forEach(t => teamCounts[t] = teams[t].players.length);

    let teamData = null;
    if (actualTeam && teams[actualTeam]) {
        const t = teams[actualTeam];
        
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
                const pName = playerObj ? `${actualTeam}-${playerObj.name}` : pId;
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
            actualTeam: actualTeam,
            isMovedByAdmin: (team && actualTeam !== team),
            playersList: t.players.map(x => ({ id: x.id, fullName: `${actualTeam}-${x.name}`, isReady: x.isReady })),
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
            chordsInfo: t.chords.map(c => CHORDS_INFO[c]),
            hasSubmitted: !!t.submissions[playerId],
            levelResult: t.levelResult
        };
    }

    res.json({ 
        isGameGlobalStarted,
        totalGlobalPlayers: getTotalPlayersCount(),
        broadcast: globalBroadcast,
        teamCounts, 
        teamData, 
        leaderboard: getLeaderboard(),
        adminDashboard: getAdminDashboardData()
    });
});

// 玩家動作 API
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
