/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-plugin/server';
import { dashboardManagementV2Skill } from './dashboard_management_v2_skill';

/**
 * The v1 `dashboardManagementSkill` is intentionally kept on disk but no longer
 * registered, so we can revert the cutover with a one-line swap if the v2 split
 * regresses behavior during evaluation.
 */
export const registerSkills = (agentBuilder: AgentBuilderPluginSetup): void => {
  agentBuilder.skills.register(dashboardManagementV2Skill);
};
