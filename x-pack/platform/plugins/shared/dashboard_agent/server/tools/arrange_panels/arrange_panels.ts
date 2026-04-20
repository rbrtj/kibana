/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType } from '@kbn/agent-builder-common';
import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import { panelGridSchema } from '@kbn/dashboard-agent-common';

import { dashboardTools } from '../../../common';
import { runDashboardOperations } from '../_shared';

const arrangePanelInputSchema = z.object({
  panelId: z.string().describe('ID of the panel to arrange.'),
  grid: panelGridSchema
    .optional()
    .describe('New grid position/size. Omit to keep the current grid.'),
  sectionId: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Move panel to an existing section by its id. The section must already exist. null promotes the panel to the top level. Omit to keep the current location.'
    ),
});

const arrangePanelsSchema = z.object({
  dashboardAttachmentId: z.string().describe('The dashboard attachment ID to arrange.'),
  panels: z
    .array(arrangePanelInputSchema)
    .min(1)
    .describe(
      'Layout updates by panelId. Each entry may resize, reposition, or move-between-sections without changing panel content.'
    ),
});

export const arrangePanelsTool = (): BuiltinSkillBoundedTool<typeof arrangePanelsSchema> => {
  return {
    id: dashboardTools.arrangePanels,
    type: ToolType.builtin,
    description: `Move, resize, or move-between-sections existing panels by panelId. Panel content is unchanged.

Set sectionId to move a panel into a section, or null to promote it to the top level. Omit sectionId to keep the panel where it is. Omit grid to keep the current size and position.`,
    schema: arrangePanelsSchema,
    handler: async (input, context) =>
      runDashboardOperations({
        toolName: dashboardTools.arrangePanels,
        context,
        previousAttachmentId: input.dashboardAttachmentId,
        operations: [
          {
            operation: 'update_panel_layouts',
            panels: input.panels,
          },
        ],
        errorMetadata: { input },
      }),
  };
};
