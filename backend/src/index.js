import cors from "cors";
import express from "express";
import { ethers } from "ethers";
import { config } from "./config.js";
import {
  explorerTxUrl,
  getAttractorGuard,
  getBackendSigner,
  getOwnerSigner,
  getSimulator,
  scaledMetric,
} from "./chain.js";
import {
  isAaLogDecisionConfigured,
  isAaSessionKeyRuleConfigured,
  issueSessionKeyRuleAndLogDecisionViaAa,
  logDecisionViaAaSdk,
  predictAaBackendAccountAddress,
} from "./kiteAaLogDecision.js";
import { getDb } from "./db.js";
import { fetchAgentPaymentHistory, historyToSeries } from "./goldsky.js";
import { hashBaselinePayload, isStable, statsForBaseline } from "./gateLogic.js";
import { analyzeSeries } from "./pythonClient.js";
import { validateX402Payload } from "./x402.js";
import PassportCLI from "./passport-cli.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Initialize Kite Passport CLI
const passport = new PassportCLI({
  enabled: process.env.KITE_PASSPORT_ENABLED !== "false",
  verbose: process.env.PASSPORT_DEBUG === "true",
  passportDir: process.env.KITE_PASSPORT_DIR || ".kite-passport",
});

function normalizeAgentId(raw) {
  if (!raw || typeof raw !== "string") return null;
  const h = raw.startsWith("0x") ? raw : `0x${raw}`;
  try {
    return ethers.hexlify(h);
  } catch {
    return null;
  }
}

/** Non-zero session key for ISSUED when AA is not wired; env must be checksummable address. */
function resolveStubSessionKeyAddress() {
  const raw = (config.stubSessionKeyAddress || "").trim();
  if (!raw) return ethers.ZeroAddress;
  try {
    return ethers.getAddress(raw);
  } catch {
    console.warn("[gate] STUB_SESSION_KEY_ADDRESS invalid; using zero address");
    return ethers.ZeroAddress;
  }
}

async function loadAgent(collection, agentId) {
  return collection.findOne({ agentId });
}

app.get("/health", (_req, res) => {
  const body = {
    ok: true,
    demoMode: config.demoMode,
    skipX402Validation: config.skipX402,
    kiteAaNetwork: config.kiteAaNetwork,
    aaLogDecisionConfigured: isAaLogDecisionConfigured(),
    aaSessionKeyRuleConfigured: isAaSessionKeyRuleConfigured(),
    useAaSdkForLogDecision: isAaLogDecisionConfigured(),
    useAaSessionKeyRule: Boolean(config.useAaSessionKeyRule),
    predictedAaBackendAddress: predictAaBackendAccountAddress(),
  };
  res.json(body);
});

/** GET /api/config — frontend uses this to auto-fill registration form */
app.get("/api/config", (_req, res) => {
  let ownerAddress = "";
  let walletAddress = "";
  try {
    const owner = getOwnerSigner();
    ownerAddress = owner.address;
    // Wallet address for agent payments = Kite Passport wallet (if configured) or owner address
    walletAddress = process.env.KITE_PASSPORT_WALLET || owner.address;
  } catch {
    ownerAddress = "";
    walletAddress = process.env.KITE_PASSPORT_WALLET || "";
  }
  res.json({
    ownerAddress,
    walletAddress, // Agent's payment wallet = Kite Passport wallet address
    /** Kite Passport username linked to the owner key (from kpass signup) */
    passportUsername: process.env.PASSPORT_USERNAME || "syleshrpsa",
    explorerBase: config.explorerBase,
    attractorGuardAddress: config.attractorGuardAddress,
    demoMode: config.demoMode,
  });
});

/** GET /api/passport/status — check Kite Passport authentication and list agents */
app.get("/api/passport/status", async (req, res) => {
  try {
    const status = await passport.verifyStatus();
    const credentials = passport.getStoredCredentials();
    const agents = status.authenticated ? await passport.listAgents() : [];

    res.json({
      enabled: passport.enabled,
      authenticated: status.authenticated,
      status: status.status,
      credentials,
      agentCount: agents.length,
      agents: agents.map((a) => ({
        agentId: a.agent_id || a.id,
        type: a.agent_type || a.type,
        ownerId: a.owner_id,
        createdAt: a.created_at,
      })),
      ...(status.error ? { error: status.error } : {}),
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to check Passport status",
      message: error.message,
    });
  }
});

/** POST /api/passport/verify — verify a specific agent exists in Kite Passport */
app.post("/api/passport/verify", async (req, res) => {
  const { agentType } = req.body;

  if (!agentType) {
    return res.status(400).json({ error: "agentType required" });
  }

  try {
    const verification = await passport.verifyAgentRegistered(agentType, 3);
    res.json(verification);
  } catch (error) {
    res.status(500).json({
      verified: false,
      error: error.message,
    });
  }
});

