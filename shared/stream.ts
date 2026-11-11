// SSE frames can span network chunks, including inside a UTF-8 character.
export async function* responseText(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    completed = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (!data || data === "[DONE]") continue;
        const event = JSON.parse(data);
        if (event.type === "response.completed") completed = true;
        if (event.type === "response.output_text.delta")
          yield String(event.delta || "");
        if (
          ["error", "response.failed", "response.incomplete"].includes(
            event.type,
          )
        )
          throw new Error("Assistant response interrupted");
      }
      if (done) break;
    }
    if (!completed) throw new Error("Assistant response interrupted");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
