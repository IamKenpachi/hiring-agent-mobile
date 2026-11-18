import { Platform } from "react-native";
import Constants from "expo-constants";
import { DEFAULT_GEMINI_MODEL, secureStorage } from "./storage";
import type {
  AuthResponse,
  ExtractJDResponse,
  HuntRunResponse,
  HuntStartPayload,
  ModelOption,
  PlatformsResponse,
  Profile,
  ProfileCreatePayload,
  ProfilePreviewResponse,
  ProfileUpdatePayload,
  RankedJob,
  ReviseOutputResponse,
  SearchRun,
  StudioTailorPayload,
  TailoredOutput,
  TailoredOutputSummary,
  TokenTelemetry,
  User,
} from "../types";

function resolveApiBaseUrl(): string {
  const configured = (process.env.EXPO_PUBLIC_API_URL || "http://localhost:8001")
    .trim()
    .replace(/\/+$/, "");

  if (Platform.OS === "web") {
    return configured;
  }

  // On physical phones in Expo Go, localhost refers to the phone itself.
  // Automatically fall back to the Metro dev host IP when needed.
  if (
    configured.includes("://localhost") ||
    configured.includes("://127.0.0.1")
  ) {
    const hostUri =
      Constants.expoConfig?.hostUri ||
      (Constants as unknown as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } })
        .manifest2?.extra?.expoClient?.hostUri ||
      "";
    const devHost = hostUri.split(":")[0]?.trim();
    if (devHost) {
      return configured.replace(/localhost|127\.0\.0\.1/, devHost);
    }
  }

  return configured;
}

export const API_BASE_URL = resolveApiBaseUrl();

export const DEFAULT_AVAILABLE_MODELS: ModelOption[] = [
  {
    id: "gemini-3.5-flash-lite",
    name: "Rapid Job Scanner",
    description: "Fast & Lightweight • High-speed bulk job screening and quick keyword checks",
    badge: "Fast Scan ⚡",
    input_cost_per_m: 0.3,
    output_cost_per_m: 2.5,
  },
  {
    id: "gemini-3.8-flash",
    name: "Daily Application Tailor",
    description: "Balanced Default • Everyday role matching and full CV & cover letter tailoring",
    badge: "Recommended ⭐",
    input_cost_per_m: 0.75,
    output_cost_per_m: 3.75,
  },
  {
    id: "gemini-4-hydrogen",
    name: "Career Strategist",
    description: "Deep Alignment • Advanced role analysis, impact bullet rewriting, and positioning",
    badge: "Deep Fit 🎯",
    input_cost_per_m: 1.5,
    output_cost_per_m: 7.5,
  },
  {
    id: "gemini-4-argon",
    name: "Executive Headhunter",
    description: "Frontier Precision • Maximum depth for competitive, technical, and leadership roles",
    badge: "Frontier 🏆",
    input_cost_per_m: 2.0,
    output_cost_per_m: 10.0,
  },
];

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

let cachedAuthToken: string | null = null;
let cachedGeminiKey: string | null = null;
let cachedSelectedModel: string | null = null;

export function syncApiCredentials(creds: {
  token?: string | null;
  geminiKey?: string | null;
  model?: string | null;
}) {
  if ("token" in creds) cachedAuthToken = creds.token ?? null;
  if ("geminiKey" in creds) cachedGeminiKey = creds.geminiKey ?? null;
  if ("model" in creds) cachedSelectedModel = creds.model ?? null;
}

export async function buildAuthHeaders(
  overrides?: { geminiKey?: string; model?: string },
  includeJsonContentType = true
): Promise<Record<string, string>> {
  const token = cachedAuthToken ?? (await secureStorage.getAuthToken());
  const geminiKey =
    overrides?.geminiKey ?? cachedGeminiKey ?? (await secureStorage.getGeminiApiKey());
  const model =
    overrides?.model ?? cachedSelectedModel ?? (await secureStorage.getSelectedModel());

  const headers: Record<string, string> = {};
  if (includeJsonContentType) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (geminiKey) {
    headers["X-Gemini-Api-Key"] = geminiKey;
  }
  headers["X-Gemini-Model"] = model || DEFAULT_GEMINI_MODEL;
  return headers;
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const obj = payload as Record<string, unknown>;
  if (typeof obj.detail === "string") return obj.detail;
  if (Array.isArray(obj.detail) && obj.detail.length > 0) {
    const first = obj.detail[0] as Record<string, unknown> | undefined;
    if (first && typeof first.msg === "string") return first.msg;
  }
  if (typeof obj.message === "string") return obj.message;
  return fallback;
}

