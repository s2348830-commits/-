import asyncio
import websockets
import json
import random
import urllib.request
import urllib.parse
import os
import http
import pymongo
import logging

# ログの設定
logging.getLogger("websockets.server").setLevel(logging.CRITICAL)
logging.getLogger("websockets.http11").setLevel(logging.CRITICAL)

# Discord Webhook URL
WEBHOOK_URL = "https://discord.com/api/webhooks/1483775041148817480/6k7PEYZjNfO9Xik7HWroEzW0BLTP3jp3zzot7kJe00ZpdUkQPGipThBxtsY2gkseqYsK"

# ==========================================
# ▼ Discord 認証情報
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
        db = mongo_client["race_game_db"]
        # ボットと同じコレクション名を使用
        users_col = db["discord_users"]
        print("✅ MongoDBへの接続に成功しました！")
    except Exception as e:
        print(f"❌ MongoDB接続エラー: {e}")
else:
    print("⚠️ 警告: MONGO_URLが環境変数に設定されていません。")

connected_clients = set()

# --- レースの状態管理 ---
race_state = "betting"
race_timer = 600
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
    volatility = 1.2 if current_weather == "雨" else 1.5 if current_weather == "雷雨" else 1.0
    cars = []
    popularities = [1, 2, 3, 4, 5]
    random.shuffle(popularities)
    names = ["レッドフェラーリ", "ブルーポルシェ", "イエローマクラーレン", "グリーンスープラ", "シルバーGTR"]
    colors = ["white", "black", "red", "blue", "yellow"]
    texts = ["black", "white", "white", "white", "black"]
    for i in range(5):
        pop = popularities[i]
        win_odds = round(random.uniform(1.8, 4.8) * volatility, 1) if pop == 1 else \
                   round(random.uniform(3.5, 7.5) * volatility, 1) if pop == 2 else \
                   round(random.uniform(5.5, 11.0) * volatility, 1) if pop == 3 else \
                   round(random.uniform(8.0, 16.0) * volatility, 1) if pop == 4 else \
                   round(random.uniform(10.0, 25.0) * volatility, 1)
        cars.append({
            "num": i + 1, "name": names[i], "cond": random.choice(["➡", "↗", "⬆", "↘", "⬇"]),
            "pop": pop, "winOdds": win_odds, "placeOdds": f"{round(max(1.0, win_odds * 0.2), 1)}~{round(max(1.1, win_odds * 0.4), 1)}",
            "color": colors[i], "text": texts[i]
        })
    return cars

current_cars_data = generate_race_data()

def send_discord_notification(message):
    req = urllib.request.Request(WEBHOOK_URL, data=json.dumps({"content": message}).encode(), headers={"Content-Type": "application/json", "User-Agent": "RaceBot/1.0"})
    try: urllib.request.urlopen(req)
    except Exception as e: print(f"通知失敗: {e}")

def process_race_results():
    global current_bets
    results = [1, 2, 3, 4, 5]
    random.shuffle(results)
    r = results[:5]
    discord_msg = f"🏁 **第{race_count}回 レース結果発表！** 🏁\n🥇:{r[0]}番 🥈:{r[1]}番 🥉:{r[2]}番\n\n 👤**プレイヤーのBET結果**👤 \n"
    for bet in current_bets:
        doc_id = bet["doc_id"]
        user_id = bet["user_id"]
        b_info = bet["bet_info"]
        b_type, b_car_str, b_amount = b_info["type"], str(b_info["car"]), int(b_info["amount"])
        
        raw_odds = b_info["odds"]
        b_odds = float(raw_odds.split("~")[0]) if isinstance(raw_odds, str) and "~" in raw_odds else float(raw_odds)
        
        b_cars = [int(c) for c in b_car_str.split('-')]
        is_win = (b_type == "単勝" and b_cars[0] == r[0]) or \
                 (b_type == "複勝" and b_cars[0] in r[:3]) or \
                 (b_type == "馬連" and set(b_cars) == {r[0], r[1]}) or \
                 (b_type == "馬単" and b_cars == r[:2]) or \
                 (b_type == "ワイド" and set(b_cars).issubset(set(r[:3]))) or \
                 (b_type == "三連複" and set(b_cars) == {r[0], r[1], r[2]}) or \
                 (b_type == "三連単" and b_cars == r[:3])
        
        payout = int(b_amount * b_odds) if is_win else 0
        if payout > 0 and MONGO_URL:
            # ★ ボットと同じIDでFPを増やす
            users_col.update_one({"_id": doc_id}, {"$inc": {"fp": payout}})
        
        mention = f"<@{user_id}>" if user_id.isdigit() else user_id
        discord_msg += f"{mention} | {b_type}({b_car_str}) | {b_amount}FP ➔ **{payout}FP**\n"
        
    send_discord_notification(discord_msg if current_bets else discord_msg + "今回のレースは誰もBETしませんでした。\n")
    current_bets = []

