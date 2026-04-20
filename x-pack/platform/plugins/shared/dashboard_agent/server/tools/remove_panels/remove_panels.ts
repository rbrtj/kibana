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
import { runDashboardOperations } from '../_shared';

const removePanelsSchema = z.object({
  dashboardAttachmentId: z.string().describe('The dashboard attachment ID to remove panels from.'),
  panelIds: z
    .array(z.string())
    .min(1)
    .describe(
      'Panel ids to remove. Use a single call to remove multiple panels at once. To remove a section, use manage_sections instead.'
    ),
});

export const removePanelsTool = (): BuiltinSkillBoundedTool<typeof removePanelsSchema> => {
  return {
    id: dashboardTools.removePanels,
    type: ToolType.builtin,
    description: `Remove one or more existing panels from a dashboard by panelId. Removes both top-level panels and panels nested inside sections.`,
    schema: removePanelsSchema,
    handler: async (input, context) =>
      runDashboardOperations({
        toolName: dashboardTools.removePanels,
        context,
        previousAttachmentId: input.dashboardAttachmentId,
        operations: [
          {
            operation: 'remove_panels',
            panelIds: input.panelIds,
          },
        ],
        errorMetadata: { input },
      }),
  };
};
