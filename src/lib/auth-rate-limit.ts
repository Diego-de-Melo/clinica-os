/**
 * Server function para login com rate limiting por IP (M2).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { supabase } from "@/integrations/supabase/client";
import { limitFor } from "@/lib/rate-limit";
import { getPostLoginPath } from "@/lib/route-auth";
import { getSessionContext } from "@/lib/session.functions";

const loginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const loginWithRateLimit = createServerFn({ method: "POST" })
  .inputValidator((input) => loginInput.parse(input))
  .handler(async ({ data, context }) => {
    const request = getRequest();
    const ip = request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";

    // Rate limit: 10 tentativas por 15 min por IP
    limitFor(`login:${ip}`, 10, 15 * 60_000);

    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) throw error;

    const session = await getSessionContext();
    return { path: getPostLoginPath(session) };
  });