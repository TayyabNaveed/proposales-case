import { definition as identify } from "./business-identity/v1.js";
import { definition as research } from "./research-report/v6.js";
import { definition as selection } from "./service-recommendation/v1.js";
export const activePrompts = { identify, research, selection } as const;
export type PromptDefinition = {
  id: string;
  version: string;
  schemaVersion: string;
  inputBuilderVersion: string;
  validationVersion: string;
  system: string;
  config: {
    maxOutputTokens: number;
    deadlineMs: number;
    maxAttempts: number;
    thinking: "disabled";
    attemptDeadlineMs?: number;
  };
};
