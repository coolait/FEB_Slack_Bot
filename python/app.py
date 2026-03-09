"""
Slack Purchase Logger — Python/Flask backend.
One route: POST /api/purchase (Slack slash command), GET / (health).
"""
import os
import hmac
import hashlib
import time
from datetime import date
from typing import Optional, List
from flask import Flask, request, jsonify

# Google Sheets
from google.oauth2 import service_account
from googleapiclient.discovery import build

app = Flask(__name__)

# --- Config from env ---
def get_sheets_service():
    email = os.environ.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    key_raw = os.environ.get('GOOGLE_PRIVATE_KEY')
    if not email or not key_raw:
        raise RuntimeError('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY')
    key = key_raw.replace('\\n', '\n')
    creds = service_account.Credentials.from_service_account_info({
        'type': 'service_account',
        'client_email': email,
        'private_key': key,
        'token_uri': 'https://oauth2.googleapis.com/token',
    }, scopes=['https://www.googleapis.com/auth/spreadsheets'])
    return build('sheets', 'v4', credentials=creds)


def append_row(values):
    sid = os.environ.get('SPREADSHEET_ID')
    sheet_name = os.environ.get('SHEET_NAME', 'slack_budget')
    if not sid:
        raise RuntimeError('SPREADSHEET_ID not set')
    sheets = get_sheets_service()
    sheets.spreadsheets().values().append(
        spreadsheetId=sid,
        range=f'{sheet_name}!A:E',
        valueInputOption='USER_ENTERED',
        body={'values': [values]},
    ).execute()


# --- Slack verification ---
def verify_slack_request(raw_body: bytes, timestamp: str, signature: str) -> Optional[str]:
    """Returns error message or None if valid."""
    secret = os.environ.get('SLACK_SIGNING_SECRET')
    if not secret:
        return None
    if not timestamp or not signature:
        return 'Missing Slack signature headers'
    try:
        if abs(int(timestamp) - time.time()) > 60 * 5:
            return 'Stale Slack request'
    except Exception:
        return 'Invalid timestamp'
    sig_basestring = f'v0:{timestamp}:{raw_body.decode("utf-8", errors="replace")}'
    expected = 'v0=' + hmac.new(
        secret.encode(), sig_basestring.encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return 'Invalid Slack signature'
    return None


def slack_ephemeral(text: str):
    return {'response_type': 'ephemeral', 'text': text}


# --- Handlers ---
VALIDATION_MSG = slack_ephemeral(
    'Error: please provide exactly 3 comma-separated values like:\n  /purchase Subteam, Reason, $Amount'
)


def parse_text(text: Optional[str]) -> Optional[List[str]]:
    if not text:
        return None
    parts = [p.strip() for p in text.split(',') if p.strip()]
    return parts if len(parts) == 3 else None


@app.route('/')
def index():
    return 'Slack purchase logger is running. Use POST /api/purchase for the slash command.', 200


@app.route('/api/purchase', methods=['GET', 'POST'])
def purchase():
    if request.method == 'GET':
        return 'Slack purchase logger is running. Use POST from Slack slash command.', 200

    raw_body = request.get_data()
    timestamp = request.headers.get('X-Slack-Request-Timestamp')
    signature = request.headers.get('X-Slack-Signature')
    err = verify_slack_request(raw_body, timestamp or '', signature or '')
    if err:
        return jsonify({'error': err}), 401

    # Parse form body (Slack sends application/x-www-form-urlencoded); use raw body so stream wasn't consumed
    from urllib.parse import parse_qs
    try:
        form = parse_qs(raw_body.decode('utf-8'), keep_blank_values=True)
    except Exception:
        form = {}
    text = (form.get('text') or [None])[0]
    user_name = (form.get('user_name') or ['unknown'])[0] or 'unknown'
    parsed = parse_text(text)
    if not parsed:
        return jsonify(VALIDATION_MSG), 200

    subteam, reason, amount = parsed
    today = f'{date.today().month}/{date.today().day}/{date.today().year}'
    row = [today, subteam, reason, amount, user_name]

    # Respond immediately so Slack doesn't timeout
    response = jsonify(slack_ephemeral('Purchase received; logging it to the sheet now.'))
    # Append to sheet (can fail after we send response)
    try:
        append_row(row)
    except Exception as e:
        app.logger.exception('Failed to append to sheet: %s', e)
    return response, 200


# For WSGI servers (gunicorn, mod_wsgi on OCF)
application = app

if __name__ == '__main__':
    from dotenv import load_dotenv
    load_dotenv()
    port = int(os.environ.get('PORT', 3000))
    app.run(host='0.0.0.0', port=port)
