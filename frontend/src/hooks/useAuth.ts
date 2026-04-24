import { useState, useEffect } from 'react';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setOrgId(userDoc.data().defaultOrg);
          } else {
            const newOrgId = `org_${firebaseUser.uid}`;
            await setDoc(doc(db, 'orgs', newOrgId, 'metadata', 'info'), {
              name:
                firebaseUser.displayName ||
                firebaseUser.email ||
                'My Workspace',
              createdAt: serverTimestamp(),
              adminUids: [firebaseUser.uid],
            });
            await setDoc(doc(db, 'users', firebaseUser.uid), {
              defaultOrg: newOrgId,
              displayName: firebaseUser.displayName,
              email: firebaseUser.email,
              createdAt: serverTimestamp(),
            });
            setOrgId(newOrgId);
          }
        } catch (err) {
          console.error('Failed to load/create user org:', err);
        }
      } else {
        setOrgId(null);
      }
      setLoading(false);
    });
  }, []);

  const loginWithGoogle = () => signInWithPopup(auth, googleProvider);

  const loginWithEmail = (email: string, password: string) =>
    signInWithEmailAndPassword(auth, email, password);

  const signupWithEmail = async (
    email: string,
    password: string,
    displayName?: string,
  ) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName && cred.user) {
      await updateProfile(cred.user, { displayName });
    }
    return cred;
  };

  const logout = () => signOut(auth);

  return {
    user,
    loading,
    orgId,
    loginWithGoogle,
    loginWithEmail,
    signupWithEmail,
    logout,
  };
}
