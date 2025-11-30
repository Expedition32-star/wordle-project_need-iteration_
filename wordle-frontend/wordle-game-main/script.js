console.log("JS successfully loaded! Mode: Real Backend Flow");

/* ---------- 配置 ---------- */
const ROWS = 6;
const COLS = 5;

/* ---------- DOM 引用 ---------- */
const startScreen = document.getElementById("start-screen");
const gameScreen = document.getElementById("game-screen");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const boardEl = document.getElementById("board");
const keyboardEl = document.getElementById("keyboard");
const messageEl = document.getElementById("message");

/* ---------- 状态 ---------- */
let boardState = Array.from({ length: ROWS }, () => Array(COLS).fill(""));
let currentRow = 0;
let currentCol = 0;
let isGameOver = false;
let isSubmitting = false; // 防止重复提交

/* ---------- 初始化与事件绑定 ---------- */
startBtn.addEventListener("click", () => {
  startScreen.style.display = "none";
  gameScreen.style.display = "block";
  init();
});

restartBtn.addEventListener("click", () => window.location.reload());

function init() {
  buildBoard();
  buildKeyboard();
  attachEvents();
  showMessage("游戏开始！请输入单词...");
  // 注意：在真实流模式下，我们不需要前端去 fetch today-answer，防止作弊
}

/* ---------- 构造棋盘 ---------- */
function buildBoard() {
  if (!boardEl) return;
  boardEl.innerHTML = "";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.id = `tile-${r}-${c}`;
      tile.textContent = "";
      boardEl.appendChild(tile);
    }
  }
}

/* ---------- 构造键盘 ---------- */
function buildKeyboard() {
  keyboardEl.innerHTML = "";
  const rows = [
    "QWERTYUIOP".split(""),
    "ASDFGHJKL".split(""),
    ["Enter", "Z", "X", "C", "V", "B", "N", "M", "Del"],
  ];

  rows.forEach((r) => {
    const rowWrap = document.createElement("div");
    rowWrap.className = "key-row";
    r.forEach((k) => {
      const btn = document.createElement("button");
      btn.className = "key";
      if (k === "Enter" || k === "Del") btn.classList.add("wide");
      btn.textContent = k;
      btn.dataset.key = k;
      btn.addEventListener("click", () => handleKey(k));
      rowWrap.appendChild(btn);
    });
    keyboardEl.appendChild(rowWrap);
  });
}

/* ---------- 事件监听 ---------- */
function attachEvents() {
  window.addEventListener("keydown", (e) => {
    if (isGameOver) return;
    let key = e.key;
    if (key === "Backspace") key = "Del";
    if (key === "Enter") key = "Enter";
    handleKey(key);
  });
}

function handleKey(key) {
  if (isGameOver || isSubmitting) return; // 提交中锁定键盘
  
  if (/^[a-zA-Z]$/.test(key)) {
    insertLetter(key.toUpperCase());
  } else if (key === "Del") {
    deleteLetter();
  } else if (key === "Enter") {
    triggerSubmit();
  }
}

function insertLetter(ch) {
  if (currentCol >= COLS) return;
  boardState[currentRow][currentCol] = ch;
  const tile = document.getElementById(`tile-${currentRow}-${currentCol}`);
  tile.textContent = ch;
  tile.classList.add("filled");
  currentCol++;
}

function deleteLetter() {
  if (currentCol <= 0) return;
  currentCol--;
  boardState[currentRow][currentCol] = "";
  const tile = document.getElementById(`tile-${currentRow}-${currentCol}`);
  tile.textContent = "";
  tile.classList.remove("filled");
}

