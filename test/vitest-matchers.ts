import { InstantIssue } from '@instantdb/admin';
import { expect } from 'vitest';

expect.extend({
  toBePermissionDenied(received: InstantIssue) {
    const { isNot } = this;
    const pass =
      received.status === 400 &&
      received.body?.type === 'permission-denied' &&
      received.body?.hint?.expected === 'perms-pass?' &&
      received.body?.message === 'Permission denied: not perms-pass?';

    return {
      pass,
      message: () =>
        pass
          ? `Expected ${isNot ? 'not ' : ''}to be a permission denied error`
          : `Expected${isNot ? ' not' : ''} to be a permission denied error but got:\n${JSON.stringify(received, null, 2)}`,
      actual: received,
      expected: {
        status: 400,
        body: {
          type: 'permission-denied',
          hint: { expected: 'perms-pass?' },
          message: 'Permission denied: not perms-pass?',
        },
      },
    };
  },
  toBeValidationFailed(received: InstantIssue) {
    const { isNot } = this;
    const pass = received.status === 400 && received.body?.type === 'validation-failed';

    return {
      pass,
      message: () =>
        pass
          ? `Expected ${isNot ? 'not ' : ''}to be a validation failed error`
          : `Expected${isNot ? ' not' : ''} to be a validation failed error but got:\n${JSON.stringify(received, null, 2)}`,
      actual: received,
      expected: {
        status: 400,
        body: { type: 'validation-failed' },
      },
    };
  },

  toBeUniquenessFailure(received: InstantIssue) {
    const { isNot } = this;
    const pass = received.status === 400 && received.body?.type === 'record-not-unique';

    return {
      pass,
      message: () =>
        pass
          ? `Expected ${isNot ? 'not ' : ''}to be a uniqueness failure error`
          : `Expected${isNot ? ' not' : ''} to be a uniqueness failure error but got:\n${JSON.stringify(received, null, 2)}`,
      actual: received,
      expected: {
        status: 400,
        body: { type: 'record-not-unique' },
      },
    };
  },
  toBeInternalServerError(received: InstantIssue) {
    const { isNot } = this;
    const pass = received.status === 500;

    return {
      pass,
      message: () =>
        pass
          ? `Expected ${isNot ? 'not ' : ''} to be a internal server error`
          : `Expected${isNot ? ' not' : ''} to be a internal server error but got:\n${JSON.stringify(received, null, 2)}`,
      actual: received,
      expected: {
        status: 500,
      },
    };
  },
});
