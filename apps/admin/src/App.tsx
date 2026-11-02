import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { onSignInRequired } from './api/client';
import { createQueryClient } from './lib/queryClient';
import { routes } from './routes';

const router = createBrowserRouter(routes, {
  future: { v7_relativeSplatPath: true, v7_fetcherPersist: true, v7_normalizeFormMethod: true, v7_partialHydration: true, v7_skipActionErrorRevalidation: true },
});

export function App() {
  const [client] = useState(createQueryClient);

  // A 401 anywhere means the admin session ended: forget what was loaded and go to /sign-in (and back here after).
  useEffect(
    () =>
      onSignInRequired(() => {
        client.clear();
        const here = `${window.location.pathname}${window.location.search}`;
        if (window.location.pathname.startsWith('/sign-in')) return;
        void router.navigate(here === '/' ? '/sign-in' : `/sign-in?next=${encodeURIComponent(here)}`, { replace: true });
      }),
    [client],
  );

  return (
    <QueryClientProvider client={client}>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </QueryClientProvider>
  );
}
