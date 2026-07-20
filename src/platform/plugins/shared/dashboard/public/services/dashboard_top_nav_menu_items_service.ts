/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AppMenuItemType } from '@kbn/core-chrome-app-menu-components';
import type { Observable } from 'rxjs';
import { BehaviorSubject } from 'rxjs';
import type { DashboardApi } from '../dashboard_api/types';

export type DashboardTopNavMenuItemFactory = (dashboardApi: DashboardApi) => AppMenuItemType;

class DashboardTopNavMenuItemsService {
  private readonly menuItemFactories = new Set<DashboardTopNavMenuItemFactory>();
  private readonly menuItemFactories$ = new BehaviorSubject<
    readonly DashboardTopNavMenuItemFactory[]
  >([]);

  public register(menuItemFactory: DashboardTopNavMenuItemFactory): () => void {
    this.menuItemFactories.add(menuItemFactory);
    this.publish();

    return () => {
      if (this.menuItemFactories.delete(menuItemFactory)) {
        this.publish();
      }
    };
  }

  public get$(): Observable<readonly DashboardTopNavMenuItemFactory[]> {
    return this.menuItemFactories$;
  }

  public clear(): void {
    this.menuItemFactories.clear();
    this.publish();
  }

  private publish(): void {
    this.menuItemFactories$.next([...this.menuItemFactories]);
  }
}

export const dashboardTopNavMenuItemsService = new DashboardTopNavMenuItemsService();
