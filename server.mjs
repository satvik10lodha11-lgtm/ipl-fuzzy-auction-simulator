import { createServer } from "node:http";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const dataDir = resolve(root, "data");
const storePath = resolve(dataDir, "store.json");
const port = 4173;
const sessions = new Map();
const loginAttempts = new Map();
let store;
let writeQueue = Promise.resolve();
const auctionData = JSON.parse(await readFile(resolve(root, "auction-data.json"), "utf8"));
const auctionBenchmarks = auctionData.benchmarks;
const auctionSummary = auctionData.summary;

const demoPassword = "IPL2026!";
const demoSalt = randomBytes(16).toString("hex");
const demoUser = {
  id: "demo-analyst",
  email: "analyst@ipl.demo",
  name: "Auction Analyst",
  role: "analyst",
  salt: demoSalt,
  passwordHash: scryptSync(demoPassword, demoSalt, 64).toString("hex")
};

async function initializeStore() {
  await mkdir(dataDir, { recursive: true });
  try {
    store = JSON.parse(await readFile(storePath, "utf8"));
    if (!Array.isArray(store.users) || !Array.isArray(store.evaluations)) throw new Error("Invalid data store");
    if (!store.users.some((user) => user.email === demoUser.email)) store.users.push(demoUser);
    if (!Array.isArray(store.auctionBenchmarks)) store.auctionBenchmarks = auctionBenchmarks;
    if (!store.auctionSummary) store.auctionSummary = auctionSummary;
  } catch (error) {
    if (error.code !== "ENOENT" && error.message !== "Invalid data store") throw error;
    store = { users: [demoUser], evaluations: [], auctionBenchmarks: auctionBenchmarks, auctionSummary: auctionSummary };
  }
  await persistStore();
}

function persistStore() {
  writeQueue = writeQueue.then(async () => {
    const temporaryPath = storePath + ".tmp";
    await writeFile(temporaryPath, JSON.stringify(store, null, 2), "utf8");
    await rename(temporaryPath, storePath);
  });
  return writeQueue;
}

function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

function setSessionCookie(request, response, token, maxAge) {
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const secure = forwardedProto === "https" ? "; Secure" : "";
  response.setHeader("Set-Cookie", "ipl_session=" + token + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=" + maxAge + secure);
}

function currentUser(request) {
  const cookie = String(request.headers.cookie || "");
  const token = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("ipl_session="))?.slice("ipl_session=".length);
  const session = token && sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return store.users.find((user) => user.id === session.userId) || null;
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

async function readJson(request, maxBytes = 128 * 1024) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > maxBytes) throw new Error("Request body is too large");
  }
  return JSON.parse(body || "{}");
}

