const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const TEAM_NAMES = ["Group A", "Group B", "Group C", "Group D", "Group E"];
const ALL_CHORDS = ["C", "D", "G", "Am", "Em", "F", "Fm", "C7"];

// 關卡模式配置 (共 8 關)
const LEVEL_MODES = [
    { type: 'lock', name: '🔒 全員完成鎖定' },
    { type: 'lock', name: '🔒 全員完成鎖定' },
    { type: 'relay', name: '⚡ 多人順序接力' },
    { type: 'lock', name: '🔒 全員完成鎖定' },
    { type: 'relay', name: '⚡ 多人順序接力' },
    { type: 'ensemble', name: '🎸 合奏分工彈奏' },
    { type: 'ensemble', name: '🎸 合奏分工彈奏' },
    { type: 'boss', name: '🔥 終極大合奏' }
];

let gameState = {};

function shuffle(array) {
    let arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// 初始化/重置遊戲：採用環狀錯位演算法，100% 確保各組每關題目完全錯開
function initGame() {
    gameState = { teams: {}, players: {} };
    
    // 1. 先把 8 個和弦隨機洗牌一次，作為基礎母陣列
    const baseChords = shuffle(ALL_CHORDS);

    // 2. 利用「環狀錯位 (Cyclic Shift Array)」演算法分配題目
    TEAM_NAMES.forEach((teamName, index) => {
        let teamChords = [];
        for (let i = 0; i < baseChords.length; i++) {
            // 每組依照索引偏移 index 個位置 (Group A 偏 0, Group B 偏 1, Group C 偏 2...)
            teamChords.push(baseChords[(i + index) % baseChords.length]);
        }

        gameState.teams[teamName] = {
            name: teamName,
            players: [], 
            isFinished: false,
            finalMemberCount: 0,
            finishTimeSeconds: null,
            wrongAttempts: 0,
            startTime: null,
            chords: teamChords, // 100% 絕不重複的專屬題目順序
            currentLevelIndex: 0,
            lockStatus: {}, // Mode 1 玩家完成狀態
            ensembleFrets: { 1: -1, 2: -1, 3: -1, 4: -1, 5: -1, 6: -1 }, // Mode 2 全組共用指法
            relayTurnIndex: 0 // Mode 3 目前接力棒次
        };
    });
}
initGame();

// 分配小隊 API
app.get('/api/assign-team', (req, res) => {
    let candidateTeams = TEAM_NAMES.filter(t => !gameState.teams[t].isFinished);
    if (candidateTeams.length === 0) candidateTeams = TEAM_NAMES;

    let minCount = Infinity;
    let chosenTeams = [];
    candidateTeams.forEach(t => {
        let count = gameState.teams[t].players.length;
        if (count < minCount) {
            minCount = count;
            chosenTeams = [t];
        } else if (count === minCount) {
            chosenTeams.push(t);
        }
    });

    const chosenTeam = chosenTeams[Math.floor(Math.random() * chosenTeams.length)];
    const playerId = 'p_' + Math.random().toString(36).substr(2, 9);
    
    gameState.teams[chosenTeam].players.push(playerId);
    gameState.players[playerId] = {
        id: playerId,
        team: chosenTeam
    };

    res.json({
        playerId,
        team: chosenTeam,
        chords: gameState.teams[chosenTeam].chords,
        levelModes: LEVEL_MODES
    });
});

// 計算即時排行榜 (已完成優先依時間排序，未完成依關卡數排序)
function getLeaderboard() {
    return TEAM_NAMES.map(tName => {
        const t = gameState.teams[tName];
        return {
            team: tName,
            isFinished: t.isFinished,
            memberCount: t.isFinished ? t.finalMemberCount : t.players.length,
            finishTimeSeconds: t.finishTimeSeconds,
            wrongAttempts: t.wrongAttempts,
            currentLevel: t.currentLevelIndex + 1
        };
    }).sort((a, b) => {
        if (a.isFinished && !b.isFinished) return -1;
        if (!a.isFinished && b.isFinished) return 1;
        if (a.isFinished && b.isFinished) {
            return a.finishTimeSeconds - b.finishTimeSeconds;
        }
        return b.currentLevel - a.currentLevel;
    });
}

// 狀態輪詢 API
app.get('/api/status', (req, res) => {
    const { playerId, team } = req.query;

    let teamCounts = {};
    TEAM_NAMES.forEach(t => {
        teamCounts[t] = gameState.teams[t].isFinished 
            ? gameState.teams[t].finalMemberCount 
            : gameState.teams[t].players.length;
    });

    let teamData = null;
    if (team && gameState.teams[team]) {
        const t = gameState.teams[team];
        let pIndex = t.players.indexOf(playerId);
        teamData = {
            currentLevelIndex: t.currentLevelIndex,
            totalPlayers: t.players.length,
            playerIndex: pIndex >= 0 ? pIndex : 0,
            lockStatus: t.lockStatus,
            ensembleFrets: t.ensembleFrets,
            relayTurnIndex: t.relayTurnIndex,
            isFinished: t.isFinished,
            wrongAttempts: t.wrongAttempts
        };
    }

    res.json({
        teamCounts,
        teamData,
        leaderboard: getLeaderboard()
    });
});

// 遊戲互動操作 API
app.post('/api/action', (req, res) => {
    const { playerId, team, action, data } = req.body;
    const t = gameState.teams[team];
    if (!t) return res.status(400).json({ error: "無效的組別" });

    if (action === 'start_game') {
        if (!t.startTime) t.startTime = Date.now();
        return res.json({ success: true });
    }

    if (action === 'lock_submit') {
        t.lockStatus[playerId] = data.isCorrect;
        if (!data.isCorrect) t.wrongAttempts++;
        return res.json({ success: true });
    }

    if (action === 'ensemble_update') {
        if (data.frets) Object.assign(t.ensembleFrets, data.frets);
        return res.json({ success: true, ensembleFrets: t.ensembleFrets });
    }

    if (action === 'relay_submit') {
        if (data.isCorrect) {
            t.relayTurnIndex++;
        } else {
            t.wrongAttempts++;
        }
        return res.json({ success: true, relayTurnIndex: t.relayTurnIndex });
    }

    if (action === 'next_level') {
        t.currentLevelIndex++;
        t.lockStatus = {}; 
        t.ensembleFrets = { 1: -1, 2: -1, 3: -1, 4: -1, 5: -1, 6: -1 }; 
        t.relayTurnIndex = 0; 

        // 全關卡通過，永久凍結人數與通關時間
        if (t.currentLevelIndex >= ALL_CHORDS.length && !t.isFinished) {
            t.isFinished = true;
            t.finalMemberCount = t.players.length; // 人數硬性凍結
            t.finishTimeSeconds = Math.floor((Date.now() - (t.startTime || Date.now())) / 1000);
        }
        return res.json({ success: true, currentLevelIndex: t.currentLevelIndex, isFinished: t.isFinished });
    }

    res.json({ success: true });
});

// 完全重置 API
app.all('/api/reset', (req, res) => {
    initGame();
    res.json({ message: "遊戲已重置", leaderboard: getLeaderboard() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
