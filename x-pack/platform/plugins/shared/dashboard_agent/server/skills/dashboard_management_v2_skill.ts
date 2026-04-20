/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import {
  addPanelsTool,
  arrangePanelsTool,
  createDashboardTool,
  editPanelsTool,
  manageSectionsTool,
  removePanelsTool,
  updateDashboardMetadataTool,
} from '../tools';
import { dashboardTools } from '../../common';
import { gridLayoutPrompt } from './grid_layout_prompt';
import { dashboardCompositionPrompt } from './dashboard_composition_prompt';

/**
 * v1 prompt was written for a single `manage_dashboard` tool with `add_panels_from_attachments`
 * and `add_section` operation names. v2 reuses the same body but the surgical phrasing edits
 * below keep it consistent with the new one-tool-per-verb taxonomy.
 */
const v2GridLayoutPrompt = gridLayoutPrompt
  .replace(
    'Every `add_panels_from_attachments` item requires `grid: { x, y, w, h }`.',
    'Every panel that you add requires `grid: { x, y, w, h }`.'
  )
  .replace('When using `add_section`,', 'When you add a section,')
  .replace(
    'Panels nested under `add_section.panels` use that same section-relative coordinate space.',
    `Panels added to a section via \`${dashboardTools.addPanels}\` (with \`sectionId\` set) use that same section-relative coordinate space.`
  )
  .replace(
    'first `remove_section` (with `panelAction: "promote"` or `"delete"`) and re-add it via `add_section` at a higher `y` to make room',
    `first \`${dashboardTools.manageSections}\` with \`operation: "remove"\` (and \`panelAction: "promote"\` or \`"delete"\`) and re-add it via \`${dashboardTools.manageSections}\` with \`operation: "add"\` at a higher \`y\` to make room`
  );

