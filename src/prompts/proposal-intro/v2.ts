import { definition as previous } from "./v1.js";
export const sections = previous.sections;
// The model instructions stay the same; a new validation identity avoids reusing
// cached introductions generated before the presentation-length bound.
export const definition = {
  ...previous,
  version: "proposal-intro-2",
  validationVersion: "intro-validation-2",
  changeRationale: "Keep whole supported sentences within the 1,500-character presentation limit.",
} as const;
