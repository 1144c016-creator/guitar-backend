const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const TEAM_NAMES = ["Group A", "Group B", "Group C", "Group D", "Group E"];
const MAX_MEMBERS_PER_GROUP = 8; // 每組人數上限設定為 8 人

let teamCounts = {
    "Group A": 0,
    "Group B": 0,
    "Group C": 0,
    "Group D": 0,
    "Group E": 0
};

// 分配小隊 API：優先分配給人數最少且未滿員的小隊
app.get('/api/assign-team', (req, res) => {
    // 篩選出尚未滿額的小隊
    const availableTeams = TEAM_NAMES.filter(team => teamCounts[team] < MAX_MEMBERS_PER_GROUP);

    // 若所有小隊都已達上限
    if (availableTeams.length === 0) {
        return res.status(400).json({ 
            error: `所有小隊均已滿員（每組上限 ${MAX_MEMBERS_PER_GROUP} 人）！` 
        });
    }

    // 在未滿額的小隊中尋找人數最少者，維持平均分組
    let minCount = Infinity;
    let candidateTeams = [];

    for (const team of availableTeams) {
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
        membersPerGroup: MAX_MEMBERS_PER_GROUP
    });
});

// 重置分組 API
app.all('/api/reset', (req, res) => {
    TEAM_NAMES.forEach(t => teamCounts[t] = 0);
    res.json({ message: "所有小隊人數已重置", teamCounts });
});

// 檢查目前人數 API
app.get('/api/status', (req, res) => {
    res.json({ teamCounts, maxMembersPerGroup: MAX_MEMBERS_PER_GROUP });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
