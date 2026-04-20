/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Namespace for dashboard-related tools
 */
export const DASHBOARD_NAMESPACE = 'platform.dashboard';

/**
 * Helper function to create tool IDs in the dashboard namespace
 */
const dashboardTool = (toolName: string) => {
  return `${DASHBOARD_NAMESPACE}.${toolName}`;
};

/**
 * Ids of built-in dashboard tools.
 * These tools are registered by the dashboard_agent plugin.
 */
export const dashboardTools = {
  /** @deprecated retained until the v2 split is fully cut over. */
  manageDashboard: dashboardTool('manage_dashboard'),
  createDashboard: dashboardTool('create_dashboard'),
  updateDashboardMetadata: dashboardTool('update_dashboard_metadata'),
  addPanels: dashboardTool('add_panels'),
  editPanels: dashboardTool('edit_panels'),
  arrangePanels: dashboardTool('arrange_panels'),
  removePanels: dashboardTool('remove_panels'),
  manageSections: dashboardTool('manage_sections'),
} as const;
