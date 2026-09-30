import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 100);

    const { data: rows, error } = await admin
      .from("provider_events")
      .select("source,provider_event_id,title,data")
      .is("embedding", null)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(limit);
    if (error) throw error;

    const model = new Supabase.ai.Session("gte-small");
    let embedded = 0;

    for (const row of rows ?? []) {
      const event = row.data ?? {};
      const tags = event.tags && typeof event.tags === "object"
        ? Object.values(event.tags).flat().filter(value => typeof value === "string")
        : [];
      const text = [
        row.title,
        event.description ?? event.summary,
        event.organizer?.name,
        ...tags,
      ].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 2000);

      if (!text) continue;

      const embedding = await model.run(text, { mean_pool: true, normalize: true });
      const { error: updateError } = await admin
        .from("provider_events")
        .update({ embedding, embedded_at: new Date().toISOString() })
        .eq("source", row.source)
        .eq("provider_event_id", row.provider_event_id);
      if (updateError) throw updateError;
      embedded++;
    }

    return Response.json({ scanned: rows?.length ?? 0, embedded });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});
