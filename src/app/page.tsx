import { ExampleWorkbench } from "../components/ExampleWorkbench";
import { hasSession } from "../server/session";
// Rendered per request: the session decides between the landing page and the
// workspace before any HTML is sent, so a reload never flashes the wrong one.
export default async function Page() {
  return <ExampleWorkbench initialAuthenticated={await hasSession()} />;
}