export const dashboardManagementV2Skill = defineSkillType({
  id: 'dashboard-management',
  name: 'dashboard-management',
  basePath: 'skills/platform/dashboard',
  description:
    'Compose and update in-memory Kibana dashboards using a small family of focused, single-purpose tools, visualization attachments, and inline visualization editing.',
  content: `## When to Use This Skill

Use this skill when:
- A user asks to find, list, inspect, or modify existing Kibana dashboards.
- A user asks to create a dashboard from one or more visualizations.
- A user asks to update an in-memory dashboard created earlier in the conversation.
- A request involves dashboard metadata, markdown, panel, or section changes.

Do **not** use this skill when:
- The user asks for a standalone visualization rather than a dashboard.
- The user needs help exploring data, fields, or query logic.

## Discovery

For dashboard discovery:
- When a user asks what dashboards are available, search for existing saved dashboards with \`platform.core.sml_search\`.
- Use specific keywords from the user's request. For a broad listing of available dashboards, you may use \`keywords: ["*"]\`.
- Summarize matches in plain language by title and description, and include lightweight structure when available such as panel and section counts.
- Do **not** attach dashboards by default when only listing or comparing available dashboards.
- When the user wants to inspect or modify a saved dashboard, attach it with \`platform.core.sml_attach\` using the exact \`chunk_id\` from the search result.
- After attaching a saved dashboard, treat the returned dashboard attachment as the editable working copy. Use its \`attachment_id\` as the \`dashboardAttachmentId\` for later updates.

## Creating a new dashboard

Each tool below has a small, focused schema; never try to encode panels or sections in \`${dashboardTools.createDashboard}\`. The recipe is:

1. ONE call to \`${dashboardTools.createDashboard}\` with \`title\` and \`description\` only. Capture \`data.dashboardAttachment.id\` from the result; that is the \`dashboardAttachmentId\` for every follow-up call.
2. If the dashboard needs sections, ONE call to \`${dashboardTools.manageSections}\` with an \`operations[]\` array containing one \`operation: 'add'\` item per section (each with \`title\` and \`grid\`). Sections are created empty. Capture each returned section \`id\`.
3. ONE call to \`${dashboardTools.addPanels}\` with the full set of initial panels. Each panel sets \`kind\` (markdown / attachment / visualization) plus \`grid\`. Set \`sectionId\` on a panel only when you are placing it inside a section created in step 2.
   - When multiple panels can be planned together (even across sections), batch them into a single \`${dashboardTools.addPanels}\` call. Inline visualization resolution runs in parallel within one tool call.

## Updating an existing dashboard

- Always reuse \`data.dashboardAttachment.id\` from the prior tool result as \`dashboardAttachmentId\`.
- Never invent \`panelId\`, \`sectionId\`, or \`dashboardAttachmentId\`. Always use values returned by earlier tool results.
- Each tool below is one-purpose. Pick the smallest tool that does the job.

Tool reference:
- \`${dashboardTools.updateDashboardMetadata}\` — change title and/or description.
- \`${dashboardTools.addPanels}\` — add one or more panels. Each panel is a markdown, attachment, or visualization panel (\`kind\` discriminator) with its own \`grid\` and optional \`sectionId\`. Batch unrelated additions into a single call when possible.
- \`${dashboardTools.editPanels}\` — re-author existing ES|QL-backed Lens panels in place by \`panelId\`. Panel id, grid, and section placement are preserved.
- \`${dashboardTools.arrangePanels}\` — move, resize, or move-between-sections existing panels by \`panelId\`. Set \`sectionId\` to a section id to move into a section, or \`null\` to promote to the top level. Omit fields you don't want to change.
- \`${dashboardTools.removePanels}\` — delete one or more panels by \`panelId\`.
- \`${dashboardTools.manageSections}\` — add (empty) or remove sections; batch multiple section ops into a single call.

## Section workflows

- To add empty sections, batch them into ONE call to \`${dashboardTools.manageSections}\` with multiple \`operation: 'add'\` items.
- To populate a section (whether brand-new or pre-existing): call \`${dashboardTools.addPanels}\` with each panel's \`sectionId\` set to the section's id (returned by an earlier \`${dashboardTools.manageSections}\` or \`${dashboardTools.createDashboard}\` call).
- NEVER fabricate \`sectionId\`; always use the value returned by an earlier tool result.
- To delete a section, call \`${dashboardTools.manageSections}\` with \`operation: 'remove'\` and \`panelAction: 'promote'\` (move panels to top-level) or \`'delete'\` (delete them too). Multiple removes can be batched alongside adds in the same call.

## Non-ES|QL panels

- Attached dashboards can include DSL-based, form-based, or other non-ES|QL panels. Do not attempt to edit those panels directly with \`${dashboardTools.editPanels}\`.
- If the user asks to modify a non-ES|QL panel, explicitly explain that direct editing is not supported, propose recreating and replacing it as a new ES|QL-based Lens chart, and ask for confirmation before you remove or replace the existing panel.
- Never silently follow a remove-and-recreate flow for a non-ES|QL panel. Wait for explicit user confirmation before calling \`${dashboardTools.removePanels}\` or \`${dashboardTools.addPanels}\` for the replacement.

## Attachments

- A visualization attachment is a previously created visualization artifact identified by \`attachmentId\`.
- Use the \`attachment\` panel kind in \`${dashboardTools.addPanels}\` to add an existing visualization attachment as a dashboard panel.
- The \`visualization\` panel kind creates a new Lens visualization inline from natural language and does NOT create a standalone visualization attachment.
- A successful dashboard tool call returns a dashboard attachment in \`data.dashboardAttachment\`.
- Use \`data.dashboardAttachment.id\` as \`dashboardAttachmentId\` for follow-up updates.

## Failures

- Each tool returns its own \`data.failures[]\` when partial work fails (for example, an inline visualization could not be generated). Explain the failures to the user; do not silently retry destructively.
- If a whole tool call fails (returns an error result), the dashboard is in the state left by the previous successful tool call. Decide with the user whether to retry, roll forward, or start over.

## After a successful call

- Render the dashboard attachment inline so the user can see and interact with the dashboard card. Do NOT render individual visualization attachments inline during dashboard composition — only the final dashboard attachment should be rendered.
- Remember \`data.dashboardAttachment.id\` for follow-up updates.
- Use returned panel \`id\` values for future arranges, edits, and removals.
- Use returned \`sectionId\` values for future section-targeted changes.

${dashboardCompositionPrompt}

${v2GridLayoutPrompt}

## Edge Cases

- If a visualization attachment is missing or cannot be resolved, do not invent a replacement attachment ID. Call the tool only with valid attachment IDs and report unresolved attachments clearly.
- If the user asks to update a dashboard but the latest \`dashboardAttachmentId\` is not available in conversation context, ask which dashboard they mean or offer to create a new one with \`${dashboardTools.createDashboard}\`.
- Use \`${dashboardTools.arrangePanels}\` when the user wants to resize, reposition, or move panels without changing panel content.
- If a user wants to change a dashboard panel's visualization semantics, prefer \`${dashboardTools.editPanels}\` over removing and re-adding the panel, but only for ES|QL-backed Lens panels.
- If the tool returns partial failures, explain which inputs failed and include the reported error for each one.
`,
  getInlineTools: () => [
    createDashboardTool(),
    updateDashboardMetadataTool(),
    addPanelsTool(),
    editPanelsTool(),
    arrangePanelsTool(),
    removePanelsTool(),
    manageSectionsTool(),
  ],
});
