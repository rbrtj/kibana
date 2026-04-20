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
import { dashboardOperationSchema, runDashboardOperations } from '../_shared';

const manageDashboardSchema = z.object({
  dashboardAttachmentId: z
    .string()
    .optional()
    .describe(
      '(optional) The dashboard attachment ID to modify. If not provided, a new dashboard is created.'
    ),
  operations: z.array(dashboardOperationSchema).min(1),
});

export const manageDashboardTool = (): BuiltinSkillBoundedTool<typeof manageDashboardSchema> => {
  return {
    id: dashboardTools.manageDashboard,
    type: ToolType.builtin,
    description: `Create or update an in-memory dashboard with visualizations.

This tool executes ordered dashboard operations against a dashboard attachment in conversation context.

Use operations[] to:
1. set metadata
2. add markdown
3. add panels from attachments
4. create Lens visualization panels inline from natural language
5. edit existing Lens visualization panels
6. update panel layouts without changing content
7. add / remove sections, including inline section panels during add_section
8. remove panels`,
    schema: manageDashboardSchema,
    handler: async ({ dashboardAttachmentId, operations }, context) =>
      runDashboardOperations({
        toolName: dashboardTools.manageDashboard,
        context,
        previousAttachmentId: dashboardAttachmentId,
        operations,
        errorMetadata: { dashboardAttachmentId, operations },
      }),
  };
};
