import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideIdentity,
  nameResemblance,
  locationResemblance,
  identityThresholds,
} from "../src/domain/identity.js";

const at = "2026-10-10T12:00:00.000Z";
const src = (id: string, label: string, excerpt: string, url = "https://listing.example/" + id) => ({
  id,
  label,
  excerpt,
  url,
  retrievedAt: at,
  synthetic: false,
});
const candidate = (
  sourceId: string,
  name: string,
  location: string | null,
  sourceIds = [sourceId],
) => ({
  sourceIds,
  name: { sourceId, text: name },
  location: location === null ? null : { sourceId, text: location },
});
const decide = (
  input: { businessName: string; location: string; website?: string },
  evidence: ReturnType<typeof src>[],
  candidates: ReturnType<typeof candidate>[],
  status: "confirmed" | "ambiguous" = "confirmed",
) => decideIdentity({ status, reason: "r", candidates }, input, evidence);

test("resemblance tolerates inflection, legal suffixes and missing spaces but separates different names", () => {
  const { nameContainment: name, locationContainment: place } = identityThresholds;
  assert.ok(nameResemblance("Stadsmissionens Second Hand", "Stadsmissionen Second Hand") >= name);
  assert.ok(nameResemblance("Brightline Consulting", "Brightline Consulting Ltd") >= name);
  assert.ok(nameResemblance("山田製作所", "山田製作所") >= name);
  assert.ok(nameResemblance("EKEBY STÄD", "Ekeby Autoservice") < name);
  assert.ok(nameResemblance("Ekeby", "Ekeby Autoservice") < name);
  // A quote may be longer than the name, such as a page title.
  assert.ok(nameResemblance("Handy Heroes - Städ- och Underhållstjänster i Stockholm", "Handy Heroes AB") >= name);
  assert.ok(locationResemblance("Artillerigatan 6, SE-114 51 Stockholm", "Stockholm") >= place);
  assert.ok(locationResemblance("Uppsala", "Ekebyvägen 25, 752 63 Uppsala") >= place);
  assert.ok(locationResemblance("大阪市北区", "大阪市") >= place);
  assert.ok(locationResemblance("Alameda, CA", "Stockholm") < place);
  assert.ok(locationResemblance("Apelgatan 18 B, 75435 Uppsala", "Ekebyvägen 25, 752 63 Uppsala") < place);
});

test("a single verified candidate confirms identity and exposes its sources", () => {
  const evidence = [
    src("s1", "Handy Heroes AB | Stockholm", "Handy Heroes AB är en städfirma i Stockholm."),
    src("s2", "Handy Heroes, Inc.", "General contractor in Alameda, CA."),
  ];
  const r = decide({ businessName: "Handy Heroes AB", location: "Stockholm" }, evidence, [
    candidate("s1", "Handy Heroes AB", "Stockholm"),
  ]);
  assert.equal(r.status, "confirmed");
  assert.deepEqual(r.identity.matchedSourceIds, ["s1"]);
});

test("fabricated, mismatched or unanchored identity evidence is removed", () => {
  const input = { businessName: "Ekeby Autoservice", location: "Uppsala" };
  const evidence = [
    src("s1", "EKEBY STÄD", "EKEBY STÄD in Uppsala, 752 75 Uppsala Sweden"),
    src("s2", "Ekeby Autoservice", "Ekeby Autoservice, vehicle services."),
    src("s3", "Uppsala", "Car services in Uppsala."),
  ];
  const expected = ["name_not_quoted", "name_mismatch", "location_other_source", "unanchored", "unknown_source"];
  for (const [n, c] of [
    candidate("s1", "Ekeby Autoservice", "Uppsala"), // name not in source
    candidate("s1", "EKEBY STÄD", "Uppsala"), // different business
    { ...candidate("s2", "Ekeby Autoservice", null), location: { sourceId: "s3", text: "Uppsala" } }, // location from another source
    candidate("s2", "Ekeby Autoservice", null), // no location, no website
    candidate("s9", "Ekeby Autoservice", "Uppsala"), // unknown source
  ].entries()) {
    const r = decide(input, evidence, [c as ReturnType<typeof candidate>]);
    assert.equal(r.status, "ambiguous");
    assert.equal(r.identity.candidates.length, 0);
    assert.deepEqual(r.identity.rejected, [expected[n]]);
  }
});

