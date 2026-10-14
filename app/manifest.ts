import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Home',
    short_name: 'Home',
    start_url: '/',
    display: 'standalone',
    background_color: '#151A19',
    theme_color: '#0F1312',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
