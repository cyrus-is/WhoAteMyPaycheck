Ship a build via CI. This is a static site deployment.

Usage:
  /ship

## Step 1: Validate state
```bash
git status --porcelain
git fetch origin main
git log HEAD..origin/main --oneline
```
If uncommitted changes or behind origin, stop and warn.

## Step 2: Build
```bash
npm run build
```
If the build fails, stop and show errors.

## Step 3: Deploy
```bash
# TBD — configure deployment target (S3/CloudFront, Vercel, or Cloudflare Pages)
# For now, just confirm the build succeeds and output is in dist/
```

## Step 4: Verify
```bash
ls -la dist/
```

## After shipping

Print:
- What was shipped and where
- Link to CI/Actions for monitoring
- Reminder: deployment target not yet configured — set up hosting first
