/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, waitFor, screen } from '@testing-library/react';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';
import { BehaviorSubject, Subject } from 'rxjs';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import type { DashboardApi } from '@kbn/dashboard-plugin/public';
import { DashboardRenderer } from '@kbn/dashboard-plugin/public';
import type { DataView } from '@kbn/data-views-plugin/common';
import { ActionButtonType } from '@kbn/agent-builder-browser/attachments';
import type { ActionButton } from '@kbn/agent-builder-browser/attachments';
import type { DashboardAttachment } from '@kbn/agent-builder-dashboards-common/types';
import type { Filter, Query, TimeRange } from '@kbn/es-query';
import { DASHBOARD_ATTACHMENT_TYPE } from '@kbn/agent-builder-dashboards-common';
import { DashboardCanvasAttachment } from './dashboard_canvas_attachment';
import type { DashboardCanvasAttachmentProps } from './dashboard_canvas_attachment';
import type { useDashboardPreviewUnifiedSearch } from './use_dashboard_preview_unified_search';

jest.mock('@kbn/dashboard-plugin/public', () => ({
  DashboardRenderer: jest.fn(),
}));

type SearchBarProps = ReturnType<typeof useDashboardPreviewUnifiedSearch>['searchBarProps'];

const MockSearchBar = jest.fn((_props: SearchBarProps) => <div data-test-subj="searchBar" />);

const PREVIEW_ERROR_TITLE = 'This dashboard preview could not be rendered.';

