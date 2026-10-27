import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'


import '../styles.css'
import { AppProvider } from '@/context/AppContext'
import { ToastProvider } from '@/context/ToastContext'
import { AppShell } from '@/components/AppShell'

const siteName = 'File Converter Physical Drop Box'
const siteDescription =
  'A cloud file-conversion drop box: upload a file, pick a format, and convert it serverlessly with AWS S3, Lambda and DynamoDB.'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: `${siteName} · Cloud Dashboard`,
      },
      {
        name: 'description',
        content: siteDescription,
      },
      {
        property: 'og:title',
        content: siteName,
      },
      {
        property: 'og:description',
        content: siteDescription,
      },
      {
        property: 'og:type',
        content: 'website',
      },
      {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
    ],
    links: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <ToastProvider>
          <AppProvider>
            <AppShell>{children}</AppShell>
          </AppProvider>
        </ToastProvider>
        <Scripts />
      </body>
    </html>
  )
}
