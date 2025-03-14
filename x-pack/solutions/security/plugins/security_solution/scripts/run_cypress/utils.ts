/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import _ from 'lodash';
import * as fs from 'fs';
import * as parser from '@babel/parser';
import generate from '@babel/generator';
import type { ExpressionStatement, ObjectExpression, ObjectProperty } from '@babel/types';
import { schema, type TypeOf } from '@kbn/config-schema';
import chalk from 'chalk';
import type { ToolingLogTextWriterConfig } from '@kbn/tooling-log';
import { createToolingLogger } from '../../common/endpoint/data_loaders/utils';

/**
 * Retrieve test files using a glob pattern.
 * If process.env.RUN_ALL_TESTS is true, returns all matching files, otherwise, return files that should be run by this job based on process.env.BUILDKITE_PARALLEL_JOB_COUNT and process.env.BUILDKITE_PARALLEL_JOB
 */
export const retrieveIntegrations = (integrationsPaths: string[]) => {
  const nonSkippedSpecs = integrationsPaths.filter((filePath) => !isSkipped(filePath));

  if (process.env.RUN_ALL_TESTS === 'true') {
    return nonSkippedSpecs;
  } else {
    // The number of instances of this job were created
    const chunksTotal: number = process.env.BUILDKITE_PARALLEL_JOB_COUNT
      ? parseInt(process.env.BUILDKITE_PARALLEL_JOB_COUNT, 10)
      : 1;
    // An index which uniquely identifies this instance of the job
    const chunkIndex: number = process.env.BUILDKITE_PARALLEL_JOB
      ? parseInt(process.env.BUILDKITE_PARALLEL_JOB, 10)
      : 0;

    const nonSkippedSpecsForChunk: string[] = [];

    for (let i = chunkIndex; i < nonSkippedSpecs.length; i += chunksTotal) {
      nonSkippedSpecsForChunk.push(nonSkippedSpecs[i]);
    }

    return nonSkippedSpecsForChunk;
  }
};

export const isSkipped = (filePath: string): boolean => {
  const testFile = fs.readFileSync(filePath, { encoding: 'utf8' });

  const ast = parser.parse(testFile, {
    sourceType: 'module',
    plugins: ['typescript'],
  });

  const expressionStatement = _.find(ast.program.body, ['type', 'ExpressionStatement']) as
    | ExpressionStatement
    | undefined;

  const callExpression = expressionStatement?.expression;

  // @ts-expect-error
  return callExpression?.callee?.property?.name === 'skip';
};

export const parseTestFileConfig = (filePath: string): SecuritySolutionDescribeBlockFtrConfig => {
  const testFile = fs.readFileSync(filePath, { encoding: 'utf8' });

  const ast = parser.parse(testFile, {
    sourceType: 'module',
    plugins: ['typescript'],
  });

  const expressionStatement = _.find(ast.program.body, {
    type: 'ExpressionStatement',
    expression: { callee: { name: 'describe' } },
  }) as ExpressionStatement | undefined;

  const callExpression = expressionStatement?.expression;
  // @ts-expect-error
  if (expressionStatement?.expression?.arguments?.length === 3) {
    // @ts-expect-error
    const callExpressionArguments = _.find(callExpression?.arguments, [
      'type',
      'ObjectExpression',
    ]) as ObjectExpression | undefined;

    const callExpressionProperties = _.find(callExpressionArguments?.properties, [
      'key.name',
      'env',
    ]) as ObjectProperty[] | undefined;
    // @ts-expect-error
    const ftrConfig = _.find(callExpressionProperties?.value?.properties, [
      'key.name',
      'ftrConfig',
    ]);

    if (!ftrConfig) {
      return {};
    }

    const ftrConfigCode = generate(ftrConfig.value, { jsonCompatibleStrings: true }).code;

    try {
      // TODO:PT need to assess implication of using this approach to get the JSON back out
      // eslint-disable-next-line no-new-func
      const ftrConfigJson = new Function(`return ${ftrConfigCode}`)();
      return TestFileFtrConfigSchema.validate(ftrConfigJson);
    } catch (err) {
      throw new Error(
        `Failed to parse 'ftrConfig' value defined in 'describe()' at ${filePath}. ${err.message}\nCode: ${ftrConfigCode}`
      );
    }
  }

  return {};
};

const TestFileFtrConfigSchema = schema.object(
  {
    license: schema.maybe(schema.string()),
    kbnServerArgs: schema.maybe(schema.arrayOf(schema.string())),
    productTypes: schema.maybe(
      // TODO:PT write validate function to ensure that only the correct combinations are used
      schema.arrayOf(
        schema.object({
          product_line: schema.oneOf([
            schema.literal('security'),
            schema.literal('endpoint'),
            schema.literal('cloud'),
          ]),

          product_tier: schema.oneOf([schema.literal('essentials'), schema.literal('complete')]),
        })
      )
    ),
  },
  { defaultValue: {}, unknowns: 'forbid' }
);

export type SecuritySolutionDescribeBlockFtrConfig = TypeOf<typeof TestFileFtrConfigSchema>;

export const getOnBeforeHook = (module: unknown, beforeSpecFilePath: string): Function => {
  if (typeof module !== 'object' || module === null) {
    throw new Error(
      `${chalk.bold(
        beforeSpecFilePath
      )} expected to explicitly export function member named "onBeforeHook"`
    );
  }

  if (!('onBeforeHook' in module) || typeof module.onBeforeHook !== 'function') {
    throw new Error(
      `${chalk.bold('onBeforeHook')} exported from ${chalk.bold(
        beforeSpecFilePath
      )} is not a function`
    );
  }

  return module.onBeforeHook;
};

/**
 * Sets the default log level for `ToolingLog` instances created by `createToolingLogger()`:
 * `x-pack/solutions/security/plugins/security_solution/common/endpoint/data_loaders/utils.ts:148`.
 * It will first check the NodeJs `process.env` to see if an Environment Variable was set
 * and then, if provided, it will use the value defined in the Cypress Config. file.
 */
export const setDefaultToolingLoggingLevel = (defaultFallbackLoggingLevel?: string) => {
  const logLevel =
    process.env.TOOLING_LOG_LEVEL ||
    process.env.CYPRESS_TOOLING_LOG_LEVEL ||
    defaultFallbackLoggingLevel ||
    '';

  if (logLevel) {
    createToolingLogger('info').info(`Setting tooling log level to [${logLevel}]`);
    createToolingLogger.defaultLogLevel = logLevel as ToolingLogTextWriterConfig['level'];
  }
};
