# TACTICAL STRIKE

TACTICAL STRIKE is an original, browser-based low-poly team FPS for private LAN matches. It uses procedural Three.js geometry and has no external game-asset or runtime CDN requirement.

## Features

- WebSocket LAN lobby for up to 10 players with balanced attacker/defender teams
- Server-owned player health, ammo, firing cadence, damage, deaths, credits, purchases, and round results
- FPS mouse look, pointer lock, local movement prediction, remote-player interpolation, hitscan weapons, reloads, armor, four server-validated ability actions, and buy phase
- Procedural low-poly map, characters, and first-person weapon; scoreboard, kill feed, objective and round HUD
- Plant/defuse interaction, device timer, round economy, reconnect-by-rejoining, and configurable shared game constants
- Automated tests for protocol validation, team assignment, movement, purchases, and combat

This project is an original game and does not include Valorant or other third-party game assets.

## Architecture

- `client/`: Vite, TypeScript, Three.js rendering, input, network client, and UI
- `server/`: Node HTTP/WebSocket server and authoritative `GameRoom` simulation
- `shared/`: protocol, player/match types, weapon catalogue, and shared game constants
- `tests/`: Node test-runner coverage for core server and protocol behavior

The server listens on `0.0.0.0` and serves the production client from `dist/`. WebSocket messages are versioned and the server parses and clamps client movement inputs. Movement and hit simulation run on the server; state snapshots are sent at 20 Hz.

## Requirements

- Node.js 20.19+ (or 22.12+) and npm
- Modern desktop browser with WebGL and WebSocket support
- For LAN play, clients and server must be on the same reachable network

## Installation

```bash
npm install
```

## Development

Start the frontend and game server in separate terminals:

```bash
npm run server:watch
npm run dev
```

Open the Vite URL printed in the terminal. Enter the server machine's LAN IP and port `3000` in the join form. The Vite development server is for development; the WebSocket game server is port 3000.

## Production

Build and start the server:

```bash
npm run build
npm run server
```

`npm run server` builds the client and starts the server. The server serves the game at `http://SERVER_LAN_IP:3000`.

## LAN Setup

1. Connect all computers to the same Wi-Fi or Ethernet network.
2. On the host computer, run:

   ```bash
   npm install
   npm run server
   ```

3. Find the host's LAN IPv4 address:
   - Linux: `ip addr`
   - Windows: `ipconfig`
   - macOS: `ifconfig`
4. Other players open `http://SERVER_LAN_IP:3000` in a browser.
5. Enter a display name and the server IP, then select **Join LAN Match**. At least two players are needed to start the first buy phase.

Allow inbound TCP traffic on port 3000 in the host's firewall. Do not expose a private match server to the public internet.

## Controls

| Input | Action |
| --- | --- |
| W / A / S / D | Move |
| Mouse | Look |
| Left mouse | Fire |
| Shift | Sprint |
| Ctrl | Crouch |
| R | Reload |
| Q / E / C / X | Use ability |
| F (hold) | Plant or defuse |
| B | Buy during buy phase |
| Tab (hold) | Scoreboard |
| Esc | Release pointer lock |

Click the rendered game to enable mouse look. Re-click the game after releasing pointer lock.

## Tests

```bash
npm test
npm run build
```

## Troubleshooting

- **Unable to connect:** verify the server process is running, use its LAN IPv4 address (not `localhost` on another computer), and verify both computers can reach each other.
- **Firewall prompt or timeout:** allow Node.js or inbound TCP port 3000 on the host.
- **Port already in use:** stop the other process or start the server with `PORT=3001 npm run server`, then enter port `3001` in the join form.
- **WebSocket errors:** make sure the browser's server IP and port match the running Node server; HTTP and WebSocket use the same port.
- **Server reports game files are not built:** run `npm run build` or use `npm run server`, which builds before starting.
- **No rendering:** update the browser and enable WebGL/hardware acceleration.