function createAbortError(err?: unknown): Error {
  if (err instanceof Error && err.name === "AbortError") {
    return err;
  }
  const msg =
    err instanceof Error && err.message
      ? err.message
      : typeof err === "object" &&
          err !== null &&
          "message" in err &&
          typeof (err as { message?: unknown }).message === "string"
        ? (err as { message: string }).message
        : "Request aborted";
  const abortErr = new Error(msg);
  abortErr.name = "AbortError";
  return abortErr;
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name?: unknown }).name === "AbortError"
  );
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    isFormData?: boolean;
    overrides?: { geminiKey?: string; model?: string };
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const {
    method = "GET",
    body,
    headers = {},
    isFormData = false,
    overrides,
    signal,
  } = options;
  if (signal?.aborted) {
    throw createAbortError();
  }
  const authHeaders = await buildAuthHeaders(overrides, !isFormData);
  if (signal?.aborted) {
    throw createAbortError();
  }
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...authHeaders,
        ...headers,
      },
      body: isFormData
        ? (body as FormData)
        : body !== undefined
          ? JSON.stringify(body)
          : undefined,
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if (signal?.aborted || isAbortError(err)) {
      throw createAbortError(err);
    }
    const msg = err instanceof Error ? err.message : "Network request failed";
    throw new ApiError(`${msg} (${url})`, 0);
  }

  const contentType = res.headers.get("content-type") || "";
  let parsed: unknown = null;
  if (contentType.includes("application/json")) {
    try {
      parsed = await res.json();
    } catch (err) {
      if (signal?.aborted || isAbortError(err)) {
        throw createAbortError(err);
      }
      parsed = null;
    }
  } else {
    try {
      const text = await res.text();
      parsed = text ? { detail: text } : null;
    } catch (err) {
      if (signal?.aborted || isAbortError(err)) {
        throw createAbortError(err);
      }
      parsed = null;
    }
  }

  if (signal?.aborted) {
    throw createAbortError();
  }

  if (!res.ok) {
    throw new ApiError(
      extractErrorMessage(parsed, `Request failed with status ${res.status}`),
      res.status,
      parsed
    );
  }

  return parsed as T;
}

export interface DocumentUploadAsset {
  uri: string;
  name: string;
  mimeType?: string;
  file?: File | Blob;
}

async function buildResumeFormData(
  asset: DocumentUploadAsset,
  profileName?: string
): Promise<FormData> {
  const formData = new FormData();
  if (Platform.OS === "web" && asset.file) {
    formData.append("file", asset.file, asset.name || "resume.pdf");
  } else if (Platform.OS === "web" && asset.uri) {
    const blobResp = await fetch(asset.uri);
    const blob = await blobResp.blob();
    formData.append("file", blob, asset.name || "resume.pdf");
  } else {
    formData.append("file", {
      uri: asset.uri,
      name: asset.name || "resume.pdf",
      type: asset.mimeType || "application/pdf",
    } as unknown as Blob);
  }

  if (profileName?.trim()) {
    formData.append("profile_name", profileName.trim());
  }
  return formData;
}

