/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DashboardTopNavMenuItemFactory } from './dashboard_top_nav_menu_items_service';
import { dashboardTopNavMenuItemsService } from './dashboard_top_nav_menu_items_service';

describe('dashboardTopNavMenuItemsService', () => {
  afterEach(() => {
    dashboardTopNavMenuItemsService.clear();
  });

  it('publishes registered menu item factories and removes them on cleanup', () => {
    const emissions: Array<readonly DashboardTopNavMenuItemFactory[]> = [];
    const subscription = dashboardTopNavMenuItemsService.get$().subscribe((factories) => {
      emissions.push(factories);
    });
    const factory: DashboardTopNavMenuItemFactory = () => ({
      id: 'test-item',
      label: 'Test item',
      iconType: 'gear',
      order: 0,
      run: jest.fn(),
    });

    const unregister = dashboardTopNavMenuItemsService.register(factory);
    expect(emissions.at(-1)).toEqual([factory]);

    unregister();
    expect(emissions.at(-1)).toEqual([]);
    subscription.unsubscribe();
  });
});
