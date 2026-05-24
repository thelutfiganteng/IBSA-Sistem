import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Halaman tidak ditemukan</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Halaman yang Anda cari tidak tersedia.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Kembali
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Halaman gagal dimuat
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Terjadi kesalahan, coba lagi.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Coba lagi
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Beranda
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Smart Food Sumsel — Supply Monitoring & Clustering" },
      {
        name: "description",
        content:
          "Smart Food Supply Monitoring & Clustering System Sumatera Selatan — integrasi timbangan digital, AI analytics, dan K-Means clustering surplus-defisit.",
      },
      { name: "author", content: "Pemprov Sumsel" },
      { property: "og:title", content: "Smart Food Sumsel — Supply Monitoring & Clustering" },
      {
        property: "og:description",
        content: "Monitoring supply pangan, AI analytics, dan clustering wilayah.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Smart Food Sumsel — Supply Monitoring & Clustering" },
      { name: "description", content: "Sumsel Food Hub monitors food supply and distribution in South Sumatra using AI and clustering." },
      { property: "og:description", content: "Sumsel Food Hub monitors food supply and distribution in South Sumatra using AI and clustering." },
      { name: "twitter:description", content: "Sumsel Food Hub monitors food supply and distribution in South Sumatra using AI and clustering." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/791c36c9-e58f-4566-9333-fe373c262125/id-preview-8e5f2273--b26a9479-bd6c-4f59-a312-5410b626e74f.lovable.app-1779204008821.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/791c36c9-e58f-4566-9333-fe373c262125/id-preview-8e5f2273--b26a9479-bd6c-4f59-a312-5410b626e74f.lovable.app-1779204008821.png" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
