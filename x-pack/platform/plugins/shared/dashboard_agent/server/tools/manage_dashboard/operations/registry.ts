/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { DashboardAttachmentData } from '@kbn/dashboard-agent-common';
import type { DashboardOperation } from '../operations';
import type { OperationExecutionContext, OperationHandler } from './types';
import type { VisualizationCreationRequest } from './visualization_creation';

type DashboardOperationType = DashboardOperation['operation'];
type DashboardOperationByType<TOperation extends DashboardOperationType> = Extract<
  DashboardOperation,
  { operation: TOperation }
>;

export interface DashboardOperationDefinition<TOperation extends DashboardOperationType> {
  operation: TOperation;
  schema: z.ZodType<DashboardOperationByType<TOperation>>;
  handler: OperationHandler<TOperation>;
  collectVisualizationCreationRequests?: (
    operation: DashboardOperationByType<TOperation>
  ) => VisualizationCreationRequest[];
}

export const defineDashboardOperation = <TOperation extends DashboardOperationType>(
  definition: DashboardOperationDefinition<TOperation>
): DashboardOperationDefinition<TOperation> => definition;

interface OperationHandlerArgs {
  dashboardData: DashboardAttachmentData;
  operation: DashboardOperation;
  operationIndex: number;
  context: OperationExecutionContext;
}

type RegistryDefinition = {
  [TOperation in DashboardOperationType]: DashboardOperationDefinition<TOperation>;
}[DashboardOperationType];

type RegistryHandler = (args: OperationHandlerArgs) => Promise<DashboardAttachmentData>;
type RegistryCollector = (operation: DashboardOperation) => VisualizationCreationRequest[];

// Once handlers live in a Map, TypeScript no longer knows that a key and operation subtype match.
// Keep that narrowing detail in this file so operation definitions stay easy to read.
const adaptHandler = (definition: RegistryDefinition): RegistryHandler => {
  return async ({ dashboardData, operation, operationIndex, context }) =>
    definition.handler({
      dashboardData,
      operation: operation as never,
      operationIndex,
      context,
    });
};

const adaptCollector = (definition: RegistryDefinition): RegistryCollector | undefined => {
  const collectVisualizationCreationRequests = definition.collectVisualizationCreationRequests;
  if (!collectVisualizationCreationRequests) {
    return undefined;
  }

  return (operation) => collectVisualizationCreationRequests(operation as never);
};

export const createDashboardOperationRegistry = (
  definitions: readonly RegistryDefinition[]
): {
  dashboardOperationSchema: z.ZodType<DashboardOperation>;
  executeOperationHandler: (args: OperationHandlerArgs) => Promise<DashboardAttachmentData>;
  collectVisualizationCreationRequests: (
    operations: DashboardOperation[]
  ) => Map<number, VisualizationCreationRequest[]>;
} => {
  if (definitions.length < 2) {
    throw new Error('At least two dashboard operation definitions are required.');
  }

  const schemas = definitions.map(({ schema }) => schema) as unknown as Parameters<
    typeof z.discriminatedUnion
  >[1];
  const handlers = new Map<DashboardOperationType, RegistryHandler>(
    definitions.map((definition) => [definition.operation, adaptHandler(definition)] as const)
  );
  const collectors = new Map<DashboardOperationType, RegistryCollector>(
    definitions.flatMap((definition) => {
      const collector = adaptCollector(definition);
      return collector ? [[definition.operation, collector] as const] : [];
    })
  );

  const executeOperationHandler = async ({
    dashboardData,
    operation,
    operationIndex,
    context,
  }: OperationHandlerArgs): Promise<DashboardAttachmentData> => {
    const handler = handlers.get(operation.operation);
    if (!handler) {
      throw new Error(`Unsupported dashboard operation "${operation.operation}".`);
    }

    return handler({ dashboardData, operation, operationIndex, context });
  };

  const collectVisualizationCreationRequests = (
    operations: DashboardOperation[]
  ): Map<number, VisualizationCreationRequest[]> => {
    const requestsByOperationIndex = new Map<number, VisualizationCreationRequest[]>();

    for (const [operationIndex, operation] of operations.entries()) {
      const collectRequests = collectors.get(operation.operation);
      if (!collectRequests) {
        continue;
      }

      const requests = collectRequests(operation);
      if (requests.length > 0) {
        requestsByOperationIndex.set(operationIndex, requests);
      }
    }

    return requestsByOperationIndex;
  };

  return {
    dashboardOperationSchema: z.discriminatedUnion(
      'operation',
      schemas
    ) as z.ZodType<DashboardOperation>,
    executeOperationHandler,
    collectVisualizationCreationRequests,
  };
};
