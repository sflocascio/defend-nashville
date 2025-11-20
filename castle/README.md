## Castle Defense 3D

A browser-based 3D tower defense built with Three.js. Defend your castle across 10 waves by placing and upgrading towers.

### Features
- 10 waves with increasing difficulty
- Enemies follow a path and damage the castle if they reach it
- Kill enemies to earn gold and buy/upgrade towers (Archer, Cannon, Fire)
- Simple 3D scene with orbit controls

### Prerequisites
- Node.js 18+ (recommend LTS)

### Quick Start (Dev Server)
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the dev server (opens browser automatically):
   ```bash
   npm run dev
   ```
   The app will be available at the printed local URL (typically `http://localhost:5173`).

### Build & Preview
```bash
npm run build
npm run preview
```

### Controls & Tips
- Click "Start Wave" to begin.
- Use the right panel to buy/upgrade towers on each spot.
- Rotate/pan/zoom with the mouse (OrbitControls).
- Survive all 10 waves to win.

