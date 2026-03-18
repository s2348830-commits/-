// --- 状態管理 ---
let currentBetUnit = 100;
let betHistory = [];
let carsData = [];
let currentBetTab = "単・複"; // 現在選択中の賭け式
let lastCarsDataHash = "";  // ▼ 画面のチラつき（毎秒更新）を防ぐための変数

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
});

// --- UI描画処理 ---
window.updateOddsTable = function(newCarsData) {
    // データが変わっていない場合は再描画をスキップ（スクロールや文字入力の邪魔をしないため）
    let newHash = newCarsData.map(c => c.winOdds).join("");
    if (lastCarsDataHash === newHash) return; 
    
    lastCarsDataHash = newHash;
    carsData = newCarsData;
    
    updateMarquee(carsData); // マーキーの更新
    renderOddsTable();       // オッズ表の更新
}

// ▼ 追加：上の流れる文字（マーキー）を自動生成する機能
function updateMarquee(data) {
    const marqueeText = document.getElementById('marquee-text');
    if (marqueeText && data.length > 0) {
        // 人気順に並び替え
        let popSorted = [...data].sort((a, b) => a.pop - b.pop);
        let popStr = popSorted.map(c => `${c.pop}番人気: ${c.num}番(${c.name})`).join(' ➔ ');

        // 低倍率順に並び替え
        let oddsSorted = [...data].sort((a, b) => a.winOdds - b.winOdds);
        let oddsStr = oddsSorted.map(c => `${c.winOdds}x(${c.num}番)`).join(' ➔ ');

        marqueeText.innerHTML = `
            <span>🏁 第1回 競車グランプリ 1200m</span>
            <span>📊 人気順: ${popStr}</span>
            <span>💰 低倍率順: ${oddsStr}</span>
        `;
    }
}

function renderOddsTable() {
    if (carsData.length === 0) return;
    
    const tableContainer = document.querySelector('.odds-table');
    let html = '';

    if (currentBetTab === "単・複") {
        html = generateWinPlaceTable();
    } else if (currentBetTab === "転がし") {
        html = generateRolloverTable(); // ▼ 転がし専用画面を呼び出す
    } else {
        html = generateComboTable(currentBetTab);
    }

    tableContainer.innerHTML = html;

    // タブによってイベントの設定を変える
    if (currentBetTab === "転がし") {
        setupRolloverEvents();
    } else {
        document.querySelectorAll('.bet-btn').forEach(btn => {
            btn.addEventListener('click', handleBetClick);
        });
        updateBetUI();
    }
}

// ▼ 追加：転がし（全額＆カスタム）専用UIの生成
function generateRolloverTable() {
    return `
        <div style="padding: 20px; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; box-sizing: border-box; overflow-y: auto;">
            <h2 style="color: #ffcc00; margin-top: 0; margin-bottom: 5px;">🔄 転がし（カスタムBET）</h2>
            <p style="margin-bottom: 20px; font-size: 14px;">所持しているFPを全額賭けたり、自由に指定してBETできます。</p>
            
            <div style="background: #222; border: 2px solid #555; padding: 20px; border-radius: 10px; width: 90%; max-width: 400px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 15px; align-items: center;">
                    <span style="font-size: 16px; font-weight: bold;">賭け式:</span>
                    <select id="roll-type" style="font-size: 16px; padding: 5px; width: 65%;">
                        <option value="単勝">単勝</option>
                        <option value="複勝">複勝</option>
                        <option value="馬連">馬連</option>
                        <option value="馬単">馬単</option>
                        <option value="ワイド">ワイド</option>
                        <option value="三連複">三連複</option>
                        <option value="三連単">三連単</option>
                    </select>
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-bottom: 15px; align-items: center;">
                    <span style="font-size: 16px; font-weight: bold;">車番号:</span>
                    <input type="text" id="roll-cars" placeholder="例: 1-2-3" style="font-size: 16px; padding: 5px; width: 65%; text-align: center;">
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-bottom: 20px; align-items: center;">
                    <span style="font-size: 16px; font-weight: bold;">BET額:</span>
                    <div style="width: 65%; display: flex; gap: 5px;">
                        <input type="number" id="roll-amount" placeholder="0" style="font-size: 16px; padding: 5px; width: 100%; text-align: right;">
                        <button id="roll-all-btn" style="background: #d4145a; color: white; border: none; padding: 0 10px; font-weight: bold; cursor: pointer; border-radius: 3px;">全額</button>
                    </div>
                </div>
                
                <button id="roll-submit-btn" style="width: 100%; background: linear-gradient(to bottom, #00ff00, #009900); color: black; font-size: 18px; font-weight: bold; padding: 12px; border-radius: 5px; border: 2px solid white; cursor: pointer;">
                    この内容でBETする
                </button>
            </div>
        </div>
    `;
}

