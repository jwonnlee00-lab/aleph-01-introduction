declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    PASSKEY_OWNER_EMAIL?: string;
    BUCKET?: R2Bucket;
  }
}
