# Slack Purchase Logger (/purchase)

Logs `/purchase` (or `/reimburse`) slash command submissions into a Google Sheet: **Date, Subteam, Reason, $Amount, User**.

Two backends:

- **Python (Flask)** — single-file app in `python/`. **Use this for OCF** (Berkeley); see `python/README.md`.
- **Node.js (Express)** — in `src/`. Use for Render, Railway, or local dev.

## What it does
- Exposes `POST /api/purchase` for Slack slash command payloads.
- Validates that the `text` parameter has exactly three comma-separated fields: `item, category, amount`.
- Appends a row to your sheet (`slack_budget` by default).
- Responds ephemerally in Slack with success or validation errors.

## Prerequisites
- Node.js 18+
- A Google Cloud project with Sheets API enabled
- A Google Service Account with access to the target sheet
- A Slack app with a Slash Command

## Setup: Google Cloud & Sheets (detailed)
1) Enable API  
   - Visit https://console.cloud.google.com/apis/library and select your project (or create one).  
   - Search for **Google Sheets API** → Enable.

2) Create Service Account  
   - Go to **IAM & Admin → Service Accounts** → **Create Service Account**.  
   - Name it (e.g., `slack-purchase-sa`). Role is optional for creation; you can skip assigning a role here because access is granted by sharing the Sheet.  
   - After creation, open the service account → **Keys** tab → **Add Key → Create new key → JSON**. This downloads a JSON file.

3) Extract credentials for `.env`  
   - From the downloaded JSON, copy `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`.  
   - Copy `private_key` → `GOOGLE_PRIVATE_KEY`. If you put this in `.env`, wrap it in quotes and keep escaped `\n` newlines (the code will fix them).

4) Prepare your Google Sheet  
   - Create a Sheet (or pick an existing one).  
   - The **Spreadsheet ID** is the string between `/d/` and `/edit` in the URL. Put that into `SPREADSHEET_ID`.  
   - The tab name you want to write to should go into `SHEET_NAME` (default: `slack_budget`). It must already exist.

5) Share the Sheet with the service account  
   - In the Sheet, click **Share**, paste the `client_email`, and grant **Editor** access. This is required for appending rows.

6) Optional: restrict key file  
   - Since you are using environment variables instead of a file, ensure the downloaded JSON is kept outside the repo (or add it to `.gitignore`, which is already set).

## Setup: Slack App (detailed)
1) Create the app  
   - Go to https://api.slack.com/apps → **Create New App** → **From scratch**.  
   - Pick a name (e.g., `Purchase Logger`) and select your workspace.

2) Get credentials  
   - In the app, open **Basic Information → App Credentials**.  
   - Copy the **Signing Secret** → set `SLACK_SIGNING_SECRET` in `.env`.

3) Bot token (install the app)  
   - Go to **OAuth & Permissions**.  
   - Scroll to **Scopes** → **Bot Token Scopes**. Add `commands` (sufficient for slash commands).  
   - Click **Install to Workspace** (or **Reinstall**).  
   - After installation, copy the **Bot User OAuth Token** (starts with `xoxb-`) → set `SLACK_BOT_TOKEN` in `.env`.

4) Create the Slash Command  
   - Go to **Slash Commands** → **Create New Command**.  
   - Command: `/purchase`  
   - Request URL: your server URL ending with `/api/purchase` (e.g., `https://your-host.com/api/purchase` or your local tunnel URL).  
   - Short description: “Log a purchase to Google Sheets”  
   - Usage hint: “item, category, amount”  
   - Method: POST (default)  
   - Save.

5) Local tunneling for testing (optional but useful)  
   - Use a tunnel (e.g., `ngrok http 3000`) and paste the public HTTPS URL + `/api/purchase` into the command’s Request URL.  
   - Update the command URL whenever the tunnel URL changes.

6) Verify it works  
   - In Slack, run `/purchase test item, food, $12`.  
   - Expect an ephemeral confirmation and a new row in Sheets. If you see a signature error, re-check `SLACK_SIGNING_SECRET` and that your server captures raw body (handled in `src/index.ts`).

## Environment variables
Create `.env` (never commit it):
```
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-sa@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nABC...\n-----END PRIVATE KEY-----\n"
SPREADSHEET_ID=your_sheet_id
SHEET_NAME=slack_budget
SLACK_SIGNING_SECRET=your_slack_signing_secret
SLACK_BOT_TOKEN=xoxb-...
PORT=3000
```
- Keep the private key surrounded by quotes. Escaped newlines (`\n`) are handled automatically.

## Install & run locally
```bash
npm install
npm run dev
# server on http://localhost:3000
```

## Test locally with curl (simulating Slack)
Run the server, then:
```bash
curl -X POST http://localhost:3000/api/purchase \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data 'token=dummy&team_id=T123&team_domain=example&channel_id=C123&channel_name=general&user_id=U123&user_name=alice&command=/purchase&text=Buying hard wood, eecs, $15&response_url=https://hooks.slack.com/commands/xxx&trigger_id=123.456'
```
Expected response JSON: `{"response_type":"ephemeral","text":"Purchase logged successfully."}` and the row appended: `["Buying hard wood","eecs","$15"]`.

