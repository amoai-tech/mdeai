import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getServerUser = cache(async function getServerUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { user, error };
});
