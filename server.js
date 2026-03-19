require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { MongoClient } = require('mongodb');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
app.use(cors()); // Netlifyからのアクセスを許可
app.use(express.json()); // JSONデータを受け取れるようにする

// 環境変数の読み込み
const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, MONGO_URL, JWT_SECRET, PORT = 10000 } = process.env;

// MongoDBの接続（Botと同じ「discord_users」コレクションを使用）
let usersCol;
MongoClient.connect(MONGO_URL).then(client => {
    usersCol = client.db("race_game_db").collection("discord_users");
    console.log("✅ MongoDBに接続しました");
}).catch(err => console.error("❌ MongoDB接続エラー", err));

// ==========================================
// 1. Discord OAuth2 認証 API (ログインしてJWTを発行)
// ==========================================
app.post('/api/auth', async (req, res) => {
    const { code, guild_id } = req.body;
    try {
        // ① Discordからアクセストークンを取得
        const params = new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: "https://あなたのRenderのURL.onrender.com" // ★必ずご自身のURLに変更してください
        });
        const tokenRes = await axios.post('https://discord.com/api/oauth2/token', params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }});
        const accessToken = tokenRes.data.access_token;

        // ② トークンを使ってユーザー情報を取得
        const userRes = await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${accessToken}` }});
        const userId = userRes.data.id;
        const docId = `${guild_id}_${userId}`; // Botと共通のID形式を作成

        // ③ DBにユーザーがいなければ初期FP(10000)で作成
        let userDoc = await usersCol.findOne({ _id: docId });
        if (!userDoc) {
            await usersCol.insertOne({ _id: docId, user_id: userId, guild_id: guild_id, fp: 10000 });
            userDoc = { fp: 10000 };
        }

        // ④ 偽造できない「証明書（JWT）」を発行
        const sessionToken = jwt.sign({ userId, guildId: guild_id, docId }, JWT_SECRET, { expiresIn: '12h' });

        // JWTと現在のFPをフロントエンドに返す
        res.json({ token: sessionToken, discord_token: accessToken, fp: userDoc.fp, user: userRes.data });
    } catch (error) {
        console.error("認証エラー:", error.response?.data || error.message);
        res.status(401).json({ error: '認証失敗' });
    }
});

// ==========================================
// 🔐 JWTを検証するミドルウェア（これがないと以下のAPIは使えない）
// ==========================================
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(403).json({ error: 'トークンがありません' });
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: '無効なトークンです' });
        req.user = decoded; // 復号化されたユーザー情報を保存
        next();
    });
};

// ==========================================
// 2. FP取得 API
// ==========================================
app.get('/api/user/fp', verifyToken, async (req, res) => {
    const userDoc = await usersCol.findOne({ _id: req.user.docId });
    res.json({ fp: userDoc ? userDoc.fp : 0 });
});

// ==========================================
// 3. BET（FP減算） API
// ==========================================
app.post('/api/bet', verifyToken, async (req, res) => {
    const { amount } = req.body;
    if (amount <= 0) return res.status(400).json({ error: '不正な金額' });

    const userDoc = await usersCol.findOne({ _id: req.user.docId });
    if (!userDoc || userDoc.fp < amount) return res.status(400).json({ error: 'FPが足りません' });

    // FPを減らす
    await usersCol.updateOne({ _id: req.user.docId }, { $inc: { fp: -amount } });
    
    // ※今回は簡略化のため、レース結果時の配当処理などは省いていますが、
    // 実際はここに現在の賭け状況(current_bets)を保存する処理を追加します。
    res.json({ success: true, new_fp: userDoc.fp - amount });
});

// ==========================================
// 4. WebSockets（レースのリアルタイムタイマー・状態同期）
// ==========================================
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let raceTimer = 600;
let raceState = "betting";

setInterval(() => {
    if (raceTimer > 0) {
        raceTimer--;
    } else {
        if (raceState === "betting") { raceState = "racing"; raceTimer = 35; }
        else if (raceState === "racing") { raceState = "result"; raceTimer = 10; }
        else if (raceState === "result") { raceState = "betting"; raceTimer = 600; }
    }
    
    // 全クライアントに状態を送信
    const msg = JSON.stringify({
        type: "sync", state: raceState, timer: `${Math.floor(raceTimer/60).toString().padStart(2,'0')}:${(raceTimer%60).toString().padStart(2,'0')}`,
        video_time: raceState === "racing" ? 35 - raceTimer : 0,
    });
    wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(msg);
    });
}, 1000);

// サーバー起動
server.listen(PORT, () => console.log(`🚀 Node.js サーバー起動: ポート${PORT}`));