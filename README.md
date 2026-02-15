# Rubber Ducky — Installation & .env

A small Express app for managing `rawValue`, `mainContent`, options and file uploads.

---

## Requirements

- Node.js (recommended: **20+**) and npm
- MySQL (or compatible) server

---

## Quick install

1. Open a terminal and change into the project folder:

   ```bash
   cd "C:/..."
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file (copy the example below):

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your database credentials and a strong `SESSION_SECRET`.

4. Create the database and `users` table (example):

   ```sql
   CREATE DATABASE IF NOT EXISTS RubberDucky;
   USE RubberDucky;

   CREATE TABLE IF NOT EXISTS users (
     id INT AUTO_INCREMENT PRIMARY KEY,
     username VARCHAR(100) NOT NULL UNIQUE,
     password_hash VARCHAR(255) NOT NULL,
     role ENUM('user','moderator','admin') NOT NULL DEFAULT 'user'
   );
   ```

5. Add an admin user (generate a bcrypt hash first):

   - Generate a hash from Node (recommended):
     ```bash
     node -e "console.log(require('bcrypt').hashSync('your-password-here', 10))"
     ```

   - Insert into the DB (replace `<BCRYPT_HASH>`):
     ```sql
     INSERT INTO users (username, password_hash, role)
     VALUES ('admin', '<BCRYPT_HASH>', 'admin');
     ```

   _Tip: there is a helper file `.bcrypt.js` that shows an example insert/_

6. Start the app:

   ```bash
   npm start
   # or
   node server.js
   ```

7. Open in browser: `http://localhost:3001`

---

## .env variables (required)

- `DB_HOST` — database server hostname or IP (e.g. `127.0.0.1`)
- `DB_PORT` — database port (default `3306`)
- `DB_USER` — DB username
- `DB_PASS` — DB password (keep secret)
- `DB_NAME` — database name (e.g. `RubberDucky`)
- `SESSION_SECRET` — random secret for session management (keep secret)

Example (.env.example provided):

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=your_db_user
DB_PASS=your_db_password
DB_NAME=RubberDucky
SESSION_SECRET=a-very-strong-secret
```

> ⚠️ Do NOT commit your real `.env` to source control. Keep `SESSION_SECRET` and `DB_PASS` private.

---

## Docker

Build and run with Docker (reads `.env` via `--env-file`):

```bash
docker build -t rubber-ducky .
docker run --env-file .env -p 3001:3001 rubber-ducky
```

### Docker Compose (included)

This repository includes `docker-compose.yml`. Start the app with:

```bash
docker compose up --build
```

`docker-compose.yml`:

```yaml
version: "3.8"

services:
  app:
    build: .
    container_name: rubber_ducky_app
    ports:
      - "3001:3001"
    env_file:
      - .env
    volumes:
      - ./files:/app/files
    networks:
      - mysql-network

networks:
  mysql-network:
    external: true
```

> Note: `mysql-network` is expected to be an external Docker network. Create it if missing:
>
> ```bash
>docker network create mysql-network
>```

---

## Troubleshooting

- Database connection errors: verify `.env` values, network access and user privileges.
- Port conflict: default port is `3001` (change in `server.js` if needed).
- Password/hash issues: generate bcrypt hash using Node (see step above).

---

## Useful files

- `server.js` — main app
- `database.js` — MySQL pool (uses `.env`)
- `Dockerfile` — container image

---


