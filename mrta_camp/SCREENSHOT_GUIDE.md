# Screenshot guide for MRTA slides

Generated on 2026-07-06 with headless Chromium from `http://127.0.0.1:8321`.

Use these as slide placeholders or layout references:

| File | Use for | Notes |
|---|---|---|
| `screenshots/01_city_overview_day.png` | Slide 7 image 1: city overview | Clean HUD-free overview. Good as a wide background, but retake on RTX if you want richer building colors. |
| `screenshots/02_route_siam_tha_phra.png` | Slide 7 image 2: route planner | Best current slide image. Shows exact normal fare 56 baht, 20-baht policy, and CO2 estimate. |
| `screenshots/03_ridership_stats.png` | Supporting image or backup | Shows the monthly ridership panel. Useful if the team wants to emphasize real DRT data. |
| `screenshots/04_cab_view_sukhumvit.png` | Slide 7 image 3 placeholder | Headless/software renderer makes this angle too flat. Retake manually on RTX before final submission. |
| `screenshots/04b_follow_train_sukhumvit.png` | Alternative to cab view | Better than cab view for now, but still should be retaken manually on RTX. |

Final submission recommendation:

1. Keep `02_route_siam_tha_phra.png` unless a manual screenshot looks clearly better.
2. Retake city overview and train/cab shots on the real GPU, full screen, day mode.
3. For the fourth image, use either ridership stats or a time-slider shot at 08:00 depending on the slide story.

Known verification notes:

- Browser console had no app exceptions during capture.
- Headless Chromium reported sandbox/network font blocks and software WebGL warnings; those are capture-environment issues, not observed application crashes.
