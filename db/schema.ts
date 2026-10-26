import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const passkeys = sqliteTable("passkeys", {
  credentialId: text("credential_id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull(),
  transports: text("transports").notNull(),
  deviceType: text("device_type").notNull(),
  backedUp: integer("backed_up").notNull(),
  storageLocation: text("storage_location").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const registrationAttempts = sqliteTable("passkey_registration_attempts", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  browserHash: text("browser_hash").notNull(),
  challenge: text("challenge").notNull(),
  optionsJson: text("options_json").notNull(),
  name: text("name").notNull(),
  storageLocation: text("storage_location").notNull(),
  state: text("state").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  requestJson: text("request_json"),
  credentialId: text("credential_id"),
  failureCode: text("failure_code"),
});

// Operator-assisted linking; the reference is not a login or enrollment token.
export const ownerIdentityChecks = sqliteTable("owner_identity_checks", {
  code: text("code").primaryKey(),
  subjectId: text("subject_id").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
