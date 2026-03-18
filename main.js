// --- 状態管理 ---
let currentBetUnit = 100;
let betHistory = [];
let carsData = [];
let currentBetTab = "単・複"; // 現在選択中の賭け式
let lastCarsDataHash = "";  // 画面のチラつきを防ぐための変数

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
});

// --- UI描画処理 ---
window.updateOddsTable = function(newCarsData, weather, raceCount, venue, distance) {
    let newHash = newCarsData.map(c => c.winOdds).join("") + weather + raceCount;
    if (lastCarsDataHash === newHash) return; 
    
    lastCarsDataHash = newHash;
    carsData = newCarsData;
    
    updateMarquee(carsData, weather, raceCount, venue, distance);
    renderOddsTable();      
}

// ▼ 修正: お知らせ（マーキー）の表示を全人気順（1〜5）に対応
function updateMarquee(data, weather, raceCount, venue, distance) {
    const marqueeText = document.getElementById('marquee-text');
    if (marqueeText && data.length > 0) {
        let weatherIcon = "☀️";
        if (weather === "曇") weatherIcon = "☁️";
        if (weather === "雨") weatherIcon = "☔";
        if (weather === "雷雨") weatherIcon = "⚡";

        // 人気順（1番人気〜5番人気）に並び替える
        let popSorted = [...data].sort((a, b) => a.pop - b.pop);
        
        // ご要望のフォーマット（名前、倍率、調子）で文字列を生成
        let popListStr = popSorted.map(c => 
            `${c.pop}番人気: ${c.name} 倍率: ${c.winOdds} 調子: ${c.cond}`
        ).join('　|　');

        marqueeText.innerHTML = `
            <span>🏁 第${raceCount || 1}回(${venue || "東京サーキット"}) (${distance || 1200}m)</span>
            <span>　${weatherIcon} 天候: ${weather || "晴"}　</span>
            <span> ${popListStr}</span>
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
        html = generateRolloverTable();
    } else {
        html = generateComboTable(currentBetTab);
    }

    tableContainer.innerHTML = html;

    if (currentBetTab === "転がし") {
        setupRolloverEvents();
    } else {
        document.querySelectorAll('.bet-btn').forEach(btn => {
            btn.addEventListener('click', handleBetClick);
        });
        updateBetUI();
    }
}

function generateRolloverTable() {
    const currentFpText = document.getElementById('current-fp').innerText;
    const currentFp = parseInt(currentFpText.replace(/,/g, ''), 10) || 0;

    if (currentFp < 10000) { 
        return `
            <div style="padding: 20px; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; box-sizing: border-box;">
                <h2 style="color: #ffcc00; margin-top: 0; margin-bottom: 20px;">🔄 転がし</h2>
                <div style="background: rgba(255,0,0,0.2); border: 2px solid red; padding: 30px; border-radius: 10px; text-align: center; width: 90%; max-width: 400px;">
                    <p style="font-size: 20px; font-weight: bold; color: #ff6666; margin: 0; line-height: 1.5;">
                        所持FPが10000未満のため<br>転がし出来ません。
                    </p>
                </div>
            </div>
        `;
    }

    return `
        <div style="padding: 20px; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; box-sizing: border-box; overflow-y: auto;">
            <h2 style="color: #ffcc00; margin-top: 0; margin-bottom: 5px;">🔄 転がし（単勝オールイン）</h2>
            <p style="margin-bottom: 20px; font-size: 14px;">所持している全FP（${currentFp} FP）を指定した車（単勝）に賭けます。</p>
            
            <div style="background: #222; border: 2px solid #555; padding: 20px; border-radius: 10px; width: 90%; max-width: 400px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 15px; align-items: center;">
                    <span style="font-size: 16px; font-weight: bold;">賭け式:</span>
                    <span style="font-size: 16px; font-weight: bold; color: #00ff00;">単勝（固定）</span>
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-bottom: 15px; align-items: center;">
                    <span style="font-size: 16px; font-weight: bold;">車番号:</span>
                    <select id="roll-cars" style="font-size: 16px; padding: 5px; width: 65%;">
                        ${carsData.map(c => `<option value="${c.num}">${c.num}番（${c.name}）</option>`).join('')}
                    </select>
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-bottom: 20px; align-items: center;">
                    <span style="font-size: 16px; font-weight: bold;">BET額:</span>
                    <span style="font-size: 16px; font-weight: bold; color: #ffcc00;" id="roll-amount-display">${currentFp} FP (全額)</span>
                </div>
                
                <button id="roll-submit-btn" style="width: 100%; background: linear-gradient(to bottom, #d4145a, #8e0038); color: white; font-size: 18px; font-weight: bold; padding: 12px; border-radius: 5px; border: 2px solid white; cursor: pointer;">
                    全額オールイン！
                </button>
            </div>
        </div>
    `;
}

function setupRolloverEvents() {
    const submitBtn = document.getElementById('roll-submit-btn');
    const carsSelect = document.getElementById('roll-cars');

    if (submitBtn) {
        submitBtn.addEventListener('click', () => {
            if (currentRaceState !== "betting") {
                alert("現在はベット時間外です！");
                return;
            }
            
            const currentFpText = document.getElementById('current-fp').innerText;
            const amt = parseInt(currentFpText.replace(/,/g, ''), 10) || 0;
            
            if (amt < 10000) {
                alert("所持FPが10000未満のため転がし出来ません。");
                renderOddsTable(); 
                return;
            }
            
            const carNumStr = carsSelect.value;
            const carsArr = [parseInt(carNumStr, 10)];
            const type = "単勝";

            const carData = carsData.find(c => c.num == carsArr[0]);
            if (!carData) return;
            const calculatedOdds = carData.winOdds;

            const newBet = {
                type: type,
                car: carNumStr,
                odds: calculatedOdds,
                amount: amt,
                color: carData.color,
                text: carData.text,
                cars: carsArr
            };
            
            betHistory.push(newBet);
            updateBetUI();

            if (window.sendBetToServer) {
                window.sendBetToServer(newBet);
            }
            
            alert(`🔥 転がし発動！\n${type} (${carNumStr}番) に全額 ${amt} FP をオールインしました！\n（想定オッズ: ×${calculatedOdds}）`);
            
            setTimeout(() => {
                if(currentBetTab === "転がし") renderOddsTable();
            }, 500); 
        });
    }
}

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
    if (currentBetTab === "転がし") return;

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
                if (window.sendUndoToServer) {
                    window.sendUndoToServer();
                }
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