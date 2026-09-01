import { useRouteError, useNavigate } from "react-router";
import type { Route } from "./+types/sessions";
import { queryClient } from "../lib/query-client";
import { sessionsOptions } from "../queries/sessions";
import { refsOptions } from "../queries/refs";
import { SessionsPage } from "../components/session/sessions-page";
import { ErrorPage } from "../components/error-page";

export async function clientLoader() {
  await Promise.all([
    queryClient.ensureQueryData(sessionsOptions(false)),
    queryClient.ensureQueryData(refsOptions()),
  ]);
  return null;
}

export default function SessionsRoute() {
  return <SessionsPage />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();
  return (
    <ErrorPage
      error={error}
      actions={[
        { label: "Working changes", primary: true, onClick: () => navigate("/diff?ref=work") },
      ]}
    />
  );
}