/* ---------- 核心逻辑：提交猜测 ---------- */
async function triggerSubmit() {
  // 1. 本地校验长度
  if (currentCol !== COLS) {
    showMessage("请填满 5 个字母后再提交");
    return;
  }

  // 2. 拼接当前行的单词
  const currentGuess = boardState[currentRow].join("");
  
  // 3. 锁定状态，防止重复按 Enter
  isSubmitting = true;
  showMessage("校验中...");

  try {
    // 4. 调用后端 API
    const resultData = await apiCheckGuess(currentGuess);
    
    // 假设后端返回格式为: 
    // { "result": ["correct", "absent", "present", "correct", "correct"], "win": false }
    // 或者如果你后端返回的是 colors: ["green", "gray", ...]，下面会处理

    if (!resultData) {
        throw new Error("API 返回为空");
    }

    // 5. 处理后端返回的颜色
    // 这里做了一个兼容：如果后端返回的是 feedback 字段 或者 result 字段
    const colors = resultData.result || resultData.feedback || resultData.colors; 
    
    if (!colors || colors.length !== 5) {
        throw new Error("后端返回的数据格式不对");
    }

    applyColors(colors, currentGuess);

    // 6. 判断胜负 (优先用后端返回的标志，如果没有则全绿即赢)
    const isWin = resultData.win || colors.every(c => c === "correct" || c === "green");

    if (isWin) {
      showMessage("🎉 猜对了！你赢了！");
      isGameOver = true;
      startConfetti(); // 如果你有烟花特效的话
    } else {
      currentRow++;
      currentCol = 0;
      if (currentRow >= ROWS) {
        isGameOver = true;
        // 如果游戏输了，可以通过另外一个 API 获取答案，或者后端直接在最后一次返回
        const answer = resultData.answer || "（去问后端）"; 
        showMessage(`游戏结束，答案是：${answer}`);
      } else {
        showMessage("继续加油！");
      }
    }

  } catch (err) {
    console.error(err);
    showMessage("网络错误或单词不在词库中");
    // 发生错误时，允许用户修改（不换行）
  } finally {
    isSubmitting = false;
  }
}

/* ---------- API 请求 ---------- */
async function apiCheckGuess(guess) {
  // 注意：确保这里的 Content-Type 是 application/json
  // 确保后端 app.py 也是从 request.json 中获取数据
  const res = await fetch("http://127.0.0.1:5000/api/guess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guess: guess }) 
  });

  if (!res.ok) {
    // 如果是 400，可能是单词不在词表中
    if (res.status === 400) {
        const errJson = await res.json();
        throw new Error(errJson.message || "无效请求");
    }
    throw new Error("API请求失败: " + res.status);
  }
  return await res.json();
}

/* ---------- 渲染颜色 ---------- */
function applyColors(colorArray, guessStr) {
  // 映射后端颜色到 CSS class
  // 假设后端可能返回 'green', 'yellow', 'gray' 或者 'correct', 'present', 'absent'
  const mapColorToClass = (c) => {
    if (c === "green" || c === "correct") return "correct";
    if (c === "yellow" || c === "present") return "present";
    return "absent"; // gray 或其他
  };

  const cssClasses = colorArray.map(mapColorToClass);

  // 1. 更新棋盘格子颜色
  for (let c = 0; c < COLS; c++) {
    const tile = document.getElementById(`tile-${currentRow}-${c}`);
    // 添加动画延迟效果
    setTimeout(() => {
        tile.classList.add(cssClasses[c]);
        tile.style.transitionDelay = `${c * 100}ms`; // 可选：翻转动画
    }, 0);
  }

  // 2. 更新键盘颜色
  updateKeyboardColors(guessStr, cssClasses);
}
/* 将这段代码替换新 JS 中的同名函数 */
function updateKeyboardColors(guess, cssClasses) {
  for (let i = 0; i < guess.length; i++) {
    const letter = guess[i];
    const state = cssClasses[i]; // "correct", "present", "absent"

    const keyButton = document.querySelector(`.key[data-key="${letter}"]`);
    if (!keyButton) continue;

    const priority = { correct: 3, present: 2, absent: 1 };
    const prevState = keyButton.dataset.state;

    // 只有当新状态优先级更高时才更新
    if (!prevState || priority[state] > (priority[prevState] || 0)) {
      // 1. 更新状态标记 (CSS用)
      keyButton.dataset.state = state;

      // 2. 强制更新颜色 (保险起见，保留你之前的逻辑)
      if (state === "correct" || state === "green") {
        keyButton.style.backgroundColor = "#6aaa64"; // 绿色
        keyButton.style.color = "white";
      } else if (state === "present" || state === "yellow") {
        keyButton.style.backgroundColor = "#c9b458"; // 黄色
        keyButton.style.color = "white";
      } else if (state === "absent" || state === "gray") {
        keyButton.style.backgroundColor = "#787c7e"; // 灰色
        keyButton.style.color = "white";
      }
    }
  }
}

function showMessage(text, timeout = 2000) {
  messageEl.textContent = text;
  // 如果 timeout 为 0 则不消失
  if (timeout > 0) {
    setTimeout(() => {
      if (messageEl.textContent === text) messageEl.textContent = "";
    }, timeout);
  }
}