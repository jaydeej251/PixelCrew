import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { previewSecurityHeaders } from "../src/lib/preview-security";

let appServer: Server;
let previewServer: Server;
let appOrigin: string;
let previewOrigin: string;
let secretRequests = 0;
let previewCookie = "";

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return (server.address() as AddressInfo).port;
}

test.beforeAll(async () => {
  appServer = createServer((req, res) => {
    if (req.url === "/secret") {
      secretRequests += 1;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ secret: "must-not-be-readable" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<!doctype html>
      <div id="parent-marker">unchanged</div>
      <script>
        window.addEventListener("message", (event) => {
          window.previewResult = event.data;
        });
      </script>
      <iframe
        src="${previewOrigin}/"
        sandbox="allow-scripts allow-forms"
      ></iframe>`);
  });
  const appPort = await listen(appServer);
  appOrigin = `http://127.0.0.1:${appPort}`;

  previewServer = createServer((req, res) => {
    previewCookie = req.headers.cookie ?? "";
    const baseUrl = `${previewOrigin}/assets/signed-token/`;
    res.writeHead(200, previewSecurityHeaders("text/html; charset=utf-8", baseUrl, appOrigin));
    res.end(`<!doctype html><body><script>
      let parentReadable = false;
      let storageReadable = false;
      try {
        parent.document.querySelector("#parent-marker").textContent = "changed";
        parentReadable = true;
      } catch {}
      try {
        localStorage.setItem("preview-escape", "true");
        storageReadable = true;
      } catch {}
      fetch(${JSON.stringify(`${appOrigin}/secret`)}, { credentials: "include" }).catch(() => {});
      const form = document.createElement("form");
      form.method = "POST";
      form.action = ${JSON.stringify(`${appOrigin}/secret`)};
      document.body.appendChild(form);
      parent.postMessage({ parentReadable, storageReadable }, "*");
      setTimeout(() => form.submit(), 25);
    </script></body>`);
  });
  const previewPort = await listen(previewServer);
  previewOrigin = `http://localhost:${previewPort}`;
});

test.afterAll(async () => {
  await Promise.all([
    new Promise<void>((resolve) => appServer.close(() => resolve())),
    new Promise<void>((resolve) => previewServer.close(() => resolve())),
  ]);
});

test("generated preview cannot reach app credentials, APIs, storage, or parent DOM", async ({
  browser,
}) => {
  secretRequests = 0;
  previewCookie = "";
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: "pc_session",
      value: "sensitive-session",
      url: appOrigin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();
  await page.goto(appOrigin);
  await page.waitForFunction(() => Boolean((window as Window & { previewResult?: unknown }).previewResult));

  const result = await page.evaluate(
    () =>
      (
        window as unknown as {
          previewResult: { parentReadable: boolean; storageReadable: boolean };
        }
      ).previewResult,
  );
  await page.waitForTimeout(250);

  expect(result).toEqual({ parentReadable: false, storageReadable: false });
  await expect(page.locator("#parent-marker")).toHaveText("unchanged");
  expect(previewCookie).not.toContain("pc_session");
  expect(secretRequests).toBe(0);
  await context.close();
});
