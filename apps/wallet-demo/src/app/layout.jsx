import '../styles.css'

export const metadata = {
  title: 'Confidential WDK Wallet',
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='16' fill='%23009393'/><text x='16' y='22' font-size='18' text-anchor='middle' fill='white' font-family='sans-serif' font-weight='700'>₮</text></svg>"
  }
}

export default function RootLayout ({ children }) {
  return (
    <html lang='en'>
      <body>{children}</body>
    </html>
  )
}
