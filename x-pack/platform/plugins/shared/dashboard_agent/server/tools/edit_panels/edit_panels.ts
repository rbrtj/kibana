/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType } from '@kbn/agent-builder-common';
import { SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';

import { dashboardTools } from '../../../common';
import { runDashboardOperations } from '../_shared';

const editPanelInputSchema = z.object({
  panelId: z.string().describe('Existing panel id to update.'),
  query: z
    .string()
    .describe('A natural language query describing how to update the visualization.'),
  chartType: z
    .nativeEnum(SupportedChartType)
    .optional()
    .describe(
      '(optional) The type of chart to create as indicated by the user. If not provided, the LLM will suggest the best chart type.'
    ),
  esql: z
    .string()
    .optional()
    .describe(
      '(optional) An ES|QL query. If not provided, the tool will generate the query. Only pass ES|QL queries from reliable sources (other tool calls or the user) and NEVER invent queries directly.'
    ),
});

const editPanelsSchema = z.object({
  dashboardAttachmentId: z.string().describe('The dashboard attachment ID containing the panels.'),
  panels: z
    .array(editPanelInputSchema)
    .min(1)
    .describe('Panels to re-author in place by panelId. ES|QL-backed Lens panels only.'),
});

export const editPanelsTool = (): BuiltinSkillBoundedTool<typeof editPanelsSchema> => {
  return {
    id: dashboardTools.editPanels,
    type: ToolType.builtin,
    description: `Re-author existing ES|QL-backed Lens visualization panels in place by panelId. The panel's id, grid, and section placement are preserved.

DSL, form-based, and other non-ES|QL panels cannot be edited directly. For those, ask the user to confirm a recreate-and-replace flow with add_panels + remove_panels.`,
    schema: editPanelsSchema,
    handler: async (input, context) =>
      runDashboardOperations({
        toolName: dashboardTools.editPanels,
        context,
        previousAttachmentId: input.dashboardAttachmentId,
        operations: [
          {
            operation: 'edit_visualization_panels',
            panels: input.panels,
          },
        ],
        errorMetadata: { input },
      }),
  };
};
