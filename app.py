import os
import requests
from flask import Flask, render_template, request, redirect, session, url_for
from pymongo import MongoClient
from dotenv import load_dotenv

# .envファイルから設定を読み込む
load_dotenv()

app = Flask(__name__)
# セッション（ログイン状態）を暗号化するためのキー
app.secret_key = os.getenv("SECRET_KEY", "default_secret_key")

# ======================
# Discord OAuth2 の設定
# ======================
CLIENT_ID = os.getenv("DISCORD_CLIENT_ID")
CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET")
REDIRECT_URI = os.getenv("DISCORD_REDIRECT_URI")
# ユーザー情報(identify)だけ取得するURL
OAUTH_URL = f"https://discord.com/api/oauth2/authorize?client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&response_type=code&scope=identify"

# ======================
# MongoDB の設定
# ======================
MONGO_URL = os.getenv("MONGO_URL")
client = MongoClient(MONGO_URL)
db = client["race_game_db"]
users_col = db["discord_users"]

# --- ルーティング（画面へのアクセス設定） ---

@app.route("/")
def index():
    # ログインしていない場合はログイン画面を表示
    if "user_id" not in session:
        return render_template("index.html", logged_in=False)
    
    # ログインしている場合
    user_id = session["user_id"]
    username = session["username"]
    avatar = session.get("avatar")
    
    # アバター画像のURLを生成
    avatar_url = f"https://cdn.discordapp.com/avatars/{user_id}/{avatar}.png" if avatar else "https://cdn.discordapp.com/embed/avatars/0.png"
    
    # 🟢 ここが「常に更新されているDBからFPを参照する」部分！
    # ユーザーIDが一致するデータをすべて探す（複数サーバーにいる可能性もあるため）
    user_data_cursor = users_col.find({"user_id": user_id})
    
    server_data_list = []
    total_fp = 0
    
    for doc in user_data_cursor:
        fp = doc.get("fp", 0)
        total_fp += fp
        server_data_list.append({
            "guild_id": doc.get("guild_id"),
            "fp": fp
        })
        
    return render_template("index.html", 
                           logged_in=True, 
                           username=username, 
                           avatar_url=avatar_url,
                           total_fp=total_fp,
                           servers=server_data_list)

@app.route("/login")
def login():
    # Discordの認証ページへ飛ばす
    return redirect(OAUTH_URL)

@app.route("/callback")
def callback():
    # Discordから帰ってきたときの処理
    code = request.args.get("code")
    if not code:
        return redirect(url_for("index"))
        
    # アクセストークンを取得する
    data = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    token_response = requests.post("https://discord.com/api/oauth2/token", data=data, headers=headers)
    token_json = token_response.json()
    access_token = token_json.get("access_token")
    
    if not access_token:
        return "ログインに失敗しました（トークン取得エラー）", 400
        
    # トークンを使ってユーザー情報を取得する
    user_response = requests.get("https://discord.com/api/users/@me", headers={"Authorization": f"Bearer {access_token}"})
    user_json = user_response.json()
    
    # ログイン状態を保存
    session["user_id"] = user_json["id"]
    session["username"] = user_json["username"]
    session["avatar"] = user_json.get("avatar")
    
    return redirect(url_for("index"))

@app.route("/logout")
def logout():
    # ログアウト処理
    session.clear()
    return redirect(url_for("index"))

if __name__ == "__main__":
    app.run(debug=True, port=5000)