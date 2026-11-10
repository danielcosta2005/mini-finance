import { HttpResponse, http } from 'msw/http';

// Used only by unit tests. The application and Playwright never load MSW.
export const handlers = [
  http.get('http://localhost:5173/api/health', () =>
    HttpResponse.json({ status: 'ok' }),
  ),
];
