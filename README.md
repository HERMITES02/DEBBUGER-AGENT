# Debug Agent — Multimodal AI Code Debugging Assistant

> Drop in broken code, a screenshot of an error, a terminal log, or just describe the bug. Six AI agents collaborate to find the root cause, write a fix, and verify it with tests.

---

## What it does

Debug Agent is a multi-agent AI system that accepts multiple types of input simultaneously — source code, error screenshots, stack traces, terminal output, or plain-English descriptions — and returns a root cause explanation, a ready-to-apply code patch, and auto-generated tests that verify the fix.

It works as both a web app and a VS Code extension, letting you trigger a full AI debug session without leaving your editor.

---

## Architecture overview

```
User input (code + image + log + text)
         │
         ▼
┌─────────────────────────────────────────────────────┐
│                 VS Code Extension                   │
│   sidebar panel · LSP diagnostics · file writer     │
└──────────────────────┬──────────────────────────────┘
                       │ DebugRequest (HTTP / WebSocket)
                       ▼
┌─────────────────────────────────────────────────────┐
│              FastAPI Backend (Dev 2)                │
│                                                     │
│  ┌──────────────┐    Redis pub/sub message bus      │
│  │ Orchestrator │◄──────────────────────────────►  │
│  │  (LangGraph) │                                   │
│  └──────┬───────┘                                   │
│         │  dispatches to                            │
│  ┌──────▼──────────────────────────────────────┐   │
│  │            Specialist Agents                 │   │
│  │                                              │   │
│  │  Perception (Dev 1)   Action (Dev 2)         │   │
│  │  ─────────────────    ─────────────          │   │
│  │  Input router         Search agent           │   │
│  │  Vision agent         Patch agent            │   │
│  │  Code agent           Test agent             │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  Shared memory: Chroma vector store + Redis state   │
└──────────────────────┬──────────────────────────────┘
                       │ DebugResult
                       ▼
         Root cause · Code patch · Tests
```

---

## Tech stack

| Layer | Technology |
|---|---|
| LLM | Claude claude-sonnet-4-6 (Anthropic API) |
| Agent framework | LangGraph |
| Backend | FastAPI + Uvicorn |
| Real-time streaming | WebSocket |
| Message bus | Redis pub/sub |
| Background jobs | Celery + Redis |
| Code sandbox | E2B (isolated execution) |
| Vector store | Chroma (local) / Pinecone (prod) |
| Embeddings | nomic-embed-code |
| Static analysis | tree-sitter · Ruff · ESLint · tsc |
| Frontend | Next.js + Vercel AI SDK |
| VS Code extension | TypeScript + VS Code Extension API |
| Containerisation | Docker + Docker Compose |
| CI/CD | GitHub Actions |

---

## Project structure

