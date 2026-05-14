/**
 * Kite Passport CLI wrapper
 * 
 * Executes kpass CLI commands to interact with official Kite Passport system.
 * Handles agent registration, verification, and metadata retrieval.
 * 
 * Prerequisites:
 * - kpass CLI installed globally or in PATH
 * - User authenticated via `kpass login` (credentials stored in .kite-passport/)
 * - KITE_PASSPORT_DIR environment variable set (default: .kite-passport)
 */

import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class PassportCLI {
  constructor(config = {}) {
    this.passportDir = config.passportDir || process.env.KITE_PASSPORT_DIR || ".kite-passport";
    this.enabled = config.enabled !== false;
    this.verbose = config.verbose || false;
    this.baseDir = config.baseDir || path.resolve(__dirname, "../../");
  }

  /**
   * Check if kpass CLI is available and Passport is authenticated
   */
  async verifyStatus() {
    if (!this.enabled) {
      return { status: "disabled", authenticated: false };
    }

    try {
      const output = this._execKpass(["status", "--output", "json"]);
      const result = JSON.parse(output);
      this._log("Passport status check passed", result);
      return { status: "ready", authenticated: true, ...result };
    } catch (error) {
      this._log("Passport status check failed", error.message);
      return { status: "error", authenticated: false, error: error.message };
    }
  }

  /**
   * Register an agent with Kite Passport
   * @param {string} agentType - Agent type/label (e.g., "expense-tracker", "coding-assistant")
   * @returns {object} Registered agent metadata
   */
  async registerAgent(agentType) {
    if (!this.enabled) {
      this._log("Passport registration disabled (KITE_PASSPORT_ENABLED=false)");
      return { skipped: true };
    }

    try {
      this._log(`Registering agent with type: ${agentType}`);
      const output = this._execKpass(["agent:register", "--type", String(agentType), "--output", "json"]);
      const result = JSON.parse(output);

      // Check if agent was already registered (API returns success but with hint)
      const alreadyRegistered = result.hint && result.hint.toLowerCase().includes("already registered");
      
      this._log("Agent registration response", { 
        hint: result.hint, 
        agentId: result.agent_id,
        alreadyRegistered 
      });

      return {
        success: true,
        passportAgentId: result.agent_id || result.id,
        agentType: result.agent_type || agentType,
        ownerId: result.owner_id,
        createdAt: result.created_at || new Date().toISOString(),
        alreadyRegistered: !!alreadyRegistered,
        hint: result.hint,
        ...result,
      };
    } catch (error) {
      this._log("Agent registration failed", error.message);
      throw new Error(`Kite Passport agent registration failed: ${error.message}`);
    }
  }

  /**
   * List all agents owned by authenticated user
   * @returns {array} Array of agent objects
   */
  async listAgents() {
    if (!this.enabled) {
      this._log("Passport list disabled (KITE_PASSPORT_ENABLED=false)");
      return [];
    }

    try {
      this._log("Listing user agents from Kite Passport");
      const output = this._execKpass(["user", "agents", "--output", "json"]);
      const result = JSON.parse(output);

      // Handle both array and object responses
      const agents = Array.isArray(result) ? result : result.agents || [];
      this._log(`Found ${agents.length} agents in Kite Passport`, agents);
      return agents;
    } catch (error) {
      this._log("Failed to list agents", error.message);
      return [];
    }
  }

  /**
   * Get specific agent details
   * @param {string} agentId - Agent ID from Kite Passport
   * @returns {object} Agent details
   */
  async getAgent(agentId) {
    if (!this.enabled) {
      this._log("Passport getAgent disabled (KITE_PASSPORT_ENABLED=false)");
      return null;
    }

    try {
      // Try to find agent in user's agents list
      const agents = await this.listAgents();
      const agent = agents.find((a) => a.agent_id === agentId || a.id === agentId);

      if (!agent) {
        throw new Error(`Agent ${agentId} not found in user's Passport agents`);
      }

      this._log(`Retrieved agent ${agentId}`, agent);
      return agent;
    } catch (error) {
      this._log(`Failed to get agent ${agentId}`, error.message);
      return null;
    }
  }

  /**
   * Verify agent exists in Kite Passport after registration
   * Retry with exponential backoff since Passport may have eventual consistency
   * @param {string} agentType - Agent type registered
   * @param {number} maxRetries - Maximum retry attempts
   */
  async verifyAgentRegistered(agentType, maxRetries = 5) {
    if (!this.enabled) {
      return { verified: false, skipped: true };
    }

    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const agents = await this.listAgents();
        const registered = agents.find(
          (a) => (a.agent_type || a.type)?.toLowerCase() === String(agentType).toLowerCase()
        );

        if (registered) {
          this._log(`Agent verification successful on attempt ${attempt + 1}`, registered);
          return { verified: true, agent: registered, attempt };
        }

        this._log(`Agent not found yet (attempt ${attempt + 1}/${maxRetries}), retrying...`);
        // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt + 1) * 100));
      } catch (error) {
        lastError = error;
        this._log(`Verification attempt ${attempt + 1} failed`, error.message);
      }
    }

    const error = lastError || new Error("Agent verification failed after maximum retries");
    this._log("Agent verification failed", error.message);
    return { verified: false, error: error.message, attempts: maxRetries };
  }

  /**
   * Check if authentication credentials exist
   */
  credentialsExist() {
    try {
      const configPath = path.join(this.baseDir, this.passportDir, "config.json");
      return fs.existsSync(configPath) && fs.statSync(configPath).size > 0;
    } catch {
      return false;
    }
  }

  /**
   * Read stored Passport credentials (for validation only)
   */
  getStoredCredentials() {
    try {
      const configPath = path.join(this.baseDir, this.passportDir, "config.json");
      if (!fs.existsSync(configPath)) return null;

      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      return {
        userId: config.user_id,
        email: config.email,
        hasJwt: !!config.jwt,
      };
    } catch (error) {
      this._log("Failed to read stored credentials", error.message);
      return null;
    }
  }

  /**
   * Execute kpass CLI command
   * @private
   */
  _execKpass(args) {
    try {
      const cmd = `kpass ${args.join(" ")}`;
      this._log(`Executing: ${cmd}`);
      const output = execSync(cmd, {
        encoding: "utf8",
        cwd: this.baseDir,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return output.trim();
    } catch (error) {
      const stderr = error.stderr?.toString() || error.message || String(error);
      const stdout = error.stdout?.toString() || "";
      this._log("kpass command failed", { stderr, stdout });

      // Check for common errors
      if (stderr.includes("not found") || stderr.includes("ENOENT")) {
        throw new Error(
          "kpass CLI not found. Install with: npm install -g @kite/passport-cli or use your package manager"
        );
      }
      if (stderr.includes("not authenticated") || stderr.includes("token expired")) {
        throw new Error("Kite Passport not authenticated. Run: kpass login");
      }

      throw new Error(stderr || stdout || error.message);
    }
  }

  /**
   * Log messages for debugging
   * @private
   */
  _log(message, data) {
    if (this.verbose || process.env.PASSPORT_DEBUG) {
      console.log(`[PassportCLI] ${message}`, data ? JSON.stringify(data) : "");
    }
  }
}

export default PassportCLI;
