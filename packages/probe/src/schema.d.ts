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
  export function scanPrivacy(
    value: unknown,
  ): Array<{ path: string; rule: string }>;
  export function validateReport(report: unknown): ValidationResult;
  export function withReportId<T extends object>(
    report: T,
  ): T & { report_id: string };
}
