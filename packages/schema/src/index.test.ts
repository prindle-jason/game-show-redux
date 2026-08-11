import { describe, expect, it } from 'vitest';
import { SCHEMA_PACKAGE_NAME } from './index.js';

describe('schema package', () => {
  it('exports a package name placeholder', () => {
    expect(SCHEMA_PACKAGE_NAME).toBe('@gameshow/schema');
  });
});