```
debug-agent/
│
├── shared/                                   # SHARED — both devs import from here
│   └── schemas.py                            # DebugRequest, AgentMessage, DebugResult
│
├── backend/                                  # Dev 2 — FastAPI + action agents
│   ├── app/
│   │   └── main.py                           # FastAPI app, /debug endpoint, WebSocket
│   │
│   ├── agents/
│   │   ├── orchestrator.py                   # LangGraph ReAct loop
│   │   ├── search_agent.py                   # Web search + Stack Overflow
│   │   ├── patch_agent.py                    # Code fix generation + diff
│   │   ├── test_agent.py                     # Test generation + execution
│   │   └── file_agent.py                     # FilePatch builder for VS Code
│   │
│   ├── tools/
│   │   ├── sandbox.py                        # E2B code executor
│   │   ├── git_ops.py                        # gitpython blame, log, apply patch
│   │   └── diff_engine.py                    # Unified diff parser
│   │
│   ├── tests/
│   ├── docker-compose.yml
│   ├── requirements.txt
│   └── .env.example
│
├── perception/                               # Dev 1 — perception layer (NEW)
│   ├── agents/
│   │   ├── vision_agent.py                   # Claude Vision API — reads screenshots
│   │   ├── code_analysis_agent.py            # tree-sitter AST + Ruff/ESLint linting
│   │   └── context_builder.py                # assembles final prompt from all inputs
│   │
│   ├── router/
│   │   └── input_router.py                   # classifies inputs, strips ANSI, encodes images
│   │
│   ├── memory/
│   │   └── vector_store.py                   # Chroma DB — session memory + retrieval
│   │
│   └── requirements.txt                      # perception layer Python deps
│
├── frontend/                                 # Dev 1 — Next.js web app
│   ├── app/
│   ├── components/
│   │   ├── ChatInput.tsx                     # file + image drop zone
│   │   ├── DiffViewer.tsx                    # before/after code patch viewer
│   │   └── AgentLog.tsx                      # live agent activity stream
│   └── package.json
│
├── extension/                                # Dev 1 — VS Code extension
│   ├── src/
│   │   ├── extension.ts                      # entry point, command registration
│   │   ├── sidebar.ts                        # webview panel
│   │   └── fileWriter.ts                     # applies FilePatch to workspace files
│   └── package.json
│
└── README.md



## Shared data contracts

All communication between the frontend (Dev 1) and backend (Dev 2) uses three Pydantic schemas defined in `app/schemas.py`.

### DebugRequest
Sent by the frontend or VS Code extension to the `/debug` endpoint.

```python
class DebugRequest(BaseModel):
    user_message: str          # plain-English description of the bug
    language: str = "python"   # code language
    code: str | None           # source code or snippet
    logs: str | None           # stack trace or terminal output
    images: list[str] = []     # base64-encoded screenshots
    file_path: str | None      # absolute path (VS Code mode only)
```

### AgentMessage
Published to Redis by each agent during execution. The WebSocket streams these to the frontend in real time.

```python
class AgentMessage(BaseModel):
    agent_id: str    # "orchestrator" | "search" | "patch" | ...
    type: str        # "thinking" | "tool_call" | "result"
    payload: str     # human-readable status or result
    timestamp: float
```

### DebugResult
Returned by the backend when all agents have completed.

```python
class DebugResult(BaseModel):
    root_cause: str             # plain-English explanation
    patch_diff: str | None      # unified diff, ready to apply
    tests: list[str] = []       # generated test cases
    confidence: float = 0.0     # 0.0 – 1.0
    follow_up: str | None       # clarifying question if needed
```

---

## Getting started

### Prerequisites

- Python 3.10+
- Docker Desktop
- Node.js 18+
- Git
- An Anthropic API key — get one at [console.anthropic.com](https://console.anthropic.com)

### Backend setup (Dev 2)

```bash
# Clone the repo
git clone https://github.com/your-org/debug-agent.git
cd debug-agent/backend

# Create virtual environment (Windows)
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Start Redis
docker compose up -d

# Start the API server
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` to see the interactive API docs.

### Frontend setup (Dev 1)

```bash
cd debug-agent/frontend
npm install
npm run dev
```

Visit `http://localhost:3000`.

### VS Code extension (Dev 1)

```bash
cd debug-agent/extension
npm install
# Press F5 in VS Code to launch the Extension Development Host
```

---

## Environment variables

Create a `.env` file in `backend/` based on `.env.example`:

```env
ANTHROPIC_API_KEY=sk-ant-...      # required
REDIS_URL=redis://localhost:6379   # default for local dev
APP_ENV=development
CORS_ORIGIN=http://localhost:3000
E2B_API_KEY=                       # required for sandbox execution (week 2+)
TAVILY_API_KEY=                    # required for search agent (week 3+)
```

---

## API reference

### `POST /debug`
Synchronous debug request. Returns when all agents complete.

**Request body:** `DebugRequest`
**Response:** `DebugResult`

```bash
curl -X POST http://localhost:8000/debug \
  -H "Content-Type: application/json" \
  -d '{"user_message": "NoneType has no attribute split", "language": "python"}'
```

### `WS /ws/debug`
WebSocket endpoint for real-time agent streaming. Send a `DebugRequest` as JSON, receive `AgentMessage` events as agents run, followed by a final `DebugResult`.

