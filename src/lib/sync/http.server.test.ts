import { describe, expect, it } from "vitest";
import { readTextCapped, ResponseTooLargeError } from "./http.server";

function streamedResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream);
}

describe("readTextCapped", () => {
  it("returns the full body when under the cap", async () => {
    const response = streamedResponse(["hello ", "world"]);
    expect(await readTextCapped(response, 1024)).toBe("hello world");
  });

  it("throws ResponseTooLargeError instead of buffering a body over the cap", async () => {
    const response = streamedResponse(["a".repeat(50), "b".repeat(50)]);
    await expect(readTextCapped(response, 60)).rejects.toThrow(ResponseTooLargeError);
  });

  it("decodes a plain string-body Response the same way response.text() would", async () => {
    const response = new Response("plain body");
    expect(await readTextCapped(response, 1024)).toBe("plain body");
  });
});
