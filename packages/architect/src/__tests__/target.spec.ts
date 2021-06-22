import type {BuilderContext} from '@angular-devkit/architect';

import {resolveTargetString} from '..';

describe('resolveTargetString', () => {
  const contextWithoutTarget = {
    target: undefined,
  } as Partial<BuilderContext> as BuilderContext;
  const contextWithTarget = {
    target: {project: 'test-proj', target: 'test-target'},
  } as Partial<BuilderContext> as BuilderContext;

  it('should return fully resolved arguments', () => {
    for (const target of ['application:build', 'lorem:ipsum:dolor,sit,amet']) {
      expect(resolveTargetString(contextWithoutTarget, target)).toBe(target);
      expect(resolveTargetString(contextWithTarget, target)).toBe(target);
    }
  });

  it('should add projects if only targets are passed', () => {
    for (const target of ['build', 'ipsum']) {
      expect(resolveTargetString(contextWithTarget, target)).toBe(
        `test-proj:${target}`,
      );

      expect(() => resolveTargetString(contextWithoutTarget, target)).toThrow(
        `Target is required to resolve spec "${target}"`,
      );
    }
  });

  it('should add projects if the project is empty', () => {
    for (const target of [':build', ':ipsum:dolor,sit,amet']) {
      expect(resolveTargetString(contextWithTarget, target)).toBe(
        `test-proj${target}`,
      );

      expect(() => resolveTargetString(contextWithoutTarget, target)).toThrow(
        `Target is required to resolve spec "${target}"`,
      );
    }
  });
});
