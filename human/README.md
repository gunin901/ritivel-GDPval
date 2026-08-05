# GDPval Video Human Evaluation Platform

Blinded pairwise grading for GDPval video tasks.

## Setup (local)

```bash
cd human/ui
cp .env.example .env.local   # set SESSION_SECRET (≥32 chars)
npm install
npm run dev
```

Open http://localhost:3000

On first start the app seeds a bootstrap admin (`admin@gdpval.local` + generated passkey, shown once on Overview). Sample videos are loaded only if `Sample videos/Gold` and `Sample videos/Model` exist at the repo root.

## Auth

Everyone signs in with **email + passkey**.

- Passkeys are generated when you add a user under **Users**
- Toggle **Make admin** so that user can open the admin dashboard

No invite links. No separate admin password.

## Flow

1. Add users (email → auto passkey)
2. Upload gold + model videos under **Videos** (or use R2/S3 — see `DEPLOY.md`)
3. Each grader gets a shuffled queue of model samples vs that task’s gold
4. Graders sign in → walk the queue on the A/B grading page
5. Admins see win rates + Elo on **Metrics**

## Scripts

```bash
npm run lint
npm run typecheck
npm run build
npm run smoke
```

## Deploy

See [DEPLOY.md](./DEPLOY.md) for Render (recommended), Vercel limitations, and video hosting for 40–45 clips.
