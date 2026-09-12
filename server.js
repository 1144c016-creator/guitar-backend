const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const TEAM_NAMES = ["Group A", "Group B", "Group C", "Group D", "Group E"];
const ALL_CHORDS = ["C", "D", "G", "Am", "Em", "F", "Fm", "C7"];

let teamCounts = {
    "Group A": 0,
    "Group B": 0,
    "Group C": 0,
    "Group D": 0,
    "Group E": 0
};

// 儲存各組專屬的固定題目順序
let teamChordSequences = {};

// 陣列隨機洗牌演算法
function shuffle(array) {
    let arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// 初始化/重置每組的專屬題目順序（確保每組順序不同但同組一致）
function initTeamChords() {
    TEAM_NAMES.forEach(team => {
        teamChordSequences[team] = shuffle(ALL_CHORDS);
    });
}
initTeamChords(); // 伺服器啟動時即產生各組題目順序

// 分配小隊 API：回傳分配小隊 + 該組專屬的題目順序
app.get('/api/assign-team', (req, res) => {
    let minCount = Infinity;
    let candidateTeams = [];

    for (const team of TEAM_NAMES) {
        if (teamCounts[team] < minCount) {
            minCount = teamCounts[team];
            candidateTeams = [team];
        } else if (teamCounts[team] === minCount) {
            candidateTeams.push(team);
        }
    }

    const chosenTeam = candidateTeams[Math.floor(Math.random() * candidateTeams.length)];
    teamCounts[chosenTeam]++;

    res.json({
        team: chosenTeam,
        currentCount: teamCounts[chosenTeam],
        chords: teamChordSequences[chosenTeam] // 傳回該組專屬的題目順序
    });
});

// 重置分組 API
app.all('/api/reset', (req, res) => {
    TEAM_NAMES.forEach(t => teamCounts[t] = 0);
    initTeamChords(); // 重新洗牌產生新一輪的各組題目
    res.json({ message: "所有小隊人數與題目已重置", teamCounts });
});

// 檢查目前人數 API
app.get('/api/status', (req, res) => {
    res.json({ teamCounts });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