## Deploy: Hosting Your Application

You need to host your server on the internet so Slack can send POST requests to it.

### OCF (Berkeley) — use the Python backend

Use the **Python/Flask** app in the `python/` folder; OCF supports Flask. See **[python/README.md](python/README.md)** for setup (virtualenv, `.env`, gunicorn, and OCF app hosting or standard hosting).

### Option 1: OCF with Node (app hosting only)

App hosting runs on **apphost.ocf.berkeley.edu** and uses a **Unix socket**; the app is supervised with systemd. You need an OCF group account and app hosting enabled (email `hostmaster@ocf.berkeley.edu` if needed).

1. **SSH to the app server** (not the general login server):
   ```bash
   ssh apphost.ocf.berkeley.edu
   ```

2. **Install Node via nvm** (if not already):
   ```bash
   mkdir -p ~/myapp
   cd ~/myapp
   # Install nvm (see https://github.com/nvm-sh/nvm), then:
   nvm install 18
   nvm alias default 18
   ```

3. **Deploy your code** into `~/myapp` (e.g. clone repo or rsync):
   ```bash
   cd ~/myapp
   git clone https://github.com/YOUR_ORG/FEB_Slack_Bot.git .
   # or rsync from your machine
   npm install
   npm run build
   ```

4. **Environment variables**  
   Create `~/myapp/.env` with the same variables as local (see Environment variables above). Do **not** set `PORT`—the run script sets it to the Unix socket.

5. **Run script**  
   Copy the OCF run script and make it executable:
   ```bash
   cp scripts/ocf-run ~/myapp/run
   chmod +x ~/myapp/run
   ```
   Test it: run `~/myapp/run` in the terminal; your site should be reachable at your OCF vhost. Stop with Ctrl+C when done testing.

6. **Supervise with systemd**  
   Copy the service file and edit placeholders:
   ```bash
   mkdir -p ~/.config/systemd/user
   cp scripts/ocf-myapp.service ~/.config/systemd/user/myapp.service
   nano ~/.config/systemd/user/myapp.service
   ```
   Replace `{YOUR GROUP NAME}`, `{U}` (first letter of username), `{UU}` (first two letters), `{USERNAME}` (full username). Then:
   ```bash
   systemctl --user daemon-reload
   systemctl --user enable myapp
   systemctl --user start myapp
   systemctl --user status myapp
   ```

7. **Update Slack**  
   Set your slash command Request URL to: `https://your-group.studentorg.berkeley.edu/api/purchase` (or your OCF vhost + `/api/purchase`).

8. **Logs**  
   `journalctl --user -u myapp -f` to follow logs; `journalctl --user -u myapp -n 100` for the last 100 lines.

### Option 1b: OCF standard web hosting (FastCGI, no app hosting)

Use this if you have a normal OCF account and **don’t** have app hosting. The app runs as a FastCGI script in your `public_html` (Apache with mod_fcgid). Your URL will be `https://www.ocf.berkeley.edu/~username/...` or `https://ocf.io/username/...`.

1. **SSH to OCF** (normal login server is fine):
   ```bash
   ssh ssh.ocf.berkeley.edu
   ```

2. **Install Node** (e.g. via nvm in your home directory) and clone the project:
   ```bash
   mkdir -p ~/myapp
   cd ~/myapp
   git clone https://github.com/YOUR_USERNAME/FEB_Slack_Bot.git .
   npm install
   npm run build
   ```

3. **Create `~/myapp/.env`** with the same variables as in “Environment variables” above (no `PORT` needed).

4. **Create the FastCGI script in `public_html`** (run `makehttp` first if you don’t have `public_html`):
   ```bash
   cp ~/myapp/scripts/ocf-fcgi-wrapper.sh ~/public_html/purchase.fcgi
   chmod +x ~/public_html/purchase.fcgi
   ```
   If OCF uses a different path for Node, replace `/usr/bin/env node` in the wrapper with the full path (e.g. from `which node` after loading nvm).

5. **Point Slack at your URL**  
   In Slack app → Slash Commands → set **Request URL** to:
   - `https://www.ocf.berkeley.edu/~YOUR_OCF_USERNAME/purchase.fcgi`  
   or  
   - `https://ocf.io/YOUR_OCF_USERNAME/purchase.fcgi`  
   Use your real OCF username.

6. **Test**  
   In Slack, run your slash command (e.g. `/reimburse Test, Reason, $1`). If it fails, check Apache error logs (OCF doc: `var/log/apache2/vhost_error.log` on the server they mention).

Note: OCF’s supported Node version on the web server may be Node 12. If the built app fails, you may need to use the app hosting option (Option 1) instead.

### Option 2: Render (Free tier available)

1. **Create a Render account**
   - Go to https://render.com and sign up (GitHub login works).

2. **Create a new Web Service**
   - Click **New +** → **Web Service**.
   - Connect your GitHub repository (or use **Public Git repository** if you push to GitHub).
   - Select your repository and branch.

