// 照片小圖：每張封面另存一張長邊 480 的小圖，檔名是原檔名換成 _s.jpg
// App 的地圖、卡片用小圖（約 40 KB），店家頁才用原圖；小圖還沒做好時 App 會自己改拿原圖
import { decode, Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

export const BUCKET = "food-photos";
export const YEAR = "31536000";
// 只處理這個 bucket 裡「使用者 id/隨機 id.副檔名」的照片
export const PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/;
export const thumbPath = (path: string) => path.replace(/\.[a-z]+$/, "_s.jpg");

// deno-lint-ignore no-explicit-any
type Storage = { storage: any };

export async function makeThumb(sb: Storage, path: string, bytes?: Uint8Array) {
  if (!PATH_RE.test(path)) throw new Error("不是美食收藏的照片路徑");
  if (!bytes) {
    const { data, error } = await sb.storage.from(BUCKET).download(path);
    if (error) throw error;
    bytes = new Uint8Array(await data.arrayBuffer());
  }
  const img = await decode(bytes);
  if (!(img instanceof Image)) throw new Error("看不懂這張圖");
  const k = Math.min(1, 480 / Math.max(img.width, img.height));
  if (k < 1) img.resize(Math.round(img.width * k), Math.round(img.height * k));
  const out = await img.encodeJPEG(75);
  const { error } = await sb.storage.from(BUCKET).upload(thumbPath(path), out, { contentType: "image/jpeg", cacheControl: YEAR, upsert: true });
  if (error) throw error;
  return sb.storage.from(BUCKET).getPublicUrl(thumbPath(path)).data.publicUrl as string;
}

// 舊照片上傳時沒設快取（cache-control: no-cache），用同樣的內容重新上傳一次，改成快取一年
export async function fixCache(sb: Storage, path: string) {
  if (!PATH_RE.test(path)) throw new Error("不是美食收藏的照片路徑");
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error) throw error;
  const bytes = new Uint8Array(await data.arrayBuffer());
  const type = data.type || "image/jpeg";
  const up = await sb.storage.from(BUCKET).update(path, bytes, { contentType: type, cacheControl: YEAR, upsert: true });
  if (up.error) throw up.error;
  return bytes;
}
