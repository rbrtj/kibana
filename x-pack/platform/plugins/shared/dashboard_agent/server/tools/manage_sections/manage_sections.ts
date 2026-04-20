/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType } from '@kbn/agent-builder-common';
import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import { sectionGridSchema } from '@kbn/dashboard-agent-common';

import { dashboardTools } from '../../../common';
import { type DashboardOperation, runDashboardOperations } from '../_shared';

const addSectionInputSchema = z.object({
  operation: z.literal('add'),
  title: z.string().describe('Section title.'),
  grid: sectionGridSchema,
});

const removeSectionInputSchema = z.object({
  operation: z.literal('remove'),
  id: z.string().describe('Section id to remove.'),
  panelAction: z
    .enum(['promote', 'delete'])
    .describe('How to handle section panels: promote to top-level or delete them.'),
});

const sectionOperationSchema = z.discriminatedUnion('operation', [
  addSectionInputSchema,
  removeSectionInputSchema,
]);

const manageSectionsSchema = z.object({
  dashboardAttachmentId: z.string().describe('The dashboard attachment ID to update.'),
  operations: z
    .array(sectionOperationSchema)
    .min(1)
    .describe(
      'Section operations to apply in order. Use add to create empty sections; use remove with panelAction to delete sections.'
    ),
});

type SectionOperation = z.infer<typeof sectionOperationSchema>;

const sectionOperationToEngineOperation = (op: SectionOperation): DashboardOperation => {
  if (op.operation === 'add') {
    return {
      operation: 'add_section',
      title: op.title,
      grid: op.grid,
    };
  }
  return {
    operation: 'remove_section',
    id: op.id,
    panelAction: op.panelAction,
  };
};

export const manageSectionsTool = (): BuiltinSkillBoundedTool<typeof manageSectionsSchema> => {
  return {
    id: dashboardTools.manageSections,
    type: ToolType.builtin,
    description: `Add or remove dashboard sections.

Each operation is one of:
- add: create a new empty section with title and grid. To populate the section, follow up with add_panels and set sectionId on each panel.
- remove: delete an existing section by id. panelAction: "promote" moves its panels to the top level; "delete" deletes them too.

This tool intentionally does NOT accept inline panels on add. Always reuse the section id returned by an earlier tool result; never invent one.`,
    schema: manageSectionsSchema,
    handler: async (input, context) =>
      runDashboardOperations({
        toolName: dashboardTools.manageSections,
        context,
        previousAttachmentId: input.dashboardAttachmentId,
        operations: input.operations.map(sectionOperationToEngineOperation),
        errorMetadata: { input },
      }),
  };
};
