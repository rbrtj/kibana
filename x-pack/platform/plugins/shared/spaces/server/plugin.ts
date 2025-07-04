/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Observable } from 'rxjs';
import { map, take } from 'rxjs';

import type { CloudSetup } from '@kbn/cloud-plugin/server';
import type {
  CoreSetup,
  CoreStart,
  Logger,
  Plugin,
  PluginInitializerContext,
} from '@kbn/core/server';
import type { FeaturesPluginSetup, FeaturesPluginStart } from '@kbn/features-plugin/server';
import type { HomeServerPluginSetup } from '@kbn/home-plugin/server';
import type { LicensingPluginSetup } from '@kbn/licensing-plugin/server';
import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/server';

import { setupCapabilities } from './capabilities';
import type { ConfigType } from './config';
import { DefaultSpaceService } from './default_space';
import { initSpacesRequestInterceptors } from './lib/request_interceptors';
import { createSpacesTutorialContextFactory } from './lib/spaces_tutorial_context_factory';
import { initExternalSpacesApi } from './routes/api/external';
import { initInternalSpacesApi } from './routes/api/internal';
import { initSpacesViewsRoutes } from './routes/views';
import { SpacesSavedObjectsService } from './saved_objects';
import type { SpacesClientRepositoryFactory, SpacesClientWrapper } from './spaces_client';
import { SpacesClientService } from './spaces_client';
import type { SpacesServiceSetup, SpacesServiceStart } from './spaces_service';
import { SpacesService } from './spaces_service';
import type { SpacesRequestHandlerContext } from './types';
import { getUiSettings } from './ui_settings';
import { registerSpacesUsageCollector } from './usage_collection';
import { UsageStatsService } from './usage_stats';
import { SpacesLicenseService } from '../common/licensing';

export interface PluginsSetup {
  features: FeaturesPluginSetup;
  licensing: LicensingPluginSetup;
  usageCollection?: UsageCollectionSetup;
  home?: HomeServerPluginSetup;
  cloud?: CloudSetup;
}

export interface PluginsStart {
  features: FeaturesPluginStart;
}

/**
 * Setup contract for the Spaces plugin.
 */
export interface SpacesPluginSetup {
  /**
   * Service for interacting with spaces.
   */
  spacesService: SpacesServiceSetup;

  /**
   * Registries exposed for the security plugin to transparently provide authorization and audit logging.
   * @internal
   */
  spacesClient: {
    /**
     * Sets the client repository factory.
     * @internal
     */
    setClientRepositoryFactory: (factory: SpacesClientRepositoryFactory) => void;
    /**
     * Registers a client wrapper.
     * @internal
     */
    registerClientWrapper: (wrapper: SpacesClientWrapper) => void;
  };

  /**
   * Determines whether Kibana supports multiple spaces or only the default space.
   *
   * When `xpack.spaces.maxSpaces` is set to 1 Kibana only supports the default space and any spaces related UI can safely be hidden.
   */
  hasOnlyDefaultSpace$: Observable<boolean>;
}

/**
 * Start contract for the Spaces plugin.
 */
export interface SpacesPluginStart {
  /** Service for interacting with spaces. */
  spacesService: SpacesServiceStart;

  /**
   * Determines whether Kibana supports multiple spaces or only the default space.
   *
   * When `xpack.spaces.maxSpaces` is set to 1 Kibana only supports the default space and any spaces related UI can safely be hidden.
   */
  hasOnlyDefaultSpace$: Observable<boolean>;
}