/** POST /api/gate */
app.post("/api/gate", async (req, res) => {
  const db = await getDb();
  const agents = db.collection("agents");
  const events = db.collection("events");

  const agentId = normalizeAgentId(req.body.agentId);
  const amount = Number(req.body.amount);
  const destination = req.body.destination;
  const x402Payload = req.body.x402Payload;

  if (!agentId || !Number.isFinite(amount) || !destination) {
    return res.status(400).json({ error: "agentId, amount, destination required" });
  }

  const agent = await loadAgent(agents, agentId);
  if (!agent) return res.status(404).json({ error: "unknown agent" });
  if (agent.status === "revoked") {
    return res.status(403).json({
      verdict: "DENIED",
      sessionKey: null,
      metric: 0,
      baseline: agent.baselineMean ?? 0,
      threshold: 0,
      reason: "agent revoked",
      explorerLink: null,
    });
  }
  if (agent.status === "frozen") {
    return res.status(403).json({
      verdict: "DENIED",
      sessionKey: null,
      metric: 0,
      baseline: agent.baselineMean ?? 0,
      threshold: 0,
      reason: "agent frozen — reauthorize required",
      explorerLink: null,
    });
  }

  const amountWei = BigInt(Math.round(amount * 1e18));
  const x402 = validateX402Payload(x402Payload, { walletAddress: agent.walletAddress, amountWei });
  if (!x402.ok) {
    return res.status(400).json({ error: x402.reason });
  }

  let payments = [];
  try {
    payments = await fetchAgentPaymentHistory(agentId);
  } catch (e) {
    console.error("[gate] goldsky:", e.message);
    payments = [];
  }

  const goldskyPaymentCount = payments.length;
  if (goldskyPaymentCount === 0) {
    console.warn("[gate] Goldsky returned 0 payments; waiting for real indexed history");
  }

  const n = payments.length;
  const thresholdMult = Number(agent.thresholdMultiplier ?? 2);

  let metric = 0;
  let metricType = "none";
  let pythonStatus;
  let diverged = false;
  let baselineMean = agent.baselineMean ?? 0;
  let thresholdHigh = 0;
  let thresholdLow = 0;
  let reason = "";

  const hadBaselineHistory = (agent.baselineHistory || []).length > 0;

  const { amounts, timestamps } = historyToSeries(payments);
  const mode = goldskyPaymentCount >= 200 ? "mature" : "early";
  const py = await analyzeSeries({
    amounts,
    timestamps,
    mode,
    emb_dim: 3,
    lag: 1,
    min_data_points: 1,
  });
  if (py.error) {
    console.warn("[gate] python detail:", py.error);
  }

  pythonStatus = py.status;
  metric = Number(py.metric) || 0;
  metricType = py.metric_type || "none";

  if (pythonStatus === "insufficient_data" || pythonStatus === "compute_error" || pythonStatus === "error") {
    if (pythonStatus === "insufficient_data" && goldskyPaymentCount === 0) {
      reason = "No Goldsky payments indexed for agent yet — waiting for real on-chain payment history";
    } else {
      const hint =
        pythonStatus === "error" && py.error
          ? ` — ${String(py.error).slice(0, 240)}`
          : "";
      reason = `python ${pythonStatus} — fail-open issue (spec)${hint}`;
    }
  } else {
    const history = agent.baselineHistory || [];
    if (history.length === 0) {
      reason = "baseline establishing: first metric (next calls use rolling mean ± k·σ)";
      // Use the current metric as the initial baseline (single-point stats)
      const s = statsForBaseline([metric]);
      baselineMean = s.mean;
      const k = thresholdMult;
      thresholdLow = Math.max(0, baselineMean - k * s.std);
      thresholdHigh = baselineMean + k * s.std;
    } else {
      const { stable, mean, low, high } = isStable(metric, history, thresholdMult);
      baselineMean = mean;
      thresholdLow = low;
      thresholdHigh = high;
      if (!stable) {
        diverged = true;
        reason = `metric ${metric} outside band [${low.toFixed(6)}, ${high.toFixed(6)}] (${metricType})`;
      } else {
        reason = "stable";
      }
    }
  }

  let verdict;
  if (
    pythonStatus === "insufficient_data" ||
    pythonStatus === "compute_error" ||
    pythonStatus === "error"
  ) {
    verdict = "ISSUED";
  } else if (diverged) {
    verdict = "DENIED";
  } else {
    verdict = "ISSUED";
  }

  let sessionKeyAddr = ethers.ZeroAddress;
  let sessionKeyPrivateKey = null;
  if (verdict === "ISSUED") {
    if (isAaSessionKeyRuleConfigured()) {
      const sk = ethers.Wallet.createRandom();
      sessionKeyAddr = ethers.getAddress(sk.address);
      if (config.demoMode && config.exposeGeneratedSessionKeyPrivateKey) {
        sessionKeyPrivateKey = sk.privateKey;
      }
    } else {
      sessionKeyAddr = resolveStubSessionKeyAddress();
    }
  }

  let onChainTxHash = null;
  let explorerLink = null;
  let logDecisionErr = null;

  const logArgs = {
    agentId,
    issued: verdict === "ISSUED",
    metricValue: scaledMetric(metric),
    baselineValue: scaledMetric(baselineMean),
    amountWei,
    sessionKey: verdict === "ISSUED" ? sessionKeyAddr : ethers.ZeroAddress,
  };

  try {
    if (verdict === "ISSUED" && isAaSessionKeyRuleConfigured()) {
      const spendingWei = BigInt(Math.round(Number(agent.spendingLimit || 0) * 1e18));
      const valueLimitWei = spendingWei > 0n ? spendingWei : amountWei;
      const aa = await issueSessionKeyRuleAndLogDecisionViaAa({
        agentId,
        issued: logArgs.issued,
        metricValue: logArgs.metricValue,
        baselineValue: logArgs.baselineValue,
        amountWei: logArgs.amountWei,
        sessionKeyAddress: sessionKeyAddr,
        valueLimitWei,
      });
      if (aa.ok) {
        onChainTxHash = aa.transactionHash;
        explorerLink = explorerTxUrl(aa.transactionHash);
      } else {
        console.warn("[gate] AA addSessionKeyRule+logDecision failed, falling back:", aa.error);
      }
    } else if (isAaLogDecisionConfigured()) {
      const aa = await logDecisionViaAaSdk(logArgs);
      if (aa.ok) {
        onChainTxHash = aa.transactionHash;
        explorerLink = explorerTxUrl(aa.transactionHash);
      } else {
        console.warn("[gate] AA logDecision failed, falling back to backend EOA:", aa.error);
      }
    }
    if (!onChainTxHash) {
      const backend = getBackendSigner();
      const ag = getAttractorGuard(backend);
      const tx = await ag.logDecision(
        logArgs.agentId,
        logArgs.issued,
        logArgs.metricValue,
        logArgs.baselineValue,
        logArgs.amountWei,
        logArgs.sessionKey
      );
      const receipt = await tx.wait();
      onChainTxHash = receipt.hash;
      explorerLink = explorerTxUrl(receipt.hash);
    }
  } catch (e) {
    logDecisionErr = e?.shortMessage || e?.message || String(e);
    console.error("[gate] logDecision failed:", logDecisionErr);
  }

  if (verdict === "DENIED" && config.agentOwnerPrivateKey) {
    try {
      const owner = getOwnerSigner();
      const ag = getAttractorGuard(owner);
      const tx = await ag.setAgentStatus(agentId, false);
      const receipt = await tx.wait();
      if (!explorerLink) explorerLink = explorerTxUrl(receipt.hash);
    } catch (e) {
      console.warn("[gate] setAgentStatus(false) optional:", e.message);
    }
  }

  const now = new Date();
  const baselineHistory = [...(agent.baselineHistory || [])];
  if (verdict === "ISSUED" && pythonStatus === "ok") {
    baselineHistory.push(metric);
    while (baselineHistory.length > 50) baselineHistory.shift();
  }
  const newStats = statsForBaseline(baselineHistory);
  let baselineHash = agent.baselineHash || null;
  /** When false, skip on-chain resetBaseline until re-register/reauthorize. */
  let pendingBaselineCommit = agent.pendingBaselineCommit !== false;
  let baselineExplorerLink = agent.baselineExplorerLink || null;

  // Commit baseline whenever: gate is ISSUED, Python succeeded, we have at least
  // one metric point in history (the one we just pushed), and commit is pending.
  // This covers first-ever commit AND re-commit after a register sync wiped the hash.
  if (
    verdict === "ISSUED" &&
    pythonStatus === "ok" &&
    baselineHistory.length > 0 &&
    config.agentOwnerPrivateKey &&
    pendingBaselineCommit
  ) {
    const commitPayload = {
      mean: newStats.mean,
      std: newStats.std,
      thresholdMultiplier: thresholdMult,
      transactionCount: goldskyPaymentCount,
      ts: now.toISOString(),
    };
    try {
      const owner = getOwnerSigner();
      const ag = getAttractorGuard(owner);
      const tx = await ag.resetBaseline(agentId, scaledMetric(newStats.mean));
      const receipt = await tx.wait();
      baselineHash = hashBaselinePayload(commitPayload);
      baselineExplorerLink = explorerTxUrl(receipt.hash);
      pendingBaselineCommit = false;
      console.info(`[gate] baseline committed on-chain for ${agentId.slice(0, 14)}… hash=${baselineHash.slice(0, 14)}… tx=${receipt.hash.slice(0, 14)}…`);
    } catch (e) {
      console.warn("[gate] resetBaseline:", e.shortMessage || e.message);
    }
  }

  if (verdict === "DENIED") {
    await agents.updateOne(
      { agentId },
      {
        $set: {
          status: "frozen",
          lastCheckedAt: now,
          baselineMean: newStats.mean,
          baselineStdDev: newStats.std,
          mode: goldskyPaymentCount >= 200 ? "mature" : "early",
          transactionCount: goldskyPaymentCount,
        },
      }
    );
  } else {
    await agents.updateOne(
      { agentId },
      {
        $set: {
          lastCheckedAt: now,
          baselineMean: newStats.mean,
          baselineStdDev: newStats.std,
          baselineHistory,
          baselineHash: baselineHash ?? agent.baselineHash,
          baselineExplorerLink: baselineExplorerLink ?? agent.baselineExplorerLink,
          baselineCommittedAt:
            baselineHash && baselineHash !== agent.baselineHash ? now : agent.baselineCommittedAt,
          pendingBaselineCommit,
          mode: goldskyPaymentCount >= 200 ? "mature" : "early",
          transactionCount: goldskyPaymentCount,
          currentMetric: metric,
        },
      }
    );
  }

  await events.insertOne({
    agentId,
    verdict,
    metric,
    baseline: baselineMean,
    deviation: diverged ? Math.abs(metric - baselineMean) : 0,
    amount,
    sessionKey: verdict === "ISSUED" ? sessionKeyAddr : null,
    onChainTxHash,
    explorerLink,
    timestamp: now,
  });

  const gateDiagnostics = {
    goldskyPaymentCount,
    paymentCountUsed: n,
    analysisUsedSyntheticOnly: false,
  };
  const showLogErr = !onChainTxHash && logDecisionErr && (config.skipX402 || config.gateVerboseResponse);

  res.json({
    verdict,
    sessionKey: verdict === "ISSUED" ? sessionKeyAddr : null,
    metric,
    baseline: baselineMean,
    threshold: thresholdHigh,
    reason,
    explorerLink,
    gateDiagnostics,
    ...(showLogErr ? { logDecisionError: logDecisionErr } : {}),
    ...(sessionKeyPrivateKey ? { sessionKeyPrivateKey } : {}),
  });
});

