// --- ローカルテストモード ---
// ※普通のブラウザでテストするため、Discord SDKは一時的にコメントアウトします
// import { DiscordSDK } from "https://unpkg.com/@discord/embedded-app-sdk@1.2.0/lib/index.mjs";

let socket = null;

// テスト用のダミーID（fp_data.json に存在するID）
let currentUserId = "884080992296534016"; 

// アプリ起動時のセットアップ（Discord認証をスキップ）
async function setupDiscordAndSocket() {
    console.log("ローカルテストモードで起動します（Discord連携をスキップ）");
    // 本来はここでDiscordの認証を待ちますが、今回はすぐにWebSocketに繋ぎます
    connectWebSocket();
}

function connectWebSocket() {
    const WS_URL = "wss://kyousha-server.onrender.com";
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
                
                if (data.cars_data) {
                    window.updateOddsTable(data.cars_data);
                }

                if (data.state) {
                    window.updateRaceState(data.state, data.timer, data.video_time);
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

// 起動！
setupDiscordAndSocket();