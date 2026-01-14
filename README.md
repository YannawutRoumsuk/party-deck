# Forbiden-Word
The "Forbidden Word" (as seen on the Thepleela channel) is a social party game where the goal is to trick your opponents into saying a specific "forbidden word" that they don't know they have.

## CI/CD (GitHub -> Railway)
This repo includes a GitHub Actions workflow that deploys on push to `main` or `master`.

Set these GitHub Secrets before the first deploy:
- `RAILWAY_TOKEN`
- `RAILWAY_PROJECT_ID`
- `RAILWAY_SERVICE_ID`
