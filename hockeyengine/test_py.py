import asyncio, json
from app import process_game_plays, get_http_client

async def run():
    client = get_http_client()
    res = await client.get("https://api-web.nhle.com/v1/gamecenter/2023020001/play-by-play")
    data = res.json()
    plays = data.get("plays", [])
    shots = process_game_plays(plays)
    print(json.dumps([s for s in shots if s.get('team_id') == 14][:2]))

asyncio.run(run())
