declare module "@qvac-atlas/schema" {
  export interface ValidationError {
    path: string;
    code: string;
    message: string;
  }

  export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
  }

  export function canonicalize(value: unknown): string;
  export function validatePublishableReport(report: unknown): ValidationResult;
}
