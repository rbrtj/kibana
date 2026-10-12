/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { posix } from 'path';
import { internalTools, platformCoreTools } from '@kbn/agent-builder-common';
import { DASHBOARD_ATTACHMENT_TYPE } from '@kbn/agent-builder-dashboards-common';
import { dashboardsSkill } from './dashboards_skill';

const referencedContent = dashboardsSkill.referencedContent ?? [];

const backtickedToolIds = (text: string): string[] =>
  Array.from(text.matchAll(/`(platform\.[\w.]+)`/g), ([, id]) => id);

describe('dashboardsSkill', () => {
  it('names only known tool and attachment type ids in its content and referenced content', async () => {
    const inlineTools = (await dashboardsSkill.getInlineTools?.()) ?? [];
    const knownToolIds = new Set<string>([
      ...inlineTools.map(({ id }) => id),
      ...Object.values(platformCoreTools),
      ...Object.values(internalTools),
      DASHBOARD_ATTACHMENT_TYPE,
    ]);
    const namedToolIds = [
      dashboardsSkill.content,
      ...referencedContent.map(({ content }) => content),
    ].flatMap(backtickedToolIds);

    expect(namedToolIds.length).toBeGreaterThan(0);
    expect(namedToolIds.filter((id) => !knownToolIds.has(id))).toEqual([]);
  });

  it('names the path of every referenced content item in its content', () => {
    const referencedPaths = referencedContent.map(({ name, relativePath }) =>
      posix.join('/', dashboardsSkill.basePath, dashboardsSkill.name, relativePath, `${name}.md`)
    );

    expect(referencedPaths).toEqual(['/skills/platform/dashboard/dashboards/enhance.md']);
    expect(referencedPaths.filter((path) => !dashboardsSkill.content.includes(path))).toEqual([]);
  });
});
