import { storeUploadedMediaFile } from "@/lib/stored-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size <= 0) {
      return Response.json(
        { error: "Нужно передать файл для загрузки." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storeUploadedMediaFile({
      buffer,
      contentType: file.type,
      fileName: file.name || "media.bin",
    });

    return Response.json({
      asset: stored.asset,
      fileName: file.name,
      url: stored.url,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось загрузить файл.",
      },
      { status: 500 },
    );
  }
}
