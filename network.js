import { DiscordSDK } from "@discord/embedded-app-sdk";
// ▼ あなたのDiscordアプリの Client ID を入力してください
const CLIENT_ID = "1457823497937096836"; 
const discordSdk = new DiscordSDK(CLIENT_ID);

let socket = null;
let currentUserId = null;

/**
 * Discord SDKの初期化とWebSocketの開始
 */
async function setupDiscordAndSocket() {
    console.log("Discord SDKの準備を開始します...");
    
    try {
        // 1. SDKの準備完了を待つ
        await discordSdk.ready();
        console.log("Discord SDK ready.");

        // 2. Discordから一時的な「認証コード」を取得する
        // これにより、現在このアクティビティを開いているユーザーを特定できます
        const { code } = await discordSdk.commands.authorize({
            client_id: CLIENT_ID,
            response_type: "code",
            state: "",
            prompt: "none",
            scope: ["identify", "guilds"],
        });

        console.log("認証コードを取得しました。サーバーに接続します...");
        
        // 3. WebSocket接続を開始し、取得したコードを渡す
        connectWebSocket(code);

    } catch (error) {
        console.error("Discord SDKの初期化または認証に失敗しました:", error);
        // 失敗した場合はテスト用にローカルストレージのIDで接続を試みる（予備策）
        const fallbackId = localStorage.getItem("raceGameUserId") || "guest_" + Math.floor(Math.random() * 1000);
        currentUserId = fallbackId;
        connectWebSocket(null);
    }
}

/**
 * WebSocket接続の確立とメッセージハンドリング
 */
function connectWebSocket(authCode) {
    const WS_URL = "wss://race-game-8x0a.onrender.com";
    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
        console.log("WebSocket接続成功！");
        
        if (authCode) {
            // Discordからのコードがある場合、まずサーバー側に「認証(auth)」を要求する
            console.log("サーバーに認証リクエストを送信中...");
            socket.send(JSON.stringify({
                action: "auth",
                code: authCode
            }));
        } else {
            // コードがない（フォールバック）場合は直接ログイン
            socket.send(JSON.stringify({
                action: "login",
                user_id: currentUserId
            }));
        }
    };

    socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        // --- Discord認証成功時の処理 ---
        if (data.type === "auth_success") {
            console.log("サーバー側でのトークン交換が成功しました。");
            try {
                // サーバーから返ってきた access_token を使ってSDKを認証
                const authResult = await discordSdk.commands.authenticate({
                    access_token: data.access_token,
                });

                // ここでようやく「本物のDiscordユーザーID」が手に入る
                currentUserId = authResult.user.id;
                console.log("Discordログイン完了！ ユーザー:", authResult.user.username, `(ID: ${currentUserId})`);

                // ゲームのログイン処理へ進む
                socket.send(JSON.stringify({
                    action: "login",
                    user_id: currentUserId
                }));
            } catch (err) {
                console.error("SDK authenticate error:", err);
            }
            return;
        }

        // --- 通常のゲーム同期処理 ---
        switch (data.type) {
            case "sync":
                if (data.timer) {
                    document.getElementById('time-left').innerText = data.timer;
                }
                
                if (data.fp !== undefined) {
                    document.getElementById('current-fp').innerText = data.fp;
                }

                if (data.state) {
                    window.updateRaceState(data.state, data.timer, data.video_time);
                }

                if (data.cars_data) {
                    window.updateOddsTable(data.cars_data, data.weather, data.race_count, data.venue, data.distance); 
                }
                break;
                
            case "error":
                console.error("サーバーエラー:", data.message);
                alert(data.message);
                break;
        }
    };

    socket.onclose = () => {
        console.log("WebSocketが切断されました。3秒後に再接続します...");
        setTimeout(() => connectWebSocket(authCode), 3000);
    };
}

/**
 * サーバーへベット情報を送信
 */
window.sendBetToServer = function(betData) {
    if (socket && socket.readyState === WebSocket.OPEN && currentUserId) {
        socket.send(JSON.stringify({
            action: "bet",
            user_id: currentUserId,
            bet_info: betData
        }));
    } else {
        console.warn("送信失敗: 接続されていないか、ユーザーIDが確定していません。");
    }
};

/**
 * サーバーへ直前のベット取り消しを送信
 */
window.sendUndoToServer = function() {
    if (socket && socket.readyState === WebSocket.OPEN && currentUserId) {
        socket.send(JSON.stringify({
            action: "undo",
            user_id: currentUserId
        }));
    }
};

// 起動！
setupDiscordAndSocket();