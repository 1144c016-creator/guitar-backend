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

// 分配小隊 API：優先將隊員排入目前人數最少的小隊
app.get('/api/assign-team', (req, res) => {
    const totalPlayers = parseInt(req.query.total) || 40;
    const membersPerGroup = Math.ceil(totalPlayers / TEAM_NAMES.length);

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
        membersPerGroup: membersPerGroup
    });
});

// 重置分組 API：活動重新開始時清空數據
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