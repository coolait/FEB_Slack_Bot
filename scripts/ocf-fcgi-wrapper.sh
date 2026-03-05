#!/bin/sh
# OCF FastCGI wrapper: put this in your public_html as e.g. purchase.fcgi
# chmod +x purchase.fcgi
# Then set Slack Request URL to: https://www.ocf.berkeley.edu/~USERNAME/purchase.fcgi
# Replace USERNAME with your OCF username. Ensure ~/myapp has the app (dist/, node_modules/, .env).

exec /usr/bin/env node "$HOME/myapp/dist/fcgi.js"
