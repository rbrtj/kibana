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

const createDashboardSchema = z.object({
  title: z.string().describe('Dashboard title.'),
  description: z.string().describe('Dashboard description.'),
});

export const createDashboardTool = (): BuiltinSkillBoundedTool<typeof createDashboardSchema> => {
  return {
    id: dashboardTools.createDashboard,
    type: ToolType.builtin,
    description: `Create a new, empty in-memory dashboard with a title and description.

Use this when no dashboardAttachmentId exists yet. The returned dashboardAttachmentId is the working copy for all follow-up edits.

This tool intentionally does NOT accept panels or sections. Add content with focused follow-up tools:
- manage_sections to add sections (one-shot for multiple sections is supported via the operations[] array).
- add_panels to add markdown, attachment, or visualization panels (with optional sectionId).
- update_dashboard_metadata to revise the title or description later.`,
    schema: createDashboardSchema,
    handler: async ({ title, description }, context) =>
      runDashboardOperations({
        toolName: dashboardTools.createDashboard,
        context,
        operations: [{ operation: 'set_metadata', title, description }],
        errorMetadata: { title, description },
      }),
  };
};
