import {
  convertAudioSourceToMp3Buffer,
  verifyConvertibleAudioSource,
} from "@/lib/media-conversion";
import { getConvertibleAudioProvider } from "@/lib/media-audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const sourceUrl = requestUrl.searchParams.get("source")?.trim() ?? "";
  const provider = getConvertibleAudioProvider(sourceUrl);

  if (!provider || !sourceUrl) {
    return Response.json(
      {
        error:
          "Нужна корректная ссылка на VK Видео или Rutube для конвертации в mp3.",
      },
      { status: 400 },
    );
  }

  try {
    const resolvedSource = await verifyConvertibleAudioSource(sourceUrl);
    const audioBuffer = await convertAudioSourceToMp3Buffer(resolvedSource);

    return new Response(new Uint8Array(audioBuffer), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="${provider}-audio.mp3"`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Не удалось открыть источник для конвертации.";

    return Response.json({ error: message }, { status: 502 });
  }
}