// ▼ 追加：転がし画面でのボタン操作処理
function setupRolloverEvents() {
    const allBtn = document.getElementById('roll-all-btn');
    const submitBtn = document.getElementById('roll-submit-btn');
    const amtInput = document.getElementById('roll-amount');
    const typeSelect = document.getElementById('roll-type');
    const carsInput = document.getElementById('roll-cars');

    if (allBtn) {
        // 全額ボタンを押した時、現在の所持FPを入力欄にセット
        allBtn.addEventListener('click', () => {
            const currentFpText = document.getElementById('current-fp').innerText;
            const maxFp = parseInt(currentFpText.replace(/,/g, ''), 10) || 0;
            amtInput.value = maxFp;
        });
    }

    if (submitBtn) {
        submitBtn.addEventListener('click', () => {
            if (currentRaceState !== "betting") {
                alert("現在はベット時間外です！");
                return;
            }
            
            const type = typeSelect.value;
            const carsStr = carsInput.value.trim().replace(/,/g, '-').replace(/ /g, '');
            const amt = parseInt(amtInput.value, 10);
            
            if (!amt || amt <= 0) { alert("正しいBET額を入力してください。"); return; }
            if (!carsStr) { alert("車番号を入力してください。(例: 1-2)"); return; }

            const carsArr = carsStr.split('-').map(Number);
            
            // バリデーション（桁数チェック）
            if (type === "単勝" || type === "複勝") {
                if (carsArr.length !== 1) { alert(type + "は1台だけ指定してください。"); return; }
            } else if (type === "馬連" || type === "馬単" || type === "ワイド") {
                if (carsArr.length !== 2) { alert(type + "は2台指定してください。(例: 1-2)"); return; }
            } else if (type === "三連複" || type === "三連単") {
                if (carsArr.length !== 3) { alert(type + "は3台指定してください。(例: 1-2-3)"); return; }
            }

            const invalidCars = carsArr.filter(num => !carsData.find(c => c.num === num));
            if (invalidCars.length > 0) { alert("存在しない車番号が含まれています。"); return; }

            // オッズの自動計算
            const calculatedOdds = calculateOddsForRollover(type, carsArr);
            
            let color = "white", text = "black";
            if (carsArr.length === 1) {
                const carData = carsData.find(c => c.num == carsArr[0]);
                if (carData) { color = carData.color; text = carData.text; }
            }

            const newBet = {
                type: type,
                car: carsStr,
                odds: calculatedOdds,
                amount: amt,
                color: color,
                text: text,
                cars: carsArr
            };
            
            betHistory.push(newBet);
            updateBetUI();

            if (window.sendBetToServer) {
                window.sendBetToServer(newBet);
            }
            
            alert(`🎯 転がし完了！\n${type} (${carsStr}) に ${amt} FP BETしました！\n（想定オッズ: ×${calculatedOdds}）`);
            
            amtInput.value = '';
            carsInput.value = '';
        });
    }
}

// ▼ 追加：転がし用オッズ計算機
function calculateOddsForRollover(type, carsArr) {
    let selectedCars = carsData.filter(c => carsArr.includes(c.num));
    if (selectedCars.length !== carsArr.length) return 0; 
    
    if (type === "単勝") return selectedCars[0].winOdds;
    if (type === "複勝") return selectedCars[0].placeOdds.split('~')[0]; 
    
    let baseOdds = selectedCars.reduce((acc, car) => acc * car.winOdds, 1);
    if (type === "馬連") return (baseOdds * 0.4).toFixed(1);
    if (type === "馬単") return (baseOdds * 0.8).toFixed(1);
    if (type === "ワイド") return (baseOdds * 0.15).toFixed(1);
    if (type === "三連複") return (baseOdds * 0.2).toFixed(1);
    if (type === "三連単") return (baseOdds * 0.6).toFixed(1);
    
    return 0;
}


