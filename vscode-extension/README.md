# Debugger Agent — VS Code Extension

AI-powered multi-agent code debugger that lives right inside VS Code.

## Features

- **Right-click → Debug with Agent** on any selected code
- **Live agent pipeline flowchart** in a side panel showing each agent activating in real-time
- **Root cause analysis**, suggested patch diff, and generated tests
- **Apply Patch** button writes the fix directly into your editor
- Supports Python, JavaScript, TypeScript, and more

## Requirements

The FastAPI backend must be running before using the extension.

### Start the backend

```bash
# From the DEBBUGER-AGENT root directory
cd ..  # go to project root
docker-compose up   # or run manually:

# Manual start:
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

> Redis is also required. The easiest way is via Docker: `docker run -p 6379:6379 redis`

## Usage

1. Open any code file in VS Code
2. **Select** the code snippet you want to debug
3. **Right-click** → **🐛 Debug with Agent**
4. Watch the agent pipeline animate in the side panel
5. Review root cause, patch diff, and generated tests
6. Click **⚡ Apply to Editor** to apply the fix

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `debugAgent.backendUrl` | `http://localhost:8000` | FastAPI backend URL |
| `debugAgent.autoSaveSession` | `true` | Auto-save sessions |

## Commands

| Command | Description |
|---------|-------------|
| `Debugger Agent: 🐛 Debug with Agent` | Debug selected code |
| `Debugger Agent: 🔑 Set API Token` | Save JWT token for authenticated sessions |
| `Debugger Agent: 🗑️ Clear API Token` | Remove stored token |

## Development

```bash
cd vscode-extension
npm install
npm run compile

# Press F5 in VS Code to launch the Extension Development Host
```

## Packaging

```bash
npm run package   # generates debugger-agent-0.1.0.vsix
```

Install the `.vsix` via **Extensions → Install from VSIX…**
