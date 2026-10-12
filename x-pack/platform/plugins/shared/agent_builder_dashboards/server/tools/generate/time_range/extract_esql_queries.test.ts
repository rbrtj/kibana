/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import type { AttachmentPanel, DashboardSection } from '@kbn/agent-builder-dashboards-common';
import { extractEsqlQueries } from './extract_esql_queries';

const Q_TIME_BOUND =
  'FROM logs-* | WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend | STATS count = COUNT(*)';

const lensPanel = (id: string, config: Record<string, unknown>): AttachmentPanel => ({
  type: LENS_EMBEDDABLE_TYPE,
  id,
  config,
  grid: { x: 0, y: 0, w: 24, h: 15 },
});

const esqlPanel = (id: string, query: string): AttachmentPanel =>
  lensPanel(id, { type: 'metric', data_source: { type: 'esql', query } });

const markdownPanel = (id: string): AttachmentPanel => ({
  type: 'markdown',
  id,
  config: { content: '# notes' },
  grid: { x: 0, y: 0, w: 24, h: 15 },
});

describe('extractEsqlQueries', () => {
  it('collects queries from top-level, sections and XY layers, ignoring markdown and duplicates', () => {
    const xyPanel = lensPanel('xy', {
      type: 'xy',
      layers: [
        { data_source: { type: 'esql', query: 'FROM metrics-a' } },
        { data_source: { type: 'esql', query: 'FROM metrics-b' } },
      ],
    });
    const section: DashboardSection = {
      id: 'sec',
      title: 'Section',
      collapsed: false,
      grid: { y: 0 },
      panels: [
        esqlPanel('s1', Q_TIME_BOUND), // duplicate of the top-level panel
        esqlPanel('s2', 'FROM traces-*'),
      ],
    };

    const queries = extractEsqlQueries([
      esqlPanel('top', Q_TIME_BOUND),
      markdownPanel('md'),
      xyPanel,
      section,
    ]);

    expect(queries).toEqual([Q_TIME_BOUND, 'FROM metrics-a', 'FROM metrics-b', 'FROM traces-*']);
  });

  it('returns an empty array when there are no Lens panels', () => {
    expect(extractEsqlQueries([markdownPanel('md')])).toEqual([]);
  });
});
