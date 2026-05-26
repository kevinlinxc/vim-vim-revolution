# Vim Vim Revolution

I wanted a way to practice using Vim in a time-pressured way, so I vibe-coded this game
where you type out song lyrics sprawled throughout the song.


## Work done

- Core game mostly prompted with Deepseek in Opencode
- Logo made by me in Figma (2D) + Photoshop (Distort + depth)
- Made a script, lyrics_end_time.py to try and figure out the end times of lyrics in songs,
as opposed to just the start times that LRC files have. This is key for determing scoring. Scoring is still a bit off sometimes but it's better than nothing.
- Connected to a supabase DB for the leaderboard
- Deployed with Cloudflare worker/wrangler

## Instructions

### Running
```bash
npm install
npm run dev
```

### Deplyoment

```
npm run deploy
```
