const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// ==========================================
// 1. 關卡路線設定 (5 關完全錯開)
// ==========================================
const TEAM_ROUTES = {
    '紅組': ["C", "Am", "G", "Em", "D"],
    '藍組': ["Am", "G", "Em", "D", "C"],
    '綠組': ["G", "Em", "D", "C", "Am"],
    '黃組': ["Em", "D", "C", "Am", "G"]
};

// ==========================================
// 2. 5 大和弦關卡內容與謎題設定範本
// ==========================================
const LEVEL_DATA = {
    "C": {
        levelId: "LV-C",
        title: "C 和弦 - 明亮的起點",
        theme: "主音城堡",
        timeLimit: 0, // 0 為無限制，或設定秒數
        introText: "歡迎來到音樂大道的起點，這裡充滿了和諧的根音。",
        puzzleContext: "請輸入開啟第一道門的 4 位數金鑰。",
        answer: "1358",
        clues: [
            { id: "c_clue_1", name: "微黃的樂譜", desc: "上面標註著 C - E - G 三個音符。" }
        ],
        hints: [
            "提示 1：觀察樂譜上的音符對應數字。",
            "提示 2：C=1, E=3, G=5。",
            "解答：密碼為 1358。"
        ]
    },
    "Am": {
        levelId: "LV-Am",
        title: "Am 和弦 - 憂傷的平行調",
        theme: "陰暗小徑",
        timeLimit: 0,
        introText: "空氣中帶著淡淡的小調憂傷，這裡藏著隱密的線索。",
        puzzleContext: "牆上的石板印著殘缺的符號，請填入對應字串。",
        answer: "6136",
        clues: [
            { id: "am_clue_1", name: "舊式音叉", desc: "敲擊時發出 A 音的頻率。" }
        ],
        hints: [
            "提示 1：小調的根音起點與 C 大調不同。",
            "提示 2：音名 A 對應的簡譜數字是 6。",
            "解答：密碼為 6136。"
        ]
    },
    "G": {
        levelId: "LV-G",
        title: "G 和弦 - 屬音的引力",
        theme: "風車燈塔",
        timeLimit: 0,
        introText: "強烈的導向力量將你拉向這裡，試圖尋求終止的解答。",
        puzzleContext: "旋轉燈塔的密碼盤，輸入正確的解碼序列。",
        answer: "5725",
        clues: [
            { id: "g_clue_1", name: "指南針", desc: "指針始終指向屬音 G 的方向。" }
        ],
        hints: [
            "提示 1：G 大調和弦包含 G, B, D。",
            "提示 2：對應簡譜音階 5, 7, 2。",
            "解答：密碼為 5725。"
        ]
    },
    "Em": {
        levelId: "LV-Em",
        title: "Em 和弦 - 沉思的副屬調",
        theme: "密林廢墟",
        timeLimit: 0,
        introText: "森林深處十分安靜，只有吉他前奏的殘音在縈繞。",
        puzzleContext: "請解開石門上的琴弦鎖。",
        answer: "3573",
        clues: [
            { id: "em_clue_1", name: "斷裂的吉他弦", desc: "那是第六弦 E 弦的殘片。" }
        ],
        hints: [
            "提示 1：E - G - B 的音程關係。",
            "提示 2：分別代表簡譜中的 3, 5, 7。",
            "解答：密碼為 3573。"
        ]
    },
    "D": {
        levelId: "LV-D",
        title: "D 和弦 - 光彩的大調終章",
        theme: "陽光聖殿",
        timeLimit: 0,
        introText: "陽光灑落，這是通往最終勝利前最重要的考驗。",
        puzzleContext: "輸入最終驗證碼以完成此組別的總冒險。",
        answer: "2462",
        clues: [
            { id: "d_clue_1", name: "黃金徽章", desc: "上面刻著 D 大調的升號記號 #F。" }
        ],
        hints: [
            "提示 1：D 和弦包含 D - #F - A。",
            "提示 2：注意包含升半音的音符順序。",
            "解答：密碼為 2462。"
        ]
    }
};

