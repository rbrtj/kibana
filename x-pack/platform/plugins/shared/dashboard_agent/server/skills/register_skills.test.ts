/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-plugin/server';
import { dashboardManagementV2Skill } from './dashboard_management_v2_skill';
import { registerSkills } from './register_skills';

describe('registerSkills', () => {
  it('registers the dashboard management skill', async () => {
    const register = jest.fn();
    const agentBuilder = {
      skills: { register },
    } as unknown as AgentBuilderPluginSetup;

    await registerSkills(agentBuilder);

    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(dashboardManagementV2Skill);
  });

  it('includes SML discovery instructions in the skill content', () => {
    expect(dashboardManagementV2Skill.content).toContain('platform.core.sml_search');
    expect(dashboardManagementV2Skill.content).toContain('platform.core.sml_attach');
  });
});
