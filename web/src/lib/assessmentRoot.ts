import path from "path";

/**
 * Carpeta `assessment/` (padre de `web/`).
 * En producción, define ASSESSMENT_ROOT en el entorno.
 */
export function getAssessmentRoot(): string {
  if (process.env.ASSESSMENT_ROOT) {
    return path.resolve(process.env.ASSESSMENT_ROOT);
  }
  return path.resolve(process.cwd(), "..");
}
