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

const updateDashboardMetadataSchema = z.object({
  dashboardAttachmentId: z.string().describe('The dashboard attachment ID to update.'),
  title: z.string().optional().describe('(optional) New dashboard title.'),
  description: z.string().optional().describe('(optional) New dashboard description.'),
});

export const updateDashboardMetadataTool = (): BuiltinSkillBoundedTool<
  typeof updateDashboardMetadataSchema
> => {
  return {
    id: dashboardTools.updateDashboardMetadata,
    type: ToolType.builtin,
    description: `Update an existing dashboard's title and/or description without changing its panels.`,
    schema: updateDashboardMetadataSchema,
    handler: async (input, context) =>
      runDashboardOperations({
        toolName: dashboardTools.updateDashboardMetadata,
        context,
        previousAttachmentId: input.dashboardAttachmentId,
        operations: [
          {
            operation: 'set_metadata',
            title: input.title,
            description: input.description,
          },
        ],
        errorMetadata: { input },
      }),
  };
};
