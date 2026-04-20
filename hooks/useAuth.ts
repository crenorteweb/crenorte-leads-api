'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '@/lib/firebase-client'

interface UseAuthReturn {
  user: User | null
  loading: boolean
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)

      if (!firebaseUser) {
        router.replace('/login')
      }
    })

    return () => unsubscribe()
  }, [router])

  return { user, loading }
}
