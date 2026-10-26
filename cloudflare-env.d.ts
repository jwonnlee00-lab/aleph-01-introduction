declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    PASSKEY_OWNER_EMAIL?: string;
    PASSKEY_OWNER_ID?: string;
    PASSKEY_OWNER_LINKED_IDS?: string;
    BUCKET?: R2Bucket;
  }
}
