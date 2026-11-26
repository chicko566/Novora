export class ApiError extends Error {
  constructor(status, code, message) {
    super(message ?? code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function fail(status, code, message) {
  throw new ApiError(status, code, message);
}
