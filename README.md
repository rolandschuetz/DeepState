
# ScreenPipe Setup

```bash
sudo chown -R $(id -u):$(id -g) ~/.npm
alias screenpipe='NPM_CONFIG_CACHE=/tmp/.npm npx --yes screenpipe@latest'
screenpipe doctor
```

Grant `Apple_Terminal`:

- Screen Recording
- Microphone
- Accessibility

Run:

```bash
screenpipe record
```

Verify in a second terminal:

```bash
export SCREENPIPE_API_KEY="$(screenpipe auth token)"
curl http://localhost:3030/health -H "Authorization: Bearer $SCREENPIPE_API_KEY"
curl "http://localhost:3030/search?limit=5" -H "Authorization: Bearer $SCREENPIPE_API_KEY"
```

Expected:

- `/health` returns `"status":"healthy"`
- `/search` returns OCR/frame data
