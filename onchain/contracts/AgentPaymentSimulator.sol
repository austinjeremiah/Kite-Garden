// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AgentPaymentSimulator
 * @notice Demo contract for simulating agent payment events on Kite AI testnet
 * @dev Used for seeding transaction history and injecting attack patterns during demos
 * 
 * This contract emits payment events that Goldsky indexes, allowing the demo to run
 * on real on-chain events with real indexing and real behavioral analysis.
 */
contract AgentPaymentSimulator {
    
    // ============ State Variables ============
    
    struct Payment {
        bytes32 agentDID;
        uint256 amount;
        address to;
        uint256 timestamp;
        uint256 blockNumber;
        PaymentType paymentType;
    }
    
    enum PaymentType {
        NORMAL,      // Regular payment following agent's normal pattern
        ATTACK,      // Anomalous payment (part of attack simulation)
        SEEDED       // Initial seed data
    }
    
    // Array of all payments
    Payment[] public payments;
    
    // Mapping from agent DID to payment indices
    mapping(bytes32 => uint256[]) public agentPayments;
    
    // Contract owner
    address public owner;
    
    // Total payments simulated
    uint256 public totalPayments;
    
    // Demo mode toggle
    bool public demoMode;
    
    // ============ Events ============
    
    event PaymentExecuted(
        bytes32 indexed agentDID,
        uint256 indexed paymentId,
        uint256 amount,
        address indexed to,
        PaymentType paymentType,
        uint256 timestamp
    );
    
    event AttackInjected(
        bytes32 indexed agentDID,
        uint256 burstSize,
        uint256 timestamp
    );
    
    event SeedingCompleted(
        bytes32 indexed agentDID,
        uint256 count,
        uint256 timestamp
    );
    
    event DemoModeToggled(
        bool enabled,
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
    
    modifier whenDemoMode() {
        require(demoMode, "Demo mode is not enabled");
        _;
    }
    
    // ============ Constructor ============
    
    constructor() {
        owner = msg.sender;
        demoMode = true; // Enabled by default for hackathon
    }
    
    // ============ Simulation Functions ============
    
    /**
     * @notice Simulate a single payment
     * @param agentDID The agent's DID
     * @param amount Payment amount in wei
     * @param to Recipient address
     * @param paymentType Type of payment (normal/attack/seeded)
     */
    function simulatePayment(
        bytes32 agentDID,
        uint256 amount,
        address to,
        PaymentType paymentType
    ) public returns (uint256) {
        require(agentDID != bytes32(0), "Invalid agent DID");
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");
        
        Payment memory payment = Payment({
            agentDID: agentDID,
            amount: amount,
            to: to,
            timestamp: block.timestamp,
            blockNumber: block.number,
            paymentType: paymentType
        });
        
        uint256 paymentId = payments.length;
        payments.push(payment);
        agentPayments[agentDID].push(paymentId);
        
        totalPayments++;
        
        emit PaymentExecuted(
            agentDID,
            paymentId,
            amount,
            to,
            paymentType,
            block.timestamp
        );
        
        return paymentId;
    }
    
    /**
     * @notice Simulate normal payments with stable distribution
     * @param agentDID The agent's DID
     * @param count Number of payments to simulate
     * @param baseAmount Base amount for normal distribution (in wei)
     * @param variance Variance for amount distribution (in basis points, e.g., 2000 = 20%)
     */
    function simulateNormal(
        bytes32 agentDID,
        uint256 count,
        uint256 baseAmount,
        uint256 variance
    ) external returns (uint256[] memory) {
        require(count > 0 && count <= 100, "Count must be between 1 and 100");
        require(variance <= 5000, "Variance cannot exceed 50%");
        
        uint256[] memory paymentIds = new uint256[](count);
        
        // Generate pseudo-random recipient addresses
        address[] memory recipients = _generateRecipients(5);
        
        for (uint256 i = 0; i < count; i++) {
            // Generate amount with variance
            uint256 amount = _applyVariance(baseAmount, variance, i);
            
            // Select recipient (mostly same ones for normal behavior)
            address recipient = recipients[i % recipients.length];
            
            paymentIds[i] = simulatePayment(
                agentDID,
                amount,
                recipient,
                PaymentType.NORMAL
            );
            
            // Small delay simulation (not actual time delay, just for variety)
        }
        
        emit SeedingCompleted(agentDID, count, block.timestamp);
        
        return paymentIds;
    }
    
    /**
     * @notice Simulate an attack pattern (burst of anomalous payments)
     * @param agentDID The agent's DID
     */
    function simulateAttack(bytes32 agentDID) external whenDemoMode returns (uint256) {
        // Attack pattern characteristics:
        // - Higher amounts (2-5x normal)
        // - Different recipients (random addresses)
        // - Burst of transactions in quick succession
        
        uint256 burstSize = 15;
        address[] memory attackRecipients = _generateRecipients(burstSize);
        
        for (uint256 i = 0; i < burstSize; i++) {
            // Anomalous amounts: 2x to 5x a typical amount
            uint256 anomalousAmount = _pseudoRandom(i, 2 ether, 5 ether);
            
            simulatePayment(
                agentDID,
                anomalousAmount,
                attackRecipients[i],
                PaymentType.ATTACK
            );
        }
        
        emit AttackInjected(agentDID, burstSize, block.timestamp);
        
        return burstSize;
    }
    
    /**
     * @notice Seed initial transaction history for demo agents
     * @param agentDID The agent's DID
     * @param count Number of transactions (should be 200-300 for mature agent baseline)
     */
    function seedHistory(
        bytes32 agentDID,
        uint256 count
    ) external returns (uint256) {
        require(count >= 30 && count <= 500, "Count must be between 30 and 500");
        
        // For seeding, use stable patterns
        uint256 baseAmount = 1 ether; // 1 testnet stablecoin
        uint256 variance = 1500; // 15% variance
        
        address[] memory recipients = _generateRecipients(5);
        
        for (uint256 i = 0; i < count; i++) {
            uint256 amount = _applyVariance(baseAmount, variance, i);
            address recipient = recipients[i % recipients.length];
            
            simulatePayment(
                agentDID,
                amount,
                recipient,
                PaymentType.SEEDED
            );
        }
        
        emit SeedingCompleted(agentDID, count, block.timestamp);
        
        return count;
    }
    
    /**
     * @notice Batch simulate multiple payments in one transaction
     * @param agentDID The agent's DID
     * @param amounts Array of payment amounts
     * @param recipients Array of recipient addresses
     * @param paymentType Type for all payments
     */
    function batchSimulate(
        bytes32 agentDID,
        uint256[] calldata amounts,
        address[] calldata recipients,
        PaymentType paymentType
    ) external returns (uint256[] memory) {
        require(amounts.length == recipients.length, "Arrays length mismatch");
        require(amounts.length > 0 && amounts.length <= 50, "Batch size must be 1-50");
        
        uint256[] memory paymentIds = new uint256[](amounts.length);
        
        for (uint256 i = 0; i < amounts.length; i++) {
            paymentIds[i] = simulatePayment(
                agentDID,
                amounts[i],
                recipients[i],
                paymentType
            );
        }
        
        return paymentIds;
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get payment by ID
     * @param paymentId Payment ID
     */
    function getPayment(uint256 paymentId) 
        external 
        view 
        returns (Payment memory) 
    {
        require(paymentId < payments.length, "Payment ID out of bounds");
        return payments[paymentId];
    }
    
    /**
     * @notice Get all payment IDs for an agent
     * @param agentDID The agent's DID
     */
    function getAgentPayments(bytes32 agentDID) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return agentPayments[agentDID];
    }
    
    /**
     * @notice Get recent payments for an agent
     * @param agentDID The agent's DID
     * @param count Number of recent payments to return
     */
    function getRecentPayments(bytes32 agentDID, uint256 count) 
        external 
        view 
        returns (Payment[] memory) 
    {
        uint256[] memory indices = agentPayments[agentDID];
        uint256 returnCount = count > indices.length ? indices.length : count;
        
        Payment[] memory recentPayments = new Payment[](returnCount);
        
        for (uint256 i = 0; i < returnCount; i++) {
            uint256 index = indices[indices.length - 1 - i];
            recentPayments[i] = payments[index];
        }
        
        return recentPayments;
    }
    
    /**
     * @notice Get payment count for an agent
     * @param agentDID The agent's DID
     */
    function getPaymentCount(bytes32 agentDID) 
        external 
        view 
        returns (uint256) 
    {
        return agentPayments[agentDID].length;
    }
    
    // ============ Internal Helper Functions ============
    
    /**
     * @dev Generate pseudo-random recipient addresses
     */
    function _generateRecipients(uint256 count) 
        internal 
        view 
        returns (address[] memory) 
    {
        address[] memory recipients = new address[](count);
        
        for (uint256 i = 0; i < count; i++) {
            recipients[i] = address(uint160(uint256(keccak256(abi.encodePacked(
                block.timestamp,
                block.prevrandao,
                i,
                msg.sender
            )))));
        }
        
        return recipients;
    }
    
    /**
     * @dev Apply variance to base amount using pseudo-random distribution
     */
    function _applyVariance(
        uint256 baseAmount,
        uint256 variance,
        uint256 seed
    ) internal view returns (uint256) {
        // variance in basis points (e.g., 2000 = 20%)
        uint256 maxVariation = (baseAmount * variance) / 10000;
        
        uint256 random = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            seed,
            msg.sender
        ))) % (maxVariation * 2);
        
        // Apply variation: baseAmount ± maxVariation
        if (random < maxVariation) {
            return baseAmount - (maxVariation - random);
        } else {
            return baseAmount + (random - maxVariation);
        }
    }
    
    /**
     * @dev Generate pseudo-random number in range
     */
    function _pseudoRandom(
        uint256 seed,
        uint256 min,
        uint256 max
    ) internal view returns (uint256) {
        require(max > min, "Invalid range");
        
        uint256 random = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            seed,
            msg.sender
        ))) % (max - min);
        
        return min + random;
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Toggle demo mode
     * @param enabled New demo mode status
     */
    function setDemoMode(bool enabled) external onlyOwner returns (bool) {
        demoMode = enabled;
        emit DemoModeToggled(enabled, block.timestamp);
        return true;
    }
    
    /**
     * @notice Transfer ownership
     * @param newOwner New owner address
     */
    function transferOwnership(address newOwner) external onlyOwner returns (bool) {
        require(newOwner != address(0), "Invalid new owner");
        
        address previousOwner = owner;
        owner = newOwner;
        
        emit OwnershipTransferred(previousOwner, newOwner);
        
        return true;
    }
}