async def exchange_code(code):
    data = urllib.parse.urlencode({
        'client_id': DISCORD_CLIENT_ID, 
        'client_secret': DISCORD_CLIENT_SECRET, 
        'grant_type': 'authorization_code', 
        'code': code, 
        'redirect_uri': "https://race-game-8x0a.onrender.com"
    }).encode()
    req = urllib.request.Request("https://discord.com/api/oauth2/token", data=data, headers={'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'DiscordBot'})
    try:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, lambda: urllib.request.urlopen(req))
        return json.loads(response.read().decode())
    except Exception as e:
        print(f"❌ Discord認証エラー詳細: {e}")
        return None

async def handler(websocket):
    connected_clients.add(websocket)
    client_doc_id = None 
    try:
        async for message in websocket:
            data = json.loads(message)
            
            if data["action"] == "auth":
                token_response = await exchange_code(data["code"])
                if token_response and "access_token" in token_response:
                    await websocket.send(json.dumps({"type": "auth_success", "access_token": token_response["access_token"]}))
                else:
                    await websocket.send(json.dumps({"type": "error", "message": "Discord認証に失敗しました。"}))

            elif data["action"] == "login":
                u_id, g_id = str(data["user_id"]), str(data.get("guild_id", "DM"))
                
                # ★ ボットと完全に同じ「サーバーID_ユーザーID」を生成
                client_doc_id = f"{g_id}_{u_id}"
                websocket.doc_id = client_doc_id  
                user_fp = 10000
                
                if MONGO_URL:
                    user_doc = users_col.find_one({"_id": client_doc_id})
                    if not user_doc:
                        users_col.insert_one({"_id": client_doc_id, "fp": 10000, "guild_id": g_id, "user_id": u_id})
                    else:
                        user_fp = user_doc.get("fp", 0)
                        print(f"💰 ボット同期完了: {client_doc_id} -> {user_fp}FP")
                
                await websocket.send(json.dumps({
                    "type": "sync", "state": race_state, "timer": f"{race_timer // 60:02d}:{race_timer % 60:02d}", 
                    "fp": user_fp, "cars_data": current_cars_data, "video_time": 35 - race_timer if race_state == "racing" else 0, 
                    "weather": current_weather, "race_count": race_count, "venue": current_venue, "distance": current_distance
                }))

            elif data["action"] == "bet":
                if not client_doc_id or race_state != "betting": continue
                amt = int(data["bet_info"]["amount"])
                
                if MONGO_URL:
                    user_doc = users_col.find_one({"_id": client_doc_id})
                    curr_fp = user_doc.get("fp", 0) if user_doc else 0
                    if curr_fp < amt:
                        print(f"[{client_doc_id}] 残高不足です")
                        continue
                    
                    # ★ ボットと同じIDのFPを減らす
                    users_col.update_one({"_id": client_doc_id}, {"$inc": {"fp": -amt}})
                    current_bets.append({
                        "doc_id": client_doc_id, "user_id": data["user_id"], "bet_info": data["bet_info"]
                    })
                    await websocket.send(json.dumps({"type": "sync", "fp": curr_fp - amt}))

            elif data["action"] == "undo":
                if not client_doc_id or race_state != "betting": continue
                for i in range(len(current_bets) - 1, -1, -1):
                    if current_bets[i]["doc_id"] == client_doc_id:
                        ref_amt = int(current_bets[i]["bet_info"]["amount"])
                        if MONGO_URL:
                            # ★ 取り消した分のFPを戻す
                            users_col.update_one({"_id": client_doc_id}, {"$inc": {"fp": ref_amt}})
                            new_fp = users_col.find_one({"_id": client_doc_id}).get("fp", 0)
                            await websocket.send(json.dumps({"type": "sync", "fp": new_fp}))
                        del current_bets[i]
                        break
    finally:
        connected_clients.remove(websocket)

async def timer_loop():
    global race_timer, race_state, current_cars_data, race_count
    while True:
        state_changed_to_result = False
        
        if race_timer > 0:
            race_timer -= 1
        else:
            if race_state == "betting":
                race_state, race_timer = "racing", 35
            elif race_state == "racing":
                race_state, race_timer = "result", 10
                process_race_results()
                state_changed_to_result = True
            elif race_state == "result":
                race_state, race_timer, race_count, current_cars_data = "betting", 600, race_count + 1, generate_race_data()
        
        if connected_clients:
            if state_changed_to_result:
                for ws in connected_clients:
                    try:
                        msg_dict = {
                            "type": "sync", "state": race_state, "timer": f"{race_timer // 60:02d}:{race_timer % 60:02d}", 
                            "video_time": 0, "weather": current_weather, "cars_data": current_cars_data, 
                            "race_count": race_count, "venue": current_venue, "distance": current_distance
                        }
                        if hasattr(ws, 'doc_id') and MONGO_URL:
                            user_doc = users_col.find_one({"_id": ws.doc_id})
                            if user_doc:
                                msg_dict["fp"] = user_doc.get("fp", 0)
                        await ws.send(json.dumps(msg_dict))
                    except Exception:
                        pass
            else:
                msg = json.dumps({
                    "type": "sync", "state": race_state, "timer": f"{race_timer // 60:02d}:{race_timer % 60:02d}", 
                    "video_time": 35 - race_timer if race_state == "racing" else 0, 
                    "weather": current_weather, "cars_data": current_cars_data, 
                    "race_count": race_count, "venue": current_venue, "distance": current_distance
                })
                websockets.broadcast(connected_clients, msg)
                
        await asyncio.sleep(1)

# ▼ Renderの厳しい審査を絶対に通過する無敵のヘルスチェック関数
def health_check(*args, **kwargs):
    import http
    path = "/"
    for arg in args:
        if hasattr(arg, 'path'): path = arg.path
        elif isinstance(arg, str): path = arg
            
    if path == "/" or path == "/health":
        try:
            import websockets.http11
            return websockets.http11.Response(200, "OK", [], b"OK\n")
        except Exception:
            return http.HTTPStatus.OK, [], b"OK\n"
    return None

async def main():
    port = int(os.environ.get("PORT", 10000))
    server = await websockets.serve(handler, "0.0.0.0", port, process_request=health_check)
    print(f"🚀 WebSocketサーバー起動！ ポート:{port}")
    await asyncio.gather(server.wait_closed(), timer_loop())

if __name__ == "__main__":
    asyncio.run(main())