import asyncio
import websockets
import json
import random
import urllib.request
import os
import http  # ▼追加: ヘルスチェックの返信用

# ▼ ここにDiscordのWebhook URLを貼り付けてください！
WEBHOOK_URL = "https://discord.com/api/webhooks/1483775041148817480/6k7PEYZjNfO9Xik7HWroEzW0BLTP3jp3zzot7kJe00ZpdUkQPGipThBxtsY2gkseqYsK"

# JSONデータの読み書き（Render上で動くように修正）
FP_DATA_PATH = "fp_data.json"

def load_fp_data():
    try:
        with open(FP_DATA_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        # テスト用ダミーデータ
        return {"users": {"884080992296534016": {"fp": 10000}}}

def save_fp_data(data):
    try:
        with open(FP_DATA_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"FPデータの保存に失敗しました: {e}")

fp_data = load_fp_data()
connected_clients = set()

# --- レースの状態管理 ---
race_state = "betting"
race_timer = 600  # 本番用: 10分 (600秒)
current_bets = [] # 今回のレースの全ベット履歴を保存
current_cars_data = []
current_weather = "晴"

def generate_race_data():
    global current_weather
    urrent_weather = random.choice(["晴", "曇", "雨", "雷雨"])
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
        # 倍率にvolatility（荒れ具合）を掛け算する
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

# Discordへ通知を送る関数
def send_discord_notification(message):
    if WEBHOOK_URL == "ここにWebhookのURLを貼ってください":
        print("Webhook URLが設定されていないため、通知をスキップしました。")
        return

    payload = {"content": message}
    headers = {"Content-Type": "application/json", "User-Agent": "RaceBot/1.0"}
    req = urllib.request.Request(WEBHOOK_URL, data=json.dumps(payload).encode(), headers=headers)
    try:
        urllib.request.urlopen(req)
        print("Discordに結果を通知しました！")
    except Exception as e:
        print(f"Discordへの通知に失敗しました: {e}")

# 結果を集計・計算して通知する関数
def process_race_results():
    global current_bets, fp_data
    
    results = [1, 2, 3, 4, 5]
    random.shuffle(results)
    
    r1, r2, r3, r4, r5 = results[0], results[1], results[2], results[3], results[4]
    
    discord_msg = f"🏁 **レース結果発表！** 🏁\n"
    discord_msg += f"🥇着: {r1}番\n🥈着: {r2}番\n🥉着: {r3}番\n4⃣着: {r4}番\n5⃣着: {r5}番\n\n"
    discord_msg += "📊 **プレイヤーのBET結果** 📊\n"

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
        
        if b_type == "単勝":
            if b_cars[0] == r1: is_win = True
        elif b_type == "複勝":
            if b_cars[0] in [r1, r2, r3]: is_win = True
        elif b_type == "馬連":
            if set(b_cars) == {r1, r2}: is_win = True
        elif b_type == "馬単":
            if b_cars == [r1, r2]: is_win = True
        elif b_type == "ワイド":
            if set(b_cars).issubset({r1, r2, r3}): is_win = True
        elif b_type == "三連複":
            if set(b_cars) == {r1, r2, r3}: is_win = True
        elif b_type == "三連単":
            if b_cars == [r1, r2, r3]: is_win = True
            
        payout = int(b_amount * b_odds) if is_win else 0
        
        if payout > 0:
            if user_id in fp_data["users"]:
                fp_data["users"][user_id]["fp"] += payout
                
        mention = f"<@{user_id}>" if user_id != "test_user" else "ゲスト"
        discord_msg += f"{mention} | {b_type} ({b_car_str}) | {b_amount}FP ➔ **{payout}FP**\n"

    if not current_bets:
        discord_msg += "今回のレースは誰もBETしませんでした。\n"

    save_fp_data(fp_data)
    send_discord_notification(discord_msg)
    current_bets = []

async def handler(websocket):
    global fp_data
    connected_clients.add(websocket)
    try:
        async for message in websocket:
            data = json.loads(message)
            
            if data["action"] == "login":
                user_id = data["user_id"]
                user_fp = fp_data["users"].get(user_id, {}).get("fp", 0) if user_id in fp_data["users"] else 0
                
                video_time = 35 - race_timer if race_state == "racing" else 0

                response = {
                    "type": "sync",
                    "state": race_state,
                    "timer": f"{race_timer // 60:02d}:{race_timer % 60:02d}",
                    "fp": user_fp,
                    "cars_data": current_cars_data,
                    "video_time": video_time
                }
                await websocket.send(json.dumps(response))

            elif data["action"] == "bet":
                user_id = data["user_id"]
                if race_state != "betting":
                    await websocket.send(json.dumps({"type": "error", "message": "現在はベット時間外です！"}))
                    continue
                
                bet_info = data["bet_info"]
                bet_amount = int(bet_info['amount'])
                
                current_fp = fp_data["users"].get(user_id, {}).get("fp", 0) if user_id in fp_data["users"] else 0
                if current_fp < bet_amount:
                    print(f"[{user_id}] 残高不足です")
                    continue
                
                fp_data["users"][user_id]["fp"] -= bet_amount
                save_fp_data(fp_data)
                
                current_bets.append({
                    "user_id": user_id,
                    "bet_info": bet_info
                })
                print(f"[{user_id}] が {bet_info['type']} ({bet_info['car']}) に {bet_amount}FP 賭けました")
                
                response = {"type": "sync", "fp": fp_data["users"][user_id]["fp"]}
                await websocket.send(json.dumps(response))
                elif data["action"] == "undo":
                user_id = data["user_id"]
                if race_state != "betting":
                    continue
                
                # ユーザーの最新のベット履歴を探して削除し、FPを返還する
                for i in range(len(current_bets) - 1, -1, -1):
                    if current_bets[i]["user_id"] == user_id:
                        refund_amount = int(current_bets[i]["bet_info"]["amount"])
                        
                        # FPを返金して保存
                        fp_data["users"][user_id]["fp"] += refund_amount
                        save_fp_data(fp_data)
                        
                        # ベット履歴から削除
                        del current_bets[i]
                        print(f"[{user_id}] が直前のベット({refund_amount}FP)を取り消しました")
                        
                        # クライアントに返金後のFPを同期
                        response = {"type": "sync", "fp": fp_data["users"][user_id]["fp"]}
                        await websocket.send(json.dumps(response))
                        break
                
    finally:
        connected_clients.remove(websocket)

async def timer_loop():
    global race_timer, race_state, current_cars_data
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
                current_cars_data = generate_race_data()
                
        if connected_clients:
            time_str = f"{race_timer // 60:02d}:{race_timer % 60:02d}"
            video_time = 35 - race_timer if race_state == "racing" else 0
            
            message = json.dumps({
                "type": "sync", 
                "state": race_state, 
                "timer": time_str,
                "video_time": video_time,
                "weather": current_weather
            })
            websockets.broadcast(connected_clients, message)
            
        await asyncio.sleep(1)

# ▼ Renderからの生存確認（ヘルスチェック）に「OK」と返事をする機能
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
    # process_request を追加してヘルスチェックに対応
    server = await websockets.serve(handler, "0.0.0.0", port, process_request=health_check)
    print(f"WebSocketサーバー起動！ ポート:{port}")
    await asyncio.gather(server.wait_closed(), timer_loop())

if __name__ == "__main__":
    asyncio.run(main())