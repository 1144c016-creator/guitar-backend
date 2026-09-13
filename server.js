const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

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

const teams = {};

function initTeams() {
    TEAMS.forEach(team => {
        teams[team] = {
            players: [],             // [{ id, name, isReady, lastActive }]
            activePlayers: [],       // ['player_xxx', ...]
            isStarted: false,
            startTime: null,
            finishTimeSeconds: null,
            currentLevelIndex: 0,
            chords: CHORD_POOL,
            levelModes: LEVEL_MODES,
            ensembleFrets: {},       
            submissions: {},         // { playerId: { isCorrect: bool, userInput: {} } }
            levelResult: null,       // null | { status: 'SUCCESS'|'FAILED', wrongPlayerNames: [] }
            relayTurnIndex: 0,
            wrongAttempts: 0
        };
    });
}
initTeams();

// 心跳檢查：每 3 秒自動剔除超過 10 秒未連線的幽靈組員
setInterval(() => {
    const now = Date.now();
    const TIMEOUT = 10000; // 10 秒無回應視為離線

    Object.keys(teams).forEach(teamName => {
        const t = teams[teamName];
        const initialCount = t.players.length;
        
        t.players = t.players.filter(p => (now - p.lastActive) < TIMEOUT);
        
        if (t.players.length !== initialCount) {
            // 自動修復當前關卡參賽名單
            t.activePlayers = t.activePlayers.filter(id => t.players.some(p => p.id === id));
            // 重新檢查交卷狀態
            evaluateLevelSubmissions(teamName);
        }
    });
}, 3000);

// 重置 API
app.get('/api/reset', (req, res) => {
    initTeams();
    res.json({ success: true, message: "所有小隊與遊戲資料已成功重置！" });
});

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

// 評估全員交卷結果
function evaluateLevelSubmissions(teamName) {
    const t = teams[teamName];
    if (!t || !t.isStarted) return;

    const activeList = t.activePlayers.length > 0 ? t.activePlayers : t.players.map(p => p.id);
    if (activeList.length === 0) return;

    const submittedPlayerIds = Object.keys(t.submissions);
    
    // 檢查是否全組參賽者都已交卷
    const allSubmitted = activeList.every(id => submittedPlayerIds.includes(id));

    if (allSubmitted && !t.levelResult) {
        const wrongPlayers = [];
        activeList.forEach(id => {
            const sub = t.submissions[id];
            if (!sub || !sub.isCorrect) {
                const playerObj = t.players.find(p => p.id === id);
                wrongPlayers.push(playerObj ? `${teamName} - ${playerObj.name}` : "未知組員");
            }
        });

        if (wrongPlayers.length === 0) {
            t.levelResult = { status: 'SUCCESS' };
        } else {
            t.wrongAttempts = (t.wrongAttempts || 0) + 1;
            t.levelResult = { status: 'FAILED', wrongPlayerNames: wrongPlayers };
        }
    }
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
    const defaultName = `組員${teams[minTeam].players.length + 1}`;
    
    teams[minTeam].players.push({
        id: playerId,
        name: defaultName,
        joinedAt: Date.now(),
        isReady: false,
        lastActive: Date.now()
    });

    res.json({
        playerId: playerId,
        team: minTeam,
        name: defaultName,
        chords: teams[minTeam].chords,
        levelModes: teams[minTeam].levelModes
    });
});

// 2. 輪詢狀態 API
app.get('/api/status', (req, res) => {
    const { team, playerId } = req.query;
    const teamCounts = {};
    Object.keys(teams).forEach(t => teamCounts[t] = teams[t].players.length);

    let teamData = null;
    if (team && teams[team]) {
        const t = teams[team];
        
        // 更新該玩家的心跳時間
        const player = t.players.find(p => p.id === playerId);
        if (player) player.lastActive = Date.now();

        const readyCount = t.players.filter(p => p.isReady).length;
        const totalLobbyPlayers = t.players.length;
        const allReady = totalLobbyPlayers > 0 && readyCount === totalLobbyPlayers;
        
        const isSpectating = t.isStarted && !t.activePlayers.includes(playerId);
        const activeList = t.activePlayers.length > 0 ? t.activePlayers : t.players.map(p => p.id);
        const playerIndex = activeList.indexOf(playerId);

        teamData = {
            players: t.players.map(p => ({ id: p.id, name: p.name, isReady: p.isReady })),
            totalPlayers: activeList.length,
            totalLobbyPlayers: totalLobbyPlayers,
            readyCount: readyCount,
            allReady: allReady,
            isMyReady: player ? player.isReady : false,
            myName: player ? player.name : "",
            isSpectating: isSpectating,
            playerIndex: playerIndex >= 0 ? playerIndex : 0,
            isStarted: t.isStarted,
            currentLevelIndex: t.currentLevelIndex,
            chords: t.chords,
            levelModes: t.levelModes,
            ensembleFrets: t.ensembleFrets || {},
            submissionsCount: Object.keys(t.submissions).length,
            isMySubmitted: !!t.submissions[playerId],
            levelResult: t.levelResult,
            wrongAttempts: t.wrongAttempts || 0
        };
    }

    res.json({ teamCounts, teamData, leaderboard: getLeaderboard() });
});

// 3. 玩家動作與驗證 API
app.post('/api/action', (req, res) => {
    const { playerId, team, action, data } = req.body;
    const teamData = teams[team];
    if (!teamData) return res.status(400).json({ error: "Team not found" });

    // 更新個人暱稱
    if (action === 'update_name') {
        const player = teamData.players.find(p => p.id === playerId);
        if (player && data && data.name) {
            player.name = data.name.trim().substring(0, 10);
        }
        return res.json({ success: true });
    }

    // 切換 Ready 狀態
    if (action === 'toggle_ready') {
        const player = teamData.players.find(p => p.id === playerId);
        if (player) player.isReady = !!(data && data.isReady);
        return res.json({ success: true });
    }

    // 開始遊戲
    if (action === 'start_game') {
        const allReady = teamData.players.length > 0 && teamData.players.every(p => p.isReady);
        if (!allReady) return res.status(400).json({ error: "全員尚未勾選集合完畢！" });
        if (!teamData.isStarted) {
            teamData.isStarted = true;
            teamData.startTime = Date.now();
            teamData.activePlayers = teamData.players.map(p => p.id);
        }
        return res.json({ success: true });
    }

    // 合奏模式：即時同步指板按壓狀態
    if (action === 'ensemble_update') {
        if (!teamData.ensembleFrets) teamData.ensembleFrets = {};
        if (data && data.frets) Object.assign(teamData.ensembleFrets, data.frets);
        return res.json({ success: true });
    }

    // 全員提交答案（各模式通用）
    if (action === 'submit_answer') {
        if (!teamData.submissions) teamData.submissions = {};
        teamData.submissions[playerId] = {
            isCorrect: !!(data && data.isCorrect),
            userInput: (data && data.frets) ? data.frets : null
        };

        if (data && data.frets) {
            Object.assign(teamData.ensembleFrets, data.frets);
        }

        evaluateLevelSubmissions(team);
        return res.json({ success: true });
    }

    // 重新挑戰（失敗後發起）
    if (action === 'retry_level') {
        teamData.submissions = {};
        teamData.levelResult = null;
        return res.json({ success: true });
    }

    // 前往下一關
    if (action === 'next_level') {
        teamData.currentLevelIndex = (teamData.currentLevelIndex || 0) + 1;
        teamData.ensembleFrets = {};
        teamData.submissions = {};
        teamData.levelResult = null;
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
app.listen(PORT, () => console.log(`🎸 Server running on port ${PORT}`));
