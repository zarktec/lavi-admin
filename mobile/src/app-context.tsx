import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import Constants from "expo-constants";
import * as Localization from "expo-localization";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { ApiError, NetworkError, createClient, type Api, type Tokens } from "./api/client";
import type { AppConfig, ScanResponse } from "./api/types";
import { loginWithShopify } from "./auth/shopify";
import { config } from "./config";
import { ScanQueue, type SendOutcome } from "./lib/queue";
import { versionLt } from "./lib/version";
import { cancelAllReminders, cancelDoseReminders, configureNotifications, getPushToken, rescheduleReminders } from "./notifications/service";
import type { CartLine } from "./store/storefront";

const ACCESS = "lavi.access";
const REFRESH = "lavi.refresh";
const DEVICE_ID = "lavi.deviceId";

const tokenStore = {
  async get(): Promise<Tokens | null> {
    const [a, r] = await Promise.all([SecureStore.getItemAsync(ACCESS), SecureStore.getItemAsync(REFRESH)]);
    return a && r ? { access_token: a, refresh_token: r } : null;
  },
  async set(t: Tokens | null) {
    if (!t) await Promise.all([SecureStore.deleteItemAsync(ACCESS), SecureStore.deleteItemAsync(REFRESH)]);
    else await Promise.all([SecureStore.setItemAsync(ACCESS, t.access_token), SecureStore.setItemAsync(REFRESH, t.refresh_token)]);
  },
};

export type ScanOutcome =
  | { kind: "response"; response: ScanResponse }
  | { kind: "queued" }
  | { kind: "error"; message: string };

type Status = "loading" | "signedOut" | "signedIn";

interface Ctx {
  api: Api;
  status: Status;
  appConfig: AppConfig | null;
  forceUpdate: boolean;
  dataVersion: number;
  queued: number;
  scanOutcome: ScanOutcome | null;
  cart: CartLine[];
  setCart: (fn: (c: CartLine[]) => CartLine[]) => void;
  signIn: (consent: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  submitScan: (tagUrl: string) => Promise<void>;
  refreshReminders: () => Promise<void>;
  registerPush: () => Promise<void>;
  bump: () => void;
}

const AppContext = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppContext);
  if (!c) throw new Error("useApp fuera de AppProvider");
  return c;
};

