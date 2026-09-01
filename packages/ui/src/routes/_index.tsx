import { redirect } from "react-router";

export function clientLoader() {
  throw redirect("/sessions");
}

export default function Index() {
  return null;
}
