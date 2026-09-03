import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const DEVELOPMENT_KEY = "dev-only-key-do-not-use-in-production!!";
const INSECURE_KEYS = new Set([DEVELOPMENT_KEY, "change-me-to-a-64-char-hex-string"]);

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY?.trim() || DEVELOPMENT_KEY;
  if (process.env.NODE_ENV === "production" && (key.length < 32 || INSECURE_KEYS.has(key))) {
    throw new Error("ENCRYPTION_KEY must be a unique secret of at least 32 characters in production");
  }
  return crypto.createHash("sha256").update(key).digest();
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Invalid encrypted payload");
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}