// （これ以下は既存のテーブル描画・ボタン処理と同じです）
function generateWinPlaceTable() {
    let headerHtml = `
        <div class="table-header">
            <div class="col-num">番号</div><div class="col-name">名前</div>
            <div class="col-cond">調子</div><div class="col-pop">人気 / 単勝倍率</div>
            <div class="col-win">単勝</div><div class="col-place">複勝</div>
        </div>`;
    
    let rowsHtml = '';
    carsData.forEach(car => {
        let condColor = "white";
        if (car.cond === "➡") condColor = "lime";
        else if (car.cond === "⬈" || car.cond === "↗") condColor = "hotpink";
        else if (car.cond === "⬆") condColor = "red";
        else if (car.cond === "⬊" || car.cond === "↘") condColor = "deepskyblue";
        else if (car.cond === "⬇") condColor = "mediumpurple";

        rowsHtml += `
            <div class="table-row">
                <div class="col-num" style="background-color: ${car.color}; color: ${car.text}; border: 1px solid #ccc;">${car.num}</div>
                <div class="col-name">${car.name}</div>
                <div class="col-cond" style="color: ${condColor}; font-weight: bold; font-size: 18px;">${car.cond}</div>
                <div class="col-pop">${car.pop} / ${car.winOdds}</div>
                <div class="col-win bet-btn" data-type="単勝" data-car="${car.num}" data-odds="${car.winOdds}" data-cars='[${car.num}]'>
                    <div class="bet-amount"></div><div class="bet-odds">× ${car.winOdds}</div>
                </div>
                <div class="col-place bet-btn" data-type="複勝" data-car="${car.num}" data-odds="${car.placeOdds}" data-cars='[${car.num}]'>
                    <div class="bet-amount"></div><div class="bet-odds">× ${car.placeOdds}</div>
                </div>
            </div>`;
    });
    return headerHtml + rowsHtml;
}

function generateComboTable(type) {
    let headerHtml = `
        <div class="table-header">
            <div class="col-num" style="width: 20%;">番号</div>
            <div class="col-name" style="width: 30%;">名前</div>
            <div class="col-cond" style="width: 10%;">調子</div>
            <div class="col-pop" style="width: 20%;">人気 / 想定オッズ</div>
            <div class="col-win" style="width: 20%;">BET</div>
        </div>`;
    
    let combos = [];
    if (type === "馬連" || type === "ワイド") combos = getCombinations(carsData, 2);
    if (type === "馬単") combos = getPermutations(carsData, 2);
    if (type === "三連複") combos = getCombinations(carsData, 3);
    if (type === "三連単") combos = getPermutations(carsData, 3);

    let rowsHtml = '';
    combos.forEach(combo => {
        let baseOdds = combo.reduce((acc, car) => acc * car.winOdds, 1);
        let displayOdds = 0;
        if (type === "馬連") displayOdds = (baseOdds * 0.4).toFixed(1);
        if (type === "馬単") displayOdds = (baseOdds * 0.8).toFixed(1);
        if (type === "ワイド") displayOdds = (baseOdds * 0.15).toFixed(1);
        if (type === "三連複") displayOdds = (baseOdds * 0.2).toFixed(1);
        if (type === "三連単") displayOdds = (baseOdds * 0.6).toFixed(1);

        let comboStr = combo.map(c => c.num).join('-');
        let carsArrStr = JSON.stringify(combo.map(c => c.num));
        
        let carBoxes = combo.map(c => 
            `<div style="background-color: ${c.color}; color: ${c.text}; border: 1px solid #ccc; width: 22px; height: 22px; display: flex; justify-content: center; align-items: center; font-weight: bold; border-radius: 3px;">${c.num}</div>`
        ).join('<span style="margin: 0 3px; color: black; font-weight: bold;">-</span>');

        let namesHtml = combo.map(c => `<div style="line-height: 1.4;">${c.name}</div>`).join('');
        let condsHtml = combo.map(c => {
            let condColor = "white";
            if (c.cond === "➡") condColor = "lime";
            else if (c.cond === "⬈" || c.cond === "↗") condColor = "hotpink";
            else if (c.cond === "⬆") condColor = "red";
            else if (c.cond === "⬊" || c.cond === "↘") condColor = "deepskyblue";
            else if (c.cond === "⬇") condColor = "mediumpurple";
            return `<div style="color: ${condColor}; line-height: 1.4;">${c.cond}</div>`;
        }).join('');

        let popsStr = combo.map(c => c.pop).join('-');

        rowsHtml += `
            <div class="table-row" style="height: auto; padding: 5px 0;">
                <div class="col-num" style="width: 20%; display: flex; justify-content: center; align-items: center;">${carBoxes}</div>
                <div class="col-name" style="width: 30%; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; font-size: 12px;">${namesHtml}</div>
                <div class="col-cond" style="width: 10%; display: flex; flex-direction: column; justify-content: center; font-weight: bold; font-size: 16px;">${condsHtml}</div>
                <div class="col-pop" style="width: 20%; display: flex; flex-direction: column; justify-content: center; font-size: 14px;">
                    <div>${popsStr}</div>
                    <div style="font-weight: bold; color: #d4145a; margin-top: 2px;">× ${displayOdds}</div>
                </div>
                <div class="col-win bet-btn" style="width: 20%; min-height: 40px; margin-right: 5px;" data-type="${type}" data-car="${comboStr}" data-odds="${displayOdds}" data-cars='${carsArrStr}'>
                    <div class="bet-amount"></div><div class="bet-odds">BET</div>
                </div>
            </div>`;
    });
    return headerHtml + rowsHtml;
}

