import { definition as previous } from "./v7.js";
export const sections = previous.sections;
// The model instructions stay the same. Validation now rejects only claims that
// the business lacks a website, profile or Search Console, not any sentence that
// mentions a website near a negation (Legend Rör AB, 11 October).
export const definition = {
  ...previous,
  version: "research-report-8",
  validationVersion: "research-validation-8",
  changeRationale:
    "Absence check targets claims about the business itself; the matched phrase is recorded.",
} as const;
