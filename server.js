const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 預設隊伍名稱與題目池
const TEAMS = ['紅組', '藍組', '綠組', '黃組'];
const CHORD_POOL = ["C", "G", "Am", "Em", "F", "D", "C7"];
const LEVEL_MODES = [
    { type: 'lock', name: '全員獨立解鎖' },
    { type: 'relay', name: '棒次接力模式' },
    { type: 'ensemble', name: '團隊合奏分工' },
    { type: 'lock', name: '全員獨立解鎖' },
    { type: 'relay', name: '棒次接力模式' },
    { type: 'ensemble', name: '團隊合奏分工' },
    { type: 'boss', name: '終極大合奏 (BOSS)' }
];

// 記憶體中的小隊資料儲存區
const teams = {};

function initTeams() {
    TEAMS.forEach(team => {
        teams[team] = {
            players: [],             // [{ id: 'player_xxx', joinedAt: timestamp, isReady: false }]
            activePlayers: [],       // ['player_xxx', ...] 當前關卡實際參賽的玩家 ID 列表
            isStarted: false,        // 是否已開始遊戲
            startTime: null,         // 開賽時間
            finishTimeSeconds: null, // 通關總耗時
            currentLevelIndex: 0,    // 當前關卡索引
            chords: CHORD_POOL,
            levelModes: LEVEL_MODES,
            ensembleFrets: {},       // 合奏模式全組琴弦
            ensembleDone: {},        // 合奏模式已確認玩家
            lockStatus: {},          // 獨立解鎖模式完成玩家
            relayTurnIndex: 0,       // 棒次接力當前棒次
            wrongAttempts: 0         // 答錯總次數
        };
    });
}
initTeams();

// 重置遊戲資料 API
app.get('/api/reset', (req, res) => {
    initTeams();
    res.json({ success: true, message: "所有小隊與遊戲資料已成功重置！" });
});

// 計算各組排行榜
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

// 1. 分配隊伍 API
app.get('/api/assign-team', (req, res) => {
    let minTeam = TEAMS[0];
    let minCount = teams[TEAMS[0]].players.length;

    TEAMS.forEach(team => {
        if (teams[team].players.length < minCount) {
            minCount = teams[team].players.length;
            minTeam = team;
        }
    });

    const playerId = 'player_' + Math.random().toString(36).substring(2, 11);
    teams[minTeam].players.push({ id: playerId, joinedAt: Date.now(), isReady: false });

    res.json({
        playerId: playerId,
        team: minTeam,
        chords: teams[minTeam].chords,
        levelModes: teams[minTeam].levelModes
    });
});

// 2. 輪詢狀態 API
app.get('/api/status', (req, res) => {
    const { team, playerId } = req.query;
    const teamCounts = {};
    Object.keys(teams).forEach(t => {
        teamCounts[t] = teams[t].players.length;
    });

    let teamData = null;
    if (team && teams[team]) {
        const t = teams[team];
        const readyCount = t.players.filter(p => p.isReady).length;
        const totalLobbyPlayers = t.players.length;
        const allReady = totalLobbyPlayers > 0 && readyCount === totalLobbyPlayers;
        
        // 判斷該玩家是否為當前關卡的參賽者（若遊戲已開始且 ID 不在 activePlayers 中，則為中途加入觀戰者）
        const isSpectating = t.isStarted && !t.activePlayers.includes(playerId);
        const activeList = t.activePlayers.length > 0 ? t.activePlayers : t.players.map(p => p.id);
        const playerIndex = activeList.indexOf(playerId);
        const myPlayer = t.players.find(p => p.id === playerId);

        teamData = {
            totalPlayers: activeList.length,           // 當前關卡實際計算用的人數
            totalLobbyPlayers: totalLobbyPlayers,     // 大廳總簽到人數
            readyCount: readyCount,                   // 已準備人數
            allReady: allReady,                       // 是否全員勾選準備
            isMyReady: myPlayer ? myPlayer.isReady : false,
            isSpectating: isSpectating,               // 是否為中途加入觀戰中
            playerIndex: playerIndex >= 0 ? playerIndex : 0,
            isStarted: t.isStarted,
            currentLevelIndex: t.currentLevelIndex,
            chords: t.chords,
            levelModes: t.levelModes,
            ensembleFrets: t.ensembleFrets || {},
            ensembleDone: t.ensembleDone || {},
            lockStatus: t.lockStatus || {},
            relayTurnIndex: t.relayTurnIndex || 0,
            wrongAttempts: t.wrongAttempts || 0
        };
    }

    res.json({
        teamCounts,
        teamData,
        leaderboard: getLeaderboard()
    });
});

