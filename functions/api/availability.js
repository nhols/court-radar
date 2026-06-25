import { getAvailability } from "../../lib/availability.mjs";

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const result = await getAvailability(url.searchParams.get("date"), {
    skipAllStar: url.searchParams.get("skip") === "allstar"
  });

  return Response.json(result.data, {
    status: result.status,
    headers: {
      "cache-control": "no-store"
    }
  });
}
