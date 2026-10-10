// Historical approval rows are preserved; there is no pre-draft approval in this workflow.
export async function POST() {
  return Response.json(
    {
      error: "endpoint_retired",
      message:
        "Use recommendations and draft generation; review the resulting proposal in Proposales.",
    },
    { status: 410 },
  );
}
