# Eureka TODOs

## P1 — High Priority

### Self-correcting render loop
**What:** On manim render failure, feed the error (stderr) back to the LLM and retry code generation automatically (with configurable max retries).
**Why:** LLM-generated manim code fails ~30-50% on first attempt due to API misuse, import errors, or animation timing issues. An error-feedback loop would dramatically improve success rate.
**Effort:** M
**Depends on:** Core pipeline (prompt → code → video) must be working first.
**Status:** In progress — render_video tool added to agent loop, self-correcting on failures with configurable max attempts.

## P2 — Medium Priority

### Snippet-optimized templates
**What:** Curate 5-10 Manim templates in `agent-workspace-template/templates/` specifically designed for short, clean snippet animations (no titles, minimal transitions, updater-heavy).
**Why:** The current templates are oriented toward explainer videos. Snippet mode would benefit from reference examples that match its constraints — clean compositions, ValueTracker patterns, minimal animation.
**Effort:** M
**Depends on:** Snippet mode feature (mode="snippet").

### Sandboxed code execution
**What:** Before any multi-user deployment, execute LLM-generated Python code in a sandboxed environment to prevent arbitrary code execution on the host.
**Why:** The LLM generates Python that runs unsandboxed on the host machine. A malicious or confused output could execute arbitrary system commands. Acceptable for single-user prototype; blocks multi-user deployment.
**Options to evaluate:** Docker containers, gVisor, Firecracker microVMs, nsjail, restricted Python environments (RestrictedPython), or cloud-based sandboxed execution (e.g., Modal, E2B).
**Effort:** M
**Depends on:** Core pipeline working. Should be implemented before server/multi-user layer.

## P3 — Future

### Prompt eval framework
**What:** A test suite that runs prompts against sample inputs, scores the outputs (structured format adherence, code quality, render success rate), and tracks regressions across prompt edits.
**Why:** As prompts multiply (snippet planner, snippet agent, future modes), manual testing becomes insufficient. Automated eval catches quality regressions when prompts are edited.
**Effort:** L
**Depends on:** Multiple prompts existing (delivered by snippet mode feature).

### Cloud rendering support
**What:** Add ability to offload manim rendering to cloud infrastructure (Modal, AWS Lambda, or similar) for concurrent/heavy renders.
**Why:** Local subprocess rendering won't scale beyond a single user. Cloud rendering enables concurrent users and removes the need for manim/ffmpeg on the host.
**Effort:** L
**Depends on:** Core pipeline + server layer. Only needed at scale.
