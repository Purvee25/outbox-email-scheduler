"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api, ApiError, queryKeys } from "@/lib/api";

/** Current user; sends the visitor to /login when the API says the session is missing. */
export function useSession() {
  const router = useRouter();
  const query = useQuery({ queryKey: queryKeys.me, queryFn: api.me });
  const unauthenticated = query.error instanceof ApiError && query.error.status === 401;

  useEffect(() => {
    if (unauthenticated) router.replace("/login");
  }, [unauthenticated, router]);

  return query;
}
