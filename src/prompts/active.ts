import { definition as research } from "./research-report/v4.js";
import { definition as selection } from "./service-recommendation/v1.js";
export const activePrompts = { research, selection } as const;
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
