// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AttractorGuard
 * @notice Behavioral session key revocation for autonomous AI agents on Kite AI
 * @dev Records gate decisions as on-chain events and stores agent registration data
 * 
 * Instead of blocking AI agents when they exceed a spending limit, AttractorGuard blocks them
 * when they stop behaving like themselves — by mapping every agent's real on-chain payment
 * history into phase space, computing its geometric complexity signature, and refusing to issue
 * the next Kite session key the moment that signature diverges from baseline.
 */
contract AttractorGuard {
    
    // ============ State Variables ============
    
    struct Agent {
        address owner;              // Human owner of the agent
        uint256 spendingLimit;      // Maximum spending limit per session key
        uint256 thresholdMultiplier;// Threshold sensitivity (σ multiplier, scaled by 100)
        uint256 transactionCount;   // Total transactions executed
        bool isActive;              // Is agent currently active
        bool isRevoked;             // Has agent been permanently revoked
        uint256 registeredAt;       // Registration timestamp
        uint256 lastActivityAt;     // Last transaction timestamp
    }
    
    struct GateDecision {
        bytes32 agentDID;
        bool issued;
        uint256 metricValue;        // Scaled by 1e18 for precision
        uint256 baselineValue;      // Scaled by 1e18 for precision
        uint256 amount;             // Transaction amount in wei
        address sessionKey;         // Session key issued (if issued)
        uint256 timestamp;
        uint256 blockNumber;
    }
    
    // Mapping from agent DID to Agent struct
    mapping(bytes32 => Agent) public agents;
    
    // Mapping from agent DID to array of gate decision indices
    mapping(bytes32 => uint256[]) public agentDecisions;
    
    // Array of all gate decisions (for querying)
    GateDecision[] public decisions;
    
    // Mapping to track authorized backend addresses
    mapping(address => bool) public authorizedBackends;
    
    // Contract owner
    address public owner;
    
    // Total agents registered
    uint256 public totalAgents;
    
    // Total decisions logged
    uint256 public totalDecisions;
    
    // ============ Events ============
    
    event AgentRegistered(
        bytes32 indexed agentDID,
        address indexed owner,
        uint256 spendingLimit,
        uint256 timestamp
    );
    
    event SessionKeyIssued(
        bytes32 indexed agentDID,
        address indexed sessionKey,
        uint256 amount,
        uint256 metricValue,
        uint256 baselineValue,
        uint256 timestamp
    );
    
    event SessionKeyDenied(
        bytes32 indexed agentDID,
        uint256 amount,
        uint256 metricValue,
        uint256 baselineValue,
        uint256 timestamp
    );
    
    event AgentRevoked(
        bytes32 indexed agentDID,
        address indexed owner,
        uint256 timestamp
    );
    
    event BaselineReset(
        bytes32 indexed agentDID,
        uint256 newBaseline,
        uint256 timestamp
    );
    
    event AgentStatusChanged(
        bytes32 indexed agentDID,
        bool isActive,
        uint256 timestamp
    );
    
    event BackendAuthorized(
        address indexed backend,
        bool authorized,
        uint256 timestamp
    );
    
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );
    
    // ============ Modifiers ============
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call");
        _;
    }
    
    modifier onlyAuthorizedBackend() {
        require(authorizedBackends[msg.sender], "Only authorized backend can call");
        _;
    }
    
    modifier agentExists(bytes32 agentDID) {
        require(agents[agentDID].owner != address(0), "Agent does not exist");
        _;
    }
    
    modifier agentNotRevoked(bytes32 agentDID) {
        require(!agents[agentDID].isRevoked, "Agent is revoked");
        _;
    }
    
    // ============ Constructor ============
    
    constructor() {
        owner = msg.sender;
        authorizedBackends[msg.sender] = true; // Owner is authorized by default
    }
    
    // ============ Agent Management Functions ============
    
    /**
     * @notice Register a new agent with AttractorGuard
     * @param agentDID The unique DID of the agent (format: did:kite:username.eth/agenttype/name-v1)
     * @param spendingLimit Maximum spending limit per session key in wei
     * @param thresholdMultiplier Threshold sensitivity (σ multiplier), scaled by 100 (e.g., 200 = 2.0σ)
     */
    function registerAgent(
        bytes32 agentDID,
        uint256 spendingLimit,
        uint256 thresholdMultiplier
    ) external returns (bool) {
        require(agents[agentDID].owner == address(0), "Agent already registered");
        require(spendingLimit > 0, "Spending limit must be > 0");
        require(thresholdMultiplier >= 100 && thresholdMultiplier <= 500, "Threshold must be between 1.0 and 5.0");
        
        agents[agentDID] = Agent({
            owner: msg.sender,
            spendingLimit: spendingLimit,
            thresholdMultiplier: thresholdMultiplier,
            transactionCount: 0,
            isActive: true,
            isRevoked: false,
            registeredAt: block.timestamp,
            lastActivityAt: block.timestamp
        });
        
        totalAgents++;
        
        emit AgentRegistered(agentDID, msg.sender, spendingLimit, block.timestamp);
        
        return true;
    }
    
    /**
     * @notice Log a gate decision (called by authorized backend)
     * @param agentDID The agent's DID
     * @param issued Whether the session key was issued
     * @param metricValue Current behavioral metric (scaled by 1e18)
     * @param baselineValue Baseline metric (scaled by 1e18)
     * @param amount Transaction amount
     * @param sessionKey Address of session key (zero address if denied)
     */
    function logDecision(
        bytes32 agentDID,
        bool issued,
        uint256 metricValue,
        uint256 baselineValue,
        uint256 amount,
        address sessionKey
    ) external onlyAuthorizedBackend agentExists(agentDID) agentNotRevoked(agentDID) returns (uint256) {
        
        Agent storage agent = agents[agentDID];
        agent.transactionCount++;
        agent.lastActivityAt = block.timestamp;
        
        GateDecision memory decision = GateDecision({
            agentDID: agentDID,
            issued: issued,
            metricValue: metricValue,
            baselineValue: baselineValue,
            amount: amount,
            sessionKey: sessionKey,
            timestamp: block.timestamp,
            blockNumber: block.number
        });
        
        uint256 decisionIndex = decisions.length;
        decisions.push(decision);
        agentDecisions[agentDID].push(decisionIndex);
        
        totalDecisions++;
        
        if (issued) {
            emit SessionKeyIssued(
                agentDID,
                sessionKey,
                amount,
                metricValue,
                baselineValue,
                block.timestamp
            );
        } else {
            emit SessionKeyDenied(
                agentDID,
                amount,
                metricValue,
                baselineValue,
                block.timestamp
            );
        }
        
        return decisionIndex;
    }
    
    /**
     * @notice Revoke an agent permanently (only owner of agent)
     * @param agentDID The agent's DID
     */
    function revokeAgent(bytes32 agentDID) 
        external 
        agentExists(agentDID) 
        returns (bool) 
    {
        Agent storage agent = agents[agentDID];
        require(msg.sender == agent.owner, "Only agent owner can revoke");
        require(!agent.isRevoked, "Agent already revoked");
        
        agent.isRevoked = true;
        agent.isActive = false;
        
        emit AgentRevoked(agentDID, agent.owner, block.timestamp);
        
        return true;
    }
    
    /**
     * @notice Toggle agent active status (only owner of agent)
     * @param agentDID The agent's DID
     * @param isActive New active status
     */
    function setAgentStatus(bytes32 agentDID, bool isActive) 
        external 
        agentExists(agentDID) 
        agentNotRevoked(agentDID)
        returns (bool) 
    {
        Agent storage agent = agents[agentDID];
        require(msg.sender == agent.owner, "Only agent owner can change status");
        
        agent.isActive = isActive;
        
        emit AgentStatusChanged(agentDID, isActive, block.timestamp);
        
        return true;
    }
    
    /**
     * @notice Update agent spending limit (only owner of agent)
     * @param agentDID The agent's DID
     * @param newLimit New spending limit
     */
    function updateSpendingLimit(bytes32 agentDID, uint256 newLimit) 
        external 
        agentExists(agentDID) 
        returns (bool) 
    {
        Agent storage agent = agents[agentDID];
        require(msg.sender == agent.owner, "Only agent owner can update limit");
        require(newLimit > 0, "Limit must be > 0");
        
        agent.spendingLimit = newLimit;
        
        return true;
    }
    
    /**
     * @notice Reset baseline (emit event for off-chain tracking)
     * @param agentDID The agent's DID
     * @param newBaseline New baseline value (scaled by 1e18)
     */
    function resetBaseline(bytes32 agentDID, uint256 newBaseline) 
        external 
        agentExists(agentDID) 
        agentNotRevoked(agentDID)
        returns (bool) 
    {
        Agent storage agent = agents[agentDID];
        require(msg.sender == agent.owner, "Only agent owner can reset baseline");
        
        emit BaselineReset(agentDID, newBaseline, block.timestamp);
        
        return true;
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get agent information
     * @param agentDID The agent's DID
     */
    function getAgent(bytes32 agentDID) 
        external 
        view 
        returns (Agent memory) 
    {
        return agents[agentDID];
    }
    
    /**
     * @notice Get all decision indices for an agent
     * @param agentDID The agent's DID
     */
    function getAgentDecisions(bytes32 agentDID) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return agentDecisions[agentDID];
    }
    
    /**
     * @notice Get decision by index
     * @param index Decision index
     */
    function getDecision(uint256 index) 
        external 
        view 
        returns (GateDecision memory) 
    {
        require(index < decisions.length, "Decision index out of bounds");
        return decisions[index];
    }
    
    /**
     * @notice Get recent decisions for an agent
     * @param agentDID The agent's DID
     * @param count Number of recent decisions to return
     */
    function getRecentDecisions(bytes32 agentDID, uint256 count) 
        external 
        view 
        returns (GateDecision[] memory) 
    {
        uint256[] memory indices = agentDecisions[agentDID];
        uint256 returnCount = count > indices.length ? indices.length : count;
        
        GateDecision[] memory recentDecisions = new GateDecision[](returnCount);
        
        for (uint256 i = 0; i < returnCount; i++) {
            uint256 index = indices[indices.length - 1 - i];
            recentDecisions[i] = decisions[index];
        }
        
        return recentDecisions;
    }
    
    /**
     * @notice Get total decisions count
     */
    function getTotalDecisions() external view returns (uint256) {
        return decisions.length;
    }
    
    /**
     * @notice Check if agent is authorized to transact
     * @param agentDID The agent's DID
     */
    function isAgentAuthorized(bytes32 agentDID) 
        external 
        view 
        returns (bool) 
    {
        Agent memory agent = agents[agentDID];
        return agent.owner != address(0) && agent.isActive && !agent.isRevoked;
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Authorize a backend address to log decisions
     * @param backend Backend address
     * @param authorized Authorization status
     */
    function setBackendAuthorization(address backend, bool authorized) 
        external 
        onlyOwner 
        returns (bool) 
    {
        require(backend != address(0), "Invalid backend address");
        
        authorizedBackends[backend] = authorized;
        
        emit BackendAuthorized(backend, authorized, block.timestamp);
        
        return true;
    }
    
    /**
     * @notice Transfer ownership
     * @param newOwner New owner address
     */
    function transferOwnership(address newOwner) 
        external 
        onlyOwner 
        returns (bool) 
    {
        require(newOwner != address(0), "Invalid new owner");
        
        address previousOwner = owner;
        owner = newOwner;
        authorizedBackends[newOwner] = true;
        
        emit OwnershipTransferred(previousOwner, newOwner);
        
        return true;
    }
}