const queue = new ScanQueue(AsyncStorage);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [queued, setQueued] = useState(0);
  const [scanOutcome, setScanOutcome] = useState<ScanOutcome | null>(null);
  const [cart, setCartState] = useState<CartLine[]>([]);
  const configRef = useRef<AppConfig | null>(null);
  configRef.current = appConfig;

  const api = useMemo(() => createClient({ baseUrl: config.apiUrl, tokens: tokenStore, onSessionLost: () => setStatus("signedOut") }), []);
  const bump = useCallback(() => setDataVersion((v) => v + 1), []);

  const loadConfig = useCallback(async () => {
    try {
      setAppConfig(await api.getConfig());
    } catch {
      /* sin red: seguimos con lo último conocido */
    }
  }, [api]);

  const refreshReminders = useCallback(async () => {
    const texts = configRef.current?.notification_texts;
    if (!texts) return;
    try {
      await rescheduleReminders(api, texts);
    } catch {
      /* se reintenta la próxima vez que se abra la app */
    }
  }, [api]);

  const flushQueue = useCallback(async () => {
    if ((await tokenStore.get()) === null) return;
    const r = await queue.flush(async (req): Promise<SendOutcome> => {
      try {
        return { kind: "sent", response: await api.scan(req) };
      } catch (e) {
        if (e instanceof ApiError && e.status !== 401 && e.status < 500) return { kind: "drop" };
        return { kind: "retry" };
      }
    });
    setQueued(r.remaining);
    if (r.sent.length || r.dropped.length) {
      bump();
      refreshReminders();
    }
  }, [api, bump, refreshReminders]);

  // Arranque
  useEffect(() => {
    configureNotifications();
    (async () => {
      setStatus((await tokenStore.get()) ? "signedIn" : "signedOut");
      setQueued((await queue.list()).length);
      await loadConfig();
    })();
  }, [loadConfig]);

  // Al abrir sesión / volver a primer plano / recuperar red
  useEffect(() => {
    if (status !== "signedIn") return;
    const onActive = () => {
      loadConfig().then(refreshReminders);
      flushQueue();
      bump();
    };
    onActive();
    const sub = AppState.addEventListener("change", (s) => s === "active" && onActive());
    const net = NetInfo.addEventListener((s) => s.isConnected && s.isInternetReachable !== false && flushQueue());
    return () => {
      sub.remove();
      net();
    };
  }, [status, loadConfig, refreshReminders, flushQueue, bump]);

  const registerPush = useCallback(async () => {
    const token = await getPushToken();
    if (!token) return;
    try {
      const d = await api.registerDevice({ push_token: token, platform: Platform.OS === "ios" ? "ios" : "android" });
      await AsyncStorage.setItem(DEVICE_ID, d.id);
    } catch {
      /* el push de respaldo es opcional */
    }
  }, [api]);

  const clearLocal = useCallback(async () => {
    await tokenStore.set(null);
    await AsyncStorage.multiRemove([DEVICE_ID, "scan_queue_v1"]);
    await cancelAllReminders().catch(() => {});
    setQueued(0);
    setScanOutcome(null);
    setCartState([]);
    setStatus("signedOut");
  }, []);

  const signIn = useCallback(async (consent: boolean) => {
    const shopifyToken = await loginWithShopify();
    const tz = Localization.getCalendars()[0]?.timeZone ?? undefined;
    const s = await api.createSession({ shopify_access_token: shopifyToken, timezone: tz, data_consent: consent });
    await tokenStore.set({ access_token: s.access_token, refresh_token: s.refresh_token });
    if (s.needs_data_consent && consent) await api.updateMe({ accept_data_policy: true });
    setStatus("signedIn");
    registerPush();
  }, [api, registerPush]);

  const signOut = useCallback(async () => {
    try {
      const id = await AsyncStorage.getItem(DEVICE_ID);
      if (id) await api.removeDevice(id);
      await api.deleteSession();
    } catch {
      /* cerramos localmente de todas formas */
    }
    await clearLocal();
  }, [api, clearLocal]);

  const deleteAccount = useCallback(async () => {
    await api.deleteMe();
    await clearLocal();
  }, [api, clearLocal]);

  const submitScan = useCallback(async (tagUrl: string) => {
    const device_time = new Date().toISOString();
    let outcome: ScanOutcome;
    try {
      const response = await api.scan({ tag_url: tagUrl, device_time, offline: false });
      outcome = { kind: "response", response };
      if ("dose_id" in response && (response.result === "dose_recorded" || response.result === "late")) cancelDoseReminders(response.dose_id).catch(() => {});
      bump();
      if (response.result !== "activation_required") refreshReminders();
    } catch (e) {
      if (e instanceof NetworkError) {
        // Sin conexión: se guarda el enlace y la hora del dispositivo; el backend decide al reenviarlo
        setQueued(await queue.enqueue({ tag_url: tagUrl, device_time }));
        outcome = { kind: "queued" };
      } else {
        outcome = { kind: "error", message: e instanceof ApiError ? e.message : "No pudimos procesar la lectura" };
      }
    }
    setScanOutcome(outcome);
    if (outcome.kind === "response" && outcome.response.result === "activation_required") router.replace("/activate");
    else router.replace("/scan-result");
  }, [api, bump, refreshReminders]);

  const setCart = useCallback((fn: (c: CartLine[]) => CartLine[]) => setCartState(fn), []);

  const forceUpdate = !!appConfig && versionLt(Constants.expoConfig?.version ?? "0.0.0", appConfig.min_app_version);

  const value: Ctx = { api, status, appConfig, forceUpdate, dataVersion, queued, scanOutcome, cart, setCart, signIn, signOut, deleteAccount, submitScan, refreshReminders, registerPush, bump };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
