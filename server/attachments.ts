import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { attachmentSchema, type Attachment } from "../shared/contracts";

export class Attachments {
  constructor(private readonly root: string) {}
  async upload(input: {
    fileName: string;
    base64: string;
  }): Promise<Attachment> {
    if (
      /[\\/]/.test(input.fileName) ||
      Array.from(input.fileName).some((c) => c.charCodeAt(0) < 32)
    )
      throw new Error("文件名不能包含目录或控制字符");
    const bytes = Buffer.from(input.base64, "base64");
    if (
      bytes.toString("base64") !== input.base64 ||
      !bytes.length ||
      bytes.length > 512 * 1024
    )
      throw new Error("附件必须在 512 KB 以内");
    const ext = input.fileName.split(".").pop()?.toLowerCase();
    const images: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
    };
    const mimeType =
      images[ext ?? ""] ?? (ext === "md" ? "text/markdown" : "text/plain");
    if (images[ext ?? ""]) {
      const valid =
        ext === "png"
          ? bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : ext === "jpg" || ext === "jpeg"
            ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : ext === "gif"
              ? /^GIF8[79]a/.test(bytes.toString("ascii", 0, 6))
              : bytes.toString("ascii", 0, 4) === "RIFF" &&
                bytes.toString("ascii", 8, 12) === "WEBP";
      if (!valid) throw new Error("图片内容与扩展名不符");
    } else {
      if (
        !["txt", "md", "json", "csv", "log", "yaml", "yml"].includes(ext ?? "")
      )
        throw new Error("支持文本、Markdown 和 PNG/JPEG/WebP/GIF 图片");
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (bytes.includes(0)) throw new Error("文本附件不能包含二进制内容");
    }
    const id = createHash("sha256")
      .update(input.fileName)
      .update("\0")
      .update(bytes)
      .digest("hex");
    const meta = attachmentSchema.parse({
      id,
      fileName: input.fileName,
      mimeType,
      size: bytes.length,
    });
    await mkdir(this.root, { recursive: true });
    await writeFile(join(this.root, `${id}.data`), bytes, { mode: 0o600 });
    await writeFile(join(this.root, `${id}.json`), JSON.stringify(meta), {
      mode: 0o600,
    });
    return meta;
  }
  async read(id: string) {
    attachmentSchema.shape.id.parse(id);
    const meta = attachmentSchema.parse(
      JSON.parse(await readFile(join(this.root, `${id}.json`), "utf8")),
    );
    return { meta, bytes: await readFile(join(this.root, `${id}.data`)) };
  }
  async validate(items: Attachment[]) {
    for (const item of items) {
      const { meta } = await this.read(item.id);
      if (JSON.stringify(meta) !== JSON.stringify(attachmentSchema.parse(item)))
        throw new Error("附件信息不匹配，请重新添加");
    }
  }
}
