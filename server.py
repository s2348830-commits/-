import asyncio
import websockets
import json
import random
import urllib.request
import urllib.parse  # ▼ 追加: URLエンコード用
import os
import http
import pymongo # ▼ 追加: MongoDB用ライブラリ
import logging

logging.getLogger("websockets.server").setLevel(logging.CRITICAL)
logging.getLogger("websockets.http11").setLevel(logging.CRITICAL)

WEBHOOK_URL = "https://discord.com/api/webhooks/1483775041148817480/6k7PEYZjNfO9Xik7HWroEzW0BLTP3jp3zzot7kJe00ZpdUkQPGipThBxtsY2gkseqYsK"

# ==========================================
# ▼ Discord 認証情報 (Renderの環境変数に設定してください)
# ==========================================
DISCORD_CLIENT_ID = "1457823497937096836"
DISCORD_CLIENT_SECRET = "5gh4iIWjZfFJihf-yVkMkmzH6xOXUbov"

# ==========================================
# ▼ データベース (MongoDB) の設定
# ==========================================
MONGO_URL = os.environ.get("MONGO_URL")

if MONGO_URL:
    try:
        mongo_client = pymongo.MongoClient(MONGO_URL)
        db = mongo_client["race_game_db"] # データベース名
        users_col = db["users"]           # ユーザー情報を入れるコレクション(テーブル)
        print("✅ MongoDBへの接続に成功しました！")
    except Exception as e:
        print(f"❌ MongoDB接続エラー: {e}")
else:
    print("⚠️ 警告: MONGO_URLが環境変数に設定されていません。")

connected_clients = set()

# --- レースの状態管理 ---
race_state = "betting"
race_timer = 600  # 本番用: 10分 (600秒)
current_bets = []
current_cars_data = []
current_weather = "晴"

race_count = 1
venues = [("東京サーキット", 1200), ("鈴鹿サーキット", 2000), ("富士スピードウェイ", 1600), ("モナコ市街地", 3000), ("ニュルブルクリンク", 5000)]
current_venue, current_distance = venues[0]

def generate_race_data():
    global current_weather, current_venue, current_distance
    current_weather = random.choice(["晴", "曇", "雨", "雷雨"])
    current_venue, current_distance = random.choice(venues)
    
    volatility = 1.0
    if current_weather == "雨": volatility = 1.2
    if current_weather == "雷雨": volatility = 1.5
    cars = []
    popularities = [1, 2, 3, 4, 5]
    random.shuffle(popularities)
    
    names = ["レッドフェラーリ", "ブルーポルシェ", "イエローマクラーレン", "グリーンスープラ", "シルバーGTR"]
    colors = ["white", "black", "red", "blue", "yellow"]
    texts = ["black", "white", "white", "white", "black"]
    
    for i in range(5):
        pop = popularities[i]
        if pop == 1: win_odds = round(random.uniform(1.8, 4.8) * volatility, 1)
        elif pop == 2: win_odds = round(random.uniform(3.5, 7.5) * volatility, 1)
        elif pop == 3: win_odds = round(random.uniform(5.5, 11.0) * volatility, 1)
        elif pop == 4: win_odds = round(random.uniform(8.0, 16.0) * volatility, 1)
        else: win_odds = round(random.uniform(10.0, 25.0) * volatility, 1)
        
        place_min = round(max(1.0, win_odds * 0.2), 1)
        place_max = round(max(1.1, win_odds * 0.4), 1)
        
        cars.append({
            "num": i + 1,
            "name": names[i],
            "cond": random.choice(["➡", "↗", "⬆", "↘", "⬇"]),
            "pop": pop,
            "winOdds": win_odds,
            "placeOdds": f"{place_min}~{place_max}",
            "color": colors[i],
            "text": texts[i]
        })
    return cars

current_cars_data = generate_race_data()

def send_discord_notification(message):
    if WEBHOOK_URL == "ここにWebhookのURLを貼ってください":
        return

    payload = {"content": message}
    headers = {"Content-Type": "application/json", "User-Agent": "RaceBot/1.0"}
    req = urllib.request.Request(WEBHOOK_URL, data=json.dumps(payload).encode(), headers=headers)
    try:
        urllib.request.urlopen(req)
        print("Discordに結果を通知しました！")
    except Exception as e:
        print(f"Discordへの通知に失敗しました: {e}")

