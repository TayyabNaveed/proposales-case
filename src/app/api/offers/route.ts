import { withRequestLog } from "../../../server/log";
// Historical approval rows are preserved; there is no pre-draft approval in this workflow.
async function post() {
  return Response.json(
    {
      error: "endpoint_retired",
      message:
        "Use recommendations and draft generation; review the resulting proposal in Proposales.",
    },
    { status: 410 },
  );
}
export const POST = withRequestLog("offers", post);
