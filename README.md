---

# Forbidden Word

A party word game to play with friends.
Your goal is to trick other players into saying **their own forbidden word**—without them knowing what that word is.

---

## Installation & Running Locally

You need **Node.js 18+** (LTS is recommended).

```bash
npm install
npm run dev
```

Then open your browser at:
`http://localhost:3000`

### Change the Port (Optional)

Set the `PORT` variable before running:

```bash
set PORT=4000
npm run dev
```

---

## Self-Hosting / Using the Code

1. Install and run the project using the steps above
2. Share the link and start creating game rooms instantly
3. For production use on a server, run:

```bash
npm start
```

---

## CI/CD (GitHub → Railway)

The workflow automatically deploys when you push to `main` or `master`.

### Requirements before deploying:

1. Create a GitHub Secret named `RAILWAY_TOKEN`
2. Run `railway link` at the project root to generate `railway.json`
3. Commit `railway.json` to the repository so CI knows which Railway project to deploy to

---