def process_race_results():
    global current_bets
    
    results = [1, 2, 3, 4, 5]
    random.shuffle(results)
    
    r1, r2, r3, r4, r5 = results[0], results[1], results[2], results[3], results[4]
    
    discord_msg = f"🏁 **第{race_count}回 レース結果発表！** 🏁\n"
    discord_msg += f"🥇着: {r1}番\n🥈着: {r2}番\n🥉着: {r3}番\n4⃣着: {r4}番\n5⃣着: {r5}番\n\n"
    discord_msg += " 👤**プレイヤーのBET結果**👤 \n"

    for bet in current_bets:
        user_id = bet["user_id"]
        b_type = bet["bet_info"]["type"]
        b_car_str = str(bet["bet_info"]["car"])
        b_amount = int(bet["bet_info"]["amount"])
        
        raw_odds = bet["bet_info"]["odds"]
        if isinstance(raw_odds, str) and "~" in raw_odds:
            b_odds = float(raw_odds.split("~")[0])
        else:
            b_odds = float(raw_odds)

        b_cars = [int(c) for c in b_car_str.split('-')]
        is_win = False
        
        if b_type == "単勝" and b_cars[0] == r1: is_win = True
        elif b_type == "複勝" and b_cars[0] in [r1, r2, r3]: is_win = True
        elif b_type == "馬連" and set(b_cars) == {r1, r2}: is_win = True
        elif b_type == "馬単" and b_cars == [r1, r2]: is_win = True
        elif b_type == "ワイド" and set(b_cars).issubset({r1, r2, r3}): is_win = True
        elif b_type == "三連複" and set(b_cars) == {r1, r2, r3}: is_win = True
        elif b_type == "三連単" and b_cars == [r1, r2, r3]: is_win = True
            
        payout = int(b_amount * b_odds) if is_win else 0
        
        # ▼ 修正: DB上のFPを更新
        if payout > 0 and MONGO_URL:
            users_col.update_one({"_id": user_id}, {"$inc": {"fp": payout}})
                
        mention = f"<@{user_id}>" if user_id.isdigit() else user_id
        discord_msg += f"{mention} | {b_type} ({b_car_str}) | {b_amount}FP ➔ **{payout}FP**\n"

    if not current_bets:
        discord_msg += "今回のレースは誰もBETしませんでした。\n"

    send_discord_notification(discord_msg)
    current_bets = []

# ▼ 追加: Discord APIにコードを送ってトークンをもらう関数
async def exchange_code(code):
    # ここにあなたの Client Secret を正確に入れてください
    CLIENT_SECRET = "5gh4iIWjZfFJihf-yVkMkmzH6xOXUbov" 
    CLIENT_ID = "1457823497937096836"

    url = "https://discord.com/api/oauth2/token"
    
    # 【最重要】末尾にスラッシュを入れない！
    REDIRECT_URI = "https://race-game-8x0a.onrender.com" 

    data = urllib.parse.urlencode({
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': REDIRECT_URI  # これが抜けていると失敗します
    }).encode()
    
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'DiscordBot (https://github.com/Rapptz/discord.py, v2.0)'
    }
    
    req = urllib.request.Request(url, data=data, headers=headers)
    
    try:
        # 非同期でリクエストを実行
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, lambda: urllib.request.urlopen(req))
        return json.loads(response.read().decode())
    except Exception as e:
        # Renderの「Logs」タブにエラーの詳細を出すようにします
        print(f"❌ Discord認証エラー詳細: {e}")
        if hasattr(e, 'read'):
            print(f"❌ エラーレスポンス: {e.read().decode()}")
        return None

