# Pandora - The AI Operating System

**An AI OS where agents work, humans watch, and everyone collaborates.**

---

## Vision

Pandora is a fully contained AI operating system. Your agents live here. They write, research, build, browse, and communicate - all in one place. You can enter watch mode and follow their work in real time, or jump in and collaborate naturally.

No more scattered tools. No more invisible agents. One workspace. Everything visible.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                  PANDORA                      │
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ Markdown │ │ Browser  │ │  Chat    │    │
│  │ Editor   │ │ (CUA)    │ │(Telegram)│    │
│  └──────────┘ └──────────┘ └──────────┘    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ Sheets   │ │  TUI     │ │  Tasks   │    │
│  │ Viewer   │ │ Terminal │ │  Board   │    │
│  └──────────┘ └──────────┘ └──────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │         Agent Workspace Layer         │    │
│  │  Ada 🔮  Spock 🖖  Scotty 🔧        │    │
│  │  Watch Mode | Interact Mode          │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │         OpenClaw Gateway              │    │
│  │  Sessions | Hooks | WebSocket        │    │
│  └──────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

---

## Roadmap

### Phase 1: MD Writer & Viewer ✅ (Current - v0.1)
**Status:** Shipped

The foundation. A markdown-native workspace connected to your Obsidian vault.

- ✅ File browser (reads Obsidian vault, any directory)
- ✅ Markdown editor (CodeMirror 6, syntax highlighting)
- ✅ Live preview (react-markdown, GFM, code highlighting)
- ✅ Agent sidebar (real-time status from OpenClaw Gateway)
- ✅ Task panel (Mission Control integration)
- ✅ @mention detection → webhook to agents
- ✅ WebSocket real-time sync
- ✅ Auto-save (2s debounced)
- ✅ QuickSwitcher (Cmd+P)
- ✅ Keyboard shortcuts
- ✅ Electron desktop app (.dmg)
- ✅ Expo mobile app (WebView)
- ✅ Dark theme

### Phase 2: Watch Mode & Sheets
**Status:** Next

See your agents working in real time. Load Google Sheets and watch agents populate data.

- [ ] **Watch Mode** - Enter read-only mode, follow agent cursor and edits live
- [ ] **Agent activity stream** - Timeline of what each agent is doing right now
- [ ] **Google Sheets viewer** - Load spreadsheets, watch agents fill cells
- [ ] **Split pane** - View multiple files/sheets side by side
- [ ] **Agent focus tracking** - See which file each agent is currently editing
- [ ] **Notification center** - Agent completions, errors, mentions
- [ ] **File diff view** - See what changed between saves
- [ ] **History timeline** - Scrub through file history, see who changed what

### Phase 3: Browser & CUA (Computer Use Agent)
**Status:** Planned

Bolt in a browser. Agents can browse the web, fill forms, navigate sites.

- [ ] **Embedded browser pane** - Load any URL inside Pandora
- [ ] **CUA integration** - Agents control the browser (click, type, navigate)
- [ ] **Browser recording** - Watch agent's browser session in real time
- [ ] **Screenshot capture** - Agents take screenshots, save to workspace
- [ ] **Form filling** - Agents fill web forms on your behalf
- [ ] **Research mode** - Agent browses, summarizes, saves findings to your workspace
- [ ] **Multi-tab support** - Multiple browser sessions visible simultaneously

### Phase 4: Chat Integration (Telegram bolt-in)
**Status:** Planned

Bring your Telegram/messaging into Pandora. Fully contained communication.

- [ ] **Telegram panel** - Your Telegram chats inside Pandora
- [ ] **Chat ↔ Document** - Reference documents in chat, open files from chat mentions
- [ ] **Agent chat** - Talk to any agent directly in the same interface
- [ ] **Group conversations** - Multi-agent discussions visible in Pandora
- [ ] **Message search** - Search across all channels from Pandora
- [ ] **Voice messages** - Play and send voice from the workspace

### Phase 5: TUI Terminal
**Status:** Planned

A terminal pane for power users. Run commands, see agent output, interact with the system.

- [ ] **Embedded terminal** - xterm.js terminal pane
- [ ] **Agent terminal sessions** - Watch agents run commands
- [ ] **Split terminal** - Multiple terminal panes
- [ ] **Command palette** - Quick access to any Pandora action
- [ ] **Script runner** - Execute scripts from the file browser

