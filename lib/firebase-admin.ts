import * as admin from 'firebase-admin'

// Padrão singleton para evitar reinicialização em hot-reload
function getFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin.apps[0]!
  }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  })
}

export function getDb() {
  return admin.firestore(getFirebaseAdmin())
}

export function getAuth() {
  return admin.auth(getFirebaseAdmin())
}