// 3. 玩家動作與驗證 API
app.post('/api/action', (req, res) => {
    const { playerId, team, action, data } = req.body;
    const teamData = teams[team];
    if (!teamData) return res.status(400).json({ error: "Team not found" });

    // 切換 Ready 準備狀態
    if (action === 'toggle_ready') {
        const player = teamData.players.find(p => p.id === playerId);
        if (player) {
            player.isReady = !!(data && data.isReady);
        }
        return res.json({ success: true });
    }

    // 開始遊戲（須全員 Ready）
    if (action === 'start_game') {
        const allReady = teamData.players.length > 0 && teamData.players.every(p => p.isReady);
        if (!allReady) {
            return res.status(400).json({ error: "全員尚未勾選集合完畢！" });
        }
        if (!teamData.isStarted) {
            teamData.isStarted = true;
            teamData.startTime = Date.now();
            // 鎖定第一關的實際參賽陣容
            teamData.activePlayers = teamData.players.map(p => p.id);
        }
        return res.json({ success: true });
    }

    // 合奏模式：即時更新琴弦
    if (action === 'ensemble_update') {
        if (!teamData.ensembleFrets) teamData.ensembleFrets = {};
        if (data && data.frets) {
            Object.assign(teamData.ensembleFrets, data.frets);
        }
        teamData.ensembleDone = {};
        return res.json({ success: true });
    }

    // 合奏模式：確認完成
    if (action === 'ensemble_submit') {
        if (!teamData.ensembleFrets) teamData.ensembleFrets = {};
        if (!teamData.ensembleDone) teamData.ensembleDone = {};
        if (data && data.frets) {
            Object.assign(teamData.ensembleFrets, data.frets);
        }
        teamData.ensembleDone[playerId] = true;
        return res.json({ success: true, doneCount: Object.keys(teamData.ensembleDone).length });
    }

    // 獨立解鎖模式：提交答案
    if (action === 'lock_submit') {
        if (!teamData.lockStatus) teamData.lockStatus = {};
        if (data && data.isCorrect) {
            teamData.lockStatus[playerId] = true;
        } else {
            teamData.wrongAttempts = (teamData.wrongAttempts || 0) + 1;
        }
        return res.json({ success: true });
    }

    // 接力模式：提交答案
    if (action === 'relay_submit') {
        if (data && data.isCorrect) {
            teamData.relayTurnIndex = (teamData.relayTurnIndex || 0) + 1;
        } else {
            teamData.wrongAttempts = (teamData.wrongAttempts || 0) + 1;
        }
        return res.json({ success: true });
    }

    // 前往下一關
    if (action === 'next_level') {
        teamData.currentLevelIndex = (teamData.currentLevelIndex || 0) + 1;
        teamData.ensembleFrets = {};
        teamData.ensembleDone = {};
        teamData.lockStatus = {};
        teamData.relayTurnIndex = 0;

        // 核心機制：前往下一關時更新參賽陣容，將中途加入的新隊員納入新關卡
        teamData.activePlayers = teamData.players.map(p => p.id);

        const isFinished = teamData.currentLevelIndex >= (teamData.chords ? teamData.chords.length : 7);
        if (isFinished && !teamData.finishTimeSeconds) {
            teamData.finishTimeSeconds = Math.floor((Date.now() - (teamData.startTime || Date.now())) / 1000);
        }
        return res.json({ success: true, isFinished });
    }

    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🎸 Server is running on port ${PORT}`);
});