function getCombinations(arr, size) {
    const res = [];
    function combine(prefix, start) {
        if (prefix.length === size) { res.push(prefix); return; }
        for (let i = start; i < arr.length; i++) combine([...prefix, arr[i]], i + 1);
    }
    combine([], 0); return res;
}
function getPermutations(arr, size) {
    const res = [];
    function permute(prefix, remaining) {
        if (prefix.length === size) { res.push(prefix); return; }
        for (let i = 0; i < remaining.length; i++) {
            permute([...prefix, remaining[i]], remaining.filter((_, idx) => idx !== i));
        }
    }
    permute([], arr); return res;
}

function updateBetUI() {
    if (currentBetTab === "転がし") return; // 転がしタブの時はボタンUIがないのでスキップ

    document.querySelectorAll('.bet-btn').forEach(btn => {
        btn.classList.remove('betted');
        btn.querySelector('.bet-amount').innerText = '';
    });

    let aggregated = {};
    betHistory.forEach(bet => {
        let key = `${bet.car}-${bet.type}`;
        if (!aggregated[key]) aggregated[key] = 0;
        aggregated[key] += bet.amount;
    });

    document.querySelectorAll('.bet-btn').forEach(btn => {
        let key = `${btn.dataset.car}-${btn.dataset.type}`;
        if (aggregated[key]) {
            btn.classList.add('betted');
            btn.querySelector('.bet-amount').innerText = aggregated[key];
        }
    });
}

