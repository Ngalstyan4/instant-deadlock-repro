import 'vitest';

interface CustomMatchers<R = unknown> {
  /**
   * Checks if an error is a permission denied error
   * @example expect(error).toBePermissionDenied()
   */
  toBePermissionDenied(): R;

  /**
   * Checks if an error is a validation failed error
   * @example expect(error).toBeValidationFailed()
   */
  toBeValidationFailed(): R;

  /**
   * Checks if an error is a uniqueness failure error
   * @example expect(error).toBeUniquenessFailure()
   */
  toBeUniquenessFailure(): R;

  /**
   * Checks if an error is an InstantDB 500 server failure
   * @example expect(error).toBeInternalServerError()
   */
  toBeInternalServerError(): R;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends CustomMatchers<T> {}

  // These interfaces ensure the matchers work with .resolves and .rejects
  interface PromiseLike {
    /**
     * Checks if a promise rejection is a permission denied error
     * @example await expect(promise).rejects.toBePermissionDenied()
     */
    toBePermissionDenied(): Promise<void>;

    /**
     * Checks if a promise rejection is a validation failed error
     * @example await expect(promise).rejects.toBeValidationFailed()
     */
    toBeValidationFailed(): Promise<void>;

    /**
     * Checks if a promise rejection is a uniqueness failure error
     * @example await expect(promise).rejects.toBeUniquenessFailure()
     */
    toBeUniquenessFailure(): Promise<void>;

    /**
     * Checks if a promise rejection error is an InstantDB 500 server failure
     * @example expect(error).rejects.toBeInternalServerError()
     */
    toBeInternalServerError(): Promise<void>;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends CustomMatchers<any> {}
}
