import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { useApp } from "../app-context";

export interface Async<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  reload: () => void;
}

/** Carga datos al enfocar la pantalla y cuando cambian los datos globales (tras sincronizar lecturas, etc.). */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): Async<T> {
  const { dataVersion } = useApp();
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean; refreshing: boolean }>({ data: null, error: null, loading: true, refreshing: false });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async (manual: boolean) => {
    setState((s) => ({ ...s, refreshing: manual, loading: s.data === null }));
    try {
      const data = await fnRef.current();
      setState({ data, error: null, loading: false, refreshing: false });
    } catch (e: any) {
      setState((s) => ({ ...s, error: e?.message ?? "No pudimos cargar la información", loading: false, refreshing: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useFocusEffect(
    useCallback(() => {
      run(false);
    }, [run, dataVersion]),
  );

  return { ...state, reload: () => run(true) };
}
