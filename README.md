# Denger Dogesh

An endless runner mini‑game built with HTML5 Canvas and vanilla JavaScript. Guide the dog along a dirty striped footpath, jump over obstacles, and rack up score as the world scrolls by.

## Features

- Smooth 60 FPS canvas rendering (no frameworks)
- Dirty footpath with synced yellow/white stripes and grime
- Parallax skyline of dusty, broken‑balcony buildings (stable, no flicker)
- Procedural road damage (cracks + potholes), cached for performance
- Jump buffering + coyote time for responsive jumps
- Keyboard, mouse, and touch controls
- Fullscreen mode and polished Game Over overlay

## Project structure

- `index.html` — UI shell, canvas, HUD, overlay
- `style.css` — Styling for HUD and overlay
- `script.js` — Game loop, rendering, input, audio
- `essentials/` — Assets
  - `dog.png` — Dog sprite (single frame supported; multi‑frame also works)
  - `game-over-sound.mp3` — Game over audio clip

## How to run

Just open `index.html` in a modern browser (Chrome, Edge, Firefox, Safari). No build step is required.

If your browser blocks local audio autoplay, interact once (press a key or click/tap) and audio will unlock.

## Controls

- Jump: Space, W, Up Arrow, or tap/click anywhere on the canvas
- Restart: R or click the Restart button
- Fullscreen: Click the Fullscreen button (Esc to exit)

## Gameplay notes

- The dog runs along the top of the footpath. Obstacles spawn on the footpath and scroll toward you.
- Score increases over time and for each obstacle that scrolls off‑screen.
- Jump buffering lets late key/tap presses still trigger a jump shortly after landing. Coyote time allows jumps a fraction of a second after you leave the ground.

## Performance optimizations

- Offscreen tile cache for road damage (cracks/potholes) to reduce per‑frame draw cost
- Stable seeded random for buildings and footpath grime to avoid visual flicker
- DOM updates for the score are batched (only when value changes)
- Device Pixel Ratio awareness with resize handling and cached asset invalidation

## Asset tips (optional)

- Dog sprites: `dog.png` can contain multiple horizontal frames. Set `SPRITE_FRAMES` in `script.js` if you want to force a specific frame count.
- Audio: Add a `essentials/jump.mp3` file if you want jump sounds (script includes a small pool and a fallback beep).

## Troubleshooting

- Nothing shows or it’s tiny: ensure the canvas isn’t constrained by container CSS. Try using Fullscreen.
- Audio doesn’t play: most browsers require a user gesture first. Click/tap or press any key to unlock.
- Performance issues: close other heavy tabs, try a smaller window, or disable browser extensions that inject overlays.

## License

This is a personal/fun project. You’re free to learn from it and use it locally. If you intend to publish or redistribute, please replace any third‑party assets with ones you own or have rights to.

— Built with care in vanilla JS.
