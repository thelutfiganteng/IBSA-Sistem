import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/clustering")({
  beforeLoad: () => {
    throw redirect({
      to: "/gis-map",
      replace: true,
    });
  },
  component: () => null,
});
