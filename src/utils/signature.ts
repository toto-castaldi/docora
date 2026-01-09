import { createHmac } from "crypto";

export interface SignedHeaders {
  "X-Docora-App-Id": string;
  "X-Docora-Signature": string;
  "X-Docora-Timestamp": string;
}

/**
 * Generate HMAC-signed headers for webhook authentication.
 *
 * The signature is computed as:
 *   payload = timestamp + "." + JSON.stringify(body)
 *   signature = HMAC-SHA256(payload, secret)
 *
 * @param appId - The app identifier to include in headers
 * @param body - The request body object to sign
 * @param secret - The shared secret (client_auth_key)
 * @param timestamp - Optional timestamp (defaults to current time)
 * @returns Headers object with X-Docora-App-Id, X-Docora-Signature, X-Docora-Timestamp
 */
export function generateSignedHeaders(
  appId: string,
  body: object,
  secret: string,
  timestamp?: number
): SignedHeaders {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const payload = ts + "." + JSON.stringify(body);

  const signature = createHmac("sha256", secret).update(payload).digest("hex");

  return {
    "X-Docora-App-Id": appId,
    "X-Docora-Signature": "sha256=" + signature,
    "X-Docora-Timestamp": String(ts),
  };
}