function setupEventListeners() {
    document.querySelectorAll('.menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentBetTab = e.currentTarget.innerText;
            renderOddsTable(); 
        });
    });

    const betUnitSelect = document.getElementById('bet-unit');
    if (betUnitSelect) {
        betUnitSelect.addEventListener('change', (e) => {
            currentBetUnit = parseInt(e.target.value, 10);
        });
    }

    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            if (betHistory.length > 0) {
                betHistory.pop();
                updateBetUI();
                alert("直前のBETを取り消しました。");
            }
        });
    }

    const showListBtn = document.getElementById('show-list-btn');
    const modalOverlay = document.getElementById('bet-modal-overlay');
    const closeModalBtn = document.getElementById('close-modal-btn');

    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) modalOverlay.style.display = 'none';
        });
    }

    if(showListBtn) {
        showListBtn.addEventListener('click', () => {
            if (betHistory.length === 0) return; 
            const listContainer = document.getElementById('bet-modal-list');
            listContainer.innerHTML = '';
            let totalAmount = 0;
            let aggregated = {};

            betHistory.forEach(bet => {
                let key = `${bet.car}-${bet.type}`;
                if (!aggregated[key]) aggregated[key] = { ...bet, amount: 0 };
                aggregated[key].amount += bet.amount;
            });

            for (let key in aggregated) {
                let item = aggregated[key];
                
                let carIconHtml = '';
                if (item.cars) {
                    carIconHtml = item.cars.map(num => {
                        const carData = carsData.find(c => c.num == num);
                        const bgColor = carData ? carData.color : "white";
                        const txtColor = carData ? carData.text : "black";
                        return `<div style="background-color: ${bgColor}; color: ${txtColor}; border: 1px solid black; width: 35px; height: 24px; display: flex; justify-content: center; align-items: center; font-weight: bold; border-radius: 3px;">${num}</div>`;
                    }).join('<span style="margin: 0 5px; color: white; font-weight: bold;">-</span>');
                }

                listContainer.innerHTML += `
                    <div class="modal-list-item">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="display:flex; align-items:center;">
                                ${carIconHtml}
                            </div>
                            <div style="display:flex; width: 120px; justify-content: space-between; margin-left: 10px;">
                                <span style="color: white;">${item.type}</span>
                                <span style="color: #00ff00;">× ${item.odds}</span>
                            </div>
                        </div>
                        <span style="color: white;">${item.amount} FP</span>
                    </div>`;
                totalAmount += item.amount;
            }
            document.getElementById('bet-modal-total').innerText = `${totalAmount} FP`;
            modalOverlay.style.display = 'flex';
        });
    }

    if(closeModalBtn) closeModalBtn.addEventListener('click', () => modalOverlay.style.display = 'none');
}

function handleBetClick(e) {
    if (currentRaceState !== "betting") return; 

    const btn = e.currentTarget;
    const betType = btn.dataset.type;
    const carNumStr = btn.dataset.car; 
    const odds = btn.dataset.odds;
    const carsArr = JSON.parse(btn.dataset.cars); 
    
    let color = "white", text = "black";
    if (carsArr.length === 1) {
        const carData = carsData.find(c => c.num == carsArr[0]);
        if (carData) { color = carData.color; text = carData.text; }
    }

    const newBet = {
        type: betType,
        car: carNumStr,
        odds: odds,
        amount: currentBetUnit,
        color: color,
        text: text,
        cars: carsArr
    };
    
    betHistory.push(newBet);
    updateBetUI();

    if (window.sendBetToServer) {
        window.sendBetToServer(newBet);
    }
}

let currentRaceState = "betting";

window.updateRaceState = function(newState, timerStr, videoTime) {
    const video = document.getElementById('race-video');
    const placeholder = document.getElementById('video-placeholder');
    const overlay = document.getElementById('cutin-overlay');

    if (currentRaceState !== newState) {
        currentRaceState = newState;

        if (newState === "racing") {
            placeholder.style.display = "none";
            video.style.display = "block";
            document.getElementById('bet-modal-overlay').style.display = 'none';

            if (videoTime > 0) {
                overlay.style.display = "flex";
                video.currentTime = videoTime;
                setTimeout(() => {
                    overlay.style.display = "none";
                    video.play().catch(e => console.log(e));
                }, 1000);
            } else {
                video.currentTime = 0;
                video.play().catch(e => console.log(e));
            }

        } else if (newState === "result") {
            video.pause();
            video.style.display = "none";
            placeholder.style.display = "flex";
            placeholder.innerText = "🏁 レース終了！結果集計＆FP配布中...";

        } else if (newState === "betting") {
            video.pause();
            video.currentTime = 0;
            video.style.display = "none";
            overlay.style.display = "none";
            placeholder.style.display = "flex";
            placeholder.innerText = "ベット受付中...";
            
            betHistory = [];
            updateBetUI();
        }
    } else if (newState === "racing" && Math.abs(video.currentTime - videoTime) > 2) {
        video.currentTime = videoTime;
    }
};