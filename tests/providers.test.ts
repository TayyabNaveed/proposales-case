import { test } from "node:test";
import assert from "node:assert/strict";
import { createProposales } from "../src/server/providers/proposales.js";
const json = (body: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const company = {
  id: 7,
  name: "Fictional company",
  currency: "EUR",
  inbox_token: "private-inbox",
};
const uuid = "12345678-1234-4234-8234-123456789012";
function client(fetcher: typeof fetch) {
  return createProposales({
    apiKey: "private-key",
    companyId: "7",
    fetch: fetcher,
  });
}

test("missing token prevents any request", () => {
  assert.throws(
    () => createProposales({ apiKey: "", companyId: "7" }),
    /configuration/,
  );
});
test("company projection strips inbox secrets and normalises numeric IDs", async () => {
  const c = client(async (_url, options) => {
    assert.equal(options?.redirect, "error");
    return json({ data: [company] });
  });
  assert.deepEqual(await c.listCompanies(), [
    { id: "7", name: "Fictional company", currency: "EUR" },
  ]);
});
test("configured company must be among token memberships", async () => {
  await assert.rejects(
    () =>
      client(async () =>
        json({ data: [{ ...company, id: 8 }] }),
      ).verifyCompany(),
    /company_scope/,
  );
});
test("unexpected success shape produces a safe contract error", async () => {
  await assert.rejects(
    () => client(async () => json({ secret: "private-key" })).listCompanies(),
    (e) => {
      assert.equal((e as Error).message, "proposales: invalid_response");
      return true;
    },
  );
});
test("401 never retries and response body never enters the error", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      client(async () => {
        calls++;
        return json({ secret: "private-key" }, 401);
      }).listCompanies(),
    /http_401/,
  );
  assert.equal(calls, 1);
});
test("429 read retries once and then stops", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      client(async () => {
        calls++;
        return json({}, 429, { "Retry-After": "0" });
      }).listCompanies(),
    /http_429/,
  );
  assert.equal(calls, 2);
});
test("large Retry-After cannot extend the bounded request", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      client(async () => {
        calls++;
        return json({}, 429, { "Retry-After": "3600" });
      }).listCompanies(),
    /http_429/,
  );
  assert.equal(calls, 1);
});
test("aborted request never dispatches", async () => {
  let calls = 0;
  const s = AbortSignal.abort();
  await assert.rejects(
    () =>
      client(async () => {
        calls++;
        return json({ data: [] });
      }).listCompanies(s),
    /aborted/,
  );
  assert.equal(calls, 0);
});
test("draft write timeout is never retried", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      client(async () => {
        calls++;
        throw new Error("private transport message");
      }).createDraft({
        title: "Synthetic draft",
        description: "Unsent test",
        operationKey: "op-1",
      }),
    /outcome_unknown/,
  );
  assert.equal(calls, 1);
});
test("draft payload forces company scope and omits recipient and sending fields", async () => {
  const c = client(async (url, options) => {
    assert.equal(String(url), "https://api.proposales.com/v3/proposals");
    assert.deepEqual(JSON.parse(String(options?.body)), {
      company_id: 7,
      language: "en",
      title_md: "Synthetic draft",
      description_md: "Unsent test",
      data: { case_operation: "op-1" },
      blocks: [],
    });
    return json({
      proposal: { uuid, url: `https://secure.proposales.com/proposal/${uuid}` },
    });
  });
  assert.equal(
    (
      await c.createDraft({
        title: "Synthetic draft",
        description: "Unsent test",
        operationKey: "op-1",
      })
    ).uuid,
    uuid,
  );
});
test("retrieved proposal from another company is rejected", async () => {
  await assert.rejects(
    () =>
      client(async () =>
        json({ data: { uuid, company_id: 8, status: "draft", data: {} } }),
      ).getDraft(uuid),
    /company_scope/,
  );
});
test("known UUID survives a missing or unsafe editor URL after creation", async () => {
  for (const url of [undefined, "https://evil.example/"]) {
    const result = await client(async () =>
      json({ proposal: { uuid, url } }),
    ).createDraft({ title: "x", description: "y", operationKey: "op-2" });
    assert.equal(result.uuid, uuid);
    assert.equal(result.url, undefined);
  }
});
test("malformed nonempty library is rejected instead of counted", async () => {
  await assert.rejects(
    () =>
      client(async () =>
        json({ data: [null, 123, "unexpected"] }),
      ).contentCount(),
    /invalid_response/,
  );
});
test("malformed library IDs cannot pass verified mapping", async () => {
  await assert.rejects(
    () => client(async () => json({ data: [{ id: 12 }] })).contentCount(),
    /invalid_response/,
  );
});
test("content creation projects IDs and detail reads are scoped by variation ID", async () => {
  const bodies: any[] = [];
  const paths: string[] = [];
  const api = createProposales({
    apiKey: "test",
    companyId: "1",
    fetch: async (url, init) => {
      paths.push(String(url));
      if (init?.method === "POST") {
        bodies.push(JSON.parse(String(init.body)));
        return new Response(
          JSON.stringify({
            data: { product_id: 10, variation_id: 20, message: "ok" },
          }),
        );
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              product_id: 10,
              variation_id: 20,
              title: { en: "Case" },
              description: { en: "Scope" },
              images: [{ uuid: "00000000-0000-4000-8000-000000000001" }],
            },
          ],
        }),
      );
    },
  });
  assert.deepEqual(
    await api.createContent({
      title: "Case",
      description: "Scope",
      imageUrl: "https://metascalers.com/brand.jpg",
    }),
    { productId: 10, variationId: 20 },
  );
  const c = await api.getContent(20);
  assert.equal(c.productId, 10);
  assert.equal(c.variationId, 20);
  assert.equal(bodies[0].company_id, 1);
  assert.equal(bodies[0].images[0].uuid, "");
  assert.match(paths[1], /variation_id=20/);
  assert.match(paths[1], /company_id=1/);
});
test("verified library content can be counted after seeding", async () => {
  const api = client(async () =>
    json({
      data: [
        {
          product_id: 10,
          variation_id: 20,
          title: { en: "Case" },
          description: { en: "Scope" },
        },
      ],
    }),
  );
  assert.equal(await api.contentCount(), 1);
});
test("draft retrieval must match the requested UUID even within the company", async () => {
  await assert.rejects(
    () =>
      client(async () =>
        json({
          data: {
            uuid: "00000000-0000-4000-8000-000000000002",
            company_id: 7,
            status: null,
            data: {},
          },
        }),
      ).getDraft(uuid),
    /proposal_identity/,
  );
});
