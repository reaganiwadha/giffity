import { useRouteError, useNavigate } from "react-router";
import type { Route } from "./+types/diff";
import { queryClient } from "../lib/query-client";
import { diffOptions } from "../queries/diff";
import { repoInfoOptions } from "../queries/info";
import { DiffPage } from "../components/diff/diff-page";
import { ErrorPage } from "../components/error-page";

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session") || undefined;
  const theme = url.searchParams.get("theme") as "light" | "dark" | null;
  const view = url.searchParams.get("view") as "split" | "unified" | null;

  let ref = url.searchParams.get("ref") || "work";

  if (sessionId) {
    // Resolve the session to its (last-pair) legacy ref up front so the rest of
    // the diff view keeps working exactly as the ?ref= flow does.
    const info = await queryClient.ensureQueryData(
      repoInfoOptions(undefined, sessionId),
    );
    ref = info.ref ?? ref;
    await queryClient.ensureQueryData(diffOptions(false, ref));
  } else {
    await Promise.all([
      queryClient.ensureQueryData(diffOptions(false, ref)),
      queryClient.ensureQueryData(repoInfoOptions(ref)),
    ]);
  }

  return { ref, sessionId, theme, view };
}

export default function DiffRoute({ loaderData }: Route.ComponentProps) {
  return <DiffPage />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  return (
    <ErrorPage
      error={error}
      actions={[
        { label: "Sessions", primary: true, onClick: () => navigate("/sessions") },
        { label: "View working changes", onClick: () => navigate("/diff?ref=work") },
      ]}
    />
  );
}