### Phase 6: Full AI City
**Status:** Vision

The spatial interface. Zoom into any agent, any project, any moment.

- [ ] **Spatial workspace** - 2D/3D view of your agent fleet
- [ ] **Agent neighborhoods** - Clusters of agents on the same project
- [ ] **Project rooms** - Dedicated spaces for each project
- [ ] **Live dashboards** - Real-time metrics, progress, cost tracking
- [ ] **Agent marketplace** - Add new agents to your city
- [ ] **Multi-user** - Multiple humans in the same workspace
- [ ] **Mobile-first city view** - Pan/zoom on phone to explore

---

## Advanced Phases

### Advanced Phase 1: RoboClaw Integration
**Status:** Vision | **Repo:** https://github.com/hintjen/RoboClaw

RoboClaw is an agent provisioning layer. It sets up OpenClaw gateways and powers Entity instances automatically. One command spins up a full agent workspace.

**The flow:**
```
RoboClaw → provisions OpenClaw Gateway → powers Entity instance
         → configures agents, skills, memory
         → connects to user's data sources
         → Entity is ready to use
```

- [ ] **RoboClaw CLI integration** - `roboclaw init` creates a full Pandora instance
- [ ] **Gateway provisioning** - Auto-configure OpenClaw with agents, models, skills
- [ ] **Entity auto-deploy** - Spin up Entity frontend connected to the new gateway
- [ ] **Agent templates** - Pre-configured agent crews (research team, dev team, sales team)
- [ ] **Data source connection** - Auto-connect Google Workspace, Slack, GitHub on init
- [ ] **One-click setup** - From zero to working AI workspace in minutes

### Advanced Phase 2: Multi-Tenant
**Status:** Vision

Multiple users, multiple organizations, shared infrastructure.

- [ ] **Tenant isolation** - Each org gets their own agent fleet and workspace
- [ ] **User management** - Invite team members, assign roles
- [ ] **Shared agents** - Agents that serve multiple users in the same org
- [ ] **Usage metering** - Track tokens, API calls, storage per tenant
- [ ] **Admin dashboard** - Org-level view of all agents, users, activity
- [ ] **SSO / OAuth** - Enterprise auth integration

### Advanced Phase 3: Marketplace & Ecosystem
**Status:** Vision

An ecosystem where anyone can build on Pandora.

- [ ] **Skill marketplace** - Install agent skills from a marketplace
- [ ] **Agent marketplace** - Pre-built agents for specific workflows
- [ ] **Plugin system** - Third-party panels (analytics, CRM, custom tools)
- [ ] **API** - Public API for building on top of Pandora
- [ ] **White-label** - Rebrand Pandora for enterprise customers

---

## Core Concepts

### Watch Mode
Enter watch mode and just follow your AI working. See their cursor move, files open, content appear. Like watching someone code over their shoulder, but it's your agent fleet building your business while you watch.

### Interact Mode
Jump in anytime. Edit the same document. Drop an @mention. Start a conversation in context. Your agents respond in real time, in the document, in the workspace.

### Sheets Integration
Load your Google Sheets. Watch agents populate data, update cells, run calculations. See your pipeline fill up in real time.

### Fully Contained
Everything happens inside Pandora. No switching between Telegram, Chrome, VS Code, Obsidian, and terminal. One interface. All your agents. All your files. All your communication.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| UI Framework | React 19 |
| Desktop | Electron 34 |
| Mobile | Expo SDK 52 |
| Editor | CodeMirror 6 |
| Markdown | react-markdown + remark-gfm |
| Browser | Playwright / Puppeteer (CUA) |
| Terminal | xterm.js |
| Sheets | Google Sheets API |
| Chat | Telegram Bot API / MTProto |
| State | Zustand |
| Styling | Tailwind CSS |
| Server | Node.js + Express |
| Real-time | WebSocket (ws) |
| Agent Layer | OpenClaw Gateway API |

---

## Why "Pandora"

Pandora opened a box and released everything into the world. This is the box where AI agents live and work. Open it, and you see everything they're doing. Every file. Every thought. Every action.

The name captures both the power and the responsibility. You're opening a window into artificial minds at work.

---

*Built by the Your Crew. Ada 🔮 Spock 🖖 Scotty 🔧*
*Powered by OpenClaw.*
