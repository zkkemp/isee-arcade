'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { refreshCloudFamily } from '@/lib/cloudSync';

const REFRESH_INTERVAL_MS = 5_000;

export function useParentCloudRefresh() {
  const [revision, setRevision] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const refresh = useCallback(async (showActivity = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (showActivity) setRefreshing(true);
    const result = await refreshCloudFamily();
    if (!mounted.current) return;
    if (result.ok) {
      setError('');
      setUpdatedAt(Date.now());
      setRevision((value) => value + 1);
    } else {
      setError(result.message);
    }
    setRefreshing(false);
    inFlight.current = false;
  }, []);

  useEffect(() => {
    mounted.current = true;
    const initial = window.setTimeout(() => void refresh(true), 0);
    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    const onFocus = () => void refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      mounted.current = false;
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refresh]);

  return {
    revision,
    refreshing,
    updatedAt,
    error,
    refresh: () => refresh(true),
  };
}
