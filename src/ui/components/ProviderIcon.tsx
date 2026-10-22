import type { SourceProvider } from '../../contracts';
import { Globe } from 'lucide-react';

/** Simple monochrome provider marks (brand icons are not shipped by lucide). */
export function ProviderIcon({ provider, size = 18 }: { provider: SourceProvider | null | undefined; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true as const, fill: 'currentColor' };
  switch (provider) {
    case 'GITHUB':
      return (
        <svg {...common}>
          <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
        </svg>
      );
    case 'GITLAB':
      return (
        <svg {...common}>
          <path d="m23.6 9.6-.03-.09-3.27-8.53a.85.85 0 0 0-1.62.06l-2.2 6.75H7.52L5.32 1.04A.85.85 0 0 0 3.7.98L.43 9.5l-.03.09a6.06 6.06 0 0 0 2.01 7l.01.01.03.02 4.97 3.73 2.46 1.86 1.5 1.13a1 1 0 0 0 1.22 0l1.5-1.13 2.46-1.86 5-3.75a6.07 6.07 0 0 0 2.04-7Z" />
        </svg>
      );
    case 'BITBUCKET':
      return (
        <svg {...common}>
          <path d="M.78 1.21a.77.77 0 0 0-.77.89l3.26 19.8c.08.5.51.87 1.02.87h15.64a.77.77 0 0 0 .77-.65l3.26-20.01a.77.77 0 0 0-.77-.89L.78 1.21ZM14.52 15.5H9.52l-1.35-7.07h7.56l-1.21 7.07Z" />
        </svg>
      );
    case 'DROPBOX':
      return (
        <svg {...common}>
          <path d="M6 1.8 0 5.6l6 3.8 6-3.8-6-3.8Zm12 0-6 3.8 6 3.8 6-3.8-6-3.8ZM0 13.2 6 17l6-3.8-6-3.8-6 3.8Zm18-3.8-6 3.8 6 3.8 6-3.8-6-3.8ZM6 18.3l6 3.8 6-3.8-6-3.8-6 3.8Z" />
        </svg>
      );
    case 'GOOGLE_DRIVE':
      return (
        <svg {...common}>
          <path d="M8.27 2h7.46l7.27 12.6-3.73 6.4H4.73L1 14.6 8.27 2Zm.86 1.5L3.6 13.1h6.9l5.53-9.6h-6.9Zm7.74.75-5.5 9.55 3.45 6h.02l5.5-9.55-3.47-6Zm-6.6 10.35H3.6l3.42 5.9h6.7l-3.45-5.9Z" />
        </svg>
      );
    default:
      return <Globe size={size} aria-hidden="true" />;
  }
}
