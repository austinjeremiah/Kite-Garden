const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AttractorGuard", function () {
  let attractorGuard;
  let owner, user1, backend;
  let agentDID;

  beforeEach(async function () {
    [owner, user1, backend] = await ethers.getSigners();
    
    const AttractorGuard = await ethers.getContractFactory("AttractorGuard");
    attractorGuard = await AttractorGuard.deploy();
    await attractorGuard.waitForDeployment();
    
    // Create a sample agent DID
    agentDID = ethers.encodeBytes32String("test-agent-v1");
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await attractorGuard.owner()).to.equal(owner.address);
    });

    it("Should authorize owner as backend by default", async function () {
      expect(await attractorGuard.authorizedBackends(owner.address)).to.be.true;
    });
  });

  describe("Agent Registration", function () {
    it("Should register a new agent", async function () {
      const spendingLimit = ethers.parseEther("10");
      const thresholdMultiplier = 200; // 2.0σ

      await expect(
        attractorGuard.connect(user1).registerAgent(agentDID, spendingLimit, thresholdMultiplier)
      ).to.emit(attractorGuard, "AgentRegistered")
        .withArgs(agentDID, user1.address, spendingLimit, await ethers.provider.getBlock('latest').then(b => b.timestamp));

      const agent = await attractorGuard.getAgent(agentDID);
      expect(agent.owner).to.equal(user1.address);
      expect(agent.spendingLimit).to.equal(spendingLimit);
      expect(agent.isActive).to.be.true;
      expect(agent.isRevoked).to.be.false;
    });

    it("Should reject duplicate agent registration", async function () {
      const spendingLimit = ethers.parseEther("10");
      const thresholdMultiplier = 200;

      await attractorGuard.connect(user1).registerAgent(agentDID, spendingLimit, thresholdMultiplier);

      await expect(
        attractorGuard.connect(user1).registerAgent(agentDID, spendingLimit, thresholdMultiplier)
      ).to.be.revertedWith("Agent already registered");
    });

    it("Should reject zero spending limit", async function () {
      await expect(
        attractorGuard.connect(user1).registerAgent(agentDID, 0, 200)
      ).to.be.revertedWith("Spending limit must be > 0");
    });

    it("Should reject invalid threshold multiplier", async function () {
      const spendingLimit = ethers.parseEther("10");
      
      await expect(
        attractorGuard.connect(user1).registerAgent(agentDID, spendingLimit, 50)
      ).to.be.revertedWith("Threshold must be between 1.0 and 5.0");

      await expect(
        attractorGuard.connect(user1).registerAgent(agentDID, spendingLimit, 600)
      ).to.be.revertedWith("Threshold must be between 1.0 and 5.0");
    });
  });

  describe("Gate Decisions", function () {
    beforeEach(async function () {
      const spendingLimit = ethers.parseEther("10");
      await attractorGuard.connect(user1).registerAgent(agentDID, spendingLimit, 200);
      await attractorGuard.setBackendAuthorization(backend.address, true);
    });

    it("Should log a session key issuance", async function () {
      const metricValue = ethers.parseEther("2.5");
      const baselineValue = ethers.parseEther("2.3");
      const amount = ethers.parseEther("1");
      const sessionKey = ethers.Wallet.createRandom().address;

      await expect(
        attractorGuard.connect(backend).logDecision(
          agentDID,
          true,
          metricValue,
          baselineValue,
          amount,
          sessionKey
        )
      ).to.emit(attractorGuard, "SessionKeyIssued");

      const agent = await attractorGuard.getAgent(agentDID);
      expect(agent.transactionCount).to.equal(1);
    });

    it("Should log a session key denial", async function () {
      const metricValue = ethers.parseEther("5.8");
      const baselineValue = ethers.parseEther("2.3");
      const amount = ethers.parseEther("1");

      await expect(
        attractorGuard.connect(backend).logDecision(
          agentDID,
          false,
          metricValue,
          baselineValue,
          amount,
          ethers.ZeroAddress
        )
      ).to.emit(attractorGuard, "SessionKeyDenied");
    });

    it("Should reject decision from unauthorized backend", async function () {
      await expect(
        attractorGuard.connect(user1).logDecision(
          agentDID,
          true,
          ethers.parseEther("2.5"),
          ethers.parseEther("2.3"),
          ethers.parseEther("1"),
          ethers.Wallet.createRandom().address
        )
      ).to.be.revertedWith("Only authorized backend can call");
    });
  });

  describe("Agent Revocation", function () {
    beforeEach(async function () {
      const spendingLimit = ethers.parseEther("10");
      await attractorGuard.connect(user1).registerAgent(agentDID, spendingLimit, 200);
    });

    it("Should allow owner to revoke agent", async function () {
      await expect(
        attractorGuard.connect(user1).revokeAgent(agentDID)
      ).to.emit(attractorGuard, "AgentRevoked");

      const agent = await attractorGuard.getAgent(agentDID);
      expect(agent.isRevoked).to.be.true;
      expect(agent.isActive).to.be.false;
    });

    it("Should reject revocation from non-owner", async function () {
      await expect(
        attractorGuard.connect(backend).revokeAgent(agentDID)
      ).to.be.revertedWith("Only agent owner can revoke");
    });
  });

  describe("Authorization Management", function () {
    it("Should allow owner to authorize backend", async function () {
      await expect(
        attractorGuard.setBackendAuthorization(backend.address, true)
      ).to.emit(attractorGuard, "BackendAuthorized")
        .withArgs(backend.address, true, await ethers.provider.getBlock('latest').then(b => b.timestamp));

      expect(await attractorGuard.authorizedBackends(backend.address)).to.be.true;
    });

    it("Should allow owner to deauthorize backend", async function () {
      await attractorGuard.setBackendAuthorization(backend.address, true);
      await attractorGuard.setBackendAuthorization(backend.address, false);

      expect(await attractorGuard.authorizedBackends(backend.address)).to.be.false;
    });

    it("Should reject authorization from non-owner", async function () {
      await expect(
        attractorGuard.connect(user1).setBackendAuthorization(backend.address, true)
      ).to.be.revertedWith("Only owner can call");
    });
  });
});

