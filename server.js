const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const TEAM_NAMES = ["Group A", "Group B", "Group C", "Group D", "Group E"];

let teamCounts = {
    "Group A": 0,
    "Group B": 0,
    "Group C": 0,
    "Group D": 0,
    "Group E": 0
};

// 分配小隊 API：取消人數上限限制，全面採取「自動平均分配」演算法
app.get('/api/assign-team', (req, res) => {
    // 尋找目前人數最少的小隊，確保無上限且極度平均
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

    // 從目前最少人數的小隊中隨機抽一組分配
    const chosenTeam = candidateTeams[Math.floor(Math.random() * candidateTeams.length)];
    teamCounts[chosenTeam]++;

    res.json({
        team: chosenTeam,
        currentCount: teamCounts[chosenTeam]
    });
});

// 重置分組 API
app.all('/api/reset', (req, res) => {
    TEAM_NAMES.forEach(t => teamCounts[t] = 0);
    res.json({ message: "所有小隊人數已重置", teamCounts });
});

// 檢查目前人數 API
app.get('/api/status', (req, res) => {
    res.json({ teamCounts });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
