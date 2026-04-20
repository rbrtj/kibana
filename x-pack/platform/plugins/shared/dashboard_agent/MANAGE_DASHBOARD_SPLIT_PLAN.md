# Plan: split `manage_dashboard` into 7 focused tools

> Status: design locked, awaiting implementation.
> Related code: `server/tools/manage_dashboard/`, `server/skills/dashboard_management_skill.ts`.

## Why

Today, `platform.dashboard.manage_dashboard` exposes a single tool with a
9-way `discriminatedUnion` over operations. Its JSON Schema serializes to
**~8.3 KB** — by far the largest agent-builder builtin tool in the codebase
(~1.7× larger than the next biggest, ~92× larger than the smallest).

Size alone is not a model-quality blocker for current frontier models. The
goals of this split are:

- **Tool-selection clarity.** One verb per tool maps cleanly to user intent.
- **Smaller per-tool surface.** Each tool exposes only the schema it actually
  needs, so the model has less to parse when constructing arguments.
- **Easier evaluation.** Failures localize to a specific tool rather than to
  one branch of a giant union.
- **Capability parity.** Every behavior available today through `operations[]`
  remains available through the new tools, including atomic dashboard creation
  with inline content and parallel inline-visualization resolution.

## Locked decisions

| Topic | Decision |
|---|---|
| Granularity | 7 tools (balanced split) |
| Sections | Merged as `manage_sections` with an `operations[]` of `add` / `remove` |
| `create_dashboard` | Accepts inline `panels[]` and `sections[]` so the create flow stays one-shot |
| `manage_sections.add` | Accepts inline panels (preserves today's `add_section.panels` behavior) |
| Coexistence | New `dashboard-management-v2` skill registered side-by-side; the v1 skill registration is removed during the test (no feature flag, no config) |
| Section-id threading | Same return-and-reuse pattern as today; reinforced in v2 prompt |
| Cross-tool partial failure | Accept; rely on the agent loop to recover; documented in prompt |
| Attachment versioning | One new attachment version per tool call |
| Inline-viz parallelism | Preserved internally per tool (`Promise.all` over each tool's resolution requests); cross-tool batching is dropped |
| Code layout | `tools/_shared/` for shared helpers + `tools/<tool>/<tool>.ts` per tool |
| Skill prompt style | Recipe-driven, with explicit batching guidance |
| Skill prompt origin | Authored from scratch; `dashboardCompositionPrompt` and `gridLayoutPrompt` reused verbatim |
| Tests | Deferred. Engine test coverage in `operation_engine.test.ts` (renamed from `operations.test.ts`) is the safety net; do **not** materially refactor `executeDashboardOperations` |
| Naming | `arrange_panels` for the move/resize/reorganize tool; everything else as proposed |
| Implementation order | Refactor shared helpers first → wrappers on engine → swap skill → eyeball-test (H1) |

## The 7 tools

| ID | Inputs (LLM-facing) | Notes |
|---|---|---|
| `platform.dashboard.create_dashboard` | `title`, `description`, optional `panels[]` (markdown / attachment / visualization discriminated union, each with `grid` and optional `sectionId`), optional `sections[]` (each with `title`, `grid`, optional inline `panels[]`) | The only path to create a dashboard. Returns `dashboardAttachmentId` and the rendered structure. |
| `platform.dashboard.update_dashboard_metadata` | `dashboardAttachmentId`, optional `title`, optional `description` | Smallest schema. |
| `platform.dashboard.add_panels` | `dashboardAttachmentId`, `panels[]` (same discriminated union as `create_dashboard.panels`) | Largest of the 7. Replaces `add_markdown` + `add_panels_from_attachments` + `create_visualization_panels`. |
| `platform.dashboard.edit_panels` | `dashboardAttachmentId`, `panels[{ panelId, query, chartType?, esql? }]` | ES\|QL-backed Lens panels only. |
| `platform.dashboard.arrange_panels` | `dashboardAttachmentId`, `panels[{ panelId, grid?, sectionId? }]` (`sectionId: null` promotes to top-level) | Move, resize, or move-between-sections. |
| `platform.dashboard.remove_panels` | `dashboardAttachmentId`, `panelIds[]` | Trivial. |
| `platform.dashboard.manage_sections` | `dashboardAttachmentId`, `operations[]` of discriminated `add` (title, grid, optional inline `panels[]`) and `remove` (id, panelAction) | Two-op discriminator instead of nine. |

### Estimated input-schema sizes

| Tool | Bytes (approx, JSON-Schema) |
|---|---:|
| `create_dashboard` | ~3,500 |
| `add_panels` | ~2,800 |
| `manage_sections` | ~1,700 |
| `edit_panels` | ~700 |
| `arrange_panels` | ~600 |
| `update_dashboard_metadata` | ~250 |
| `remove_panels` | ~150 |
| **Sum** | **~9,700** |
| Today's single tool | 8,283 |

Aggregate bytes are larger due to per-tool boilerplate, but this is irrelevant
at decision time: the model sees all 7 schemas in the tool catalogue, picks
one tool, and only that tool's schema constrains argument generation. The
decisive numbers are `add_panels` (~2.8 KB) and `create_dashboard` (~3.5 KB),
both well under today's 8.3 KB.

## Constants

Update `common/constants.ts`:

```typescript
export const dashboardTools = {
  manageDashboard: dashboardTool('manage_dashboard'), // legacy — keep export until cleanup
  createDashboard: dashboardTool('create_dashboard'),
  updateDashboardMetadata: dashboardTool('update_dashboard_metadata'),
  addPanels: dashboardTool('add_panels'),
  editPanels: dashboardTool('edit_panels'),
  arrangePanels: dashboardTool('arrange_panels'),
  removePanels: dashboardTool('remove_panels'),
  manageSections: dashboardTool('manage_sections'),
} as const;
```

## File layout

### Before

```
server/tools/
  manage_dashboard/
    manage_dashboard.ts
    operations.ts          (678 lines)
    dashboard_state.ts
    inline_visualization.ts
    utils.ts
    *.test.ts
    index.ts
  utils.test.ts
  index.ts
server/skills/
  dashboard_management_skill.ts
  dashboard_composition_prompt.ts
  grid_layout_prompt.ts
  register_skills.ts
```

### After (during the test)

```
server/tools/
  _shared/
    dashboard_state.ts                 (moved from manage_dashboard/)
    inline_visualization.ts            (moved from manage_dashboard/)
    utils.ts                           (moved from manage_dashboard/)
    operation_engine.ts                (renamed from operations.ts)
    visualization_resolution.ts        (extracted from operations.ts: collectVisualizationCreationRequests, resolveVisualizationCreationRequests, materializeResolvedVisualizationPanels)
    index.ts
  manage_dashboard/                    (kept; calls into _shared/)
    manage_dashboard.ts
    index.ts
  create_dashboard/
    create_dashboard.ts                (wrapper → engine)
    index.ts
  update_dashboard_metadata/
  add_panels/
  edit_panels/
  arrange_panels/
  remove_panels/
  manage_sections/
  index.ts                             (re-exports all 8 tool factories)
server/skills/
  dashboard_management_skill.ts        (kept on disk; not registered during test)
  dashboard_management_v2_skill.ts     (new)
  dashboard_composition_prompt.ts      (unchanged, reused verbatim)
  grid_layout_prompt.ts                (unchanged, reused with two surgical phrasing edits)
  register_skills.ts                   (changed: registers v2 instead of v1)
```

### After cleanup (only if v2 wins)

```
server/tools/
  _shared/
    operation_engine.ts                (each tool may now call _shared helpers directly without the synthetic operations[] translation step — optional polish)
    ... (other shared modules)
  create_dashboard/
  update_dashboard_metadata/
  add_panels/
  edit_panels/
  arrange_panels/
  remove_panels/
  manage_sections/
  index.ts
server/skills/
  dashboard_management_skill.ts        (renamed from v2)
  dashboard_composition_prompt.ts
  grid_layout_prompt.ts
  register_skills.ts
```

## Wrapper pattern

Each new tool is a thin wrapper that:

1. Validates its own LLM-facing schema (zod).
2. Loads or creates the dashboard attachment, mirroring today's `manage_dashboard.ts` (lines ~69–79).
3. Translates LLM-facing input → internal `DashboardOperation[]` for the engine.
4. Calls `executeDashboardOperations` from `_shared/operation_engine.ts`.
5. Persists via `attachments.add` / `attachments.update`, mirroring today's
   `manage_dashboard.ts` (lines ~109–114).
6. Shapes the result and returns.

### Translation table

| Tool | Synthesized engine ops |
|---|---|
| `create_dashboard` | `[{ operation: 'set_metadata', title, description }, …inline panels translated, …inline sections translated with their inline panels]` |
| `update_dashboard_metadata` | `[{ operation: 'set_metadata', title?, description? }]` |
| `add_panels` | One op per `panels[i]`: `markdown` → `add_markdown`; `attachment` → `add_panels_from_attachments`; `visualization` → `create_visualization_panels` |
| `edit_panels` | `[{ operation: 'edit_visualization_panels', panels }]` |
| `arrange_panels` | `[{ operation: 'update_panel_layouts', panels }]` |
| `remove_panels` | `[{ operation: 'remove_panels', panelIds }]` |
| `manage_sections` | One op per item; `add` → `add_section`; `remove` → `remove_section` |

Bugs can only live in the translation layer; the engine and its tests are
unchanged.

## Skill prompt outline (`dashboard_management_v2_skill.ts`)

Recipe-driven, F1 style. Sections in order:

1. **When to Use This Skill** — verbatim from v1.
2. **Discovery** — verbatim from v1 (sml_search / sml_attach).
3. **Creating a new dashboard**
   - Preferred: ONE call to `create_dashboard` with `title`, `description`, and as
     much initial content as can be confidently planned up front (`panels[]` for
     top-level panels, `sections[]` for sections with optional inline `panels[]`).
   - This is the only path that allows atomic dashboard creation.
   - If the layout is unknown, call `create_dashboard` with title/description only
     and add panels and sections incrementally with the tools below.
4. **Updating an existing dashboard**
   - Always reuse `data.dashboardAttachment.id` from the prior tool result as
     `dashboardAttachmentId`.
   - Never invent `panelId`, `sectionId`, or `dashboardAttachmentId`.
   - Tool reference (each is one-purpose):
     - `update_dashboard_metadata` — change title and/or description.
     - `add_panels` — add markdown, attachment, or new visualization panels.
     - `edit_panels` — re-author existing ES\|QL Lens panels in place.
     - `arrange_panels` — move, resize, or move-between-sections.
     - `remove_panels` — delete by `panelId`.
     - `manage_sections` — add or remove sections (`add` can include inline panels).
5. **Section workflows**
   - To add a section AND its initial panels in one round-trip: ONE call to
     `manage_sections` with `operation: 'add'` and inline `panels[]` in the same item.
   - To add panels to an existing section: call `add_panels` with `sectionId` set
     to the section's id (returned from the earlier `manage_sections` /
     `create_dashboard` call).
   - NEVER fabricate `sectionId`; always use the value returned by an earlier
     tool result.
6. **Non-ES\|QL panels** — verbatim from v1.
7. **Failures**
   - Each tool returns its own `data.failures[]` when partial work fails. Explain
     failures to the user; do not silently retry destructively.
   - If a whole tool call fails, the dashboard is in the state left by the previous
     successful tool call. Decide with the user whether to retry, roll forward,
     or start over.
8. **Composition Guidelines** — inject `dashboardCompositionPrompt` verbatim.
9. **Panel Layout** — inject `gridLayoutPrompt` with two surgical edits:
   - Replace `Every add_panels_from_attachments item requires grid:` with
     `Every panel that you add requires grid:`.
   - Replace `When using add_section` with `When you add a section`.
10. **Edge Cases** — port from v1, swapping operation names for tool names.

`getInlineTools` returns the 7 new tool factories.

## Implementation steps (H1 order)

Verify with `node scripts/check_changes.ts` after each step (per workspace
verification rule).

### Phase 1 — Refactor (no behavior change)

1. Create `server/tools/_shared/`.
2. Move `dashboard_state.ts`, `inline_visualization.ts`, `utils.ts` from
   `manage_dashboard/` to `_shared/`. Update imports in `operations.ts` and
   `manage_dashboard.ts`.
3. Rename `operations.ts` → `_shared/operation_engine.ts`. Update imports.
4. Move `operations.test.ts` → `_shared/operation_engine.test.ts`. Run
   `node scripts/jest x-pack/platform/plugins/shared/dashboard_agent/server/tools/_shared/operation_engine.test.ts` —
   all 19 tests must pass.
5. Confirm `manage_dashboard.ts` still works through its rewired imports.

### Phase 2 — New tool wrappers

6. Add the 7 new IDs to `common/constants.ts` (one commit).
7. `create_dashboard.ts` — handles initial-content translation; enforces
   title+description (the only tool that can create).
8. `update_dashboard_metadata.ts`.
9. `add_panels.ts` — discriminated `kind` translation to 3 underlying ops.
10. `edit_panels.ts`.
11. `arrange_panels.ts`.
12. `remove_panels.ts`.
13. `manage_sections.ts` — `add` / `remove` discriminator.
14. Update `server/tools/index.ts` to re-export the 7 new factories.

### Phase 3 — New skill + swap

15. Create `server/skills/dashboard_management_v2_skill.ts` with the prompt
    outlined above. `getInlineTools` returns the 7 new tool factories.
16. Update `server/skills/register_skills.ts` to register
    `dashboardManagementV2Skill` instead of `dashboardManagementSkill`. Leave
    the v1 skill exported but un-registered during the test so it can be
    flipped back trivially.

### Phase 4 — Verification (manual eyeball test)

17. Boot Kibana with the dashboard_agent plugin enabled. Use the agent UI /
    chat to run a representative set of prompts:
    - Create a new dashboard from natural language ("create a dashboard for
      my logs index").
    - Create a dashboard with sections from natural language.
    - Add a panel to an existing dashboard.
    - Edit an existing ES\|QL panel.
    - Move a panel into a section, then resize it.
    - Remove a section with `panelAction: 'promote'`.
    - Try to edit a non-ES\|QL panel and confirm graceful refusal.
    - Add panels from existing visualization attachments.
18. Eyeball: does the model batch correctly? Does it correctly thread
    `sectionId` across calls? Are tool selections accurate?

### Phase 5 — Cleanup (only if v2 wins)

19. Delete `server/tools/manage_dashboard/`.
20. Remove `manageDashboard` constant from `common/constants.ts`.
21. Delete `server/skills/dashboard_management_skill.ts`.
22. Rename `dashboard_management_v2_skill.ts` → `dashboard_management_skill.ts`;
    update `register_skills.ts`.
23. Optionally collapse the wrapper translation layer: change each new tool
    to operate directly on the dashboard state via `_shared` helpers, dropping
    the synthetic `operations[]` indirection. Polish only; recommended only
    if the new tools are intended for long-term maintenance.

## Risk register

| Risk | Mitigation |
|---|---|
| Wrappers translate input wrongly → silent behavior change | Keep `executeDashboardOperations` and its tests untouched; translation layer is small and inspectable. |
| Model fails to batch into a single `create_dashboard` call → multi-step creation regression | Explicit recipe-driven prompt guidance + manual eval in Phase 4. |
| Model invents `sectionId` instead of waiting for a prior tool result | Explicit prompt guidance ("NEVER fabricate sectionId") + manual eval. |
| Cross-tool partial failures leave inconsistent dashboards | Each tool call is its own attachment version; user-visible failures are clear; documented in prompt. |
| Latency regression from extra round-trips during incremental edits | `create_dashboard` accepting inline `panels[]` and `sections[]`, plus `manage_sections.add` accepting inline panels, mitigates this for the create flow. Incremental edits are inherently multi-step today. |
| Tool catalogue confusion (7 tools to choose from) | Names are sharp; recipe section maps user intent → tool 1:1. |
| Schema-size win is washed out by aggregate growth | Aggregate is irrelevant to the LLM at decision time; only per-tool schema matters once the tool is selected. |

## Out of scope

- Per-tool unit tests (deferred; engine tests cover correctness).
- Telemetry changes for the new tool IDs.
- Public API documentation updates.
- Formal A/B eval harness.
