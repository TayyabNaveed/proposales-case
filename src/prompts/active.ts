import { definition as identify } from "./business-identity/v1.js";
import { definition as research } from "./research-report/v8.js";
import { definition as selection } from "./service-recommendation/v2.js";
import { definition as intro } from "./proposal-intro/v2.js";
export const activePrompts = { identify, research, selection, intro } as const;
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
