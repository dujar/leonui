# AgentUI (working name)

**Status:** idea, pre-spec
**Author:** human + ZCode session, 2026-09-25

## The problem

AI coding agents are now the fastest-growing author of UI code, but every mainstream stack (React + Tailwind + CSS + bundlers) was designed for humans. This causes:

- **Hallucinated vocabulary** — agents half-remember Tailwind classes, hook rules, CSS quirks, and package versions that drift from training data.
- **Non-local reasoning** — one visual change touches CSS, TSX, state, and multiple files; agents are dramatically better when one screen is one small file.
- **Fragile patch-editing** — agents are reliable at whole-artifact regeneration, unreliable at surgical diffs; React screens are too big to regenerate cheaply.
- **No self-verification loop** — agents can't see rendered output without a human in the loop.

## The proposed solution

A UI framework where the primary author is an AI agent:

1. **UI-as-data schema** — a strict JSON schema (not a language) describing screens as trees. ~15 primitives (Column, Row, Text, Button, Input, Image, List, Card, Badge, Icon, Divider, Spacer, Modal, Nav). Non-Turing-complete view layer: every document terminates, renders, and is analyzable.
2. **Renderer runtime** — web-first renderer; native/Skia targets later for free since the source is data.
3. **Agent-facing CLI** — `check` (validate with agent-readable errors), `shot` (headless screenshot), `tree` (text accessibility-tree dump so agents verify layout in text).
4. **Optional sugar notation** — tiny indentation-based syntax that parses 1:1 to the JSON AST; entire grammar + component catalog fits in ~2,000 tokens so agents learn it in-context rather than from training data.
5. **Semantic design tokens** — `primary`, `muted`, `gap=2` from a fixed scale. The framework has design opinions; the agent picks from a menu. Output looks good without a designer.
6. **Declarative state** — state as paths (`state user = GET /me`), events as declared actions (`POST /follow/{id}`, `nav /messages/{id}`). No hooks, no effects, no re-render reasoning.

## Target users

- Primary: AI coding agents (Claude Code / ZCode / Cursor / Copilot Workspace class tools) acting for a human developer.
- Secondary: the human developers who supervise them and must maintain the output.

## Ambition (the claim under test)

**Become the default way agents build UI** — displacing React + Tailwind as the thing an agent reaches for first when asked to build or modify a screen.

## Open questions we want attacked

1. Is "become the default" feasible at all, given React/Tailwind's training-data gravity and ecosystem moat?
2. **Ecosystem integration:** nearly all existing UI investment is React components (npm packages, datepickers, charts, tables), Tailwind design systems, and plain CSS. How does a schema-based framework integrate with that instead of losing to it? Escape hatches? Compile-to-React? Wrapping npm components into the catalog?
3. What's the expressiveness ceiling of a non-Turing-complete view layer (custom animations, gestures, virtualized tables, canvas/WebGL), and does every escape hatch leak the abstraction to death?
4. Who actually adopts this? The agent can't choose its framework — the human or toolchain config does. Is the real customer the agent operator (via a skill/system prompt), not the agent?
5. Schema/versioning and lock-in fear: will human teams refuse a format they can't hand-debug?

## Prior art we already know about

Google Mesop (Python, explicitly AI-generation-friendly), server-driven UI systems, TypeChat (NL → typed JSON pattern), SwiftUI (concision gold standard), Svelte (implicit reactivity), HTMX, Pug/Slim/HAML (cautionary: concise syntax alone didn't win), QML/XAML/Flex (declarative UI languages that never became the web default), Plasmic/Builder.io (JSON-based visual UI platforms), v0.dev / bolt.new / Lovable (AI UI generators — all output React/Tailwind).
