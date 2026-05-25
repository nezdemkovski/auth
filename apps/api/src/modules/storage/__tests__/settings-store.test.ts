import { describe, expect, test } from "bun:test";

import { storageEndpointHostIsPrivate } from "../settings-store";

describe("storage settings", () => {
  test("identifies private storage endpoint hosts", () => {
    expect(storageEndpointHostIsPrivate("localhost")).toBe(true);
    expect(storageEndpointHostIsPrivate("127.0.0.1")).toBe(true);
    expect(storageEndpointHostIsPrivate("10.0.0.10")).toBe(true);
    expect(storageEndpointHostIsPrivate("172.16.0.10")).toBe(true);
    expect(storageEndpointHostIsPrivate("192.168.1.10")).toBe(true);
    expect(storageEndpointHostIsPrivate("169.254.169.254")).toBe(true);
    expect(storageEndpointHostIsPrivate("metadata.google.internal")).toBe(true);
    expect(storageEndpointHostIsPrivate("s3.example.com")).toBe(false);
  });
});
