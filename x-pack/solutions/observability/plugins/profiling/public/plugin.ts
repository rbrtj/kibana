/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AppMountParameters,
  AppUpdater,
  CoreSetup,
  CoreStart,
  Plugin,
} from '@kbn/core/public';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import type { NavigationSection } from '@kbn/observability-shared-plugin/public';
import type { Location } from 'history';
import { BehaviorSubject, combineLatest, from, map, take } from 'rxjs';
import { OBLT_PROFILING_APP_ID } from '@kbn/deeplinks-observability';
import { registerEmbeddables } from './embeddables/register_embeddables';
import { getServices } from './services';
import type { ProfilingPluginPublicSetupDeps, ProfilingPluginPublicStartDeps } from './types';
import type { ProfilingEmbeddablesDependencies } from './embeddables/profiling_embeddable_provider';

export type ProfilingPluginSetup = void;
export type ProfilingPluginStart = void;

export class ProfilingPlugin
  implements
    Plugin<
      ProfilingPluginSetup,
      ProfilingPluginStart,
      ProfilingPluginPublicSetupDeps,
      ProfilingPluginPublicStartDeps
    >
{
  public setup(
    coreSetup: CoreSetup<ProfilingPluginPublicStartDeps>,
    pluginsSetup: ProfilingPluginPublicSetupDeps
  ) {
    // Register an application into the side navigation menu
    const links = [
      {
        id: 'stacktraces',
        title: i18n.translate('xpack.profiling.navigation.stacktracesLinkLabel', {
          defaultMessage: 'Stacktraces',
        }),
        path: '/stacktraces',
      },
      {
        id: 'flamegraphs',
        title: i18n.translate('xpack.profiling.navigation.flameGraphsLinkLabel', {
          defaultMessage: 'Flamegraphs',
        }),
        path: '/flamegraphs',
      },
      {
        id: 'functions',
        title: i18n.translate('xpack.profiling.navigation.functionsLinkLabel', {
          defaultMessage: 'Functions',
        }),
        path: '/functions',
      },
    ];

    const kuerySubject = new BehaviorSubject<string>('');
    const appUpdater$ = new BehaviorSubject<AppUpdater>(() => ({}));

    const section$ = combineLatest([from(coreSetup.getStartServices()), kuerySubject]).pipe(
      map(([[coreStart], kuery]) => {
        if (coreStart.application.capabilities.profiling.show) {
          let isSidebarEnabled = true;
          coreStart.chrome
            .getChromeStyle$()
            .pipe(take(1))
            .subscribe((style) => (isSidebarEnabled = style === 'classic'));

          if (isSidebarEnabled) {
            // classic navigation
            const sections: NavigationSection[] = [
              {
                label: i18n.translate('xpack.profiling.navigation.sectionLabel', {
                  defaultMessage: 'Universal Profiling',
                }),
                entries: links.map((link) => {
                  return {
                    app: OBLT_PROFILING_APP_ID,
                    label: link.title,
                    path: kuery ? `${link.path}?kuery=${kuery}` : link.path,
                    matchPath: (path) => {
                      return path.startsWith(link.path);
                    },
                  };
                }),
                sortKey: 700,
              },
            ];
            return sections;
          } else {
            // solution navigation
            appUpdater$.next(() => ({
              deepLinks: links.map((link) => ({
                ...link,
                path: kuery ? `${link.path}?kuery=${encodeURIComponent(kuery)}` : link.path,
              })),
            }));
          }
        }
        return [];
      })
    );

    pluginsSetup.observabilityShared.navigation.registerSections(section$);

    const profilingFetchServices = getServices();

    coreSetup.application.register({
      id: OBLT_PROFILING_APP_ID,
      title: 'Universal Profiling',
      euiIconType: 'logoObservability',
      appRoute: '/app/profiling',
      category: DEFAULT_APP_CATEGORIES.observability,
      deepLinks: links,
      updater$: appUpdater$,
      async mount({ element, history, theme$, setHeaderActionMenu }: AppMountParameters) {
        const [coreStart, pluginsStart] = await coreSetup.getStartServices();

        const { renderApp } = await import('./app');

        function pushKueryToSubject(location: Location) {
          const query = new URLSearchParams(location.search);
          kuerySubject.next(query.get('kuery') ?? '');
        }

        pushKueryToSubject(history.location);

        history.listen(pushKueryToSubject);

        const unmount = renderApp(
          {
            profilingFetchServices,
            coreStart,
            coreSetup,
            pluginsStart,
            pluginsSetup,
            history,
            theme$,
            setHeaderActionMenu,
          },
          element
        );

        return () => {
          unmount();
          kuerySubject.next('');
        };
      },
    });

    const getProfilingEmbeddableDependencies =
      async (): Promise<ProfilingEmbeddablesDependencies> => {
        const [coreStart, pluginsStart] = await coreSetup.getStartServices();
        return {
          coreStart,
          coreSetup,
          pluginsStart,
          pluginsSetup,
          profilingFetchServices,
        };
      };

    getProfilingEmbeddableDependencies().then((deps) => {
      registerEmbeddables(deps);
    });

    return {};
  }

  public start(core: CoreStart) {
    return {};
  }

  public stop() {}
}
