import "dotenv/config";
import cors from "cors";
import express from "express";
import { z } from "zod";
import {
  cleanverseConfigured,
  launchAtoken,
  queryApass,
} from "./cleanverse.js";

const app = express();
app.use(cors({ origin: ["http://localhost:5173"] }));
app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    cleanverseConfigured: cleanverseConfigured(),
    writesEnabled: process.env.CLEANVERSE_WRITE_ENABLED === "true",
  });
});

app.post("/api/compliance/cvi", async (request, response) => {
  const parsed = z
    .object({
      chain: z.literal("monad"),
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    })
    .safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "A valid Monad wallet is required." });
    return;
  }

  if (!cleanverseConfigured()) {
    response.json({
      mode: "demo",
      status: 1,
      tier: "2",
      expirationTime: 1818451200,
      group: "IN",
      message: "Illustrative CVI result — connect the sandbox to verify live.",
    });
    return;
  }

  try {
    response.json({ mode: "live", ...(await queryApass("monad", parsed.data.address) as object) });
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "CVI lookup failed",
    });
  }
});

app.post("/api/compliance/cva/launch", async (request, response) => {
  const parsed = z
    .object({
      chain: z.literal("monad"),
      token_name: z.string().min(2).max(64),
      token_symbol: z.string().min(2).max(12),
      decimals: z.number().int().min(0).max(18),
      admin_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      icon: z.string().url(),
      rule: z.object({
        allowed_group: z.string().max(2),
        allowed_sub_group: z.string(),
        min_tier: z.number().int().min(0),
        min_sub_tier: z.number().int().min(0),
        is_black_list: z.boolean(),
        countries: z.array(z.string().length(2)),
      }),
    })
    .safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid CVA issuance request." });
    return;
  }
  try {
    response.json(await launchAtoken(parsed.data));
  } catch (error) {
    response.status(403).json({
      error: error instanceof Error ? error.message : "CVA launch failed",
    });
  }
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`Coven API listening on ${port}`));

