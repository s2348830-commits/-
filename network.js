let socket = null;
let currentUserId = "884080992296534016"; 

async function setupDiscordAndSocket() {
    console.log("ローカルテストモードで起動します（Discord連携をスキップ）");
    connectWebSocket();
}

function connectWebSocket() {
    const WS_URL = "wss://race-game-8x0a.onrender.com";
    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
        console.log("WebSocket接続成功！");
        socket.send(JSON.stringify({
            action: "login",
            user_id: currentUserId
        }));
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case "sync":
                document.getElementById('time-left').innerText = data.timer;
                
                if (data.fp !== undefined) {
                    document.getElementById('current-fp').innerText = data.fp;
                }

                if (data.state) {
                    window.updateRaceState(data.state, data.timer, data.video_time);
                }

                if (data.cars_data) {
                    // ▼ 修正: 天気やコース情報も一緒に渡す
                    window.updateOddsTable(data.cars_data, data.weather, data.race_count, data.venue, data.distance); 
                }
                break;
        }
    };

    socket.onclose = () => {
        console.log("WebSocketが切断されました。再接続します...");
        setTimeout(connectWebSocket, 3000);
    };
}

window.sendBetToServer = function(betData) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            action: "bet",
            user_id: currentUserId,
            bet_info: betData
        }));
    } else {
        alert("サーバーと通信できません。");
    }
};

window.sendUndoToServer = function() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            action: "undo",
            user_id: currentUserId
        }));
    }
};

setupDiscordAndSocket();