test("the supplied website anchors identity without a location quote", () => {
  const evidence = [src("s1", "Aurora Yoga", "Welcome to Aurora Yoga.", "https://www.aurorayoga.example/")];
  const r = decide(
    { businessName: "Aurora Yoga", location: "Tromsø", website: "https://aurorayoga.example" },
    evidence,
    [candidate("s1", "Aurora Yoga", null)],
  );
  assert.equal(r.status, "confirmed");
});

test("scripts without spaces are verified like any other", () => {
  const evidence = [src("s1", "山田製作所｜大阪市の金属加工", "山田製作所は大阪市北区で精密金属加工を行っています。")];
  const r = decide({ businessName: "山田製作所", location: "大阪市" }, evidence, [
    candidate("s1", "山田製作所", "大阪市北区"),
  ]);
  assert.equal(r.status, "confirmed");
});

test("several verified candidates, or a model ambiguity verdict, stay ambiguous with candidates kept", () => {
  const input = { businessName: "Nordic Fix", location: "Malmö" };
  const evidence = [
    src("s1", "Nordic Fix AB", "Nordic Fix AB, Industrigatan 3, 212 14 Malmö."),
    src("s2", "Nordic Fix", "Nordic Fix, Södergatan 10, 211 34 Malmö."),
  ];
  const two = [
    candidate("s1", "Nordic Fix AB", "Industrigatan 3, 212 14 Malmö"),
    candidate("s2", "Nordic Fix", "Södergatan 10, 211 34 Malmö"),
  ];
  const r = decide(input, evidence, two);
  assert.equal(r.status, "ambiguous");
  assert.equal(r.identity.candidates.length, 2);
  assert.deepEqual(r.identity.matchedSourceIds, []);
  assert.equal(decide(input, evidence, two.slice(0, 1), "ambiguous").status, "ambiguous");
});

test("quotes are matched after case and whitespace normalisation only", () => {
  const evidence = [src("s1", "Lindqvist Bageri", "LINDQVIST   BAGERI\nStora Gatan 12, Västerås")];
  const ok = decide({ businessName: "Lindqvist Bageri", location: "Västerås" }, evidence, [
    candidate("s1", "lindqvist bageri", "Stora Gatan 12, Västerås"),
  ]);
  assert.equal(ok.status, "confirmed");
  const reworded = decide({ businessName: "Lindqvist Bageri", location: "Västerås" }, evidence, [
    candidate("s1", "Lindqvist Bageri", "Stora gatan 12 i Västerås"),
  ]);
  // The typed city is in the source, so identity holds, but a reworded quote is
  // never kept or shown as the source's own wording.
  assert.equal(reworded.status, "confirmed");
  assert.equal(reworded.identity.candidates[0].location, null);
  const renamed = decide({ businessName: "Lindqvist Bageri", location: "Västerås" }, evidence, [
    candidate("s1", "Lindqvists Bageri AB", null),
  ]);
  assert.deepEqual(renamed.identity.rejected, ["name_not_quoted"]);
});

test("the typed location found in the name's own source anchors identity, whatever the model quoted", () => {
  const evidence = [
    src("s2", "Handy Heroes", "Handy Heroes AB är en städfirma i Stockholm."),
    src("s6", "Handy Heroes AB - Detailed information", "SE-114 51 Stockholm. Visiting address: Artillerigatan 6."),
  ];
  const c = { ...candidate("s2", "Handy Heroes", null, ["s2", "s6"]), location: { sourceId: "s6", text: "SE-114 51 Stockholm" } };
  const r = decide({ businessName: "Handy Heroes AB", location: "Stockholm" }, evidence, [c]);
  assert.equal(r.status, "confirmed");
  // A city scattered across words is not a match; the stretch must be continuous.
  const scattered = [src("s1", "Lunar Design", "Lunar Design. Founded by Lu Nd.")];
  assert.equal(
    decide({ businessName: "Lunar Design", location: "Lund" }, scattered, [candidate("s1", "Lunar Design", null)]).status,
    "ambiguous",
  );
});

