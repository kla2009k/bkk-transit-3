# Deploy To Phone Guide

## Current Local Mobile URL

This machine is already serving the project on:

```text
http://10.69.174.60:8321/
```

Use this when:

- The laptop and phone are on the same Wi-Fi.
- You need a fast test before judging.
- You do not need full HTTPS/PWA install behavior.

## Start Again Later

Double-click or run:

```powershell
.\START_MOBILE_SERVER.ps1
```

It will print the phone URL. Keep the PowerShell window open while using the app.

## Android Test Steps

1. Connect the phone to the same Wi-Fi as the laptop.
2. Open Chrome.
3. Go to `http://10.69.174.60:8321/`.
4. Close onboarding if shown.
5. Tap `เพิ่มเติม → Demo Mode ปุ่มเดียว → เริ่มเดโม`.
6. For a home-screen shortcut: Chrome menu → `Add to Home screen`.

Note: full PWA install/offline service worker usually requires HTTPS. LAN HTTP is good for testing but not final deployment.

## iPhone Test Steps

1. Connect iPhone to the same Wi-Fi as the laptop.
2. Open Safari.
3. Go to `http://10.69.174.60:8321/`.
4. Tap Share → `Add to Home Screen` if you need a shortcut.

Note: iOS also expects HTTPS for complete PWA behavior. Use GitHub Pages/Netlify/Vercel for final judge-ready install.

## If Phone Cannot Open The URL

Check these in order:

1. Laptop and phone must be on the same Wi-Fi network.
2. Disable VPN/hotspot isolation if the router blocks device-to-device traffic.
3. Allow Python through Windows Defender Firewall when prompted.
4. Try opening the laptop IP from the laptop first:

```powershell
Invoke-WebRequest http://10.69.174.60:8321/
```

5. If the IP changed, run `ipconfig` and use the current IPv4 address under `Wireless LAN adapter Wi-Fi`.
6. If Windows Firewall still blocks the phone, open PowerShell as Administrator and run:

```powershell
New-NetFirewallRule -DisplayName "BKK Transit 3D Mobile Demo" -Direction Inbound -Protocol TCP -LocalPort 8321 -Action Allow -Profile Private
```

To remove the rule later:

```powershell
Remove-NetFirewallRule -DisplayName "BKK Transit 3D Mobile Demo"
```

## Final HTTPS Deployment Options

### Option A: Netlify Drop

Fastest no-code option:

1. Open `https://app.netlify.com/drop`.
2. Drag `mrta_camp/bkk-transit-3d-deploy.zip` into the page.
3. Netlify gives an HTTPS URL.
4. Open that URL on the phone.
5. Add to Home Screen.

### Option B: GitHub Pages

Use this if you want a stable project URL:

1. Create a new GitHub repository.
2. Upload the project files so `index.html` is at the repository root.
3. Add `.nojekyll` at the root.
4. Settings → Pages → Deploy from branch → `main` → root.
5. Open the GitHub Pages HTTPS URL on the phone.

### Option C: Vercel

Use this if you already use Vercel:

1. Create/import a project.
2. Framework preset: Other / Static.
3. Build command: none.
4. Output directory: project root.
5. Deploy and open the HTTPS URL on phone.

## Judge Demo Flow On Phone

1. Open app.
2. `เพิ่มเติม → Demo Mode ปุ่มเดียว → เริ่มเดโม`.
3. Show route card.
4. `บริการ → เทียบราคา 20฿ vs ปกติ`.
5. `บริการ → ซ้อมนั่งครั้งแรก`.
6. `เพิ่มเติม → ที่มาข้อมูลแบบละเอียด`.
7. `ข่าวสาร → Incident Feed roadmap`.
