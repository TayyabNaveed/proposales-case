// Temporary, explicitly manual fixtures. Phase 3 replaces these with AI selection.
export const exampleSelections: Record<
  string,
  { serviceId: string; findingIds: string[]; explanation: string }[]
> = {
  "no-website": [
    {
      serviceId: "website-base",
      findingIds: ["nf1"],
      explanation: "Create the requested online home.",
    },
    {
      serviceId: "service-page",
      findingIds: ["nf3"],
      explanation: "Add distinct service information beyond the base pages.",
    },
    {
      serviceId: "faq-content",
      findingIds: ["nf3"],
      explanation: "Answer repeated customer questions.",
    },
    {
      serviceId: "website-maintenance",
      findingIds: ["nf4"],
      explanation: "Provide requested ongoing support.",
    },
  ],
  "enquiry-flow": [
    {
      serviceId: "enquiry-improvement",
      findingIds: ["jf1"],
      explanation: "Improve the existing enquiry journey.",
    },
    {
      serviceId: "faq-content",
      findingIds: ["jf2"],
      explanation: "Answer common workshop questions.",
    },
    {
      serviceId: "google-profile",
      findingIds: ["jf3"],
      explanation: "Correct the confirmed profile hours.",
    },
  ],
};