async def handler(websocket):
    connected_clients.add(websocket)
    try:
        async for message in websocket:
            data = json.loads(message)
            
            # ▼ 追加: 認証フェーズの処理
            if data["action"] == "auth":
                code = data["code"]
                print("認証コードを受信しました、トークンと交換します...")
                token_response = await exchange_code(code)
                
                if token_response and "access_token" in token_response:
                    await websocket.send(json.dumps({
                        "type": "auth_success",
                        "access_token": token_response["access_token"]
                    }))
                else:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "Discord認証に失敗しました。"
                    }))

            elif data["action"] == "login":
                user_id = data["user_id"]
                
                # ▼ 修正: DBからユーザーを探す、いなければ作る
                user_fp = 0
                if MONGO_URL:
                    user_doc = users_col.find_one({"_id": user_id})
                    if not user_doc:
                        users_col.insert_one({"_id": user_id, "fp": 10000})
                        user_fp = 10000
                        print(f"🔰 DBに新規登録: {user_id} に10000FPを付与しました")
                    else:
                        user_fp = user_doc.get("fp", 0)

                video_time = 35 - race_timer if race_state == "racing" else 0

                response = {
                    "type": "sync",
                    "state": race_state,
                    "timer": f"{race_timer // 60:02d}:{race_timer % 60:02d}",
                    "fp": user_fp,
                    "cars_data": current_cars_data,
                    "video_time": video_time,
                    "weather": current_weather,
                    "race_count": race_count,
                    "venue": current_venue,
                    "distance": current_distance
                }
                await websocket.send(json.dumps(response))

            elif data["action"] == "bet":
                user_id = data["user_id"]
                if race_state != "betting":
                    await websocket.send(json.dumps({"type": "error", "message": "現在はベット時間外です！"}))
                    continue
                
                bet_info = data["bet_info"]
                bet_amount = int(bet_info['amount'])
                
                if MONGO_URL:
                    user_doc = users_col.find_one({"_id": user_id})
                    current_fp = user_doc.get("fp", 0) if user_doc else 0
                    
                    if current_fp < bet_amount:
                        print(f"[{user_id}] 残高不足です")
                        continue
                    
                    # DBのFPを減らす
                    users_col.update_one({"_id": user_id}, {"$inc": {"fp": -bet_amount}})
                    new_fp = current_fp - bet_amount
                else:
                    new_fp = 0 # DBがない時の緊急措置
                
                current_bets.append({"user_id": user_id, "bet_info": bet_info})
                print(f"[{user_id}] が {bet_info['type']} ({bet_info['car']}) に {bet_amount}FP 賭けました")
                
                response = {"type": "sync", "fp": new_fp}
                await websocket.send(json.dumps(response))

            elif data["action"] == "undo":
                user_id = data["user_id"]
                if race_state != "betting":
                    continue
                
                for i in range(len(current_bets) - 1, -1, -1):
                    if current_bets[i]["user_id"] == user_id:
                        refund_amount = int(current_bets[i]["bet_info"]["amount"])
                        
                        if MONGO_URL:
                            # DBのFPを戻す
                            users_col.update_one({"_id": user_id}, {"$inc": {"fp": refund_amount}})
                            user_doc = users_col.find_one({"_id": user_id})
                            new_fp = user_doc.get("fp", 0)
                        else:
                            new_fp = 0

                        del current_bets[i]
                        print(f"[{user_id}] が直前のベット({refund_amount}FP)を取り消しました")
                        
                        response = {"type": "sync", "fp": new_fp}
                        await websocket.send(json.dumps(response))
                        break
                
    finally:
        connected_clients.remove(websocket)

async def timer_loop():
    global race_timer, race_state, current_cars_data, race_count
    while True:
        if race_timer > 0:
            race_timer -= 1
        else:
            if race_state == "betting":
                print("ベット終了！レース開始！")
                race_state = "racing"
                race_timer = 35 
                
            elif race_state == "racing":
                print("レース終了！結果発表＆FP配布！")
                race_state = "result"
                race_timer = 10 
                process_race_results()
                
            elif race_state == "result":
                print("次のレースの準備をします")
                race_state = "betting"
                race_timer = 600
                race_count += 1
                current_cars_data = generate_race_data()
                
        if connected_clients:
            time_str = f"{race_timer // 60:02d}:{race_timer % 60:02d}"
            video_time = 35 - race_timer if race_state == "racing" else 0
            
            message = json.dumps({
                "type": "sync", 
                "state": race_state, 
                "timer": time_str,
                "video_time": video_time,
                "weather": current_weather,
                "cars_data": current_cars_data,
                "race_count": race_count,
                "venue": current_venue,
                "distance": current_distance
            })
            websockets.broadcast(connected_clients, message)
            
        await asyncio.sleep(1)

def health_check(arg1, arg2):
    path = arg1.path if hasattr(arg1, 'path') else arg1
    if path == "/":
        if hasattr(arg1, 'respond'):
            return arg1.respond(http.HTTPStatus.OK, "OK\n")
        else:
            return http.HTTPStatus.OK, [], b"OK\n"
    return None

async def main():
    port = int(os.environ.get("PORT", 8765))
    server = await websockets.serve(handler, "0.0.0.0", port, process_request=health_check)
    print(f"WebSocketサーバー起動！ ポート:{port}")
    await asyncio.gather(server.wait_closed(), timer_loop())

if __name__ == "__main__":
    asyncio.run(main())