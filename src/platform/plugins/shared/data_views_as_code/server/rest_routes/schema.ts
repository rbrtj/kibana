/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import { savedDataViewSpecSchema } from '@kbn/as-code-data-views-schema';
import {
  asCodeMetaSchema,
  asCodePaginationResponseMetaSchema,
  PAGINATION_MAX_SIZE,
} from '@kbn/as-code-shared-schemas';

const dataViewsMetaSchema = asCodeMetaSchema.extend({
  namespaces: z.array(z.string().max(1000)).max(100).optional(),
});

export const asCodeResponseSchema = z
  .object({
    id: z.string().max(1000),
    data: savedDataViewSpecSchema,
    meta: dataViewsMetaSchema,
  })
  .strict();

export const asCodeMinimalResponseSchema = z.object({
  id: z.string().max(1000),
  data: z.object({
    name: savedDataViewSpecSchema.shape.name,
    index_pattern: savedDataViewSpecSchema.shape.index_pattern,
    time_field: savedDataViewSpecSchema.shape.time_field,
  }),
  meta: dataViewsMetaSchema,
});

export const asCodePaginatedResponseSchema = z.object({
  data: z.array(asCodeMinimalResponseSchema).max(PAGINATION_MAX_SIZE),
  meta: asCodePaginationResponseMetaSchema,
});

export const savedDataViewSpecSchemaWithoutId = savedDataViewSpecSchema.extend({
  id: z.never(),
});