describe("AgentPaymentSimulator", function () {
  let simulator;
  let owner, user1;
  let agentDID;

  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();
    
    const Simulator = await ethers.getContractFactory("AgentPaymentSimulator");
    simulator = await Simulator.deploy();
    await simulator.waitForDeployment();
    
    agentDID = ethers.encodeBytes32String("test-agent-v1");
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await simulator.owner()).to.equal(owner.address);
    });

    it("Should enable demo mode by default", async function () {
      expect(await simulator.demoMode()).to.be.true;
    });
  });

  describe("Payment Simulation", function () {
    it("Should simulate a single payment", async function () {
      const amount = ethers.parseEther("1");
      const recipient = ethers.Wallet.createRandom().address;

      await expect(
        simulator.simulatePayment(agentDID, amount, recipient, 0) // PaymentType.NORMAL
      ).to.emit(simulator, "PaymentExecuted")
        .withArgs(agentDID, 0, amount, recipient, 0, await ethers.provider.getBlock('latest').then(b => b.timestamp));

      expect(await simulator.totalPayments()).to.equal(1);
    });

    it("Should simulate normal payments", async function () {
      const count = 10;
      const baseAmount = ethers.parseEther("1");
      const variance = 1500; // 15%

      await expect(
        simulator.simulateNormal(agentDID, count, baseAmount, variance)
      ).to.emit(simulator, "SeedingCompleted");

      expect(await simulator.getPaymentCount(agentDID)).to.equal(count);
    });

    it("Should simulate attack pattern", async function () {
      await expect(
        simulator.simulateAttack(agentDID)
      ).to.emit(simulator, "AttackInjected");

      const paymentCount = await simulator.getPaymentCount(agentDID);
      expect(paymentCount).to.equal(15); // Attack burst size
    });

    it("Should seed transaction history", async function () {
      const count = 300;

      await expect(
        simulator.seedHistory(agentDID, count)
      ).to.emit(simulator, "SeedingCompleted");

      expect(await simulator.getPaymentCount(agentDID)).to.equal(count);
    });
  });

  describe("Demo Mode", function () {
    it("Should allow owner to toggle demo mode", async function () {
      await expect(
        simulator.setDemoMode(false)
      ).to.emit(simulator, "DemoModeToggled")
        .withArgs(false, await ethers.provider.getBlock('latest').then(b => b.timestamp));

      expect(await simulator.demoMode()).to.be.false;
    });

    it("Should block attack simulation when demo mode is off", async function () {
      await simulator.setDemoMode(false);

      await expect(
        simulator.simulateAttack(agentDID)
      ).to.be.revertedWith("Demo mode is not enabled");
    });
  });
});