### `GET /health`
Returns `{"status": "ok"}`. Used by Docker health checks and monitoring.

---

## Running tests

```bash
cd backend
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=app --cov=agents --cov-report=term-missing
```

---

## Redis channels

Agents communicate through Redis pub/sub. These are the channel names:

| Channel | Publisher | Subscribers | Purpose |
|---|---|---|---|
| `agent:tasks` | Orchestrator | All agents | Dispatch tasks to agents |
| `agent:perception` | Input router, Vision, Code | Orchestrator | Perception results |
| `agent:action` | Search, Patch, Test | Orchestrator | Action results |
| `agent:results` | Orchestrator | WebSocket handler | Final result streaming |
| `session:{id}` | Any agent | Orchestrator | Session state updates |

---

## Agent descriptions

### Orchestrator (Dev 2)
The central brain. Runs a LangGraph ReAct loop — plans which agents to call, dispatches tasks via Redis, collects results, and decides when enough information has been gathered to produce a final answer.

### Input router (Dev 1)
Receives the raw `DebugRequest` and classifies each piece of input by type (code, image, log, plain text). Extracts language, file paths, and error patterns. Publishes a structured perception payload to Redis.

### Vision agent (Dev 1)
Sends images to the Claude vision API. Extracts error messages, stack traces, UI states, and highlighted code from screenshots. Returns structured text that the orchestrator feeds into the other agents.

### Code agent (Dev 1)
Parses source code into an AST using tree-sitter. Runs language-appropriate static analysis (Ruff for Python, ESLint for JavaScript, tsc for TypeScript). Pinpoints the suspicious line and surrounding context.

### Search agent (Dev 2)
Queries Stack Overflow, official documentation, and GitHub issues using the Tavily search API. Returns the top ranked relevant results with source URLs.

### Patch agent (Dev 2)
Takes the root cause identified by the code agent and the context from the search agent, and generates a code fix using Claude. Formats the output as a unified diff. In VS Code mode, also produces a `FilePatch` with exact file path and line numbers.

### Test agent (Dev 2)
Generates pytest or Jest test cases that reproduce the original bug, verify the patch resolves it, and cover the edge cases identified during analysis. Executes the tests in the E2B sandbox to confirm they pass.

---

## Development workflow

Both developers work independently between weekly sync points. The contract between Dev 1 and Dev 2 is the three schemas in `app/schemas.py` — as long as those don't change without agreement, both sides can build and test in isolation.

**Branch strategy:**
- `main` — production-ready only
- `dev1/feature-name` — Dev 1's feature branches
- `dev2/feature-name` — Dev 2's feature branches
- Merge to `main` via pull request after integration testing

**Weekly sync:** Every Friday — 30-minute call to test the cross-boundary integration and flag any schema changes needed for the next week.

---

## Roadmap

| Week | Dev 1 | Dev 2 |
|---|---|---|
| 1 | Next.js UI + input router | FastAPI + Redis + LangGraph skeleton |
| 2 | Vision agent + multimodal API | E2B sandbox + orchestrator tools |
| 3 | Code agent + vector store | Search agent + test runner |
| 4 | Diff viewer UI + streaming | Patch agent + git ops |
| 5 | Session replay UI + memory | Parallel agent dispatch + Celery |
| 6 | Full pipeline integration | End-to-end testing |
| 7 | Unit tests + edge cases | Agent security review |
| 8 | Prototype freeze | Docker Compose full stack |
| 9 | Responsive UI + onboarding | Logging + monitoring |
| 10 | Docs + demo video | CI/CD + production deploy |

**Prototype deadline:** May 25, 2025
**v1 release:** June 8, 2025

---

## Contributing

This is a two-person project. Before making changes that affect the shared schemas (`DebugRequest`, `AgentMessage`, `DebugResult`) or Redis channel names, discuss with the other developer first — these are the integration points and changing them without agreement will break both sides.

---

## License

MIT
