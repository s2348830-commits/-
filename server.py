import asyncio
import websockets
import json
import random
import urllib.request

# ▼ ここにDiscordのWebhook URLを貼り付けてください！
WEBHOOK_URL = "https://discord.com/api/webhooks/1483775041148817480/6k7PEYZjNfO9Xik7HWroEzW0BLTP3jp3zzot7kJe00ZpdUkQPGipThBxtsY2gkseqYsK"

# JSONデータの読み書き（パスは環境に合わせて修正してください）
FP_DATA_PATH = r"C:\Users\81906\Desktop\OmikujiBot\fp_data.json"

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

def generate_race_data():
    cars = []
    popularities = [1, 2, 3, 4, 5]
    random.shuffle(popularities)
    
    names = ["レッドフェラーリ", "ブルーポルシェ", "イエローマクラーレン", "グリーンスープラ", "シルバーGTR"]
    colors = ["white", "black", "red", "blue", "yellow"]
    texts = ["black", "white", "white", "white", "black"]
    
    for i in range(5):
        pop = popularities[i]
        if pop == 1: win_odds = round(random.uniform(1.8, 4.8), 1)
        elif pop == 2: win_odds = round(random.uniform(3.5, 7.5), 1)
        elif pop == 3: win_odds = round(random.uniform(5.5, 11.0), 1)
        elif pop == 4: win_odds = round(random.uniform(8.0, 16.0), 1)
        else: win_odds = round(random.uniform(10.0, 25.0), 1)
        
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
        print("送信予定だったメッセージ:\n", message)
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
    
    # 1. 順位をランダムに決定 (1〜5の数字をシャッフル)
    results = [1, 2, 3, 4, 5]
    random.shuffle(results)
    
    r1, r2, r3, r4, r5 = results[0], results[1], results[2], results[3], results[4]
    
    discord_msg = f"🏁 **レース結果発表！** 🏁\n"
    discord_msg += f"🥇1着: {r1}番\n🥈2着: {r2}番\n🥉3着: {r3}番\n4着: {r4}番\n5着: {r5}番\n\n"
    discord_msg += "📊 **プレイヤーのBET結果** 📊\n"

    # 2. 各ベットの当たり判定とFP計算
    for bet in current_bets:
        user_id = bet["user_id"]
        b_type = bet["bet_info"]["type"]
        b_car_str = str(bet["bet_info"]["car"]) # "1" や "1-2"
        b_amount = int(bet["bet_info"]["amount"])
        
        # 複勝の「1.0~1.1」のような表記対策（最低倍率を採用）
        raw_odds = bet["bet_info"]["odds"]
        if isinstance(raw_odds, str) and "~" in raw_odds:
            b_odds = float(raw_odds.split("~")[0])
        else:
            b_odds = float(raw_odds)

        # 文字列を数字のリストに変換 ("1-3" -> [1, 3])
        b_cars = [int(c) for c in b_car_str.split('-')]
        
        is_win = False
        
        # 判定ロジック
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
            
        # FPの計算
        payout = int(b_amount * b_odds) if is_win else 0
        
        # JSONデータの更新 (勝利時のみFPを足す。賭けた時の消費はベット受付時に処理済み)
        if payout > 0:
            if user_id in fp_data["users"]:
                fp_data["users"][user_id]["fp"] += payout
                
        # メッセージの追加
        mention = f"<@{user_id}>" if user_id != "test_user" else "ゲスト"
        discord_msg += f"{mention} | {b_type} ({b_car_str}) | {b_amount}FP ➔ **{payout}FP**\n"

    if not current_bets:
        discord_msg += "今回のレースは誰もBETしませんでした。\n"

    # データ保存と通知
    save_fp_data(fp_data)
    send_discord_notification(discord_msg)
    
    # ベット履歴をリセット
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
                
                # FPが足りるか確認して減らす
                current_fp = fp_data["users"].get(user_id, {}).get("fp", 0) if user_id in fp_data["users"] else 0
                if current_fp < bet_amount:
                    # 本来はエラーを返す処理ですが、一旦はログ出力のみ
                    print(f"[{user_id}] 残高不足です")
                    continue
                
                # FPを消費して保存
                fp_data["users"][user_id]["fp"] -= bet_amount
                save_fp_data(fp_data)
                
                # ベット履歴に追加
                current_bets.append({
                    "user_id": user_id,
                    "bet_info": bet_info
                })
                print(f"[{user_id}] が {bet_info['type']} ({bet_info['car']}) に {bet_amount}FP 賭けました")
                
                # 更新したFPをクライアントに返す
                response = {"type": "sync", "fp": fp_data["users"][user_id]["fp"]}
                await websocket.send(json.dumps(response))
                
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
                race_timer = 35 # レース動画再生時間 (35秒)
                
            elif race_state == "racing":
                print("レース終了！結果発表＆FP配布！")
                race_state = "result"
                race_timer = 10 # 結果表示フェーズ (10秒)
                process_race_results() # ▼ ここで判定・計算・Discord通知を実行！
                
            elif race_state == "result":
                print("次のレースの準備をします")
                race_state = "betting"
                race_timer = 600 # ベット時間に戻る (10分)
                current_cars_data = generate_race_data()
                
        if connected_clients:
            time_str = f"{race_timer // 60:02d}:{race_timer % 60:02d}"
            video_time = 35 - race_timer if race_state == "racing" else 0
            
            message = json.dumps({
                "type": "sync", 
                "state": race_state, 
                "timer": time_str,
                "video_time": video_time
            })
            websockets.broadcast(connected_clients, message)
            
        await asyncio.sleep(1)

async def main():
    server = await websockets.serve(handler, "localhost", 8765)
    print("WebSocketサーバー起動！")
    await asyncio.gather(server.wait_closed(), timer_loop())

if __name__ == "__main__":
    asyncio.run(main())