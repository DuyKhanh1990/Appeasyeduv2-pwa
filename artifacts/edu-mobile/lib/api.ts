import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getProjectId } from "@/lib/pushNotifications";

const CENTER_URL_KEY = "edu_center_url";
const LAST_CENTER_KEY = "edu_last_center_url";
const LAST_USERNAME_KEY = "edu_last_username";
const ROLE_KEY = "edu_user_role";
const TOKEN_KEY = "edu_auth_token";

let centerUrl: string | null = null;
let authToken: string | null = null;

// Callback được set bởi AuthContext để tự động logout khi nhận 401
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export async function initApi() {
  centerUrl = await AsyncStorage.getItem(CENTER_URL_KEY);
  authToken = await AsyncStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string) {
  authToken = token;
  AsyncStorage.setItem(TOKEN_KEY, token);
}

export function getAuthToken() {
  return authToken;
}

export async function saveLastCredentials(url: string, username: string) {
  await AsyncStorage.setItem(LAST_CENTER_KEY, url);
  await AsyncStorage.setItem(LAST_USERNAME_KEY, username);
}

export async function getLastCredentials(): Promise<{ centerUrl: string; username: string }> {
  const c = await AsyncStorage.getItem(LAST_CENTER_KEY);
  const u = await AsyncStorage.getItem(LAST_USERNAME_KEY);
  return { centerUrl: c || "", username: u || "" };
}

export async function saveRole(role: string) {
  await AsyncStorage.setItem(ROLE_KEY, role);
}

export async function getStoredRole(): Promise<string | null> {
  return AsyncStorage.getItem(ROLE_KEY);
}

export function clearSession() {
  centerUrl = null;
  authToken = null;
  AsyncStorage.removeItem(CENTER_URL_KEY);
  AsyncStorage.removeItem(ROLE_KEY);
  AsyncStorage.removeItem(TOKEN_KEY);
}

export function setCenterUrl(url: string) {
  const normalized = url.trim().replace(/\/$/, "");
  centerUrl = normalized;
  AsyncStorage.setItem(CENTER_URL_KEY, normalized);
}

export function getCenterUrl() {
  return centerUrl;
}

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...extra,
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  return headers;
}

function handleUnauthorized(status: number) {
  if (status === 401 && onUnauthorized) {
    onUnauthorized();
  }
}

async function readErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const json = await response.json();
    return typeof json?.message === "string" ? json.message : undefined;
  } catch {
    return undefined;
  }
}

export async function apiPost<T>(path: string, body: unknown): Promise<{ data: T; response: Response }> {
  if (!centerUrl) throw new Error("Center URL chưa được cài đặt");
  const response = await fetch(`${centerUrl}${path}`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    handleUnauthorized(response.status);
    const serverMessage = await readErrorMessage(response);
    throw Object.assign(new Error(serverMessage ?? `HTTP ${response.status}`), {
      status: response.status,
      serverMessage,
    });
  }
  const data: T = await response.json();
  return { data, response };
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  if (!centerUrl) throw new Error("Center URL chưa được cài đặt");
  const response = await fetch(`${centerUrl}${path}`, {
    method: "PATCH",
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    handleUnauthorized(response.status);
    const serverMessage = await readErrorMessage(response);
    throw Object.assign(new Error(serverMessage ?? `HTTP ${response.status}`), {
      status: response.status,
      serverMessage,
    });
  }
  return response.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  if (!centerUrl) throw new Error("Center URL chưa được cài đặt");
  const response = await fetch(`${centerUrl}${path}`, {
    method: "PUT",
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    handleUnauthorized(response.status);
    throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
  }
  return response.json() as Promise<T>;
}

export async function apiDelete<T = void>(path: string): Promise<T> {
  if (!centerUrl) throw new Error("Center URL chưa được cài đặt");
  const response = await fetch(`${centerUrl}${path}`, {
    method: "DELETE",
    headers: buildHeaders(),
  });
  if (!response.ok) {
    handleUnauthorized(response.status);
    throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
  }
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  if (!centerUrl) throw new Error("Center URL chưa được cài đặt");
  const response = await fetch(`${centerUrl}${path}`, {
    method: "GET",
    headers: buildHeaders(),
  });
  if (!response.ok) {
    handleUnauthorized(response.status);
    throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
  }
  return response.json() as Promise<T>;
}

export interface SendPushTokenResult {
  ok: boolean;
  error?: string;
}

// Token hiện tại của thiết bị — được set bởi sendPushTokenToBackend,
// dùng lại bởi unregisterPushToken khi logout.
let _activePushToken: string | null = null;

export async function sendPushTokenToBackend(pushToken: string): Promise<SendPushTokenResult> {
  // Backend (do team web xây dựng riêng) cần cung cấp endpoint này.
  // Xem tài liệu API tại: artifacts/edu-mobile/docs/push-notification-api.md
  try {
    await apiPost("/api/mobile/push-token", {
      pushToken,
      platform: Platform.OS,
      expoProjectId: getProjectId(),
    });
    _activePushToken = pushToken;
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log("[push] Không gửi được token về backend:", message);
    return { ok: false, error: message };
  }
}

export async function unregisterPushToken(): Promise<void> {
  if (!_activePushToken) return;
  try {
    await apiDelete(`/api/mobile/push-token?pushToken=${encodeURIComponent(_activePushToken)}`);
  } catch {
    // Bỏ qua lỗi — backend có thể chưa có endpoint này.
    // Token sẽ tự hết hạn hoặc bị ghi đè khi user đăng nhập lại.
  } finally {
    _activePushToken = null;
  }
}

export interface UploadedFile {
  name: string;
  url: string;
  size?: number;
  mimetype?: string;
}

export async function apiUpload(
  files: Array<{ uri: string; name: string; mimeType?: string; file?: File }>
): Promise<UploadedFile[]> {
  if (!centerUrl) throw new Error("Center URL chưa được cài đặt");

  const formData = new FormData();

  for (const f of files) {
    if (Platform.OS === "web") {
      if (f.file) {
        formData.append("files", f.file, f.name);
      } else {
        const res = await fetch(f.uri);
        const blob = await res.blob();
        formData.append("files", blob, f.name);
      }
    } else {
      formData.append("files", {
        uri: f.uri,
        name: f.name,
        type: f.mimeType || "application/octet-stream",
      } as unknown as Blob);
    }
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${centerUrl}/api/upload`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    handleUnauthorized(response.status);
    throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
  }

  const data = await response.json() as { files: UploadedFile[] };
  return data.files;
}
