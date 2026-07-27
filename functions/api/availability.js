import { getAvailability } from "../../lib/availability.mjs";

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const lta = url.searchParams.get("lta");
  const result = await getAvailability(url.searchParams.get("date"), {
    skipAllStar: url.searchParams.get("skip") === "allstar",
    ltaLocations: lta === null ? undefined : lta.split(",").filter(Boolean)
  });

  return Response.json(result.data, {
    status: result.status,
    headers: {
      "cache-control": "no-store"
    }
  });
}