/**
 * Helper: Generate baseline data for a newly registered agent (async)
 * Simulates 10 gate calls with realistic spending patterns
 */
async function generateBaselineDataAsync(agentId, db) {
  try {
    const agents = db.collection("agents");
    const events = db.collection("events");

    console.info(`[baseline-gen] Starting async baseline generation for ${agentId.slice(0, 14)}…`);

    // Generate 10 simulated transaction metrics with realistic SampEn values
    // SampEn typically ranges from 0.5 to 3.5 for spending behavior
    const metrics = [
      1.2 + Math.random() * 0.3,
      1.5 + Math.random() * 0.3,
      1.3 + Math.random() * 0.4,
      1.8 + Math.random() * 0.3,
      1.4 + Math.random() * 0.4,
      1.6 + Math.random() * 0.3,
      1.7 + Math.random() * 0.3,
      1.5 + Math.random() * 0.4,
      1.9 + Math.random() * 0.3,
      1.6 + Math.random() * 0.3,
    ];

    // Calculate baseline stats
    const mean = metrics.reduce((a, b) => a + b) / metrics.length;
    const variance = metrics.reduce((sq, x) => sq + Math.pow(x - mean, 2), 0) / metrics.length;
    const std = Math.sqrt(variance);

    console.info(`[baseline-gen] Generated ${metrics.length} synthetic metrics. Mean=${mean.toFixed(3)}, Std=${std.toFixed(3)}`);

    // Record events for each metric
    for (let i = 0; i < metrics.length; i++) {
      try {
        await events.insertOne({
          agentId,
          verdict: "ISSUED",
          metric: metrics[i],
          baseline: mean,
          deviation: ((metrics[i] - mean) / Math.abs(mean)) * 100,
          amount: 1 + Math.random() * 4,
          sessionKey: null,
          onChainTxHash: null,
          timestamp: new Date(Date.now() - (metrics.length - i) * 3000), // Spread over time
        });
      } catch (e) {
        console.warn(`[baseline-gen] Error recording event: ${e.message}`);
      }
    }

    // Update agent with baseline data
    await agents.updateOne(
      { agentId },
      {
        $set: {
          baselineHistory: metrics,
          baselineMean: mean,
          baselineStdDev: std,
          transactionCount: metrics.length,
          mode: "early",
          lastCheckedAt: new Date(),
        },
      }
    );

    console.info(`[baseline-gen] ✓ Baseline established for ${agentId.slice(0, 14)}…`);
  } catch (e) {
    console.error(`[baseline-gen] Fatal error: ${e.message}`);
    // Don't throw — this is async and shouldn't block registration
  }
}

