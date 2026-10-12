/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MARKDOWN_EMBEDDABLE_TYPE } from '@kbn/dashboard-markdown-schemas';
import { executeDashboardOperations } from '../operations';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import {
  logger,
  getSections,
  getPanelsOnly,
  buildDashboard,
  requestItem,
  markdownItem,
  attachmentItem,
  success,
  failure,
  resolveAttachment,
  createResolvePanelContent,
} from './test_helpers';

describe('add_section', () => {
  it('adds an empty section with generated sectionId and default collapsed=false', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [{ operation: 'add_section', title: 'Overview', grid: { y: 12 } }],
      logger,
    });

    expect(getSections(result.dashboardData.panels)).toEqual([
      {
        id: expect.any(String),
        title: 'Overview',
        collapsed: false,
        grid: { y: 12 },
        panels: [],
      },
    ]);
  });

  it('adds a section with inline visualization panels in a single operation', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [
        {
          operation: 'add_section',
          title: 'Overview',
          grid: { y: 12 },
          panels: [
            requestItem('show total requests'),
            requestItem('show error rate', { grid: { x: 24, y: 0, w: 24, h: 9 } }),
          ],
        },
      ],
      logger,
      resolvePanelContent: createResolvePanelContent({
        'show error rate': success({ type: LENS_EMBEDDABLE_TYPE, config: { type: 'bar' } }),
      }),
    });

    expect(getPanelsOnly(result.dashboardData.panels)).toEqual([]);
    expect(getSections(result.dashboardData.panels)).toEqual([
      {
        id: expect.any(String),
        title: 'Overview',
        collapsed: false,
        grid: { y: 12 },
        panels: [
          expect.objectContaining({
            type: LENS_EMBEDDABLE_TYPE,
            config: { type: 'metric' },
            grid: { x: 0, y: 0, w: 24, h: 9 },
          }),
          expect.objectContaining({
            type: LENS_EMBEDDABLE_TYPE,
            config: { type: 'bar' },
            grid: { x: 24, y: 0, w: 24, h: 9 },
          }),
        ],
      },
    ]);
  });

  it('records inline visualization failures when adding a section and keeps successful panels', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [
        {
          operation: 'add_section',
          title: 'Overview',
          grid: { y: 12 },
          panels: [
            requestItem('show total requests'),
            requestItem('show p95 latency', { grid: { x: 24, y: 0, w: 24, h: 9 } }),
          ],
        },
      ],
      logger,
      resolvePanelContent: createResolvePanelContent({
        'show p95 latency': failure('add_section', 'show p95 latency', 'ES|QL generation failed'),
      }),
    });

    const sections = getSections(result.dashboardData.panels);

    expect(sections).toHaveLength(1);
    expect(sections[0].panels).toEqual([
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 0, y: 0, w: 24, h: 9 },
      }),
    ]);
    expect(result.failures).toEqual([
      {
        type: 'add_section',
        identifier: 'show p95 latency',
        error: 'ES|QL generation failed',
      },
    ]);
  });

  it('adds non-visualization section panels without a visualization resolver', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [
        {
          operation: 'add_section',
          title: 'Overview',
          grid: { y: 12 },
          panels: [
            markdownItem('### Section Summary', { grid: { x: 0, y: 0, w: 24, h: 4 } }),
            attachmentItem('metric-vis', { grid: { x: 24, y: 0, w: 24, h: 9 } }),
          ],
        },
      ],
      logger,
      resolveAttachmentPanel: resolveAttachment,
    });

    expect(getSections(result.dashboardData.panels)[0].panels).toEqual([
      expect.objectContaining({
        type: MARKDOWN_EMBEDDABLE_TYPE,
        config: { content: '### Section Summary', settings: { open_links_in_new_tab: true } },
      }),
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 24, y: 0, w: 24, h: 9 },
      }),
    ]);
  });

  it('adds an attachment panel inside a new section', async () => {
    const resolveAttachmentPanel = jest.fn(resolveAttachment);

    const result = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [
        {
          operation: 'add_section',
          title: 'Overview',
          grid: { y: 0 },
          panels: [attachmentItem('att-1')],
        },
      ],
      logger,
      resolveAttachmentPanel,
    });

    expect(resolveAttachmentPanel).toHaveBeenCalledWith('att-1', 'add_section');
    expect(result.failures).toEqual([]);
    expect(getSections(result.dashboardData.panels)).toEqual([
      {
        id: expect.any(String),
        title: 'Overview',
        collapsed: false,
        grid: { y: 0 },
        panels: [
          {
            id: expect.any(String),
            type: LENS_EMBEDDABLE_TYPE,
            config: { type: 'metric' },
            grid: { x: 0, y: 0, w: 24, h: 9 },
          },
        ],
      },
    ]);
  });

  it('keeps the section when an attachment inside it cannot be resolved', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [
        {
          operation: 'add_section',
          title: 'Overview',
          grid: { y: 0 },
          panels: [attachmentItem('att-missing')],
        },
      ],
      logger,
      resolveAttachmentPanel: resolveAttachment,
    });

    expect(result.failures).toEqual([
      { type: 'add_section', identifier: 'att-missing', error: 'not found' },
    ]);
    expect(getSections(result.dashboardData.panels)).toEqual([
      expect.objectContaining({ title: 'Overview', panels: [] }),
    ]);
  });
});
