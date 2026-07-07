# GitHub Pages Deploy Guide

Use GitHub Pages for the application link in the MRTA form. It is more stable and credible than a temporary drag-and-drop link.

## Recommended Repository Name

```text
bkk-transit-3d
```

Suggested final URL:

```text
https://YOUR_GITHUB_USERNAME.github.io/bkk-transit-3d/
```

## One-Time Setup On GitHub

1. Go to `https://github.com/new`.
2. Repository name: `bkk-transit-3d`.
3. Visibility: Public is easiest for GitHub Pages.
4. Do not add README, .gitignore, or license on GitHub because the local project already has files.
5. Click `Create repository`.

## Push From This Computer

Run these commands from the project folder:

```powershell
cd "C:\Users\LENOVO LEGION5\Desktop\claude work space\Projects\Project_BKKTransit3D"
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/bkk-transit-3d.git
git branch -M main
git push -u origin main
```

If Git asks you to sign in, use GitHub login or a personal access token.

## Enable GitHub Pages

1. Open the repository on GitHub.
2. Go to `Settings`.
3. Go to `Pages`.
4. Under `Build and deployment`, select:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/ (root)`
5. Click `Save`.
6. Wait 1-3 minutes.
7. Open:

```text
https://YOUR_GITHUB_USERNAME.github.io/bkk-transit-3d/
```

## Test Before Submitting

Open the GitHub Pages link and check:

1. Page loads without a blank screen.
2. Close onboarding.
3. Tap `เพิ่มเติม`.
4. Tap `Demo Mode ปุ่มเดียว`.
5. Tap `เริ่มเดโม`.
6. Route card appears.
7. Tap `บริการ → เทียบราคา 20฿ vs ปกติ`.
8. Tap `บริการ → ซ้อมนั่งครั้งแรก`.

## URL For The MRTA Form

Use the GitHub Pages URL:

```text
https://YOUR_GITHUB_USERNAME.github.io/bkk-transit-3d/
```

## If CSS/JS Does Not Update

Hard refresh the browser or wait a minute. The service worker cache is currently:

```text
bkk3d-core-v7
```

If you change files again, bump `sw.js` cache version before pushing.
