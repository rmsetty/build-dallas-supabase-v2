import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) {
      return Response.json({ error: "Missing Authorization header" }, { status: 401, headers: cors });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: "Invalid session" }, { status: 401, headers: cors });
    }

    const body = await req.json();
    const seen = new Set<string>();
    const interests = (Array.isArray(body.interests) ? body.interests : [])
      .map(clean)
      .filter((value: string) => {
        const key = value.toLowerCase();
        if (!value || value.length > 40 || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 30);

    const about = clean(body.about).slice(0, 280);
    if (!interests.length && !about) {
      return Response.json({ error: "Add at least one interest" }, { status: 422, headers: cors });
    }

    const text = ((interests.length ? `Interested in: ${interests.join(", ")}.` : "") + " " + about).trim();
    const model = new Supabase.ai.Session("gte-small");
    const embedding = await model.run(text, { mean_pool: true, normalize: true });

    const digestBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    const textHash = Array.from(new Uint8Array(digestBytes))
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");

    const updatedAt = new Date().toISOString();
    const { error: saveError } = await supabase.from("user_interests").upsert({
      user_id: user.id,
      interests,
      about,
      text_hash: textHash,
      embedding,
      updated_at: updatedAt,
    });
    if (saveError) throw saveError;

    const { data: ranked, error: rankError } = await supabase.rpc("match_provider_events", {
      query_embedding: embedding,
      match_count: 100,
    });
    if (rankError) throw rankError;

    return Response.json(
      { interests, about, updated_at: updatedAt, ranked: ranked ?? [] },
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500, headers: cors },
    );
  }
});
