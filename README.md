# DeepState - Local-only self-surveillance

The all-day runtime is intended to stay local-only:

- `ScreenPipe` for sensing
- local app SQLite for canonical state
- `Ollama` with `gemma4:31b` for bounded local AI fallback during the day

Morning planning and evening debrief can still use ChatGPT/cloud coaching. Only the continuous daytime loop should depend on local infrastructure.

## ScreenPipe Setup

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

## Ollama Setup

Install and start Ollama locally, then pull the model used for the daytime runtime:

```bash
ollama serve
ollama pull gemma4:31b
```

Verify in another terminal:

```bash
curl http://127.0.0.1:11434/api/tags
ollama run gemma4:31b "Return strict JSON: {\"status\":\"ok\"}"
```

Expected:

- `gemma4:31b` is listed by `/api/tags`
- the model responds locally on `127.0.0.1:11434`

## Local Runtime Checklist

- ScreenPipe is recording locally
- Ollama is running locally
- `gemma4:31b` is available locally
- the app never needs a cloud model for the continuous daytime loop
