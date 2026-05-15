/** Coerce Mongoose / lean() binary fields into a Node Buffer. */
export function bufferFromMongo(value: unknown): Buffer | null {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (
    typeof value === "object" &&
    "_bsontype" in value &&
    (value as { _bsontype: string })._bsontype === "Binary"
  ) {
    const bin = value as { buffer?: Uint8Array | ArrayBuffer };
    if (bin.buffer) return Buffer.from(bin.buffer);
  }
  if (
    typeof value === "object" &&
    "type" in value &&
    (value as { type: string }).type === "Buffer" &&
    Array.isArray((value as { data: number[] }).data)
  ) {
    return Buffer.from((value as { data: number[] }).data);
  }
  try {
    return Buffer.from(value as ArrayBuffer);
  } catch {
    return null;
  }
}
