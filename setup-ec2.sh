#!/bin/bash
# ============================================================
#  hello-db — EC2 setup script (Amazon Linux 2023 / Ubuntu)
#  Run as ec2-user or ubuntu with sudo privileges
# ============================================================
set -euo pipefail

echo ""
echo "========================================"
echo " hello-db EC2 Setup"
echo "========================================"

# ── 1. Detect distro and install Node.js + MySQL ────────────
if command -v dnf &>/dev/null; then
  echo "[1/5] Amazon Linux / RHEL detected"
  sudo dnf update -y
  sudo dnf install -y nodejs npm mysql-server
  sudo systemctl enable --now mysqld
else
  echo "[1/5] Debian / Ubuntu detected"
  sudo apt-get update -y
  sudo apt-get install -y nodejs npm mysql-server
  sudo systemctl enable --now mysql
fi

# ── 2. Secure MySQL root password ───────────────────────────
echo ""
echo "[2/5] Setting MySQL root password"
echo "      Enter the password you want to use for the MySQL root account:"
read -rs DB_PASS
echo ""

sudo mysql -u root <<SQL
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${DB_PASS}';
FLUSH PRIVILEGES;
SQL

echo "      MySQL root password set."

# ── 3. Write .env ────────────────────────────────────────────
echo ""
echo "[3/5] Writing .env file"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cat > "${SCRIPT_DIR}/.env" <<ENV
PORT=3000
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=${DB_PASS}
MYSQL_DATABASE=hello_db
ENV

echo "      .env written to ${SCRIPT_DIR}/.env"

# ── 4. Install Node dependencies ─────────────────────────────
echo ""
echo "[4/5] Installing npm packages"
cd "${SCRIPT_DIR}"
npm install

# ── 5. Install PM2 and start app ─────────────────────────────
echo ""
echo "[5/5] Starting app with PM2"
sudo npm install -g pm2
pm2 start server.js --name hello-db
pm2 startup | tail -1 | bash
pm2 save

echo ""
echo "========================================"
echo " Setup complete!"
echo " App is running on port 3000"
echo ""
echo " Open your EC2 Security Group and allow"
echo " inbound TCP on port 3000 (or 80 if you"
echo " set up a reverse proxy with nginx)."
echo ""
echo " Test health: curl http://localhost:3000/api/health"
echo "========================================"
