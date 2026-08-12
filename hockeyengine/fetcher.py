import requests
import pandas as pd
import time
import argparse

def time_to_seconds(time_str):
    if not time_str:
        return 0
    parts = time_str.split(':')
    if len(parts) == 2:
        return int(parts[0]) * 60 + int(parts[1])
    return 0

def fetch_game_shots(game_id):
    url = f"https://api-web.nhle.com/v1/gamecenter/{game_id}/play-by-play"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    
    try:
        response = requests.get(url, headers=headers)
        if response.status_code != 200:
            return []
            
        plays = response.json().get('plays', [])
        shot_events = []
        
        # State variables to track the previous event context
        last_event_time = -999
        last_event_period = -1
        last_event_team = None
        last_event_type = None
        last_event_x = 0
        last_event_y = 0 
        
        for play in plays:
            event_type = play.get('typeDescKey')
            period = play.get('periodDescriptor', {}).get('number')
            time_str = play.get('timeInPeriod')
            current_time_sec = time_to_seconds(time_str)
            details = play.get('details', {})
            current_team = details.get('eventOwnerTeamId')
            
            # Calculate time since the last event
            time_since_last_event = 999
            if period == last_event_period:
                time_since_last_event = current_time_sec - last_event_time

            # We process shots here
            if event_type in ['shot-on-goal', 'missed-shot', 'goal']:
                current_x = details.get('xCoord')
                current_y = details.get('yCoord')
                
                if current_x is not None and current_y is not None:
                    
                    # 1. Enhanced Rebound Logic
                    is_rebound = 1 if (
                        time_since_last_event <= 3 and 
                        current_team == last_event_team and
                        last_event_type in ['shot-on-goal', 'missed-shot']
                    ) else 0
                    
                    # 2. Rush Logic
                    is_rush = 1 if (time_since_last_event <= 5 and is_rebound == 0) else 0

                    # 3. Royal Road Proxy Logic
                    crossed_royal_road = 0
                    if last_event_y != 0 and current_y != 0:
                        # Did the puck cross the horizontal centerline (Y=0)?
                        if (last_event_y * current_y) < 0:
                            # Did it happen within 3 seconds?
                            if time_since_last_event <= 3:
                                # Was both the play and shot in the attacking zones? (Absolute X > 25)
                                if abs(current_x) > 25 and abs(last_event_x) > 25:
                                    crossed_royal_road = 1

                    # Append ONE unified row per shot event
                    shot_events.append({
                        'game_id': game_id,
                        'period': period,
                        'time_in_period': time_str,
                        'event_type': event_type,
                        'shot_type': details.get('shotType', 'unknown'),
                        'x': current_x,
                        'y': current_y,
                        'is_goal': 1 if event_type == 'goal' else 0,
                        'is_rebound': is_rebound,
                        'is_rush': is_rush,
                        'crossed_royal_road': crossed_royal_road,
                        'situation_code': play.get('situationCode', '1551')
                    })

            # CRITICAL: Update state variables for EVERY event that has coordinates
            # This ensures we catch the coordinates of faceoffs/takeaways/hits
            last_event_time = current_time_sec
            last_event_period = period
            last_event_team = current_team
            last_event_type = event_type
            
            if details.get('yCoord') is not None and details.get('xCoord') is not None:
                last_event_x = details.get('xCoord')
                last_event_y = details.get('yCoord')
                    
        return shot_events
        
    except Exception as e:
        print(f"Error fetching game {game_id}: {e}")
        return []

def download_season(start_year):
    print(f"Starting download for the {start_year}-{start_year+1} season...")
    all_season_shots = []
    
    # 1312 games in a standard modern NHL season
    for game_num in range(1, 1313):
        game_id = f"{start_year}02{game_num:04d}"
        
        if game_num % 50 == 0:
            print(f"Processing game {game_num} of 1312...")
            
        shots = fetch_game_shots(game_id)
        all_season_shots.extend(shots)
        time.sleep(0.5) 
        
    df = pd.DataFrame(all_season_shots)
    filename = f"nhl_shots_{start_year}_{start_year+1}.csv"
    df.to_csv(filename, index=False)
    
    print(f"\nDownload complete! Saved {len(df)} total shots to {filename}")
    return df

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download NHL shot data.")
    parser.add_argument('-y', '--year', type=int, default=2023)
    args = parser.parse_args()
    download_season(args.year)