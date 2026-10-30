import { RouterProvider } from 'react-router-dom'

import { Providers } from '@/app/Providers'
import { router } from '@/app/router'

export function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  )
}