test("a model ambiguity verdict stands unless every competing candidate is verifiably elsewhere", () => {
  const input = { businessName: "山田製作所", location: "大阪市" };
  const evidence = [
    src("s1", "山田製作所｜大阪市の金属加工", "山田製作所は大阪市北区で精密金属加工を行っています。"),
    src("s2", "山田製作所 名古屋", "山田製作所は名古屋市で木工製品を販売しています。"),
  ];
  const osaka = candidate("s1", "山田製作所", "大阪市北区"),
    nagoya = candidate("s2", "山田製作所", "名古屋市");
  const r = decide(input, evidence, [osaka, nagoya], "ambiguous");
  assert.equal(r.status, "confirmed");
  assert.deepEqual(r.identity.rejected, ["location_mismatch"]);
  // Doubt about the only candidate itself is the model's judgement and stands.
  assert.equal(decide(input, evidence, [osaka], "ambiguous").status, "ambiguous");
});

test("website suggestions keep the candidate's own-site sources and drop directories and social sites", () => {
  const evidence = [
    src("s1", "Handy Heroes AB", "Handy Heroes AB, städfirma i Stockholm.", "https://www.handyheroes.se/"),
    src("s2", "Handy Heroes AB | Stockholm", "Städfirma i Stockholm.", "https://www.instagram.com/handyheroes.se"),
    src("s3", "Handy Heroes AB", "Handy Heroes AB, Artillerigatan 6, Stockholm.", "https://www.largestcompanies.com/company/Handy-Heroes-AB"),
    src("s4", "Diplomat", "Hotel Diplomat Stockholm.", "https://www.diplomathotel.com/"),
  ];
  const c = { ...candidate("s1", "Handy Heroes AB", null, ["s1", "s2", "s3"]), websiteSourceIds: ["s1", "s2", "s3", "s4"] };
  const r = decide({ businessName: "Handy Heroes AB", location: "Stockholm" }, evidence, [c]);
  assert.equal(r.status, "confirmed");
  // s4 is not one of the candidate's sources; s2 and s3 are not its own domain.
  assert.deepEqual(r.identity.candidates[0].websiteSourceIds, ["s1"]);
  // Two pages of the same site are one website suggestion.
  const pages = [...evidence, src("s5", "Home", "Handy Heroes AB.", "https://handyheroes.se/home.html")];
  const both = { ...candidate("s1", "Handy Heroes AB", null, ["s1", "s5"]), websiteSourceIds: ["s1", "s5"] };
  const twice = decide({ businessName: "Handy Heroes AB", location: "Stockholm" }, pages, [both]);
  assert.deepEqual(twice.identity.candidates[0].websiteSourceIds, ["s1"]);
});

test("the identify call returns verified candidates and website suggestions without retrying", async () => {
  const { identifyBusiness } = await import("../src/server/providers/research.js");
  const evidence = [
    src("s1", "Handy Heroes AB", "Handy Heroes AB är en städfirma i Stockholm.", "https://www.handyheroes.se/"),
    src("s2", "Handy Heroes, Inc.", "General contractor in Alameda, CA.", "https://www.bbb.example/handy-heroes"),
  ];
  let calls = 0;
  const reply = {
    status: "confirmed",
    reason: "One Stockholm business matches.",
    candidates: [
      { ...candidate("s1", "Handy Heroes AB", "Stockholm"), websiteSourceIds: ["s1"] },
      { ...candidate("s2", "Handy Heroes, Inc.", "Alameda, CA"), websiteSourceIds: [] },
    ],
  };
  const r = await identifyBusiness(
    { businessName: "Handy Heroes AB", location: "Stockholm", website: undefined },
    evidence,
    {
      apiKey: "synthetic",
      model: "deepseek-flash",
      fetch: async () => {
        calls++;
        return Response.json({
          id: "synthetic",
          object: "chat.completion",
          created: 1,
          model: "deepseek-flash",
          choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(reply) }, finish_reason: "stop" }],
          usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
        });
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(r.status, "confirmed");
  assert.equal(r.promptVersion, "business-identity-1");
  assert.deepEqual(r.identity.candidates.map((c) => c.websiteSourceIds), [["s1"]]);
  assert.deepEqual(r.identity.rejected, ["location_mismatch"]);
});