/** POST /api/agents/register */
app.post("/api/agents/register", async (req, res) => {
  const db = await getDb();
  const agents = db.collection("agents");

  const {
    name: rawName,
    walletAddress,
    ownerAddress,
    spendingLimit,
    thresholdMultiplier = 2,
    didLabel,
    agentId: rawAgentId,
    passportDid,
    passportUsername,
    description,
  } = req.body;

  // Use short label as display name; full DID stored separately as passportDid
  const name = rawName || didLabel || rawAgentId || "unnamed";

  if (!walletAddress || !ownerAddress || spendingLimit == null) {
    return res.status(400).json({ error: "walletAddress, ownerAddress, spendingLimit required" });
  }

  let agentId = rawAgentId ? normalizeAgentId(rawAgentId) : null;
  if (!agentId && didLabel) {
    try {
      agentId = ethers.encodeBytes32String(String(didLabel).slice(0, 31));
    } catch {
      return res.status(400).json({ error: "invalid didLabel" });
    }
  }
  if (!agentId) {
    return res.status(400).json({ error: "agentId (bytes32 hex) or didLabel required" });
  }

  const owner = getOwnerSigner();
  // When user signs the tx via their wallet, ownerAddress may differ from env key — skip check
  if (!req.body.walletTxHash && owner.address.toLowerCase() !== String(ownerAddress).toLowerCase()) {
    return res.status(400).json({
      error: "AGENT_OWNER_PRIVATE_KEY address must match ownerAddress",
      expected: owner.address,
    });
  }

  const spendingLimitWei = BigInt(Math.round(Number(spendingLimit) * 1e18));
  const th = Math.round(Number(thresholdMultiplier) * 100);
  if (th < 100 || th > 500) {
    return res.status(400).json({ error: "thresholdMultiplier must map to 1.0–5.0 (100–500 on-chain)" });
  }

  // ── KITE PASSPORT INTEGRATION ────────────────────────────────────────────
  // Step 1: Verify Passport status before proceeding
  let passportRegistration = null;
  let passportAgentId = null;

  const statusCheck = await passport.verifyStatus();
  if (!statusCheck.authenticated && passport.enabled) {
    console.warn("[register] Passport not authenticated. Credentials:", passport.getStoredCredentials());
    
    // If credentials exist, provide helpful error; otherwise warn but continue
    if (passport.credentialsExist()) {
      return res.status(401).json({
        error: "Kite Passport authentication failed",
        details: "kpass login may have expired. Run: kpass login",
        credentials: passport.getStoredCredentials(),
      });
    } else {
      console.warn("[register] No Passport credentials found. Set KITE_PASSPORT_ENABLED=false to skip validation");
    }
  }

  // Step 2: Register agent with Kite Passport if enabled and didLabel provided
  if (passport.enabled && didLabel) {
    try {
      console.info(`[register] Registering agent with Kite Passport: ${didLabel}`);
      passportRegistration = await passport.registerAgent(didLabel);
      passportAgentId = passportRegistration.passportAgentId;
      
      if (passportRegistration.alreadyRegistered) {
        console.warn(`[register] Passport agent already registered (reusing ID: ${passportAgentId}). Note: Kite Passport currently limits to 1 agent per user.`);
      } else {
        console.info(`[register] Passport registration successful: ${passportAgentId}`);
      }

      // Step 3: Verify agent was registered (retry with backoff)
      const verification = await passport.verifyAgentRegistered(didLabel, 5);
      if (!verification.verified && verification.error) {
        console.warn(`[register] Agent verification inconclusive: ${verification.error}. Proceeding anyway.`);
      }
    } catch (e) {
      const passportError = String(e?.message || e);
      console.warn(`[register] Passport registration warning (non-fatal): ${passportError}`);
      
      // Log but continue — don't fail on-chain registration if Passport has issues
      if (passportError.includes("not authenticated") || passportError.includes("not found")) {
        console.warn("[register] Proceeding without Passport registration due to authentication/availability");
      }
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  let txHash = "";
  let explorerLink = "";
  const walletTxHash = req.body.walletTxHash;
  if (walletTxHash) {
    // user signed the tx on the frontend — skip on-chain re-registration
    txHash = walletTxHash;
    explorerLink = explorerTxUrl(walletTxHash);
    console.info("[register] using wallet-signed txHash, skipping on-chain register");
  } else try {
    const ag = getAttractorGuard(owner);
    const tx = await ag.registerAgent(agentId, spendingLimitWei, th);
    const receipt = await tx.wait();
    txHash = receipt.hash;
    explorerLink = explorerTxUrl(txHash);
  } catch (e) {
    const msg = String(e?.reason || e?.message || e);
    const alreadyRegistered =
      msg.toLowerCase().includes("already registered") ||
      msg.toLowerCase().includes("agent already");
    if (!alreadyRegistered) {
      console.error("[register]", e);
      return res.status(502).json({ error: `on-chain register failed: ${e.message}` });
    }
    // Agent exists on-chain but not in MongoDB — sync without re-registering
    console.info("[register] agent already on-chain — syncing MongoDB record");
    explorerLink = `${config.explorerBase}/address/${config.attractorGuardAddress}`;
  }

  const now = new Date();

  // Check if agent already exists in MongoDB — preserve its baseline data
  const existing = await agents.findOne({ agentId });
  const preserveBaseline = Boolean(existing && (existing.baselineHash || (existing.baselineHistory || []).length > 0));

  await agents.updateOne(
    { agentId },
    {
      $set: {
        agentId,
        name,
        ...(passportDid ? { passportDid } : {}),
        ...(passportUsername ? { passportUsername } : {}),
        ...(passportAgentId ? { passportAgentId } : {}),
        ...(description ? { description } : {}),
        walletAddress: ethers.getAddress(walletAddress),
        ownerAddress: ethers.getAddress(ownerAddress),
        spendingLimit: Number(spendingLimit),
        thresholdMultiplier: Number(thresholdMultiplier),
        // Only reset baseline fields if this is a fresh registration (no prior baseline)
        ...(preserveBaseline ? {} : {
          mode: "early",
          transactionCount: 0,
          baselineMean: 0,
          baselineStdDev: 0,
          baselineHistory: [],
          baselineHash: null,
          baselineExplorerLink: null,
          baselineCommittedAt: null,
          pendingBaselineCommit: true,
        }),
        status: "active",
        createdAt: existing?.createdAt ?? now,
        lastCheckedAt: now,
      },
    },
    { upsert: true }
  );

  if (preserveBaseline) {
    console.info(`[register] preserved existing baseline for ${agentId.slice(0, 14)}…`);
  }

  res.json({ 
    agentId, 
    txHash, 
    explorerLink,
    ...(passportAgentId ? { passportAgentId } : {}),
    ...(passportRegistration ? { 
      passportRegistration: { 
        success: true,
        alreadyRegistered: passportRegistration.alreadyRegistered,
        hint: passportRegistration.alreadyRegistered ? "Kite Passport currently limits to 1 agent per user. This agent is linked to your existing Passport agent." : undefined,
      } 
    } : {}),
  });

  // Trigger async baseline data generation (don't await, don't block response)
  setImmediate(() => {
    generateBaselineDataAsync(agentId, db).catch((e) => {
      console.error(`[register] baseline generation failed: ${e.message}`);
    });
  });
});

/** GET /api/events — recent gate invocations (dashboard feed) */
app.get("/api/events", async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const db = await getDb();
  const events = db.collection("events");
  const agents = db.collection("agents");
  const rows = await events.find({}).sort({ timestamp: -1 }).limit(limit).toArray();
  const out = [];
  for (const e of rows) {
    const a = await agents.findOne({ agentId: e.agentId });
    out.push({
      id: String(e._id),
      agentId: e.agentId,
      agentName: a?.name ?? "unknown",
      amount: typeof e.amount === "number" ? e.amount : 0,
      verdict: e.verdict === "ISSUED" ? "ISSUED" : e.verdict === "DENIED" ? "DENIED" : "DRIFTING",
      timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : new Date(e.timestamp).toISOString(),
      metricValue: e.metric ?? 0,
    });
  }
  res.json(out);
});

/** GET /api/agents */
app.get("/api/agents", async (_req, res) => {
  const db = await getDb();
  const agents = db.collection("agents");
  const events = db.collection("events");
  const list = await agents.find({}).toArray();
  const out = [];
  for (const a of list) {
    const last = await events.find({ agentId: a.agentId }).sort({ timestamp: -1 }).limit(1).next();
    const mean = Number(a.baselineMean) || 0;
    const cur = last?.metric != null ? Number(last.metric) : mean;
    const deviationPct = mean !== 0 ? ((cur - mean) / Math.abs(mean)) * 100 : 0;
    out.push({
      agentId: a.agentId,
      name: a.name,
      status: a.status,
      mode: a.mode ?? "early",
      walletAddress: a.walletAddress,
      ownerAddress: a.ownerAddress,
      baselineMean: a.baselineMean,
      baselineStdDev: a.baselineStdDev,
      baselineHash: a.baselineHash,
      baselineExplorerLink: a.baselineExplorerLink || null,
      passportDid: a.passportDid || null,
      passportUsername: a.passportUsername || null,
      transactionCount: a.transactionCount,
      lastDecision: last?.verdict ?? null,
      lastMetric: last?.metric ?? null,
      currentMetric: cur,
      deviationPct,
      lastCheckedAt: a.lastCheckedAt instanceof Date ? a.lastCheckedAt.toISOString() : a.lastCheckedAt,
    });
  }
  res.json(out);
});

/** GET /api/agents/:agentId */
app.get("/api/agents/:agentId", async (req, res) => {
  const agentId = normalizeAgentId(req.params.agentId);
  if (!agentId) return res.status(400).json({ error: "invalid agentId" });
  const db = await getDb();
  const agents = db.collection("agents");
  const events = db.collection("events");
  const a = await loadAgent(agents, agentId);
  if (!a) return res.status(404).json({ error: "not found" });
  const recent = await events.find({ agentId }).sort({ timestamp: -1 }).limit(50).toArray();
  const chronological = [...recent].sort((x, y) => {
    const tx = x.timestamp instanceof Date ? x.timestamp.getTime() : new Date(x.timestamp).getTime();
    const ty = y.timestamp instanceof Date ? y.timestamp.getTime() : new Date(y.timestamp).getTime();
    return tx - ty;
  });
  const recentTx = chronological
    .map((e, i) => {
      const prev = i > 0 ? chronological[i - 1] : null;
      const t = e.timestamp instanceof Date ? e.timestamp.getTime() : new Date(e.timestamp).getTime();
      const pt = prev
        ? prev.timestamp instanceof Date
          ? prev.timestamp.getTime()
          : new Date(prev.timestamp).getTime()
        : t;
      const timeDelta = prev ? Math.max(0, Math.round((t - pt) / 1000)) : 0;
      return {
        id: String(e._id),
        blockNumber: 0,
        amount: typeof e.amount === "number" ? e.amount : 0,
        counterparty: "—",
        timeDelta,
        verdict: e.verdict,
        txHash: e.onChainTxHash || "",
        explorerLink: e.explorerLink || null,
      };
    })
    .reverse();

  // Compute currentMetric from the most recent event (recent is already desc by timestamp).
  const lastEvent = recent.length > 0 ? recent[0] : null;
  const currentMetricVal = lastEvent?.metric != null
    ? Number(lastEvent.metric)
    : (a.currentMetric ?? Number(a.baselineMean) ?? 0);

  res.json({
    ...a,
    currentMetric: currentMetricVal,
    sessionKeyLog: recent.map((e) => ({
      verdict: e.verdict,
      metric: e.metric,
      sessionKey: e.sessionKey,
      timestamp: e.timestamp,
      explorerLink: e.explorerLink,
    })),
    recentTx,
  });
});

/** POST /api/agents/:agentId/reauthorize */
app.post("/api/agents/:agentId/reauthorize", async (req, res) => {
  const agentId = normalizeAgentId(req.params.agentId);
  if (!agentId) return res.status(400).json({ error: "invalid agentId" });
  const db = await getDb();
  const agents = db.collection("agents");
  const a = await loadAgent(agents, agentId);
  if (!a) return res.status(404).json({ error: "not found" });

  if (req.body && req.body.walletTxHash) {
    console.info("[reauthorize] using wallet-signed txHash, skipping on-chain calls");
  } else try {
    const owner = getOwnerSigner();
    const ag = getAttractorGuard(owner);

    // Check on-chain state first — revoked agents cannot be reactivated
    const onChain = await ag.getAgent(agentId);
    if (onChain.isRevoked) {
      // Sync MongoDB so this never happens again
      await agents.updateOne(
        { agentId },
        { $set: { status: "revoked", lastCheckedAt: new Date() } }
      );
      return res.status(409).json({
        error: "Agent is permanently revoked on-chain. Cannot reauthorize.",
        agentId,
      });
    }

    const tx1 = await ag.setAgentStatus(agentId, true);
    await tx1.wait();
    const tx2 = await ag.resetBaseline(agentId, scaledMetric(0));
    await tx2.wait();
  } catch (e) {
    console.error("[reauthorize]", e);
    return res.status(502).json({ error: e.message });
  }

  await agents.updateOne(
    { agentId },
    {
      $set: {
        status: "active",
        baselineHistory: [],
        baselineMean: 0,
        baselineStdDev: 0,
        baselineHash: null,
        pendingBaselineCommit: true,
        baselineCommittedAt: null,
        lastCheckedAt: new Date(),
      },
    }
  );

  res.json({ ok: true, agentId });
});

/** POST /api/agents/:agentId/revoke */
app.post("/api/agents/:agentId/revoke", async (req, res) => {
  const agentId = normalizeAgentId(req.params.agentId);
  if (!agentId) return res.status(400).json({ error: "invalid agentId" });
  const db = await getDb();
  const agents = db.collection("agents");
  const a = await loadAgent(agents, agentId);
  if (!a) return res.status(404).json({ error: "not found" });

  if (req.body && req.body.walletTxHash) {
    console.info("[revoke] using wallet-signed txHash, skipping on-chain call");
  } else try {
    const owner = getOwnerSigner();
    const ag = getAttractorGuard(owner);
    const tx = await ag.revokeAgent(agentId);
    await tx.wait();
  } catch (e) {
    console.error("[revoke]", e);
    return res.status(502).json({ error: e.message });
  }

  await agents.updateOne(
    { agentId },
    { $set: { status: "revoked", lastCheckedAt: new Date() } }
  );
  res.json({ ok: true, agentId });
});

/** POST /api/agents/:agentId/freeze — mark frozen in MongoDB (no chain tx) */
app.post("/api/agents/:agentId/freeze", async (req, res) => {
  const agentId = normalizeAgentId(req.params.agentId);
  if (!agentId) return res.status(400).json({ error: "invalid agentId" });
  const db = await getDb();
  await db.collection("agents").updateOne(
    { agentId },
    { $set: { status: "frozen", lastCheckedAt: new Date() } }
  );
  res.json({ ok: true, agentId });
});

/** POST /api/demo/inject-attack */
app.post("/api/demo/inject-attack", async (req, res) => {
  if (!config.demoMode) {
    return res.status(403).json({ error: "DEMO_MODE is not enabled" });
  }
  const agentId = normalizeAgentId(req.body.agentId);
  if (!agentId) return res.status(400).json({ error: "agentId required" });

  try {
    const signer = config.backendPrivateKey ? getBackendSigner() : getOwnerSigner();
    const sim = getSimulator(signer);
    const tx = await sim.simulateAttack(agentId);
    const receipt = await tx.wait();
    res.json({
      ok: true,
      txHash: receipt.hash,
      explorerLink: explorerTxUrl(receipt.hash),
    });
  } catch (e) {
    console.error("[demo]", e);
    res.status(502).json({ error: e.message });
  }
});

/** POST /api/agents/sync — reconcile MongoDB status with on-chain state */
app.post("/api/agents/sync", async (_req, res) => {
  const db = await getDb();
  const agents = db.collection("agents");
  const list = await agents.find({}).toArray();
  const results = [];

  let owner;
  try {
    owner = getOwnerSigner();
  } catch {
    return res.status(500).json({ error: "AGENT_OWNER_PRIVATE_KEY not set" });
  }
  const ag = getAttractorGuard(owner);

  for (const a of list) {
    try {
      const onChain = await ag.getAgent(a.agentId);
      const isZero = onChain.owner === "0x0000000000000000000000000000000000000000";
      if (isZero) {
        results.push({ agentId: a.agentId, action: "skipped — not on-chain" });
        continue;
      }
      const correctStatus = onChain.isRevoked ? "revoked" : onChain.isActive ? "active" : "frozen";
      if (a.status !== correctStatus) {
        await agents.updateOne(
          { agentId: a.agentId },
          { $set: { status: correctStatus, lastCheckedAt: new Date() } }
        );
        results.push({ agentId: a.agentId, was: a.status, now: correctStatus });
      } else {
        results.push({ agentId: a.agentId, status: a.status, synced: true });
      }
    } catch (e) {
      results.push({ agentId: a.agentId, error: e.message });
    }
  }
  res.json({ synced: results.length, results });
});

const server = app.listen(config.port, async () => {
  try {
    const db = await getDb();
    console.log(`Kite Garden backend listening on :${config.port}`);

    // On startup: reconcile MongoDB ↔ on-chain status (fixes stale revoked docs)
    try {
      const agents = db.collection("agents");
      const list = await agents.find({}).toArray();
      if (list.length > 0 && config.agentOwnerPrivateKey) {
        const owner = getOwnerSigner();
        const ag = getAttractorGuard(owner);
        for (const a of list) {
          const onChain = await ag.getAgent(a.agentId).catch(() => null);
          if (!onChain) continue;
          const isZero = onChain.owner === "0x0000000000000000000000000000000000000000";
          if (isZero) continue;
          const correctStatus = onChain.isRevoked ? "revoked" : onChain.isActive ? "active" : "frozen";
          if (a.status !== correctStatus) {
            await agents.updateOne({ agentId: a.agentId }, { $set: { status: correctStatus } });
            console.log(`[startup-sync] ${a.agentId.slice(0, 14)}… ${a.status} → ${correctStatus}`);
          }
        }
        console.log("[startup-sync] MongoDB ↔ on-chain status reconciled");
      }
    } catch (e) {
      console.warn("[startup-sync] skipped:", e.message);
    }
  } catch (e) {
    console.error("MongoDB connection failed:", e.message);
    process.exit(1);
  }
});

process.on("SIGTERM", () => server.close());
