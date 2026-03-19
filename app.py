import os
import requests
from flask import Flask, render_template, request, jsonify
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# ======================
# 設定の読み込み
# ======================
CLIENT_ID = os.getenv("DISCORD_CLIENT_ID")
CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET")
MONGO_URL = os.getenv("MONGO_URL")

client = MongoClient(MONGO_URL)
db = client["race_game_db"]
users_col = db["discord_users"]

@app.route("/")
def index():
    # アクティビティが開かれたら、まずHTMLを返す
    # その際、JS側で使うためにCLIENT_IDを渡しておく
    return render_template("index.html", client_id=CLIENT_ID)

@app.route("/api/token", methods=["POST"])
def token():
    # JS（フロントエンド）から送られてきたコードを、Discordのトークンに変換する
    data = request.json
    code = data.get("code")

    token_response = requests.post(
        "https://discord.com/api/oauth2/token",
        data={
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "grant_type": "authorization_code",
            "code": code,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    return jsonify(token_response.json())

@app.route("/api/fp", methods=["POST"])
def get_fp():
    # JSから送られたトークンを使って、そのユーザーの情報をDiscordから取得
    data = request.json
    access_token = data.get("access_token")

    user_res = requests.get(
        "https://discord.com/api/users/@me",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    
    if user_res.status_code != 200:
        return jsonify({"error": "ユーザー情報の取得に失敗しました"}), 401

    user_data = user_res.json()
    user_id = user_data["id"]

    # MongoDBからFPを取得
    user_data_cursor = users_col.find({"user_id": user_id})
    total_fp = 0
    server_data_list = []

    for doc in user_data_cursor:
        fp = doc.get("fp", 0)
        total_fp += fp
        server_data_list.append({
            "guild_id": doc.get("guild_id"),
            "fp": fp
        })

    return jsonify({
        "user": user_data,
        "total_fp": total_fp,
        "servers": server_data_list
    })

if __name__ == "__main__":
    app.run(debug=True, port=5000)