export class SpacesPlugin
  implements Plugin<SpacesPluginSetup, SpacesPluginStart, PluginsSetup, PluginsStart>
{
  private readonly config$: Observable<ConfigType>;

  private readonly log: Logger;

  private readonly spacesLicenseService = new SpacesLicenseService();

  private readonly spacesClientService: SpacesClientService;

  private readonly spacesService: SpacesService;

  private readonly hasOnlyDefaultSpace$: Observable<boolean>;

  private spacesServiceStart?: SpacesServiceStart;

  private defaultSpaceService?: DefaultSpaceService;

  constructor(private readonly initializerContext: PluginInitializerContext) {
    this.config$ = initializerContext.config.create<ConfigType>();
    this.hasOnlyDefaultSpace$ = this.config$.pipe(map(({ maxSpaces }) => maxSpaces === 1));
    this.log = initializerContext.logger.get();
    this.spacesService = new SpacesService();
    this.spacesClientService = new SpacesClientService(
      (message) => this.log.debug(message),
      initializerContext.env.packageInfo.buildFlavor
    );
  }

  public setup(core: CoreSetup<PluginsStart>, plugins: PluginsSetup): SpacesPluginSetup {
    const spacesClientSetup = this.spacesClientService.setup({ config$: this.config$ });
    core.uiSettings.registerGlobal(getUiSettings());

    const spacesServiceSetup = this.spacesService.setup({
      basePath: core.http.basePath,
    });

    const getSpacesService = () => {
      if (!this.spacesServiceStart) {
        throw new Error('spaces service has not been initialized!');
      }
      return this.spacesServiceStart;
    };

    const usageStatsServicePromise = new UsageStatsService(this.log).setup({
      getStartServices: core.getStartServices,
    });

    const savedObjectsService = new SpacesSavedObjectsService();
    savedObjectsService.setup({ core, getSpacesService });

    const { license } = this.spacesLicenseService.setup({ license$: plugins.licensing.license$ });

    let defaultSolution;

    this.config$.pipe(take(1)).subscribe((config) => {
      defaultSolution = config.defaultSolution;
    });

    this.defaultSpaceService = new DefaultSpaceService();
    this.defaultSpaceService.setup({
      coreStatus: core.status,
      getSavedObjects: async () => (await core.getStartServices())[0].savedObjects,
      license$: plugins.licensing.license$,
      spacesLicense: license,
      logger: this.log,
      solution: plugins.cloud?.onboarding?.defaultSolution || defaultSolution,
    });

    initSpacesViewsRoutes({
      httpResources: core.http.resources,
      basePath: core.http.basePath,
      logger: this.log,
    });

    const router = core.http.createRouter<SpacesRequestHandlerContext>();

    initExternalSpacesApi({
      router,
      log: this.log,
      getStartServices: core.getStartServices,
      getSpacesService,
      usageStatsServicePromise,
      isServerless: this.initializerContext.env.packageInfo.buildFlavor === 'serverless',
    });

    initInternalSpacesApi({
      router,
      getSpacesService,
    });

    initSpacesRequestInterceptors({
      http: core.http,
      log: this.log,
      getSpacesService,
      getFeatures: async () => (await core.getStartServices())[1].features,
    });

    setupCapabilities(core, getSpacesService, this.log);

    if (plugins.usageCollection) {
      const getIndexForType = (type: string) =>
        core.getStartServices().then(([coreStart]) => coreStart.savedObjects.getIndexForType(type));
      registerSpacesUsageCollector(plugins.usageCollection, {
        getIndexForType,
        features: plugins.features,
        licensing: plugins.licensing,
        usageStatsServicePromise,
      });
    }

    if (plugins.home) {
      plugins.home.tutorials.addScopedTutorialContextFactory(
        createSpacesTutorialContextFactory(getSpacesService)
      );
    }

    return {
      spacesClient: spacesClientSetup,
      spacesService: spacesServiceSetup,
      hasOnlyDefaultSpace$: this.hasOnlyDefaultSpace$,
    };
  }

  public start(core: CoreStart, plugins: PluginsStart) {
    const spacesClientStart = this.spacesClientService.start(core, plugins.features);

    this.spacesServiceStart = this.spacesService.start({
      basePath: core.http.basePath,
      spacesClientService: spacesClientStart,
    });

    return {
      spacesService: this.spacesServiceStart,
      hasOnlyDefaultSpace$: this.hasOnlyDefaultSpace$,
    };
  }

  public stop() {
    if (this.defaultSpaceService) {
      this.defaultSpaceService.stop();
    }
  }
}