// ==========================================
// 3. 全遊戲 UI 介面文字 (前端可統一拉取)
// ==========================================
const UI_TEXTS = {
    header: {
        timerLabel: "剩餘時間：",
        unlimitedTimeLabel: "計時中：",
        hintCounter: "提示：",
        pauseBtn: "❚❚ 暫停",
        settingsBtn: "⚙️ 設定"
    },
    puzzleUI: {
        inputPlaceholder: "請輸入密碼...",
        submitBtn: "確定提交",
        resetBtn: "清除重填",
        inventoryBtn: "🧰 開啟背包",
        requestHintBtn: "💡 需要提示",
        backBtn: "↩️ 返回觀察"
    },
    inventoryUI: {
        title: "線索與道具",
        emptyText: "目前尚未收集到任何線索。",
        inspectBtn: "🔍 放大檢查",
        useBtn: "✨ 使用此道具",
        closeBtn: "✖ 關閉"
    },
    hintDialog: {
        title: "求助提示",
        confirmUnlock: "確定解鎖提示嗎？",
        confirmBtn: "確定解鎖",
        cancelBtn: "我再想想",
        noHintsLeft: "本關卡提示已全部使用完畢！"
    },
    victoryScreen: {
        title: "🎉 恭喜通關！",
        subtitle: "你順利破解了本關卡的所有謎題！",
        timeSpentLabel: "花費時間：",
        hintsUsedLabel: "使用提示：",
        nextLevelBtn: "➡️ 進入下一關",
        restartBtn: "🔄 再玩一次",
        mainMenuBtn: "🏠 回主選單"
    },
    defeatScreen: {
        title: "⏰ 挑戰失敗",
        subtitle: "沒能在規定時間內破解謎題...",
        retryBtn: "🔄 重新試一次",
        menuBtn: "🏠 返回關卡列表"
    },
    messages: {
        wrongAnswer: "❌ 密碼錯誤，請再試一次！",
        invalidFormat: "⚠️ 請輸入有效的字元！",
        missingClue: "🔒 似乎還缺少了什麼線索...",
        itemNotUsable: "無事發生，這個道具似乎無法在這裡使用。"
    }
};

// ==========================================
// 4. 遊戲狀態儲存 (記憶體暫存)
// ==========================================
const teamProgress = {
    '紅組': { currentStep: 0, hintsUsed: 0, startTime: Date.now() },
    '藍組': { currentStep: 0, hintsUsed: 0, startTime: Date.now() },
    '綠組': { currentStep: 0, hintsUsed: 0, startTime: Date.now() },
    '黃組': { currentStep: 0, hintsUsed: 0, startTime: Date.now() }
};

// ==========================================
// 5. API 路由端點
// ==========================================

// 取得 UI 全介面文字
app.get('/api/ui-texts', (req, res) => {
    res.json({ success: true, ui: UI_TEXTS });
});

// 取得小隊當前關卡資訊
app.get('/api/team-status/:teamName', (req, res) => {
    const { teamName } = req.params;
    const team = teamProgress[teamName];

    if (!team) {
        return res.status(404).json({ success: false, message: "找不到該小隊" });
    }

    const route = TEAM_ROUTES[teamName];
    const isCompleted = team.currentStep >= route.length;

    if (isCompleted) {
        return res.json({
            success: true,
            isCompleted: true,
            message: "🎉 恭喜完成全部 5 個關卡！"
        });
    }

    const currentChord = route[team.currentStep];
    const levelInfo = LEVEL_DATA[currentChord];

    // 隱藏解答後傳給前端
    const { answer, ...safeLevelInfo } = levelInfo;

    res.json({
        success: true,
        teamName,
        currentStep: team.currentStep + 1,
        totalSteps: route.length,
        chord: currentChord,
        level: safeLevelInfo
    });
});

// 提交驗證答案
app.post('/api/submit-answer', (req, res) => {
    const { teamName, answer } = req.body;
    const team = teamProgress[teamName];

    if (!team) return res.status(400).json({ success: false, message: "小隊名稱無效" });

    const route = TEAM_ROUTES[teamName];
    if (team.currentStep >= route.length) {
        return res.json({ success: false, message: "已經通關全部關卡" });
    }

    const currentChord = route[team.currentStep];
    const correctAnswer = LEVEL_DATA[currentChord].answer;

    if (String(answer).trim() === String(correctAnswer).trim()) {
        team.currentStep += 1; // 進到下一關
        const isAllDone = team.currentStep >= route.length;

        return res.json({
            success: true,
            correct: true,
            isAllDone,
            message: isAllDone ? "🎉 恭喜通關全數 5 關！" : "✅ 解答正確，準備進入下一關！"
        });
    } else {
        return res.json({
            success: true,
            correct: false,
            message: UI_TEXTS.messages.wrongAnswer
        });
    }
});

// 請求關卡提示
app.post('/api/request-hint', (req, res) => {
    const { teamName, hintIndex } = req.body;
    const team = teamProgress[teamName];
    if (!team) return res.status(400).json({ success: false, message: "小隊名稱無效" });

    const route = TEAM_ROUTES[teamName];
    const currentChord = route[team.currentStep];
    const hints = LEVEL_DATA[currentChord].hints;

    if (hintIndex >= 0 && hintIndex < hints.length) {
        team.hintsUsed += 1;
        return res.json({
            success: true,
            hint: hints[hintIndex],
            totalHintsUsed: team.hintsUsed
        });
    }

    res.status(400).json({ success: false, message: "無效的提示索引" });
});

// 啟動伺服器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 遊戲伺服器已於 Port ${PORT} 順利啟動！`);
});
