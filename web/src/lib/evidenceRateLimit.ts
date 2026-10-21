import "server-only";

import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export async function reserveEvidenceUpload(
  seller: string,
  nonce: string
): Promise<void> {
  const normalizedSeller = seller.toLowerCase();

  const result = await redis.eval(
    `
    local nonceKey = KEYS[1]
    local sellerKey = KEYS[2]
    local globalKey = KEYS[3]

    local nonceTtl = tonumber(ARGV[1])
    local windowTtl = tonumber(ARGV[2])
    local sellerLimit = tonumber(ARGV[3])
    local globalLimit = tonumber(ARGV[4])

    if redis.call("EXISTS", nonceKey) == 1 then
      return 1
    end

    local sellerCount = tonumber(redis.call("GET", sellerKey) or "0")
    local globalCount = tonumber(redis.call("GET", globalKey) or "0")

    if sellerCount >= sellerLimit then
      return 2
    end

    if globalCount >= globalLimit then
      return 3
    end

    redis.call("SET", nonceKey, "used", "EX", nonceTtl)

    redis.call("INCR", sellerKey)
    if sellerCount == 0 then
      redis.call("EXPIRE", sellerKey, windowTtl)
    end

    redis.call("INCR", globalKey)
    if globalCount == 0 then
      redis.call("EXPIRE", globalKey, windowTtl)
    end

    return 0
    `,
    [
      `mezo:evidence:nonce:${normalizedSeller}:${nonce}`,
      `mezo:evidence:seller:${normalizedSeller}`,
      "mezo:evidence:global",
    ],
    [600, 86400, 5, 50]
  );

  const code = Number(result);

  if (code === 1) {
    throw new Error("Authorization already used");
  }

  if (code === 2) {
    throw new Error("Seller upload limit reached (5 per 24h)");
  }

  if (code === 3) {
    throw new Error("Daily upload capacity reached");
  }

  if (code !== 0) {
    throw new Error("Upload authorization unavailable");
  }
}
