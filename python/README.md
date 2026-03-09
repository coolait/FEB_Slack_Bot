# Slack Purchase Logger — Python backend

Single Flask app: receives Slack slash command POST, verifies signature, appends a row (Date, Subteam, Reason, $Amount, User) to a Google Sheet.

## Setup

1. **Python 3.9+** and a virtualenv (recommended):

   ```bash
   python3 -m venv venv
   source venv/bin/activate   # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Environment variables** — copy `.env.example` to `.env` and fill in:

   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` — from your Google service account JSON
   - `GOOGLE_PRIVATE_KEY` — the `private_key` value (keep `\n` as literal backslash-n if in a file)
   - `SPREADSHEET_ID` — from the sheet URL
   - `SHEET_NAME` — tab name (default `slack_budget`)
   - `SLACK_SIGNING_SECRET` — from Slack app → Basic Information
   - `PORT` — optional (default 3000)

3. **Run locally**

   ```bash
   python app.py
   # or: flask --app app run
   ```

   Then in Slack, point the slash command Request URL to `http://your-ip:3000/api/purchase` (use ngrok for HTTPS if needed).

## Deploy on OCF (Berkeley)

OCF supports Flask. Use **app hosting** (apphost.ocf.berkeley.edu) if you have it:

1. SSH to **apphost.ocf.berkeley.edu** (not tsunami).
2. Put the app in `~/myapp` (e.g. copy the `python/` folder contents to `~/myapp`).
3. Create a virtualenv and install deps:

   ```bash
   cd ~/myapp
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

4. Create `~/myapp/.env` with the same variables as above.
5. Run script: create `~/myapp/run`:

   ```bash
   #!/bin/sh
   cd ~/myapp
   . venv/bin/activate
   export PORT="/srv/apps/$(whoami)/$(whoami).sock"
   exec gunicorn -b "unix:${PORT}" --chdir ~/myapp app:application
   ```

   If OCF doesn’t use a socket, use a port instead, e.g. `export PORT=3000` and `-b 0.0.0.0:${PORT}`. Check OCF’s Flask docs for the exact bind.

6. Make it executable: `chmod +x ~/myapp/run`.
7. Set up systemd (see main README “Option 1: OCF”) so the app starts on boot.
8. In Slack, set Request URL to `https://your-ocf-vhost/api/purchase`.

If you only have **standard web hosting** (no app host), ask OCF (help@ocf.berkeley.edu) how they run Flask or Python apps from `public_html`. The Python app is one file (`app.py`) and can be run with gunicorn or their recommended method.

## Deploy elsewhere (Render, Railway, etc.)

- **Build**: no build step; use Python runtime.
- **Start**: `gunicorn app:application` or `python app.py` (set `PORT` in env).
- Add the same env vars in the dashboard.

## Sheet columns

| A (Date) | B (Subteam) | C (Reason) | D ($Amount) | E (User) |
|----------|-------------|------------|-------------|----------|

Header row is not created automatically; add it in the sheet if needed.