3. **Configure the service**
   - **Name**: `slack-purchase-logger` (or your choice).
   - **Region**: Choose closest to you.
   - **Branch**: `main` (or your default branch).
   - **Root Directory**: Leave blank (or `./` if needed).
   - **Environment**: `Node`.
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: Free tier is fine for testing.

4. **Set environment variables**
   - In the service dashboard, go to **Environment** tab.
   - Click **Add Environment Variable** for each:
     - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = (your service account email)
     - `GOOGLE_PRIVATE_KEY` = (your private key, keep the quotes and `\n`)
     - `SPREADSHEET_ID` = (your sheet ID)
     - `SHEET_NAME` = `slack_budget`
     - `SLACK_SIGNING_SECRET` = (your Slack signing secret)
     - `SLACK_BOT_TOKEN` = (your bot token)
     - `PORT` = `10000` (Render sets this automatically, but you can set it explicitly)

5. **Deploy**
   - Click **Create Web Service**.
   - Render will build and deploy. Wait for "Live" status (usually 2-5 minutes).
   - Your URL will be: `https://your-service-name.onrender.com`

6. **Update Slack**
   - Copy your Render URL: `https://your-service-name.onrender.com/api/purchase`
   - In Slack app settings → **Slash Commands** → Edit `/purchase` → Update **Request URL** to your Render URL.
   - Save.

### Option 3: Railway

1. **Create a Railway account**
   - Go to https://railway.app and sign up (GitHub login works).

2. **Create a new project**
   - Click **New Project** → **Deploy from GitHub repo** (or **Empty Project** if you want to connect later).
   - Select your repository.

3. **Configure the service**
   - Railway auto-detects Node.js. If not, add a `nixpacks.toml` or set:
     - **Build Command**: `npm install && npm run build`
     - **Start Command**: `npm start`

4. **Set environment variables**
   - Click on your service → **Variables** tab.
   - Add all the same variables as Render (see above).
   - For `PORT`, Railway sets it automatically via `$PORT`, but you can set it explicitly.

5. **Deploy**
   - Railway auto-deploys on push. Or click **Deploy** manually.
   - Wait for deployment to complete.
   - Your URL will be shown in the service dashboard (e.g., `https://your-app.up.railway.app`).

6. **Update Slack**
   - Copy your Railway URL: `https://your-app.up.railway.app/api/purchase`
   - Update the Slack slash command Request URL.

### Option 4: Heroku

1. **Install Heroku CLI** (https://devcenter.heroku.com/articles/heroku-cli)

2. **Login and create app**
   ```bash
   heroku login
   heroku create your-app-name
   ```

3. **Set environment variables**
   ```bash
   heroku config:set GOOGLE_SERVICE_ACCOUNT_EMAIL="your-email"
   heroku config:set GOOGLE_PRIVATE_KEY="your-key"
   heroku config:set SPREADSHEET_ID="your-id"
   heroku config:set SHEET_NAME="slack_budget"
   heroku config:set SLACK_SIGNING_SECRET="your-secret"
   heroku config:set SLACK_BOT_TOKEN="your-token"
   heroku config:set PORT=5000
   ```

4. **Deploy**
   ```bash
   git push heroku main
   ```

5. **Get your URL**
   - Your app URL: `https://your-app-name.herokuapp.com`
   - Update Slack command URL to: `https://your-app-name.herokuapp.com/api/purchase`

### Option 5: Fly.io

1. **Install Fly CLI** (https://fly.io/docs/getting-started/installing-flyctl/)

2. **Login and create app**
   ```bash
   fly auth login
   fly launch
   ```

3. **Set secrets (environment variables)**
   ```bash
   fly secrets set GOOGLE_SERVICE_ACCOUNT_EMAIL="your-email"
   fly secrets set GOOGLE_PRIVATE_KEY="your-key"
   # ... (set all other variables)
   ```

4. **Deploy**
   ```bash
   fly deploy
   ```

5. **Get your URL**
   - Your app URL: `https://your-app-name.fly.dev`
   - Update Slack command URL accordingly.

### Important Notes for All Platforms

- **HTTPS required**: Slack requires HTTPS for production. All platforms above provide this automatically.
- **Port handling**: Most platforms set `PORT` automatically. Your code reads `process.env.PORT`, so it should work. If not, check platform docs for the expected env var name.
- **Private key formatting**: When setting `GOOGLE_PRIVATE_KEY` in platform dashboards, keep the quotes and escaped `\n` characters. Some platforms may require you to paste it as a single line with `\n` literals (which your code handles).
- **Update Slack after deploy**: Always update your Slack slash command Request URL to point to your deployed endpoint.
- **Testing**: After deployment, test with `/purchase test, test, $1` in Slack to verify it works.

## Slack validation format
- Correct input: `/purchase item, category, amount`
- Validation error text returned ephemerally:
  ```
  Error: please provide exactly 3 comma-separated values like:
    /purchase item, category, amount
  ```

## Notes
- Exactly two commas are required; extra commas cause a validation error.
- Google Sheets append uses `USER_ENTERED` to preserve number/string formatting.
- All major actions/errors are logged to stdout.

