import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import QRCode from "qrcode";
import { DEMO_QR } from "./helpers";

/*
 * Video finto per la fotocamera di Chromium (--use-file-for-fake-video-capture): un MJPEG
 * (sequenza di JPEG) che mostra il QR della carta demo, come un telefono inquadrato dalla webcam.
 */
export const FAKE_VIDEO = "e2e-logs/qr-demo.mjpeg";

export default async function globalSetup() {
  mkdirSync("e2e-logs", { recursive: true });
  const qr = await QRCode.toDataURL(DEMO_QR, { margin: 4, width: 360 });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  await page.setContent(
    `<body style="margin:0;background:#888;display:flex;align-items:center;justify-content:center;height:480px"><img src="${qr}" width="360" height="360"/></body>`,
  );
  const frame = await page.screenshot({ type: "jpeg", quality: 90 });
  await browser.close();
  writeFileSync(FAKE_VIDEO, Buffer.concat(Array.from({ length: 30 }, () => frame)));
}
