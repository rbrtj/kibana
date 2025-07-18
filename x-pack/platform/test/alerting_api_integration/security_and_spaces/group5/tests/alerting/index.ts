/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { setupSpacesAndUsers, tearDown } from '../../../setup';

export default function alertingApiIntegrationTests({
  loadTestFile,
  getService,
}: FtrProviderContext) {
  describe('Alerts - Group 5', function () {
    before(async () => {
      await setupSpacesAndUsers(getService);
    });

    after(async () => {
      await tearDown(getService);
    });

    loadTestFile(require.resolve('./create'));
    loadTestFile(require.resolve('./delete'));
    loadTestFile(require.resolve('./disable'));
    loadTestFile(require.resolve('./enable'));
    loadTestFile(require.resolve('./execution_status'));
    loadTestFile(require.resolve('./get'));
    loadTestFile(require.resolve('./get_alert_state'));
    loadTestFile(require.resolve('./get_alert_summary'));
    loadTestFile(require.resolve('./rule_types'));
    loadTestFile(require.resolve('./rule_types_internal'));
    loadTestFile(require.resolve('./retain_api_key'));
    loadTestFile(require.resolve('./bulk_untrack'));
    loadTestFile(require.resolve('./bulk_untrack_by_query'));
  });
}
