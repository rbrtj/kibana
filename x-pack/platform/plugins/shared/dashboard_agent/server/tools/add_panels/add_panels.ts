/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType } from '@kbn/agent-builder-common';
import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';

import { dashboardTools } from '../../../common';
import { panelInputSchema, panelInputToOperation, runDashboardOperations } from '../_shared';

const addPanelsSchema = z.object({
  dashboardAttachmentId: z.string().describe('The dashboard attachment ID to add panels to.'),
  panels: z
    .array(panelInputSchema)
    .min(1)
    .describe(
      'Panels to add. Each panel is a markdown, attachment, or visualization panel with its own grid. Set sectionId to add the panel into an existing section.'
    ),
});

export const addPanelsTool = (): BuiltinSkillBoundedTool<typeof addPanelsSchema> => {
  return {
    id: dashboardTools.addPanels,
    type: ToolType.builtin,
    description: `Add one or more panels to an existing dashboard.

Each panel is one of:
- markdown: a markdown text panel.
- attachment: a panel sourced from an existing visualization attachment by attachmentId.
- visualization: a new Lens visualization panel created inline from natural language (with optional ES|QL or chartType).

Set sectionId on a panel to place it inside an existing section. Always batch related panels into a single call so they can be created in parallel.`,
    schema: addPanelsSchema,
    handler: async (input, context) =>
      runDashboardOperations({
        toolName: dashboardTools.addPanels,
        context,
        previousAttachmentId: input.dashboardAttachmentId,
        operations: input.panels.map(panelInputToOperation),
        errorMetadata: { input },
      }),
  };
};