function validScore(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

async function handleApi(request, response, url) {
  const route = url.pathname;

  if (route === "/api/health" && request.method === "GET") {
    return sendJson(response, 200, { ok: true });
  }

  if (route === "/api/login" && request.method === "POST") {
    let input;
    try {
      input = await readJson(request, 8 * 1024);
    } catch {
      return sendJson(response, 400, { error: "Invalid login request." });
    }
    const email = String(input.email || "").trim().toLowerCase();
    const password = String(input.password || "");
    const address = String(request.headers["cf-connecting-ip"] || request.socket.remoteAddress || "unknown");
    const now = Date.now();
    const attempts = (loginAttempts.get(address) || []).filter((time) => now - time < 10 * 60 * 1000);
    if (attempts.length >= 10) return sendJson(response, 429, { error: "Too many login attempts. Try again in a few minutes." });
    const user = store.users.find((candidate) => candidate.email === email);
    let valid = false;
    if (user && password.length <= 200) {
      const received = scryptSync(password, user.salt, 64);
      const expected = Buffer.from(user.passwordHash, "hex");
      valid = expected.length === received.length && timingSafeEqual(expected, received);
    }
    if (!valid) {
      attempts.push(now);
      loginAttempts.set(address, attempts);
      return sendJson(response, 401, { error: "Email or password is incorrect." });
    }
    loginAttempts.delete(address);
    const token = randomBytes(32).toString("hex");
    sessions.set(token, { userId: user.id, expiresAt: now + 8 * 60 * 60 * 1000 });
    setSessionCookie(request, response, token, 8 * 60 * 60);
    return sendJson(response, 200, { user: publicUser(user) });
  }

  if (route === "/api/logout" && request.method === "POST") {
    const cookie = String(request.headers.cookie || "");
    const token = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("ipl_session="))?.slice("ipl_session=".length);
    if (token) sessions.delete(token);
    setSessionCookie(request, response, "", 0);
    return sendJson(response, 200, { ok: true });
  }

  const user = currentUser(request);
  if (!user) return sendJson(response, 401, { error: "Please sign in to continue." });

  if (route === "/api/me" && request.method === "GET") {
    return sendJson(response, 200, { user: publicUser(user) });
  }

  if (route === "/api/evaluations" && request.method === "GET") {
    const evaluations = store.evaluations
      .filter((item) => item.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return sendJson(response, 200, { evaluations });
  }

  if (route === "/api/benchmarks" && request.method === "GET") {
    return sendJson(response, 200, {
      summary:store.auctionSummary,
      benchmarks:store.auctionBenchmarks
    });
  }

  if (route === "/api/evaluations" && request.method === "POST") {
    let input;
    try {
      input = await readJson(request);
    } catch {
      return sendJson(response, 400, { error: "Invalid valuation data." });
    }
    const roles = new Set(["batter", "bowler", "allrounder", "keeper"]);
    const categories = new Set(["Low", "Fair", "High", "Premium"]);
    const metrics = ["performance", "demand", "consistency"];
    if (!roles.has(input.role) || !categories.has(input.category) ||
        !metrics.every((key) => validScore(Number(input[key]))) ||
        !Number.isFinite(Number(input.estimatedPrice)) || Number(input.estimatedPrice) < 0.2 || Number(input.estimatedPrice) > 30 ||
        !Number.isFinite(Number(input.basePrice)) || Number(input.basePrice) < 0.2 || Number(input.basePrice) > 2) {
      return sendJson(response, 400, { error: "Valuation values are outside the allowed range." });
    }
    const evaluation = {
      id: randomUUID(),
      userId: user.id,
      playerName: String(input.playerName || "Unnamed player").trim().slice(0, 48) || "Unnamed player",
      role: input.role,
      stats: input.stats && typeof input.stats === "object" ? input.stats : {},
      performance: Number(input.performance),
      demand: Number(input.demand),
      consistency: Number(input.consistency),
      basePrice: Number(input.basePrice),
      centroid: Number(input.centroid),
      estimatedPrice: Number(input.estimatedPrice),
      category: input.category,
      createdAt: new Date().toISOString()
    };
    store.evaluations.push(evaluation);
    await persistStore();
    return sendJson(response, 201, { evaluation });
  }

  const deleteMatch = route.match(/^\/api\/evaluations\/([0-9a-f-]+)$/i);
  if (deleteMatch && request.method === "DELETE") {
    const before = store.evaluations.length;
    store.evaluations = store.evaluations.filter((item) => !(item.id === deleteMatch[1] && item.userId === user.id));
    if (store.evaluations.length === before) return sendJson(response, 404, { error: "Valuation not found." });
    await persistStore();
    return sendJson(response, 200, { ok: true });
  }

  return sendJson(response, 404, { error: "API route not found." });
}

const staticFiles = new Map([
  ["/", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/index.html", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/auction-data.json", { file: "auction-data.json", type: "application/json; charset=utf-8" }],
  ["/PROJECT_GUIDE.md", { file: "PROJECT_GUIDE.md", type: "text/markdown; charset=utf-8" }]
]);

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname.startsWith("/api/")) {
    try {
      return await handleApi(request, response, url);
    } catch (error) {
      console.error("API request failed:", error.message);
      return sendJson(response, 500, { error: "The request could not be completed." });
    }
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    return response.end("Method not allowed");
  }
  const asset = staticFiles.get(url.pathname);
  if (!asset) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return response.end("Not found");
  }
  try {
    const content = await readFile(resolve(root, asset.file));
    response.writeHead(200, {
      "Content-Type": asset.type,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    });
    response.end(content);
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Unable to read project file");
  }
});

await initializeStore();
server.listen(port, "127.0.0.1", () => {
  console.log("IPL Fuzzy Auction Simulator is serving at http://127.0.0.1:" + port);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
