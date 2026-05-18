import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSessionContext, type SessionContext } from "@/lib/session.functions";

export function useSession() {
  const fn = useServerFn(getSessionContext);
  return useQuery<SessionContext>({
    queryKey: ["session"],
    queryFn: () => fn(),
    staleTime: 30_000,
    retry: false,
  });
}
