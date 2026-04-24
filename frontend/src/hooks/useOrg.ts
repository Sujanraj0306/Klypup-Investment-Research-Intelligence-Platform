import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { OrgMetadata } from '../types';

export function useOrg(orgId: string | null) {
  const [metadata, setMetadata] = useState<OrgMetadata | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId) {
      setMetadata(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getDoc(doc(db, 'orgs', orgId, 'metadata', 'info'))
      .then((snap) => {
        if (cancelled) return;
        setMetadata(snap.exists() ? (snap.data() as OrgMetadata) : null);
      })
      .catch((err) => {
        console.error('Failed to load org metadata:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return { metadata, loading };
}
