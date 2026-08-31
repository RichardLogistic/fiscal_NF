export type CarmakRuntimeEnv = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  QIVE_BASE_URL?: string;
  QIVE_API_ID?: string;
  QIVE_API_KEY?: string;
  QIVE_USE_API_GATEWAY?: string;
  QIVE_LEGACY_API_TOKEN?: string;
  OPENAI_API_KEY?: string;
};

export function getRuntimeEnv(): CarmakRuntimeEnv {
  return (
    globalThis as typeof globalThis & {
      __CARMAK_RUNTIME_ENV__?: CarmakRuntimeEnv;
    }
  ).__CARMAK_RUNTIME_ENV__ ?? {};
}
