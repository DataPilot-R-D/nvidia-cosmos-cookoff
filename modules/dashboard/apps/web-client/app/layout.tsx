import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration'
import { PwaInstallPrompt } from '@/components/pwa/PwaInstallPrompt'
import { ConnectionBanner } from '@/components/pwa/ConnectionBanner'
import { OfflineQueueController } from '@/components/pwa/OfflineQueueController'
import { EmergencyStopButton } from '@/components/pwa/EmergencyStopButton'
import { PushNotificationPrompt } from '@/components/pwa/PushNotificationPrompt'
import { NotificationHandler } from '@/components/pwa/NotificationHandler'
import { MobileShell } from '@/components/pwa/MobileShell'
import { AuthProvider } from '@/providers/auth-provider'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0e17',
}

export const metadata: Metadata = {
  title: 'Security Robot Command Center',
  description: 'Real-time dashboard for monitoring and controlling security robots',
  keywords: ['security', 'robot', 'dashboard', 'monitoring', 'ROS'],
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'RobotCC',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} dark`}>
      <body className="min-h-screen bg-tactical-950 font-sans antialiased">
        <AuthProvider>
          <ServiceWorkerRegistration />
          <PwaInstallPrompt />
          <ConnectionBanner />
          <OfflineQueueController />
          <PushNotificationPrompt />
          <NotificationHandler />
          <EmergencyStopButton />
          <MobileShell />
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