export const apiClient = {
  baseUrl: API_BASE_URL,

  async healthCheck(): Promise<{ status: string; service?: string }> {
    return request<{ status: string; service?: string }>("/health");
  },

  // --- Auth ---
  async signUp(email: string, password: string, fullName?: string): Promise<AuthResponse> {
    return request<AuthResponse>("/api/auth/signup", {
      method: "POST",
      body: {
        email,
        password,
        ...(fullName?.trim() ? { full_name: fullName.trim() } : {}),
      },
    });
  },

  async signIn(email: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
  },

  async getMe(): Promise<User> {
    return request<User>("/api/auth/me");
  },

  async validateGeminiKey(
    apiKey?: string,
    model?: string,
    verifyLive = true
  ): Promise<{
    valid: boolean;
    detail?: string | null;
    models: ModelOption[];
    active_model: string;
  }> {
    return request<{
      valid: boolean;
      detail?: string | null;
      models: ModelOption[];
      active_model: string;
    }>("/api/auth/validate-gemini-key", {
      method: "POST",
      body: {
        ...(apiKey !== undefined ? { api_key: apiKey } : {}),
        ...(model ? { model } : {}),
        verify_live: verifyLive,
      },
      overrides: { geminiKey: apiKey, model },
    });
  },

  // --- Profiles ---
  async listProfiles(): Promise<Profile[]> {
    return request<Profile[]>("/api/profiles");
  },

  async createProfile(payload: ProfileCreatePayload): Promise<Profile> {
    return request<Profile>("/api/profiles", {
      method: "POST",
      body: payload,
    });
  },

  async uploadProfilePdf(
    asset: DocumentUploadAsset,
    profileName?: string
  ): Promise<Profile> {
    const formData = await buildResumeFormData(asset, profileName);
    return request<Profile>("/api/profiles/upload-pdf", {
      method: "POST",
      body: formData,
      isFormData: true,
    });
  },

  async parseProfilePreview(
    asset: DocumentUploadAsset,
    profileName?: string,
    overrides?: { geminiKey?: string; model?: string }
  ): Promise<ProfilePreviewResponse> {
    const formData = await buildResumeFormData(asset, profileName);
    return request<ProfilePreviewResponse>("/api/profiles/parse-preview", {
      method: "POST",
      body: formData,
      isFormData: true,
      overrides,
    });
  },

  async updateProfile(profileId: string, payload: ProfileUpdatePayload): Promise<Profile> {
    return request<Profile>(`/api/profiles/${encodeURIComponent(profileId)}`, {
      method: "PUT",
      body: payload,
    });
  },

  async activateProfile(profileId: string): Promise<Profile> {
    return request<Profile>(`/api/profiles/${encodeURIComponent(profileId)}/activate`, {
      method: "POST",
    });
  },

  async deleteProfile(profileId: string): Promise<{ deleted?: boolean; status?: string }> {
    return request<{ deleted?: boolean; status?: string }>(
      `/api/profiles/${encodeURIComponent(profileId)}`,
      { method: "DELETE" }
    );
  },

  // --- JobSpy Hunt ---
  async getPlatforms(): Promise<PlatformsResponse> {
    return request<PlatformsResponse>("/api/hunt/platforms");
  },

  async startHunt(
    payload: HuntStartPayload
  ): Promise<{ run_id: string; status: string }> {
    return request<{ run_id: string; status: string }>("/api/hunt/start", {
      method: "POST",
      body: payload,
    });
  },

  async getHuntRun(runId: string): Promise<HuntRunResponse> {
    return request<HuntRunResponse>(`/api/hunt/runs/${encodeURIComponent(runId)}`);
  },

  /**
   * Streams live hunt progress using SSE when ReadableStream is available (Web),
   * and seamlessly falls back to interval polling on React Native / Hermes.
   */
  subscribeHuntRun(
    runId: string,
    callbacks: {
      onProgress: (run: Partial<SearchRun>) => void;
      onComplete: (data: HuntRunResponse) => void;
      onError: (err: Error) => void;
    }
  ): () => void {
    let cancelled = false;
    const controller = new AbortController();
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const pollOnce = async () => {
      if (cancelled) return;
      try {
        const data = await apiClient.getHuntRun(runId);
        if (cancelled) return;
        callbacks.onProgress(data.run);
        if (data.run.status === "completed") {
          callbacks.onComplete(data);
          return;
        }
        if (data.run.status === "failed") {
          callbacks.onError(new Error(data.run.status_detail || "Hunt run failed"));
          return;
        }
        pollTimer = setTimeout(pollOnce, 1200);
      } catch (err) {
        if (!cancelled) {
          callbacks.onError(err instanceof Error ? err : new Error("Failed to poll hunt run"));
        }
      }
    };

    const startStream = async () => {
      // On Web with ReadableStream support, connect to SSE stream directly with auth headers
      if (Platform.OS === "web") {
        try {
          const headers = await buildAuthHeaders(undefined, false);
          const streamUrl = `${API_BASE_URL}/api/hunt/runs/${encodeURIComponent(runId)}/stream`;
          const response = await fetch(streamUrl, {
            headers,
            signal: controller.signal,
          });
          if (response.ok && response.body && typeof response.body.getReader === "function") {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            const processFrame = async (frame: string): Promise<boolean> => {
              const dataLines = frame
                .split(/\r?\n/)
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trimStart());
              if (dataLines.length === 0) return false;
              const jsonStr = dataLines.join("\n").trim();
              if (!jsonStr) return false;

              try {
                const event = JSON.parse(jsonStr) as Partial<SearchRun>;
                callbacks.onProgress(event);
                if (event.status === "completed") {
                  const finalData = await apiClient.getHuntRun(runId);
                  if (!cancelled) callbacks.onComplete(finalData);
                  return true;
                }
                if (event.status === "failed") {
                  if (!cancelled) {
                    callbacks.onError(new Error(event.status_detail || "Hunt run failed"));
                  }
                  return true;
                }
              } catch {
                // Ignore heartbeat or malformed SSE frame
              }
              return false;
            };

            while (!cancelled) {
              const { value, done } = await reader.read();
              if (done) {
                buffer += decoder.decode();
                break;
              }
              buffer += decoder.decode(value, { stream: true });
              // Hold a lone trailing \r so split \r\n across chunk boundaries stays intact
              const trailingCr = buffer.endsWith("\r");
              const processable = (trailingCr ? buffer.slice(0, -1) : buffer).replace(
                /\r\n/g,
                "\n"
              );
              const chunks = processable.split("\n\n");
              buffer = (chunks.pop() || "") + (trailingCr ? "\r" : "");

              for (const chunk of chunks) {
                if (await processFrame(chunk)) return;
              }
            }

            // Flush any trailing buffered SSE frame after stream ends
            const remaining = buffer.replace(/\r\n/g, "\n").trim();
            if (!cancelled && remaining) {
              for (const chunk of remaining.split("\n\n")) {
                if (await processFrame(chunk)) return;
              }
            }
          }
        } catch {
          if (cancelled) return;
          // Fall back to polling if SSE disconnects or isn't supported
        }
      }

      if (!cancelled) {
        await pollOnce();
      }
    };

    void startStream();

    return () => {
      cancelled = true;
      controller.abort();
      if (pollTimer) clearTimeout(pollTimer);
    };
  },

  async getJobDetail(jobId: string): Promise<RankedJob> {
    return request<RankedJob>(`/api/hunt/jobs/${encodeURIComponent(jobId)}`);
  },

  async tailorJob(
    jobId: string,
    payload: { tone?: string; custom_capabilities?: string; model?: string } = {},
    options?: { signal?: AbortSignal }
  ): Promise<TailoredOutput> {
    return request<TailoredOutput>(
      `/api/hunt/jobs/${encodeURIComponent(jobId)}/tailor`,
      {
        method: "POST",
        body: payload,
        signal: options?.signal,
      }
    );
  },

  // --- Instant Tailor Studio ---
  async extractJD(rawText: string, model?: string): Promise<ExtractJDResponse> {
    return request<ExtractJDResponse>("/api/studio/extract-jd", {
      method: "POST",
      body: {
        raw_text: rawText,
        ...(model ? { model } : {}),
      },
    });
  },

  async tailorStudio(
    payload: StudioTailorPayload,
    options?: { signal?: AbortSignal }
  ): Promise<TailoredOutput> {
    return request<TailoredOutput>("/api/studio/tailor", {
      method: "POST",
      body: payload,
      signal: options?.signal,
    });
  },

  // --- Saved Outputs & Revision Studio ---
  async listOutputs(): Promise<TailoredOutputSummary[]> {
    return request<TailoredOutputSummary[]>("/api/outputs");
  },

  async getOutputDetail(outputId: string): Promise<TailoredOutput> {
    return request<TailoredOutput>(`/api/outputs/${encodeURIComponent(outputId)}`);
  },

  async deleteOutput(outputId: string): Promise<{ deleted?: boolean; id?: string }> {
    return request<{ deleted?: boolean; id?: string }>(
      `/api/outputs/${encodeURIComponent(outputId)}`,
      { method: "DELETE" }
    );
  },

  async reviseOutput(
    outputId: string,
    payload: { doc_type: "cv" | "cover_letter"; instruction: string; model?: string }
  ): Promise<{ output: TailoredOutput; explanation: string }> {
    const res = await request<ReviseOutputResponse>(
      `/api/outputs/${encodeURIComponent(outputId)}/revise`,
      {
        method: "POST",
        body: payload,
      }
    );
    const output = res.output ? res.output : (res as TailoredOutput);
    const explanation =
      res.explanation ||
      output.chat_history?.[output.chat_history.length - 1]?.content ||
      "Document updated successfully.";
    return { output, explanation };
  },

  getOutputPdfUrl(outputId: string, docType: "cv" | "cover_letter"): string {
    return `${API_BASE_URL}/api/outputs/${encodeURIComponent(outputId)}/pdf/${docType}`;
  },

  // --- Telemetry ---
  async getTokenTelemetry(): Promise<TokenTelemetry> {
    return request<TokenTelemetry>("/api/telemetry/tokens");
  },
};

