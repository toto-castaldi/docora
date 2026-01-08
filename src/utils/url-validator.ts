const PRIVATE_IP_PATTERNS = [
  /^10\./, // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
  /^192\.168\./, // 192.168.0.0/16
  /^127\./, // 127.0.0.0/8
  /^0\./, // 0.0.0.0/8
  /^169\.254\./, // Link-local
];

const BLOCKED_HOSTNAMES = ["localhost", "::1", "0.0.0.0"];

function isDev(): boolean {
  return process.env.NODE_ENV === "dev";
}

export function isUrlSafe(urlString: string): {
  safe: boolean;
  reason?: string;
} {
  const url = new URL(urlString);

  // Must be HTTPS (in production only)
  if (!isDev() && url.protocol !== "https:") {
    return { safe: false, reason: "URL must use HTTPS" };
  }

  // In dev, allow http:// and https://
  if (isDev() && url.protocol !== "http:" && url.protocol !== "https:") {
    return { safe: false, reason: "URL must use HTTP or HTTPS" };
  }

  // Check blocked hostnames (skip in dev mode)
  if (!isDev() && BLOCKED_HOSTNAMES.includes(url.hostname.toLowerCase())) {
    return { safe: false, reason: "Localhost URLs are not allowed" };
  }

  // Check private IP patterns (skip in dev mode)
  if (!isDev()) {
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(url.hostname)) {
        return { safe: false, reason: "Private IP addresses are not allowed" };
      }
    }
  }

  return { safe: true };
}