describe('DashboardCanvasAttachment', () => {
  type MockDashboardApi = DashboardApi & {
    children$: BehaviorSubject<Record<string, unknown>>;
    dataViews$: BehaviorSubject<DataView[]>;
    isApproximate$: BehaviorSubject<boolean>;
  };

  const createMockDashboardApi = (
    overrides: Partial<Pick<DashboardApi, 'isManaged' | 'isEditableByUser'>> = {}
  ): MockDashboardApi => {
    const children$ = new BehaviorSubject<Record<string, unknown>>({});
    const dataViews$ = new BehaviorSubject<DataView[]>([]);
    const filters$ = new BehaviorSubject<Filter[]>([]);
    const isApproximate$ = new BehaviorSubject(false);
    const query$ = new BehaviorSubject<Query | undefined>(undefined);
    const timeRange$ = new BehaviorSubject({ from: 'now-15m', to: 'now' });

    return {
      children$,
      locator: {
        navigate: jest.fn().mockResolvedValue(undefined),
      },
      dataViews$,
      filters$,
      forceRefresh: jest.fn(),
      isApproximate$,
      query$,
      isEditableByUser: true,
      isManaged: false,
      runQuickSave: jest.fn().mockResolvedValue(undefined),
      runInteractiveSave: jest.fn().mockResolvedValue({ id: 'new-dashboard-id' }),
      savedObjectId$: new BehaviorSubject<string | undefined>(undefined),
      setFilters: jest.fn((nextFilters?: Filter[]) => filters$.next(nextFilters ?? [])),
      setEsqlApproximation: jest.fn((isApproximate: boolean) => isApproximate$.next(isApproximate)),
      setQuery: jest.fn((nextQuery?: Query) => query$.next(nextQuery)),
      setViewMode: jest.fn(),
      setTimeRange: jest.fn((nextTimeRange?: { from: string; to: string }) => {
        if (nextTimeRange) {
          timeRange$.next(nextTimeRange);
        }
      }),
      timeRange$,
      ...overrides,
    } as unknown as MockDashboardApi;
  };

  const createMockFilterManager = () => {
    let currentFilters: Filter[] = [];
    const updates$ = new Subject<void>();

    return {
      getFilters: jest.fn(() => currentFilters),
      getUpdates$: jest.fn(() => updates$.asObservable()),
      setFilters: jest.fn((nextFilters: Filter[]) => {
        currentFilters = nextFilters;
        updates$.next();
      }),
      emitFilters: (nextFilters: Filter[]) => {
        currentFilters = nextFilters;
        updates$.next();
      },
    };
  };

  const createMockTimefilter = () => {
    let currentTime: TimeRange = { from: 'now-15m', to: 'now' };
    const timeUpdate$ = new Subject<void>();

    return {
      getTime: jest.fn(() => currentTime),
      getTimeUpdate$: jest.fn(() => timeUpdate$.asObservable()),
      setTime: jest.fn((nextTime: TimeRange) => {
        currentTime = nextTime;
        timeUpdate$.next();
      }),
      emitTime: (nextTime: TimeRange) => {
        currentTime = nextTime;
        timeUpdate$.next();
      },
    };
  };

  const createMockData = (
    filterManager: ReturnType<typeof createMockFilterManager>,
    timefilter: ReturnType<typeof createMockTimefilter>
  ) => {
    const data = dataPluginMock.createStartContract();
    Object.assign(data.query.filterManager, filterManager);
    Object.assign(data.query.timefilter.timefilter, timefilter);
    return data;
  };

  const mockAttachment: DashboardAttachment = {
    type: DASHBOARD_ATTACHMENT_TYPE,
    id: 'test-dashboard-id',
    data: {
      title: 'Test Dashboard',
      description: 'Test Description',
      panels: [],
    },
  };

  const withOrigin = (origin: string): DashboardAttachment => ({ ...mockAttachment, origin });

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(DashboardRenderer)
      .mockImplementation(() => <div data-test-subj="dashboardRenderer" />);
  });

  const getSearchBarProps = (): SearchBarProps => {
    const lastCall = MockSearchBar.mock.calls.at(-1);
    if (!lastCall) {
      throw new Error('SearchBar was not rendered');
    }
    return lastCall[0];
  };

  const renderDashboardCanvasAttachment = async (
    propsOverride: Partial<DashboardCanvasAttachmentProps> = {},
    {
      canWriteDashboards = true,
      mockApiOverrides = {},
      waitForRenderer = true,
    }: {
      canWriteDashboards?: boolean;
      mockApiOverrides?: Partial<Pick<DashboardApi, 'isManaged' | 'isEditableByUser'>>;
      waitForRenderer?: boolean;
    } = {}
  ) => {
    const registerActionButtons: jest.MockedFunction<
      DashboardCanvasAttachmentProps['registerActionButtons']
    > = jest.fn();
    const updateOrigin: jest.MockedFunction<DashboardCanvasAttachmentProps['updateOrigin']> = jest
      .fn()
      .mockResolvedValue(undefined);
    const closeCanvas: jest.MockedFunction<DashboardCanvasAttachmentProps['closeCanvas']> =
      jest.fn();
    const checkSavedDashboardExist: jest.MockedFunction<
      DashboardCanvasAttachmentProps['checkSavedDashboardExist']
    > = jest.fn().mockResolvedValue(false);
    const mockFilterManager = createMockFilterManager();
    const mockTimefilter = createMockTimefilter();
    const mockApi = createMockDashboardApi(mockApiOverrides);
    const openSidebarConversation = jest.fn();

    const props: DashboardCanvasAttachmentProps = {
      attachment: mockAttachment,
      isSidebar: false,
      dashboardLocator: undefined,
      searchBarComponent:
        MockSearchBar as unknown as DashboardCanvasAttachmentProps['searchBarComponent'],
      data: createMockData(mockFilterManager, mockTimefilter),
      registerActionButtons,
      updateOrigin,
      closeCanvas,
      checkSavedDashboardExist,
      openSidebarConversation,
      canWriteDashboards,
      ...propsOverride,
    };

    renderWithKibanaRenderContext(<DashboardCanvasAttachment {...props} />);

    if (waitForRenderer) {
      await waitFor(() => {
        expect(DashboardRenderer).toHaveBeenCalled();
      });
      const { onApiAvailable } = jest.mocked(DashboardRenderer).mock.calls[0][0];
      act(() => {
        onApiAvailable?.(mockApi, {} as Parameters<NonNullable<typeof onApiAvailable>>[1]);
      });
    }

    const getButton = (label: string): ActionButton => {
      const button = registerActionButtons.mock.calls.at(-1)?.[0].find((b) => b.label === label);
      if (!button) {
        throw new Error(`No "${label}" action button registered`);
      }
      return button;
    };

    const clickButton = async (label: string) => {
      await act(async () => {
        await getButton(label).handler();
      });
    };

    return {
      props,
      mockApi,
      mockFilterManager,
      mockTimefilter,
      registerActionButtons,
      updateOrigin: props.updateOrigin,
      closeCanvas,
      openSidebarConversation,
      clickButton,
    };
  };

  it('registers enabled Edit and Save buttons once the dashboard API is available', async () => {
    const { registerActionButtons } = await renderDashboardCanvasAttachment();

    expect(registerActionButtons.mock.calls[0]).toEqual([[]]);
    expect(registerActionButtons).toHaveBeenLastCalledWith([
      {
        label: 'Edit in Dashboards',
        type: ActionButtonType.PRIMARY,
        disabled: false,
        disabledReason: undefined,
        handler: expect.any(Function),
      },
      {
        label: 'Save',
        icon: 'save',
        type: ActionButtonType.PRIMARY,
        disabled: false,
        disabledReason: undefined,
        handler: expect.any(Function),
      },
    ]);
  });

  it.each([
    [
      'dashboard write access is unavailable',
      {},
      { canWriteDashboards: false },
      'You need dashboard write permissions to edit or save dashboards.',
    ],
    [
      'the linked dashboard is managed',
      { attachment: withOrigin('managed-dashboard-id') },
      { mockApiOverrides: { isManaged: true } },
      'Managed dashboards are read-only.',
    ],
    [
      'the linked dashboard is read-only',
      { attachment: withOrigin('read-only-dashboard-id') },
      { mockApiOverrides: { isEditableByUser: false } },
      'You do not have permission to edit this dashboard.',
    ],
  ])(
    'disables Edit and Save and makes them no-ops when %s',
    async (_, propsOverride, options, disabledReason) => {
      const {
        registerActionButtons,
        mockApi,
        updateOrigin,
        closeCanvas,
        openSidebarConversation,
        clickButton,
      } = await renderDashboardCanvasAttachment(
        { ...propsOverride, checkSavedDashboardExist: jest.fn().mockResolvedValue(true) },
        options
      );

      expect(registerActionButtons).toHaveBeenLastCalledWith([
        expect.objectContaining({ label: 'Edit in Dashboards', disabled: true, disabledReason }),
        expect.objectContaining({ label: 'Save', disabled: true, disabledReason }),
      ]);

      await clickButton('Edit in Dashboards');
      await clickButton('Save');

      expect(mockApi.locator?.navigate).not.toHaveBeenCalled();
      expect(closeCanvas).not.toHaveBeenCalled();
      expect(openSidebarConversation).not.toHaveBeenCalled();
      expect(mockApi.runQuickSave).not.toHaveBeenCalled();
      expect(mockApi.runInteractiveSave).not.toHaveBeenCalled();
      expect(updateOrigin).not.toHaveBeenCalled();
    }
  );

  it('configures Fast mode for the dashboard preview', async () => {
    const { mockApi } = await renderDashboardCanvasAttachment();

    expect(getSearchBarProps().esqlApproximation).toEqual(
      expect.objectContaining({
        isApproximate: false,
        disabled: true,
      })
    );

    act(() => {
      mockApi.children$.next({
        'esql-panel': {
          esql$: new BehaviorSubject([{ esql: 'FROM logs | LIMIT 10' }]),
          approximationApplied$: new BehaviorSubject<boolean | undefined>(undefined),
        },
      });
    });

    await waitFor(() => {
      expect(getSearchBarProps().esqlApproximation).toEqual(
        expect.objectContaining({ disabled: false })
      );
    });

    act(() => {
      getSearchBarProps().esqlApproximation.onChange(true);
    });

    expect(mockApi.setEsqlApproximation).toHaveBeenCalledWith(true);
    expect(getSearchBarProps().esqlApproximation).toEqual(
      expect.objectContaining({ isApproximate: true })
    );
  });

  it.each<[string, Query, Query]>([
    [
      'a KQL query',
      { query: 'host.name: "web-01"', language: 'kuery' },
      { query: 'host.name: "web-01"', language: 'kuery' },
    ],
    ['a blank query', { query: '   ', language: 'kuery' }, { query: '', language: 'kuery' }],
    [
      'a non-string query payload',
      { query: { bool: { filter: [{ term: { 'host.name': 'web-01' } }] } }, language: 'kuery' },
      { query: { bool: { filter: [{ term: { 'host.name': 'web-01' } }] } }, language: 'kuery' },
    ],
  ])(
    'applies %s and the time range from the preview search bar',
    async (_, submittedQuery, expectedQuery) => {
      const { mockApi } = await renderDashboardCanvasAttachment();

      act(() => {
        getSearchBarProps().onQuerySubmit({
          dateRange: { from: 'now-2h', to: 'now' },
          query: { query: 'previous', language: 'kuery' },
        });
      });
      act(() => {
        getSearchBarProps().onQuerySubmit({
          dateRange: { from: 'now-1h', to: 'now' },
          query: submittedQuery,
        });
      });

      expect(mockApi.setQuery).toHaveBeenLastCalledWith(expectedQuery);
      expect(mockApi.setTimeRange).toHaveBeenLastCalledWith({ from: 'now-1h', to: 'now' });
      expect(mockApi.forceRefresh).toHaveBeenCalledTimes(2);
    }
  );

  it('updates dashboard filters from the preview filter bar', async () => {
    const { mockApi, mockFilterManager } = await renderDashboardCanvasAttachment();
    const nextFilters = [{ meta: { key: 'host.name' } }] as Filter[];

    act(() => {
      getSearchBarProps().onFiltersUpdated(nextFilters);
    });

    expect(mockFilterManager.setFilters).toHaveBeenCalledWith(nextFilters);
    expect(mockApi.setFilters).toHaveBeenLastCalledWith(nextFilters);
    expect(getSearchBarProps().filters).toEqual(nextFilters);
  });

  it('updates query bar index patterns when dashboard data views are published', async () => {
    const { mockApi } = await renderDashboardCanvasAttachment();
    const nextDataViews = [{ id: 'logs-*', title: 'logs-*' }] as DataView[];

    expect(getSearchBarProps().indexPatterns).toEqual([]);

    act(() => {
      mockApi.dataViews$.next(nextDataViews);
    });

    expect(getSearchBarProps().indexPatterns).toEqual(nextDataViews);
  });

  it('updates the preview filter pills when filters are created through the filter manager API', async () => {
    const { mockApi, mockFilterManager } = await renderDashboardCanvasAttachment();
    const nextFilters = [{ meta: { key: 'extension' } }] as Filter[];

    act(() => {
      mockFilterManager.emitFilters(nextFilters);
    });

    expect(mockApi.setFilters).toHaveBeenLastCalledWith(nextFilters);
    expect(getSearchBarProps().filters).toEqual(nextFilters);
  });

  it('updates the preview time range when timefilter emits (e.g. chart brush)', async () => {
    const { mockApi, mockTimefilter } = await renderDashboardCanvasAttachment();
    const nextTimeRange = { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' };

    act(() => {
      mockTimefilter.emitTime(nextTimeRange);
    });

    expect(mockApi.setTimeRange).toHaveBeenLastCalledWith(nextTimeRange);
    expect(getSearchBarProps()).toEqual(
      expect.objectContaining({
        dateRangeFrom: nextTimeRange.from,
        dateRangeTo: nextTimeRange.to,
      })
    );
  });

  it('refreshes the embedded dashboard from the preview search bar', async () => {
    const { mockApi } = await renderDashboardCanvasAttachment();

    act(() => {
      getSearchBarProps().onRefresh();
    });

    expect(mockApi.forceRefresh).toHaveBeenCalledTimes(1);
  });

  it('opens the live preview state in Dashboards and hands the conversation to the sidebar', async () => {
    const { mockApi, closeCanvas, openSidebarConversation, clickButton } =
      await renderDashboardCanvasAttachment();
    const nextFilters = [{ meta: { key: 'host.name' } }] as Filter[];

    act(() => {
      getSearchBarProps().onFiltersUpdated(nextFilters);
      getSearchBarProps().onQuerySubmit({
        dateRange: { from: 'now-1h', to: 'now' },
        query: { query: 'host.name: "web-01"', language: 'kuery' },
      });
    });

    await clickButton('Edit in Dashboards');

    expect(mockApi.locator?.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test Dashboard',
        description: 'Test Description',
        panels: [],
        filters: nextFilters,
        query: { query: 'host.name: "web-01"', language: 'kuery' },
        time_range: { from: 'now-1h', to: 'now' },
        dashboardId: undefined,
        viewMode: 'edit',
      })
    );
    expect(closeCanvas).toHaveBeenCalledTimes(1);
    expect(openSidebarConversation).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['exists', true, 'linked-dashboard-id', 'runQuickSave', 'linked-dashboard-id'],
    ['no longer exists', false, undefined, 'runInteractiveSave', 'new-dashboard-id'],
  ] as const)(
    'targets the linked dashboard only when it %s',
    async (_, exists, linkedId, saveMethod, savedOrigin) => {
      const { mockApi, updateOrigin, clickButton } = await renderDashboardCanvasAttachment({
        attachment: withOrigin('linked-dashboard-id'),
        checkSavedDashboardExist: jest.fn().mockResolvedValue(exists),
      });

      expect(DashboardRenderer).toHaveBeenLastCalledWith(
        expect.objectContaining({ savedObjectId: linkedId }),
        {}
      );

      await clickButton('Edit in Dashboards');
      expect(mockApi.locator?.navigate).toHaveBeenCalledWith(
        expect.objectContaining({ dashboardId: linkedId })
      );

      await clickButton('Save');
      const otherSaveMethod = saveMethod === 'runQuickSave' ? 'runInteractiveSave' : 'runQuickSave';
      expect(mockApi[saveMethod]).toHaveBeenCalledTimes(1);
      expect(mockApi[otherSaveMethod]).not.toHaveBeenCalled();
      expect(updateOrigin).toHaveBeenCalledWith(savedOrigin);
    }
  );

  it('runs interactive save and updates origin for a new dashboard', async () => {
    const { mockApi, updateOrigin, clickButton } = await renderDashboardCanvasAttachment();

    await clickButton('Save');

    expect(mockApi.runInteractiveSave).toHaveBeenCalledTimes(1);
    expect(mockApi.runQuickSave).not.toHaveBeenCalled();
    expect(updateOrigin).toHaveBeenCalledWith('new-dashboard-id');
  });

  it('keeps the origin when the interactive save is cancelled', async () => {
    const { mockApi, updateOrigin, clickButton } = await renderDashboardCanvasAttachment();
    jest.mocked(mockApi.runInteractiveSave).mockResolvedValueOnce(undefined);

    await clickButton('Save');

    expect(mockApi.runInteractiveSave).toHaveBeenCalledTimes(1);
    expect(updateOrigin).not.toHaveBeenCalled();
  });

  it('treats the linked dashboard as missing when the existence check rejects', async () => {
    const { mockApi, updateOrigin, clickButton } = await renderDashboardCanvasAttachment({
      attachment: withOrigin('linked-dashboard-id'),
      checkSavedDashboardExist: jest.fn().mockRejectedValue(new Error('network error')),
    });

    expect(DashboardRenderer).toHaveBeenLastCalledWith(
      expect.objectContaining({ savedObjectId: undefined }),
      {}
    );

    await clickButton('Save');

    expect(mockApi.runQuickSave).not.toHaveBeenCalled();
    expect(mockApi.runInteractiveSave).toHaveBeenCalledTimes(1);
    expect(updateOrigin).toHaveBeenCalledWith('new-dashboard-id');
  });

  describe('error fallback', () => {
    it('renders a fallback callout when the dashboard renderer throws', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.mocked(DashboardRenderer).mockImplementation(() => {
        throw new Error('invalid dashboard state');
      });

      await renderDashboardCanvasAttachment({}, { waitForRenderer: false });

      expect(await screen.findByText(PREVIEW_ERROR_TITLE)).toBeInTheDocument();
      consoleErrorSpy.mockRestore();
    });

    it('renders a fallback callout when dashboard state conversion fails', async () => {
      const sectionWithoutGrid = { id: 'section-1', title: 'Section', panels: [] };
      await renderDashboardCanvasAttachment(
        {
          attachment: {
            ...mockAttachment,
            data: { title: 'Broken', panels: [sectionWithoutGrid] },
          } as unknown as DashboardAttachment,
        },
        { waitForRenderer: false }
      );

      expect(screen.getByText(PREVIEW_ERROR_TITLE)).toBeInTheDocument();
      expect(DashboardRenderer).not.toHaveBeenCalled();
    });
  });
});
